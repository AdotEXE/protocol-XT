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
        this.createEnemyHealth();
        this.createCompass();
        this.createMinimap();
        this.createDamageIndicator();
        this.createMessageDisplay();
        this.createControlsHint();
        
        console.log("HUD initialized (FLAT MODE)");
    }
    
    private createHealthBar() {
        // Container - SOLID BLACK
        const container = new Rectangle("healthContainer");
        container.width = "280px";
        container.height = "50px";
        container.cornerRadius = 0; // No rounded corners
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "20px";
        container.top = "20px";
        this.guiTexture.addControl(container);
        
        // Health label
        const label = new TextBlock("healthLabel");
        label.text = "HP";
        label.color = "#0f0";
        label.fontSize = 16;
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        container.addControl(label);
        
        // Health bar background - SOLID DARK
        this.healthBar = new Rectangle("healthBar");
        this.healthBar.width = "180px";
        this.healthBar.height = "20px";
        this.healthBar.cornerRadius = 0;
        this.healthBar.thickness = 1;
        this.healthBar.color = "#0f0";
        this.healthBar.background = "#111";
        this.healthBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.left = "45px";
        container.addControl(this.healthBar);
        
        // Health fill - SOLID GREEN
        this.healthFill = new Rectangle("healthFill");
        this.healthFill.width = "100%";
        this.healthFill.height = "100%";
        this.healthFill.cornerRadius = 0;
        this.healthFill.thickness = 0;
        this.healthFill.background = "#0f0";
        this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.addControl(this.healthFill);
        
        // Health text
        this.healthText = new TextBlock("healthText");
        this.healthText.text = "100";
        this.healthText.color = "#0f0";
        this.healthText.fontSize = 18;
        this.healthText.fontFamily = "Courier New, monospace";
        this.healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.healthText.left = "-15px";
        container.addControl(this.healthText);
    }
    
    private createReloadIndicator() {
        // Container - SOLID BLACK
        const container = new Rectangle("reloadContainer");
        container.width = "280px";
        container.height = "35px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "20px";
        container.top = "80px";
        this.guiTexture.addControl(container);
        
        // Ammo label
        const label = new TextBlock("ammoLabel");
        label.text = "GUN";
        label.color = "#0f0";
        label.fontSize = 12;
        label.fontFamily = "Courier New, monospace";
        label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.left = "10px";
        container.addControl(label);
        
        // Reload bar background
        this.reloadBar = new Rectangle("reloadBar");
        this.reloadBar.width = "160px";
        this.reloadBar.height = "12px";
        this.reloadBar.cornerRadius = 0;
        this.reloadBar.thickness = 1;
        this.reloadBar.color = "#0f0";
        this.reloadBar.background = "#111";
        this.reloadBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.reloadBar.left = "45px";
        container.addControl(this.reloadBar);
        
        // Reload fill
        this.reloadFill = new Rectangle("reloadFill");
        this.reloadFill.width = "100%";
        this.reloadFill.height = "100%";
        this.reloadFill.cornerRadius = 0;
        this.reloadFill.thickness = 0;
        this.reloadFill.background = "#0f0";
        this.reloadFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.reloadBar.addControl(this.reloadFill);
        
        // Reload text
        this.reloadText = new TextBlock("reloadText");
        this.reloadText.text = "RDY";
        this.reloadText.color = "#0f0";
        this.reloadText.fontSize = 12;
        this.reloadText.fontFamily = "Courier New, monospace";
        this.reloadText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.reloadText.left = "-15px";
        container.addControl(this.reloadText);
    }
    
    private createCrosshair() {
        // Crosshair HIDDEN by default, appears when aiming
        
        // Center dot - HIDDEN by default
        this.crosshairDot = new Rectangle("crosshairDot");
        this.crosshairDot.width = "4px";
        this.crosshairDot.height = "4px";
        this.crosshairDot.thickness = 0;
        this.crosshairDot.background = "#f00";
        this.crosshairDot.isVisible = false; // HIDDEN!
        this.guiTexture.addControl(this.crosshairDot);
        
        // Lines - HIDDEN by default
        const size = 2;
        const gap = 10;
        const length = 18;
        
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
        // Container - SOLID BLACK - ЛЕВЫЙ НИЖНИЙ УГОЛ
        const container = new Rectangle("speedContainer");
        container.width = "100px";
        container.height = "60px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "20px";
        container.top = "-20px";
        this.guiTexture.addControl(container);
        
        // Speed value
        this.speedText = new TextBlock("speedText");
        this.speedText.text = "0";
        this.speedText.color = "#0f0";
        this.speedText.fontSize = 32;
        this.speedText.fontFamily = "Courier New, monospace";
        this.speedText.top = "-5px";
        container.addControl(this.speedText);
        
        // Unit
        const unit = new TextBlock("speedUnit");
        unit.text = "KM/H";
        unit.color = "#0a0";
        unit.fontSize = 10;
        unit.top = "18px";
        container.addControl(unit);
    }
    
    private createKillCounter() {
        // Container - SOLID BLACK
        const container = new Rectangle("killsContainer");
        container.width = "80px";
        container.height = "40px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#f00";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "-20px";
        container.top = "20px";
        this.guiTexture.addControl(container);
        
        // Label
        const label = new TextBlock("killLabel");
        label.text = "KILL";
        label.color = "#f00";
        label.fontSize = 10;
        label.top = "-10px";
        container.addControl(label);
        
        // Kill count
        this.killsText = new TextBlock("killsText");
        this.killsText.text = "0";
        this.killsText.color = "#f00";
        this.killsText.fontSize = 24;
        this.killsText.fontFamily = "Courier New, monospace";
        this.killsText.top = "5px";
        container.addControl(this.killsText);
    }

    private createEnemyHealth() {
        // Small box under kills
        const container = new Rectangle("enemyHpContainer");
        container.width = "120px";
        container.height = "40px";
        container.cornerRadius = 0;
        container.thickness = 2;
        container.color = "#0f0";
        container.background = "#000";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = "-20px";
        container.top = "70px";
        this.guiTexture.addControl(container);

        const label = new TextBlock("enemyHpLabel");
        label.text = "ENEMY HP";
        label.color = "#0f0";
        label.fontSize = 10;
        label.top = "-10px";
        container.addControl(label);

        this.enemyHealthText = new TextBlock("enemyHpText");
        this.enemyHealthText.text = "0";
        this.enemyHealthText.color = "#0f0";
        this.enemyHealthText.fontSize = 14;
        this.enemyHealthText.fontFamily = "Courier New, monospace";
        this.enemyHealthText.top = "6px";
        container.addControl(this.enemyHealthText);
    }
    
    private compassContainer: Rectangle;
    private compassDegrees: TextBlock;
    
    private createCompass() {
        // Container - wider for more info
        this.compassContainer = new Rectangle("compassContainer");
        this.compassContainer.width = "180px";
        this.compassContainer.height = "40px";
        this.compassContainer.cornerRadius = 0;
        this.compassContainer.thickness = 2;
        this.compassContainer.color = "#0f0";
        this.compassContainer.background = "#000";
        this.compassContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.compassContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.compassContainer.top = "15px";
        this.guiTexture.addControl(this.compassContainer);
        
        // Direction marker (center indicator)
        const marker = new Rectangle("compassMarker");
        marker.width = "3px";
        marker.height = "12px";
        marker.background = "#f00";
        marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.compassContainer.addControl(marker);
        
        // Main direction text (big)
        this.compassText = new TextBlock("compassText");
        this.compassText.text = "N";
        this.compassText.color = "#0f0";
        this.compassText.fontSize = 20;
        this.compassText.fontWeight = "bold";
        this.compassText.fontFamily = "Courier New, monospace";
        this.compassText.top = "-2px";
        this.compassContainer.addControl(this.compassText);
        
        // Degrees text (small, below)
        this.compassDegrees = new TextBlock("compassDeg");
        this.compassDegrees.text = "0°";
        this.compassDegrees.color = "#0a0";
        this.compassDegrees.fontSize = 10;
        this.compassDegrees.fontFamily = "Courier New, monospace";
        this.compassDegrees.top = "12px";
        this.compassContainer.addControl(this.compassDegrees);
    }
    
    // Player direction indicator
    private minimapPlayerDir: Rectangle | null = null;
    private minimapPlayer: Rectangle | null = null;
    
    private createMinimap() {
        // Container - SOLID BLACK, SQUARE - БОЛЕЕ ЖИВАЯ И ПОНЯТНАЯ
        this.minimapContainer = new Rectangle("minimapContainer");
        this.minimapContainer.width = "150px";
        this.minimapContainer.height = "150px";
        this.minimapContainer.cornerRadius = 0;
        this.minimapContainer.thickness = 3;
        this.minimapContainer.color = "#0f0";
        this.minimapContainer.background = "#001100"; // Темно-зеленый фон
        this.minimapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.minimapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.minimapContainer.left = "-20px";
        this.minimapContainer.top = "-50px"; // Нижний правый угол
        this.guiTexture.addControl(this.minimapContainer);
        
        // Grid lines - ЯРКИЕ
        for (let i = 1; i < 3; i++) {
            const hLine = new Rectangle(`hGrid${i}`);
            hLine.width = "146px";
            hLine.height = "1px";
            hLine.background = "#030"; // Зеленые линии
            hLine.top = `${-50 + i * 50}px`;
            this.minimapContainer.addControl(hLine);
            
            const vLine = new Rectangle(`vGrid${i}`);
            vLine.width = "1px";
            vLine.height = "146px";
            vLine.background = "#030";
            vLine.left = `${-50 + i * 50}px`;
            this.minimapContainer.addControl(vLine);
        }
        
        // Центральные линии (более яркие)
        const centerH = new Rectangle("centerH");
        centerH.width = "146px";
        centerH.height = "1px";
        centerH.background = "#050";
        this.minimapContainer.addControl(centerH);
        
        const centerV = new Rectangle("centerV");
        centerV.width = "1px";
        centerV.height = "146px";
        centerV.background = "#050";
        this.minimapContainer.addControl(centerV);
        
        // Player marker - ЯРКИЙ ЗЕЛЕНЫЙ КВАДРАТ
        this.minimapPlayer = new Rectangle("minimapPlayer");
        this.minimapPlayer.width = "12px";
        this.minimapPlayer.height = "12px";
        this.minimapPlayer.thickness = 2;
        this.minimapPlayer.color = "#0f0";
        this.minimapPlayer.background = "#0f0";
        this.minimapContainer.addControl(this.minimapPlayer);
        
        // Player direction arrow - ЯРКАЯ СТРЕЛКА
        this.minimapPlayerDir = new Rectangle("playerDir");
        this.minimapPlayerDir.width = "4px";
        this.minimapPlayerDir.height = "20px";
        this.minimapPlayerDir.background = "#0f0";
        this.minimapPlayerDir.top = "-16px";
        this.minimapContainer.addControl(this.minimapPlayerDir);
        
        // Рамка сканирования (анимация "живости")
        const scanLine = new Rectangle("scanLine");
        scanLine.width = "146px";
        scanLine.height = "2px";
        scanLine.background = "#0f04";
        scanLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        scanLine.top = "2px";
        this.minimapContainer.addControl(scanLine);
        
        // Анимация сканирующей линии
        let scanY = 0;
        setInterval(() => {
            scanY = (scanY + 2) % 146;
            scanLine.top = `${scanY}px`;
        }, 50);
        
        // Label
        const label = new TextBlock("mapLabel");
        label.text = "RADAR";
        label.color = "#0f0";
        label.fontSize = 10;
        label.fontWeight = "bold";
        label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        label.top = "3px";
        this.minimapContainer.addControl(label);
    }
    
    private createDamageIndicator() {
        // Full screen RED flash - SOLID color, not transparent
        this.damageIndicator = new Rectangle("damageIndicator");
        this.damageIndicator.width = "100%";
        this.damageIndicator.height = "100%";
        this.damageIndicator.thickness = 0;
        this.damageIndicator.background = "#000"; // Will flash to #f00
        this.damageIndicator.isVisible = false; // Hidden by default
        this.damageIndicator.isPointerBlocker = false;
        this.guiTexture.addControl(this.damageIndicator);
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
        this.healthFill.width = percent + "%";
        this.healthText.text = `${Math.round(this.currentHealth)}`;
        
        // Color based on health - SOLID colors
        if (percent > 60) {
            this.healthFill.background = "#0f0";
            this.healthText.color = "#0f0";
        } else if (percent > 30) {
            this.healthFill.background = "#ff0";
            this.healthText.color = "#ff0";
        } else {
            this.healthFill.background = "#f00";
            this.healthText.color = "#f00";
        }
    }
    
    damage(amount: number) {
        this.setHealth(this.currentHealth - amount);
        
        // RED flash - SOLID, no transparency
        this.damageIndicator.background = "#300";
        this.damageIndicator.isVisible = true;
        setTimeout(() => {
            this.damageIndicator.isVisible = false;
        }, 100);
    }
    
    heal(amount: number) {
        this.setHealth(this.currentHealth + amount);
    }
    
    startReload(reloadTimeMs: number) {
        this.isReloading = true;
        this.reloadTime = reloadTimeMs;
        this.reloadStartTime = Date.now();
        this.reloadFill.background = "#f50";
        this.reloadText.text = "...";
        this.reloadText.color = "#f50";
    }
    
    updateReload() {
        if (!this.isReloading) {
            this.reloadFill.width = "100%";
            this.reloadFill.background = "#0f0";
            this.reloadText.text = "RDY";
            this.reloadText.color = "#0f0";
            return;
        }
        
        const elapsed = Date.now() - this.reloadStartTime;
        const percent = Math.min(100, (elapsed / this.reloadTime) * 100);
        this.reloadFill.width = percent + "%";
        
        if (elapsed >= this.reloadTime) {
            this.isReloading = false;
            this.reloadFill.background = "#0f0";
            this.reloadText.text = "RDY";
            this.reloadText.color = "#0f0";
        }
    }
    
    setSpeed(speed: number) {
        const kmh = Math.abs(speed) * 3.6;
        this.speedText.text = `${Math.round(kmh)}`;
        
        // Color based on speed - SOLID
        if (kmh > 30) {
            this.speedText.color = "#f50";
        } else if (kmh > 15) {
            this.speedText.color = "#ff0";
        } else {
            this.speedText.color = "#0f0";
        }
    }
    
    setPosition(x: number, z: number) {
        this.positionText.text = `X:${Math.round(x)} Z:${Math.round(z)}`;
    }
    
    setDirection(angle: number) {
        const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const index = Math.round(normalizedAngle / (Math.PI / 4)) % 8;
        
        // Update direction text
        this.compassText.text = directions[index];
        
        // Update degrees - convert radians to degrees
        const degrees = Math.round((normalizedAngle * 180) / Math.PI);
        if (this.compassDegrees) {
            this.compassDegrees.text = `${degrees}°`;
        }
        
        // Color based on cardinal directions
        const isCardinal = index % 2 === 0;
        this.compassText.color = isCardinal ? "#0f0" : "#0a0";
    }
    
    addKill() {
        this.killsCount++;
        this.killsText.text = `${this.killsCount}`;
        this.showMessage("KILL!", "#f00");
    }

    setEnemyHealth(totalHp: number, count: number) {
        if (!this.enemyHealthText) return;
        this.enemyHealthText.text = `${Math.round(totalHp)} (${count})`;
        // Color cue
        if (totalHp > 200) this.enemyHealthText.color = "#f00";
        else if (totalHp > 100) this.enemyHealthText.color = "#ff0";
        else this.enemyHealthText.color = "#0f0";
    }
    
    showMessage(text: string, color: string = "#0f0") {
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        
        const msgBg = (this.messageText as any)._msgBg as Rectangle;
        msgBg.isVisible = true;
        msgBg.color = color;
        this.messageText.text = text;
        this.messageText.color = color;
        
        this.messageTimeout = setTimeout(() => {
            msgBg.isVisible = false;
        }, 2000);
    }
    
    showDeathMessage() {
        this.showMessage("DESTROYED! RESPAWN IN 3...", "#f00");
    }
    
    showRespawnMessage() {
        this.showMessage("RESPAWNED!", "#0f0");
    }
    
    private enemyPulsePhase = 0;
    
    updateMinimap(enemies: {x: number, z: number, alive: boolean}[] | Vector3[]) {
        // Remove old enemy markers
        this.minimapEnemies.forEach(e => e.dispose());
        this.minimapEnemies = [];
        
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
            
            // Scale to minimap (меньший масштаб для большего охвата)
            const scale = 0.4;
            const x = ex * scale;
            const z = -ez * scale;
            
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
    }
}
