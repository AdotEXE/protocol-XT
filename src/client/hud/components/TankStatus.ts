/**
 * @module hud/components/TankStatus
 * @description Блок статуса танка
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS, HUD_FONTS } from "../HUDConstants";
import { scalePixels } from "../../utils/uiScale";

/**
 * Конфигурация статуса танка
 */
export interface TankStatusConfig {
    width: number;
    height: number;
    showHealth: boolean;
    showFuel: boolean;
    showArmor: boolean;
    showSpeed: boolean;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_TANK_STATUS_CONFIG: TankStatusConfig = {
    width: 140,
    height: 80,
    showHealth: true,
    showFuel: true,
    showArmor: true,
    showSpeed: false
};

/**
 * Данные статуса
 */
export interface TankStatusData {
    health: number;
    maxHealth: number;
    fuel: number;
    maxFuel: number;
    armor: number;
    speed?: number;
}

/**
 * TankStatus - Блок статуса танка
 * 
 * Показывает сводную информацию о состоянии танка.
 */
export class TankStatus {
    private guiTexture: AdvancedDynamicTexture;
    private config: TankStatusConfig;
    
    // Элементы UI
    private container: Rectangle | null = null;
    private healthRow: Rectangle | null = null;
    private healthIcon: TextBlock | null = null;
    private healthText: TextBlock | null = null;
    private fuelRow: Rectangle | null = null;
    private fuelIcon: TextBlock | null = null;
    private fuelText: TextBlock | null = null;
    private armorRow: Rectangle | null = null;
    private armorIcon: TextBlock | null = null;
    private armorText: TextBlock | null = null;
    private speedRow: Rectangle | null = null;
    private speedIcon: TextBlock | null = null;
    private speedText: TextBlock | null = null;
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<TankStatusConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_TANK_STATUS_CONFIG, ...config };
        this.create();
    }
    
    /**
     * Создание UI элементов
     */
    private create(): void {
        // Контейнер
        this.container = new Rectangle("tankStatus");
        this.container.width = `${scalePixels(this.config.width)}px`;
        this.container.height = `${scalePixels(this.config.height)}px`;
        this.container.background = HUD_COLORS.BG_PANEL;
        this.container.thickness = 1;
        this.container.color = HUD_COLORS.SECONDARY + "44";
        this.container.cornerRadius = 4;
        
        let rowIndex = 0;
        const rowHeight = 18;
        const startY = -this.config.height / 2 + 10;
        
        // Здоровье
        if (this.config.showHealth) {
            const result = this.createRow("health", "❤️", startY + rowIndex * rowHeight);
            this.healthRow = result.row;
            this.healthIcon = result.icon;
            this.healthText = result.text;
            rowIndex++;
        }
        
        // Топливо
        if (this.config.showFuel) {
            const result = this.createRow("fuel", "⛽", startY + rowIndex * rowHeight);
            this.fuelRow = result.row;
            this.fuelIcon = result.icon;
            this.fuelText = result.text;
            rowIndex++;
        }
        
        // Броня
        if (this.config.showArmor) {
            const result = this.createRow("armor", "🛡️", startY + rowIndex * rowHeight);
            this.armorRow = result.row;
            this.armorIcon = result.icon;
            this.armorText = result.text;
            rowIndex++;
        }
        
        // Скорость
        if (this.config.showSpeed) {
            const result = this.createRow("speed", "🚗", startY + rowIndex * rowHeight);
            this.speedRow = result.row;
            this.speedIcon = result.icon;
            this.speedText = result.text;
        }
    }
    
    /**
     * Создание строки статуса
     */
    private createRow(name: string, iconText: string, top: number): { row: Rectangle; icon: TextBlock; text: TextBlock } {
        const row = new Rectangle(`${name}Row`);
        row.width = `${scalePixels(this.config.width - 16)}px`;
        row.height = `${scalePixels(16)}px`;
        row.top = `${scalePixels(top)}px`;
        row.thickness = 0;
        row.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container!.addControl(row);
        
        const icon = new TextBlock(`${name}Icon`);
        icon.text = iconText;
        icon.fontSize = scalePixels(11);
        icon.color = HUD_COLORS.SECONDARY;
        icon.left = `${scalePixels(-this.config.width / 2 + 20)}px`;
        icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        row.addControl(icon);
        
        const text = new TextBlock(`${name}Text`);
        text.text = "100%";
        text.fontSize = scalePixels(11);
        text.fontFamily = HUD_FONTS.PRIMARY;
        text.color = HUD_COLORS.PRIMARY;
        text.left = `${scalePixels(20)}px`;
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.addControl(text);
        
        return { row, icon, text };
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
     * Обновление данных
     */
    update(data: TankStatusData): void {
        // Здоровье
        if (this.healthText && this.healthIcon) {
            const healthPercent = data.maxHealth > 0 ? (data.health / data.maxHealth) * 100 : 0;
            this.healthText.text = `${Math.round(healthPercent)}%`;
            
            if (healthPercent <= 25) {
                this.healthText.color = HUD_COLORS.HEALTH_LOW;
                this.healthIcon.color = HUD_COLORS.HEALTH_LOW;
            } else if (healthPercent <= 50) {
                this.healthText.color = HUD_COLORS.HEALTH_MEDIUM;
                this.healthIcon.color = HUD_COLORS.HEALTH_MEDIUM;
            } else {
                this.healthText.color = HUD_COLORS.HEALTH_FULL;
                this.healthIcon.color = HUD_COLORS.SECONDARY;
            }
        }
        
        // Топливо
        if (this.fuelText && this.fuelIcon) {
            const fuelPercent = data.maxFuel > 0 ? (data.fuel / data.maxFuel) * 100 : 0;
            this.fuelText.text = `${Math.round(fuelPercent)}%`;
            
            if (fuelPercent <= 10) {
                this.fuelText.color = HUD_COLORS.FUEL_CRITICAL;
                this.fuelIcon.color = HUD_COLORS.FUEL_CRITICAL;
            } else if (fuelPercent <= 30) {
                this.fuelText.color = HUD_COLORS.FUEL_WARNING;
                this.fuelIcon.color = HUD_COLORS.FUEL_WARNING;
            } else {
                this.fuelText.color = HUD_COLORS.FUEL_FULL;
                this.fuelIcon.color = HUD_COLORS.SECONDARY;
            }
        }
        
        // Броня
        if (this.armorText && this.armorIcon) {
            this.armorText.text = `${Math.round(data.armor)}%`;
            
            if (data.armor <= 25) {
                this.armorText.color = HUD_COLORS.ARMOR_DAMAGED;
                this.armorIcon.color = HUD_COLORS.ARMOR_DAMAGED;
            } else {
                this.armorText.color = HUD_COLORS.ARMOR_FULL;
                this.armorIcon.color = HUD_COLORS.SECONDARY;
            }
        }
        
        // Скорость
        if (this.speedText && data.speed !== undefined) {
            this.speedText.text = `${Math.round(data.speed)} км/ч`;
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
     * Установка выравнивания
     */
    setAlignment(horizontal: number, vertical: number): void {
        if (this.container) {
            this.container.horizontalAlignment = horizontal;
            this.container.verticalAlignment = vertical;
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

