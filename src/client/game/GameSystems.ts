// ═══════════════════════════════════════════════════════════════════════════
// GAME SYSTEMS - Управление всеми игровыми системами
// ═══════════════════════════════════════════════════════════════════════════

import { Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { TankController } from "../tankController";
import { HUD } from "../hud";
import { SoundManager } from "../soundManager";
import { EffectsManager } from "../effects";
import { EnemyManager } from "../enemy";
import { ChunkSystem } from "../chunkSystem";
import { DestructionSystem } from "../destructionSystem";
import { CurrencyManager } from "../currencyManager";
import { ConsumablesManager } from "../consumables";
import { ChatSystem } from "../chatSystem";
import { ExperienceSystem } from "../experienceSystem";
import { PlayerProgressionSystem } from "../playerProgression";
import { AimingSystem } from "../aimingSystem";
import { AchievementsSystem, Achievement } from "../achievements";
import { MissionSystem, Mission } from "../missionSystem";
import { PlayerStatsSystem } from "../playerStats";
import { MultiplayerManager } from "../multiplayer";
import type { Scene, Engine } from "@babylonjs/core";
import type { GameSettings } from "../menu";
import type { IGameSystems } from "./types";

/**
 * GameSystems - Управление всеми игровыми системами
 * 
 * Отвечает за:
 * - Инициализацию всех систем (tank, hud, soundManager, etc.)
 * - Связывание систем между собой
 * - Управление жизненным циклом систем
 */
export class GameSystems implements Partial<IGameSystems> {
    // Основные системы
    tank: TankController | undefined;
    hud: HUD | undefined;
    soundManager: SoundManager | undefined;
    effectsManager: EffectsManager | undefined;
    enemyManager: EnemyManager | undefined;
    chunkSystem: ChunkSystem | undefined;
    destructionSystem: DestructionSystem | undefined;
    
    // Менеджеры
    currencyManager: CurrencyManager | undefined;
    consumablesManager: ConsumablesManager | undefined;
    chatSystem: ChatSystem | undefined;
    experienceSystem: ExperienceSystem | undefined;
    playerProgression: PlayerProgressionSystem | undefined;
    achievementsSystem: AchievementsSystem | undefined;
    missionSystem: MissionSystem | undefined;
    playerStats: PlayerStatsSystem | undefined;
    aimingSystem: AimingSystem | undefined;
    
    // Мультиплеер
    multiplayerManager: MultiplayerManager | undefined;
    networkPlayerTanks: Map<string, any> = new Map();
    isMultiplayer: boolean = false;
    
    // Ссылки на основные объекты (будут переданы из Game)
    protected scene: Scene | undefined;
    protected engine: Engine | undefined;
    protected settings: GameSettings | undefined;
    protected mainMenu: any | undefined;
    
    /**
     * Инициализация всех систем
     * Вызывается из init() в Game.ts
     */
    async initializeSystems(
        scene: Scene,
        engine: Engine,
        settings: GameSettings,
        mainMenu: any,
        updateLoadingProgress: (progress: number, stage: string) => void,
        getDifficultyRewardMultiplier: () => number,
        onAchievementUnlocked: (achievement: Achievement) => void,
        onMissionComplete: (mission: Mission) => void,
        updateStatsOverlay: () => void,
        statsOverlayVisible: boolean,
        statsOverlay: HTMLDivElement | null,
        getPlayerGaragePosition: () => Vector3 | null,
        garage: any | undefined,
        loadGarage: () => Promise<void>,
        currentMapType: string,
        worldSeed: number
    ): Promise<void> {
        this.scene = scene;
        this.engine = engine;
        this.settings = settings;
        this.mainMenu = mainMenu;
        
        try {
            // Create Tank
            updateLoadingProgress(40, "Создание танка...");
            this.tank = new TankController(scene, new Vector3(0, 1.2, 0));
            
            // Устанавливаем callback для респавна в гараже
            this.tank.setRespawnPositionCallback(() => getPlayerGaragePosition());
            
            // Create HUD
            updateLoadingProgress(50, "Создание интерфейса...");
            const originalRenderTargetsEnabled = scene.renderTargetsEnabled;
            scene.renderTargetsEnabled = true;
            try {
                this.hud = new HUD(scene);
                if (this.hud) {
                    this.tank.setHUD(this.hud);
                    logger.log("[GameSystems] HUD created successfully");
                }
            } catch (e) {
                logger.error("[GameSystems] HUD creation error:", e);
                scene.renderTargetsEnabled = originalRenderTargetsEnabled;
            }
            
            // Create Sound Manager
            updateLoadingProgress(55, "Загрузка звуков...");
            this.soundManager = new SoundManager();
            this.tank.setSoundManager(this.soundManager);
            
            // Create Effects Manager
            this.effectsManager = new EffectsManager(scene);
            this.tank.setEffectsManager(this.effectsManager);
            
            // Create Currency Manager
            this.currencyManager = new CurrencyManager();
            if (this.currencyManager && this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
            }
            
            // Create Consumables Manager
            updateLoadingProgress(52, "Подготовка систем...");
            this.consumablesManager = new ConsumablesManager();
            
            // Create Chat System
            this.chatSystem = new ChatSystem(scene);
            this.chatSystem.setGame(this as any); // Временный cast, будет исправлено
            if (this.soundManager) {
                this.chatSystem.setSoundManager(this.soundManager);
            }
            
            // Create Experience System
            this.experienceSystem = new ExperienceSystem();
            this.experienceSystem.setChatSystem(this.chatSystem);
            if (this.hud) {
                this.experienceSystem.setHUD(this.hud);
            }
            this.experienceSystem.setDifficultyMultiplier(getDifficultyRewardMultiplier());
            
            // Initialize Achievements System
            this.achievementsSystem = new AchievementsSystem();
            this.achievementsSystem.setLanguage(settings.language as "ru" | "en" || "ru");
            this.achievementsSystem.setOnAchievementUnlocked(onAchievementUnlocked);
            
            // Initialize Mission System
            this.missionSystem = new MissionSystem();
            this.missionSystem.setLanguage(settings.language as "ru" | "en" || "ru");
            this.missionSystem.setOnMissionComplete(onMissionComplete);
            
            // Связываем HUD с системой миссий
            if (this.hud && typeof (this.hud as any).setMissionSystem === "function") {
                (this.hud as any).setMissionSystem(this.missionSystem);
            }
            
            // Initialize Player Stats System
            this.playerStats = new PlayerStatsSystem();
            this.playerStats.setOnStatsUpdate((stats) => {
                logger.log("[Stats] Updated:", stats);
            });
            
            // Track session start
            this.achievementsSystem.updateProgress("dedication", 1);
            
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
            
            // Связываем ExperienceSystem с PlayerProgressionSystem
            if (this.experienceSystem) {
                this.experienceSystem.setPlayerProgression(this.playerProgression);
            }
            
            // Subscribe to experience changes
            if (this.playerProgression && this.playerProgression.onExperienceChanged) {
                this.playerProgression.onExperienceChanged.add((data: {
                    current: number;
                    required: number;
                    percent: number;
                    level: number;
                }) => {
                    if (statsOverlayVisible && statsOverlay) {
                        updateStatsOverlay();
                    }
                });
            }
            
            // Connect to HUD
            if (this.hud) {
                this.hud.setPlayerProgression(this.playerProgression);
                if (this.experienceSystem) {
                    this.hud.setExperienceSystem(this.experienceSystem);
                }
            }
            
            // Connect to menu
            if (mainMenu) {
                mainMenu.setPlayerProgression(this.playerProgression);
                if (this.playerProgression && typeof this.playerProgression.setMenu === 'function') {
                    this.playerProgression.setMenu(mainMenu);
                }
            }
            
            // Create Aiming System
            this.aimingSystem = new AimingSystem(scene);
            
            if (this.chatSystem) {
                this.chatSystem.success("System initialized");
            }
            
            // Connect systems to Garage
            if (garage) {
                if (this.chatSystem) {
                    garage.setChatSystem(this.chatSystem);
                }
                if (this.soundManager) {
                    garage.setSoundManager(this.soundManager);
                }
                if (this.tank) {
                    garage.setTankController(this.tank);
                }
                if (this.experienceSystem) {
                    garage.setExperienceSystem(this.experienceSystem);
                }
                if (this.playerProgression) {
                    garage.setPlayerProgression(this.playerProgression);
                }
            } else {
                await loadGarage();
            }
            
            // Connect systems to tank
            this.connectSystemsToTank();
            
            // Create Enemy Manager
            this.enemyManager = new EnemyManager(scene);
            this.enemyManager.setPlayer(this.tank);
            this.enemyManager.setEffectsManager(this.effectsManager);
            this.enemyManager.setSoundManager(this.soundManager);
            if (this.tank) {
                this.tank.setEnemyManager(this.enemyManager);
            }
            
            // Create Destruction System
            this.destructionSystem = new DestructionSystem(scene, {
                enableDebris: true,
                debrisLifetime: 8000,
                maxDebrisPerObject: 4
            });
            
            // Create Chunk System
            updateLoadingProgress(70, "Генерация мира...");
            const isProduction = (import.meta as any).env?.PROD || false;
            this.chunkSystem = new ChunkSystem(scene, {
                chunkSize: 80,
                renderDistance: isProduction ? 1.2 : 1.5,
                unloadDistance: 4,
                worldSeed: worldSeed,
                mapType: currentMapType as any
            });
            
            updateLoadingProgress(85, "Размещение объектов...");
            const initialPos = new Vector3(0, 2, 0);
            this.chunkSystem.update(initialPos);
            
            // Initialize Multiplayer Manager
            const serverUrl = (import.meta as any).env?.VITE_WS_SERVER_URL || "ws://localhost:8080";
            this.multiplayerManager = new MultiplayerManager(serverUrl);
            
            logger.log("[GameSystems] All systems initialized successfully");
        } catch (error) {
            logger.error("[GameSystems] Error initializing systems:", error);
            throw error;
        }
    }
    
    /**
     * Связывание систем с танком
     */
    protected connectSystemsToTank(): void {
        if (!this.tank) return;
        
        // Connect chat system
        if (this.chatSystem) {
            this.tank.chatSystem = this.chatSystem;
        }
        
        // Connect experience system
        if (this.experienceSystem) {
            this.tank.experienceSystem = this.experienceSystem;
            this.tank.achievementsSystem = this.achievementsSystem;
        }
        
        // Connect aiming system
        if (this.aimingSystem) {
            this.aimingSystem.setTank(this.tank);
        }
        
        // Connect player progression
        if (this.playerProgression) {
            this.tank.playerProgression = this.playerProgression;
        }
        
        // Connect multiplayer shoot callback
        if (this.multiplayerManager) {
            this.tank.setOnShootCallback((data) => {
                if (this.isMultiplayer && this.multiplayerManager) {
                    this.multiplayerManager.sendPlayerShoot(data);
                }
            });
            
            this.tank.networkPlayers = this.networkPlayerTanks;
            (this.tank as any).multiplayerManager = this.multiplayerManager;
        }
    }
    
    /**
     * Dispose всех систем
     */
    dispose(): void {
        try {
            if (this.tank && typeof (this.tank as any).dispose === 'function') {
                (this.tank as any).dispose();
            }
            if (this.hud && typeof (this.hud as any).dispose === 'function') {
                (this.hud as any).dispose();
            }
            if (this.soundManager && typeof (this.soundManager as any).dispose === 'function') {
                this.soundManager.dispose();
            }
            if (this.effectsManager && typeof (this.effectsManager as any).dispose === 'function') {
                (this.effectsManager as any).dispose();
            }
            if (this.enemyManager && typeof (this.enemyManager as any).dispose === 'function') {
                (this.enemyManager as any).dispose();
            }
            if (this.chunkSystem) {
                this.chunkSystem.dispose();
            }
            if (this.destructionSystem) {
                this.destructionSystem.dispose();
            }
            if (this.multiplayerManager) {
                this.multiplayerManager.disconnect();
            }
            
            logger.log("[GameSystems] All systems disposed");
        } catch (error) {
            logger.error("[GameSystems] Error disposing systems:", error);
        }
    }
}

