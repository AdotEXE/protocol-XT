/**
 * @module hud/components/HUDLayout
 * @description Система позиционирования компонентов HUD
 */

import { Control, Rectangle } from "@babylonjs/gui";
import { scalePixels } from "../../utils/uiScale";

/**
 * Позиция компонента на экране
 */
export interface ComponentPosition {
    horizontal: "left" | "center" | "right";
    vertical: "top" | "center" | "bottom";
    offsetX: number;
    offsetY: number;
}

/**
 * Размер компонента
 */
export interface ComponentSize {
    width: number;
    height: number;
}

/**
 * Конфигурация позиционирования
 */
export interface LayoutConfig {
    screenWidth: number;
    screenHeight: number;
    safeAreaMargin: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
    screenWidth: 1920,
    screenHeight: 1080,
    safeAreaMargin: 20
};

/**
 * Менеджер позиционирования компонентов HUD
 */
export class HUDLayout {
    private config: LayoutConfig;
    
    constructor(config: Partial<LayoutConfig> = {}) {
        this.config = { ...DEFAULT_LAYOUT_CONFIG, ...config };
    }
    
    /**
     * Позиционировать компонент
     */
    positionComponent(
        component: Rectangle,
        position: ComponentPosition,
        size?: ComponentSize
    ): void {
        const { horizontal, vertical, offsetX, offsetY } = position;
        
        // Устанавливаем размер если указан
        if (size) {
            component.widthInPixels = scalePixels(size.width);
            component.heightInPixels = scalePixels(size.height);
        }
        
        // Горизонтальное позиционирование
        switch (horizontal) {
            case "left":
                component.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                component.leftInPixels = scalePixels(offsetX + this.config.safeAreaMargin);
                break;
            case "center":
                component.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                component.leftInPixels = scalePixels(offsetX);
                break;
            case "right":
                component.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                // При RIGHT alignment, leftInPixels работает как отступ справа (отрицательное значение)
                component.leftInPixels = -scalePixels(offsetX + this.config.safeAreaMargin);
                break;
        }
        
        // Вертикальное позиционирование
        switch (vertical) {
            case "top":
                component.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                component.topInPixels = scalePixels(offsetY + this.config.safeAreaMargin);
                break;
            case "center":
                component.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                component.topInPixels = scalePixels(offsetY);
                break;
            case "bottom":
                component.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
                // При BOTTOM alignment, topInPixels работает как отступ снизу (отрицательное значение)
                component.topInPixels = -scalePixels(offsetY + this.config.safeAreaMargin);
                break;
        }
    }
    
    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<LayoutConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

