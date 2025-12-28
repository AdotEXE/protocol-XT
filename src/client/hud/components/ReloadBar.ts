/**
 * @module hud/components/ReloadBar
 * @description Полоса перезарядки орудия
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";

export interface ReloadBarConfig {
    width: number;
    height: number;
    backgroundColor: string;
    fillColor: string;
    readyColor: string;
    borderColor: string;
    textColor: string;
    fontSize: number;
}

export const DEFAULT_RELOAD_CONFIG: ReloadBarConfig = {
    width: 200,
    height: 20,
    backgroundColor: "#000000aa",
    fillColor: "#ff8800",
    readyColor: "#00ff00",
    borderColor: "#888",
    textColor: "#fff",
    fontSize: 12
};

export class ReloadBar {
    private guiTexture: AdvancedDynamicTexture;
    private config: ReloadBarConfig;
    
    private container: Rectangle | null = null;
    private fill: Rectangle | null = null;
    private text: TextBlock | null = null;
    
    private currentProgress = 100;
    private isReady = true;
    
    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<ReloadBarConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_RELOAD_CONFIG, ...config };
        this.create();
    }
    
    private create(): void {
        // Контейнер полосы
        this.container = new Rectangle("reloadBar");
        this.container.width = `${this.config.width}px`;
        this.container.height = `${this.config.height}px`;
        this.container.background = this.config.backgroundColor;
        this.container.thickness = 2;
        this.container.color = this.config.borderColor;
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.top = "-80px";
        this.container.isVisible = true; // ИСПРАВЛЕНИЕ: Убеждаемся, что компонент видим
        this.guiTexture.addControl(this.container);
        
        // Заполнение
        this.fill = new Rectangle("reloadFill");
        this.fill.width = "100%";
        this.fill.height = "100%";
        this.fill.background = this.config.readyColor;
        this.fill.thickness = 0;
        this.fill.cornerRadius = 2;
        this.fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.fill.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.container.addControl(this.fill);
        
        // Текст
        this.text = new TextBlock("reloadText");
        this.text.text = "READY";
        this.text.color = this.config.textColor;
        this.text.fontSize = this.config.fontSize;
        this.text.fontWeight = "bold";
        this.text.fontFamily = "'Press Start 2P', monospace";
        this.text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.text.outlineWidth = 1;
        this.text.outlineColor = "#000";
        this.container.addControl(this.text);
    }
    
    update(progress: number, isReloading: boolean = false): void {
        this.currentProgress = Math.max(0, Math.min(100, progress));
        this.isReady = this.currentProgress >= 100 && !isReloading;
        
        if (!this.fill || !this.text) return;
        
        this.fill.width = `${this.currentProgress}%`;
        
        if (this.isReady) {
            this.fill.background = this.config.readyColor;
            this.text.text = "READY";
            this.text.color = "#fff";
        } else {
            this.fill.background = this.config.fillColor;
            this.text.text = `${Math.round(this.currentProgress)}%`;
            this.text.color = this.config.textColor;
        }
    }
    
    setReloadTime(currentTime: number, totalTime: number): void {
        if (totalTime <= 0) {
            this.update(100);
            return;
        }
        
        const progress = ((totalTime - currentTime) / totalTime) * 100;
        const isReloading = currentTime > 0 && currentTime < totalTime;
        this.update(progress, isReloading);
    }
    
    // ИСПРАВЛЕНИЕ: Добавлены методы для использования в HUD
    setProgress(progress: number, remainingTime: number): void {
        // Правильный расчет isReloading
        const isReloading = remainingTime > 0;
        this.update(progress, isReloading);
    }
    
    setReady(): void {
        // Устанавливаем готовность
        this.update(100, false);
    }
    
    isWeaponReady(): boolean {
        return this.isReady;
    }
    
    getProgress(): number {
        return this.currentProgress;
    }
    
    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.isVisible = visible;
        }
    }
    
    isVisible(): boolean {
        return this.container?.isVisible ?? false;
    }
    
    dispose(): void {
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

export default ReloadBar;

