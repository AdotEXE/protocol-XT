/**
 * @module hud/components/DamageIndicator
 * @description Индикатор урона - показывает направление полученного урона
 */

import { AdvancedDynamicTexture, Rectangle, Control } from "@babylonjs/gui";
import { Vector3 } from "@babylonjs/core";
import { HUD_COLORS } from "../HUDConstants";
import { scalePixels } from "../../utils/uiScale";

/**
 * Конфигурация индикатора урона
 */
export interface DamageIndicatorConfig {
    fadeTime: number;       // Время затухания в мс
    indicatorSize: number;  // Размер индикатора
    indicatorOffset: number; // Расстояние от центра
    maxIndicators: number;  // Максимальное количество индикаторов
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_DAMAGE_CONFIG: DamageIndicatorConfig = {
    fadeTime: 1500,
    indicatorSize: 60,
    indicatorOffset: 150,
    maxIndicators: 8
};

/**
 * Данные о направлении урона
 */
interface DamageDirection {
    angle: number;      // Угол в радианах
    intensity: number;  // Интенсивность (0-1)
    fadeStart: number;  // Время начала затухания
    element: Rectangle; // UI элемент
}

/**
 * DamageIndicator - Индикатор направления урона
 * 
 * Показывает красные индикаторы по краям экрана,
 * указывающие направление полученного урона.
 */
export class DamageIndicator {
    private guiTexture: AdvancedDynamicTexture;
    private config: DamageIndicatorConfig;
    
    // Контейнер для индикаторов
    private container: Rectangle | null = null;
    
    // Активные индикаторы
    private indicators: DamageDirection[] = [];
    
    // Пул индикаторов для переиспользования
    private indicatorPool: Rectangle[] = [];
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<DamageIndicatorConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_DAMAGE_CONFIG, ...config };
        this.create();
    }
    
    /**
     * Создание контейнера
     */
    private create(): void {
        this.container = new Rectangle("damageIndicatorContainer");
        this.container.width = "100%";
        this.container.height = "100%";
        this.container.thickness = 0;
        this.container.isPointerBlocker = false;
        this.guiTexture.addControl(this.container);
        
        // Создаём пул индикаторов
        for (let i = 0; i < this.config.maxIndicators; i++) {
            const indicator = this.createIndicatorElement();
            indicator.isVisible = false;
            this.container.addControl(indicator);
            this.indicatorPool.push(indicator);
        }
    }
    
    /**
     * Создание элемента индикатора
     */
    private createIndicatorElement(): Rectangle {
        const indicator = new Rectangle("damageDir");
        indicator.width = `${scalePixels(this.config.indicatorSize)}px`;
        indicator.height = `${scalePixels(20)}px`;
        indicator.background = HUD_COLORS.DANGER;
        indicator.alpha = 0;
        indicator.thickness = 0;
        indicator.cornerRadius = 4;
        return indicator;
    }
    
    /**
     * Получение индикатора из пула
     */
    private getIndicator(): Rectangle | null {
        for (const indicator of this.indicatorPool) {
            if (!indicator.isVisible) {
                return indicator;
            }
        }
        return null;
    }
    
    /**
     * Показать урон с направления
     * @param direction - вектор направления атаки (от врага к игроку)
     * @param playerForward - направление, куда смотрит игрок
     * @param intensity - интенсивность урона (0-1)
     */
    showDamage(direction: Vector3, playerForward: Vector3, intensity: number = 1): void {
        // Вычисляем угол между направлением атаки и направлением игрока
        const dx = direction.x;
        const dz = direction.z;
        const fx = playerForward.x;
        const fz = playerForward.z;
        
        // Угол атаки в мировых координатах
        const attackAngle = Math.atan2(dx, dz);
        // Угол взгляда игрока
        const playerAngle = Math.atan2(fx, fz);
        // Относительный угол
        let relativeAngle = attackAngle - playerAngle;
        
        // Нормализация угла
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
        
        // Создаём индикатор
        const indicator = this.getIndicator();
        if (!indicator) return;
        
        // Позиционируем индикатор
        const offsetX = Math.sin(relativeAngle) * this.config.indicatorOffset;
        const offsetY = -Math.cos(relativeAngle) * this.config.indicatorOffset;
        
        indicator.left = `${scalePixels(offsetX)}px`;
        indicator.top = `${scalePixels(offsetY)}px`;
        indicator.rotation = relativeAngle;
        indicator.alpha = Math.min(1, intensity);
        indicator.isVisible = true;
        indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        
        // Добавляем в активные
        this.indicators.push({
            angle: relativeAngle,
            intensity: intensity,
            fadeStart: Date.now(),
            element: indicator
        });
    }
    
    /**
     * Показать урон без направления (общий)
     */
    showGeneralDamage(intensity: number = 0.5): void {
        // Показываем индикаторы со всех сторон
        const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        for (const angle of angles) {
            const indicator = this.getIndicator();
            if (!indicator) break;
            
            const offsetX = Math.sin(angle) * this.config.indicatorOffset;
            const offsetY = -Math.cos(angle) * this.config.indicatorOffset;
            
            indicator.left = `${scalePixels(offsetX)}px`;
            indicator.top = `${scalePixels(offsetY)}px`;
            indicator.rotation = angle;
            indicator.alpha = intensity * 0.5;
            indicator.isVisible = true;
            indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            
            this.indicators.push({
                angle: angle,
                intensity: intensity * 0.5,
                fadeStart: Date.now(),
                element: indicator
            });
        }
    }
    
    /**
     * Обновление каждый кадр
     */
    update(deltaTime: number): void {
        const now = Date.now();
        
        // Обновляем затухание индикаторов
        for (let i = this.indicators.length - 1; i >= 0; i--) {
            const indicator = this.indicators[i];
            const elapsed = now - indicator.fadeStart;
            
            if (elapsed >= this.config.fadeTime) {
                // Скрываем и удаляем
                indicator.element.isVisible = false;
                indicator.element.alpha = 0;
                this.indicators.splice(i, 1);
            } else {
                // Затухаем
                const fadeProgress = elapsed / this.config.fadeTime;
                indicator.element.alpha = indicator.intensity * (1 - fadeProgress);
            }
        }
    }
    
    /**
     * Очистить все индикаторы
     */
    clear(): void {
        for (const indicator of this.indicators) {
            indicator.element.isVisible = false;
            indicator.element.alpha = 0;
        }
        this.indicators = [];
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.clear();
        
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
        
        this.indicatorPool = [];
    }
}

