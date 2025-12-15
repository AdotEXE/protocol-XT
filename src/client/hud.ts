import { 
    Scene,
    Vector3
} from "@babylonjs/core";
import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { scalePixels } from "./utils/uiScale";

// ULTRA SIMPLE HUD - NO gradients, NO shadows, NO alpha, NO transparency
// Pure solid colors only!

export class HUD {
    private scene: Scene;
    private guiTexture: AdvancedDynamicTexture;
    
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
    
    // Target indicator (под компасом)
    private targetIndicator: Rectangle | null = null;
    private targetNameText: TextBlock | null = null;
    private targetHealthBar: Rectangle | null = null;
    private targetHealthFill: Rectangle | null = null;
    private targetHealthText: TextBlock | null = null;
    private targetDistanceText: TextBlock | null = null;
    
    // Damage indicator
    private damageIndicator!: Rectangle;
    
    // Low HP effect (vignette + pulse)
    private lowHpVignette: Rectangle | null = null;
    private lowHpPulseTime = 0;
    private isLowHp = false;
    
    // Minimap
    private minimapContainer!: Rectangle;
    private radarArea: Rectangle | null = null; // Область радара для врагов
    private minimapEnemies: Rectangle[] = [];
    // Буквенное обозначение направления движения над радаром
    private directionLabelsContainer: Rectangle | null = null;
    private movementDirectionLabel: TextBlock | null = null;
    // Пул объектов для маркеров врагов (переиспользование вместо создания/удаления)
    private enemyMarkerPool: Rectangle[] = [];
    private enemyBarrelPool: Rectangle[] = [];
    private poolSize = 50; // Максимум врагов на радаре
    
    // Radar scan line animation
    private radarScanLine: Rectangle | null = null;
    private radarScanAngle = 0;
    private lastScanTime = 0;
    private scannedEnemies: Map<string, { marker: Rectangle, fadeTime: number }> = new Map();
    
    // Fuel indicator
    private fuelBar: Rectangle | null = null;
    private fuelFill: Rectangle | null = null;
    private fuelText: TextBlock | null = null;
    
    // Tank status block (слева от радара)
    private tankStatusContainer: Rectangle | null = null;
    private tankStatusHealthText: TextBlock | null = null;
    private tankStatusFuelText: TextBlock | null = null;
    private tankStatusArmorText: TextBlock | null = null;
    private currentFuel: number = 100;
    private maxFuel: number = 100;
    private currentArmor: number = 0;
    
    // POI indicators
    private _poiMarkers: Map<string, Rectangle> = new Map();
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
    private notificationContainer: Rectangle | null = null;
    
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
    private readonly maxActiveEffectsSlots = 8; // 5+ слотов (минимум 5 видимых)
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
    
    // FPS counter
    private fpsText: TextBlock | null = null;
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
    private _tutorialStartTime = 0;
    private hasMoved = false;
    private hasShot = false;
    private onTutorialCompleteCallback: (() => void) | null = null;
    
    // Game time tracking
    private gameTimeText: TextBlock | null = null;
    private gameStartTime = Date.now();
    
    // Enemy distance indicator
    private enemyDistanceText: TextBlock | null = null;
    
    // Animation tracking
    private animationTime = 0;
    
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
    private _playerProgression: any = null;
    private experienceSubscription: any = null;
    
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
    
    // Directional damage indicators
    private damageDirectionIndicators: Map<string, { element: Rectangle, fadeTime: number }> = new Map();
    private damageIndicatorDuration = 1500; // ms
    
    // Values
    public maxHealth = 100;
    public currentHealth = 100;
    public reloadTime = 2000;
    public isReloading = false;
    private reloadStartTime = 0;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);
        
        // === МИНИМАЛЬНЫЙ HUD ===
        this.createHealthBar();        // Тонкие полоски слева сверху
        this.createReloadIndicator();  // Тонкие полоски слева сверху
        this.createCrosshair();        // Прицел (только при Ctrl)
        this.createCompass();          // Живой компас сверху (без буквенных обозначений)
        this.createMinimap();          // Квадратный радар справа внизу (со спидометром и координатами)
        this.createSpeedometer();      // Спидометр (скрытый, но работает)
        this.createMultiplayerHUD();   // Multiplayer HUD elements
        this.createPositionDisplay();  // Координаты (скрытые, но работают)
        this.createConsumablesDisplay(); // Слоты 1-5 внизу
        this.createCentralXpBar();     // XP bar внизу
        this.createDamageIndicator();  // Индикатор урона
        this.createMessageDisplay();   // Сообщения под компасом
        this.createControlsHint();     // System Terminal слева внизу
        this.createInvulnerabilityIndicator();
        this.createFullMap();          // Полноценная карта (M)
        this.createGarageCaptureBar(); // Прогресс-бар захвата гаража
        this.createComboIndicator();   // Индикатор комбо
        this.createDeathScreen();      // Экран результатов смерти
        this.createDirectionalDamageIndicators(); // Индикаторы направления урона
        this.createFuelIndicator();    // Индикатор топлива
        this.createPOICaptureBar();    // Прогресс-бар захвата POI
        this.createNotificationArea(); // Область уведомлений
        this.createPOI3DMarkersContainer(); // 3D маркеры POI
        this.createMissionPanel();     // Панель миссий
        this.createTutorial();         // Система туториала
        this.createArsenalBlock();     // Блок АРСЕНАЛ (5 слотов для снарядов)
        this.createTankStatusBlock();  // Блок состояния танка (слева от радара)
        this._createFPSCounter();      // FPS счётчик
        
        // Убеждаемся, что прицел скрыт по умолчанию
        this.setAimMode(false);
        this.startAnimations();
        this.setupMapKeyListener(); // Обработка клавиши M
        this.setupResizeHandler(); // Обработка изменения размера окна
        
        console.log("HUD initialized (MINIMAL MODE)");
    }
    
    // === UI SCALING HELPERS ===
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
        
        // Подписываемся на изменения опыта
        if (playerProgression && playerProgression.onExperienceChanged) {
            console.log("[HUD] Subscribing to experience changes");
            this.experienceSubscription = playerProgression.onExperienceChanged.add((data: {
                current: number;
                required: number;
                percent: number;
                level: number;
            }) => {
                console.log("[HUD] Experience changed event received:", data);
                this.updateCentralXp(data.current, data.required, data.level);
            });
        } else {
            console.warn("[HUD] Cannot subscribe to experience changes - playerProgression or onExperienceChanged is null");
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
    
    // Показать эффект повышения уровня
    showLevelUp(level: number, title: string, type: "chassis" | "cannon"): void {
        const container = new Rectangle(`levelUp_${Date.now()}`);
        container.width = this.scalePx(400);
        container.height = this.scalePx(120);
        container.cornerRadius = 0;
        container.thickness = 4;
        container.color = type === "chassis" ? "#0ff" : "#f80";
        container.background = "#000000ee";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.top = this.scalePx(-200);
        this.guiTexture.addControl(container);
        
        const titleText = new TextBlock("levelUpTitle");
        titleText.text = "🎉 УРОВЕНЬ ПОВЫШЕН! 🎉";
        titleText.color = "#ff0";
        titleText.fontSize = this.scaleFontSize(28, 20, 36);
        titleText.fontWeight = "bold";
        titleText.fontFamily = "'Press Start 2P', monospace";
        titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        titleText.top = this.scalePx(-20);
        container.addControl(titleText);
        
        const levelText = new TextBlock("levelUpLevel");
        levelText.text = `Уровень ${level}: ${title}`;
        levelText.color = type === "chassis" ? "#0ff" : "#f80";
        levelText.fontSize = this.scaleFontSize(22, 16, 28);
        levelText.fontWeight = "bold";
        levelText.fontFamily = "'Press Start 2P', monospace";
        levelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelText.top = this.scalePx(20);
        container.addControl(levelText);
        
        // Анимация появления и исчезновения
        let y = -200;
        let alpha = 0;
        let scale = 0.5;
        let phase = 0; // 0 = появление, 1 = показ, 2 = исчезновение
        
        const animate = () => {
            if (phase === 0) {
                // Появление
                alpha += 0.1;
                scale += 0.05;
                if (alpha >= 1) {
                    alpha = 1;
                    scale = 1;
                    phase = 1;
                }
            } else if (phase === 1) {
                // Показ (2 секунды)
                if (Date.now() % 2000 < 100) {
                    phase = 2;
                }
            } else {
                // Исчезновение
                alpha -= 0.05;
                y -= 1;
                if (alpha <= 0) {
                    container.dispose();
                    return;
                }
            }
            
            container.top = `${y}px`;
            container.alpha = alpha;
            container.scaleX = scale;
            container.scaleY = scale;
            
            setTimeout(animate, 16);
        };
        animate();
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
    
    // Запуск анимаций (теперь вызывается из централизованного update)
    private startAnimations() {
        // Анимации теперь обновляются через update() метод
    }
    
    // Обновление анимаций (вызывается из централизованного update)
    updateAnimations(deltaTime: number): void {
        this.animationTime += deltaTime;
        
        // Плавная анимация шкалы опыта
        this.animateXpBar(deltaTime);
        this.updateGlowEffects();
        this.updateComboAnimation(deltaTime);
        
        // Обновление индикаторов направления урона
        this.updateDamageIndicators();
        this.updateHitMarker();
        this.updateLowHpEffect(deltaTime);
        
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
        const glowEntries = Array.from(this.glowElements.values());
        for (let i = 0; i < glowEntries.length; i++) {
            const glow = glowEntries[i];
            const pulse = (Math.sin(this.animationTime * 2) + 1) / 2; // 0-1
            const color = this.interpolateColor(glow.baseColor, glow.glowColor, pulse * 0.5);
            glow.element.color = color;
        }
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
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 255, b: 0 };
    }
    
    // Добавить эффект свечения к элементу
    private addGlowEffect(key: string, element: Rectangle | TextBlock, baseColor: string, glowColor: string) {
        this.glowElements.set(key, { element, baseColor, glowColor });
    }
    
    private createHealthBar() {
        // === HEALTH BAR - НАД РАСХОДНИКАМИ (увеличенный) ===
        const container = new Rectangle("healthContainer");
        container.width = this.scalePx(280); // Увеличено с 200
        container.height = this.scalePx(14); // Увеличено с 8
        container.cornerRadius = 2;
        container.thickness = 2;
        container.color = "#0f04";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "0px";
        container.top = this.scalePx(-90); // HP bar above reload bar (сдвинуто выше)
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
        
        // Текст здоровья (скрыт)
        this.healthText = new TextBlock("healthText");
        this.healthText.text = "100";
        this.healthText.isVisible = false;
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
        // === RELOAD BAR - VISIBLE AND CLEAR (увеличенный) ===
        const container = new Rectangle("reloadContainer");
        container.width = this.scalePx(280); // Увеличено с 200
        container.height = this.scalePx(16); // Увеличено с 12
        container.cornerRadius = 2;
        container.thickness = 2;
        container.color = "#f80";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "0px";
        container.top = this.scalePx(-70); // Reload bar above consumables (сдвинуто выше)
        this.guiTexture.addControl(container);
        
        // Reload bar background
        this.reloadBar = new Rectangle("reloadBar");
        this.reloadBar.width = "100%";
        this.reloadBar.height = "100%";
        this.reloadBar.cornerRadius = 0;
        this.reloadBar.thickness = 0;
        this.reloadBar.background = "#200";
        this.reloadBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(this.reloadBar);
        
        // Reload fill (animated)
        this.reloadFill = new Rectangle("reloadFill");
        this.reloadFill.width = "100%";
        this.reloadFill.height = "100%";
        this.reloadFill.cornerRadius = 0;
        this.reloadFill.thickness = 0;
        this.reloadFill.background = "#0f0";
        this.reloadFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
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
        container.addControl(this.reloadText);
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
        outerRing.color = "#ff440066";
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
        
        // Center dot - точка прицела
        this.crosshairDot = new Rectangle("crosshairDot");
        const dotSize = scalePixels(4);
        this.crosshairDot.width = `${dotSize}px`;
        this.crosshairDot.height = `${dotSize}px`;
        this.crosshairDot.cornerRadius = dotSize / 2;
        this.crosshairDot.thickness = 0;
        this.crosshairDot.background = "#ff3300";
        this.crosshairDot.isVisible = false;
        this.guiTexture.addControl(this.crosshairDot);
        
        // Тактические линии
        const gap = scalePixels(8);
        const length = scalePixels(15);
        const thickness = scalePixels(2);
        
        const createLine = (name: string, w: string, h: string, t: string, l: string) => {
            const line = new Rectangle(name);
            line.width = w;
            line.height = h;
            line.background = "#ff8800";
            line.thickness = 0;
            line.top = t;
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
            shadow.top = `${parseFloat(t) + 1}px`;
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
        
        // Угловые маркеры (диагональные акценты)
        const cornerSize = scalePixels(8);
        const cornerDist = scalePixels(20);
        
        const createCorner = (name: string, top: number, left: number) => {
            const corner = new Rectangle(name);
            corner.width = `${cornerSize}px`;
            corner.height = "1px";
            corner.background = "#ff440088";
            corner.thickness = 0;
            corner.top = `${top}px`;
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
        
        // === ШКАЛА ДАЛЬНОСТИ (справа от прицела) ===
        this.rangeScaleContainer = new Rectangle("rangeScaleContainer");
        this.rangeScaleContainer.width = this.scalePx(50);
        this.rangeScaleContainer.height = this.scalePx(120);
        this.rangeScaleContainer.thickness = 0;
        this.rangeScaleContainer.background = "transparent";
        this.rangeScaleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.rangeScaleContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.rangeScaleContainer.left = this.scalePx(80); // Справа от прицела
        this.rangeScaleContainer.isVisible = false;
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
            this.rangeScaleContainer!.addControl(tick);
        });
        
        // Текущая дальность (большой текст)
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
        scaleBg.addControl(this.rangeIndicator);
        
        // === HIT MARKER (X shape when hitting enemy) ===
        this.createHitMarker();
    }
    
    // Create hit marker (X shape at center of screen)
    private createHitMarker(): void {
        const size = scalePixels(20); // Size of X
        const thickness = scalePixels(3);
        
        // Diagonal line 1 (top-left to bottom-right)
        const line1 = new Rectangle("hitMarker1");
        line1.width = `${size}px`;
        line1.height = `${thickness}px`;
        line1.rotation = Math.PI / 4; // 45 degrees
        line1.background = "#ff0000";
        line1.thickness = 0;
        line1.isVisible = false;
        line1.zIndex = 1000;
        this.guiTexture.addControl(line1);
        this.hitMarkerLines.push(line1);
        
        // Diagonal line 2 (top-right to bottom-left)
        const line2 = new Rectangle("hitMarker2");
        line2.width = `${size}px`;
        line2.height = `${thickness}px`;
        line2.rotation = -Math.PI / 4; // -45 degrees
        line2.background = "#ff0000";
        line2.thickness = 0;
        line2.isVisible = false;
        line2.zIndex = 1000;
        this.guiTexture.addControl(line2);
        this.hitMarkerLines.push(line2);
        
        // Outline for visibility (slightly larger, darker)
        const outline1 = new Rectangle("hitMarkerOutline1");
        outline1.width = `${size + scalePixels(2)}px`;
        outline1.height = `${thickness + scalePixels(2)}px`;
        outline1.rotation = Math.PI / 4;
        outline1.background = "#000000";
        outline1.thickness = 0;
        outline1.isVisible = false;
        outline1.zIndex = 999;
        this.guiTexture.addControl(outline1);
        this.hitMarkerLines.push(outline1);
        
        const outline2 = new Rectangle("hitMarkerOutline2");
        outline2.width = `${size + scalePixels(2)}px`;
        outline2.height = `${thickness + scalePixels(2)}px`;
        outline2.rotation = -Math.PI / 4;
        outline2.background = "#000000";
        outline2.thickness = 0;
        outline2.isVisible = false;
        outline2.zIndex = 999;
        this.guiTexture.addControl(outline2);
        this.hitMarkerLines.push(outline2);
    }
    
    // Show hit marker when hitting an enemy
    showHitMarker(isCritical: boolean = false): void {
        const color = isCritical ? "#ffff00" : "#ff0000"; // Yellow for critical, red for normal
        
        this.hitMarkerLines.forEach((line, i) => {
            line.isVisible = true;
            // First two are main lines, last two are outlines
            if (i < 2) {
                line.background = color;
            }
        });
        
        this.hitMarkerVisible = true;
        this.hitMarkerFadeTime = Date.now() + 300; // Visible for 300ms
    }
    
    // Update hit marker fade
    private updateHitMarker(): void {
        if (this.hitMarkerVisible && Date.now() > this.hitMarkerFadeTime) {
            this.hitMarkerLines.forEach(line => {
                line.isVisible = false;
            });
            this.hitMarkerVisible = false;
        }
    }
    
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
        // Show/hide range scale
        if (this.rangeScaleContainer) {
            this.rangeScaleContainer.isVisible = aiming;
        }
    }
    
    // === ОБНОВЛЕНИЕ ДАЛЬНОСТИ СТРЕЛЬБЫ (фактическая траектория снаряда) ===
    // Использует физическую симуляцию для расчета реальной дальности полёта
    setAimRange(aimPitch: number, projectileSpeed: number = 200, barrelHeight: number = 2.5): void {
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
        9: "💨", // Маневрирование
        0: "🚀"  // Прыжок
    };
    
    // Кулдауны модулей (6-0)
    private moduleCooldowns: Map<number, { startTime: number, duration: number }> = new Map();
    
    // Кулдауны припасов (1-5)
    private consumableCooldowns: Map<number, { startTime: number, duration: number }> = new Map();
    
    // Кулдауны арсенала (0-4)
    private arsenalCooldowns: Map<number, { startTime: number, duration: number }> = new Map();
    
    private createConsumablesDisplay() {
        // === HOTBAR - ЦЕНТР, ПОД RELOAD BAR, НАД XP BAR (10 слотов: 1-0) ===
        const slotWidth = scalePixels(44); // Увеличено с 36
        const slotGap = scalePixels(5); // Увеличено с 4
        const totalWidth = 10 * slotWidth + 9 * slotGap;
        const startX = -totalWidth / 2 + slotWidth / 2;
        
        for (let i = 1; i <= 10; i++) {
            const slotIndex = i === 10 ? 0 : i; // Слот 10 = клавиша 0
            const container = new Rectangle(`consumableSlot${slotIndex}`);
            container.width = `${slotWidth}px`;
            container.height = `${slotWidth}px`;
            container.cornerRadius = 3;
            container.thickness = 2;
            container.color = slotIndex >= 6 || slotIndex === 0 ? "#0ff5" : "#0f05";
            container.background = "#000000bb";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            container.left = `${startX + (i - 1) * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(-25); // Just above XP bar (сдвинуто выше)
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
    }
    
    updateConsumables(consumables: Map<number, any>): void {
        for (let i = 1; i <= 10; i++) {
            const slotIndex = i === 10 ? 0 : i;
            const slot = this.consumablesSlots[i - 1];
            const consumable = consumables.get(slotIndex);
            
            // Для слотов 1-5: отображаем consumables
            if (slotIndex >= 1 && slotIndex <= 5) {
                if (consumable) {
                    slot.container.color = consumable.color || "#0f0";
                    slot.container.background = "#000000cc";
                    slot.icon.text = consumable.icon || "?";
                    slot.icon.color = "#fff";
                    slot.key.color = "#0f0";
                } else {
                    slot.container.color = "#0f02";
                    slot.container.background = "#00000066";
                    slot.icon.text = "";
                    slot.key.color = "#0a0";
                }
            } else {
                // Для слотов 6-0: всегда показываем иконку модуля с улучшенной визуализацией
                slot.container.color = "#0ff4"; // Голубая рамка для модулей
                slot.container.background = "#000000aa";
                slot.icon.text = this.moduleIcons[slotIndex] || "";
                slot.icon.color = "#fff";
                slot.key.color = "#0ff"; // Голубой номер для модулей
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
        const seconds = Math.ceil(cooldownMs / 1000);
        
        if (cooldownMs > 0) {
            // Показываем кулдаун
            hotbarSlot.cooldownOverlay.isVisible = true;
            hotbarSlot.cooldownFill.height = `${percent}%`;
            hotbarSlot.cooldownText.text = seconds > 0 ? `${seconds}` : "";
            
            // Затемняем иконку
            hotbarSlot.container.background = "#000000cc";
            hotbarSlot.icon.color = "#666";
        } else {
            // Скрываем кулдаун
            hotbarSlot.cooldownOverlay.isVisible = false;
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
                const currentAlpha = parseFloat(alphaMatch ? alphaMatch[0] : "0.2");
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
                
                // Текст кулдауна с улучшенной визуализацией
                slotData.cooldownText.isVisible = true;
                const seconds = Math.ceil(remaining / 1000);
                const milliseconds = remaining % 1000;
                
                if (seconds > 0 || milliseconds > 100) {
                    // Показываем секунды, если меньше 10 секунд - показываем десятые
                    if (remaining < 10000) {
                        slotData.cooldownText.text = `${(remaining / 1000).toFixed(1)}`;
                    } else {
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
                } else {
                    slotData.cooldownText.text = "";
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
    private compassEnemyDots: Rectangle[] = []; // Красные точки врагов
    
    private createCompass() {
        // === ЖИВОЙ КОМПАС БЕЗ БУКВЕННЫХ ОБОЗНАЧЕНИЙ ===
        this.compassContainer = new Rectangle("compassContainer");
        this.compassContainer.width = this.scalePx(500); // Увеличено в 2 раза (было 250)
        this.compassContainer.height = this.scalePx(25);
        this.compassContainer.cornerRadius = 0;
        this.compassContainer.thickness = 1;
        this.compassContainer.color = "#0f03";
        this.compassContainer.background = "#00000099";
        this.compassContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.compassContainer.top = this.scalePx(10);
        this.guiTexture.addControl(this.compassContainer);
        
        // Центральный маркер (красный треугольник вниз)
        const centerMarker = new Rectangle("compassCenterMarker");
        centerMarker.width = this.scalePx(2);
        centerMarker.height = this.scalePx(8);
        centerMarker.thickness = 0;
        centerMarker.background = "#f00";
        centerMarker.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        centerMarker.top = "0px";
        this.compassContainer.addControl(centerMarker);
        
        // Буквенные обозначения удалены - они теперь над радаром
        
        // Главное направление (для совместимости, скрыто)
        this.compassText = new TextBlock("compassText");
        this.compassText.text = "N";
        this.compassText.isVisible = false;
        this.compassContainer.addControl(this.compassText);
        
        // Градусы по центру компаса
        this.compassDegrees = new TextBlock("compassDeg");
        this.compassDegrees.text = "0°";
        this.compassDegrees.color = "#0f0";
        this.compassDegrees.fontSize = this.scaleFontSize(14, 10, 18);
        this.compassDegrees.fontWeight = "bold";
        this.compassDegrees.fontFamily = "'Press Start 2P', monospace";
        this.compassDegrees.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassDegrees.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.compassDegrees.top = "0px";
        this.compassContainer.addControl(this.compassDegrees);
        
        // === РИСКИ НА КОМПАСЕ (метки каждые 15 градусов) ===
        this.compassTicks = [];
        for (let i = 0; i < 24; i++) { // 24 риски (360/15 = 24)
            const tick = new Rectangle(`compassTick${i}`);
            const isMajor = i % 4 === 0; // Каждые 4 риски = основные (каждые 60°)
            tick.width = "1px";
            tick.height = isMajor ? "6px" : "3px";
            tick.thickness = 0;
            tick.background = isMajor ? "#0f0" : "#0a0";
            tick.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            tick.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            tick.top = "0px";
            // Позиция будет обновляться в setDirection
            this.compassContainer.addControl(tick);
            this.compassTicks.push(tick);
        }
        
        // === КРАСНЫЕ ТОЧКИ ДЛЯ ВРАГОВ В ПОЛЕ ЗРЕНИЯ ===
        this.compassEnemyDots = [];
        
        // === TARGET INDICATOR (enemy tank popup) ===
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
        this.targetIndicator.isVisible = false;
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
        this.targetDistanceText.text = "0m";
        this.targetDistanceText.color = "#ff0";
        this.targetDistanceText.fontSize = 12;
        this.targetDistanceText.fontWeight = "bold";
        this.targetDistanceText.fontFamily = "'Press Start 2P', monospace";
        this.targetDistanceText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.targetDistanceText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.targetDistanceText.left = "-2px";
        topRow.addControl(this.targetDistanceText);
        
        // Health bar (bottom) - увеличен для лучшей видимости
        this.targetHealthBar = new Rectangle("targetHealthBar");
        this.targetHealthBar.width = "200px";
        this.targetHealthBar.height = "12px"; // Увеличена высота
        this.targetHealthBar.cornerRadius = 0;
        this.targetHealthBar.thickness = 2; // Более толстая рамка
        this.targetHealthBar.color = "#f00";
        this.targetHealthBar.background = "#300";
        this.targetHealthBar.top = "12px";
        this.targetIndicator.addControl(this.targetHealthBar);
        
        // Health fill
        this.targetHealthFill = new Rectangle("targetHealthFill");
        this.targetHealthFill.width = "100%";
        this.targetHealthFill.height = "100%";
        this.targetHealthFill.thickness = 0;
        this.targetHealthFill.background = "#f00";
        this.targetHealthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.targetHealthBar.addControl(this.targetHealthFill);
        
        // Health text (числовое значение) - добавлено для лучшей информативности
        this.targetHealthText = new TextBlock("targetHealthText");
        this.targetHealthText.text = "100/100";
        this.targetHealthText.color = "#0f0";
        this.targetHealthText.fontSize = 8;
        this.targetHealthText.fontFamily = "'Press Start 2P', monospace";
        this.targetHealthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.targetHealthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.targetHealthText.top = "0px";
        this.targetHealthBar.addControl(this.targetHealthText);
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
    private fullMapEnemies: Rectangle[] = [];
    
    private createMinimap() {
        // === RADAR CONTAINER WITH FRAME ===
        // Размеры радара (увеличенные для лучшей читаемости)
        const RADAR_SIZE = 175; // Основной размер радара
        const RADAR_INNER = 165; // Внутренняя область
        const HEADER_HEIGHT = 22; // Высота заголовка
        const INFO_HEIGHT = 22; // Высота блока информации
        
        // Создаём общий контейнер для радара + блока информации + буквенных обозначений
        this.minimapContainer = new Rectangle("minimapContainer");
        this.minimapContainer.width = this.scalePx(RADAR_SIZE);
        this.minimapContainer.height = this.scalePx(RADAR_SIZE + HEADER_HEIGHT + INFO_HEIGHT);
        this.minimapContainer.cornerRadius = 0;
        this.minimapContainer.thickness = 2;
        this.minimapContainer.color = "#0f0";
        this.minimapContainer.background = "#0a1520";
        this.minimapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.minimapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.minimapContainer.left = this.scalePx(-15);
        this.minimapContainer.top = this.scalePx(-45);
        this.guiTexture.addControl(this.minimapContainer);
        
        // === БЛОК БУКВЕННОГО ОБОЗНАЧЕНИЯ НАПРАВЛЕНИЯ ДВИЖЕНИЯ НАД РАДАРОМ ===
        this.directionLabelsContainer = new Rectangle("directionLabelsContainer");
        this.directionLabelsContainer.width = this.scalePx(RADAR_SIZE);
        this.directionLabelsContainer.height = this.scalePx(HEADER_HEIGHT);
        this.directionLabelsContainer.thickness = 1;
        this.directionLabelsContainer.color = "#0f0";
        this.directionLabelsContainer.background = "#000";
        this.directionLabelsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.directionLabelsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.minimapContainer.addControl(this.directionLabelsContainer);
        
        // Создаём одно буквенное обозначение направления движения (над направлением камеры)
        this.movementDirectionLabel = new TextBlock("movementDirectionLabel");
        this.movementDirectionLabel.text = "N";
        this.movementDirectionLabel.color = "#0f0";
        this.movementDirectionLabel.fontSize = this.scaleFontSize(12, 9, 16);
        this.movementDirectionLabel.fontWeight = "bold";
        this.movementDirectionLabel.fontFamily = "'Press Start 2P', monospace";
        this.movementDirectionLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.movementDirectionLabel.top = this.scalePx(5);
        this.directionLabelsContainer.addControl(this.movementDirectionLabel);
        
        // Внутренний контейнер для радара (средняя часть)
        const radarInnerContainer = new Rectangle("radarInnerContainer");
        radarInnerContainer.width = this.scalePx(RADAR_SIZE);
        radarInnerContainer.height = this.scalePx(RADAR_SIZE);
        radarInnerContainer.cornerRadius = 0;
        radarInnerContainer.thickness = 0;
        radarInnerContainer.background = "#0a1520";
        radarInnerContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        radarInnerContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        radarInnerContainer.top = this.scalePx(HEADER_HEIGHT);
        this.minimapContainer.addControl(radarInnerContainer);
        
        // Область радара
        this.radarArea = new Rectangle("radarArea");
        this.radarArea.width = this.scalePx(RADAR_INNER);
        this.radarArea.height = this.scalePx(RADAR_INNER);
        this.radarArea.thickness = 0;
        this.radarArea.background = "transparent";
        this.radarArea.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.radarArea.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        radarInnerContainer.addControl(this.radarArea);
        
        // === CONCENTRIC CIRCLES - ЦЕЛЬНЫЕ И ТОНКИЕ ===
        const ringRadii = [15, 30, 45, 60, 75]; // Увеличенные радиусы для большего радара
        
        for (let ringIdx = 0; ringIdx < ringRadii.length; ringIdx++) {
            const radius = ringRadii[ringIdx];
            const diameter = radius * 2;
            
            // Создаём цельный круг с тонкой рамкой
            const circle = new Rectangle(`ring${ringIdx}`);
            circle.width = this.scalePx(diameter);
            circle.height = this.scalePx(diameter);
            circle.cornerRadius = radius; // Делаем круг
            circle.thickness = 1;
            circle.color = "#0f0";
            circle.background = "transparent";
            circle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            circle.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            if (this.radarArea) {
                this.radarArea.addControl(circle);
            }
        }
        
        // === CROSSHAIR ===
        const hLine = new Rectangle("radarHLine");
        hLine.width = this.scalePx(RADAR_INNER);
        hLine.height = this.scalePx(2);
        hLine.thickness = 0;
        hLine.background = "#0ff";
        this.radarArea.addControl(hLine);
        
        const vLine = new Rectangle("radarVLine");
        vLine.width = this.scalePx(2);
        vLine.height = this.scalePx(RADAR_INNER);
        vLine.thickness = 0;
        vLine.background = "#0f04";
        this.radarArea.addControl(vLine);
        
        // === FOV CONE (скрытый, для направления) ===
        this.fovConeContainer = new Rectangle("fovConeContainer");
        this.fovConeContainer.width = this.scalePx(RADAR_INNER);
        this.fovConeContainer.height = this.scalePx(RADAR_INNER);
        this.fovConeContainer.thickness = 0;
        this.fovConeContainer.background = "transparent";
        this.radarArea.addControl(this.fovConeContainer);
        
        const fovAngle = 60;
        const fovLength = 70; // Увеличено для большего радара
        const halfAngleRad = (fovAngle / 2) * Math.PI / 180;
        
        this.fovLeftLine = new Rectangle("fovLeftLine");
        this.fovLeftLine.width = this.scalePx(2);
        this.fovLeftLine.height = this.scalePx(fovLength);
        this.fovLeftLine.thickness = 0;
        this.fovLeftLine.background = "#0f04";
        this.fovLeftLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fovLeftLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fovLeftLine.top = this.scalePx(-fovLength/2);
        this.fovLeftLine.rotation = -halfAngleRad;
        this.fovLeftLine.transformCenterX = 0.5;
        this.fovLeftLine.transformCenterY = 1;
        this.fovConeContainer.addControl(this.fovLeftLine);
        
        this.fovRightLine = new Rectangle("fovRightLine");
        this.fovRightLine.width = this.scalePx(2);
        this.fovRightLine.height = this.scalePx(fovLength);
        this.fovRightLine.thickness = 0;
        this.fovRightLine.background = "#0f04";
        this.fovRightLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fovRightLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fovRightLine.top = this.scalePx(-fovLength/2);
        this.fovRightLine.rotation = halfAngleRad;
        this.fovRightLine.transformCenterX = 0.5;
        this.fovRightLine.transformCenterY = 1;
        this.fovConeContainer.addControl(this.fovRightLine);
        
        this.fovCenterLine = new Rectangle("fovCenterLine");
        this.fovCenterLine.width = this.scalePx(2);
        this.fovCenterLine.height = this.scalePx(fovLength);
        this.fovCenterLine.thickness = 0;
        this.fovCenterLine.background = "#0f02";
        this.fovCenterLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fovCenterLine.top = this.scalePx(-fovLength/2);
        this.fovConeContainer.addControl(this.fovCenterLine);
        
        // Контейнер для танка игрока
        this.minimapPlayerContainer = new Rectangle("playerContainer");
        this.minimapPlayerContainer.width = this.scalePx(24);
        this.minimapPlayerContainer.height = this.scalePx(24);
        this.minimapPlayerContainer.thickness = 0;
        this.minimapPlayerContainer.background = "transparent";
        this.radarArea.addControl(this.minimapPlayerContainer);
        
        // Маркер игрока (центральный крест из пикселей)
        this.minimapPlayer = new Rectangle("minimapPlayer");
        this.minimapPlayer.width = this.scalePx(8);
        this.minimapPlayer.height = this.scalePx(8);
        this.minimapPlayer.thickness = 0;
        this.minimapPlayer.background = "#0ff"; // Cyan player
        this.minimapPlayerContainer.addControl(this.minimapPlayer);
        
        // Player barrel removed from radar per user request
        // Only player marker shown, no barrel direction indicator
        
        // === RADAR SCAN LINE (rotating once per second) ===
        const scanLineLength = 82; // Увеличено для большего радара
        this.radarScanLine = new Rectangle("radarScanLine");
        this.radarScanLine.width = this.scalePx(2);
        this.radarScanLine.height = this.scalePx(scanLineLength);
        this.radarScanLine.thickness = 0;
        this.radarScanLine.background = "#0f0";
        this.radarScanLine.alpha = 0.8;
        this.radarScanLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.radarScanLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.radarScanLine.top = this.scalePx(-scanLineLength/2);
        this.radarScanLine.transformCenterX = 0.5;
        this.radarScanLine.transformCenterY = 1;
        this.radarArea.addControl(this.radarScanLine);
        
        // Start scan animation
        this.startRadarScanAnimation();
        
        // Линия прицеливания
        this.minimapAimLine = new Rectangle("aimLine");
        this.minimapAimLine.width = this.scalePx(2);
        this.minimapAimLine.height = this.scalePx(75);
        this.minimapAimLine.background = "#f00";
        this.minimapAimLine.top = this.scalePx(-40);
        this.minimapAimLine.isVisible = false;
        this.radarArea.addControl(this.minimapAimLine);
        
        this.minimapAimDot = new Rectangle("aimDot");
        this.minimapAimDot.width = this.scalePx(8);
        this.minimapAimDot.height = this.scalePx(8);
        this.minimapAimDot.background = "#f00";
        this.minimapAimDot.top = this.scalePx(-78);
        this.minimapAimDot.isVisible = false;
        this.radarArea.addControl(this.minimapAimDot);
        
        // === INFO UNDER RADAR (two blocks) - внутри общего контейнера ===
        const infoPanel = new Rectangle("radarInfoPanel");
        infoPanel.width = this.scalePx(RADAR_SIZE);
        infoPanel.height = this.scalePx(INFO_HEIGHT);
        infoPanel.thickness = 0;
        infoPanel.background = "transparent";
        infoPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        infoPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.minimapContainer.addControl(infoPanel);
        
        // Speed block (left)
        const speedBlock = new Rectangle("speedBlock");
        speedBlock.width = this.scalePx(80);
        speedBlock.height = this.scalePx(20);
        speedBlock.thickness = 1;
        speedBlock.color = "#0f0";
        speedBlock.background = "#000";
        speedBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        infoPanel.addControl(speedBlock);
        
        const speedValue = new TextBlock("radarSpeedValue");
        speedValue.text = "0 km/h";
        speedValue.color = "#0f0";
        speedValue.fontSize = this.scaleFontSize(10, 8, 14);
        speedValue.fontFamily = "'Press Start 2P', monospace";
        speedBlock.addControl(speedValue);
        (this.minimapContainer as any)._speedValue = speedValue;
        
        // Coords block (right)
        const coordBlock = new Rectangle("coordBlock");
        coordBlock.width = this.scalePx(90);
        coordBlock.height = this.scalePx(20);
        coordBlock.thickness = 1;
        coordBlock.color = "#0f0";
        coordBlock.background = "#000";
        coordBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        infoPanel.addControl(coordBlock);
        
        const coordValue = new TextBlock("radarCoordValue");
        coordValue.text = "[0, 0]";
        coordValue.color = "#0f0";
        coordValue.fontSize = this.scaleFontSize(10, 8, 14);
        coordValue.fontFamily = "'Press Start 2P', monospace";
        coordBlock.addControl(coordValue);
        (this.minimapContainer as any)._coordValue = coordValue;
    }
    
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
        
        // Low HP vignette (red border effect when HP < 30%)
        this.lowHpVignette = new Rectangle("lowHpVignette");
        this.lowHpVignette.width = "100%";
        this.lowHpVignette.height = "100%";
        this.lowHpVignette.thickness = 0;
        this.lowHpVignette.isVisible = false;
        this.lowHpVignette.isPointerBlocker = false;
        this.lowHpVignette.zIndex = 50;
        
        // Create gradient-like effect with multiple rectangles
        const vignetteTop = new Rectangle("vignetteTop");
        vignetteTop.width = "100%";
        vignetteTop.height = "150px";
        vignetteTop.thickness = 0;
        vignetteTop.background = "linear-gradient(to bottom, rgba(255,0,0,0.4), transparent)";
        vignetteTop.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        vignetteTop.isPointerBlocker = false;
        this.lowHpVignette.addControl(vignetteTop);
        
        const vignetteBottom = new Rectangle("vignetteBottom");
        vignetteBottom.width = "100%";
        vignetteBottom.height = "150px";
        vignetteBottom.thickness = 0;
        vignetteBottom.background = "linear-gradient(to top, rgba(255,0,0,0.4), transparent)";
        vignetteBottom.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        vignetteBottom.isPointerBlocker = false;
        this.lowHpVignette.addControl(vignetteBottom);
        
        const vignetteLeft = new Rectangle("vignetteLeft");
        vignetteLeft.width = "100px";
        vignetteLeft.height = "100%";
        vignetteLeft.thickness = 0;
        vignetteLeft.background = "linear-gradient(to right, rgba(255,0,0,0.3), transparent)";
        vignetteLeft.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        vignetteLeft.isPointerBlocker = false;
        this.lowHpVignette.addControl(vignetteLeft);
        
        const vignetteRight = new Rectangle("vignetteRight");
        vignetteRight.width = "100px";
        vignetteRight.height = "100%";
        vignetteRight.thickness = 0;
        vignetteRight.background = "linear-gradient(to left, rgba(255,0,0,0.3), transparent)";
        vignetteRight.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        vignetteRight.isPointerBlocker = false;
        this.lowHpVignette.addControl(vignetteRight);
        
        this.guiTexture.addControl(this.lowHpVignette);
    }
    
    private createMessageDisplay() {
        // === КОМПАКТНОЕ ОПОВЕЩЕНИЕ ПОД КОМПАСОМ ===
        const msgBg = new Rectangle("msgBg");
        msgBg.width = "280px";
        msgBg.height = "28px";
        msgBg.cornerRadius = 0;
        msgBg.thickness = 1;
        msgBg.color = "#f804";
        msgBg.background = "#000000cc";
        msgBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        msgBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        msgBg.top = "40px"; // Сразу под компасом (компас: top=10px, height=25px)
        msgBg.isVisible = false;
        this.guiTexture.addControl(msgBg);
        
        // Левая полоска
        const leftAccent = new Rectangle("msgLeftAccent");
        leftAccent.width = "3px";
        leftAccent.height = "100%";
        leftAccent.thickness = 0;
        leftAccent.background = "#f80";
        leftAccent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        msgBg.addControl(leftAccent);
        
        // Правая полоска
        const rightAccent = new Rectangle("msgRightAccent");
        rightAccent.width = "3px";
        rightAccent.height = "100%";
        rightAccent.thickness = 0;
        rightAccent.background = "#f80";
        rightAccent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        msgBg.addControl(rightAccent);
        
        // Иконка
        const icon = new TextBlock("msgIcon");
        icon.text = "⚠";
        icon.color = "#f80";
        icon.fontSize = 14;
        icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        icon.left = "10px";
        msgBg.addControl(icon);
        (msgBg as any)._icon = icon;
        
        // Текст сообщения
        this.messageText = new TextBlock("messageText");
        this.messageText.text = "";
        this.messageText.color = "#fff";
        this.messageText.fontSize = 12;
        this.messageText.fontWeight = "bold";
        this.messageText.fontFamily = "'Press Start 2P', monospace";
        this.messageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.messageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        msgBg.addControl(this.messageText);
        
        // Store reference
        (this.messageText as any)._msgBg = msgBg;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createActiveEffectsDisplay() {
        // Active Effects - СПРАВА ОТ МОДУЛЕЙ (горизонтальный ряд из 5+ слотов)
        const slotWidth = scalePixels(44); // Такой же размер как у припасов/модулей
        const slotGap = scalePixels(5);
        const totalWidth = this.maxActiveEffectsSlots * slotWidth + (this.maxActiveEffectsSlots - 1) * slotGap;
        const startX = totalWidth / 2 - slotWidth / 2;
        
        // Вычисляем позицию: модули (слоты 6-0) занимают 5 слотов справа от припасов
        // Припасы: 10 слотов, модули: 5 слотов (6-0), эффекты: 8 слотов справа от модулей
        const consumablesTotalWidth = 10 * slotWidth + 9 * slotGap;
        const modulesTotalWidth = 5 * slotWidth + 4 * slotGap;
        const consumablesRightEdge = consumablesTotalWidth / 2;
        const modulesRightEdge = consumablesRightEdge + modulesTotalWidth + slotGap;
        const effectsLeftEdge = modulesRightEdge + slotGap * 2; // Справа от модулей с отступом
        const effectsCenterOffset = effectsLeftEdge + totalWidth / 2;
        
        // Создаем контейнер для всех слотов эффектов
        this.activeEffectsContainer = new Rectangle("activeEffectsContainer");
        this.activeEffectsContainer.width = `${totalWidth}px`;
        this.activeEffectsContainer.height = `${slotWidth}px`;
        this.activeEffectsContainer.cornerRadius = 0;
        this.activeEffectsContainer.thickness = 0;
        this.activeEffectsContainer.color = "transparent";
        this.activeEffectsContainer.background = "transparent";
        this.activeEffectsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.activeEffectsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.activeEffectsContainer.left = `${effectsCenterOffset}px`;
        this.activeEffectsContainer.top = this.scalePx(-25); // На той же высоте что и припасы/модули
        this.guiTexture.addControl(this.activeEffectsContainer);
        
        // Создаем 8 слотов для эффектов
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
            container.left = `${-startX + i * (slotWidth + slotGap)}px`;
            container.top = "0px";
            container.isVisible = true;
            this.activeEffectsContainer.addControl(container);
            
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
            nameText.fontFamily = "Consolas, monospace";
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
            timerText.fontFamily = "Consolas, monospace";
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
        const maxSlots = this.maxActiveEffectsSlots;
        
        // Вычисляем минимальную прозрачность (динамическое снижение нижнего порога)
        const minAlpha = Math.max(0, 1.0 - (activeCount / maxSlots));
        
        // Обновляем прозрачность каждого слота
        for (let i = 0; i < this.activeEffectsSlots.length; i++) {
            const slot = this.activeEffectsSlots[i];
            const isActive = i < activeCount;
            
            if (isActive && activeCount > 0) {
                // Формула: alpha = 1.0 - (index / activeCount) * (1.0 - minAlpha)
                // Первый слот всегда 100%, последний видимый - minAlpha
                const alpha = 1.0 - (i / activeCount) * (1.0 - minAlpha);
                slot.container.alpha = alpha;
                slot.icon.alpha = alpha;
                slot.nameText.alpha = alpha;
                slot.timerText.alpha = alpha;
                slot.progressBar.alpha = alpha * 0.7; // Прогресс-бар немного прозрачнее
            } else {
                // Неактивные слоты полностью прозрачны
                slot.container.alpha = 0;
                slot.icon.alpha = 0;
                slot.nameText.alpha = 0;
                slot.timerText.alpha = 0;
                slot.progressBar.alpha = 0;
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
            updateInterval: setInterval(() => {
                const elapsed = Date.now() - effectData.startTime;
                const remaining = Math.max(0, duration - elapsed);
                const remainingSeconds = Math.ceil(remaining / 1000);
                const progressPercent = Math.max(0, Math.min(100, (remaining / duration) * 100));
                
                if (remainingSeconds > 0) {
                    slot.timerText.text = `${remainingSeconds}s`;
                    slot.progressBar.width = `${progressPercent}%`;
                } else {
                    // Эффект закончился
                    clearInterval(effectData.updateInterval);
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
            clearInterval((effectData as any).updateInterval);
        }
        
        // Очищаем слот
        const slotIndex = (effectData as any).slotIndex;
        if (slotIndex >= 0 && slotIndex < this.activeEffectsSlots.length) {
            const slot = this.activeEffectsSlots[slotIndex];
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
            const [effectName, effectData] = remainingEffects[i];
            const slot = this.activeEffectsSlots[i];
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
                clearInterval(data.updateInterval);
            }
            data.updateInterval = setInterval(() => {
                const elapsed = Date.now() - data.startTime;
                const remaining = Math.max(0, data.duration - elapsed);
                const remainingSeconds = Math.ceil(remaining / 1000);
                const progressPercent = Math.max(0, Math.min(100, (remaining / data.duration) * 100));
                
                if (remainingSeconds > 0) {
                    slot.timerText.text = `${remainingSeconds}s`;
                    slot.progressBar.width = `${progressPercent}%`;
                } else {
                    clearInterval(data.updateInterval);
                    this.removeActiveEffect(effectName);
                }
            }, 100);
            
            this.activeEffects.set(effectName, data);
        }
        
        // Обновляем прозрачность всех слотов
        this.updateActiveEffectsOpacity();
    }
    
    private createControlsHint() {
        // Controls hint - СКРЫТ (не нужен в игре)
        const hint = new TextBlock("controlsHint");
        hint.text = "";
        hint.isVisible = false;
        this.guiTexture.addControl(hint);
        
    }
    
    private createPositionDisplay() {
        // === СКРЫТЫЕ КООРДИНАТЫ (данные отображаются в радаре) ===
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
    
    setHealth(current: number, max: number = this.maxHealth) {
        this.currentHealth = Math.max(0, Math.min(max, current));
        this.maxHealth = max;
        
        const percent = (this.currentHealth / this.maxHealth) * 100;
        const smoothPercent = Math.max(0, Math.min(100, percent));
        
        // Плавная анимация изменения ширины
        const currentWidth = parseFloat(this.healthFill.width.toString().replace("%", "")) || 100;
        const targetWidth = smoothPercent;
        const widthDiff = targetWidth - currentWidth;
        const newWidth = currentWidth + widthDiff * 0.15; // Плавная интерполяция
        this.healthFill.width = Math.max(0, Math.min(100, newWidth)) + "%";
        
        this.healthText.text = `${Math.round(this.currentHealth)}/${Math.round(this.maxHealth)}`;
        
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
        this.healthText.color = healthColor;
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
        this.isLowHp = percent < 30;
        if (this.lowHpVignette) {
            this.lowHpVignette.isVisible = this.isLowHp;
        }
    }
    
    // Update low HP pulse effect (call from updateAnimations)
    private updateLowHpEffect(deltaTime: number): void {
        if (!this.isLowHp || !this.lowHpVignette) return;
        
        this.lowHpPulseTime += deltaTime;
        
        // Pulse alpha based on sine wave (faster when health is lower)
        const healthPercent = this.currentHealth / this.maxHealth;
        const pulseSpeed = 3 + (1 - healthPercent) * 5; // Faster pulse at lower HP
        const pulse = (Math.sin(this.lowHpPulseTime * pulseSpeed) + 1) / 2; // 0-1
        
        // Stronger effect at lower HP
        const intensity = 0.3 + (1 - healthPercent * 3) * 0.4;
        this.lowHpVignette.alpha = 0.3 + pulse * intensity;
    }
    
    damage(amount: number) {
        this.setHealth(this.currentHealth - amount);
        this.sessionDamage += amount; // Обновляем статистику сессии
        
        // Enhanced RED flash with edge indicators
        const intensity = Math.min(1, amount / 50); // Интенсивность зависит от урона
        
        this.damageIndicator.background = `#${Math.floor(30 + intensity * 220).toString(16).padStart(2, '0')}0000`;
        this.damageIndicator.isVisible = true;
        
        // Edge indicators
        const leftEdge = (this.damageIndicator as any)._leftEdge as Rectangle;
        const rightEdge = (this.damageIndicator as any)._rightEdge as Rectangle;
        
        if (leftEdge && rightEdge) {
            leftEdge.alpha = intensity * 0.8;
            rightEdge.alpha = intensity * 0.8;
            leftEdge.isVisible = true;
            rightEdge.isVisible = true;
        }
        
        setTimeout(() => {
            this.damageIndicator.isVisible = false;
            if (leftEdge) leftEdge.isVisible = false;
            if (rightEdge) rightEdge.isVisible = false;
        }, 150);
    }
    
    heal(amount: number) {
        this.setHealth(this.currentHealth + amount);
        
        // Enhanced GREEN flash with edge indicators
        const intensity = Math.min(1, amount / 50);
        
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
            this.damageIndicator.isVisible = false;
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
    
    updateReload() {
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
        
        // Безопасная проверка перед использованием
        if (this.speedText) {
            this.speedText.text = `${roundedSpeed}`;
        }
        
        // Обновляем скорость в радаре
        if (this.minimapContainer) {
            const speedValue = (this.minimapContainer as any)._speedValue as TextBlock;
            if (speedValue) {
                speedValue.text = `${roundedSpeed} km/h`;
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
    
    setPosition(x: number, z: number) {
        // Безопасная проверка перед использованием
        if (this.positionText) {
            this.positionText.text = `X:${Math.round(x)} Z:${Math.round(z)}`;
        }
        
        // Обновляем координаты в радаре
        if (this.minimapContainer) {
            const coordValue = (this.minimapContainer as any)._coordValue as TextBlock;
            if (coordValue) {
                coordValue.text = `[${Math.round(x)}, ${Math.round(z)}]`;
            }
        }
    }
    
    setDirection(angle: number) {
        if (!this.compassText || !this.compassDegrees || !this.compassContainer) return;
        
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
        
        // Обновляем текст направления
        this.compassText.text = `${directionIcons[index]} ${directions[index]}`;
        
        // Обновляем градусы (УВЕЛИЧЕННЫЕ)
        this.compassDegrees.text = `${degrees}°`;
        this.compassDegrees.color = "#0f0"; // Яркий зелёный
        
        // Обновляем риски на компасе
        this.compassTicks.forEach((tick, i) => {
            const tickAngle = (i * 15) * Math.PI / 180; // Каждые 15 градусов
            const relativeAngle = tickAngle - normalizedAngle;
            const tickX = Math.sin(relativeAngle) * 120; // Радиус компаса
            tick.left = `${tickX}px`;
            tick.isVisible = Math.abs(tickX) < 125; // Показываем только видимые риски
        });
        
        // Цвет в зависимости от основных направлений
        const isCardinal = index % 2 === 0;
        this.compassText.color = isCardinal ? "#0f0" : "#0a0";
        this.compassContainer.color = isCardinal ? "#0f0" : "#0a0";
        
        // Поворачиваем стрелку направления на радаре (если есть)
        if (this.minimapPlayerDir) {
            const degreesForRotation = (normalizedAngle * 180) / Math.PI;
            this.minimapPlayerDir.rotation = degreesForRotation;
        }
    }
    
    // Обновление буквенного обозначения направления башни над радаром
    setMovementDirection(turretAngle: number) {
        if (!this.movementDirectionLabel) return;
        
        // Нормализуем угол башни к диапазону [0, 2π]
        let angle = turretAngle;
        while (angle < 0) angle += Math.PI * 2;
        while (angle >= Math.PI * 2) angle -= Math.PI * 2;
        
        // Определяем направление относительно карты (8 направлений)
        // В Babylon.js: 0 = +Z (север), π/2 = +X (восток), π = -Z (юг), 3π/2 = -X (запад)
        const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        
        // Вычисляем индекс направления (каждое направление = 45 градусов)
        const index = Math.round(angle / (Math.PI / 4)) % 8;
        
        // Обновляем текст направления
        this.movementDirectionLabel.text = directions[index];
        
        // Цвет в зависимости от основных направлений
        const isCardinal = index % 2 === 0;
        this.movementDirectionLabel.color = isCardinal ? "#0f0" : "#0a0";
        this.movementDirectionLabel.fontSize = directions[index].length === 1 ? 10 : 8;
    }
    
    // Обновление красных точек врагов на компасе
    updateCompassEnemies(enemies: {x: number, z: number, alive: boolean}[], playerPos: Vector3, playerAngle: number): void {
        if (!this.compassContainer) return;
        
        // Удаляем старые точки
        this.compassEnemyDots.forEach(dot => dot.dispose());
        this.compassEnemyDots = [];
        
        // Нормализуем угол игрока
        let normalizedAngle = playerAngle;
        while (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
        while (normalizedAngle >= Math.PI * 2) normalizedAngle -= Math.PI * 2;
        
        // FOV конус (60 градусов = 30 в каждую сторону)
        const fovHalf = 30 * Math.PI / 180;
        
        enemies.forEach((enemy) => {
            if (!enemy.alive) return;
            
            // Вычисляем относительное направление врага
            const dx = enemy.x - playerPos.x;
            const dz = enemy.z - playerPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist < 50) { // Только близкие враги
                const enemyAngle = Math.atan2(dx, dz);
                let relativeAngle = enemyAngle - normalizedAngle;
                
                // Нормализуем к [-π, π]
                while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
                
                // Проверяем, в поле зрения ли враг
                if (Math.abs(relativeAngle) < fovHalf) {
                    // Создаём красную точку на компасе
                    const dot = new Rectangle(`compassEnemy${this.compassEnemyDots.length}`);
                    dot.width = "4px";
                    dot.height = "4px";
                    dot.cornerRadius = 2;
                    dot.thickness = 0;
                    dot.background = "#f00";
                    dot.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                    dot.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                    dot.top = "2px";
                    
                    // Позиция на компасе (радиус 120px)
                    const dotX = Math.sin(relativeAngle) * 120;
                    dot.left = `${dotX}px`;
                    
                    this.compassContainer.addControl(dot);
                    this.compassEnemyDots.push(dot);
                }
            }
        });
    }
    
    addKill() {
        this.killsCount++;
        this.sessionKills++; // Обновляем статистику сессии
        console.log(`[HUD] Kill added! Total: ${this.killsCount}`);
        
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
            clearTimeout(this.messageTimeout);
        }
        
        const msgBg = (this.messageText as any)._msgBg as Rectangle;
        msgBg.isVisible = true;
        msgBg.color = color;
        this.messageText.text = text;
        this.messageText.color = color;
        
        // Если duration = 0, не скрываем автоматически (для таймера респавна)
        if (duration > 0) {
        this.messageTimeout = setTimeout(() => {
            msgBg.isVisible = false;
            }, duration);
        }
    }
    
    showDeathMessage() {
        this.showMessage("DESTROYED! RESPAWN IN 3...", "#f00");
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
        
        // Заголовок DESTROYED
        const title = new TextBlock("deathTitle");
        title.text = "💀 DESTROYED 💀";
        title.color = "#ff0000";
        title.fontSize = 48;
        title.fontWeight = "bold";
        title.fontFamily = "'Press Start 2P', monospace";
        title.top = "-120px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deathScreen.addControl(title);
        
        // Контейнер для статистики
        this.deathStatsContainer = new Rectangle("deathStats");
        this.deathStatsContainer.width = "400px";
        this.deathStatsContainer.height = "200px";
        this.deathStatsContainer.background = "rgba(20, 0, 0, 0.8)";
        this.deathStatsContainer.thickness = 2;
        this.deathStatsContainer.color = "#f00";
        this.deathStatsContainer.cornerRadius = 10;
        this.deathStatsContainer.top = "20px";
        this.deathScreen.addControl(this.deathStatsContainer);
        
        // Заголовок статистики
        const statsTitle = new TextBlock("statsTitle");
        statsTitle.text = "📊 SESSION STATS";
        statsTitle.color = "#ff6666";
        statsTitle.fontSize = 16;
        statsTitle.fontFamily = "'Press Start 2P', monospace";
        statsTitle.top = "-70px";
        this.deathStatsContainer.addControl(statsTitle);
        
        // Убийства
        this.deathKillsText = new TextBlock("deathKills");
        this.deathKillsText.text = "☠ Kills: 0";
        this.deathKillsText.color = "#0f0";
        this.deathKillsText.fontSize = 14;
        this.deathKillsText.fontFamily = "'Press Start 2P', monospace";
        this.deathKillsText.top = "-30px";
        this.deathKillsText.left = "-50px";
        this.deathKillsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.deathStatsContainer.addControl(this.deathKillsText);
        
        // Урон
        this.deathDamageText = new TextBlock("deathDamage");
        this.deathDamageText.text = "💥 Damage: 0";
        this.deathDamageText.color = "#ff8800";
        this.deathDamageText.fontSize = 14;
        this.deathDamageText.fontFamily = "'Press Start 2P', monospace";
        this.deathDamageText.top = "10px";
        this.deathDamageText.left = "-50px";
        this.deathDamageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.deathStatsContainer.addControl(this.deathDamageText);
        
        // Время игры
        this.deathTimeText = new TextBlock("deathTime");
        this.deathTimeText.text = "⏱ Time: 0:00";
        this.deathTimeText.color = "#88ffff";
        this.deathTimeText.fontSize = 14;
        this.deathTimeText.fontFamily = "'Press Start 2P', monospace";
        this.deathTimeText.top = "50px";
        this.deathTimeText.left = "-50px";
        this.deathTimeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.deathStatsContainer.addControl(this.deathTimeText);
        
        // Таймер респавна
        this.deathRespawnText = new TextBlock("deathRespawn");
        this.deathRespawnText.text = "RESPAWN IN 3...";
        this.deathRespawnText.color = "#ffff00";
        this.deathRespawnText.fontSize = 20;
        this.deathRespawnText.fontFamily = "'Press Start 2P', monospace";
        this.deathRespawnText.top = "160px";
        this.deathScreen.addControl(this.deathRespawnText);
    }
    
    private showDeathScreen(): void {
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
        
        // Анимация обратного отсчёта
        let countdown = 3;
        const updateCountdown = () => {
            if (this.deathRespawnText && this.deathScreen?.isVisible) {
                this.deathRespawnText.text = `RESPAWN IN ${countdown}...`;
                countdown--;
                if (countdown >= 0) {
                    setTimeout(updateCountdown, 1000);
                }
            }
        };
        updateCountdown();
    }
    
    private hideDeathScreen(): void {
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
    
    // Показать урон с направлением от позиции атакующего
    showDamageFromPosition(attackerPosition: Vector3, playerPosition: Vector3, playerRotation: number): void {
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
        
        if (relativeAngle >= -deg45 && relativeAngle <= deg45) {
            // Урон спереди
            this.showDamageDirection("top");
        } else if (relativeAngle >= deg45 && relativeAngle <= deg135) {
            // Урон справа
            this.showDamageDirection("right");
        } else if (relativeAngle >= -deg135 && relativeAngle <= -deg45) {
            // Урон слева
            this.showDamageDirection("left");
        } else {
            // Урон сзади
            this.showDamageDirection("bottom");
        }
    }
    
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
                if (this.targetHealthBar) {
                    this.targetHealthBar.color = healthColor;
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
    
    updateMinimap(enemies: {x: number, z: number, alive: boolean, turretRotation?: number}[] | Vector3[], playerPos?: Vector3, tankRotationY?: number, turretRotationY?: number, isAiming?: boolean) {
        // ОПТИМИЗАЦИЯ: Скрываем старые маркеры вместо удаления (переиспользование)
        // Возвращаем в пул
        for (let i = 0; i < this.minimapEnemies.length; i++) {
            const marker = this.minimapEnemies[i];
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
        
        // === ВРАЩАЕМ ВЕСЬ КОНТЕЙНЕР ТАНКА ВМЕСТЕ С БАШНЕЙ ===
        if (this.minimapPlayerContainer) {
            // Контейнер вращается по направлению башни
            this.minimapPlayerContainer.rotation = -angle;
            
            // В режиме прицеливания меняем цвет
            const color = this.isAimingMode ? "#ff0" : "#0f0";
            if (this.minimapPlayerDir) {
                this.minimapPlayerDir.background = color;
                this.minimapPlayerDir.height = this.isAimingMode ? "20px" : "16px";
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
        
        // === ОБНОВЛЯЕМ УГОЛ ОБЗОРА (FOV CONE) ===
        // FOV cone всегда смотрит ВВЕРХ на радаре (куда смотрит игрок)
        // В режиме прицеливания FOV становится ярче
        if (this.fovConeContainer) {
            // FOV конус не вращается - он всегда направлен вверх (туда куда смотрит игрок)
            this.fovConeContainer.rotation = 0;
            
            // Обновляем линии границ
            if (this.fovLeftLine) {
                this.fovLeftLine.background = this.isAimingMode ? "#ff08" : "#0f06";
            }
            if (this.fovRightLine) {
                this.fovRightLine.background = this.isAimingMode ? "#ff08" : "#0f06";
            }
            if (this.fovCenterLine) {
                this.fovCenterLine.background = this.isAimingMode ? "#ff06" : "#0f03";
            }
            
            // Обновляем заполнение (оптимизация: обычный for)
            for (let i = 0; i < this.minimapFovCone.length; i++) {
                this.minimapFovCone[i].background = this.isAimingMode ? "#ff02" : "#0f01";
            }
        }
        
        // Пульсация врагов (для "живости")
        this.enemyPulsePhase = (this.enemyPulsePhase + 0.15) % (Math.PI * 2);
        const pulseSize = 6 + Math.sin(this.enemyPulsePhase) * 2; // 4-8px
        
        // Add new enemy markers - ПУЛЬСИРУЮЩИЕ КРАСНЫЕ КВАДРАТЫ с направлением ствола
        // RADAR RANGE: 250 meters (circles at 50m intervals: 50m, 100m, 150m, 200m, edge=250m)
        const RADAR_RANGE = 250;
        
        // ОПТИМИЗАЦИЯ: Используем обычный for вместо forEach
        const enemyCount = enemies.length;
        for (let i = 0; i < enemyCount; i++) {
            const enemy = enemies[i];
            const isVector = enemy instanceof Vector3;
            const ex = isVector ? (enemy as Vector3).x : (enemy as any).x;
            const ez = isVector ? (enemy as Vector3).z : (enemy as any).z;
            const alive = isVector ? true : (enemy as any).alive;
            const enemyTurretRotation = isVector ? undefined : (enemy as any).turretRotation;
            
            if (!alive) continue; // Пропускаем мёртвых врагов
            
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
            const dist = Math.sqrt(x*x + z*z);
            const clampedX = dist > maxDist ? x * maxDist / dist : x;
            const clampedZ = dist > maxDist ? z * maxDist / dist : z;
            
            // Враг на границе карты - показываем стрелку
            const isEdge = dist > maxDist;
            
            // Calculate angle from center to enemy for scan detection
            const enemyAngleOnRadar = Math.atan2(clampedX, -clampedZ);
            
            // Check if scan line just passed this enemy
            const isScanned = this.isEnemyScanned(enemyAngleOnRadar);
            const enemyKey = `${i}_${ex.toFixed(0)}_${ez.toFixed(0)}`;
            
            if (isScanned && !this.scannedEnemies.has(enemyKey)) {
                // Enemy just scanned - add to scanned list with fade timer
                this.scannedEnemies.set(enemyKey, { marker: null as any, fadeTime: 1500 });
            }
            
            // Check if this enemy is in scanned state
            const scannedData = this.scannedEnemies.get(enemyKey);
            const isFading = scannedData !== undefined;
            
            // ОПТИМИЗАЦИЯ: Переиспользуем маркеры из пула
            let marker: Rectangle;
            if (this.enemyMarkerPool.length > 0) {
                marker = this.enemyMarkerPool.pop()!;
                marker.isVisible = true;
            } else {
                marker = new Rectangle(`enemy${i}`);
                if (this.radarArea) {
                    this.radarArea.addControl(marker);
                }
            }
            
            marker.width = `${isFading ? pulseSize + 3 : pulseSize}px`;
            marker.height = `${isFading ? pulseSize + 3 : pulseSize}px`;
            marker.thickness = isEdge ? 1 : 0;
            marker.color = isFading ? "#0f0" : "#f00";
            
            // Scanned enemies glow bright green then fade to red
            if (isFading && scannedData) {
                const fadeProgress = scannedData.fadeTime / 1500;
                const r = Math.floor(255 * (1 - fadeProgress));
                const g = Math.floor(255 * fadeProgress);
                marker.background = `rgb(${r}, ${g}, 0)`;
                marker.alpha = 0.6 + fadeProgress * 0.4;
                scannedData.marker = marker;
            } else {
                marker.background = isEdge ? "#800" : "#f00";
                marker.alpha = 0.7;
            }
            
            marker.left = `${clampedX}px`;
            marker.top = `${clampedZ}px`;
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
                } else {
                    barrelDir = new Rectangle(`enemyBarrel${i}`);
                    this.radarArea.addControl(barrelDir);
                }
                
                barrelDir.width = "2px";
                barrelDir.height = `${barrelLength}px`;
                barrelDir.thickness = 0;
                barrelDir.background = "#f80"; // Оранжевый цвет для ствола врага
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
    
    update(tankPos: Vector3, speed: number, _isReloading: boolean, _reloadProgress: number) {
        this.setSpeed(speed);
        this.setPosition(tankPos.x, tankPos.z);
        this.updateReload();
        this.updateGameTime();
    }
    
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
        this.fpsContainer.width = this.scalePx(85); // Увеличено для 3-значных чисел (144, 240)
        this.fpsContainer.height = this.scalePx(28);
        this.fpsContainer.cornerRadius = 3;
        this.fpsContainer.thickness = 2;
        this.fpsContainer.color = "#0f03";
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
        this.fpsText.fontSize = this.scaleFontSize(14, 10, 20);
        this.fpsText.fontFamily = "Consolas, monospace";
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
        // Вычисляем ширину XP бара - максимум 800px, но не больше 60% экрана
        const maxWidth = Math.min(800, window.innerWidth * 0.6);
        
        this.centralXpContainer = new Rectangle("centralXpContainer");
        this.centralXpContainer.width = `${maxWidth}px`; // Ограниченная ширина вместо 100%
        this.centralXpContainer.height = this.scalePx(24); // Немного толще
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
        xpTextOutline.text = "LVL 1 XP: 0/100";
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
        this.centralXpText.text = "LVL 1 XP: 0/100";
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
        
        console.log("[HUD] Central XP bar created:", {
            container: !!this.centralXpContainer,
            bar: !!this.centralXpBar,
            text: !!this.centralXpText
        });
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
            console.warn("[HUD] Garage capture UI elements not initialized!");
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
        // Проверяем, что элементы созданы
        if (!this.centralXpBar || !this.centralXpText || !this.centralXpContainer) {
            // Если элементы не созданы, пытаемся создать их заново
            if (!this.centralXpContainer) {
                console.warn("[HUD] Central XP container not found, recreating...");
                this.createCentralXpBar();
            }
            if (!this.centralXpBar || !this.centralXpText) {
                console.warn("[HUD] Central XP bar elements not found!", {
                    bar: !!this.centralXpBar,
                    text: !!this.centralXpText,
                    container: !!this.centralXpContainer
                });
                return;
            }
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
            // Обновляем текст с правильным форматом
            const xpText = `LVL ${validLevel} XP: ${validCurrentXp}/${validXpToNext}`;
            if (this.centralXpText) {
                this.centralXpText.text = xpText;
            }
            // Обновляем обводку тоже
            const xpTextOutline = (this as any).centralXpTextOutline;
            if (xpTextOutline) {
                xpTextOutline.text = xpText;
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
                console.log(`[HUD] XP updated: Level ${validLevel}, XP ${validCurrentXp}/${validXpToNext} (${percent.toFixed(1)}%)`);
            }
        } catch (e) {
            console.error("[HUD] Error updating XP bar:", e, {
                currentXp,
                xpToNext,
                level,
                bar: !!this.centralXpBar,
                text: !!this.centralXpText,
                container: !!this.centralXpContainer
            });
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
                    const baseColor = "#0f0";
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
        this.fullMapContainer.width = "600px";
        this.fullMapContainer.height = "500px";
        this.fullMapContainer.cornerRadius = 0;
        this.fullMapContainer.thickness = 2;
        this.fullMapContainer.color = "#0f0";
        this.fullMapContainer.background = "#000000ee";
        this.fullMapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fullMapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.fullMapContainer.isVisible = false;
        this.guiTexture.addControl(this.fullMapContainer);
        
        // Заголовок
        const title = new TextBlock("mapTitle");
        title.text = "🗺️ TACTICAL MAP [M]";
        title.color = "#0f0";
        title.fontSize = 16;
        title.fontWeight = "bold";
        title.fontFamily = "'Press Start 2P', monospace";
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        title.top = "10px";
        this.fullMapContainer.addControl(title);
        
        // Область карты
        const mapArea = new Rectangle("mapArea");
        mapArea.width = "560px";
        mapArea.height = "420px";
        mapArea.cornerRadius = 0;
        mapArea.thickness = 1;
        mapArea.color = "#0f04";
        mapArea.background = "#001100";
        mapArea.top = "40px";
        this.fullMapContainer.addControl(mapArea);
        
        // Сетка карты (мелкая)
        for (let i = 0; i < 14; i++) {
            const hLine = new Rectangle(`mapHLine${i}`);
            hLine.width = "558px";
            hLine.height = "1px";
            hLine.background = "#0f02";
            hLine.top = `${-195 + i * 30}px`;
            mapArea.addControl(hLine);
            
            const vLine = new Rectangle(`mapVLine${i}`);
            vLine.width = "1px";
            vLine.height = "418px";
            vLine.background = "#0f02";
            vLine.left = `${-265 + i * 40}px`;
            mapArea.addControl(vLine);
        }
        
        // Центральный крест
        const centerH = new Rectangle("mapCenterH");
        centerH.width = "558px";
        centerH.height = "1px";
        centerH.background = "#0f04";
        mapArea.addControl(centerH);
        
        const centerV = new Rectangle("mapCenterV");
        centerV.width = "1px";
        centerV.height = "418px";
        centerV.background = "#0f04";
        mapArea.addControl(centerV);
        
        // Маркер игрока на карте
        const playerMarker = new Rectangle("fullMapPlayer");
        playerMarker.width = "12px";
        playerMarker.height = "12px";
        playerMarker.thickness = 2;
        playerMarker.color = "#0f0";
        playerMarker.background = "#0f0";
        playerMarker.cornerRadius = 6;
        mapArea.addControl(playerMarker);
        (this.fullMapContainer as any)._playerMarker = playerMarker;
        
        // Направление игрока
        const playerDir = new Rectangle("fullMapPlayerDir");
        playerDir.width = "3px";
        playerDir.height = "20px";
        playerDir.background = "#0f0";
        playerDir.top = "-16px";
        mapArea.addControl(playerDir);
        (this.fullMapContainer as any)._playerDir = playerDir;
        
        // Подсказка
        const hint = new TextBlock("mapHint");
        hint.text = "Press M to close • Explored areas shown";
        hint.color = "#0a0";
        hint.fontSize = 10;
        hint.fontFamily = "'Press Start 2P', monospace";
        hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        hint.top = "-10px";
        this.fullMapContainer.addControl(hint);
        
        // Легенда
        const legend = new TextBlock("mapLegend");
        legend.text = "● You  ● Enemies  ▢ Explored";
        legend.color = "#888";
        legend.fontSize = 9;
        legend.fontFamily = "'Press Start 2P', monospace";
        legend.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        legend.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        legend.left = "20px";
        legend.top = "-10px";
        this.fullMapContainer.addControl(legend);
    }
    
    private setupMapKeyListener(): void {
        // Обработчик M перенесён в game.ts для согласованности
        // Теперь карта управляется из Game класса
    }
    
    toggleFullMap(): void {
        this.fullMapVisible = !this.fullMapVisible;
        if (this.fullMapContainer) {
            this.fullMapContainer.isVisible = this.fullMapVisible;
        }
    }
    
    // Обновление полной карты с позицией игрока и врагами
    updateFullMap(playerPos: Vector3, playerRotation: number, enemies: {x: number, z: number, alive: boolean}[]): void {
        if (!this.fullMapContainer || !this.fullMapVisible) return;
        
        // Записываем текущую позицию как исследованную
        const chunkX = Math.floor(playerPos.x / 50);
        const chunkZ = Math.floor(playerPos.z / 50);
        this.exploredAreas.add(`${chunkX},${chunkZ}`);
        
        // Обновляем позицию игрока на карте
        const playerMarker = (this.fullMapContainer as any)._playerMarker as Rectangle;
        const playerDir = (this.fullMapContainer as any)._playerDir as Rectangle;
        
        if (playerMarker && playerDir) {
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
            
            playerDir.left = `${clampedX}px`;
            playerDir.top = `${clampedZ - 16}px`;
            playerDir.rotation = -playerRotation;
        }
        
        // Удаляем старые маркеры врагов
        this.fullMapEnemies.forEach(e => e.dispose());
        this.fullMapEnemies = [];
        
        // Добавляем врагов на карту
        enemies.forEach((enemy, i) => {
            if (!enemy.alive) return;
            
            const scale = 0.5;
            const ex = enemy.x * scale;
            const ez = -enemy.z * scale;
            
            const maxDist = 270;
            if (Math.abs(ex) > maxDist || Math.abs(ez) > 200) return;
            
            const marker = new Rectangle(`fullMapEnemy${i}`);
            marker.width = "8px";
            marker.height = "8px";
            marker.background = "#f00";
            marker.cornerRadius = 4;
            marker.left = `${ex}px`;
            marker.top = `${ez}px`;
            
            // Добавляем в область карты
            const mapArea = this.fullMapContainer?.children[1] as Rectangle;
            if (mapArea) {
                mapArea.addControl(marker);
                this.fullMapEnemies.push(marker);
            }
        });
    }
    
    isFullMapVisible(): boolean {
        return this.fullMapVisible;
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
            const _currentScaleY = this.comboContainer.scaleY || 1.0;
            
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
        // Fuel bar container (below health bar)
        this.fuelBar = new Rectangle("fuelBar");
        this.fuelBar.width = "120px";
        this.fuelBar.height = "8px";
        this.fuelBar.cornerRadius = 2;
        this.fuelBar.color = "#444";
        this.fuelBar.thickness = 1;
        this.fuelBar.background = "#222";
        this.fuelBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fuelBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.fuelBar.left = "10px";
        this.fuelBar.top = "65px";
        this.guiTexture.addControl(this.fuelBar);
        
        // Fuel fill
        this.fuelFill = new Rectangle("fuelFill");
        this.fuelFill.width = "100%";
        this.fuelFill.height = "100%";
        this.fuelFill.background = "#f90";
        this.fuelFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fuelBar.addControl(this.fuelFill);
        
        // Fuel text
        this.fuelText = new TextBlock("fuelText");
        this.fuelText.text = "⛽ 100%";
        this.fuelText.color = "#f90";
        this.fuelText.fontSize = "10px";
        this.fuelText.fontFamily = "monospace";
        this.fuelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fuelText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.fuelText.left = "135px";
        this.fuelText.top = "63px";
        this.guiTexture.addControl(this.fuelText);
    }
    
    updateFuel(current: number, max: number): void {
        if (!this.fuelFill || !this.fuelText) return;
        
        // Сохраняем значения для блока состояния
        this.currentFuel = current;
        this.maxFuel = max;
        
        const percent = Math.max(0, Math.min(100, (current / max) * 100));
        this.fuelFill.width = `${percent}%`;
        this.fuelText.text = `⛽ ${Math.round(percent)}%`;
        
        // Color based on fuel level
        if (percent > 50) {
            this.fuelFill.background = "#f90";
            this.fuelText.color = "#f90";
        } else if (percent > 20) {
            this.fuelFill.background = "#fa0";
            this.fuelText.color = "#fa0";
        } else {
            this.fuelFill.background = "#f30";
            this.fuelText.color = "#f30";
        }
        
        // Обновляем блок состояния танка
        if (this.tankStatusContainer) {
            this.updateTankStatus(this.currentHealth, this.maxHealth, current, max, this.currentArmor);
        }
    }
    
    // === TRACER COUNTER ===
    
    private createTracerCounter(): void {
        // DEPRECATED: Счетчик трассеров теперь в блоке АРСЕНАЛ
        // Оставляем для обратной совместимости, но скрываем
        this.tracerContainer = new Rectangle("tracerContainer");
        this.tracerContainer.width = this.scalePx(90);
        this.tracerContainer.height = this.scalePx(28);
        this.tracerContainer.cornerRadius = 3;
        this.tracerContainer.color = "#f60";
        this.tracerContainer.thickness = 2;
        this.tracerContainer.background = "rgba(50, 20, 0, 0.8)";
        this.tracerContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tracerContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tracerContainer.left = this.scalePx(15);
        this.tracerContainer.top = this.scalePx(50);
        this.tracerContainer.isVisible = false; // Скрыт, так как теперь в арсенале
        this.guiTexture.addControl(this.tracerContainer);
        
        // Tracer icon and count text
        this.tracerCountText = new TextBlock("tracerCountText");
        this.tracerCountText.text = "T: 5/5";
        this.tracerCountText.color = "#f80";
        this.tracerCountText.fontSize = this.scaleFontSize(13, 10, 18);
        this.tracerCountText.fontWeight = "bold";
        this.tracerCountText.fontFamily = "Consolas, monospace";
        this.tracerContainer.addControl(this.tracerCountText);
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
    
    // === TANK STATUS BLOCK ===
    
    private createTankStatusBlock(): void {
        // === БЛОК СОСТОЯНИЯ ТАНКА - СЛЕВА ОТ РАДАРА ===
        // Радар находится: horizontalAlignment: RIGHT, left: -15px, top: -45px
        // Блок состояния должен быть слева от радара
        const blockWidth = this.scalePx(140);
        const blockHeight = this.scalePx(80);
        
        this.tankStatusContainer = new Rectangle("tankStatusContainer");
        this.tankStatusContainer.width = blockWidth;
        this.tankStatusContainer.height = blockHeight;
        this.tankStatusContainer.cornerRadius = 3;
        this.tankStatusContainer.thickness = 2;
        this.tankStatusContainer.color = "#0f0";
        this.tankStatusContainer.background = "#0a1520";
        this.tankStatusContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.tankStatusContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        // Позиционируем слева от радара: радар на -15px, блок на -15px - blockWidth - gap
        // Радар: left = -15px, ширина радара = 175px (RADAR_SIZE)
        const radarLeft = -15;
        const radarWidth = 175;
        const gap = 10;
        const blockWidthNum = scalePixels(140);
        this.tankStatusContainer.left = `${radarLeft - radarWidth - gap - blockWidthNum}px`;
        this.tankStatusContainer.top = this.scalePx(-45); // На той же высоте что и радар
        this.guiTexture.addControl(this.tankStatusContainer);
        
        // Заголовок
        const title = new TextBlock("tankStatusTitle");
        title.text = "ТАНК";
        title.color = "#0f0";
        title.fontSize = this.scaleFontSize(10, 8, 14);
        title.fontWeight = "bold";
        title.fontFamily = "Consolas, monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        title.left = this.scalePx(5);
        title.top = this.scalePx(5);
        this.tankStatusContainer.addControl(title);
        
        // Здоровье
        this.tankStatusHealthText = new TextBlock("tankStatusHealth");
        this.tankStatusHealthText.text = "❤ 100%";
        this.tankStatusHealthText.color = "#0f0";
        this.tankStatusHealthText.fontSize = this.scaleFontSize(11, 9, 16);
        this.tankStatusHealthText.fontWeight = "bold";
        this.tankStatusHealthText.fontFamily = "Consolas, monospace";
        this.tankStatusHealthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusHealthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusHealthText.left = this.scalePx(5);
        this.tankStatusHealthText.top = this.scalePx(25);
        this.tankStatusContainer.addControl(this.tankStatusHealthText);
        
        // Топливо
        this.tankStatusFuelText = new TextBlock("tankStatusFuel");
        this.tankStatusFuelText.text = "⛽ 100%";
        this.tankStatusFuelText.color = "#f90";
        this.tankStatusFuelText.fontSize = this.scaleFontSize(11, 9, 16);
        this.tankStatusFuelText.fontWeight = "bold";
        this.tankStatusFuelText.fontFamily = "Consolas, monospace";
        this.tankStatusFuelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusFuelText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusFuelText.left = this.scalePx(5);
        this.tankStatusFuelText.top = this.scalePx(45);
        this.tankStatusContainer.addControl(this.tankStatusFuelText);
        
        // Броня
        this.tankStatusArmorText = new TextBlock("tankStatusArmor");
        this.tankStatusArmorText.text = "🛡 0%";
        this.tankStatusArmorText.color = "#0ff";
        this.tankStatusArmorText.fontSize = this.scaleFontSize(11, 9, 16);
        this.tankStatusArmorText.fontWeight = "bold";
        this.tankStatusArmorText.fontFamily = "Consolas, monospace";
        this.tankStatusArmorText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tankStatusArmorText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatusArmorText.left = this.scalePx(5);
        this.tankStatusArmorText.top = this.scalePx(65);
        this.tankStatusContainer.addControl(this.tankStatusArmorText);
    }
    
    private updateTankStatus(health: number, maxHealth: number, fuel: number, maxFuel: number, armor: number): void {
        if (!this.tankStatusContainer) return;
        
        // Обновляем здоровье
        if (this.tankStatusHealthText) {
            const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
            this.tankStatusHealthText.text = `❤ ${Math.round(healthPercent)}%`;
            
            // Цвет в зависимости от здоровья
            if (healthPercent > 60) {
                this.tankStatusHealthText.color = "#0f0";
            } else if (healthPercent > 30) {
                this.tankStatusHealthText.color = "#fa0";
            } else {
                this.tankStatusHealthText.color = "#f00";
            }
        }
        
        // Обновляем топливо
        if (this.tankStatusFuelText) {
            const fuelPercent = Math.max(0, Math.min(100, (fuel / maxFuel) * 100));
            this.tankStatusFuelText.text = `⛽ ${Math.round(fuelPercent)}%`;
            
            // Цвет в зависимости от топлива
            if (fuelPercent > 50) {
                this.tankStatusFuelText.color = "#f90";
            } else if (fuelPercent > 20) {
                this.tankStatusFuelText.color = "#fa0";
            } else {
                this.tankStatusFuelText.color = "#f30";
            }
        }
        
        // Обновляем броню
        if (this.tankStatusArmorText) {
            const armorPercent = Math.max(0, Math.min(100, armor * 100));
            this.tankStatusArmorText.text = `🛡 ${Math.round(armorPercent)}%`;
            
            // Цвет в зависимости от брони
            if (armorPercent > 50) {
                this.tankStatusArmorText.color = "#0ff";
            } else if (armorPercent > 20) {
                this.tankStatusArmorText.color = "#0af";
            } else {
                this.tankStatusArmorText.color = "#08f";
            }
        }
    }
    
    // === ARSENAL BLOCK ===
    
    private createArsenalBlock(): void {
        // === АРСЕНАЛ - СЛЕВА ОТ БЛОКА ПРИПАСОВ (5 слотов для разных типов снарядов) ===
        const slotWidth = scalePixels(44); // Такой же размер как у припасов
        const slotGap = scalePixels(5);
        const arsenalTotalWidth = 5 * slotWidth + 4 * slotGap;
        const arsenalStartX = -arsenalTotalWidth / 2 + slotWidth / 2;
        
        // Вычисляем позицию: припасы занимают 10 слотов, их левая граница = -totalWidth/2
        const consumablesTotalWidth = 10 * slotWidth + 9 * slotGap;
        const consumablesLeftEdge = -consumablesTotalWidth / 2;
        // Арсенал размещаем слева от припасов с отступом
        const gapBetween = slotGap * 2; // Отступ между арсеналом и припасами
        const arsenalRightEdge = consumablesLeftEdge - gapBetween;
        const arsenalCenterOffset = arsenalRightEdge - arsenalTotalWidth / 2;
        
        // Типы снарядов и их иконки
        const ammoTypes = [
            { type: "tracer", icon: "🔥", label: "T", color: "#f80" },      // Трассеры
            { type: "ap", icon: "⚫", label: "AP", color: "#0ff" },        // Обычные (Armor Piercing)
            { type: "apcr", icon: "⚡", label: "APCR", color: "#0af" },    // Бронебойные (APCR)
            { type: "he", icon: "💥", label: "HE", color: "#f60" },       // Фугасные (High Explosive)
            { type: "apds", icon: "🎯", label: "APDS", color: "#0fa" }   // Подкалиберные (APDS)
        ];
        
        for (let i = 0; i < 5; i++) {
            const ammoType = ammoTypes[i];
            
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
            // Позиционируем относительно центра с учетом смещения
            container.left = `${arsenalCenterOffset + arsenalStartX + i * (slotWidth + slotGap)}px`;
            container.top = this.scalePx(-25); // На той же высоте что и припасы
            container.isVisible = true;
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
            countText.fontFamily = "Consolas, monospace";
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
            label.fontFamily = "Consolas, monospace";
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
        slot.countText.text = `${current}/${max}`;
        
        // Цвет в зависимости от количества
        const ammoTypes = [
            { type: "tracer", color: "#f80" },
            { type: "ap", color: "#0ff" },
            { type: "apcr", color: "#0af" },
            { type: "he", color: "#f60" },
            { type: "apds", color: "#0fa" }
        ];
        
        const ammoType = ammoTypes[slotIndex];
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
        const slotTypes = ["tracer", "ap", "apcr", "he", "apds"];
        
        for (let i = 0; i < slotTypes.length && i < this.arsenalSlots.length; i++) {
            const type = slotTypes[i];
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
        this.notificationContainer = new Rectangle("notificationArea");
        this.notificationContainer.width = "300px";
        this.notificationContainer.height = "150px";
        this.notificationContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.notificationContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.notificationContainer.top = "120px";
        this.notificationContainer.thickness = 0;
        this.notificationContainer.isPointerBlocker = false;
        this.guiTexture.addControl(this.notificationContainer);
    }
    
    showNotification(text: string, type: "success" | "warning" | "error" | "info" = "info"): void {
        if (!this.notificationContainer) return;
        
        const notification = new Rectangle("notification_" + Date.now());
        notification.width = "280px";
        notification.height = "30px";
        notification.cornerRadius = 5;
        notification.thickness = 2;
        notification.paddingTop = "5px";
        
        // Color based on type
        switch (type) {
            case "success":
                notification.background = "rgba(0, 80, 0, 0.9)";
                notification.color = "#0f0";
                break;
            case "warning":
                notification.background = "rgba(80, 60, 0, 0.9)";
                notification.color = "#fa0";
                break;
            case "error":
                notification.background = "rgba(80, 0, 0, 0.9)";
                notification.color = "#f00";
                break;
            default:
                notification.background = "rgba(0, 40, 80, 0.9)";
                notification.color = "#0af";
        }
        
        const textBlock = new TextBlock();
        textBlock.text = text;
        textBlock.color = "#fff";
        textBlock.fontSize = "12px";
        textBlock.fontFamily = "monospace";
        notification.addControl(textBlock);
        
        // Position
        const index = this.notifications.length;
        notification.top = `${index * 35}px`;
        notification.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        
        this.notificationContainer.addControl(notification);
        this.notifications.push({ text, type, element: notification });
        
        // Fade out and remove after 3 seconds
        setTimeout(() => {
            this.removeNotification(notification);
        }, 3000);
    }
    
    private removeNotification(notification: Rectangle): void {
        const index = this.notifications.findIndex(n => n.element === notification);
        if (index !== -1) {
            this.notifications.splice(index, 1);
            notification.dispose();
            
            // Reposition remaining notifications
            this.notifications.forEach((n, i) => {
                n.element.top = `${i * 35}px`;
            });
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
        
        console.log("[HUD] Tutorial system created");
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
        
        console.log("[HUD] Tutorial started");
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
        this.tutorialText.text = steps[step];
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
        
        console.log("[HUD] Tutorial completed");
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
        } catch (e) {}
        
        console.log("[HUD] Tutorial reset");
    }
    
    // === POI MINIMAP MARKERS ===
    
    updateMinimapPOIs(
        pois: Array<{id: string, type: string, worldPosition: {x: number, z: number}, ownerId: string | null, captureProgress: number}>,
        playerPos: {x: number, z: number},
        tankRotationY: number
    ): void {
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
            marker.cornerRadius = 3;
            marker.thickness = 1;
            marker.color = "#0f0";
            marker.background = "#0f0";
            marker.isVisible = false;
            this.minimapPlayerPool.push(marker);
        }
    }
    
    showMultiplayerHUD(show: boolean): void {
        if (this.multiplayerScoreContainer) {
            this.multiplayerScoreContainer.isVisible = show;
        }
        if (this.playerListContainer) {
            this.playerListContainer.isVisible = show;
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
    }>, localPlayerId: string): void {
        if (!this.playerListContainer) return;
        
        // Clear existing items
        for (const item of this.playerListItems.values()) {
            item.dispose();
        }
        this.playerListItems.clear();
        
        // Sort players by score (descending)
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        
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
                marker.cornerRadius = 3;
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
        // Mission panel (top right, below compass)
        this.missionPanel = new Rectangle("missionPanel");
        this.missionPanel.width = "250px";
        this.missionPanel.height = "200px";
        this.missionPanel.cornerRadius = 5;
        this.missionPanel.thickness = 2;
        this.missionPanel.color = "#666";
        this.missionPanel.background = "rgba(0, 0, 0, 0.7)";
        this.missionPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.missionPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.missionPanel.left = "-10px";
        this.missionPanel.top = "100px";
        this.missionPanel.isVisible = false;
        this.guiTexture.addControl(this.missionPanel);
        
        // Title
        const title = new TextBlock("missionTitle");
        title.text = "📋 МИССИИ";
        title.color = "#fff";
        title.fontSize = "12px";
        title.fontFamily = "monospace";
        title.top = "5px";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.missionPanel.addControl(title);
    }
    
    toggleMissionPanel(): void {
        if (this.missionPanel) {
            this.missionPanelVisible = !this.missionPanelVisible;
            this.missionPanel.isVisible = this.missionPanelVisible;
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
            item.width = "230px";
            item.height = "45px";
            item.cornerRadius = 3;
            item.thickness = 1;
            item.color = mission.completed ? "#0f0" : "#666";
            item.background = mission.completed ? "rgba(0, 50, 0, 0.5)" : "rgba(20, 20, 20, 0.5)";
            item.top = `${30 + index * 50}px`;
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
            nameText.color = "#fff";
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
            progressText.color = mission.completed ? "#0f0" : "#aaa";
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
            progressFill.background = mission.completed ? "#0f0" : "#0af";
            progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            progressBar.addControl(progressFill);
            
            // Completed checkmark
            if (mission.completed) {
                const checkmark = new TextBlock(`missionCheck_${mission.id}`);
                checkmark.text = "✓";
                checkmark.fontSize = "16px";
                checkmark.color = "#0f0";
                checkmark.left = "210px";
                checkmark.top = "10px";
                item.addControl(checkmark);
            }
        });
    }
    
    private _showComboIncrease(currentCombo: number, previousCombo: number): void {
        // Placeholder для метода показа увеличения комбо
        // Можно реализовать позже если нужно
    }
    
    private _createComboParticles(comboCount: number): void {
        // Placeholder для метода создания частиц комбо
        // Можно реализовать позже если нужно
    }
}
