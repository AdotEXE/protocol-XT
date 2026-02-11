/**
 * @module hud/components/DamageIndicator
 * @description Индикатор урона - показывает направление полученного урона (шеврон)
 */

import { AdvancedDynamicTexture, Rectangle, Control, Image } from "@babylonjs/gui";
import { Vector3 } from "@babylonjs/core";
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
    fadeTime: 2500, // 2.5 seconds active duration
    indicatorSize: 64,
    indicatorOffset: 150,
    maxIndicators: 10
};

/**
 * Данные о направлении урона
 */
interface DamageDirection {
    sourcePosition: Vector3 | null; // Null for general damage
    angle: number;      // Current angle (cached)
    intensity: number;
    fadeStart: number;
    element: Control;
}

// Chevron SVG: Arrow pointing UP. (Used for rotation 0 being UP)
const CHEVRON_SVG = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMzAgNSBMNTUgNTUgTDMwIDQwIEw1IDU1IFoiIGZpbGw9IiNGRjAwMDAiIHN0cm9rZT0iIzhBMDAwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+";

/**
 * DamageIndicator - Индикатор направления урона
 * 
 * Показывает красные шевроны по краям экрана,
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
    private indicatorPool: Control[] = [];

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
     * Создание элемента индикатора (Image Chevron)
     */
    private createIndicatorElement(): Control {
        const indicator = new Image("damageChevron", CHEVRON_SVG);
        indicator.width = `${scalePixels(this.config.indicatorSize)}px`;
        indicator.height = `${scalePixels(this.config.indicatorSize)}px`;
        indicator.stretch = Image.STRETCH_UNIFORM;
        indicator.alpha = 0;
        indicator.isPointerBlocker = false;
        return indicator;
    }

    /**
     * Получение индикатора из пула
     */
    private getIndicator(): Control | null {
        for (const indicator of this.indicatorPool) {
            if (!indicator.isVisible) {
                return indicator;
            }
        }
        return null;
    }

    /**
     * Показать урон от источника
     * @param sourcePosition - абсолютная позиция источника урона
     * @param intensity - интенсивность
     */
    showDamage(sourcePosition: Vector3, intensity: number = 1): void {
        const indicator = this.getIndicator();
        if (!indicator) return;

        // Initial setup (position will be updated in update())
        indicator.alpha = Math.min(1, intensity);
        indicator.isVisible = true;
        indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

        this.indicators.push({
            sourcePosition: sourcePosition.clone(),
            angle: 0,
            intensity: intensity,
            fadeStart: Date.now(),
            element: indicator
        });
    }

    /**
     * Показать урон без направления (общий) - просто 4 шеврона
     */
    showGeneralDamage(intensity: number = 0.5): void {
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
                sourcePosition: null, // General damage has no source
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
    update(deltaTime: number, playerPos?: Vector3, playerForward?: Vector3): void {
        const now = Date.now();

        // Обновляем затухание индикаторов
        for (let i = this.indicators.length - 1; i >= 0; i--) {
            const indicator = this.indicators[i];
            if (!indicator) continue;

            const elapsed = now - indicator.fadeStart;

            if (elapsed >= this.config.fadeTime) {
                // Скрываем и удаляем
                indicator.element.isVisible = false;
                indicator.element.alpha = 0;
                this.indicators.splice(i, 1);
            } else {
                // Затухание
                const fadeProgress = elapsed / this.config.fadeTime;
                indicator.element.alpha = indicator.intensity * (1 - fadeProgress);

                // COMPASS UPDATE: Пересчитываем позицию если есть данные игрока
                if (playerPos && playerForward && indicator.sourcePosition) {
                    // Вектор на источник
                    const dx = indicator.sourcePosition.x - playerPos.x;
                    const dz = indicator.sourcePosition.z - playerPos.z;

                    // Угол на источник
                    const attackAngle = Math.atan2(dx, dz);
                    // Угол игрока
                    const playerAngle = Math.atan2(playerForward.x, playerForward.z);

                    let relativeAngle = attackAngle - playerAngle;

                    // Нормализация
                    while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
                    while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;

                    // Позиционирование
                    const offsetX = Math.sin(relativeAngle) * this.config.indicatorOffset;
                    const offsetY = -Math.cos(relativeAngle) * this.config.indicatorOffset;

                    indicator.element.left = `${scalePixels(offsetX)}px`;
                    indicator.element.top = `${scalePixels(offsetY)}px`;
                    indicator.element.rotation = relativeAngle;

                    indicator.angle = relativeAngle;
                }
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
