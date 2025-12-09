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

// ULTRA SIMPLE HUD - NO gradients, NO shadows, NO alpha, NO transparency
// Pure solid colors only!

export class HUD {
    private scene: Scene;
    private guiTexture: AdvancedDynamicTexture;
    
    // Health
    private healthBar: Rectangle;
    private healthFill: Rectangle;
    private healthText: TextBlock;
    
    // Reload
    private reloadBar: Rectangle;
    private reloadFill: Rectangle;
    private reloadText: TextBlock;
    
    // Crosshair
    private crosshairElements: Rectangle[] = [];
    private crosshairDot: Rectangle;
    
    // Speedometer
    private speedText: TextBlock;
    
    // Stats
    private positionText: TextBlock;
    
    // Kill counter
    private killsText: TextBlock;
    private killsCount = 0;

    // Currency display
    private currencyText: TextBlock;
    private currencyContainer: Rectangle;

    // Enemy health summary
    private enemyHealthText: TextBlock;
    
    // Compass
    private compassText: TextBlock;
    
    // Damage indicator
    private damageIndicator: Rectangle;
    
    // Minimap
    private minimapContainer: Rectangle;
    private minimapEnemies: Rectangle[] = [];
    
    // Message
    private messageText: TextBlock;
    private messageTimeout: any = null;
    
    // Active effects indicators
    private activeEffectsContainer: Rectangle | null = null;
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
    private fpsHistory: number[] = [];
    private lastFpsUpdate = 0;
    
    // Game time tracking
    private gameTimeText: TextBlock | null = null;
    private gameStartTime = Date.now();
    
    // Enemy distance indicator
    private enemyDistanceText: TextBlock | null = null;
    private nearestEnemyDistance = 0;
    
    // Animation tracking
    private animationTime = 0;
    private glowElements: Map<string, { element: Rectangle | TextBlock, baseColor: string, glowColor: string }> = new Map();
    
    // Invulnerability indicator
    private invulnerabilityIndicator: Rectangle | null = null;
    private invulnerabilityText: TextBlock | null = null;
    private isInvulnerable = false;
    
    // Values
    public maxHealth = 100;
    public currentHealth = 100;
    public reloadTime = 2000;
    public isReloading = false;
    private reloadStartTime = 0;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);
        
        this.createHealthBar();
        this.createReloadIndicator();
        this.createCrosshair();
        this.createSpeedometer();
        this.createKillCounter();
        this.createCurrencyDisplay();
        this.createConsumablesDisplay();
        this.createEnemyHealth();
        this.createCompass();
        this.createMinimap();
        this.createDamageIndicator();
        this.createMessageDisplay();
        this.createControlsHint();
        this.createActiveEffectsDisplay();
        this.createTankStatsDisplay();
        this.createFPSCounter();
        this.createGameTimeDisplay();
        this.createEnemyDistanceDisplay();
        this.createInvulnerabilityIndicator();
        this.startAnimations();
        
        console.log("HUD initialized (ENHANCED MODE)");
    }
    
    // Создать индикатор защиты от урона
    // Показать плавающий текст опыта
    showExperienceGain(amount: number, type: "chassis" | "cannon" = "chassis"): void {
        const text = new TextBlock(`xpGain_${Date.now()}`);
        text.text = `+${Math.round(amount)} XP`;
        text.color = type === "chassis" ? "#0ff" : "#f80";
        text.fontSize = 24;
        text.fontWeight = "bold";
        text.fontFamily = "Courier New, monospace";
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        text.top = "-100px";
        this.guiTexture.addControl(text);
        
        // Анимация подъёма и исчезновения
        let y = -100;
        let alpha = 1;
        let scale = 1;
        const animate = () => {
            y -= 2;
            alpha -= 0.02;
            scale += 0.01;
            
            text.top = `${y}px`;
            text.alpha = alpha;
            text.fontSize = 24 * scale;
            
            if (alpha > 0) {
                setTimeout(animate, 16);
            } else {
                text.dispose();
            }
        };
        animate();
    }
    
    // Показать эффект повышения уровня
    showLevelUp(level: number, title: string, type: "chassis" | "cannon"): void {
        const container = new Rectangle(`levelUp_${Date.now()}`);
        container.width = "400px";
        container.height = "120px";
        container.cornerRadius = 0;
        container.thickness = 4;
        container.color = type === "chassis" ? "#0ff" : "#f80";
        container.background = "#000000ee";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.top = "-200px";
        this.guiTexture.addControl(container);
        
        const titleText = new TextBlock("levelUpTitle");
        titleText.text = "🎉 УРОВЕНЬ ПОВЫШЕН! 🎉";
        titleText.color = "#ff0";
        titleText.fontSize = 28;
        titleText.fontWeight = "bold";
        titleText.fontFamily = "Courier New, monospace";
        titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        titleText.top = "-20px";
        container.addControl(titleText);
        
        const levelText = new TextBlock("levelUpLevel");
        levelText.text = `Уровень ${level}: ${title}`;
        levelText.color = type === "chassis" ? "#0ff" : "#f80";
        levelText.fontSize = 22;
        levelText.fontWeight = "bold";
        levelText.fontFamily = "Courier New, monospace";
        levelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        levelText.top = "20px";
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
            container.scalingX = scale;
            container.scalingY = scale;
            
            setTimeout(animate, 16);
        };
        animate();
    }
    
    private createInvulnerabilityIndicator(): void {
        const container = new Rectangle("invulnerabilityContainer");
        container.width = "200px";
        container.height = "35px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0ff";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.top = "150px";
        container.isVisible = false; // Скрыт по умолчанию
        this.guiTexture.addControl(container);
        
        const icon = new TextBlock("invulnerabilityIcon");
        icon.text = "🛡";
        icon.color = "#0ff";
        icon.fontSize = 18;
        icon.fontFamily = "Courier New, monospace";
        icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        icon.left = "10px";
        icon.top = "2px";
        container.addControl(icon);
        
        this.invulnerabilityText = new TextBlock("invulnerabilityText");
        this.invulnerabilityText.text = "ЗАЩИТА";
        this.invulnerabilityText.color = "#0ff";
        this.invulnerabilityText.fontSize = 14;
        this.invulnerabilityText.fontWeight = "bold";
        this.invulnerabilityText.fontFamily = "Courier New, monospace";
        this.invulnerabilityText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.invulnerabilityText.left = "40px";
        this.invulnerabilityText.top = "2px";
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
    
    // Запуск анимаций
    private startAnimations() {
        this.scene.onBeforeRenderObservable.add(() => {
            this.animationTime += this.scene.getEngine().getDeltaTime() / 1000;
            this.updateGlowEffects();
        });
    }
    
    // Обновление эффектов свечения
    private updateGlowEffects() {
        this.glowElements.forEach((glow, key) => {
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
        // Enhanced Container with better design
        const container = new Rectangle("healthContainer");
        container.width = "320px";
        container.height = "60px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "20px";
        container.top = "20px";
        this.guiTexture.addControl(container);
        
        // Health label with icon
        const label = new TextBlock("healthLabel");
        label.text = "❤ HP";
        label.color = "#0f0";
        label.fontSize = 16;
        label.fontWeight = "bold";
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        container.addControl(label);
        
        // Health bar background with border
        this.healthBar = new Rectangle("healthBar");
        this.healthBar.width = "220px";
        this.healthBar.height = "24px";
        this.healthBar.cornerRadius = 0;
        this.healthBar.thickness = 1;
        this.healthBar.color = "#0a0";
        this.healthBar.background = "#111111";
        this.healthBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.left = "10px";
        this.healthBar.top = "30px";
        container.addControl(this.healthBar);
        
        // Health fill with gradient effect simulation
        this.healthFill = new Rectangle("healthFill");
        this.healthFill.width = "100%";
        this.healthFill.height = "100%";
        this.healthFill.cornerRadius = 0;
        this.healthFill.thickness = 0;
        this.healthFill.background = "#0f0";
        this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.addControl(this.healthFill);
        
        // Health glow effect (inner highlight)
        const healthGlow = new Rectangle("healthGlow");
        healthGlow.width = "100%";
        healthGlow.height = "40%";
        healthGlow.cornerRadius = 0;
        healthGlow.thickness = 0;
        healthGlow.background = "#3f3";
        healthGlow.alpha = 0.5;
        healthGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        healthGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.healthBar.addControl(healthGlow);
        (this.healthBar as any)._healthGlow = healthGlow;
        
        // Health warning overlay (красная подсветка при низком HP)
        const warningOverlay = new Rectangle("healthWarning");
        warningOverlay.width = "100%";
        warningOverlay.height = "100%";
        warningOverlay.cornerRadius = 0;
        warningOverlay.thickness = 0;
        warningOverlay.background = "#f00000";
        warningOverlay.alpha = 0;
        warningOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.addControl(warningOverlay);
        (this.healthBar as any)._warningOverlay = warningOverlay;
        
        // Health text with percentage
        this.healthText = new TextBlock("healthText");
        this.healthText.text = "100/100";
        this.healthText.color = "#0f0";
        this.healthText.fontSize = 16;
        this.healthText.fontWeight = "bold";
        this.healthText.fontFamily = "Courier New, monospace";
        this.healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.healthText.left = "-15px";
        this.healthText.top = "30px";
        container.addControl(this.healthText);
        this.addGlowEffect("healthText", this.healthText, "#0f0", "#3f3");
        
        // Health percentage text
        const healthPercent = new TextBlock("healthPercent");
        healthPercent.text = "100%";
        healthPercent.color = "#0a0";
        healthPercent.fontSize = 11;
        healthPercent.fontFamily = "Courier New, monospace";
        healthPercent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        healthPercent.left = "-15px";
        healthPercent.top = "48px";
        container.addControl(healthPercent);
        (container as any)._healthPercent = healthPercent;
    }
    
    // Создать отображение времени игры
    private createGameTimeDisplay() {
        const container = new Rectangle("gameTimeContainer");
        container.width = "140px";
        container.height = "30px";
        container.cornerRadius = 0;
        container.thickness = 1;
        container.color = "#0a0";
        container.background = "#000000aa";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "-20px";
        container.top = "-220px";
        this.guiTexture.addControl(container);
        
        const label = new TextBlock("gameTimeLabel");
        label.text = "⏱ TIME";
        label.color = "#0a0";
        label.fontSize = 9;
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "5px";
        label.top = "2px";
        container.addControl(label);
        
        this.gameTimeText = new TextBlock("gameTimeText");
        this.gameTimeText.text = "00:00";
        this.gameTimeText.color = "#0f0";
        this.gameTimeText.fontSize = 12;
        this.gameTimeText.fontWeight = "bold";
        this.gameTimeText.fontFamily = "Courier New, monospace";
        this.gameTimeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.gameTimeText.left = "-5px";
        this.gameTimeText.top = "2px";
        container.addControl(this.gameTimeText);
    }
    
    // Создать индикатор расстояния до ближайшего врага
    private createEnemyDistanceDisplay() {
        const container = new Rectangle("enemyDistanceContainer");
        container.width = "140px";
        container.height = "30px";
        container.cornerRadius = 0;
        container.thickness = 1;
        container.color = "#0a0";
        container.background = "#000000aa";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "-20px";
        container.top = "-250px";
        this.guiTexture.addControl(container);
        
        const label = new TextBlock("enemyDistanceLabel");
        label.text = "🎯 DIST";
        label.color = "#0a0";
        label.fontSize = 9;
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "5px";
        label.top = "2px";
        container.addControl(label);
        
        this.enemyDistanceText = new TextBlock("enemyDistanceText");
        this.enemyDistanceText.text = "-- m";
        this.enemyDistanceText.color = "#0f0";
        this.enemyDistanceText.fontSize = 12;
        this.enemyDistanceText.fontWeight = "bold";
        this.enemyDistanceText.fontFamily = "Courier New, monospace";
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
        this.nearestEnemyDistance = distance;
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
        // Enhanced Container
        const container = new Rectangle("reloadContainer");
        container.width = "320px";
        container.height = "45px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "20px";
        container.top = "90px";
        this.guiTexture.addControl(container);
        
        // Ammo label with icon
        const label = new TextBlock("ammoLabel");
        label.text = "⚡ GUN";
        label.color = "#0f0";
        label.fontSize = 13;
        label.fontWeight = "bold";
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        container.addControl(label);
        
        // Reload bar background
        this.reloadBar = new Rectangle("reloadBar");
        this.reloadBar.width = "220px";
        this.reloadBar.height = "18px";
        this.reloadBar.cornerRadius = 0;
        this.reloadBar.thickness = 1;
        this.reloadBar.color = "#0a0";
        this.reloadBar.background = "#111111";
        this.reloadBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.reloadBar.left = "10px";
        this.reloadBar.top = "25px";
        container.addControl(this.reloadBar);
        
        // Reload fill with glow
        this.reloadFill = new Rectangle("reloadFill");
        this.reloadFill.width = "100%";
        this.reloadFill.height = "100%";
        this.reloadFill.cornerRadius = 0;
        this.reloadFill.thickness = 0;
        this.reloadFill.background = "#0f0";
        this.reloadFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.reloadBar.addControl(this.reloadFill);
        
        // Reload glow effect
        const reloadGlow = new Rectangle("reloadGlow");
        reloadGlow.width = "100%";
        reloadGlow.height = "50%";
        reloadGlow.cornerRadius = 0;
        reloadGlow.thickness = 0;
        reloadGlow.background = "#3f3";
        reloadGlow.alpha = 0.6;
        reloadGlow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        reloadGlow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.reloadBar.addControl(reloadGlow);
        (this.reloadBar as any)._reloadGlow = reloadGlow;
        
        // Reload text with timer
        this.reloadText = new TextBlock("reloadText");
        this.reloadText.text = "READY";
        this.reloadText.color = "#0f0";
        this.reloadText.fontSize = 12;
        this.reloadText.fontWeight = "bold";
        this.reloadText.fontFamily = "Courier New, monospace";
        this.reloadText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.reloadText.left = "-15px";
        this.reloadText.top = "25px";
        container.addControl(this.reloadText);
    }
    
    private createCrosshair() {
        // Enhanced Crosshair HIDDEN by default, appears when aiming
        
        // Center dot - HIDDEN by default (enhanced)
        this.crosshairDot = new Rectangle("crosshairDot");
        this.crosshairDot.width = "6px";
        this.crosshairDot.height = "6px";
        this.crosshairDot.cornerRadius = 3;
        this.crosshairDot.thickness = 1;
        this.crosshairDot.color = "#f00";
        this.crosshairDot.background = "#f00";
        this.crosshairDot.isVisible = false; // HIDDEN!
        this.guiTexture.addControl(this.crosshairDot);
        
        // Lines - HIDDEN by default (enhanced)
        const size = 3;
        const gap = 12;
        const length = 22;
        
        const createLine = (name: string, w: string, h: string, t: string, l: string) => {
            const line = new Rectangle(name);
            line.width = w;
            line.height = h;
            line.background = "#ff0"; // Yellow
            line.thickness = 0;
            line.top = t;
            line.left = l;
            line.isVisible = false; // HIDDEN!
            this.guiTexture.addControl(line);
            this.crosshairElements.push(line);
        };
        
        createLine("crossTop", `${size}px`, `${length}px`, `${-gap - length/2}px`, "0");
        createLine("crossBottom", `${size}px`, `${length}px`, `${gap + length/2}px`, "0");
        createLine("crossLeft", `${length}px`, `${size}px`, "0", `${-gap - length/2}px`);
        createLine("crossRight", `${length}px`, `${size}px`, "0", `${gap + length/2}px`);
    }
    
    // Show/hide full crosshair for aiming mode
    setAimMode(aiming: boolean) {
        // Show/hide dot
        if (this.crosshairDot) {
            this.crosshairDot.isVisible = aiming;
            this.crosshairDot.width = aiming ? "6px" : "4px";
            this.crosshairDot.height = aiming ? "6px" : "4px";
        }
        // Show/hide lines
        this.crosshairElements.forEach(el => el.isVisible = aiming);
    }
    
    private createSpeedometer() {
        // Enhanced Container - ЛЕВЫЙ НИЖНИЙ УГОЛ
        const container = new Rectangle("speedContainer");
        container.width = "130px";
        container.height = "75px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "20px";
        container.top = "-20px";
        this.guiTexture.addControl(container);
        
        // Label
        const label = new TextBlock("speedLabel");
        label.text = "SPEED";
        label.color = "#0a0";
        label.fontSize = 10;
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        container.addControl(label);
        
        // Speed value with dynamic color
        this.speedText = new TextBlock("speedText");
        this.speedText.text = "0";
        this.speedText.color = "#0f0";
        this.speedText.fontSize = 36;
        this.speedText.fontWeight = "bold";
        this.speedText.fontFamily = "Courier New, monospace";
        this.speedText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.speedText.top = "15px";
        container.addControl(this.speedText);
        
        // Unit
        const unit = new TextBlock("speedUnit");
        unit.text = "KM/H";
        unit.color = "#0a0";
        unit.fontSize = 11;
        unit.fontFamily = "Courier New, monospace";
        unit.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        unit.top = "50px";
        container.addControl(unit);
        
        // Speed bar indicator (visual progress bar)
        const speedBarBg = new Rectangle("speedBarBg");
        speedBarBg.width = "110px";
        speedBarBg.height = "4px";
        speedBarBg.cornerRadius = 0;
        speedBarBg.thickness = 0;
        speedBarBg.background = "#111";
        speedBarBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        speedBarBg.top = "60px";
        container.addControl(speedBarBg);
        
        const speedBarFill = new Rectangle("speedBarFill");
        speedBarFill.width = "0%";
        speedBarFill.height = "100%";
        speedBarFill.cornerRadius = 0;
        speedBarFill.thickness = 0;
        speedBarFill.background = "#0f0";
        speedBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        speedBarBg.addControl(speedBarFill);
        (container as any)._speedBarFill = speedBarFill;
    }
    
    private createKillCounter() {
        // Enhanced Container
        const container = new Rectangle("killsContainer");
        container.width = "100px";
        container.height = "50px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#f00";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "-20px";
        container.top = "20px";
        this.guiTexture.addControl(container);
        
        // Label with icon
        const label = new TextBlock("killLabel");
        label.text = "💀 KILLS";
        label.color = "#f00";
        label.fontSize = 10;
        label.fontWeight = "bold";
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        container.addControl(label);
        
        // Kill count with animation
        this.killsText = new TextBlock("killsText");
        this.killsText.text = "0";
        this.killsText.color = "#f00";
        this.killsText.fontSize = 28;
        this.killsText.fontWeight = "bold";
        this.killsText.fontFamily = "Courier New, monospace";
        this.killsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.killsText.top = "20px";
        container.addControl(this.killsText);
    }
    
    private createCurrencyDisplay() {
        // Enhanced Container
        this.currencyContainer = new Rectangle("currencyContainer");
        this.currencyContainer.width = "140px";
        this.currencyContainer.height = "50px";
        this.currencyContainer.cornerRadius = 0;
        this.currencyContainer.thickness = 2;
        this.currencyContainer.color = "#ffd700";
        this.currencyContainer.background = "#000000cc";
        this.currencyContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.currencyContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.currencyContainer.left = "-20px";
        this.currencyContainer.top = "80px"; // Под счетчиком убийств
        this.guiTexture.addControl(this.currencyContainer);
        
        // Label with icon
        const label = new TextBlock("currencyLabel");
        label.text = "💰 CREDITS";
        label.color = "#ffd700";
        label.fontSize = 10;
        label.fontWeight = "bold";
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        this.currencyContainer.addControl(label);
        
        // Currency amount with formatting
        this.currencyText = new TextBlock("currencyText");
        this.currencyText.text = "0";
        this.currencyText.color = "#ffd700";
        this.currencyText.fontSize = 22;
        this.currencyText.fontWeight = "bold";
        this.currencyText.fontFamily = "Courier New, monospace";
        this.currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.currencyText.top = "22px";
        this.currencyContainer.addControl(this.currencyText);
    }

    // Consumables display
    private consumablesSlots: Array<{ container: Rectangle, icon: TextBlock, key: TextBlock, name: TextBlock }> = [];
    
    private createConsumablesDisplay() {
        // Создаём 5 слотов для припасов (1-5)
        for (let i = 1; i <= 5; i++) {
            const container = new Rectangle(`consumableSlot${i}`);
            container.width = "70px";
            container.height = "70px";
            container.cornerRadius = 0;
            container.thickness = 2;
            container.color = "#666";
            container.background = "#000";
            container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            container.left = `${20 + (i - 1) * 80}px`;
            container.top = "-20px";
            this.guiTexture.addControl(container);
            
            // Клавиша (больше и ярче)
            const key = new TextBlock(`consumableKey${i}`);
            key.text = `${i}`;
            key.color = "#888";
            key.fontSize = 14;
            key.fontWeight = "bold";
            key.fontFamily = "Courier New, monospace";
            key.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            key.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            key.left = "8px";
            key.top = "8px";
            container.addControl(key);
            
            // Иконка припаса (больше)
            const icon = new TextBlock(`consumableIcon${i}`);
            icon.text = "";
            icon.color = "#fff";
            icon.fontSize = 32;
            icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            icon.top = "-5px";
            container.addControl(icon);
            
            // Название припаса (маленький текст внизу)
            const name = new TextBlock(`consumableName${i}`);
            name.text = "";
            name.color = "#aaa";
            name.fontSize = 9;
            name.fontFamily = "Courier New, monospace";
            name.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            name.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            name.top = "-8px";
            container.addControl(name);
            
            this.consumablesSlots.push({ container, icon, key, name });
        }
    }
    
    updateConsumables(consumables: Map<number, any>): void {
        for (let i = 1; i <= 5; i++) {
            const slot = this.consumablesSlots[i - 1];
            const consumable = consumables.get(i);
            
            if (consumable) {
                slot.container.color = consumable.color || "#0f0";
                slot.icon.text = consumable.icon || "?";
                slot.icon.color = consumable.color || "#fff";
                slot.key.color = "#fff";
                slot.name.text = consumable.name || "";
                slot.name.color = consumable.color || "#aaa";
            } else {
                slot.container.color = "#666";
                slot.icon.text = "";
                slot.key.color = "#666";
                slot.name.text = "";
            }
        }
    }

    private createEnemyHealth() {
        // Enhanced box under kills
        const container = new Rectangle("enemyHpContainer");
        container.width = "140px";
        container.height = "50px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "-20px";
        container.top = "80px";
        this.guiTexture.addControl(container);

        const label = new TextBlock("enemyHpLabel");
        label.text = "🎯 ENEMY HP";
        label.color = "#0f0";
        label.fontSize = 10;
        label.fontWeight = "bold";
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        container.addControl(label);

        this.enemyHealthText = new TextBlock("enemyHpText");
        this.enemyHealthText.text = "0 HP";
        this.enemyHealthText.color = "#0f0";
        this.enemyHealthText.fontSize = 16;
        this.enemyHealthText.fontWeight = "bold";
        this.enemyHealthText.fontFamily = "Courier New, monospace";
        this.enemyHealthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.enemyHealthText.top = "22px";
        container.addControl(this.enemyHealthText);
    }
    
    private compassContainer: Rectangle;
    private compassDegrees: TextBlock;
    
    private createCompass() {
        // Enhanced Container with better design
        this.compassContainer = new Rectangle("compassContainer");
        this.compassContainer.width = "220px";
        this.compassContainer.height = "50px";
        this.compassContainer.cornerRadius = 0;
        this.compassContainer.thickness = 2;
        this.compassContainer.color = "#0f0";
        this.compassContainer.background = "#000000cc";
        this.compassContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.compassContainer.top = "15px";
        this.guiTexture.addControl(this.compassContainer);
        
        // Label
        const label = new TextBlock("compassLabel");
        label.text = "COMPASS";
        label.color = "#0a0";
        label.fontSize = 9;
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        label.top = "5px";
        this.compassContainer.addControl(label);
        
        // Direction marker (center indicator) - enhanced
        const marker = new Rectangle("compassMarker");
        marker.width = "4px";
        marker.height = "16px";
        marker.background = "#f00";
        marker.thickness = 0;
        marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        marker.top = "-5px";
        this.compassContainer.addControl(marker);
        
        // Main direction text (big) with icon
        this.compassText = new TextBlock("compassText");
        this.compassText.text = "N";
        this.compassText.color = "#0f0";
        this.compassText.fontSize = 24;
        this.compassText.fontWeight = "bold";
        this.compassText.fontFamily = "Courier New, monospace";
        this.compassText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassText.top = "8px";
        this.compassContainer.addControl(this.compassText);
        
        // Degrees text (small, below) with more info
        this.compassDegrees = new TextBlock("compassDeg");
        this.compassDegrees.text = "0°";
        this.compassDegrees.color = "#0a0";
        this.compassDegrees.fontSize = 11;
        this.compassDegrees.fontFamily = "Courier New, monospace";
        this.compassDegrees.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassDegrees.top = "30px";
        this.compassContainer.addControl(this.compassDegrees);
        
        // Direction indicators (N, E, S, W) - small markers
        const directions = [
            { text: "N", left: "50%", top: "2px" },
            { text: "E", left: "85%", top: "20px" },
            { text: "S", left: "50%", top: "38px" },
            { text: "W", left: "15%", top: "20px" }
        ];
        
        directions.forEach(dir => {
            const dirMarker = new TextBlock(`compassDir${dir.text}`);
            dirMarker.text = dir.text;
            dirMarker.color = "#0a0";
            dirMarker.fontSize = 9;
            dirMarker.fontFamily = "Courier New, monospace";
            dirMarker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            dirMarker.left = dir.left;
            dirMarker.top = dir.top;
            this.compassContainer.addControl(dirMarker);
        });
    }
    
    // Player direction indicator
    private minimapPlayerDir: Rectangle | null = null;
    private minimapPlayer: Rectangle | null = null;
    
    private createMinimap() {
        // Enhanced Container - БОЛЕЕ ЖИВАЯ И ПОНЯТНАЯ
        this.minimapContainer = new Rectangle("minimapContainer");
        this.minimapContainer.width = "180px";
        this.minimapContainer.height = "180px";
        this.minimapContainer.cornerRadius = 0;
        this.minimapContainer.thickness = 3;
        this.minimapContainer.color = "#0f0";
        this.minimapContainer.background = "#001100"; // Темно-зеленый фон
        this.minimapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.minimapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.minimapContainer.left = "-20px";
        this.minimapContainer.top = "-20px"; // Нижний правый угол
        this.guiTexture.addControl(this.minimapContainer);
        
        // Enhanced Grid lines - ЯРКИЕ
        for (let i = 1; i < 4; i++) {
            const hLine = new Rectangle(`hGrid${i}`);
            hLine.width = "174px";
            hLine.height = "1px";
            hLine.background = "#030"; // Зеленые линии
            hLine.top = `${-60 + i * 60}px`;
            this.minimapContainer.addControl(hLine);
            
            const vLine = new Rectangle(`vGrid${i}`);
            vLine.width = "1px";
            vLine.height = "174px";
            vLine.background = "#030";
            vLine.left = `${-60 + i * 60}px`;
            this.minimapContainer.addControl(vLine);
        }
        
        // Центральные линии (более яркие)
        const centerH = new Rectangle("centerH");
        centerH.width = "174px";
        centerH.height = "2px";
        centerH.background = "#050";
        this.minimapContainer.addControl(centerH);
        
        const centerV = new Rectangle("centerV");
        centerV.width = "2px";
        centerV.height = "174px";
        centerV.background = "#050";
        this.minimapContainer.addControl(centerV);
        
        // Enhanced Player marker - ЯРКИЙ ЗЕЛЕНЫЙ КВАДРАТ с обводкой
        this.minimapPlayer = new Rectangle("minimapPlayer");
        this.minimapPlayer.width = "14px";
        this.minimapPlayer.height = "14px";
        this.minimapPlayer.thickness = 2;
        this.minimapPlayer.color = "#0f0";
        this.minimapPlayer.background = "#0f0";
        this.minimapContainer.addControl(this.minimapPlayer);
        
        // Player direction arrow - ЯРКАЯ СТРЕЛКА (улучшенная)
        this.minimapPlayerDir = new Rectangle("playerDir");
        this.minimapPlayerDir.width = "5px";
        this.minimapPlayerDir.height = "24px";
        this.minimapPlayerDir.background = "#0f0";
        this.minimapPlayerDir.top = "-19px";
        this.minimapContainer.addControl(this.minimapPlayerDir);
        
        // Рамка сканирования (анимация "живости") - улучшенная
        const scanLine = new Rectangle("scanLine");
        scanLine.width = "174px";
        scanLine.height = "3px";
        scanLine.background = "#0f0";
        scanLine.alpha = 0.4;
        scanLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        scanLine.top = "2px";
        this.minimapContainer.addControl(scanLine);
        
        // Анимация сканирующей линии
        let scanY = 0;
        setInterval(() => {
            scanY = (scanY + 3) % 174;
            scanLine.top = `${scanY}px`;
        }, 50);
        
        // Enhanced Label with icon
        const label = new TextBlock("mapLabel");
        label.text = "📡 RADAR";
        label.color = "#0f0";
        label.fontSize = 11;
        label.fontWeight = "bold";
        label.fontFamily = "Courier New, monospace";
        label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "5px";
        label.top = "3px";
        this.minimapContainer.addControl(label);
        
        // Range indicator
        const rangeText = new TextBlock("rangeText");
        rangeText.text = "100m";
        rangeText.color = "#0a0";
        rangeText.fontSize = 9;
        rangeText.fontFamily = "Courier New, monospace";
        rangeText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        rangeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        rangeText.left = "-5px";
        rangeText.top = "-3px";
        this.minimapContainer.addControl(rangeText);
        (this.minimapContainer as any)._rangeText = rangeText;
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
    }
    
    private createMessageDisplay() {
        // Center message - SOLID background
        const msgBg = new Rectangle("msgBg");
        msgBg.width = "400px";
        msgBg.height = "50px";
        msgBg.cornerRadius = 0;
        msgBg.thickness = 2;
        msgBg.color = "#0f0";
        msgBg.background = "#000";
        msgBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        msgBg.top = "-100px";
        msgBg.isVisible = false;
        this.guiTexture.addControl(msgBg);
        
        this.messageText = new TextBlock("messageText");
        this.messageText.text = "";
        this.messageText.color = "#0f0";
        this.messageText.fontSize = 20;
        this.messageText.fontFamily = "Courier New, monospace";
        msgBg.addControl(this.messageText);
        
        // Store reference to background for showing/hiding
        (this.messageText as any)._msgBg = msgBg;
    }
    
    private createActiveEffectsDisplay() {
        // Enhanced Контейнер для активных эффектов (справа вверху)
        this.activeEffectsContainer = new Rectangle("activeEffectsContainer");
        this.activeEffectsContainer.width = "220px";
        this.activeEffectsContainer.height = "160px";
        this.activeEffectsContainer.cornerRadius = 0;
        this.activeEffectsContainer.thickness = 0;
        this.activeEffectsContainer.background = "#00000000"; // Прозрачный
        this.activeEffectsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.activeEffectsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.activeEffectsContainer.left = "-20px";
        this.activeEffectsContainer.top = "140px";
        this.guiTexture.addControl(this.activeEffectsContainer);
        
        // Title
        const title = new TextBlock("effectsTitle");
        title.text = "⚡ ACTIVE EFFECTS";
        title.color = "#0f0";
        title.fontSize = 11;
        title.fontWeight = "bold";
        title.fontFamily = "Courier New, monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        title.left = "0px";
        title.top = "-15px";
        this.activeEffectsContainer.addControl(title);
    }
    
    // Добавить индикатор активного эффекта
    addActiveEffect(name: string, icon: string, color: string, duration: number): void {
        if (!this.activeEffectsContainer) return;
        
        // Удаляем старый эффект с таким же именем
        this.removeActiveEffect(name);
        
        const container = new Rectangle(`effect_${name}`);
        container.width = "200px";
        container.height = "32px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = color;
        container.background = "#000000cc";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.top = `${this.activeEffects.size * 36}px`;
        this.activeEffectsContainer.addControl(container);
        
        // Progress bar for duration
        const progressBar = new Rectangle(`effectProgress_${name}`);
        progressBar.width = "100%";
        progressBar.height = "4px";
        progressBar.cornerRadius = 0;
        progressBar.thickness = 0;
        progressBar.background = color;
        progressBar.alpha = 0.5;
        progressBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        progressBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        progressBar.top = "-2px";
        container.addControl(progressBar);
        (container as any)._progressBar = progressBar;
        
        const text = new TextBlock(`effectText_${name}`);
        const seconds = Math.ceil(duration / 1000);
        text.text = `${icon} ${name}`;
        text.color = color;
        text.fontSize = 12;
        text.fontWeight = "bold";
        text.fontFamily = "Courier New, monospace";
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        text.left = "10px";
        text.top = "2px";
        container.addControl(text);
        
        // Timer text
        const timerText = new TextBlock(`effectTimer_${name}`);
        timerText.text = `${seconds}s`;
        timerText.color = color;
        timerText.fontSize = 10;
        timerText.fontFamily = "Courier New, monospace";
        timerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        timerText.left = "-10px";
        timerText.top = "2px";
        container.addControl(timerText);
        (container as any)._timerText = timerText;
        
        // Обновляем таймер каждую секунду
        const updateTimer = () => {
            const remaining = this.activeEffects.get(name);
            if (!remaining) return;
            
            const remainingSeconds = Math.ceil(remaining.timeout / 1000);
            const progressPercent = Math.max(0, Math.min(100, (remaining.timeout / duration) * 100));
            
            if (remainingSeconds > 0) {
                // Update timer text
                const timerText = (container as any)._timerText as TextBlock;
                if (timerText) {
                    timerText.text = `${remainingSeconds}s`;
                }
                
                // Update progress bar
                const progressBar = (container as any)._progressBar as Rectangle;
                if (progressBar) {
                    progressBar.width = progressPercent + "%";
                }
                
                remaining.timeout -= 1000;
                setTimeout(updateTimer, 1000);
            } else {
                this.removeActiveEffect(name);
            }
        };
        
        this.activeEffects.set(name, { container, text, timeout: duration });
        setTimeout(updateTimer, 1000);
    }
    
    // Удалить индикатор эффекта
    removeActiveEffect(name: string): void {
        const effect = this.activeEffects.get(name);
        if (effect) {
            effect.container.dispose();
            this.activeEffects.delete(name);
            
            // Обновляем позиции остальных эффектов
            let index = 0;
            this.activeEffects.forEach((e, key) => {
                e.container.top = `${index * 36}px`;
                index++;
            });
        }
    }
    
    private createControlsHint() {
        // Controls hint - bottom
        const hint = new TextBlock("controlsHint");
        hint.text = "WASD-MOVE | ZX-TURRET | SPACE-FIRE | ESC-MENU";
        hint.color = "#050";
        hint.fontSize = 10;
        hint.fontFamily = "Courier New, monospace";
        hint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        hint.top = "-5px";
        hint.left = "-20px";
        this.guiTexture.addControl(hint);
        // Auto-hide after 5 seconds
        setTimeout(() => { hint.isVisible = false; }, 5000);
        
        // Position info - КООРДИНАТЫ ПОД МИНИ-КАРТОЙ
        const posContainer = new Rectangle("posContainer");
        posContainer.width = "150px";
        posContainer.height = "25px";
        posContainer.cornerRadius = 0;
        posContainer.thickness = 2;
        posContainer.color = "#0f0";
        posContainer.background = "#000";
        posContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        posContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        posContainer.left = "-20px";
        posContainer.top = "-20px"; // Самый низ, под миникартой
        this.guiTexture.addControl(posContainer);
        
        this.positionText = new TextBlock("posText");
        this.positionText.text = "X:0 Z:0";
        this.positionText.color = "#0f0";
        this.positionText.fontSize = 12;
        this.positionText.fontFamily = "Courier New, monospace";
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
        const container = this.healthBar.getParent() as Rectangle;
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
    }
    
    damage(amount: number) {
        this.setHealth(this.currentHealth - amount);
        
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
        this.speedText.text = `${roundedSpeed}`;
        
        // Color based on speed with smooth transitions
        let speedColor = "#0f0"; // Green
        if (kmh > 40) {
            speedColor = "#f00"; // Red (very fast)
        } else if (kmh > 30) {
            speedColor = "#f50"; // Orange-red
        } else if (kmh > 20) {
            speedColor = "#ff0"; // Yellow
        } else if (kmh > 10) {
            speedColor = "#0f0"; // Green
        } else {
            speedColor = "#0a0"; // Dark green (slow)
        }
        
        this.speedText.color = speedColor;
        
        // Update speed bar (assuming max speed ~50 km/h)
        const maxSpeed = 50;
        const speedPercent = Math.min(100, (kmh / maxSpeed) * 100);
        const container = this.speedText.getParent() as Rectangle;
        if (container) {
            const speedBarFill = (container as any)._speedBarFill as Rectangle;
            if (speedBarFill) {
                speedBarFill.width = speedPercent + "%";
                speedBarFill.background = speedColor;
            }
        }
    }
    
    setPosition(x: number, z: number) {
        this.positionText.text = `X:${Math.round(x)} Z:${Math.round(z)}`;
    }
    
    setDirection(angle: number) {
        const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const directionIcons = ["⬆", "↗", "➡", "↘", "⬇", "↙", "⬅", "↖"];
        const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const index = Math.round(normalizedAngle / (Math.PI / 4)) % 8;
        
        // Update direction text with icon
        this.compassText.text = `${directionIcons[index]} ${directions[index]}`;
        
        // Update degrees - convert radians to degrees
        const degrees = Math.round((normalizedAngle * 180) / Math.PI);
        if (this.compassDegrees) {
            this.compassDegrees.text = `${degrees}°`;
        }
        
        // Color based on cardinal directions with smooth transitions
        const isCardinal = index % 2 === 0;
        this.compassText.color = isCardinal ? "#0f0" : "#0a0";
        this.compassContainer.color = isCardinal ? "#0f0" : "#0a0";
        
        // Highlight current direction marker
        ["N", "E", "S", "W"].forEach((dir, i) => {
            const dirMarker = this.compassContainer.getChildByName(`compassDir${dir}`) as TextBlock;
            if (dirMarker) {
                if (directions[index] === dir) {
                    dirMarker.color = "#0f0";
                    dirMarker.fontSize = 11;
                    dirMarker.fontWeight = "bold";
                } else {
                    dirMarker.color = "#0a0";
                    dirMarker.fontSize = 9;
                    dirMarker.fontWeight = "normal";
                }
            }
        });
        
        // КРИТИЧЕСКИ ВАЖНО: Обновляем направление стрелки на радаре!
        if (this.minimapPlayerDir) {
            // Поворачиваем стрелку направления на радаре
            // angle в радианах, нужно повернуть стрелку
            // В GUI угол поворота задаётся в градусах
            const degrees = (normalizedAngle * 180) / Math.PI;
            this.minimapPlayerDir.rotation = degrees;
        }
    }
    
    addKill() {
        this.killsCount++;
        this.killsText.text = `${this.killsCount}`;
        
        // Enhanced flash effect with animation
        const container = this.killsText.getParent() as Rectangle;
        if (container) {
            container.color = "#fff";
            this.killsText.color = "#fff";
            this.killsText.fontSize = 34;
            
            setTimeout(() => {
                container.color = "#f00";
                this.killsText.color = "#f00";
                this.killsText.fontSize = 28;
            }, 200);
        }
        
        // Show kill message
        this.showMessage("KILL!", "#f00");
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
        const container = this.enemyHealthText.getParent() as Rectangle;
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
    }
    
    showRespawnMessage() {
        this.showMessage("RESPAWNED!", "#0f0");
    }
    
    private enemyPulsePhase = 0;
    
    updateMinimap(enemies: {x: number, z: number, alive: boolean}[] | Vector3[], playerPos?: Vector3) {
        // Remove old enemy markers
        this.minimapEnemies.forEach(e => e.dispose());
        this.minimapEnemies = [];
        
        // КРИТИЧЕСКИ ВАЖНО: Игрок всегда в центре радара (0, 0)
        // Все враги вычисляются относительно позиции игрока!
        const playerX = playerPos ? playerPos.x : 0;
        const playerZ = playerPos ? playerPos.z : 0;
        
        // Пульсация врагов (для "живости")
        this.enemyPulsePhase = (this.enemyPulsePhase + 0.15) % (Math.PI * 2);
        const pulseSize = 6 + Math.sin(this.enemyPulsePhase) * 2; // 4-8px
        
        // Add new enemy markers - ПУЛЬСИРУЮЩИЕ КРАСНЫЕ КВАДРАТЫ
        enemies.forEach((enemy, i) => {
            const isVector = enemy instanceof Vector3;
            const ex = isVector ? (enemy as Vector3).x : (enemy as any).x;
            const ez = isVector ? (enemy as Vector3).z : (enemy as any).z;
            const alive = isVector ? true : (enemy as any).alive;
            
            if (!alive) return;
            
            // КРИТИЧЕСКИ ВАЖНО: Вычисляем позицию врага ОТНОСИТЕЛЬНО ИГРОКА!
            const relativeX = ex - playerX;
            const relativeZ = ez - playerZ;
            
            // Scale to minimap (меньший масштаб для большего охвата)
            const scale = 0.4;
            const x = relativeX * scale;
            const z = -relativeZ * scale; // Инвертируем Z для правильной ориентации
            
            // Clamp to minimap bounds
            const maxDist = 60;
            const dist = Math.sqrt(x*x + z*z);
            const clampedX = dist > maxDist ? x * maxDist / dist : x;
            const clampedZ = dist > maxDist ? z * maxDist / dist : z;
            
            // Враг на границе карты - показываем стрелку
            const isEdge = dist > maxDist;
            
            // ПУЛЬСИРУЮЩИЙ маркер врага
            const marker = new Rectangle(`enemy${i}`);
            marker.width = `${pulseSize}px`;
            marker.height = `${pulseSize}px`;
            marker.thickness = isEdge ? 1 : 0;
            marker.color = "#f00";
            marker.background = isEdge ? "#800" : "#f00"; // Если за границей - темнее
            marker.left = `${clampedX}px`;
            marker.top = `${clampedZ}px`;
            this.minimapContainer.addControl(marker);
            this.minimapEnemies.push(marker);
        });
        
        // КРИТИЧЕСКИ ВАЖНО: Игрок всегда в центре радара (0, 0)
        if (this.minimapPlayer) {
            this.minimapPlayer.left = "0px";
            this.minimapPlayer.top = "0px";
        }
    }
    
    setEnemyCount(count: number) {
        // Could add an enemy count display if needed
    }
    
    setCrosshairColor(color: string) {
        this.crosshairDot.background = color;
    }
    
    update(tankPos: Vector3, speed: number, isReloading: boolean, reloadProgress: number) {
        this.setSpeed(speed);
        this.setPosition(tankPos.x, tankPos.z);
        this.updateReload();
        this.updateGameTime();
    }
    
    private createTankStatsDisplay() {
        // Контейнер для статистики танка (справа вверху, под эффектами)
        this.tankStatsContainer = new Rectangle("tankStatsContainer");
        this.tankStatsContainer.width = "240px";
        this.tankStatsContainer.height = "200px"; // Увеличено для XP
        this.tankStatsContainer.cornerRadius = 0;
        this.tankStatsContainer.thickness = 2;
        this.tankStatsContainer.color = "#0f0";
        this.tankStatsContainer.background = "#000000cc";
        this.tankStatsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.tankStatsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.tankStatsContainer.left = "-20px";
        this.tankStatsContainer.top = "280px";
        this.guiTexture.addControl(this.tankStatsContainer);
        
        // Title
        const title = new TextBlock("statsTitle");
        title.text = "═══ TANK STATS ═══";
        title.color = "#0f0";
        title.fontSize = 12;
        title.fontFamily = "Courier New, monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        title.top = "5px";
        this.tankStatsContainer.addControl(title);
        
        // Chassis type
        this.chassisTypeText = new TextBlock("chassisType");
        this.chassisTypeText.text = "Chassis: Standard";
        this.chassisTypeText.color = "#0a0";
        this.chassisTypeText.fontSize = 10;
        this.chassisTypeText.fontFamily = "Courier New, monospace";
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
        this.chassisXpText.fontFamily = "Courier New, monospace";
        this.chassisXpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.chassisXpText.top = "40px";
        this.chassisXpText.left = "-10px";
        this.tankStatsContainer.addControl(this.chassisXpText);
        
        // Cannon type
        this.cannonTypeText = new TextBlock("cannonType");
        this.cannonTypeText.text = "Cannon: Standard";
        this.cannonTypeText.color = "#0a0";
        this.cannonTypeText.fontSize = 10;
        this.cannonTypeText.fontFamily = "Courier New, monospace";
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
        this.cannonXpText.fontFamily = "Courier New, monospace";
        this.cannonXpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.cannonXpText.top = "70px";
        this.cannonXpText.left = "-10px";
        this.tankStatsContainer.addControl(this.cannonXpText);
        
        // Separator
        const separator = new TextBlock("separator");
        separator.text = "─────────────────────";
        separator.color = "#0a0";
        separator.fontSize = 10;
        separator.fontFamily = "Courier New, monospace";
        separator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        separator.top = "85px";
        this.tankStatsContainer.addControl(separator);
        
        // Armor
        this.armorText = new TextBlock("armorText");
        this.armorText.text = "Armor: 0%";
        this.armorText.color = "#0a0";
        this.armorText.fontSize = 10;
        this.armorText.fontFamily = "Courier New, monospace";
        this.armorText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.armorText.top = "100px";
        this.armorText.left = "10px";
        this.tankStatsContainer.addControl(this.armorText);
        
        // Damage
        this.damageText = new TextBlock("damageText");
        this.damageText.text = "Damage: 50";
        this.damageText.color = "#0a0";
        this.damageText.fontSize = 10;
        this.damageText.fontFamily = "Courier New, monospace";
        this.damageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.damageText.top = "115px";
        this.damageText.left = "10px";
        this.tankStatsContainer.addControl(this.damageText);
        
        // Fire rate
        this.fireRateText = new TextBlock("fireRateText");
        this.fireRateText.text = "Fire Rate: 2.5s";
        this.fireRateText.color = "#0a0";
        this.fireRateText.fontSize = 10;
        this.fireRateText.fontFamily = "Courier New, monospace";
        this.fireRateText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fireRateText.top = "130px";
        this.fireRateText.left = "10px";
        this.tankStatsContainer.addControl(this.fireRateText);
        
        // Speed
        this.speedStatText = new TextBlock("speedStatText");
        this.speedStatText.text = "Speed: 10";
        this.speedStatText.color = "#0a0";
        this.speedStatText.fontSize = 10;
        this.speedStatText.fontFamily = "Courier New, monospace";
        this.speedStatText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.speedStatText.top = "145px";
        this.speedStatText.left = "10px";
        this.tankStatsContainer.addControl(this.speedStatText);
        
        // Health
        this.healthStatText = new TextBlock("healthStatText");
        this.healthStatText.text = "Max HP: 100";
        this.healthStatText.color = "#0a0";
        this.healthStatText.fontSize = 10;
        this.healthStatText.fontFamily = "Courier New, monospace";
        this.healthStatText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthStatText.top = "160px";
        this.healthStatText.left = "10px";
        this.tankStatsContainer.addControl(this.healthStatText);
    }
    
    private createFPSCounter() {
        // FPS counter (правый верхний угол)
        this.fpsContainer = new Rectangle("fpsContainer");
        this.fpsContainer.width = "80px";
        this.fpsContainer.height = "30px";
        this.fpsContainer.cornerRadius = 0;
        this.fpsContainer.thickness = 1;
        this.fpsContainer.color = "#0f0";
        this.fpsContainer.background = "#000000aa";
        this.fpsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.fpsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.fpsContainer.left = "-20px";
        this.fpsContainer.top = "20px";
        this.guiTexture.addControl(this.fpsContainer);
        
        this.fpsText = new TextBlock("fpsText");
        this.fpsText.text = "FPS: 60";
        this.fpsText.color = "#0f0";
        this.fpsText.fontSize = 14;
        this.fpsText.fontFamily = "Courier New, monospace";
        this.fpsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.fpsContainer.addControl(this.fpsText);
    }
    
    updateFPS(fps: number) {
        if (!this.fpsText) return;
        
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > 10) {
            this.fpsHistory.shift();
        }
        
        const avgFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
        this.fpsText.text = `FPS: ${avgFps}`;
        
        // Color based on FPS
        if (avgFps >= 55) {
            this.fpsText.color = "#0f0";
            if (this.fpsContainer) this.fpsContainer.color = "#0f0";
        } else if (avgFps >= 30) {
            this.fpsText.color = "#ff0";
            if (this.fpsContainer) this.fpsContainer.color = "#ff0";
        } else {
            this.fpsText.color = "#f00";
            if (this.fpsContainer) this.fpsContainer.color = "#f00";
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
    }
}
