/**
 * @module hud/components/HUDManager
 * @description Оркестратор компонентов HUD
 */

import { AdvancedDynamicTexture } from "@babylonjs/gui";
import { HUDLayout, type ComponentPosition, type ComponentSize } from "./HUDLayout";
import { HUDThemeManager, DEFAULT_THEME } from "./HUDTheme";
import { logger } from "../../utils/logger";

/**
 * Конфигурация HUD Manager
 */
export interface HUDManagerConfig {
    screenWidth?: number;
    screenHeight?: number;
    theme?: string;
}

/**
 * Компонент HUD с метаданными
 */
interface HUDComponent {
    id: string;
    element: any; // Rectangle или другой GUI элемент
    position: ComponentPosition;
    size?: ComponentSize;
    visible: boolean;
}

/**
 * Менеджер компонентов HUD
 */
export class HUDManager {
    private guiTexture: AdvancedDynamicTexture;
    private layout: HUDLayout;
    private themeManager: HUDThemeManager;
    private components: Map<string, HUDComponent>;
    
    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: HUDManagerConfig = {}
    ) {
        this.guiTexture = guiTexture;
        this.layout = new HUDLayout({
            screenWidth: config.screenWidth,
            screenHeight: config.screenHeight
        });
        this.themeManager = new HUDThemeManager();
        this.components = new Map();
        
        // Устанавливаем тему если указана
        if (config.theme) {
            this.themeManager.setTheme(config.theme);
        }
    }
    
    /**
     * Зарегистрировать компонент
     */
    registerComponent(
        id: string,
        element: any,
        position: ComponentPosition,
        size?: ComponentSize
    ): void {
        this.components.set(id, {
            id,
            element,
            position,
            size,
            visible: true
        });
        
        // Позиционируем компонент
        this.layout.positionComponent(element, position, size);
        
        logger.debug(`[HUDManager] Registered component: ${id}`);
    }
    
    /**
     * Удалить компонент
     */
    unregisterComponent(id: string): void {
        const component = this.components.get(id);
        if (component) {
            component.element.dispose();
            this.components.delete(id);
            logger.debug(`[HUDManager] Unregistered component: ${id}`);
        }
    }
    
    /**
     * Показать компонент
     */
    showComponent(id: string): void {
        const component = this.components.get(id);
        if (component) {
            component.element.isVisible = true;
            component.visible = true;
        }
    }
    
    /**
     * Скрыть компонент
     */
    hideComponent(id: string): void {
        const component = this.components.get(id);
        if (component) {
            component.element.isVisible = false;
            component.visible = false;
        }
    }
    
    /**
     * Получить компонент
     */
    getComponent(id: string): any {
        return this.components.get(id)?.element;
    }
    
    /**
     * Обновить позицию компонента
     */
    updateComponentPosition(id: string, position: ComponentPosition): void {
        const component = this.components.get(id);
        if (component) {
            component.position = position;
            this.layout.positionComponent(component.element, position, component.size);
        }
    }
    
    /**
     * Получить текущую тему
     */
    getTheme(): any {
        return this.themeManager.getCurrentTheme();
    }
    
    /**
     * Установить тему
     */
    setTheme(name: string): boolean {
        return this.themeManager.setTheme(name);
    }
    
    /**
     * Обновить конфигурацию layout
     */
    updateLayoutConfig(config: Partial<{ screenWidth: number; screenHeight: number; safeAreaMargin: number }>): void {
        this.layout.updateConfig(config);
        
        // Перепозиционируем все компоненты
        for (const component of this.components.values()) {
            this.layout.positionComponent(component.element, component.position, component.size);
        }
    }
    
    /**
     * Очистить все компоненты
     */
    dispose(): void {
        for (const component of this.components.values()) {
            component.element.dispose();
        }
        this.components.clear();
        logger.log("[HUDManager] Disposed");
    }
}

