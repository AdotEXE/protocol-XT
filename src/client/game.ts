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
    HavokPlugin,
    // PhysicsAggregate, // Не используется
    // PhysicsShapeType, // Не используется
    PhysicsMotionType,
    StandardMaterial,
    Color3,
    ArcRotateCamera,
    UniversalCamera,
    Ray,
    Quaternion,
    Matrix
} from "@babylonjs/core";
import "@babylonjs/gui";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import HavokPhysics from "@babylonjs/havok";
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
    
    // Позиция гаража игрока для респавна
    playerGaragePosition: Vector3 | null = null;
    
    // Таймеры респавна для гаражей (Map<garagePos, {timer: number, billboard: Mesh}>)
    private garageRespawnTimers: Map<string, { timer: number, billboard: Mesh | null, textBlock: TextBlock | null }> = new Map();
    private readonly RESPAWN_TIME = 180000; // 3 минуты в миллисекундах
    
    // Система захвата гаражей
    private garageCaptureProgress: Map<string, { progress: number, capturingPlayers: number }> = new Map();
    private readonly CAPTURE_TIME_SINGLE = 180; // 3 минуты в секундах для одного игрока
    private readonly CAPTURE_RADIUS = 3.0; // Радиус захвата в единицах
    private readonly PLAYER_ID = "player"; // ID игрока (в будущем будет из мультиплеера)
    
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
    
    // Stats overlay (Tab key - пункт 13)
    private statsOverlay: HTMLDivElement | null = null;
    private statsOverlayVisible = false;
    
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
    private muteOnFocusLossHandler: (() => void) | null = null;
    
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
    
    // Raycast cache для оптимизации проверки видимости цели
    private targetRaycastCache: { result: boolean, frame: number } | null = null;
    private readonly TARGET_RAYCAST_CACHE_FRAMES = 6;
    
    // Кэш позиции танка для оптимизации
    private _cachedTankPosition: Vector3 = new Vector3();
    private _tankPositionCacheFrame = -1;
    
    // Кэш позиции камеры для оптимизации
    private _cachedCameraPosition: Vector3 = new Vector3();
    private _cameraPositionCacheFrame = -1;
    
    // Кэш цветов для оптимизации (избегаем создания новых Color3)
    private readonly _colorNeutral = new Color3(0.9, 0.9, 0.9);
    private readonly _colorPlayer = new Color3(0.0, 1.0, 0.0);
    private readonly _colorEnemy = new Color3(1.0, 0.0, 0.0);
    private readonly _colorEmissiveNeutral = new Color3(0.1, 0.1, 0.1);
    private readonly _colorEmissivePlayer = new Color3(0.2, 0.5, 0.2);
    private readonly _colorEmissiveEnemy = new Color3(0.5, 0.1, 0.1);

    constructor() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:266',message:'Game constructor started, calling loadMainMenu',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // MainMenu will be loaded lazily when needed
        this.loadMainMenu().then(() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:269',message:'loadMainMenu promise resolved',data:{mainMenuExists:!!this.mainMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            if (this.mainMenu) {
                logger.log("[Game] Menu loaded, setting up callbacks...");
                this.setupMenuCallbacks();
                logger.log("[Game] Callbacks set up, showing menu...");
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:273',message:'About to call mainMenu.show()',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                this.mainMenu.show();
                logger.log("[Game] Menu show() called");
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:275',message:'mainMenu.show() called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:277',message:'ERROR: mainMenu is null after load',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                logger.error("[Game] Menu loaded but mainMenu is null!");
            }
        }).catch((error) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:279',message:'ERROR: loadMainMenu failed',data:{error:error?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            logger.error("[Game] Failed to load menu:", error);
        });
        
        // Обработчик для возобновления игры
        window.addEventListener("resumeGame", () => {
            this.togglePause();
        });
        
        // Обработчики для сохранения при закрытии страницы
        this.setupAutoSaveOnUnload();
        
        // Сохраняем экземпляр Game в window для доступа из Menu
        (window as any).gameInstance = this;
    }
    
    // Lazy load MainMenu
    private async loadMainMenu(): Promise<void> {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:295',message:'loadMainMenu started',data:{alreadyLoaded:!!this.mainMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (this.mainMenu) return; // Already loaded
        
        try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:299',message:'About to import MainMenu',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            const { MainMenu } = await import("./menu");
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:300',message:'MainMenu imported, creating instance',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            this.mainMenu = new MainMenu();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:301',message:'MainMenu instance created',data:{mainMenuExists:!!this.mainMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            if (this.mainMenu) {
                this.settings = this.mainMenu.getSettings();
                this.setupMenuCallbacks();
                logger.log("[Game] MainMenu loaded");
            }
        } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:308',message:'ERROR: Failed to load MainMenu',data:{error:error?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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
            const { Garage } = await import("./garage");
            this.garage = new Garage(this.scene, this.currencyManager);
            
            // Connect garage to main menu if available
            if (this.mainMenu) {
                this.mainMenu.setGarage(this.garage);
            }
            
            logger.log("[Game] Garage loaded");
        } catch (error) {
            logger.error("[Game] Failed to load Garage:", error);
        }
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
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:395',message:'onStartGame callback entry',data:{mapType:mapType,currentMapTypeBefore:this.currentMapType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            try {
                if (mapType) {
                    this.currentMapType = mapType;
                    logger.log(`[Game] Map type set to: ${this.currentMapType}`);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:399',message:'currentMapType set',data:{mapType:mapType,currentMapType:this.currentMapType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
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
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:417',message:'Recreating ChunkSystem branch',data:{passedMapType:mapType,currentMapType:this.currentMapType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                    // #endregion
                    
                    // Очищаем старые враги
                    this.enemyTanks.forEach(enemy => {
                        if (enemy.chassis) enemy.chassis.dispose();
                    });
                    this.enemyTanks = [];
                    
                    // Очищаем старые турели
                    if (this.enemyManager?.turrets) {
                        this.enemyManager.turrets.forEach(turret => {
                            if (turret.base && !turret.base.isDisposed()) turret.base.dispose();
                            if (turret.head && !turret.head.isDisposed()) turret.head.dispose();
                            if (turret.barrel && !turret.barrel.isDisposed()) turret.barrel.dispose();
                        });
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
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:447',message:'Recreating ChunkSystem',data:{passedMapType:mapType,currentMapType:this.currentMapType,mapTypeForChunkSystem:mapTypeForChunkSystem},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                    // #endregion
                    this.chunkSystem = new ChunkSystem(this.scene, {
                        chunkSize: 80,
                        renderDistance: 1.5,
                        unloadDistance: 4,
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
                
                // #region agent log
                const menuBeforeStart = document.getElementById("main-menu");
                const menuStateBefore = menuBeforeStart ? {
                    hasHiddenClass: menuBeforeStart.classList.contains("hidden"),
                    display: window.getComputedStyle(menuBeforeStart).display,
                    zIndex: window.getComputedStyle(menuBeforeStart).zIndex
                } : null;
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:477',message:'Before startGame()',data:{menuStateBefore,hasMainMenu:!!this.mainMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                logger.log("[Game] Calling startGame()...");
                this.startGame();
                // #region agent log
                setTimeout(() => {
                    const menuAfterStart = document.getElementById("main-menu");
                    const menuStateAfter = menuAfterStart ? {
                        hasHiddenClass: menuAfterStart.classList.contains("hidden"),
                        display: window.getComputedStyle(menuAfterStart).display,
                        zIndex: window.getComputedStyle(menuAfterStart).zIndex
                    } : null;
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:479',message:'After startGame() (100ms)',data:{menuStateAfter},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                }, 100);
                // #endregion
                logger.log("[Game] startGame() called successfully");
            } catch (error) {
                logger.error("[Game] Error in onStartGame callback:", error);
                console.error("[Game] Error starting game:", error);
            }
        });
        
        logger.log("[Game] Menu callbacks set up successfully");
        
        // Setup canvas
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:489',message:'Creating canvas element',data:{bodyExists:!!document.body,bodyOwnerDocument:document.body?.ownerDocument?.location?.href},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        this.canvas = document.createElement("canvas");
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:491',message:'Canvas created, before appendChild',data:{canvasOwnerDocument:this.canvas.ownerDocument?.location?.href,canvasInBody:document.body.contains(this.canvas),bodyOwnerDocument:document.body?.ownerDocument?.location?.href},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.display = "block";
        this.canvas.style.position = "fixed";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.zIndex = "0"; // Canvas должен быть ПОД GUI элементами
        this.canvas.id = "gameCanvas";
        document.body.appendChild(this.canvas);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:498',message:'Canvas appended to body',data:{canvasOwnerDocument:this.canvas.ownerDocument?.location?.href,canvasInBody:document.body.contains(this.canvas),isConnected:this.canvas.isConnected,bodyOwnerDocument:document.body?.ownerDocument?.location?.href},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
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
        
        // Setup ESC for pause and Garage
        // Use global keydown handler for all high-level hotkeys (garage, panels, admin tools)
        // IMPORTANT: use capture phase (third argument = true), чтобы ловить сочетания
        // Ctrl+цифры и F-клавиши до того, как их перехватит браузер или другие слушатели.
        window.addEventListener("keydown", (e) => {
            // ИСПРАВЛЕНИЕ: Обрабатываем Ctrl+цифры в первую очередь с capture phase
            // Это гарантирует что наши обработчики сработают до других
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
                e.preventDefault();
                // Переключаем состояние ворот ближайшего гаража (только той, на которую смотрит пушка)
                if (this.tank && this.tank.chassis && this.tank.barrel) {
                    const playerPos = this.tank.chassis.absolutePosition;
                    type NearestGarageType = { doorData: any; distance: number; };
                    let nearestGarage: NearestGarageType | null = null;
                    
                    this.chunkSystem.garageDoors.forEach(doorData => {
                        const garagePos = doorData.position;
                        const distance = Vector3.Distance(
                            new Vector3(garagePos.x, 0, garagePos.z),
                            new Vector3(playerPos.x, 0, playerPos.z)
                        );
                        
                        if (nearestGarage === null || distance < nearestGarage.distance) {
                            nearestGarage = { doorData, distance };
                        }
                    });
                    
                    // Если игрок рядом с гаражом (в пределах 50 единиц), переключаем ворота
                    if (nearestGarage === null) {
                        logger.warn(`No garage found`);
                    } else {
                        const ng: NearestGarageType = nearestGarage; // Явное указание типа для TypeScript
                        if (ng.distance < 50) {
                            const doorData = ng.doorData;
                            
                            // Получаем направление пушки и позицию
                            this.tank.chassis.computeWorldMatrix(true);
                            this.tank.turret.computeWorldMatrix(true);
                            this.tank.barrel.computeWorldMatrix(true);
                            const barrelPos = this.tank.barrel.getAbsolutePosition();
                            const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
                            
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
                            this.updateGarageDoors();
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
                this.showStatsOverlay(); // Показываем при нажатии
                return;
            }

            // === АЛЬТЕРНАТИВНЫЕ F1–F10 ДЛЯ ТЕХ ЖЕ ПАНЕЛЕЙ ===
            // Если браузер/ОС перехватывает Ctrl+цифры, F-клавиши дублируют те же действия
            if (this.gameStarted && !e.ctrlKey && !e.altKey && !e.metaKey) {
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
                    // Симулируем нажатие Ctrl+цифра, чтобы переиспользовать уже существующую логику
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

            // === КОМБИНАЦИИ КЛАВИШ CTRL+1-9,0 ===
            // Обрабатываем ПЕРЕД другими обработчиками чтобы не блокировались
            
            // Ctrl+1: Help/Controls Menu (lazy loaded) - работает всегда
            if (e.ctrlKey && (e.code === "Digit1" || e.code === "Numpad1")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:762',message:'Ctrl+1 pressed',data:{hasHelpMenu:!!this.helpMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.helpMenu) {
                    // Lazy load help menu on first use
                    logger.log("[Game] Loading help menu (Ctrl+1)...");
                    import("./helpMenu").then(({ HelpMenu }) => {
                        this.helpMenu = new HelpMenu();
                        this.helpMenu.setGame(this);
                        // Toggle visibility after loading
                        if (typeof this.helpMenu.toggle === 'function') {
                            this.helpMenu.toggle();
                        }
                        logger.log("[Game] Help menu loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load help menu:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Help Menu", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.helpMenu = undefined;
                    });
                } else {
                    // Toggle existing menu
                    if (typeof this.helpMenu.toggle === 'function') {
                        this.helpMenu.toggle();
                        logger.log("[Game] Help menu toggled");
                    }
                }
                return;
            }
            
            // Ctrl+2: Screenshot Panel (lazy loaded) - работает всегда
            if (e.ctrlKey && (e.code === "Digit2" || e.code === "Numpad2")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // Debug: Ctrl+2 pressed for screenshot panel
                this.openScreenshotPanel();
                return;
            }
            
            // Ctrl+3: Debug Dashboard (lazy loaded) - работает только в игре
            if (e.ctrlKey && (e.code === "Digit3" || e.code === "Numpad3") && this.gameStarted) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:804',message:'Ctrl+3 pressed',data:{hasDebugDashboard:!!this.debugDashboard,gameStarted:this.gameStarted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.debugDashboard) {
                    // Lazy load debug dashboard on first use
                    if (!this.engine || !this.scene) {
                        logger.warn("[Game] Cannot load debug dashboard: engine or scene not initialized");
                        if (this.hud) {
                            this.hud.showMessage("Debug Dashboard requires game to be started", "#f00", 3000);
                        }
                        return;
                    }
                    logger.log("[Game] Loading debug dashboard (Ctrl+3)...");
                    import("./debugDashboard").then(({ DebugDashboard }) => {
                        this.debugDashboard = new DebugDashboard(this.engine, this.scene);
                        if (this.chunkSystem) {
                            this.debugDashboard.setChunkSystem(this.chunkSystem);
                        }
                        this.debugDashboard.setGame(this);
                        if (this.tank) {
                            this.debugDashboard.setTank(this.tank);
                        }
                        // Toggle visibility after loading
                        const container = (this.debugDashboard as any).container;
                        if (container) {
                            container.classList.remove("hidden");
                            container.style.display = "";
                            (this.debugDashboard as any).visible = true;
                        }
                        logger.log("[Game] Debug dashboard loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load debug dashboard:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Debug Dashboard", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.debugDashboard = undefined;
                    });
                } else {
                    // Toggle existing dashboard
                    const container = (this.debugDashboard as any).container;
                    if (container) {
                        const isVisible = !container.classList.contains("hidden") && container.style.display !== "none";
                        if (isVisible) {
                            container.classList.add("hidden");
                            container.style.display = "none";
                            (this.debugDashboard as any).visible = false;
                            logger.log("[Game] Debug dashboard closed");
                        } else {
                            container.classList.remove("hidden");
                            container.style.display = "";
                            (this.debugDashboard as any).visible = true;
                            logger.log("[Game] Debug dashboard opened");
                        }
                    }
                }
                return;
            }
            
            // Ctrl+4: Physics Panel (lazy loaded) - работает только в игре
            if (e.ctrlKey && (e.code === "Digit4" || e.code === "Numpad4") && this.gameStarted) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:886',message:'Ctrl+4 pressed',data:{hasPhysicsPanel:!!this.physicsPanel,hasTank:!!this.tank},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.physicsPanel) {
                    // Lazy load physics panel on first use
                    if (!this.tank) {
                        logger.warn("[Game] Cannot load physics panel: tank not initialized");
                        if (this.hud) {
                            this.hud.showMessage("Physics Panel requires game to be started", "#f00", 3000);
                        }
                        return;
                    }
                    logger.log("[Game] Loading physics panel (Ctrl+4)...");
                    import("./physicsPanel").then(({ PhysicsPanel }) => {
                        this.physicsPanel = new PhysicsPanel();
                        this.physicsPanel.setGame(this);
                        if (this.tank) {
                            this.physicsPanel.setTank(this.tank);
                        }
                        // Toggle visibility after loading
                        if (typeof this.physicsPanel.toggle === 'function') {
                            this.physicsPanel.toggle();
                        }
                        logger.log("[Game] Physics panel loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load physics panel:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Physics Panel", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.physicsPanel = undefined;
                    });
                } else {
                    // Toggle existing panel
                    if (typeof this.physicsPanel.toggle === 'function') {
                        this.physicsPanel.toggle();
                        logger.log("[Game] Physics panel toggled");
                    }
                }
                return;
            }
            
            // Ctrl+5: System Terminal - работает всегда
            if (e.ctrlKey && (e.code === "Digit5" || e.code === "Numpad5")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:930',message:'Ctrl+5 pressed',data:{hasChatSystem:!!this.chatSystem},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                // Убеждаемся что chatSystem инициализирован
                this.ensureChatSystem().then(() => {
                    if (this.chatSystem && typeof this.chatSystem.toggleTerminal === 'function') {
                        this.chatSystem.toggleTerminal();
                        logger.log("[Game] System terminal toggled");
                    } else {
                        logger.error("[Game] ChatSystem.toggleTerminal is not available");
                        if (this.hud) {
                            this.hud.showMessage("System Terminal not available", "#f00", 3000);
                        }
                    }
                }).catch(error => {
                    logger.error("[Game] Failed to ensure ChatSystem for Ctrl+5:", error);
                    if (this.hud) {
                        this.hud.showMessage("Failed to initialize System Terminal", "#f00", 3000);
                    }
                });
                return;
            }
            
            // Ctrl+6: Session Settings (lazy loaded) - работает всегда
            if (e.ctrlKey && (e.code === "Digit6" || e.code === "Numpad6")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:955',message:'Ctrl+6 pressed',data:{hasSessionSettings:!!this.sessionSettings},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.sessionSettings) {
                    // Lazy load session settings on first use
                    logger.log("[Game] Loading session settings (Ctrl+6)...");
                    import("./sessionSettings").then(({ SessionSettings }) => {
                        this.sessionSettings = new SessionSettings();
                        this.sessionSettings.setGame(this);
                        // Toggle visibility after loading
                        if (typeof (this.sessionSettings as any).toggle === 'function') {
                            (this.sessionSettings as any).toggle();
                        }
                        logger.log("[Game] Session settings loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load session settings:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Session Settings", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.sessionSettings = undefined;
                    });
                } else {
                    // Toggle existing settings
                    if (typeof (this.sessionSettings as any).toggle === 'function') {
                        (this.sessionSettings as any).toggle();
                        logger.log("[Game] Session settings toggled");
                    }
                }
                return;
            }
            
            // Ctrl+7: Cheat Menu (lazy loaded) - работает только в игре
            if (e.ctrlKey && (e.code === "Digit7" || e.code === "Numpad7") && this.gameStarted) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:989',message:'Ctrl+7 pressed',data:{hasCheatMenu:!!this.cheatMenu,hasTank:!!this.tank},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.cheatMenu) {
                    // Lazy load cheat menu on first use
                    if (!this.tank) {
                        logger.warn("[Game] Cannot load cheat menu: tank not initialized");
                        if (this.hud) {
                            this.hud.showMessage("Cheat Menu requires game to be started", "#f00", 3000);
                        }
                        return;
                    }
                    logger.log("[Game] Loading cheat menu (Ctrl+7)...");
                    import("./cheatMenu").then(({ CheatMenu }) => {
                        this.cheatMenu = new CheatMenu();
                        if (this.tank) {
                            this.cheatMenu.setTank(this.tank);
                        }
                        this.cheatMenu.setGame(this);
                        // Toggle visibility after loading
                        if (typeof this.cheatMenu.toggle === 'function') {
                            this.cheatMenu.toggle();
                        }
                        logger.log("[Game] Cheat menu loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load cheat menu:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Cheat Menu", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.cheatMenu = undefined;
                    });
                } else {
                    // Toggle existing menu
                    if (typeof this.cheatMenu.toggle === 'function') {
                        this.cheatMenu.toggle();
                        logger.log("[Game] Cheat menu toggled");
                    }
                }
                return;
            }
            
            // Ctrl+8: Network Menu (lazy loaded) - работает всегда
            if (e.ctrlKey && (e.code === "Digit8" || e.code === "Numpad8")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1033',message:'Ctrl+8 pressed',data:{hasNetworkMenu:!!this.networkMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.networkMenu) {
                    // Lazy load network menu on first use
                    logger.log("[Game] Loading network menu (Ctrl+8)...");
                    import("./networkMenu").then(({ NetworkMenu }) => {
                        this.networkMenu = new NetworkMenu();
                        this.networkMenu.setGame(this);
                        // Toggle visibility after loading
                        if (typeof this.networkMenu.toggle === 'function') {
                            this.networkMenu.toggle();
                        }
                        logger.log("[Game] Network menu loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load network menu:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Network Menu", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.networkMenu = undefined;
                    });
                } else {
                    // Toggle existing menu
                    if (typeof this.networkMenu.toggle === 'function') {
                        this.networkMenu.toggle();
                        logger.log("[Game] Network menu toggled");
                    }
                }
                return;
            }
            
            // Ctrl+0: Social Menu (Friends & Clans) (lazy loaded) - работает всегда
            if (e.ctrlKey && (e.code === "Digit0" || e.code === "Numpad0")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1046',message:'Ctrl+0 pressed',data:{hasSocialMenu:!!this.socialMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.socialMenu) {
                    // Lazy load social menu on first use
                    logger.log("[Game] Loading social menu (Ctrl+0)...");
                    import("./socialMenu").then(({ socialMenu }) => {
                        this.socialMenu = socialMenu;
                        // Toggle visibility after loading
                        if (this.socialMenu && typeof this.socialMenu.toggle === 'function') {
                            this.socialMenu.toggle();
                        }
                        logger.log("[Game] Social menu loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load social menu:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load Social Menu", "#f00", 3000);
                        }
                        this.socialMenu = undefined;
                    });
                } else {
                    // Toggle existing menu
                    if (typeof this.socialMenu.toggle === 'function') {
                        this.socialMenu.toggle();
                        logger.log("[Game] Social menu toggled");
                    }
                }
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
            
            // Ctrl+9: World Generation Menu (lazy loaded) - работает всегда
            if (e.ctrlKey && (e.code === "Digit9" || e.code === "Numpad9")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1108',message:'Ctrl+9 pressed',data:{hasWorldGenMenu:!!this.worldGenerationMenu},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (!this.worldGenerationMenu) {
                    // Lazy load world generation menu on first use
                    logger.log("[Game] Loading world generation menu (Ctrl+9)...");
                    import("./worldGenerationMenu").then(({ WorldGenerationMenu }) => {
                        this.worldGenerationMenu = new WorldGenerationMenu();
                        this.worldGenerationMenu.setGame(this);
                        // Toggle visibility after loading
                        if (typeof this.worldGenerationMenu.toggle === 'function') {
                            this.worldGenerationMenu.toggle();
                        }
                        logger.log("[Game] World generation menu loaded successfully");
                    }).catch(error => {
                        logger.error("[Game] Failed to load world generation menu:", error);
                        if (this.hud) {
                            this.hud.showMessage("Failed to load World Generation Menu", "#f00", 3000);
                        }
                        // Сбрасываем ссылку для повторной попытки
                        this.worldGenerationMenu = undefined;
                    });
                } else {
                    // Toggle existing menu
                    if (typeof this.worldGenerationMenu.toggle === 'function') {
                        this.worldGenerationMenu.toggle();
                        logger.log("[Game] World generation menu toggled");
                    } else if (typeof (this.worldGenerationMenu as any).show === 'function') {
                        (this.worldGenerationMenu as any).show();
                        logger.log("[Game] World generation menu shown");
                    }
                }
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
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1247',message:'ESC pressed in Game handler',data:{gameStarted:this.gameStarted,gamePaused:this.gamePaused,menuVisible:this.mainMenu?.isVisible?.()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                logger.log(`[Game] ESC pressed - gameStarted: ${this.gameStarted}, mainMenu: ${!!this.mainMenu}`);
                
                // Если игра не запущена, показываем главное меню
                if (!this.gameStarted) {
                    // Убеждаемся, что меню загружено
                    if (!this.mainMenu) {
                        logger.log("[Game] Loading menu on ESC...");
                        this.loadMainMenu().then(() => {
                            if (this.mainMenu) {
                                logger.log("[Game] Menu loaded, showing...");
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1260',message:'Calling mainMenu.show() from ESC handler (load)',data:{gameStarted:this.gameStarted,gamePaused:this.gamePaused},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                                // #endregion
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
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1274',message:'Calling mainMenu.show() from ESC handler (existing)',data:{gameStarted:this.gameStarted,gamePaused:this.gamePaused},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        this.mainMenu.show();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                
                // Если игра запущена, обрабатываем паузу
                // Закрываем все открытые меню перед паузой
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
                // Если меню видимо, не обрабатываем ESC здесь - меню само обработает
                if (this.mainMenu && this.mainMenu.isVisible()) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1329',message:'ESC: menu is visible, skipping togglePause',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    return;
                }
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1335',message:'ESC: calling togglePause',data:{gamePaused:this.gamePaused},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                this.togglePause();
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
        
        // Оптимизированный render loop с проверкой готовности
        // ВАЖНО: Запускаем render loop только после создания engine и scene
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
                // #region agent log
                if (this.gameStarted && !this.gamePaused) {
                    // Логируем состояние, но не скрываем меню автоматически
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1390',message:'Render loop: game started, menu state',data:{gameStarted:this.gameStarted,gamePaused:this.gamePaused,menuExists:!!this.mainMenu,menuVisible:this.mainMenu?.isVisible?.()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                    // #endregion
                } else {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:1412',message:'Render loop: game NOT started or paused, menu should be visible',data:{gameStarted:this.gameStarted,gamePaused:this.gamePaused},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                }
                
                // Рендерим сцену всегда (даже если игра на паузе, чтобы видеть меню)
                if (!this.gamePaused) {
                    this.scene.render();
                    // Обновляем логику игры только если игра запущена
                    if (this.gameStarted) {
                        this.update();
                    }
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
        
        // Shadow quality
        this.scene.shadowsEnabled = this.settings.shadowQuality > 0;
        
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
        if (!this.soundManager) return;
        
        // Master volume
        const masterVol = this.settings.masterVolume / 100;
        this.soundManager.setMasterVolume(masterVol);
        
        // Sound volume (effects) - зарезервировано для будущего использования
        // const soundVol = (this.settings.soundVolume / 100) * masterVol;
        // Note: SoundManager has individual volume controls, would need to update them
        
        // Music volume - зарезервировано для будущего использования
        // const musicVol = (this.settings.musicVolume / 100) * masterVol;
        // Note: Would need to add music volume control to SoundManager
        
        // Ambient volume - зарезервировано для будущего использования
        // const ambientVol = (this.settings.ambientVolume / 100) * masterVol;
        // Note: Would need to add ambient volume control to SoundManager
        
        // Voice volume - зарезервировано для будущего использования
        // const voiceVol = (this.settings.voiceVolume / 100) * masterVol;
        // Note: Would need to add voice volume control to SoundManager
        
        // Mute on focus loss
        // Remove old handler if exists
        if (this.muteOnFocusLossHandler) {
            document.removeEventListener("visibilitychange", this.muteOnFocusLossHandler);
            this.muteOnFocusLossHandler = null;
        }
        
        if (this.settings.muteOnFocusLoss) {
            this.muteOnFocusLossHandler = () => {
                if (document.hidden) {
                    this.soundManager?.setMasterVolume(0);
                } else {
                    this.soundManager?.setMasterVolume(masterVol);
                }
            };
            document.addEventListener("visibilitychange", this.muteOnFocusLossHandler);
        }
        
        logger.debug("Audio settings applied");
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
        if (!this.hud) return;
        
        // Show crosshair - would need HUD method
        // Show health bar - would need HUD method
        // Show ammo counter - would need HUD method
        // Crosshair style - would need HUD method
        
        logger.debug("UI settings applied");
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
            this.hud.showNotification?.(`🏆 ${name}`, "success");
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
            this.hud.showNotification?.(`📋 Миссия выполнена: ${name}`, "success");
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
    
    /**
     * Запускает игру: инициализирует игровой цикл, спавнит игрока и врагов
     * @returns {void}
     */
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
            this.enemyTanks.forEach(enemy => {
                if (enemy && enemy.chassis) {
                    try {
                        enemy.chassis.dispose();
                    } catch (e) {
                        // Игнорируем ошибки при dispose
                    }
                }
            });
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
                // Используем getAbsolutePosition() для получения актуальной позиции
                const tankPos = this.tank.chassis.getAbsolutePosition();
                const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                this.camera.setTarget(lookAt);
                this.camera.radius = this.settings.cameraDistance;
            }
            
            // Принудительно обновляем камеру сразу
            this.updateCamera();
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
        allPanels.forEach(panel => {
            (panel as HTMLElement).classList.remove("visible");
            (panel as HTMLElement).style.display = "none";
        });
        
        // Apply settings
        if (this.chunkSystem) {
            // Update render distance from settings
            logger.debug(`Render distance: ${this.settings.renderDistance}`);
        }
        
        // Apply FPS visibility setting
        if (this.hud) {
            this.hud.setShowFPS(this.settings.showFPS);
            
            // ДИАГНОСТИКА: Проверяем состояние GUI при старте игры
            logger.log("[Game] HUD state at game start - checking visibility...");
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
                        const pos = this.tank.chassis.absolutePosition;
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
     * Переключает состояние паузы игры
     * @returns {void}
     */
    togglePause(): void {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:2245',message:'togglePause called',data:{gameStarted:this.gameStarted,gamePausedBefore:this.gamePaused},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (!this.gameStarted) return;
        
        this.gamePaused = !this.gamePaused;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:2248',message:'togglePause: state changed',data:{gamePausedAfter:this.gamePaused},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
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
    
    /**
     * Перезапускает игру на той же карте
     * @returns {void}
     */
    restartGame(): void {
        logger.log("[Game] Restarting game on same map...");
        window.location.reload();
    }
    
    /**
     * Выходит из боя и возвращается в главное меню
     * @returns {void}
     */
    exitBattle(): void {
        logger.log("[Game] Exiting battle...");
        window.location.reload();
    }
    
    /**
     * Останавливает игру: очищает все ресурсы, останавливает звуки, удаляет объекты
     * @returns {void}
     */
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
            this.enemyTanks.forEach(enemy => {
                if (enemy.chassis) enemy.chassis.dispose();
            });
            this.enemyTanks = [];
        }
        
        // Очищаем танк игрока
        if (this.tank) {
            if (this.tank.chassis) this.tank.chassis.dispose();
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

    /**
     * Инициализирует игру: создает сцену, загружает ресурсы, настраивает системы
     * @async
     * @returns {Promise<void>} Promise, который разрешается после завершения инициализации
     * @throws {Error} Если инициализация не удалась
     */
    async init() {
        // Initialize Firebase
        try {
            const firebaseInitialized = await firebaseService.initialize();
            if (firebaseInitialized) {
                logger.log("[Game] Firebase initialized successfully");
                
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
            
            // Запускаем render loop если он еще не запущен
            if (this.engine && this.scene && !(this.engine as any)._renderLoopRunning) {
                logger.log("[Game] Starting render loop in init()");
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
                        
                        // Рендерим сцену всегда (даже если игра на паузе, чтобы видеть меню)
                        if (!this.gamePaused) {
                            this.scene.render();
                            // Обновляем логику игры только если игра запущена
                            if (this.gameStarted) {
                                this.update();
                            }
                        } else {
                            // Рендерим сцену даже на паузе, чтобы видеть игру за меню
                            this.scene.render();
                        }
                    }
                });
            }
            
            // Принудительно обновляем размер canvas
            this.engine.resize();
            logger.debug("Canvas resized, size:", this.canvas.width, "x", this.canvas.height);
            
            // Убеждаемся, что все overlay скрыты
            this.hideStatsOverlay();
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
            
            // Shadow generator for terrain depth
            const shadowGenerator = new ShadowGenerator(2048, sunLight);
            shadowGenerator.useBlurExponentialShadowMap = true;
            shadowGenerator.blurKernel = 32;
            shadowGenerator.setDarkness(0.3); // Мягкие тени
            shadowGenerator.bias = 0.00005;
            
            // Включаем тени в сцене
            this.scene.shadowsEnabled = true;
            
            // Store shadow generator for terrain
            (this.scene as any).terrainShadowGenerator = shadowGenerator;
            
            logger.log("Directional light and shadows configured");

            // Physics
            this.updateLoadingProgress(15, "Загрузка физического движка...");
            logger.log("Loading Havok WASM...");
            const havokInstance = await HavokPhysics({ 
                locateFile: (file: string) => {
                    // В dev режиме файл из public/, в production из dist/
                    return file === "HavokPhysics.wasm" ? "/HavokPhysics.wasm" : file;
                }
            });
            logger.log("Havok WASM loaded");
            this.updateLoadingProgress(30, "Инициализация физики...");
            const havokPlugin = new HavokPlugin(true, havokInstance);
            this.scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
            logger.log("Physics enabled");
            
            // КРИТИЧЕСКИ ВАЖНО: Обновляем камеру ПОСЛЕ обновления физики для предотвращения эффекта "нескольких танков"
            // Это гарантирует, что камера всегда читает актуальную позицию меша после синхронизации с физическим телом
            // Используем отдельный счетчик для оптимизации (каждые 2 кадра)
            let cameraUpdateCounter = 0;
            this.scene.onAfterPhysicsObservable.add(() => {
                // Обновляем камеру если игра инициализирована и не на паузе
                // gameInitialized проверяем вместо gameStarted, так как камера нужна сразу после инициализации
                if (this.gameInitialized && !this.gamePaused) {
                    cameraUpdateCounter++;
                    if (cameraUpdateCounter % 2 === 0) {
                        this.updateCamera();
                    }
                }
            });
            logger.log("[Game] Camera update subscribed to onAfterPhysicsObservable");

            // Ground создается в ChunkSystem для каждого чанка
            // НЕ создаем основной ground здесь, чтобы избежать дублирования и z-fighting
            // ChunkSystem создаст ground для каждого чанка с правильными позициями
            logger.log("[Game] Ground will be created by ChunkSystem per chunk");

            // Create Tank (spawn close to ground - hover height is ~1.0)
            this.updateLoadingProgress(40, "Создание танка...");
            this.tank = new TankController(this.scene, new Vector3(0, 1.2, 0));
            
            // Обновляем ссылки в панелях
            if (this.physicsPanel) {
                this.physicsPanel.setTank(this.tank);
            }
            if (this.cheatMenu) {
                this.cheatMenu.setTank(this.tank);
            }
            if (this.debugDashboard) {
                this.debugDashboard.setTank(this.tank);
            }
            
            // Устанавливаем callback для респавна в гараже
            this.tank.setRespawnPositionCallback(() => this.getPlayerGaragePosition());
            
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
            this.aimCamera = new UniversalCamera("aimCamera", new Vector3(0, 0, 0), this.scene);
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
                logger.log("[Game] Creating HUD... Scene renderTargetsEnabled:", this.scene.renderTargetsEnabled);
                logger.log("[Game] Active camera before HUD:", this.scene.activeCamera?.name);
                this.hud = new HUD(this.scene);
                
                // HUD создан успешно
                if (this.hud) {
                    logger.log("[Game] HUD created successfully");
                    
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
                logger.log("[Game] HUD created successfully");
                logger.log("[Game] Active camera after HUD:", this.scene.activeCamera?.name);
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
            
            // Create Player Progression System
            this.playerProgression = new PlayerProgressionSystem();
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
                    if (this.statsOverlayVisible && this.statsOverlay) {
                        this.updateStatsOverlay();
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
            this.hideStatsOverlay();
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
            const isProduction = (import.meta as any).env?.PROD || false;
            
            // Получаем сид из настроек меню
            const settings = this.mainMenu?.getSettings();
            let worldSeed = settings?.worldSeed || 12345;
            if (settings?.useRandomSeed) {
                worldSeed = Math.floor(Math.random() * 999999999);
            }
            logger.log(`Using world seed: ${worldSeed}`);
            
            // Create destruction system - УЛУЧШЕНО: Оптимизированы параметры для производительности
            this.destructionSystem = new DestructionSystem(this.scene, {
                enableDebris: true,
                debrisLifetime: 8000, // УМЕНЬШЕНО с 10000 до 8000 для экономии памяти
                maxDebrisPerObject: 4 // УМЕНЬШЕНО с 5 до 4 для оптимизации
            });
            
            // ЗАЩИТНАЯ ПРОВЕРКА: убеждаемся, что mapType всегда установлен
            const mapType = this.currentMapType || "normal";
            logger.log(`[Game] Creating ChunkSystem with mapType: ${mapType} (currentMapType was: ${this.currentMapType})`);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:2927',message:'Creating ChunkSystem',data:{currentMapType:this.currentMapType,mapTypeForChunkSystem:mapType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            this.chunkSystem = new ChunkSystem(this.scene, {
                chunkSize: 80,          // HUGE chunks = fewer chunks
                renderDistance: isProduction ? 1.2 : 1.5,       // Еще меньше в production
                unloadDistance: 4,       // Уменьшено с 5 до 4
                worldSeed: worldSeed,
                mapType: mapType
            });
            logger.log(`Chunk system created with ${this.chunkSystem.garagePositions.length} garages`);
            
            // Настраиваем callbacks для POI системы
            this.setupPOICallbacks();
            
            this.updateLoadingProgress(85, "Размещение объектов...");
            
            // КРИТИЧЕСКИ ВАЖНО: Запускаем генерацию чанков сразу, чтобы гаражи начали генерироваться
            // Используем позицию танка (0, 2, 0) для начальной генерации
            const initialPos = new Vector3(0, 2, 0);
            this.chunkSystem.update(initialPos);
            
            // === DEBUG TOOLS (Lazy loaded) ===
            // Debug tools are loaded on-demand when F3/F4/F7 are pressed
            // This reduces initial bundle size
            
            // Session Settings will be lazy loaded when F6 is pressed (see keydown handler)
            
            // === MULTIPLAYER ===
            // Initialize multiplayer manager (can be enabled/disabled)
            const serverUrl = (import.meta as any).env?.VITE_WS_SERVER_URL || "ws://localhost:8080";
            this.multiplayerManager = new MultiplayerManager(serverUrl);
            this.setupMultiplayerCallbacks();
            
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
            this.updateLoadingProgress(100, "Готово!");
            setTimeout(() => {
                this.hideLoadingScreen();
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
    
    /**
     * Возвращает текущую сложность врагов с учётом sessionSettings и настроек главного меню
     */
    private getCurrentEnemyDifficulty(): "easy" | "medium" | "hard" {
        // Приоритет: настройки сессии (ин‑игровая панель) > настройки главного меню > medium
        if (this.sessionSettings) {
            const sessionSettings = this.sessionSettings.getSettings();
            const sessionDiff = sessionSettings.aiDifficulty;
            if (sessionDiff === "easy" || sessionDiff === "medium" || sessionDiff === "hard") {
                return sessionDiff;
            }
        }
        
        const menuSettings = this.mainMenu?.getSettings();
        if (menuSettings?.enemyDifficulty) {
            return menuSettings.enemyDifficulty;
        }
        
        return "medium";
    }
    
    /**
     * Мультипликатор наград (кредиты/прогресс) в зависимости от сложности врагов
     */
    private getDifficultyRewardMultiplier(): number {
        const diff = this.getCurrentEnemyDifficulty();
        switch (diff) {
            case "easy":
                return 0.7;  // Меньше награды на лёгкой сложности
            case "hard":
                return 1.4;  // Больше награды на сложной
            case "medium":
            default:
                return 1.0;
        }
    }
    
    /**
     * Плавный множитель сложности врагов в зависимости от прогресса игрока и длительности текущей сессии.
     * Используется для масштабирования параметров EnemyTank и (опционально) количества противников.
     */
    private getAdaptiveEnemyDifficultyScale(): number {
        const diff = this.getCurrentEnemyDifficulty();
        let base = 1.0;
        if (diff === "easy") {
            base = 0.9;
        } else if (diff === "hard") {
            base = 1.1;
        }
        
        // Множитель от уровня игрока (1..50). Чем выше уровень, тем выше давление от ИИ.
        let levelFactor = 1.0;
        if (this.playerProgression) {
            try {
                const level = this.playerProgression.getLevel();
                const normalized = Math.min(Math.max(level - 1, 0), 49) / 49; // 0..1
                levelFactor = 1 + normalized * 0.5; // до +50%
            } catch {
                // В случае ошибки оставляем 1.0
            }
        }
        
        // Множитель от длительности выживания в текущей сессии (до 20 минут непрерывной игры)
        let timeFactor = 1.0;
        if (this.survivalStartTime > 0) {
            const survivalSeconds = (Date.now() - this.survivalStartTime) / 1000;
            const clamped = Math.min(Math.max(survivalSeconds, 0), 20 * 60);
            const normalized = clamped / (20 * 60); // 0..1
            timeFactor = 1 + normalized * 0.4; // до +40%
        }
        
        let scale = base * levelFactor * timeFactor;
        
        // Кламп чтобы не уходить в экстремальные значения
        if (scale < 0.7) scale = 0.7;
        if (scale > 1.8) scale = 1.8;
        
        const now = Date.now();
        if (now - this._lastAdaptiveDifficultyLogTime > 10000) {
            this._lastAdaptiveDifficultyLogTime = now;
            logger.debug(
                `[Game] Adaptive enemy scale=${scale.toFixed(2)} (diff=${diff}, levelFactor=${levelFactor.toFixed(2)}, timeFactor=${timeFactor.toFixed(2)})`
            );
        }
        
        return scale;
    }
    
    /**
     * Спавнит вражеские танки на карте в зависимости от типа карты
     * @returns {void}
     */
    spawnEnemyTanks() {
        // ИСПРАВЛЕНИЕ: Добавлено подробное логирование для отладки
        logger.log(`[Game] spawnEnemyTanks() called - mapType: ${this.currentMapType}, gameStarted: ${this.gameStarted}`);
        
        // Не спавним врагов в режиме песочницы
        if (this.currentMapType === "sandbox") {
            logger.log("[Game] Sandbox mode: Enemy tanks disabled");
            return;
        }
        
        // ИСПРАВЛЕНИЕ: Проверка что игра запущена (но не блокируем если вызываем явно)
        if (!this.gameStarted) {
            logger.warn("[Game] gameStarted is false, but continuing with spawn anyway (explicit call)");
            // Не возвращаемся - продолжаем спавн даже если gameStarted еще не установлен
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
        
        // Убеждаемся, что массив инициализирован
        if (!this.enemyTanks) {
            this.enemyTanks = [];
        }
        
        logger.log(`[Game] Spawning enemies for map: ${this.currentMapType}`);
        
        // Для полигона - спавним ботов в зоне боя (юго-восточный квадрант)
        if (this.currentMapType === "polygon") {
            this.spawnPolygonTrainingBots();
            return;
        }
        
        // Для передовой - система волн врагов
        if (this.currentMapType === "frontline") {
            this.spawnFrontlineEnemies();
            return;
        }
        
        // Для всех остальных карт (включая normal) - спавним врагов
        // Разбрасываем врагов по всей карте случайным образом
        const minDistance = 60; // Минимальное расстояние от центра
        const maxDistance = 180; // Максимальное расстояние от центра
        
        // Динамическое количество ботов в зависимости от типа карты
        let defaultEnemyCount = 3; // По умолчанию 3 для normal карты
        switch (this.currentMapType) {
            case "normal":
                defaultEnemyCount = 3;
                break;
            case "industrial":
            case "urban_warfare":
                defaultEnemyCount = 3;
                break;
            case "ruins":
            case "canyon":
                defaultEnemyCount = 3;
                break;
            case "underground":
            case "coastal":
                defaultEnemyCount = 3;
                break;
            default:
                defaultEnemyCount = 3;
        }
        
        // Используем настройки из sessionSettings/главного меню, если доступны
        let enemyCount = defaultEnemyCount;
        let aiDifficulty: "easy" | "medium" | "hard" = this.getCurrentEnemyDifficulty();
        let enemyCountOverridden = false;
        
        logger.log(`[Game] Initial enemyCount from default: ${enemyCount}`);
        
        if (this.sessionSettings) {
            const sessionSettings = this.sessionSettings.getSettings();
            // Используем настройки из sessionSettings только если они установлены и > 0
            const sessionEnemyCount = sessionSettings.enemyCount;
            logger.log(`[Game] SessionSettings enemyCount: ${sessionEnemyCount}`);
            if (sessionEnemyCount && sessionEnemyCount > 0) {
                enemyCount = sessionEnemyCount;
                enemyCountOverridden = true;
                logger.log(`[Game] Using sessionSettings enemyCount: ${enemyCount}`);
            }
        } else {
            // Если sessionSettings нет, используем настройки из меню или динамическое значение
            const menuSettings = this.mainMenu?.getSettings() as GameSettings & { enemyCount?: number };
            const menuEnemyCount = menuSettings?.enemyCount;
            logger.log(`[Game] MenuSettings enemyCount: ${menuEnemyCount}`);
            if (menuEnemyCount && menuEnemyCount > 0) {
                enemyCount = menuEnemyCount;
                enemyCountOverridden = true;
                logger.log(`[Game] Using menuSettings enemyCount: ${enemyCount}`);
            }
        }
        
        // Плавная кривая количества врагов: растёт с прогрессом игрока и длительностью сессии,
        // но только если игрок не зафиксировал количество врагов вручную.
        if (!enemyCountOverridden) {
            const adaptiveScale = this.getAdaptiveEnemyDifficultyScale();
            const scaledCount = Math.round(enemyCount * adaptiveScale);
            const minCount = Math.max(4, Math.floor(enemyCount * 0.6));
            const maxCount = Math.min(enemyCount + 8, Math.round(enemyCount * 1.6));
            enemyCount = Math.max(minCount, Math.min(scaledCount, maxCount));
            logger.log(`[Game] Adaptive scaling: scale=${adaptiveScale}, scaledCount=${scaledCount}, final=${enemyCount}`);
        }
        
        // ИСПРАВЛЕНИЕ: Гарантируем минимум 1 врага для одиночной игры
        if (enemyCount <= 0) {
            logger.warn(`[Game] enemyCount was ${enemyCount}, forcing to minimum 3 for single player`);
            enemyCount = 3; // Минимум 3 врага в одиночной игре
        }
        
        logger.log(`[Game] Enemy spawn settings: count=${enemyCount}, difficulty=${aiDifficulty}`);
        
        const spawnPositions: Vector3[] = [];
        
        // Генерируем случайные позиции
        for (let i = 0; i < enemyCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                // Случайный угол и расстояние
                const angle = Math.random() * Math.PI * 2;
                const distance = minDistance + Math.random() * (maxDistance - minDistance);
                
                // ИСПРАВЛЕНИЕ: Получаем высоту земли и спавним танк немного над поверхностью
                const spawnX = Math.cos(angle) * distance;
                const spawnZ = Math.sin(angle) * distance;
                let spawnY = 0.6; // Fallback высота
                
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
                
                // КРИТИЧНО: Убеждаемся, что высота не отрицательная
                // Если groundHeight < 0, значит что-то не так - используем 0
                if (groundHeight < 0) {
                    groundHeight = 0;
                }
                
                // КРИТИЧНО: Если raycast не нашел меш и terrainGenerator вернул 0 или очень маленькое значение,
                // это может означать, что террейн еще не загружен. Используем минимальную безопасную высоту.
                if (groundHeight < 0.1 && this.chunkSystem && this.chunkSystem.terrainGenerator) {
                    // Проверяем, есть ли меши террейна в сцене
                    const terrainMeshes = this.scene.meshes.filter(m => 
                        m.name.startsWith("ground_") && m.isEnabled()
                    );
                    
                    // Если террейн не загружен, используем минимальную безопасную высоту
                    if (terrainMeshes.length === 0) {
                        groundHeight = 2.0; // Минимальная высота для спавна
                    }
                }
                
                // Спавним на высоте земли + 3.0 единицы для предотвращения падения сквозь пол
                spawnY = Math.max(groundHeight + 3.0, 5.0); // Минимум 5.0 для безопасности
                
                pos = new Vector3(spawnX, spawnY, spawnZ);
                
                // Проверяем что позиция не слишком близко к другим
                let tooClose = false;
                for (const existingPos of spawnPositions) {
                    if (Vector3.Distance(pos, existingPos) < 40) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) break;
                attempts++;
            } while (attempts < 50);
            
            spawnPositions.push(pos);
        }
        
        logger.log(`[Game] Generated ${spawnPositions.length} spawn positions, attempting to spawn ${enemyCount} enemies`);
        
        logger.log(`[Game] === STARTING ENEMY SPAWN ===`);
        logger.log(`[Game] Will spawn ${spawnPositions.length} enemies`);
        
        spawnPositions.forEach((pos, index) => {
            try {
                // Используем сложность из sessionSettings или настроек меню
                const difficulty = aiDifficulty;
                const difficultyScale = this.getAdaptiveEnemyDifficultyScale();
                logger.log(`[Game] [${index + 1}/${spawnPositions.length}] Creating EnemyTank at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3117',message:'Spawning EnemyTank',data:{index:index+1,total:spawnPositions.length,posX:pos.x.toFixed(2),posY:pos.y.toFixed(2),posZ:pos.z.toFixed(2),difficulty},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                const enemyTank = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, difficulty, difficultyScale);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3119',message:'EnemyTank created',data:{index:index+1,hasChassis:!!enemyTank.chassis,chassisPosY:enemyTank.chassis?.position.y.toFixed(2),hasRotation:!!enemyTank.chassis?.rotationQuaternion},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                logger.log(`[Game] [${index + 1}/${spawnPositions.length}] EnemyTank created successfully, chassis visible: ${enemyTank.chassis?.isVisible !== false}`);
                if (this.tank) {
                    enemyTank.setTarget(this.tank);
                    logger.log(`[Game] [${index + 1}/${spawnPositions.length}] Target set for enemy`);
                }
            
            // On death
            enemyTank.onDeathObservable.add(() => {
                logger.log("[GAME] Enemy tank destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                    logger.log("[GAME] Kill added to HUD");
                }
                // Track achievements
                if (this.achievementsSystem) {
                    this.achievementsSystem.updateProgress("first_blood", 1);
                    this.achievementsSystem.updateProgress("tank_hunter", 1);
                    this.achievementsSystem.updateProgress("tank_ace", 1);
                    // Comeback achievement
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
                // ИСПРАВЛЕНИЕ: Добавляем опыт за убийство танка
                // ExperienceSystem обрабатывает опыт для деталей (chassis/cannon)
                if (this.experienceSystem && this.tank) {
                    this.experienceSystem.recordKill(
                        this.tank.chassisType.id,
                        this.tank.cannonType.id,
                        false
                    );
                }
                // PlayerProgression обрабатывает общий прогресс игрока (уровень, статистика)
                // НЕ добавляем опыт дважды - recordKill() только обновляет статистику, не добавляет XP
                if (this.playerProgression) {
                    this.playerProgression.recordKill();
                    this.playerProgression.addCredits(reward);
                    // ИСПРАВЛЕНИЕ: Добавляем опыт игроку только один раз через ExperienceSystem
                    // PlayerProgression получает опыт через ExperienceSystem.flushXpBatch()
                }
                // УЛУЧШЕНО: Удаляем бота из AI Coordinator
                if (this.aiCoordinator) {
                    this.aiCoordinator.unregisterBot(enemyTank.id);
                }
                
                // Remove from array
                const idx = this.enemyTanks.indexOf(enemyTank);
                if (idx !== -1) this.enemyTanks.splice(idx, 1);
                
                // Respawn after 3 minutes in the nearest available garage
                // Находим ближайший свободный гараж для респавна
                if (this.chunkSystem && this.chunkSystem.garagePositions.length > 0) {
                    const nearestGarage = this.findNearestAvailableGarage(pos);
                    if (nearestGarage) {
                        this.startGarageRespawnTimer(nearestGarage);
                    } else {
                        // Если все гаражи заняты, используем ближайший к позиции смерти
                        const nearest = this.findNearestGarage(pos);
                        if (nearest) {
                            this.startGarageRespawnTimer(nearest);
                        } else {
                            this.startGarageRespawnTimer(pos);
                        }
                    }
                } else {
                    // Если гаражи недоступны, используем текущую позицию
                    this.startGarageRespawnTimer(pos);
                }
            });
            
                this.enemyTanks.push(enemyTank);
                
                // УЛУЧШЕНО: Регистрируем бота в AI Coordinator
                if (this.aiCoordinator) {
                    this.aiCoordinator.registerBot(enemyTank);
                }
                
                // УЛУЧШЕНО: Устанавливаем roadNetwork для pathfinding
                if (this.chunkSystem && this.chunkSystem.roadNetwork) {
                    enemyTank.setRoadNetwork(this.chunkSystem.roadNetwork);
                }
                
                // УЛУЧШЕНО: Обновляем позицию референса для pathfinding
                if (this.tank && this.tank.chassis) {
                    enemyTank.updatePathfindingReference(this.tank.chassis.absolutePosition);
                }
                
                logger.log(`[Game] [${index + 1}/${spawnPositions.length}] Enemy added to array. Total enemies: ${this.enemyTanks.length}`);
            } catch (error) {
                logger.error(`[Game] [${index + 1}/${spawnPositions.length}] FAILED to spawn enemy:`, error);
                logger.error(`[Game] Error details:`, error instanceof Error ? error.stack : String(error));
            }
        });
        
        logger.log(`[Game] === ENEMY SPAWN COMPLETE ===`);
        logger.log(`[Game] Total enemies in array: ${this.enemyTanks.length}`);
        logger.log(`[Game] Requested: ${enemyCount}, Positions: ${spawnPositions.length}, Spawned: ${this.enemyTanks.length}`);
        
        // Проверяем видимость врагов
        if (this.enemyTanks.length > 0) {
            const visibleCount = this.enemyTanks.filter(e => e.chassis?.isVisible !== false).length;
            logger.log(`[Game] Visible enemies: ${visibleCount}/${this.enemyTanks.length}`);
            this.enemyTanks.forEach((enemy, idx) => {
                const pos = enemy.chassis?.position;
                logger.log(`[Game] Enemy ${idx + 1}: position=(${pos?.x.toFixed(1)}, ${pos?.y.toFixed(1)}, ${pos?.z.toFixed(1)}), visible=${enemy.chassis?.isVisible !== false}`);
            });
        } else {
            logger.error(`[Game] ERROR: No enemies spawned! Check logs above for errors.`);
        }
        
        // ИСПРАВЛЕНИЕ: Предупреждение если не все враги заспавнились
        if (this.enemyTanks.length < enemyCount) {
            logger.warn(`[Game] WARNING: Only ${this.enemyTanks.length} out of ${enemyCount} enemies spawned!`);
        }
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
                
                spawnY = Math.max(groundHeight, 0) + 1.2; // Высота чуть выше hover height (1.0) для плавного приземления
                
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
                    // Используем getAbsolutePosition() для получения актуальной позиции
                    const tankPos = this.tank.chassis.getAbsolutePosition();
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
                    if (!this.playerGaragePosition) {
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
                        this.spawnEnemiesInGarages();
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
                logger.log(`[Game] Player spawned in garage at ${this.playerGaragePosition?.x.toFixed(1)}, ${this.playerGaragePosition?.z.toFixed(1)} (total garages: ${this.chunkSystem.garagePositions.length})`);
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
                    if (this.currentMapType !== "tartaria" && this.playerGaragePosition && this.chunkSystem && this.chunkSystem.garagePositions.length >= 2) {
                        logger.log("[Game] (Timeout) Attempting to spawn enemies in garages...");
                        const beforeCount = this.enemyTanks.length;
                        this.spawnEnemiesInGarages();
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
    
    /**
     * Спавн игрока в случайном месте на карте (для карты Тартария)
     * Использует raycast для определения высоты террейна и размещает танк над поверхностью
     */
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
        
        // Получаем высоту террейна через raycast
        let spawnY = 5.0; // Безопасная высота по умолчанию
        const rayStart = new Vector3(randomX, 100, randomZ);
        const ray = new Ray(rayStart, Vector3.Down(), 200);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            return (mesh.name.startsWith("ground_") || 
                    mesh.name.includes("terrain") || 
                    mesh.name.includes("chunk") ||
                    mesh.name.includes("road")) && 
                   mesh.isEnabled();
        });
        
        if (hit && hit.hit && hit.pickedPoint) {
            spawnY = Math.max(hit.pickedPoint.y + 3.0, 5.0);
        } else if (this.chunkSystem.terrainGenerator) {
            const terrainHeight = this.chunkSystem.terrainGenerator.getHeight(randomX, randomZ, "residential");
            spawnY = Math.max(terrainHeight + 3.0, 5.0);
        }
        
        const spawnPos = new Vector3(randomX, spawnY, randomZ);
        this.playerGaragePosition = spawnPos.clone();
        
        logger.log(`[Game] Tartaria: Player spawned at random location (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
        
        // Устанавливаем позицию и состояние танка
        if (this.tank.chassis && this.tank.physicsBody) {
            this.tank.chassis.position.copyFrom(spawnPos);
            this.tank.chassis.rotationQuaternion = Quaternion.Identity();
            this.tank.chassis.rotation.set(0, 0, 0);
            if (this.tank.turret) this.tank.turret.rotation.set(0, 0, 0);
            if (this.tank.barrel) this.tank.barrel.rotation.set(0, 0, 0);
            
            this.tank.chassis.computeWorldMatrix(true);
            if (this.tank.turret) this.tank.turret.computeWorldMatrix(true);
            if (this.tank.barrel) this.tank.barrel.computeWorldMatrix(true);
            
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
            this.tank.physicsBody.setTargetTransform(spawnPos, Quaternion.Identity());
        }
    }
    
    // Спавн игрока в случайном гараже
    spawnPlayerInGarage() {
        if (!this.tank) {
            logger.warn("[Game] Tank not initialized");
            return;
        }
        
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            logger.warn("[Game] No garages available, using default spawn at (0, 2, 0)");
            // Fallback на обычный спавн
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
        // Создаем Vector3 из GaragePosition с правильной высотой террейна (используем raycast)
        let garageY = 0;
        let terrainHeight = 0;
        const rayStart = new Vector3(selectedGarage.x, 100, selectedGarage.z); // Увеличена начальная высота для лучшего raycast
        const rayDir = Vector3.Down();
        const ray = new Ray(rayStart, rayDir, 100);
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
            terrainHeight = hit.pickedPoint.y;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3846',message:'Player garage raycast found terrain',data:{terrainHeight:terrainHeight.toFixed(2),garageX:selectedGarage.x.toFixed(2),garageZ:selectedGarage.z.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
        } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
            terrainHeight = this.chunkSystem.terrainGenerator.getHeight(
                selectedGarage.x,
                selectedGarage.z,
                "dirt"
            );
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3848',message:'Player garage using terrainGenerator',data:{terrainHeight:terrainHeight.toFixed(2),garageX:selectedGarage.x.toFixed(2),garageZ:selectedGarage.z.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
        }
        
        // КРИТИЧНО: Убеждаемся, что высота не отрицательная
        if (terrainHeight < 0) {
            terrainHeight = 0;
        }
        
        // КРИТИЧНО: Если terrainHeight очень маленький (< 0.1), это может означать, что террейн еще не загружен
        // Проверяем, есть ли загруженные меши террейна
        let hasLoadedTerrain = false;
        if (this.chunkSystem) {
            const terrainMeshes = this.scene.meshes.filter(m => 
                m.name.startsWith("ground_") && m.isEnabled()
            );
            hasLoadedTerrain = terrainMeshes.length > 0;
            
            // Если террейн не загружен и высота очень маленькая, используем минимальную безопасную высоту
            if (!hasLoadedTerrain && terrainHeight < 0.1) {
                terrainHeight = 2.0; // Минимальная высота для спавна
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3854',message:'Player garage using fallback height',data:{terrainHeight:2.0,hasLoadedTerrain:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
            }
        }
        
        garageY = Math.max(terrainHeight + 3.0, 5.0); // Минимум 5.0 для безопасности
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3860',message:'Player garage final height',data:{terrainHeight:terrainHeight.toFixed(2),garageY:garageY.toFixed(2),hasLoadedTerrain},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        this.playerGaragePosition = new Vector3(selectedGarage.x, garageY, selectedGarage.z);
        logger.log(`[Game] Garage position saved for respawn: (${this.playerGaragePosition.x.toFixed(2)}, ${this.playerGaragePosition.y.toFixed(2)}, ${this.playerGaragePosition.z.toFixed(2)})`);
        
        // Перемещаем танк в гараж
        if (this.tank.chassis && this.tank.physicsBody) {
            // КРИТИЧЕСКИ ВАЖНО: Убеждаемся что физика активна
            if (this.tank.physicsBody.motionType !== PhysicsMotionType.DYNAMIC) {
                this.tank.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            }
            
            // ИСПРАВЛЕНИЕ: Получаем высоту земли и спавним танк немного над поверхностью
            let spawnHeight = 0; // GaragePosition не имеет y, используем 0
            
            // КРИТИЧНО: Сначала пытаемся использовать raycast для получения реальной высоты меша террейна
            let groundHeight = 0;
            const rayStart = new Vector3(selectedGarage.x, 100, selectedGarage.z); // Увеличена начальная высота для лучшего raycast
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
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3870',message:'Player spawn raycast check',data:{garageX:selectedGarage.x.toFixed(2),garageZ:selectedGarage.z.toFixed(2),hitFound:!!(hit&&hit.hit&&hit.pickedPoint),hitY:hit?.pickedPoint?.y?.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            if (hit && hit.hit && hit.pickedPoint) {
                groundHeight = hit.pickedPoint.y;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3880',message:'Player spawn using raycast height',data:{groundHeight:groundHeight.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
            } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                // Fallback: используем terrain generator если raycast не нашел меш
                groundHeight = this.chunkSystem.terrainGenerator.getHeight(
                    selectedGarage.x, 
                    selectedGarage.z, 
                    "dirt"
                );
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3883',message:'Player spawn using terrainGenerator height',data:{groundHeight:groundHeight.toFixed(2),hasTerrainGen:!!this.chunkSystem.terrainGenerator},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
            } else {
                // КРИТИЧНО: Если оба метода не работают, используем минимальную высоту
                groundHeight = 0;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3890',message:'Player spawn using fallback height',data:{groundHeight:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
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
                        selectedGarage.x, 
                        selectedGarage.z, 
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
            
            // Спавним на высоте земли + 2.0 единицы для предотвращения падения сквозь пол
            spawnHeight = Math.max(groundHeight + 3.0, 5.0); // Минимум 5.0 для безопасности
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:3891',message:'Player spawn height calculated',data:{groundHeight:groundHeight.toFixed(2),spawnHeight:spawnHeight.toFixed(2),hasLoadedTerrain,raycastFound:!!(hit&&hit.hit&&hit.pickedPoint)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            logger.log(`[Game] Ground height at garage: ${groundHeight.toFixed(2)}, spawn height: ${spawnHeight.toFixed(2)}`);
            
            // Устанавливаем позицию с правильной высотой
            const spawnPos = new Vector3(selectedGarage.x, spawnHeight, selectedGarage.z);
            this.tank.chassis.position.copyFrom(spawnPos);
            
            // КРИТИЧЕСКИ ВАЖНО: Сбрасываем вращение корпуса (чтобы танк не был наклонён!)
            this.tank.chassis.rotationQuaternion = Quaternion.Identity();
            this.tank.chassis.rotation.set(0, 0, 0);
            
            // Сбрасываем вращение башни
            this.tank.turret.rotation.set(0, 0, 0);
            
            // Принудительно обновляем матрицы
            this.tank.chassis.computeWorldMatrix(true);
            this.tank.turret.computeWorldMatrix(true);
            this.tank.barrel.computeWorldMatrix(true);
            
            // Сбрасываем все скорости
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
        }
        
        // Сразу устанавливаем прозрачность стен гаража игрока на 90% (так как танк появляется в гараже)
        // Используем небольшую задержку, чтобы убедиться, что garageWalls уже созданы
        setTimeout(() => {
            this.setPlayerGarageWallsTransparent();
        }, 100);
        
        logger.log(`[Game] Player spawned in garage at ${selectedGarage.x.toFixed(1)}, ${selectedGarage.z.toFixed(1)}`);
    }
    
    // Получить позицию БЛИЖАЙШЕГО гаража для респавна игрока
    getPlayerGaragePosition(): Vector3 | null {
        // Если есть система чанков с гаражами - ищем ближайший к текущей позиции танка
        if (this.chunkSystem && this.chunkSystem.garagePositions.length > 0) {
            // Получаем текущую позицию танка (или камеры, если танк не инициализирован)
            let playerPos: Vector3;
            if (this.tank && this.tank.chassis) {
                playerPos = this.tank.chassis.absolutePosition;
            } else if (this.camera) {
                playerPos = this.camera.position.clone();
            } else {
                playerPos = new Vector3(0, 0, 0);
            }
            
            // Ищем ближайший гараж
            let nearestGarage: Vector3 | null = null;
            let nearestDistance = Infinity;
            
            for (const garage of this.chunkSystem.garagePositions) {
                const garagePos = new Vector3(garage.x, 0, garage.z);
                const dist = Vector3.Distance(
                    new Vector3(playerPos.x, 0, playerPos.z), 
                    garagePos
                );
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestGarage = garagePos;
                }
            }
            
            if (nearestGarage) {
                // КРИТИЧНО: Получаем высоту террейна для респавна (используем raycast для реальной высоты меша)
                let terrainHeight = 0;
                const rayStart = new Vector3(nearestGarage.x, 50, nearestGarage.z);
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
                    terrainHeight = hit.pickedPoint.y;
                } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                    terrainHeight = this.chunkSystem.terrainGenerator.getHeight(
                        nearestGarage.x,
                        nearestGarage.z,
                        "dirt"
                    );
                }
                
                nearestGarage.y = Math.max(terrainHeight, 0) + 2.0;
                logger.log(`[Game] Found nearest garage at distance ${nearestDistance.toFixed(1)}m: (${nearestGarage.x.toFixed(2)}, ${nearestGarage.y.toFixed(2)}, ${nearestGarage.z.toFixed(2)})`);
                return nearestGarage.clone();
            }
        }
        
        // Fallback: используем сохранённую позицию
        if (this.playerGaragePosition) {
            logger.log(`[Game] Using saved garage position: (${this.playerGaragePosition.x.toFixed(2)}, ${this.playerGaragePosition.y.toFixed(2)}, ${this.playerGaragePosition.z.toFixed(2)})`);
            return this.playerGaragePosition.clone();
        }
        
        // Последний fallback: центр гаража по умолчанию
        logger.warn(`[Game] No garage found, using default position (0, 2, 0)`);
        const defaultPos = new Vector3(0, 2.0, 0);
        this.playerGaragePosition = defaultPos.clone();
        return defaultPos;
    }
    
    // Найти ближайший свободный гараж (не занятый таймером респавна)
    findNearestAvailableGarage(fromPos: Vector3): Vector3 | null {
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) return null;
        
        let nearestGarage: Vector3 | null = null;
        let nearestDistance = Infinity;
        
        for (const garage of this.chunkSystem.garagePositions) {
            // Проверяем, не занят ли гараж таймером респавна
            const key = `${garage.x.toFixed(1)},${garage.z.toFixed(1)}`;
            if (this.garageRespawnTimers.has(key)) {
                continue; // Гараж занят таймером
            }
            
            const garagePos = new Vector3(garage.x, 0, garage.z);
            
            // Исключаем гараж игрока и близлежащие гаражи (минимум 100 единиц!)
            if (this.playerGaragePosition) {
                const distToPlayerGarage = Vector3.Distance(garagePos, this.playerGaragePosition);
                if (distToPlayerGarage < 100) continue; // Минимум 100 единиц от гаража игрока
            }
            
            const dist = Vector3.Distance(fromPos, garagePos);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestGarage = garagePos;
            }
        }
        
        return nearestGarage ? nearestGarage.clone() : null;
    }
    
    // Найти ближайший гараж (даже если занят) - для врагов
    findNearestGarage(fromPos: Vector3): Vector3 | null {
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) return null;
        
        let nearestGarage: Vector3 | null = null;
        let nearestDistance = Infinity;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const garagePos = new Vector3(garage.x, 0, garage.z);
            
            // Исключаем гараж игрока и близлежащие гаражи (минимум 100 единиц!)
            if (this.playerGaragePosition) {
                const distToPlayerGarage = Vector3.Distance(garagePos, this.playerGaragePosition);
                if (distToPlayerGarage < 100) continue; // Минимум 100 единиц от гаража игрока
            }
            
            const dist = Vector3.Distance(fromPos, garagePos);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestGarage = garagePos;
            }
        }
        
        return nearestGarage ? nearestGarage.clone() : null;
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
        if (!this.playerGaragePosition) {
            logger.error("CRITICAL: Player garage NOT SET! Aborting enemy spawn!");
            return;
        }
        
        logger.log(`[Game] === ENEMY SPAWN CHECK ===`);
        logger.log(`[Game] Player garage position: (${this.playerGaragePosition.x.toFixed(1)}, ${this.playerGaragePosition.z.toFixed(1)})`);
        logger.log(`[Game] Total garages in world: ${this.chunkSystem.garagePositions.length}`);
        
        // Используем позиции гаражей для спавна врагов
        // КРИТИЧЕСКИ ВАЖНО: Исключаем гараж игрока из списка доступных для врагов!
        const playerGarageX = this.playerGaragePosition.x;
        const playerGarageZ = this.playerGaragePosition.z;
        
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
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4126',message:'Enemy spawn raycast check',data:{garageX:garage.x.toFixed(2),garageZ:garage.z.toFixed(2),hitFound:!!(hit&&hit.hit&&hit.pickedPoint),hitY:hit?.pickedPoint?.y?.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            if (hit && hit.hit && hit.pickedPoint) {
                groundHeight = hit.pickedPoint.y;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4136',message:'Enemy spawn using raycast height',data:{groundHeight:groundHeight.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
            } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                groundHeight = this.chunkSystem.terrainGenerator.getHeight(garage.x, garage.z, "dirt");
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4138',message:'Enemy spawn using terrainGenerator height',data:{groundHeight:groundHeight.toFixed(2),hasTerrainGen:!!this.chunkSystem.terrainGenerator},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
            } else {
                // КРИТИЧНО: Если оба метода не работают, используем минимальную высоту
                groundHeight = 0;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4141',message:'Enemy spawn using fallback height',data:{groundHeight:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
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
            
            const spawnY = Math.max(groundHeight + 3.0, 5.0); // Минимум 5.0 для безопасности
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4141',message:'Enemy spawn height calculated',data:{groundHeight:groundHeight.toFixed(2),spawnY:spawnY.toFixed(2),hasLoadedTerrain,raycastFound:!!(hit&&hit.hit&&hit.pickedPoint)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const garagePos = new Vector3(garage.x, spawnY, garage.z);
            
            // Используем сложность из текущих настроек (sessionSettings/меню)
            const difficulty = this.getCurrentEnemyDifficulty();
            const difficultyScale = adaptiveScale;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4141',message:'Spawning EnemyTank in garage',data:{garageX:garage.x.toFixed(2),spawnY:spawnY.toFixed(2),garageZ:garage.z.toFixed(2),groundHeight:groundHeight.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, difficulty, difficultyScale);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:4147',message:'EnemyTank created in garage',data:{hasChassis:!!enemyTank.chassis,chassisPosY:enemyTank.chassis?.position.y.toFixed(2),hasRotation:!!enemyTank.chassis?.rotationQuaternion},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
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
                const newGarage = this.findNearestAvailableGarage(enemyGaragePos);
                if (newGarage) {
                    this.startGarageRespawnTimer(newGarage);
                } else {
                    const anyGarage = this.findGarageFarFromPlayer();
                    if (anyGarage) {
                        this.startGarageRespawnTimer(anyGarage);
                    }
                }
            });
            
            this.enemyTanks.push(enemyTank);
        }
        
        logger.log(`[Game] Spawned ${this.enemyTanks.length} enemy tanks in garages`);
    }
    
    respawnEnemyTank(garagePos: Vector3) {
        if (!this.soundManager || !this.effectsManager) return;
        
        // DOUBLE CHECK: Don't spawn in player's garage!
        if (this.playerGaragePosition) {
            const distToPlayer = Vector3.Distance(garagePos, this.playerGaragePosition);
            if (distToPlayer < 100) {
                logger.log(`[Game] BLOCKED: Enemy respawn too close to player garage (${distToPlayer.toFixed(1)}m)`);
                return;
            }
        }
        
        // Используем сложность из текущих настроек (sessionSettings/меню)
        const difficulty = this.getCurrentEnemyDifficulty();
        const difficultyScale = this.getAdaptiveEnemyDifficultyScale();
        const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, difficulty, difficultyScale);
        if (this.tank) {
            enemyTank.setTarget(this.tank);
        }
        
        // Store the garage position for this tank (for respawn)
        const spawnGaragePos = garagePos.clone();
        
        enemyTank.onDeathObservable.add(() => {
            logger.log("[GAME] Enemy tank destroyed (respawn)! Adding kill...");
            if (this.hud) {
                this.hud.addKill();
            }
            const baseReward = 100;
            const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
            if (this.currencyManager) {
                this.currencyManager.addCurrency(reward);
                if (this.hud) {
                    this.hud.setCurrency(this.currencyManager.getCurrency());
                    this.hud.showMessage(`+${reward} credits!`, "#ffaa00", 2000);
                }
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
            const idx = this.enemyTanks.indexOf(enemyTank);
            if (idx !== -1) this.enemyTanks.splice(idx, 1);
            
            // Find a NEW available garage (far from player) for respawn
            const newGarage = this.findNearestAvailableGarage(spawnGaragePos);
            if (newGarage) {
                this.startGarageRespawnTimer(newGarage);
            } else {
                // If no available garage, try to find any garage far from player
                const anyGarage = this.findGarageFarFromPlayer();
                if (anyGarage) {
                    this.startGarageRespawnTimer(anyGarage);
                }
                // If no garage available, enemy won't respawn
            }
        });
        
        this.enemyTanks.push(enemyTank);
        logger.log(`[Game] Enemy tank respawned at garage (${garagePos.x.toFixed(1)}, ${garagePos.z.toFixed(1)})`);
    }
    
    // Find any garage far from player (minimum 100 units)
    findGarageFarFromPlayer(): Vector3 | null {
        if (!this.chunkSystem || !this.playerGaragePosition) return null;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const garagePos = new Vector3(garage.x, 0, garage.z);
            const dist = Vector3.Distance(garagePos, this.playerGaragePosition);
            if (dist >= 100) {
                return garagePos.clone();
            }
        }
        return null;
    }
    
    // Запуск таймера респавна для гаража
    startGarageRespawnTimer(garagePos: Vector3) {
        // КРИТИЧЕСКИ ВАЖНО: Не создаём таймер респавна рядом с гаражом игрока!
        if (this.playerGaragePosition) {
            const distToPlayer = Vector3.Distance(garagePos, this.playerGaragePosition);
            if (distToPlayer < 100) {
                logger.log(`[Game] Not starting respawn timer near player garage (${distToPlayer.toFixed(1)}m away)`);
                return; // Слишком близко к гаражу игрока - не запускаем таймер респавна
            }
        }
        
        const key = `${garagePos.x.toFixed(1)},${garagePos.z.toFixed(1)}`;
        
        // Проверяем, нет ли уже таймера для этого гаража
        if (this.garageRespawnTimers.has(key)) {
            return; // Таймер уже запущен
        }
        
        // Создаём billboard с таймером над гаражом
        const billboard = MeshBuilder.CreatePlane("respawnTimer", { size: 2 }, this.scene);
        billboard.position = garagePos.clone();
        billboard.position.y += 8; // Над гаражом
        billboard.billboardMode = Mesh.BILLBOARDMODE_ALL; // Всегда смотрит на камеру
        
        // Создаём GUI для текста
        const advancedTexture = AdvancedDynamicTexture.CreateForMesh(billboard);
        const textBlock = new TextBlock();
        const initialSeconds = Math.ceil(this.RESPAWN_TIME / 1000);
        const initialMinutes = Math.floor(initialSeconds / 60);
        const initialSecs = initialSeconds % 60;
        textBlock.text = `${initialMinutes.toString().padStart(2, '0')}:${initialSecs.toString().padStart(2, '0')}`;
        textBlock.color = "white";
        textBlock.fontSize = 48;
        textBlock.fontWeight = "bold";
        advancedTexture.addControl(textBlock);
        
        // Сохраняем таймер
        this.garageRespawnTimers.set(key, {
            timer: this.RESPAWN_TIME,
            billboard: billboard,
            textBlock: textBlock
        });
    }
    
    // Обновление таймеров респавна
    updateGarageRespawnTimers(deltaTime: number) {
        this.garageRespawnTimers.forEach((data, key) => {
            data.timer -= deltaTime;
            
            if (data.timer <= 0) {
                // Время вышло - респавним врага
                const parts = key.split(',');
                if (parts.length === 2) {
                    const xStr = parts[0];
                    const zStr = parts[1];
                    if (xStr === undefined || zStr === undefined) {
                        return;
                    }
                    const x = parseFloat(xStr);
                    const z = parseFloat(zStr);
                    if (!isNaN(x) && !isNaN(z)) {
                        // КРИТИЧЕСКИ ВАЖНО: Не респавним врага рядом с гаражом игрока!
                        if (this.playerGaragePosition) {
                            const garagePos = new Vector3(x, 0, z);
                            const distToPlayer = Vector3.Distance(garagePos, new Vector3(this.playerGaragePosition.x, 0, this.playerGaragePosition.z));
                            if (distToPlayer < 30) {
                                logger.log(`[Game] Skipping enemy respawn too close to player (${distToPlayer.toFixed(1)}m away)`);
                                // Удаляем таймер без респавна
                                if (data.billboard) {
                                    data.billboard.dispose();
                                }
                                this.garageRespawnTimers.delete(key);
                                return;
                            }
                        }
                        
                        const garagePos = new Vector3(x, 0.6, z);  // Spawn close to ground for stability
                        this.respawnEnemyTank(garagePos);
                    }
                }
                
                // Удаляем таймер
                if (data.billboard) {
                    data.billboard.dispose();
                }
                this.garageRespawnTimers.delete(key);
            } else {
                // Обновляем текст таймера (формат: ММ:СС)
                const totalSeconds = Math.ceil(data.timer / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                if (data.textBlock) {
                    // Форматируем как ММ:СС
                    data.textBlock.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    // Меняем цвет в зависимости от оставшегося времени
                    if (totalSeconds <= 10) {
                        data.textBlock.color = "red";
                    } else if (totalSeconds <= 30) {
                        data.textBlock.color = "yellow";
                    } else {
                        data.textBlock.color = "white";
                    }
                }
            }
        });
    }
    
    // Сразу установить прозрачность стен гаража игрока при спавне
    setPlayerGarageWallsTransparent(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageWalls || !this.playerGaragePosition) return;
        
        const playerGaragePos = this.playerGaragePosition;
        
        // Находим гараж игрока и сразу устанавливаем прозрачность на 70% (0.3 видимость)
        this.chunkSystem.garageWalls.forEach(garageData => {
            const garagePos = garageData.position;
            const distance = Vector3.Distance(
                new Vector3(garagePos.x, 0, garagePos.z),
                new Vector3(playerGaragePos.x, 0, playerGaragePos.z)
            );
            
            // Если это гараж игрока (близко к позиции спавна), сразу устанавливаем прозрачность
            if (distance < 5.0) { // Гараж игрока должен быть очень близко
                // garageData это GarageWall, но мы ищем все стены с таким же garageId
                const garageId = (garageData as any).garageId;
                if (garageId && this.chunkSystem) {
                    this.chunkSystem.garageWalls.forEach((wall: any) => {
                        if ((wall as any).garageId === garageId && (wall as any).mesh) {
                            (wall as any).mesh.visibility = 0.3; // 70% прозрачность (сразу, без интерполяции)
                        }
                    });
                }
                logger.log(`[Game] Player garage walls set to 70% transparency immediately`);
            }
        });
    }
    
    // Обновление прозрачности стен гаражей (когда игрок внутри)
    updateGarageWallsTransparency(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageWalls || !this.tank || !this.tank.chassis) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        
        this.chunkSystem.garageWalls.forEach((garageData: any) => {
            const garagePos = garageData.position;
            const garageWidth = (garageData as any).width || 10;
            const garageDepth = (garageData as any).depth || 10;
            
            // Проверяем, находится ли игрок внутри гаража
            const halfWidth = garageWidth / 2;
            const halfDepth = garageDepth / 2;
            const isInside = 
                Math.abs(playerPos.x - garagePos.x) < halfWidth &&
                Math.abs(playerPos.z - garagePos.z) < halfDepth &&
                playerPos.y < 10; // Высота гаража примерно 8, проверяем до 10
            
            // Проверяем, является ли это гаражом игрока
            let isPlayerGarage = false;
            if (this.playerGaragePosition) {
                const distance = Vector3.Distance(
                    new Vector3(garagePos.x, 0, garagePos.z),
                    new Vector3(this.playerGaragePosition.x, 0, this.playerGaragePosition.z)
                );
                isPlayerGarage = distance < 5.0; // Гараж игрока должен быть очень близко
            }
            
            // Устанавливаем прозрачность стен (70% прозрачность = 0.3 видимость)
            const targetVisibility = isInside ? 0.3 : 1.0;
            
            // Проверяем наличие walls перед итерацией
            const walls = (garageData as any).walls;
            if (!walls || !Array.isArray(walls)) {
                return; // Пропускаем если walls отсутствует или не массив
            }
            
            walls.forEach((wall: any) => {
                if (wall) {
                    // Если это гараж игрока и игрок внутри, сразу устанавливаем прозрачность (без интерполяции)
                    if (isPlayerGarage && isInside) {
                        wall.visibility = 0.3; // 70% прозрачность сразу
                    } else {
                        // Для других гаражей или когда игрок снаружи - плавная интерполяция
                        const currentVisibility = wall.visibility;
                        const newVisibility = currentVisibility + (targetVisibility - currentVisibility) * 0.15;
                        wall.visibility = newVisibility;
                    }
                }
            });
        });
    }
    
    // Обновление ворот гаражей (открытие/закрытие при приближении танков)
    updateGarageDoors(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageDoors) return;
        
        // Обновляем каждые ворота
        const doorSpeed = 0.18; // УВЕЛИЧЕНА скорость открытия/закрытия для более отзывчивого управления
        
        this.chunkSystem.garageDoors.forEach((doorData: any) => {
            if (!(doorData as any).frontDoor || !(doorData as any).backDoor) return;
            
            // === АВТООТКРЫТИЕ ВОРОТ ДЛЯ БОТОВ ===
            // Проверяем приближение вражеских танков к воротам
            const doorOpenDistance = 18; // Дистанция для открытия ворот (увеличена с 12)
            const garagePos = doorData.position;
            const garageDepth = doorData.garageDepth || 20;
            
            // Позиции передних и задних ворот
            const frontDoorPos = new Vector3(garagePos.x, 0, garagePos.z + garageDepth / 2);
            const backDoorPos = new Vector3(garagePos.x, 0, garagePos.z - garageDepth / 2);
            
            // Проверяем всех вражеских танков
            for (const enemy of this.enemyTanks) {
                if (!enemy || !enemy.isAlive || !enemy.chassis) continue;
                
                const enemyPos = enemy.chassis.absolutePosition;
                
                // Проверяем расстояние до передних ворот
                const distToFront = Vector3.Distance(
                    new Vector3(enemyPos.x, 0, enemyPos.z),
                    frontDoorPos
                );
                if (distToFront < doorOpenDistance && !doorData.frontDoorOpen) {
                    // Бот близко к передним воротам - открываем
                    doorData.frontDoorOpen = true;
                }
                
                // Проверяем расстояние до задних ворот
                const distToBack = Vector3.Distance(
                    new Vector3(enemyPos.x, 0, enemyPos.z),
                    backDoorPos
                );
                if (distToBack < doorOpenDistance && !doorData.backDoorOpen) {
                    // Бот близко к задним воротам - открываем
                    doorData.backDoorOpen = true;
                }
            }
            
            // Используем состояние каждой ворота (ручное управление + автооткрытие для ботов)
            const targetFrontOpen = doorData.frontDoorOpen !== undefined ? doorData.frontDoorOpen : false;
            const targetBackOpen = doorData.backDoorOpen !== undefined ? doorData.backDoorOpen : false;
            
            // Плавная анимация ворот (каждая ворота управляется отдельно)
            const targetFrontY = targetFrontOpen ? doorData.frontOpenY : doorData.frontClosedY;
            const targetBackY = targetBackOpen ? doorData.backOpenY : doorData.backClosedY;
            
            // Передние ворота - плавная интерполяция
            const currentFrontY = doorData.frontDoor.position.y;
            const frontDiff = Math.abs(currentFrontY - targetFrontY);
            if (frontDiff > 0.01) {
                // Плавное движение к целевой позиции
                const newFrontY = currentFrontY + (targetFrontY - currentFrontY) * doorSpeed;
                doorData.frontDoor.position.y = newFrontY;
            } else {
                // Достигли целевой позиции
                doorData.frontDoor.position.y = targetFrontY;
            }
            // Обновляем физическое тело ворот (ANIMATED тип позволяет обновлять позицию)
            if (doorData.frontDoorPhysics && doorData.frontDoorPhysics.body) {
                doorData.frontDoor.computeWorldMatrix(true);
                doorData.frontDoorPhysics.body.setTargetTransform(
                    doorData.frontDoor.position.clone(), 
                    Quaternion.Identity()
                );
            }
            
            // Задние ворота - плавная интерполяция
            const currentBackY = doorData.backDoor.position.y;
            const backDiff = Math.abs(currentBackY - targetBackY);
            if (backDiff > 0.01) {
                // Плавное движение к целевой позиции
                const newBackY = currentBackY + (targetBackY - currentBackY) * doorSpeed;
                doorData.backDoor.position.y = newBackY;
            } else {
                // Достигли целевой позиции
                doorData.backDoor.position.y = targetBackY;
            }
            // Обновляем физическое тело ворот (ANIMATED тип позволяет обновлять позицию)
            if (doorData.backDoorPhysics && doorData.backDoorPhysics.body) {
                doorData.backDoor.computeWorldMatrix(true);
                doorData.backDoorPhysics.body.setTargetTransform(
                    doorData.backDoor.position.clone(), 
                    Quaternion.Identity()
                );
            }
        });
    }
    
    // Обновление системы захвата гаражей
    updateGarageCapture(deltaTime: number): void {
        if (!this.chunkSystem || !this.tank || !this.tank.chassis || !this.chunkSystem.garageCapturePoints) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        const playerId = this.PLAYER_ID;
        
        // Собираем позиции всех танков для подсчёта количества захватывающих
        const tankPositions: Vector3[] = [playerPos];
        if (this.enemyTanks) {
            this.enemyTanks.forEach(enemy => {
                if (enemy && enemy.isAlive && enemy.chassis) {
                    tankPositions.push(enemy.chassis.absolutePosition);
                }
            });
        }
        
        // Проверяем каждую точку захвата
        this.chunkSystem.garageCapturePoints.forEach(capturePoint => {
            const garageKey = `${capturePoint.position.x.toFixed(1)}_${capturePoint.position.z.toFixed(1)}`;
            const ownership = ((this.chunkSystem as any).garageOwnership || new Map()).get(garageKey);
            if (!ownership) return;
            
            // Проверяем состояние ворот - если закрыты, захват невозможен
            const garageDoor = this.chunkSystem!.garageDoors.find(door => 
                Math.abs(door.position.x - capturePoint.position.x) < 0.1 &&
                Math.abs(door.position.z - capturePoint.position.z) < 0.1
            );
            
            const garageDoorAny = garageDoor as any;
            if (garageDoor && !garageDoorAny.frontDoorOpen && !garageDoorAny.backDoorOpen) {
                // Ворота закрыты - захват невозможен, но прогресс НЕ сбрасываем
                // Просто скрываем прогресс-бар и не накапливаем прогресс
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                // Обновляем цвет по владельцу (захват невозможен пока ворота закрыты)
                if (ownership.ownerId === null) {
                    this.updateWrenchColor((capturePoint as any).wrench, "neutral");
                } else if (ownership.ownerId === playerId) {
                    this.updateWrenchColor((capturePoint as any).wrench, "player");
                } else {
                    this.updateWrenchColor((capturePoint as any).wrench, "enemy");
                }
                return;
            }
            
            // Проверяем расстояние до точки захвата для всех танков
            const nearbyTanks: Vector3[] = [];
            tankPositions.forEach(tankPos => {
                const distance = Vector3.Distance(
                    new Vector3(capturePoint.position.x, 0, capturePoint.position.z),
                    new Vector3(tankPos.x, 0, tankPos.z)
                );
                if (distance <= this.CAPTURE_RADIUS) {
                    nearbyTanks.push(tankPos);
                }
            });
            
            const capturingCount = nearbyTanks.length;
            const isPlayerNearby = nearbyTanks.some(tankPos => 
                Math.abs(tankPos.x - playerPos.x) < 0.1 && 
                Math.abs(tankPos.z - playerPos.z) < 0.1
            );
            
            // Если гараж уже принадлежит игроку, захват не нужен
            if (ownership.ownerId === playerId) {
                if (this.garageCaptureProgress.has(garageKey)) {
                    this.garageCaptureProgress.delete(garageKey);
                }
                if (this.hud && isPlayerNearby) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                // Обновляем цвет на зелёный (игрок владеет)
                this.updateWrenchColor((capturePoint as any).wrench, "player");
                return;
            }
            
            // Если игрок не рядом, просто скрываем прогресс-бар, но НЕ сбрасываем прогресс
            // Прогресс накапливается - нужно пробыть в гараже В ОБЩЕМ 3 минуты
            if (!isPlayerNearby) {
                // Скрываем прогресс-бар, но сохраняем прогресс
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                // Не возвращаемся - продолжаем проверку других гаражей
                // Прогресс остаётся в Map и будет использован при следующем входе
                return;
            }
            
            // Игрок рядом и гараж не его (нейтральный или чужой) - начинаем/продолжаем захват
            // Инициализируем прогресс, если его ещё нет
            if (!this.garageCaptureProgress.has(garageKey)) {
                this.garageCaptureProgress.set(garageKey, { progress: 0, capturingPlayers: capturingCount });
                logger.log(`[Game] Starting capture of garage at (${capturePoint.position.x.toFixed(1)}, ${capturePoint.position.z.toFixed(1)})`);
            }
            
            const captureData = this.garageCaptureProgress.get(garageKey)!;
            captureData.capturingPlayers = capturingCount;
            
            // Вычисляем скорость захвата (в 2 раза быстрее для двух игроков)
            const captureTime = this.CAPTURE_TIME_SINGLE / captureData.capturingPlayers;
            captureData.progress += deltaTime / captureTime;
            
            // Обновляем прогресс-бар в HUD
            if (this.hud) {
                const remainingTime = (1.0 - captureData.progress) * captureTime;
                this.hud.setGarageCaptureProgress(garageKey, captureData.progress, remainingTime);
                // Логируем каждую секунду для отладки
                if (Math.floor(captureData.progress * this.CAPTURE_TIME_SINGLE) % 5 === 0 && deltaTime > 0.1) {
                    logger.log(`[Game] Capture progress: ${(captureData.progress * 100).toFixed(1)}%, remaining: ${remainingTime.toFixed(1)}s`);
                }
            }
            
            // Если захват завершён
            if (captureData.progress >= 1.0) {
                // Захватываем гараж (даже если он был чужим)
                ownership.ownerId = playerId;
                this.garageCaptureProgress.delete(garageKey);
                
                // Обновляем цвет гаечного ключа на зелёный
                this.updateWrenchColor((capturePoint as any).wrench, "player");
                
                // Скрываем прогресс-бар
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                
                const wasEnemy = ownership.ownerId !== null && ownership.ownerId !== playerId;
                logger.log(`[Game] Garage ${wasEnemy ? 'captured from enemy' : 'captured'} at (${capturePoint.position.x.toFixed(1)}, ${capturePoint.position.z.toFixed(1)})`);
            } else {
                // Обновляем цвет на жёлтый (захват в процессе)
                this.updateWrenchColor((capturePoint as any).wrench, "capturing");
            }
        });
        
        // Обновляем цвет гаечных ключей для гаражей, которые не захватываются
        this.chunkSystem.garageCapturePoints.forEach(capturePoint => {
            const garageKey = `${capturePoint.position.x.toFixed(1)}_${capturePoint.position.z.toFixed(1)}`;
            const ownership = ((this.chunkSystem as any).garageOwnership || new Map()).get(garageKey);
            if (!ownership) return;
            
            // Если не в процессе захвата, обновляем цвет по владельцу
            if (!this.garageCaptureProgress.has(garageKey)) {
                if (ownership.ownerId === null) {
                    this.updateWrenchColor((capturePoint as any).wrench, "neutral");
                } else if (ownership.ownerId === this.PLAYER_ID) {
                    this.updateWrenchColor((capturePoint as any).wrench, "player");
                } else {
                    this.updateWrenchColor((capturePoint as any).wrench, "enemy");
                }
            }
        });
    }
    
    // Обновление цвета гаечного ключа (оптимизировано с кэшированными цветами)
    private updateWrenchColor(wrench: Mesh, state: "neutral" | "player" | "enemy" | "capturing"): void {
        if (!wrench || !wrench.material) return;
        
        const mat = wrench.material as StandardMaterial;
        switch (state) {
            case "neutral":
                mat.diffuseColor = this._colorNeutral;
                mat.emissiveColor = this._colorEmissiveNeutral;
                break;
            case "player":
                mat.diffuseColor = this._colorPlayer;
                mat.emissiveColor = this._colorEmissivePlayer;
                break;
            case "enemy":
                mat.diffuseColor = this._colorEnemy;
                mat.emissiveColor = this._colorEmissiveEnemy;
                break;
            case "capturing":
                // Для пульсации создаем новый цвет только когда нужно
                const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 200); // Пульсация каждые 200мс
                mat.diffuseColor.set(1.0, 1.0, 0.0); // Жёлтый
                mat.emissiveColor.set(0.5 * pulse, 0.5 * pulse, 0.1 * pulse);
                break;
        }
    }
    
    // Настройка callbacks для POI системы
    setupPOICallbacks(): void {
        const poiSystem = this.chunkSystem?.getPOISystem?.();
        if (!poiSystem) return;
        
        poiSystem.setCallbacks({
            onCapture: (poi, newOwner) => {
                logger.log(`[POI] ${poi.type} captured by ${newOwner}`);
                if (newOwner === "player") {
                    if (this.hud) {
                        this.hud.showNotification?.(`Точка захвачена!`, "success");
                    }
                    // Play capture sound
                    if (this.soundManager) {
                        this.soundManager.playReloadComplete?.(); // Success sound
                    }
                    // Achievement tracking
                    if (this.achievementsSystem) {
                        this.achievementsSystem.updateProgress("poi_first_capture", 1);
                        this.achievementsSystem.updateProgress("poi_conqueror", 1);
                        this.achievementsSystem.updateProgress("poi_warlord", 1);
                        
                        // Check for domination (5 POIs at once)
                        const ownedPOIs = poiSystem.getOwnedPOIs("player").length;
                        if (ownedPOIs >= 5) {
                            this.achievementsSystem.updateProgress("domination", 1);
                        }
                    }
                    // Mission tracking
                    if (this.missionSystem) {
                        this.missionSystem.updateProgress("capture", 1);
                    }
                    // Stats tracking
                    if (this.playerStats) {
                        this.playerStats.recordPOICapture();
                    }
                } else if (newOwner === "enemy") {
                    // Enemy captured - warning sound
                    if (this.soundManager) {
                        this.soundManager.playHit?.("critical", poi.worldPosition);
                    }
                }
            },
            onContestStart: (poi) => {
                logger.log(`[POI] ${poi.type} contested!`);
                if (this.hud) {
                    this.hud.showNotification?.(`⚔️ Контест!`, "warning");
                }
                // Warning sound for contest
                if (this.soundManager) {
                    this.soundManager.playHit?.("armor", poi.worldPosition);
                }
                // Stats tracking
                if (this.playerStats) {
                    this.playerStats.recordPOIContest();
                }
            },
            onAmmoPickup: (_poi, amount, special) => {
                if (this.tank && amount > 0) {
                    // Ammo is managed internally by tank
                    // this.tank.addAmmo?.(Math.floor(amount));
                    if (special) {
                        logger.log(`[POI] Special ammo pickup!`);
                    }
                    // Achievement tracking
                    if (this.achievementsSystem) {
                        this.achievementsSystem.updateProgress("ammo_collector", Math.floor(amount));
                    }
                    // Mission tracking
                    if (this.missionSystem) {
                        this.missionSystem.updateProgress("ammo", Math.floor(amount));
                    }
                    // Stats tracking
                    if (this.playerStats) {
                        this.playerStats.recordAmmoCollected(Math.floor(amount));
                    }
                }
            },
            onRepair: (_poi, amount) => {
                if (this.tank && this.tank.currentHealth < this.tank.maxHealth) {
                    const healAmount = (amount / 100) * this.tank.maxHealth;
                    this.tank.currentHealth = Math.min(this.tank.maxHealth, this.tank.currentHealth + healAmount);
                    if (this.hud) {
                        // Health is updated automatically by HUD
                        // this.hud.updateHealth(this.tank.currentHealth, this.tank.maxHealth);
                    }
                    // Achievement tracking
                    if (this.achievementsSystem) {
                        this.achievementsSystem.updateProgress("repair_addict", Math.floor(healAmount));
                    }
                    // Mission tracking
                    if (this.missionSystem) {
                        this.missionSystem.updateProgress("repair", Math.floor(healAmount));
                    }
                    // Stats tracking
                    if (this.playerStats) {
                        this.playerStats.recordHPRepaired(Math.floor(healAmount));
                    }
                }
            },
            onFuelRefill: (_poi, amount) => {
                if (this.tank) {
                    this.tank.addFuel?.(amount);
                    if (this.hud) {
                        this.hud.updateFuel?.(this.tank.currentFuel, this.tank.maxFuel);
                    }
                    // Achievement tracking
                    if (this.achievementsSystem) {
                        this.achievementsSystem.updateProgress("fuel_tanker", Math.floor(amount));
                    }
                    // Stats tracking
                    if (this.playerStats) {
                        this.playerStats.recordFuelCollected(Math.floor(amount));
                    }
                }
            },
            onExplosion: (_poi, position, radius, damage) => {
                logger.log(`[POI] Explosion at ${position}, radius ${radius}, damage ${damage}`);
                // Achievement tracking
                if (this.achievementsSystem) {
                    this.achievementsSystem.updateProgress("explosives_expert", 1);
                }
                // Stats tracking
                if (this.playerStats) {
                    this.playerStats.recordFuelDepotDestroyed();
                }
                // Play explosion sound
                if (this.soundManager) {
                    this.soundManager.playExplosion?.(position, 2.0); // Large explosion
                }
                // Наносим урон танкам в радиусе
                if (this.tank && this.tank.chassis) {
                    const dist = Vector3.Distance(this.tank.chassis.absolutePosition, position);
                    if (dist < radius) {
                        const dmgFactor = 1 - (dist / radius);
                        const actualDamage = damage * dmgFactor;
                        this.tank.takeDamage(actualDamage);
                    }
                }
                // Урон ботам
                if (this.enemyTanks) {
                    for (const enemy of this.enemyTanks) {
                        if (enemy && enemy.isAlive && enemy.chassis) {
                            const dist = Vector3.Distance(enemy.chassis.absolutePosition, position);
                            if (dist < radius) {
                                const dmgFactor = 1 - (dist / radius);
                                const actualDamage = damage * dmgFactor;
                                enemy.takeDamage(actualDamage);
                            }
                        }
                    }
                }
                // Визуальный эффект
                if (this.effectsManager) {
                    this.effectsManager.createExplosion?.(position);
                }
                // Notification
                if (this.hud) {
                    this.hud.showNotification?.("💥 Топливный склад взорван!", "warning");
                }
            },
            onRadarPing: (poi, detectedPositions) => {
                logger.log(`[POI] Radar ping: ${detectedPositions.length} enemies detected`);
                // Achievement tracking
                if (this.achievementsSystem && detectedPositions.length > 0) {
                    this.achievementsSystem.updateProgress("radar_operator", detectedPositions.length);
                }
                // Notification
                if (this.hud && detectedPositions.length > 0) {
                    this.hud.showNotification?.(`📡 Обнаружено врагов: ${detectedPositions.length}`, "info");
                }
                // Play radar ping sound (subtle beep)
                if (this.soundManager && detectedPositions.length > 0) {
                    // Use a subtle hit sound for radar ping
                    this.soundManager.playHit?.("normal", poi.worldPosition);
                }
            },
            onBonusXP: (amount) => {
                if (this.playerProgression) {
                    const diffMul = this.getDifficultyRewardMultiplier();
                    const xp = Math.round(amount * diffMul);
                    this.playerProgression.addExperience(xp, "bonus");
                }
            },
            onBonusCredits: (amount) => {
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(amount);
                }
            }
        });
    }
    
    // Направление ботов к POI
    assignBotsToPOIs(): void {
        if (!this.chunkSystem || !this.enemyTanks || this.enemyTanks.length === 0) return;
        
        const poiSystem = this.chunkSystem.getPOISystem?.();
        if (!poiSystem) return;
        
        const allPOIs = poiSystem.getAllPOIs();
        if (allPOIs.length === 0) return;
        
        // Находим незахваченные POI
        const unownedPOIs = allPOIs.filter(poi => poi.ownerId !== "enemy" && poi.capturable);
        if (unownedPOIs.length === 0) return;
        
        // Назначаем 30% ботов на захват POI
        const botsForPOI = Math.floor(this.enemyTanks.length * 0.3);
        let assigned = 0;
        
        for (const enemy of this.enemyTanks) {
            if (assigned >= botsForPOI) break;
            if (!enemy || !enemy.isAlive || !enemy.chassis) continue;
            
            // Проверяем текущее состояние бота
            const currentState = enemy.getState?.();
            if (currentState === "attack" || currentState === "chase") continue;
            
            // Находим ближайший незахваченный POI
            const enemyPos = enemy.chassis.absolutePosition;
            let nearestPOI = null;
            let nearestDist = Infinity;
            
            for (const poi of unownedPOIs) {
                const dist = Vector3.Distance(enemyPos, poi.worldPosition);
                if (dist < nearestDist && dist < 500) { // Макс 500м
                    nearestDist = dist;
                    nearestPOI = poi;
                }
            }
            
            if (nearestPOI) {
                enemy.setPOITarget?.({
                    position: nearestPOI.worldPosition,
                    type: nearestPOI.type,
                    id: nearestPOI.id
                });
                assigned++;
            }
        }
    }
    
    // Обновление системы POI
    updatePOISystem(deltaTime: number): void {
        if (!this.chunkSystem || !this.tank || !this.tank.chassis) return;
        
        const poiSystem = this.chunkSystem.getPOISystem?.();
        if (!poiSystem) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        
        // Собираем позиции всех врагов
        const enemyPositions: Vector3[] = [];
        if (this.enemyTanks) {
            for (const enemy of this.enemyTanks) {
                if (enemy && enemy.isAlive && enemy.chassis) {
                    enemyPositions.push(enemy.chassis.absolutePosition);
                }
            }
        }
        
        // Обновляем POI систему
        poiSystem.update(playerPos, enemyPositions, deltaTime);
        
        // Обновляем POI на миникарте
        if (this.hud && this._updateTick % 4 === 0) {
            const allPOIs = poiSystem.getAllPOIs();
            const tankRotation = this.tank.turret?.rotation.y || this.tank.chassis.rotation.y;
            
            // Данные для миникарты
            const minimapPOIs = allPOIs.map(poi => ({
                id: poi.id,
                type: poi.type,
                worldPosition: { x: poi.worldPosition.x, z: poi.worldPosition.z },
                ownerId: poi.ownerId,
                captureProgress: poi.captureProgress
            }));
            
            this.hud.updateMinimapPOIs?.(
                minimapPOIs,
                { x: playerPos.x, z: playerPos.z },
                tankRotation
            );
            
            // 3D маркеры в мире
            if (this.scene.activeCamera) {
                const camera = this.scene.activeCamera;
                const engine = this.engine;
                
                const poi3DData = allPOIs.map(poi => {
                    const worldPos = poi.worldPosition.add(new Vector3(0, 10, 0)); // Над POI
                    const screenPos = Vector3.Project(
                        worldPos,
                        Matrix.Identity(),
                        this.scene.getTransformMatrix(),
                        camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
                    );
                    
                    // Проверяем видимость (перед камерой)
                    const toCamera = camera.position.subtract(worldPos);
                    const cameraForward = camera.getForwardRay().direction;
                    const dot = Vector3.Dot(toCamera.normalize(), cameraForward);
                    const visible = dot < 0; // POI перед камерой
                    
                    return {
                        id: poi.id,
                        type: poi.type,
                        screenX: screenPos.x - engine.getRenderWidth() / 2,
                        screenY: screenPos.y,
                        distance: Vector3.Distance(playerPos, poi.worldPosition),
                        ownerId: poi.ownerId,
                        captureProgress: poi.captureProgress,
                        visible
                    };
                });
                
                this.hud.updatePOI3DMarkers?.(poi3DData);
            }
            
            // Показываем прогресс захвата ближайшего POI
            const nearbyPOI = poiSystem.getNearbyPOI(playerPos, 20);
            if (nearbyPOI && nearbyPOI.capturable && nearbyPOI.ownerId !== "player") {
                this.hud.showPOICaptureProgress?.(nearbyPOI.type, nearbyPOI.captureProgress, nearbyPOI.contested);
            } else {
                this.hud.hidePOICaptureProgress?.();
            }
        }
    }
    
    update() {
        if (!this.scene || !this.engine) return;
        
        // Счётчик кадров
        this._updateTick++;
        if (this._updateTick > 1000000) this._updateTick = 0;
        
        // Delta time для анимаций
        const deltaTime = this.engine.getDeltaTime() / 1000;
        
        // === ОБНОВЛЕНИЕ FPS КАЖДЫЙ КАДР ===
        // FPS обновляем каждый кадр для точности и плавности отображения
        if (this.hud) {
            const deltaTimeMs = this.engine.getDeltaTime();
            let fps = this.engine.getFps();
            if (!isFinite(fps) || fps <= 0) {
                if (deltaTimeMs > 0) {
                    fps = 1000 / deltaTimeMs;
                } else {
                    fps = 0;
                }
            }
            this.hud.updateFPS(fps, deltaTimeMs);
        }
        
        // === ЦЕНТРАЛИЗОВАННЫЕ ОБНОВЛЕНИЯ АНИМАЦИЙ ===
        // Обновляем анимации с разной частотой для оптимизации
        
        // HUD анимации (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.hud) {
            this.hud.updateAnimations(deltaTime);
            
            // Update Battle Royale visualizer animation
            if (this.battleRoyaleVisualizer) {
                this.battleRoyaleVisualizer.update(deltaTime);
            }
            
            // Update fuel indicator
            if (this.tank) {
                this.hud.updateFuel?.(this.tank.currentFuel, this.tank.maxFuel);
            }
            
            // Update tracer count (через updateTracerCount для обратной совместимости)
            if (this.tank) {
                this.hud.updateTracerCount?.(this.tank.getTracerCount(), this.tank.getMaxTracerCount());
            }
            
            // Update arsenal (все типы снарядов)
            if (this.tank && this.hud.updateArsenal) {
                const ammoData = new Map<string, { current: number, max: number }>();
                
                // Трассеры (реальные данные)
                ammoData.set("tracer", {
                    current: this.tank.getTracerCount(),
                    max: this.tank.getMaxTracerCount()
                });
                
                // Остальные типы (заглушки - будут реализованы позже)
                ammoData.set("ap", { current: 0, max: 0 });      // Обычные
                ammoData.set("apcr", { current: 0, max: 0 });  // Бронебойные
                ammoData.set("he", { current: 0, max: 0 });    // Фугасные
                ammoData.set("apds", { current: 0, max: 0 });  // Подкалиберные
                
                this.hud.updateArsenal(ammoData);
            }
            
            // Update missions panel (every 60 frames ~1 second)
            if (this._updateTick % 60 === 0 && this.missionSystem) {
                const activeMissions = this.missionSystem.getActiveMissions();
                const missionData = activeMissions.map(m => ({
                    id: m.mission.id,
                    name: this.missionSystem!.getName(m.mission),
                    description: this.missionSystem!.getDescription(m.mission),
                    icon: m.mission.icon,
                    current: m.progress.current,
                    requirement: m.mission.requirement,
                    completed: m.progress.completed,
                    claimed: m.progress.claimed,
                    type: m.mission.type
                }));
                this.hud.updateMissions?.(missionData);
            }
            
            // Update survival achievements and missions
            if (this.tank) {
                if (this.tank.isAlive) {
                    const survivalTime = (Date.now() - this.survivalStartTime) / 1000;
                    
                    // Achievements
                    if (this.achievementsSystem) {
                        // Survivor achievement (5 minutes = 300 seconds)
                        this.achievementsSystem.setProgress("survivor", Math.floor(survivalTime));
                        
                        // Iron will achievement (survive with HP below 10%)
                        const hpPercent = this.tank.currentHealth / this.tank.maxHealth;
                        if (hpPercent < 0.1 && hpPercent > 0) {
                            this.achievementsSystem.updateProgress("iron_will", 1);
                        }
                    }
                    
                    // Missions
                    if (this.missionSystem) {
                        this.missionSystem.setProgress("survive", Math.floor(survivalTime));
                    }
                } else if (this.lastDeathTime === 0 || Date.now() - this.lastDeathTime > 1000) {
                    // Tank just died - reset survival timer on respawn
                    this.lastDeathTime = Date.now();
                }
                
                // Reset survival timer when tank respawns
                if (this.tank.isAlive && this.lastDeathTime > 0) {
                    this.survivalStartTime = Date.now();
                    this.lastDeathTime = 0;
                }
            }
        }
        
        // Chat system анимации (каждые 4 кадра для оптимизации)
        if (this._updateTick % 4 === 0 && this.chatSystem) {
            this.chatSystem.update(deltaTime);
        }
        
        // Multiplayer updates
        if (this.isMultiplayer && this.multiplayerManager) {
            this.updateMultiplayer(deltaTime);
            this.checkSpectatorMode();
        }
        
        // Анимация припасов на карте (каждые 3 кадра для оптимизации) - УЛУЧШЕНО
        if (this._updateTick % 3 === 0 && this.chunkSystem) {
            this.chunkSystem.updateConsumablesAnimation(deltaTime);
        }
        
        // УЛУЧШЕНО: Обновление турелей (каждые 3 кадра для оптимизации - баланс между производительностью и отзывчивостью)
        if (this._updateTick % 3 === 0 && this.enemyManager) {
            this.enemyManager.update();
        }
        
        // 1. Камера (каждые 2 кадра для оптимизации)
        // КРИТИЧЕСКИ ВАЖНО: Обновляем камеру и в основном цикле, и в onAfterPhysicsObservable
        // Это гарантирует, что камера работает даже если физика еще не запустилась
        // Обновляем камеру если игра инициализирована ИЛИ запущена (для первого кадра)
        if (this._updateTick % 2 === 0 && (this.gameInitialized || this.gameStarted) && !this.gamePaused) {
            this.updateCamera();
        }
        
        // 2. Chunk system (каждые 5 кадров для оптимизации, кэшируем позицию) - УЛУЧШЕНО
        // КРИТИЧЕСКИ ВАЖНО: Уменьшена частота обновления для предотвращения тряски и лагов
        if (this._updateTick % 5 === 0 && this.chunkSystem && this.tank && this.tank.chassis) {
            // Кэшируем позицию танка для избежания повторных вызовов getAbsolutePosition
            // Используем position вместо absolutePosition для лучшей производительности
            if (this._tankPositionCacheFrame !== this._updateTick) {
                this._cachedTankPosition.copyFrom(this.tank.chassis.position);
                this._tankPositionCacheFrame = this._updateTick;
            }
            this.chunkSystem.update(this._cachedTankPosition);
        }
        
        // 3. HUD - скорость и координаты (каждые 3 кадра для оптимизации)
        if (this._updateTick % 3 === 0 && this.hud && this.tank && this.tank.chassis) {
            if (this.tank.physicsBody) {
                const vel = this.tank.physicsBody.getLinearVelocity();
                if (vel) {
                    // Используем квадрат длины для избежания sqrt
                    const speedSq = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
                    this.hud.setSpeed(Math.sqrt(speedSq));
                }
            }
            // Используем кэшированную позицию (position вместо absolutePosition для производительности)
            if (this._tankPositionCacheFrame !== this._updateTick) {
                this._cachedTankPosition.copyFrom(this.tank.chassis.position);
                this._tankPositionCacheFrame = this._updateTick;
            }
            this.hud.setPosition(this._cachedTankPosition.x, this._cachedTankPosition.z);
        }
        
        // 4. Reload bar (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.hud) {
            this.hud.updateReload();
        }
        
        // 4.1. Обновление кулдаунов модулей (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.hud) {
            this.hud.updateModuleCooldowns();
            // Примечание: Обновление кулдаунов модулей из tankController отключено,
            // так как методы getModuleCooldown и isModuleActive еще не реализованы
        }
        
        // 4.8. Обновление Stats Overlay в реальном времени (каждые 6 кадров для оптимизации)
        if (this._updateTick % 6 === 0 && this.statsOverlayVisible && this.statsOverlay) {
            this.updateStatsOverlay();
            // Логирование для отладки (только каждые 60 кадров)
            const frameCount = (this as any).frameCount || 0;
            if (loggingSettings.getLevel() >= LogLevel.DEBUG && frameCount % 60 === 0) {
                logger.debug(`[GAME] Frame ${frameCount} | FPS: ${this.engine.getFps().toFixed(1)}`);
            }
            (this as any).frameCount = (frameCount + 1);
        }
        
        // 4.9. Периодическое обновление центральной шкалы опыта в HUD (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.hud && this.playerProgression) {
            const xpProgress = this.playerProgression.getExperienceProgress();
            this.hud.updateCentralXp(xpProgress.current, xpProgress.required, this.playerProgression.getLevel());
        }
        
        // 4.10. Обновление индикатора комбо (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.hud && this.experienceSystem) {
            const comboCount = this.experienceSystem.getComboCount();
            this.hud.updateComboIndicator(comboCount);
        }
        
        // 4.5. Дальность стрельбы в режиме прицеливания (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.isAiming && this.hud && this.tank) {
            const barrelHeight = this.tank.barrel ? this.tank.barrel.getAbsolutePosition().y : 2.5;
            this.hud.setAimRange(this.aimPitch, this.tank.projectileSpeed, barrelHeight);
        }
        
        // 4.6. Проверка видимости танка игрока за стенами (каждые 8 кадров для оптимизации)
        if (this._updateTick % 8 === 0 && this.tank && this.tank.chassis && this.camera) {
            this.checkPlayerTankVisibility();
        }
        // Плавная интерполяция видимости каждые 2 кадра (для оптимизации)
        if (this._updateTick % 2 === 0 && this.tank && this.tank.chassis && this.tank.turret && this.tank.barrel) {
            // Плавная интерполяция видимости каждый кадр (даже без проверки)
            const lerpSpeed = 0.15;
            if (this.tankVisibilityTarget) {
                this.tankVisibilitySmooth = Math.min(1.0, this.tankVisibilitySmooth + lerpSpeed);
            } else {
                this.tankVisibilitySmooth = Math.max(0.0, this.tankVisibilitySmooth - lerpSpeed);
            }
            
            // Применяем плавную видимость (включая гусеницы)
            if (this.tankVisibilitySmooth > 0.1) {
                const visibility = 0.7 + (1.0 - 0.7) * (1.0 - this.tankVisibilitySmooth);
                this.tank.chassis.renderingGroupId = 3;
                this.tank.turret.renderingGroupId = 3;
                this.tank.barrel.renderingGroupId = 3;
                this.tank.chassis.visibility = visibility;
                this.tank.turret.visibility = visibility;
                this.tank.barrel.visibility = visibility;
                
                // Гусеницы тоже подсвечиваем
                if (this.tank.leftTrack) {
                    this.tank.leftTrack.renderingGroupId = 3;
                    this.tank.leftTrack.visibility = visibility;
                }
                if (this.tank.rightTrack) {
                    this.tank.rightTrack.renderingGroupId = 3;
                    this.tank.rightTrack.visibility = visibility;
                }
            } else {
                this.tank.chassis.renderingGroupId = 0;
                this.tank.turret.renderingGroupId = 0;
                this.tank.barrel.renderingGroupId = 0;
                this.tank.chassis.visibility = 1.0;
                this.tank.turret.visibility = 1.0;
                this.tank.barrel.visibility = 1.0;
                
                // Гусеницы тоже видимы
                if (this.tank.leftTrack) {
                    this.tank.leftTrack.renderingGroupId = 0;
                    this.tank.leftTrack.visibility = 1.0;
                }
                if (this.tank.rightTrack) {
                    this.tank.rightTrack.renderingGroupId = 0;
                    this.tank.rightTrack.visibility = 1.0;
                }
            }
        }
        
        // 4.7. Скрытие башен врагов когда они не видны (каждые 6 кадров для оптимизации)
        if (this._updateTick % 6 === 0 && this.enemyTanks) {
            this.updateEnemyTurretsVisibility();
        }
        
        // 5. Компас и радар (каждые 3 кадра для оптимизации)
        if (this._updateTick % 3 === 0 && this.hud && this.tank && this.tank.chassis && this.tank.turret) {
            let chassisY = this.tank.chassis.rotationQuaternion 
                ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                : this.tank.chassis.rotation.y;
            let turretY = this.tank.turret.rotation.y;
            let totalAngle = chassisY + turretY;
            while (totalAngle < 0) totalAngle += Math.PI * 2;
            while (totalAngle >= Math.PI * 2) totalAngle -= Math.PI * 2;
            this.hud.setDirection(totalAngle);
            
            // Показываем направление башни над радаром
            this.hud.setMovementDirection(totalAngle);
            
            // Радар с врагами
            const playerPos = this.tank.chassis.absolutePosition;
            const enemies: {x: number, z: number, alive: boolean}[] = [];
            
            // ОПТИМИЗАЦИЯ: Используем обычные for циклы вместо forEach
            // Добавляем танки врагов
            if (this.enemyTanks) {
                for (let i = 0; i < this.enemyTanks.length; i++) {
                    const t = this.enemyTanks[i];
                    if (t && t.isAlive && t.chassis && !t.chassis.isDisposed()) {
                        enemies.push({
                            x: t.chassis.absolutePosition.x,
                            z: t.chassis.absolutePosition.z,
                            alive: true
                        });
                    }
                }
            }
            
            // Добавляем турели
            if (this.enemyManager && this.enemyManager.turrets) {
                const turrets = this.enemyManager.turrets;
                for (let i = 0; i < turrets.length; i++) {
                    const t = turrets[i];
                    if (t && t.isAlive && t.base && !t.base.isDisposed()) {
                        const pos = t.base.absolutePosition || t.base.position;
                        if (pos) {
                            enemies.push({
                                x: pos.x,
                                z: pos.z,
                                alive: true
                            });
                        }
                    }
                }
            }
            
            // КРИТИЧЕСКИ ВАЖНО: Обновляем радар с правильными углами
            this.hud.updateMinimap(enemies, playerPos, chassisY, totalAngle, this.isAiming);
            
            // Обновляем компас с врагами
            this.hud.updateCompassEnemies(enemies, playerPos, totalAngle);
        }
        
        // 6. 3D audio (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.soundManager && this.scene.activeCamera) {
            // Кэшируем позицию камеры
            if (this._cameraPositionCacheFrame !== this._updateTick) {
                this._cachedCameraPosition.copyFrom(this.scene.activeCamera.position);
                this._cameraPositionCacheFrame = this._updateTick;
            }
            const camPos = this._cachedCameraPosition;
            const forward = this.scene.activeCamera.getForwardRay().direction;
            const up = this.scene.activeCamera.upVector || Vector3.Up();
            this.soundManager.updateListenerPosition(camPos, forward, up);
        }
        
        // 7. Garage respawn timers (используем deltaTime в миллисекундах)
        const deltaTimeMs = this.engine.getDeltaTime();
        if (deltaTimeMs > 0 && deltaTimeMs < 1000) {
            this.updateGarageRespawnTimers(deltaTimeMs);
        }
        
        // 7.5. Garage doors - открытие/закрытие при приближении танков
        if (this._updateTick % 4 === 0) { // Каждые 4 кадра для оптимизации
            this.updateGarageDoors();
            this.updateGarageWallsTransparency();
            this.updateGarageCapture(deltaTime);
        }
        
        // 7.6. POI System - обновление точек интереса
        if (this._updateTick % 2 === 0) { // Каждые 2 кадра
            this.updatePOISystem(deltaTime);
        }
        
        // 7.7. Направляем ботов к POI периодически
        if (this._updateTick % 300 === 0) { // Каждые ~5 секунд
            this.assignBotsToPOIs();
        }
        
        // 8. Enemy tanks - оптимизированное обновление с улучшенной LOD системой
        if (this.tank && this.tank.chassis && this.enemyTanks && this.enemyTanks.length > 0) {
            this.tank.setEnemyTanks(this.enemyTanks);
            // Используем кэшированную позицию игрока (position вместо absolutePosition для производительности)
            if (this._tankPositionCacheFrame !== this._updateTick) {
                this._cachedTankPosition.copyFrom(this.tank.chassis.position);
                this._tankPositionCacheFrame = this._updateTick;
            }
            const playerPos = this._cachedTankPosition;
            const playerX = playerPos.x;
            const playerZ = playerPos.z;
            
            // Используем обычный for цикл для лучшей производительности
            const enemyCount = this.enemyTanks.length;
            for (let i = 0; i < enemyCount; i++) {
                const enemy = this.enemyTanks[i];
                if (!enemy || !enemy.isAlive || !enemy.chassis) continue;
                
                const enemyPos = enemy.chassis.absolutePosition;
                // Используем квадрат расстояния для избежания sqrt
                const dx = enemyPos.x - playerX;
                const dz = enemyPos.z - playerZ;
                const distanceSq = dx * dx + dz * dz;
                
                // Оптимизация: отключаем AI полностью для врагов > 500м (250000 в квадрате) - уменьшено для производительности
                if (distanceSq > 250000) {
                    // Слишком далеко - не обновляем вообще
                    continue;
                }
                
                // Улучшенная LOD система (используем квадраты расстояний):
                if (distanceSq < 90000) { // < 300м (300^2 = 90000)
                    // < 300м: полное обновление каждый кадр
                    enemy.update();
                } else if (distanceSq < 250000) { // 300-500м (500^2 = 250000)
                    // 300-500м: каждые 2 кадра
                    if (this._updateTick % 2 === 0) {
                        enemy.update();
                    }
                } else if (distanceSq < 490000) { // 500-700м (700^2 = 490000)
                    // 500-700м: каждые 4 кадра
                    if (this._updateTick % 4 === 0) {
                        enemy.update();
                    }
                } else {
                    // 700-800м: каждые 8 кадров (только позиция)
                    if (this._updateTick % 8 === 0) {
                        enemy.update();
                    }
                }
            }
            
            // УЛУЧШЕНО: Обновление AI Coordinator для групповой тактики
            if (this.aiCoordinator && this.tank && this.tank.chassis) {
                // Обновляем позицию игрока в координаторе
                this.aiCoordinator.updatePlayerPosition(this.tank.chassis.absolutePosition);
                
                // Обновляем координатор (каждые 2 кадра для оптимизации)
                if (this._updateTick % 2 === 0) {
                    this.aiCoordinator.update();
                }
            }
            
            // УЛУЧШЕНО: Обновление Performance Optimizer для LOD и culling
            if (this.performanceOptimizer && this.tank && this.tank.chassis) {
                // Обновляем позицию референса (игрок)
                this.performanceOptimizer.setReferencePosition(this.tank.chassis.absolutePosition);
                
                // Обновляем оптимизатор (каждые 4 кадра для оптимизации)
                if (this._updateTick % 4 === 0) {
                    this.performanceOptimizer.update();
                }
            }
        }

        // 9. Aiming system (каждые 4 кадра для оптимизации)
        if (this.aimingSystem && this._updateTick % 4 === 0) {
            const enemyTurrets = this.enemyManager?.turrets || [];
            this.aimingSystem.setEnemies(this.enemyTanks, enemyTurrets);
            this.aimingSystem.update();
        }
        
        // 9.5. HUD update (каждые 2 кадра для оптимизации)
        // ПРИМЕЧАНИЕ: Радар обновляется в блоке "5" выше, поэтому здесь только дополнительные обновления
        if (this._updateTick % 2 === 0) {
            // Обновляем HUD, включая FPS мониторинг
            this.updateHUD();
        }
        
        // Обновляем индикатор цели в HUD (под компасом) - оптимизировано с ранними выходами
        // ТОЛЬКО если враг на линии огня (не просто в поле зрения), виден через raycast и < 500м
        // Обновляем каждые 2 кадра для оптимизации
        if (this._updateTick % 2 === 0 && this.hud && this.tank && this.tank.barrel && this.aimingSystem) {
            const target = this.aimingSystem.getTarget();
            
            // Ранний выход: нет цели или слишком далеко
            if (!target || !target.mesh || target.distance >= 500) {
                this.hud.updateTargetIndicator(null);
            } else {
                const barrelPos = this.tank.barrel.getAbsolutePosition();
                const barrelDir = this.tank.barrel.getDirection(Vector3.Forward());
                // Оптимизированная нормализация
                const barrelDirLenSq = barrelDir.x * barrelDir.x + barrelDir.y * barrelDir.y + barrelDir.z * barrelDir.z;
                if (barrelDirLenSq > 0.000001) {
                    const barrelDirLen = Math.sqrt(barrelDirLenSq);
                    barrelDir.scaleInPlace(1 / barrelDirLen);
                }
                const targetPos = target.mesh.absolutePosition || target.mesh.position;
                
                // Ранний выход: проверка угла без создания нового вектора
                const toTargetX = targetPos.x - barrelPos.x;
                const toTargetY = targetPos.y - barrelPos.y;
                const toTargetZ = targetPos.z - barrelPos.z;
                const toTargetLenSq = toTargetX * toTargetX + toTargetY * toTargetY + toTargetZ * toTargetZ;
                if (toTargetLenSq < 0.000001) {
                    this.hud.updateTargetIndicator(null);
                } else {
                    const toTargetLen = Math.sqrt(toTargetLenSq);
                    const toTargetNormX = toTargetX / toTargetLen;
                    const toTargetNormZ = toTargetZ / toTargetLen;
                    const dot = barrelDir.x * toTargetNormX + barrelDir.z * toTargetNormZ;
                    
                    // Проверяем угол - должен быть в поле зрения (< 30 градусов)
                    if (dot < 0.866) { // cos(30°) ≈ 0.866
                        this.hud.updateTargetIndicator(null);
                    } else {
                        // Проверяем видимость через raycast от ствола к цели (с кэшированием)
                        let isVisible = false;
                        const currentFrame = this._updateTick;
                        
                        // Проверяем кэш
                        if (this.targetRaycastCache && (currentFrame - this.targetRaycastCache.frame) < this.TARGET_RAYCAST_CACHE_FRAMES) {
                            isVisible = this.targetRaycastCache.result;
                        } else {
                            // Выполняем raycast только если кэш устарел
                            const ray = new Ray(barrelPos, barrelDir, target.distance + 5);
                            const pick = this.scene.pickWithRay(ray, (mesh) => {
                                // Ранний выход: проверки в порядке частоты
                                if (!mesh || !mesh.isEnabled() || !mesh.isPickable || mesh.visibility <= 0.5) return false;
                                if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                                const meta = mesh.metadata;
                                if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
                                // Проверяем что это не сам враг
                                if (target.mesh && (mesh === target.mesh || mesh.parent === target.mesh || target.mesh.parent === mesh)) return false;
                                return true;
                            });
                            
                            // Показываем только если raycast попал в цель или ничего не попал (цель видна)
                            isVisible = !pick || !pick.hit || (pick.pickedMesh === target.mesh || pick.pickedMesh?.parent === target.mesh);
                            
                            // Сохраняем в кэш
                            this.targetRaycastCache = { result: isVisible, frame: currentFrame };
                        }
                        
                        if (isVisible) {
                            this.hud.updateTargetIndicator({
                                name: target.name,
                                type: target.type,
                                health: target.health,
                                maxHealth: target.maxHealth,
                                distance: target.distance
                            });
                        } else {
                            this.hud.updateTargetIndicator(null);
                        }
                    }
                }
            }
        }
        
        // Update player progression (auto-save and play time tracking) - каждую секунду
        if (this.playerProgression) {
            // Используем уже вычисленный deltaTime из начала функции
            this.playerProgression.recordPlayTime(deltaTime);
            if (this._updateTick % 60 === 0) {
                this.playerProgression.autoSave();
            }
        }
        
        // Флашим накопленный опыт (каждые 500мс)
        if (this.experienceSystem && this.tank) {
            if (this._updateTick % 30 === 0) { // Примерно каждые 500мс при 60 FPS
                this.experienceSystem.flushXpBatch();
            }
            // Обновляем время игры для опыта
            if (this.tank.chassisType && this.tank.cannonType) {
                this.experienceSystem.updatePlayTime(this.tank.chassisType.id, this.tank.cannonType.id);
            }
        } else if (this.experienceSystem && !this.tank) {
            // Флашим опыт даже если танк еще не создан (для опыта за время)
            if (this._updateTick % 30 === 0) {
                this.experienceSystem.flushXpBatch();
            }
        }
        
        // Проверка подбора припасов (каждые 3 кадра для оптимизации)
        if (this._updateTick % 3 === 0) {
            this.checkConsumablePickups();
        }
    }
    
    // Проверка подбора припасов
    private checkConsumablePickups(): void {
        if (!this.tank || !this.tank.chassis || !this.chunkSystem || !this.consumablesManager) return;
        if (!this.chunkSystem.consumablePickups || this.chunkSystem.consumablePickups.length === 0) return;
        
        // Используем кэшированную позицию
        if (this._tankPositionCacheFrame !== this._updateTick) {
            this._cachedTankPosition.copyFrom(this.tank.chassis.absolutePosition);
            this._tankPositionCacheFrame = this._updateTick;
        }
        const tankPos = this._cachedTankPosition;
        const pickupRadius = 2.0; // Радиус подбора
        const pickupRadiusSq = pickupRadius * pickupRadius; // Квадрат радиуса для оптимизации
        
        // Проверяем все припасы
        for (let i = this.chunkSystem.consumablePickups.length - 1; i >= 0; i--) {
            const pickup = this.chunkSystem.consumablePickups[i];
            const pickupAny = pickup as any;
            if (!pickup || !pickupAny.mesh || pickupAny.mesh.isDisposed()) {
                this.chunkSystem.consumablePickups.splice(i, 1);
                continue;
            }
            
            // Используем позицию МЕША, а не сохранённую позицию
            const pickupPos = pickupAny.mesh.absolutePosition || pickup.position;
            // Используем квадрат расстояния для избежания sqrt
            const dx = pickupPos.x - tankPos.x;
            const dz = pickupPos.z - tankPos.z;
            const distanceSq = dx * dx + dz * dz;
            
            if (distanceSq < pickupRadiusSq) {
                // Подбираем припас
                const consumableType = CONSUMABLE_TYPES.find(c => c.id === pickup.type);
                if (consumableType) {
                    // Ищем свободный слот (1-5)
                    let slot = -1;
                    for (let s = 1; s <= 5; s++) {
                        if (!this.consumablesManager.get(s)) {
                            slot = s;
                            break;
                        }
                    }
                    
                    if (slot > 0) {
                        // In multiplayer, request pickup from server
                        if (this.isMultiplayer && this.multiplayerManager) {
                            const consumableId = (pickupAny.mesh.metadata as any)?.consumableId || 
                                                 `consumable_${pickupAny.mesh.position.x}_${pickupAny.mesh.position.z}`;
                            this.multiplayerManager.requestConsumablePickup(
                                consumableId,
                                pickup.type,
                                { x: pickupAny.mesh.position.x, y: pickupAny.mesh.position.y, z: pickupAny.mesh.position.z }
                            );
                            // Wait for server confirmation before picking up
                            continue;
                        }
                        
                        // Single player: pick up immediately
                        // Подбираем в свободный слот
                        this.consumablesManager.pickUp(consumableType, slot);
                        
                        // Удаляем припас с карты
                        pickupAny.mesh.dispose();
                        this.chunkSystem.consumablePickups.splice(i, 1);
                        
                        // Обновляем HUD и System Terminal
                        if (this.chatSystem) {
                            this.chatSystem.updateConsumables(this.consumablesManager.getAll());
                            this.chatSystem.success(`Подобран: ${consumableType.icon} ${consumableType.name} (слот ${slot})`);
                        }
                        if (this.hud) {
                            this.hud.updateConsumables(this.consumablesManager.getAll());
                        }
                        
                        // Звуковой эффект подбора
                        if (this.soundManager) {
                            this.soundManager.playPickup();
                        }
                        
                        // Визуальный эффект подбора
                        if (this.effectsManager) {
                            const color = Color3.FromHexString(consumableType.color);
                            this.effectsManager.createPickupEffect(pickup.position, color, pickup.type);
                        }
                        
                        // Записываем опыт за подбор припаса
                        if (this.experienceSystem && this.tank) {
                            this.experienceSystem.recordPickup(this.tank.chassisType.id);
                        }
                        
                        logger.log(`[Game] Picked up ${consumableType.name} in slot ${slot}`);
                    } else {
                        // Все слоты заняты - заменяем первый
                        // In multiplayer, request pickup from server
                        if (this.isMultiplayer && this.multiplayerManager) {
                            const consumableId = (pickupAny.mesh.metadata as any)?.consumableId || 
                                                 `consumable_${pickupAny.mesh.position.x}_${pickupAny.mesh.position.z}`;
                            this.multiplayerManager.requestConsumablePickup(
                                consumableId,
                                pickup.type,
                                { x: pickupAny.mesh.position.x, y: pickupAny.mesh.position.y, z: pickupAny.mesh.position.z }
                            );
                            continue;
                        }
                        
                        // Single player: pick up immediately
                        this.consumablesManager.pickUp(consumableType, 1);
                        pickupAny.mesh.dispose();
                        this.chunkSystem.consumablePickups.splice(i, 1);
                        
                        if (this.chatSystem) {
                            this.chatSystem.updateConsumables(this.consumablesManager.getAll());
                            this.chatSystem.success(`Подобран: ${consumableType.icon} ${consumableType.name} (заменён слот 1)`);
                        }
                        if (this.hud) {
                            this.hud.updateConsumables(this.consumablesManager.getAll());
                        }
                        
                        if (this.soundManager) {
                            this.soundManager.playPickup();
                        }
                        
                        // Записываем опыт за подбор припаса
                        if (this.experienceSystem && this.tank) {
                            this.experienceSystem.recordPickup(this.tank.chassisType.id);
                        }
                        
                        logger.log(`[Game] Picked up ${consumableType.name} (replaced slot 1)`);
                    }
                }
            }
        }
    }

    // Aim mode variables
    isAiming = false;
    aimingTransitionProgress = 0.0; // 0.0 = обычный режим, 1.0 = полный режим прицеливания
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
    aimMaxMouseSpeed = 25; // Максимальная скорость движения мыши (пиксели за кадр) - одинаковая для обеих осей
    aimPitchSmoothing = 0.12; // Коэффициент сглаживания для вертикального прицеливания (улучшено для плавности)
    aimYawSmoothing = 0.18; // Коэффициент сглаживания для горизонтального прицеливания (для плавности)
    targetAimPitch = 0; // Целевой угол вертикального прицеливания (для плавной интерполяции)
    targetAimYaw = 0; // Целевой угол горизонтального прицеливания (для плавной интерполяции)
    isPointerLocked = false; // Флаг блокировки указателя
    private altKeyPressed = false; // Флаг зажатия Alt для pointer lock
    aimYaw = 0; // Горизонтальный поворот прицела
    aimPitch = 0; // Вертикальный поворот прицела
    
    // === ЗУМ В РЕЖИМЕ ПРИЦЕЛИВАНИЯ ===
    aimZoom = 0; // Текущий зум (0x - 4x), 0 = без зума
    minZoom = 0; // Минимальный зум (без приближения)
    maxZoom = 4.0; // Максимальный зум
    zoomStep = 0.5; // Шаг изменения зума
    
    // === НОВАЯ СИСТЕМА: Камера независима от башни ===
    cameraYaw = 0; // Угол камеры (горизонтальный) - мышь всегда управляет этим
    isFreeLook = false; // Shift зажат - свободный обзор без поворота башни
    mouseSensitivity = 0.003; // Обычная чувствительность мыши
    
    // Виртуальная точка для фиксации башни
    virtualTurretTarget: Vector3 | null = null; // Мировая точка направления башни
    lastMouseControlTime = 0; // Время последнего управления мышкой
    lastChassisRotation = 0; // Последний угол корпуса для отслеживания поворота
    
    // Вычисляет дальность полёта снаряда для заданного угла
    public calculateProjectileRange(pitch: number, projectileSpeed: number, barrelHeight: number): number {
        const gravity = 9.81;
        const dt = 0.02;
        const maxTime = 10;
        
        let x = 0;
        let y = barrelHeight;
        const vx = projectileSpeed * Math.cos(pitch);
        let vy = projectileSpeed * Math.sin(pitch);
        
        let time = 0;
        while (y > 0 && time < maxTime) {
            x += vx * dt;
            y += vy * dt;
            vy -= gravity * dt;
            time += dt;
        }
        
        return Math.max(0, x);
    }
    
    // Находит максимальный угол прицеливания для заданной дальности
    private findMaxPitchForRange(targetRange: number, projectileSpeed: number, barrelHeight: number): number {
        // Бинарный поиск максимального угла
        let minPitch = -Math.PI / 12; // -15 градусов
        let maxPitch = 0;               // 0 градусов (горизонтально)
        let bestPitch = 0;
        
        // Ищем угол, при котором дальность максимально близка к targetRange, но не превышает её
        for (let i = 0; i < 20; i++) {
            const testPitch = (minPitch + maxPitch) / 2;
            const range = this.calculateProjectileRange(testPitch, projectileSpeed, barrelHeight);
            
            if (range <= targetRange) {
                bestPitch = testPitch;
                minPitch = testPitch; // Можно увеличить угол
            } else {
                maxPitch = testPitch; // Нужно уменьшить угол
            }
        }
        
        return bestPitch;
    }
    
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
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:6254',message:'Before requestPointerLock (Alt key)',data:{canvasExists:!!canvas,canvasOwnerDocument:canvas.ownerDocument?.location?.href,canvasInBody:document.body.contains(canvas),isConnected:canvas.isConnected,currentLockElement:document.pointerLockElement?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        try {
                            // requestPointerLock может вернуть Promise или void в зависимости от браузера
                            const lockResult: any = canvas.requestPointerLock();
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:6257',message:'requestPointerLock called',data:{hasResult:!!lockResult,isPromise:lockResult?.then !== undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                            // #endregion
                            if (lockResult && typeof lockResult === 'object' && typeof lockResult.then === 'function') {
                                lockResult.then(() => {
                                    logger.log("[Game] Pointer lock activated via Alt key");
                                    // Визуальная индикация
                                    if (this.hud) {
                                        this.hud.showMessage("🖱️ Игровой курсор включен (Alt)", "#0f0", 2000);
                                    }
                                }).catch((err: Error) => {
                                    // #region agent log
                                    fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:6265',message:'Pointer lock promise rejected',data:{errorName:err.name,errorMessage:err.message,errorStack:err.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                    // #endregion
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
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:6275',message:'Pointer lock exception caught',data:{errorName:(err as Error).name,errorMessage:(err as Error).message,errorStack:(err as Error).stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                            // #endregion
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
                this.hideStatsOverlay();
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
                // === ЗУМ В РЕЖИМЕ ПРИЦЕЛИВАНИЯ ===
                if (evt.deltaY < 0) {
                    // Scroll up - увеличить зум
                    this.aimZoom = Math.min(this.maxZoom, this.aimZoom + this.zoomStep);
                } else {
                    // Scroll down - уменьшить зум
                    this.aimZoom = Math.max(this.minZoom, this.aimZoom - this.zoomStep);
                }
                // Обновляем HUD с текущим зумом
                if (this.hud) {
                    this.hud.setZoomLevel(this.aimZoom);
                }
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
            if (!this.isPointerLocked) return;
            
            if (evt.movementX !== undefined) {
                // В режиме прицеливания ограничиваем максимальную скорость движения мыши
                let movementX = evt.movementX;
                let movementY = evt.movementY || 0;
                
                if (this.isAiming) {
                    // Ограничиваем скорость движения мыши одинаково для обеих осей
                    movementX = Math.max(-this.aimMaxMouseSpeed, Math.min(this.aimMaxMouseSpeed, movementX));
                    movementY = Math.max(-this.aimMaxMouseSpeed, Math.min(this.aimMaxMouseSpeed, movementY));
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
                        if (this.tank) {
                            const barrelHeight = this.tank.barrel ? this.tank.barrel.getAbsolutePosition().y : 2.5;
                            const maxRange = 999;
                            
                            // Вычисляем дальность для нового угла
                            const range = this.calculateProjectileRange(newPitch, this.tank.projectileSpeed, barrelHeight);
                            
                            // Если дальность превышает максимум, ограничиваем угол
                            if (range > maxRange) {
                                // Находим максимальный угол, при котором дальность = 999м
                                newPitch = this.findMaxPitchForRange(maxRange, this.tank.projectileSpeed, barrelHeight);
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
                if (this.hud && this.tank && this.tank.barrel) {
                    const barrelHeight = this.tank.barrel.getAbsolutePosition().y;
                    this.hud.setAimRange(0, this.tank.projectileSpeed, barrelHeight);
                }
            } else {
                // === ВЫХОД ИЗ РЕЖИМА ПРИЦЕЛИВАНИЯ ===
                // НЕ сбрасываем aimYaw - башня остаётся в текущем положении!
                // Только сбрасываем pitch и zoom
                this.aimPitch = 0;
                this.targetAimPitch = 0; // Сбрасываем целевой угол
                this.targetAimYaw = this.aimYaw; // Сохраняем текущий угол для плавного перехода
                this.aimZoom = 0; // Сброс зума на 0 (без приближения)
                
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
            // Q/E управление: в режиме прицеливания - вертикальная ось прицеливания, иначе - наклон камеры
            if (this.isAiming) {
                // В режиме прицеливания: Q/E управляют вертикальной осью прицеливания (aimPitch)
                // Используем ту же чувствительность, что и у мыши (с учетом зума)
                const zoomFactor = 1.0 / (1.0 + this.aimZoom * 0.3);
                const adaptiveVerticalSensitivity = this.aimMouseSensitivityVertical * zoomFactor;
                
                // Используем deltaTime для точной синхронизации скорости с мышью
                // Эмулируем движение мыши со скоростью ~300 пикселей в секунду (как при нормальном движении мыши)
                const deltaTime = this.engine.getDeltaTime() / 1000; // deltaTime в секундах
                const mousePixelsPerSecond = 300; // Скорость движения мыши в пикселях в секунду
                const mouseEquivalentPixels = mousePixelsPerSecond * deltaTime;
                const pitchSpeed = adaptiveVerticalSensitivity * mouseEquivalentPixels;
                
                let pitchDelta = 0;
                if (this._inputMap["KeyQ"]) pitchDelta -= pitchSpeed; // Q - вверх (увеличивает угол)
                if (this._inputMap["KeyE"]) pitchDelta += pitchSpeed; // E - вниз (уменьшает угол)
                
                if (pitchDelta !== 0) {
                    let newPitch = this.targetAimPitch + pitchDelta;
                    
                    // Ограничиваем угол так, чтобы дальность не превышала 999 метров
                    if (this.tank) {
                        const barrelHeight = this.tank.barrel ? this.tank.barrel.getAbsolutePosition().y : 2.5;
                        const maxRange = 999;
                        
                        // Вычисляем дальность для нового угла
                        const range = this.calculateProjectileRange(newPitch, this.tank.projectileSpeed, barrelHeight);
                        
                        // Если дальность превышает максимум, ограничиваем угол
                        if (range > maxRange) {
                            // Находим максимальный угол, при котором дальность = 999м
                            newPitch = this.findMaxPitchForRange(maxRange, this.tank.projectileSpeed, barrelHeight);
                        }
                    }
                    
                    // Применяем стандартные ограничения угла (-10° до +5°)
                    this.targetAimPitch = Math.max(-Math.PI / 18, Math.min(Math.PI / 36, newPitch));
                }
            } else {
                // Вне режима прицеливания: Q/E управляют наклоном камеры (как раньше)
                const tiltSpeed = 0.02;
                if (this._inputMap["KeyQ"]) this.normalBeta -= tiltSpeed;
                if (this._inputMap["KeyE"]) this.normalBeta += tiltSpeed;
                this.normalBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.normalBeta));
            }
            
            // Camera collision - предотвращаем заход камеры за текстуры
            this.adjustCameraForCollision();

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
                
                // SYNC aimPitch to tank controller for shooting
                if (this.tank) {
                    this.tank.aimPitch = this.aimPitch;
                }
                
                // Обновляем индикатор дальности в HUD
                if (this.hud && this.tank) {
                    const barrelHeight = this.tank.barrel ? this.tank.barrel.getAbsolutePosition().y : 2.5;
                    this.hud.setAimRange(this.aimPitch, this.tank.projectileSpeed, barrelHeight);
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
            
            // Плавное переключение камер
            if (t > 0.01) {
                // Переключаемся на aim камеру (когда прогресс > 1%)
                if (this.camera) {
                    this.camera.setEnabled(false);
                }
                if (this.aimCamera) {
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
                // CRITICAL: Force world matrix update BEFORE getting directions
                // This ensures barrel direction reflects latest turret rotation
                this.tank.chassis.computeWorldMatrix(true);
                this.tank.turret.computeWorldMatrix(true);
                this.tank.barrel.computeWorldMatrix(true);
                
                // Get BARREL direction from mesh - this is the ACTUAL direction the gun is pointing
                // barrel is child of turret, which is child of chassis
                // So getDirection returns world direction accounting for all rotations
                const barrelWorldDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
                
                // Barrel/muzzle world position
                const barrelPos = this.tank.barrel.getAbsolutePosition();
                const muzzlePos = barrelPos.add(barrelWorldDir.scale(1.6));
                
                // Calculate FULL aiming direction with pitch applied
                // Horizontal direction from barrel + vertical from aimPitch
                const aimDirection = new Vector3(
                    barrelWorldDir.x * Math.cos(this.aimPitch),
                    Math.sin(this.aimPitch),
                    barrelWorldDir.z * Math.cos(this.aimPitch)
                ).normalize();
                
                // Camera position: BEHIND the muzzle along aiming direction
                // At zoom 0: far enough to see cannon + chassis
                // At zoom 4: closer for precision aiming
                const backOffset = 5.0 - this.aimZoom * 0.75;
                
                // Camera sits behind and above the aiming line
                const cameraPos = muzzlePos.add(aimDirection.scale(-backOffset));
                
                // Height offset - see over turret
                const heightOffset = 1.0 - this.aimZoom * 0.15;
                cameraPos.y += heightOffset;
                
                // Slight right offset for better view
                const rightDir = Vector3.Cross(Vector3.Up(), barrelWorldDir).normalize();
                cameraPos.addInPlace(rightDir.scale(0.2));
                
                // Smooth camera movement
                const currentPos = this.aimCamera.position.clone();
                const posLerp = 0.25 + t * 0.35;
                const newPos = Vector3.Lerp(currentPos, cameraPos, posLerp);
                
                this.aimCamera.position.copyFrom(newPos);
                
                // LOOK TARGET: where the aiming direction points
                const lookAtDistance = 300;
                let lookAtPos = muzzlePos.add(aimDirection.scale(lookAtDistance));
                
                // Smooth target interpolation
                const currentTarget = this.aimCamera.getTarget();
                const lerpedTarget = Vector3.Lerp(currentTarget, lookAtPos, posLerp);
                this.aimCamera.setTarget(lerpedTarget);
                
                // Apply camera shake
                if (this.cameraShakeIntensity > 0.01) {
                    const shakePos = this.aimCamera.position.clone();
                    this.aimCamera.position = shakePos.add(this.cameraShakeOffset.scale(0.4));
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
            if (this.camera && this.cameraShakeIntensity > 0.01) {
                const basePos = this.tank.chassis.getAbsolutePosition();
                basePos.y += 2;
                this.camera.position = basePos.add(this.cameraShakeOffset);
            }
            
            if (this.aimCamera && this.cameraShakeIntensity > 0.01) {
                const currentPos = this.aimCamera.position.clone();
                this.aimCamera.position = currentPos.add(this.cameraShakeOffset.scale(0.5)); // Меньше тряски в режиме прицеливания
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
                    const currentPos = this.camera.position.clone();
                    this.camera.position = currentPos.add(this.cameraShakeOffset);
                }
                
                const chassisRotY = this.tank.chassis.rotationQuaternion 
                    ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                    : this.tank.chassis.rotation.y;
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
                            // При управлении мышью: проверяем поворот корпуса
                            const currentChassisRotY = this.tank.chassis.rotationQuaternion 
                                ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                                : this.tank.chassis.rotation.y;
                            
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
                                    const turretPos = this.tank.turret.getAbsolutePosition();
                                    const forward = new Vector3(Math.sin(totalWorldAngle), 0, Math.cos(totalWorldAngle));
                                    this.virtualTurretTarget = turretPos.add(forward.scale(100)); // Точка на расстоянии 100 единиц
                                }
                            }
                            
                            // Если корпус повернулся и есть виртуальная точка - фиксируем башню на ней (только если виртуальная фиксация включена)
                            if (this.settings.virtualTurretFixation) {
                                const chassisRotDiff = currentChassisRotY - this.lastChassisRotation;
                                if (Math.abs(chassisRotDiff) > 0.01 && this.virtualTurretTarget) {
                                    // Вычисляем направление к виртуальной точке
                                    const turretPos = this.tank.turret.getAbsolutePosition();
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
                
                // КРИТИЧЕСКИ ВАЖНО: Используем getAbsolutePosition() для получения актуальной позиции после обновления физики
                // Это предотвращает эффект "нескольких танков" из-за рассинхронизации позиции меша и физического тела
                const tankPos = this.tank.chassis.getAbsolutePosition();
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
    
    // Предотвращение захода камеры за текстуры/стены
    private adjustCameraForCollision(): void {
        if (!this.camera || !this.tank || !this.tank.chassis) return;
        
        // Только для обычной камеры (не в режиме прицеливания)
        const t = this.aimingTransitionProgress || 0;
        if (t > 0.01) return; // В режиме прицеливания не применяем
        
        const tankPos = this.tank.chassis.getAbsolutePosition();
        const cameraPos = this.camera.position;
        
        // Направление от танка к камере
        const direction = cameraPos.subtract(tankPos.add(new Vector3(0, 1.0, 0)));
        const distance = direction.length();
        direction.normalize();
        
        // Минимальное расстояние до камеры (чтобы не заходить за текстуры)
        const minDistance = 2.0;
        
        // Проверяем коллизию с мешами (игнорируем танк и другие исключения)
        const ray = new Ray(tankPos.add(new Vector3(0, 1.0, 0)), direction);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || 
                mesh === this.tank?.chassis || 
                mesh === this.tank?.turret || 
                mesh === this.tank?.barrel) {
                return false;
            }
            // Игнорируем эффекты, частицы и другие невидимые объекты
            if (mesh.name.includes("particle") || mesh.name.includes("effect") || 
                mesh.name.includes("trail") || mesh.name.includes("bullet")) {
                return false;
            }
            return true;
        });
        
        if (hit && hit.hit && hit.distance !== null && hit.distance < distance) {
            // Есть коллизия - перемещаем камеру ближе к танку
            const safeDistance = Math.max(minDistance, hit.distance - 0.5);
            const newCameraPos = tankPos.add(new Vector3(0, 1.0, 0)).add(direction.clone().scale(safeDistance));
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:6869',message:'Camera collision detected',data:{hitDistance:hit.distance,originalDistance:distance,safeDistance:safeDistance,cameraPosX:cameraPos.x,cameraPosY:cameraPos.y,cameraPosZ:cameraPos.z,newPosX:newCameraPos.x,newPosY:newCameraPos.y,newPosZ:newCameraPos.z,hitMeshName:hit.pickedMesh?.name||'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run3-camera',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            // Плавно перемещаем камеру к безопасной позиции
            this.camera.position = Vector3.Lerp(cameraPos, newCameraPos, 0.3);
        } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:6875',message:'Camera no collision',data:{cameraPosX:cameraPos.x,cameraPosY:cameraPos.y,cameraPosZ:cameraPos.z,distance:distance},timestamp:Date.now(),sessionId:'debug-session',runId:'run3-camera',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
        }
    }
    
    // ПОКАЗАТЬ stats overlay (Tab ЗАЖАТ - пункт 13: K/D, убийства, смерти, credits)
    showStatsOverlay(): void {
        if (!this.statsOverlay) {
            this.createStatsOverlay();
        }
        
        if (this.statsOverlay && !this.statsOverlayVisible) {
            this.statsOverlayVisible = true;
            this.statsOverlay.style.display = "flex";
            this.statsOverlay.style.visibility = "visible";
            this.updateStatsOverlay();
        }
    }
    
    // СКРЫТЬ stats overlay (Tab ОТПУЩЕН)
    hideStatsOverlay(): void {
        if (this.statsOverlay) {
            this.statsOverlayVisible = false;
            this.statsOverlay.style.display = "none";
            this.statsOverlay.style.visibility = "hidden";
        }
    }
    
    // Создать overlay статистики (стиль многопользовательской игры)
    private createStatsOverlay(): void {
        // Удаляем старый overlay, если существует
        const existing = document.getElementById("stats-overlay");
        if (existing) {
            existing.remove();
        }
        
        this.statsOverlay = document.createElement("div");
        this.statsOverlay.id = "stats-overlay";
        this.statsOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.75);
            display: none;
            justify-content: center;
            align-items: flex-start;
            padding-top: 60px;
            z-index: 5000;
            font-family: 'Courier New', monospace;
            visibility: hidden;
        `;
        
        const content = document.createElement("div");
        content.id = "scoreboard-content";
        content.style.cssText = `
            background: linear-gradient(180deg, #0a0a0a 0%, #111 100%);
            border: 1px solid #0f04;
            min-width: 700px;
            max-width: 900px;
        `;
        
        this.statsOverlay.appendChild(content);
        document.body.appendChild(this.statsOverlay);
        
        // Гарантируем, что overlay скрыт
        this.statsOverlayVisible = false;
    }
    
    // === ПУНКТ 14 & 15: Проверка видимости танка и плавная работа камеры ===
    // Состояние видимости танка (для предотвращения мерцания)
    private tankVisibilityState = false; // false = виден, true = за стеной
    private tankVisibilityTarget = false;
    private tankVisibilitySmooth = 0.0; // 0.0 = виден, 1.0 = за стеной
    
    // === ПРОВЕРКА ВИДИМОСТИ ТАНКА ИГРОКА ЗА СТЕНАМИ (с гистерезисом для предотвращения мерцания) ===
    private checkPlayerTankVisibility(): void {
        if (!this.tank || !this.tank.chassis || !this.camera) return;
        
        const tankPos = this.tank.chassis.absolutePosition.clone();
        tankPos.y += 1.0; // Центр танка
        const cameraPos = this.camera.position;
        
        // Raycast от камеры к танку
        const direction = tankPos.subtract(cameraPos).normalize();
        const distance = Vector3.Distance(cameraPos, tankPos);
        const ray = new Ray(cameraPos, direction, distance + 1); // +1 для большей стабильности
        
        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
            if (mesh.parent === this.tank?.chassis || mesh.parent === this.tank?.turret) return false;
            return mesh.isPickable && mesh.visibility > 0.5;
        });
        
        // Определяем новое состояние с гистерезисом
        const isBlocked = pick && pick.hit && pick.distance < distance - 0.3;
        
        // Гистерезис: меняем состояние только если уверены (разница > порога)
        const HYSTERESIS_THRESHOLD = 0.5; // Порог для переключения
        if (isBlocked && !this.tankVisibilityState) {
            // Переключаемся на "за стеной" только если уверены
            if (pick.distance < distance - HYSTERESIS_THRESHOLD) {
                this.tankVisibilityTarget = true;
            }
        } else if (!isBlocked && this.tankVisibilityState) {
            // Переключаемся на "виден" только если уверены
            if (!pick || !pick.hit || pick.distance >= distance - HYSTERESIS_THRESHOLD) {
                this.tankVisibilityTarget = false;
            }
        } else {
            // Обновляем цель без гистерезиса если состояние не меняется
            this.tankVisibilityTarget = isBlocked || false;
        }
        
        // Плавная интерполяция состояния (предотвращает мерцание)
        const lerpSpeed = 0.1; // Медленная интерполяция для плавности
        if (this.tankVisibilityTarget) {
            this.tankVisibilitySmooth = Math.min(1.0, this.tankVisibilitySmooth + lerpSpeed);
        } else {
            this.tankVisibilitySmooth = Math.max(0.0, this.tankVisibilitySmooth - lerpSpeed);
        }
        
        // Обновляем состояние только если прошло достаточно времени
        if (Math.abs(this.tankVisibilitySmooth - (this.tankVisibilityState ? 1.0 : 0.0)) > 0.3) {
            this.tankVisibilityState = this.tankVisibilitySmooth > 0.5;
        }
        
        // Применяем видимость с плавным переходом (включая гусеницы)
        if (this.tank.chassis && this.tank.turret && this.tank.barrel) {
            const visibility = 0.7 + (1.0 - 0.7) * (1.0 - this.tankVisibilitySmooth); // От 0.7 до 1.0
            
            if (this.tankVisibilitySmooth > 0.1) {
                // Танк за стеной - подсвечиваем (включая гусеницы)
                this.tank.chassis.renderingGroupId = 3;
                this.tank.turret.renderingGroupId = 3;
                this.tank.barrel.renderingGroupId = 3;
                this.tank.chassis.visibility = visibility;
                this.tank.turret.visibility = visibility;
                this.tank.barrel.visibility = visibility;
                
                // Гусеницы тоже подсвечиваем
                if (this.tank.leftTrack) {
                    this.tank.leftTrack.renderingGroupId = 3;
                    this.tank.leftTrack.visibility = visibility;
                }
                if (this.tank.rightTrack) {
                    this.tank.rightTrack.renderingGroupId = 3;
                    this.tank.rightTrack.visibility = visibility;
                }
            } else {
                // Танк виден - обычная видимость
                this.tank.chassis.renderingGroupId = 0;
                this.tank.turret.renderingGroupId = 0;
                this.tank.barrel.renderingGroupId = 0;
                this.tank.chassis.visibility = 1.0;
                this.tank.turret.visibility = 1.0;
                this.tank.barrel.visibility = 1.0;
                
                // Гусеницы тоже видимы
                if (this.tank.leftTrack) {
                    this.tank.leftTrack.renderingGroupId = 0;
                    this.tank.leftTrack.visibility = 1.0;
                }
                if (this.tank.rightTrack) {
                    this.tank.rightTrack.renderingGroupId = 0;
                    this.tank.rightTrack.visibility = 1.0;
                }
            }
        }
    }
    
    // === СКРЫТИЕ БАШЕН ВРАГОВ КОГДА ОНИ НЕ ВИДНЫ ===
    private updateEnemyTurretsVisibility(): void {
        if (!this.camera || !this.enemyTanks) return;
        
        const cameraPos = this.camera.position;
        
        this.enemyTanks.forEach(enemy => {
            if (!enemy.isAlive || !enemy.chassis || !enemy.turret) return;
            
            const enemyPos = enemy.chassis.absolutePosition.clone();
            enemyPos.y += 1.0;
            
            // Raycast от камеры к врагу
            const direction = enemyPos.subtract(cameraPos).normalize();
            const distance = Vector3.Distance(cameraPos, enemyPos);
            const ray = new Ray(cameraPos, direction, distance);
            
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled()) return false;
                const meta = mesh.metadata;
                if (meta && (meta.type === "enemyTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
                if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                if (mesh.parent === enemy.chassis || mesh.parent === enemy.turret) return false;
                return mesh.isPickable && mesh.visibility > 0.5;
            });
            
            const isVisible = !pick || !pick.hit || pick.distance >= distance - 0.5;
            
            // Скрываем башню если враг не виден
            if (enemy.turret) {
                enemy.turret.visibility = isVisible ? 1.0 : 0.0;
            }
            if (enemy.barrel) {
                enemy.barrel.visibility = isVisible ? 1.0 : 0.0;
            }
        });
    }
    
    // === РАСЧЁТ ТОЧКИ ПОПАДАНИЯ СНАРЯДА ===
    // Обновить содержимое overlay статистики (стиль многопользовательской игры)
    private updateStatsOverlay(): void {
        const content = document.getElementById("scoreboard-content");
        if (!content) return;
        
        // Данные игрока
        let playerKills = 0;
        let playerDeaths = 0;
        let playerCredits = 0;
        let playerKD = "0.00";
        let playerLevel = 1;
        let playerDamage = 0;
        let playerAccuracy = "0%";
        let playerPlayTime = "0h 0m";
        
        if (this.playerProgression) {
            const stats = this.playerProgression.getStats();
            playerKills = stats.totalKills || 0;
            playerDeaths = stats.totalDeaths || 0;
            playerCredits = stats.credits || 0;
            playerLevel = stats.level || 1;
            playerDamage = Math.round(stats.totalDamageDealt || 0);
            playerKD = this.playerProgression.getKDRatio();
            playerAccuracy = this.playerProgression.getAccuracy();
            playerPlayTime = this.playerProgression.getPlayTimeFormatted();
        }
        
        if (this.currencyManager) {
            playerCredits = this.currencyManager.getCurrency();
        }
        
        // Получаем прогресс опыта для отображения
        let xpProgressHTML = '';
        if (this.playerProgression) {
            const xpProgress = this.playerProgression.getExperienceProgress();
            // Округляем процент до 1 знака после запятой для упрощения
            const rawPercent = xpProgress.required > 0 ? Math.min(100, Math.max(0, (xpProgress.current / xpProgress.required) * 100)) : 100;
            const xpPercent = Math.round(rawPercent * 10) / 10;
            
            // Получаем комбо-счётчик
            let comboInfo = '';
            if (this.experienceSystem) {
                const comboCount = this.experienceSystem.getComboCount();
                if (comboCount >= 2) {
                    const comboBonus = Math.min(comboCount / 10, 1) * 100;
                    comboInfo = `<span style="color:#ff0; font-size:10px; margin-left:8px">🔥 COMBO x${comboCount} (+${comboBonus.toFixed(0)}%)</span>`;
                }
            }
            
            xpProgressHTML = `
                <div style="margin-top:6px">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
                        <div style="display:flex; align-items:center">
                            <span style="color:#0aa; font-size:11px; font-weight:bold">EXPERIENCE</span>
                            ${comboInfo}
                        </div>
                        <span style="color:#0ff; font-size:11px; font-weight:bold">${xpProgress.current} / ${xpProgress.required} XP</span>
                    </div>
                    <div style="width:100%; height:8px; background:#0a0a0a; border-radius:3px; overflow:hidden; border:1px solid #0f04; position:relative; box-shadow:inset 0 0 4px rgba(0,0,0,0.5)">
                        <div style="width:${xpPercent}%; height:100%; background:linear-gradient(90deg, #0f0 0%, #0ff 50%, #0f0 100%); transition:width 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow:0 0 10px rgba(0,255,0,0.6), inset 0 0 5px rgba(0,255,255,0.3)"></div>
                    </div>
                </div>
            `;
        }
        
        // Check if multiplayer mode
        const isMultiplayer = this.isMultiplayer && this.realtimeStatsTracker;
        const localPlayerId = this.multiplayerManager?.getPlayerId();
        
        if (isMultiplayer && this.realtimeStatsTracker) {
            // MULTIPLAYER MODE: Show leaderboard and K/D graph
            const leaderboard = this.realtimeStatsTracker.getLeaderboard("score");
            const localStats = this.realtimeStatsTracker.getLocalPlayerStats();
            const kdHistory = this.realtimeStatsTracker.getKDHistory();
            const matchTime = this.realtimeStatsTracker.getMatchTime();
            
            // Update local player stats from realtime tracker if available
            if (localStats) {
                playerKills = localStats.kills;
                playerDeaths = localStats.deaths;
                playerKD = localStats.deaths > 0 ? (localStats.kills / localStats.deaths).toFixed(2) : localStats.kills.toFixed(2);
            }
            
            // Generate leaderboard HTML
            let leaderboardHTML = "";
            leaderboard.forEach((player, index) => {
                const isLocal = player.playerId === localPlayerId;
                const kd = player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2);
                const statusColor = player.isAlive ? "#0f0" : "#f00";
                const statusIcon = player.isAlive ? "●" : "✖";
                const rowBg = isLocal ? "#0f02" : "transparent";
                const rowOpacity = player.isAlive ? "1" : "0.5";
                const teamIndicator = player.team !== undefined ? `<span style="color:${player.team === 0 ? '#4a9eff' : '#ff4a4a'}; margin-right:8px">[${player.team === 0 ? 'BLUE' : 'RED'}]</span>` : "";
                
                leaderboardHTML += `
                    <tr style="opacity:${rowOpacity}; border-bottom:1px solid #222; background:${rowBg}">
                        <td style="padding:8px 12px; text-align:center; color:#888; width:40px">${index + 1}</td>
                        <td style="padding:8px 12px; color:${statusColor}">${statusIcon}</td>
                        <td style="padding:8px 12px; color:${isLocal ? '#0ff' : '#f80'}">${teamIndicator}${player.playerName}${isLocal ? ' (YOU)' : ''}</td>
                        <td style="padding:8px 12px; text-align:center; color:#0f0; width:60px">${player.kills}</td>
                        <td style="padding:8px 12px; text-align:center; color:#f00; width:60px">${player.deaths}</td>
                        <td style="padding:8px 12px; text-align:center; color:#0ff; width:70px">${kd}</td>
                        <td style="padding:8px 12px; text-align:center; color:#ff0; width:70px">${player.score}</td>
                    </tr>
                `;
            });
            
            // Generate K/D graph HTML
            let kdGraphHTML = "";
            if (kdHistory.length > 1) {
                const maxKD = Math.max(...kdHistory.map(p => p.kd), 1);
                const minKD = Math.min(...kdHistory.map(p => p.kd), 0);
                const kdRange = maxKD - minKD || 1;
                const graphWidth = 400;
                const graphHeight = 100;
                const points = kdHistory.map((point, i) => {
                    const x = (i / (kdHistory.length - 1)) * graphWidth;
                    const y = graphHeight - ((point.kd - minKD) / kdRange) * graphHeight;
                    return `${x},${y}`;
                }).join(" ");
                
                kdGraphHTML = `
                    <div style="background:#0a0a0a; padding:15px; border:1px solid #0f04; margin-top:10px">
                        <div style="color:#0aa; font-size:11px; margin-bottom:8px; font-weight:bold">K/D RATIO OVER TIME</div>
                        <svg width="${graphWidth}" height="${graphHeight}" style="background:#000; border:1px solid #0f04">
                            <polyline points="${points}" fill="none" stroke="#0ff" stroke-width="2" />
                            <line x1="0" y1="${graphHeight - ((1 - minKD) / kdRange) * graphHeight}" x2="${graphWidth}" y2="${graphHeight - ((1 - minKD) / kdRange) * graphHeight}" stroke="#0f04" stroke-width="1" stroke-dasharray="4,4" />
                            <text x="5" y="${graphHeight - ((1 - minKD) / kdRange) * graphHeight - 5}" fill="#0aa" font-size="10px">K/D = 1.0</text>
                            <text x="5" y="10" fill="#0aa" font-size="10px">Max: ${maxKD.toFixed(2)}</text>
                            <text x="5" y="${graphHeight - 5}" fill="#0aa" font-size="10px">Min: ${minKD.toFixed(2)}</text>
                        </svg>
                    </div>
                `;
            }
            
            content.innerHTML = `
                <!-- Заголовок -->
                <div style="background:#0f02; padding:10px 20px; border-bottom:1px solid #0f04; display:flex; justify-content:space-between; align-items:center">
                    <span style="color:#0f0; font-size:14px; font-weight:bold">📊 LEADERBOARD</span>
                    <span style="color:#0a0; font-size:11px">Match Time: ${Math.floor(matchTime / 60)}:${String(Math.floor(matchTime % 60)).padStart(2, '0')}</span>
                </div>
                
                <!-- Статистика игрока -->
                <div style="background:#001100; padding:15px 20px; border-bottom:2px solid #0f04">
                    <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px">
                        <div style="width:40px; height:40px; background:#0f0; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#000; font-weight:bold; font-size:16px">
                            ${playerLevel}
                        </div>
                        <div style="flex:1">
                            <div style="color:#0f0; font-size:16px; font-weight:bold">PLAYER</div>
                            <div style="color:#0a0; font-size:11px; margin-bottom:6px">Level ${playerLevel} • ${playerPlayTime}</div>
                            ${xpProgressHTML}
                        </div>
                        <div style="margin-left:auto; display:flex; gap:30px; text-align:center">
                            <div>
                                <div style="color:#0f0; font-size:24px; font-weight:bold">${playerKills}</div>
                                <div style="color:#0a0; font-size:10px">KILLS</div>
                            </div>
                            <div>
                                <div style="color:#f00; font-size:24px; font-weight:bold">${playerDeaths}</div>
                                <div style="color:#a00; font-size:10px">DEATHS</div>
                            </div>
                            <div>
                                <div style="color:#0ff; font-size:24px; font-weight:bold">${playerKD}</div>
                                <div style="color:#0aa; font-size:10px">K/D</div>
                            </div>
                            <div>
                                <div style="color:#ff0; font-size:24px; font-weight:bold">${playerCredits}</div>
                                <div style="color:#aa0; font-size:10px">CREDITS</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:20px; font-size:11px; color:#888; margin-top:8px">
                        <span>Урон: <span style="color:#fff">${playerDamage}</span></span>
                        <span>Точность: <span style="color:#fff">${playerAccuracy}</span></span>
                        ${this.playerProgression ? (() => {
                            try {
                                const xpStats = this.playerProgression.getRealTimeXpStats();
                                return `<span>XP/мин: <span style="color:#0ff">${xpStats.experiencePerMinute}</span></span>`;
                            } catch (e) {
                                return '';
                            }
                        })() : ''}
                    </div>
                    ${kdGraphHTML}
                </div>
                
                <!-- Таблица лидеров -->
                <table style="width:100%; border-collapse:collapse; font-size:12px">
                    <thead>
                        <tr style="background:#111; border-bottom:1px solid #333">
                            <th style="padding:8px 12px; text-align:center; color:#666; width:40px">#</th>
                            <th style="padding:8px 12px; text-align:left; color:#666; width:30px"></th>
                            <th style="padding:8px 12px; text-align:left; color:#666">NAME</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:60px">KILLS</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:60px">DEATHS</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:70px">K/D</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:70px">SCORE</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${leaderboardHTML || '<tr><td colspan="7" style="padding:20px; text-align:center; color:#666">No players in match</td></tr>'}
                    </tbody>
                </table>
                
                <!-- Футер -->
                <div style="background:#0a0a0a; padding:8px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; font-size:10px; color:#666">
                    <span>Players: ${leaderboard.length}</span>
                    <span>Protocol TX v1.0</span>
                </div>
            `;
        } else {
            // SINGLE PLAYER MODE: Show bots list
            const bots: { name: string; kills: number; deaths: number; health: number; isAlive: boolean }[] = [];
            
            // Добавляем вражеские танки как ботов
            this.enemyTanks.forEach((tank, index) => {
                const currentHealth = tank.currentHealth || 0;
                const maxHealth = tank.maxHealth || 100;
                bots.push({
                    name: `BOT_${index + 1}`,
                    kills: Math.floor(Math.random() * 5), // Боты не отслеживают киллы, фейковое значение
                    deaths: 0,
                    health: Math.round((currentHealth / maxHealth) * 100),
                    isAlive: currentHealth > 0
                });
            });
            
            // Добавляем турели как ботов
            if (this.enemyManager && this.enemyManager.turrets) {
                const turrets = this.enemyManager.turrets;
                turrets.forEach((turret: any, index: number) => {
                    const currentHealth = turret.health || 0;
                    const maxHealth = 50;
                    bots.push({
                        name: `TURRET_${index + 1}`,
                        kills: 0,
                        deaths: 0,
                        health: Math.round((currentHealth / maxHealth) * 100),
                        isAlive: currentHealth > 0
                    });
                });
            }
            
            // Сортируем ботов - живые сверху
            bots.sort((a, b) => {
                if (a.isAlive && !b.isAlive) return -1;
                if (!a.isAlive && b.isAlive) return 1;
                return 0;
            });
            
            // Генерируем HTML
            let botsHTML = "";
            bots.forEach(bot => {
                const statusColor = bot.isAlive ? "#0f0" : "#f00";
                const statusIcon = bot.isAlive ? "●" : "✖";
                const rowOpacity = bot.isAlive ? "1" : "0.5";
                const healthBar = bot.isAlive ? `
                    <div style="width:60px; height:4px; background:#333; border-radius:2px; overflow:hidden">
                        <div style="width:${bot.health}%; height:100%; background:${bot.health > 50 ? '#0f0' : bot.health > 25 ? '#ff0' : '#f00'}"></div>
                    </div>
                ` : '<span style="color:#f00; font-size:10px">DEAD</span>';
                
                botsHTML += `
                    <tr style="opacity:${rowOpacity}; border-bottom:1px solid #222">
                        <td style="padding:8px 12px; color:${statusColor}">${statusIcon}</td>
                        <td style="padding:8px 12px; color:#f80">${bot.name}</td>
                        <td style="padding:8px 12px; text-align:center; color:#0f0">${bot.kills}</td>
                        <td style="padding:8px 12px; text-align:center; color:#f00">${bot.deaths}</td>
                        <td style="padding:8px 12px; text-align:center">${healthBar}</td>
                    </tr>
                `;
            });
            
            content.innerHTML = `
                <!-- Заголовок -->
                <div style="background:#0f02; padding:10px 20px; border-bottom:1px solid #0f04; display:flex; justify-content:space-between; align-items:center">
                    <span style="color:#0f0; font-size:14px; font-weight:bold">📊 SCOREBOARD</span>
                    <span style="color:#0a0; font-size:11px">Hold Tab</span>
                </div>
                
                <!-- Статистика игрока -->
                <div style="background:#001100; padding:15px 20px; border-bottom:2px solid #0f04">
                    <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px">
                        <div style="width:40px; height:40px; background:#0f0; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#000; font-weight:bold; font-size:16px">
                            ${playerLevel}
                        </div>
                        <div style="flex:1">
                            <div style="color:#0f0; font-size:16px; font-weight:bold">PLAYER</div>
                            <div style="color:#0a0; font-size:11px; margin-bottom:6px">Level ${playerLevel} • ${playerPlayTime}</div>
                            ${xpProgressHTML}
                        </div>
                        <div style="margin-left:auto; display:flex; gap:30px; text-align:center">
                            <div>
                                <div style="color:#0f0; font-size:24px; font-weight:bold">${playerKills}</div>
                                <div style="color:#0a0; font-size:10px">KILLS</div>
                            </div>
                            <div>
                                <div style="color:#f00; font-size:24px; font-weight:bold">${playerDeaths}</div>
                                <div style="color:#a00; font-size:10px">DEATHS</div>
                            </div>
                            <div>
                                <div style="color:#0ff; font-size:24px; font-weight:bold">${playerKD}</div>
                                <div style="color:#0aa; font-size:10px">K/D</div>
                            </div>
                            <div>
                                <div style="color:#ff0; font-size:24px; font-weight:bold">${playerCredits}</div>
                                <div style="color:#aa0; font-size:10px">CREDITS</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:20px; font-size:11px; color:#888; margin-top:8px">
                        <span>Урон: <span style="color:#fff">${playerDamage}</span></span>
                        <span>Точность: <span style="color:#fff">${playerAccuracy}</span></span>
                        ${this.playerProgression ? (() => {
                            try {
                                const xpStats = this.playerProgression.getRealTimeXpStats();
                                return `<span>XP/мин: <span style="color:#0ff">${xpStats.experiencePerMinute}</span></span>`;
                            } catch (e) {
                                return '';
                            }
                        })() : ''}
                    </div>
                </div>
                
                <!-- Список ботов -->
                <table style="width:100%; border-collapse:collapse; font-size:12px">
                    <thead>
                        <tr style="background:#111; border-bottom:1px solid #333">
                            <th style="padding:8px 12px; text-align:left; color:#666; width:30px"></th>
                            <th style="padding:8px 12px; text-align:left; color:#666">NAME</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:60px">KILLS</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:60px">DEATHS</th>
                            <th style="padding:8px 12px; text-align:center; color:#666; width:80px">HEALTH</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${botsHTML || '<tr><td colspan="5" style="padding:20px; text-align:center; color:#666">No bots in game</td></tr>'}
                    </tbody>
                </table>
                
                <!-- Футер -->
                <div style="background:#0a0a0a; padding:8px 20px; border-top:1px solid #222; display:flex; justify-content:space-between; font-size:10px; color:#666">
                    <span>Players: 1 • Bots: ${bots.filter(b => b.isAlive).length}/${bots.length}</span>
                    <span>Protocol TX v1.0</span>
                </div>
            `;
        }
    }
    
    updateHUD() {
        if (!this.hud || !this.tank) return;
        
        // Get all enemy positions with turret rotation info (ЗАЩИТА от null)
        const turretPositions = this.enemyManager?.getEnemyPositions() || [];
        const tankPositions = (this.enemyTanks || [])
            .filter(t => t && t.isAlive && t.chassis)
            .map(t => {
                // Вычисляем АБСОЛЮТНЫЙ угол башни врага (корпус + башня)
                let chassisRotY = 0;
                if (t.chassis.rotationQuaternion) {
                    chassisRotY = t.chassis.rotationQuaternion.toEulerAngles().y;
                } else {
                    chassisRotY = t.chassis.rotation.y;
                }
                const turretRotY = t.turret ? t.turret.rotation.y : 0;
                const absoluteTurretAngle = chassisRotY + turretRotY;
                
                return {
                    x: t.chassis.absolutePosition.x,
                    z: t.chassis.absolutePosition.z,
                    alive: true,
                    turretRotation: absoluteTurretAngle // АБСОЛЮТНЫЙ угол башни врага
                };
            });
        
        // Добавляем информацию о башнях врагов (ЗАЩИТА от null)
        const turretEnemies = (turretPositions || []).map((pos) => ({
            x: pos.x,
            z: pos.z,
            alive: pos.alive,
            turretRotation: undefined // Turrets не имеют отдельной башни
        }));
        
        const allEnemies = [...turretEnemies, ...tankPositions];
        
        // КРИТИЧЕСКИ ВАЖНО: Передаём позицию и направление БАШНИ игрока для правильного обновления радара!
        const playerPos = this.tank.chassis.absolutePosition;
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
        this.hud.setPosition(playerPos.x, playerPos.z);
        
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
            
            // Обновляем красные точки врагов на компасе
            const allEnemiesForCompass = this.enemyTanks
                .filter(t => t.isAlive)
                .map(t => ({
                    x: t.chassis.absolutePosition.x,
                    z: t.chassis.absolutePosition.z,
                    alive: true
                }));
            const turretEnemiesForCompass = this.enemyManager?.getEnemyPositions().map((pos) => ({
                x: pos.x,
                z: pos.z,
                alive: pos.alive
            })) || [];
            this.hud.updateCompassEnemies([...allEnemiesForCompass, ...turretEnemiesForCompass], this.tank.chassis.absolutePosition, totalAngle);
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
        }
        
        // Update enemy count
        const aliveCount = this.enemyTanks.filter(t => t.isAlive).length + 
                          (this.enemyManager ? this.enemyManager.getAliveCount() : 0);
        this.hud.setEnemyCount(aliveCount);
        
        // Update nearest enemy distance
        let nearestDistance = Infinity;
        const allEnemiesCount = allEnemies.length;
        for (let i = 0; i < allEnemiesCount; i++) {
            const enemy = allEnemies[i];
            if (!enemy) continue;
            let enemyPos: Vector3;
            if (enemy instanceof Vector3) {
                enemyPos = enemy;
            } else if ('x' in enemy && 'z' in enemy) {
                enemyPos = new Vector3(enemy.x, playerPos.y, enemy.z);
            } else {
                continue;
            }
            const dist = Vector3.Distance(playerPos, enemyPos);
            if (dist < nearestDistance) {
                nearestDistance = dist;
            }
        }
        if (nearestDistance < Infinity) {
            this.hud.setNearestEnemyDistance(nearestDistance);
        } else {
            this.hud.setNearestEnemyDistance(0);
        }
        
        // FPS теперь обновляется каждый кадр в методе update() для точности и плавности
        // Здесь только остальные элементы HUD
        
        // Update debug dashboard (обновляем всегда, даже если танка нет - для отображения сцены)
        if (this.debugDashboard) {
            if (this.tank && this.tank.chassis) {
                const tankPos = this.tank.chassis.absolutePosition;
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
        const playerPos = this.tank && this.tank.chassis ? this.tank.chassis.absolutePosition : undefined;
        this.enemyTanks.forEach(t => t.setHpVisible(false, playerPos));
        if (this.enemyManager) {
            this.enemyManager.turrets.forEach(t => t.setHpVisible(false));
        }
        
        if (pick && pick.hit && pick.pickedMesh) {
            const pickedMesh = pick.pickedMesh as any; // Приведение типа для isPartOf
            // Check enemy tanks
            const tank = this.enemyTanks.find(et => et.isPartOf && et.isPartOf(pickedMesh));
            if (tank) {
                tank.setHpVisible(true, playerPos);
                return;
            }
            // Check turrets
            if (this.enemyManager) {
                const turret = this.enemyManager.turrets.find(tr => tr.isPartOf && tr.isPartOf(pickedMesh));
                if (turret) {
                    turret.setHpVisible(true);
                    return;
                }
            }
        }
        
        // Backup: проверяем по расстоянию от луча ствола
        // Если raycast не попал, проверяем близость к лучу
        const maxDist = 100;
        for (let i = 0; i < this.enemyTanks.length; i++) {
            const enemy = this.enemyTanks[i];
            if (!enemy || !enemy.isAlive || !enemy.chassis) continue;
            
            const enemyPos = enemy.chassis.absolutePosition;
            // Вычисляем расстояние от луча ствола до врага
            const toEnemy = enemyPos.subtract(barrelPos);
            const proj = Vector3.Dot(toEnemy, barrelDir);
            if (proj > 0 && proj < maxDist) {
                const closestPoint = barrelPos.add(barrelDir.scale(proj));
                const dist = Vector3.Distance(closestPoint, enemyPos);
                if (dist < 3) { // Если враг близко к лучу ствола
                    enemy.setHpVisible(true, playerPos);
                    return;
                }
            }
        }
        
        if (this.enemyManager) {
            for (const turret of this.enemyManager.turrets) {
                if (!turret.isAlive || !turret.base) continue;
                
                const turretPos = turret.base.absolutePosition;
                const toTurret = turretPos.subtract(barrelPos);
                const proj = Vector3.Dot(toTurret, barrelDir);
                if (proj > 0 && proj < maxDist) {
                    const closestPoint = barrelPos.add(barrelDir.scale(proj));
                    const dist = Vector3.Distance(closestPoint, turretPos);
                    if (dist < 3) {
                        turret.setHpVisible(true);
                        return;
                    }
                }
            }
        }
    }
    
    // === MULTIPLAYER METHODS ===
    
    private setupMultiplayerCallbacks(): void {
        if (!this.multiplayerManager) return;
        
        this.multiplayerManager.onConnected(() => {
            logger.log("[Game] Connected to multiplayer server");
            // Обновляем статус в меню если оно открыто
            if (this.mainMenu && typeof this.mainMenu.updateMultiplayerStatus === "function") {
                this.mainMenu.updateMultiplayerStatus();
            }
        });
        
        this.multiplayerManager.onDisconnected(() => {
            logger.log("[Game] Disconnected from multiplayer server");
            this.isMultiplayer = false;
            // Hide multiplayer HUD
            if (this.hud) {
                this.hud.showMultiplayerHUD?.(false);
            }
            // Clean up network players
            this.networkPlayerTanks.forEach(tank => tank.dispose());
            this.networkPlayerTanks.clear();
            // Обновляем статус в меню если оно открыто
            if (this.mainMenu && typeof this.mainMenu.updateMultiplayerStatus === "function") {
                this.mainMenu.updateMultiplayerStatus();
            }
        });
        
        this.multiplayerManager.onPlayerJoined((playerData) => {
            logger.log(`[Game] Player joined: ${playerData.name}`);
            this.createNetworkPlayerTank(playerData);
        });
        
        this.multiplayerManager.onPlayerLeft((playerId) => {
            logger.log(`[Game] Player left: ${playerId}`);
            const tank = this.networkPlayerTanks.get(playerId);
            if (tank) {
                tank.dispose();
                this.networkPlayerTanks.delete(playerId);
            }
        });
        
        this.multiplayerManager.onQueueUpdate((data) => {
            logger.log(`[Game] Queue update: ${data.queueSize} players, estimated wait: ${data.estimatedWait}s`);
            // Обновляем UI меню, если оно открыто
            if (this.mainMenu && typeof this.mainMenu.updateQueueInfo === "function") {
                this.mainMenu.updateQueueInfo(
                    data.queueSize || 0,
                    data.estimatedWait || 0,
                    data.mode || "unknown"
                );
            }
        });
        
        this.multiplayerManager.onMatchFound((data) => {
            logger.log(`[Game] Match found: ${data.roomId}`);
            // Скрываем очередь в меню, так как матч найден
            if (this.mainMenu && typeof this.mainMenu.updateQueueInfo === "function") {
                this.mainMenu.updateQueueInfo(0, 0, null);
            }
        });
        
        this.multiplayerManager.onRoomCreated((data) => {
            logger.log(`[Game] Room created: ${data.roomId}`);
            // Обновляем статус в меню
            if (this.mainMenu && typeof this.mainMenu.updateMultiplayerStatus === "function") {
                this.mainMenu.updateMultiplayerStatus();
            }
        });
        
        this.multiplayerManager.onGameStart((data) => {
            logger.log("[Game] Multiplayer game started");
            this.isMultiplayer = true;
            
            // Initialize voice chat
            const serverUrl = this.multiplayerManager?.getServerUrl() || "ws://localhost:8080";
            const roomId = data.roomId || this.multiplayerManager?.getRoomId();
            const playerId = this.multiplayerManager?.getPlayerId();
            
            if (roomId && playerId) {
                // Make voice chat manager accessible globally for signaling (lazy loaded)
                import("./voiceChat").then(({ voiceChatManager }) => {
                    (window as any).voiceChatManager = voiceChatManager;
                    
                    voiceChatManager.initialize(serverUrl, roomId, playerId).then(success => {
                        if (success) {
                            logger.log("[Game] Voice chat initialized");
                        } else {
                            logger.warn("[Game] Voice chat initialization failed (microphone permission?)");
                        }
                    });
                }).catch(error => {
                    logger.error("[Game] Failed to load voice chat:", error);
                });
            }
            
            // Use world seed from server for deterministic generation
            if (data.worldSeed && this.chunkSystem) {
                logger.log(`[Game] Using server world seed: ${data.worldSeed}`);
                // Note: ChunkSystem seed is set at creation, so we'd need to recreate it
                // For now, we'll use the seed for new chunks
                (this.chunkSystem as any).config.worldSeed = data.worldSeed;
            }
            
            // Initialize all network players
            if (data.players && this.multiplayerManager) {
                const localPlayerId = this.multiplayerManager.getPlayerId();
                for (const playerData of data.players) {
                    if (playerData.id !== localPlayerId) {
                        this.createNetworkPlayerTank(playerData);
                    }
                }
            }
            
            // Initialize Battle Royale visualizer (lazy loaded)
            if (data.mode === "battle_royale") {
                if (!this.battleRoyaleVisualizer) {
                    import("./battleRoyale").then(({ BattleRoyaleVisualizer }) => {
                        this.battleRoyaleVisualizer = new BattleRoyaleVisualizer(this.scene);
                    }).catch(error => {
                        logger.error("[Game] Failed to load Battle Royale visualizer:", error);
                    });
                }
            }
            
            // Initialize CTF visualizer (lazy loaded)
            if (data.mode === "ctf") {
                if (!this.ctfVisualizer) {
                    import("./ctfVisualizer").then(({ CTFVisualizer }) => {
                        this.ctfVisualizer = new CTFVisualizer(this.scene);
                    }).catch(error => {
                        logger.error("[Game] Failed to load CTF visualizer:", error);
                    });
                }
            }
            
            // Initialize real-time stats tracker
            if (playerId) {
                if (!this.realtimeStatsTracker) {
                    this.realtimeStatsTracker = new RealtimeStatsTracker();
                }
                this.realtimeStatsTracker.startMatch(playerId);
            }
            
            // Start replay recording (lazy loaded)
            if (!this.replayRecorder) {
                import("./replaySystem").then(({ ReplayRecorder }) => {
                    this.replayRecorder = new ReplayRecorder();
                    const worldSeed = data.worldSeed || 0;
                    const initialPlayers = data.players || [];
                    this.replayRecorder.startRecording(
                        data.roomId || `match_${Date.now()}`,
                        data.mode || "ffa",
                        worldSeed,
                        initialPlayers,
                        {
                            maxPlayers: data.maxPlayers || 32
                        }
                    );
                }).catch(error => {
                    logger.error("[Game] Failed to load replay system:", error);
                });
            } else {
                const worldSeed = data.worldSeed || 0;
                const initialPlayers = data.players || [];
                this.replayRecorder.startRecording(
                    data.roomId || `match_${Date.now()}`,
                    data.mode || "ffa",
                    worldSeed,
                    initialPlayers,
                    {
                        maxPlayers: data.maxPlayers || 32
                    }
                );
            }
        });
        
        this.multiplayerManager.onSafeZoneUpdate((data: any) => {
            // Update Battle Royale safe zone visualization
            if (this.battleRoyaleVisualizer && data) {
                const zoneData = {
                    center: new Vector3(data.center.x, data.center.y || 0, data.center.z),
                    radius: data.radius,
                    nextCenter: new Vector3(
                        data.nextCenter?.x || data.center.x, 
                        data.nextCenter?.y || 0, 
                        data.nextCenter?.z || data.center.z
                    ),
                    nextRadius: data.nextRadius || data.radius,
                    shrinkProgress: data.shrinkProgress || 0
                };
                this.battleRoyaleVisualizer.updateSafeZone(zoneData);
                
                // Check if player is outside safe zone and show warning
                if (this.tank && this.tank.chassis) {
                    const playerPos = this.tank.chassis.getAbsolutePosition();
                    const isInZone = this.battleRoyaleVisualizer.isPlayerInSafeZone(playerPos);
                    const distance = this.battleRoyaleVisualizer.getDistanceToSafeZone(playerPos);
                    
                    if (!isInZone && this.hud) {
                        this.hud.showNotification?.(`⚠️ Вне безопасной зоны! ${distance.toFixed(0)}м`, "warning");
                    }
                }
            }
        });
        
        // Player event callbacks for visual feedback
        this.multiplayerManager.onPlayerKilled((data) => {
            // Record event for replay
            if (this.replayRecorder) {
                this.replayRecorder.recordServerMessage(ServerMessageType.PLAYER_KILLED, data);
            }
            
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            if (data.killerId === localPlayerId) {
                // We got a kill!
                if (this.hud) {
                    this.hud.addKill();
                    this.hud.showNotification?.(`⚔️ Вы убили ${data.victimName}!`, "success");
                }
                
                // Update achievements
                if (this.achievementsSystem) {
                    this.achievementsSystem.updateProgress("multiplayer_first_kill", 1);
                    this.achievementsSystem.updateProgress("multiplayer_killer", 1);
                    this.achievementsSystem.updateProgress("multiplayer_dominator", 1);
                }
            } else if (data.victimId === localPlayerId) {
                // We were killed
                if (this.hud) {
                    this.hud.showNotification?.(`💀 Вас убил ${data.killerName}`, "error");
                }
            } else {
                // Someone else got killed
                if (this.hud) {
                    this.hud.showNotification?.(`⚔️ ${data.killerName} убил ${data.victimName}`, "info");
                }
            }
        });
        
        this.multiplayerManager.onPlayerDied((data) => {
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            if (data.playerId === localPlayerId) {
                // We died
                if (this.hud) {
                    this.hud.showNotification?.("💀 Вы погибли", "error");
                }
            }
        });
        
        this.multiplayerManager.onPlayerDamaged((data) => {
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            if (data.playerId === localPlayerId) {
                // We took damage
                const healthPercent = (data.health / data.maxHealth) * 100;
                if (healthPercent < 30 && this.hud) {
                    this.hud.showNotification?.(`⚠️ Критическое здоровье! ${Math.round(healthPercent)}%`, "warning");
                }
            }
        });
        
        this.multiplayerManager.onCTFFlagPickup((data) => {
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            if (data.playerId === localPlayerId) {
                // We picked up a flag
                if (this.hud) {
                    this.hud.showNotification?.(`🏴 Вы подобрали флаг команды ${data.flagTeam === 0 ? "синих" : "красных"}!`, "success");
                }
            } else {
                // Someone else picked up a flag
                if (this.hud) {
                    this.hud.showNotification?.(`🏴 ${data.playerName} подобрал флаг команды ${data.flagTeam === 0 ? "синих" : "красных"}`, "info");
                }
            }
        });
        
        this.multiplayerManager.onCTFFlagCapture((data) => {
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            if (data.playerId === localPlayerId) {
                // We captured a flag
                if (this.hud) {
                    this.hud.showNotification?.(`🏆 Вы захватили флаг! Команда ${data.capturingTeam === 0 ? "синих" : "красных"} получает очко!`, "success");
                }
                
                // Update achievements
                if (this.achievementsSystem) {
                    this.achievementsSystem.updateProgress("multiplayer_ctf_capture", 1);
                    this.achievementsSystem.updateProgress("multiplayer_ctf_master", 1);
                }
            } else {
                // Someone else captured a flag
                if (this.hud) {
                    this.hud.showNotification?.(`🏆 ${data.playerName} захватил флаг! Команда ${data.capturingTeam === 0 ? "синих" : "красных"} получает очко!`, "info");
                }
            }
        });
        
        this.multiplayerManager.onCTFFlagUpdate((data: any) => {
            // Update CTF flag visualization
            if (this.ctfVisualizer && data.flags) {
                this.ctfVisualizer.updateFlags(data.flags);
                
                // Update HUD with CTF info
                if (this.hud && this.tank && this.tank.chassis) {
                    const playerPos = this.tank.chassis.getAbsolutePosition();
                    const localPlayerId = this.multiplayerManager?.getPlayerId();
                    const localPlayer = this.multiplayerManager?.getNetworkPlayer(localPlayerId || "");
                    const playerTeam = localPlayer?.team;
                    
                    if (playerTeam !== undefined) {
                        const ownFlag = data.flags.find((f: any) => f.team === playerTeam);
                        const enemyFlag = data.flags.find((f: any) => f.team !== playerTeam);
                        
                        this.hud.updateCTFInfo?.({
                            ownFlag: ownFlag ? {
                                isCarried: ownFlag.isCarried,
                                carrierId: ownFlag.carrierId,
                                position: ownFlag.position
                            } : null,
                            enemyFlag: enemyFlag ? {
                                isCarried: enemyFlag.isCarried,
                                carrierId: enemyFlag.carrierId,
                                position: enemyFlag.position
                            } : null,
                            playerPosition: playerPos,
                            playerTeam
                        });
                    }
                }
            }
        });
        
        this.multiplayerManager.onPlayerStates((_players) => {
            // Update network players (called at 60 Hz)
            // This is handled in updateMultiplayer
        });
        
        this.multiplayerManager.onProjectileSpawn((data) => {
            // Record event for replay
            if (this.replayRecorder) {
                this.replayRecorder.recordServerMessage(ServerMessageType.PROJECTILE_SPAWN, data);
            }
            
            // Handle projectile spawn from other players
            if (this.effectsManager && data.position && data.direction) {
                const pos = new Vector3(data.position.x, data.position.y, data.position.z);
                const dir = new Vector3(data.direction.x, data.direction.y, data.direction.z);
                this.effectsManager.createMuzzleFlash(pos, dir, data.cannonType || "standard");
            }
        });
        
        this.multiplayerManager.onChatMessage((data) => {
            if (this.chatSystem) {
                this.chatSystem.addMessage(`${data.playerName}: ${data.message}`, "info");
            }
        });
        
        this.multiplayerManager.onConsumablePickup((data) => {
            // Handle consumable pickup confirmation from server
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            if (data.playerId === localPlayerId) {
                // We picked it up - process locally
                const consumableType = CONSUMABLE_TYPES.find(c => c.id === data.type);
                if (consumableType && this.consumablesManager) {
                    let slot = -1;
                    for (let s = 1; s <= 5; s++) {
                        if (!this.consumablesManager.get(s)) {
                            slot = s;
                            break;
                        }
                    }
                    if (slot > 0) {
                        this.consumablesManager.pickUp(consumableType, slot);
                        if (this.chatSystem) {
                            this.chatSystem.success(`Подобран: ${consumableType.icon} ${consumableType.name} (слот ${slot})`);
                        }
                        if (this.hud) {
                            this.hud.updateConsumables(this.consumablesManager.getAll());
                        }
                        if (this.soundManager) {
                            this.soundManager.playPickup();
                        }
                    }
                }
            }
            
            // Remove consumable from map (for all players)
            if (this.chunkSystem && data.consumableId) {
                const pickup = this.chunkSystem.consumablePickups.find(
                    p => ((p as any).mesh.metadata as any)?.consumableId === data.consumableId ||
                         (data.position && Math.abs((p as any).mesh.position.x - data.position.x) < 1 &&
                          Math.abs((p as any).mesh.position.z - data.position.z) < 1)
                );
                if (pickup) {
                    (pickup as any).mesh.dispose();
                    const index = this.chunkSystem.consumablePickups.indexOf(pickup);
                    if (index !== -1) {
                        this.chunkSystem.consumablePickups.splice(index, 1);
                    }
                }
            }
        });
        
        this.multiplayerManager.onEnemyUpdate((data) => {
            // Handle enemy updates for Co-op mode
            // This will sync server-controlled enemies with client
            if (data.enemies && this.isMultiplayer) {
                // Update or create enemy tanks based on server data
                // This is a simplified version - full implementation would create EnemyTank instances
                logger.log(`[Game] Received ${data.enemies.length} enemy updates`);
            }
        });
        
        this.multiplayerManager.onSafeZoneUpdate((data: any) => {
            // Update Battle Royale safe zone visualization
            if (this.battleRoyaleVisualizer && data) {
                const zoneData = {
                    center: new Vector3(data.center.x, data.center.y || 0, data.center.z),
                    radius: data.radius,
                    nextCenter: new Vector3(
                        data.nextCenter?.x || data.center.x, 
                        data.nextCenter?.y || 0, 
                        data.nextCenter?.z || data.center.z
                    ),
                    nextRadius: data.nextRadius || data.radius,
                    shrinkProgress: data.shrinkProgress || 0
                };
                this.battleRoyaleVisualizer.updateSafeZone(zoneData);
                
                // Check if player is outside safe zone and show warning
                if (this.tank && this.tank.chassis) {
                    const playerPos = this.tank.chassis.getAbsolutePosition();
                    const isInZone = this.battleRoyaleVisualizer.isPlayerInSafeZone(playerPos);
                    const distance = this.battleRoyaleVisualizer.getDistanceToSafeZone(playerPos);
                    
                    if (!isInZone && this.hud) {
                        this.hud.showNotification?.(`⚠️ Вне безопасной зоны! ${distance.toFixed(0)}м`, "warning");
                    }
                }
            }
        });
        
        this.multiplayerManager.onGameEnd((data) => {
            // Stop real-time stats tracking
            if (this.realtimeStatsTracker) {
                this.realtimeStatsTracker.stopMatch();
            }
            
            // Stop and save replay
            if (this.replayRecorder) {
                const replayData = this.replayRecorder.stopRecording();
                if (replayData) {
                    // Save replay to localStorage
                    const key = this.replayRecorder.saveReplay(replayData, false);
                    if (key) {
                        logger.log(`[Game] Replay saved: ${key}`);
                    }
                }
            }
            
            // Save match statistics to Firebase
            this.saveMatchStatistics(data);
        });
    }
    
    private createNetworkPlayerTank(playerData: any): void {
        if (this.networkPlayerTanks.has(playerData.id)) {
            return; // Already exists
        }
        
        const networkPlayer = this.multiplayerManager?.getNetworkPlayer(playerData.id);
        if (!networkPlayer) return;
        
        const tank = new NetworkPlayerTank(this.scene, networkPlayer);
        // Store reference to multiplayerManager for RTT access
        (tank as any).multiplayerManager = this.multiplayerManager;
        this.networkPlayerTanks.set(playerData.id, tank);
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
        this.networkPlayerTanks.forEach(tank => {
            tank.update(deltaTime);
        });
        
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
    
    createMultiplayerRoom(mode: string, maxPlayers: number = 32): void {
        if (this.multiplayerManager) {
            this.multiplayerManager.createRoom(mode as any, maxPlayers);
        }
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
                const serverUrl = (import.meta as any).env?.VITE_WS_SERVER_URL || "ws://localhost:8080";
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
    
    /**
     * Открыть панель настроек скриншотов
     */
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:8257',message:'openScreenshotPanel called',data:{hasScreenshotManager:!!this.screenshotManager,hasScreenshotPanel:!!this.screenshotPanel},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        try {
            // Ленивая загрузка ScreenshotManager и панели
            if (!this.screenshotManager) {
                logger.log("[Game] Loading screenshot manager (Ctrl+2)...");
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:8260',message:'Loading ScreenshotManager',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                const { ScreenshotManager } = await import("./screenshotManager");
                this.screenshotManager = new ScreenshotManager(this.engine, this.scene, this.hud || null);
                logger.log("[Game] Screenshot manager loaded successfully");
            }
            
            if (!this.screenshotPanel) {
                logger.log("[Game] Loading screenshot panel (Ctrl+2)...");
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:8267',message:'Loading ScreenshotPanel',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                const { ScreenshotPanel } = await import("./screenshotPanel");
                this.screenshotPanel = new ScreenshotPanel(this.screenshotManager, this);
                logger.log("[Game] Screenshot panel loaded successfully");
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:8274',message:'Calling screenshotPanel.toggle',data:{hasToggle:typeof this.screenshotPanel.toggle==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            this.screenshotPanel.toggle();
            logger.log("[Game] Screenshot panel toggled");
        } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.ts:8276',message:'ScreenshotPanel error',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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
    
    private async saveMatchStatistics(matchData: any): Promise<void> {
        if (!firebaseService.isInitialized()) {
            logger.warn("[Game] Firebase not initialized, skipping match statistics save");
            return;
        }
        
        try {
            const playerId = firebaseService.getUserId();
            if (!playerId) {
                logger.warn("[Game] No user ID, skipping match statistics save");
                return;
            }
            
            // Get current player stats
            const currentStats = await firebaseService.getPlayerStats();
            if (!currentStats) {
                logger.warn("[Game] Could not get current stats");
                return;
            }
            
            // Get player data from match
            const players = matchData.players || [];
            const localPlayer = players.find((p: any) => p.id === this.multiplayerManager?.getPlayerId());
            
            if (!localPlayer) {
                logger.warn("[Game] Local player not found in match data");
                return;
            }
            
            // Calculate match duration
            const matchDuration = matchData.duration || (Date.now() - (matchData.startTime || Date.now())) / 1000;
            
            // Determine match result
            const isWinner = matchData.winner === localPlayer.id || 
                            (matchData.winnerTeam && matchData.winnerTeam === localPlayer.team);
            const result: "win" | "loss" | "draw" = isWinner ? "win" : 
                                                      matchData.winner ? "loss" : "draw";
            
            // Update stats
            const statsUpdates: any = {
                kills: currentStats.kills + (localPlayer.kills || 0),
                deaths: currentStats.deaths + (localPlayer.deaths || 0),
                assists: currentStats.assists + (localPlayer.assists || 0),
                matchesPlayed: currentStats.matchesPlayed + 1,
                timePlayed: currentStats.timePlayed + matchDuration,
                shotsFired: currentStats.shotsFired + (localPlayer.shotsFired || 0),
                shotsHit: currentStats.shotsHit + (localPlayer.shotsHit || 0),
                damageDealt: currentStats.damageDealt + (localPlayer.damageDealt || 0),
                damageTaken: currentStats.damageTaken + (localPlayer.damageTaken || 0),
            };
            
            // Update wins/losses
            if (result === "win") {
                statsUpdates.wins = currentStats.wins + 1;
                // Mode-specific wins
                const mode = matchData.mode || "ffa";
                if (mode === "ffa") statsUpdates.ffaWins = (currentStats.ffaWins || 0) + 1;
                else if (mode === "tdm") statsUpdates.tdmWins = (currentStats.tdmWins || 0) + 1;
                else if (mode === "coop") statsUpdates.coopWins = (currentStats.coopWins || 0) + 1;
                else if (mode === "battle_royale") statsUpdates.brWins = (currentStats.brWins || 0) + 1;
                else if (mode === "capture_flag") statsUpdates.ctfWins = (currentStats.ctfWins || 0) + 1;
            } else if (result === "loss") {
                statsUpdates.losses = currentStats.losses + 1;
            } else {
                statsUpdates.draws = currentStats.draws + 1;
            }
            
            // Update kill streak
            if (localPlayer.kills > 0) {
                const newStreak = (currentStats.currentKillStreak || 0) + localPlayer.kills;
                statsUpdates.currentKillStreak = newStreak;
                if (newStreak > (currentStats.longestKillStreak || 0)) {
                    statsUpdates.longestKillStreak = newStreak;
                }
            } else {
                statsUpdates.currentKillStreak = 0;
            }
            
            // Save updated stats
            await firebaseService.updatePlayerStats(statsUpdates);
            
            // Save match history
            const matchHistory: MatchHistory = {
                matchId: matchData.matchId || `match_${Date.now()}`,
                mode: matchData.mode || "ffa",
                result: result,
                kills: localPlayer.kills || 0,
                deaths: localPlayer.deaths || 0,
                assists: localPlayer.assists || 0,
                damageDealt: localPlayer.damageDealt || 0,
                damageTaken: localPlayer.damageTaken || 0,
                duration: matchDuration,
                timestamp: Timestamp.fromMillis(Date.now()),
                players: players.length,
                team: localPlayer.team
            };
            
            await firebaseService.saveMatchHistory(matchHistory);
            
            logger.log("[Game] Match statistics saved to Firebase");
        } catch (error) {
            logger.error("[Game] Error saving match statistics:", error);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // АВТОСОХРАНЕНИЕ ПРИ ЗАКРЫТИИ СТРАНИЦЫ
    // ═══════════════════════════════════════════════════════════════════════════
    
    private setupAutoSaveOnUnload(): void {
        // Сохранение при закрытии/перезагрузке страницы
        const saveAllData = () => {
            this.saveAllGameData();
        };
        
        // beforeunload - срабатывает перед закрытием (можно показать предупреждение)
        window.addEventListener("beforeunload", () => {
            saveAllData();
            // Не показываем стандартное предупреждение, просто сохраняем
        });
        
        // pagehide - более надежный способ для мобильных устройств
        window.addEventListener("pagehide", () => {
            saveAllData();
        });
        
        // visibilitychange - когда вкладка становится невидимой (опционально)
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                // Сохраняем когда вкладка скрыта (но не при каждом изменении)
                // Можно добавить задержку чтобы не сохранять слишком часто
                setTimeout(() => {
                    if (document.hidden) {
                        this.saveAllGameData();
                    }
                }, 1000);
            }
        });
        
        logger.log("[Game] Auto-save on unload handlers registered");
    }
    
    // Централизованный метод для сохранения всех данных игры
    public saveAllGameData(): void {
        try {
            logger.log("[Game] Saving all game data...");
            
            // Сохраняем все системы
            if (this.playerProgression) {
                this.playerProgression.forceSave();
            }
            
            if (this.experienceSystem) {
                this.experienceSystem.forceSave();
            }
            
            if (this.garage) {
                this.garage.forceSave();
            }
            
            if (this.currencyManager) {
                this.currencyManager.forceSave();
            }
            
            if (this.achievementsSystem) {
                this.achievementsSystem.forceSave();
            }
            
            if (this.missionSystem) {
                this.missionSystem.forceSave();
            }
            
            if ((this as any).playerStatsSystem) {
                (this as any).playerStatsSystem.forceSave();
            }
            
            logger.log("[Game] All game data saved successfully");
        } catch (error) {
            logger.error("[Game] Error saving game data:", error);
        }
    }
}


