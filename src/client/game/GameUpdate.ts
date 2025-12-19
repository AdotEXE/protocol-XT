// ═══════════════════════════════════════════════════════════════════════════
// GAME UPDATE - Основной игровой цикл
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { Engine, Scene } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { EnemyManager } from "../enemy";
import type { ChunkSystem } from "../chunkSystem";
import type { ConsumablesManager } from "../consumables";
import type { MissionSystem } from "../missionSystem";
import type { AchievementsSystem } from "../achievements";
import type { ExperienceSystem } from "../experienceSystem";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { MultiplayerManager } from "../multiplayer";

/**
 * GameUpdate - Основной игровой цикл
 * 
 * Отвечает за:
 * - Обновление всех систем каждый кадр
 * - Оптимизацию обновлений (разные частоты для разных систем)
 * - Координацию обновлений между системами
 */
export class GameUpdate {
    // Счётчик кадров для оптимизации
    private _updateTick = 0;
    
    // Ссылки на системы
    protected engine: Engine | undefined;
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected enemyManager: EnemyManager | undefined;
    protected chunkSystem: ChunkSystem | undefined;
    protected consumablesManager: ConsumablesManager | undefined;
    protected missionSystem: MissionSystem | undefined;
    protected achievementsSystem: AchievementsSystem | undefined;
    protected experienceSystem: ExperienceSystem | undefined;
    protected playerProgression: PlayerProgressionSystem | undefined;
    protected multiplayerManager: MultiplayerManager | undefined;
    
    // Callbacks для обновлений (будут переданы из Game)
    protected onUpdateCamera: (() => void) | null = null;
    protected onUpdateGarageDoors: (() => void) | null = null;
    protected onUpdateGarageCapture: ((deltaTime: number) => void) | null = null;
    protected onUpdateGarageRespawnTimers: ((deltaTime: number) => void) | null = null;
    protected onUpdateMultiplayer: ((deltaTime: number) => void) | null = null;
    protected onUpdateFrontlineWaves: ((deltaTime: number) => void) | null = null;
    protected onUpdateEnemyTurretsVisibility: (() => void) | null = null;
    protected onCheckConsumablePickups: (() => void) | null = null;
    protected onCheckSpectatorMode: (() => void) | null = null;
    
    // Флаги состояния
    protected gameStarted = false;
    protected gamePaused = false;
    protected isAiming = false;
    protected survivalStartTime = 0;
    
    /**
     * Инициализация системы обновлений
     */
    initialize(
        engine: Engine,
        scene: Scene,
        callbacks: {
            tank?: TankController;
            hud?: HUD;
            enemyManager?: EnemyManager;
            chunkSystem?: ChunkSystem;
            consumablesManager?: ConsumablesManager;
            missionSystem?: MissionSystem;
            achievementsSystem?: AchievementsSystem;
            experienceSystem?: ExperienceSystem;
            playerProgression?: PlayerProgressionSystem;
            multiplayerManager?: MultiplayerManager;
            gameStarted?: boolean;
            gamePaused?: boolean;
            isAiming?: boolean;
            survivalStartTime?: number;
        }
    ): void {
        this.engine = engine;
        this.scene = scene;
        this.tank = callbacks.tank;
        this.hud = callbacks.hud;
        this.enemyManager = callbacks.enemyManager;
        this.chunkSystem = callbacks.chunkSystem;
        this.consumablesManager = callbacks.consumablesManager;
        this.missionSystem = callbacks.missionSystem;
        this.achievementsSystem = callbacks.achievementsSystem;
        this.experienceSystem = callbacks.experienceSystem;
        this.playerProgression = callbacks.playerProgression;
        this.multiplayerManager = callbacks.multiplayerManager;
        this.gameStarted = callbacks.gameStarted || false;
        this.gamePaused = callbacks.gamePaused || false;
        this.isAiming = callbacks.isAiming || false;
        this.survivalStartTime = callbacks.survivalStartTime || 0;
        
        logger.log("[GameUpdate] Update system initialized");
    }
    
    /**
     * Основной метод обновления (вызывается каждый кадр)
     */
    update(): void {
        if (!this.scene || !this.engine) return;
        
        // Счётчик кадров
        this._updateTick++;
        if (this._updateTick > 1000000) this._updateTick = 0;
        
        // Delta time для анимаций
        const deltaTime = this.engine.getDeltaTime() / 1000;
        
        // === ОБНОВЛЕНИЕ FPS КАЖДЫЙ КАДР ===
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
        
        // HUD анимации (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.hud) {
            this.hud.updateAnimations(deltaTime);
            
            // Update fuel indicator
            if (this.tank) {
                this.hud.updateFuel?.(this.tank.currentFuel, this.tank.maxFuel);
            }
            
            // Update tracer count
            if (this.tank) {
                this.hud.updateTracerCount?.(this.tank.getTracerCount(), this.tank.getMaxTracerCount());
            }
            
            // Update arsenal
            if (this.tank && this.hud.updateArsenal) {
                const ammoData = new Map<string, { current: number, max: number }>();
                ammoData.set("tracer", {
                    current: this.tank.getTracerCount(),
                    max: this.tank.getMaxTracerCount()
                });
                ammoData.set("ap", { current: 0, max: 0 });
                ammoData.set("apcr", { current: 0, max: 0 });
                ammoData.set("he", { current: 0, max: 0 });
                ammoData.set("apds", { current: 0, max: 0 });
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
                        this.achievementsSystem.setProgress("survivor", Math.floor(survivalTime));
                        
                        const hpPercent = this.tank.currentHealth / this.tank.maxHealth;
                        if (hpPercent < 0.1 && hpPercent > 0) {
                            this.achievementsSystem.updateProgress("iron_will", 1);
                        }
                    }
                }
            }
        }
        
        // Обновление камеры (каждый кадр)
        if (this.onUpdateCamera) {
            this.onUpdateCamera();
        }
        
        // Обновление гаражей (каждые 2 кадра)
        if (this._updateTick % 2 === 0) {
            if (this.onUpdateGarageDoors) {
                this.onUpdateGarageDoors();
            }
            
            if (this.onUpdateGarageCapture) {
                this.onUpdateGarageCapture(deltaTime);
            }
            
            if (this.onUpdateGarageRespawnTimers) {
                this.onUpdateGarageRespawnTimers(deltaTime);
            }
        }
        
        // Обновление мультиплеера (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.onUpdateMultiplayer) {
            this.onUpdateMultiplayer(deltaTime);
        }
        
        // Обновление волн фронта (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.onUpdateFrontlineWaves) {
            this.onUpdateFrontlineWaves(deltaTime);
        }
        
        // Обновление видимости турелей (каждые 6 кадров)
        if (this._updateTick % 6 === 0 && this.onUpdateEnemyTurretsVisibility) {
            this.onUpdateEnemyTurretsVisibility();
        }
        
        // Проверка подбора расходников (каждые 10 кадров)
        if (this._updateTick % 10 === 0 && this.onCheckConsumablePickups) {
            this.onCheckConsumablePickups();
        }
        
        // Проверка режима наблюдателя (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.onCheckSpectatorMode) {
            this.onCheckSpectatorMode();
        }
        
        // Обновление чанков (каждые 5 кадров)
        if (this._updateTick % 5 === 0 && this.chunkSystem && this.tank) {
            const tankPos = this.tank.chassis?.absolutePosition;
            if (tankPos) {
                this.chunkSystem.update(tankPos);
            }
        }
    }
    
    /**
     * Установить колбэки для обновлений
     */
    setUpdateCallbacks(callbacks: {
        onUpdateCamera?: () => void;
        onUpdateGarageDoors?: () => void;
        onUpdateGarageCapture?: (deltaTime: number) => void;
        onUpdateGarageRespawnTimers?: (deltaTime: number) => void;
        onUpdateMultiplayer?: (deltaTime: number) => void;
        onUpdateFrontlineWaves?: (deltaTime: number) => void;
        onUpdateEnemyTurretsVisibility?: () => void;
        onCheckConsumablePickups?: () => void;
        onCheckSpectatorMode?: () => void;
    }): void {
        if (callbacks.onUpdateCamera !== undefined) this.onUpdateCamera = callbacks.onUpdateCamera;
        if (callbacks.onUpdateGarageDoors !== undefined) this.onUpdateGarageDoors = callbacks.onUpdateGarageDoors;
        if (callbacks.onUpdateGarageCapture !== undefined) this.onUpdateGarageCapture = callbacks.onUpdateGarageCapture;
        if (callbacks.onUpdateGarageRespawnTimers !== undefined) this.onUpdateGarageRespawnTimers = callbacks.onUpdateGarageRespawnTimers;
        if (callbacks.onUpdateMultiplayer !== undefined) this.onUpdateMultiplayer = callbacks.onUpdateMultiplayer;
        if (callbacks.onUpdateFrontlineWaves !== undefined) this.onUpdateFrontlineWaves = callbacks.onUpdateFrontlineWaves;
        if (callbacks.onUpdateEnemyTurretsVisibility !== undefined) this.onUpdateEnemyTurretsVisibility = callbacks.onUpdateEnemyTurretsVisibility;
        if (callbacks.onCheckConsumablePickups !== undefined) this.onCheckConsumablePickups = callbacks.onCheckConsumablePickups;
        if (callbacks.onCheckSpectatorMode !== undefined) this.onCheckSpectatorMode = callbacks.onCheckSpectatorMode;
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        hud?: HUD;
        enemyManager?: EnemyManager;
        chunkSystem?: ChunkSystem;
        consumablesManager?: ConsumablesManager;
        missionSystem?: MissionSystem;
        achievementsSystem?: AchievementsSystem;
        experienceSystem?: ExperienceSystem;
        playerProgression?: PlayerProgressionSystem;
        multiplayerManager?: MultiplayerManager;
        gameStarted?: boolean;
        gamePaused?: boolean;
        isAiming?: boolean;
        survivalStartTime?: number;
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.enemyManager !== undefined) this.enemyManager = callbacks.enemyManager;
        if (callbacks.chunkSystem !== undefined) this.chunkSystem = callbacks.chunkSystem;
        if (callbacks.consumablesManager !== undefined) this.consumablesManager = callbacks.consumablesManager;
        if (callbacks.missionSystem !== undefined) this.missionSystem = callbacks.missionSystem;
        if (callbacks.achievementsSystem !== undefined) this.achievementsSystem = callbacks.achievementsSystem;
        if (callbacks.experienceSystem !== undefined) this.experienceSystem = callbacks.experienceSystem;
        if (callbacks.playerProgression !== undefined) this.playerProgression = callbacks.playerProgression;
        if (callbacks.multiplayerManager !== undefined) this.multiplayerManager = callbacks.multiplayerManager;
        if (callbacks.gameStarted !== undefined) this.gameStarted = callbacks.gameStarted;
        if (callbacks.gamePaused !== undefined) this.gamePaused = callbacks.gamePaused;
        if (callbacks.isAiming !== undefined) this.isAiming = callbacks.isAiming;
        if (callbacks.survivalStartTime !== undefined) this.survivalStartTime = callbacks.survivalStartTime;
    }
    
    /**
     * Dispose системы обновлений
     */
    dispose(): void {
        this.onUpdateCamera = null;
        this.onUpdateGarageDoors = null;
        this.onUpdateGarageCapture = null;
        this.onUpdateGarageRespawnTimers = null;
        this.onUpdateMultiplayer = null;
        this.onUpdateFrontlineWaves = null;
        this.onUpdateEnemyTurretsVisibility = null;
        this.onCheckConsumablePickups = null;
        this.onCheckSpectatorMode = null;
        
        logger.log("[GameUpdate] Update system disposed");
    }
}

