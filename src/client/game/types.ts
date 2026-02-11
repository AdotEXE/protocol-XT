// ═══════════════════════════════════════════════════════════════════════════
// GAME TYPES - Типы и интерфейсы для модулей Game
// ═══════════════════════════════════════════════════════════════════════════

import type { Engine, Scene, ArcRotateCamera, UniversalCamera } from "@babylonjs/core";
import type { MapType } from "../menu";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { SoundManager } from "../soundManager";
import type { EffectsManager } from "../effects";
import type { EnemyManager } from "../enemy";
import type { ChunkSystem } from "../chunkSystem";
import type { EnemyTank } from "../enemyTank";
import type { GameSettings } from "../menu";
import type { CurrencyManager } from "../currencyManager";
import type { ConsumablesManager } from "../consumables";
import type { ChatSystem } from "../chatSystem";
import type { ExperienceSystem } from "../experienceSystem";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { AimingSystem } from "../aimingSystem";
import type { AchievementsSystem, Achievement } from "../achievements";
import type { DestructionSystem } from "../destructionSystem";
import type { MissionSystem, Mission } from "../missionSystem";
import type { PlayerStatsSystem } from "../playerStats";
import type { MultiplayerManager } from "../multiplayer";
import type { NetworkPlayerTank } from "../networkPlayerTank";
import type { MainMenu } from "../menu";
import type { Garage } from "../garage";
import type { DebugDashboard } from "../debugDashboard";
import type { PhysicsPanel } from "../physicsPanel";
import type { CheatMenu } from "../cheatMenu";
import type { NetworkMenu } from "../networkMenu";
import type { WorldGenerationMenu } from "../worldGenerationMenu";
import type { HelpMenu } from "../helpMenu";
import type { ScreenshotManager } from "../screenshotManager";
import type { ScreenshotPanel } from "../screenshotPanel";
import type { BattleRoyaleVisualizer } from "../battleRoyale";
import type { CTFVisualizer } from "../ctfVisualizer";
import type { RealtimeStatsTracker } from "../realtimeStats";
import type { MetricsCollector } from "../metricsCollector";
import type { Vector3 } from "@babylonjs/core";
import type { TextBlock } from "@babylonjs/gui";
import type { Mesh } from "@babylonjs/core";

/**
 * Основные свойства Game класса
 */
export interface IGameCore {
    engine: Engine;
    scene: Scene;
    canvas: HTMLCanvasElement;
    gameInitialized: boolean;
    gameStarted: boolean;
    gamePaused: boolean;
    currentMapType: MapType;
}

/**
 * Свойства систем Game
 */
export interface IGameSystems {
    tank: TankController | undefined;
    camera: ArcRotateCamera | undefined;
    aimCamera: UniversalCamera | undefined;
    hud: HUD | undefined;
    soundManager: SoundManager | undefined;
    effectsManager: EffectsManager | undefined;
    enemyManager: EnemyManager | undefined;
    chunkSystem: ChunkSystem | undefined;
    destructionSystem: DestructionSystem | undefined;
    currencyManager: CurrencyManager | undefined;
    consumablesManager: ConsumablesManager | undefined;
    chatSystem: ChatSystem | undefined;
    experienceSystem: ExperienceSystem | undefined;
    playerProgression: PlayerProgressionSystem | undefined;
    achievementsSystem: AchievementsSystem | undefined;
    missionSystem: MissionSystem | undefined;
    playerStats: PlayerStatsSystem | undefined;
    aimingSystem: AimingSystem | undefined;
    multiplayerManager: MultiplayerManager | undefined;
    networkPlayerTanks: Map<string, NetworkPlayerTank>;
    isMultiplayer: boolean;
}

/**
 * Lazy-loaded модули
 */
export interface IGameLazyModules {
    mainMenu: MainMenu | undefined;
    garage: Garage | undefined;
    debugDashboard: DebugDashboard | undefined;
    physicsPanel: PhysicsPanel | undefined;
    cheatMenu: CheatMenu | undefined;
    networkMenu: NetworkMenu | undefined;
    worldGenerationMenu: WorldGenerationMenu | undefined;
    helpMenu: HelpMenu | undefined;
    screenshotManager: ScreenshotManager | undefined;
    screenshotPanel: ScreenshotPanel | undefined;
    battleRoyaleVisualizer: BattleRoyaleVisualizer | undefined;
    ctfVisualizer: CTFVisualizer | undefined;
    socialMenu: any | undefined;
    mapEditor: any | undefined;
    replayRecorder: any | undefined;
}

/**
 * Настройки Game
 */
export interface IGameSettings {
    settings: GameSettings;
    muteOnFocusLossHandler: (() => void) | null;
}

/**
 * Гаражные системы
 */
export interface IGameGarage {
    playerGaragePosition: Vector3 | null;
    garageRespawnTimers: Map<string, { timer: number, billboard: Mesh | null, textBlock: TextBlock | null }>;
    garageCaptureProgress: Map<string, { progress: number, capturingPlayers: number }>;
    readonly RESPAWN_TIME: number;
    readonly CAPTURE_TIME_SINGLE: number;
    readonly CAPTURE_RADIUS: number;
    readonly PLAYER_ID: string;
}

/**
 * Камера и ввод
 */
export interface IGameCamera {
    cameraBeta: number;
    targetCameraAlpha: number;
    currentCameraAlpha: number;
    shouldCenterCamera: boolean;
    centerCameraSpeed: number;
    isCenteringActive: boolean;
    cameraShakeIntensity: number;
    cameraShakeDecay: number;
    cameraShakeOffset: Vector3;
    cameraShakeTime: number;
    _inputMap: { [key: string]: boolean };
}

/**
 * Враги и волны
 */
export interface IGameEnemies {
    enemyTanks: EnemyTank[];
    frontlineWaveNumber: number;
    frontlineWaveTimer: number | null;
    frontlineMaxEnemies: number;
    frontlineWaveInterval: number;
    _lastAdaptiveDifficultyLogTime: number;
}

/**
 * Мультиплеер и наблюдатель
 */
export interface IGameMultiplayer {
    isSpectating: boolean;
    spectatingPlayerId: string | null;
}

/**
 * UI и оверлеи
 */
export interface IGameUI {
    statsOverlay: HTMLDivElement | null;
    statsOverlayVisible: boolean;
    loadingScreen: HTMLDivElement | null;
    loadingProgress: number;
    targetLoadingProgress: number;
    loadingAnimationFrame: number | null;
    canvasPointerEventsCheckInterval: number | null;
}

/**
 * Достижения и статистика
 */
export interface IGameProgress {
    survivalStartTime: number;
    lastDeathTime: number;
    realtimeStatsTracker: RealtimeStatsTracker | undefined;
    metricsCollector: MetricsCollector | undefined;
    lastMetricsSendTime: number;
    readonly METRICS_SEND_INTERVAL: number;
}

/**
 * Оптимизация и кэширование
 */
export interface IGameOptimization {
    _updateTick: number;
    targetRaycastCache: { result: boolean, frame: number } | null;
    readonly TARGET_RAYCAST_CACHE_FRAMES: number;
    _cachedTankPosition: Vector3;
    _tankPositionCacheFrame: number;
    _cachedCameraPosition: Vector3;
    _cameraPositionCacheFrame: number;
    readonly _colorNeutral: import("@babylonjs/core").Color3;
    readonly _colorPlayer: import("@babylonjs/core").Color3;
    readonly _colorEnemy: import("@babylonjs/core").Color3;
    readonly _colorEmissiveNeutral: import("@babylonjs/core").Color3;
    readonly _colorEmissivePlayer: import("@babylonjs/core").Color3;
    readonly _colorEmissiveEnemy: import("@babylonjs/core").Color3;
}

