/**
 * @module hud/components/FuelIndicator
 * @description Индикатор топлива
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS, HUD_FONTS } from "../HUDConstants";
import { scalePixels } from "../../utils/uiScale";

/**
 * Конфигурация индикатора топлива
 */
export interface FuelIndicatorConfig {
    width: number;
    height: number;
    showText: boolean;
    showIcon: boolean;
    warningThreshold: number;
    criticalThreshold: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_FUEL_CONFIG: FuelIndicatorConfig = {
    width: 120,
    height: 16,
    showText: true,
    showIcon: true,
    warningThreshold: 30,
    criticalThreshold: 10
};

/**
 * FuelIndicator - Индикатор топлива
 */
export class FuelIndicator {
    private guiTexture: AdvancedDynamicTexture;
    private config: FuelIndicatorConfig;
    
    // Элементы UI
    private container: Rectangle | null = null;
    private barBackground: Rectangle | null = null;
    private barFill: Rectangle | null = null;
    private text: TextBlock | null = null;
    private icon: TextBlock | null = null;
    
    // Состояние
    private currentFuel: number = 100;
    private maxFuel: number = 100;
    private isWarning: boolean = false;
    private isCritical: boolean = false;
    private pulseTime: number = 0;
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<FuelIndicatorConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_FUEL_CONFIG, ...config };
        this.create();
    }
    
    /**
     * Создание UI элементов
     */
    private create(): void {
        // Контейнер
        this.container = new Rectangle("fuelIndicator");
        this.container.width = `${scalePixels(this.config.width + (this.config.showIcon ? 24 : 0))}px`;
        this.container.height = `${scalePixels(this.config.height + 8)}px`;
        this.container.thickness = 0;
        this.container.isPointerBlocker = false;
        
        // Иконка
        if (this.config.showIcon) {
            this.icon = new TextBlock("fuelIcon");
            this.icon.text = "⛽";
            this.icon.fontSize = scalePixels(14);
            this.icon.color = HUD_COLORS.SECONDARY;
            this.icon.left = `${scalePixels(-this.config.width / 2 - 4)}px`;
            this.icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.container.addControl(this.icon);
        }
        
        // Фон полосы
        this.barBackground = new Rectangle("fuelBg");
        this.barBackground.width = `${scalePixels(this.config.width)}px`;
        this.barBackground.height = `${scalePixels(this.config.height)}px`;
        this.barBackground.background = HUD_COLORS.BG_DARK;
        this.barBackground.thickness = 1;
        this.barBackground.color = HUD_COLORS.SECONDARY;
        this.barBackground.cornerRadius = 2;
        if (this.config.showIcon) {
            this.barBackground.left = `${scalePixels(12)}px`;
        }
        this.container.addControl(this.barBackground);
        
        // Заполнение
        this.barFill = new Rectangle("fuelFill");
        this.barFill.width = "100%";
        this.barFill.height = `${scalePixels(this.config.height - 4)}px`;
        this.barFill.background = HUD_COLORS.FUEL_FULL;
        this.barFill.thickness = 0;
        this.barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.barFill.left = "2px";
        this.barBackground.addControl(this.barFill);
        
        // Текст
        if (this.config.showText) {
            this.text = new TextBlock("fuelText");
            this.text.text = "100%";
            this.text.fontSize = scalePixels(10);
            this.text.fontFamily = HUD_FONTS.PRIMARY;
            this.text.color = HUD_COLORS.PRIMARY;
            this.barBackground.addControl(this.text);
        }
    }
    
    /**
     * Добавление к родительскому контролу
     */
    addToParent(parent: Rectangle | AdvancedDynamicTexture): void {
        if (this.container) {
            parent.addControl(this.container);
        }
    }
    
    /**
     * Обновление значения топлива
     */
    update(current: number, max: number = 100): void {
        this.currentFuel = Math.max(0, Math.min(max, current));
        this.maxFuel = max;
        
        const percent = max > 0 ? (this.currentFuel / this.maxFuel) * 100 : 0;
        
        // Обновляем полосу
        if (this.barFill && this.barBackground) {
            const fillWidth = scalePixels(this.config.width - 4) * (percent / 100);
            this.barFill.width = `${fillWidth}px`;
            
            // Цвет зависит от уровня
            if (percent <= this.config.criticalThreshold) {
                this.barFill.background = HUD_COLORS.FUEL_CRITICAL;
                this.isCritical = true;
                this.isWarning = false;
            } else if (percent <= this.config.warningThreshold) {
                this.barFill.background = HUD_COLORS.FUEL_WARNING;
                this.isWarning = true;
                this.isCritical = false;
            } else {
                this.barFill.background = HUD_COLORS.FUEL_FULL;
                this.isWarning = false;
                this.isCritical = false;
            }
        }
        
        // Обновляем текст
        if (this.text) {
            this.text.text = `${Math.round(percent)}%`;
        }
    }
    
    /**
     * Обновление каждый кадр (для анимаций)
     */
    tick(deltaTime: number): void {
        if (!this.container || !this.barBackground) return;
        
        // Пульсация при низком топливе
        if (this.isCritical) {
            this.pulseTime += deltaTime * 5;
            const pulse = 0.5 + Math.sin(this.pulseTime) * 0.5;
            this.barBackground.alpha = 0.7 + pulse * 0.3;
            
            if (this.icon) {
                this.icon.color = pulse > 0.5 ? HUD_COLORS.DANGER : HUD_COLORS.WARNING;
            }
        } else if (this.isWarning) {
            this.pulseTime += deltaTime * 2;
            const pulse = 0.5 + Math.sin(this.pulseTime) * 0.5;
            this.barBackground.alpha = 0.8 + pulse * 0.2;
        } else {
            this.pulseTime = 0;
            this.barBackground.alpha = 1;
            if (this.icon) {
                this.icon.color = HUD_COLORS.SECONDARY;
            }
        }
    }
    
    /**
     * Получение контейнера
     */
    getContainer(): Rectangle | null {
        return this.container;
    }
    
    /**
     * Установка позиции
     */
    setPosition(left: string, top: string): void {
        if (this.container) {
            this.container.left = left;
            this.container.top = top;
        }
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

