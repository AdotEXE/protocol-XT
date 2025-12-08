import "@babylonjs/core/Debug/debugLayer";
import { 
    Engine, 
    Scene, 
    Vector3, 
    HemisphericLight, 
    MeshBuilder, 
    HavokPlugin,
    PhysicsAggregate,
    PhysicsShapeType,
    StandardMaterial,
    Color3,
    ArcRotateCamera,
    UniversalCamera,
    Ray,
    Matrix
} from "@babylonjs/core";
import "@babylonjs/gui";
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
    centerCameraSpeed = 0.06;   // Скорость центрирования камеры (синхронизирована с башней)
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
            
            // Create HUD
            this.hud = new HUD(this.scene);
            this.tank.setHUD(this.hud);
            
            // Create Sound Manager
            this.soundManager = new SoundManager();
            this.tank.setSoundManager(this.soundManager);
            
            // Create Effects Manager
            this.effectsManager = new EffectsManager(this.scene);
            this.tank.setEffectsManager(this.effectsManager);
            
            // Create Enemy Manager (for turrets)
            this.enemyManager = new EnemyManager(this.scene);
            this.enemyManager.setPlayer(this.tank);
            this.enemyManager.setEffectsManager(this.effectsManager);
            this.enemyManager.setSoundManager(this.soundManager);
            
            // Connect enemy manager to tank for hit detection
            this.tank.setEnemyManager(this.enemyManager);
            
            // Connect kill counter
            this.enemyManager.setOnTurretDestroyed(() => {
                if (this.hud) {
                    this.hud.addKill();
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
            
            // === DEBUG DASHBOARD ===
            this.debugDashboard = new DebugDashboard(this.engine, this.scene);
            this.debugDashboard.setChunkSystem(this.chunkSystem);
            console.log("Debug dashboard created (F3 to toggle)");
            
            // === ENEMY TANKS ===
            this.spawnEnemyTanks();
            
            // Connect enemy tanks to tank for hit detection
            this.tank.setEnemyTanks(this.enemyTanks);

            // Camera Setup
            this.camera = new ArcRotateCamera("camera1", -Math.PI / 2, this.cameraBeta, 12, this.tank.chassis.position, this.scene);
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
    
    respawnEnemyTank(pos: Vector3) {
        if (!this.soundManager || !this.effectsManager) return;
        
        // Все враги на сложной сложности по умолчанию
        const enemyTank = new EnemyTank(this.scene, pos, this.soundManager, this.effectsManager, "hard");
        if (this.tank) {
            enemyTank.setTarget(this.tank);
        }
        
        enemyTank.onDeathObservable.add(() => {
            if (this.hud) this.hud.addKill();
            const idx = this.enemyTanks.indexOf(enemyTank);
            if (idx !== -1) this.enemyTanks.splice(idx, 1);
            
            setTimeout(() => {
                this.respawnEnemyTank(pos);
            }, 10000);
        });
        
        this.enemyTanks.push(enemyTank);
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
        if (this.tank && this.tank.chassis && this.tank.turret && this.camera) {
            // Q/E tilt always available
            const tiltSpeed = 0.02;
            if (this._inputMap["KeyQ"]) this.normalBeta -= tiltSpeed;
            if (this._inputMap["KeyE"]) this.normalBeta += tiltSpeed;
            this.normalBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.normalBeta));

            if (this.isAiming) {
                // === РЕЖИМ ПРИЦЕЛИВАНИЯ: ВИД ИЗ ТАНКА (FIRST PERSON!) ===
                // Используем UniversalCamera для правильного first-person режима!
                
                // Переключаемся на aim камеру
                if (this.camera) {
                    this.camera.setEnabled(false);
                }
                if (this.aimCamera) {
                    this.aimCamera.setEnabled(true);
                    this.scene.activeCamera = this.aimCamera;
                }
                
                // КРИТИЧЕСКИ ВАЖНО: Делаем башню и корпус НЕВИДИМЫМИ чтобы видеть всё спереди!
                if (this.tank.turret) {
                    this.tank.turret.setEnabled(false); // Скрываем башню
                }
                if (this.tank.chassis) {
                    this.tank.chassis.setEnabled(false); // Скрываем корпус
                }
                if (this.tank.barrel) {
                    this.tank.barrel.setEnabled(false); // Скрываем ствол
                }
                
                // ПЛАВНЫЙ переход FOV к узкому углу (2x зум)
                if (this.aimCamera) {
                    const currentFOV = this.aimCamera.fov;
                    const targetFOV = this.aimFOV; // 0.4 - 2x зум
                    this.aimCamera.fov += (targetFOV - currentFOV) * 0.15;
                }
                
                // === КАМЕРА ВНУТРИ БАШНИ (вид из танка!) ===
                // Получаем позицию и направление ствола
                const barrelPos = this.tank.barrel.getAbsolutePosition();
                const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
                
                // Камера находится ВНУТРИ башни, немного сзади ствола (как будто смотришь из башни)
                const cameraOffset = barrelDir.scale(-0.25); // Немного назад от дула
                const cameraPos = barrelPos.add(cameraOffset);
                cameraPos.y += 0.2; // На уровне глаз в башне (выше для лучшего обзора)
                
                // Плавно перемещаем камеру к нужной позиции
                if (this.aimCamera) {
                    const currentPos = this.aimCamera.position.clone();
                    const posLerp = 0.95; // Очень быстро для мгновенного отклика
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
                    
                    // Устанавливаем направление камеры используя setTarget
                    this.aimCamera.setTarget(lookAtPos);
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
                
                // КРИТИЧЕСКИ ВАЖНО: Возвращаем видимость башни и корпуса!
                if (this.tank.turret) {
                    this.tank.turret.setEnabled(true); // Показываем башню
                }
                if (this.tank.chassis) {
                    this.tank.chassis.setEnabled(true); // Показываем корпус
                }
                if (this.tank.barrel) {
                    this.tank.barrel.setEnabled(true); // Показываем ствол
                }
                
                // Плавный возврат FOV к нормальному значению
                if (this.camera) {
                    const currentFOV = this.camera.fov;
                    const targetFOV = this.normalFOV;
                    this.camera.fov += (targetFOV - currentFOV) * 0.15;
                }
                // Third-person smooth follow (unchanged)
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
                    
                    // Нормализуем разницу углов к [-PI, PI]
                    let diff = targetAlpha - this.currentCameraAlpha;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    
                    // ПЛАВНОЕ следование с той же скоростью lerp что и башня!
                    const lerpSpeed = this.centerCameraSpeed || 0.08;
                    this.currentCameraAlpha += diff * lerpSpeed;
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
        this.hud.updateMinimap(allEnemies);

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
        
        // Update compass direction - tied to TURRET, not chassis
        if (this.tank.chassis.rotationQuaternion) {
            const chassisY = this.tank.chassis.rotationQuaternion.toEulerAngles().y;
            const turretY = this.tank.turret.rotation.y;
            // Combine chassis + turret rotation for compass
            this.hud.setDirection(chassisY + turretY);
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
