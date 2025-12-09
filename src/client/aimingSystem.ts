// ═══════════════════════════════════════════════════════════════════════════
// AIMING SYSTEM - Улучшенная система прицеливания
// ═══════════════════════════════════════════════════════════════════════════

import { Scene, Vector3, Ray, Color3, Mesh, MeshBuilder, StandardMaterial, DynamicTexture, TransformNode } from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Ellipse, Line, Control } from "@babylonjs/gui";

export interface TargetInfo {
    mesh: Mesh | null;
    type: "tank" | "turret" | "none";
    distance: number;
    health: number;
    maxHealth: number;
    name: string;
    velocity: Vector3;
    leadPoint: Vector3 | null;
}

export interface AimingSettings {
    aimAssist: boolean;
    showLeadIndicator: boolean;
    showDistanceMarkers: boolean;
    showTargetInfo: boolean;
    crosshairStyle: "default" | "dot" | "cross" | "circle";
    crosshairColor: string;
    crosshairSize: number;
}

const DEFAULT_AIM_SETTINGS: AimingSettings = {
    aimAssist: true,
    showLeadIndicator: true,
    showDistanceMarkers: true,
    showTargetInfo: true,
    crosshairStyle: "default",
    crosshairColor: "#0f0",
    crosshairSize: 1
};

export class AimingSystem {
    private scene: Scene;
    private guiTexture: AdvancedDynamicTexture;
    private settings: AimingSettings;
    
    // Crosshair elements
    private crosshairContainer: Rectangle | null = null;
    private crosshairCenter: Ellipse | null = null;
    private crosshairLines: Rectangle[] = [];
    private crosshairOuter: Ellipse | null = null;
    
    // Target info elements
    private targetInfoPanel: Rectangle | null = null;
    private targetNameText: TextBlock | null = null;
    private targetHealthBar: Rectangle | null = null;
    private targetHealthFill: Rectangle | null = null;
    private targetDistanceText: TextBlock | null = null;
    private targetTypeText: TextBlock | null = null;
    
    // Lead indicator
    private leadIndicator: Ellipse | null = null;
    private leadLine: Line | null = null;
    
    // Distance markers
    private distanceMarkers: TextBlock[] = [];
    
    // Aim state
    private isAiming: boolean = false;
    private currentTarget: TargetInfo | null = null;
    private lastTargetPosition: Vector3 | null = null;
    private targetVelocity: Vector3 = Vector3.Zero();
    private aimSpread: number = 1; // 0-1 spread factor
    
    // References
    private tank: any = null;
    private enemyTanks: any[] = [];
    private enemyTurrets: any[] = [];
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.settings = this.loadSettings();
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("AimingUI", false, scene);
        this.guiTexture.isForeground = true;
        
        this.createCrosshair();
        this.createTargetInfo();
        this.createLeadIndicator();
        this.createDistanceMarkers();
        
        // Listen for aim mode changes
        window.addEventListener("aimModeChanged", (e: any) => {
            this.setAiming(e.detail?.aiming || false);
        });
    }
    
    setTank(tank: any): void {
        this.tank = tank;
    }
    
    setEnemies(tanks: any[], turrets: any[]): void {
        this.enemyTanks = tanks;
        this.enemyTurrets = turrets;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // СОЗДАНИЕ UI ЭЛЕМЕНТОВ
    // ─────────────────────────────────────────────────────────────────────
    
    private createCrosshair(): void {
        // Main container
        this.crosshairContainer = new Rectangle("crosshairContainer");
        this.crosshairContainer.width = "200px";
        this.crosshairContainer.height = "200px";
        this.crosshairContainer.thickness = 0;
        this.crosshairContainer.isHitTestVisible = false;
        this.guiTexture.addControl(this.crosshairContainer);
        
        // Outer ring (shows spread)
        this.crosshairOuter = new Ellipse("crosshairOuter");
        this.crosshairOuter.width = "60px";
        this.crosshairOuter.height = "60px";
        this.crosshairOuter.thickness = 2;
        this.crosshairOuter.color = this.settings.crosshairColor;
        this.crosshairOuter.alpha = 0.5;
        this.crosshairContainer.addControl(this.crosshairOuter);
        
        // Center dot
        this.crosshairCenter = new Ellipse("crosshairCenter");
        this.crosshairCenter.width = "6px";
        this.crosshairCenter.height = "6px";
        this.crosshairCenter.thickness = 0;
        this.crosshairCenter.background = this.settings.crosshairColor;
        this.crosshairContainer.addControl(this.crosshairCenter);
        
        // Crosshair lines
        const lineLength = 20;
        const lineGap = 10;
        const positions = [
            { top: -lineLength - lineGap, left: 0, width: 2, height: lineLength }, // top
            { top: lineGap, left: 0, width: 2, height: lineLength }, // bottom
            { top: 0, left: -lineLength - lineGap, width: lineLength, height: 2 }, // left
            { top: 0, left: lineGap, width: lineLength, height: 2 }, // right
        ];
        
        positions.forEach((pos, i) => {
            const line = new Rectangle(`crosshairLine${i}`);
            line.width = `${pos.width}px`;
            line.height = `${pos.height}px`;
            line.thickness = 0;
            line.background = this.settings.crosshairColor;
            line.top = `${pos.top}px`;
            line.left = `${pos.left}px`;
            this.crosshairContainer!.addControl(line);
            this.crosshairLines.push(line);
        });
        
        // Distance indicator dots
        for (let i = 0; i < 5; i++) {
            const dot = new Ellipse(`distDot${i}`);
            dot.width = "4px";
            dot.height = "4px";
            dot.thickness = 0;
            dot.background = "#0a0";
            dot.top = `${40 + i * 8}px`;
            dot.alpha = 0.6;
            this.crosshairContainer!.addControl(dot);
        }
    }
    
    private createTargetInfo(): void {
        // Target info panel (shows when aiming at enemy)
        this.targetInfoPanel = new Rectangle("targetInfo");
        this.targetInfoPanel.width = "220px";
        this.targetInfoPanel.height = "80px";
        this.targetInfoPanel.cornerRadius = 0;
        this.targetInfoPanel.thickness = 2;
        this.targetInfoPanel.color = "#f00";
        this.targetInfoPanel.background = "#000000cc";
        this.targetInfoPanel.top = "-120px";
        this.targetInfoPanel.isVisible = false;
        this.guiTexture.addControl(this.targetInfoPanel);
        
        // Target type icon
        this.targetTypeText = new TextBlock("targetType");
        this.targetTypeText.text = "🎯 ВРАГ";
        this.targetTypeText.color = "#f00";
        this.targetTypeText.fontSize = 12;
        this.targetTypeText.top = "-30px";
        this.targetTypeText.left = "-80px";
        this.targetInfoPanel.addControl(this.targetTypeText);
        
        // Target name
        this.targetNameText = new TextBlock("targetName");
        this.targetNameText.text = "Enemy Tank";
        this.targetNameText.color = "#fff";
        this.targetNameText.fontSize = 14;
        this.targetNameText.fontWeight = "bold";
        this.targetNameText.top = "-10px";
        this.targetInfoPanel.addControl(this.targetNameText);
        
        // Health bar background
        this.targetHealthBar = new Rectangle("targetHealthBg");
        this.targetHealthBar.width = "180px";
        this.targetHealthBar.height = "12px";
        this.targetHealthBar.cornerRadius = 0;
        this.targetHealthBar.thickness = 1;
        this.targetHealthBar.color = "#f00";
        this.targetHealthBar.background = "#300";
        this.targetHealthBar.top = "10px";
        this.targetInfoPanel.addControl(this.targetHealthBar);
        
        // Health bar fill
        this.targetHealthFill = new Rectangle("targetHealthFill");
        this.targetHealthFill.width = "100%";
        this.targetHealthFill.height = "100%";
        this.targetHealthFill.cornerRadius = 0;
        this.targetHealthFill.thickness = 0;
        this.targetHealthFill.background = "#f00";
        this.targetHealthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.targetHealthBar.addControl(this.targetHealthFill);
        
        // Distance text
        this.targetDistanceText = new TextBlock("targetDistance");
        this.targetDistanceText.text = "0m";
        this.targetDistanceText.color = "#ff0";
        this.targetDistanceText.fontSize = 16;
        this.targetDistanceText.fontWeight = "bold";
        this.targetDistanceText.top = "28px";
        this.targetInfoPanel.addControl(this.targetDistanceText);
    }
    
    private createLeadIndicator(): void {
        // Lead indicator (where to shoot for moving targets)
        this.leadIndicator = new Ellipse("leadIndicator");
        this.leadIndicator.width = "20px";
        this.leadIndicator.height = "20px";
        this.leadIndicator.thickness = 2;
        this.leadIndicator.color = "#ff0";
        this.leadIndicator.alpha = 0.8;
        this.leadIndicator.isVisible = false;
        this.guiTexture.addControl(this.leadIndicator);
        
        // Inner dot
        const innerDot = new Ellipse("leadDot");
        innerDot.width = "6px";
        innerDot.height = "6px";
        innerDot.thickness = 0;
        innerDot.background = "#ff0";
        this.leadIndicator.addControl(innerDot);
    }
    
    private createDistanceMarkers(): void {
        // Distance scale on the right side of crosshair
        for (let i = 0; i < 5; i++) {
            const marker = new TextBlock(`distMarker${i}`);
            marker.text = `${(i + 1) * 20}m`;
            marker.color = "#0a0";
            marker.fontSize = 9;
            marker.left = "50px";
            marker.top = `${-40 + i * 20}px`;
            marker.alpha = 0.6;
            this.crosshairContainer!.addControl(marker);
            this.distanceMarkers.push(marker);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ОБНОВЛЕНИЕ
    // ─────────────────────────────────────────────────────────────────────
    
    update(): void {
        if (!this.tank || !this.tank.barrel) return;
        
        // Update target detection
        this.detectTarget();
        
        // Update crosshair
        this.updateCrosshair();
        
        // Update target info
        this.updateTargetInfo();
        
        // Update lead indicator
        this.updateLeadIndicator();
        
        // Update spread based on movement
        this.updateSpread();
    }
    
    private detectTarget(): void {
        if (!this.tank || !this.tank.barrel) {
            this.currentTarget = null;
            return;
        }
        
        // Create ray from barrel
        const barrelPos = this.tank.barrel.getAbsolutePosition();
        const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
        const ray = new Ray(barrelPos, barrelDir, 200);
        
        let closestTarget: TargetInfo | null = null;
        let closestDist = Infinity;
        
        // Check enemy tanks
        for (const enemy of this.enemyTanks) {
            if (!enemy || !enemy.chassis || !enemy.isAlive) continue;
            
            const enemyPos = enemy.chassis.getAbsolutePosition();
            const dist = Vector3.Distance(barrelPos, enemyPos);
            
            // Check if in cone of fire
            const toEnemy = enemyPos.subtract(barrelPos).normalize();
            const angle = Math.acos(Vector3.Dot(barrelDir, toEnemy));
            
            // Wide detection angle when not aiming, narrow when aiming
            const maxAngle = this.isAiming ? 0.1 : 0.3;
            
            if (angle < maxAngle && dist < closestDist) {
                closestDist = dist;
                
                // Calculate velocity for lead indicator
                const velocity = this.calculateTargetVelocity(enemy);
                const leadPoint = this.calculateLeadPoint(enemyPos, velocity, dist);
                
                closestTarget = {
                    mesh: enemy.chassis,
                    type: "tank",
                    distance: dist,
                    health: enemy.currentHealth || 0,
                    maxHealth: enemy.maxHealth || 100,
                    name: enemy.chassisType?.name || "Enemy Tank",
                    velocity: velocity,
                    leadPoint: leadPoint
                };
            }
        }
        
        // Check turrets
        for (const turret of this.enemyTurrets) {
            if (!turret || !turret.base || turret.isDestroyed) continue;
            
            const turretPos = turret.base.getAbsolutePosition();
            const dist = Vector3.Distance(barrelPos, turretPos);
            
            const toTurret = turretPos.subtract(barrelPos).normalize();
            const angle = Math.acos(Vector3.Dot(barrelDir, toTurret));
            
            const maxAngle = this.isAiming ? 0.15 : 0.35;
            
            if (angle < maxAngle && dist < closestDist) {
                closestDist = dist;
                closestTarget = {
                    mesh: turret.base,
                    type: "turret",
                    distance: dist,
                    health: turret.health || 0,
                    maxHealth: turret.maxHealth || 100,
                    name: "Enemy Turret",
                    velocity: Vector3.Zero(),
                    leadPoint: null
                };
            }
        }
        
        this.currentTarget = closestTarget;
    }
    
    private calculateTargetVelocity(enemy: any): Vector3 {
        if (!enemy.chassis) return Vector3.Zero();
        
        const currentPos = enemy.chassis.getAbsolutePosition().clone();
        
        if (this.lastTargetPosition && enemy === this.currentTarget?.mesh?.parent) {
            const delta = currentPos.subtract(this.lastTargetPosition);
            this.targetVelocity = delta.scale(60); // Assuming 60fps
        }
        
        this.lastTargetPosition = currentPos;
        return this.targetVelocity.clone();
    }
    
    private calculateLeadPoint(targetPos: Vector3, targetVel: Vector3, distance: number): Vector3 | null {
        if (!this.tank) return null;
        
        // Time for projectile to reach target
        const projectileSpeed = this.tank.projectileSpeed || 50;
        const timeToTarget = distance / projectileSpeed;
        
        // Predict where target will be
        const leadPoint = targetPos.add(targetVel.scale(timeToTarget));
        
        // Only show lead if target is moving significantly
        if (targetVel.length() < 2) return null;
        
        return leadPoint;
    }
    
    private updateCrosshair(): void {
        if (!this.crosshairContainer) return;
        
        // Update color based on target
        let color = this.settings.crosshairColor;
        let outerAlpha = 0.5;
        
        if (this.currentTarget) {
            color = "#f00";
            outerAlpha = 0.8;
            
            // Pulse effect when locked
            const pulse = Math.sin(Date.now() / 100) * 0.1 + 0.9;
            outerAlpha *= pulse;
        }
        
        if (this.crosshairCenter) {
            this.crosshairCenter.background = color;
        }
        
        if (this.crosshairOuter) {
            this.crosshairOuter.color = color;
            this.crosshairOuter.alpha = outerAlpha;
            
            // Expand/contract based on spread and aiming
            const baseSize = this.isAiming ? 40 : 60;
            const spreadSize = baseSize + this.aimSpread * 40;
            this.crosshairOuter.width = `${spreadSize}px`;
            this.crosshairOuter.height = `${spreadSize}px`;
        }
        
        // Update crosshair lines color
        this.crosshairLines.forEach(line => {
            line.background = color;
        });
        
        // Scale crosshair when aiming
        const scale = this.isAiming ? 0.7 : 1;
        this.crosshairContainer.scaleX = scale;
        this.crosshairContainer.scaleY = scale;
    }
    
    private updateTargetInfo(): void {
        if (!this.targetInfoPanel) return;
        
        if (this.currentTarget && this.settings.showTargetInfo) {
            this.targetInfoPanel.isVisible = true;
            
            // Update name
            if (this.targetNameText) {
                this.targetNameText.text = this.currentTarget.name;
            }
            
            // Update type
            if (this.targetTypeText) {
                this.targetTypeText.text = this.currentTarget.type === "tank" ? "🎯 ТАНК" : "🗼 ТУРЕЛЬ";
            }
            
            // Update health bar
            if (this.targetHealthFill) {
                const healthPercent = (this.currentTarget.health / this.currentTarget.maxHealth) * 100;
                this.targetHealthFill.width = `${healthPercent}%`;
                
                // Color based on health
                if (healthPercent > 60) {
                    this.targetHealthFill.background = "#0f0";
                } else if (healthPercent > 30) {
                    this.targetHealthFill.background = "#ff0";
                } else {
                    this.targetHealthFill.background = "#f00";
                }
            }
            
            // Update distance
            if (this.targetDistanceText) {
                this.targetDistanceText.text = `${Math.round(this.currentTarget.distance)}m`;
            }
        } else {
            this.targetInfoPanel.isVisible = false;
        }
    }
    
    private updateLeadIndicator(): void {
        if (!this.leadIndicator) return;
        
        if (this.currentTarget?.leadPoint && this.settings.showLeadIndicator && this.isAiming) {
            // Convert 3D lead point to screen coordinates
            const engine = this.scene.getEngine();
            const camera = this.scene.activeCamera;
            
            if (camera) {
                const screenPos = Vector3.Project(
                    this.currentTarget.leadPoint,
                    Matrix.Identity(),
                    this.scene.getTransformMatrix(),
                    camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
                );
                
                // Check if on screen
                if (screenPos.z > 0 && screenPos.z < 1) {
                    this.leadIndicator.isVisible = true;
                    
                    // Convert to GUI coordinates (centered)
                    const guiX = screenPos.x - engine.getRenderWidth() / 2;
                    const guiY = screenPos.y - engine.getRenderHeight() / 2;
                    
                    this.leadIndicator.left = `${guiX}px`;
                    this.leadIndicator.top = `${guiY}px`;
                } else {
                    this.leadIndicator.isVisible = false;
                }
            }
        } else {
            this.leadIndicator.isVisible = false;
        }
    }
    
    private updateSpread(): void {
        if (!this.tank) return;
        
        // Calculate spread based on movement
        let spread = 0;
        
        // Moving increases spread
        if (this.tank.physicsBody) {
            const vel = this.tank.physicsBody.getLinearVelocity();
            if (vel) {
                const speed = vel.length();
                spread += Math.min(speed / 20, 0.5);
            }
        }
        
        // Turning increases spread
        if (Math.abs(this.tank.smoothSteer || 0) > 0.3) {
            spread += 0.2;
        }
        
        // Turret rotation increases spread
        if (Math.abs(this.tank.turretTurnSmooth || 0) > 0.1) {
            spread += 0.15;
        }
        
        // Aiming reduces spread over time
        if (this.isAiming) {
            spread *= 0.5;
        }
        
        // Smooth the spread value
        this.aimSpread = this.aimSpread * 0.9 + spread * 0.1;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ПУБЛИЧНЫЕ МЕТОДЫ
    // ─────────────────────────────────────────────────────────────────────
    
    setAiming(aiming: boolean): void {
        this.isAiming = aiming;
        
        // Reset spread faster when starting to aim
        if (aiming) {
            this.aimSpread *= 0.5;
        }
    }
    
    getTarget(): TargetInfo | null {
        return this.currentTarget;
    }
    
    getSpread(): number {
        return this.aimSpread;
    }
    
    hasTarget(): boolean {
        return this.currentTarget !== null;
    }
    
    getTargetDistance(): number {
        return this.currentTarget?.distance || 0;
    }
    
    setCrosshairColor(color: string): void {
        this.settings.crosshairColor = color;
        if (this.crosshairCenter) {
            this.crosshairCenter.background = color;
        }
        if (this.crosshairOuter) {
            this.crosshairOuter.color = color;
        }
        this.crosshairLines.forEach(line => line.background = color);
    }
    
    setVisible(visible: boolean): void {
        if (this.crosshairContainer) {
            this.crosshairContainer.isVisible = visible;
        }
        if (!visible) {
            if (this.targetInfoPanel) this.targetInfoPanel.isVisible = false;
            if (this.leadIndicator) this.leadIndicator.isVisible = false;
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // НАСТРОЙКИ
    // ─────────────────────────────────────────────────────────────────────
    
    private loadSettings(): AimingSettings {
        try {
            const saved = localStorage.getItem("tx_aiming_settings");
            if (saved) {
                return { ...DEFAULT_AIM_SETTINGS, ...JSON.parse(saved) };
            }
        } catch (e) {}
        return { ...DEFAULT_AIM_SETTINGS };
    }
    
    saveSettings(): void {
        localStorage.setItem("tx_aiming_settings", JSON.stringify(this.settings));
    }
    
    getSettings(): AimingSettings {
        return { ...this.settings };
    }
    
    updateSettings(newSettings: Partial<AimingSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }
}

// Matrix import for projection
import { Matrix } from "@babylonjs/core";

