import "@babylonjs/core/Debug/debugLayer";
import { logger } from "./utils/logger";
import { 
    Engine, 
    Scene, 
    Vector3, 
    HemisphericLight, 
    MeshBuilder, 
    Mesh,
    HavokPlugin,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType,
    StandardMaterial,
    Color3,
    ArcRotateCamera,
    UniversalCamera,
    Ray,
    Quaternion
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
import { DebugDashboard } from "./debugDashboard";
import { PhysicsPanel } from "./physicsPanel";
import { EnemyTank } from "./enemyTank";
import { MainMenu, GameSettings, MapType } from "./menu";
import { CurrencyManager } from "./currencyManager";
import { Garage } from "./garage";
import { ConsumablesManager, CONSUMABLE_TYPES } from "./consumables";
import { ChatSystem } from "./chatSystem";
import { ExperienceSystem } from "./experienceSystem";
import { PlayerProgressionSystem } from "./playerProgression";
import { AimingSystem } from "./aimingSystem";

export class Game {
    engine: Engine;
    scene: Scene;
    canvas: HTMLCanvasElement;
    tank: TankController | undefined;
    camera: ArcRotateCamera | undefined;
    aimCamera: UniversalCamera | undefined; // Отдельная камера для режима прицеливания
    hud: HUD | undefined;
    soundManager: SoundManager | undefined;
    effectsManager: EffectsManager | undefined;
    enemyManager: EnemyManager | undefined;
    
    // Chunk system for optimization
    chunkSystem: ChunkSystem | undefined;
    
    // Debug dashboard
    debugDashboard: DebugDashboard | undefined;
    
    // Physics panel
    physicsPanel: PhysicsPanel | undefined;
    
    // Enemy tanks
    enemyTanks: EnemyTank[] = [];
    
    // Currency manager
    currencyManager: CurrencyManager | undefined;
    
    // Consumables manager
    consumablesManager: ConsumablesManager | undefined;
    
    // Chat system
    chatSystem: ChatSystem | undefined;
    
    // Garage system
    garage: Garage | undefined;
    
    // Experience system
    experienceSystem: ExperienceSystem | undefined;
    
    // Player progression system
    playerProgression: PlayerProgressionSystem | undefined;
    
    // Aiming system
    aimingSystem: AimingSystem | undefined;
    
    // Позиция гаража игрока для респавна
    playerGaragePosition: Vector3 | null = null;
    
    // Таймеры респавна для гаражей (Map<garagePos, {timer: number, billboard: Mesh}>)
    private garageRespawnTimers: Map<string, { timer: number, billboard: Mesh | null, textBlock: any }> = new Map();
    private readonly RESPAWN_TIME = 180000; // 3 минуты в миллисекундах
    
    // Система захвата гаражей
    private garageCaptureProgress: Map<string, { progress: number, capturingPlayers: number }> = new Map();
    private readonly CAPTURE_TIME_SINGLE = 180; // 3 минуты в секундах для одного игрока
    private readonly CAPTURE_RADIUS = 3.0; // Радиус захвата в единицах
    private readonly PLAYER_ID = "player"; // ID игрока (в будущем будет из мультиплеера)
    
    // Main menu
    mainMenu: MainMenu;
    gameStarted = false;
    gamePaused = false;
    currentMapType: MapType = "normal";
    gameInitialized = false;
    
    // Stats overlay (Tab key - пункт 13)
    private statsOverlay: HTMLDivElement | null = null;
    private statsOverlayVisible = false;
    private experienceSubscription: any = null; // Подписка на изменения опыта для Stats Overlay (используется в строке 908)
    
    // Settings
    settings: GameSettings;
    
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
        // Create main menu first
        this.mainMenu = new MainMenu();
        this.settings = this.mainMenu.getSettings();
        
        // Показываем меню по умолчанию (игра запускается через меню)
        this.mainMenu.show();
        
        this.mainMenu.setOnStartGame(async (mapType?: MapType) => {
            if (mapType) {
                this.currentMapType = mapType;
            }
            
            // Инициализируем игру, если еще не инициализирована
            if (!this.gameInitialized) {
                console.log(`[Game] Initializing game with map type: ${this.currentMapType}`);
                await this.init();
                this.gameInitialized = true;
                logger.log("Game initialized successfully");
            } else {
                // Если игра уже инициализирована, но тип карты изменился, пересоздаем ChunkSystem
                if (mapType && this.chunkSystem) {
                    logger.log(`Recreating ChunkSystem for map type: ${mapType}`);
                    
                    // Очищаем старые враги
                    this.enemyTanks.forEach(enemy => {
                        if (enemy.chassis) enemy.chassis.dispose();
                    });
                    this.enemyTanks = [];
                    
                    // Пересоздаем ChunkSystem с новым типом карты
                    this.chunkSystem = new ChunkSystem(this.scene, {
                        chunkSize: 80,
                        renderDistance: 1.5,
                        unloadDistance: 4,
                        worldSeed: Math.floor(Math.random() * 1000000),
                        mapType: this.currentMapType
                    });
                    
                    // Обновляем ссылки
                    if (this.debugDashboard) {
                        this.debugDashboard.setChunkSystem(this.chunkSystem);
                    }
                    
                    // Обновляем чанки
                    const initialPos = new Vector3(0, 2, 0);
                    this.chunkSystem.update(initialPos);
                    
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
            
            this.startGame();
        });
        
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
        const isProduction = import.meta.env.PROD;
        
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
        window.addEventListener("keydown", (e) => {
            // Open/Close garage MENU with B key - В ЛЮБОЙ МОМЕНТ (даже до старта игры)
            if (e.code === "KeyB" || e.key === "b" || e.key === "B") {
                e.preventDefault(); // Предотвращаем другие обработчики
                e.stopPropagation(); // Останавливаем распространение события
                e.stopImmediatePropagation(); // Останавливаем все обработчики
                
                logger.debug("===== KeyB pressed =====");
                logger.debug("Event code:", e.code);
                logger.debug("Event key:", e.key);
                logger.debug("Garage exists:", !!this.garage);
                logger.debug("Game started:", this.gameStarted);
                
                // Функция для переключения гаража
                const toggleGarage = () => {
                if (!this.garage) {
                        logger.error("ERROR: Garage is null!");
                    return;
                }
                    
                    try {
                        const isCurrentlyOpen = this.garage.isGarageOpen();
                        console.log(`[Game] Garage isOpen: ${isCurrentlyOpen}`);
                        
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
                                    // Проверяем видимость GUI
                                    const garageUI = this.garage.getGUI();
                                    if (garageUI) {
                                        logger.debug("Garage GUI settings:", {
                                            isForeground: garageUI.isForeground,
                                            layerMask: garageUI.layer?.layerMask,
                                            rootContainerVisible: garageUI.rootContainer?.isVisible,
                                            rootContainerAlpha: garageUI.rootContainer?.alpha,
                                            controlsCount: garageUI.rootContainer?.children?.length || 0
                                        });
                                    } else {
                                        logger.error("✗ Garage GUI is null!");
                                    }
                                } else {
                                    logger.error("✗ Garage failed to open!");
                                }
                            }, 200);
                        }
                    } catch (error) {
                        logger.error("✗ Error toggling garage:", error);
                        logger.error("Error stack:", (error as Error).stack);
                    }
                };
                
                if (!this.garage) {
                    console.warn("[Game] Garage not initialized yet! Waiting for initialization...");
                    // Если garage еще не создан, ждем немного и пробуем снова
                    setTimeout(() => {
                        if (this.garage) {
                            logger.debug("Garage now available, toggling...");
                            toggleGarage();
                        } else {
                            logger.error("Garage still not available after timeout!");
                        }
                    }, 300);
                return;
            }
            
                toggleGarage();
                return;
            }
            
            // Ручное управление воротами гаража клавишей G (только во время игры)
            if (e.code === "KeyG" && this.gameStarted && this.chunkSystem && this.chunkSystem.garageDoors) {
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
                            
                            // Получаем направление пушки
                            this.tank.chassis.computeWorldMatrix(true);
                            this.tank.turret.computeWorldMatrix(true);
                            this.tank.barrel.computeWorldMatrix(true);
                            const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
                            
                            // Позиции ворот (передняя и задняя)
                            const garagePos = doorData.position;
                            const garageDepth = doorData.garageDepth || 20; // Глубина гаража из данных
                            const frontDoorPos = new Vector3(garagePos.x, 0, garagePos.z + garageDepth / 2);
                            const backDoorPos = new Vector3(garagePos.x, 0, garagePos.z - garageDepth / 2);
                            
                            // Направления от игрока к воротам
                            const toFrontDoor = frontDoorPos.subtract(new Vector3(playerPos.x, 0, playerPos.z)).normalize();
                            const toBackDoor = backDoorPos.subtract(new Vector3(playerPos.x, 0, playerPos.z)).normalize();
                            
                            // Скалярное произведение для определения, какая ворота ближе к направлению взгляда
                            const frontDot = Vector3.Dot(barrelDir, toFrontDoor);
                            const backDot = Vector3.Dot(barrelDir, toBackDoor);
                            
                            // Открываем/закрываем только ту ворота, на которую смотрит пушка
                            if (frontDot > backDot) {
                                // Передняя ворота ближе к направлению взгляда
                                doorData.frontDoorOpen = !doorData.frontDoorOpen;
                                logger.debug(`Front garage door ${doorData.frontDoorOpen ? 'opening' : 'closing'} manually (G key)`);
                            } else {
                                // Задняя ворота ближе к направлению взгляда
                                doorData.backDoorOpen = !doorData.backDoorOpen;
                                logger.debug(`Back garage door ${doorData.backDoorOpen ? 'opening' : 'closing'} manually (G key)`);
                            }
                            
                            // Ворота остаются в выбранном состоянии (ручное управление постоянно активно)
                            doorData.manualControl = true;
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
            
            // Показать/скрыть System Terminal (F5)
            if (e.code === "F5" && this.chatSystem) {
                e.preventDefault();
                this.chatSystem.toggleTerminal();
                return;
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
            
            
            if (e.code === "Escape" && this.gameStarted) {
                this.togglePause();
            }
            
            // Обработка клавиш 1-5 для припасов
            if (this.gameStarted && this.tank && this.consumablesManager) {
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
        });
        
        // КРИТИЧЕСКИ ВАЖНО: Подписка на onAfterPhysicsObservable будет добавлена в init() после создания сцены и включения физики
        
        // Оптимизированный render loop с проверкой готовности
        this.engine.runRenderLoop(() => {
            if (this.scene && this.engine) {
                // КРИТИЧЕСКИ ВАЖНО: Проверяем наличие активной камеры перед рендерингом
                // Если камера не создана, создаем временную камеру по умолчанию
                if (!this.scene.activeCamera) {
                    if (this.camera) {
                        this.scene.activeCamera = this.camera;
                    } else if (this.scene) {
                        // Создаем временную камеру по умолчанию, если камера еще не создана
                        this.scene.createDefaultCamera(true);
                        logger.warn("Created default camera for render loop");
                    } else {
                        // Если сцена еще не создана, пропускаем рендеринг
                        return;
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
            // Если сцена или engine не созданы, просто пропускаем рендеринг
        });

        window.addEventListener("resize", () => {
            this.engine.resize();
        });
        
        // Слушаем изменения видимости меню и обновляем pointer-events для canvas
        window.addEventListener("menuVisibilityChanged", () => {
            this.updateCanvasPointerEvents();
        });
        
        // Периодическая проверка видимости меню (на случай если событие не сработало)
        setInterval(() => {
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
    
    startGame(): void {
        logger.log("startGame() called, mapType:", this.currentMapType);
        this.gameStarted = true;
        this.gamePaused = false;
        this.settings = this.mainMenu.getSettings();
        
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
            console.log("[Game] Camera controls already set up");
            console.log("[Game] Camera position:", this.camera.position);
            console.log("[Game] Camera target:", this.camera.getTarget());
            
            // Убеждаемся, что камера видна
            if (this.tank && this.tank.chassis) {
                // Используем getAbsolutePosition() для получения актуальной позиции
                const tankPos = this.tank.chassis.getAbsolutePosition();
                const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                this.camera.setTarget(lookAt);
                this.camera.radius = 12;
            }
            
            // Принудительно обновляем камеру сразу
            this.updateCamera();
        } else {
            logger.error("ERROR: Camera or scene not initialized!", {
                camera: !!this.camera,
                scene: !!this.scene
            });
        }
        
        // Убеждаемся, что сцена готова к рендерингу
        if (this.scene) {
            console.log("[Game] Scene ready, meshes count:", this.scene.meshes.length);
            console.log("[Game] Scene active camera:", this.scene.activeCamera?.name);
        }
        
        // Проверяем, что меню скрыто
        const menu = document.getElementById("main-menu");
        if (menu) {
            console.log("[Game] Menu element found, hidden:", menu.classList.contains("hidden"));
            if (!menu.classList.contains("hidden")) {
                menu.classList.add("hidden");
                menu.style.display = "none"; // Принудительно скрываем
                console.log("[Game] Menu hidden manually");
            }
        }
        
        // Проверяем, что панель выбора карт скрыта
        const mapSelectionPanel = document.getElementById("map-selection-panel");
        if (mapSelectionPanel) {
            console.log("[Game] Map selection panel found, visible:", mapSelectionPanel.classList.contains("visible"));
            mapSelectionPanel.classList.remove("visible");
            mapSelectionPanel.style.display = "none"; // Принудительно скрываем
            console.log("[Game] Map selection panel hidden manually");
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
                    console.log("[Game] Starting engine sound immediately...");
            this.soundManager.startEngine();
                    // Сразу обновляем звук на холостом ходу для гарантии слышимости
                    if (this.tank && this.tank.chassis) {
                        const pos = this.tank.chassis.absolutePosition;
                        this.soundManager.updateEngine(0, 0, pos); // Холостой ход
                    }
                }
            }, 100); // Engine starts after 0.1 seconds (почти сразу)
        }
        
        console.log("[Game] Started! gameStarted:", this.gameStarted, "gamePaused:", this.gamePaused);
    }
    
    togglePause(): void {
        if (!this.gameStarted) return;
        
        this.gamePaused = !this.gamePaused;
        
        if (this.gamePaused) {
            // Закрываем карту при паузе
            if (this.hud && this.hud.isFullMapVisible()) {
                this.hud.toggleFullMap();
            }
            this.mainMenu.show();
        } else {
            this.mainMenu.hide();
        }
        
        // Обновляем pointer-events для canvas в зависимости от видимости меню
        this.updateCanvasPointerEvents();
        
        console.log(`[Game] ${this.gamePaused ? "Paused" : "Resumed"}`);
    }

    async init() {
        try {
            console.log(`[Game] init() called with mapType: ${this.currentMapType}`);
            
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
            this.scene.shadowsEnabled = false; // NO shadows!
            this.scene.particlesEnabled = false; // NO particles!
            this.scene.spritesEnabled = false;
            this.scene.texturesEnabled = true;
            this.scene.lensFlaresEnabled = false;
            this.scene.proceduralTexturesEnabled = false;
            this.scene.renderTargetsEnabled = false;
            this.scene.collisionsEnabled = false; // We use physics instead
            
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
            console.log("Light created (balanced, no specular)");

            // Physics
            console.log("Loading Havok WASM...");
            const havokInstance = await HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" });
            console.log("Havok WASM loaded");
            const havokPlugin = new HavokPlugin(true, havokInstance);
            this.scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
            console.log("Physics enabled");
            
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
            console.log("[Game] Camera update subscribed to onAfterPhysicsObservable");

            // Ground - infinite looking but actually bounded
            const ground = MeshBuilder.CreateBox("ground", { width: 1000, height: 10, depth: 1000 }, this.scene);
            ground.position.y = -5;
            
            const groundMat = new StandardMaterial("groundMat", this.scene);
            groundMat.diffuseColor = new Color3(0.3, 0.3, 0.3); // Сделаем землю светлее, чтобы была видна
            groundMat.specularColor = Color3.Black();
            groundMat.freeze(); // Optimize
            ground.material = groundMat;
            ground.freezeWorldMatrix();
            ground.isVisible = true; // Убеждаемся, что земля видима
            console.log("[Game] Ground created and visible");
            
            const groundAgg = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            if (groundAgg.shape) {
                groundAgg.shape.filterMembershipMask = 2;
                groundAgg.shape.filterCollideMask = 0xFFFFFFFF;
            }

            // Create Tank (spawn close to ground - hover height is ~1.0)
            this.tank = new TankController(this.scene, new Vector3(0, 1.2, 0));
            
            // Устанавливаем callback для респавна в гараже
            this.tank.setRespawnPositionCallback(() => this.getPlayerGaragePosition());
            
            // КРИТИЧЕСКИ ВАЖНО: Создаем камеру ДО HUD, чтобы она была доступна даже при ошибках
            const cameraPos = this.tank?.chassis?.position || new Vector3(0, 2, 0);
            this.camera = new ArcRotateCamera("camera1", -Math.PI / 2, this.cameraBeta, 12, cameraPos, this.scene);
            this.camera.lowerRadiusLimit = 5;
            this.camera.upperRadiusLimit = 25;
            this.camera.lowerBetaLimit = 0.1;
            this.camera.upperBetaLimit = Math.PI / 2.1;
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
            console.log("[Game] Camera created and set as active");
            
            // Create HUD (может вызвать ошибку, но камера уже создана)
            try {
                this.hud = new HUD(this.scene);
                this.tank.setHUD(this.hud);
            } catch (e) {
                logger.error("HUD creation error:", e);
                // Продолжаем без HUD
            }
            
            // Initialize currency display
            if (this.currencyManager && this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
            }
            
            // Create Sound Manager
            this.soundManager = new SoundManager();
            this.tank.setSoundManager(this.soundManager);
            
            // Set intro sound callback for menu
            // ОТКЛЮЧЕНО: playIntroSound()
            this.mainMenu.setOnPlayIntroSound(() => {
                if (this.soundManager) {
                    // this.soundManager.playIntroSound(); // Отключено
                }
            });
            
            // Create Effects Manager
            this.effectsManager = new EffectsManager(this.scene);
            this.tank.setEffectsManager(this.effectsManager);
            
            // Подключаем тряску камеры
            this.tank.setCameraShakeCallback((intensity: number) => {
                this.addCameraShake(intensity);
            });
            
            // Create Currency Manager
            this.currencyManager = new CurrencyManager();
            
            // Create Consumables Manager
            this.consumablesManager = new ConsumablesManager();
            
            // Create Chat System
            this.chatSystem = new ChatSystem(this.scene);
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
            
            // СВЯЗЫВАЕМ ExperienceSystem с PlayerProgressionSystem для передачи опыта
            if (this.experienceSystem) {
                this.experienceSystem.setPlayerProgression(this.playerProgression);
            }
            
            // Subscribe to experience changes for Stats Overlay updates
            if (this.playerProgression && this.playerProgression.onExperienceChanged) {
                console.log("[Game] Subscribing to experience changes for Stats Overlay");
                this.experienceSubscription = this.playerProgression.onExperienceChanged.add((data: {
                    current: number;
                    required: number;
                    percent: number;
                    level: number;
                }) => {
                    console.log("[Game] Experience changed event received for Stats Overlay:", data);
                    // Обновляем Stats Overlay, если он открыт
                    if (this.statsOverlayVisible && this.statsOverlay) {
                        this.updateStatsOverlay();
                    }
                });
            } else {
                console.warn("[Game] Cannot subscribe to experience changes - playerProgression or onExperienceChanged is null");
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
            
            // Create Garage System
            this.garage = new Garage(this.scene, this.currencyManager);
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
            
            // Connect chat system to tank
            if (this.tank && this.chatSystem) {
                this.tank.chatSystem = this.chatSystem;
            }
            
            // Connect experience system to tank
            if (this.tank && this.experienceSystem) {
                this.tank.experienceSystem = this.experienceSystem;
            }
            
            // Connect aiming system to tank
            if (this.tank && this.aimingSystem) {
                this.aimingSystem.setTank(this.tank);
            }
            
            // Connect player progression to tank
            if (this.tank && this.playerProgression) {
                this.tank.playerProgression = this.playerProgression;
            }
            
            // Create Enemy Manager (for turrets)
            this.enemyManager = new EnemyManager(this.scene);
            this.enemyManager.setPlayer(this.tank);
            this.enemyManager.setEffectsManager(this.effectsManager);
            this.enemyManager.setSoundManager(this.soundManager);
            
            // Connect enemy manager to tank for hit detection
            this.tank.setEnemyManager(this.enemyManager);
            
            // Connect kill counter and currency
            this.enemyManager.setOnTurretDestroyed(() => {
                console.log("[GAME] Turret destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                    console.log("[GAME] Kill added to HUD (turret)");
                }
                // Начисляем валюту за уничтожение турели
                if (this.currencyManager) {
                    const reward = 50;
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
            logger.log(`Creating ChunkSystem with mapType: ${this.currentMapType}`);
            // В production используем более агрессивные настройки производительности
            const isProduction = import.meta.env.PROD;
            this.chunkSystem = new ChunkSystem(this.scene, {
                chunkSize: 80,          // HUGE chunks = fewer chunks
                renderDistance: isProduction ? 1.2 : 1.5,       // Еще меньше в production
                unloadDistance: 4,       // Уменьшено с 5 до 4
                worldSeed: Math.floor(Math.random() * 1000000),
                mapType: this.currentMapType
            });
            logger.log(`Chunk system created with ${this.chunkSystem.garagePositions.length} garages`);
            
            // КРИТИЧЕСКИ ВАЖНО: Запускаем генерацию чанков сразу, чтобы гаражи начали генерироваться
            // Используем позицию танка (0, 2, 0) для начальной генерации
            const initialPos = new Vector3(0, 2, 0);
            this.chunkSystem.update(initialPos);
            
            // === DEBUG DASHBOARD ===
            this.debugDashboard = new DebugDashboard(this.engine, this.scene);
            this.debugDashboard.setChunkSystem(this.chunkSystem);
            console.log("Debug dashboard created (F3 to toggle)");
            
            // === PHYSICS PANEL ===
            this.physicsPanel = new PhysicsPanel();
            if (this.tank) {
                this.physicsPanel.setTank(this.tank);
            }
            // Physics panel created (F4 to toggle)
            
            // Камера уже создана выше, обновляем только позицию после спавна

            // Ждём генерации гаражей перед спавном (камера уже создана)
            // Starting waitForGaragesAndSpawn
            this.waitForGaragesAndSpawn();

            // Game initialized - Press F3 for debug info
            // Scene meshes count logged (disabled for performance)
            logger.debug("Active camera:", this.scene.activeCamera?.name);
        } catch (e) {
            logger.error("Game init error:", e);
        }
    }
    
    spawnEnemyTanks() {
        // Не спавним врагов в режиме песочницы
        if (this.currentMapType === "sandbox") {
            console.log("[Game] Sandbox mode: Enemy tanks disabled");
            return;
        }
        
        if (!this.soundManager || !this.effectsManager) return;
        
        // Для полигона - спавним ботов в зоне боя (юго-восточный квадрант)
        if (this.currentMapType === "polygon") {
            this.spawnPolygonTrainingBots();
            return;
        }
        
        // Разбрасываем врагов по всей карте случайным образом
        const minDistance = 60; // Минимальное расстояние от центра
        const maxDistance = 180; // Максимальное расстояние от центра
        const enemyCount = 7;
        
        const spawnPositions: Vector3[] = [];
        
        // Генерируем случайные позиции
        for (let i = 0; i < enemyCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                // Случайный угол и расстояние
                const angle = Math.random() * Math.PI * 2;
                const distance = minDistance + Math.random() * (maxDistance - minDistance);
                
                pos = new Vector3(
                    Math.cos(angle) * distance,
                    1.2,  // Spawn close to ground
                    Math.sin(angle) * distance
                );
                
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
        
        spawnPositions.forEach((pos) => {
            // Используем сложность из настроек меню
            const difficulty = this.mainMenu?.getSettings().enemyDifficulty || "medium";
            const enemyTank = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, difficulty);
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // On death
            enemyTank.onDeathObservable.add(() => {
                console.log("[GAME] Enemy tank destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                    console.log("[GAME] Kill added to HUD");
                }
                // Начисляем валюту
                const reward = 100;
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(reward);
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                        this.hud.showMessage(`+${reward} кредитов!`, "#ffaa00", 2000);
                    }
                }
                // Добавляем опыт за убийство танка
                if (this.experienceSystem && this.tank) {
                    this.experienceSystem.recordKill(
                        this.tank.chassisType.id,
                        this.tank.cannonType.id,
                        false
                    );
                }
                // Записываем в прогресс игрока
                if (this.playerProgression) {
                    this.playerProgression.recordKill();
                    this.playerProgression.addCredits(reward);
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
        });
        
        console.log(`Spawned ${this.enemyTanks.length} enemy tanks`);
    }
    
    // Спавн тренировочных ботов для режима полигона
    spawnPolygonTrainingBots() {
        if (!this.soundManager || !this.effectsManager) return;
        
        console.log("[Game] Polygon mode: Spawning training bots in combat zone");
        
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
                pos = new Vector3(
                    combatZoneMinX + Math.random() * (combatZoneMaxX - combatZoneMinX),
                    1.2,
                    combatZoneMinZ + Math.random() * (combatZoneMaxZ - combatZoneMinZ)
                );
                
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
            const enemyTank = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, difficulty);
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // При уничтожении - быстрый респавн для тренировки
            enemyTank.onDeathObservable.add(() => {
                console.log("[GAME] Training bot destroyed!");
                if (this.hud) {
                    this.hud.addKill();
                }
                // Меньше награда за тренировочных ботов
                const reward = 50;
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(reward);
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                        this.hud.showMessage(`+${reward} кредитов (тренировка)`, "#ffaa00", 2000);
                    }
                }
                // Добавляем опыт
                if (this.experienceSystem && this.tank) {
                    const expGain = 15; // Меньше опыта за тренировочных ботов
                    this.experienceSystem.addExperience(expGain);
                    console.log(`[GAME] Training bot XP added: ${expGain}`);
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
                        
                        const newBot = new EnemyTank(this.scene, newPos, this.soundManager!, this.effectsManager!, "easy");
                        if (this.tank) {
                            newBot.setTarget(this.tank);
                        }
                        this.enemyTanks.push(newBot);
                        console.log("[GAME] Training bot respawned");
                    }
                }, 30000); // 30 секунд
            });
            
            this.enemyTanks.push(enemyTank);
        });
        
        console.log(`[Game] Polygon: Spawned ${this.enemyTanks.length} training bots`);
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
                console.error("[Game] ChunkSystem became undefined!");
                this.spawnEnemyTanks();
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
                }
                return;
            }
            
            // Если гаражи есть (хотя бы 1), спавним игрока в гараже
            if (this.chunkSystem.garagePositions.length >= 1) {
                console.log(`[Game] Found ${this.chunkSystem.garagePositions.length} garages, spawning player...`);
                // Спавним игрока в гараже (ВСЕГДА в гараже!)
                this.spawnPlayerInGarage();
                
                // КРИТИЧЕСКИ ВАЖНО: Обновляем позицию камеры после спавна танка
                if (this.camera && this.tank && this.tank.chassis) {
                    // Используем getAbsolutePosition() для получения актуальной позиции
                    const tankPos = this.tank.chassis.getAbsolutePosition();
                    const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                    this.camera.setTarget(lookAt);
                    this.camera.radius = 12;
                    this.camera.alpha = -Math.PI / 2; // Сброс угла камеры
                    this.camera.beta = this.cameraBeta; // Используем сохраненный угол
                    
                    // Инициализируем угол корпуса для отслеживания поворота
                    this.lastChassisRotation = this.tank.chassis.rotationQuaternion 
                        ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                        : this.tank.chassis.rotation.y;
                    
                    console.log("[Game] Camera updated after spawn:", {
                        target: this.camera.getTarget(),
                        position: this.camera.position,
                        radius: this.camera.radius,
                        alpha: this.camera.alpha,
                        beta: this.camera.beta
                    });
                }
                
                // Спавним врагов через 5 секунд
                console.log("[Game] Delaying enemy spawn by 5 seconds...");
                setTimeout(() => {
                    if (!this.playerGaragePosition) {
                        console.error("[Game] Player garage not set!");
                        return;
                    }
                    if (this.chunkSystem && this.chunkSystem.garagePositions.length >= 2) {
                        console.log("[Game] Spawning enemies...");
                    this.spawnEnemiesInGarages();
                        if (this.tank) {
                            this.tank.setEnemyTanks(this.enemyTanks);
                        }
                    }
                }, 5000);
                
                // Connect enemy tanks to tank for hit detection
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
                }
                console.log(`[Game] Player spawned in garage at ${this.playerGaragePosition?.x.toFixed(1)}, ${this.playerGaragePosition?.z.toFixed(1)} (total garages: ${this.chunkSystem.garagePositions.length})`);
                console.log(`[Game] Enemy tanks spawned: ${this.enemyTanks.length}`);
                console.log(`[Game] Total scene meshes: ${this.scene.meshes.length}`);
            } else if (attempts >= maxAttempts) {
                // Таймаут - спавним игрока
                console.warn("[Game] Garage generation timeout");
                this.spawnPlayerInGarage();
                
                // Враги спавнятся ТОЛЬКО в других гаражах с БОЛЬШОЙ задержкой
                if (this.chunkSystem && this.chunkSystem.garagePositions.length >= 2 && this.playerGaragePosition) {
                    console.log("[Game] (Timeout) Delaying enemy spawn by 5 seconds...");
                    setTimeout(() => {
                        if (this.playerGaragePosition) {
                            this.spawnEnemiesInGarages();
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
                            }
                        } else {
                            console.error("[Game] (Timeout) Player garage STILL not set!");
                        }
                    }, 5000);
                } else {
                    console.log("[Game] (Timeout) Not enough garages or player garage not set");
                }
            } else {
                // Продолжаем ждать
                setTimeout(checkGarages, 100);
            }
        };
        
        // Начинаем проверку сразу (гараж уже создан в ChunkSystem)
        setTimeout(checkGarages, 100);
    }
    
    // Спавн игрока в случайном гараже
    spawnPlayerInGarage() {
        if (!this.tank) {
            console.warn("[Game] Tank not initialized");
            return;
        }
        
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            console.warn("[Game] No garages available, using default spawn at (0, 2, 0)");
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
        let playerGarage: Vector3 = this.chunkSystem.garagePositions[0];
        let minDist = Infinity;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const dist = Math.sqrt(garage.x * garage.x + garage.z * garage.z);
            if (dist < minDist) {
                minDist = dist;
                playerGarage = garage;
            }
        }
        
        console.log(`[Game] Selected player garage at (${playerGarage.x.toFixed(1)}, ${playerGarage.z.toFixed(1)}) - distance from center: ${minDist.toFixed(1)}`);
        
        
        // Сохраняем позицию гаража для респавна (ВСЕГДА в этом же гараже!)
        this.playerGaragePosition = playerGarage.clone(); // Клонируем чтобы избежать проблем с ссылками
        console.log(`[Game] Garage position saved for respawn: (${this.playerGaragePosition.x.toFixed(2)}, ${this.playerGaragePosition.y.toFixed(2)}, ${this.playerGaragePosition.z.toFixed(2)})`);
        
        // Перемещаем танк в гараж
        if (this.tank.chassis && this.tank.physicsBody) {
            // КРИТИЧЕСКИ ВАЖНО: Убеждаемся что физика активна
            if (this.tank.physicsBody.motionType !== PhysicsMotionType.DYNAMIC) {
                this.tank.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            }
            
            // Устанавливаем позицию
            this.tank.chassis.position.copyFrom(playerGarage);
            
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
        
        console.log(`[Game] Player spawned in garage at ${playerGarage.x.toFixed(1)}, ${playerGarage.z.toFixed(1)}`);
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
                const dist = Vector3.Distance(
                    new Vector3(playerPos.x, 0, playerPos.z), 
                    new Vector3(garage.x, 0, garage.z)
                );
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestGarage = garage;
                }
            }
            
            if (nearestGarage) {
                console.log(`[Game] Found nearest garage at distance ${nearestDistance.toFixed(1)}m: (${nearestGarage.x.toFixed(2)}, ${nearestGarage.y.toFixed(2)}, ${nearestGarage.z.toFixed(2)})`);
                return nearestGarage.clone();
            }
        }
        
        // Fallback: используем сохранённую позицию
        if (this.playerGaragePosition) {
            console.log(`[Game] Using saved garage position: (${this.playerGaragePosition.x.toFixed(2)}, ${this.playerGaragePosition.y.toFixed(2)}, ${this.playerGaragePosition.z.toFixed(2)})`);
            return this.playerGaragePosition.clone();
        }
        
        // Последний fallback: центр гаража по умолчанию
        console.warn(`[Game] No garage found, using default position (0, 2, 0)`);
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
            
            // Исключаем гараж игрока и близлежащие гаражи (минимум 100 единиц!)
            if (this.playerGaragePosition) {
                const distToPlayerGarage = Vector3.Distance(garage, this.playerGaragePosition);
                if (distToPlayerGarage < 100) continue; // Минимум 100 единиц от гаража игрока
            }
            
            const dist = Vector3.Distance(fromPos, garage);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestGarage = garage;
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
            // Исключаем гараж игрока и близлежащие гаражи (минимум 100 единиц!)
            if (this.playerGaragePosition) {
                const distToPlayerGarage = Vector3.Distance(garage, this.playerGaragePosition);
                if (distToPlayerGarage < 100) continue; // Минимум 100 единиц от гаража игрока
            }
            
            const dist = Vector3.Distance(fromPos, garage);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestGarage = garage;
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
            logger.warn("No garages available, NOT spawning enemies!");
            return; // НЕ используем fallback - враги НЕ спавнятся без гаражей!
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Если гараж игрока ещё не определён, НЕ СПАВНИМ врагов!
        if (!this.playerGaragePosition) {
            logger.error("CRITICAL: Player garage NOT SET! Aborting enemy spawn!");
            return;
        }
        
        console.log(`[Game] === ENEMY SPAWN CHECK ===`);
        console.log(`[Game] Player garage position: (${this.playerGaragePosition.x.toFixed(1)}, ${this.playerGaragePosition.z.toFixed(1)})`);
        console.log(`[Game] Total garages in world: ${this.chunkSystem.garagePositions.length}`);
        
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
                console.log(`[Game] EXCLUDING garage too close to player (${distToPlayer.toFixed(1)}m): (${garage.x.toFixed(1)}, ${garage.z.toFixed(1)})`);
            } else {
                console.log(`[Game] AVAILABLE garage for enemies (${distToPlayer.toFixed(1)}m away): (${garage.x.toFixed(1)}, ${garage.z.toFixed(1)})`);
            }
            
            return !isTooCloseToPlayer;
        });
        
        console.log(`[Game] Player garage: (${playerGarageX.toFixed(1)}, ${playerGarageZ.toFixed(1)}), Available garages for enemies: ${availableGarages.length}/${this.chunkSystem.garagePositions.length}`);
        
        // Спавним бота в каждом доступном гараже (максимум 8 ботов)
        const enemyCount = Math.min(8, availableGarages.length);
        
        // Перемешиваем гаражи
        for (let i = availableGarages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableGarages[i], availableGarages[j]] = [availableGarages[j], availableGarages[i]];
        }
        
        // Спавним врагов в первых N гаражах
        for (let i = 0; i < enemyCount; i++) {
            const garagePos = availableGarages[i];
            // Используем сложность из настроек меню
            const difficulty = this.mainMenu?.getSettings().enemyDifficulty || "medium";
            const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, difficulty);
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // Store garage position for this tank
            const enemyGaragePos = garagePos.clone();
            
            // On death
            enemyTank.onDeathObservable.add(() => {
                console.log("[GAME] Enemy tank destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                }
                    const reward = 100;
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
        
        console.log(`[Game] Spawned ${this.enemyTanks.length} enemy tanks in garages`);
    }
    
    respawnEnemyTank(garagePos: Vector3) {
        if (!this.soundManager || !this.effectsManager) return;
        
        // DOUBLE CHECK: Don't spawn in player's garage!
        if (this.playerGaragePosition) {
            const distToPlayer = Vector3.Distance(garagePos, this.playerGaragePosition);
            if (distToPlayer < 100) {
                console.log(`[Game] BLOCKED: Enemy respawn too close to player garage (${distToPlayer.toFixed(1)}m)`);
                return;
            }
        }
        
        // Используем сложность из настроек меню
        const difficulty = this.mainMenu?.getSettings().enemyDifficulty || "medium";
        const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, difficulty);
        if (this.tank) {
            enemyTank.setTarget(this.tank);
        }
        
        // Store the garage position for this tank (for respawn)
        const spawnGaragePos = garagePos.clone();
        
        enemyTank.onDeathObservable.add(() => {
            console.log("[GAME] Enemy tank destroyed (respawn)! Adding kill...");
            if (this.hud) {
                this.hud.addKill();
            }
            const reward = 100;
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
        console.log(`[Game] Enemy tank respawned at garage (${garagePos.x.toFixed(1)}, ${garagePos.z.toFixed(1)})`);
    }
    
    // Find any garage far from player (minimum 100 units)
    findGarageFarFromPlayer(): Vector3 | null {
        if (!this.chunkSystem || !this.playerGaragePosition) return null;
        
        for (const garage of this.chunkSystem.garagePositions) {
            const dist = Vector3.Distance(garage, this.playerGaragePosition);
            if (dist >= 100) {
                return garage.clone();
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
                console.log(`[Game] Not starting respawn timer near player garage (${distToPlayer.toFixed(1)}m away)`);
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
                    const x = parseFloat(parts[0]);
                    const z = parseFloat(parts[1]);
                    if (!isNaN(x) && !isNaN(z)) {
                        // КРИТИЧЕСКИ ВАЖНО: Не респавним врага рядом с гаражом игрока!
                        if (this.playerGaragePosition) {
                            const garagePos = new Vector3(x, 0, z);
                            const distToPlayer = Vector3.Distance(garagePos, new Vector3(this.playerGaragePosition.x, 0, this.playerGaragePosition.z));
                            if (distToPlayer < 30) {
                                console.log(`[Game] Skipping enemy respawn too close to player (${distToPlayer.toFixed(1)}m away)`);
                                // Удаляем таймер без респавна
                                if (data.billboard) {
                                    data.billboard.dispose();
                                }
                                this.garageRespawnTimers.delete(key);
                                return;
                            }
                        }
                        
                        const garagePos = new Vector3(x, 1.2, z);  // Spawn close to ground
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
                garageData.walls.forEach(wall => {
                    if (wall) {
                        wall.visibility = 0.3; // 70% прозрачность (сразу, без интерполяции)
                    }
                });
                console.log(`[Game] Player garage walls set to 70% transparency immediately`);
            }
        });
    }
    
    // Обновление прозрачности стен гаражей (когда игрок внутри)
    updateGarageWallsTransparency(): void {
        if (!this.chunkSystem || !this.chunkSystem.garageWalls || !this.tank || !this.tank.chassis) return;
        
        const playerPos = this.tank.chassis.absolutePosition;
        
        this.chunkSystem.garageWalls.forEach(garageData => {
            const garagePos = garageData.position;
            const garageWidth = garageData.width;
            const garageDepth = garageData.depth;
            
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
            
            garageData.walls.forEach(wall => {
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
        const doorSpeed = 0.12; // Скорость открытия/закрытия (немного медленнее для более плавной анимации)
        
        this.chunkSystem.garageDoors.forEach(doorData => {
            if (!doorData.frontDoor || !doorData.backDoor) return;
            
            // === АВТООТКРЫТИЕ ВОРОТ ДЛЯ БОТОВ ===
            // Проверяем приближение вражеских танков к воротам
            const doorOpenDistance = 12; // Дистанция для открытия ворот
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
                doorData.frontDoorPhysics.body.setTargetTransform(doorData.frontDoor.position.clone(), Quaternion.Identity());
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
                doorData.backDoorPhysics.body.setTargetTransform(doorData.backDoor.position.clone(), Quaternion.Identity());
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
            const ownership = this.chunkSystem!.garageOwnership.get(garageKey);
            if (!ownership) return;
            
            // Проверяем состояние ворот - если закрыты, захват невозможен
            const garageDoor = this.chunkSystem!.garageDoors.find(door => 
                Math.abs(door.position.x - capturePoint.position.x) < 0.1 &&
                Math.abs(door.position.z - capturePoint.position.z) < 0.1
            );
            
            if (garageDoor && !garageDoor.frontDoorOpen && !garageDoor.backDoorOpen) {
                // Ворота закрыты - захват невозможен, но прогресс НЕ сбрасываем
                // Просто скрываем прогресс-бар и не накапливаем прогресс
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                // Обновляем цвет по владельцу (захват невозможен пока ворота закрыты)
                if (ownership.ownerId === null) {
                    this.updateWrenchColor(capturePoint.wrench, "neutral");
                } else if (ownership.ownerId === playerId) {
                    this.updateWrenchColor(capturePoint.wrench, "player");
                } else {
                    this.updateWrenchColor(capturePoint.wrench, "enemy");
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
                this.updateWrenchColor(capturePoint.wrench, "player");
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
                console.log(`[Game] Starting capture of garage at (${capturePoint.position.x.toFixed(1)}, ${capturePoint.position.z.toFixed(1)})`);
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
                    console.log(`[Game] Capture progress: ${(captureData.progress * 100).toFixed(1)}%, remaining: ${remainingTime.toFixed(1)}s`);
                }
            }
            
            // Если захват завершён
            if (captureData.progress >= 1.0) {
                // Захватываем гараж (даже если он был чужим)
                ownership.ownerId = playerId;
                this.garageCaptureProgress.delete(garageKey);
                
                // Обновляем цвет гаечного ключа на зелёный
                this.updateWrenchColor(capturePoint.wrench, "player");
                
                // Скрываем прогресс-бар
                if (this.hud) {
                    this.hud.setGarageCaptureProgress(null, 0, 0);
                }
                
                const wasEnemy = ownership.ownerId !== null && ownership.ownerId !== playerId;
                console.log(`[Game] Garage ${wasEnemy ? 'captured from enemy' : 'captured'} at (${capturePoint.position.x.toFixed(1)}, ${capturePoint.position.z.toFixed(1)})`);
            } else {
                // Обновляем цвет на жёлтый (захват в процессе)
                this.updateWrenchColor(capturePoint.wrench, "capturing");
            }
        });
        
        // Обновляем цвет гаечных ключей для гаражей, которые не захватываются
        this.chunkSystem.garageCapturePoints.forEach(capturePoint => {
            const garageKey = `${capturePoint.position.x.toFixed(1)}_${capturePoint.position.z.toFixed(1)}`;
            const ownership = this.chunkSystem!.garageOwnership.get(garageKey);
            if (!ownership) return;
            
            // Если не в процессе захвата, обновляем цвет по владельцу
            if (!this.garageCaptureProgress.has(garageKey)) {
                if (ownership.ownerId === null) {
                    this.updateWrenchColor(capturePoint.wrench, "neutral");
                } else if (ownership.ownerId === this.PLAYER_ID) {
                    this.updateWrenchColor(capturePoint.wrench, "player");
                } else {
                    this.updateWrenchColor(capturePoint.wrench, "enemy");
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
    
    update() {
        if (!this.scene || !this.engine) return;
        
        // Счётчик кадров
        this._updateTick++;
        if (this._updateTick > 1000000) this._updateTick = 0;
        
        // Delta time для анимаций
        const deltaTime = this.engine.getDeltaTime() / 1000;
        
        // === ЦЕНТРАЛИЗОВАННЫЕ ОБНОВЛЕНИЯ АНИМАЦИЙ ===
        // Обновляем анимации с разной частотой для оптимизации
        
        // HUD анимации (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.hud) {
            this.hud.updateAnimations(deltaTime);
        }
        
        // Chat system анимации (каждые 4 кадра для оптимизации)
        if (this._updateTick % 4 === 0 && this.chatSystem) {
            this.chatSystem.update(deltaTime);
        }
        
        // Анимация припасов на карте (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0 && this.chunkSystem) {
            this.chunkSystem.updateConsumablesAnimation(deltaTime);
        }
        
        // Обновление турелей (каждые 5 кадров для оптимизации - уменьшено для предотвращения лагов)
        if (this._updateTick % 5 === 0 && this.enemyManager) {
            this.enemyManager.update();
        }
        
        // 1. Камера (каждые 2 кадра для оптимизации)
        // КРИТИЧЕСКИ ВАЖНО: Обновляем камеру и в основном цикле, и в onAfterPhysicsObservable
        // Это гарантирует, что камера работает даже если физика еще не запустилась
        // Обновляем камеру если игра инициализирована ИЛИ запущена (для первого кадра)
        if (this._updateTick % 2 === 0 && (this.gameInitialized || this.gameStarted) && !this.gamePaused) {
            this.updateCamera();
        }
        
        // 2. Chunk system (каждые 4 кадра для оптимизации, кэшируем позицию)
        // КРИТИЧЕСКИ ВАЖНО: Уменьшена частота обновления для предотвращения тряски и лагов
        if (this._updateTick % 4 === 0 && this.chunkSystem && this.tank && this.tank.chassis) {
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
            // Debug logging removed for performance
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
                this.tank.turret.renderingGroupId = 1;
                this.tank.barrel.renderingGroupId = 2;
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
            // updateHUD() больше не вызывается здесь, чтобы избежать конфликта с радаром
            // this.updateHUD();
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
            if (!pickup || !pickup.mesh || pickup.mesh.isDisposed()) {
                this.chunkSystem.consumablePickups.splice(i, 1);
                continue;
            }
            
            // Используем позицию МЕША, а не сохранённую позицию
            const pickupPos = pickup.mesh.absolutePosition || pickup.position;
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
                        // Подбираем в свободный слот
                        this.consumablesManager.pickUp(consumableType, slot);
                        
                        // Удаляем припас с карты
                        pickup.mesh.dispose();
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
                        
                        console.log(`[Game] Picked up ${consumableType.name} in slot ${slot}`);
                    } else {
                        // Все слоты заняты - заменяем первый
                        this.consumablesManager.pickUp(consumableType, 1);
                        pickup.mesh.dispose();
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
                        
                        console.log(`[Game] Picked up ${consumableType.name} (replaced slot 1)`);
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
        let minPitch = -Math.PI / 3; // -60 градусов
        let maxPitch = Math.PI / 6;   // +30 градусов
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
        });
        
        window.addEventListener("wheel", (evt) => {
            if (!this.camera) return;
            
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
                        
                        // Также применяем стандартные ограничения угла к целевому углу
                        this.targetAimPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, newPitch));
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
            console.log(`[Camera] Aim mode: ${this.isAiming}`);
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
                    
                    // Применяем стандартные ограничения угла
                    this.targetAimPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, newPitch));
                }
            } else {
                // Вне режима прицеливания: Q/E управляют наклоном камеры (как раньше)
                const tiltSpeed = 0.02;
                if (this._inputMap["KeyQ"]) this.normalBeta -= tiltSpeed;
                if (this._inputMap["KeyE"]) this.normalBeta += tiltSpeed;
                this.normalBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.normalBeta));
            }
            
            // Camera collision ОТКЛЮЧЕНО - вызывает дёрганье
            // this.adjustCameraForCollision();

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
    
    // === ПУНКТ 14 & 15: Корректировка камеры при столкновении с постройками ===
    // Также делает танк видимым если он за стенкой (силуэт)
    // Camera collision smoothing
    private targetCameraRadius = 12;
    private currentCameraRadius = 12;
    
    // Состояние видимости танка (для предотвращения мерцания)
    private tankVisibilityState = false; // false = виден, true = за стеной
    private tankVisibilityTarget = false;
    private tankVisibilitySmooth = 0.0; // 0.0 = виден, 1.0 = за стеной
    
    private _adjustCameraForCollision(): void {
        if (!this.camera || !this.tank || !this.tank.chassis) return;
        
        // Target position (tank)
        const targetPos = this.tank.chassis.absolutePosition.clone();
        targetPos.y += 1.0;
        
        // Camera position
        const cameraPos = this.camera.position.clone();
        
        // Direction from target to camera
        const direction = cameraPos.subtract(targetPos).normalize();
        const distance = Vector3.Distance(targetPos, cameraPos);
        
        // Raycast from tank to camera
        const ray = new Ray(targetPos, direction, distance);
        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
            if (mesh.name.includes("billboard") || mesh.name.includes("hp") || mesh.name.includes("turret")) return false;
            if (mesh.parent === this.tank?.chassis || mesh.parent === this.tank?.turret) return false;
            return mesh.isPickable && mesh.visibility > 0.5;
        });
        
        let tankBehindWall = false;
        
        if (pick && pick.hit && pick.distance < distance - 0.5) {
            // Camera collided - calculate new target radius
            const newRadius = Math.max(4, pick.distance - 1.0);
            this.targetCameraRadius = newRadius;
            tankBehindWall = true;
        } else {
            // No collision - slowly restore to normal distance
            this.targetCameraRadius = 12;
        }
        
        // SMOOTH interpolation to target radius (prevents jitter)
        // Используем более медленную интерполяцию для предотвращения мерцания
        const lerpSpeed = tankBehindWall ? 0.08 : 0.03; // Медленнее для плавности
        this.currentCameraRadius = this.currentCameraRadius + (this.targetCameraRadius - this.currentCameraRadius) * lerpSpeed;
        
        // Применяем сглаженный радиус с минимальным изменением (предотвращает мерцание)
        const radiusDiff = this.currentCameraRadius - this.camera.radius;
        if (Math.abs(radiusDiff) > 0.1) { // Изменяем только если разница значительная
            this.camera.radius = this.currentCameraRadius;
        }
        
        // Tank visibility behind walls (включая гусеницы)
        if (this.tank.chassis && this.tank.turret && this.tank.barrel) {
            if (tankBehindWall || this.camera.radius < 5) {
                this.tank.chassis.renderingGroupId = 3;
                this.tank.turret.renderingGroupId = 3;
                this.tank.barrel.renderingGroupId = 3;
                
                if (this.camera.radius < 4) {
                    const vis = 0.6;
                    this.tank.chassis.visibility = vis;
                    this.tank.turret.visibility = vis;
                    this.tank.barrel.visibility = vis;
                    
                    // Гусеницы тоже подсвечиваем
                    if (this.tank.leftTrack) {
                        this.tank.leftTrack.renderingGroupId = 3;
                        this.tank.leftTrack.visibility = vis;
                    }
                    if (this.tank.rightTrack) {
                        this.tank.rightTrack.renderingGroupId = 3;
                        this.tank.rightTrack.visibility = vis;
                    }
                }
            } else {
                this.tank.chassis.renderingGroupId = 0;
                this.tank.turret.renderingGroupId = 1;
                this.tank.barrel.renderingGroupId = 2;
                
                if (!this.isAiming) {
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
    }
    
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
                this.tank.turret.renderingGroupId = 1;
                this.tank.barrel.renderingGroupId = 2;
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
    private _calculateProjectileImpact(): Vector3 | null {
        if (!this.tank || !this.tank.barrel) return null;
        
        const barrelPos = this.tank.barrel.getAbsolutePosition();
        const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
        
        // Симуляция траектории снаряда
        const gravity = 9.81;
        const speed = this.tank.projectileSpeed || 100;
        const dt = 0.02; // 20мс шаг
        const maxTime = 8; // Максимум 8 секунд полёта
        
        // Начальные условия
        let pos = barrelPos.clone();
        let vel = barrelDir.scale(speed);
        
        // Симулируем полёт
        for (let t = 0; t < maxTime; t += dt) {
            // Сохраняем предыдущую позицию
            const prevPos = pos.clone();
            
            // Обновляем скорость (гравитация)
            vel.y -= gravity * dt;
            
            // Обновляем позицию
            pos = pos.add(vel.scale(dt));
            
            // Проверяем столкновение с землёй
            if (pos.y <= 0.1) {
                // Интерполируем точку на уровне земли
                const ratio = (prevPos.y - 0.1) / (prevPos.y - pos.y);
                return Vector3.Lerp(prevPos, pos, ratio);
            }
            
            // Raycast для столкновения с объектами (каждые 5 шагов)
            if (Math.floor(t / dt) % 5 === 0) {
                const rayDir = pos.subtract(prevPos).normalize();
                const rayLen = Vector3.Distance(prevPos, pos);
                const ray = new Ray(prevPos, rayDir, rayLen + 1);
                
                const pick = this.scene.pickWithRay(ray, (mesh) => {
                    if (!mesh || !mesh.isEnabled()) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
                    if (mesh.name.includes("impactMarker")) return false;
                    return mesh.isPickable;
                });
                
                if (pick && pick.hit && pick.pickedPoint) {
                    return pick.pickedPoint;
                }
            }
        }
        
        // Если не нашли точку - возвращаем последнюю позицию
        return pos;
    }
    
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
        
        // Собираем ботов (враги танки)
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
        
        // Update FPS (каждые 2 кадра для оптимизации)
        if (this._updateTick % 2 === 0) {
            const fps = Math.round(1000 / this.engine.getDeltaTime());
            this.hud.updateFPS(fps);
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
        this.enemyTanks.forEach(t => t.setHpVisible(false));
        if (this.enemyManager) {
            this.enemyManager.turrets.forEach(t => t.setHpVisible(false));
        }
        
        if (pick && pick.hit && pick.pickedMesh) {
            const pickedMesh = pick.pickedMesh as any; // Приведение типа для isPartOf
            // Check enemy tanks
            const tank = this.enemyTanks.find(et => et.isPartOf && et.isPartOf(pickedMesh));
            if (tank) {
                tank.setHpVisible(true);
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
            if (!enemy.isAlive || !enemy.chassis) continue;
            
            const enemyPos = enemy.chassis.absolutePosition;
            // Вычисляем расстояние от луча ствола до врага
            const toEnemy = enemyPos.subtract(barrelPos);
            const proj = Vector3.Dot(toEnemy, barrelDir);
            if (proj > 0 && proj < maxDist) {
                const closestPoint = barrelPos.add(barrelDir.scale(proj));
                const dist = Vector3.Distance(closestPoint, enemyPos);
                if (dist < 3) { // Если враг близко к лучу ствола
                    enemy.setHpVisible(true);
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
}

