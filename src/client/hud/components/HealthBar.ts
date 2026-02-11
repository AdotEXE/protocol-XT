/**
 * @module hud/components/HealthBar
 * @description Компонент индикатора здоровья
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS, HUD_SIZES } from "../HUDConstants";

/**
 * Конфигурация полосы здоровья
 */
export interface HealthBarConfig {
    width: number;
    height: number;
    backgroundColor: string;
    borderColor: string;
    healthColor: string;
    lowHealthColor: string;
    criticalHealthColor: string;
    showText: boolean;
    showIcon: boolean;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_HEALTHBAR_CONFIG: HealthBarConfig = {
    width: 300,
    height: 24,
    backgroundColor: HUD_COLORS.BG_PANEL,
    borderColor: HUD_COLORS.PRIMARY,
    healthColor: HUD_COLORS.HEALTH_FULL,
    lowHealthColor: HUD_COLORS.HEALTH_MEDIUM,
    criticalHealthColor: HUD_COLORS.HEALTH_CRITICAL,
    showText: true,
    showIcon: true
};

/**
 * Компонент полосы здоровья
 */
export class HealthBar {
    private container: Rectangle;
    private background: Rectangle;
    private fill: Rectangle;
    private healthText: TextBlock | null = null;
    private icon: TextBlock | null = null;
    private config: HealthBarConfig;
    
    private currentHealth: number = 100;
    private maxHealth: number = 100;
    private targetHealth: number = 100;
    
    constructor(parent: AdvancedDynamicTexture | Rectangle, config: Partial<HealthBarConfig> = {}) {
        this.config = { ...DEFAULT_HEALTHBAR_CONFIG, ...config };
        
        // Главный контейнер
        this.container = new Rectangle("healthBarContainer");
        this.container.width = `${this.config.width + 50}px`;
        this.container.height = `${this.config.height + 10}px`;
        this.container.thickness = 0;
        this.container.background = "transparent";
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.left = "20px";
        this.container.top = "-120px";
        
        if (parent instanceof AdvancedDynamicTexture) {
            parent.addControl(this.container);
        } else {
            parent.addControl(this.container);
        }
        
        // Иконка
        if (this.config.showIcon) {
            this.icon = new TextBlock("healthIcon");
            this.icon.text = "❤️";
            this.icon.fontSize = this.config.height - 4;
            this.icon.color = "white";
            this.icon.width = `${this.config.height + 10}px`;
            this.icon.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            this.container.addControl(this.icon);
        }
        
        // Фон полосы
        this.background = new Rectangle("healthBarBg");
        this.background.width = `${this.config.width}px`;
        this.background.height = `${this.config.height}px`;
        this.background.background = this.config.backgroundColor;
        this.background.thickness = 2;
        this.background.color = this.config.borderColor;
        this.background.cornerRadius = 4;
        this.background.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.background.left = this.config.showIcon ? `${this.config.height + 15}px` : "0px";
        this.container.addControl(this.background);
        
        // Заполнение полосы
        this.fill = new Rectangle("healthBarFill");
        this.fill.width = "100%";
        this.fill.height = "100%";
        this.fill.background = this.config.healthColor;
        this.fill.thickness = 0;
        this.fill.cornerRadius = 2;
        this.fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.background.addControl(this.fill);
        
        // Текст здоровья
        if (this.config.showText) {
            this.healthText = new TextBlock("healthText");
            this.healthText.text = "100/100";
            this.healthText.fontSize = 14;
            this.healthText.color = "white";
            this.healthText.fontFamily = "'Press Start 2P', monospace";
            this.healthText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.healthText.shadowColor = "black";
            this.healthText.shadowOffsetX = 1;
            this.healthText.shadowOffsetY = 1;
            this.background.addControl(this.healthText);
        }
    }
    
    /**
     * Обновить здоровье
     * @param current - Текущее здоровье
     * @param max - Максимальное здоровье
     */
    setHealth(current: number, max: number): void {
        this.currentHealth = Math.max(0, current);
        this.maxHealth = max;
        this.targetHealth = this.currentHealth;
        
        const percent = (this.currentHealth / this.maxHealth) * 100;
        
        // Обновить ширину заполнения
        this.fill.width = `${percent}%`;
        
        // Обновить цвет в зависимости от уровня здоровья
        if (percent <= 20) {
            this.fill.background = this.config.criticalHealthColor;
        } else if (percent <= 50) {
            this.fill.background = this.config.lowHealthColor;
        } else {
            this.fill.background = this.config.healthColor;
        }
        
        // Обновить текст
        if (this.healthText) {
            this.healthText.text = `${Math.round(this.currentHealth)}/${Math.round(this.maxHealth)}`;
        }
    }
    
    /**
     * Анимировать изменение здоровья
     * @param deltaTime - Время кадра
     */
    update(deltaTime: number): void {
        // Плавная интерполяция к целевому значению
        if (Math.abs(this.currentHealth - this.targetHealth) > 0.1) {
            const speed = 5;
            this.currentHealth += (this.targetHealth - this.currentHealth) * speed * deltaTime;
            
            const percent = (this.currentHealth / this.maxHealth) * 100;
            this.fill.width = `${percent}%`;
        }
    }
    
    /**
     * Показать/скрыть
     */
    setVisible(visible: boolean): void {
        this.container.isVisible = visible;
    }
    
    /**
     * Получить текущее здоровье в процентах
     */
    getHealthPercent(): number {
        return (this.currentHealth / this.maxHealth) * 100;
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.container.dispose();
    }
}

export default HealthBar;

