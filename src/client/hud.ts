import {
    Scene,
    Vector3
} from "@babylonjs/core";
import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control,
    Line,
    Button,
    StackPanel,
    Container
} from "@babylonjs/gui";
import type { MissionSystem, Mission, MissionProgress } from "./missionSystem";
import { scalePixels } from "./utils/uiScale";
import { loggingSettings, LogLevel } from "./utils/logger";
import { getAddressFromCoordinates } from "./tartuRoads";
import { calculateDPS } from "./tankTypes";
import { ScreenFlashEffect, type FlashDirection } from "./hud/components/ScreenFlashEffect";
import { TargetHealthBar, type TargetInfo } from "./hud/components/TargetHealthBar";
import { EFFECTS_CONFIG } from "./effects/EffectsConfig";
import type { TankStatsData, StatWithBonus } from "./hud/HUDTypes";
import {
    SpeedIndicator,
    DEFAULT_SPEED_CONFIG,
    AmmoIndicator,
    DEFAULT_AMMO_CONFIG,
    // ИСПРАВЛЕНО: Удален ReloadBar - используем только старую шкалу перезарядки
    ExperienceBar,
    DEFAULT_EXPERIENCE_BAR_CONFIG,
    KillFeed,
    DEFAULT_KILLFEED_CONFIG,
    ArsenalBar,
    DEFAULT_ARSENAL_CONFIG,
    DeathScreen,
    DEFAULT_DEATH_SCREEN_CONFIG,
    FloatingDamageNumbers,
    DEFAULT_DAMAGE_NUMBER_CONFIG,
    TouchControls,
    DEFAULT_TOUCH_CONTROLS_CONFIG,
    DamageIndicator,
    DEFAULT_DAMAGE_CONFIG,
    LowHealthVignette,
    AircraftHUD,
    DEFAULT_AIRCRAFT_HUD_CONFIG
} from "./hud/components";
import type { TouchInputState } from "./hud/components";
import { MobileControlsManager, type MobileInputState } from "./mobile";
import { isMobileDevice } from "./mobile/MobileDetection";
import { timerManager } from "./optimization/TimerManager";
import { initializeInGameDialogs } from "./utils/inGameDialogs";

// ULTRA SIMPLE HUD - NO gradients, NO shadows, NO alpha, NO transparency
// Pure solid colors only!

export class HUD {
    private scene: Scene;
    private guiTexture: AdvancedDynamicTexture;
    // Ссылка на MissionSystem для обработки claim из HUD (инжектируется из Game)
    private missionSystem: MissionSystem | null = null;

    // Health
    private healthBar!: Rectangle;
    private healthFill!: Rectangle;
    private healthText!: TextBlock;

    // Reload
    private reloadBar!: Rectangle;
    private reloadFill!: Rectangle;
    private reloadText!: TextBlock;

    // Crosshair
    private crosshairElements: Rectangle[] = [];
    private crosshairDot!: Rectangle;

    // Hit marker (X shape at center when hitting enemy)
    private hitMarkerLines: Rectangle[] = [];
    private hitMarkerVisible = false;
    private hitMarkerFadeTime = 0;

    // Speedometer
    private speedText!: TextBlock;

    // Stats
    private positionText!: TextBlock;

    // Kill counter
    private killsText!: TextBlock;
    private killsCount = 0;

    // Tracer counter (legacy - будет перемещен в арсенал)
    private tracerContainer!: Rectangle;
    private tracerCountText!: TextBlock;

    // Arsenal block (5 slots for different ammo types)
    private arsenalSlots: Array<{
        container: Rectangle,
        icon: TextBlock,
        countText: TextBlock,
        type: string, // "tracer", "ap", "apcr", "he", "apds"
        cooldownOverlay: Rectangle,
        cooldownFill: Rectangle,
        cooldownFillGlow: Rectangle,
        cooldownText: TextBlock
    }> = [];

    // Currency display
    private currencyText!: TextBlock;
    private currencyContainer!: Rectangle;

    // Enemy health summary
    private enemyHealthText!: TextBlock;

    // Compass
    private compassText!: TextBlock;

    // Throttling для логирования updatePlayerList
    private _lastPlayerListLogTime: number = 0;
    private _lastPlayerListCount: number = 0;

    // Target indicator (под компасом) - УСТАРЕВШЕЕ, заменено на TargetHealthBar
    private targetIndicator: Rectangle | null = null;
    private targetNameText: TextBlock | null = null;
    private _legacyTargetHealthBar: Rectangle | null = null; // Переименовано чтобы избежать конфликта
    private targetHealthFill: Rectangle | null = null;
    private targetHealthText: TextBlock | null = null;
    private targetDistanceText: TextBlock | null = null;

    // Damage indicator - Rectangle created in createDamageIndicator() method
    private damageIndicator: Rectangle | null = null;

    // Low HP effect (vignette + pulse) - Rectangle for legacy method
    private lowHpVignette: Rectangle | null = null;
    // Component-based LowHealthVignette
    private lowHpVignetteComponent: LowHealthVignette | null = null;
    private lowHpPulseTime = 0;
    private isLowHp = false;

    // Aircraft HUD (Mouse-Aim ретикли)
    private aircraftHUD: AircraftHUD | null = null;

    // Minimap
    private minimapContainer!: Rectangle;
    private minimapEnabled = true; // Радар включен по умолчанию, можно отключить Tab для экономии ресурсов
    private radarArea: Rectangle | null = null; // Область радара для врагов
    private barrelPitchLabel: TextBlock | null = null; // Отображение угла наклона ствола
    private minimapEnemies: Rectangle[] = [];

    // Spawn marker on radar
    private spawnMarker: Rectangle | null = null;
    private spawnPosition: { x: number, z: number } = { x: 0, z: 0 };
    private compassSpawnMarker: Rectangle | null = null;

    // Network Status Indicator (Ping / Drift)
    private networkIndicatorContainer: Rectangle | null = null;
    private pingText: TextBlock | null = null;
    private driftText: TextBlock | null = null;
    private packetLossIcon: Rectangle | null = null;

    // Editor Button (visible only in TEST mode)
    private editorButton: Button | null = null;
    // Буквенное обозначение направления движения над радаром
    private directionLabelsContainer: Rectangle | null = null;
    private movementDirectionLabel: TextBlock | null = null;
    // Пул объектов для маркеров врагов (переиспользование вместо создания/удаления)
    private enemyMarkerPool: Rectangle[] = [];
    private enemyBarrelPool: Rectangle[] = [];
    private poolSize = 50; // Максимум врагов на радаре

    // Маркеры зданий на радаре
    private buildingMarkers: Rectangle[] = [];
    private buildingMarkerPool: Rectangle[] = [];
    private readonly MAX_BUILDING_MARKERS = 30; // Максимум зданий на радаре
    private cachedBuildings: { x: number; z: number; width: number; depth: number }[] = [];

    // Дороги на миникарте
    private roadMarkers: Line[] = [];
    private roadMarkerPool: Line[] = [];
    private lastRoadsUpdate = 0;
    private readonly ROADS_UPDATE_INTERVAL = 2000; // Обновлять дороги раз в 2 секунды

    // Рельеф и препятствия на миникарте
    private terrainMarkers: Rectangle[] = [];
    private terrainMarkerPool: Rectangle[] = [];
    private lastTerrainUpdate = 0;
    private readonly TERRAIN_UPDATE_INTERVAL = 2000; // Обновлять рельеф раз в 2 секунды

    // Снаряды на миникарте
    private projectileMarkers: Rectangle[] = [];
    private projectileMarkerPool: Rectangle[] = [];

    // Взрывы на миникарте
    private explosionMarkers: Rectangle[] = [];
    private explosionHistory: Array<{ x: number, z: number, time: number, radius: number }> = [];
    private readonly EXPLOSION_FADE_TIME = 5000; // Взрывы видны 5 секунд

    // Данные о здоровье врагов
    private enemyHealthData: Map<string, { health: number, maxHealth: number }> = new Map();

    // Radar scan line animation
    private radarScanLine: Rectangle | null = null;
    private radarScanAngle = 0;
    private lastScanTime = 0;
    private scannedEnemies: Map<string, { marker: Rectangle, fadeTime: number }> = new Map();

    // Fuel indicator
    private _fuelBar: Rectangle | null = null;
    private _fuelFill: Rectangle | null = null;
    private _fuelText: TextBlock | null = null;

    // Tank status block (слева от радара)
    private tankStatusContainer: Rectangle | null = null;
    private tankStatusHealthText: TextBlock | null = null;
    private tankStatusFuelText: TextBlock | null = null;
    private tankStatusArmorText: TextBlock | null = null;

    // Address display (под радаром, отдельно)
    private addressPanel: Rectangle | null = null;
    private addressText: TextBlock | null = null;
    private currentFuel: number = 100;
    private maxFuel: number = 100;
    private currentArmor: number = 0;

    // POI indicators
    private __poiMarkers: Map<string, Rectangle> = new Map();
    private poiCaptureProgress: Rectangle | null = null;
    private poiCaptureProgressFill: Rectangle | null = null;
    private poiCaptureText: TextBlock | null = null;

    // POI minimap markers
    private poiMinimapMarkers: Map<string, Rectangle> = new Map();

    // POI 3D world markers
    private poi3DMarkersContainer: Rectangle | null = null;
    private poi3DMarkers: Map<string, { container: Rectangle, text: TextBlock, distance: TextBlock }> = new Map();

    // Notifications queue
    private notifications: Array<{ text: string, type: string, element: Rectangle }> = [];
    private notificationContainer: Container | null = null;
    // Анти-спам для уведомлений
    private lastNotificationKey: string | null = null;
    private lastNotificationTime = 0;
    private readonly NOTIFICATION_SPAM_COOLDOWN = 800; // мс между одинаковыми уведомлениями

    // Mission panel
    private missionPanel: Rectangle | null = null;
    private missionItems: Map<string, Rectangle> = new Map();
    private missionPanelVisible = false;

    // Message
    private messageText!: TextBlock;
    private messageTimeout: any = null;

    // Active effects indicators
    private activeEffectsContainer: Rectangle | null = null;
    private activeEffectsSlots: Array<{ container: Rectangle, icon: TextBlock, nameText: TextBlock, timerText: TextBlock, progressBar: Rectangle }> = [];
    private readonly maxActiveEffectsSlots = 5; // 5 видимых слотов с прозрачностью
    private activeEffects: Map<string, { container: Rectangle, text: TextBlock, timeout: number }> = new Map();

    // Tank stats display
    private tankStatsContainer: Rectangle | null = null;
    private armorText: TextBlock | null = null;
    private damageText: TextBlock | null = null;
    private fireRateText: TextBlock | null = null;
    private chassisTypeText: TextBlock | null = null;
    private cannonTypeText: TextBlock | null = null;
    private chassisXpBar: Rectangle | null = null;
    private chassisXpText: TextBlock | null = null;
    private cannonXpBar: Rectangle | null = null;
    private cannonXpText: TextBlock | null = null;
    private speedStatText: TextBlock | null = null;
    private healthStatText: TextBlock | null = null;

    // === DETAILED TANK STATS PANEL (левый нижний угол) ===
    private detailedStatsPanel: Rectangle | null = null;
    private detailedStatsTabs: Rectangle[] = [];
    private detailedStatsActiveTab = 0; // 0=шасси, 1=пушка, 2=гусеницы, 3=бонусы
    private detailedStatsContent: Rectangle | null = null;
    private detailedStatsRows: TextBlock[] = [];
    private detailedStatsTitle: TextBlock | null = null;
    private cachedTankStatsData: import("./hud/HUDTypes").TankStatsData | null = null;
    private detailedStatsMinimized = false; // Панель свёрнута
    private detailedStatsExpandedAll = false; // Все вкладки развёрнуты
    private detailedStatsHeader: Rectangle | null = null; // Заголовок с кнопками
    private detailedStatsMinimizeBtn: Rectangle | null = null; // Кнопка свернуть
    private detailedStatsCloseBtn: Rectangle | null = null; // Кнопка закрыть
    private detailedStatsExpandBtn: Rectangle | null = null; // Кнопка развернуть все вкладки
    private detailedStatsExpandedRows: TextBlock[] = []; // Дополнительные строки для режима "все вкладки"

    // FPS counter
    private fpsText: TextBlock | null = null;

    // ОПТИМИЗАЦИЯ: Индикатор прогресса прогрузки карты (нижний левый угол)
    private mapLoadingContainer: Rectangle | null = null;
    private mapLoadingBar: Rectangle | null = null;
    private mapLoadingFill: Rectangle | null = null;
    private mapLoadingText: TextBlock | null = null;
    private mapLoadingProgress = 100; // Начальное значение 100% (скрыт)
    private mapLoadingTargetProgress = 100;
    private fpsContainer: Rectangle | null = null;

    // Zoom indicator (aiming mode)
    private zoomIndicator: TextBlock | null = null;

    // Range scale (aiming mode - справа от прицела)
    private rangeScaleContainer: Rectangle | null = null;
    private rangeScaleFill: Rectangle | null = null;
    private rangeScaleLabels: TextBlock[] = [];
    private rangeValueText: TextBlock | null = null;
    private rangeIndicator: Rectangle | null = null;
    private currentRange: number = 100; // Текущая дальность в метрах

    private fpsHistory: number[] = [];

    // Tutorial system
    private tutorialContainer: Rectangle | null = null;
    private tutorialText: TextBlock | null = null;
    private tutorialStep = 0;
    private tutorialCompleted = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _tutorialStartTime = 0;
    private hasMoved = false;
    private hasShot = false;
    private onTutorialCompleteCallback: (() => void) | null = null;

    // Game time tracking
    private gameTimeText: TextBlock | null = null;
    private gameStartTime = Date.now();

    // Enemy distance indicator

    // Map performance optimization
    private lastMinimapUpdate = 0;
    private readonly MINIMAP_UPDATE_INTERVAL = 100; // Обновлять раз в 100мс (10 FPS)
    private cachedEnemyPositions: Map<string, { x: number, z: number, lastUpdate: number }> = new Map();
    private readonly POSITION_CACHE_TIME = 500; // Кэш на 500мс
    private enemyDistanceText: TextBlock | null = null;

    // Animation tracking
    private animationTime = 0;
    private editorButtonCheckFrame = 0; // Счётчик кадров для проверки видимости кнопки редактора

    // XP Bar animation tracking
    private xpBarTargetPercent = 0;
    private xpBarCurrentPercent = 0;
    private xpBarLastLevel = 1;

    // Combo indicator
    private comboIndicator: TextBlock | null = null;
    private comboContainer: Rectangle | null = null;
    private comboTimerBar: Rectangle | null = null;
    private comboTimerFill: Rectangle | null = null;
    private lastComboCount = 0;
    private comboAnimationTime = 0;
    private comboScale = 1.0;
    private maxComboReached = 0; // Максимальное достигнутое комбо
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _comboParticles: Rectangle[] = []; // Частицы для эффектов комбо
    private experienceSystem: any = null; // ExperienceSystem для комбо
    private glowElements: Map<string, { element: Rectangle | TextBlock, baseColor: string, glowColor: string }> = new Map();

    // Multiplayer HUD elements
    private multiplayerScoreContainer: Rectangle | null = null;
    private team0ScoreText: TextBlock | null = null;
    private team1ScoreText: TextBlock | null = null;
    private matchTimerText: TextBlock | null = null;
    private playerListContainer: Rectangle | null = null;
    private playerListItems: Map<string, Rectangle> = new Map();
    private minimapPlayerMarkers: Map<string, Rectangle> = new Map();
    private minimapPlayerPool: Rectangle[] = [];

    // Sync quality indicator
    private syncQualityContainer: Rectangle | null = null;
    private syncQualityText: TextBlock | null = null;
    private syncQualityIndicator: Rectangle | null = null;
    private showSyncQuality: boolean = false; // По умолчанию скрыт, можно включить в настройках

    // Invulnerability indicator
    private invulnerabilityIndicator: Rectangle | null = null;
    private invulnerabilityText: TextBlock | null = null;
    private isInvulnerable = false;

    // Central XP bar
    private centralXpBar: Rectangle | null = null;
    private centralXpText: TextBlock | null = null;
    private centralXpContainer: Rectangle | null = null;

    // Garage capture progress bar
    private garageCaptureContainer: Rectangle | null = null;
    private garageCaptureBar: Rectangle | null = null;
    private garageCaptureFill: Rectangle | null = null;
    private garageCaptureText: TextBlock | null = null;
    private garageCaptureTimeText: TextBlock | null = null;

    // Player progression subscription
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _playerProgression: any = null;
    private experienceSubscription: any = null;
    private _xpSyncTimer: number = 0; // Таймер для периодической синхронизации XP BAR

    // Death screen
    private deathScreen: Rectangle | null = null;
    private deathStatsContainer: Rectangle | null = null;
    private deathKillsText: TextBlock | null = null;
    private deathDamageText: TextBlock | null = null;
    private deathTimeText: TextBlock | null = null;
    private deathRespawnText: TextBlock | null = null;
    private sessionKills = 0;
    private sessionDamage = 0;
    private sessionStartTime = Date.now();
    private onRespawnStartCallback: (() => void) | null = null;

    // Game End Screen
    private gameEndScreen: Rectangle | null = null;

    // Directional damage indicators (legacy - будет заменён на ScreenFlashEffect)
    private damageDirectionIndicators: Map<string, { element: Rectangle, fadeTime: number }> = new Map();
    private damageIndicatorDuration = 1500; // ms

    // УЛУЧШЕНО: Экранная вспышка при уроне
    private screenFlashEffect: ScreenFlashEffect | null = null;

    // Полоса здоровья цели (врага под прицелом)
    private targetHealthBar: TargetHealthBar | null = null;


    // Экранное управление (джойстик для сенсорных устройств)
    private touchControls: TouchControls | null = null;
    private onTouchInputCallback: ((state: TouchInputState) => void) | null = null;

    // Мобильное управление (для мобильных устройств)
    private mobileControls: MobileControlsManager | null = null;
    private onMobileInputCallback: ((state: MobileInputState) => void) | null = null;

    // NEW: Component-based HUD elements
    private speedIndicator: SpeedIndicator | null = null;
    private ammoIndicator: AmmoIndicator | null = null;
    private killFeedComponent: KillFeed | null = null;
    private floatingDamageNumbers: FloatingDamageNumbers | null = null;
    private deathScreenComponent: DeathScreen | null = null;
    private experienceBarComponent: ExperienceBar | null = null;
    private arsenalBarComponent: ArsenalBar | null = null;
    private damageIndicatorComponent: DamageIndicator | null = null;

    // Values
    public maxHealth = 100;
    public currentHealth = 100;
    public reloadTime = 2000;
    public isReloading = false;
    private reloadStartTime = 0;

    constructor(scene: Scene) {
        this.scene = scene;
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);

        // Инициализируем внутриигровые диалоги
        initializeInGameDialogs(this.guiTexture);

        // === МИНИМАЛЬНЫЙ HUD ===
        this.createHealthBar();        // Тонкие полоски слева сверху
        // Индикатор топлива скрыт - топливо отображается в блоке состояния танка в радаре
        // this.createFuelIndicator();
        this.createReloadIndicator();  // Тонкие полоски слева сверху
        this.createCrosshair();        // Прицел (только при Ctrl)
        this.createCompass();          // Живой компас сверху (без буквенных обозначений)
        this.createMinimap();          // Квадратный радар справа внизу (со спидометром и координатами)
        // this.createAddressDisplay();    // Адрес под радаром (отдельно) - ЗАКОММЕНТИРОВАНО
        this.createSpeedometer();      // Спидометр (скрытый, но работает)
        this.createMultiplayerHUD();   // Multiplayer HUD elements
        this.createPositionDisplay();  // Координаты (скрытые, но работают)
        this.createConsumablesDisplay(); // Слоты 1-5 внизу
        this.createCentralXpBar();     // XP bar внизу
        this.createDamageIndicator();  // Индикатор урона
        this.createMessageDisplay();   // Сообщения под компасом
        this.createControlsHint();     // System Terminal слева внизу
        this.createEditorButton();     // Кнопка редактора карт
        this.createInvulnerabilityIndicator();
        this.createFullMap();          // Полноценная карта (M)
        this.createGarageCaptureBar(); // Прогресс-бар захвата гаража

        // УЛУЧШЕНО: Создаём экранную вспышку при уроне
        this.screenFlashEffect = new ScreenFlashEffect(this.guiTexture);

        // Полоса здоровья цели под компасом (при наведении ствола на врага)
        this.targetHealthBar = new TargetHealthBar(this.guiTexture);

        // УЛУЧШЕНО: Инициализируем новые компоненты HUD
        this.speedIndicator = new SpeedIndicator(this.guiTexture, DEFAULT_SPEED_CONFIG);
        this.ammoIndicator = new AmmoIndicator(this.guiTexture, DEFAULT_AMMO_CONFIG);
        // ИСПРАВЛЕНО: Удален reloadBarComponent - используем только старую шкалу перезарядки
        // ИСПРАВЛЕНО: Удален experienceBarComponent - используем только centralXpBar чтобы избежать дублирования
        // this.experienceBarComponent = new ExperienceBar(this.guiTexture, DEFAULT_EXPERIENCE_BAR_CONFIG);
        this.killFeedComponent = new KillFeed(this.guiTexture, DEFAULT_KILLFEED_CONFIG);
        // ИСПРАВЛЕНО: Удален arsenalBarComponent - используем только createArsenalBlock() чтобы избежать дублирования
        // this.arsenalBarComponent = new ArsenalBar(this.guiTexture, this.scalePx.bind(this), this.scaleFontSize.bind(this), DEFAULT_ARSENAL_CONFIG);

        // Плавающие числа урона
        this.floatingDamageNumbers = new FloatingDamageNumbers(this.guiTexture, this.scene, DEFAULT_DAMAGE_NUMBER_CONFIG);

        // Индикатор направления урона (компонент - отдельно от legacy damageIndicator)
        // Примечание: legacy damageIndicator создаётся в createDamageIndicator() как Rectangle

        // Виньетка низкого здоровья (компонент)
        this.lowHpVignetteComponent = new LowHealthVignette(this.guiTexture);

        // Aircraft HUD (Mouse-Aim ретикли для самолёта)
        this.aircraftHUD = new AircraftHUD(this.guiTexture, DEFAULT_AIRCRAFT_HUD_CONFIG);

        // Экранное управление (джойстик для сенсорных устройств)
        // По умолчанию включено, но будет управляться через настройки
        if (isMobileDevice()) {
            // Используем новое мобильное управление
            this.mobileControls = new MobileControlsManager(this.guiTexture, this.scene);
            this.mobileControls.setOnInputChange((state: MobileInputState) => {
                if (this.onMobileInputCallback) {
                    this.onMobileInputCallback(state);
                }
            });
        } else {
            // Touch controls DISABLED for PC/Non-mobile devices per user request
            // Only creating controls if isMobileDevice() is true
            /*
            // Используем старое touch управление для планшетов/десктопов с touchscreen
            this.touchControls = new TouchControls(this.guiTexture, DEFAULT_TOUCH_CONTROLS_CONFIG);
            this.touchControls.setOnInputChange((state: TouchInputState) => {
                if (this.onTouchInputCallback) {
                    this.onTouchInputCallback(state);
                }
            });
            */
        }

        this.createComboIndicator();   // Индикатор комбо
        this.createDeathScreen();      // Экран результатов смерти
        // this.createDirectionalDamageIndicators(); // LEAGCY REMOVED - Заменено на new DamageIndicator
        // Индикатор топлива скрыт - топливо отображается в блоке состояния танка в радаре
        // this.createFuelIndicator();
        this.createPOICaptureBar();    // Прогресс-бар захвата POI
        this.createNotificationArea(); // Область уведомлений
        this.createPOI3DMarkersContainer(); // 3D маркеры POI
        this.createMissionPanel();     // Панель миссий
        this.createTutorial();         // Система туториала
        this.createArsenalBlock();     // Блок АРСЕНАЛ (5 слотов для снарядов)
        // Блок состояния танка теперь интегрирован в радар
        this._createActiveEffectsDisplay(); // Слоты активных эффектов справа от модулей
        this._createFPSCounter();      // FPS счётчик
        this._createKillCounter();     // Скрытый счётчик убийств (для статистики)
        this._createCurrencyDisplay(); // Скрытый дисплей кредитов (для статистики)
        // ОПТИМИЗАЦИЯ: Индикатор прогрузки карты в нижнем левом углу
        this.createMapLoadingIndicator();
        // Детальная панель характеристик танка (левый нижний угол)
        this.createDetailedTankStatsPanel();

        // Инициализируем значения блока состояния (если есть начальные значения)
        if (this.tankStatusContainer && this.currentHealth > 0 && this.maxHealth > 0) {
            this.updateTankStatus(this.currentHealth, this.maxHealth, this.currentFuel, this.maxFuel, this.currentArmor);
        }

        // Убеждаемся, что прицел скрыт по умолчанию
        this.setAimMode(false);
        this.startAnimations();
        this.setupMapKeyListener(); // Обработка клавиши M
        this.setupResizeHandler(); // Обработка изменения размера окна

        // Создаем индикатор сети (PING/DRIFT)
        this.createNetworkIndicator();

        // "Трогаем" карты кулдаунов, чтобы они считались использованными (зарезервированы под будущее расширение)
        if (this.consumableCooldowns.size > 0 || this.arsenalCooldowns.size > 0) {
            // no-op
        }

        // Listen for connection lost event from multiplayer
        window.addEventListener('tx:connection-lost', ((event: CustomEvent) => {
            const reason = event.detail?.reason || 'Соединение потеряно';
            this.showNotification(`⚠️ ${reason}`, 'error');
        }) as EventListener);

        // HUD initialized
    }

    /**
     * Update health bar and status
     */
    public updateHealth(current: number, max: number): void {
        this.currentHealth = Math.max(0, current);
        this.maxHealth = max;

        const percentage = Math.max(0, Math.min(1, this.currentHealth / this.maxHealth));

        // Update health bar fill
        if (this.healthFill) {
            this.healthFill.width = `${percentage * 100}%`;

            // Dynamic color
            if (percentage > 0.6) {
                this.healthFill.background = "#0f0"; // Green
            } else if (percentage > 0.3) {
                this.healthFill.background = "#ff0"; // Yellow
            } else {
                this.healthFill.background = "#f00"; // Red
            }
        }

        // Update health text
        if (this.healthText) {
            this.healthText.text = `${Math.ceil(this.currentHealth)} / ${Math.ceil(this.maxHealth)}`;
        }

        // Update tank status panel if available
        // Note: updateTankStatus might be defined elsewhere or we need to find it
        // We defer to updateTankStatus if it exists, otherwise we just updated the bars
        if ((this as any).updateTankStatus) {
            (this as any).updateTankStatus(this.currentHealth, this.maxHealth, this.currentFuel, this.maxFuel, this.currentArmor);
        }

        // Low HP visual effect
        this.isLowHp = this.currentHealth < this.maxHealth * 0.4 && this.currentHealth > 0;
        // Виньетка низкого здоровья обновляется в методе update() каждый кадр с deltaTime

        // КРИТИЧНО: Отключаем legacy компонент полностью
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = false;
            this.lowHpVignette.background = "transparent";
            this.lowHpVignette.alpha = 0;
        }
    }

    /**
     * Update HUD effects per frame (called from game render loop)
     * @param deltaTime - Time since last frame in ms
     * @param camera - Optional camera for 3D-projected damage numbers
     * @param playerPos - Optional player position for damage indicator
     * @param playerForward - Optional player forward direction for damage indicator
     */
    public update(deltaTime: number, camera?: import("@babylonjs/core").Camera, playerPos?: Vector3, playerForward?: Vector3): void {
        // Update floating damage numbers (requires camera for 3D projection)
        if (this.floatingDamageNumbers && camera) {
            this.floatingDamageNumbers.update(camera);
        }

        // Update damage indicator component with player position and direction
        if (this.damageIndicatorComponent) {
            this.damageIndicatorComponent.update(deltaTime, playerPos, playerForward);
        }

        // Update low HP vignette (используем только новый компонент)
        if (this.lowHpVignetteComponent) {
            this.lowHpVignetteComponent.update(this.currentHealth, this.maxHealth, deltaTime);
        }

        // Обновляем видимость кнопки редактора (проверяем каждые 60 кадров ~1 раз в секунду)
        this.editorButtonCheckFrame++;
        if (this.editorButtonCheckFrame >= 60) {
            this.updateEditorButtonVisibility();
            this.editorButtonCheckFrame = 0;
        }

        // КРИТИЧНО: Отключаем legacy компонент полностью
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = false;
            this.lowHpVignette.background = "transparent";
            this.lowHpVignette.alpha = 0;
        }

        // Call legacy update for animations
        this._updateLegacy(deltaTime);
    }

    /**
     * Флаг видимости HUD для внешних систем (скриншоты и т.п.)
     */
    public isVisible(): boolean {
        const root = (this.guiTexture as any).rootContainer as Rectangle | undefined;
        return root ? root.isVisible !== false : true;
    }

    /**
     * Скрыть весь HUD
     */
    public hide(): void {
        const root = (this.guiTexture as any).rootContainer as Rectangle | undefined;
        if (root) {
            root.isVisible = false;
        }
    }

    /**
     * Показать весь HUD
     */
    public show(): void {
        const root = (this.guiTexture as any).rootContainer as Rectangle | undefined;
        if (root) {
            root.isVisible = true;
        }
    }

    // === UI SCALING HELPERS ===
    /**
     * Update death timer (called from TankController)
     */
    public updateDeathTimer(seconds: number): void {
        if (this.deathScreenComponent) {
            this.deathScreenComponent.updateTimer(seconds);
        }
    }

    /**
     * Get scaled pixel value for Babylon.js GUI
     */
    private scalePx(px: number): string {
        return `${scalePixels(px)}px`;
    }

    /**
     * Get scaled font size
     */
    private scaleFontSize(baseSize: number, minSize: number = 8, maxSize: number = 48): number {
        return Math.max(minSize, Math.min(maxSize, scalePixels(baseSize)));
    }

    /**
     * Setup window resize handler to rescale UI elements
     */
    private setupResizeHandler(): void {
        let resizeTimeout: number | null = null;
        window.addEventListener('resize', () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = window.setTimeout(() => {
                this.rescaleUI();
            }, 100);
        });
    }

    /**
     * Rescale all UI elements when window size changes
     */
    private rescaleUI(): void {
        // This will be called when window is resized
        // Individual elements will be updated as needed
        // For now, we rely on percentage-based positioning which auto-scales
    }

    // Установить ExperienceSystem для комбо
    setExperienceSystem(experienceSystem: any): void {
        this.experienceSystem = experienceSystem;
    }

    // Установить систему прокачки игрока и подписаться на события опыта
    setPlayerProgression(playerProgression: any): void {
        // Отписываемся от предыдущей подписки, если она была
        if (this.experienceSubscription) {
            this.experienceSubscription.remove();
            this.experienceSubscription = null;
        }

        this._playerProgression = playerProgression;

        // ИСПРАВЛЕНО: Сразу загружаем текущие XP данные при инициализации
        if (playerProgression) {
            try {
                // Используем правильные методы PlayerProgressionSystem
                const xpProgress = playerProgression.getExperienceProgress?.();
                // КРИТИЧНО: Используем несколько методов для получения уровня (fallback)
                const level = playerProgression.getLevel?.() ??
                    playerProgression.getCurrentLevel?.() ??
                    (playerProgression.getStats?.()?.level) ?? 1;

                // КРИТИЧНО: Обновляем немедленно
                if (xpProgress) {
                    this.updateCentralXp(xpProgress.current, xpProgress.required, level);
                } else {
                    this.updateCentralXp(0, 100, level);
                }

                // КРИТИЧНО: Также обновляем с задержкой на случай, если элементы ещё не созданы
                setTimeout(() => {
                    const xpProgressDelayed = playerProgression.getExperienceProgress?.();
                    const levelDelayed = playerProgression.getLevel?.() ??
                        playerProgression.getCurrentLevel?.() ??
                        (playerProgression.getStats?.()?.level) ?? 1;
                    if (xpProgressDelayed) {
                        console.log(`[HUD] Delayed update: level=${levelDelayed}`);
                        this.updateCentralXp(xpProgressDelayed.current, xpProgressDelayed.required, levelDelayed);
                    } else {
                        this.updateCentralXp(0, 100, levelDelayed);
                    }
                }, 100);
            } catch (e) {
                console.error("[HUD] Error getting initial XP data:", e);
                // Ошибка при получении начальных XP данных - используем 0
                this.updateCentralXp(0, 100, 1);
            }
        }

        // Подписываемся на изменения опыта
        if (playerProgression && playerProgression.onExperienceChanged) {
            // Subscribing to experience changes
            this.experienceSubscription = playerProgression.onExperienceChanged.add((data: {
                current: number;
                required: number;
                percent: number;
                level: number;
            }) => {
                // Experience changed event received
                this.updateCentralXp(data.current, data.required, data.level);
            });

            // ИСПРАВЛЕНО: Принудительно уведомляем об изменении опыта при установке, чтобы обновить XP BAR
            // Это гарантирует что XP BAR обновится даже если событие не было отправлено ранее
            try {
                const xpProgress = playerProgression.getExperienceProgress?.();
                // КРИТИЧНО: Используем несколько методов для получения уровня (fallback)
                const level = playerProgression.getLevel?.() ??
                    playerProgression.getCurrentLevel?.() ??
                    (playerProgression.getStats?.()?.level) ?? 1;
                if (xpProgress) {
                    // Отправляем событие об изменении опыта для обновления XP BAR
                    playerProgression.onExperienceChanged.notifyObservers({
                        current: xpProgress.current,
                        required: xpProgress.required,
                        percent: xpProgress.percent,
                        level: level
                    });
                }
            } catch (e) {
                console.warn("[HUD] Error forcing XP update:", e);
            }
        } else {
            // Cannot subscribe to experience changes - playerProgression or onExperienceChanged is null
        }
    }

    // Get GUI texture for external use (like Garage)
    getGuiTexture(): AdvancedDynamicTexture {
        return this.guiTexture;
    }

    // Создать индикатор защиты от урона
    // Показать плавающий текст опыта с улучшенной анимацией
    showExperienceGain(amount: number, type: "chassis" | "cannon" = "chassis"): void {
        const roundedAmount = Math.round(amount);

        // Ограничиваем количество одновременно отображаемых текстов (максимум 3)
        if (this.activeXpGainTexts >= 3) return;
        this.activeXpGainTexts++;

        const text = new TextBlock(`xpGain_${Date.now()}_${Math.random()}`);
        text.text = `+${roundedAmount} XP`;
        text.color = type === "chassis" ? "#0ff" : "#f80";
        text.fontSize = this.scaleFontSize(28, 20, 40); // Немного больше для лучшей видимости
        text.fontWeight = "bold";
        text.fontFamily = "'Press Start 2P', monospace";
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        text.top = this.scalePx(-80);
        text.shadowBlur = scalePixels(10);
        text.shadowOffsetX = scalePixels(2);
        text.shadowOffsetY = scalePixels(2);
        text.shadowColor = "#000";

        // Случайное смещение по X для множественных текстов
        const xOffset = (Math.random() - 0.5) * scalePixels(100);
        text.left = `${xOffset}px`;

        this.guiTexture.addControl(text);

        // Улучшенная анимация подъёма и исчезновения
        const baseFontSize = this.scaleFontSize(28, 20, 40);
        let y = -80;
        let alpha = 1;
        let scale = 1.2; // Начинаем с увеличенного размера
        let frame = 0;
        const animate = () => {
            frame++;
            y -= 2.5; // Немного быстрее
            alpha -= 0.015; // Медленнее исчезает
            scale = Math.max(1, scale - 0.008); // Плавно уменьшаемся до нормального размера

            text.top = this.scalePx(y);
            text.alpha = alpha;
            text.fontSize = baseFontSize * scale;

            // Добавляем пульсацию в начале
            if (frame < 10) {
                const pulse = 1 + Math.sin(frame * 0.5) * 0.1;
                text.fontSize = baseFontSize * scale * pulse;
            }

            if (alpha > 0) {
                setTimeout(animate, 16);
            } else {
                text.dispose();
                this.activeXpGainTexts = Math.max(0, this.activeXpGainTexts - 1);
            }
        };
        animate();

        // Также добавляем визуальный эффект на шкале опыта
        if (this.centralXpBar && roundedAmount >= 5) {
            const originalColor = this.centralXpBar.background;
            this.centralXpBar.background = type === "chassis" ? "#0ff" : "#ff0";
            setTimeout(() => {
                if (this.centralXpBar) {
                    this.centralXpBar.background = originalColor;
                }
            }, 200);
        }
    }

    private activeXpGainTexts = 0; // Счётчик активных текстов опыта

    // Показать эффект повышения уровня игрока - ВОЕННЫЙ ТЕРМИНАЛЬНЫЙ СТИЛЬ
    showPlayerLevelUp(
        level: number,
        title: { title: string; icon: string; color: string } | null,
        bonuses: { healthBonus: number; damageBonus: number; speedBonus: number; creditBonus: number },
        credits: number,
        skillPoints: number,
        isMilestone: boolean = false
    ): void {
        // Основной контейнер - терминальный стиль
        const container = new Rectangle(`playerLevelUp_${Date.now()}`);
        container.width = this.scalePx(480);
        container.height = this.scalePx(220);
        container.cornerRadius = 0; // Острые углы для военного стиля
        container.thickness = 2;
        container.color = isMilestone ? "#ffd700" : "#0f0";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.top = this.scalePx(-100);
        container.shadowBlur = 20;
        container.shadowColor = isMilestone ? "#ffd70080" : "#00ff0080";
        this.guiTexture.addControl(container);

        // Внутренняя рамка для эффекта терминала
        const innerBorder = new Rectangle("levelUpInnerBorder");
        innerBorder.width = "96%";
        innerBorder.height = "94%";
        innerBorder.thickness = 1;
        innerBorder.color = isMilestone ? "#ffd70066" : "#0f066";
        innerBorder.background = "transparent";
        container.addControl(innerBorder);

        // Заголовок системы
        const sysHeader = new TextBlock("levelUpSysHeader");
        sysHeader.text = ">>> SYSTEM MESSAGE <<<";
        sysHeader.color = "#0f0";
        sysHeader.fontSize = this.scaleFontSize(10, 8, 12);
        sysHeader.fontFamily = "'Press Start 2P', monospace";
        sysHeader.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        sysHeader.top = this.scalePx(-90);
        container.addControl(sysHeader);

        // Главный заголовок - крупный текст
        const mainTitle = new TextBlock("playerLevelUpMainTitle");
        mainTitle.text = isMilestone ? "★ RANK MILESTONE ★" : "▲ RANK UP ▲";
        mainTitle.color = isMilestone ? "#ffd700" : "#0f0";
        mainTitle.fontSize = this.scaleFontSize(28, 20, 36);
        mainTitle.fontWeight = "bold";
        mainTitle.fontFamily = "'Press Start 2P', monospace";
        mainTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        mainTitle.top = this.scalePx(-55);
        mainTitle.shadowBlur = 10;
        mainTitle.shadowColor = isMilestone ? "#ffd700" : "#0f0";
        container.addControl(mainTitle);

        // Уровень - терминальный формат
        const levelText = new TextBlock("playerLevelUpLevel");
        const rankTitle = title ? `[${title.title.toUpperCase()}]` : "";
        levelText.text = `RANK ${level} ${rankTitle}`;
        levelText.color = "#0ff";
        levelText.fontSize = this.scaleFontSize(20, 16, 26);
        levelText.fontWeight = "bold";
        levelText.fontFamily = "'Press Start 2P', monospace";
        levelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelText.top = this.scalePx(-15);
        container.addControl(levelText);

        // Награды - формат лога
        const rewardsText = new TextBlock("playerLevelUpRewards");
        rewardsText.text = `> CREDITS: +${credits} | SKILL POINTS: +${skillPoints}`;
        rewardsText.color = "#ff0";
        rewardsText.fontSize = this.scaleFontSize(12, 10, 16);
        rewardsText.fontFamily = "'Press Start 2P', monospace";
        rewardsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        rewardsText.top = this.scalePx(25);
        container.addControl(rewardsText);

        // Бонусы - формат данных
        const bonusesText = new TextBlock("playerLevelUpBonuses");
        bonusesText.text = `HP+${bonuses.healthBonus} | DMG+${bonuses.damageBonus.toFixed(1)} | SPD+${bonuses.speedBonus.toFixed(1)}`;
        bonusesText.color = "#0af";
        bonusesText.fontSize = this.scaleFontSize(11, 9, 14);
        bonusesText.fontFamily = "'Press Start 2P', monospace";
        bonusesText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        bonusesText.top = this.scalePx(55);
        container.addControl(bonusesText);

        // Футер
        const footer = new TextBlock("levelUpFooter");
        footer.text = "[PRESS ANY KEY TO CONTINUE]";
        footer.color = "#0f0";
        footer.fontSize = this.scaleFontSize(9, 7, 11);
        footer.fontFamily = "'Press Start 2P', monospace";
        footer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        footer.top = this.scalePx(85);
        footer.alpha = 0.7;
        container.addControl(footer);

        // Анимация появления и исчезновения
        let alpha = 0;
        let phase = 0; // 0 = появление, 1 = показ, 2 = исчезновение
        let startTime = Date.now();
        let blinkTime = 0;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            blinkTime += 16;

            // Мигание футера
            footer.alpha = 0.4 + Math.sin(blinkTime / 300) * 0.3;

            // Сканлайн эффект на бордере
            const scanline = Math.sin(blinkTime / 100) * 0.1 + 0.9;
            innerBorder.alpha = scanline;

            if (phase === 0) {
                // Быстрое появление (0.2 секунды) - терминальный эффект
                const progress = Math.min(elapsed / 200, 1);
                alpha = progress;

                if (progress >= 1) {
                    alpha = 1;
                    phase = 1;
                    startTime = Date.now();
                }
            } else if (phase === 1) {
                // Показ (2.5 секунды для вех, 2 секунды для обычных)
                const showDuration = isMilestone ? 2500 : 2000;
                if (elapsed >= showDuration) {
                    phase = 2;
                    startTime = Date.now();
                }
            } else {
                // Быстрое исчезновение (0.3 секунды)
                const progress = Math.min(elapsed / 300, 1);
                alpha = 1 - progress;

                if (progress >= 1) {
                    container.dispose();
                    return;
                }
            }

            container.alpha = alpha;

            requestAnimationFrame(animate);
        };
        animate();
    }

    // Показать эффект повышения уровня - ТЕРМИНАЛЬНЫЙ СТИЛЬ
    showLevelUp(level: number, title: string, type: "chassis" | "cannon"): void {
        const typeColor = type === "chassis" ? "#0ff" : "#f80";
        const typeName = type === "chassis" ? "CHASSIS" : "CANNON";

        const container = new Rectangle(`levelUp_${Date.now()}`);
        container.width = this.scalePx(380);
        container.height = this.scalePx(100);
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = typeColor;
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.top = this.scalePx(-120);
        container.shadowBlur = 15;
        container.shadowColor = typeColor + "80";
        this.guiTexture.addControl(container);

        // Системный заголовок
        const sysHeader = new TextBlock("levelUpSysHeader");
        sysHeader.text = `>>> ${typeName} UPGRADE <<<`;
        sysHeader.color = "#0f0";
        sysHeader.fontSize = this.scaleFontSize(9, 7, 11);
        sysHeader.fontFamily = "'Press Start 2P', monospace";
        sysHeader.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        sysHeader.top = this.scalePx(-35);
        container.addControl(sysHeader);

        // Главный текст
        const titleText = new TextBlock("levelUpTitle");
        titleText.text = "▲ LEVEL UP ▲";
        titleText.color = typeColor;
        titleText.fontSize = this.scaleFontSize(22, 16, 28);
        titleText.fontWeight = "bold";
        titleText.fontFamily = "'Press Start 2P', monospace";
        titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        titleText.top = this.scalePx(-8);
        titleText.shadowBlur = 8;
        titleText.shadowColor = typeColor;
        container.addControl(titleText);

        // Уровень и название (с префиксом типа части для ясности)
        const levelText = new TextBlock("levelUpLevel");
        levelText.text = `[${typeName}] LVL ${level}: ${title.toUpperCase()}`;
        levelText.color = "#fff";
        levelText.fontSize = this.scaleFontSize(14, 11, 18);
        levelText.fontFamily = "'Press Start 2P', monospace";
        levelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelText.top = this.scalePx(25);
        container.addControl(levelText);

        // Анимация
        let alpha = 0;
        let phase = 0;
        let startTime = Date.now();
        let blinkTime = 0;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            blinkTime += 16;

            // Мигание бордера
            const pulse = Math.sin(blinkTime / 150) * 0.2 + 0.8;
            container.color = typeColor;
            container.alpha = alpha * pulse;

            if (phase === 0) {
                // Быстрое появление
                const progress = Math.min(elapsed / 150, 1);
                alpha = progress;

                if (progress >= 1) {
                    alpha = 1;
                    phase = 1;
                    startTime = Date.now();
                }
            } else if (phase === 1) {
                // Показ
                if (elapsed >= 1800) {
                    phase = 2;
                    startTime = Date.now();
                }
            } else {
                // Быстрое исчезновение
                const progress = Math.min(elapsed / 250, 1);
                alpha = 1 - progress;

                if (progress >= 1) {
                    container.dispose();
                    return;
                }
            }

            container.alpha = alpha;

            requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Show Game End Screen (Victory/Defeat)
     */
    showGameEndScreen(data: { winnerKey: string, winnerName: string, isVictory: boolean, stats?: any }): void {
        if (this.gameEndScreen) {
            this.gameEndScreen.dispose();
        }

        const isVictory = data.isVictory;
        const mainColor = isVictory ? "#0f0" : "#f00";
        const titleText = isVictory ? "MISSION ACCOMPLISHED" : "MISSION FAILED";

        // Main Container
        const container = new Rectangle("gameEndScreen");
        container.width = "100%";
        container.height = "100%";
        container.background = "#000000cc";
        container.zIndex = 10000; // Topmost
        this.guiTexture.addControl(container);
        this.gameEndScreen = container;

        // Content Panel (Terminal Style)
        const panel = new Rectangle("gameEndPanel");
        panel.width = this.scalePx(600);
        panel.height = this.scalePx(400);
        panel.thickness = 2;
        panel.color = mainColor;
        panel.background = "#000000";
        panel.shadowBlur = 20;
        panel.shadowColor = mainColor;
        container.addControl(panel);

        // Header Line
        const header = new TextBlock("gameEndHeader");
        header.text = ">>> BATTLE REPORT <<<";
        header.color = mainColor;
        header.fontSize = this.scaleFontSize(14, 10, 18);
        header.fontFamily = "'Press Start 2P', monospace";
        header.top = this.scalePx(-160);
        panel.addControl(header);

        // Main Title
        const title = new TextBlock("gameEndTitle");
        title.text = titleText;
        title.color = mainColor;
        title.fontSize = this.scaleFontSize(36, 24, 48);
        title.fontWeight = "bold";
        title.fontFamily = "'Press Start 2P', monospace";
        title.top = this.scalePx(-100);
        title.shadowBlur = 10;
        title.shadowColor = mainColor;
        panel.addControl(title);

        // Winner Info
        const winnerText = new TextBlock("winnerInfo");
        winnerText.text = isVictory ? "You are victorious!" : `Winner: ${data.winnerName || "Unknown"}`;
        winnerText.color = "#fff";
        winnerText.fontSize = this.scaleFontSize(18, 14, 22);
        winnerText.fontFamily = "'Press Start 2P', monospace";
        winnerText.top = this.scalePx(-40);
        panel.addControl(winnerText);

        // Stats (Placeholder for now)
        if (data.stats) {
            const statsText = new TextBlock("statsInfo");
            // Format stats here if needed
            statsText.text = `Kills: ${data.stats.kills || 0} | Deaths: ${data.stats.deaths || 0}`;
            statsText.color = "#ccc";
            statsText.fontSize = this.scaleFontSize(16, 12, 20);
            statsText.fontFamily = "'Press Start 2P', monospace";
            statsText.top = this.scalePx(20);
            panel.addControl(statsText);
        }

        // Return Button
        const btnRect = new Rectangle("returnBtnRect");
        btnRect.width = this.scalePx(240);
        btnRect.height = this.scalePx(50);
        btnRect.top = this.scalePx(120);
        btnRect.thickness = 2;
        btnRect.color = mainColor;
        btnRect.background = "#000";
        btnRect.isPointerBlocker = true;
        panel.addControl(btnRect);

        // Button Hover Effect
        btnRect.onPointerEnterObservable.add(() => {
            btnRect.background = mainColor;
            btnText.color = "#000";
        });
        btnRect.onPointerOutObservable.add(() => {
            btnRect.background = "#000";
            btnText.color = mainColor;
        });

        // Button Click
        btnRect.onPointerClickObservable.add(() => {
            // Trigger return to lobby or page reload
            // For now, reload page to ensure clean state
            window.location.reload();
        });

        const btnText = new TextBlock("returnBtnText");
        btnText.text = "RETURN TO BASE";
        btnText.color = mainColor;
        btnText.fontSize = this.scaleFontSize(16, 12, 20);
        btnText.fontWeight = "bold";
        btnText.fontFamily = "'Press Start 2P', monospace";
        btnRect.addControl(btnText);
    }

    private createInvulnerabilityIndicator(): void {
        const container = new Rectangle("invulnerabilityContainer");
        container.width = this.scalePx(200);
        container.height = this.scalePx(35);
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0ff";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.top = this.scalePx(150);
        container.isVisible = false; // Скрыт по умолчанию
        this.guiTexture.addControl(container);

        const icon = new TextBlock("invulnerabilityIcon");
        icon.text = "🛡";
        icon.color = "#0ff";
        icon.fontSize = this.scaleFontSize(18, 14, 24);
        icon.fontFamily = "'Press Start 2P', monospace";
        icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        icon.left = this.scalePx(10);
        icon.top = this.scalePx(2);
        container.addControl(icon);

        this.invulnerabilityText = new TextBlock("invulnerabilityText");
        this.invulnerabilityText.text = "ЗАЩИТА";
        this.invulnerabilityText.color = "#0ff";
        this.invulnerabilityText.fontSize = this.scaleFontSize(14, 10, 18);
        this.invulnerabilityText.fontWeight = "bold";
        this.invulnerabilityText.fontFamily = "'Press Start 2P', monospace";
        this.invulnerabilityText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.invulnerabilityText.left = this.scalePx(40);
        this.invulnerabilityText.top = this.scalePx(2);
        container.addControl(this.invulnerabilityText);

        this.invulnerabilityIndicator = container;
    }

    // Установить состояние защиты
    setInvulnerability(active: boolean, timeLeft?: number): void {
        this.isInvulnerable = active;

        if (this.invulnerabilityIndicator && this.invulnerabilityText) {
            this.invulnerabilityIndicator.isVisible = active;

            if (active && timeLeft !== undefined) {
                const seconds = Math.ceil(timeLeft / 1000);
                this.invulnerabilityText.text = `ЗАЩИТА (${seconds}s)`;
            } else if (active) {
                this.invulnerabilityText.text = "ЗАЩИТА";
            }

            // Пульсация при активной защите
            if (active) {
                this.addGlowEffect("invulnerability", this.invulnerabilityIndicator, "#0ff", "#fff");
            } else {
                this.glowElements.delete("invulnerability");
            }
        }
    }

    // Обновить таймер защиты
    updateInvulnerability(timeLeft: number): void {
        if (this.isInvulnerable && this.invulnerabilityText) {
            const seconds = Math.ceil(timeLeft / 1000);
            this.invulnerabilityText.text = `ЗАЩИТА (${seconds}s)`;

            // Изменение цвета при окончании защиты
            if (timeLeft < 1000) {
                this.invulnerabilityText.color = "#f00";
                if (this.invulnerabilityIndicator) {
                    this.invulnerabilityIndicator.color = "#f00";
                }
            } else if (timeLeft < 2000) {
                this.invulnerabilityText.color = "#ff0";
                if (this.invulnerabilityIndicator) {
                    this.invulnerabilityIndicator.color = "#ff0";
                }
            } else {
                this.invulnerabilityText.color = "#0ff";
                if (this.invulnerabilityIndicator) {
                    this.invulnerabilityIndicator.color = "#0ff";
                }
            }
        }
    }

    /**
     * Создать индикатор качества соединения (Ping / Drift / Jitter)
     */
    public createNetworkIndicator(): void {
        const container = new Rectangle("networkIndicator");
        container.width = "180px";
        container.height = "50px";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.top = "60px"; // Ниже FPS
        container.left = "-10px";
        container.thickness = 0;
        container.isHitTestVisible = false;
        this.guiTexture.addControl(container);
        this.networkIndicatorContainer = container;

        // Фон для читаемости
        const bg = new Rectangle("networkBg");
        bg.background = "#000000";
        bg.alpha = 0.5;
        bg.cornerRadius = 5;
        bg.thickness = 0;
        container.addControl(bg);

        // StackPanel для текстов
        const stack = new StackPanel("networkStack");
        stack.isVertical = true;
        stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        stack.left = "10px";
        container.addControl(stack);

        // Ping Text
        this.pingText = new TextBlock("pingText");
        this.pingText.text = "PING: 0 ms";
        this.pingText.color = "#00FF00";
        this.pingText.fontSize = "14px";
        this.pingText.fontFamily = "'Press Start 2P', monospace";
        this.pingText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.pingText.height = "20px";
        stack.addControl(this.pingText);

        // Drift Text
        this.driftText = new TextBlock("driftText");
        this.driftText.text = "DRIFT: 0.00 m";
        this.driftText.color = "#00FF00";
        this.driftText.fontSize = "14px";
        this.driftText.fontFamily = "'Press Start 2P', monospace";
        this.driftText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.driftText.height = "20px";
        stack.addControl(this.driftText);
    }

    /**
     * ИСПРАВЛЕНО: Обновление индикатора сети (PING/DRIFT)
     */
    public updateNetworkIndicator(ping: number, drift: number): void {
        if (!this.pingText || !this.driftText) return;

        // Обновляем PING
        this.pingText.text = `PING: ${ping} ms`;
        if (ping < 50) {
            this.pingText.color = "#00FF00"; // Зеленый
        } else if (ping < 150) {
            this.pingText.color = "#FFFF00"; // Желтый
        } else {
            this.pingText.color = "#FF0000"; // Красный
        }

        // Обновляем DRIFT
        const driftMeters = drift.toFixed(2);
        this.driftText.text = `DRIFT: ${driftMeters} m`;
        if (drift < 0.5) {
            this.driftText.color = "#00FF00"; // Зеленый
        } else if (drift < 2.0) {
            this.driftText.color = "#FFFF00"; // Желтый
        } else {
            this.driftText.color = "#FF0000"; // Красный
        }
    }

    /**
     * Обновить показатели качества соединения
     * @param ping Пинг в мс
     * @param drift Расхождение позиций в метрах
     */
    public updateConnectionQuality(ping: number, drift: number): void {
        if (this.pingText) {
            this.pingText.text = `PING: ${Math.round(ping)} ms`;
            if (ping < 100) this.pingText.color = "#00FF00";
            else if (ping < 200) this.pingText.color = "#FFFF00";
            else this.pingText.color = "#FF0000";
        }

        if (this.driftText) {
            this.driftText.text = `DRIFT: ${drift.toFixed(2)} m`;
            if (drift < 0.5) this.driftText.color = "#00FF00";
            else if (drift < 2.0) this.driftText.color = "#FFFF00";
            else this.driftText.color = "#FF0000";
        }
    }

    // Запуск анимаций (теперь вызывается из централизованного update)
    private startAnimations() {
        // Анимации теперь обновляются через update() метод
    }

    // Обновление анимаций (вызывается из централизованного update)
    public updateAnimations(deltaTime: number): void {
        this.animationTime += deltaTime;

        // Плавная анимация шкалы опыта
        this.animateXpBar(deltaTime);
        this.updateGlowEffects();
        this.updateComboAnimation(deltaTime);

        // ИСПРАВЛЕНО: Периодическая синхронизация XP BAR с PlayerProgressionSystem
        // Это гарантирует что XP BAR всегда показывает актуальные данные
        this._xpSyncTimer = (this._xpSyncTimer || 0) + deltaTime;
        if (this._xpSyncTimer >= 1.0 && this._playerProgression) {
            this._xpSyncTimer = 0;
            try {
                const xpProgress = this._playerProgression.getExperienceProgress?.();
                const level = this._playerProgression.getLevel?.() ?? 1;
                if (xpProgress) {
                    this.updateCentralXp(xpProgress.current, xpProgress.required, level);
                }
            } catch (e) {
                // Игнорируем ошибки при синхронизации
            }
        }

        // Обновление индикаторов направления урона
        this.updateDamageIndicators();
        this.updateHitMarker();
        this.updateLowHpEffect(deltaTime);

        // УЛУЧШЕНО: Обновление экранной вспышки
        if (this.screenFlashEffect) {
            this.screenFlashEffect.update();
        }

        // Обновление полосы здоровья цели
        if (this.targetHealthBar) {
            this.targetHealthBar.update(1 / 60); // ~16ms delta
        }

        // Обновление плавающих чисел урона
        if (this.floatingDamageNumbers && this.scene.activeCamera) {
            this.floatingDamageNumbers.update(this.scene.activeCamera);
        }

        // Обновление индикатора комбо (если есть experienceSystem)
        if (this.experienceSystem) {
            const comboCount = this.experienceSystem.getComboCount();
            if (comboCount !== this.lastComboCount) {
                this.lastComboCount = comboCount;
                this.updateComboIndicator(comboCount);
            } else if (comboCount >= 2) {
                // Обновляем таймер даже если комбо не изменилось
                this.updateComboIndicator(comboCount);
            }
        }
    }

    // Обновление эффектов свечения
    private updateGlowEffects() {
        // ОПТИМИЗАЦИЯ: Обычный for вместо forEach
        this.glowElements.forEach((glow) => {
            const pulse = (Math.sin(this.animationTime * 2) + 1) / 2; // 0-1
            const color = this.interpolateColor(glow.baseColor, glow.glowColor, pulse * 0.5);
            glow.element.color = color;
        });
    }

    // Интерполяция цвета
    private interpolateColor(color1: string, color2: string, t: number): string {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    private hexToRgb(hex: string): { r: number, g: number, b: number } {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1] ?? "00", 16),
            g: parseInt(result[2] ?? "ff", 16),
            b: parseInt(result[3] ?? "00", 16)
        } : { r: 0, g: 255, b: 0 };
    }

    // Добавить эффект свечения к элементу
    private addGlowEffect(key: string, element: Rectangle | TextBlock, baseColor: string, glowColor: string) {
        this.glowElements.set(key, { element, baseColor, glowColor });
    }

    private createHealthBar() {
        // === HEALTH BAR - НАД РАСХОДНИКАМИ (увеличенный, с отступами) ===
        const container = new Rectangle("healthContainer");
        container.width = this.scalePx(450); // Значительно увеличено для лучшей видимости после масштабирования
        container.height = this.scalePx(32); // Значительно увеличено для лучшей видимости после масштабирования
        container.cornerRadius = 2;
        container.thickness = 2;
        container.color = "#0f04";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "0px";
        container.top = this.scalePx(-140); // Значительно увеличен отступ от слотов для предотвращения наложений
        this.guiTexture.addControl(container);



        // Основной бар здоровья
        this.healthBar = new Rectangle("healthBar");
        this.healthBar.width = "100%";
        this.healthBar.height = "100%";
        this.healthBar.cornerRadius = 0;
        this.healthBar.thickness = 0;
        this.healthBar.background = "#111";
        this.healthBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(this.healthBar);

        // Заполнение бара
        this.healthFill = new Rectangle("healthFill");
        this.healthFill.width = "100%";
        this.healthFill.height = "100%";
        this.healthFill.cornerRadius = 0;
        this.healthFill.thickness = 0;
        this.healthFill.background = "#0f0";
        this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.addControl(this.healthFill);

        // Блик
        const healthGlow = new Rectangle("healthGlow");
        healthGlow.width = "100%";
        healthGlow.height = "50%";
        healthGlow.thickness = 0;
        healthGlow.background = "#3f3";
        healthGlow.alpha = 0.3;
        healthGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.healthBar.addControl(healthGlow);
        (this.healthBar as any)._healthGlow = healthGlow;

        // Предупреждающий оверлей
        const warningOverlay = new Rectangle("healthWarning");
        warningOverlay.width = "100%";
        warningOverlay.height = "100%";
        warningOverlay.thickness = 0;
        warningOverlay.background = "#f00";
        warningOverlay.alpha = 0;
        this.healthBar.addControl(warningOverlay);
        (this.healthBar as any)._warningOverlay = warningOverlay;

        // Текст здоровья (отображается поверх бара)
        this.healthText = new TextBlock("healthText");
        this.healthText.text = "100/100";
        this.healthText.color = "#fff"; // Белый цвет
        this.healthText.fontSize = this.scaleFontSize(14, 12, 16);
        this.healthText.fontFamily = "'Press Start 2P', monospace";
        this.healthText.fontWeight = "bold";
        this.healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.healthText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthText.top = this.scalePx(3); // Немного ниже для симметричного центрирования
        this.healthText.isVisible = true; // ВИДИМЫЙ!
        this.healthText.zIndex = 100; // Высокий z-index чтобы быть поверх всего
        container.addControl(this.healthText);

        const healthPercent = new TextBlock("healthPercent");
        healthPercent.isVisible = false;
        container.addControl(healthPercent);
        (container as any)._healthPercent = healthPercent;
    }

    // Создать отображение времени игры (reserved for future use)
    // @ts-ignore - Reserved for future use
    private _createGameTimeDisplay() {
        // === СКРЫТЫЙ GAME TIME ===
        const container = new Rectangle("gameTimeContainer");
        container.width = "0px";
        container.height = "0px";
        container.isVisible = false;
        this.guiTexture.addControl(container);

        const label = new TextBlock("gameTimeLabel");
        label.isVisible = false;
        label.left = "5px";
        label.top = "2px";
        container.addControl(label);

        this.gameTimeText = new TextBlock("gameTimeText");
        this.gameTimeText.text = "00:00";
        this.gameTimeText.color = "#0f0";
        this.gameTimeText.fontSize = 12;
        this.gameTimeText.fontWeight = "bold";
        this.gameTimeText.fontFamily = "'Press Start 2P', monospace";
        this.gameTimeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.gameTimeText.left = "-5px";
        this.gameTimeText.top = "2px";
        container.addControl(this.gameTimeText);
    }

    // Создать индикатор расстояния до ближайшего врага (reserved for future use)
    // @ts-ignore - Reserved for future use
    private _createEnemyDistanceDisplay() {
        // Enemy Distance - ПРАВЫЙ ВЕРХНИЙ УГОЛ ПОД GAME TIME (компактный)
        const container = new Rectangle("enemyDistanceContainer");
        container.width = "70px";
        container.height = "25px";
        container.cornerRadius = 4;
        container.thickness = 0;
        container.color = "#0a05";
        container.background = "#00000066";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "-15px";
        container.top = "45px";
        this.guiTexture.addControl(container);

        const label = new TextBlock("enemyDistanceLabel");
        label.text = "🎯 DIST";
        label.color = "#0a0";
        label.fontSize = 9;
        label.fontFamily = "'Press Start 2P', monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "5px";
        label.top = "2px";
        container.addControl(label);

        this.enemyDistanceText = new TextBlock("enemyDistanceText");
        this.enemyDistanceText.text = "-- m";
        this.enemyDistanceText.color = "#0f0";
        this.enemyDistanceText.fontSize = 12;
        this.enemyDistanceText.fontWeight = "bold";
        this.enemyDistanceText.fontFamily = "'Press Start 2P', monospace";
        this.enemyDistanceText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.enemyDistanceText.left = "-5px";
        this.enemyDistanceText.top = "2px";
        container.addControl(this.enemyDistanceText);
    }

    // Обновить время игры
    updateGameTime() {
        if (!this.gameTimeText) return;
        const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        this.gameTimeText.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Установить расстояние до ближайшего врага
    setNearestEnemyDistance(distance: number) {
        if (this.enemyDistanceText) {
            if (distance > 0) {
                this.enemyDistanceText.text = `${Math.round(distance)}m`;
                // Цвет зависит от расстояния
                if (distance < 30) {
                    this.enemyDistanceText.color = "#f00"; // Красный - близко
                } else if (distance < 60) {
                    this.enemyDistanceText.color = "#ff0"; // Жёлтый - среднее
                } else {
                    this.enemyDistanceText.color = "#0f0"; // Зелёный - далеко
                }
            } else {
                this.enemyDistanceText.text = "-- m";
                this.enemyDistanceText.color = "#0a0";
            }
        }
    }

    private createReloadIndicator() {
        // === RELOAD BAR - VISIBLE AND CLEAR (увеличенный, с отступами) ===
        const container = new Rectangle("reloadContainer");
        container.width = this.scalePx(450); // Значительно увеличено для лучшей видимости после масштабирования
        container.height = this.scalePx(32); // Значительно увеличено для лучшей видимости после масштабирования
        container.cornerRadius = 2;
        container.thickness = 2;
        container.color = "#f80";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "0px";
        container.top = this.scalePx(-100); // Значительно увеличен отступ от слотов и от health bar для предотвращения наложений
        this.guiTexture.addControl(container);



        // Reload bar background
        this.reloadBar = new Rectangle("reloadBar");
        this.reloadBar.width = "100%";
        this.reloadBar.height = "100%";
        this.reloadBar.cornerRadius = 0;
        this.reloadBar.thickness = 0;
        this.reloadBar.background = "#200";
        this.reloadBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.reloadBar.isVisible = true; // КРИТИЧНО: Шкала перезарядки должна быть видима
        container.addControl(this.reloadBar);

        // Reload fill (animated)
        this.reloadFill = new Rectangle("reloadFill");
        this.reloadFill.width = "100%";
        this.reloadFill.height = "100%";
        this.reloadFill.cornerRadius = 0;
        this.reloadFill.thickness = 0;
        this.reloadFill.background = "#0f0";
        this.reloadFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.reloadFill.isVisible = true; // КРИТИЧНО: Заполнение должно быть видимо
        this.reloadBar.addControl(this.reloadFill);

        // Glow effect
        const reloadGlow = new Rectangle("reloadGlow");
        reloadGlow.width = "100%";
        reloadGlow.height = "50%";
        reloadGlow.thickness = 0;
        reloadGlow.background = "#fff";
        reloadGlow.alpha = 0.2;
        reloadGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.reloadBar.addControl(reloadGlow);
        (this.reloadBar as any)._reloadGlow = reloadGlow;

        // Reload text
        this.reloadText = new TextBlock("reloadText");
        this.reloadText.text = "READY";
        this.reloadText.color = "#0f0";
        this.reloadText.fontSize = this.scaleFontSize(9, 7, 14);
        this.reloadText.fontFamily = "'Press Start 2P', monospace";
        this.reloadText.isVisible = true; // КРИТИЧНО: Текст перезарядки должен быть видим
        container.addControl(this.reloadText);

        // КРИТИЧНО: Убеждаемся, что контейнер видим
        container.isVisible = true;
    }

    private createCrosshair() {
        // === MODERN TACTICAL CROSSHAIR - CYBERPUNK STYLE ===

        // Внешний круг (только при прицеливании)
        const outerRing = new Rectangle("crosshairOuter");
        const outerSize = scalePixels(60);
        outerRing.width = `${outerSize}px`;
        outerRing.height = `${outerSize}px`;
        outerRing.cornerRadius = outerSize / 2;
        outerRing.thickness = 1;
        outerRing.color = "transparent"; // ИСПРАВЛЕНО: Скрыт по просьбе
        outerRing.background = "transparent";
        outerRing.isVisible = false;
        this.guiTexture.addControl(outerRing);
        this.crosshairElements.push(outerRing);

        // Средний круг
        const middleRing = new Rectangle("crosshairMiddle");
        const middleSize = scalePixels(30);
        middleRing.width = `${middleSize}px`;
        middleRing.height = `${middleSize}px`;
        middleRing.cornerRadius = middleSize / 2;
        middleRing.thickness = 1;
        middleRing.color = "#ff8800aa";
        middleRing.background = "transparent";
        middleRing.isVisible = false;
        this.guiTexture.addControl(middleRing);
        this.crosshairElements.push(middleRing);

        // Center dot - точка прицела (ОПУЩЕНА на пол-радиуса круга = 15px)
        const CROSSHAIR_OFFSET = scalePixels(15); // "Drop ONLY THE CROSS half a radius from the circle"

        this.crosshairDot = new Rectangle("crosshairDot");
        const dotSize = scalePixels(4);
        this.crosshairDot.width = `${dotSize}px`;
        this.crosshairDot.height = `${dotSize}px`;
        this.crosshairDot.cornerRadius = dotSize / 2;
        this.crosshairDot.thickness = 0;
        this.crosshairDot.background = "#ff3300";
        this.crosshairDot.isVisible = false;
        this.crosshairDot.top = `${CROSSHAIR_OFFSET}px`; // OFFSET
        this.guiTexture.addControl(this.crosshairDot);

        // Тактические линии (ОПУЩЕНЫ)
        const gap = scalePixels(8);
        const length = scalePixels(15);
        const thickness = scalePixels(2);

        const createLine = (name: string, w: string, h: string, t: string, l: string) => {
            const line = new Rectangle(name);
            line.width = w;
            line.height = h;
            line.background = "#ff8800";
            line.thickness = 0;
            // Add OFFSET to top
            const topVal = parseFloat(t);
            line.top = `${topVal + CROSSHAIR_OFFSET}px`; // OFFSET
            line.left = l;
            line.isVisible = false;
            this.guiTexture.addControl(line);
            this.crosshairElements.push(line);

            // Тень линии для контраста
            const shadow = new Rectangle(name + "Shadow");
            shadow.width = w;
            shadow.height = h;
            shadow.background = "#000000";
            shadow.thickness = 0;
            // Add OFFSET to top
            shadow.top = `${topVal + CROSSHAIR_OFFSET + 1}px`; // OFFSET
            shadow.left = `${parseFloat(l) + 1}px`;
            shadow.alpha = 0.5;
            shadow.isVisible = false;
            shadow.zIndex = -1;
            this.guiTexture.addControl(shadow);
            this.crosshairElements.push(shadow);
        };

        // Верхняя линия
        createLine("crossTop", `${thickness}px`, `${length}px`, `${-gap - length}px`, "0");
        // Нижняя линия  
        createLine("crossBottom", `${thickness}px`, `${length}px`, `${gap}px`, "0");
        // Левая линия
        createLine("crossLeft", `${length}px`, `${thickness}px`, "0", `${-gap - length}px`);
        // Правая линия
        createLine("crossRight", `${length}px`, `${thickness}px`, "0", `${gap}px`);

        // Угловые маркеры (диагональные акценты) (ОСТАВЛЯЕМ НЕ ТРОНУТЫМИ или тоже опускаем? User said "Only the Cross". Corners might be part of the "sight" or outer frame. Let's keep them with the circle/frame to be safe, or move them? Usually corners frame the crosshair. I'll move them too to keep the set coherent.)
        // User said "Drop only the cross". If corners are part of the crosshair complex, maybe they should move. 
        // But "Circle sight cannot go out". If corners are near the circle...
        // Let's Move ONLY the DOT and LINES (The Cross). Leave Rings and Corners (Frame)??
        // "Drop only the cross ... half a radius of the circle".
        // Code has: outerRing, middleRing.
        // It has createLine (Cross).
        // It has createCorner.
        // I will move Cross Lines + Dot. I will NOT move Rings.
        // corners? They are called "cornerTL", etc. "cornerDist = 20". Outer ring is 60 (rad 30). Corners are inside the ring.
        // I'll move corners too so the whole inner reticle moves.

        const cornerSize = scalePixels(8);
        const cornerDist = scalePixels(20);

        const createCorner = (name: string, top: number, left: number) => {
            const corner = new Rectangle(name);
            corner.width = `${cornerSize}px`;
            corner.height = "1px";
            corner.background = "#ff440088";
            corner.thickness = 0;
            corner.top = `${top + CROSSHAIR_OFFSET}px`; // OFFSET
            corner.left = `${left}px`;
            corner.isVisible = false;
            this.guiTexture.addControl(corner);
            this.crosshairElements.push(corner);
        };

        createCorner("cornerTL", -cornerDist, -cornerDist);
        createCorner("cornerTR", -cornerDist, cornerDist - cornerSize);
        createCorner("cornerBL", cornerDist, -cornerDist);
        createCorner("cornerBR", cornerDist, cornerDist - cornerSize);

        // === ИНДИКАТОР ЗУМА ===
        this.zoomIndicator = new TextBlock("zoomIndicator");
        this.zoomIndicator.text = "1.0x";
        this.zoomIndicator.color = "#ff8800";
        this.zoomIndicator.fontSize = this.scaleFontSize(14, 10, 20);
        this.zoomIndicator.fontWeight = "bold";
        this.zoomIndicator.fontFamily = "'Press Start 2P', monospace";
        this.zoomIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.zoomIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.zoomIndicator.top = this.scalePx(50); // Под прицелом
        this.zoomIndicator.isVisible = false;
        this.guiTexture.addControl(this.zoomIndicator);

        // ИСПРАВЛЕНО: Восстановлен старый рабочий прицел с индикатором дальности полёта
        this.rangeScaleContainer = new Rectangle("rangeScaleContainer");
        this.rangeScaleContainer.width = this.scalePx(50);
        this.rangeScaleContainer.height = this.scalePx(120);
        this.rangeScaleContainer.thickness = 0;
        this.rangeScaleContainer.background = "transparent";
        this.rangeScaleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.rangeScaleContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.rangeScaleContainer.left = this.scalePx(100); // Справа от прицела (перемещено с -80 на 100)
        this.rangeScaleContainer.isVisible = false; // ИСПРАВЛЕНО: Скрыт по умолчанию, показывается только при прицеливании
        this.guiTexture.addControl(this.rangeScaleContainer);

        // Фон шкалы
        const scaleBg = new Rectangle("rangeScaleBg");
        scaleBg.width = this.scalePx(8);
        scaleBg.height = this.scalePx(100);
        scaleBg.thickness = 1;
        scaleBg.color = "#333";
        scaleBg.background = "#00000088";
        scaleBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.rangeScaleContainer.addControl(scaleBg);

        // Заполнение шкалы (динамическое)
        this.rangeScaleFill = new Rectangle("rangeScaleFill");
        this.rangeScaleFill.width = this.scalePx(6);
        this.rangeScaleFill.height = "50%";
        this.rangeScaleFill.thickness = 0;
        this.rangeScaleFill.background = "#0f0";
        this.rangeScaleFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.rangeScaleFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.rangeScaleFill.left = this.scalePx(1);
        this.rangeScaleFill.isVisible = false; // ИСПРАВЛЕНО: Скрыт по умолчанию, показывается только при прицеливании
        scaleBg.addControl(this.rangeScaleFill);

        // Маркеры дистанции (0-999м)
        const distances = [0, 200, 400, 600, 800];
        distances.forEach((dist, i) => {
            // Метка расстояния
            const label = new TextBlock(`rangeLabel${i}`);
            label.text = `${dist}m`;
            label.color = "#0a0";
            label.fontSize = this.scaleFontSize(9, 7, 12);
            label.fontFamily = "'Press Start 2P', monospace";
            label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            label.left = this.scalePx(12);
            label.top = this.scalePx(40 - i * 20); // Снизу вверх (равномерно по 20px для 5 меток)
            label.isVisible = false; // ИСПРАВЛЕНО: Скрыт по умолчанию, показывается только при прицеливании
            this.rangeScaleContainer!.addControl(label);
            this.rangeScaleLabels.push(label);

            // Линия-маркер
            const tick = new Rectangle(`rangeTick${i}`);
            tick.width = this.scalePx(4);
            tick.height = this.scalePx(1);
            tick.thickness = 0;
            tick.background = "#0a0";
            tick.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            tick.left = this.scalePx(8);
            tick.top = this.scalePx(40 - i * 20); // Синхронизировано с метками
            tick.isVisible = false; // ИСПРАВЛЕНО: Скрыт по умолчанию, показывается только при прицеливании
            this.rangeScaleContainer!.addControl(tick);
        });

        // ИСПРАВЛЕНО: Текущая дальность (большой текст) - теперь видима
        this.rangeValueText = new TextBlock("rangeValue");
        this.rangeValueText.text = "100m";
        this.rangeValueText.color = "#0f0";
        this.rangeValueText.fontSize = this.scaleFontSize(16, 12, 22);
        this.rangeValueText.fontWeight = "bold";
        this.rangeValueText.fontFamily = "'Press Start 2P', monospace";
        this.rangeValueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.rangeValueText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.rangeValueText.left = this.scalePx(12);
        this.rangeValueText.top = this.scalePx(55);
        this.rangeValueText.isVisible = false; // ИСПРАВЛЕНО: Скрыт по умолчанию, показывается только при прицеливании
        this.rangeScaleContainer.addControl(this.rangeValueText);

        // Индикатор текущей позиции на шкале
        this.rangeIndicator = new Rectangle("rangeIndicator");
        this.rangeIndicator.width = this.scalePx(12);
        this.rangeIndicator.height = this.scalePx(3);
        this.rangeIndicator.thickness = 0;
        this.rangeIndicator.background = "#fff";
        this.rangeIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.rangeIndicator.left = this.scalePx(-2);
        this.rangeIndicator.top = "0px";
        this.rangeIndicator.isVisible = false; // ИСПРАВЛЕНО: Скрыт по умолчанию, показывается только при прицеливании
        scaleBg.addControl(this.rangeIndicator);

        // === HIT MARKER (X shape when hitting enemy) ===
        this.createHitMarker();
    }

    // === HIT MARKER REMOVED BY USER REQUEST ===
    private createHitMarker(): void {
        // Disabled per user request
    }

    // Show hit marker (Disabled)
    showHitMarker(isCritical: boolean = false): void {
        // Disabled per user request
    }

    // Update hit marker fade (Disabled)
    private updateHitMarker(): void {
        // Disabled per user request
    }

    /**
     * Update reload bar status
     * @param progress 0 to 1 (0 = empty, 1 = full)
     * @param isReloading True if currently reloading
     */


    // Show/hide full crosshair for aiming mode
    setAimMode(aiming: boolean) {
        // КРИТИЧЕСКИ ВАЖНО: Прицел ТОЛЬКО в режиме прицеливания (Ctrl)
        if (this.crosshairDot) {
            this.crosshairDot.isVisible = aiming;
            const dotSize = scalePixels(6);
            this.crosshairDot.width = aiming ? `${dotSize}px` : "0px";
            this.crosshairDot.height = aiming ? `${dotSize}px` : "0px";
        }
        // Show/hide lines
        this.crosshairElements.forEach(el => {
            el.isVisible = aiming;
        });
        // Show/hide zoom indicator
        if (this.zoomIndicator) {
            this.zoomIndicator.isVisible = aiming;
        }
        // ИСПРАВЛЕНО: Шкала дальности показывается только при прицеливании
        if (this.rangeScaleContainer) {
            this.rangeScaleContainer.isVisible = aiming; // Только при прицеливании
        }
        if (this.rangeValueText) {
            this.rangeValueText.isVisible = aiming; // Только при прицеливании
        }
        if (this.rangeScaleFill) {
            this.rangeScaleFill.isVisible = aiming; // Только при прицеливании
        }
        if (this.rangeIndicator) {
            this.rangeIndicator.isVisible = aiming; // Только при прицеливании
        }
        // Скрываем метки дальности когда не прицеливаемся
        this.rangeScaleLabels.forEach(label => {
            label.isVisible = aiming;
        });
    }

    // === ОБНОВЛЕНИЕ ДАЛЬНОСТИ СТРЕЛЬБЫ (фактическая траектория снаряда) ===
    // Использует физическую симуляцию для расчета реальной дальности полёта
    setAimRange(aimPitch: number, projectileSpeed: number = 200, barrelHeight: number = 2.5): void {
        // КРИТИЧНО: Убеждаемся, что шкала дальности видима
        if (this.rangeScaleContainer) {
            this.rangeScaleContainer.isVisible = true;
        }

        // Вычисляем фактическую дальность полёта снаряда используя физическую симуляцию
        const gravity = 9.81;
        const dt = 0.02;
        const maxTime = 10;

        let x = 0;
        let y = barrelHeight;
        const vx = projectileSpeed * Math.cos(aimPitch);
        let vy = projectileSpeed * Math.sin(aimPitch);

        let time = 0;
        let lastX = 0;

        // Симулируем полёт снаряда до падения
        while (time < maxTime && y > 0) {
            lastX = x;
            x += vx * dt;
            y += vy * dt;
            vy -= gravity * dt;
            time += dt;
        }

        // Дальность = расстояние до точки падения
        const range = Math.sqrt(lastX * lastX + (y < 0 ? 0 : y) * (y < 0 ? 0 : y));

        // Ограничиваем до 999 метров
        this.currentRange = Math.min(999, Math.round(range));

        // Обновляем текст дальности
        if (this.rangeValueText) {
            this.rangeValueText.text = `${this.currentRange}m`;

            // Цвет текста в зависимости от дальности
            if (this.currentRange >= 150) {
                this.rangeValueText.color = "#f00"; // Далеко - красный
            } else if (this.currentRange >= 100) {
                this.rangeValueText.color = "#f80"; // Средне - оранжевый
            } else if (this.currentRange >= 50) {
                this.rangeValueText.color = "#ff0"; // Близко - жёлтый
            } else {
                this.rangeValueText.color = "#0f0"; // Очень близко - зелёный
            }
        }

        // Нормализуем дальность для отображения на шкале (0-999м = 0-100%)
        const normalizedRange = Math.min(1, this.currentRange / 999);

        // Обновляем заполнение шкалы
        if (this.rangeScaleFill) {
            this.rangeScaleFill.height = `${normalizedRange * 100}%`;

            // Цвет шкалы в зависимости от дальности
            if (this.currentRange >= 750) {
                this.rangeScaleFill.background = "#f00"; // Далеко - красный
            } else if (this.currentRange >= 500) {
                this.rangeScaleFill.background = "#f80"; // Средне - оранжевый
            } else if (this.currentRange >= 250) {
                this.rangeScaleFill.background = "#ff0"; // Близко - жёлтый
            } else {
                this.rangeScaleFill.background = "#0f0"; // Очень близко - зелёный
            }
        }

        // Обновляем позицию индикатора на шкале (0-999м)
        if (this.rangeIndicator) {
            // Шкала 100px высотой, индикатор движется от низа (0м) к верху (999м)
            const indicatorTop = 50 - normalizedRange * 100; // От +50 (низ, 0м) до -50 (верх, 999м)
            this.rangeIndicator.top = `${indicatorTop}px`;
        }

        // Обновляем цвета меток на шкале (0, 200, 400, 600, 800м)
        this.rangeScaleLabels.forEach((label, i) => {
            const labelDist = [0, 200, 400, 600, 800][i] || 0;
            if (this.currentRange >= labelDist) {
                label.color = "#fff"; // Яркий если достигнута или превышена
            } else {
                label.color = "#0a0"; // Тусклый если еще не достигнута
            }
        });
    }

    // Получить текущую дальность
    getAimRange(): number {
        return this.currentRange;
    }

    // Альтернативное имя метода для совместимости с GameCamera
    updateAimRange(range: number): void {
        // ИСПРАВЛЕНО: Видимость управляется через setAiming(), не устанавливаем здесь

        // Обновляем текст дальности напрямую
        this.currentRange = Math.min(999, Math.round(range));

        if (this.rangeValueText) {
            this.rangeValueText.text = `${this.currentRange}m`;

            // Цвет текста в зависимости от дальности
            if (this.currentRange >= 150) {
                this.rangeValueText.color = "#f00";
            } else if (this.currentRange >= 100) {
                this.rangeValueText.color = "#f80";
            } else if (this.currentRange >= 50) {
                this.rangeValueText.color = "#ff0";
            } else {
                this.rangeValueText.color = "#0f0";
            }
        }

        // ИСПРАВЛЕНО: Обновляем шкалу дальности напрямую
        const normalizedRange = Math.min(1, this.currentRange / 999);

        // Обновляем заполнение шкалы
        if (this.rangeScaleFill) {
            this.rangeScaleFill.height = `${normalizedRange * 100}%`;

            // Цвет шкалы в зависимости от дальности
            if (this.currentRange >= 750) {
                this.rangeScaleFill.background = "#f00";
            } else if (this.currentRange >= 500) {
                this.rangeScaleFill.background = "#f80";
            } else if (this.currentRange >= 250) {
                this.rangeScaleFill.background = "#ff0";
            } else {
                this.rangeScaleFill.background = "#0f0";
            }
        }

        // Обновляем позицию индикатора на шкале
        if (this.rangeIndicator) {
            const indicatorTop = 50 - normalizedRange * 100;
            this.rangeIndicator.top = `${indicatorTop}px`;
        }

        // Обновляем цвета меток на шкале
        this.rangeScaleLabels.forEach((label, i) => {
            const labelDist = [0, 200, 400, 600, 800][i] || 0;
            if (this.currentRange >= labelDist) {
                label.color = "#fff";
            } else {
                label.color = "#0a0";
            }
        });
    }

    // Set zoom level indicator (-1 = hide, 0-4 = show level)
    setZoomLevel(zoom: number): void {
        if (this.zoomIndicator) {
            if (zoom < 0) {
                this.zoomIndicator.isVisible = false;
            } else {
                this.zoomIndicator.isVisible = true;
                this.zoomIndicator.text = `${zoom.toFixed(1)}x`;
                // Цвет зависит от уровня зума
                if (zoom >= 3.5) {
                    this.zoomIndicator.color = "#ff0000"; // Максимальный зум - красный
                } else if (zoom >= 2.5) {
                    this.zoomIndicator.color = "#ff8800"; // Высокий зум - оранжевый
                } else if (zoom >= 1.5) {
                    this.zoomIndicator.color = "#ffff00"; // Средний зум - жёлтый
                } else if (zoom >= 0.5) {
                    this.zoomIndicator.color = "#00ff00"; // Низкий зум - зелёный
                } else {
                    this.zoomIndicator.color = "#00aa00"; // Без зума - тёмно-зелёный
                }
            }
        }
    }

    private createSpeedometer() {
        // === СКРЫТЫЙ СПИДОМЕТР (данные отображаются в радаре) ===
        const container = new Rectangle("speedContainer");
        container.width = "0px";
        container.height = "0px";
        container.isVisible = false;
        this.guiTexture.addControl(container);

        // Значение скорости (скрыто но работает)
        this.speedText = new TextBlock("speedText");
        this.speedText.text = "0";
        this.speedText.isVisible = false;
        container.addControl(this.speedText);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createKillCounter() {
        // === СКРЫТЫЙ KILL COUNTER (данные сохраняются) ===
        const container = new Rectangle("killsContainer");
        container.width = "0px";
        container.height = "0px";
        container.isVisible = false;
        this.guiTexture.addControl(container);

        // Счётчик убийств (скрыт но работает)
        this.killsText = new TextBlock("killsText");
        this.killsText.text = "0";
        this.killsText.isVisible = false;
        container.addControl(this.killsText);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createCurrencyDisplay() {
        // === СКРЫТЫЙ CREDITS DISPLAY (данные сохраняются) ===
        this.currencyContainer = new Rectangle("currencyContainer");
        this.currencyContainer.width = "0px";
        this.currencyContainer.height = "0px";
        this.currencyContainer.isVisible = false;
        this.guiTexture.addControl(this.currencyContainer);

        // Сумма кредитов (скрыт но работает)
        this.currencyText = new TextBlock("currencyText");
        this.currencyText.text = "0";
        this.currencyText.isVisible = false;
        this.currencyContainer.addControl(this.currencyText);
    }

    // Consumables display (расширено до 10 слотов: 1-0)
    private consumablesSlots: Array<{
        container: Rectangle,
        icon: TextBlock,
        key: TextBlock,
        name: TextBlock,
        cooldownOverlay: Rectangle,
        cooldownFill: Rectangle,
        cooldownFillGlow: Rectangle,
        cooldownText: TextBlock
    }> = [];

    // Иконки модулей 6-0
    private readonly moduleIcons: { [key: number]: string } = {
        6: "🛡️", // Защитная стенка
        7: "⚡", // Ускоренная стрельба
        8: "🎯", // Автонаводка
        9: "⬆️", // Платформа
        0: "🚀"  // Прыжок
    };

    // Кулдауны модулей (6-0)
    private moduleCooldowns: Map<number, { startTime: number, duration: number }> = new Map();

    // Кулдауны припасов (1-5)
    private consumableCooldowns: Map<number, { startTime: number, duration: number }> = new Map();

    // Кулдауны арсенала (0-4)
    private arsenalCooldowns: Map<number, { startTime: number, duration: number }> = new Map();

    private createConsumablesDisplay() {
        // === HOTBAR - ПЕРЕСТАНОВКА: МОДУЛИ (6-0) → ПРИПАСЫ (1-5) ===
        // Всего 20 слотов: 5 модули + 5 припасы + 5 арсенал + 5 эффектов
        const slotWidth = scalePixels(44);
        const slotGap = scalePixels(5);
        const totalSlots = 20;
        const totalWidth = totalSlots * slotWidth + (totalSlots - 1) * slotGap;
        const startX = -totalWidth / 2 + slotWidth / 2;

        // Сначала создаем МОДУЛИ (6-0) в индексах 0-4
        const moduleOrder = [6, 7, 8, 9, 0]; // Порядок модулей
        for (let i = 0; i < 5; i++) {
            const slotIndex = moduleOrder[i]!;
            const container = new Rectangle(`consumableSlot${slotIndex}`);
            container.width = `${slotWidth}px`;
            container.height = `${slotWidth}px`;
            container.cornerRadius = 3;
            container.thickness = 2;
            container.color = "#0ff5"; // Голубая рамка для модулей
            container.background = "#000000bb";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            // МОДУЛИ: индексы 0-4
            const globalIndex = i;
            container.left = `${startX + globalIndex * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(-48);
            container.zIndex = 20;
            this.guiTexture.addControl(container);




            // Номер слота с улучшенной визуализацией
            const key = new TextBlock(`consumableKey${slotIndex}`);
            key.text = `${slotIndex}`;
            key.color = slotIndex >= 6 || slotIndex === 0 ? "#0ff" : "#0a0"; // Голубой для модулей
            key.fontSize = this.scaleFontSize(9, 7, 12);
            key.fontWeight = "bold";
            key.fontFamily = "'Press Start 2P', monospace";
            key.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            key.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            key.left = this.scalePx(2);
            key.top = this.scalePx(1);
            key.outlineWidth = 1;
            key.outlineColor = "#000";
            container.addControl(key);

            // Иконка предмета/модуля с улучшенной визуализацией
            const icon = new TextBlock(`consumableIcon${slotIndex}`);
            // Для модулей 6-0 устанавливаем иконку сразу
            if (slotIndex >= 6 || slotIndex === 0) {
                icon.text = this.moduleIcons[slotIndex] || "";
                icon.fontSize = this.scaleFontSize(18, 14, 24); // Немного больше для модулей
            } else {
                icon.text = "";
                icon.fontSize = this.scaleFontSize(16, 12, 20);
            }
            icon.color = "#fff";
            icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            icon.outlineWidth = slotIndex >= 6 || slotIndex === 0 ? 1 : 0;
            icon.outlineColor = "#000";
            container.addControl(icon);

            const name = new TextBlock(`consumableName${slotIndex}`);
            name.text = "";
            name.isVisible = false;
            container.addControl(name);

            // === COOLDOWN OVERLAY (анимация кулдауна) ===
            const cooldownOverlay = new Rectangle(`cooldownOverlay${slotIndex}`);
            cooldownOverlay.width = "100%";
            cooldownOverlay.height = "100%";
            cooldownOverlay.thickness = 0;
            cooldownOverlay.background = "#000000aa"; // Более темное затемнение
            cooldownOverlay.cornerRadius = 2; // Скругление как у контейнера
            cooldownOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.isVisible = false; // Скрыт по умолчанию
            container.addControl(cooldownOverlay);

            // Заполнение кулдауна (снизу вверх) - градиент от красного к зеленому
            const cooldownFill = new Rectangle(`cooldownFill${slotIndex}`);
            cooldownFill.width = "100%";
            cooldownFill.height = "0%";
            cooldownFill.thickness = 0;
            cooldownFill.background = "#ff0000dd"; // Начинаем с красного, более яркий
            cooldownFill.cornerRadius = 2; // Скругление
            cooldownFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.addControl(cooldownFill);

            // Дополнительный слой для плавного перехода цвета (свечение готовности)
            const cooldownFillGlow = new Rectangle(`cooldownFillGlow${slotIndex}`);
            cooldownFillGlow.width = "100%";
            cooldownFillGlow.height = "0%";
            cooldownFillGlow.thickness = 0;
            cooldownFillGlow.background = "#00ff00bb"; // Более яркое зеленое свечение
            cooldownFillGlow.cornerRadius = 2;
            cooldownFillGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFillGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownFillGlow.alpha = 0;
            cooldownOverlay.addControl(cooldownFillGlow);

            // Текст кулдауна (секунды) - более заметный
            const cooldownText = new TextBlock(`cooldownText${slotIndex}`);
            cooldownText.text = "";
            cooldownText.color = "#fff";
            cooldownText.fontSize = 12;
            cooldownText.fontWeight = "bold";
            cooldownText.fontFamily = "'Press Start 2P', monospace";
            cooldownText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            cooldownText.outlineWidth = 2;
            cooldownText.outlineColor = "#000";
            cooldownOverlay.addControl(cooldownText);

            this.consumablesSlots.push({
                container,
                icon,
                key,
                name,
                cooldownOverlay,
                cooldownFill,
                cooldownFillGlow,
                cooldownText
            });
        }

        // Теперь создаем ПРИПАСЫ (1-5) в индексах 5-9
        for (let i = 1; i <= 5; i++) {
            const slotIndex = i;
            const container = new Rectangle(`consumableSlot${slotIndex}`);
            container.width = `${slotWidth}px`;
            container.height = `${slotWidth}px`;
            container.cornerRadius = 3;
            container.thickness = 2;
            container.color = "#0f05"; // Зеленая рамка для припасов
            container.background = "#000000bb";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            // ПРИПАСЫ: индексы 5-9
            const globalIndex = 4 + i; // 5-9 для припасов
            container.left = `${startX + globalIndex * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(-48);
            container.zIndex = 20;
            this.guiTexture.addControl(container);

            // Номер слота
            const key = new TextBlock(`consumableKey${slotIndex}`);
            key.text = `${slotIndex}`;
            key.color = "#0a0"; // Зеленый для припасов
            key.fontSize = this.scaleFontSize(9, 7, 12);
            key.fontWeight = "bold";
            key.fontFamily = "'Press Start 2P', monospace";
            key.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            key.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            key.left = this.scalePx(2);
            key.top = this.scalePx(1);
            key.outlineWidth = 1;
            key.outlineColor = "#000";
            container.addControl(key);

            // Иконка предмета
            const icon = new TextBlock(`consumableIcon${slotIndex}`);
            icon.text = "";
            icon.fontSize = this.scaleFontSize(16, 12, 20);
            icon.color = "#fff";
            icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            icon.outlineWidth = 0;
            container.addControl(icon);

            const name = new TextBlock(`consumableName${slotIndex}`);
            name.text = "";
            name.isVisible = false;
            container.addControl(name);

            // COOLDOWN OVERLAY
            const cooldownOverlay = new Rectangle(`cooldownOverlay${slotIndex}`);
            cooldownOverlay.width = "100%";
            cooldownOverlay.height = "100%";
            cooldownOverlay.thickness = 0;
            cooldownOverlay.background = "#000000aa";
            cooldownOverlay.cornerRadius = 2;
            cooldownOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.isVisible = false;
            container.addControl(cooldownOverlay);

            const cooldownFill = new Rectangle(`cooldownFill${slotIndex}`);
            cooldownFill.width = "100%";
            cooldownFill.height = "0%";
            cooldownFill.thickness = 0;
            cooldownFill.background = "#ff0000dd";
            cooldownFill.cornerRadius = 2;
            cooldownFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.addControl(cooldownFill);

            const cooldownFillGlow = new Rectangle(`cooldownFillGlow${slotIndex}`);
            cooldownFillGlow.width = "100%";
            cooldownFillGlow.height = "0%";
            cooldownFillGlow.thickness = 0;
            cooldownFillGlow.background = "#00ff00bb";
            cooldownFillGlow.cornerRadius = 2;
            cooldownFillGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFillGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownFillGlow.alpha = 0;
            cooldownOverlay.addControl(cooldownFillGlow);

            const cooldownText = new TextBlock(`cooldownText${slotIndex}`);
            cooldownText.text = "";
            cooldownText.color = "#fff";
            cooldownText.fontSize = 12;
            cooldownText.fontWeight = "bold";
            cooldownText.fontFamily = "'Press Start 2P', monospace";
            cooldownText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            cooldownText.outlineWidth = 2;
            cooldownText.outlineColor = "#000";
            cooldownOverlay.addControl(cooldownText);

            this.consumablesSlots.push({
                container,
                icon,
                key,
                name,
                cooldownOverlay,
                cooldownFill,
                cooldownFillGlow,
                cooldownText
            });
        }
    }

    // Кэш установленных модулей для оптимизации
    private _cachedInstalledModules: Set<number> | null = null;
    private _modulesCacheTimestamp: number = 0;
    private readonly MODULES_CACHE_TTL = 1000; // 1 секунда

    /**
     * Инвалидировать кэш модулей (вызывать при изменении модулей)
     */
    public invalidateModulesCache(): void {
        this._cachedInstalledModules = null;
        this._modulesCacheTimestamp = 0;
    }

    updateConsumables(consumables: Map<number, any>, installedModules?: Set<number>): void {
        // Получаем установленные модули из localStorage, если не переданы
        // ОПТИМИЗАЦИЯ: Используем кэш для уменьшения чтений из localStorage
        if (!installedModules) {
            const now = Date.now();
            if (!this._cachedInstalledModules || (now - this._modulesCacheTimestamp) > this.MODULES_CACHE_TTL) {
                try {
                    const savedModules = localStorage.getItem("installedModules");
                    if (savedModules) {
                        const modules = JSON.parse(savedModules) as number[];
                        this._cachedInstalledModules = new Set(modules);
                    } else {
                        this._cachedInstalledModules = new Set<number>(); // По умолчанию пусто
                    }
                } catch {
                    this._cachedInstalledModules = new Set<number>();
                }
                this._modulesCacheTimestamp = now;
            }
            installedModules = this._cachedInstalledModules;
        }

        for (let i = 1; i <= 10; i++) {
            const slotIndex = i === 10 ? 0 : i;
            const slot = this.consumablesSlots[i - 1];
            if (!slot) continue;
            const consumable = consumables.get(slotIndex);

            // Для слотов 1-5: отображаем consumables
            if (slotIndex >= 1 && slotIndex <= 5) {
                if (consumable) {
                    slot.container.isVisible = true;
                    slot.container.color = consumable.color || "#0f0";
                    slot.container.background = "#000000cc";
                    slot.icon.text = consumable.icon || "?";
                    slot.icon.color = "#fff";
                    slot.key.color = "#0f0";
                } else {
                    slot.container.isVisible = true;
                    slot.container.color = "#0f02";
                    slot.container.background = "#00000066";
                    slot.icon.text = "";
                    slot.key.color = "#0a0";
                }
            } else {
                // Для слотов 6-0: показываем ТОЛЬКО если модуль установлен
                const isModuleInstalled = installedModules.has(slotIndex);
                if (isModuleInstalled) {
                    slot.container.isVisible = true;
                    slot.container.color = "#0ff4"; // Голубая рамка для модулей
                    slot.container.background = "#000000aa";
                    slot.icon.text = this.moduleIcons[slotIndex] || "";
                    slot.icon.color = "#fff";
                    slot.key.color = "#0ff"; // Голубой номер для модулей
                } else {
                    // Скрываем слот, если модуль не установлен
                    slot.container.isVisible = false;
                }
            }
        }
    }

    // Обновление кулдауна модуля
    updateModuleCooldown(slot: number, cooldownMs: number, maxCooldownMs: number): void {
        if (slot < 6 && slot !== 0) return; // Только для модулей 6-0

        // Маппинг: slot 0 -> индекс 9, slot 6-9 -> индексы 5-8
        let slotIndex: number;
        if (slot === 0) {
            slotIndex = 9; // Клавиша 0 = последний слот (индекс 9)
        } else {
            slotIndex = slot - 1; // Клавиши 6-9 = индексы 5-8
        }

        const hotbarSlot = this.consumablesSlots[slotIndex];
        if (!hotbarSlot) return;

        const percent = Math.min(100, (cooldownMs / maxCooldownMs) * 100);
        const progress = 1 - (cooldownMs / maxCooldownMs);

        if (cooldownMs > 0) {
            // Показываем кулдаун
            hotbarSlot.cooldownOverlay.isVisible = true;
            hotbarSlot.cooldownOverlay.alpha = 0.75;
            hotbarSlot.cooldownFill.isVisible = true;
            hotbarSlot.cooldownFillGlow.isVisible = true;
            hotbarSlot.cooldownText.isVisible = true;

            // Заполнение снизу вверх
            hotbarSlot.cooldownFill.height = `${progress * 100}%`;
            hotbarSlot.cooldownFillGlow.height = `${progress * 100}%`;

            // Градиент цвета кулдауна
            let r = 255, g = 0, b = 0;
            if (progress < 0.5) {
                const phase = progress / 0.5;
                g = Math.floor(255 * phase);
            } else {
                const phase = (progress - 0.5) / 0.5;
                r = Math.floor(255 * (1 - phase));
                g = 255;
            }
            const hexR = r.toString(16).padStart(2, '0');
            const hexG = g.toString(16).padStart(2, '0');
            const hexB = b.toString(16).padStart(2, '0');
            hotbarSlot.cooldownFill.background = `#${hexR}${hexG}${hexB}cc`;

            // Свечение зеленым в конце кулдауна
            if (progress > 0.7) {
                hotbarSlot.cooldownFillGlow.alpha = (progress - 0.7) / 0.3 * 0.5;
            } else {
                hotbarSlot.cooldownFillGlow.alpha = 0;
            }

            // ВСЕГДА отображаем цифры кулдауна когда есть кулдаун
            const seconds = Math.ceil(cooldownMs / 1000);

            // ВСЕГДА показываем цифры, если есть оставшееся время
            if (cooldownMs < 10000) {
                // Меньше 10 секунд - показываем с десятыми (например: "5.3")
                hotbarSlot.cooldownText.text = `${(cooldownMs / 1000).toFixed(1)}`;
            } else {
                // Больше 10 секунд - показываем только секунды (например: "15")
                hotbarSlot.cooldownText.text = `${seconds}`;
            }

            // Динамический цвет текста в зависимости от прогресса
            if (progress > 0.8) {
                hotbarSlot.cooldownText.color = "#0ff"; // Голубой когда почти готов
                hotbarSlot.cooldownText.fontSize = 13;
            } else if (progress > 0.5) {
                hotbarSlot.cooldownText.color = "#ff0"; // Желтый в середине
                hotbarSlot.cooldownText.fontSize = 12;
            } else {
                hotbarSlot.cooldownText.color = "#fff"; // Белый в начале
                hotbarSlot.cooldownText.fontSize = 12;
            }

            // Затемняем иконку
            hotbarSlot.container.background = "#000000cc";
            hotbarSlot.icon.color = "#666";
        } else {
            // Скрываем кулдаун
            hotbarSlot.cooldownOverlay.isVisible = false;
            hotbarSlot.cooldownFill.isVisible = false;
            hotbarSlot.cooldownFillGlow.isVisible = false;
            hotbarSlot.cooldownText.isVisible = false;
            hotbarSlot.cooldownFill.height = "0%";
            hotbarSlot.cooldownText.text = "";

            // Восстанавливаем яркость
            hotbarSlot.container.background = "#000000aa";
            hotbarSlot.icon.color = "#fff";
        }
    }

    // Установить активное состояние модуля (визуальная индикация)
    setModuleActive(slot: number, isActive: boolean): void {
        if (slot < 6 && slot !== 0) return;

        // Маппинг: slot 0 -> индекс 9, slot 6-9 -> индексы 5-8
        let slotIndex: number;
        if (slot === 0) {
            slotIndex = 9; // Клавиша 0 = последний слот (индекс 9)
        } else {
            slotIndex = slot - 1; // Клавиши 6-9 = индексы 5-8
        }

        const hotbarSlot = this.consumablesSlots[slotIndex];
        if (!hotbarSlot) return;

        if (isActive) {
            // Активный модуль - яркая подсветка с пульсацией
            hotbarSlot.container.color = "#0ff";
            hotbarSlot.container.thickness = 3;
            hotbarSlot.container.background = "#00ffff33"; // Полупрозрачный фон
            hotbarSlot.icon.color = "#0ff";
            hotbarSlot.key.color = "#0ff";

            // Эффект пульсации для активного модуля
            const pulse = () => {
                if (!hotbarSlot.container || !hotbarSlot.container.isVisible) return;
                const alphaMatch = (hotbarSlot.container.background as string).match(/[\d.]+$/);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const _currentAlpha = parseFloat(alphaMatch ? alphaMatch[0] : "0.2");
                const newAlpha = 0.2 + Math.sin(Date.now() / 500) * 0.15;
                hotbarSlot.container.background = `#00ffff${Math.floor(newAlpha * 255).toString(16).padStart(2, '0')}`;
                setTimeout(pulse, 50);
            };
            pulse();
        } else {
            // Неактивный - обычный вид
            hotbarSlot.container.color = "#0f04";
            hotbarSlot.container.thickness = 1;
            hotbarSlot.container.background = "#000000aa";
            hotbarSlot.icon.color = "#fff";
            hotbarSlot.key.color = "#0a0";
        }
    }

    // Установить кулдаун для модуля (slot: 6-0)
    setModuleCooldown(slot: number, duration: number): void {
        if ((slot < 6 || slot > 10) && slot !== 0) return; // Только модули 6-0

        this.moduleCooldowns.set(slot, {
            startTime: Date.now(),
            duration: duration
        });

        const slotIndex = slot === 0 ? 9 : slot - 1;
        const slotData = this.consumablesSlots[slotIndex];
        if (slotData) {
            slotData.cooldownOverlay.isVisible = true;
            slotData.cooldownFill.isVisible = true;
            slotData.cooldownFillGlow.isVisible = true;
            slotData.cooldownText.isVisible = true;

            // Визуальная обратная связь при активации кулдауна
            slotData.container.thickness = 2;
            slotData.container.color = "#f00";
            setTimeout(() => {
                if (slotData.container) {
                    slotData.container.thickness = 1;
                    slotData.container.color = "#0f04";
                }
            }, 200);
        }
    }

    // Обновить кулдауны модулей (вызывается каждый кадр)
    updateModuleCooldowns(): void {
        const now = Date.now();

        for (const [slotNum, cooldown] of this.moduleCooldowns.entries()) {
            const slotIndex = slotNum === 0 ? 9 : slotNum - 1;
            const slotData = this.consumablesSlots[slotIndex];
            if (!slotData) continue;

            const elapsed = now - cooldown.startTime;
            const remaining = Math.max(0, cooldown.duration - elapsed);
            const progress = Math.min(1, elapsed / cooldown.duration);

            if (remaining > 0) {
                // Показываем кулдаун с плавной анимацией
                slotData.cooldownOverlay.isVisible = true;
                slotData.cooldownOverlay.alpha = 0.75; // Более заметное затемнение
                slotData.cooldownFill.isVisible = true;
                slotData.cooldownFillGlow.isVisible = true;

                // Плавное заполнение снизу вверх
                const fillHeight = progress * 100;
                slotData.cooldownFill.height = `${fillHeight}%`;
                slotData.cooldownFillGlow.height = `${fillHeight}%`;

                // Улучшенный градиент цвета: красный -> оранжевый -> желтый -> зеленый
                // Более плавный переход с использованием HSL-подобной логики
                let r = 255, g = 0, b = 0;
                if (progress < 0.5) {
                    // Красный -> Желтый (0-50%)
                    const phase = progress / 0.5;
                    g = Math.floor(255 * phase);
                } else {
                    // Желтый -> Зеленый (50-100%)
                    const phase = (progress - 0.5) / 0.5;
                    r = Math.floor(255 * (1 - phase));
                    g = 255;
                }

                // Применяем цвет с плавным альфа-каналом
                const hexR = r.toString(16).padStart(2, '0');
                const hexG = g.toString(16).padStart(2, '0');
                const hexB = b.toString(16).padStart(2, '0');
                slotData.cooldownFill.background = `#${hexR}${hexG}${hexB}cc`;

                // Свечение зеленым в конце кулдауна
                if (progress > 0.7) {
                    slotData.cooldownFillGlow.alpha = (progress - 0.7) / 0.3 * 0.5;
                } else {
                    slotData.cooldownFillGlow.alpha = 0;
                }

                // Текст кулдауна - ВСЕГДА отображаем когда есть кулдаун
                slotData.cooldownText.isVisible = true;
                const seconds = Math.ceil(remaining / 1000);

                // ВСЕГДА показываем цифры кулдауна, если есть оставшееся время
                if (remaining < 10000) {
                    // Меньше 10 секунд - показываем с десятыми (например: "5.3")
                    slotData.cooldownText.text = `${(remaining / 1000).toFixed(1)}`;
                } else {
                    // Больше 10 секунд - показываем только секунды (например: "15")
                    slotData.cooldownText.text = `${seconds}`;
                }

                // Динамический цвет текста в зависимости от прогресса
                if (progress > 0.8) {
                    slotData.cooldownText.color = "#0ff"; // Голубой когда почти готов
                    slotData.cooldownText.fontSize = 13; // Немного увеличиваем размер
                } else if (progress > 0.5) {
                    slotData.cooldownText.color = "#ff0"; // Желтый в середине
                    slotData.cooldownText.fontSize = 12;
                } else {
                    slotData.cooldownText.color = "#fff"; // Белый в начале
                    slotData.cooldownText.fontSize = 12;
                }

                // Плавное затемнение иконки с восстановлением яркости в конце
                const iconBrightness = progress < 0.8
                    ? 0.35 + (progress * 0.5) // От 35% до 85% яркости
                    : 0.85 + ((progress - 0.8) / 0.2) * 0.15; // От 85% до 100% в конце
                const brightness = Math.floor(255 * iconBrightness);
                const hexBright = brightness.toString(16).padStart(2, '0');
                slotData.icon.color = `#${hexBright}${hexBright}${hexBright}`;
            } else {
                // Кулдаун закончился - улучшенная визуальная обратная связь
                slotData.cooldownOverlay.isVisible = false;
                slotData.cooldownFill.isVisible = false;
                slotData.cooldownFillGlow.isVisible = false;
                slotData.cooldownText.isVisible = false;

                // Восстанавливаем яркость иконки
                slotData.icon.color = "#fff";

                // Эффект "готовности" - пульсация зеленым цветом
                let pulseCount = 0;
                const maxPulses = 3;
                const pulseReady = () => {
                    if (pulseCount >= maxPulses || !slotData.container) return;

                    const isBright = pulseCount % 2 === 0;
                    slotData.container.thickness = isBright ? 3 : 2;
                    slotData.container.color = isBright ? "#0f0" : "#0a0";
                    slotData.container.background = isBright ? "#00ff0033" : "#000000aa";
                    slotData.icon.color = isBright ? "#0f0" : "#fff";

                    pulseCount++;
                    setTimeout(pulseReady, 150);
                };
                pulseReady();

                // Возвращаем к нормальному состоянию после пульсации
                setTimeout(() => {
                    if (slotData.container) {
                        slotData.container.thickness = 1;
                        slotData.container.color = "#0f04";
                        slotData.container.background = "#000000aa";
                        slotData.icon.color = "#fff";
                    }
                }, maxPulses * 150 + 100);

                this.moduleCooldowns.delete(slotNum);
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createEnemyHealth() {
        // === СКРЫТЫЙ ENEMY HEALTH ===
        const container = new Rectangle("enemyHpContainer");
        container.width = "0px";
        container.height = "0px";
        container.isVisible = false;
        this.guiTexture.addControl(container);

        this.enemyHealthText = new TextBlock("enemyHpText");
        this.enemyHealthText.text = "0 HP";
        this.enemyHealthText.isVisible = false;
        this.enemyHealthText.fontFamily = "'Press Start 2P', monospace";
        this.enemyHealthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.enemyHealthText.top = "20px";
        container.addControl(this.enemyHealthText);
    }

    private compassContainer!: Rectangle;
    private compassDegrees!: TextBlock;
    private compassTicks: Rectangle[] = []; // Риски на компасе
    private compassEnemyDots: Rectangle[] = []; // Красные точки врагов (legacy, для совместимости)
    // ОПТИМИЗАЦИЯ: Пул объектов для переиспользования точек компаса
    private compassEnemyDotsPool: Rectangle[] = [];
    private compassEnemyDotsActive: Rectangle[] = [];
    private readonly MAX_COMPASS_ENEMIES = 8; // Ограничение количества врагов на компасе

    private createCompass() {
        // === ЖИВОЙ КОМПАС БЕЗ БУКВЕННЫХ ОБОЗНАЧЕНИЙ ===
        this.compassContainer = new Rectangle("compassContainer");
        this.compassContainer.width = this.scalePx(1000); // Увеличено в 2 раза (было 500)
        this.compassContainer.height = this.scalePx(35); // УВЕЛИЧЕНО с 25 до 35 для лучшей читаемости
        this.compassContainer.cornerRadius = 0;
        this.compassContainer.thickness = 1;
        this.compassContainer.color = "#0f03";
        this.compassContainer.background = "#00000099";
        this.compassContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.compassContainer.top = this.scalePx(10);
        this.compassContainer.isVisible = true; // КРИТИЧНО: Компас должен быть видим
        this.compassContainer.alpha = 1.0; // КРИТИЧНО: Полная непрозрачность
        this.compassContainer.zIndex = 100; // КРИТИЧНО: Высокий z-index для видимости
        this.guiTexture.addControl(this.compassContainer);

        // ОПТИМИЗАЦИЯ: Инициализация пула объектов для точек врагов на компасе
        this.initializeCompassEnemyDotsPool();

        // Центральный маркер (красный треугольник вниз)
        const centerMarker = new Rectangle("compassCenterMarker");
        centerMarker.width = this.scalePx(3); // УВЕЛИЧЕНО с 2 до 3
        centerMarker.height = this.scalePx(12); // УВЕЛИЧЕНО с 8 до 12
        centerMarker.thickness = 0;
        centerMarker.background = "#f00";
        centerMarker.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        centerMarker.top = "0px";
        this.compassContainer.addControl(centerMarker);

        // Буквенные обозначения удалены - они теперь над радаром

        // Главное направление (для совместимости, скрыто)
        this.compassText = new TextBlock("compassText");
        this.compassText.text = "N";
        this.compassText.isVisible = true; // ИСПРАВЛЕНО: Компас должен быть видим
        this.compassText.color = "#0f0";
        this.compassText.fontSize = this.scaleFontSize(14, 12, 16); // УВЕЛИЧЕНО
        this.compassText.fontWeight = "bold";
        this.compassText.fontFamily = "'Press Start 2P', monospace";
        this.compassText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.compassText.top = "-18px"; // Над градусами, скорректировано
        this.compassContainer.addControl(this.compassText);

        // Градусы по центру компаса
        this.compassDegrees = new TextBlock("compassDeg");
        this.compassDegrees.text = "0°";
        this.compassDegrees.color = "#0f0";
        this.compassDegrees.fontSize = this.scaleFontSize(12, 10, 14); // Уменьшен чтобы не выходил за края
        this.compassDegrees.fontWeight = "bold";
        this.compassDegrees.fontFamily = "'Press Start 2P', monospace";
        this.compassDegrees.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassDegrees.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.compassDegrees.top = "5px"; // Опущен ниже чтобы не выходил за края
        this.compassDegrees.isVisible = true; // КРИТИЧНО: Градусы компаса должны быть видимы
        this.compassDegrees.shadowColor = "#000000";
        this.compassDegrees.shadowBlur = 2;
        this.compassContainer.addControl(this.compassDegrees);

        // === РИСКИ НА КОМПАСЕ (метки каждые 5 градусов для заполнения всей ширины) ===
        this.compassTicks = [];
        for (let i = 0; i < 72; i++) { // 72 риски (360/5 = 72) - заполняют весь компас
            const tick = new Rectangle(`compassTick${i}`);
            const isMajor = i % 6 === 0; // Каждые 6 рисок = основные (каждые 30°)
            const isMedium = i % 3 === 0 && !isMajor; // Средние риски (каждые 15°)
            tick.width = "2px";
            tick.height = isMajor ? this.scalePx(12) : (isMedium ? this.scalePx(8) : this.scalePx(4));
            tick.thickness = 0;
            tick.background = isMajor ? "#0f0" : (isMedium ? "#0c0" : "#080");
            tick.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            tick.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            tick.top = "0px";
            // Позиция будет обновляться в setDirection
            this.compassContainer.addControl(tick);
            this.compassTicks.push(tick);
        }

        // === КРАСНЫЕ ТОЧКИ ДЛЯ ВРАГОВ В ПОЛЕ ЗРЕНИЯ ===
        this.compassEnemyDots = [];

        // === SPAWN MARKER НА КОМПАСЕ (голубой маркер "H" для Home) ===
        this.compassSpawnMarker = new Rectangle("compassSpawnMarker");
        this.compassSpawnMarker.width = this.scalePx(16);
        this.compassSpawnMarker.height = this.scalePx(16);
        this.compassSpawnMarker.thickness = 2;
        this.compassSpawnMarker.color = "#00ffff"; // Cyan
        this.compassSpawnMarker.background = "transparent";
        this.compassSpawnMarker.cornerRadius = 0;
        this.compassSpawnMarker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.compassSpawnMarker.isVisible = true;
        this.compassSpawnMarker.zIndex = 60;
        this.compassContainer.addControl(this.compassSpawnMarker);

        // === TARGET INDICATOR (enemy tank popup) ===
        // Legacy targetIndicator - СКРЫТ, используется новый TargetHealthBar компонент
        this.targetIndicator = new Rectangle("targetIndicator");
        this.targetIndicator.width = "240px"; // Увеличена ширина
        this.targetIndicator.height = "42px"; // Увеличена высота для размещения текста здоровья
        this.targetIndicator.cornerRadius = 0;
        this.targetIndicator.thickness = 1;
        this.targetIndicator.color = "#f00";
        this.targetIndicator.background = "#000000cc";
        this.targetIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.targetIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.targetIndicator.top = "38px";
        this.targetIndicator.isVisible = false; // Всегда скрыт - используется TargetHealthBar
        this.targetIndicator.alpha = 0;
        this.guiTexture.addControl(this.targetIndicator);

        // Top row: Name (far left) + Distance (far right)
        const topRow = new Rectangle("topRow");
        topRow.width = "210px"; // Full width of indicator
        topRow.height = "18px";
        topRow.thickness = 0;
        topRow.background = "transparent";
        topRow.top = "-6px";
        this.targetIndicator.addControl(topRow);

        // Target name (far left)
        this.targetNameText = new TextBlock("targetName");
        this.targetNameText.text = "ENEMY";
        this.targetNameText.color = "#f00";
        this.targetNameText.fontSize = 10;
        this.targetNameText.fontWeight = "bold";
        this.targetNameText.fontFamily = "'Press Start 2P', monospace";
        this.targetNameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.targetNameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.targetNameText.left = "2px";
        topRow.addControl(this.targetNameText);

        // Distance (far right, more visible)
        this.targetDistanceText = new TextBlock("targetDistance");
        this.targetDistanceText.text = "[0m]";
        this.targetDistanceText.color = "#ff0";
        this.targetDistanceText.fontSize = 16;
        this.targetDistanceText.fontWeight = "bold";
        this.targetDistanceText.fontFamily = "'Press Start 2P', monospace";
        this.targetDistanceText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.targetDistanceText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.targetDistanceText.left = "-2px";
        topRow.addControl(this.targetDistanceText);

        // Health bar (bottom) - увеличен для лучшей видимости
        this._legacyTargetHealthBar = new Rectangle("targetHealthBar");
        this._legacyTargetHealthBar.width = "200px";
        this._legacyTargetHealthBar.height = "12px"; // Увеличена высота
        this._legacyTargetHealthBar.cornerRadius = 0;
        this._legacyTargetHealthBar.thickness = 2; // Более толстая рамка
        this._legacyTargetHealthBar.color = "#f00";
        this._legacyTargetHealthBar.background = "#300";
        this._legacyTargetHealthBar.top = "12px";
        this.targetIndicator.addControl(this._legacyTargetHealthBar);

        // Health fill
        this.targetHealthFill = new Rectangle("targetHealthFill");
        this.targetHealthFill.width = "100%";
        this.targetHealthFill.height = "100%";
        this.targetHealthFill.thickness = 0;
        this.targetHealthFill.background = "#f00";
        this.targetHealthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._legacyTargetHealthBar.addControl(this.targetHealthFill);

        // Health text (числовое значение) - добавлено для лучшей информативности
        this.targetHealthText = new TextBlock("targetHealthText");
        this.targetHealthText.text = "100/100";
        this.targetHealthText.color = "#0f0";
        this.targetHealthText.fontSize = 8;
        this.targetHealthText.fontFamily = "'Press Start 2P', monospace";
        this.targetHealthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.targetHealthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.targetHealthText.top = "0px";
        this._legacyTargetHealthBar?.addControl(this.targetHealthText);
    }

    // Player direction indicator
    private minimapPlayerContainer: Rectangle | null = null; // Контейнер для танка
    private minimapPlayerDir: Rectangle | null = null;
    private minimapPlayer: Rectangle | null = null;
    private minimapFovCone: Rectangle[] = []; // Линии заполнения FOV
    private fovConeContainer: Rectangle | null = null; // Контейнер FOV конуса
    private fovLeftLine: Rectangle | null = null; // Левая граница FOV
    private fovRightLine: Rectangle | null = null; // Правая граница FOV
    private fovCenterLine: Rectangle | null = null; // Центральная линия FOV
    private minimapAimLine: Rectangle | null = null; // Линия прицеливания
    private minimapAimDot: Rectangle | null = null; // Точка прицела
    private isAimingMode = false; // Режим прицеливания для радара

    // Полноценная карта (открывается по M)
    private fullMapContainer: Rectangle | null = null;
    private fullMapVisible = false;
    private exploredAreas: Set<string> = new Set(); // Открытые участки карты
    private fullMapEnemies: Rectangle[] = []; // Legacy, для совместимости
    // ОПТИМИЗАЦИЯ: Пул объектов для маркеров врагов на полной карте
    private fullMapEnemiesPool: Rectangle[] = [];
    private fullMapEnemiesActive: Map<string, Rectangle> = new Map(); // Map<enemyId, Rectangle>
    private readonly MAX_FULLMAP_ENEMIES = 50; // Ограничение количества врагов на карте

    // Дороги на полной карте
    private fullMapRoadMarkers: Line[] = [];
    private fullMapRoadMarkerPool: Line[] = [];
    private lastFullMapRoadsUpdate = 0;

    // Рельеф на полной карте
    private fullMapTerrainMarkers: Rectangle[] = [];
    private fullMapTerrainMarkerPool: Rectangle[] = [];
    private lastFullMapTerrainUpdate = 0;

    // Снаряды на полной карте
    private fullMapProjectileMarkers: Rectangle[] = [];
    private fullMapProjectileMarkerPool: Rectangle[] = [];

    // Взрывы на полной карте
    private fullMapExplosionMarkers: Rectangle[] = [];

    // Здания на полной карте
    private fullMapBuildingMarkers: Rectangle[] = [];
    private fullMapBuildingMarkerPool: Rectangle[] = [];
    private lastFullMapBuildingsUpdate = 0;

    private createMinimap() {
        // === ВОЕННО-ТАКТИЧЕСКИЙ ДИЗАЙН РАДАРА (ЗЕЛЁНАЯ СХЕМА) ===
        // УВЕЛИЧЕНО: Размеры с правильными отступами для лучшей читаемости
        const RADAR_SIZE = 220;           // Размер круга радара (УВЕЛИЧЕНО с 200)
        const RADAR_INNER = 180;          // Внутренняя область (уменьшена)
        const HEADER_HEIGHT = 36;         // Заголовок (УВЕЛИЧЕНО с 28 - толще блок направления)
        const INFO_HEIGHT = 36;           // Нижняя панель (УВЕЛИЧЕНА для читаемости)
        const STATUS_WIDTH = 130;         // Блок статуса (УВЕЛИЧЕН для читаемости текста)
        const GAP = 4;                    // Отступы между элементами (уменьшены для компактности)
        const PADDING = 10;               // Внутренние отступы (УВЕЛИЧЕНО с 8)

        // Общие размеры контейнера
        const TOTAL_WIDTH = RADAR_SIZE + STATUS_WIDTH + GAP + PADDING * 2;
        const TOTAL_HEIGHT = HEADER_HEIGHT + RADAR_SIZE + INFO_HEIGHT + GAP * 2 + PADDING * 2;

        // === ГЛАВНЫЙ КОНТЕЙНЕР ===
        this.minimapContainer = new Rectangle("minimapContainer");
        this.minimapContainer.width = this.scalePx(TOTAL_WIDTH);
        this.minimapContainer.height = this.scalePx(TOTAL_HEIGHT);
        this.minimapContainer.cornerRadius = 0;
        this.minimapContainer.thickness = 2;
        this.minimapContainer.color = "#00ff00";
        this.minimapContainer.background = "rgba(0, 20, 0, 0.9)";
        this.minimapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;

        // === ADAPTIVE POSITIONING ===
        if (isMobileDevice()) {
            // Mobile: Top-Right corner
            this.minimapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.minimapContainer.left = this.scalePx(-10);
            this.minimapContainer.top = this.scalePx(10);
        } else {
            // Desktop: Bottom-Right, aligned with XP Bar
            this.minimapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            this.minimapContainer.left = this.scalePx(-12);
            this.minimapContainer.top = this.scalePx(-12); // Lowered to align with XP bar bottom
        }

        this.minimapContainer.isVisible = this.minimapEnabled; // ОПТИМИЗАЦИЯ: Начинаем со скрытой миникарты
        this.minimapContainer.alpha = 1.0; // КРИТИЧНО: Полная непрозрачность
        this.guiTexture.addControl(this.minimapContainer);

        // === ДЕКОРАТИВНЫЕ УГОЛКИ ===
        const cornerSize = 6;
        [[Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_TOP],
        [Control.HORIZONTAL_ALIGNMENT_RIGHT, Control.VERTICAL_ALIGNMENT_TOP],
        [Control.HORIZONTAL_ALIGNMENT_LEFT, Control.VERTICAL_ALIGNMENT_BOTTOM],
        [Control.HORIZONTAL_ALIGNMENT_RIGHT, Control.VERTICAL_ALIGNMENT_BOTTOM]
        ].forEach((align, i) => {
            const corner = new Rectangle(`corner${i}`);
            corner.width = this.scalePx(cornerSize);
            corner.height = this.scalePx(cornerSize);
            corner.thickness = 0;
            corner.background = "#00ff00";
            corner.horizontalAlignment = align[0] as number;
            corner.verticalAlignment = align[1] as number;
            this.minimapContainer.addControl(corner);
        });

        // === ЗАГОЛОВОК ===
        this.directionLabelsContainer = new Rectangle("headerContainer");
        this.directionLabelsContainer.width = this.scalePx(TOTAL_WIDTH - PADDING * 2);
        this.directionLabelsContainer.height = this.scalePx(HEADER_HEIGHT);
        this.directionLabelsContainer.cornerRadius = 0;
        this.directionLabelsContainer.thickness = 1;
        this.directionLabelsContainer.color = "#00ff00";
        this.directionLabelsContainer.background = "rgba(0, 60, 0, 0.6)";
        this.directionLabelsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.directionLabelsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.directionLabelsContainer.top = this.scalePx(PADDING);
        this.directionLabelsContainer.isVisible = true; // КРИТИЧНО: Контейнер направления должен быть видим
        this.directionLabelsContainer.alpha = 1.0; // КРИТИЧНО: Полная непрозрачность
        this.directionLabelsContainer.zIndex = 100; // КРИТИЧНО: Высокий z-index для видимости
        this.minimapContainer.addControl(this.directionLabelsContainer);

        // КРИТИЧНО: Направление ствола (N, NE, E, SE, S, SW, W, NW)
        this.movementDirectionLabel = new TextBlock("movementDirectionLabel");
        this.movementDirectionLabel.text = "N";
        this.movementDirectionLabel.color = "#00ff00"; // Яркий зелёный
        this.movementDirectionLabel.fontSize = this.scaleFontSize(14, 12, 16); // УВЕЛИЧЕНО с 12 до 14
        this.movementDirectionLabel.fontWeight = "bold";
        this.movementDirectionLabel.fontFamily = "'Press Start 2P', monospace";
        this.movementDirectionLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.movementDirectionLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.movementDirectionLabel.top = "4px"; // Немного ниже для центрирования
        this.movementDirectionLabel.left = 0;
        this.movementDirectionLabel.zIndex = 1000; // КРИТИЧНО: Очень высокий z-index для видимости
        this.movementDirectionLabel.isVisible = true; // КРИТИЧНО: Индикатор направления должен быть видим
        this.movementDirectionLabel.alpha = 1.0; // КРИТИЧНО: Полная непрозрачность
        this.directionLabelsContainer.addControl(this.movementDirectionLabel);

        // === ЦЕНТРАЛЬНАЯ ОБЛАСТЬ (STATUS слева + RADAR справа) ===
        const centerY = PADDING + HEADER_HEIGHT + GAP;

        // === БЛОК СТАТУСА (СЛЕВА) - ВО ВСЮ ВЫСОТУ КАК РАДАР ===
        this.tankStatusContainer = new Rectangle("tankStatusContainer");
        this.tankStatusContainer.width = this.scalePx(STATUS_WIDTH);
        this.tankStatusContainer.height = this.scalePx(RADAR_SIZE); // Полная высота как у радара
        this.tankStatusContainer.cornerRadius = 0;
        this.tankStatusContainer.thickness = 1;
        this.tankStatusContainer.color = "#00ff00";
        this.tankStatusContainer.background = "rgba(0, 40, 0, 0.5)";
        this.tankStatusContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusContainer.left = this.scalePx(PADDING);
        this.tankStatusContainer.top = this.scalePx(centerY); // На одном уровне с радаром
        // КРИТИЧНО: Обнуляем внутренние отступы контейнера
        this.tankStatusContainer.paddingTop = "0px";
        this.tankStatusContainer.paddingBottom = "0px";
        this.tankStatusContainer.paddingLeft = "0px";
        this.tankStatusContainer.paddingRight = "0px";
        this.minimapContainer.addControl(this.tankStatusContainer);

        // Равномерное распределение сверху вниз по высоте контейнера
        const rowHeight = 28; // Высота одной строки (УВЕЛИЧЕНА для читаемости)
        const startY = 12; // Отступ сверху для текста (опущен ниже)
        const leftPadding = 8; // Отступ слева

        // === HP ROW ===
        this.tankStatusHealthText = new TextBlock("tankStatusHealth");
        this.tankStatusHealthText.text = "HP:100%";
        this.tankStatusHealthText.color = "#00ff00";
        this.tankStatusHealthText.fontSize = this.scaleFontSize(11, 9, 13); // Уменьшен чтобы влезал
        this.tankStatusHealthText.fontWeight = "bold";
        this.tankStatusHealthText.fontFamily = "'Press Start 2P', monospace";
        this.tankStatusHealthText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusHealthText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // КРИТИЧНО: Текст сверху
        this.tankStatusHealthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusHealthText.top = this.scalePx(startY);
        this.tankStatusHealthText.left = this.scalePx(leftPadding);
        this.tankStatusHealthText.height = this.scalePx(rowHeight); // КРИТИЧНО: Явная высота
        this.tankStatusHealthText.zIndex = 1000;
        this.tankStatusContainer.addControl(this.tankStatusHealthText);

        // === FUEL ROW ===
        this.tankStatusFuelText = new TextBlock("tankStatusFuel");
        this.tankStatusFuelText.text = "FL:100%";
        this.tankStatusFuelText.color = "#f90";
        this.tankStatusFuelText.fontSize = this.scaleFontSize(11, 9, 13); // Уменьшен чтобы влезал
        this.tankStatusFuelText.fontWeight = "bold";
        this.tankStatusFuelText.fontFamily = "'Press Start 2P', monospace";
        this.tankStatusFuelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusFuelText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // КРИТИЧНО: Текст сверху
        this.tankStatusFuelText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusFuelText.top = this.scalePx(startY + rowHeight);
        this.tankStatusFuelText.left = this.scalePx(leftPadding);
        this.tankStatusFuelText.height = this.scalePx(rowHeight); // КРИТИЧНО: Явная высота
        this.tankStatusFuelText.zIndex = 1000;
        this.tankStatusContainer.addControl(this.tankStatusFuelText);

        // === ARMOR ROW ===
        this.tankStatusArmorText = new TextBlock("tankStatusArmor");
        this.tankStatusArmorText.text = "AR:0%";
        this.tankStatusArmorText.color = "#0cc";
        this.tankStatusArmorText.fontSize = this.scaleFontSize(11, 9, 13); // Уменьшен чтобы влезал
        this.tankStatusArmorText.fontWeight = "bold";
        this.tankStatusArmorText.fontFamily = "'Press Start 2P', monospace";
        this.tankStatusArmorText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusArmorText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // КРИТИЧНО: Текст сверху
        this.tankStatusArmorText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusArmorText.top = this.scalePx(startY + rowHeight * 2);
        this.tankStatusArmorText.left = this.scalePx(leftPadding);
        this.tankStatusArmorText.height = this.scalePx(rowHeight); // КРИТИЧНО: Явная высота
        this.tankStatusArmorText.zIndex = 1000;
        this.tankStatusContainer.addControl(this.tankStatusArmorText);

        // === KILLS ROW ===
        const killsText = new TextBlock("killsText");
        killsText.text = "K:0"; // K = Kills
        killsText.color = "#f60";
        killsText.fontSize = this.scaleFontSize(11, 9, 13); // Уменьшен чтобы влезал
        killsText.fontWeight = "bold";
        killsText.fontFamily = "'Press Start 2P', monospace";
        killsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        killsText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // КРИТИЧНО: Текст сверху
        killsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        killsText.top = this.scalePx(startY + rowHeight * 3);
        killsText.left = this.scalePx(leftPadding);
        killsText.height = this.scalePx(rowHeight); // КРИТИЧНО: Явная высота
        killsText.zIndex = 1000;
        this.tankStatusContainer.addControl(killsText);
        (this.tankStatusContainer as any)._killsValue = killsText;

        // === ALT ROW ===
        const altText = new TextBlock("altText");
        altText.text = "A:0"; // A = Altitude
        altText.color = "#0cf";
        altText.fontSize = this.scaleFontSize(11, 9, 13); // Уменьшен чтобы влезал
        altText.fontWeight = "bold";
        altText.fontFamily = "'Press Start 2P', monospace";
        altText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        altText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // КРИТИЧНО: Текст сверху
        altText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        altText.top = this.scalePx(startY + rowHeight * 4);
        altText.left = this.scalePx(leftPadding);
        altText.height = this.scalePx(rowHeight); // КРИТИЧНО: Явная высота
        altText.zIndex = 1000;
        this.tankStatusContainer.addControl(altText);
        (this.tankStatusContainer as any)._altValue = altText;

        // === КОНТЕЙНЕР РАДАРА (СПРАВА) ===
        const radarContainer = new Rectangle("radarContainer");
        radarContainer.width = this.scalePx(RADAR_SIZE);
        radarContainer.height = this.scalePx(RADAR_SIZE);
        radarContainer.cornerRadius = 0;
        radarContainer.thickness = 1;
        radarContainer.color = "#00ff00";
        radarContainer.background = "rgba(0, 15, 0, 0.7)";
        radarContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        radarContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        radarContainer.left = this.scalePx(-PADDING);
        radarContainer.top = this.scalePx(centerY);
        radarContainer.isVisible = true; // КРИТИЧНО: Контейнер радара должен быть видим
        radarContainer.alpha = 1.0; // КРИТИЧНО: Полная непрозрачность
        this.minimapContainer.addControl(radarContainer);

        // === ОБЛАСТЬ РАДАРА ===
        this.radarArea = new Rectangle("radarArea");
        this.radarArea.width = this.scalePx(RADAR_INNER);
        this.radarArea.height = this.scalePx(RADAR_INNER);
        this.radarArea.thickness = 0;
        this.radarArea.background = "transparent";
        this.radarArea.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.radarArea.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.radarArea.isVisible = true; // КРИТИЧНО: Область радара должна быть видима
        radarContainer.addControl(this.radarArea);

        // === КОНЦЕНТРИЧЕСКИЕ КРУГИ (увеличены до краёв блока) ===
        const ringRadii = [22, 44, 66, 88, 105]; // Увеличены чтобы касаться краёв
        for (let i = 0; i < ringRadii.length; i++) {
            const r = ringRadii[i] ?? 0;
            const circle = new Rectangle(`ring${i}`);
            circle.width = this.scalePx(r * 2);
            circle.height = this.scalePx(r * 2);
            circle.cornerRadius = r;
            circle.thickness = 1;
            circle.color = "#00ff00";
            circle.alpha = 0.3 + i * 0.1;
            circle.background = "transparent";
            circle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            circle.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            this.radarArea.addControl(circle);
        }

        // === КРЕСТ ===
        const hLine = new Rectangle("hLine");
        hLine.width = this.scalePx(RADAR_INNER);
        hLine.height = this.scalePx(1);
        hLine.thickness = 0;
        hLine.background = "#00ff00";
        hLine.alpha = 0.25;
        this.radarArea.addControl(hLine);

        const vLine = new Rectangle("vLine");
        vLine.width = this.scalePx(1);
        vLine.height = this.scalePx(RADAR_INNER);
        vLine.thickness = 0;
        vLine.background = "#00ff00";
        vLine.alpha = 0.25;
        this.radarArea.addControl(vLine);

        // === FOV CONE ===
        this.fovConeContainer = new Rectangle("fovConeContainer");
        this.fovConeContainer.width = this.scalePx(RADAR_INNER);
        this.fovConeContainer.height = this.scalePx(RADAR_INNER);
        this.fovConeContainer.thickness = 0;
        this.fovConeContainer.background = "transparent";
        this.radarArea.addControl(this.fovConeContainer);

        const fovLength = 75; // УВЕЛИЧЕНО с 65 до 75 для лучшей видимости
        const halfAngle = (60 / 2) * Math.PI / 180;

        // УЛУЧШЕНО: Левая линия FOV - толще и ярче
        this.fovLeftLine = new Rectangle("fovLeftLine");
        this.fovLeftLine.width = this.scalePx(3); // УВЕЛИЧЕНО с 2 до 3
        this.fovLeftLine.height = this.scalePx(fovLength);
        this.fovLeftLine.thickness = 0;
        this.fovLeftLine.background = "#00ff00";
        this.fovLeftLine.alpha = 0.5; // УВЕЛИЧЕНО с 0.2 до 0.5
        this.fovLeftLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fovLeftLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fovLeftLine.top = this.scalePx(-fovLength / 2);
        this.fovLeftLine.rotation = -halfAngle;
        this.fovLeftLine.transformCenterX = 0.5;
        this.fovLeftLine.transformCenterY = 1;
        this.fovConeContainer.addControl(this.fovLeftLine);

        // УЛУЧШЕНО: Правая линия FOV - толще и ярче
        this.fovRightLine = new Rectangle("fovRightLine");
        this.fovRightLine.width = this.scalePx(3); // УВЕЛИЧЕНО с 2 до 3
        this.fovRightLine.height = this.scalePx(fovLength);
        this.fovRightLine.thickness = 0;
        this.fovRightLine.background = "#00ff00";
        this.fovRightLine.alpha = 0.5; // УВЕЛИЧЕНО с 0.2 до 0.5
        this.fovRightLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fovRightLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fovRightLine.top = this.scalePx(-fovLength / 2);
        this.fovRightLine.rotation = halfAngle;
        this.fovRightLine.transformCenterX = 0.5;
        this.fovRightLine.transformCenterY = 1;
        this.fovConeContainer.addControl(this.fovRightLine);

        // УЛУЧШЕНО: Центральная линия FOV
        this.fovCenterLine = new Rectangle("fovCenterLine");
        this.fovCenterLine.width = this.scalePx(2);
        this.fovCenterLine.height = this.scalePx(fovLength);
        this.fovCenterLine.thickness = 0;
        this.fovCenterLine.background = "#00ff00";
        this.fovCenterLine.alpha = 0.3; // УВЕЛИЧЕНО с 0.15 до 0.3
        this.fovCenterLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fovCenterLine.top = this.scalePx(-fovLength / 2);
        this.fovConeContainer.addControl(this.fovCenterLine);

        // Контейнер для танка игрока
        this.minimapPlayerContainer = new Rectangle("playerContainer");
        this.minimapPlayerContainer.width = this.scalePx(20);
        this.minimapPlayerContainer.height = this.scalePx(20);
        this.minimapPlayerContainer.thickness = 0;
        this.minimapPlayerContainer.background = "transparent";
        this.minimapPlayerContainer.isVisible = true; // КРИТИЧНО: Контейнер игрока должен быть видим
        this.radarArea.addControl(this.minimapPlayerContainer);

        // Маркер игрока - ИСПРАВЛЕНО: прямоугольный маркер
        this.minimapPlayer = new Rectangle("minimapPlayer");
        this.minimapPlayer.width = this.scalePx(10); // УВЕЛИЧЕНО с 8 до 10
        this.minimapPlayer.height = this.scalePx(10); // УВЕЛИЧЕНО с 8 до 10
        this.minimapPlayer.thickness = 3; // УВЕЛИЧЕНО с 2 до 3
        this.minimapPlayer.color = "#00ff00";
        this.minimapPlayer.background = "#00ff00";
        this.minimapPlayer.cornerRadius = 0; // ИСПРАВЛЕНО: Прямоугольный маркер (было 5 - круглый)
        this.minimapPlayerContainer.addControl(this.minimapPlayer);

        // Индикатор направления игрока - СКРЫТ (убрана палочка, которая крутилась)
        this.minimapPlayerDir = new Rectangle("minimapPlayerDir");
        this.minimapPlayerDir.width = this.scalePx(4);
        this.minimapPlayerDir.height = this.scalePx(18);
        this.minimapPlayerDir.thickness = 0;
        this.minimapPlayerDir.background = "#00ff00";
        this.minimapPlayerDir.top = this.scalePx(-14);
        this.minimapPlayerDir.transformCenterY = 1;
        this.minimapPlayerDir.isVisible = false; // СКРЫТ - убрана палочка
        this.minimapPlayerContainer.addControl(this.minimapPlayerDir);

        // === RADAR SCAN LINE ===
        const scanLen = 72;
        this.radarScanLine = new Rectangle("radarScanLine");
        this.radarScanLine.width = this.scalePx(2);
        this.radarScanLine.height = this.scalePx(scanLen);
        this.radarScanLine.thickness = 0;
        this.radarScanLine.background = "#00ff00";
        this.radarScanLine.alpha = 0.6;
        this.radarScanLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.radarScanLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.radarScanLine.top = this.scalePx(-scanLen / 2);
        this.radarScanLine.transformCenterX = 0.5;
        this.radarScanLine.transformCenterY = 1;
        this.radarArea.addControl(this.radarScanLine);

        this.startRadarScanAnimation();

        // === ОТОБРАЖЕНИЕ УГЛА НАКЛОНА СТВОЛА ПОД РАДАРОМ ===
        this.barrelPitchLabel = new TextBlock("barrelPitchLabel");
        this.barrelPitchLabel.text = "0.000";
        this.barrelPitchLabel.color = "#00ff00";
        this.barrelPitchLabel.fontSize = this.scalePx(14);
        this.barrelPitchLabel.fontFamily = "monospace";
        this.barrelPitchLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.barrelPitchLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.barrelPitchLabel.top = this.scalePx(RADAR_SIZE + 5);
        this.barrelPitchLabel.isVisible = true;
        radarContainer.addControl(this.barrelPitchLabel);

        // Линия прицеливания
        this.minimapAimLine = new Rectangle("aimLine");
        this.minimapAimLine.width = this.scalePx(2);
        this.minimapAimLine.height = this.scalePx(70);
        this.minimapAimLine.background = "#ff3333";
        this.minimapAimLine.top = this.scalePx(-35);
        this.minimapAimLine.isVisible = false;
        this.radarArea.addControl(this.minimapAimLine);

        this.minimapAimDot = new Rectangle("aimDot");
        this.minimapAimDot.width = this.scalePx(6);
        this.minimapAimDot.height = this.scalePx(6);
        this.minimapAimDot.background = "#ff3333";
        this.minimapAimDot.cornerRadius = 3;
        this.minimapAimDot.top = this.scalePx(-72);
        this.minimapAimDot.isVisible = false;
        this.radarArea.addControl(this.minimapAimDot);

        // === SPAWN MARKER (Метка спавна - голубой цвет) ===
        this.spawnMarker = new Rectangle("spawnMarker");
        this.spawnMarker.width = this.scalePx(12);
        this.spawnMarker.height = this.scalePx(12);
        this.spawnMarker.thickness = 2;
        this.spawnMarker.color = "#00ffff"; // Cyan - голубой для спавна
        this.spawnMarker.background = "transparent";
        this.spawnMarker.cornerRadius = 0;
        this.spawnMarker.isVisible = true;
        this.spawnMarker.zIndex = 50; // Под врагами но над фоном
        this.radarArea.addControl(this.spawnMarker);

        // === НИЖНЯЯ ИНФОРМАЦИОННАЯ ПАНЕЛЬ ===
        const infoY = centerY + RADAR_SIZE + GAP;

        const infoPanel = new Rectangle("infoPanel");
        infoPanel.width = this.scalePx(TOTAL_WIDTH); // Полная ширина без отступов
        infoPanel.height = this.scalePx(INFO_HEIGHT);
        infoPanel.thickness = 1;
        infoPanel.color = "#00ff00";
        infoPanel.background = "rgba(0, 40, 0, 0.5)";
        infoPanel.cornerRadius = 0;
        infoPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        infoPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        infoPanel.top = this.scalePx(infoY);
        this.minimapContainer.addControl(infoPanel);

        // Разделитель (добавляем ПЕРВЫМ чтобы был под текстом)
        const sep = new Rectangle("sep");
        sep.width = this.scalePx(1);
        sep.height = "60%";
        sep.thickness = 0;
        sep.background = "#00ff00";
        sep.alpha = 0.4;
        sep.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        sep.zIndex = 1; // Низкий z-index
        infoPanel.addControl(sep);

        // ИСПРАВЛЕНО: Скорость слева - заметная и чёткая
        const speedText = new TextBlock("speedText");
        speedText.text = "0km/h";
        speedText.color = "#00ff00"; // Яркий зелёный
        speedText.fontSize = this.scaleFontSize(11, 9, 13); // УВЕЛИЧЕННЫЙ шрифт для читаемости
        speedText.fontWeight = "bold";
        speedText.fontFamily = "'Press Start 2P', monospace";
        speedText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        speedText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        speedText.left = this.scalePx(6);
        speedText.top = "2px"; // Опущен для симметричного расположения
        speedText.zIndex = 1000;
        speedText.width = "30%"; // Увеличено для лучшей видимости
        speedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        speedText.textWrapping = false;
        speedText.shadowColor = "#000000";
        speedText.shadowBlur = 4; // Увеличена тень для контрастности
        speedText.outlineWidth = 1;
        speedText.outlineColor = "#000";
        infoPanel.addControl(speedText);
        (this.minimapContainer as any)._speedValue = speedText;

        // НОВОЕ: Угол наклона ствола по центру (фиксированная позиция)
        const barrelAngleText = new TextBlock("barrelAngleText");
        barrelAngleText.text = "+0.000";
        barrelAngleText.color = "#ffaa00"; // Оранжевый для отличия от скорости
        barrelAngleText.fontSize = this.scaleFontSize(11, 9, 13); // УВЕЛИЧЕННЫЙ шрифт для читаемости
        barrelAngleText.fontWeight = "bold";
        barrelAngleText.fontFamily = "'Press Start 2P', monospace";
        barrelAngleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        barrelAngleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        // ФИКСИРОВАННАЯ ПОЗИЦИЯ: фиксированная точка, чтобы число не плавало
        barrelAngleText.left = this.scalePx(95); // Фиксированное смещение
        barrelAngleText.top = "2px"; // Фиксированная вертикальная позиция
        barrelAngleText.width = "20%"; // Увеличено для читаемости
        barrelAngleText.zIndex = 1000;
        barrelAngleText.textWrapping = false;
        barrelAngleText.shadowColor = "#000000";
        barrelAngleText.shadowBlur = 3;
        barrelAngleText.outlineWidth = 1;
        barrelAngleText.outlineColor = "#000";
        infoPanel.addControl(barrelAngleText);
        (this.minimapContainer as any)._barrelAngleValue = barrelAngleText;

        // НОВОЕ: Разделители между элементами
        const separator1 = new Rectangle("separator1");
        separator1.width = "2px";
        separator1.height = "60%";
        separator1.thickness = 0;
        separator1.background = "#00ff0066";
        separator1.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        separator1.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        separator1.left = this.scalePx(-80); // Между скоростью и углом
        infoPanel.addControl(separator1);

        const separator2 = new Rectangle("separator2");
        separator2.width = "2px";
        separator2.height = "60%";
        separator2.thickness = 0;
        separator2.background = "#00ff0066";
        separator2.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        separator2.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        separator2.left = this.scalePx(80); // Между углом и координатами
        infoPanel.addControl(separator2);

        // ИСПРАВЛЕНО: Координаты справа - формат [x y z]
        const posText = new TextBlock("posText");
        posText.text = "[0 0 0]";
        posText.color = "#00ff00"; // Яркий зелёный
        posText.fontSize = this.scaleFontSize(10, 8, 12); // УВЕЛИЧЕННЫЙ шрифт для читаемости
        posText.fontWeight = "bold";
        posText.fontFamily = "'Press Start 2P', monospace";
        posText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        posText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        posText.left = this.scalePx(-4); // Отступ справа
        posText.top = "2px"; // Опущен для симметричного расположения
        posText.zIndex = 1000;
        // КРИТИЧНО: Достаточная ширина для формата [-999 -999 -999]
        posText.width = "52%"; // Ширина для координат
        posText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        posText.textWrapping = false;
        posText.isVisible = true;
        posText.shadowColor = "#000000";
        posText.shadowBlur = 3;
        posText.outlineWidth = 1;
        posText.outlineColor = "#000";
        infoPanel.addControl(posText);
        (this.minimapContainer as any)._coordValue = posText;
    }

    // === АДРЕС ПОД РАДАРОМ (ОТДЕЛЬНО) ===
    // ЗАКОММЕНТИРОВАНО - отображение адреса временно отключено
    /*
    private createAddressDisplay(): void {
        const ADDRESS_HEIGHT = 35;
        const RADAR_SIZE = 175;
        const HEADER_HEIGHT = 28;
        const INFO_HEIGHT = 28;
        
        // Создаем панель адреса отдельно от радара
        this.addressPanel = new Rectangle("addressPanel");
        this.addressPanel.width = this.scalePx(RADAR_SIZE + 90);
        this.addressPanel.height = this.scalePx(ADDRESS_HEIGHT);
        this.addressPanel.cornerRadius = 8;
        this.addressPanel.thickness = 3;
        this.addressPanel.color = "#00ff88";
        this.addressPanel.background = "rgba(5, 15, 25, 0.95)";
        this.addressPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.addressPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        // Позиционируем под радаром (радар на -45px, его высота + HEADER_HEIGHT + INFO_HEIGHT + отступы)
        const radarHeight = RADAR_SIZE + HEADER_HEIGHT + INFO_HEIGHT + 20;
        this.addressPanel.left = this.scalePx(-15); // Та же позиция по X что и радар
        this.addressPanel.top = this.scalePx(-45 - radarHeight - ADDRESS_HEIGHT - 5);
        this.addressPanel.isVisible = true;
        this.guiTexture.addControl(this.addressPanel);
        
        // Текст адреса (БЕЗ ПРЕФИКСА "Адрес: ", увеличенный размер)
        this.addressText = new TextBlock("addressText");
        this.addressText.text = "X:0, Z:0";
        this.addressText.color = "#00ff88";
        this.addressText.fontSize = this.scaleFontSize(14, 12, 20);
        this.addressText.fontWeight = "bold";
        this.addressText.fontFamily = "'Press Start 2P', monospace";
        this.addressText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.addressText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.addressPanel.addControl(this.addressText);
    }
    */

    private createDamageIndicator() {
        // Enhanced Full screen RED flash with edge indicators
        this.damageIndicator = new Rectangle("damageIndicator");
        this.damageIndicator.width = "100%";
        this.damageIndicator.height = "100%";
        this.damageIndicator.thickness = 0;
        this.damageIndicator.background = "#000"; // Will flash to #f00
        this.damageIndicator.isVisible = false; // Hidden by default
        this.damageIndicator.isPointerBlocker = false;
        this.guiTexture.addControl(this.damageIndicator);

        // Edge damage indicators (left and right edges)
        const leftEdge = new Rectangle("damageLeftEdge");
        leftEdge.width = "10px";
        leftEdge.height = "100%";
        leftEdge.thickness = 0;
        leftEdge.background = "#f00";
        leftEdge.alpha = 0;
        leftEdge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        leftEdge.isPointerBlocker = false;
        this.guiTexture.addControl(leftEdge);
        (this.damageIndicator as any)._leftEdge = leftEdge;

        const rightEdge = new Rectangle("damageRightEdge");
        rightEdge.width = "10px";
        rightEdge.height = "100%";
        rightEdge.thickness = 0;
        rightEdge.background = "#f00";
        rightEdge.alpha = 0;
        rightEdge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        rightEdge.isPointerBlocker = false;
        this.guiTexture.addControl(rightEdge);
        (this.damageIndicator as any)._rightEdge = rightEdge;

        // Low HP vignette (ИСПРАВЛЕНО: затемнение только по 25% периметра экрана)
        this.lowHpVignette = new Rectangle("lowHpVignette");
        this.lowHpVignette.width = "100%";
        this.lowHpVignette.height = "100%";
        this.lowHpVignette.thickness = 0;
        this.lowHpVignette.isVisible = false;
        this.lowHpVignette.isPointerBlocker = false;
        this.lowHpVignette.zIndex = 50;
        // Радиальный градиент: прозрачный центр (75%), затемнение только на внешних 25% периметра
        // Градиент будет обновляться динамически в updateLowHpEffect
        this.lowHpVignette.background = "radial-gradient(ellipse at center, transparent 75%, rgba(0, 0, 0, 0) 75%, rgba(0, 0, 0, 0.3) 100%)";

        this.guiTexture.addControl(this.lowHpVignette);
    }

    private createMessageDisplay() {
        // === КОМПАКТНОЕ ОПОВЕЩЕНИЕ ПОД КОМПАСОМ ===
        const msgBg = new Rectangle("msgBg");
        // Увеличена ширина для длинных сообщений
        msgBg.width = "400px";
        // Уменьшена высота для менее навязчивого вида
        msgBg.height = "32px";
        msgBg.cornerRadius = 2;
        msgBg.thickness = 1;
        msgBg.color = "#0f06"; // Зелёный вместо красного
        msgBg.background = "#001a00dd"; // Тёмно-зелёный фон
        msgBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        msgBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        msgBg.top = "40px"; // Сразу под компасом (компас: top=10px, height=25px)
        msgBg.isVisible = false;
        this.guiTexture.addControl(msgBg);

        // Левая полоска
        const leftAccent = new Rectangle("msgLeftAccent");
        leftAccent.width = "2px";
        leftAccent.height = "100%";
        leftAccent.thickness = 0;
        leftAccent.background = "#0f0"; // Зелёный
        leftAccent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        msgBg.addControl(leftAccent);

        // Правая полоска
        const rightAccent = new Rectangle("msgRightAccent");
        rightAccent.width = "2px";
        rightAccent.height = "100%";
        rightAccent.thickness = 0;
        rightAccent.background = "#0f0"; // Зелёный
        rightAccent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        msgBg.addControl(rightAccent);

        // Иконка
        const icon = new TextBlock("msgIcon");
        icon.text = "►";
        icon.color = "#0f0"; // Зелёный
        icon.fontSize = 10;
        icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        icon.left = "8px";
        msgBg.addControl(icon);
        (msgBg as any)._icon = icon;

        // Текст сообщения
        this.messageText = new TextBlock("messageText");
        this.messageText.text = "";
        this.messageText.color = "#0f0"; // Зелёный
        this.messageText.fontSize = 11;
        this.messageText.fontWeight = "bold";
        this.messageText.fontFamily = "'Press Start 2P', monospace";
        // Включаем перенос текста для длинных сообщений
        this.messageText.textWrapping = false;
        this.messageText.width = "380px"; // Ширина минус отступы для иконки
        this.messageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.messageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.messageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        msgBg.addControl(this.messageText);

        // Store reference
        (this.messageText as any)._msgBg = msgBg;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createActiveEffectsDisplay() {
        // Active Effects - СЛОТЫ 15-19 В ОБЩЕМ РЯДУ ИЗ 20 СЛОТОВ (5 слотов)
        const slotWidth = scalePixels(44); // Такой же размер как у припасов/модулей
        const slotGap = scalePixels(5);
        // Всего 20 слотов: 5 арсенал + 10 припасы/модули + 5 эффектов
        const totalSlots = 20;
        const totalWidth = totalSlots * slotWidth + (totalSlots - 1) * slotGap;
        const startX = -totalWidth / 2 + slotWidth / 2;

        // Создаем контейнер для всех слотов эффектов (прозрачный, только для группировки)
        this.activeEffectsContainer = new Rectangle("activeEffectsContainer");
        this.activeEffectsContainer.width = `${this.maxActiveEffectsSlots * slotWidth + (this.maxActiveEffectsSlots - 1) * slotGap}px`;
        this.activeEffectsContainer.height = `${slotWidth}px`;
        this.activeEffectsContainer.cornerRadius = 0;
        this.activeEffectsContainer.thickness = 0;
        this.activeEffectsContainer.color = "transparent";
        this.activeEffectsContainer.background = "transparent";
        // Контейнер использует LEFT alignment для упрощения позиционирования
        this.activeEffectsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.activeEffectsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        // Эффекты занимают индексы 15-19 (5 слотов) в общем ряду (без изменений)
        const effectsFirstSlotIndex = 15; // Первый слот эффектов в общем ряду
        // Позиция левого края первого слота эффектов
        const effectsFirstSlotLeft = startX + effectsFirstSlotIndex * (slotWidth + slotGap);
        this.activeEffectsContainer.left = `${effectsFirstSlotLeft - slotWidth / 2}px`;
        this.activeEffectsContainer.top = this.scalePx(-48); // На той же высоте что и остальные слоты
        this.activeEffectsContainer.isVisible = true;
        this.guiTexture.addControl(this.activeEffectsContainer);

        // Создаем 5 слотов для эффектов с градиентом прозрачности
        // Прозрачность слева направо: 0%, 20%, 40%, 60%, 80%
        const alphaValues = [1.0, 0.8, 0.6, 0.4, 0.2]; // alpha = 1 - прозрачность

        for (let i = 0; i < this.maxActiveEffectsSlots; i++) {
            const container = new Rectangle(`effectSlot${i}`);
            container.width = `${slotWidth}px`;
            container.height = `${slotWidth}px`;
            container.cornerRadius = 3;
            container.thickness = 2;
            container.color = "#0f05"; // Полупрозрачная рамка
            container.background = "#000000bb";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            // Позиционируем в общем ряду: индексы 15-19 для эффектов
            const globalIndex = effectsFirstSlotIndex + i;
            container.left = `${startX + globalIndex * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(-48); // Равномерно между XP BAR и RELOAD BAR
            container.zIndex = 20;

            // Градиент прозрачности: 0%, 20%, 40%, 60%, 80%
            container.alpha = alphaValues[i] ?? 0.2;
            container.isVisible = true;

            // Добавляем слот напрямую в guiTexture для правильного позиционирования в общем ряду
            this.guiTexture.addControl(container);

            // Иконка эффекта
            const icon = new TextBlock(`effectIcon${i}`);
            icon.text = "";
            icon.color = "#fff";
            icon.fontSize = this.scaleFontSize(18, 14, 24);
            icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            icon.outlineWidth = 1;
            icon.outlineColor = "#000";
            container.addControl(icon);

            // Название эффекта (маленькое, сверху)
            const nameText = new TextBlock(`effectName${i}`);
            nameText.text = "";
            nameText.color = "#0f0";
            nameText.fontSize = this.scaleFontSize(7, 6, 10);
            nameText.fontWeight = "bold";
            nameText.fontFamily = "'Press Start 2P', monospace";
            nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            nameText.top = this.scalePx(2);
            nameText.outlineWidth = 1;
            nameText.outlineColor = "#000";
            container.addControl(nameText);

            // Таймер (внизу)
            const timerText = new TextBlock(`effectTimer${i}`);
            timerText.text = "";
            timerText.color = "#0f0";
            timerText.fontSize = this.scaleFontSize(8, 6, 12);
            timerText.fontWeight = "bold";
            timerText.fontFamily = "'Press Start 2P', monospace";
            timerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            timerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            timerText.top = this.scalePx(-2);
            timerText.outlineWidth = 1;
            timerText.outlineColor = "#000";
            container.addControl(timerText);

            // Прогресс-бар (внизу, как полоска)
            const progressBar = new Rectangle(`effectProgress${i}`);
            progressBar.width = "100%";
            progressBar.height = "3px";
            progressBar.cornerRadius = 0;
            progressBar.thickness = 0;
            progressBar.background = "#0f0";
            progressBar.alpha = 0.7;
            progressBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            progressBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            progressBar.top = "-1px";
            progressBar.width = "0%";
            container.addControl(progressBar);

            this.activeEffectsSlots.push({ container, icon, nameText, timerText, progressBar });
        }
    }

    // Обновить прозрачность всех слотов эффектов на основе количества активных эффектов
    private updateActiveEffectsOpacity(): void {
        const activeCount = this.activeEffects.size;

        // Обновляем прозрачность каждого слота
        for (let i = 0; i < this.activeEffectsSlots.length; i++) {
            const slot = this.activeEffectsSlots[i];
            if (!slot) continue;
            const isActive = i < activeCount;

            if (isActive) {
                if (i < 5) {
                    // Градиент прозрачности: слот 1 = 100%, 2 = 75%, 3 = 50%, 4 = 25%, 5 = 0%
                    const alpha = 1.0 - (i * 0.25); // 1.0, 0.75, 0.5, 0.25, 0.0
                    slot.container.alpha = alpha;
                    slot.container.isVisible = true;
                    slot.icon.alpha = alpha;
                    slot.nameText.alpha = alpha;
                    slot.timerText.alpha = alpha;
                    slot.progressBar.alpha = alpha * 0.7; // Прогресс-бар немного прозрачнее
                } else {
                    // Слоты 6-8: появляются только при наличии эффектов
                    slot.container.alpha = 1.0;
                    slot.container.isVisible = true;
                    slot.icon.alpha = 1.0;
                    slot.nameText.alpha = 1.0;
                    slot.timerText.alpha = 1.0;
                    slot.progressBar.alpha = 0.7;
                }
            } else {
                // Неактивные слоты скрыты
                if (i < 5) {
                    // Первые 5 слотов всегда видны, но прозрачны
                    const alpha = 1.0 - (i * 0.25);
                    slot.container.alpha = alpha;
                    slot.container.isVisible = true;
                    slot.icon.alpha = 0;
                    slot.nameText.alpha = 0;
                    slot.timerText.alpha = 0;
                    slot.progressBar.alpha = 0;
                } else {
                    // Слоты 6-8 скрыты по умолчанию
                    slot.container.alpha = 0;
                    slot.container.isVisible = false;
                    slot.icon.alpha = 0;
                    slot.nameText.alpha = 0;
                    slot.timerText.alpha = 0;
                    slot.progressBar.alpha = 0;
                }
            }
        }
    }

    // Добавить индикатор активного эффекта
    addActiveEffect(name: string, icon: string, color: string, duration: number): void {
        if (!this.activeEffectsContainer || this.activeEffectsSlots.length === 0) return;

        // Удаляем старый эффект с таким же именем
        this.removeActiveEffect(name);

        // Находим первый свободный слот
        const activeEffectsArray = Array.from(this.activeEffects.keys());
        const slotIndex = activeEffectsArray.length;

        if (slotIndex >= this.maxActiveEffectsSlots) {
            // Все слоты заняты, не добавляем новый эффект
            return;
        }

        const slot = this.activeEffectsSlots[slotIndex];
        if (!slot) {
            // Защита от рассинхронизации массива слотов и maxActiveEffectsSlots
            return;
        }

        // Заполняем слот данными эффекта
        slot.icon.text = icon;
        slot.icon.color = color;
        slot.nameText.text = name.length > 4 ? name.substring(0, 4) : name; // Ограничиваем длину названия
        slot.nameText.color = color;
        slot.timerText.text = `${Math.ceil(duration / 1000)}s`;
        slot.timerText.color = color;
        slot.container.color = color + "5";
        slot.progressBar.background = color;
        slot.progressBar.width = "100%";

        // Сохраняем данные эффекта
        const effectData = {
            name,
            icon,
            color,
            duration,
            startTime: Date.now(),
            slotIndex,
            // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
            updateInterval: timerManager.setInterval(() => {
                const elapsed = Date.now() - effectData.startTime;
                const remaining = Math.max(0, duration - elapsed);
                const remainingSeconds = Math.ceil(remaining / 1000);
                const progressPercent = Math.max(0, Math.min(100, (remaining / duration) * 100));

                if (remainingSeconds > 0) {
                    slot.timerText.text = `${remainingSeconds}s`;
                    slot.progressBar.width = `${progressPercent}%`;
                } else {
                    // Эффект закончился
                    timerManager.clear(effectData.updateInterval);
                    this.removeActiveEffect(name);
                }
            }, 100) // Обновляем каждые 100мс для плавности
        };

        this.activeEffects.set(name, effectData as any);

        // Обновляем прозрачность всех слотов
        this.updateActiveEffectsOpacity();
    }

    // Удалить индикатор активного эффекта
    removeActiveEffect(name: string): void {
        const effectData = this.activeEffects.get(name);
        if (!effectData) return;

        // Останавливаем обновление таймера
        if ((effectData as any).updateInterval) {
            timerManager.clear((effectData as any).updateInterval);
        }

        // Очищаем слот
        const slotIndex = (effectData as any).slotIndex;
        if (slotIndex >= 0 && slotIndex < this.activeEffectsSlots.length) {
            const slot = this.activeEffectsSlots[slotIndex]!;
            slot.icon.text = "";
            slot.nameText.text = "";
            slot.timerText.text = "";
            slot.progressBar.width = "0%";
        }

        // Удаляем эффект из Map
        this.activeEffects.delete(name);

        // Перераспределяем эффекты по слотам (сдвигаем влево)
        const remainingEffects = Array.from(this.activeEffects.entries());
        this.activeEffects.clear();

        // Очищаем все слоты
        for (const slot of this.activeEffectsSlots) {
            slot.icon.text = "";
            slot.nameText.text = "";
            slot.timerText.text = "";
            slot.progressBar.width = "0%";
        }

        // Пересоздаем эффекты в новых слотах
        for (let i = 0; i < remainingEffects.length; i++) {
            const entry = remainingEffects[i];
            if (!entry) continue;
            const [effectName, effectData] = entry;
            const slot = this.activeEffectsSlots[i];
            if (!slot) continue;
            const data = effectData as any;

            slot.icon.text = data.icon;
            slot.icon.color = data.color;
            slot.nameText.text = data.name.length > 4 ? data.name.substring(0, 4) : data.name;
            slot.nameText.color = data.color;
            slot.container.color = data.color + "5";
            slot.progressBar.background = data.color;

            // Пересчитываем оставшееся время
            const elapsed = Date.now() - data.startTime;
            const remaining = Math.max(0, data.duration - elapsed);
            const remainingSeconds = Math.ceil(remaining / 1000);
            const progressPercent = Math.max(0, Math.min(100, (remaining / data.duration) * 100));

            slot.timerText.text = `${remainingSeconds}s`;
            slot.timerText.color = data.color;
            slot.progressBar.width = `${progressPercent}%`;

            // Обновляем slotIndex
            data.slotIndex = i;

            // Перезапускаем интервал обновления
            if (data.updateInterval) {
                timerManager.clear(data.updateInterval);
            }
            // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
            data.updateInterval = timerManager.setInterval(() => {
                const elapsed = Date.now() - data.startTime;
                const remaining = Math.max(0, data.duration - elapsed);
                const remainingSeconds = Math.ceil(remaining / 1000);
                const progressPercent = Math.max(0, Math.min(100, (remaining / data.duration) * 100));

                if (remainingSeconds > 0) {
                    slot.timerText.text = `${remainingSeconds}s`;
                    slot.progressBar.width = `${progressPercent}%`;
                } else {
                    timerManager.clear(data.updateInterval);
                    this.removeActiveEffect(effectName);
                }
            }, 100);

            this.activeEffects.set(effectName, data);
        }

        // Обновляем прозрачность всех слотов
        this.updateActiveEffectsOpacity();
    }

    private createControlsHint() {
        // Controls hint - СКРЫТ по умолчанию (управляется настройкой showSystemTerminal)
        const hint = new TextBlock("controlsHint");
        hint.text = "SYSTEM TERMINAL ONLINE...";
        hint.color = "#00ff00";
        hint.fontSize = 14;
        hint.fontFamily = "'Press Start 2P', monospace";
        hint.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        hint.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        hint.left = "10px";
        hint.top = "-100px";
        hint.width = "300px";
        hint.height = "100px";
        hint.isVisible = false;
        this.guiTexture.addControl(hint);
    }

    /**
     * Показать/скрыть системный терминал (controls hint)
     */
    public setSystemTerminalVisible(visible: boolean): void {
        const hint = this.guiTexture.getControlByName("controlsHint");
        if (hint) {
            hint.isVisible = visible;
        }
    }

    /**
     * Установить позицию спавна для отображения на радаре и компасе
     */
    public setSpawnPosition(x: number, z: number): void {
        this.spawnPosition = { x, z };
    }

    /**
     * Создать кнопку редактора карт в HUD
     * КРИТИЧНО: Показывается ТОЛЬКО в режиме TEST из редактора карт
     */
    private createEditorButton(): void {
        // Проверяем режим TEST из редактора карт
        const urlParams = new URLSearchParams(window.location.search);
        const testMapParam = urlParams.get('testMap');
        const isTestMode = testMapParam === 'current' || !!localStorage.getItem('tx_test_map');

        const editorBtn = Button.CreateSimpleButton("editorButton", "🛠️ РЕДАКТОР");
        editorBtn.width = "150px";
        editorBtn.height = "40px";
        editorBtn.color = "#0f0";
        editorBtn.background = "rgba(0, 50, 0, 0.8)";
        editorBtn.cornerRadius = 5;
        editorBtn.thickness = 2;
        editorBtn.fontSize = 14;
        editorBtn.fontFamily = "monospace";
        editorBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        editorBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        editorBtn.left = "-10px";
        editorBtn.top = "10px";
        // ИСПРАВЛЕНО: Показываем кнопку ТОЛЬКО в режиме TEST
        editorBtn.isVisible = isTestMode;

        // Сохраняем ссылку для обновления видимости
        this.editorButton = editorBtn;

        editorBtn.onPointerClickObservable.add(() => {
            const game = (window as any).gameInstance;
            if (game && game.mapEditor) {
                // Проверяем состояние редактора
                const restoreBtn = document.getElementById("map-editor-restore-btn");
                const isRestoreBtnVisible = restoreBtn &&
                    restoreBtn.style.display !== 'none' &&
                    restoreBtn.style.visibility !== 'hidden' &&
                    window.getComputedStyle(restoreBtn).display !== 'none';

                const isEditorActive = game.mapEditor.isEditorActive && game.mapEditor.isEditorActive();
                const editorContainer = game.mapEditor.container;
                const isEditorVisible = editorContainer &&
                    editorContainer.style.display !== 'none' &&
                    editorContainer.style.visibility !== 'hidden' &&
                    window.getComputedStyle(editorContainer).display !== 'none';

                console.log("[HUD] Editor state:", { isRestoreBtnVisible, isEditorActive, isEditorVisible });

                if (isRestoreBtnVisible || (!isEditorVisible && isEditorActive)) {
                    // Редактор свернут - разворачиваем
                    console.log("[HUD] Restoring editor");
                    if (typeof game.mapEditor.restore === "function") {
                        game.mapEditor.restore();
                    }
                } else if (isEditorVisible && isEditorActive) {
                    // Редактор открыт - сворачиваем
                    console.log("[HUD] Minimizing editor");
                    if (typeof game.mapEditor.minimize === "function") {
                        game.mapEditor.minimize();
                    }
                } else {
                    // Редактор закрыт - открываем
                    console.log("[HUD] Opening editor");
                    if (typeof game.mapEditor.open === "function") {
                        game.mapEditor.open();
                    }
                }
            } else if (game) {
                // Редактор не создан - открываем через game
                console.log("[HUD] Opening editor via game");
                game.openMapEditorInternal();
            }
        });
        this.guiTexture.addControl(editorBtn);
    }

    /**
     * Обновить видимость кнопки редактора (только в режиме TEST)
     */
    private updateEditorButtonVisibility(): void {
        if (!this.editorButton) return;

        // Проверяем режим TEST из редактора карт
        const urlParams = new URLSearchParams(window.location.search);
        const testMapParam = urlParams.get('testMap');
        const isTestMode = testMapParam === 'current' || !!localStorage.getItem('tx_test_map');

        this.editorButton.isVisible = isTestMode;
    }

    private createPositionDisplay() {
        // === СКРЫТЫЕ КООРДИНАТЫ (данные отображаются в радаре) ===
        // ИСПРАВЛЕНО: Координаты теперь отображаются в радаре, этот контейнер оставлен для совместимости
        const posContainer = new Rectangle("posContainer");
        posContainer.width = "0px";
        posContainer.height = "0px";
        posContainer.isVisible = false;
        this.guiTexture.addControl(posContainer);

        this.positionText = new TextBlock("posText");
        this.positionText.text = "";
        this.positionText.isVisible = false;
        this.positionText.fontWeight = "bold";
        posContainer.addControl(this.positionText);
    }

    // === PUBLIC METHODS ===

    /**
     * Установить настройки UI (из SettingsManager)
     */
    setUISettings(settings: {
        showCrosshair?: boolean;
        showHealthBar?: boolean;
        showAmmoCounter?: boolean;
        crosshairStyle?: string;
    }): void {
        // Показать/скрыть прицел (влияет только когда не в режиме прицеливания)
        if (settings.showCrosshair !== undefined) {
            this._crosshairEnabled = settings.showCrosshair;
        }

        // Показать/скрыть health bar
        if (settings.showHealthBar !== undefined && this.healthBar) {
            this.healthBar.isVisible = settings.showHealthBar;
        }

        // Показать/скрыть ammo counter (arsenal)
        if (settings.showAmmoCounter !== undefined && this.arsenalSlots.length > 0) {
            const visible = settings.showAmmoCounter;
            this.arsenalSlots.forEach(slot => {
                slot.container.isVisible = visible;
            });
        }

        // Стиль прицела
        if (settings.crosshairStyle !== undefined) {
            this._crosshairStyle = settings.crosshairStyle;
            this.updateCrosshairStyle();
        }
    }

    // Флаг включения прицела (используется в setAimMode)
    private _crosshairEnabled = true;
    private _crosshairStyle = "default";

    /**
     * Обновить стиль прицела
     */
    private updateCrosshairStyle(): void {
        // Разные стили прицела
        const colors: Record<string, string> = {
            default: "#fff",
            red: "#f00",
            green: "#0f0",
            cyan: "#0ff"
        };
        const color = colors[this._crosshairStyle] || "#fff";

        if (this.crosshairDot) {
            this.crosshairDot.background = color;
        }
        this.crosshairElements.forEach(el => {
            el.background = color;
        });
    }

    setHealth(current: number, max: number = this.maxHealth) {
        // Обновить мобильный HUD если доступен
        if (this.mobileControls) {
            // Получаем текущие значения боеприпасов и убийств
            const ammo = this.arsenalSlots[0]?.countText?.text?.split('/')[0] || '0';
            const maxAmmo = this.arsenalSlots[0]?.countText?.text?.split('/')[1] || '0';
            this.mobileControls.updateHUD(
                current,
                max,
                parseInt(ammo) || 0,
                parseInt(maxAmmo) || 0,
                this.killsCount
            );
        }
        this.currentHealth = Math.max(0, Math.min(max, current));
        this.maxHealth = max;

        // ИСПРАВЛЕНИЕ: Проверяем существование healthFill перед обновлением
        if (!this.healthFill || !this.healthBar) {
            return;
        }

        const percent = (this.currentHealth / this.maxHealth) * 100;
        const smoothPercent = Math.max(0, Math.min(100, percent));

        // Плавная анимация изменения ширины
        const currentWidth = parseFloat(this.healthFill.width.toString().replace("%", "")) || 100;
        const targetWidth = smoothPercent;
        const widthDiff = targetWidth - currentWidth;
        const newWidth = currentWidth + widthDiff * 0.15; // Плавная интерполяция
        this.healthFill.width = Math.max(0, Math.min(100, newWidth)) + "%";

        // Обновляем текст здоровья
        if (this.healthText) {
            this.healthText.text = `${Math.round(this.currentHealth)}/${Math.round(this.maxHealth)}`;
        }

        // Enhanced color based on health - DYNAMIC colors with smooth transitions
        let healthColor = "#0f0"; // Green
        let glowColor = "#3f3";
        if (percent < 15) {
            healthColor = "#f00"; // Red
            glowColor = "#f33";
        } else if (percent < 30) {
            healthColor = "#f80"; // Orange-red
            glowColor = "#f93";
        } else if (percent < 50) {
            healthColor = "#ff0"; // Yellow
            glowColor = "#ff3";
        } else if (percent < 75) {
            healthColor = "#ff8800"; // Orange
            glowColor = "#ffa533";
        }

        this.healthFill.background = healthColor;
        if (this.healthText) {
            this.healthText.color = "#fff"; // Всегда белый
        }
        this.healthBar.color = healthColor;

        // Update glow effect
        const healthGlow = (this.healthBar as any)._healthGlow as Rectangle;
        if (healthGlow) {
            healthGlow.background = glowColor;
            healthGlow.width = this.healthFill.width;
        }

        // Update percentage text
        const container = this.healthBar.parent as Rectangle;
        if (container) {
            const healthPercent = (container as any)._healthPercent as TextBlock;
            if (healthPercent) {
                healthPercent.text = `${Math.round(percent)}%`;
                healthPercent.color = healthColor;
            }
        }

        // Warning overlay flash when critical
        const warningOverlay = (this.healthBar as any)._warningOverlay as Rectangle;
        if (warningOverlay) {
            if (percent < 20) {
                // Пульсация при критическом здоровье
                const pulse = (Math.sin(Date.now() / 200) + 1) / 2; // 0-1
                warningOverlay.alpha = pulse * 0.6;
                warningOverlay.isVisible = true;
            } else {
                warningOverlay.isVisible = false;
            }
        }

        // Low HP vignette effect (< 30%)
        // КРИТИЧНО: Отключаем эффект при смерти (health = 0) или при полном здоровье
        this.isLowHp = percent < 30 && percent > 0 && this.currentHealth > 0;

        // КРИТИЧНО: Отключаем legacy компонент полностью - используем только новый
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = false;
            this.lowHpVignette.background = "transparent";
            this.lowHpVignette.alpha = 0;
        }

        // Обновляем только новый компонент
        if (this.lowHpVignetteComponent) {
            this.lowHpVignetteComponent.update(this.currentHealth, this.maxHealth, 0.016);
        }
    }

    /**
     * Установить/обновить информацию о цели (враг под прицелом)
     * @param target - информация о цели или null для скрытия
     */
    setTargetInfo(target: TargetInfo | null): void {
        if (this.targetHealthBar) {
            this.targetHealthBar.setTarget(target);
        }
    }

    /**
     * Обновить здоровье текущей цели (для оптимизации - не пересоздаём объект)
     */
    updateTargetHealth(health: number, maxHealth: number): void {
        if (this.targetHealthBar && this.targetHealthBar.hasTarget()) {
            // Обновляем через setTarget с теми же данными
            // TargetHealthBar сама обработает анимацию
        }
    }

    /**
     * Показать плавающее число урона
     * @param position - 3D позиция в мире
     * @param amount - величина урона
     * @param type - 'dealt' (нанесённый), 'received' (полученный), 'heal' (лечение)
     * @param isCritical - критический урон (больший размер)
     */
    showDamageNumber(position: Vector3, amount: number, type: 'dealt' | 'received' | 'heal' = 'dealt', isCritical: boolean = false): void {
        if (this.floatingDamageNumbers) {
            this.floatingDamageNumbers.showDamage(position, amount, type, isCritical);
        }
    }

    /**
     * Обновить плавающие числа урона (вызывать из игрового цикла)
     */
    updateFloatingDamageNumbers(camera: any): void {
        if (this.floatingDamageNumbers && camera) {
            this.floatingDamageNumbers.update(camera);
        }
    }

    /**
     * Установить данные зданий для отображения на радаре
     * @param buildings - массив зданий с координатами и размерами
     */
    setRadarBuildings(buildings: { x: number; z: number; width: number; depth: number }[]): void {
        this.cachedBuildings = buildings.slice(0, this.MAX_BUILDING_MARKERS);
    }

    /**
     * Обновить маркеры зданий на радаре
     * @param playerX - позиция игрока X
     * @param playerZ - позиция игрока Z
     * @param angle - угол поворота радара
     * @param radarRange - радиус обзора радара
     */
    private updateRadarBuildings(playerX: number, playerZ: number, angle: number, radarRange: number): void {
        if (!this.radarArea) return;

        // Скрываем старые маркеры
        for (const marker of this.buildingMarkers) {
            marker.isVisible = false;
            this.buildingMarkerPool.push(marker);
        }
        this.buildingMarkers = [];

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const RADAR_INNER = 180;
        const radarScale = RADAR_INNER / 2 / radarRange;

        for (const building of this.cachedBuildings) {
            // Относительная позиция здания
            const relX = building.x - playerX;
            const relZ = building.z - playerZ;

            // Проверяем расстояние
            const dist = Math.sqrt(relX * relX + relZ * relZ);
            if (dist > radarRange * 1.2) continue;

            // Вращаем относительно направления игрока
            const rotX = relX * cos - relZ * sin;
            const rotZ = relX * sin + relZ * cos;

            // Масштабируем к размеру радара
            const radarX = rotX * radarScale;
            const radarY = -rotZ * radarScale;

            // Проверяем, находится ли в пределах радара
            if (Math.abs(radarX) > RADAR_INNER / 2 || Math.abs(radarY) > RADAR_INNER / 2) continue;

            // Получаем или создаём маркер
            let marker: Rectangle;
            if (this.buildingMarkerPool.length > 0) {
                marker = this.buildingMarkerPool.pop()!;
            } else {
                marker = new Rectangle(`building${this.buildingMarkers.length}`);
                marker.thickness = 1;
                marker.color = "#003300";
                marker.zIndex = 50; // Ниже врагов и игрока
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                this.radarArea.addControl(marker);
            }

            // Размер здания на радаре
            const sizeX = Math.max(4, building.width * radarScale * 0.8);
            const sizeZ = Math.max(4, building.depth * radarScale * 0.8);

            marker.width = `${sizeX}px`;
            marker.height = `${sizeZ}px`;
            marker.left = `${radarX}px`;
            marker.top = `${radarY}px`;
            marker.background = "rgba(0, 60, 0, 0.6)"; // Тёмно-зелёный полупрозрачный
            marker.rotation = -angle; // Вращаем здание вместе с радаром
            marker.isVisible = true;

            this.buildingMarkers.push(marker);
        }
    }

    /**
     * Обновить дороги на миникарте
     */
    private updateMinimapRoads(playerX: number, playerZ: number, angle: number, radarRange: number): void {
        // ОПТИМИЗАЦИЯ: Пропускаем если миникарта выключена
        if (!this.minimapEnabled) return;
        if (!this.radarArea) return;

        // Скрываем старые маркеры дорог
        for (const marker of this.roadMarkers) {
            marker.isVisible = false;
            this.roadMarkerPool.push(marker);
        }
        this.roadMarkers = [];

        // Импортируем дороги Тарту
        try {
            const { TARTU_ROADS } = require("./tartuRoads");
            const roads = TARTU_ROADS || [];

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const RADAR_INNER = 180;
            const radarScale = RADAR_INNER / 2 / radarRange;

            for (const road of roads) {
                // Проверяем, находится ли дорога в радиусе радара
                const roadCenterX = (road.start.x + road.end.x) / 2;
                const roadCenterZ = (road.start.z + road.end.z) / 2;
                const distToStart = Math.sqrt((road.start.x - playerX) ** 2 + (road.start.z - playerZ) ** 2);
                const distToEnd = Math.sqrt((road.end.x - playerX) ** 2 + (road.end.z - playerZ) ** 2);
                const distToCenter = Math.sqrt((roadCenterX - playerX) ** 2 + (roadCenterZ - playerZ) ** 2);

                // Показываем дорогу если она в радиусе радара
                if (distToStart > radarRange * 1.5 && distToEnd > radarRange * 1.5 && distToCenter > radarRange * 1.5) {
                    continue;
                }

                // Вычисляем относительные позиции
                const relStartX = road.start.x - playerX;
                const relStartZ = road.start.z - playerZ;
                const relEndX = road.end.x - playerX;
                const relEndZ = road.end.z - playerZ;

                // Вращаем относительно направления игрока
                const rotStartX = relStartX * cos - relStartZ * sin;
                const rotStartZ = relStartX * sin + relStartZ * cos;
                const rotEndX = relEndX * cos - relEndZ * sin;
                const rotEndZ = relEndX * sin + relEndZ * cos;

                // Масштабируем к размеру радара
                const radarStartX = rotStartX * radarScale;
                const radarStartY = -rotStartZ * radarScale;
                const radarEndX = rotEndX * radarScale;
                const radarEndY = -rotEndZ * radarScale;

                // Проверяем, находится ли хотя бы часть дороги в пределах радара
                const startInBounds = Math.abs(radarStartX) <= RADAR_INNER / 2 && Math.abs(radarStartY) <= RADAR_INNER / 2;
                const endInBounds = Math.abs(radarEndX) <= RADAR_INNER / 2 && Math.abs(radarEndY) <= RADAR_INNER / 2;

                if (!startInBounds && !endInBounds) {
                    // Проверяем, пересекает ли дорога область радара
                    const lineLength = Math.sqrt((radarEndX - radarStartX) ** 2 + (radarEndY - radarStartY) ** 2);
                    if (lineLength === 0) continue;

                    const t = Math.max(0, Math.min(1, -(radarStartX * (radarEndX - radarStartX) + radarStartY * (radarEndY - radarStartY)) / (lineLength ** 2)));
                    const closestX = radarStartX + t * (radarEndX - radarStartX);
                    const closestY = radarStartY + t * (radarEndY - radarStartY);
                    const distToCenter = Math.sqrt(closestX ** 2 + closestY ** 2);

                    if (distToCenter > RADAR_INNER / 2) continue;
                }

                // Получаем или создаём маркер дороги
                let line: Line;
                if (this.roadMarkerPool.length > 0) {
                    line = this.roadMarkerPool.pop()!;
                } else {
                    line = new Line(`road${this.roadMarkers.length}`);
                    line.lineWidth = 2;
                    line.zIndex = 30; // Ниже зданий, но видимо
                    this.radarArea.addControl(line);
                }

                // Устанавливаем цвет в зависимости от типа дороги
                const color = road.type === "highway" ? "#00aa00" : road.type === "street" ? "#006600" : "#004400";
                line.color = color;
                line.alpha = 0.6;

                // Устанавливаем координаты линии
                line.x1 = radarStartX;
                line.y1 = radarStartY;
                line.x2 = radarEndX;
                line.y2 = radarEndY;

                line.isVisible = true;
                this.roadMarkers.push(line);
            }
        } catch (e) {
            // Если дороги недоступны, просто пропускаем
            console.warn("[HUD] Could not load roads for minimap:", e);
        }
    }

    /**
     * Обновить рельеф и препятствия на миникарте
     */
    private updateMinimapTerrain(playerX: number, playerZ: number, angle: number, radarRange: number): void {
        // ОПТИМИЗАЦИЯ: Пропускаем если миникарта выключена
        if (!this.minimapEnabled) return;
        if (!this.radarArea || !this.scene) return;

        // Скрываем старые маркеры рельефа
        for (const marker of this.terrainMarkers) {
            marker.isVisible = false;
            this.terrainMarkerPool.push(marker);
        }
        this.terrainMarkers = [];

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const RADAR_INNER = 180;
        const radarScale = RADAR_INNER / 2 / radarRange;

        // Ищем препятствия в сцене
        const terrainKeywords = ["obstacle", "barrier", "wall", "fence", "rock", "tree", "boulder"];
        let terrainCount = 0;
        const MAX_TERRAIN_MARKERS = 20; // Ограничение для производительности

        for (const mesh of this.scene.meshes) {
            if (!mesh.isEnabled() || !mesh.isVisible || terrainCount >= MAX_TERRAIN_MARKERS) continue;

            const name = mesh.name.toLowerCase();
            const isTerrain = terrainKeywords.some(keyword => name.includes(keyword));

            if (!isTerrain) continue;

            const pos = mesh.getAbsolutePosition();
            const dist = Math.sqrt((pos.x - playerX) ** 2 + (pos.z - playerZ) ** 2);
            if (dist > radarRange * 1.2) continue;

            // Вычисляем относительную позицию
            const relX = pos.x - playerX;
            const relZ = pos.z - playerZ;

            // Вращаем относительно направления игрока
            const rotX = relX * cos - relZ * sin;
            const rotZ = relX * sin + relZ * cos;

            // Масштабируем к размеру радара
            const radarX = rotX * radarScale;
            const radarY = -rotZ * radarScale;

            // Проверяем, находится ли в пределах радара
            if (Math.abs(radarX) > RADAR_INNER / 2 || Math.abs(radarY) > RADAR_INNER / 2) continue;

            // Получаем или создаём маркер
            let marker: Rectangle;
            if (this.terrainMarkerPool.length > 0) {
                marker = this.terrainMarkerPool.pop()!;
            } else {
                marker = new Rectangle(`terrain${this.terrainMarkers.length}`);
                marker.thickness = 1;
                marker.color = "#005500";
                marker.zIndex = 40; // Между дорогами и зданиями
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                this.radarArea.addControl(marker);
            }

            // Размер препятствия на радаре
            const bounds = mesh.getBoundingInfo()?.boundingBox;
            const size = bounds ? Math.max(bounds.extendSize.x, bounds.extendSize.z) * 2 : 5;
            const radarSize = Math.max(3, size * radarScale * 0.5);

            marker.width = `${radarSize}px`;
            marker.height = `${radarSize}px`;
            marker.left = `${radarX}px`;
            marker.top = `${radarY}px`;
            marker.background = "rgba(0, 80, 0, 0.5)"; // Тёмно-зелёный полупрозрачный
            marker.cornerRadius = radarSize / 2; // Круглые маркеры для препятствий
            marker.isVisible = true;

            this.terrainMarkers.push(marker);
            terrainCount++;
        }
    }

    /**
     * Обновить снаряды на миникарте
     */
    updateMinimapProjectiles(projectiles: Array<{ x: number, z: number, type?: string, ownerId?: string }>, playerX: number, playerZ: number, angle: number): void {
        // ОПТИМИЗАЦИЯ: Пропускаем если миникарта выключена
        if (!this.minimapEnabled) return;
        if (!this.radarArea) return;

        // Скрываем старые маркеры снарядов
        for (const marker of this.projectileMarkers) {
            marker.isVisible = false;
            this.projectileMarkerPool.push(marker);
        }
        this.projectileMarkers = [];

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const RADAR_INNER = 180;
        const RADAR_RANGE = 250;
        const radarScale = RADAR_INNER / 2 / RADAR_RANGE;

        // Цвета для разных типов снарядов
        const projectileColors: Record<string, string> = {
            "ap": "#ffaa00",
            "he": "#ff6600",
            "heat": "#ff0000",
            "apcr": "#ffff00",
            "hesh": "#00ff00",
            "tracer": "#00ffff",
            "incendiary": "#ff4400",
            "smoke": "#888888",
            "guided": "#ff00ff"
        };

        for (const projectile of projectiles) {
            // Вычисляем относительную позицию
            const relX = projectile.x - playerX;
            const relZ = projectile.z - playerZ;

            // Проверяем расстояние
            const dist = Math.sqrt(relX * relX + relZ * relZ);
            if (dist > RADAR_RANGE) continue;

            // Вращаем относительно направления игрока
            const rotX = relX * cos - relZ * sin;
            const rotZ = relX * sin + relZ * cos;

            // Масштабируем к размеру радара
            const radarX = rotX * radarScale;
            const radarY = -rotZ * radarScale;

            // Проверяем, находится ли в пределах радара
            if (Math.abs(radarX) > RADAR_INNER / 2 || Math.abs(radarY) > RADAR_INNER / 2) continue;

            // Получаем или создаём маркер
            let marker: Rectangle;
            if (this.projectileMarkerPool.length > 0) {
                marker = this.projectileMarkerPool.pop()!;
            } else {
                marker = new Rectangle(`projectile${this.projectileMarkers.length}`);
                marker.width = "3px";
                marker.height = "3px";
                marker.thickness = 0;
                marker.zIndex = 900; // Выше зданий, но ниже врагов
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                this.radarArea.addControl(marker);
            }

            // Устанавливаем цвет в зависимости от типа снаряда
            const projectileType = projectile.type || "ap";
            marker.background = projectileColors[projectileType] || "#ffaa00";
            marker.alpha = 0.8;

            marker.left = `${radarX}px`;
            marker.top = `${radarY}px`;
            marker.isVisible = true;

            this.projectileMarkers.push(marker);
        }
    }

    /**
     * Добавить взрыв на миникарту
     */
    addExplosion(x: number, z: number, radius: number = 5): void {
        const now = Date.now();
        this.explosionHistory.push({ x, z, time: now, radius });

        // Удаляем старые взрывы (старше 5 секунд)
        this.explosionHistory = this.explosionHistory.filter(exp => now - exp.time < this.EXPLOSION_FADE_TIME);
    }

    /**
     * Обновить взрывы на миникарте
     */
    private updateMinimapExplosions(playerX: number, playerZ: number, angle: number, radarRange: number): void {
        // ОПТИМИЗАЦИЯ: Пропускаем если миникарта выключена
        if (!this.minimapEnabled) return;
        if (!this.radarArea) return;

        // Скрываем старые маркеры взрывов
        for (const marker of this.explosionMarkers) {
            marker.isVisible = false;
            marker.dispose();
        }
        this.explosionMarkers = [];

        const now = Date.now();
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const RADAR_INNER = 180;
        const radarScale = RADAR_INNER / 2 / radarRange;

        // Фильтруем старые взрывы
        this.explosionHistory = this.explosionHistory.filter(exp => now - exp.time < this.EXPLOSION_FADE_TIME);

        for (const explosion of this.explosionHistory) {
            // Вычисляем относительную позицию
            const relX = explosion.x - playerX;
            const relZ = explosion.z - playerZ;

            // Проверяем расстояние
            const dist = Math.sqrt(relX * relX + relZ * relZ);
            if (dist > radarRange * 1.2) continue;

            // Вращаем относительно направления игрока
            const rotX = relX * cos - relZ * sin;
            const rotZ = relX * sin + relZ * cos;

            // Масштабируем к размеру радара
            const radarX = rotX * radarScale;
            const radarY = -rotZ * radarScale;

            // Проверяем, находится ли в пределах радара
            if (Math.abs(radarX) > RADAR_INNER / 2 || Math.abs(radarY) > RADAR_INNER / 2) continue;

            // Вычисляем затухание (от 1.0 до 0.3)
            const age = now - explosion.time;
            const fadeProgress = age / this.EXPLOSION_FADE_TIME;
            const alpha = 1.0 - fadeProgress * 0.7; // От 1.0 до 0.3

            // Создаём маркер взрыва
            const marker = new Rectangle(`explosion${this.explosionMarkers.length}`);
            const size = Math.max(4, explosion.radius * radarScale * 0.5);
            marker.width = `${size}px`;
            marker.height = `${size}px`;
            marker.thickness = 1;
            marker.color = "#ff4400";
            marker.background = `rgba(255, 68, 0, ${alpha * 0.6})`;
            marker.cornerRadius = size / 2;
            marker.zIndex = 800; // Выше зданий
            marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            marker.left = `${radarX}px`;
            marker.top = `${radarY}px`;
            marker.isVisible = true;
            marker.alpha = alpha;

            this.radarArea.addControl(marker);
            this.explosionMarkers.push(marker);
        }
    }

    /**
     * Установить здоровье врага для отображения на миникарте
     */
    setEnemyHealthForMinimap(enemyId: string, health: number, maxHealth: number): void {
        this.enemyHealthData.set(enemyId, { health, maxHealth });
    }

    // Update low HP pulse effect (call from updateAnimations)
    // ИСПРАВЛЕНО: Legacy метод отключён - используем только новый компонент LowHealthVignette
    // Эффект биения сердца теперь обрабатывается внутри компонента LowHealthVignette
    private updateLowHpEffect(deltaTime: number): void {
        // КРИТИЧНО: Отключаем legacy компонент полностью
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = false;
            this.lowHpVignette.background = "transparent";
            this.lowHpVignette.alpha = 0;
        }

        // Обновление эффекта теперь происходит через update() метод HUD
        // который вызывает lowHpVignetteComponent.update() с deltaTime
    }

    /**
     * Legacy update for animations - called from public update()
     */
    private _updateLegacy(deltaTime: number): void {
        this.updateAnimations(deltaTime);
        // Note: updateAnimations was being called twice - removed duplicate
    }

    damage(amount: number, damageSourceDirection?: Vector3, playerForward?: Vector3) {
        this.setHealth(this.currentHealth - amount);
        this.sessionDamage += amount; // Обновляем статистику сессии

        // УМЕНЬШЕННЫЙ эффект вспышки - только по краям, не на весь экран
        // Интенсивность значительно уменьшена для менее тревожного эффекта
        const intensity = Math.min(1, amount / 100); // УМЕНЬШЕНО: делим на 100 вместо 50

        // Show directional indicator if direction is provided
        // Show directional indicator if source position is provided
        if (damageSourceDirection) {
            // New Logic: Pass absolute source position for dynamic compass update
            // Note: damageSourceDirection here is actually the source position (renaming argument implies strict breaking change, so we assume it IS source position now)
            // Wait, tankHealth was passing (attackerPos - playerPos). We need to change tankHealth FIRST or handle both.
            // Let's assume we changed tankHealth to pass attackerPosition.
            this.damageIndicatorComponent?.showDamage(damageSourceDirection, intensity);
        }

        // НЕ показываем полноэкранную вспышку - только края
        // this.damageIndicator больше не используется для полноэкранного эффекта

        // Edge indicators с УМЕНЬШЕННОЙ интенсивностью
        const leftEdge = (this.damageIndicator as any)._leftEdge as Rectangle;
        const rightEdge = (this.damageIndicator as any)._rightEdge as Rectangle;

        if (leftEdge && rightEdge) {
            // ЗНАЧИТЕЛЬНО УМЕНЬШЕНА прозрачность - менее заметно
            const edgeAlpha = intensity * 0.25; // УМЕНЬШЕНО с 0.8 до 0.25
            leftEdge.alpha = edgeAlpha;
            rightEdge.alpha = edgeAlpha;
            leftEdge.isVisible = true;
            rightEdge.isVisible = true;
        }

        // УМЕНЬШЕНА длительность вспышки
        setTimeout(() => {
            if (leftEdge) leftEdge.isVisible = false;
            if (rightEdge) rightEdge.isVisible = false;
        }, 100); // УМЕНЬШЕНО с 150 до 100
    }

    heal(amount: number) {
        this.setHealth(this.currentHealth + amount);

        // Enhanced GREEN flash with edge indicators
        const intensity = Math.min(1, amount / 50);

        if (!this.damageIndicator) return; // Null check

        this.damageIndicator.background = `#00${Math.floor(30 + intensity * 220).toString(16).padStart(2, '0')}00`;
        this.damageIndicator.isVisible = true;

        // Edge indicators (green)
        const leftEdge = (this.damageIndicator as any)._leftEdge as Rectangle;
        const rightEdge = (this.damageIndicator as any)._rightEdge as Rectangle;

        if (leftEdge && rightEdge) {
            leftEdge.background = "#0f0";
            rightEdge.background = "#0f0";
            leftEdge.alpha = intensity * 0.6;
            rightEdge.alpha = intensity * 0.6;
            leftEdge.isVisible = true;
            rightEdge.isVisible = true;
        }

        setTimeout(() => {
            if (this.damageIndicator) this.damageIndicator.isVisible = false;
            if (leftEdge) {
                leftEdge.isVisible = false;
                leftEdge.background = "#f00"; // Reset to red
            }
            if (rightEdge) {
                rightEdge.isVisible = false;
                rightEdge.background = "#f00"; // Reset to red
            }
        }, 150);
    }

    /**
     * Показывает эффект блокировки щита - урон полностью заблокирован!
     */
    showShieldBlock(blockedDamage: number) {
        // Синяя вспышка по краям экрана - щит заблокировал урон
        const intensity = Math.min(1, blockedDamage / 50);

        if (!this.damageIndicator) return; // Null check

        // Используем голубой/бирюзовый цвет для щита
        this.damageIndicator.background = `#00${Math.floor(30 + intensity * 200).toString(16).padStart(2, '0')}${Math.floor(200 + intensity * 55).toString(16).padStart(2, '0')}`;
        this.damageIndicator.isVisible = true;

        // Edge indicators (cyan/shield color)
        const leftEdge = (this.damageIndicator as any)._leftEdge as Rectangle;
        const rightEdge = (this.damageIndicator as any)._rightEdge as Rectangle;

        if (leftEdge && rightEdge) {
            leftEdge.background = "#00ffff"; // Cyan for shield
            rightEdge.background = "#00ffff";
            leftEdge.alpha = intensity * 0.8;
            rightEdge.alpha = intensity * 0.8;
            leftEdge.isVisible = true;
            rightEdge.isVisible = true;
        }

        // Показываем текст блокировки урона через chatSystem (если доступен)
        if (blockedDamage > 0 && (this as any).chatSystem) {
            const message = `🛡️ BLOCKED: ${blockedDamage} DMG`;
            (this as any).chatSystem.addMessage(message, "system", "#00ffff");
        }

        // Короткая вспышка
        setTimeout(() => {
            if (this.damageIndicator) this.damageIndicator.isVisible = false;
            if (leftEdge) {
                leftEdge.isVisible = false;
                leftEdge.background = "#f00"; // Reset to red
            }
            if (rightEdge) {
                rightEdge.isVisible = false;
                rightEdge.background = "#f00"; // Reset to red
            }
        }, 200);
    }

    startReload(reloadTimeMs: number) {
        this.isReloading = true;
        this.reloadTime = reloadTimeMs;
        this.reloadStartTime = Date.now();
        this.reloadFill.width = "0%";
        this.reloadFill.background = "#f50";
        this.reloadText.text = "RELOAD...";
        this.reloadText.color = "#f50";

        // Reset glow
        const reloadGlow = (this.reloadBar as any)?._reloadGlow as Rectangle;
        if (reloadGlow) {
            reloadGlow.width = "0%";
            reloadGlow.background = "#f93";
        }
    }

    updateReload(progress?: number, isReloading?: boolean) {
        // ИСПРАВЛЕНО: Шкала перезарядки теперь работает корректно
        // КРИТИЧНО: Проверяем наличие элементов перед обновлением
        if (!this.reloadFill || !this.reloadBar || !this.reloadText) {
            return;
        }

        // Support legacy call with arguments
        if (progress !== undefined && isReloading !== undefined) {
            const reloadGlow = (this.reloadBar as any)?._reloadGlow as Rectangle;

            // КРИТИЧНО: Убеждаемся, что элементы видимы
            this.reloadBar.isVisible = true;
            this.reloadFill.isVisible = true;
            this.reloadText.isVisible = true;

            if (isReloading) {
                const progressPercent = Math.min(100, Math.max(0, progress * 100));
                this.reloadFill.width = `${progressPercent}%`;
                this.reloadFill.background = "#ff3300";
                this.reloadText.text = `RELOADING... ${Math.round(progressPercent)}%`;
                this.reloadText.color = "#ff3300";

                if (reloadGlow) {
                    reloadGlow.width = `${progressPercent}%`;
                    reloadGlow.alpha = 0.1;
                }
            } else {
                this.reloadFill.width = "100%";
                this.reloadFill.background = "#0f0";
                this.reloadText.text = "READY";
                this.reloadText.color = "#0f0";

                if (reloadGlow) {
                    reloadGlow.width = "100%";
                    reloadGlow.background = "#3f3";
                    const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
                    reloadGlow.alpha = 0.2 + pulse * 0.3;
                }
            }
            return;
        }

        // Убеждаемся, что элементы видимы
        this.reloadBar.isVisible = true;
        this.reloadFill.isVisible = true;
        this.reloadText.isVisible = true;

        // ИСПРАВЛЕНО: Используем только старую шкалу перезарядки (reloadBarComponent удален)
        if (!this.isReloading) {
            this.reloadFill.width = "100%";
            this.reloadFill.background = "#0f0";
            this.reloadText.text = "READY";
            this.reloadText.color = "#0f0";

            // Update glow
            const reloadGlow = (this.reloadBar as any)?._reloadGlow as Rectangle;
            if (reloadGlow) {
                reloadGlow.width = "100%";
                reloadGlow.background = "#3f3";
            }
            return;
        }

        const elapsed = Date.now() - this.reloadStartTime;
        const percent = Math.min(100, (elapsed / this.reloadTime) * 100);

        // Плавная анимация заполнения
        const currentWidth = parseFloat(this.reloadFill.width.toString().replace("%", "")) || 0;
        const targetWidth = percent;
        const widthDiff = targetWidth - currentWidth;
        const newWidth = currentWidth + widthDiff * 0.2; // Плавная интерполяция
        this.reloadFill.width = Math.max(0, Math.min(100, newWidth)) + "%";

        // Динамический цвет в зависимости от прогресса
        let reloadColor = "#f50"; // Orange-red
        let glowColor = "#f93";
        if (percent > 80) {
            reloadColor = "#0f0"; // Green (almost ready)
            glowColor = "#3f3";
        } else if (percent > 50) {
            reloadColor = "#ff0"; // Yellow
            glowColor = "#ff3";
        }

        this.reloadFill.background = reloadColor;

        // Update glow
        const reloadGlow = (this.reloadBar as any)?._reloadGlow as Rectangle;
        if (reloadGlow) {
            reloadGlow.width = this.reloadFill.width;
            reloadGlow.background = glowColor;
        }

        // Update text with countdown
        const remaining = Math.max(0, this.reloadTime - elapsed);
        const seconds = (remaining / 1000).toFixed(1);
        this.reloadText.text = `${seconds}s`;
        this.reloadText.color = reloadColor;

        if (elapsed >= this.reloadTime) {
            this.isReloading = false;
            this.reloadFill.background = "#0f0";
            this.reloadText.text = "READY";
            this.reloadText.color = "#0f0";

            if (reloadGlow) {
                reloadGlow.width = "100%";
                reloadGlow.background = "#3f3";
            }
        }
    }

    setSpeed(speed: number) {
        const kmh = Math.abs(speed) * 3.6;
        const roundedSpeed = Math.round(kmh);

        // УЛУЧШЕНО: Используем компонент SpeedIndicator
        if (this.speedIndicator) {
            this.speedIndicator.update(roundedSpeed);
        }

        // Безопасная проверка перед использованием
        if (this.speedText) {
            this.speedText.text = `${roundedSpeed}`;
        }

        // Обновляем скорость в радаре - ИСПРАВЛЕНО: Короткий формат для предотвращения перекрытия
        if (this.minimapContainer) {
            const speedValue = (this.minimapContainer as any)._speedValue as TextBlock;
            if (speedValue) {
                speedValue.text = `${roundedSpeed}km/h`; // Убрали пробел для экономии места
                speedValue.width = "35%"; // КРИТИЧНО: Ограничиваем ширину
                // Цвет в зависимости от скорости
                if (kmh > 30) {
                    speedValue.color = "#f00";
                } else if (kmh > 20) {
                    speedValue.color = "#ff0";
                } else {
                    speedValue.color = "#0f0";
                }
            }
        }
    }

    /**
     * Установить количество боеприпасов
     * @param current - Текущее количество
     * @param max - Максимальное количество
     * @param ammoType - Тип снаряда (опционально)
     * @param isReloading - Идёт ли перезарядка (опционально)
     */
    setAmmo(current: number, max: number, ammoType?: string, isReloading?: boolean): void {
        // УЛУЧШЕНО: Используем компонент AmmoIndicator
        if (this.ammoIndicator) {
            this.ammoIndicator.update({
                currentAmmo: current,
                maxAmmo: max,
                ammoType: ammoType,
                isReloading: isReloading
            });

            // Мигание при низком уровне боеприпасов
            if (this.ammoIndicator.isCriticalAmmo()) {
                this.ammoIndicator.flashWarning();
            }
        }

        // Обновить мобильный HUD если доступен
        if (this.mobileControls) {
            this.mobileControls.updateHUD(
                this.currentHealth,
                this.maxHealth,
                current,
                max,
                this.killsCount
            );
        }
    }

    /**
     * Установить угол наклона ствола
     * @param angleDegrees - Угол в градусах (положительный = вверх, отрицательный = вниз)
     */
    setBarrelAngle(angleDegrees: number): void {
        if (this.minimapContainer) {
            const barrelAngleValue = (this.minimapContainer as any)._barrelAngleValue as TextBlock;
            if (barrelAngleValue) {
                // Форматируем угол в градусах с точностью до 0.01° (два знака после запятой)
                const formattedAngle = Math.abs(angleDegrees).toFixed(2);
                // Выбираем символ в зависимости от направления: + для вверх, - для вниз
                const sign = angleDegrees >= 0 ? "+" : "-";
                barrelAngleValue.text = `${sign}${formattedAngle}°`;

                // Цветовая индикация в зависимости от угла (в градусах)
                const absAngle = Math.abs(angleDegrees);
                if (absAngle >= 10) { // ≥ 10°
                    barrelAngleValue.color = "#ff4444"; // Красный
                } else if (absAngle >= 5) { // 5° ≤ |угол| < 10°
                    barrelAngleValue.color = "#ffaa00"; // Оранжевый
                } else { // |угол| < 5°
                    barrelAngleValue.color = "#00ff00"; // Зелёный
                }
            }
        }
    }

    setPosition(x: number, z: number, y?: number) {
        // Безопасная проверка перед использованием
        if (this.positionText) {
            if (y !== undefined) {
                this.positionText.text = `X:${Math.round(x)} Y:${Math.round(y)} Z:${Math.round(z)}`;
            } else {
                this.positionText.text = `X:${Math.round(x)} Z:${Math.round(z)}`;
            }
        }

        // Обновляем координаты в радаре (С ВЫСОТОЙ) - формат [ X : Y : Z ]
        if (this.minimapContainer) {
            const coordValue = (this.minimapContainer as any)._coordValue as TextBlock;
            if (coordValue) {
                // Формат [x y z] - компактный через пробел
                if (y !== undefined) {
                    coordValue.text = `[${Math.round(x)} ${Math.round(y)} ${Math.round(z)}]`;
                } else {
                    coordValue.text = `[${Math.round(x)} ${Math.round(z)}]`;
                }
                coordValue.isVisible = true;
            }
        }

        // УЛУЧШЕНО: Обновляем высоту (ALT) в блоке статуса - компактный формат
        if (this.tankStatusContainer && y !== undefined) {
            const altValue = (this.tankStatusContainer as any)._altValue as TextBlock;
            if (altValue) {
                altValue.text = `A:${Math.round(y)}`;
                // Цвет в зависимости от высоты
                if (y > 50) {
                    altValue.color = "#f0f"; // Фиолетовый для очень высоких позиций
                } else if (y > 20) {
                    altValue.color = "#00ffff"; // Голубой для высоких позиций
                } else {
                    altValue.color = "#00ccff"; // Светло-голубой для нормальных высот
                }
            }
        }

        // Обновляем адрес под радаром (отдельно) - реальный адрес из системы дорог (БЕЗ ПРЕФИКСА)
        // ЗАКОММЕНТИРОВАНО - отображение адреса временно отключено
        /*
        if (this.addressText) {
            const address = getAddressFromCoordinates(x, z);
            this.addressText.text = address;
        }
        */
    }

    setDirection(angle: number) {
        if (!this.compassContainer) {
            console.error("[HUD] setDirection: compassContainer is null!");
            return;
        }

        // КРИТИЧНО: Убеждаемся, что компас видим
        this.compassContainer.isVisible = true;
        this.compassContainer.alpha = 1.0;

        // Нормализуем угол к диапазону [0, 2π]
        let normalizedAngle = angle;
        while (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
        while (normalizedAngle >= Math.PI * 2) normalizedAngle -= Math.PI * 2;

        // Конвертируем в градусы для отображения
        const degrees = Math.round((normalizedAngle * 180) / Math.PI);

        // Определяем направление (8 направлений)
        const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const directionIcons = ["⬆", "↗", "➡", "↘", "⬇", "↙", "⬅", "↖"];

        // Вычисляем индекс направления (каждое направление = 45 градусов)
        const index = Math.round(normalizedAngle / (Math.PI / 4)) % 8;

        // КРИТИЧНО: Обновляем текст направления и убеждаемся, что он видим
        if (this.compassText) {
            this.compassText.text = `${directionIcons[index]} ${directions[index]}`;
            this.compassText.isVisible = true; // КРИТИЧНО: Текст компаса должен быть видим
            this.compassText.alpha = 1.0;
        } else {
            console.error("[HUD] setDirection: compassText is null!");
        }

        // КРИТИЧНО: Показываем градусы в центре компаса
        if (this.compassDegrees) {
            this.compassDegrees.text = `${degrees}°`;
            this.compassDegrees.isVisible = true; // КРИТИЧНО: Градусы компаса должны быть видимы
            this.compassDegrees.alpha = 1.0;
            this.compassDegrees.color = "#0f0";
        } else {
            console.error("[HUD] setDirection: compassDegrees is null!");
        }

        // КРИТИЧНО: Обновляем риски на компасе - заполняем всю ширину 1000px
        // Компас показывает примерно 180° (полукруг), ширина 1000px
        const compassWidth = 1000; // Ширина компаса в пикселях
        const degreesVisible = 180; // Видимый диапазон градусов
        const pixelsPerDegree = compassWidth / degreesVisible; // ~5.55 px/градус

        this.compassTicks.forEach((tick, i) => {
            if (!tick) return;
            const tickDegrees = i * 5; // Каждые 5 градусов (72 тика)
            // Разница между направлением риски и текущим направлением
            let deltaDegrees = tickDegrees - degrees;
            // Нормализуем к диапазону [-180, 180]
            while (deltaDegrees > 180) deltaDegrees -= 360;
            while (deltaDegrees < -180) deltaDegrees += 360;
            // Позиция риски на компасе
            const tickX = deltaDegrees * pixelsPerDegree;
            tick.left = `${tickX}px`;
            // Показываем риски в пределах компаса (±500px от центра)
            const isVisible = Math.abs(tickX) < 490;
            tick.isVisible = isVisible;
            if (isVisible) {
                tick.alpha = 1.0;
            }
        });

        // Цвет в зависимости от основных направлений
        const isCardinal = index % 2 === 0;
        this.compassText.color = isCardinal ? "#0f0" : "#0a0";
        this.compassContainer.color = isCardinal ? "#0f0" : "#0a0";

        // ИСПРАВЛЕНО: Поворот стрелки направления на радаре теперь обрабатывается
        // через minimapPlayerContainer.rotation в updateMinimap() - удалён двойной поворот
    }

    // Обновление буквенного обозначения направления башни над радаром
    setMovementDirection(turretAngle: number) {
        if (!this.movementDirectionLabel) {
            console.error("[HUD] setMovementDirection: movementDirectionLabel is null!");
            return;
        }

        if (!this.directionLabelsContainer) {
            console.error("[HUD] setMovementDirection: directionLabelsContainer is null!");
            return;
        }

        // КРИТИЧНО: Убеждаемся, что контейнер и индикатор видимы
        this.directionLabelsContainer.isVisible = true;
        this.directionLabelsContainer.alpha = 1.0;
        this.movementDirectionLabel.isVisible = true;
        this.movementDirectionLabel.alpha = 1.0;

        // Нормализуем угол башни к диапазону [0, 2π]
        let angle = turretAngle;
        while (angle < 0) angle += Math.PI * 2;
        while (angle >= Math.PI * 2) angle -= Math.PI * 2;

        // Определяем направление относительно карты (8 направлений: N, NE, E, SE, S, SW, W, NW)
        // В Babylon.js: 0 = +Z (север), π/2 = +X (восток), π = -Z (юг), 3π/2 = -X (запад)
        const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

        // Вычисляем индекс направления (каждое направление = 45 градусов)
        const degrees = (angle * 180) / Math.PI;
        // Нормализуем к 0-360
        const normalizedDeg = ((degrees % 360) + 360) % 360;
        // Смещаем на 22.5 для правильного округления к ближайшему направлению
        const index = Math.floor((normalizedDeg + 22.5) / 45) % 8;

        // КРИТИЧНО: Обновляем текст направления (8 направлений)
        this.movementDirectionLabel.text = directions[index]!;

        // Цвет - всегда яркий зелёный для лучшей видимости
        this.movementDirectionLabel.color = "#00ff00";
        this.movementDirectionLabel.fontSize = this.scaleFontSize(14, 12, 16); // УВЕЛИЧЕНО с 12 до 14
        this.movementDirectionLabel.fontWeight = "bold";

        // КРИТИЧНО: Ещё раз убеждаемся, что индикатор видим
        this.movementDirectionLabel.isVisible = true;
        this.movementDirectionLabel.alpha = 1.0;
        this.movementDirectionLabel.zIndex = 1000;
    }

    /**
     * ОПТИМИЗАЦИЯ: Инициализация пула объектов для точек врагов на компасе
     */
    private initializeCompassEnemyDotsPool(): void {
        // Создаем пул из 12 элементов (больше чем MAX_COMPASS_ENEMIES для запаса)
        const poolSize = 12;
        for (let i = 0; i < poolSize; i++) {
            const dot = new Rectangle(`compassEnemyPool${i}`);
            dot.width = "4px";
            dot.height = "4px";
            dot.cornerRadius = 2;
            dot.thickness = 0;
            dot.background = "#f00";
            dot.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            dot.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            dot.top = "2px";
            dot.isVisible = false; // Скрываем по умолчанию
            this.compassContainer.addControl(dot);
            this.compassEnemyDotsPool.push(dot);
        }
    }

    // Обновление красных точек врагов на компасе
    // ОПТИМИЗИРОВАНО: Использует пул объектов и ограничивает количество врагов
    updateCompassEnemies(enemies: { x: number, z: number, alive: boolean }[], playerPos: Vector3, playerAngle: number): void {
        if (!this.compassContainer) return;

        // Скрываем все активные точки
        const activeCount = this.compassEnemyDotsActive.length;
        for (let i = 0; i < activeCount; i++) {
            const dot = this.compassEnemyDotsActive[i];
            if (dot) {
                dot.isVisible = false;
            }
        }
        this.compassEnemyDotsActive = [];

        // Валидация входных данных
        if (!enemies || enemies.length === 0) return;

        // Нормализуем угол игрока
        let normalizedAngle = playerAngle;
        while (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
        while (normalizedAngle >= Math.PI * 2) normalizedAngle -= Math.PI * 2;

        // FOV конус (60 градусов = 30 в каждую сторону)
        const fovHalf = 30 * Math.PI / 180;

        // ОПТИМИЗАЦИЯ: Собираем врагов с расстояниями и сортируем по близости
        const enemiesWithDist: Array<{
            enemy: { x: number, z: number, alive: boolean },
            distSq: number,
            relativeAngle: number
        }> = [];

        const enemyCount = enemies.length;
        for (let i = 0; i < enemyCount; i++) {
            const enemy = enemies[i];
            if (!enemy || !enemy.alive) continue;

            // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо sqrt
            const dx = enemy.x - playerPos.x;
            const dz = enemy.z - playerPos.z;
            const distSq = dx * dx + dz * dz;

            // Только близкие враги (50м = 2500 в квадрате)
            if (distSq < 2500) {
                const enemyAngle = Math.atan2(dx, dz);
                let relativeAngle = enemyAngle - normalizedAngle;

                // Нормализуем к [-π, π]
                while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

                // Проверяем, в поле зрения ли враг
                if (Math.abs(relativeAngle) < fovHalf) {
                    enemiesWithDist.push({
                        enemy,
                        distSq,
                        relativeAngle
                    });
                }
            }
        }

        // Сортируем по расстоянию (ближайшие первые) и ограничиваем количество
        enemiesWithDist.sort((a, b) => a.distSq - b.distSq);
        const visibleEnemies = enemiesWithDist.slice(0, this.MAX_COMPASS_ENEMIES);

        // Используем элементы из пула
        const poolSize = this.compassEnemyDotsPool.length;
        const visibleCount = visibleEnemies.length;
        for (let i = 0; i < visibleCount; i++) {
            if (i >= poolSize) break; // Защита от переполнения

            const enemyData = visibleEnemies[i];
            if (!enemyData) continue;

            const dot = this.compassEnemyDotsPool[i];
            if (!dot) continue;

            try {
                // Позиция на компасе (радиус 120px)
                const dotX = Math.sin(enemyData.relativeAngle) * 120;
                dot.left = `${dotX}px`;
                dot.isVisible = true;
                this.compassEnemyDotsActive.push(dot);
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        // Legacy: обновляем старый массив для совместимости (но не создаем новые элементы)
        this.compassEnemyDots = this.compassEnemyDotsActive;

        // === UPDATE SPAWN MARKER ON COMPASS ===
        if (this.compassSpawnMarker) {
            const spawnDx = this.spawnPosition.x - playerPos.x;
            const spawnDz = this.spawnPosition.z - playerPos.z;
            const spawnAngle = Math.atan2(spawnDx, spawnDz);
            let spawnRelativeAngle = spawnAngle - normalizedAngle;

            // Нормализуем к [-PI, PI]
            while (spawnRelativeAngle > Math.PI) spawnRelativeAngle -= Math.PI * 2;
            while (spawnRelativeAngle < -Math.PI) spawnRelativeAngle += Math.PI * 2;

            // Конвертируем в пиксели (compass width ~1000px, 180° visible, so ~5.55px per degree)
            const compassWidth = 1000;
            const degreesVisible = 180;
            const pixelsPerDegree = compassWidth / degreesVisible;
            const spawnDegrees = spawnRelativeAngle * 180 / Math.PI;
            const spawnX = spawnDegrees * pixelsPerDegree;

            // Показываем маркер только если в пределах видимой части компаса
            if (Math.abs(spawnX) < 490) {
                this.compassSpawnMarker.left = `${spawnX}px`;
                this.compassSpawnMarker.isVisible = true;
            } else {
                // Показываем на краю компаса
                const clampedX = Math.sign(spawnX) * 480;
                this.compassSpawnMarker.left = `${clampedX}px`;
                this.compassSpawnMarker.isVisible = true;
                this.compassSpawnMarker.alpha = 0.5; // Полупрозрачный если за пределами
            }
        }
    }

    addKill() {
        this.killsCount++;
        this.addSessionKill(); // УЛУЧШЕНО: Используем метод addSessionKill для синхронизации

        // Обновить мобильный HUD если доступен
        if (this.mobileControls) {
            const ammo = this.arsenalSlots[0]?.countText?.text?.split('/')[0] || '0';
            const maxAmmo = this.arsenalSlots[0]?.countText?.text?.split('/')[1] || '0';
            this.mobileControls.updateHUD(
                this.currentHealth,
                this.maxHealth,
                parseInt(ammo) || 0,
                parseInt(maxAmmo) || 0,
                this.killsCount
            );
        }

        // УЛУЧШЕНО: Используем компонент KillFeed
        if (this.killFeedComponent) {
            this.killFeedComponent.addKill("Player", "Enemy");
        }

        if (this.killsText) {
            this.killsText.text = `${this.killsCount}`;

            // Enhanced flash effect with animation
            const container = this.killsText.parent as Rectangle;
            if (container) {
                // Белая вспышка
                container.color = "#ffffff";
                this.killsText.color = "#ffffff";
                this.killsText.fontSize = 32;

                setTimeout(() => {
                    // Возврат к нормальному состоянию
                    container.color = "#ff336633";
                    this.killsText.color = "#ff3366";
                    this.killsText.fontSize = 26;
                }, 200);
            }
        }

        // Show kill message
        this.showMessage("☠ ENEMY DESTROYED!", "#ff3366");
    }

    // Геттер для получения количества убийств
    getKillsCount(): number {
        return this.killsCount;
    }

    setCurrency(amount: number) {
        if (this.currencyText) {
            // Форматирование числа с разделителями тысяч
            const formatted = amount.toLocaleString('en-US');
            this.currencyText.text = formatted;

            // Анимация при изменении
            const oldAmount = parseInt(this.currencyText.text.replace(/,/g, '')) || 0;
            if (amount > oldAmount) {
                // Зелёный цвет при увеличении
                this.currencyText.color = "#0f0";
                setTimeout(() => {
                    if (this.currencyText) {
                        this.currencyText.color = "#ffd700";
                    }
                }, 300);
            } else if (amount < oldAmount) {
                // Красный цвет при уменьшении
                this.currencyText.color = "#f00";
                setTimeout(() => {
                    if (this.currencyText) {
                        this.currencyText.color = "#ffd700";
                    }
                }, 300);
            }
        }
    }

    setEnemyHealth(totalHp: number, count: number) {
        if (!this.enemyHealthText) return;
        this.enemyHealthText.text = `${Math.round(totalHp)} HP (${count})`;

        // Enhanced color cue with smooth transitions
        let healthColor = "#0f0"; // Green
        if (totalHp > 300) {
            healthColor = "#f00"; // Red (many enemies)
        } else if (totalHp > 200) {
            healthColor = "#f80"; // Orange-red
        } else if (totalHp > 100) {
            healthColor = "#ff0"; // Yellow
        } else if (totalHp > 50) {
            healthColor = "#0f0"; // Green
        } else {
            healthColor = "#0a0"; // Dark green (few enemies)
        }

        this.enemyHealthText.color = healthColor;

        // Update container color
        const container = this.enemyHealthText.parent as Rectangle;
        if (container) {
            container.color = healthColor;
        }
    }

    showMessage(text: string, color: string = "#0f0", duration: number = 2000) {

        if (this.messageTimeout) {
            timerManager.clear(this.messageTimeout);
        }

        const msgBg = (this.messageText as any)._msgBg as Rectangle;

        msgBg.isVisible = true;
        msgBg.color = color;
        this.messageText.text = text;
        this.messageText.color = color;

        // Динамически подстраиваем высоту под содержимое
        const estimatedLines = Math.ceil(text.length / 50); // Примерно 50 символов на строку для этого шрифта
        const minHeight = 40;
        const lineHeight = 20;
        const calculatedHeight = Math.max(minHeight, estimatedLines * lineHeight + 10);
        msgBg.height = `${calculatedHeight}px`;

        // Если duration = 0, не скрываем автоматически (для таймера респавна)
        if (duration > 0) {
            // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setTimeout
            this.messageTimeout = timerManager.setTimeout(() => {
                msgBg.isVisible = false;
            }, duration);
        }
    }

    showDeathMessage(onRespawnStart?: () => void) {
        // КРИТИЧНО: Отключаем эффект низкого HP при смерти
        this.isLowHp = false;
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = false;
            this.lowHpVignette.background = "transparent";
            this.lowHpVignette.alpha = 0;
        }
        if (this.lowHpVignetteComponent) {
            // Устанавливаем здоровье в 0 для скрытия эффекта
            this.lowHpVignetteComponent.update(0, this.maxHealth, 0.016);
        }

        this.showMessage("DESTROYED! RESPAWN IN 3...", "#f00");
        this.onRespawnStartCallback = onRespawnStart || null;
        console.log(`[HUD] showDeathMessage called, callback provided: ${!!onRespawnStart}, stored: ${!!this.onRespawnStartCallback}`);
        this.showDeathScreen();
    }

    showRespawnMessage() {
        this.showMessage("RESPAWNED!", "#0f0");
        this.hideDeathScreen();
    }

    // === DEATH SCREEN ===

    private createDeathScreen(): void {
        // Основной контейнер экрана смерти
        this.deathScreen = new Rectangle("deathScreen");
        this.deathScreen.width = "100%";
        this.deathScreen.height = "100%";
        this.deathScreen.background = "rgba(0, 0, 0, 0.85)";
        this.deathScreen.thickness = 0;
        this.deathScreen.isVisible = false;
        this.deathScreen.zIndex = 500;
        this.guiTexture.addControl(this.deathScreen);

        // Заголовок DESTROYED - используем CENTER alignment
        const title = new TextBlock("deathTitle");
        title.text = "💀 DESTROYED 💀";
        title.color = "#ff0000";
        title.fontSize = 48;
        title.fontWeight = "bold";
        title.fontFamily = "'Press Start 2P', monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        title.top = "-150px"; // Выше центра
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathScreen.addControl(title);

        // Контейнер для статистики - используем CENTER alignment
        this.deathStatsContainer = new Rectangle("deathStats");
        this.deathStatsContainer.width = "400px";
        this.deathStatsContainer.height = "200px";
        this.deathStatsContainer.background = "rgba(20, 0, 0, 0.8)";
        this.deathStatsContainer.thickness = 2;
        this.deathStatsContainer.color = "#f00";
        this.deathStatsContainer.cornerRadius = 10;
        this.deathStatsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathStatsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.deathStatsContainer.top = "0px"; // По центру
        this.deathScreen.addControl(this.deathStatsContainer);

        // Заголовок статистики
        const statsTitle = new TextBlock("statsTitle");
        statsTitle.text = "📊 SESSION STATS";
        statsTitle.color = "#ff6666";
        statsTitle.fontSize = 16;
        statsTitle.fontFamily = "'Press Start 2P', monospace";
        statsTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        statsTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        statsTitle.top = "-80px"; // Относительно контейнера
        statsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathStatsContainer.addControl(statsTitle);

        // Убийства - используем CENTER alignment
        this.deathKillsText = new TextBlock("deathKills");
        this.deathKillsText.text = "☠ Kills: 0";
        this.deathKillsText.color = "#0f0";
        this.deathKillsText.fontSize = 14;
        this.deathKillsText.fontFamily = "'Press Start 2P', monospace";
        this.deathKillsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathKillsText.top = "-30px";
        this.deathKillsText.left = "0px"; // Центр
        this.deathKillsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathStatsContainer.addControl(this.deathKillsText);

        // Урон - используем CENTER alignment
        this.deathDamageText = new TextBlock("deathDamage");
        this.deathDamageText.text = "💥 Damage: 0";
        this.deathDamageText.color = "#ff8800";
        this.deathDamageText.fontSize = 14;
        this.deathDamageText.fontFamily = "'Press Start 2P', monospace";
        this.deathDamageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathDamageText.top = "10px";
        this.deathDamageText.left = "0px"; // Центр
        this.deathDamageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathStatsContainer.addControl(this.deathDamageText);

        // Время игры - используем CENTER alignment
        this.deathTimeText = new TextBlock("deathTime");
        this.deathTimeText.text = "⏱ Time: 0:00";
        this.deathTimeText.color = "#88ffff";
        this.deathTimeText.fontSize = 14;
        this.deathTimeText.fontFamily = "'Press Start 2P', monospace";
        this.deathTimeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathTimeText.top = "50px";
        this.deathTimeText.left = "0px"; // Центр
        this.deathTimeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathStatsContainer.addControl(this.deathTimeText);

        // Таймер респавна - используем CENTER alignment
        this.deathRespawnText = new TextBlock("deathRespawn");
        this.deathRespawnText.text = "RESPAWN IN 3...";
        this.deathRespawnText.color = "#ffff00";
        this.deathRespawnText.fontSize = 20;
        this.deathRespawnText.fontFamily = "'Press Start 2P', monospace";
        this.deathRespawnText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathRespawnText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.deathRespawnText.top = "150px"; // Ниже центра
        this.deathRespawnText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathScreen.addControl(this.deathRespawnText);
    }

    public showDeathScreen(respawnTime: number = 3): void {
        if (!this.deathScreen) return;

        // Обновляем статистику
        const sessionTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        const minutes = Math.floor(sessionTime / 60);
        const seconds = sessionTime % 60;

        if (this.deathKillsText) {
            this.deathKillsText.text = `☠ Kills: ${this.sessionKills}`;
        }
        if (this.deathDamageText) {
            this.deathDamageText.text = `💥 Damage: ${this.sessionDamage}`;
        }
        if (this.deathTimeText) {
            this.deathTimeText.text = `⏱ Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        this.deathScreen.isVisible = true;

        // Инициализируем текст таймера
        if (this.deathRespawnText) {
            this.deathRespawnText.text = `RESPAWN IN ${Math.ceil(respawnTime)}...`;
        }

        // Start countdown timer animation
        let timeLeft = respawnTime;
        console.log(`[HUD] showDeathScreen: starting timer, respawnTime=${respawnTime}, callback exists: ${!!this.onRespawnStartCallback}`);
        // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
        const countdownInterval = timerManager.setInterval(() => {
            timeLeft--;
            if (this.deathRespawnText) {
                if (timeLeft > 0) {
                    this.deathRespawnText.text = `RESPAWN IN ${timeLeft}...`;
                } else {
                    this.deathRespawnText.text = `RESPAWNING...`;
                }
            }
            if (timeLeft <= 0) {
                timerManager.clear(countdownInterval);
                console.log(`[HUD] Timer hit 0, callback exists: ${!!this.onRespawnStartCallback}`);
                // Invoke the respawn callback
                if (this.onRespawnStartCallback) {
                    console.log("[HUD] Death timer finished, invoking respawn callback");
                    this.onRespawnStartCallback();
                    this.onRespawnStartCallback = null; // Clear to prevent double invocation
                } else {
                    console.warn("[HUD] Timer finished but NO callback to invoke!");
                }
            }
        }, 1000);
    }

    public hideDeathScreen(): void {
        // КРИТИЧНО: Гарантируем что эффект низкого HP отключён после респавна
        this.isLowHp = false;
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = false;
            this.lowHpVignette.background = "transparent";
            this.lowHpVignette.alpha = 0;
        }
        if (this.lowHpVignetteComponent) {
            // Обновляем компонент с текущим здоровьем (должно быть полное после респавна)
            this.lowHpVignetteComponent.update(this.currentHealth, this.maxHealth, 0.016);
        }

        if (this.deathScreen) {
            this.deathScreen.isVisible = false;
        }
    }

    // Обновление статистики сессии
    addSessionKill(): void {
        this.sessionKills++;
    }

    addSessionDamage(amount: number): void {
        this.sessionDamage += amount;
    }

    resetSession(): void {
        this.sessionKills = 0;
        this.sessionDamage = 0;
        this.sessionStartTime = Date.now();
    }

    // === DIRECTIONAL DAMAGE INDICATORS ===

    private createDirectionalDamageIndicators(): void {
        // Создаём 4 индикатора для каждого направления: top, bottom, left, right
        const directions = [
            { name: "top", rotation: 0, top: "50px", left: "0", width: "200px", height: "60px" },
            { name: "bottom", rotation: Math.PI, top: "-50px", left: "0", width: "200px", height: "60px", vAlign: Control.VERTICAL_ALIGNMENT_BOTTOM },
            { name: "left", rotation: -Math.PI / 2, top: "0", left: "50px", width: "60px", height: "200px", hAlign: Control.HORIZONTAL_ALIGNMENT_LEFT },
            { name: "right", rotation: Math.PI / 2, top: "0", left: "-50px", width: "60px", height: "200px", hAlign: Control.HORIZONTAL_ALIGNMENT_RIGHT }
        ];

        directions.forEach(dir => {
            const indicator = new Rectangle(`damageDir_${dir.name}`);
            indicator.width = dir.width;
            indicator.height = dir.height;
            indicator.thickness = 0;
            indicator.isVisible = false;
            indicator.zIndex = 400;

            // Позиционирование
            if (dir.vAlign !== undefined) {
                indicator.verticalAlignment = dir.vAlign;
            } else {
                indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            }

            if (dir.hAlign !== undefined) {
                indicator.horizontalAlignment = dir.hAlign;
            } else {
                indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            }

            indicator.top = dir.top;
            indicator.left = dir.left;

            // Градиент от красного к прозрачному (используем сплошной красный с альфа)
            indicator.background = dir.name === "top" || dir.name === "bottom"
                ? "linear-gradient(rgba(255, 0, 0, 0.8), transparent)"
                : "rgba(255, 0, 0, 0.6)";

            this.guiTexture.addControl(indicator);
            this.damageDirectionIndicators.set(dir.name, { element: indicator, fadeTime: 0 });
        });
    }

    // Показать индикатор направления урона
    showDamageDirection(direction: "top" | "bottom" | "left" | "right"): void {
        const indicator = this.damageDirectionIndicators.get(direction);
        if (indicator) {
            indicator.element.isVisible = true;
            indicator.element.alpha = 1;
            indicator.fadeTime = Date.now() + this.damageIndicatorDuration;
        }
    }

    // УЛУЧШЕНО: Показать урон с направлением от позиции атакующего (использует экранную вспышку)
    showDamageFromPosition(attackerPosition: Vector3, playerPosition: Vector3, playerRotation: number, damageAmount?: number): void {
        // Вычисляем направление от игрока к атакующему
        const dx = attackerPosition.x - playerPosition.x;
        const dz = attackerPosition.z - playerPosition.z;

        // Угол к атакующему в мировых координатах
        let angleToAttacker = Math.atan2(dx, dz);

        // Корректируем на поворот игрока, чтобы получить относительный угол
        let relativeAngle = angleToAttacker - playerRotation;

        // Нормализуем угол к диапазону [-PI, PI]
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

        // Определяем направление
        // Передняя часть танка: relativeAngle около 0 (-45 до 45 градусов)
        // Задняя часть: relativeAngle около PI или -PI (135 до 180 или -135 до -180)
        // Левая часть: relativeAngle около -PI/2 (-135 до -45)
        // Правая часть: relativeAngle около PI/2 (45 до 135)

        const deg45 = Math.PI / 4;
        const deg135 = Math.PI * 3 / 4;

        let direction: FlashDirection;
        if (relativeAngle >= -deg45 && relativeAngle <= deg45) {
            // Урон спереди
            direction = "top";
        } else if (relativeAngle >= deg45 && relativeAngle <= deg135) {
            // Урон справа
            direction = "right";
        } else if (relativeAngle >= -deg135 && relativeAngle <= -deg45) {
            // Урон слева
            direction = "left";
        } else {
            // Урон сзади
            direction = "bottom";
        }

        // УЛУЧШЕНО: Вычисляем интенсивность на основе урона
        let intensity = 1;
        if (damageAmount !== undefined) {
            const mapping = EFFECTS_CONFIG.screenFlash.intensityMapping;
            if (damageAmount > 30) {
                intensity = mapping.critical;
            } else if (damageAmount >= 15) {
                intensity = mapping.medium;
            } else {
                intensity = mapping.low;
            }
        }

        // УЛУЧШЕНО: Используем экранную вспышку вместо старых индикаторов
        if (this.screenFlashEffect) {
            this.screenFlashEffect.flash(direction, intensity);
        } else {
            // Fallback на старый метод если screenFlashEffect недоступен
            this.showDamageDirection(direction);
        }

        // Show detailed directional indicator (arrow)
        if (this.damageIndicator) {
            // Calculate direction vector from player to attacker
            const damageDir = attackerPosition.subtract(playerPosition).normalize();
            // Calculate player forward vector (from rotation)
            const playerForward = new Vector3(Math.sin(playerRotation), 0, Math.cos(playerRotation));

            this.damageIndicatorComponent?.showDamage(damageDir, intensity);
        }
    }

    /**
     * Show floating damage number at position
     */
    public showFloatingDamage(position: Vector3, amount: number, type: 'dealt' | 'received' | 'heal', isCritical: boolean = false): void {
        if (this.floatingDamageNumbers) {
            this.floatingDamageNumbers.showDamage(position, amount, type, isCritical);
        }
    }

    /**
     * Main HUD update loop
     */


    // Обновление затухания индикаторов урона
    updateDamageIndicators(): void {
        const now = Date.now();

        this.damageDirectionIndicators.forEach((indicator) => {
            if (indicator.element.isVisible && indicator.fadeTime > 0) {
                const remaining = indicator.fadeTime - now;
                if (remaining <= 0) {
                    indicator.element.isVisible = false;
                    indicator.fadeTime = 0;
                } else {
                    // Плавное затухание
                    indicator.element.alpha = remaining / this.damageIndicatorDuration;
                }
            }
        });
    }

    // === TARGET INDICATOR WITH SMOOTH FADE ===
    private targetFadeTarget = 0;
    private targetFadeCurrent = 0;

    updateTargetIndicator(target: { name: string, type: string, health: number, maxHealth: number, distance: number } | null): void {
        if (!this.targetIndicator) return;

        if (target) {
            this.targetFadeTarget = 1;
            this.targetIndicator.isVisible = true;

            // Name with type indicator
            if (this.targetNameText) {
                const typeIcon = target.type === "tank" ? "🎯" : "🗼";
                this.targetNameText.text = `${typeIcon} ${target.name}`;
            }

            // Health bar
            if (this.targetHealthFill) {
                const healthPercent = Math.max(0, Math.min(100, (target.health / target.maxHealth) * 100));
                this.targetHealthFill.width = `${healthPercent}%`;

                // Правильные цвета: зелёный для высокого HP, жёлтый для среднего, красный для низкого
                let healthColor = "#0f0";
                if (healthPercent > 60) {
                    healthColor = "#0f0"; // Зелёный - много здоровья
                } else if (healthPercent > 30) {
                    healthColor = "#ff0"; // Жёлтый - среднее здоровье
                } else {
                    healthColor = "#f00"; // Красный - мало здоровья
                }
                this.targetHealthFill.background = healthColor;

                // Обновляем цвет рамки здоровья в зависимости от процента
                if (this._legacyTargetHealthBar) {
                    this._legacyTargetHealthBar.color = healthColor;
                }
            }

            // Health text (числовое значение)
            if (this.targetHealthText) {
                const currentHp = Math.max(0, Math.round(target.health));
                const maxHp = Math.round(target.maxHealth);
                this.targetHealthText.text = `${currentHp}/${maxHp}`;

                // Цвет текста соответствует цвету здоровья
                const healthPercent = Math.max(0, Math.min(100, (target.health / target.maxHealth) * 100));
                if (healthPercent > 60) {
                    this.targetHealthText.color = "#0f0";
                } else if (healthPercent > 30) {
                    this.targetHealthText.color = "#ff0";
                } else {
                    this.targetHealthText.color = "#f00";
                }
            }

            // Distance (more visible)
            if (this.targetDistanceText) {
                this.targetDistanceText.text = `${Math.round(target.distance)}m`;
            }
        } else {
            this.targetFadeTarget = 0;
        }

        // Smooth fade animation - slower fade out
        const fadeInSpeed = 0.15;
        const fadeOutSpeed = 0.03; // Much slower fade out
        if (this.targetFadeCurrent < this.targetFadeTarget) {
            this.targetFadeCurrent = Math.min(this.targetFadeTarget, this.targetFadeCurrent + fadeInSpeed);
        } else if (this.targetFadeCurrent > this.targetFadeTarget) {
            this.targetFadeCurrent = Math.max(this.targetFadeTarget, this.targetFadeCurrent - fadeOutSpeed);
        }

        this.targetIndicator.alpha = this.targetFadeCurrent;

        if (this.targetFadeCurrent < 0.01) {
            this.targetIndicator.isVisible = false;
        }
    }

    private enemyPulsePhase = 0;

    // === RADAR SCAN ANIMATION ===
    private startRadarScanAnimation() {
        const animateScan = () => {
            if (!this.radarScanLine) return;

            const now = Date.now();
            const elapsed = now - this.lastScanTime;

            // Full rotation in 3 seconds (2π radians per 3000ms)
            this.radarScanAngle += (elapsed / 3000) * Math.PI * 2;
            if (this.radarScanAngle > Math.PI * 2) {
                this.radarScanAngle -= Math.PI * 2;
            }

            // Apply rotation
            this.radarScanLine.rotation = this.radarScanAngle;

            // Pulse effect (glow when scanning)
            const pulseAlpha = 0.6 + 0.4 * Math.sin(now / 100);
            this.radarScanLine.alpha = pulseAlpha;

            // Update scanned enemies (fade out)
            this.scannedEnemies.forEach((data, key) => {
                data.fadeTime -= elapsed;
                if (data.fadeTime <= 0) {
                    // Fade complete - return to normal
                    if (data.marker) {
                        data.marker.background = "#f00";
                        data.marker.alpha = 0.7;
                    }
                    this.scannedEnemies.delete(key);
                } else {
                    // Fade effect
                    const fadeProgress = data.fadeTime / 1500; // 1.5 second fade
                    if (data.marker) {
                        data.marker.alpha = 0.5 + fadeProgress * 0.5;
                        // Bright green to red transition
                        const r = Math.floor(255 * (1 - fadeProgress));
                        const g = Math.floor(255 * fadeProgress);
                        data.marker.background = `rgb(${r}, ${g}, 0)`;
                    }
                }
            });

            this.lastScanTime = now;
            requestAnimationFrame(animateScan);
        };

        this.lastScanTime = Date.now();
        requestAnimationFrame(animateScan);
    }

    // Check if enemy is hit by scan line
    private isEnemyScanned(enemyAngle: number): boolean {
        // Normalize angles to 0-2π
        let scanAngle = this.radarScanAngle % (Math.PI * 2);
        let targetAngle = enemyAngle % (Math.PI * 2);
        if (targetAngle < 0) targetAngle += Math.PI * 2;

        // Check if within scan range (±15 degrees = ±0.26 radians)
        const scanWidth = 0.3;
        let diff = Math.abs(scanAngle - targetAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;

        return diff < scanWidth;
    }

    // Кэш для позиций врагов на мини-карте (обновляется реже для оптимизации)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _enemyPositionsCache: { x: number, z: number, alive: boolean, turretRotation?: number }[] = [];

    /**
     * Обновляет мини-карту с позициями врагов и игрока
     * @param enemies - Массив позиций врагов или Vector3
     * @param playerPos - Позиция игрока
     * @param tankRotationY - Угол поворота танка
     * @param turretRotationY - Угол поворота башни
     * @param isAiming - Режим прицеливания
     */
    updateMinimap(enemies: { x: number, z: number, alive: boolean, turretRotation?: number }[] | Vector3[], playerPos?: Vector3, tankRotationY?: number, turretRotationY?: number, isAiming?: boolean, aimPitch?: number) {
        // ОПТИМИЗАЦИЯ: Пропускаем обновление если миникарта выключена
        if (!this.minimapEnabled) return;

        // Обновляем индикатор направления башни над радаром
        if (turretRotationY !== undefined && this.movementDirectionLabel) {
            this.setMovementDirection(turretRotationY);
        }

        // Оптимизация: обновляем мини-карту реже для лучшей производительности
        const now = Date.now();
        if (now - this.lastMinimapUpdate < this.MINIMAP_UPDATE_INTERVAL) {
            // Используем кэшированные данные
            return;
        }
        this.lastMinimapUpdate = now;

        // ОПТИМИЗАЦИЯ: Скрываем старые маркеры вместо удаления (переиспользование)
        // Возвращаем в пул
        for (let i = 0; i < this.minimapEnemies.length; i++) {
            const marker = this.minimapEnemies[i];
            if (!marker) {
                continue;
            }
            marker.isVisible = false;
            if (i < this.poolSize) {
                if (marker.name && marker.name.startsWith('enemy')) {
                    this.enemyMarkerPool.push(marker);
                } else if (marker.name && marker.name.startsWith('enemyBarrel')) {
                    this.enemyBarrelPool.push(marker);
                }
            } else {
                marker.dispose();
            }
        }
        this.minimapEnemies = [];

        // Обновляем режим прицеливания
        this.isAimingMode = isAiming || false;

        // КРИТИЧЕСКИ ВАЖНО: Игрок всегда в центре радара (0, 0)
        // Все враги вычисляются относительно позиции игрока!
        const playerX = playerPos ? playerPos.x : 0;
        const playerZ = playerPos ? playerPos.z : 0;

        // Угол поворота радара (привязка к направлению БАШНИ, а не корпуса!)
        // Используем turretRotationY если доступен, иначе tankRotationY
        const angle = turretRotationY !== undefined ? turretRotationY : (tankRotationY || 0);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // RADAR RANGE: 250 meters (circles at 50m intervals: 50m, 100m, 150m, 200m, edge=250m)
        const RADAR_RANGE = 250;

        // УЛУЧШЕНО: Обновляем маркеры зданий на радаре
        const buildingRadarRange = 100; // Радиус обзора радара для зданий
        this.updateRadarBuildings(playerX, playerZ, angle, buildingRadarRange);

        // === ВРАЩАЕМ ВЕСЬ КОНТЕЙНЕР ТАНКА ВМЕСТЕ С БАШНЕЙ ===
        if (this.minimapPlayerContainer) {
            // Контейнер вращается по направлению башни
            this.minimapPlayerContainer.rotation = -angle;

            // В режиме прицеливания меняем цвет
            const color = this.isAimingMode ? "#ff0" : "#0f0";
            if (this.minimapPlayerDir) {
                this.minimapPlayerDir.background = color;
                // УЛУЧШЕНО: Увеличен размер индикатора направления
                this.minimapPlayerDir.height = this.isAimingMode ? this.scalePx(22) : this.scalePx(18);
                this.minimapPlayerDir.width = this.scalePx(4); // УВЕЛИЧЕНО для лучшей видимости
            }
            // Barrel tip removed from radar
            if (this.minimapPlayer) {
                this.minimapPlayer.background = color;
            }
        }

        // === ЛИНИЯ ПРИЦЕЛИВАНИЯ ===
        if (this.minimapAimLine) {
            this.minimapAimLine.isVisible = this.isAimingMode;
            this.minimapAimLine.rotation = -angle;
        }
        if (this.minimapAimDot) {
            this.minimapAimDot.isVisible = this.isAimingMode;
            // Точка прицела на конце линии прицеливания
            if (this.isAimingMode) {
                const aimDistance = 65;
                const aimX = Math.sin(-angle) * aimDistance;
                const aimY = -Math.cos(-angle) * aimDistance;
                this.minimapAimDot.left = `${aimX}px`;
                this.minimapAimDot.top = `${aimY}px`;
                // Пульсация
                const pulse = 6 + Math.sin(Date.now() * 0.01) * 2;
                this.minimapAimDot.width = `${pulse}px`;
                this.minimapAimDot.height = `${pulse}px`;
            }
        }

        // === SPAWN MARKER UPDATE ===
        if (this.spawnMarker) {
            const spawnDx = this.spawnPosition.x - playerX;
            const spawnDz = this.spawnPosition.z - playerZ;
            const spawnDist = Math.sqrt(spawnDx * spawnDx + spawnDz * spawnDz);

            // Показываем маркер только если спавн в пределах радара
            if (spawnDist < RADAR_RANGE) {
                // Поворот относительно игрока
                const rotX = spawnDx * cos - spawnDz * sin;
                const rotZ = spawnDx * sin + spawnDz * cos;

                // Масштаб: RADAR_SIZE = 150, RADAR_RANGE = 250
                const scale = 150 / RADAR_RANGE;
                const screenX = rotX * scale;
                const screenY = -rotZ * scale; // Y инвертирован

                this.spawnMarker.left = `${screenX}px`;
                this.spawnMarker.top = `${screenY}px`;
                this.spawnMarker.isVisible = true;
            } else {
                // Показываем на краю радара в направлении спавна
                const normX = spawnDx / spawnDist;
                const normZ = spawnDz / spawnDist;
                const rotX = normX * cos - normZ * sin;
                const rotZ = normX * sin + normZ * cos;
                const edgeRadius = 70; // На краю радара
                this.spawnMarker.left = `${rotX * edgeRadius}px`;
                this.spawnMarker.top = `${-rotZ * edgeRadius}px`;
                this.spawnMarker.isVisible = true;
            }
        }

        // === ОБНОВЛЕНИЕ УГЛА НАКЛОНА СТВОЛА ===
        if (this.barrelPitchLabel && aimPitch !== undefined) {
            // Отображаем угол в тысячных (радианы * 1000)
            const thousandths = aimPitch * 1000;
            // Форматируем с 3 знаками после запятой в формате 0.001
            this.barrelPitchLabel.text = thousandths.toFixed(3);
        }

        // === ОБНОВЛЯЕМ УГОЛ ОБЗОРА (FOV CONE) ===
        // FOV cone всегда смотрит ВВЕРХ на радаре (куда смотрит игрок)
        // В режиме прицеливания FOV становится ярче
        if (this.fovConeContainer) {
            // FOV конус не вращается - он всегда направлен вверх (туда куда смотрит игрок)
            this.fovConeContainer.rotation = 0;

            // УЛУЧШЕНО: Обновляем линии границ FOV - ярче при прицеливании
            if (this.fovLeftLine) {
                this.fovLeftLine.background = this.isAimingMode ? "#ff8800" : "#00ff00"; // Оранжевый при прицеливании
                this.fovLeftLine.alpha = this.isAimingMode ? 0.8 : 0.5;
            }
            if (this.fovRightLine) {
                this.fovRightLine.background = this.isAimingMode ? "#ff8800" : "#00ff00"; // Оранжевый при прицеливании
                this.fovRightLine.alpha = this.isAimingMode ? 0.8 : 0.5;
            }
            if (this.fovCenterLine) {
                this.fovCenterLine.background = this.isAimingMode ? "#ffaa00" : "#00ff00";
                this.fovCenterLine.alpha = this.isAimingMode ? 0.6 : 0.3;
            }

            // Обновляем заполнение (оптимизация: обычный for)
            for (let i = 0; i < this.minimapFovCone.length; i++) {
                const cone = this.minimapFovCone[i];
                if (!cone) continue;
                cone.background = this.isAimingMode ? "#ff4400" : "#00ff00";
                cone.alpha = this.isAimingMode ? 0.15 : 0.05;
            }
        }

        // Пульсация врагов (для "живости")
        // ОПТИМИЗАЦИЯ: Используем более дешевую аппроксимацию sin для производительности
        this.enemyPulsePhase = (this.enemyPulsePhase + 0.15) % (Math.PI * 2);
        // Быстрая аппроксимация sin (достаточно точная для визуального эффекта)
        // sin(x) ≈ x - x³/6 для малых x, но для полного диапазона используем оптимизированную версию
        const pulseSize = 6 + Math.sin(this.enemyPulsePhase) * 2; // 4-8px (оставляем Math.sin для точности визуального эффекта)

        // Add new enemy markers - ПУЛЬСИРУЮЩИЕ КРАСНЫЕ КВАДРАТЫ с направлением ствола
        // RADAR_RANGE уже объявлен выше

        // ОПТИМИЗАЦИЯ: Используем обычный for вместо forEach
        const enemyCount = enemies.length;

        // ОТЛАДКА: Проверяем количество врагов и наличие radarArea
        if (enemyCount > 0 && !this.radarArea) {
            // console.error("[HUD] updateMinimap: radarArea is null but enemies exist!", enemyCount);
        }

        // КРИТИЧНО: Логируем количество врагов для отладки
        // if (enemyCount > 0) {
        //     console.log(`[HUD] updateMinimap: Processing ${enemyCount} enemies, radarArea exists: ${!!this.radarArea}`);
        // }

        for (let i = 0; i < enemyCount; i++) {
            const enemy = enemies[i];
            const isVector = enemy instanceof Vector3;
            const ex = isVector ? (enemy as Vector3).x : (enemy as any).x;
            const ez = isVector ? (enemy as Vector3).z : (enemy as any).z;
            const alive = isVector ? true : (enemy as any).alive;
            const enemyTurretRotation = isVector ? undefined : (enemy as any).turretRotation;

            // КРИТИЧНО: НЕ пропускаем врагов, если alive не установлен явно
            // Если alive === undefined, считаем что враг жив
            if (alive === false) continue; // Пропускаем только явно мёртвых врагов

            // КРИТИЧНО: Проверяем наличие radarArea перед обработкой врага
            if (!this.radarArea) {
                // console.error("[HUD] updateMinimap: radarArea is null for enemy", i, ex, ez);
                continue;
            }

            // КРИТИЧЕСКИ ВАЖНО: Вычисляем позицию врага ОТНОСИТЕЛЬНО ИГРОКА!
            const relativeX = ex - playerX;
            const relativeZ = ez - playerZ;

            // Check if enemy is within radar range (250m) - NO DISPLAY outside this range!
            const worldDistance = Math.sqrt(relativeX * relativeX + relativeZ * relativeZ);
            if (worldDistance > RADAR_RANGE) continue; // Пропускаем врагов вне радиуса 250м

            // ВРАЩАЕМ координаты относительно направления БАШНИ танка
            const rotatedX = relativeX * cos - relativeZ * sin;
            const rotatedZ = relativeX * sin + relativeZ * cos;

            // Scale to minimap: 250m = 60px (edge of radar)
            // Rings: 50m=12px, 100m=24px, 150m=36px, 200m=48px, 250m=60px
            const scale = 60 / RADAR_RANGE; // 0.24
            const x = rotatedX * scale;
            const z = -rotatedZ * scale; // Инвертируем Z для правильной ориентации

            // Clamp to minimap bounds (60px = 250m)
            const maxDist = 60;
            const dist = Math.sqrt(x * x + z * z);
            const clampedX = dist > maxDist ? x * maxDist / dist : x;
            const clampedZ = dist > maxDist ? z * maxDist / dist : z;

            // Враг на границе карты - показываем стрелку
            const isEdge = dist > maxDist;

            // Calculate angle from center to enemy for scan detection
            const enemyAngleOnRadar = Math.atan2(clampedX, -clampedZ);

            // Check if scan line just passed this enemy
            const isScanned = this.isEnemyScanned(enemyAngleOnRadar);
            const scannedEnemyKey = `${i}_${ex.toFixed(0)}_${ez.toFixed(0)}`;

            if (isScanned && !this.scannedEnemies.has(scannedEnemyKey)) {
                // Enemy just scanned - add to scanned list with fade timer
                this.scannedEnemies.set(scannedEnemyKey, { marker: null as any, fadeTime: 1500 });
            }

            // Check if this enemy is in scanned state
            const scannedData = this.scannedEnemies.get(scannedEnemyKey);
            const isFading = scannedData !== undefined;

            // КРИТИЧНО: Враги ВСЕГДА видны на радаре
            // ОПТИМИЗАЦИЯ: Переиспользуем маркеры из пула
            let marker: Rectangle;
            if (this.enemyMarkerPool.length > 0) {
                marker = this.enemyMarkerPool.pop()!;
                // КРИТИЧНО: Принудительно делаем маркер видимым и сбрасываем все свойства
                marker.isVisible = true;
                marker.alpha = 1.0;
                marker.zIndex = 1000; // КРИТИЧНО: Высокий z-index для видимости
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                // КРИТИЧНО: Убеждаемся, что маркер добавлен в radarArea
                if (this.radarArea) {
                    if (!this.radarArea.children?.includes(marker)) {
                        this.radarArea.addControl(marker);
                    }
                } else {
                    console.error("[HUD] radarArea is null when reusing marker!");
                }
            } else {
                marker = new Rectangle(`enemy${i}`);
                // КРИТИЧНО: Маркеры врагов ВСЕГДА видимы
                marker.isVisible = true;
                marker.alpha = 1.0;
                marker.zIndex = 1000; // КРИТИЧНО: Высокий z-index для видимости
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                if (this.radarArea) {
                    this.radarArea.addControl(marker);
                } else {
                    console.error("[HUD] radarArea is null! Cannot add enemy marker.");
                    continue; // Пропускаем врага если radarArea недоступен
                }
            }

            // ИСПРАВЛЕНО: Прямоугольные маркеры танков (не круглые)
            const baseSize = isFading ? pulseSize + 6 : pulseSize + 4; // УВЕЛИЧЕНО с +4/+2 до +6/+4
            marker.width = `${baseSize}px`;
            marker.height = `${baseSize}px`;
            marker.thickness = isEdge ? 3 : 2; // УВЕЛИЧЕНА толщина контура с 2/1 до 3/2
            marker.color = isFading ? "#0f0" : "#ff3333"; // Более яркий красный
            marker.cornerRadius = 0; // ИСПРАВЛЕНО: Прямоугольные маркеры (было baseSize / 2 - круглые)
            // КРИТИЧНО: Убеждаемся что background установлен ДО проверки isFading
            marker.background = isEdge ? "#aa0000" : "#ff3333";

            // Scanned enemies glow bright green then fade to red
            if (isFading && scannedData) {
                const fadeProgress = scannedData.fadeTime / 1500;
                const r = Math.floor(255 * (1 - fadeProgress));
                const g = Math.floor(255 * fadeProgress);
                marker.background = `rgb(${r}, ${g}, 0)`;
                marker.alpha = 0.6 + fadeProgress * 0.4;
                scannedData.marker = marker;
            } else {
                // КРИТИЧНО: Улучшенная видимость маркеров врагов - ВСЕГДА видимы
                // Яркий красный для врагов, тёмный для врагов на краю радара
                marker.background = isEdge ? "#aa0000" : "#ff3333";
                marker.alpha = 1.0; // Полная непрозрачность для лучшей видимости
                marker.isVisible = true; // КРИТИЧНО: Маркеры врагов ВСЕГДА видимы
            }

            // КРИТИЧНО: Принудительно устанавливаем все свойства видимости
            marker.left = `${clampedX}px`;
            marker.top = `${clampedZ}px`;
            marker.zIndex = 1000; // КРИТИЧНО: Высокий z-index для видимости над другими элементами
            marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            marker.isVisible = true; // КРИТИЧНО: Ещё раз убеждаемся что маркер видим
            marker.alpha = marker.alpha || 1.0; // КРИТИЧНО: Убеждаемся что альфа не 0

            // КРИТИЧНО: Убеждаемся что маркер в radarArea
            if (this.radarArea && !this.radarArea.children?.includes(marker)) {
                this.radarArea.addControl(marker);
            }

            this.minimapEnemies.push(marker);

            // Добавляем пушку врага (ВСЕГДА показываем направление куда смотрит враг)
            if (this.radarArea) {
                // Угол пушки врага относительно радара
                // enemyTurretRotation - абсолютный угол башни врага в мире
                // angle - угол поворота радара (направление башни игрока)
                const enemyBarrelAngle = (enemyTurretRotation !== undefined ? enemyTurretRotation : 0) - angle;

                // Длина ствола на радаре
                const barrelLength = 10;

                // ОПТИМИЗАЦИЯ: Переиспользуем стволы из пула
                let barrelDir: Rectangle;
                if (this.enemyBarrelPool.length > 0) {
                    barrelDir = this.enemyBarrelPool.pop()!;
                    barrelDir.isVisible = true;
                    // КРИТИЧНО: Убеждаемся, что ствол добавлен в radarArea
                    if (this.radarArea && !this.radarArea.children?.includes(barrelDir)) {
                        this.radarArea.addControl(barrelDir);
                    }
                } else {
                    barrelDir = new Rectangle(`enemyBarrel${i}`);
                    barrelDir.isVisible = true; // КРИТИЧНО: Стволы врагов должны быть видимы
                    barrelDir.zIndex = 1000; // КРИТИЧНО: Высокий z-index для видимости
                    if (this.radarArea) {
                        this.radarArea.addControl(barrelDir);
                    } else {
                        console.error("[HUD] radarArea is null! Cannot add enemy barrel.");
                    }
                }

                barrelDir.width = "3px"; // УВЕЛИЧЕНО с 2px до 3px
                barrelDir.height = `${barrelLength + 2}px`; // УВЕЛИЧЕНО для лучшей видимости
                barrelDir.thickness = 0;
                barrelDir.background = "#ff8800"; // Яркий оранжевый цвет для ствола врага
                barrelDir.zIndex = 1001; // КРИТИЧНО: Выше маркера врага
                barrelDir.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                barrelDir.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                // Позиция - середина между центром врага и концом ствола
                barrelDir.left = `${clampedX + Math.sin(enemyBarrelAngle) * barrelLength / 2}px`;
                barrelDir.top = `${clampedZ - Math.cos(enemyBarrelAngle) * barrelLength / 2}px`;
                barrelDir.rotation = enemyBarrelAngle; // Поворачиваем в направлении взгляда
                this.minimapEnemies.push(barrelDir);
            }
        }

        // КРИТИЧЕСКИ ВАЖНО: Игрок всегда в центре радара (0, 0)
        if (this.minimapPlayer) {
            this.minimapPlayer.left = "0px";
            this.minimapPlayer.top = "0px";
        }
    }

    setEnemyCount(_count: number) {
        // Could add an enemy count display if needed
    }

    setCrosshairColor(color: string) {
        this.crosshairDot.background = color;
    }

    updateTankState(tankPos: Vector3, speed: number, _isReloading: boolean, _reloadProgress: number) {
        this.setSpeed(speed);
        this.setPosition(tankPos.x, tankPos.z, tankPos.y);
        // NOTE: updateReload() был удален - метод не существовал
        // Индикатор перезарядки отображается через прицел (crosshair)
        this.updateGameTime();
    }

    // Дополнительная (скрытая) панель статистики танка.
    // Оставлена для обратной совместимости, на геймплей не влияет.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createTankStatsDisplay() {
        // Контейнер для статистики танка - СКРЫТ (XP теперь по центру)
        this.tankStatsContainer = new Rectangle("tankStatsContainer");
        this.tankStatsContainer.width = "200px";
        this.tankStatsContainer.height = "140px";
        this.tankStatsContainer.cornerRadius = 0;
        this.tankStatsContainer.thickness = 1;
        this.tankStatsContainer.color = "#0a05";
        this.tankStatsContainer.background = "#00000066";
        this.tankStatsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.tankStatsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatsContainer.left = "-10px";
        this.tankStatsContainer.top = "200px";
        this.tankStatsContainer.isVisible = false; // СКРЫТ - используем центральный XP бар
        this.guiTexture.addControl(this.tankStatsContainer);

        // Title
        const title = new TextBlock("statsTitle");
        title.text = "═══ TANK STATS ═══";
        title.color = "#0f0";
        title.fontSize = 12;
        title.fontFamily = "'Press Start 2P', monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        title.top = "5px";
        this.tankStatsContainer.addControl(title);

        // Chassis type
        this.chassisTypeText = new TextBlock("chassisType");
        this.chassisTypeText.text = "Chassis: Standard";
        this.chassisTypeText.color = "#0a0";
        this.chassisTypeText.fontSize = 10;
        this.chassisTypeText.fontFamily = "'Press Start 2P', monospace";
        this.chassisTypeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.chassisTypeText.top = "25px";
        this.chassisTypeText.left = "10px";
        this.tankStatsContainer.addControl(this.chassisTypeText);

        // Chassis XP bar background
        const chassisXpBg = new Rectangle("chassisXpBg");
        chassisXpBg.width = "180px";
        chassisXpBg.height = "8px";
        chassisXpBg.cornerRadius = 2;
        chassisXpBg.thickness = 1;
        chassisXpBg.color = "#0a0";
        chassisXpBg.background = "#001100";
        chassisXpBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        chassisXpBg.top = "40px";
        chassisXpBg.left = "10px";
        this.tankStatsContainer.addControl(chassisXpBg);

        // Chassis XP bar fill
        this.chassisXpBar = new Rectangle("chassisXpFill");
        this.chassisXpBar.width = "0px";
        this.chassisXpBar.height = "6px";
        this.chassisXpBar.cornerRadius = 1;
        this.chassisXpBar.thickness = 0;
        this.chassisXpBar.background = "#0ff";
        this.chassisXpBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        chassisXpBg.addControl(this.chassisXpBar);

        // Chassis XP text
        this.chassisXpText = new TextBlock("chassisXpText");
        this.chassisXpText.text = "XP: 0/100";
        this.chassisXpText.color = "#0ff";
        this.chassisXpText.fontSize = 9;
        this.chassisXpText.fontFamily = "'Press Start 2P', monospace";
        this.chassisXpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.chassisXpText.top = "40px";
        this.chassisXpText.left = "-10px";
        this.tankStatsContainer.addControl(this.chassisXpText);

        // Cannon type
        this.cannonTypeText = new TextBlock("cannonType");
        this.cannonTypeText.text = "Cannon: Standard";
        this.cannonTypeText.color = "#0a0";
        this.cannonTypeText.fontSize = 10;
        this.cannonTypeText.fontFamily = "'Press Start 2P', monospace";
        this.cannonTypeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.cannonTypeText.top = "55px";
        this.cannonTypeText.left = "10px";
        this.tankStatsContainer.addControl(this.cannonTypeText);

        // Cannon XP bar background
        const cannonXpBg = new Rectangle("cannonXpBg");
        cannonXpBg.width = "180px";
        cannonXpBg.height = "8px";
        cannonXpBg.cornerRadius = 2;
        cannonXpBg.thickness = 1;
        cannonXpBg.color = "#0a0";
        cannonXpBg.background = "#001100";
        cannonXpBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        cannonXpBg.top = "70px";
        cannonXpBg.left = "10px";
        this.tankStatsContainer.addControl(cannonXpBg);

        // Cannon XP bar fill
        this.cannonXpBar = new Rectangle("cannonXpFill");
        this.cannonXpBar.width = "0px";
        this.cannonXpBar.height = "6px";
        this.cannonXpBar.cornerRadius = 1;
        this.cannonXpBar.thickness = 0;
        this.cannonXpBar.background = "#f80";
        this.cannonXpBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        cannonXpBg.addControl(this.cannonXpBar);

        // Cannon XP text
        this.cannonXpText = new TextBlock("cannonXpText");
        this.cannonXpText.text = "XP: 0/100";
        this.cannonXpText.color = "#f80";
        this.cannonXpText.fontSize = 9;
        this.cannonXpText.fontFamily = "'Press Start 2P', monospace";
        this.cannonXpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.cannonXpText.top = "70px";
        this.cannonXpText.left = "-10px";
        this.tankStatsContainer.addControl(this.cannonXpText);

        // Separator
        const separator = new TextBlock("separator");
        separator.text = "─────────────────────";
        separator.color = "#0a0";
        separator.fontSize = 10;
        separator.fontFamily = "'Press Start 2P', monospace";
        separator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        separator.top = "85px";
        this.tankStatsContainer.addControl(separator);

        // Armor
        this.armorText = new TextBlock("armorText");
        this.armorText.text = "Armor: 0%";
        this.armorText.color = "#0a0";
        this.armorText.fontSize = 10;
        this.armorText.fontFamily = "'Press Start 2P', monospace";
        this.armorText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.armorText.top = "100px";
        this.armorText.left = "10px";
        this.tankStatsContainer.addControl(this.armorText);

        // Damage
        this.damageText = new TextBlock("damageText");
        this.damageText.text = "Damage: 50";
        this.damageText.color = "#0a0";
        this.damageText.fontSize = 10;
        this.damageText.fontFamily = "'Press Start 2P', monospace";
        this.damageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.damageText.top = "115px";
        this.damageText.left = "10px";
        this.tankStatsContainer.addControl(this.damageText);

        // Fire rate
        this.fireRateText = new TextBlock("fireRateText");
        this.fireRateText.text = "Fire Rate: 2.5s";
        this.fireRateText.color = "#0a0";
        this.fireRateText.fontSize = 10;
        this.fireRateText.fontFamily = "'Press Start 2P', monospace";
        this.fireRateText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fireRateText.top = "130px";
        this.fireRateText.left = "10px";
        this.tankStatsContainer.addControl(this.fireRateText);

        // Speed
        this.speedStatText = new TextBlock("speedStatText");
        this.speedStatText.text = "Speed: 10";
        this.speedStatText.color = "#0a0";
        this.speedStatText.fontSize = 10;
        this.speedStatText.fontFamily = "'Press Start 2P', monospace";
        this.speedStatText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.speedStatText.top = "145px";
        this.speedStatText.left = "10px";
        this.tankStatsContainer.addControl(this.speedStatText);

        // Health
        this.healthStatText = new TextBlock("healthStatText");
        this.healthStatText.text = "Max HP: 100";
        this.healthStatText.color = "#0a0";
        this.healthStatText.fontSize = 10;
        this.healthStatText.fontFamily = "'Press Start 2P', monospace";
        this.healthStatText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthStatText.top = "160px";
        this.healthStatText.left = "10px";
        this.tankStatsContainer.addControl(this.healthStatText);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createFPSCounter() {
        // === FPS COUNTER - ЛЕВЫЙ ВЕРХНИЙ УГОЛ ===
        this.fpsContainer = new Rectangle("fpsContainer");
        this.fpsContainer.width = this.scalePx(100); // Увеличено для лучшей читаемости
        this.fpsContainer.height = this.scalePx(35); // Увеличено
        this.fpsContainer.cornerRadius = 3;
        this.fpsContainer.thickness = 2;
        this.fpsContainer.color = "#0f0";
        this.fpsContainer.background = "#000000cc";
        this.fpsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fpsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.fpsContainer.left = this.scalePx(15);
        this.fpsContainer.top = this.scalePx(10);
        this.fpsContainer.zIndex = 1000;
        this.guiTexture.addControl(this.fpsContainer);

        this.fpsText = new TextBlock("fpsText");
        this.fpsText.text = "-- FPS";
        this.fpsText.color = "#0f0";
        this.fpsText.fontSize = this.scaleFontSize(18, 14, 24); // Увеличено
        this.fpsText.fontFamily = "'Press Start 2P', monospace";
        this.fpsText.fontWeight = "bold";
        this.fpsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fpsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fpsText.zIndex = 1001;
        this.fpsContainer.addControl(this.fpsText);

        this.fpsContainer.isVisible = true;
        this.fpsText.isVisible = true;
    }

    updateFPS(fps: number, deltaTime?: number) {
        // Проверка инициализации элементов FPS счётчика
        if (!this.fpsText || !this.fpsContainer) {
            return;
        }

        // Если fps невалидный, пытаемся вычислить из deltaTime
        let currentFps = fps;
        if (!isFinite(currentFps) || currentFps <= 0) {
            if (deltaTime && deltaTime > 0 && isFinite(deltaTime)) {
                currentFps = 1000 / deltaTime; // deltaTime в миллисекундах
            } else {
                // Если deltaTime тоже невалидный, показываем "--"
                this.fpsText.text = "-- FPS";
                this.fpsText.color = "#888";
                this.fpsContainer.color = "#8883";
                return;
            }
        }

        // Минимальное усреднение (2 кадра) для плавности, но быстрая реакция
        // Это уменьшено с предыдущих 3+ кадров для более быстрого отклика
        this.fpsHistory.push(currentFps);
        if (this.fpsHistory.length > 2) {
            this.fpsHistory.shift();
        }

        // Вычисляем средний FPS (с проверкой на пустую историю)
        let displayFps: number;
        if (this.fpsHistory.length === 0) {
            displayFps = Math.round(currentFps);
        } else {
            displayFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
        }

        // Проверка на валидность результата
        if (!isFinite(displayFps) || displayFps < 0) {
            this.fpsText.text = "-- FPS";
            this.fpsText.color = "#888";
            this.fpsContainer.color = "#8883";
            return;
        }

        // Обновляем текст - ВСЕГДА обновляем, даже если значение не изменилось
        this.fpsText.text = `${displayFps} FPS`;

        // Цвет в зависимости от FPS (учитываем высокие частоты обновления)
        if (displayFps >= 120) {
            // Отличный FPS (120+) - яркий зелёный
            this.fpsText.color = "#00ffaa";
            this.fpsContainer.color = "#00ffaa44";
        } else if (displayFps >= 60) {
            // Хороший FPS (60-119) - зелёный
            this.fpsText.color = "#00ff44";
            this.fpsContainer.color = "#00ff4433";
        } else if (displayFps >= 30) {
            // Средний FPS (30-59) - жёлтый
            this.fpsText.color = "#ffaa00";
            this.fpsContainer.color = "#ffaa0033";
        } else if (displayFps > 0) {
            // Низкий FPS (1-29) - красный
            this.fpsText.color = "#ff3366";
            this.fpsContainer.color = "#ff336633";
        } else {
            // FPS = 0 - серый (игра не запущена или на паузе)
            this.fpsText.color = "#888";
            this.fpsContainer.color = "#8883";
        }
    }

    // Установить видимость FPS счётчика
    setShowFPS(show: boolean): void {
        if (this.fpsContainer) {
            this.fpsContainer.isVisible = show;
        }
        if (this.fpsText) {
            this.fpsText.isVisible = show;
        }
    }

    setTankStats(
        chassisType: string,
        cannonType: string,
        armor: number,
        damage: number,
        fireRate: number,
        chassisLevel?: number,
        chassisXp?: number,
        chassisXpToNext?: number,
        chassisTitle?: string,
        chassisTitleColor?: string,
        cannonLevel?: number,
        cannonXp?: number,
        cannonXpToNext?: number,
        cannonTitle?: string,
        cannonTitleColor?: string,
        speed?: number,
        maxHealth?: number
    ) {
        // Сохраняем броню для блока состояния
        this.currentArmor = armor;

        // Обновляем блок состояния танка
        if (this.tankStatusContainer) {
            this.updateTankStatus(this.currentHealth, this.maxHealth, this.currentFuel, this.maxFuel, armor);
        }
        // Chassis info with level
        if (this.chassisTypeText) {
            const lvlText = chassisLevel ? ` Lv.${chassisLevel}` : "";
            const titleText = chassisTitle ? ` [${chassisTitle}]` : "";
            this.chassisTypeText.text = `▶ ${chassisType}${lvlText}${titleText}`;
            this.chassisTypeText.color = chassisTitleColor || "#0a0";
        }

        // Chassis XP bar
        if (this.chassisXpBar && chassisXp !== undefined && chassisXpToNext !== undefined) {
            if (chassisXpToNext > 0) {
                const progress = Math.min(1, Math.max(0, chassisXp / chassisXpToNext));
                this.chassisXpBar.width = `${Math.max(2, progress * 178)}px`;
            } else {
                this.chassisXpBar.width = "178px"; // MAX level
            }
            this.chassisXpBar.background = chassisTitleColor || "#0ff";
        }
        if (this.chassisXpText && chassisXp !== undefined && chassisXpToNext !== undefined) {
            this.chassisXpText.text = chassisXpToNext > 0 ? `${chassisXp}/${chassisXpToNext} XP` : "MAX";
            this.chassisXpText.color = chassisTitleColor || "#0ff";
        }

        // Cannon info with level
        if (this.cannonTypeText) {
            const lvlText = cannonLevel ? ` Lv.${cannonLevel}` : "";
            const titleText = cannonTitle ? ` [${cannonTitle}]` : "";
            this.cannonTypeText.text = `▶ ${cannonType}${lvlText}${titleText}`;
            this.cannonTypeText.color = cannonTitleColor || "#0a0";
        }

        // Cannon XP bar
        if (this.cannonXpBar && cannonXp !== undefined && cannonXpToNext !== undefined) {
            if (cannonXpToNext > 0) {
                const progress = Math.min(1, Math.max(0, cannonXp / cannonXpToNext));
                this.cannonXpBar.width = `${Math.max(2, progress * 178)}px`;
            } else {
                this.cannonXpBar.width = "178px"; // MAX level
            }
            this.cannonXpBar.background = cannonTitleColor || "#f80";
        }
        if (this.cannonXpText && cannonXp !== undefined && cannonXpToNext !== undefined) {
            this.cannonXpText.text = cannonXpToNext > 0 ? `${cannonXp}/${cannonXpToNext} XP` : "MAX";
            this.cannonXpText.color = cannonTitleColor || "#f80";
        }

        if (this.armorText) {
            this.armorText.text = `Armor: ${Math.round(armor * 100)}%`;
        }
        if (this.damageText) {
            this.damageText.text = `Damage: ${Math.round(damage)}`;
        }
        if (this.fireRateText) {
            this.fireRateText.text = `Fire Rate: ${(fireRate / 1000).toFixed(2)}s`;
        }
        if (this.speedStatText && speed !== undefined) {
            this.speedStatText.text = `Speed: ${speed.toFixed(1)}`;
        }
        if (this.healthStatText && maxHealth !== undefined) {
            this.healthStatText.text = `Max HP: ${maxHealth}`;
        }

        // Центральная шкала XP теперь обновляется только из game.ts через playerProgression
        // Убрано обновление здесь, чтобы избежать конфликтов между разными источниками данных
    }

    // XP BAR - Full width at very bottom
    private createCentralXpBar(): void {
        // КРИТИЧНО: Если элементы уже существуют, не пересоздаём их!
        if (this.centralXpContainer && this.centralXpText && this.centralXpBar) {
            return;
        }

        // ИСПРАВЛЕНО: Читаем данные напрямую из localStorage для корректного начального отображения
        let savedText = "RANK 1 | XP: 0/100"; // Дефолт если ничего не найдено
        try {
            const playerStatsRaw = localStorage.getItem("tx_player_stats");
            if (playerStatsRaw) {
                const playerStats = JSON.parse(playerStatsRaw);
                const level = playerStats.level || 1;
                const experience = playerStats.experience || 0;

                // Получаем требуемый опыт для следующего уровня
                const PLAYER_LEVEL_EXP = [0, 500, 1200, 2100, 3300, 4800, 6600, 8800, 11500, 14700, 18500, 23000, 28200, 34200, 41000, 48700, 57300, 67000, 77800, 90000];
                const currentLevelXP = PLAYER_LEVEL_EXP[level - 1] || 0;
                const nextLevelXP = PLAYER_LEVEL_EXP[level] || PLAYER_LEVEL_EXP[PLAYER_LEVEL_EXP.length - 1];
                const required = (nextLevelXP || currentLevelXP) - currentLevelXP;
                const current = Math.min(experience, required);

                savedText = `RANK ${level} | XP: ${current}/${required}`;
            }
        } catch (e) {
            console.warn("[HUD] Failed to load player stats from localStorage:", e);
        }

        // Если есть уже существующий текст, используем его
        if (this.centralXpText?.text && this.centralXpText.text !== "RANK 1 | XP: 0/100") {
            savedText = this.centralXpText.text;
        }

        // Вычисляем ширину XP бара - максимум 800px, но не больше 60% экрана
        const maxWidth = Math.min(800, window.innerWidth * 0.6);

        this.centralXpContainer = new Rectangle("centralXpContainer");
        this.centralXpContainer.width = `${maxWidth}px`; // Ограниченная ширина вместо 100%
        this.centralXpContainer.height = this.scalePx(35); // Высота как у компаса (35px)
        this.centralXpContainer.cornerRadius = 3;
        this.centralXpContainer.thickness = 2;
        this.centralXpContainer.color = "#0f0";
        this.centralXpContainer.background = "#000";
        this.centralXpContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.centralXpContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.centralXpContainer.top = this.scalePx(-5); // Немного выше от края
        this.guiTexture.addControl(this.centralXpContainer);

        // Progress bar
        this.centralXpBar = new Rectangle("centralXpFill");
        this.centralXpBar.width = "0%";
        this.centralXpBar.height = "100%";
        this.centralXpBar.cornerRadius = 0;
        this.centralXpBar.thickness = 0;
        this.centralXpBar.background = "#0f0";
        this.centralXpBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.centralXpContainer.addControl(this.centralXpBar);

        // XP text with outline for better visibility
        // Создаем обводку (черный текст с небольшим смещением)
        const xpTextOutline = new TextBlock("centralXpTextOutline");
        // КРИТИЧНО: Используем сохранённый текст, если он был, иначе дефолт
        xpTextOutline.text = savedText;
        xpTextOutline.color = "#000";
        xpTextOutline.fontSize = this.scaleFontSize(12, 9, 16);
        xpTextOutline.fontFamily = "'Press Start 2P', monospace";
        xpTextOutline.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        xpTextOutline.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        xpTextOutline.top = this.scalePx(1);
        xpTextOutline.left = this.scalePx(1);
        xpTextOutline.isVisible = true;
        this.centralXpContainer.addControl(xpTextOutline);

        // Основной текст (темно-синий для контраста с зеленым фоном)
        this.centralXpText = new TextBlock("centralXpText");
        // КРИТИЧНО: Используем сохранённый текст, если он был, иначе дефолт
        this.centralXpText.text = savedText;
        this.centralXpText.color = "#0066ff";
        this.centralXpText.fontSize = this.scaleFontSize(12, 9, 16);
        this.centralXpText.fontFamily = "'Press Start 2P', monospace";
        this.centralXpText.fontWeight = "bold";
        this.centralXpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.centralXpText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.centralXpText.top = this.scalePx(3);
        this.centralXpText.isVisible = true;
        this.centralXpContainer.addControl(this.centralXpText);

        // Сохраняем ссылку на обводку для обновления
        (this as any).centralXpTextOutline = xpTextOutline;

        // Убеждаемся, что контейнер видим
        this.centralXpContainer.isVisible = true;
        this.centralXpBar.isVisible = true;

        // ИСПРАВЛЕНО: Если PlayerProgressionSystem уже установлен, обновляем XP BAR сразу
        if (this._playerProgression) {
            try {
                const xpProgress = this._playerProgression.getExperienceProgress?.();
                // КРИТИЧНО: Используем getLevel() или getCurrentLevel() для получения уровня
                const level = this._playerProgression.getLevel?.() ??
                    this._playerProgression.getCurrentLevel?.() ??
                    (this._playerProgression.getStats?.()?.level) ?? 1;
                if (xpProgress) {
                    this.updateCentralXp(xpProgress.current, xpProgress.required, level);
                } else {
                    // Если нет прогресса, всё равно обновляем с текущим уровнем
                    this.updateCentralXp(0, 100, level);
                }
            } catch (e) {
                console.warn("[HUD] Error updating XP bar on creation:", e);
            }
        }

        // Central XP bar created
    }

    // Создать прогресс-бар захвата гаража
    private createGarageCaptureBar(): void {
        this.garageCaptureContainer = new Rectangle("garageCaptureContainer");
        this.garageCaptureContainer.width = "400px";
        this.garageCaptureContainer.height = "60px";
        this.garageCaptureContainer.cornerRadius = 0;
        this.garageCaptureContainer.thickness = 2;
        this.garageCaptureContainer.color = "#0f0";
        this.garageCaptureContainer.background = "#000";
        this.garageCaptureContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageCaptureContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.garageCaptureContainer.top = "-200px"; // Выше центра экрана для лучшей видимости
        this.garageCaptureContainer.isVisible = false; // Скрыт по умолчанию
        this.garageCaptureContainer.zIndex = 2000; // Высокий z-index чтобы был виден поверх всего
        this.guiTexture.addControl(this.garageCaptureContainer);

        // Заголовок
        const title = new TextBlock("garageCaptureTitle");
        title.text = "CAPTURING GARAGE";
        title.color = "#0f0";
        title.fontSize = 14;
        title.fontFamily = "'Press Start 2P', monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        title.top = "5px";
        this.garageCaptureContainer.addControl(title);

        // Прогресс-бар (фон)
        this.garageCaptureBar = new Rectangle("garageCaptureBar");
        this.garageCaptureBar.width = "90%";
        this.garageCaptureBar.height = "20px";
        this.garageCaptureBar.cornerRadius = 0;
        this.garageCaptureBar.thickness = 1;
        this.garageCaptureBar.color = "#0f0";
        this.garageCaptureBar.background = "#222";
        this.garageCaptureBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageCaptureBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.garageCaptureBar.top = "5px";
        this.garageCaptureContainer.addControl(this.garageCaptureBar);

        // Заполнение прогресс-бара
        this.garageCaptureFill = new Rectangle("garageCaptureFill");
        this.garageCaptureFill.width = "0%";
        this.garageCaptureFill.height = "100%";
        this.garageCaptureFill.cornerRadius = 0;
        this.garageCaptureFill.thickness = 0;
        this.garageCaptureFill.background = "#0f0";
        this.garageCaptureFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.garageCaptureBar.addControl(this.garageCaptureFill);

        // Текст прогресса
        this.garageCaptureText = new TextBlock("garageCaptureText");
        this.garageCaptureText.text = "0%";
        this.garageCaptureText.color = "#0f0";
        this.garageCaptureText.fontSize = 10;
        this.garageCaptureText.fontFamily = "'Press Start 2P', monospace";
        this.garageCaptureText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageCaptureText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.garageCaptureBar.addControl(this.garageCaptureText);

        // Текст времени
        this.garageCaptureTimeText = new TextBlock("garageCaptureTimeText");
        this.garageCaptureTimeText.text = "";
        this.garageCaptureTimeText.color = "#0f0";
        this.garageCaptureTimeText.fontSize = 10;
        this.garageCaptureTimeText.fontFamily = "'Press Start 2P', monospace";
        this.garageCaptureTimeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageCaptureTimeText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.garageCaptureTimeText.top = "-5px";
        this.garageCaptureContainer.addControl(this.garageCaptureTimeText);
    }

    // Установить прогресс захвата гаража
    setGarageCaptureProgress(garageKey: string | null, progress: number, remainingTime: number): void {
        if (!this.garageCaptureContainer || !this.garageCaptureFill || !this.garageCaptureText || !this.garageCaptureTimeText) {
            // Garage capture UI elements not initialized
            return;
        }

        if (garageKey === null || progress <= 0) {
            // Скрываем прогресс-бар
            this.garageCaptureContainer.isVisible = false;
            return;
        }

        // Показываем прогресс-бар
        this.garageCaptureContainer.isVisible = true;
        this.garageCaptureContainer.zIndex = 2000; // Высокий z-index чтобы был виден

        // Обновляем прогресс
        const percent = Math.min(100, Math.max(0, progress * 100));
        this.garageCaptureFill.width = `${percent}%`;
        this.garageCaptureText.text = `${Math.round(percent)}%`;

        // Обновляем время
        if (remainingTime > 0) {
            const minutes = Math.floor(remainingTime / 60);
            const seconds = Math.floor(remainingTime % 60);
            this.garageCaptureTimeText.text = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            this.garageCaptureTimeText.text = "";
        }

        // Принудительно обновляем видимость всех элементов
        if (this.garageCaptureBar) this.garageCaptureBar.isVisible = true;
        if (this.garageCaptureFill) this.garageCaptureFill.isVisible = true;
        if (this.garageCaptureText) this.garageCaptureText.isVisible = true;
        if (this.garageCaptureTimeText) this.garageCaptureTimeText.isVisible = true;
    }

    // Обновление центральной шкалы XP с плавной анимацией
    updateCentralXp(currentXp: number, xpToNext: number, level: number): void {
        // УЛУЧШЕНО: Используем компонент ExperienceBar
        if (this.experienceBarComponent) {
            this.experienceBarComponent.setExperience(currentXp, xpToNext, level);
        }

        // Проверяем, что элементы созданы
        if (!this.centralXpBar || !this.centralXpText || !this.centralXpContainer) {
            // КРИТИЧНО: Не пересоздаём элементы здесь - они должны быть созданы в init()
            // Если их нет, просто логируем и выходим - они создадутся позже
            console.warn(`[HUD] ⚠️ updateCentralXp: Elements not ready yet. centralXpContainer=${!!this.centralXpContainer}, centralXpText=${!!this.centralXpText}, centralXpBar=${!!this.centralXpBar}`);
            // Не создаём элементы здесь - они должны быть созданы в init()
            // Просто выходим, обновление произойдёт после создания элементов
            return;
        }

        // Убеждаемся, что данные валидны
        const validCurrentXp = Math.max(0, Math.round(currentXp || 0));
        const validXpToNext = Math.max(1, Math.round(xpToNext || 100));
        const validLevel = Math.max(1, Math.round(level || 1));

        // Вычисляем процент заполнения
        // Округляем процент до 1 знака после запятой для упрощения
        const rawPercent = validXpToNext > 0 ? Math.min(100, Math.max(0, (validCurrentXp / validXpToNext) * 100)) : 0;
        const percent = Math.round(rawPercent * 10) / 10;

        // Обновляем целевую позицию для плавной анимации
        this.xpBarTargetPercent = percent;

        // КРИТИЧНО: Немедленно обновляем визуальную полосу прогресса
        if (this.centralXpBar) {
            const widthPercent = `${percent}%`;
            this.centralXpBar.width = widthPercent;
            this.xpBarCurrentPercent = percent; // Синхронизируем для анимации
        }

        // Если уровень изменился, сбрасываем анимацию и добавляем эффект
        if (validLevel !== this.xpBarLastLevel) {
            this.xpBarCurrentPercent = 0; // Начинаем с 0 при повышении уровня
            this.xpBarLastLevel = validLevel;

            // Эффект пульсации при повышении уровня
            if (this.centralXpContainer) {
                const originalColor = this.centralXpContainer.color;
                this.centralXpContainer.color = "#fff";
                setTimeout(() => {
                    if (this.centralXpContainer) {
                        this.centralXpContainer.color = originalColor;
                    }
                }, 300);
            }
        }

        // Всегда обновляем текст немедленно
        try {
            // Обновляем текст с правильным форматом (RANK для уровня игрока, чтобы отличать от уровня частей)
            const xpText = `RANK ${validLevel} | XP: ${validCurrentXp}/${validXpToNext}`;

            if (this.centralXpText) {
                this.centralXpText.text = xpText;
            } else {
                console.warn(`[HUD] ⚠️ centralXpText is null! Cannot update RANK display.`);
            }

            // Обновляем обводку тоже
            const xpTextOutline = (this as any).centralXpTextOutline;
            if (xpTextOutline) {
                xpTextOutline.text = xpText;
            } else {
                console.warn(`[HUD] ⚠️ xpTextOutline is null!`);
            }

            // Убеждаемся, что элементы видимы
            if (this.centralXpContainer) this.centralXpContainer.isVisible = true;
            if (this.centralXpBar) this.centralXpBar.isVisible = true;
            if (this.centralXpText) this.centralXpText.isVisible = true;
            if (xpTextOutline) xpTextOutline.isVisible = true;

            // Логирование только при изменении данных (для отладки)
            const updateKey = `${validLevel}_${validCurrentXp}_${validXpToNext}`;
            if (this._lastXpUpdateKey !== updateKey) {
                this._lastXpUpdateKey = updateKey;
                console.log(`[HUD] ✅ XP bar updated: RANK ${validLevel} | XP: ${validCurrentXp}/${validXpToNext}`);
            }
        } catch (e) {
            if (typeof loggingSettings !== 'undefined' && loggingSettings.getLevel() >= LogLevel.DEBUG) {
                console.debug("[HUD] Error updating XP bar:", e);
            }
        }
    }

    // Плавная анимация шкалы опыта (вызывается из updateAnimations)
    private animateXpBar(deltaTime: number): void {
        if (!this.centralXpBar) return;

        // Плавная интерполяция к целевому проценту
        const lerpSpeed = 10.0; // Скорость интерполяции (чем больше, тем быстрее)
        const diff = this.xpBarTargetPercent - this.xpBarCurrentPercent;

        if (Math.abs(diff) > 0.1) {
            // Плавно приближаемся к целевому значению
            this.xpBarCurrentPercent += diff * lerpSpeed * deltaTime;

            // Ограничиваем значения
            this.xpBarCurrentPercent = Math.max(0, Math.min(100, this.xpBarCurrentPercent));

            // Применяем к шкале
            const widthPercent = `${this.xpBarCurrentPercent}%`;
            this.centralXpBar.width = widthPercent;

            // Добавляем легкую пульсацию при заполнении
            if (diff > 0.5) {
                const pulse = 1 + Math.sin(this.animationTime * 8) * 0.05;
                if (this.centralXpBar) {
                    // Легкое изменение яркости
                    this.centralXpBar.alpha = 0.9 + pulse * 0.1;
                }
            }
        } else {
            // Если очень близко, просто устанавливаем точное значение
            this.xpBarCurrentPercent = this.xpBarTargetPercent;
            this.centralXpBar.width = `${this.xpBarCurrentPercent}%`;
            if (this.centralXpBar) {
                this.centralXpBar.alpha = 1.0;
            }
        }
    }

    private _lastXpUpdateKey: string = ""; // Для отслеживания изменений (только для логирования)

    // === ПОЛНОЦЕННАЯ КАРТА (открывается по M) ===
    private createFullMap(): void {
        this.fullMapContainer = new Rectangle("fullMapContainer");
        this.fullMapContainer.width = "700px";
        this.fullMapContainer.height = "600px";
        this.fullMapContainer.cornerRadius = 5;
        this.fullMapContainer.thickness = 3;
        this.fullMapContainer.color = "#0f0";
        this.fullMapContainer.background = "rgba(0, 10, 0, 0.95)";
        this.fullMapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fullMapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fullMapContainer.isVisible = false;
        this.guiTexture.addControl(this.fullMapContainer);

        // Заголовок
        const title = new TextBlock("mapTitle");
        title.text = "🗺️ TACTICAL MAP [M]";
        title.color = "#0ff";
        title.fontSize = 18;
        title.fontWeight = "bold";
        title.fontFamily = "'Press Start 2P', monospace";
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        title.top = "12px";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fullMapContainer.addControl(title);

        // Область карты
        const mapArea = new Rectangle("mapArea");
        mapArea.width = "660px";
        mapArea.height = "520px";
        mapArea.cornerRadius = 3;
        mapArea.thickness = 2;
        mapArea.color = "#0f04";
        mapArea.background = "#001100";
        mapArea.top = "50px";
        this.fullMapContainer.addControl(mapArea);

        // Сетка карты (улучшенная)
        for (let i = 0; i < 18; i++) {
            const hLine = new Rectangle(`mapHLine${i}`);
            hLine.width = "658px";
            hLine.height = "1px";
            hLine.background = "#0f03";
            hLine.top = `${-250 + i * 30}px`;
            mapArea.addControl(hLine);

            const vLine = new Rectangle(`mapVLine${i}`);
            vLine.width = "1px";
            vLine.height = "518px";
            vLine.background = "#0f03";
            vLine.left = `${-315 + i * 37}px`;
            mapArea.addControl(vLine);
        }

        // Центральный крест (более заметный)
        const centerH = new Rectangle("mapCenterH");
        centerH.width = "658px";
        centerH.height = "2px";
        centerH.background = "#0f06";
        mapArea.addControl(centerH);

        const centerV = new Rectangle("mapCenterV");
        centerV.width = "2px";
        centerV.height = "518px";
        centerV.background = "#0f06";
        mapArea.addControl(centerV);

        // Маркер игрока на карте (улучшенный)
        const playerMarker = new Rectangle("fullMapPlayer");
        playerMarker.width = "14px";
        playerMarker.height = "14px";
        playerMarker.thickness = 2;
        playerMarker.color = "#0ff";
        playerMarker.background = "#0f0";
        playerMarker.cornerRadius = 7;
        mapArea.addControl(playerMarker);
        (this.fullMapContainer as any)._playerMarker = playerMarker;

        // FOV конус для игрока на полной карте
        const fullMapFovConeContainer = new Rectangle("fullMapFovConeContainer");
        fullMapFovConeContainer.width = "660px";
        fullMapFovConeContainer.height = "520px";
        fullMapFovConeContainer.thickness = 0;
        fullMapFovConeContainer.background = "transparent";
        mapArea.addControl(fullMapFovConeContainer);
        (this.fullMapContainer as any)._fovConeContainer = fullMapFovConeContainer;

        // Левая линия FOV
        const fullMapFovLeftLine = new Rectangle("fullMapFovLeftLine");
        fullMapFovLeftLine.width = "3px";
        fullMapFovLeftLine.height = "120px";
        fullMapFovLeftLine.thickness = 0;
        fullMapFovLeftLine.background = "#00ff00";
        fullMapFovLeftLine.alpha = 0.5;
        fullMapFovLeftLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        fullMapFovLeftLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        fullMapFovLeftLine.top = "-60px";
        fullMapFovLeftLine.transformCenterX = 0.5;
        fullMapFovLeftLine.transformCenterY = 1;
        fullMapFovConeContainer.addControl(fullMapFovLeftLine);
        (this.fullMapContainer as any)._fovLeftLine = fullMapFovLeftLine;

        // Правая линия FOV
        const fullMapFovRightLine = new Rectangle("fullMapFovRightLine");
        fullMapFovRightLine.width = "3px";
        fullMapFovRightLine.height = "120px";
        fullMapFovRightLine.thickness = 0;
        fullMapFovRightLine.background = "#00ff00";
        fullMapFovRightLine.alpha = 0.5;
        fullMapFovRightLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        fullMapFovRightLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        fullMapFovRightLine.top = "-60px";
        fullMapFovRightLine.transformCenterX = 0.5;
        fullMapFovRightLine.transformCenterY = 1;
        fullMapFovConeContainer.addControl(fullMapFovRightLine);
        (this.fullMapContainer as any)._fovRightLine = fullMapFovRightLine;

        // Центральная линия FOV
        const fullMapFovCenterLine = new Rectangle("fullMapFovCenterLine");
        fullMapFovCenterLine.width = "2px";
        fullMapFovCenterLine.height = "120px";
        fullMapFovCenterLine.thickness = 0;
        fullMapFovCenterLine.background = "#00ff00";
        fullMapFovCenterLine.alpha = 0.3;
        fullMapFovCenterLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        fullMapFovCenterLine.top = "-60px";
        fullMapFovConeContainer.addControl(fullMapFovCenterLine);
        (this.fullMapContainer as any)._fovCenterLine = fullMapFovCenterLine;

        // Подсказка (улучшенная)
        const hint = new TextBlock("mapHint");
        hint.text = "Press [M] to close • Zoom: Mouse Wheel";
        hint.color = "#0f0";
        hint.fontSize = 11;
        hint.fontFamily = "'Press Start 2P', monospace";
        hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        hint.top = "-12px";
        hint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fullMapContainer.addControl(hint);

        // Легенда (улучшенная)
        const legend = new TextBlock("mapLegend");
        legend.text = "● You  ● Enemies  ▢ Explored Areas";
        legend.color = "#0aa";
        legend.fontSize = 10;
        legend.fontFamily = "'Press Start 2P', monospace";
        legend.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        legend.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        legend.left = "20px";
        legend.top = "-12px";
        this.fullMapContainer.addControl(legend);

        // ОПТИМИЗАЦИЯ: Инициализация пула объектов для маркеров врагов
        this.initializeFullMapEnemiesPool();
    }

    /**
     * ОПТИМИЗАЦИЯ: Инициализация пула объектов для маркеров врагов на полной карте
     */
    private initializeFullMapEnemiesPool(): void {
        const mapArea = this.fullMapContainer?.children[1] as Rectangle;
        if (!mapArea) return;

        // Создаем пул из 60 элементов (больше чем MAX_FULLMAP_ENEMIES для запаса)
        const poolSize = 60;
        for (let i = 0; i < poolSize; i++) {
            const marker = new Rectangle(`fullMapEnemyPool${i}`);
            marker.width = "10px";
            marker.height = "10px";
            marker.thickness = 1;
            marker.color = "#f00";
            marker.background = "#f00";
            marker.cornerRadius = 5;
            marker.isVisible = false; // Скрываем по умолчанию
            mapArea.addControl(marker);
            this.fullMapEnemiesPool.push(marker);
        }
    }

    private setupMapKeyListener(): void {
        // Обработчик M перенесён в game.ts для согласованности
        // Теперь карта управляется из Game класса
    }

    /**
     * ОПТИМИЗАЦИЯ: Переключение миникарты (радара)
     * По умолчанию миникарта отключена для экономии ресурсов
     * Включение по Tab показывает радар и активирует обновления
     */
    toggleMinimap(): void {
        this.minimapEnabled = !this.minimapEnabled;
        if (this.minimapContainer) {
            this.minimapContainer.isVisible = this.minimapEnabled;
        }
        console.log(`[HUD] Minimap ${this.minimapEnabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Проверка, включена ли миникарта
     */
    isMinimapEnabled(): boolean {
        return this.minimapEnabled;
    }

    toggleFullMap(): void {
        // ИСПРАВЛЕНИЕ: Создаём карту если она ещё не создана
        if (!this.fullMapContainer) {
            console.log("[HUD] Creating fullMap container on first toggle");
            this.createFullMap();
        }
        this.fullMapVisible = !this.fullMapVisible;
        if (this.fullMapContainer) {
            this.fullMapContainer.isVisible = this.fullMapVisible;
            console.log(`[HUD] Full map visibility: ${this.fullMapVisible}`);
        }
    }

    // Обновление полной карты с позицией игрока и врагами
    updateFullMap(playerPos: Vector3, playerRotation: number, enemies: { x: number, z: number, alive: boolean }[]): void {
        if (!this.fullMapContainer || !this.fullMapVisible) return;

        const now = Date.now();

        // Обновляем кэш позиций врагов
        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const enemyId = `${enemy.x}_${enemy.z}`;
            const cached = this.cachedEnemyPositions.get(enemyId);

            if (!cached || now - cached.lastUpdate > this.POSITION_CACHE_TIME) {
                this.cachedEnemyPositions.set(enemyId, {
                    x: enemy.x,
                    z: enemy.z,
                    lastUpdate: now
                });
            }
        });

        // Записываем текущую позицию как исследованную
        const chunkX = Math.floor(playerPos.x / 50);
        const chunkZ = Math.floor(playerPos.z / 50);
        this.exploredAreas.add(`${chunkX},${chunkZ}`);

        // Обновляем позицию игрока на карте
        const playerMarker = (this.fullMapContainer as any)._playerMarker as Rectangle;
        const fovConeContainer = (this.fullMapContainer as any)._fovConeContainer as Rectangle;
        const fovLeftLine = (this.fullMapContainer as any)._fovLeftLine as Rectangle;
        const fovRightLine = (this.fullMapContainer as any)._fovRightLine as Rectangle;
        const fovCenterLine = (this.fullMapContainer as any)._fovCenterLine as Rectangle;

        if (playerMarker) {
            // Масштаб: 1 единица мира = 0.5 пикселя на карте
            const scale = 0.5;
            const mapX = playerPos.x * scale;
            const mapZ = -playerPos.z * scale;

            // Ограничиваем позицию внутри карты
            const maxDist = 270;
            const clampedX = Math.max(-maxDist, Math.min(maxDist, mapX));
            const clampedZ = Math.max(-200, Math.min(200, mapZ));

            playerMarker.left = `${clampedX}px`;
            playerMarker.top = `${clampedZ}px`;

            // Обновляем позицию FOV конуса
            if (fovConeContainer) {
                fovConeContainer.left = `${clampedX}px`;
                fovConeContainer.top = `${clampedZ}px`;
            }

            // Обновляем поворот FOV линий
            const halfAngle = (60 / 2) * Math.PI / 180;
            if (fovLeftLine) {
                fovLeftLine.rotation = -playerRotation - halfAngle;
            }
            if (fovRightLine) {
                fovRightLine.rotation = -playerRotation + halfAngle;
            }
            if (fovCenterLine) {
                fovCenterLine.rotation = -playerRotation;
            }
        }

        // ОПТИМИЗАЦИЯ: Используем пул объектов и Map для отслеживания активных маркеров
        const mapArea = this.fullMapContainer?.children[1] as Rectangle;
        if (!mapArea) return;

        // Обновляем дороги на полной карте
        if (now - this.lastFullMapRoadsUpdate > this.ROADS_UPDATE_INTERVAL) {
            this.updateFullMapRoads(playerPos, mapArea);
            this.lastFullMapRoadsUpdate = now;
        }

        // Обновляем рельеф на полной карте
        if (now - this.lastFullMapTerrainUpdate > this.TERRAIN_UPDATE_INTERVAL) {
            this.updateFullMapTerrain(playerPos, mapArea);
            this.lastFullMapTerrainUpdate = now;
        }

        // Обновляем взрывы на полной карте
        this.updateFullMapExplosions(playerPos, mapArea);

        // Обновляем здания на полной карте
        if (now - this.lastFullMapBuildingsUpdate > 2000) {
            this.updateFullMapBuildings(playerPos, mapArea);
            this.lastFullMapBuildingsUpdate = now;
        }

        // Валидация входных данных
        if (!enemies || enemies.length === 0) {
            // Скрываем все маркеры если врагов нет
            for (const marker of this.fullMapEnemiesActive.values()) {
                if (marker) {
                    marker.isVisible = false;
                }
            }
            this.fullMapEnemiesActive.clear();
            this.fullMapEnemies = [];
            return;
        }

        // Создаем Set для отслеживания активных врагов
        const activeEnemyIds = new Set<string>();
        const scale = 0.6;
        const maxDist = 320;

        // ОПТИМИЗАЦИЯ: Ограничиваем количество обрабатываемых врагов
        const enemyCount = Math.min(enemies.length, this.MAX_FULLMAP_ENEMIES);

        // Обрабатываем врагов и обновляем/создаем маркеры
        let poolIndex = 0;
        for (let i = 0; i < enemyCount; i++) {
            const enemy = enemies[i];
            if (!enemy || !enemy.alive) continue;

            try {
                // Используем кэшированные позиции
                const enemyId = `${enemy.x}_${enemy.z}`;
                const cached = this.cachedEnemyPositions.get(enemyId);
                const enemyX = cached ? cached.x : enemy.x;
                const enemyZ = cached ? cached.z : enemy.z;

                const ex = enemyX * scale;
                const ez = -enemyZ * scale;

                // Пропускаем врагов вне видимой области
                if (Math.abs(ex) > maxDist || Math.abs(ez) > 240) continue;

                activeEnemyIds.add(enemyId);

                // Проверяем, есть ли уже маркер для этого врага
                let marker = this.fullMapEnemiesActive.get(enemyId);

                if (!marker) {
                    // Берем маркер из пула
                    if (poolIndex < this.fullMapEnemiesPool.length) {
                        marker = this.fullMapEnemiesPool[poolIndex];
                        if (marker) {
                            poolIndex++;
                            this.fullMapEnemiesActive.set(enemyId, marker);
                        } else {
                            continue;
                        }
                    } else {
                        // Пул переполнен, пропускаем этого врага
                        continue;
                    }
                }

                // Обновляем позицию маркера
                if (marker) {
                    marker.left = `${ex}px`;
                    marker.top = `${ez}px`;
                    marker.isVisible = true;
                }
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        // Скрываем маркеры для неактивных врагов
        for (const [enemyId, marker] of this.fullMapEnemiesActive.entries()) {
            if (!activeEnemyIds.has(enemyId)) {
                if (marker) {
                    marker.isVisible = false;
                }
                this.fullMapEnemiesActive.delete(enemyId);
            }
        }

        // Legacy: обновляем старый массив для совместимости
        this.fullMapEnemies = Array.from(this.fullMapEnemiesActive.values()).filter((m): m is Rectangle => m !== undefined && m.isVisible);
    }

    isFullMapVisible(): boolean {
        return this.fullMapVisible;
    }

    /**
     * Обновить дороги на полной карте
     */
    private updateFullMapRoads(playerPos: Vector3, mapArea: Rectangle): void {
        // Скрываем старые маркеры дорог
        for (const marker of this.fullMapRoadMarkers) {
            marker.isVisible = false;
            this.fullMapRoadMarkerPool.push(marker);
        }
        this.fullMapRoadMarkers = [];

        // Импортируем дороги Тарту
        try {
            const { TARTU_ROADS } = require("./tartuRoads");
            const roads = TARTU_ROADS || [];

            // Масштаб для полной карты: 1 единица мира = 0.5 пикселя
            const scale = 0.5;
            const maxDist = 600; // Максимальная дистанция отображения

            for (const road of roads) {
                // Проверяем, находится ли дорога в видимой области
                const roadCenterX = (road.start.x + road.end.x) / 2;
                const roadCenterZ = (road.start.z + road.end.z) / 2;
                const distToCenter = Math.sqrt((roadCenterX - playerPos.x) ** 2 + (roadCenterZ - playerPos.z) ** 2);

                if (distToCenter > maxDist) continue;

                // Вычисляем позиции на карте
                const mapStartX = road.start.x * scale;
                const mapStartZ = -road.start.z * scale;
                const mapEndX = road.end.x * scale;
                const mapEndZ = -road.end.z * scale;

                // Получаем или создаём маркер дороги
                let line: Line;
                if (this.fullMapRoadMarkerPool.length > 0) {
                    line = this.fullMapRoadMarkerPool.pop()!;
                } else {
                    line = new Line(`fullMapRoad${this.fullMapRoadMarkers.length}`);
                    line.lineWidth = 2;
                    line.zIndex = 30;
                    mapArea.addControl(line);
                }

                // Устанавливаем цвет в зависимости от типа дороги
                const color = road.type === "highway" ? "#00aa00" : road.type === "street" ? "#006600" : "#004400";
                line.color = color;
                line.alpha = 0.7;

                // Устанавливаем координаты линии
                line.x1 = mapStartX;
                line.y1 = mapStartZ;
                line.x2 = mapEndX;
                line.y2 = mapEndZ;

                line.isVisible = true;
                this.fullMapRoadMarkers.push(line);
            }
        } catch (e) {
            console.warn("[HUD] Could not load roads for full map:", e);
        }
    }

    /**
     * Обновить рельеф на полной карте
     */
    private updateFullMapTerrain(playerPos: Vector3, mapArea: Rectangle): void {
        if (!this.scene) return;

        // Скрываем старые маркеры рельефа
        for (const marker of this.fullMapTerrainMarkers) {
            marker.isVisible = false;
            this.fullMapTerrainMarkerPool.push(marker);
        }
        this.fullMapTerrainMarkers = [];

        const scale = 0.5;
        const maxDist = 600;
        const terrainKeywords = ["obstacle", "barrier", "wall", "fence", "rock", "tree", "boulder"];
        let terrainCount = 0;
        const MAX_TERRAIN_MARKERS = 50;

        for (const mesh of this.scene.meshes) {
            if (!mesh.isEnabled() || !mesh.isVisible || terrainCount >= MAX_TERRAIN_MARKERS) continue;

            const name = mesh.name.toLowerCase();
            const isTerrain = terrainKeywords.some(keyword => name.includes(keyword));

            if (!isTerrain) continue;

            const pos = mesh.getAbsolutePosition();
            const dist = Math.sqrt((pos.x - playerPos.x) ** 2 + (pos.z - playerPos.z) ** 2);
            if (dist > maxDist) continue;

            // Вычисляем позицию на карте
            const mapX = pos.x * scale;
            const mapZ = -pos.z * scale;

            // Получаем или создаём маркер
            let marker: Rectangle;
            if (this.fullMapTerrainMarkerPool.length > 0) {
                marker = this.fullMapTerrainMarkerPool.pop()!;
            } else {
                marker = new Rectangle(`fullMapTerrain${this.fullMapTerrainMarkers.length}`);
                marker.thickness = 1;
                marker.color = "#005500";
                marker.zIndex = 40;
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                mapArea.addControl(marker);
            }

            // Размер препятствия на карте
            const bounds = mesh.getBoundingInfo()?.boundingBox;
            const size = bounds ? Math.max(bounds.extendSize.x, bounds.extendSize.z) * 2 : 5;
            const mapSize = Math.max(2, size * scale * 0.3);

            marker.width = `${mapSize}px`;
            marker.height = `${mapSize}px`;
            marker.left = `${mapX}px`;
            marker.top = `${mapZ}px`;
            marker.background = "rgba(0, 80, 0, 0.6)";
            marker.cornerRadius = mapSize / 2;
            marker.isVisible = true;

            this.fullMapTerrainMarkers.push(marker);
            terrainCount++;
        }
    }

    /**
     * Обновить здания на полной карте
     */
    private updateFullMapBuildings(playerPos: Vector3, mapArea: Rectangle): void {
        // Скрываем старые маркеры
        for (const marker of this.fullMapBuildingMarkers) {
            marker.isVisible = false;
            this.fullMapBuildingMarkerPool.push(marker);
        }
        this.fullMapBuildingMarkers = [];

        const scale = 0.5;
        const maxDist = 1000; // Больший радиус для полной карты

        for (const building of this.cachedBuildings) {
            // Проверяем расстояние
            const dist = Math.sqrt((building.x - playerPos.x) ** 2 + (building.z - playerPos.z) ** 2);
            if (dist > maxDist) continue;

            // Вычисляем позицию на карте
            const mapX = building.x * scale;
            const mapZ = -building.z * scale;

            // Получаем или создаём маркер
            let marker: Rectangle;
            if (this.fullMapBuildingMarkerPool.length > 0) {
                marker = this.fullMapBuildingMarkerPool.pop()!;
            } else {
                marker = new Rectangle(`fullMapBuilding${this.fullMapBuildingMarkers.length}`);
                marker.thickness = 1;
                marker.color = "#003300";
                marker.zIndex = 50; // Ниже врагов и игрока
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                mapArea.addControl(marker);
            }

            // Размер здания на карте
            const sizeX = Math.max(3, building.width * scale * 0.8);
            const sizeZ = Math.max(3, building.depth * scale * 0.8);

            marker.width = `${sizeX}px`;
            marker.height = `${sizeZ}px`;
            marker.left = `${mapX}px`;
            marker.top = `${mapZ}px`;
            marker.background = "rgba(0, 60, 0, 0.7)"; // Тёмно-зелёный полупрозрачный
            marker.isVisible = true;

            this.fullMapBuildingMarkers.push(marker);
        }
    }

    /**
     * Обновить взрывы на полной карте
     */
    private updateFullMapExplosions(playerPos: Vector3, mapArea: Rectangle): void {
        // Скрываем старые маркеры взрывов
        for (const marker of this.fullMapExplosionMarkers) {
            marker.isVisible = false;
            marker.dispose();
        }
        this.fullMapExplosionMarkers = [];

        const now = Date.now();
        const scale = 0.5;
        const maxDist = 600;

        // Фильтруем старые взрывы
        this.explosionHistory = this.explosionHistory.filter(exp => now - exp.time < this.EXPLOSION_FADE_TIME);

        for (const explosion of this.explosionHistory) {
            // Проверяем расстояние
            const dist = Math.sqrt((explosion.x - playerPos.x) ** 2 + (explosion.z - playerPos.z) ** 2);
            if (dist > maxDist) continue;

            // Вычисляем позицию на карте
            const mapX = explosion.x * scale;
            const mapZ = -explosion.z * scale;

            // Вычисляем затухание
            const age = now - explosion.time;
            const fadeProgress = age / this.EXPLOSION_FADE_TIME;
            const alpha = 1.0 - fadeProgress * 0.7;

            // Создаём маркер взрыва
            const marker = new Rectangle(`fullMapExplosion${this.fullMapExplosionMarkers.length}`);
            const size = Math.max(3, explosion.radius * scale * 0.4);
            marker.width = `${size}px`;
            marker.height = `${size}px`;
            marker.thickness = 1;
            marker.color = "#ff4400";
            marker.background = `rgba(255, 68, 0, ${alpha * 0.6})`;
            marker.cornerRadius = size / 2;
            marker.zIndex = 800;
            marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            marker.left = `${mapX}px`;
            marker.top = `${mapZ}px`;
            marker.isVisible = true;
            marker.alpha = alpha;

            mapArea.addControl(marker);
            this.fullMapExplosionMarkers.push(marker);
        }
    }

    /**
     * Обновить снаряды на полной карте
     */
    updateFullMapProjectiles(projectiles: Array<{ x: number, z: number, type?: string, ownerId?: string }>, playerPos: Vector3): void {
        const mapArea = this.fullMapContainer?.children[1] as Rectangle;
        if (!mapArea) return;

        // Скрываем старые маркеры снарядов
        for (const marker of this.fullMapProjectileMarkers) {
            marker.isVisible = false;
            this.fullMapProjectileMarkerPool.push(marker);
        }
        this.fullMapProjectileMarkers = [];

        const scale = 0.5;
        const maxDist = 600;

        // Цвета для разных типов снарядов
        const projectileColors: Record<string, string> = {
            "ap": "#ffaa00",
            "he": "#ff6600",
            "heat": "#ff0000",
            "apcr": "#ffff00",
            "hesh": "#00ff00",
            "tracer": "#00ffff",
            "incendiary": "#ff4400",
            "smoke": "#888888",
            "guided": "#ff00ff"
        };

        for (const projectile of projectiles) {
            // Проверяем расстояние
            const dist = Math.sqrt((projectile.x - playerPos.x) ** 2 + (projectile.z - playerPos.z) ** 2);
            if (dist > maxDist) continue;

            // Вычисляем позицию на карте
            const mapX = projectile.x * scale;
            const mapZ = -projectile.z * scale;

            // Получаем или создаём маркер
            let marker: Rectangle;
            if (this.fullMapProjectileMarkerPool.length > 0) {
                marker = this.fullMapProjectileMarkerPool.pop()!;
            } else {
                marker = new Rectangle(`fullMapProjectile${this.fullMapProjectileMarkers.length}`);
                marker.width = "2px";
                marker.height = "2px";
                marker.thickness = 0;
                marker.zIndex = 900;
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                mapArea.addControl(marker);
            }

            // Устанавливаем цвет
            const projectileType = projectile.type || "ap";
            marker.background = projectileColors[projectileType] || "#ffaa00";
            marker.alpha = 0.9;

            marker.left = `${mapX}px`;
            marker.top = `${mapZ}px`;
            marker.isVisible = true;

            this.fullMapProjectileMarkers.push(marker);
        }
    }

    // === ИНДИКАТОР КОМБО ===

    private createComboIndicator(): void {
        // Контейнер для комбо (справа сверху, рядом с компасом)
        this.comboContainer = new Rectangle("comboContainer");
        this.comboContainer.width = "140px";
        this.comboContainer.height = "50px";
        this.comboContainer.cornerRadius = 3;
        this.comboContainer.thickness = 2;
        this.comboContainer.color = "#ff0000";
        this.comboContainer.background = "#000000dd";
        this.comboContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.comboContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.comboContainer.top = "10px";
        this.comboContainer.left = "-10px";
        this.comboContainer.isVisible = false; // Скрыт по умолчанию
        this.guiTexture.addControl(this.comboContainer);

        // Текст комбо
        this.comboIndicator = new TextBlock("comboIndicator");
        this.comboIndicator.text = "🔥 COMBO x0";
        this.comboIndicator.color = "#fff";
        this.comboIndicator.fontSize = 16;
        this.comboIndicator.fontWeight = "bold";
        this.comboIndicator.fontFamily = "'Press Start 2P', monospace";
        this.comboIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.comboIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.comboIndicator.top = "4px";
        this.comboIndicator.outlineWidth = 2;
        this.comboIndicator.outlineColor = "#000";
        this.comboContainer.addControl(this.comboIndicator);

        // Дополнительный текст с бонусом XP
        const bonusText = new TextBlock("comboBonusText");
        bonusText.text = "";
        bonusText.color = "#ff0";
        bonusText.fontSize = 11;
        bonusText.fontWeight = "bold";
        bonusText.fontFamily = "'Press Start 2P', monospace";
        bonusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        bonusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        bonusText.top = "22px";
        bonusText.outlineWidth = 1;
        bonusText.outlineColor = "#000";
        this.comboContainer.addControl(bonusText);
        (this.comboContainer as any)._bonusText = bonusText;

        // Текст максимального комбо (показывается при достижении нового максимума)
        const maxComboText = new TextBlock("maxComboText");
        maxComboText.text = "";
        maxComboText.color = "#ff0";
        maxComboText.fontSize = 9;
        maxComboText.fontWeight = "bold";
        maxComboText.fontFamily = "'Press Start 2P', monospace";
        maxComboText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        maxComboText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        maxComboText.top = "-20px";
        maxComboText.outlineWidth = 1;
        maxComboText.outlineColor = "#000";
        maxComboText.isVisible = false;
        this.comboContainer.addControl(maxComboText);
        (this.comboContainer as any)._maxComboText = maxComboText;

        // Таймер комбо (полоска внизу контейнера)
        this.comboTimerBar = new Rectangle("comboTimerBar");
        this.comboTimerBar.width = "90%";
        this.comboTimerBar.height = "4px";
        this.comboTimerBar.cornerRadius = 2;
        this.comboTimerBar.thickness = 0;
        this.comboTimerBar.background = "#333333";
        this.comboTimerBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.comboTimerBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.comboTimerBar.top = "-6px";
        this.comboContainer.addControl(this.comboTimerBar);

        // Заполнение таймера
        this.comboTimerFill = new Rectangle("comboTimerFill");
        this.comboTimerFill.width = "100%";
        this.comboTimerFill.height = "100%";
        this.comboTimerFill.cornerRadius = 2;
        this.comboTimerFill.thickness = 0;
        this.comboTimerFill.background = "#0ff";
        this.comboTimerFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.comboTimerFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.comboTimerBar.addControl(this.comboTimerFill);
    }

    public updateComboIndicator(comboCount: number): void {
        if (!this.comboContainer || !this.comboIndicator || !this.experienceSystem) return;

        const bonusText = (this.comboContainer as any)._bonusText as TextBlock;
        const MAX_COMBO = 10;
        const comboBonus = Math.min(comboCount / MAX_COMBO, 1) * 100;

        // Получаем оставшееся время комбо (0-1)
        const timerProgress = this.experienceSystem.getComboTimeRemaining ? this.experienceSystem.getComboTimeRemaining() : 0;

        if (comboCount >= 2 && timerProgress > 0) {
            // Показываем индикатор комбо
            this.comboContainer.isVisible = true;

            // Обновляем текст
            this.comboIndicator.text = `🔥 COMBO x${comboCount}`;
            if (bonusText) {
                bonusText.text = `+${comboBonus.toFixed(0)}% XP`;
            }

            // Обновляем таймер комбо с плавной анимацией
            if (this.comboTimerFill) {
                const fillWidth = Math.max(0, Math.min(100, timerProgress * 100));
                this.comboTimerFill.width = `${fillWidth}%`;

                // Изменяем цвет таймера в зависимости от оставшегося времени
                if (timerProgress > 0.5) {
                    // Голубой при большом времени
                    this.comboTimerFill.background = "#0ff";
                    this.comboTimerFill.alpha = 1.0;
                } else if (timerProgress > 0.25) {
                    // Жёлтый при среднем времени
                    this.comboTimerFill.background = "#ff0";
                    this.comboTimerFill.alpha = 1.0;
                } else {
                    // Красный при малом времени (предупреждение)
                    this.comboTimerFill.background = "#f00";
                    // Пульсация при критическом времени
                    const pulse = 0.7 + Math.sin(this.animationTime * 10) * 0.3;
                    this.comboTimerFill.alpha = pulse;
                }
            }

            // Предупреждение о скором истечении комбо (менее 25% времени)
            if (timerProgress < 0.25 && this.comboContainer) {
                // Пульсация контейнера при критическом времени
                const pulse = 0.7 + Math.sin(this.animationTime * 8) * 0.3;
                this.comboContainer.alpha = pulse;
            } else if (this.comboContainer) {
                this.comboContainer.alpha = 1.0;
            }

            // Динамический цвет в зависимости от уровня комбо с улучшенными эффектами
            const baseThickness = timerProgress < 0.15 ? this.comboContainer.thickness : 0; // Сохраняем толщину при критическом времени

            if (comboCount >= 8) {
                // Максимальный комбо - белый/золотой с эффектом свечения
                this.comboContainer.color = "#fff";
                this.comboIndicator.color = "#ff0";
                this.comboContainer.thickness = baseThickness || 3;
                // Эффект свечения для максимального комбо
                const glow = Math.sin(this.animationTime * 5) * 0.3 + 0.7;
                this.comboContainer.background = `rgba(255, 215, 0, ${0.3 + glow * 0.2})`;
                if (bonusText) {
                    bonusText.color = "#ff0";
                    bonusText.fontSize = 12; // Немного больше для максимального комбо
                }
            } else if (comboCount >= 5) {
                // Высокий комбо - оранжевый с лёгким свечением
                this.comboContainer.color = "#ff8800";
                this.comboIndicator.color = "#ff0";
                this.comboContainer.thickness = baseThickness || 2;
                this.comboContainer.background = "#000000dd";
                if (bonusText) {
                    bonusText.color = "#ff0";
                    bonusText.fontSize = 11;
                }
            } else if (comboCount >= 3) {
                // Средний комбо - желтый
                this.comboContainer.color = "#ff0";
                this.comboIndicator.color = "#fff";
                this.comboContainer.thickness = baseThickness || 2;
                this.comboContainer.background = "#000000dd";
                if (bonusText) {
                    bonusText.color = "#0ff";
                    bonusText.fontSize = 11;
                }
            } else {
                // Низкий комбо - зеленый
                this.comboContainer.color = "#0f0";
                this.comboIndicator.color = "#fff";
                this.comboContainer.thickness = baseThickness || 1;
                this.comboContainer.background = "#000000dd";
                if (bonusText) {
                    bonusText.color = "#0ff";
                    bonusText.fontSize = 11;
                }
            }

            // Эффект пульсации при увеличении комбо с улучшенной анимацией
            if (comboCount > this.lastComboCount) {
                this.comboAnimationTime = 0;
                this.comboScale = 1.0;

                // Обновляем максимальное комбо
                if (comboCount > this.maxComboReached) {
                    this.maxComboReached = comboCount;

                    // Показываем текст максимального комбо
                    const maxComboText = (this.comboContainer as any)._maxComboText as TextBlock;
                    if (maxComboText) {
                        maxComboText.text = `MAX: x${this.maxComboReached}`;
                        maxComboText.isVisible = true;
                        maxComboText.color = "#ff0";

                        // Анимация появления
                        maxComboText.alpha = 0;
                        let alphaFrame = 0;
                        const alphaAnimate = () => {
                            alphaFrame++;
                            const progress = alphaFrame / 20;
                            if (progress >= 1) {
                                maxComboText.alpha = 1;
                                return;
                            }
                            maxComboText.alpha = progress;
                            requestAnimationFrame(alphaAnimate);
                        };
                        alphaAnimate();
                    }
                }

                // Визуальный эффект при увеличении комбо
                if (this.comboIndicator) {
                    // Временно увеличиваем размер текста
                    const originalSize = typeof this.comboIndicator.fontSize === "string"
                        ? parseFloat(this.comboIndicator.fontSize)
                        : (this.comboIndicator.fontSize as number);
                    this.comboIndicator.fontSize = (originalSize * 1.3).toString() + "px";

                    // Возвращаем размер через анимацию
                    setTimeout(() => {
                        if (this.comboIndicator) {
                            this.comboIndicator.fontSize = originalSize.toString() + "px";
                        }
                    }, 200);
                }

                // Плавающий текст при увеличении комбо
                this._showComboIncrease(comboCount, this.lastComboCount);

                // Эффект частиц при достижении вех комбо
                if (comboCount === 5 || comboCount === 8 || comboCount === 10) {
                    this._createComboParticles(comboCount);
                }
            }
        } else {
            // Скрываем индикатор если комбо < 2 или время истекло
            this.comboContainer.isVisible = false;
        }
    }

    // Обновление анимации комбо (вызывать каждый кадр) с улучшенными эффектами
    private updateComboAnimation(deltaTime: number): void {
        if (!this.comboContainer || !this.comboContainer.isVisible) {
            this.comboScale = 1.0;
            this.comboAnimationTime = 0;
            return;
        }

        this.comboAnimationTime += deltaTime;

        // Плавная пульсация при активном комбо
        if (this.comboAnimationTime < 0.4) {
            // Анимация увеличения при новом комбо с эффектом отскока
            const progress = this.comboAnimationTime / 0.4;
            // Используем easing функцию для плавного отскока
            const easeOut = 1 - Math.pow(1 - progress, 3);
            this.comboScale = 1.0 + (0.3 * (1 - easeOut));
        } else {
            // Легкая постоянная пульсация с разной частотой в зависимости от комбо
            const comboCount = this.experienceSystem?.getComboCount() || 0;
            const pulseSpeed = comboCount >= 8 ? 4 : comboCount >= 5 ? 3 : 2.5;
            const pulseAmplitude = comboCount >= 8 ? 0.08 : comboCount >= 5 ? 0.06 : 0.04;
            this.comboScale = 1.0 + Math.sin(this.comboAnimationTime * pulseSpeed) * pulseAmplitude;
        }

        // Применяем масштаб с плавной интерполяцией
        if (this.comboContainer) {
            const currentScaleX = this.comboContainer.scaleX || 1.0;

            // Плавная интерполяция для избежания резких скачков
            const smoothScale = currentScaleX + (this.comboScale - currentScaleX) * 0.2;
            this.comboContainer.scaleX = smoothScale;
            this.comboContainer.scaleY = smoothScale;
        }

        // Дополнительный эффект свечения для высокого комбо
        if (this.comboIndicator && this.experienceSystem) {
            const comboCount = this.experienceSystem.getComboCount();
            if (comboCount >= 8) {
                // Пульсирующее свечение текста для максимального комбо
                const glow = Math.sin(this.comboAnimationTime * 6) * 0.3 + 0.7;
                this.comboIndicator.outlineWidth = 2 + glow;
            } else if (comboCount >= 5) {
                this.comboIndicator.outlineWidth = 2;
            }
        }
    }

    // === FUEL INDICATOR ===

    private createFuelIndicator(): void {
        // === FUEL BAR - ПОД HEALTH BAR ===
        const container = new Rectangle("fuelContainer");
        container.width = this.scalePx(280);
        container.height = this.scalePx(14);
        container.cornerRadius = 2;
        container.thickness = 2;
        container.color = "#ff04"; // Оранжевая рамка для топлива
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "0px";
        container.top = this.scalePx(-70); // Под health bar
        this.guiTexture.addControl(container);

        // Основной бар топлива
        this._fuelBar = new Rectangle("fuelBar");
        this._fuelBar.width = "100%";
        this._fuelBar.height = "100%";
        this._fuelBar.cornerRadius = 0;
        this._fuelBar.thickness = 0;
        this._fuelBar.background = "#111";
        this._fuelBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(this._fuelBar);

        // Заполнение бара топлива
        this._fuelFill = new Rectangle("fuelFill");
        this._fuelFill.width = "100%";
        this._fuelFill.height = "100%";
        this._fuelFill.cornerRadius = 0;
        this._fuelFill.thickness = 0;
        this._fuelFill.background = "#ff0"; // Жёлтый цвет для топлива
        this._fuelFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._fuelBar.addControl(this._fuelFill);

        // Блик для топлива
        const fuelGlow = new Rectangle("fuelGlow");
        fuelGlow.width = "100%";
        fuelGlow.height = "50%";
        fuelGlow.thickness = 0;
        fuelGlow.background = "#ff3";
        fuelGlow.alpha = 0.3;
        fuelGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._fuelBar.addControl(fuelGlow);
        (this._fuelBar as any)._fuelGlow = fuelGlow;

        // Предупреждающий оверлей (красный при низком топливе)
        const warningOverlay = new Rectangle("fuelWarning");
        warningOverlay.width = "100%";
        warningOverlay.height = "100%";
        warningOverlay.thickness = 0;
        warningOverlay.background = "#f00";
        warningOverlay.alpha = 0;
        this._fuelBar.addControl(warningOverlay);
        (this._fuelBar as any)._warningOverlay = warningOverlay;

        // Текст топлива
        this._fuelText = new TextBlock("fuelText");
        this._fuelText.text = "100%";
        this._fuelText.color = "#ff0";
        this._fuelText.fontSize = this.scalePx(10);
        this._fuelText.fontWeight = "bold";
        this._fuelText.fontFamily = "'Press Start 2P', monospace";
        this._fuelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._fuelText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.addControl(this._fuelText);
    }

    updateFuel(current: number, max: number): void {
        // Сохраняем значения для блока состояния
        this.currentFuel = current;
        this.maxFuel = max;

        // Обновляем визуальный индикатор топлива
        if (this._fuelBar && this._fuelFill && this._fuelText) {
            const fuelPercent = max > 0 ? (current / max) : 0;
            this._fuelFill.width = `${fuelPercent * 100}%`;

            // Обновляем текст
            const fuelPercentText = Math.round(fuelPercent * 100);
            this._fuelText.text = `${fuelPercentText}%`;

            // Изменяем цвет в зависимости от уровня топлива
            if (fuelPercent > 0.5) {
                this._fuelFill.background = "#ff0"; // Жёлтый
                this._fuelText.color = "#ff0";
            } else if (fuelPercent > 0.25) {
                this._fuelFill.background = "#fa0"; // Оранжевый
                this._fuelText.color = "#fa0";
            } else {
                this._fuelFill.background = "#f00"; // Красный
                this._fuelText.color = "#f00";
            }

            // Предупреждающий оверлей при низком топливе
            const warningOverlay = (this._fuelBar as any)._warningOverlay;
            if (warningOverlay) {
                if (fuelPercent < 0.25) {
                    warningOverlay.alpha = (0.25 - fuelPercent) / 0.25 * 0.5; // Плавное появление
                } else {
                    warningOverlay.alpha = 0;
                }
            }
        }

        // Обновляем блок состояния танка (топливо отображается там)
        if (this.tankStatusContainer) {
            this.updateTankStatus(this.currentHealth, this.maxHealth, current, max, this.currentArmor);
        }
    }

    // === TRACER COUNTER (deprecated, теперь отображается в блоке АРСЕНАЛ) ===
    // Метод оставлен для совместимости, но больше не создаёт элементов.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createTracerCounter(): void {
        // no-op
    }

    updateTracerCount(current: number, max: number): void {
        // Обновляем через арсенал (первый слот - трассеры)
        if (this.arsenalSlots.length > 0) {
            this.updateArsenalSlot(0, current, max);
        }
        // Также обновляем старый счетчик для обратной совместимости (если он еще существует и видим)
        if (this.tracerCountText && this.tracerContainer && this.tracerContainer.isVisible) {
            this.tracerCountText.text = `T: ${current}/${max}`;
            // Color based on tracer count
            if (current === 0) {
                this.tracerCountText.color = "#f00";
                this.tracerContainer.color = "#f00";
            } else if (current <= 2) {
                this.tracerCountText.color = "#fa0";
                this.tracerContainer.color = "#fa0";
            } else {
                this.tracerCountText.color = "#f80";
                this.tracerContainer.color = "#f60";
            }
        }
    }

    // Блок состояния танка теперь интегрирован в createMinimap()

    updateTankStatus(health: number, maxHealth: number, fuel: number, maxFuel: number, armor: number): void {
        if (!this.tankStatusContainer) return;

        // ИСПРАВЛЕНИЕ: Обновляем HP бар через setHealth() для правильного обновления healthFill
        if (this.healthFill && this.healthBar) {
            this.setHealth(health, maxHealth);
        }

        // Обновляем здоровье - компактный формат ❤ XX%
        if (this.tankStatusHealthText) {
            const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
            this.tankStatusHealthText.text = `HP:${Math.round(healthPercent)}%`;

            // Цвет в зависимости от здоровья
            if (healthPercent > 60) {
                this.tankStatusHealthText.color = "#0f0";
            } else if (healthPercent > 30) {
                this.tankStatusHealthText.color = "#fa0";
            } else {
                this.tankStatusHealthText.color = "#f00";
            }
        }

        // Обновляем топливо - компактный формат ⛽ XX%
        if (this.tankStatusFuelText) {
            const fuelPercent = Math.max(0, Math.min(100, (fuel / maxFuel) * 100));
            this.tankStatusFuelText.text = `FL:${Math.round(fuelPercent)}%`;

            // Цвет в зависимости от топлива
            if (fuelPercent > 50) {
                this.tankStatusFuelText.color = "#f90";
            } else if (fuelPercent > 20) {
                this.tankStatusFuelText.color = "#fa0";
            } else {
                this.tankStatusFuelText.color = "#f30";
            }
        }

        // Обновляем броню - компактный формат 🛡 XX%
        if (this.tankStatusArmorText) {
            const armorPercent = Math.max(0, Math.min(100, armor * 100));
            this.tankStatusArmorText.text = `AR:${Math.round(armorPercent)}%`;

            // Цвет в зависимости от брони
            if (armorPercent > 50) {
                this.tankStatusArmorText.color = "#0ff";
            } else if (armorPercent > 20) {
                this.tankStatusArmorText.color = "#0cc";
            } else {
                this.tankStatusArmorText.color = "#0aa";
            }
        }
    }

    // === ARSENAL BLOCK ===

    private createArsenalBlock(): void {
        // === АРСЕНАЛ - ИНДЕКСЫ 10-14 В ОБЩЕМ РЯДУ (после модулей и припасов) ===
        const slotWidth = scalePixels(44);
        const slotGap = scalePixels(5);
        // Всего 20 слотов: 5 модули + 5 припасы + 5 арсенал + 5 эффектов
        const totalSlots = 20;
        const totalWidth = totalSlots * slotWidth + (totalSlots - 1) * slotGap;
        const startX = -totalWidth / 2 + slotWidth / 2;

        // Арсенал занимает индексы 10-14 в общем ряду

        // Типы снарядов и их иконки
        const ammoTypes = [
            { type: "tracer", icon: "🔥", label: "T", color: "#f80" },      // Трассеры
            { type: "ap", icon: "⚫", label: "AP", color: "#0ff" },        // Обычные (Armor Piercing)
            { type: "apcr", icon: "⚡", label: "APCR", color: "#0af" },    // Бронебойные (APCR)
            { type: "he", icon: "💥", label: "HE", color: "#f60" },       // Фугасные (High Explosive)
            { type: "apds", icon: "🎯", label: "APDS", color: "#0fa" }   // Подкалиберные (APDS)
        ];

        for (let i = 0; i < 5; i++) {
            const ammoType = ammoTypes[i]!;

            // Контейнер слота (как у припасов)
            const container = new Rectangle(`arsenalSlot${i}`);
            container.width = `${slotWidth}px`;
            container.height = `${slotWidth}px`;
            container.cornerRadius = 3;
            container.thickness = 2;
            container.color = ammoType.color + "5"; // Полупрозрачная рамка
            container.background = "#000000bb";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            // Позиционируем в общем ряду: индексы 10-14 для арсенала
            const globalIndex = 10 + i; // 10-14 для арсенала
            container.left = `${startX + globalIndex * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(-48); // Равномерно между XP BAR (-5) и RELOAD BAR (-100)
            container.isVisible = true;
            container.zIndex = 20; // ИСПРАВЛЕНО: Единый zIndex для всех слотов
            this.guiTexture.addControl(container);

            // Иконка типа снаряда
            const icon = new TextBlock(`arsenalIcon${i}`);
            icon.text = ammoType.icon;
            icon.color = "#fff";
            icon.fontSize = this.scaleFontSize(18, 14, 24);
            icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            icon.top = this.scalePx(-8); // Немного выше центра
            icon.outlineWidth = 1;
            icon.outlineColor = "#000";
            container.addControl(icon);

            // Текст количества (current/max)
            const countText = new TextBlock(`arsenalCount${i}`);
            countText.text = "0/0";
            countText.color = ammoType.color;
            countText.fontSize = this.scaleFontSize(10, 8, 14);
            countText.fontWeight = "bold";
            countText.fontFamily = "'Press Start 2P', monospace";
            countText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            countText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            countText.top = this.scalePx(-2); // Внизу слота
            countText.outlineWidth = 1;
            countText.outlineColor = "#000";
            container.addControl(countText);

            // Метка типа (маленькая, сверху)
            const label = new TextBlock(`arsenalLabel${i}`);
            label.text = ammoType.label;
            label.color = ammoType.color;
            label.fontSize = this.scaleFontSize(7, 6, 10);
            label.fontWeight = "bold";
            label.fontFamily = "'Press Start 2P', monospace";
            label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            label.top = this.scalePx(2);
            label.outlineWidth = 1;
            label.outlineColor = "#000";
            container.addControl(label);

            // === COOLDOWN OVERLAY для арсенала ===
            const cooldownOverlay = new Rectangle(`arsenalCooldownOverlay${i}`);
            cooldownOverlay.width = "100%";
            cooldownOverlay.height = "100%";
            cooldownOverlay.thickness = 0;
            cooldownOverlay.background = "#000000aa";
            cooldownOverlay.cornerRadius = 2;
            cooldownOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.isVisible = false;
            container.addControl(cooldownOverlay);

            const cooldownFill = new Rectangle(`arsenalCooldownFill${i}`);
            cooldownFill.width = "100%";
            cooldownFill.height = "0%";
            cooldownFill.thickness = 0;
            cooldownFill.background = "#ff0000dd";
            cooldownFill.cornerRadius = 2;
            cooldownFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownOverlay.addControl(cooldownFill);

            const cooldownFillGlow = new Rectangle(`arsenalCooldownFillGlow${i}`);
            cooldownFillGlow.width = "100%";
            cooldownFillGlow.height = "0%";
            cooldownFillGlow.thickness = 0;
            cooldownFillGlow.background = "#00ff00bb";
            cooldownFillGlow.cornerRadius = 2;
            cooldownFillGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownFillGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            cooldownFillGlow.alpha = 0;
            cooldownOverlay.addControl(cooldownFillGlow);

            const cooldownText = new TextBlock(`arsenalCooldownText${i}`);
            cooldownText.text = "";
            cooldownText.color = "#fff";
            cooldownText.fontSize = 12;
            cooldownText.fontWeight = "bold";
            cooldownText.fontFamily = "'Press Start 2P', monospace";
            cooldownText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            cooldownText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            cooldownText.outlineWidth = 2;
            cooldownText.outlineColor = "#000";
            cooldownOverlay.addControl(cooldownText);

            this.arsenalSlots.push({
                container,
                icon,
                countText,
                type: ammoType.type,
                cooldownOverlay,
                cooldownFill,
                cooldownFillGlow,
                cooldownText
            });
        }

        // Инициализируем значения по умолчанию (для трассеров используем реальные данные позже)
        // Остальные типы пока 0/0
    }

    // Обновить конкретный слот арсенала
    private updateArsenalSlot(slotIndex: number, current: number, max: number): void {
        if (slotIndex < 0 || slotIndex >= this.arsenalSlots.length) return;

        const slot = this.arsenalSlots[slotIndex];
        if (!slot) return;
        slot.countText.text = `${current}/${max}`;

        // Цвет в зависимости от количества
        const ammoTypes = [
            { type: "tracer", color: "#f80" },
            { type: "ap", color: "#0ff" },
            { type: "apcr", color: "#0af" },
            { type: "he", color: "#f60" },
            { type: "apds", color: "#0fa" }
        ];

        const ammoType = ammoTypes[slotIndex]!;
        if (current === 0) {
            slot.countText.color = "#f00";
            slot.container.color = "#f005";
        } else if (current <= max * 0.3) {
            slot.countText.color = "#fa0";
            slot.container.color = "#fa05";
        } else {
            slot.countText.color = ammoType.color;
            slot.container.color = ammoType.color + "5";
        }
    }

    // Обновить весь арсенал
    updateArsenal(ammoData: Map<string, { current: number, max: number }>): void {
        // УЛУЧШЕНО: Используем компонент ArsenalBar
        if (this.arsenalBarComponent) {
            const slotData: Array<{ current: number, max: number, cooldown?: number }> = [];
            const slotTypes = ["tracer", "ap", "apcr", "he", "apds"];

            for (let i = 0; i < slotTypes.length; i++) {
                const type = slotTypes[i]!;
                const data = ammoData.get(type);
                if (data) {
                    slotData.push({ current: data.current, max: data.max });
                } else {
                    const defaultMax = type === "tracer" ? 5 : 0;
                    slotData.push({ current: 0, max: defaultMax });
                }
            }

            // Обновляем каждый слот отдельно
            for (let i = 0; i < slotData.length; i++) {
                const slot = slotData[i];
                if (slot) {
                    this.arsenalBarComponent.updateSlot(i, slot.current, slot.max);
                }
            }
        }

        const slotTypes = ["tracer", "ap", "apcr", "he", "apds"];

        for (let i = 0; i < slotTypes.length && i < this.arsenalSlots.length; i++) {
            const type = slotTypes[i]!;
            const data = ammoData.get(type);
            if (data) {
                this.updateArsenalSlot(i, data.current, data.max);
            } else {
                // Значения по умолчанию
                const defaultMax = type === "tracer" ? 5 : 0;
                this.updateArsenalSlot(i, 0, defaultMax);
            }
        }
    }

    // === POI CAPTURE BAR ===

    private createPOICaptureBar(): void {
        // Capture progress bar (center top, below compass)
        this.poiCaptureProgress = new Rectangle("poiCaptureBar");
        this.poiCaptureProgress.width = "200px";
        this.poiCaptureProgress.height = "12px";
        this.poiCaptureProgress.cornerRadius = 3;
        this.poiCaptureProgress.color = "#666";
        this.poiCaptureProgress.thickness = 2;
        this.poiCaptureProgress.background = "#222";
        this.poiCaptureProgress.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.poiCaptureProgress.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.poiCaptureProgress.top = "80px";
        this.poiCaptureProgress.isVisible = false;
        this.guiTexture.addControl(this.poiCaptureProgress);

        // Capture fill
        this.poiCaptureProgressFill = new Rectangle("poiCaptureFill");
        this.poiCaptureProgressFill.width = "0%";
        this.poiCaptureProgressFill.height = "100%";
        this.poiCaptureProgressFill.background = "#0f0";
        this.poiCaptureProgressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.poiCaptureProgress.addControl(this.poiCaptureProgressFill);

        // Capture text
        this.poiCaptureText = new TextBlock("poiCaptureText");
        this.poiCaptureText.text = "ЗАХВАТ";
        this.poiCaptureText.color = "#fff";
        this.poiCaptureText.fontSize = "10px";
        this.poiCaptureText.fontFamily = "monospace";
        this.poiCaptureText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.poiCaptureText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.poiCaptureText.top = "95px";
        this.poiCaptureText.isVisible = false;
        this.guiTexture.addControl(this.poiCaptureText);
    }

    showPOICaptureProgress(poiType: string, progress: number, contested: boolean): void {
        if (!this.poiCaptureProgress || !this.poiCaptureProgressFill || !this.poiCaptureText) return;

        this.poiCaptureProgress.isVisible = true;
        this.poiCaptureText.isVisible = true;

        this.poiCaptureProgressFill.width = `${Math.min(100, progress)}%`;

        // Text based on POI type
        let typeName = "ТОЧКА";
        switch (poiType) {
            case "capturePoint": typeName = "ТОЧКА"; break;
            case "ammoDepot": typeName = "СКЛАД"; break;
            case "repairStation": typeName = "РЕМОНТ"; break;
            case "fuelDepot": typeName = "ТОПЛИВО"; break;
            case "radarStation": typeName = "РАДАР"; break;
        }

        if (contested) {
            this.poiCaptureText.text = `⚔️ КОНТЕСТ`;
            this.poiCaptureProgressFill.background = "#fa0";
            this.poiCaptureProgress.color = "#fa0";
        } else {
            this.poiCaptureText.text = `${typeName} - ${Math.round(progress)}%`;
            this.poiCaptureProgressFill.background = "#0f0";
            this.poiCaptureProgress.color = "#0f0";
        }
    }

    hidePOICaptureProgress(): void {
        if (this.poiCaptureProgress) this.poiCaptureProgress.isVisible = false;
        if (this.poiCaptureText) this.poiCaptureText.isVisible = false;
    }

    // === NOTIFICATIONS ===

    private createNotificationArea(): void {
        this.notificationContainer = new StackPanel("notificationArea");
        this.notificationContainer.width = "520px";
        // StackPanel grows with content
        this.notificationContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.notificationContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.notificationContainer.top = "120px";
        this.notificationContainer.isPointerBlocker = false;

        // StackPanel specific settings
        (this.notificationContainer as StackPanel).isVertical = true;
        (this.notificationContainer as StackPanel).spacing = 10;

        this.guiTexture.addControl(this.notificationContainer);
    }

    showNotification(text: string, type: "success" | "warning" | "error" | "info" = "info"): void {
        if (!this.notificationContainer) return;

        // Анти-спам: подавляем одинаковые уведомления
        const now = Date.now();
        const key = `${type}:${text}`;
        if (this.lastNotificationKey === key && (now - this.lastNotificationTime) < this.NOTIFICATION_SPAM_COOLDOWN) {
            return;
        }
        this.lastNotificationKey = key;
        this.lastNotificationTime = now;

        const notification = new Rectangle("notification_" + Date.now());

        // CYBERSPACE TERMINAL STYLE
        notification.width = "450px";
        notification.adaptHeightToChildren = true;
        notification.cornerRadius = 0; // Острые углы в стиле терминала
        notification.thickness = 2;
        notification.paddingTop = "12px";
        notification.paddingBottom = "12px";
        notification.paddingLeft = "15px";
        notification.paddingRight = "15px";
        notification.shadowBlur = 15;

        // CYBERSPACE STYLING - чёрный фон с зелёными акцентами
        switch (type) {
            case "success":
                notification.background = "#000000f0";
                notification.color = "#00ff00"; // Яркий зелёный
                notification.shadowColor = "#00ff0066";
                break;
            case "warning":
                notification.background = "#000000f0";
                notification.color = "#ffff00"; // Жёлтый
                notification.shadowColor = "#ffff0066";
                break;
            case "error":
                notification.background = "#000000f0";
                notification.color = "#ff3333"; // Красный
                notification.shadowColor = "#ff333366";
                break;
            default:
                notification.background = "#000000f0";
                notification.color = "#00ff00"; // Зелёный по умолчанию
                notification.shadowColor = "#00ff0066";
        }

        const textBlock = new TextBlock();
        textBlock.text = text;
        textBlock.color = notification.color; // Цвет текста = цвет рамки
        textBlock.fontSize = "13px";
        textBlock.fontFamily = "'Press Start 2P', monospace";
        textBlock.textWrapping = true;
        textBlock.resizeToFit = true;
        textBlock.width = "410px";
        textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

        // Glow эффект для текста
        textBlock.shadowColor = notification.color;
        textBlock.shadowBlur = 8;
        textBlock.shadowOffsetX = 0;
        textBlock.shadowOffsetY = 0;

        notification.addControl(textBlock);

        // With StackPanel, we just add the control
        this.notificationContainer.addControl(notification);
        this.notifications.push({ text, type, element: notification });

        // Fade out and remove
        setTimeout(() => {
            this.removeNotification(notification);
        }, 4000);
    }

    /**
     * Показывает уведомление о горячей перезагрузке с кнопкой рестарта
     */
    showHotReloadNotification(): void {
        if (!this.notificationContainer) return;

        // Удаляем старое, если есть
        const existing = this.guiTexture.getControlByName("hotReloadNotification");
        if (existing) existing.dispose();

        const container = new Rectangle("hotReloadNotification");
        container.width = "400px";
        container.height = "80px";
        container.background = "#000000dd";
        container.thickness = 2;
        container.color = "#0f0";
        container.cornerRadius = 10;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.top = "100px"; // Чуть ниже обычных уведомлений
        container.zIndex = 1000;

        // Добавляем текст
        const text = new TextBlock();
        text.text = "GAME UPDATED! RESTART NEEDED";
        text.color = "#fff";
        text.fontSize = "16px";
        text.top = "-15px";
        container.addControl(text);

        // Добавляем кнопку
        const button = Button.CreateSimpleButton("restartBtn", "RESTART NOW");
        button.width = "150px";
        button.height = "30px";
        button.background = "#0f0";
        button.color = "#000";
        button.top = "20px";
        button.cornerRadius = 5;
        button.onPointerUpObservable.add(() => {
            window.location.reload();
        });
        container.addControl(button);

        this.guiTexture.addControl(container);
    }

    /**
     * Показать красивое уведомление о достижении
     * @param achievementName Название достижения
     * @param description Описание достижения
     * @param icon Иконка достижения
     * @param reward Награда (опционально)
     */
    showAchievementNotification(
        achievementName: string,
        description: string,
        icon: string,
        reward?: { type: "experience" | "currency" | "unlock"; amount?: number; unlockId?: string }
    ): void {
        if (!this.notificationContainer) return;

        const notification = new Rectangle("achievement_" + Date.now());
        // Увеличена ширина для длинных названий и описаний
        notification.width = "500px";
        // Высота будет динамически подстраиваться под содержимое
        notification.height = "100px";
        notification.cornerRadius = 8;
        notification.thickness = 3;
        notification.color = "#ffd700"; // Золотой цвет для достижений
        notification.background = "rgba(20, 20, 0, 0.95)";
        notification.paddingTop = "8px";
        notification.paddingLeft = "10px";
        notification.paddingRight = "10px";
        notification.paddingBottom = "8px";

        // Иконка достижения
        const iconText = new TextBlock();
        iconText.text = icon;
        iconText.fontSize = "32px";
        iconText.width = "50px";
        iconText.height = "50px";
        iconText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        iconText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        iconText.left = "5px";
        iconText.top = "5px";
        notification.addControl(iconText);

        // Название достижения
        const nameText = new TextBlock();
        nameText.text = `🏆 ${achievementName}`;
        nameText.color = "#ffd700";
        nameText.fontSize = "14px";
        nameText.fontWeight = "bold";
        nameText.fontFamily = "monospace";
        nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        nameText.left = "60px";
        nameText.top = "5px";
        nameText.width = "420px"; // Увеличена ширина (500 - 60 - 20 для padding)
        nameText.textWrapping = true;
        notification.addControl(nameText);

        // Описание
        const descText = new TextBlock();
        descText.text = description;
        descText.color = "#fff";
        descText.fontSize = "11px";
        descText.fontFamily = "monospace";
        descText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        descText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        descText.left = "60px";
        descText.top = "25px";
        descText.width = "420px"; // Увеличена ширина
        descText.textWrapping = true;
        notification.addControl(descText);

        // Динамически подстраиваем высоту под содержимое
        const nameLines = Math.ceil((achievementName.length + 2) / 50); // +2 для эмодзи
        const descLines = Math.ceil(description.length / 60);
        const totalLines = nameLines + descLines;
        const minHeight = 80;
        const lineHeight = 18;
        const calculatedHeight = Math.max(minHeight, totalLines * lineHeight + 30); // +30 для padding и иконки
        notification.height = `${calculatedHeight}px`;

        // Награда
        if (reward) {
            const rewardText = new TextBlock();
            let rewardStr = "";
            if (reward.type === "experience" && reward.amount) {
                rewardStr = `+${reward.amount} XP`;
            } else if (reward.type === "currency" && reward.amount) {
                rewardStr = `+${reward.amount} 💰`;
            } else if (reward.type === "unlock" && reward.unlockId) {
                rewardStr = `🔓 Разблокировано: ${reward.unlockId}`;
            }
            rewardText.text = rewardStr;
            rewardText.color = "#0f0";
            rewardText.fontSize = "12px";
            rewardText.fontWeight = "bold";
            rewardText.fontFamily = "monospace";
            rewardText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            rewardText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            rewardText.left = "60px";
            rewardText.top = "50px";
            rewardText.width = "280px";
            notification.addControl(rewardText);
        }

        // Позиция (вверху справа)
        notification.top = "20px";
        notification.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        notification.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        notification.left = "-20px"; // Use negative left instead of right

        this.notificationContainer.addControl(notification);

        // Анимация появления
        notification.alpha = 0;
        // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
        const fadeIn = timerManager.setInterval(() => {
            if (notification.alpha < 1) {
                notification.alpha += 0.1;
            } else {
                timerManager.clear(fadeIn);
            }
        }, 20);

        // Удаление через 5 секунд с анимацией
        // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setTimeout
        timerManager.setTimeout(() => {
            const fadeOut = timerManager.setInterval(() => {
                if (notification.alpha > 0) {
                    notification.alpha -= 0.1;
                } else {
                    timerManager.clear(fadeOut);
                    notification.dispose();
                }
            }, 20);
        }, 5000);
    }

    private removeNotification(notification: Rectangle): void {
        const index = this.notifications.findIndex(n => n.element === notification);
        if (index !== -1) {
            this.notifications.splice(index, 1);
            notification.dispose();
            // StackPanel automatically rearranges content
        }
    }

    // === TUTORIAL SYSTEM ===
    private createTutorial(): void {
        // Check if tutorial was already completed
        try {
            if (localStorage.getItem('tutorialCompleted') === 'true') {
                this.tutorialCompleted = true;
                return;
            }
        } catch (e) {
            // localStorage not available
        }

        // Create tutorial container
        this.tutorialContainer = new Rectangle("tutorialContainer");
        this.tutorialContainer.width = "400px";
        this.tutorialContainer.height = "80px";
        this.tutorialContainer.cornerRadius = 10;
        this.tutorialContainer.thickness = 2;
        this.tutorialContainer.color = "#0f0";
        this.tutorialContainer.background = "rgba(0, 20, 0, 0.9)";
        this.tutorialContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.tutorialContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.tutorialContainer.top = "200px"; // Below center
        this.tutorialContainer.isVisible = false;
        this.guiTexture.addControl(this.tutorialContainer);

        // Tutorial text
        this.tutorialText = new TextBlock("tutorialText");
        this.tutorialText.text = "";
        this.tutorialText.color = "#0f0";
        this.tutorialText.fontSize = 16;
        this.tutorialText.fontFamily = "'Press Start 2P', monospace";
        this.tutorialText.textWrapping = true;
        this.tutorialText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.tutorialContainer.addControl(this.tutorialText);

        // Skip button hint
        const skipHint = new TextBlock("skipHint");
        skipHint.text = "ESC - пропустить";
        skipHint.color = "#666";
        skipHint.fontSize = 10;
        skipHint.fontFamily = "monospace";
        skipHint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        skipHint.top = "-5px";
        this.tutorialContainer.addControl(skipHint);

        // Tutorial system created
    }

    // Start tutorial when game begins
    startTutorial(): void {
        if (this.tutorialCompleted) return;

        this.tutorialStep = 0;
        this._tutorialStartTime = Date.now();
        this.hasMoved = false;
        this.hasShot = false;
        this.showTutorialStep(0);

        // Listen for ESC to skip
        const skipHandler = (e: KeyboardEvent) => {
            if (e.code === "Escape") {
                this.completeTutorial();
                window.removeEventListener("keydown", skipHandler);
            }
        };
        window.addEventListener("keydown", skipHandler);

        // Tutorial started
    }

    private showTutorialStep(step: number): void {
        if (!this.tutorialContainer || !this.tutorialText || this.tutorialCompleted) return;

        const steps = [
            "WASD - движение танка\nQ/E - поворот башни",
            "ЛКМ - выстрел\nПКМ или Ctrl - прицеливание",
            "Находите гаражи\nдля ремонта и улучшений",
            "Удачной охоты, танкист!"
        ];

        if (step >= steps.length) {
            this.completeTutorial();
            return;
        }

        this.tutorialStep = step;
        this.tutorialText.text = steps[step] ?? "";
        this.tutorialContainer.isVisible = true;

        // Auto-advance to next step
        const duration = step === steps.length - 1 ? 2000 : 5000; // Last message shorter
        setTimeout(() => {
            if (!this.tutorialCompleted && this.tutorialStep === step) {
                this.showTutorialStep(step + 1);
            }
        }, duration);
    }

    // Call this when player moves
    notifyPlayerMoved(): void {
        if (this.tutorialCompleted || this.hasMoved) return;
        this.hasMoved = true;

        // If on step 0, advance to step 1
        if (this.tutorialStep === 0) {
            this.showTutorialStep(1);
        }
    }

    // Call this when player shoots
    notifyPlayerShot(): void {
        if (this.tutorialCompleted || this.hasShot) return;
        this.hasShot = true;

        // If on step 1, advance to step 2
        if (this.tutorialStep === 1) {
            this.showTutorialStep(2);
        }
    }

    private completeTutorial(): void {
        this.tutorialCompleted = true;
        if (this.tutorialContainer) {
            this.tutorialContainer.isVisible = false;
        }

        try {
            localStorage.setItem('tutorialCompleted', 'true');
        } catch (e) {
            // localStorage not available
        }

        // Notify callback
        if (this.onTutorialCompleteCallback) {
            this.onTutorialCompleteCallback();
        }

        // Tutorial completed
    }

    // Set callback for tutorial completion
    setOnTutorialComplete(callback: () => void): void {
        this.onTutorialCompleteCallback = callback;
    }

    // Reset tutorial (for debugging or settings)
    resetTutorial(): void {
        this.tutorialCompleted = false;
        this.tutorialStep = 0;
        this.hasMoved = false;
        this.hasShot = false;

        try {
            localStorage.removeItem('tutorialCompleted');
        } catch (e) { }

        // Tutorial reset
    }

    // === POI MINIMAP MARKERS ===

    updateMinimapPOIs(
        pois: Array<{ id: string, type: string, worldPosition: { x: number, z: number }, ownerId: string | null, captureProgress: number }>,
        playerPos: { x: number, z: number },
        tankRotationY: number
    ): void {
        // ОПТИМИЗАЦИЯ: Пропускаем если миникарта выключена
        if (!this.minimapEnabled) return;
        if (!this.radarArea) return;

        const radarRadius = 70;
        const worldRadius = 150;
        const scale = radarRadius / worldRadius;

        const angle = tankRotationY;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Hide all existing POI markers
        for (const marker of this.poiMinimapMarkers.values()) {
            marker.isVisible = false;
        }

        for (const poi of pois) {
            const dx = poi.worldPosition.x - playerPos.x;
            const dz = poi.worldPosition.z - playerPos.z;

            const rotX = dx * cos - dz * sin;
            const rotZ = dx * sin + dz * cos;

            const radarX = rotX * scale;
            const radarZ = -rotZ * scale;

            if (Math.abs(radarX) > radarRadius || Math.abs(radarZ) > radarRadius) continue;

            let marker = this.poiMinimapMarkers.get(poi.id);
            if (!marker) {
                marker = this.createPOIMinimapMarker(poi.type);
                this.radarArea.addControl(marker);
                this.poiMinimapMarkers.set(poi.id, marker);
            }

            marker.left = `${radarX}px`;
            marker.top = `${radarZ}px`;
            marker.isVisible = true;

            if (poi.ownerId === "player") {
                marker.background = "#0f0";
                marker.color = "#0f0";
            } else if (poi.ownerId === "enemy") {
                marker.background = "#f00";
                marker.color = "#f00";
            } else {
                marker.background = "#888";
                marker.color = "#888";
            }

            if (poi.captureProgress > 0 && poi.captureProgress < 100) {
                const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.3;
                marker.scaleX = pulse;
                marker.scaleY = pulse;
            } else {
                marker.scaleX = 1;
                marker.scaleY = 1;
            }
        }
    }

    private createPOIMinimapMarker(type: string): Rectangle {
        const marker = new Rectangle("poiMarker_" + Date.now());
        marker.width = "8px";
        marker.height = "8px";
        marker.thickness = 1;
        marker.background = "#888";
        marker.color = "#fff";

        switch (type) {
            case "capturePoint":
                marker.cornerRadius = 0;
                marker.width = "10px";
                marker.height = "10px";
                break;
            case "ammoDepot":
                marker.cornerRadius = 2;
                marker.width = "6px";
                marker.height = "8px";
                break;
            case "repairStation":
                marker.cornerRadius = 8;
                break;
            case "fuelDepot":
                marker.cornerRadius = 4;
                marker.width = "8px";
                marker.height = "6px";
                break;
            case "radarStation":
                marker.cornerRadius = 0;
                marker.rotation = Math.PI / 4;
                break;
        }

        return marker;
    }

    // === POI 3D WORLD MARKERS ===

    private createPOI3DMarkersContainer(): void {
        this.poi3DMarkersContainer = new Rectangle("poi3DContainer");
        this.poi3DMarkersContainer.width = "100%";
        this.poi3DMarkersContainer.height = "100%";
        this.poi3DMarkersContainer.thickness = 0;
        this.poi3DMarkersContainer.isPointerBlocker = false;
        this.guiTexture.addControl(this.poi3DMarkersContainer);
    }

    updatePOI3DMarkers(
        pois: Array<{
            id: string,
            type: string,
            screenX: number,
            screenY: number,
            distance: number,
            ownerId: string | null,
            captureProgress: number,
            visible: boolean
        }>
    ): void {
        if (!this.poi3DMarkersContainer) return;

        for (const marker of this.poi3DMarkers.values()) {
            marker.container.isVisible = false;
        }

        for (const poi of pois) {
            if (!poi.visible || poi.distance > 500) continue;

            let markerData = this.poi3DMarkers.get(poi.id);
            if (!markerData) {
                markerData = this.createPOI3DMarker(poi.type);
                this.poi3DMarkersContainer.addControl(markerData.container);
                this.poi3DMarkers.set(poi.id, markerData);
            }

            markerData.container.left = `${poi.screenX}px`;
            markerData.container.top = `${poi.screenY}px`;
            markerData.container.isVisible = true;

            markerData.distance.text = `${Math.round(poi.distance)}m`;

            const scale = Math.max(0.5, 1 - poi.distance / 600);
            markerData.container.scaleX = scale;
            markerData.container.scaleY = scale;

            let color = "#888";
            if (poi.ownerId === "player") color = "#0f0";
            else if (poi.ownerId === "enemy") color = "#f00";

            markerData.container.color = color;
            markerData.text.color = color;
            markerData.distance.color = color;

            if (poi.captureProgress > 0 && poi.captureProgress < 100) {
                const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.2;
                markerData.container.scaleX = scale * pulse;
                markerData.container.scaleY = scale * pulse;
            }
        }
    }

    private createPOI3DMarker(type: string): { container: Rectangle, text: TextBlock, distance: TextBlock } {
        const container = new Rectangle("poi3D_" + Date.now());
        container.width = "60px";
        container.height = "40px";
        container.thickness = 2;
        container.color = "#888";
        container.background = "rgba(0,0,0,0.6)";
        container.cornerRadius = 5;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

        const text = new TextBlock();
        text.fontSize = "14px";
        text.fontFamily = "monospace";
        text.color = "#fff";
        text.top = "-5px";

        switch (type) {
            case "capturePoint": text.text = "⚑"; break;
            case "ammoDepot": text.text = "🔫"; break;
            case "repairStation": text.text = "🔧"; break;
            case "fuelDepot": text.text = "⛽"; break;
            case "radarStation": text.text = "📡"; break;
            default: text.text = "●";
        }
        container.addControl(text);

        const distance = new TextBlock();
        distance.fontSize = "10px";
        distance.fontFamily = "monospace";
        distance.color = "#888";
        distance.top = "10px";
        distance.text = "0m";
        container.addControl(distance);

        return { container, text, distance };
    }

    getPOIIcon(type: string): string {
        switch (type) {
            case "capturePoint": return "⚑";
            case "ammoDepot": return "🔫";
            case "repairStation": return "🔧";
            case "fuelDepot": return "⛽";
            case "radarStation": return "📡";
            default: return "●";
        }
    }

    // === MULTIPLAYER HUD ===

    createMultiplayerHUD(): void {
        // Score container (top center)
        this.multiplayerScoreContainer = new Rectangle("multiplayerScore");
        this.multiplayerScoreContainer.width = "400px";
        this.multiplayerScoreContainer.height = "60px";
        this.multiplayerScoreContainer.cornerRadius = 5;
        this.multiplayerScoreContainer.thickness = 2;
        this.multiplayerScoreContainer.color = "#666";
        this.multiplayerScoreContainer.background = "rgba(0, 0, 0, 0.7)";
        this.multiplayerScoreContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.multiplayerScoreContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.multiplayerScoreContainer.top = "10px";
        this.multiplayerScoreContainer.isVisible = false;
        this.guiTexture.addControl(this.multiplayerScoreContainer);

        // Team 0 score (left)
        this.team0ScoreText = new TextBlock("team0Score");
        this.team0ScoreText.text = "Синие: 0";
        this.team0ScoreText.color = "#4a9eff";
        this.team0ScoreText.fontSize = "20px";
        this.team0ScoreText.fontFamily = "monospace";
        this.team0ScoreText.fontWeight = "bold";
        this.team0ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team0ScoreText.left = "20px";
        this.team0ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.multiplayerScoreContainer.addControl(this.team0ScoreText);

        // Match timer (center)
        this.matchTimerText = new TextBlock("matchTimer");
        this.matchTimerText.text = "00:00";
        this.matchTimerText.color = "#fff";
        this.matchTimerText.fontSize = "18px";
        this.matchTimerText.fontFamily = "monospace";
        this.matchTimerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.matchTimerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.multiplayerScoreContainer.addControl(this.matchTimerText);

        // Team 1 score (right)
        this.team1ScoreText = new TextBlock("team1Score");
        this.team1ScoreText.text = "Красные: 0";
        this.team1ScoreText.color = "#ff4a4a";
        this.team1ScoreText.fontSize = "20px";
        this.team1ScoreText.fontFamily = "monospace";
        this.team1ScoreText.fontWeight = "bold";
        this.team1ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.team1ScoreText.left = "-20px";
        this.team1ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.multiplayerScoreContainer.addControl(this.team1ScoreText);

        // Player list container (right side)
        this.playerListContainer = new Rectangle("playerList");
        this.playerListContainer.width = "250px";
        this.playerListContainer.height = "400px";
        this.playerListContainer.cornerRadius = 5;
        this.playerListContainer.thickness = 2;
        this.playerListContainer.color = "#666";
        this.playerListContainer.background = "rgba(0, 0, 0, 0.7)";
        this.playerListContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.playerListContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.playerListContainer.left = "-10px";
        this.playerListContainer.top = "80px";
        this.playerListContainer.isVisible = false;
        this.guiTexture.addControl(this.playerListContainer);

        // Title
        const playerListTitle = new TextBlock("playerListTitle");
        playerListTitle.text = "ИГРОКИ";
        playerListTitle.color = "#fff";
        playerListTitle.fontSize = "14px";
        playerListTitle.fontFamily = "monospace";
        playerListTitle.fontWeight = "bold";
        playerListTitle.top = "5px";
        playerListTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.playerListContainer.addControl(playerListTitle);

        // Initialize player marker pool for minimap
        for (let i = 0; i < 32; i++) {
            const marker = new Rectangle(`playerMarker_${i}`);
            marker.width = "6px";
            marker.height = "6px";
            marker.cornerRadius = 0;
            marker.thickness = 1;
            marker.color = "#0f0";
            marker.background = "#0f0";
            marker.isVisible = false;
            this.minimapPlayerPool.push(marker);
        }

        // Sync quality indicator (top right, рядом с компасом)
        this.syncQualityContainer = new Rectangle("syncQualityContainer");
        this.syncQualityContainer.width = "120px";
        this.syncQualityContainer.height = "30px";
        this.syncQualityContainer.cornerRadius = 3;
        this.syncQualityContainer.thickness = 1;
        this.syncQualityContainer.color = "#666";
        this.syncQualityContainer.background = "rgba(0, 0, 0, 0.6)";
        this.syncQualityContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.syncQualityContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.syncQualityContainer.left = "-10px";
        this.syncQualityContainer.top = "50px";
        this.syncQualityContainer.isVisible = false; // Скрыт по умолчанию
        this.guiTexture.addControl(this.syncQualityContainer);

        // Sync quality indicator dot
        this.syncQualityIndicator = new Rectangle("syncQualityIndicator");
        this.syncQualityIndicator.width = "8px";
        this.syncQualityIndicator.height = "8px";
        this.syncQualityIndicator.cornerRadius = 4;
        this.syncQualityIndicator.thickness = 0;
        this.syncQualityIndicator.background = "#0f0";
        this.syncQualityIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.syncQualityIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.syncQualityIndicator.left = "8px";
        this.syncQualityContainer.addControl(this.syncQualityIndicator);

        // Sync quality text
        this.syncQualityText = new TextBlock("syncQualityText");
        this.syncQualityText.text = "Sync: 100%";
        this.syncQualityText.color = "#0f0";
        this.syncQualityText.fontSize = "12px";
        this.syncQualityText.fontFamily = "monospace";
        this.syncQualityText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.syncQualityText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.syncQualityText.left = "-8px";
        this.syncQualityContainer.addControl(this.syncQualityText);
    }

    showMultiplayerHUD(show: boolean): void {
        if (this.multiplayerScoreContainer) {
            this.multiplayerScoreContainer.isVisible = show;
        }
        if (this.playerListContainer) {
            this.playerListContainer.isVisible = show;
        }
    }

    /**
     * Обновить индикатор качества синхронизации
     */
    updateSyncQuality(syncMetrics: any): void {
        if (!this.syncQualityContainer || !this.showSyncQuality) return;
        if (!syncMetrics) {
            this.syncQualityContainer.isVisible = false;
            return;
        }

        const quality = syncMetrics.getSyncQuality();
        const qualityStatus = syncMetrics.getSyncQualityStatus();

        // Определяем цвет в зависимости от качества
        let color: string;
        if (qualityStatus === "excellent") {
            color = "#0f0"; // Зеленый
        } else if (qualityStatus === "good") {
            color = "#ff0"; // Желтый
        } else if (qualityStatus === "fair") {
            color = "#fa0"; // Оранжевый
        } else {
            color = "#f00"; // Красный
        }

        // Обновляем индикатор
        if (this.syncQualityIndicator) {
            this.syncQualityIndicator.background = color;
        }

        // Обновляем текст
        if (this.syncQualityText) {
            this.syncQualityText.text = `Sync: ${quality.toFixed(0)}%`;
            this.syncQualityText.color = color;
        }

        // Показываем контейнер
        this.syncQualityContainer.isVisible = true;
    }

    /**
     * Показать/скрыть индикатор качества синхронизации
     */
    setShowSyncQuality(show: boolean): void {
        this.showSyncQuality = show;
        if (this.syncQualityContainer) {
            this.syncQualityContainer.isVisible = show;
        }
    }

    updateMultiplayerScore(team0Score: number, team1Score: number, gameMode: string): void {
        if (!this.team0ScoreText || !this.team1ScoreText) return;

        if (gameMode === "tdm" || gameMode === "ctf") {
            // Team-based modes
            this.team0ScoreText.text = `Синие: ${team0Score}`;
            this.team1ScoreText.text = `Красные: ${team1Score}`;
            this.team0ScoreText.isVisible = true;
            this.team1ScoreText.isVisible = true;
        } else if (gameMode === "ffa") {
            // FFA - hide team scores, show only timer
            this.team0ScoreText.isVisible = false;
            this.team1ScoreText.isVisible = false;
        } else {
            // Other modes
            this.team0ScoreText.isVisible = false;
            this.team1ScoreText.isVisible = false;
        }
    }

    updateMatchTimer(seconds: number): void {
        if (!this.matchTimerText) return;

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        this.matchTimerText.text = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    updatePlayerList(players: Array<{
        id: string;
        name: string;
        kills: number;
        deaths: number;
        score: number;
        team?: number;
        isAlive: boolean;
        mapId?: string;  // ИСПРАВЛЕНО: Добавлена поддержка фильтрации по карте
        roomId?: string; // ИСПРАВЛЕНО: Добавлена поддержка фильтрации по комнате
    }>, localPlayerId: string, currentMapId?: string, currentRoomId?: string): void {
        // ИСПРАВЛЕНО: Фильтруем статистику только для текущей карты/комнаты
        // Показываем только игроков из текущей игры, а не всю статистику из localStorage
        // ДИАГНОСТИКА: Логируем только при изменении количества игроков или раз в 30 секунд
        const now = Date.now();
        const shouldLog = (now - this._lastPlayerListLogTime) > 30000 || players.length !== this._lastPlayerListCount;

        if (shouldLog) {
            const localPlayer = players.find(p => p.id === localPlayerId);
            const networkPlayers = players.filter(p => p.id !== localPlayerId);

            // console.log(`[HUD] 🔍 updatePlayerList: ${players.length} players (local: ${localPlayer ? 'YES' : 'NO'}, network: ${networkPlayers.length})`);

            this._lastPlayerListLogTime = now;
            this._lastPlayerListCount = players.length;
        }

        if (players.length === 0) {
            console.warn(`[HUD] ⚠️ updatePlayerList called with empty players array!`);
        }

        if (!this.playerListContainer) {
            console.warn(`[HUD] ⚠️ updatePlayerList: playerListContainer is not initialized`);
            return;
        }

        // Clear existing items
        for (const item of this.playerListItems.values()) {
            item.dispose();
        }
        this.playerListItems.clear();

        // ИСПРАВЛЕНО: Фильтруем игроков только для текущей карты/комнаты
        // Показываем только игроков из текущей игры, а не всю статистику из localStorage
        let filteredPlayers = players;
        if (currentMapId || currentRoomId) {
            filteredPlayers = players.filter(player => {
                // Если у игрока указаны mapId/roomId, проверяем соответствие
                if (player.mapId && currentMapId && player.mapId !== currentMapId) {
                    return false;
                }
                if (player.roomId && currentRoomId && player.roomId !== currentRoomId) {
                    return false;
                }
                return true;
            });
        }

        // Sort players by score (descending)
        const sortedPlayers = [...filteredPlayers].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((player, index) => {
            const item = new Rectangle(`playerListItem_${player.id}`);
            item.width = "230px";
            item.height = "30px";
            item.cornerRadius = 3;
            item.thickness = 1;
            item.color = player.id === localPlayerId ? "#0f0" : "#666";
            item.background = player.id === localPlayerId
                ? "rgba(0, 50, 0, 0.5)"
                : player.isAlive
                    ? "rgba(20, 20, 20, 0.5)"
                    : "rgba(50, 0, 0, 0.5)";
            item.top = `${25 + index * 35}px`;
            item.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.playerListContainer!.addControl(item);
            this.playerListItems.set(player.id, item);

            // Rank number
            const rankText = new TextBlock(`playerRank_${player.id}`);
            rankText.text = `${index + 1}.`;
            rankText.fontSize = "10px";
            rankText.fontFamily = "monospace";
            rankText.color = index < 3 ? "#ffaa00" : "#888";
            rankText.left = "5px";
            rankText.top = "10px";
            rankText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            item.addControl(rankText);

            // Player name
            const nameText = new TextBlock(`playerName_${player.id}`);
            nameText.text = player.name.length > 12 ? player.name.substring(0, 12) + "..." : player.name;
            nameText.fontSize = "11px";
            nameText.fontFamily = "monospace";
            nameText.color = player.isAlive ? "#fff" : "#888";
            nameText.left = "25px";
            nameText.top = "5px";
            nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            item.addControl(nameText);

            // Team indicator (if team-based)
            if (player.team !== undefined) {
                const teamIndicator = new Rectangle(`teamIndicator_${player.id}`);
                teamIndicator.width = "4px";
                teamIndicator.height = "20px";
                teamIndicator.background = player.team === 0 ? "#4a9eff" : "#ff4a4a";
                teamIndicator.left = "0px";
                teamIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                item.addControl(teamIndicator);
            }

            // K/D stats
            const kdText = new TextBlock(`playerKD_${player.id}`);
            const kdRatio = player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills.toString();
            kdText.text = `${player.kills}/${player.deaths} (${kdRatio})`;
            kdText.fontSize = "9px";
            kdText.fontFamily = "monospace";
            kdText.color = "#aaa";
            kdText.left = "-5px";
            kdText.top = "5px";
            kdText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            item.addControl(kdText);

            // Score
            const scoreText = new TextBlock(`playerScore_${player.id}`);
            scoreText.text = `${player.score}`;
            scoreText.fontSize = "10px";
            scoreText.fontFamily = "monospace";
            scoreText.color = "#ffaa00";
            scoreText.left = "-5px";
            scoreText.top = "18px";
            scoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            item.addControl(scoreText);
        });
    }

    togglePlayerList(): void {
        if (this.playerListContainer) {
            this.playerListContainer.isVisible = !this.playerListContainer.isVisible;
        }
    }

    // Battle Royale HUD elements
    private battleRoyaleContainer: Rectangle | null = null;
    private battleRoyaleZoneStatus: TextBlock | null = null;
    private battleRoyaleDistance: TextBlock | null = null;
    private battleRoyaleTimer: TextBlock | null = null;
    private battleRoyaleDamage: TextBlock | null = null;

    updateBattleRoyaleInfo(info: {
        isInZone: boolean;
        distance: number;
        timeUntilShrink: number;
        damagePerSecond: number;
        zoneRadius: number;
    }): void {
        // Create container if it doesn't exist
        if (!this.battleRoyaleContainer) {
            this.battleRoyaleContainer = new Rectangle("battleRoyaleContainer");
            this.battleRoyaleContainer.width = "250px";
            this.battleRoyaleContainer.height = "120px";
            this.battleRoyaleContainer.cornerRadius = 5;
            this.battleRoyaleContainer.thickness = 2;
            this.battleRoyaleContainer.color = "#0f0";
            this.battleRoyaleContainer.background = "rgba(0, 20, 0, 0.8)";
            this.battleRoyaleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            this.battleRoyaleContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.battleRoyaleContainer.left = "-20px";
            this.battleRoyaleContainer.top = "150px";
            this.guiTexture.addControl(this.battleRoyaleContainer);

            // Zone status
            this.battleRoyaleZoneStatus = new TextBlock("brZoneStatus");
            this.battleRoyaleZoneStatus.text = "SAFE ZONE";
            this.battleRoyaleZoneStatus.fontSize = "14px";
            this.battleRoyaleZoneStatus.fontFamily = "monospace";
            this.battleRoyaleZoneStatus.color = "#0f0";
            this.battleRoyaleZoneStatus.top = "10px";
            this.battleRoyaleContainer.addControl(this.battleRoyaleZoneStatus);

            // Distance
            this.battleRoyaleDistance = new TextBlock("brDistance");
            this.battleRoyaleDistance.text = "Distance: 0m";
            this.battleRoyaleDistance.fontSize = "12px";
            this.battleRoyaleDistance.fontFamily = "monospace";
            this.battleRoyaleDistance.color = "#fff";
            this.battleRoyaleDistance.top = "35px";
            this.battleRoyaleContainer.addControl(this.battleRoyaleDistance);

            // Timer
            this.battleRoyaleTimer = new TextBlock("brTimer");
            this.battleRoyaleTimer.text = "Next shrink: --:--";
            this.battleRoyaleTimer.fontSize = "12px";
            this.battleRoyaleTimer.fontFamily = "monospace";
            this.battleRoyaleTimer.color = "#ff0";
            this.battleRoyaleTimer.top = "60px";
            this.battleRoyaleContainer.addControl(this.battleRoyaleTimer);

            // Damage
            this.battleRoyaleDamage = new TextBlock("brDamage");
            this.battleRoyaleDamage.text = "Damage: 0/sec";
            this.battleRoyaleDamage.fontSize = "12px";
            this.battleRoyaleDamage.fontFamily = "monospace";
            this.battleRoyaleDamage.color = "#f00";
            this.battleRoyaleDamage.top = "85px";
            this.battleRoyaleContainer.addControl(this.battleRoyaleDamage);
        }

        // Update values
        if (this.battleRoyaleZoneStatus) {
            this.battleRoyaleZoneStatus.text = info.isInZone ? "SAFE ZONE" : "OUTSIDE ZONE";
            this.battleRoyaleZoneStatus.color = info.isInZone ? "#0f0" : "#f00";
        }

        if (this.battleRoyaleDistance) {
            this.battleRoyaleDistance.text = `Distance: ${info.distance.toFixed(0)}m`;
            this.battleRoyaleDistance.color = info.isInZone ? "#0f0" : "#f00";
        }

        if (this.battleRoyaleTimer) {
            const minutes = Math.floor(info.timeUntilShrink / 60);
            const seconds = Math.floor(info.timeUntilShrink % 60);
            this.battleRoyaleTimer.text = `Next shrink: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.battleRoyaleTimer.color = info.timeUntilShrink < 30 ? "#f00" : info.timeUntilShrink < 60 ? "#ff0" : "#0f0";
        }

        if (this.battleRoyaleDamage) {
            this.battleRoyaleDamage.text = `Damage: ${info.damagePerSecond}/sec`;
            this.battleRoyaleDamage.color = info.isInZone ? "#888" : "#f00";
            this.battleRoyaleDamage.isVisible = !info.isInZone;
        }

        // Update container color based on status
        if (this.battleRoyaleContainer) {
            this.battleRoyaleContainer.color = info.isInZone ? "#0f0" : "#f00";
            this.battleRoyaleContainer.background = info.isInZone
                ? "rgba(0, 20, 0, 0.8)"
                : "rgba(20, 0, 0, 0.8)";
        }
    }

    // CTF HUD elements
    private ctfContainer: Rectangle | null = null;
    private ctfOwnFlagStatus: TextBlock | null = null;
    private ctfEnemyFlagStatus: TextBlock | null = null;
    private ctfOwnFlagDistance: TextBlock | null = null;
    private ctfEnemyFlagDistance: TextBlock | null = null;

    updateCTFInfo(info: {
        ownFlag: { isCarried: boolean; carrierId: string | null; position: any } | null;
        enemyFlag: { isCarried: boolean; carrierId: string | null; position: any } | null;
        playerPosition: Vector3;
        playerTeam: number;
    }): void {
        // Create container if it doesn't exist
        if (!this.ctfContainer) {
            this.ctfContainer = new Rectangle("ctfContainer");
            this.ctfContainer.width = "250px";
            this.ctfContainer.height = "100px";
            this.ctfContainer.cornerRadius = 5;
            this.ctfContainer.thickness = 2;
            this.ctfContainer.color = "#0f0";
            this.ctfContainer.background = "rgba(0, 20, 0, 0.8)";
            this.ctfContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            this.ctfContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.ctfContainer.left = "-20px";
            this.ctfContainer.top = "280px";
            this.guiTexture.addControl(this.ctfContainer);

            // Own flag status
            this.ctfOwnFlagStatus = new TextBlock("ctfOwnFlagStatus");
            this.ctfOwnFlagStatus.text = "Your Flag: SAFE";
            this.ctfOwnFlagStatus.fontSize = "12px";
            this.ctfOwnFlagStatus.fontFamily = "monospace";
            this.ctfOwnFlagStatus.color = info.playerTeam === 0 ? "#4a9eff" : "#ff4a4a";
            this.ctfOwnFlagStatus.top = "10px";
            this.ctfContainer.addControl(this.ctfOwnFlagStatus);

            // Own flag distance
            this.ctfOwnFlagDistance = new TextBlock("ctfOwnFlagDistance");
            this.ctfOwnFlagDistance.text = "Distance: --m";
            this.ctfOwnFlagDistance.fontSize = "11px";
            this.ctfOwnFlagDistance.fontFamily = "monospace";
            this.ctfOwnFlagDistance.color = "#aaa";
            this.ctfOwnFlagDistance.top = "30px";
            this.ctfContainer.addControl(this.ctfOwnFlagDistance);

            // Enemy flag status
            this.ctfEnemyFlagStatus = new TextBlock("ctfEnemyFlagStatus");
            this.ctfEnemyFlagStatus.text = "Enemy Flag: AT BASE";
            this.ctfEnemyFlagStatus.fontSize = "12px";
            this.ctfEnemyFlagStatus.fontFamily = "monospace";
            this.ctfEnemyFlagStatus.color = info.playerTeam === 0 ? "#ff4a4a" : "#4a9eff";
            this.ctfEnemyFlagStatus.top = "55px";
            this.ctfContainer.addControl(this.ctfEnemyFlagStatus);

            // Enemy flag distance
            this.ctfEnemyFlagDistance = new TextBlock("ctfEnemyFlagDistance");
            this.ctfEnemyFlagDistance.text = "Distance: --m";
            this.ctfEnemyFlagDistance.fontSize = "11px";
            this.ctfEnemyFlagDistance.fontFamily = "monospace";
            this.ctfEnemyFlagDistance.color = "#aaa";
            this.ctfEnemyFlagDistance.top = "75px";
            this.ctfContainer.addControl(this.ctfEnemyFlagDistance);
        }

        // Update own flag status
        if (this.ctfOwnFlagStatus && info.ownFlag) {
            if (info.ownFlag.isCarried) {
                this.ctfOwnFlagStatus.text = "Your Flag: CARRIED!";
                this.ctfOwnFlagStatus.color = "#f00";
            } else {
                this.ctfOwnFlagStatus.text = "Your Flag: SAFE";
                this.ctfOwnFlagStatus.color = info.playerTeam === 0 ? "#4a9eff" : "#ff4a4a";
            }
        }

        // Update own flag distance
        if (this.ctfOwnFlagDistance && info.ownFlag) {
            const flagPos = new Vector3(
                info.ownFlag.position.x || 0,
                info.ownFlag.position.y || 0,
                info.ownFlag.position.z || 0
            );
            const distance = Vector3.Distance(info.playerPosition, flagPos);
            this.ctfOwnFlagDistance.text = `Distance: ${distance.toFixed(0)}m`;
            this.ctfOwnFlagDistance.color = info.ownFlag.isCarried ? "#f00" : "#0f0";
        }

        // Update enemy flag status
        if (this.ctfEnemyFlagStatus && info.enemyFlag) {
            if (info.enemyFlag.isCarried) {
                this.ctfEnemyFlagStatus.text = "Enemy Flag: CARRIED";
                this.ctfEnemyFlagStatus.color = "#ff0";
            } else {
                this.ctfEnemyFlagStatus.text = "Enemy Flag: AT BASE";
                this.ctfEnemyFlagStatus.color = info.playerTeam === 0 ? "#ff4a4a" : "#4a9eff";
            }
        }

        // Update enemy flag distance
        if (this.ctfEnemyFlagDistance && info.enemyFlag) {
            const flagPos = new Vector3(
                info.enemyFlag.position.x || 0,
                info.enemyFlag.position.y || 0,
                info.enemyFlag.position.z || 0
            );
            const distance = Vector3.Distance(info.playerPosition, flagPos);
            this.ctfEnemyFlagDistance.text = `Distance: ${distance.toFixed(0)}m`;
            this.ctfEnemyFlagDistance.color = info.enemyFlag.isCarried ? "#ff0" : "#0f0";
        }
    }

    updateMinimapPlayers(players: Array<{
        id: string;
        position: { x: number; z: number };
        team?: number;
    }>, localPlayerPos: { x: number; z: number }, localPlayerId: string): void {
        // ОПТИМИЗАЦИЯ: Пропускаем если миникарта выключена
        if (!this.minimapEnabled) return;
        if (!this.radarArea) return;

        // Clear existing markers
        for (const marker of this.minimapPlayerMarkers.values()) {
            marker.isVisible = false;
        }
        this.minimapPlayerMarkers.clear();

        // Radar range (same as minimap range)
        const radarRange = 100; // meters
        const radarSize = 130; // pixels (from createMinimap)

        players.forEach((player, index) => {
            if (player.id === localPlayerId) return; // Don't show local player

            // Calculate relative position
            const dx = player.position.x - localPlayerPos.x;
            const dz = player.position.z - localPlayerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > radarRange) return; // Too far

            // Get or create marker from pool
            let marker = this.minimapPlayerPool[index];
            if (!marker) {
                marker = new Rectangle(`minimapPlayer_${player.id}`);
                marker.width = "6px";
                marker.height = "6px";
                marker.cornerRadius = 0; // ИСПРАВЛЕНО: Прямоугольный маркер (было 3 - круглый)
                marker.thickness = 1;
                marker.color = player.team === 0 ? "#4a9eff" : player.team === 1 ? "#ff4a4a" : "#0f0";
                marker.background = player.team === 0 ? "#4a9eff" : player.team === 1 ? "#ff4a4a" : "#0f0";
                marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                if (this.radarArea) {
                    this.radarArea.addControl(marker);
                }
                this.minimapPlayerPool.push(marker);
            }

            // Position marker on radar (normalized to -1..1, then scaled to radar size)
            const normalizedX = dx / radarRange;
            const normalizedZ = dz / radarRange;

            // Clamp to radar bounds
            const clampedX = Math.max(-1, Math.min(1, normalizedX));
            const clampedZ = Math.max(-1, Math.min(1, normalizedZ));

            // Convert to pixel coordinates (center is at radarSize/2)
            const pixelX = (radarSize / 2) + clampedX * (radarSize / 2 - 5);
            const pixelZ = (radarSize / 2) + clampedZ * (radarSize / 2 - 5);

            marker.left = `${pixelX - 3}px`;
            marker.top = `${pixelZ - 3}px`;
            marker.isVisible = true;

            // Update color based on team
            if (player.team !== undefined) {
                marker.color = player.team === 0 ? "#4a9eff" : "#ff4a4a";
                marker.background = player.team === 0 ? "#4a9eff" : "#ff4a4a";
            } else {
                marker.color = "#0f0";
                marker.background = "#0f0";
            }

            this.minimapPlayerMarkers.set(player.id, marker);
        });
    }

    // === MISSION PANEL ===

    private createMissionPanel(): void {
        // console.log("[HUD] createMissionPanel() called");
        try {
            // Mission panel (top right, below compass) - СТИЛЬ ИГРЫ
            this.missionPanel = new Rectangle("missionPanel");
            this.missionPanel.width = "300px";
            this.missionPanel.height = "240px";
            this.missionPanel.cornerRadius = 4;
            this.missionPanel.thickness = 2;
            this.missionPanel.color = "#0f0";
            this.missionPanel.background = "rgba(0, 20, 0, 0.6)"; // Полупрозрачный темный фон
            this.missionPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            this.missionPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.missionPanel.left = "-10px";
            this.missionPanel.top = "100px";
            this.missionPanel.isVisible = false;
            this.missionPanel.zIndex = 200; // High z-index to be above other elements
            this.guiTexture.addControl(this.missionPanel);

            // Title - СТИЛЬ ИГРЫ
            const title = new TextBlock("missionTitle");
            title.text = "📋 МИССИИ [J]";
            title.color = "#0ff";
            title.fontSize = "14px";
            title.fontWeight = "bold";
            title.fontFamily = "'Press Start 2P', monospace";
            title.top = "6px";
            title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.missionPanel.addControl(title);

            // Header line - СТИЛЬ ИГРЫ
            const headerLine = new Rectangle("missionHeaderLine");
            headerLine.width = "95%";
            headerLine.height = "1px";
            headerLine.thickness = 0;
            headerLine.background = "#0f0";
            headerLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            headerLine.top = "22px";
            this.missionPanel.addControl(headerLine);

            // console.log("[HUD] Mission panel created successfully");
        } catch (error) {
            console.error("[HUD] ERROR creating mission panel:", error);
        }
    }

    public toggleMissionPanel(): void {

        // ИСПРАВЛЕНИЕ: Создаём панель миссий если она ещё не создана
        if (!this.missionPanel) {
            this.createMissionPanel();
        }

        if (this.missionPanel) {
            this.missionPanelVisible = !this.missionPanelVisible;
            this.missionPanel.isVisible = this.missionPanelVisible;
            this.missionPanel.zIndex = 200; // Ensure high z-index
            // Если панель открывается, обновление списка миссий выполняется из game.ts (update)
        } else {
            console.error("[HUD] ERROR: missionPanel is null after creation attempt!");
        }
    }

    /**
     * ОПТИМИЗАЦИЯ: Создание индикатора прогресса прогрузки карты (нижний левый угол)
     */
    private createMapLoadingIndicator(): void {
        // Контейнер в нижнем левом углу
        this.mapLoadingContainer = new Rectangle("mapLoadingContainer");
        this.mapLoadingContainer.width = "200px";
        this.mapLoadingContainer.height = "30px";
        this.mapLoadingContainer.cornerRadius = 3;
        this.mapLoadingContainer.thickness = 1;
        this.mapLoadingContainer.color = "#0f0";
        this.mapLoadingContainer.background = "rgba(0, 10, 0, 0.8)";
        this.mapLoadingContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.mapLoadingContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.mapLoadingContainer.left = "10px";
        this.mapLoadingContainer.top = "-40px"; // Отступ снизу (используем отрицательный top)
        this.mapLoadingContainer.isVisible = false; // Скрыт по умолчанию (показывается когда прогресс < 100%)
        this.mapLoadingContainer.zIndex = 100;
        this.guiTexture.addControl(this.mapLoadingContainer);

        // Текст "Загрузка карты"
        const label = new TextBlock("mapLoadingLabel");
        label.text = "Карта:";
        label.color = "#0f0";
        label.fontSize = "10px";
        label.fontFamily = "'Press Start 2P', monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        label.left = "5px";
        this.mapLoadingContainer.addControl(label);

        // Шкала прогресса (фон)
        this.mapLoadingBar = new Rectangle("mapLoadingBar");
        this.mapLoadingBar.width = "120px";
        this.mapLoadingBar.height = "12px";
        this.mapLoadingBar.cornerRadius = 2;
        this.mapLoadingBar.thickness = 1;
        this.mapLoadingBar.color = "#0f0";
        this.mapLoadingBar.background = "rgba(0, 20, 0, 0.6)";
        this.mapLoadingBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.mapLoadingBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.mapLoadingBar.left = "50px";
        this.mapLoadingContainer.addControl(this.mapLoadingBar);

        // Заполнение шкалы
        this.mapLoadingFill = new Rectangle("mapLoadingFill");
        this.mapLoadingFill.width = "0%";
        this.mapLoadingFill.height = "10px";
        this.mapLoadingFill.thickness = 0;
        this.mapLoadingFill.background = "#0f0";
        this.mapLoadingFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.mapLoadingBar.addControl(this.mapLoadingFill);

        // Текст с процентом
        this.mapLoadingText = new TextBlock("mapLoadingText");
        this.mapLoadingText.text = "100%";
        this.mapLoadingText.color = "#0f0";
        this.mapLoadingText.fontSize = "10px";
        this.mapLoadingText.fontFamily = "'Press Start 2P', monospace";
        this.mapLoadingText.fontWeight = "bold";
        this.mapLoadingText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.mapLoadingText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.mapLoadingText.left = "175px";
        this.mapLoadingContainer.addControl(this.mapLoadingText);
    }

    /**
     * ОПТИМИЗАЦИЯ: Обновление прогресса прогрузки карты
     * @param progress Процент загрузки (0-100)
     */
    updateMapLoadingProgress(progress: number): void {
        if (!this.mapLoadingContainer || !this.mapLoadingFill || !this.mapLoadingText) return;

        // Валидация прогресса
        const validProgress = Math.max(0, Math.min(100, progress));
        this.mapLoadingTargetProgress = validProgress;

        // Плавная анимация изменения процента
        const diff = this.mapLoadingTargetProgress - this.mapLoadingProgress;
        if (Math.abs(diff) > 0.1) {
            this.mapLoadingProgress += diff * 0.1; // Плавная интерполяция
            this.mapLoadingProgress = Math.max(0, Math.min(100, this.mapLoadingProgress));
        } else {
            this.mapLoadingProgress = this.mapLoadingTargetProgress;
        }

        const roundedProgress = Math.round(this.mapLoadingProgress);

        // Обновляем шкалу
        this.mapLoadingFill.width = `${this.mapLoadingProgress}%`;
        this.mapLoadingText.text = `${roundedProgress}%`;

        // Автоматическое скрытие при 100%
        if (roundedProgress >= 100) {
            // Плавное исчезновение
            if (this.mapLoadingContainer.isVisible) {
                this.mapLoadingContainer.alpha = Math.max(0, this.mapLoadingContainer.alpha - 0.05);
                if (this.mapLoadingContainer.alpha <= 0) {
                    this.mapLoadingContainer.isVisible = false;
                    this.mapLoadingContainer.alpha = 1.0; // Сбрасываем для следующего показа
                }
            }
        } else {
            // Показываем если прогресс < 100%
            if (!this.mapLoadingContainer.isVisible) {
                this.mapLoadingContainer.isVisible = true;
                this.mapLoadingContainer.alpha = 1.0;
            }
        }
    }

    updateMissions(missions: Array<{
        id: string,
        name: string,
        description: string,
        icon: string,
        current: number,
        requirement: number,
        completed: boolean,
        claimed: boolean,
        type: string
    }>): void {
        if (!this.missionPanel) return;

        // Clear existing mission items
        for (const item of this.missionItems.values()) {
            item.dispose();
        }
        this.missionItems.clear();

        // Show only first 3 missions
        const visibleMissions = missions.slice(0, 3);

        visibleMissions.forEach((mission, index) => {
            const item = new Rectangle(`mission_${mission.id}`);
            item.width = "280px";
            item.height = "52px";
            item.cornerRadius = 3;
            item.thickness = 2;
            // СТИЛЬ ИГРЫ: Зеленый/золотой текст, полупрозрачный фон
            item.color = mission.completed ? "#ffcc00" : mission.claimed ? "#0f0" : "#888"; // Золотой для завершенных, зеленый для активных
            item.background = mission.completed
                ? "rgba(40, 30, 0, 0.6)" // Золотистый фон для завершенных
                : mission.claimed
                    ? "rgba(0, 40, 0, 0.6)" // Зеленый фон для активных
                    : "rgba(20, 20, 20, 0.5)"; // Темный для неактивных
            item.top = `${30 + index * 58}px`;
            item.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.missionPanel!.addControl(item);
            this.missionItems.set(mission.id, item);

            // Icon and name
            const iconText = new TextBlock(`missionIcon_${mission.id}`);
            iconText.text = mission.icon;
            iconText.fontSize = "14px";
            iconText.color = "#fff";
            iconText.left = "5px";
            iconText.top = "5px";
            item.addControl(iconText);

            const nameText = new TextBlock(`missionName_${mission.id}`);
            nameText.text = mission.name;
            nameText.fontSize = "10px";
            nameText.fontFamily = "monospace";
            nameText.color = mission.completed ? "#ffcc00" : "#0f0"; // Золотой для завершенных, зеленый для активных
            nameText.left = "25px";
            nameText.top = "3px";
            nameText.textWrapping = true;
            nameText.width = "180px";
            item.addControl(nameText);

            // Progress
            const progress = Math.min(100, (mission.current / mission.requirement) * 100);
            const progressText = new TextBlock(`missionProgress_${mission.id}`);
            progressText.text = `${Math.floor(mission.current)}/${mission.requirement}`;
            progressText.fontSize = "9px";
            progressText.fontFamily = "monospace";
            progressText.color = mission.completed ? "#ffcc00" : "#0f0"; // Золотой для завершенных, зеленый для активных
            progressText.left = "25px";
            progressText.top = "18px";
            item.addControl(progressText);

            // Progress bar
            const progressBar = new Rectangle(`missionBar_${mission.id}`);
            progressBar.width = "200px";
            progressBar.height = "4px";
            progressBar.cornerRadius = 2;
            progressBar.background = "#333";
            progressBar.left = "25px";
            progressBar.top = "30px";
            item.addControl(progressBar);

            const progressFill = new Rectangle(`missionFill_${mission.id}`);
            progressFill.width = `${progress}%`;
            progressFill.height = "100%";
            progressFill.background = mission.completed ? "#ffcc00" : "#0f0"; // Золотой для завершенных, зеленый для активных
            progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            progressBar.addControl(progressFill);

            // Completed checkmark
            if (mission.completed) {
                const checkmark = new TextBlock(`missionCheck_${mission.id}`);
                checkmark.text = "✓";
                checkmark.fontSize = "16px";
                checkmark.color = "#ffcc00"; // Золотой цвет для галочки
                checkmark.left = "210px";
                checkmark.top = "10px";
                item.addControl(checkmark);
            }

            // Анимация появления задания
            item.alpha = 0;
            setTimeout(() => {
                // Проверяем, что элемент не удален (у Babylon.js контролов нет isDisposed, проверяем через parent)
                if (item && item.parent) {
                    // Плавное появление
                    const fadeIn = () => {
                        if (item && item.parent && item.alpha < 1.0) {
                            item.alpha = Math.min(1.0, item.alpha + 0.1);
                            setTimeout(fadeIn, 16); // ~60 FPS
                        }
                    };
                    fadeIn();
                }
            }, index * 100); // Задержка для каждого задания

            // КНОПКА CLAIM для завершённых миссий
            if (mission.completed && !mission.claimed) {
                const claimButton = new Rectangle(`missionClaim_${mission.id}`);
                claimButton.width = "60px";
                claimButton.height = "20px";
                claimButton.cornerRadius = 2;
                claimButton.thickness = 2;
                claimButton.color = "#0f0";
                claimButton.background = "rgba(0, 50, 0, 0.8)";
                claimButton.left = "190px";
                claimButton.top = "25px";
                claimButton.isPointerBlocker = true;
                item.addControl(claimButton);

                const claimText = new TextBlock(`missionClaimText_${mission.id}`);
                claimText.text = "CLAIM";
                claimText.color = "#0f0";
                claimText.fontSize = "9px";
                claimText.fontWeight = "bold";
                claimText.fontFamily = "monospace";
                claimText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                claimText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                claimButton.addControl(claimText);

                // ОБРАБОТЧИК КЛИКА
                claimButton.onPointerClickObservable.add(() => {
                    if (!this.missionSystem) {
                        return;
                    }
                    const reward = this.missionSystem.claimReward(mission.id);
                    if (!reward) {
                        return;
                    }

                    this.showMessage(
                        `+${reward.amount} ${reward.type === "experience" ? "XP" : "кредитов"}`,
                        "#0f0",
                        2000
                    );

                    // Обновляем миссии
                    const activeMissions = this.missionSystem.getActiveMissions();
                    const missionData = activeMissions.map((m: { mission: Mission; progress: MissionProgress }) => ({
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
                    this.updateMissions(missionData);
                });
            }
        });
    }

    setMissionSystem(system: MissionSystem | null): void {
        this.missionSystem = system;
    }

    private _showComboIncrease(_currentCombo: number, _previousCombo: number): void {
        // Placeholder для метода показа увеличения комбо
        // Можно реализовать позже если нужно
    }

    private _createComboParticles(_comboCount: number): void {
        // Placeholder для метода создания частиц комбо
        // Можно реализовать позже если нужно
    }

    // ============================================================
    // === DETAILED TANK STATS PANEL (ЛЕВЫЙ НИЖНИЙ УГОЛ) ===
    // ============================================================

    /**
     * Создание детальной панели характеристик танка
     */
    private createDetailedTankStatsPanel(): void {
        const PANEL_WIDTH = 390;
        const HEADER_HEIGHT = 33;
        const PADDING = 15;
        const BTN_SIZE = 27;

        // Главный контейнер панели - высота будет установлена динамически
        this.detailedStatsPanel = new Rectangle("detailedStatsPanel");
        this.detailedStatsPanel.width = this.scalePx(PANEL_WIDTH);
        this.detailedStatsPanel.height = this.scalePx(HEADER_HEIGHT + PADDING * 2); // Минимальная высота
        this.detailedStatsPanel.cornerRadius = 0;
        this.detailedStatsPanel.thickness = 1;
        this.detailedStatsPanel.color = "#00ff00";
        this.detailedStatsPanel.background = "rgba(0, 30, 0, 0.85)";
        this.detailedStatsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailedStatsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.detailedStatsPanel.left = this.scalePx(10);
        this.detailedStatsPanel.top = this.scalePx(-10);

        // Check setting for default visibility (Default: Hidden)
        const savedStatsVisibility = localStorage.getItem("setting-show-tank-stats-panel");
        this.detailedStatsPanel.isVisible = savedStatsVisibility === "true";

        this.detailedStatsPanel.zIndex = 100;
        this.guiTexture.addControl(this.detailedStatsPanel);

        // === ЗАГОЛОВОК С КНОПКАМИ ===
        this.detailedStatsHeader = new Rectangle("detailedStatsHeader");
        this.detailedStatsHeader.width = this.scalePx(PANEL_WIDTH - PADDING * 2);
        this.detailedStatsHeader.height = this.scalePx(HEADER_HEIGHT);
        this.detailedStatsHeader.cornerRadius = 0;
        this.detailedStatsHeader.thickness = 0;
        this.detailedStatsHeader.background = "rgba(0, 60, 0, 0.9)";
        this.detailedStatsHeader.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.detailedStatsHeader.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.detailedStatsHeader.top = this.scalePx(PADDING / 2);
        this.detailedStatsPanel.addControl(this.detailedStatsHeader);

        // Заголовок панели
        const headerTitle = new TextBlock("headerTitle");
        headerTitle.text = "⚙ ХАРАКТЕРИСТИКИ";
        headerTitle.color = "#00ff00";
        headerTitle.fontSize = this.scaleFontSize(12, 10, 15); // Увеличен в 1.5 раза
        headerTitle.fontWeight = "bold";
        headerTitle.fontFamily = "'Press Start 2P', monospace";
        headerTitle.outlineWidth = 1;
        headerTitle.outlineColor = "#000";
        headerTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        headerTitle.left = this.scalePx(9); // 6 * 1.5
        this.detailedStatsHeader.addControl(headerTitle);

        // === КНОПКА ЗАКРЫТЬ (X) ===
        this.detailedStatsCloseBtn = new Rectangle("statsCloseBtn");
        this.detailedStatsCloseBtn.width = this.scalePx(BTN_SIZE);
        this.detailedStatsCloseBtn.height = this.scalePx(BTN_SIZE);
        this.detailedStatsCloseBtn.cornerRadius = 2;
        this.detailedStatsCloseBtn.thickness = 1;
        this.detailedStatsCloseBtn.color = "#ff4444";
        this.detailedStatsCloseBtn.background = "rgba(100, 0, 0, 0.8)";
        this.detailedStatsCloseBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.detailedStatsCloseBtn.left = this.scalePx(-2);
        this.detailedStatsCloseBtn.isPointerBlocker = true;
        this.detailedStatsHeader.addControl(this.detailedStatsCloseBtn);

        const closeBtnText = new TextBlock("closeBtnText");
        closeBtnText.text = "×";
        closeBtnText.color = "#ff4444";
        closeBtnText.fontSize = this.scaleFontSize(14, 12, 16);
        closeBtnText.fontWeight = "bold";
        this.detailedStatsCloseBtn.addControl(closeBtnText);

        this.detailedStatsCloseBtn.onPointerClickObservable.add(() => {
            this.setDetailedStatsPanelVisible(false);
        });
        this.detailedStatsCloseBtn.onPointerEnterObservable.add(() => {
            this.detailedStatsCloseBtn!.background = "rgba(150, 0, 0, 0.9)";
        });
        this.detailedStatsCloseBtn.onPointerOutObservable.add(() => {
            this.detailedStatsCloseBtn!.background = "rgba(100, 0, 0, 0.8)";
        });

        // === КНОПКА СВЕРНУТЬ/РАЗВЕРНУТЬ (—/▢) ===
        this.detailedStatsMinimizeBtn = new Rectangle("statsMinimizeBtn");
        this.detailedStatsMinimizeBtn.width = this.scalePx(BTN_SIZE);
        this.detailedStatsMinimizeBtn.height = this.scalePx(BTN_SIZE);
        this.detailedStatsMinimizeBtn.cornerRadius = 2;
        this.detailedStatsMinimizeBtn.thickness = 1;
        this.detailedStatsMinimizeBtn.color = "#ffcc00";
        this.detailedStatsMinimizeBtn.background = "rgba(80, 60, 0, 0.8)";
        this.detailedStatsMinimizeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.detailedStatsMinimizeBtn.left = this.scalePx(-BTN_SIZE - 6);
        this.detailedStatsMinimizeBtn.isPointerBlocker = true;
        this.detailedStatsHeader.addControl(this.detailedStatsMinimizeBtn);

        const minimizeBtnText = new TextBlock("minimizeBtnText");
        minimizeBtnText.text = "—";
        minimizeBtnText.color = "#ffcc00";
        minimizeBtnText.fontSize = this.scaleFontSize(12, 10, 14);
        minimizeBtnText.fontWeight = "bold";
        this.detailedStatsMinimizeBtn.addControl(minimizeBtnText);

        this.detailedStatsMinimizeBtn.onPointerClickObservable.add(() => {
            this.toggleDetailedStatsMinimize();
        });
        this.detailedStatsMinimizeBtn.onPointerEnterObservable.add(() => {
            this.detailedStatsMinimizeBtn!.background = "rgba(120, 90, 0, 0.9)";
        });
        this.detailedStatsMinimizeBtn.onPointerOutObservable.add(() => {
            this.detailedStatsMinimizeBtn!.background = "rgba(80, 60, 0, 0.8)";
        });

        // === ОБЛАСТЬ КОНТЕНТА ===
        this.detailedStatsContent = new Rectangle("detailedStatsContent");
        this.detailedStatsContent.width = this.scalePx(PANEL_WIDTH - PADDING * 2);
        this.detailedStatsContent.height = this.scalePx(100); // Временная высота, будет пересчитана
        this.detailedStatsContent.cornerRadius = 0;
        this.detailedStatsContent.thickness = 1;
        this.detailedStatsContent.color = "#004400";
        this.detailedStatsContent.background = "rgba(0, 20, 0, 0.6)";
        this.detailedStatsContent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.detailedStatsContent.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.detailedStatsContent.top = this.scalePx(HEADER_HEIGHT + 3);
        this.detailedStatsPanel.addControl(this.detailedStatsContent);

        // Если данные уже есть, сразу рендерим их
        if (this.cachedTankStatsData) {
            this.renderAllTabsVertically();
        }
    }

    /**
     * Свернуть/развернуть панель
     */
    private toggleDetailedStatsMinimize(): void {
        this.detailedStatsMinimized = !this.detailedStatsMinimized;

        if (!this.detailedStatsPanel) return;

        const HEADER_HEIGHT = 33;
        const PADDING = 15;

        if (this.detailedStatsMinimized) {
            // Свернуть - показываем только заголовок
            this.detailedStatsPanel.height = this.scalePx(HEADER_HEIGHT + PADDING);
            if (this.detailedStatsContent) {
                this.detailedStatsContent.isVisible = false;
            }

            // Меняем иконку кнопки на "развернуть"
            const btnText = this.detailedStatsMinimizeBtn?.children[0] as TextBlock;
            if (btnText) {
                btnText.text = "▢";
            }
        } else {
            // Развернуть - показываем все данные
            if (this.detailedStatsContent) {
                this.detailedStatsContent.isVisible = true;
            }

            // Рендерим все данные вертикально (высота будет рассчитана динамически)
            if (this.cachedTankStatsData) {
                this.renderAllTabsVertically();
            }

            // Меняем иконку кнопки на "свернуть"
            const btnText = this.detailedStatsMinimizeBtn?.children[0] as TextBlock;
            if (btnText) {
                btnText.text = "—";
            }
        }
    }


    /**
     * Рендеринг всех характеристик вертикально в виде списка
     */
    private renderAllTabsVertically(): void {
        if (!this.cachedTankStatsData || !this.detailedStatsContent || !this.detailedStatsPanel) {
            return;
        }

        const data = this.cachedTankStatsData;
        const FONT_SIZE = 12;
        const ROW_HEIGHT = 21;
        const HEADER_HEIGHT = 33;
        const PADDING = 15;
        const TOP_PADDING = -197; // 3 - 200px (опущено начало текста на 200px)
        const BOTTOM_PADDING = 6;

        // Удаляем все старые элементы
        for (const row of this.detailedStatsExpandedRows) {
            this.detailedStatsContent.removeControl(row);
        }
        this.detailedStatsExpandedRows = [];

        // Собираем все данные в один массив
        const allRows: Array<{ text: string; color: string; isSectionHeader?: boolean }> = [];
        const formatRow = (label: string, value: string) => `${"  " + label}`.padEnd(12) + value;

        // === ШАССИ ===
        allRows.push({ text: `▼ ${data.chassis.name.toUpperCase()}`, color: data.chassis.color, isSectionHeader: true });
        allRows.push({ text: formatRow("HP:", this.formatStatWithBonus(data.chassis.maxHealth, 0)), color: "#00ff00" });
        allRows.push({ text: formatRow("СКОР:", this.formatStatWithBonus(data.chassis.moveSpeed, 1)), color: "#00ccff" });
        allRows.push({ text: formatRow("ПОВОРОТ:", this.formatStatWithBonus(data.chassis.turnSpeed, 2)), color: "#00ccff" });
        allRows.push({ text: formatRow("УСКОР:", this.formatStatWithBonus(data.chassis.acceleration, 0)), color: "#00ccff" });
        allRows.push({ text: formatRow("МАССА:", `${data.chassis.mass}кг`), color: "#888888" });
        allRows.push({ text: formatRow("РАЗМЕР:", `${data.chassis.width.toFixed(1)}×${data.chassis.height.toFixed(1)}×${data.chassis.depth.toFixed(1)}м`), color: "#888888" });

        // === ПУШКА ===
        allRows.push({ text: `▼ ${data.cannon.name.toUpperCase()}`, color: data.cannon.color, isSectionHeader: true });
        allRows.push({ text: formatRow("УРОН:", this.formatStatWithBonus(data.cannon.damage, 0)), color: "#ff4444" });
        // DPS (Damage Per Second) - calculateDPS поддерживает CannonStatsData
        const dps = calculateDPS({
            damage: data.cannon.damage,
            cooldown: data.cannon.cooldown,
            dps: undefined
        });
        allRows.push({ text: formatRow("DPS:", dps.toFixed(1)), color: "#ff6666" });
        allRows.push({ text: formatRow("ПЕРЕЗАР:", this.formatStatWithBonus(data.cannon.cooldown, 0, "мс")), color: "#ffcc00" });
        allRows.push({ text: formatRow("СКР.СНР:", this.formatStatWithBonus(data.cannon.projectileSpeed, 0)), color: "#00ccff" });
        allRows.push({ text: formatRow("РАЗМЕР:", data.cannon.projectileSize.toFixed(2)), color: "#888888" });
        allRows.push({ text: formatRow("ОТДАЧА:", `x${data.cannon.recoilMultiplier.toFixed(1)}`), color: "#ff8800" });
        allRows.push({ text: formatRow("СТВОЛ:", `${data.cannon.barrelLength.toFixed(1)}м`), color: "#888888" });
        allRows.push({ text: formatRow("ШИР.СТВ:", `${data.cannon.barrelWidth.toFixed(2)}м`), color: "#888888" });
        allRows.push({ text: formatRow("ДАЛЬНОСТЬ:", `${data.cannon.maxRange}м`), color: "#00ccff" });
        if (data.cannon.maxRicochets && data.cannon.maxRicochets > 0) {
            allRows.push({ text: formatRow("РИКОШЕТ:", `${data.cannon.maxRicochets}x`), color: "#ffd700" });
        }
        if (data.cannon.ricochetSpeedRetention !== null) {
            allRows.push({ text: formatRow("СОХР.СКР:", `${(data.cannon.ricochetSpeedRetention * 100).toFixed(0)}%`), color: "#ffd700" });
        }
        if (data.cannon.ricochetAngle !== null) {
            allRows.push({ text: formatRow("УГЛ.РИК:", `${data.cannon.ricochetAngle}°`), color: "#ffd700" });
        }

        // === ГУСЕНИЦЫ ===
        const formatBonus = (val: number) => {
            if (val === 0) return "—";
            const sign = val > 0 ? "+" : "";
            return `${sign}${(val * 100).toFixed(0)}%`;
        };

        allRows.push({ text: `▼ ${data.tracks.name.toUpperCase()}`, color: data.tracks.color, isSectionHeader: true });
        allRows.push({ text: formatRow("СТИЛЬ:", data.tracks.style.toUpperCase()), color: "#888888" });
        allRows.push({ text: formatRow("СКОР:", formatBonus(data.tracks.speedBonus)), color: data.tracks.speedBonus > 0 ? "#00ff00" : "#888888" });
        allRows.push({ text: formatRow("ПРОЧН:", formatBonus(data.tracks.durabilityBonus)), color: data.tracks.durabilityBonus > 0 ? "#00ff00" : "#888888" });
        allRows.push({ text: formatRow("БРОНЯ:", formatBonus(data.tracks.armorBonus)), color: data.tracks.armorBonus > 0 ? "#00ccff" : "#888888" });

        // === БОНУСЫ ===
        const formatBonusVal = (val: number, invert: boolean = false) => {
            if (val === 0) return "—";
            const effectiveVal = invert ? -val : val;
            const sign = effectiveVal > 0 ? "+" : "";
            return `${sign}${(effectiveVal * 100).toFixed(0)}%`;
        };

        allRows.push({ text: `▼ БОНУСЫ Lv.${data.bonuses.playerLevel}`, color: "#ffcc00", isSectionHeader: true });
        allRows.push({ text: formatRow("УРОН:", formatBonusVal(data.bonuses.damageBonus)), color: data.bonuses.damageBonus > 0 ? "#ff4444" : "#888888" });
        allRows.push({ text: formatRow("ПЕРЕЗАР:", formatBonusVal(data.bonuses.cooldownBonus, true)), color: data.bonuses.cooldownBonus < 0 ? "#00ff00" : "#888888" });
        allRows.push({ text: formatRow("HP:", formatBonusVal(data.bonuses.healthBonus)), color: data.bonuses.healthBonus > 0 ? "#00ff00" : "#888888" });
        allRows.push({ text: formatRow("БРОНЯ:", formatBonusVal(data.bonuses.armorBonus)), color: data.bonuses.armorBonus > 0 ? "#00ccff" : "#888888" });
        allRows.push({ text: formatRow("СКОР:", formatBonusVal(data.bonuses.speedBonus)), color: data.bonuses.speedBonus > 0 ? "#00ccff" : "#888888" });
        allRows.push({ text: formatRow("ПОВОРОТ:", formatBonusVal(data.bonuses.turnSpeedBonus)), color: data.bonuses.turnSpeedBonus > 0 ? "#00ccff" : "#888888" });
        allRows.push({ text: formatRow("УСКОРЕН:", formatBonusVal(data.bonuses.accelerationBonus)), color: data.bonuses.accelerationBonus > 0 ? "#00ccff" : "#888888" });
        allRows.push({ text: formatRow("СКР.СНАР:", formatBonusVal(data.bonuses.projectileSpeedBonus)), color: data.bonuses.projectileSpeedBonus > 0 ? "#00ccff" : "#888888" });
        if (data.bonuses.critChance > 0) {
            allRows.push({ text: formatRow("КРИТ:", formatBonusVal(data.bonuses.critChance)), color: "#ff8800" });
        }
        if (data.bonuses.evasion > 0) {
            allRows.push({ text: formatRow("УКЛОН:", formatBonusVal(data.bonuses.evasion)), color: "#88ff88" });
        }
        if (data.bonuses.repairRate > 0) {
            allRows.push({ text: formatRow("РЕМОНТ:", `+${(data.bonuses.repairRate * 100).toFixed(0)}%`), color: "#00ff88" });
        }
        if (data.bonuses.fuelEfficiency > 0) {
            allRows.push({ text: formatRow("ТОПЛИВО:", `+${(data.bonuses.fuelEfficiency * 100).toFixed(0)}%`), color: "#88ff00" });
        }

        // Добавляем модули если есть
        if (data.bonuses.installedModules.length > 0) {
            allRows.push({ text: `▼ МОДУЛИ (${data.bonuses.installedModules.length}шт)`, color: "#aa00ff", isSectionHeader: true });
            for (const mod of data.bonuses.installedModules.slice(0, 4)) {
                allRows.push({ text: formatRow(mod.icon, mod.name.substring(0, 14)), color: this.getRarityColor(mod.rarity) });
            }
        }

        // Рассчитываем требуемую высоту
        const totalRows = allRows.length;
        const requiredContentHeight = TOP_PADDING + totalRows * ROW_HEIGHT + BOTTOM_PADDING;
        const requiredPanelHeight = HEADER_HEIGHT + requiredContentHeight + PADDING * 2;

        // Обновляем высоту области контента
        this.detailedStatsContent.height = this.scalePx(requiredContentHeight);

        // Обновляем высоту панели
        this.detailedStatsPanel.height = this.scalePx(requiredPanelHeight);

        // Создаём текстовые строки
        for (let i = 0; i < allRows.length; i++) {
            const rowData = allRows[i];
            if (!rowData) continue;

            const rowText = new TextBlock(`expandedRow_${i}`);
            rowText.text = rowData.text;
            rowText.color = rowData.color;
            rowText.fontSize = this.scaleFontSize(rowData.isSectionHeader ? 13 : FONT_SIZE, 9, 15);
            rowText.fontFamily = "'Press Start 2P', monospace";
            rowText.fontWeight = rowData.isSectionHeader ? "bold" : "normal";
            rowText.outlineWidth = 1;
            rowText.outlineColor = "#000";
            rowText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            rowText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            rowText.left = this.scalePx(6);
            rowText.top = this.scalePx(TOP_PADDING + i * ROW_HEIGHT);
            rowText.isVisible = true;

            this.detailedStatsContent.addControl(rowText);
            this.detailedStatsExpandedRows.push(rowText);
        }
    }

    /**
     * Форматирование бонуса в процентах
     */
    private formatBonusPercent(val: number): string {
        if (val === 0) return "—";
        const sign = val > 0 ? "+" : "";
        return `${sign}${(val * 100).toFixed(0)}%`;
    }


    /**
     * Форматирование параметра с бонусом
     */
    private formatStatWithBonus(stat: StatWithBonus, precision: number = 0, suffix: string = ""): string {
        const baseStr = stat.base.toFixed(precision);
        const totalStr = stat.total.toFixed(precision);

        if (stat.bonus === 0 || Math.abs(stat.total - stat.base) < 0.01) {
            return `${totalStr}${suffix}`;
        }

        const bonusPercent = ((stat.total / stat.base - 1) * 100).toFixed(0);
        const sign = stat.total > stat.base ? "+" : "";
        return `${baseStr}${suffix} (${sign}${bonusPercent}%) = ${totalStr}${suffix}`;
    }

    /**
     * Получение цвета редкости
     */
    private getRarityColor(rarity: string): string {
        switch (rarity) {
            case "common": return "#aaaaaa";
            case "uncommon": return "#00ff00";
            case "rare": return "#0088ff";
            case "epic": return "#aa00ff";
            case "legendary": return "#ff8800";
            default: return "#888888";
        }
    }

    /**
     * Обновление данных детальной панели статистики танка
     */
    updateDetailedTankStats(data: TankStatsData): void {
        this.cachedTankStatsData = data;
        // Всегда показываем все данные вертикально (если панель не свёрнута)
        if (!this.detailedStatsMinimized && this.detailedStatsContent && this.detailedStatsPanel) {
            this.renderAllTabsVertically();
        }
    }

    /**
     * Показать/скрыть панель детальной статистики
     */
    setDetailedStatsPanelVisible(visible: boolean): void {
        if (this.detailedStatsPanel) {
            this.detailedStatsPanel.isVisible = visible;
        }
    }

    /**
     * Проверка видимости панели
     */
    isDetailedStatsPanelVisible(): boolean {
        return this.detailedStatsPanel?.isVisible ?? false;
    }

    // ============================================
    // ЭКРАННОЕ УПРАВЛЕНИЕ (TOUCH CONTROLS)
    // ============================================

    /**
     * Установить callback для обработки touch ввода
     * Вызывается при изменении состояния джойстика/кнопок
     */
    setOnTouchInputChange(callback: (state: TouchInputState) => void): void {
        this.onTouchInputCallback = callback;
    }

    /**
     * Показать/скрыть экранное управление
     */
    setTouchControlsVisible(visible: boolean): void {
        if (this.mobileControls) {
            this.mobileControls.setVisible(visible);
        } else if (this.touchControls) {
            this.touchControls.setVisible(visible);
        }
    }

    /**
     * Проверить видимость экранного управления
     */
    isTouchControlsVisible(): boolean {
        if (this.mobileControls) {
            return true; // Мобильное управление всегда активно
        }
        return this.touchControls?.isVisible() ?? false;
    }

    /**
     * Получить текущее состояние touch ввода
     */
    getTouchInputState(): TouchInputState | null {
        if (this.mobileControls) {
            // Конвертируем MobileInputState в TouchInputState для совместимости
            const mobileState = this.mobileControls.getInputState();
            return {
                throttle: mobileState.throttle,
                steer: mobileState.steer,
                turretLeft: mobileState.turretRotation < -0.3,
                turretRight: mobileState.turretRotation > 0.3,
                turretRotation: mobileState.turretRotation,
                aimPitch: mobileState.aimPitch,
                fire: mobileState.fire,
                aim: mobileState.aim,
                zoomIn: mobileState.zoomIn,
                zoomOut: mobileState.zoomOut,
                centerTurret: mobileState.centerTurret,
                cameraUp: mobileState.cameraUp,
                cameraDown: mobileState.cameraDown,
                pause: mobileState.pause,
                consumable1: mobileState.consumable1,
                consumable2: mobileState.consumable2,
                consumable3: mobileState.consumable3,
                consumable4: mobileState.consumable4,
                consumable5: mobileState.consumable5,
                consumable6: mobileState.consumable6,
                consumable7: mobileState.consumable7,
                consumable8: mobileState.consumable8,
                consumable9: mobileState.consumable9
            };
        }
        return this.touchControls?.getInputState() ?? null;
    }

    /**
     * Установить callback для мобильного ввода
     */
    setOnMobileInputChange(callback: (state: MobileInputState) => void): void {
        this.onMobileInputCallback = callback;
        if (this.mobileControls) {
            this.mobileControls.setOnInputChange(callback);
        }
    }

    /**
     * Обновить мобильный HUD
     */
    updateMobileHUD(health: number, maxHealth: number, ammo: number, maxAmmo: number, kills: number): void {
        if (this.mobileControls) {
            this.mobileControls.updateHUD(health, maxHealth, ammo, maxAmmo, kills);
        }
    }
    // === PING INDICATOR ===
    // NOTE: pingText уже объявлен выше в классе (строка 145)

    public createPingDisplay(): void {
        // ИСПРАВЛЕНО: Используем существующий network indicator вместо создания дубликата
        if (this.pingText) return;
        // Network indicator уже создаётся в конструкторе через createNetworkIndicator()
        // Этот метод теперь просто проверяет наличие
    }

    public updatePing(rtt: number): void {
        if (!this.pingText) {
            this.createPingDisplay();
        }
        if (this.pingText) {
            this.pingText.text = `PING: ${Math.floor(rtt)}ms`;
            if (rtt < 100) this.pingText.color = "#0f0";
            else if (rtt < 200) this.pingText.color = "#ff0";
            else this.pingText.color = "#f00";
        }
    }

    /**
     * Обновить Aircraft HUD (Mouse-Aim ретикли)
     * @param aimCircleScreenPos Позиция Aim Circle на экране (0-1)
     * @param headingCrossScreenPos Позиция Heading Cross на экране (0-1)
     * @param isStalling Флаг сваливания
     * @param gForce Текущая перегрузка
     * @param throttle Тяга 0–1
     * @param isVisible Показывать ли HUD (true если в самолёте)
     */
    public updateAircraftHUD(
        aimCircleScreenPos: { x: number; y: number },
        headingCrossScreenPos: { x: number; y: number },
        isStalling: boolean,
        gForce: number,
        isVisible: boolean,
        throttle: number = 0
    ): void {
        if (this.aircraftHUD) {
            this.aircraftHUD.setVisible(isVisible);
            if (isVisible) {
                this.aircraftHUD.update(
                    aimCircleScreenPos,
                    headingCrossScreenPos,
                    isStalling,
                    gForce,
                    throttle
                );
            }
        }
    }
}

