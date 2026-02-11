/**
 * @module hud/components/TargetIndicator
 * @description Индикатор цели - показывает информацию о выбранном враге
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS, HUD_FONTS, HUD_SIZES } from "../HUDConstants";
import { scalePixels } from "../../utils/uiScale";

/**
 * Конфигурация индикатора цели
 */
export interface TargetIndicatorConfig {
    width: number;
    height: number;
    top: number;
    showDistance: boolean;
    showHealth: boolean;
    showName: boolean;
    fadeOutTime: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_TARGET_CONFIG: TargetIndicatorConfig = {
    width: 180,
    height: 60,
    top: 50,
    showDistance: true,
    showHealth: true,
    showName: true,
    fadeOutTime: 3000
};

/**
 * Данные о цели
 */
export interface TargetData {
    name: string;
    health: number;
    maxHealth: number;
    distance: number;
}

/**
 * TargetIndicator - Индикатор цели
 * 
 * Показывает информацию о выбранном враге:
 * - Имя
 * - Полоса здоровья
 * - Дистанция
 */
export class TargetIndicator {
    private guiTexture: AdvancedDynamicTexture;
    private config: TargetIndicatorConfig;
    
    // Элементы UI
    private container: Rectangle | null = null;
    private nameText: TextBlock | null = null;
    private healthBar: Rectangle | null = null;
    private healthFill: Rectangle | null = null;
    private healthText: TextBlock | null = null;
    private distanceText: TextBlock | null = null;
    
    // Состояние
    private visible = false;
    private fadeTimer = 0;
    private lastTargetId: string | null = null;
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<TargetIndicatorConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_TARGET_CONFIG, ...config };
        this.create();
    }
    
    /**
     * Создание UI элементов
     */
    private create(): void {
        // Контейнер
        this.container = new Rectangle("targetIndicator");
        this.container.width = `${scalePixels(this.config.width)}px`;
        this.container.height = `${scalePixels(this.config.height)}px`;
        this.container.top = `${scalePixels(this.config.top)}px`;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.background = HUD_COLORS.BG_PANEL;
        this.container.cornerRadius = 4;
        this.container.thickness = 1;
        this.container.color = HUD_COLORS.ACCENT;
        this.container.isVisible = false;
        this.guiTexture.addControl(this.container);
        
        if (this.config.showName) {
            // Имя цели
            this.nameText = new TextBlock("targetName");
            this.nameText.text = "TARGET";
            this.nameText.color = HUD_COLORS.DANGER;
            this.nameText.fontSize = scalePixels(12);
            this.nameText.fontFamily = HUD_FONTS.PRIMARY;
            this.nameText.top = `${scalePixels(-18)}px`;
            this.nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            this.container.addControl(this.nameText);
        }
        
        if (this.config.showHealth) {
            // Полоса здоровья
            this.healthBar = new Rectangle("targetHealthBar");
            this.healthBar.width = `${scalePixels(140)}px`;
            this.healthBar.height = `${scalePixels(8)}px`;
            this.healthBar.top = `${scalePixels(2)}px`;
            this.healthBar.background = HUD_COLORS.BG_DARK;
            this.healthBar.thickness = 0;
            this.healthBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            this.container.addControl(this.healthBar);
            
            // Заполнение здоровья
            this.healthFill = new Rectangle("targetHealthFill");
            this.healthFill.width = "100%";
            this.healthFill.height = "100%";
            this.healthFill.background = HUD_COLORS.DANGER;
            this.healthFill.thickness = 0;
            this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            this.healthBar.addControl(this.healthFill);
            
            // Текст здоровья
            this.healthText = new TextBlock("targetHealthText");
            this.healthText.text = "100%";
            this.healthText.color = HUD_COLORS.PRIMARY;
            this.healthText.fontSize = scalePixels(10);
            this.healthText.fontFamily = HUD_FONTS.PRIMARY;
            this.healthText.top = `${scalePixels(16)}px`;
            this.healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            this.container.addControl(this.healthText);
        }
        
        if (this.config.showDistance) {
            // Дистанция
            this.distanceText = new TextBlock("targetDistance");
            this.distanceText.text = "0m";
            this.distanceText.color = HUD_COLORS.SECONDARY;
            this.distanceText.fontSize = scalePixels(10);
            this.distanceText.fontFamily = HUD_FONTS.PRIMARY;
            this.distanceText.left = `${scalePixels(60)}px`;
            this.distanceText.top = `${scalePixels(16)}px`;
            this.distanceText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            this.container.addControl(this.distanceText);
        }
    }
    
    /**
     * Обновление цели
     */
    update(target: TargetData | null, targetId: string | null = null): void {
        if (!target) {
            this.hide();
            return;
        }
        
        // Показываем индикатор
        this.show();
        
        // Обновляем таймер если цель та же
        if (targetId === this.lastTargetId) {
            this.fadeTimer = Date.now();
        } else {
            this.lastTargetId = targetId;
            this.fadeTimer = Date.now();
        }
        
        // Обновляем имя
        if (this.nameText) {
            this.nameText.text = target.name;
        }
        
        // Обновляем здоровье
        if (this.healthFill && this.healthText) {
            const healthPercent = Math.max(0, Math.min(100, (target.health / target.maxHealth) * 100));
            this.healthFill.width = `${healthPercent}%`;
            this.healthText.text = `${Math.round(healthPercent)}%`;
            
            // Цвет зависит от здоровья
            if (healthPercent > 50) {
                this.healthFill.background = HUD_COLORS.HEALTH_FULL;
            } else if (healthPercent > 25) {
                this.healthFill.background = HUD_COLORS.HEALTH_MEDIUM;
            } else {
                this.healthFill.background = HUD_COLORS.HEALTH_LOW;
            }
        }
        
        // Обновляем дистанцию
        if (this.distanceText) {
            this.distanceText.text = `${Math.round(target.distance)}m`;
        }
    }
    
    /**
     * Обновление каждый кадр (для fade out)
     */
    tick(): void {
        if (!this.visible) return;
        
        const now = Date.now();
        const elapsed = now - this.fadeTimer;
        
        if (elapsed > this.config.fadeOutTime) {
            this.hide();
        } else if (elapsed > this.config.fadeOutTime * 0.7 && this.container) {
            // Начинаем затухание
            const fadeProgress = (elapsed - this.config.fadeOutTime * 0.7) / (this.config.fadeOutTime * 0.3);
            this.container.alpha = 1 - fadeProgress;
        }
    }
    
    /**
     * Показать индикатор
     */
    show(): void {
        if (this.container) {
            this.container.isVisible = true;
            this.container.alpha = 1;
            this.visible = true;
            this.fadeTimer = Date.now();
        }
    }
    
    /**
     * Скрыть индикатор
     */
    hide(): void {
        if (this.container) {
            this.container.isVisible = false;
            this.visible = false;
            this.lastTargetId = null;
        }
    }
    
    /**
     * Проверка видимости
     */
    isVisible(): boolean {
        return this.visible;
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
        this.nameText = null;
        this.healthBar = null;
        this.healthFill = null;
        this.healthText = null;
        this.distanceText = null;
    }
}

