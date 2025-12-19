// ═══════════════════════════════════════════════════════════════════════════
// GAME CORE - Основная логика инициализации и жизненного цикла
// ═══════════════════════════════════════════════════════════════════════════

import { Engine, Scene, Vector3, HemisphericLight, Color3, StandardMaterial, Mesh } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { MapType, GameSettings } from "../menu";
import type { IGameCore } from "./types";

/**
 * GameCore - Базовая логика инициализации и жизненного цикла игры
 * 
 * Отвечает за:
 * - Конструктор и инициализацию
 * - Создание Engine, Scene, Canvas
 * - Базовую настройку сцены
 * - Lazy loading меню
 */
export class GameCore implements Partial<IGameCore> {
    engine!: Engine;
    scene!: Scene;
    canvas!: HTMLCanvasElement;
    gameInitialized = false;
    gameStarted = false;
    gamePaused = false;
    currentMapType: MapType = "normal";
    
    // Lazy-loaded модули
    protected mainMenu: any | undefined;
    
    // Настройки
    protected settings: GameSettings = {} as GameSettings;
    
    constructor() {
        // MainMenu will be loaded lazily when needed
        // Check for auto-start first
        const autoStartMap = localStorage.getItem("autoStartMap");
        if (autoStartMap) {
            // Auto-start: load menu immediately but don't show it
            this.currentMapType = autoStartMap as MapType;
            logger.log(`[Game] Auto-starting on map: ${autoStartMap}`);
            this.loadMainMenu().then(() => {
                const menu = this.mainMenu;
                if (menu) {
                    localStorage.removeItem("autoStartMap");
                    setTimeout(() => {
                        menu.triggerStartGame(this.currentMapType);
                    }, 100);
                }
            });
        } else {
            // Normal start: load and show menu
            this.loadMainMenu().then(() => {
                if (this.mainMenu) {
                    this.mainMenu.show();
                }
            });
        }
        
        // Setup menu callbacks after loading
        this.setupMenuCallbacks();
        
        // Обработчик для возобновления игры
        window.addEventListener("resumeGame", () => {
            this.togglePause();
        });
        
        // Обработчики для сохранения при закрытии страницы
        this.setupAutoSaveOnUnload();
        
        // Сохраняем экземпляр Game в window для доступа из Menu
        (window as any).gameInstance = this;
    }
    
    /**
     * Lazy load MainMenu
     */
    protected async loadMainMenu(): Promise<void> {
        if (this.mainMenu) return; // Already loaded
        
        try {
            const { MainMenu } = await import("../menu");
            this.mainMenu = new MainMenu();
            if (this.mainMenu) {
                this.settings = this.mainMenu.getSettings();
                this.setupMenuCallbacks();
                logger.log("[Game] MainMenu loaded");
            }
        } catch (error) {
            logger.error("[Game] Failed to load MainMenu:", error);
        }
    }
    
    /**
     * Setup menu callbacks after menu is loaded
     * Будет переопределен в Game.ts для полной функциональности
     */
    protected setupMenuCallbacks(): void {
        // Базовая реализация - будет расширена в Game.ts
    }
    
    /**
     * Setup auto-save on unload
     */
    protected setupAutoSaveOnUnload(): void {
        // Сохранение при закрытии/перезагрузке страницы
        const saveAllData = () => {
            this.saveAllGameData();
        };
        
        // beforeunload - срабатывает перед закрытием
        window.addEventListener("beforeunload", () => {
            saveAllData();
        });
        
        // pagehide - более надежный способ для мобильных устройств
        window.addEventListener("pagehide", () => {
            saveAllData();
        });
        
        // visibilitychange - когда вкладка становится невидимой
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                setTimeout(() => {
                    if (document.hidden) {
                        this.saveAllGameData();
                    }
                }, 1000);
            }
        });
        
        logger.log("[Game] Auto-save on unload handlers registered");
    }
    
    /**
     * Централизованный метод для сохранения всех данных игры
     */
    public saveAllGameData(): void {
        try {
            logger.log("[Game] Saving all game data...");
            // Базовая реализация - будет расширена в Game.ts
            logger.log("[Game] All game data saved successfully");
        } catch (error) {
            logger.error("[Game] Error saving game data:", error);
        }
    }
    
    /**
     * Toggle pause
     * Будет переопределен в Game.ts
     */
    protected togglePause(): void {
        // Базовая реализация
    }
    
    /**
     * Initialize Engine and Scene
     * Вызывается из init() в Game.ts
     */
    protected initializeEngineAndScene(): void {
        // Setup canvas
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.display = "block";
        this.canvas.style.position = "fixed";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.zIndex = "0";
        this.canvas.id = "gameCanvas";
        document.body.appendChild(this.canvas);
        
        // Определяем, находимся ли мы в production
        const isProduction = (import.meta as any).env?.PROD || false;
        
        this.engine = new Engine(this.canvas, true, {
            deterministicLockstep: false,
            lockstepMaxSteps: 4,
            useHighPrecisionMatrix: false,
            adaptToDeviceRatio: true,
            antialias: !isProduction,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            doNotHandleContextLost: true,
            premultipliedAlpha: false,
            alpha: false
        });
        
        this.engine.enableOfflineSupport = false;
        this.engine.setHardwareScalingLevel(1.0);
        
        // Оптимизация рендеринга
        this.engine.setSize(0, 0);
        
        this.scene = new Scene(this.engine, {
            useGeometryUniqueIdsMap: true,
            useMaterialMeshMap: true,
            useClonedMeshMap: true
        });
        
        this.scene.skipPointerMovePicking = true;
        this.scene.autoClear = true;
        this.scene.autoClearDepthAndStencil = true;
        
        // Дополнительные оптимизации для production
        if (isProduction) {
            this.scene.blockMaterialDirtyMechanism = true;
        }
        
        logger.log("[GameCore] Engine and Scene initialized");
    }
    
    /**
     * Apply basic scene optimizations
     * Вызывается из init() в Game.ts
     */
    protected applyBasicSceneOptimizations(): void {
        if (!this.scene) return;
        
        // === SCENE OPTIMIZATIONS ===
        this.scene.blockMaterialDirtyMechanism = true;
        this.scene.useRightHandedSystem = false;
        this.scene.fogEnabled = false;
        this.scene.lightsEnabled = true;
        this.scene.spritesEnabled = false;
        this.scene.texturesEnabled = true;
        this.scene.lensFlaresEnabled = false;
        this.scene.proceduralTexturesEnabled = false;
        this.scene.renderTargetsEnabled = true;
        this.scene.collisionsEnabled = false;
        
        this.scene.skipPointerMovePicking = true;
        this.scene.autoClear = true;
        this.scene.autoClearDepthAndStencil = true;
        this.scene.blockfreeActiveMeshesAndRenderingGroups = true;
        this.scene.skipFrustumClipping = false;
        this.scene.constantlyUpdateMeshUnderPointer = false;
        this.scene.forceShowBoundingBoxes = false;
        this.scene.forceWireframe = false;
        this.scene.forcePointsCloud = false;
        this.scene.useConstantAnimationDeltaTime = true;
        
        // Simple clear color
        this.scene.clearColor.set(0.12, 0.12, 0.14, 1);
        
        // Light - balanced hemispheric
        const light = new HemisphericLight("light1", new Vector3(0, 1, 0), this.scene);
        light.intensity = 0.65;
        light.specular = Color3.Black();
        light.diffuse = new Color3(0.9, 0.9, 0.85);
        light.groundColor = new Color3(0.25, 0.25, 0.28);
        
        logger.log("[GameCore] Basic scene optimizations applied");
    }
}

