/**
 * @module hud/components/AircraftHUD
 * @description HUD компоненты для самолёта: Aim Circle и Heading Cross
 * 
 * Реализует:
 * - Aim Circle: показывает цель мыши (Mouse-Aim target)
 * - Heading Cross: показывает направление самолёта
 * - Stall warning indicator
 * - G-force indicator
 */

import { AdvancedDynamicTexture, Rectangle, Ellipse, TextBlock, Control, Line } from "@babylonjs/gui";
import { Vector3 } from "@babylonjs/core";
import { scalePixels } from "../../utils/uiScale";

/**
 * Конфигурация Aircraft HUD
 */
export interface AircraftHUDConfig {
    /** Цвет Aim Circle (цель мыши) */
    aimCircleColor: string;
    /** Цвет Heading Cross (направление самолёта) */
    headingCrossColor: string;
    /** Размер Aim Circle */
    aimCircleSize: number;
    /** Размер Heading Cross */
    headingCrossSize: number;
    /** Толщина линий */
    lineThickness: number;
    /** Показывать ли stall warning */
    showStallWarning: boolean;
    /** Показывать ли G-force indicator */
    showGForceIndicator: boolean;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_AIRCRAFT_HUD_CONFIG: AircraftHUDConfig = {
    aimCircleColor: "#00ff00",
    headingCrossColor: "#ffff00",
    aimCircleSize: 40,
    headingCrossSize: 30,
    lineThickness: 2,
    showStallWarning: true,
    showGForceIndicator: true
};

/**
 * Aircraft HUD компонент
 */
export class AircraftHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: AircraftHUDConfig;
    
    // Aim Circle (цель мыши)
    private aimCircle: Ellipse | null = null;
    private aimCircleContainer: Rectangle | null = null;
    
    // Heading Cross (направление самолёта)
    private headingCross: {
        horizontal: Rectangle;
        vertical: Rectangle;
        container: Rectangle;
    } | null = null;
    
    // Stall warning
    private stallWarning: TextBlock | null = null;
    
    // G-force indicator
    private gForceIndicator: TextBlock | null = null;
    
    // Состояние
    private isVisible: boolean = false;
    private aimCircleScreenPos: Vector3 = new Vector3(0.5, 0.5, 0);
    private headingCrossScreenPos: Vector3 = new Vector3(0.5, 0.5, 0);
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<AircraftHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_AIRCRAFT_HUD_CONFIG, ...config };
        
        this.createAimCircle();
        this.createHeadingCross();
        this.createStallWarning();
        this.createGForceIndicator();
        
        this.setVisible(false);
    }
    
    /**
     * Создать Aim Circle (цель мыши)
     */
    private createAimCircle(): void {
        this.aimCircleContainer = new Rectangle("aircraftAimCircleContainer");
        this.aimCircleContainer.width = "100px";
        this.aimCircleContainer.height = "100px";
        this.aimCircleContainer.thickness = 0;
        this.aimCircleContainer.background = "transparent";
        this.aimCircleContainer.isHitTestVisible = false;
        this.guiTexture.addControl(this.aimCircleContainer);
        
        // Внешний круг
        this.aimCircle = new Ellipse("aircraftAimCircle");
        const size = scalePixels(this.config.aimCircleSize);
        this.aimCircle.width = `${size}px`;
        this.aimCircle.height = `${size}px`;
        this.aimCircle.thickness = scalePixels(this.config.lineThickness);
        this.aimCircle.color = this.config.aimCircleColor;
        this.aimCircle.background = "transparent";
        this.aimCircleContainer.addControl(this.aimCircle);
        
        // Центральная точка
        const centerDot = new Ellipse("aircraftAimCircleDot");
        const dotSize = scalePixels(4);
        centerDot.width = `${dotSize}px`;
        centerDot.height = `${dotSize}px`;
        centerDot.thickness = 0;
        centerDot.background = this.config.aimCircleColor;
        this.aimCircleContainer.addControl(centerDot);
    }
    
    /**
     * Создать Heading Cross (направление самолёта)
     */
    private createHeadingCross(): void {
        const container = new Rectangle("aircraftHeadingCrossContainer");
        container.width = "100px";
        container.height = "100px";
        container.thickness = 0;
        container.background = "transparent";
        container.isHitTestVisible = false;
        this.guiTexture.addControl(container);
        
        const crossSize = scalePixels(this.config.headingCrossSize);
        const thickness = scalePixels(this.config.lineThickness);
        
        // Горизонтальная линия
        const horizontal = new Rectangle("aircraftHeadingCrossH");
        horizontal.width = `${crossSize}px`;
        horizontal.height = `${thickness}px`;
        horizontal.thickness = 0;
        horizontal.background = this.config.headingCrossColor;
        horizontal.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        horizontal.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.addControl(horizontal);
        
        // Вертикальная линия
        const vertical = new Rectangle("aircraftHeadingCrossV");
        vertical.width = `${thickness}px`;
        vertical.height = `${crossSize}px`;
        vertical.thickness = 0;
        vertical.background = this.config.headingCrossColor;
        vertical.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        vertical.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.addControl(vertical);
        
        this.headingCross = {
            horizontal,
            vertical,
            container
        };
    }
    
    /**
     * Создать предупреждение о сваливании
     */
    private createStallWarning(): void {
        if (!this.config.showStallWarning) return;
        
        this.stallWarning = new TextBlock("aircraftStallWarning");
        this.stallWarning.text = "STALL!";
        this.stallWarning.fontSize = scalePixels(24);
        this.stallWarning.color = "#ff0000";
        this.stallWarning.fontWeight = "bold";
        this.stallWarning.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.stallWarning.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.stallWarning.top = "100px";
        this.stallWarning.isVisible = false;
        this.guiTexture.addControl(this.stallWarning);
    }
    
    /**
     * Создать индикатор G-force
     */
    private createGForceIndicator(): void {
        if (!this.config.showGForceIndicator) return;
        
        this.gForceIndicator = new TextBlock("aircraftGForceIndicator");
        this.gForceIndicator.text = "G: 1.0";
        this.gForceIndicator.fontSize = scalePixels(18);
        this.gForceIndicator.color = "#ffffff";
        this.gForceIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.gForceIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.gForceIndicator.left = "20px";
        this.gForceIndicator.top = "20px";
        this.gForceIndicator.isVisible = false;
        this.guiTexture.addControl(this.gForceIndicator);
    }
    
    /**
     * Обновить позицию Aim Circle на экране
     * @param screenX X координата (0-1)
     * @param screenY Y координата (0-1)
     */
    updateAimCirclePosition(screenX: number, screenY: number): void {
        this.aimCircleScreenPos.x = Math.max(0, Math.min(1, screenX));
        this.aimCircleScreenPos.y = Math.max(0, Math.min(1, screenY));
        
        if (this.aimCircleContainer) {
            // Преобразуем нормализованные координаты в пиксели
            const engine = this.guiTexture.getScene()?.getEngine();
            if (engine) {
                const width = engine.getRenderWidth();
                const height = engine.getRenderHeight();
                
                const pixelX = this.aimCircleScreenPos.x * width;
                const pixelY = this.aimCircleScreenPos.y * height;
                
                // Устанавливаем позицию через left/top
                this.aimCircleContainer.left = `${pixelX - 50}px`; // -50 для центрирования
                this.aimCircleContainer.top = `${pixelY - 50}px`;
            }
        }
    }
    
    /**
     * Обновить позицию Heading Cross на экране
     * @param screenX X координата (0-1)
     * @param screenY Y координата (0-1)
     */
    updateHeadingCrossPosition(screenX: number, screenY: number): void {
        this.headingCrossScreenPos.x = Math.max(0, Math.min(1, screenX));
        this.headingCrossScreenPos.y = Math.max(0, Math.min(1, screenY));
        
        if (this.headingCross) {
            const engine = this.guiTexture.getScene()?.getEngine();
            if (engine) {
                const width = engine.getRenderWidth();
                const height = engine.getRenderHeight();
                
                const pixelX = this.headingCrossScreenPos.x * width;
                const pixelY = this.headingCrossScreenPos.y * height;
                
                this.headingCross.container.left = `${pixelX - 50}px`;
                this.headingCross.container.top = `${pixelY - 50}px`;
            }
        }
    }
    
    /**
     * Обновить предупреждение о сваливании
     * @param isStalling true если самолёт в сваливании
     */
    updateStallWarning(isStalling: boolean): void {
        if (this.stallWarning) {
            this.stallWarning.isVisible = isStalling && this.isVisible;
            
            // Пульсация при сваливании
            if (isStalling) {
                const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
                this.stallWarning.alpha = pulse;
            } else {
                this.stallWarning.alpha = 1.0;
            }
        }
    }
    
    /**
     * Обновить индикатор G-force
     * @param gForce Текущая перегрузка
     */
    updateGForceIndicator(gForce: number): void {
        if (this.gForceIndicator) {
            this.gForceIndicator.text = `G: ${gForce.toFixed(1)}`;
            
            // Изменяем цвет в зависимости от перегрузки
            if (gForce > 7) {
                this.gForceIndicator.color = "#ff0000"; // Красный при высокой перегрузке
            } else if (gForce > 5) {
                this.gForceIndicator.color = "#ff8800"; // Оранжевый
            } else {
                this.gForceIndicator.color = "#ffffff"; // Белый
            }
        }
    }
    
    /**
     * Показать/скрыть HUD
     */
    setVisible(visible: boolean): void {
        this.isVisible = visible;
        
        if (this.aimCircleContainer) {
            this.aimCircleContainer.isVisible = visible;
        }
        if (this.headingCross) {
            this.headingCross.container.isVisible = visible;
        }
        if (this.stallWarning) {
            this.stallWarning.isVisible = visible && this.stallWarning.isVisible; // Сохраняем состояние stall
        }
        if (this.gForceIndicator) {
            this.gForceIndicator.isVisible = visible;
        }
    }
    
    /**
     * Обновить HUD (вызывается каждый кадр)
     * @param aimCircleScreenPos Позиция Aim Circle на экране (0-1)
     * @param headingCrossScreenPos Позиция Heading Cross на экране (0-1)
     * @param isStalling Флаг сваливания
     * @param gForce Текущая перегрузка
     */
    update(
        aimCircleScreenPos: { x: number; y: number },
        headingCrossScreenPos: { x: number; y: number },
        isStalling: boolean,
        gForce: number
    ): void {
        this.updateAimCirclePosition(aimCircleScreenPos.x, aimCircleScreenPos.y);
        this.updateHeadingCrossPosition(headingCrossScreenPos.x, headingCrossScreenPos.y);
        this.updateStallWarning(isStalling);
        this.updateGForceIndicator(gForce);
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        if (this.aimCircleContainer) {
            this.aimCircleContainer.dispose();
        }
        if (this.headingCross) {
            this.headingCross.container.dispose();
        }
        if (this.stallWarning) {
            this.stallWarning.dispose();
        }
        if (this.gForceIndicator) {
            this.gForceIndicator.dispose();
        }
    }
}



