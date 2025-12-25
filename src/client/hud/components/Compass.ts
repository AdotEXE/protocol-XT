/**
 * @module hud/components/Compass
 * @description Компонент компаса
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS } from "../HUDConstants";

/**
 * Конфигурация компаса
 */
export interface CompassConfig {
    /** Ширина компаса */
    width: number;
    /** Высота компаса */
    height: number;
    /** Показывать ли буквенные обозначения */
    showCardinals: boolean;
    /** Показывать ли градусы */
    showDegrees: boolean;
    /** Шаг меток (градусы) */
    tickInterval: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_COMPASS_CONFIG: CompassConfig = {
    width: 300,
    height: 30,
    showCardinals: true,
    showDegrees: true,
    tickInterval: 15
};

/**
 * Направления компаса
 */
const CARDINAL_DIRECTIONS = [
    { angle: 0, label: "N", color: HUD_COLORS.DANGER },
    { angle: 45, label: "NE", color: HUD_COLORS.PRIMARY },
    { angle: 90, label: "E", color: HUD_COLORS.PRIMARY },
    { angle: 135, label: "SE", color: HUD_COLORS.PRIMARY },
    { angle: 180, label: "S", color: HUD_COLORS.PRIMARY },
    { angle: 225, label: "SW", color: HUD_COLORS.PRIMARY },
    { angle: 270, label: "W", color: HUD_COLORS.PRIMARY },
    { angle: 315, label: "NW", color: HUD_COLORS.PRIMARY }
];

/**
 * Компонент компаса
 */
export class Compass {
    private container: Rectangle;
    private tickContainer: Rectangle;
    private centerIndicator: Rectangle;
    private degreeText: TextBlock | null = null;
    private ticks: Rectangle[] = [];
    private cardinalLabels: TextBlock[] = [];
    private config: CompassConfig;
    
    private currentAngle: number = 0;
    
    constructor(parent: AdvancedDynamicTexture, config: Partial<CompassConfig> = {}) {
        this.config = { ...DEFAULT_COMPASS_CONFIG, ...config };
        
        // Контейнер компаса
        this.container = new Rectangle("compassContainer");
        this.container.width = `${this.config.width}px`;
        this.container.height = `${this.config.height}px`;
        this.container.thickness = 0;
        this.container.background = "rgba(0, 0, 0, 0.5)";
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = "10px";
        parent.addControl(this.container);
        
        // Контейнер для меток (обрезается)
        this.tickContainer = new Rectangle("tickContainer");
        this.tickContainer.width = `${this.config.width - 10}px`;
        this.tickContainer.height = `${this.config.height - 6}px`;
        this.tickContainer.thickness = 0;
        this.tickContainer.background = "transparent";
        this.tickContainer.clipChildren = true;
        this.container.addControl(this.tickContainer);
        
        // Создать метки
        this.createTicks();
        
        // Центральный индикатор
        this.centerIndicator = new Rectangle("compassCenter");
        this.centerIndicator.width = "2px";
        this.centerIndicator.height = `${this.config.height}px`;
        this.centerIndicator.background = HUD_COLORS.PRIMARY;
        this.centerIndicator.thickness = 0;
        this.centerIndicator.shadowColor = HUD_COLORS.PRIMARY;
        this.centerIndicator.shadowBlur = 5;
        this.container.addControl(this.centerIndicator);
        
        // Текст градусов
        if (this.config.showDegrees) {
            this.degreeText = new TextBlock("degreeText");
            this.degreeText.text = "0°";
            this.degreeText.fontSize = 12;
            this.degreeText.color = HUD_COLORS.PRIMARY;
            this.degreeText.fontFamily = "'Consolas', monospace";
            this.degreeText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            this.degreeText.top = "15px";
            this.container.addControl(this.degreeText);
        }
    }
    
    /**
     * Создать метки компаса
     */
    private createTicks(): void {
        const tickWidth = this.config.width * 2; // Расширенная область для скроллинга
        const tickSpacing = tickWidth / 360 * this.config.tickInterval;
        
        for (let angle = 0; angle < 360; angle += this.config.tickInterval) {
            // Основная метка
            const tick = new Rectangle(`tick_${angle}`);
            tick.width = "1px";
            tick.height = angle % 90 === 0 ? "15px" : angle % 45 === 0 ? "10px" : "6px";
            tick.background = angle === 0 ? HUD_COLORS.DANGER : HUD_COLORS.PRIMARY;
            tick.thickness = 0;
            tick.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.tickContainer.addControl(tick);
            this.ticks.push(tick);
            
            // Буквенные обозначения
            if (this.config.showCardinals && angle % 45 === 0) {
                const cardinal = CARDINAL_DIRECTIONS.find(c => c.angle === angle);
                if (cardinal) {
                    const label = new TextBlock(`cardinal_${angle}`);
                    label.text = cardinal.label;
                    label.fontSize = 10;
                    label.color = cardinal.color;
                    label.fontFamily = "'Consolas', monospace";
                    label.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
                    label.top = "-2px";
                    this.tickContainer.addControl(label);
                    this.cardinalLabels.push(label);
                }
            }
        }
    }
    
    /**
     * Установить направление компаса
     * @param angle - Угол в градусах (0 = север)
     */
    setAngle(angle: number): void {
        this.currentAngle = ((angle % 360) + 360) % 360;
        
        // Обновить позиции меток
        const containerWidth = this.config.width - 10;
        const pixelsPerDegree = containerWidth / 60; // 60 градусов видимо
        
        let tickIndex = 0;
        let labelIndex = 0;
        
        for (let a = 0; a < 360; a += this.config.tickInterval) {
            // Вычислить относительный угол
            let relAngle = a - this.currentAngle;
            if (relAngle > 180) relAngle -= 360;
            if (relAngle < -180) relAngle += 360;
            
            const x = relAngle * pixelsPerDegree;
            
            const tick = this.ticks[tickIndex];
            if (tick) {
                tick.left = `${x}px`;
                tick.isVisible = Math.abs(relAngle) <= 30;
            }
            tickIndex++;
            
            // Обновить буквенные метки
            if (this.config.showCardinals && a % 45 === 0) {
                const label = this.cardinalLabels[labelIndex];
                if (label) {
                    label.left = `${x}px`;
                    label.isVisible = Math.abs(relAngle) <= 30;
                }
                labelIndex++;
            }
        }
        
        // Обновить текст градусов
        if (this.degreeText) {
            this.degreeText.text = `${Math.round(this.currentAngle)}°`;
        }
    }
    
    /**
     * Получить текущий угол
     */
    getAngle(): number {
        return this.currentAngle;
    }
    
    /**
     * Показать/скрыть
     */
    setVisible(visible: boolean): void {
        this.container.isVisible = visible;
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.container.dispose();
    }
}

export default Compass;

