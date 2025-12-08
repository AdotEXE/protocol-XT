import "@babylonjs/core/Debug/debugLayer";
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
    Matrix,
    Quaternion
} from "@babylonjs/core";
import "@babylonjs/gui";
import { AdvancedDynamicTexture, TextBlock, Rectangle } from "@babylonjs/gui";
import HavokPhysics from "@babylonjs/havok";
import { TankController } from "./tankController";
import { HUD } from "./hud";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import { EnemyManager } from "./enemy";
import { ChunkSystem } from "./chunkSystem";
import { DebugDashboard } from "./debugDashboard";
import { EnemyTank } from "./enemyTank";
import { MainMenu, GameSettings } from "./menu";
import { CurrencyManager } from "./currencyManager";
import { Garage } from "./garage";

export class Game {
    engine: Engine;
    scene: Scene;
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
    
    // Enemy tanks
    enemyTanks: EnemyTank[] = [];
    
    // Currency manager
    currencyManager: CurrencyManager | undefined;
    
    // Позиция гаража игрока для респавна
    playerGaragePosition: Vector3 | null = null;
    
    // Таймеры респавна для гаражей (Map<garagePos, {timer: number, billboard: Mesh}>)
    private garageRespawnTimers: Map<string, { timer: number, billboard: Mesh | null, textBlock: any }> = new Map();
    private readonly RESPAWN_TIME = 180000; // 3 минуты в миллисекундах
    
    // Main menu
    mainMenu: MainMenu;
    gameStarted = false;
    gamePaused = false;
    
    // Settings
    settings: GameSettings;
    
    // Camera settings
    cameraBeta = Math.PI / 3.2; // Начальный взгляд немного ниже
    targetCameraAlpha = 0;
    currentCameraAlpha = 0;
    shouldCenterCamera = false; // Флаг для плавного центрирования камеры
    centerCameraSpeed = 0.08;   // Скорость центрирования камеры (ТОЧНО такая же как у башни - 0.08!)
    isCenteringActive = false;  // Активно ли центрирование прямо сейчас
    
    // Input map for camera controls
    private _inputMap: { [key: string]: boolean } = {};

    constructor() {
        // Create main menu first
        this.mainMenu = new MainMenu();
        this.settings = this.mainMenu.getSettings();
        
        this.mainMenu.setOnStartGame(() => {
            this.startGame();
        });
        
        // Setup canvas
        const canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);

        this.engine = new Engine(canvas, true, {
            deterministicLockstep: false,
            lockstepMaxSteps: 4,
            useHighPrecisionMatrix: false
        });
        
        this.engine.enableOfflineSupport = false;
        
        this.scene = new Scene(this.engine, {
            useGeometryUniqueIdsMap: true,
            useMaterialMeshMap: true,
            useClonedMeshMap: true
        });
        
        this.scene.skipPointerMovePicking = true;
        this.scene.autoClear = false;
        this.scene.autoClearDepthAndStencil = false;
        
        // Setup ESC for pause
        window.addEventListener("keydown", (e) => {
            if (e.code === "Escape" && this.gameStarted) {
                this.togglePause();
            }
        });
        
        // Pre-init scene but don't start game loop until menu clicked
        this.init().then(() => {
            this.engine.runRenderLoop(() => {
                if (!this.gamePaused) {
                    this.scene.render();
                    if (this.gameStarted) {
                        this.update();
                    }
                }
            });
        });

        window.addEventListener("resize", () => {
            this.engine.resize();
        });
    }
    
    startGame(): void {
        this.gameStarted = true;
        this.gamePaused = false;
        this.settings = this.mainMenu.getSettings();
        
        // Apply settings
        if (this.chunkSystem) {
            // Update render distance from settings
            console.log(`[Game] Render distance: ${this.settings.renderDistance}`);
        }
        
        if (this.debugDashboard) {
            // Show/hide based on settings
            const dashboard = document.getElementById("debug-dashboard");
            if (dashboard) {
                dashboard.classList.toggle("hidden", !this.settings.showFPS);
            }
        }
        
        // Start engine sound
        if (this.soundManager) {
            this.soundManager.startEngine();
        }
        
        console.log("[Game] Started!");
    }
    
    togglePause(): void {
        if (!this.gameStarted) return;
        
        this.gamePaused = !this.gamePaused;
        
        if (this.gamePaused) {
            this.mainMenu.show();
        } else {
            this.mainMenu.hide();
        }
        
        console.log(`[Game] ${this.gamePaused ? "Paused" : "Resumed"}`);
    }

    async init() {
        try {
            console.log("Game init starting...");
            
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
            this.scene.useConstantAnimationDeltaTime = true;
            
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

            // Ground - infinite looking but actually bounded
            const ground = MeshBuilder.CreateBox("ground", { width: 1000, height: 10, depth: 1000 }, this.scene);
            ground.position.y = -5;
            
            const groundMat = new StandardMaterial("groundMat", this.scene);
            groundMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            groundMat.specularColor = Color3.Black();
            groundMat.freeze(); // Optimize
            ground.material = groundMat;
            ground.freezeWorldMatrix();
            
            const groundAgg = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            if (groundAgg.shape) {
                groundAgg.shape.filterMembershipMask = 2;
                groundAgg.shape.filterCollideMask = 0xFFFFFFFF;
            }

            // Create Tank
            this.tank = new TankController(this.scene, new Vector3(0, 2, 0));
            
            // Устанавливаем callback для респавна в гараже
            this.tank.setRespawnPositionCallback(() => this.getPlayerGaragePosition());
            
            // Create HUD
            this.hud = new HUD(this.scene);
            this.tank.setHUD(this.hud);
            
            // Initialize currency display
            if (this.currencyManager && this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
            }
            
            // Create Sound Manager
            this.soundManager = new SoundManager();
            this.tank.setSoundManager(this.soundManager);
            
            // Create Effects Manager
            this.effectsManager = new EffectsManager(this.scene);
            this.tank.setEffectsManager(this.effectsManager);
            
            // Create Currency Manager
            this.currencyManager = new CurrencyManager();
            
            // Create Garage System
            this.garage = new Garage(this.scene, this.currencyManager);
            
            // Create Enemy Manager (for turrets)
            this.enemyManager = new EnemyManager(this.scene);
            this.enemyManager.setPlayer(this.tank);
            this.enemyManager.setEffectsManager(this.effectsManager);
            this.enemyManager.setSoundManager(this.soundManager);
            
            // Connect enemy manager to tank for hit detection
            this.tank.setEnemyManager(this.enemyManager);
            
            // Connect kill counter and currency
            this.enemyManager.setOnTurretDestroyed(() => {
                if (this.hud) {
                    this.hud.addKill();
                }
                // Начисляем валюту за уничтожение турели
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(50); // 50 валюты за турель
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                    }
                }
            });
            
            // === CHUNK SYSTEM (MAXIMUM OPTIMIZATION!) ===
            this.chunkSystem = new ChunkSystem(this.scene, {
                chunkSize: 80,          // HUGE chunks = fewer chunks
                renderDistance: 1,       // MINIMUM render distance
                unloadDistance: 2,       // Aggressive unload
                worldSeed: Math.floor(Math.random() * 1000000)
            });
            console.log("Chunk system created (MAX OPT)");
            
            // КРИТИЧЕСКИ ВАЖНО: Запускаем генерацию чанков сразу, чтобы гаражи начали генерироваться
            // Используем позицию танка (0, 2, 0) для начальной генерации
            const initialPos = new Vector3(0, 2, 0);
            this.chunkSystem.update(initialPos);
            
            // === DEBUG DASHBOARD ===
            this.debugDashboard = new DebugDashboard(this.engine, this.scene);
            this.debugDashboard.setChunkSystem(this.chunkSystem);
            console.log("Debug dashboard created (F3 to toggle)");
            
            // Ждём генерации гаражей перед спавном
            this.waitForGaragesAndSpawn();

            // Camera Setup
            // Используем безопасную позицию для камеры (tank уже создан в init)
            const cameraPos = this.tank?.chassis?.position || new Vector3(0, 2, 0);
            this.camera = new ArcRotateCamera("camera1", -Math.PI / 2, this.cameraBeta, 12, cameraPos, this.scene);
            this.camera.lowerRadiusLimit = 5;
            this.camera.upperRadiusLimit = 25;
            this.camera.lowerBetaLimit = 0.1; // Разрешаем более низкий угол для режима прицеливания
            this.camera.upperBetaLimit = Math.PI / 2.1; // Разрешаем более высокий угол
            this.camera.inputs.clear();
            this.setupCameraInput();
            
            // Aim Camera Setup (UniversalCamera для first-person режима)
            this.aimCamera = new UniversalCamera("aimCamera", new Vector3(0, 0, 0), this.scene);
            this.aimCamera.fov = this.aimFOV;
            this.aimCamera.inputs.clear(); // Отключаем все инпуты для aim камеры
            this.aimCamera.setEnabled(false); // По умолчанию выключена

            console.log("Game Initialized - Press F3 for debug info!");
        } catch (e) {
            console.error("Game init error:", e);
        }
    }
    
    spawnEnemyTanks() {
        if (!this.soundManager || !this.effectsManager) return;
        
        // Разбрасываем врагов по всей карте случайным образом
        const mapSize = 400; // Размер карты
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
                    2,
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
        
        spawnPositions.forEach((pos, i) => {
            // Все враги на сложной сложности по умолчанию
            const enemyTank = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, "hard");
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // On death
            enemyTank.onDeathObservable.add(() => {
                if (this.hud) this.hud.addKill();
                // Remove from array
                const idx = this.enemyTanks.indexOf(enemyTank);
                if (idx !== -1) this.enemyTanks.splice(idx, 1);
                
                // Respawn after delay
                setTimeout(() => {
                    this.respawnEnemyTank(pos);
                }, 10000);
            });
            
            this.enemyTanks.push(enemyTank);
        });
        
        console.log(`Spawned ${this.enemyTanks.length} enemy tanks`);
    }
    
    // Ожидание генерации гаражей и спавн игрока/врагов
    waitForGaragesAndSpawn() {
        if (!this.chunkSystem) {
            console.error("[Game] ChunkSystem not initialized!");
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
                // Спавним игрока в гараже (ВСЕГДА в гараже!)
                this.spawnPlayerInGarage();
                
                // Спавним врагов в других гаражах (если есть)
                if (this.chunkSystem.garagePositions.length >= 2) {
                    this.spawnEnemiesInGarages();
                } else {
                    // Если только один гараж, спавним врагов старым методом
                    this.spawnEnemyTanks();
                }
                
                // Connect enemy tanks to tank for hit detection
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
                }
                console.log(`[Game] Player spawned in garage at ${this.playerGaragePosition?.x.toFixed(1)}, ${this.playerGaragePosition?.z.toFixed(1)} (total garages: ${this.chunkSystem.garagePositions.length})`);
            } else if (attempts >= maxAttempts) {
                // Таймаут - используем fallback спавн
                console.warn("[Game] Garage generation timeout, using fallback spawn");
                this.spawnPlayerInGarage(); // Попробуем спавн в гараже, если есть хотя бы один
                if (this.chunkSystem.garagePositions.length === 0) {
                    // Если вообще нет гаражей, используем старый метод
                    this.spawnEnemyTanks();
                } else {
                    this.spawnEnemiesInGarages();
                }
                
                // Connect enemy tanks to tank for hit detection
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
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
        
        // Выбираем первый гараж для игрока (или случайный, если их несколько)
        // КРИТИЧЕСКИ ВАЖНО: Игра ВСЕГДА начинается в гараже!
        let playerGarage: Vector3;
        if (this.chunkSystem.garagePositions.length === 1) {
            // Если только один гараж - используем его
            playerGarage = this.chunkSystem.garagePositions[0];
        } else {
            // Если несколько - выбираем случайный
            playerGarage = this.chunkSystem.garagePositions[
                Math.floor(Math.random() * this.chunkSystem.garagePositions.length)
            ];
        }
        
        // Сохраняем позицию гаража для респавна (ВСЕГДА в этом же гараже!)
        this.playerGaragePosition = playerGarage.clone(); // Клонируем чтобы избежать проблем с ссылками
        
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
        
        console.log(`[Game] Player spawned in garage at ${playerGarage.x.toFixed(1)}, ${playerGarage.z.toFixed(1)}`);
    }
    
    // Получить позицию гаража для респавна игрока
    getPlayerGaragePosition(): Vector3 | null {
        // КРИТИЧЕСКИ ВАЖНО: Респавн ВСЕГДА в том же гараже, где началась игра!
        if (this.playerGaragePosition) {
            return this.playerGaragePosition.clone(); // Возвращаем копию
        }
        
        // Fallback: если позиция не сохранена, используем первый доступный гараж
        if (this.chunkSystem && this.chunkSystem.garagePositions.length > 0) {
            const garage = this.chunkSystem.garagePositions[0].clone();
            this.playerGaragePosition = garage; // Сохраняем для будущих респавнов
            return garage;
        }
        
        return null;
    }
    
    // Спавн врагов в гаражах
    spawnEnemiesInGarages() {
        if (!this.soundManager || !this.effectsManager) return;
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            console.warn("[Game] No garages available, using default spawn");
            this.spawnEnemyTanks(); // Fallback на старый метод
            return;
        }
        
        // Используем позиции гаражей для спавна врагов
        // КРИТИЧЕСКИ ВАЖНО: Исключаем гараж игрока из списка доступных для врагов!
        const availableGarages = this.chunkSystem.garagePositions.filter(garage => {
            if (!this.playerGaragePosition) return true;
            // Исключаем гараж игрока (с небольшой погрешностью для сравнения)
            const dist = Math.abs(garage.x - this.playerGaragePosition.x) + 
                        Math.abs(garage.z - this.playerGaragePosition.z);
            return dist > 1.0; // Если расстояние больше 1 единицы - это другой гараж
        });
        
        const enemyCount = Math.min(7, availableGarages.length);
        
        // Перемешиваем гаражи
        for (let i = availableGarages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableGarages[i], availableGarages[j]] = [availableGarages[j], availableGarages[i]];
        }
        
        // Спавним врагов в первых N гаражах
        for (let i = 0; i < enemyCount; i++) {
            const garagePos = availableGarages[i];
            const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, "hard");
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // On death
            enemyTank.onDeathObservable.add(() => {
                if (this.hud) this.hud.addKill();
                // Начисляем валюту за уничтожение танка
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(100); // 100 валюты за танк
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                    }
                }
                const idx = this.enemyTanks.indexOf(enemyTank);
                if (idx !== -1) this.enemyTanks.splice(idx, 1);
                
                // Запускаем таймер респавна (1 минута)
                this.startGarageRespawnTimer(garagePos);
            });
            
            this.enemyTanks.push(enemyTank);
        }
        
        console.log(`[Game] Spawned ${this.enemyTanks.length} enemy tanks in garages`);
    }
    
    respawnEnemyTank(pos: Vector3) {
        if (!this.soundManager || !this.effectsManager) return;
        
        // Все враги на сложной сложности по умолчанию
        const enemyTank = new EnemyTank(this.scene, pos, this.soundManager, this.effectsManager, "hard");
        if (this.tank) {
            enemyTank.setTarget(this.tank);
        }
        
        enemyTank.onDeathObservable.add(() => {
            if (this.hud) this.hud.addKill();
            // Начисляем валюту за уничтожение танка
            if (this.currencyManager) {
                this.currencyManager.addCurrency(100); // 100 валюты за танк
                if (this.hud) {
                    this.hud.setCurrency(this.currencyManager.getCurrency());
                }
            }
            const idx = this.enemyTanks.indexOf(enemyTank);
            if (idx !== -1) this.enemyTanks.splice(idx, 1);
            
            // Запускаем таймер респавна (1 минута)
            this.startGarageRespawnTimer(pos);
        });
        
        this.enemyTanks.push(enemyTank);
    }
    
    // Запуск таймера респавна для гаража
    startGarageRespawnTimer(garagePos: Vector3) {
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
        textBlock.text = "60";
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
                        const garagePos = new Vector3(x, 2.5, z);
                        this.respawnEnemyTank(garagePos);
                    }
                }
                
                // Удаляем таймер
                if (data.billboard) {
                    data.billboard.dispose();
                }
                this.garageRespawnTimers.delete(key);
            } else {
                // Обновляем текст таймера
                const seconds = Math.ceil(data.timer / 1000);
                if (data.textBlock) {
                    data.textBlock.text = seconds.toString();
                    // Меняем цвет в зависимости от оставшегося времени
                    if (seconds <= 10) {
                        data.textBlock.color = "red";
                    } else if (seconds <= 30) {
                        data.textBlock.color = "yellow";
                    } else {
                        data.textBlock.color = "white";
                    }
                }
            }
        });
    }
    
    update() {
        // Обновляем ссылку на вражеские танки (на случай если они изменились)
        if (this.tank) {
            this.tank.setEnemyTanks(this.enemyTanks);
        }
        
        // Update camera
        this.updateCamera();
        
        // Update chunk system based on player position
        if (this.chunkSystem && this.tank) {
            this.chunkSystem.update(this.tank.chassis.absolutePosition);
        }
        
        // Update debug dashboard
        if (this.debugDashboard && this.tank) {
            const pos = this.tank.chassis.absolutePosition;
            this.debugDashboard.update({ x: pos.x, y: pos.y, z: pos.z });
        }
        
        // Update garage respawn timers (getDeltaTime возвращает миллисекунды)
        const deltaTime = this.engine.getDeltaTime();
        if (deltaTime > 0 && deltaTime < 1000) { // Проверка на разумные значения
            this.updateGarageRespawnTimers(deltaTime);
        }
        
        // Update enemy tanks
        this.enemyTanks.forEach(enemy => {
            if (enemy.isAlive) {
                enemy.update();
            }
        });

        // Aim-highlight enemy HP when looking at them
        this.updateEnemyLookHP();
        
        // Update HUD
        this.updateHUD();
    }

    // Aim mode variables
    isAiming = false;
    aimingTransitionProgress = 0.0; // 0.0 = обычный режим, 1.0 = полный режим прицеливания
    aimingTransitionSpeed = 0.12; // Скорость перехода (чем больше, тем быстрее)
    
    normalRadius = 12;
    aimRadius = 6;     // Ближе к танку в режиме прицеливания
    normalBeta = Math.PI / 3.2;  // немного ниже стартовый взгляд
    aimBeta = 0.25;    // Низкий угол - как из башни танка
    
    // FOV settings for aim mode  
    normalFOV = 0.8;   // Обычный угол обзора (радианы)
    aimFOV = 0.4;      // 2x зум для разумного обзора поля боя
    
    setupCameraInput() {
        window.addEventListener("keydown", (evt) => {
            this._inputMap[evt.code] = true;
            
            // Open/Close garage with G key
            if (evt.code === "KeyG" && this.garage && this.gameStarted && !this.gamePaused) {
                if (this.garage.isGarageOpen()) {
                    this.garage.close();
                } else {
                    this.garage.open();
                }
            }
            
            // Close garage with ESC
            if (evt.code === "Escape" && this.garage && this.garage.isGarageOpen()) {
                this.garage.close();
            }
        });
        window.addEventListener("keyup", (evt) => {
            this._inputMap[evt.code] = false;
        });
        
        window.addEventListener("wheel", (evt) => {
            if (!this.camera || this.isAiming) return;
            
            if (evt.shiftKey) {
                this.cameraBeta += evt.deltaY * 0.001;
                this.cameraBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.cameraBeta));
            } else {
                this.camera.radius += evt.deltaY * 0.01;
                this.camera.radius = Math.max(5, Math.min(25, this.camera.radius));
                this.normalRadius = this.camera.radius;
            }
        });
        
        // Listen for aim mode changes from tank
        window.addEventListener("aimModeChanged", ((e: CustomEvent) => {
            this.isAiming = e.detail.aiming;
            console.log(`[Camera] Aim mode: ${this.isAiming}`);
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
    }
    
    updateCamera() {
        if (this.tank && this.tank.chassis && this.tank.turret && this.tank.barrel && this.camera) {
            // Q/E tilt always available
            const tiltSpeed = 0.02;
            if (this._inputMap["KeyQ"]) this.normalBeta -= tiltSpeed;
            if (this._inputMap["KeyE"]) this.normalBeta += tiltSpeed;
            this.normalBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.normalBeta));

            // === ПЛАВНЫЙ ПЕРЕХОД В РЕЖИМ ПРИЦЕЛИВАНИЯ ===
            // Обновляем прогресс перехода
            if (this.isAiming) {
                // Плавно увеличиваем прогресс перехода
                this.aimingTransitionProgress = Math.min(1.0, this.aimingTransitionProgress + this.aimingTransitionSpeed);
            } else {
                // Плавно уменьшаем прогресс перехода
                this.aimingTransitionProgress = Math.max(0.0, this.aimingTransitionProgress - this.aimingTransitionSpeed);
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
            
            // ПЛАВНОЕ скрытие/показ мешей (используем visibility вместо setEnabled для плавности)
            // visibility: 1.0 = полностью видим, 0.0 = полностью скрыт
            // При t=0 (обычный режим): visibility = 1 (видим)
            // При t=1 (прицеливание): visibility = 0 (скрыт)
            if (this.tank.turret) {
                this.tank.turret.visibility = 1.0 - t;
            }
            if (this.tank.chassis) {
                this.tank.chassis.visibility = 1.0 - t;
            }
            if (this.tank.barrel) {
                this.tank.barrel.visibility = 1.0 - t;
            }
            
            // ПЛАВНЫЙ переход FOV
            if (this.aimCamera && t > 0.01) {
                // Интерполируем FOV от normalFOV к aimFOV
                const targetFOV = this.normalFOV + (this.aimFOV - this.normalFOV) * t;
                const currentFOV = this.aimCamera.fov;
                // Плавная интерполяция для FOV
                this.aimCamera.fov += (targetFOV - currentFOV) * 0.2;
            }
            
            // === КАМЕРА ВНУТРИ БАШНИ (вид из танка!) ===
            if (t > 0.01 && this.aimCamera) {
                // Получаем позицию и направление ствола
                const barrelPos = this.tank.barrel.getAbsolutePosition();
                const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
                
                // Камера находится ВНУТРИ башни, немного сзади ствола (как будто смотришь из башни)
                const cameraOffset = barrelDir.scale(-0.25); // Немного назад от дула
                const cameraPos = barrelPos.add(cameraOffset);
                cameraPos.y += 0.2; // На уровне глаз в башне (выше для лучшего обзора)
                
                // Плавно перемещаем камеру к нужной позиции
                const currentPos = this.aimCamera.position.clone();
                // Используем более плавную интерполяцию для позиции (зависит от прогресса)
                const posLerp = 0.2 + t * 0.6; // От 0.2 до 0.8 в зависимости от прогресса
                const newPos = Vector3.Lerp(currentPos, cameraPos, posLerp);
                
                // Устанавливаем позицию камеры
                this.aimCamera.position.copyFrom(newPos);
                
                // КРИТИЧЕСКИ ВАЖНО: Target должен быть ПРЯМО ВПЕРЁД в направлении ствола на ПРАВИЛЬНОЙ высоте!
                // Вычисляем точку взгляда в направлении ствола
                const lookAtDistance = 200; // Расстояние взгляда
                let lookAtPos = newPos.add(barrelDir.scale(lookAtDistance));
                // ВАЖНО: Target должен быть на уровне ПОЛЯ БОЯ - немного ниже камеры
                // Камера на высоте ~1.2-1.4м, target на высоте ~0.8-1.0м = смотрим на поле боя!
                lookAtPos.y = Math.max(0.8, newPos.y - 0.3); // НИЖЕ камеры - смотрим на поле боя перед танком
                
                // Плавно интерполируем target
                const currentTarget = this.aimCamera.getTarget();
                const lerpedTarget = Vector3.Lerp(currentTarget, lookAtPos, posLerp);
                this.aimCamera.setTarget(lerpedTarget);
            }
            
            // Плавный возврат FOV к нормальному значению для основной камеры
            if (this.camera && t < 0.99) {
                const currentFOV = this.camera.fov;
                const targetFOV = this.normalFOV;
                this.camera.fov += (targetFOV - currentFOV) * 0.2;
            }
            
            // Third-person smooth follow (для обычного режима, когда не в режиме прицеливания)
            if (t < 0.99 && this.camera) {
                const targetRadius = this.normalRadius;
                const targetBeta = this.normalBeta;
                this.camera.radius += (targetRadius - this.camera.radius) * 0.15;
                this.cameraBeta += (targetBeta - this.cameraBeta) * 0.15;
                this.cameraBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.cameraBeta));
                
                const chassisRotY = this.tank.chassis.rotationQuaternion 
                    ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                    : this.tank.chassis.rotation.y;
                const turretRotY = this.tank.turret.rotation.y;
                const totalRotY = chassisRotY + turretRotY;
                
                // Если нужно центрировать камеру (кнопка C), камера ПЛАВНО следует за башней
                if (this.shouldCenterCamera && this.isCenteringActive) {
                    // Целевой угол = угол корпуса + угол башни (башня движется к 0)
                    const targetAlpha = -chassisRotY - turretRotY - Math.PI / 2;
                    
                    // КРИТИЧЕСКИ ВАЖНО: Используем ТУ ЖЕ скорость lerpSpeed что и башня!
                    // Башня использует: currentRot * (1 - lerpSpeed) где lerpSpeed = 0.08
                    // Камера должна использовать ТУ ЖЕ скорость для синхронизации
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
                    
                    // КРИТИЧЕСКИ ВАЖНО: Используем ТУ ЖЕ скорость lerpSpeed что и башня!
                    // Башня: currentRot * (1 - lerpSpeed) = currentRot - currentRot * lerpSpeed
                    // Камера: currentAlpha + diff * lerpSpeed (двигаемся к цели с той же скоростью)
                    // Это обеспечивает синхронизацию: камера поворачивается с той же скоростью что и башня
                    this.currentCameraAlpha = currentAlpha + diff * lerpSpeed;
                    this.targetCameraAlpha = targetAlpha;
                    
                    // Когда башня в центре - камера тоже точно в центре
                    if (Math.abs(turretRotY) < 0.005) {
                        this.currentCameraAlpha = -chassisRotY - Math.PI / 2;
                        this.targetCameraAlpha = this.currentCameraAlpha;
                    }
                } else {
                    // Обычное следование за башней (lerp)
                    this.targetCameraAlpha = -totalRotY - Math.PI / 2;
                    
                    const lerpSpeed = 0.08; // более плавно (для обычного следования)
                    let diff = this.targetCameraAlpha - this.currentCameraAlpha;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    this.currentCameraAlpha += diff * lerpSpeed;
                }
                
                this.camera.alpha = this.currentCameraAlpha;
                this.camera.beta = this.cameraBeta;
                
                const tankPos = this.tank.chassis.absolutePosition;
                const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                this.camera.target.copyFrom(lookAt);
            }
        }
    }
    
    updateHUD() {
        if (!this.hud || !this.tank || !this.enemyManager) return;
        
        // Get all enemy positions (turrets + tanks)
        const turretPositions = this.enemyManager.getEnemyPositions();
        const tankPositions = this.enemyTanks
            .filter(t => t.isAlive)
            .map(t => t.chassis.absolutePosition);
        
        const allEnemies = [...turretPositions, ...tankPositions];
        
        // КРИТИЧЕСКИ ВАЖНО: Передаём позицию игрока для правильного обновления радара!
        const playerPos = this.tank.chassis.absolutePosition;
        this.hud.updateMinimap(allEnemies, playerPos);

        // Enemy health summary (tanks + turrets)
        let enemyHp = 0;
        let enemyCount = 0;
        this.enemyTanks.forEach(t => {
            if (t.isAlive) {
                enemyHp += t.currentHealth;
                enemyCount += 1;
            }
        });
        if (this.enemyManager) {
            this.enemyManager.turrets.forEach(t => {
                if (t.isAlive) {
                    enemyHp += t.health;
                    enemyCount += 1;
                }
            });
        }
        if (this.hud) {
            this.hud.setEnemyHealth(enemyHp, enemyCount);
        }

        // Aim-highlight enemy HP when looking at them
        this.updateEnemyLookHP();
        
        // Update compass direction - tied to CHASSIS only (not turret)
        // КРИТИЧЕСКИ ВАЖНО: Стрелка на радаре показывает направление КОРПУСА, а не башни!
        if (this.tank.chassis.rotationQuaternion) {
            const chassisY = this.tank.chassis.rotationQuaternion.toEulerAngles().y;
            // Используем ТОЛЬКО угол корпуса для компаса и радара
            this.hud.setDirection(chassisY);
        }
        
        // Update enemy count
        const aliveCount = this.enemyTanks.filter(t => t.isAlive).length + 
                          this.enemyManager.getAliveCount();
        this.hud.setEnemyCount(aliveCount);
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
            // Check enemy tanks
            const tank = this.enemyTanks.find(et => et.isPartOf(pick.pickedMesh!));
            if (tank) {
                tank.setHpVisible(true);
                return;
            }
            // Check turrets
            if (this.enemyManager) {
                const turret = this.enemyManager.turrets.find(tr => tr.isPartOf(pick.pickedMesh!));
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

