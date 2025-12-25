/**
 * @module hud/components/Crosshair
 * @description Тактический прицел в киберпанк-стиле
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Ellipse } from "@babylonjs/gui";
import { HUD_COLORS, HUD_SIZES } from "../HUDConstants";

/**
 * Конфигурация прицела
 */
export interface CrosshairConfig {
    /** Размер центральной точки */
    centerDotSize: number;
    /** Длина линий прицела */
    lineLength: number;
    /** Толщина линий */
    lineThickness: number;
    /** Отступ от центра */
    gap: number;
    /** Основной цвет */
    color: string;
    /** Цвет свечения */
    glowColor: string;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_CROSSHAIR_CONFIG: CrosshairConfig = {
    centerDotSize: 4,
    lineLength: 15,
    lineThickness: 2,
    gap: 8,
    color: HUD_COLORS.PRIMARY,
    glowColor: HUD_COLORS.ACCENT
};

/**
 * Компонент прицела
 */
export class Crosshair {
    private container: Rectangle;
    private centerDot: Ellipse | null = null;
    private lines: Rectangle[] = [];
    private hitMarker: Rectangle | null = null;
    private hitMarkerLines: Rectangle[] = [];
    private hitMarkerActive: boolean = false;
    private hitMarkerTimer: number = 0;
    private config: CrosshairConfig;
    
    constructor(parent: AdvancedDynamicTexture, config: Partial<CrosshairConfig> = {}) {
        this.config = { ...DEFAULT_CROSSHAIR_CONFIG, ...config };
        
        // Контейнер прицела
        this.container = new Rectangle("crosshairContainer");
        this.container.width = "200px";
        this.container.height = "200px";
        this.container.thickness = 0;
        this.container.background = "transparent";
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        parent.addControl(this.container);
        
        this.createCrosshair();
        this.createHitMarker();
    }
    
    /**
     * Создать элементы прицела
     */
    private createCrosshair(): void {
        const { centerDotSize, lineLength, lineThickness, gap, color, glowColor } = this.config;
        
        // Центральная точка
        this.centerDot = new Ellipse("crosshairDot");
        this.centerDot.width = `${centerDotSize}px`;
        this.centerDot.height = `${centerDotSize}px`;
        this.centerDot.background = color;
        this.centerDot.thickness = 0;
        this.centerDot.shadowColor = glowColor;
        this.centerDot.shadowBlur = 10;
        this.container.addControl(this.centerDot);
        
        // Линии прицела (4 штуки - вверх, вниз, влево, вправо)
        const linePositions = [
            { top: -(gap + lineLength / 2), left: 0, w: lineThickness, h: lineLength }, // up
            { top: gap + lineLength / 2, left: 0, w: lineThickness, h: lineLength }, // down
            { top: 0, left: -(gap + lineLength / 2), w: lineLength, h: lineThickness }, // left
            { top: 0, left: gap + lineLength / 2, w: lineLength, h: lineThickness }  // right
        ];
        
        for (let i = 0; i < linePositions.length; i++) {
            const pos = linePositions[i];
            if (!pos) continue;
            
            const line = new Rectangle(`crosshairLine${i}`);
            line.width = `${pos.w}px`;
            line.height = `${pos.h}px`;
            line.background = color;
            line.thickness = 0;
            line.top = `${pos.top}px`;
            line.left = `${pos.left}px`;
            line.shadowColor = glowColor;
            line.shadowBlur = 5;
            this.container.addControl(line);
            this.lines.push(line);
        }
    }
    
    /**
     * Создать маркер попадания (X)
     */
    private createHitMarker(): void {
        this.hitMarker = new Rectangle("hitMarker");
        this.hitMarker.width = "40px";
        this.hitMarker.height = "40px";
        this.hitMarker.thickness = 0;
        this.hitMarker.background = "transparent";
        this.hitMarker.isVisible = false;
        this.container.addControl(this.hitMarker);
        
        // Создаём X из двух линий
        const hitLineSize = 20;
        const hitLineThickness = 3;
        const hitColor = HUD_COLORS.DANGER;
        
        for (let i = 0; i < 2; i++) {
            const line = new Rectangle(`hitLine${i}`);
            line.width = `${hitLineThickness}px`;
            line.height = `${hitLineSize}px`;
            line.background = hitColor;
            line.thickness = 0;
            line.rotation = i === 0 ? Math.PI / 4 : -Math.PI / 4;
            line.shadowColor = hitColor;
            line.shadowBlur = 10;
            this.hitMarker.addControl(line);
            this.hitMarkerLines.push(line);
        }
    }
    
    /**
     * Показать маркер попадания
     */
    showHitMarker(isCritical: boolean = false): void {
        if (!this.hitMarker) return;
        
        this.hitMarkerActive = true;
        this.hitMarkerTimer = 0.3; // 300ms
        this.hitMarker.isVisible = true;
        this.hitMarker.scaleX = 1.5;
        this.hitMarker.scaleY = 1.5;
        
        // Изменить цвет при критическом попадании
        const color = isCritical ? HUD_COLORS.HEALTH_CRITICAL : HUD_COLORS.DANGER;
        for (const line of this.hitMarkerLines) {
            line.background = color;
            line.shadowColor = color;
        }
    }
    
    /**
     * Обновить прицел
     * @param deltaTime - Время кадра в секундах
     */
    update(deltaTime: number): void {
        // Анимация хит-маркера
        if (this.hitMarkerActive && this.hitMarker) {
            this.hitMarkerTimer -= deltaTime;
            
            if (this.hitMarkerTimer <= 0) {
                this.hitMarkerActive = false;
                this.hitMarker.isVisible = false;
            } else {
                // Плавное уменьшение
                const scale = 1 + this.hitMarkerTimer;
                this.hitMarker.scaleX = scale;
                this.hitMarker.scaleY = scale;
                this.hitMarker.alpha = this.hitMarkerTimer / 0.3;
            }
        }
    }
    
    /**
     * Показать/скрыть прицел
     */
    setVisible(visible: boolean): void {
        this.container.isVisible = visible;
    }
    
    /**
     * Установить цвет прицела
     */
    setColor(color: string, glowColor?: string): void {
        this.config.color = color;
        if (glowColor) this.config.glowColor = glowColor;
        
        if (this.centerDot) {
            this.centerDot.background = color;
            this.centerDot.shadowColor = glowColor ?? color;
        }
        
        for (const line of this.lines) {
            line.background = color;
            line.shadowColor = glowColor ?? color;
        }
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        this.container.dispose();
    }
}

export default Crosshair;

