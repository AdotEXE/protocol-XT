/**
 * @module hud/components/ScreenFlashEffect
 * @description Градиентная вспышка экрана при получении урона
 */

import { AdvancedDynamicTexture, Rectangle, Control } from "@babylonjs/gui";
import { EFFECTS_CONFIG } from "../../effects/EffectsConfig";
import { scalePixels } from "../../utils/uiScale";

/**
 * Направление вспышки
 */
export type FlashDirection = "top" | "right" | "bottom" | "left";

/**
 * Конфигурация вспышки
 */
export interface ScreenFlashConfig {
    duration: number;
    appearDuration: number;
    fadeDuration: number;
    maxAlpha: number;
    color: string;
    gradientSteps: number;
}

/**
 * Конфигурация по умолчанию
 */
const DEFAULT_CONFIG: ScreenFlashConfig = {
    duration: EFFECTS_CONFIG.screenFlash.duration,
    appearDuration: EFFECTS_CONFIG.screenFlash.appearDuration,
    fadeDuration: EFFECTS_CONFIG.screenFlash.fadeDuration,
    maxAlpha: EFFECTS_CONFIG.screenFlash.maxAlpha,
    color: EFFECTS_CONFIG.screenFlash.color,
    gradientSteps: EFFECTS_CONFIG.screenFlash.gradientSteps
};

/**
 * Данные активной вспышки
 */
interface ActiveFlash {
    direction: FlashDirection;
    intensity: number;
    startTime: number;
    rectangles: Rectangle[];
}

/**
 * ScreenFlashEffect - Градиентная вспышка экрана
 * 
 * Показывает градиентную красную вспышку по краю экрана
 * в направлении полученного урона.
 */
export class ScreenFlashEffect {
    private guiTexture: AdvancedDynamicTexture;
    private config: ScreenFlashConfig;
    
    // Контейнер для вспышек
    private container: Rectangle | null = null;
    
    // Пул прямоугольников для градиента (4 направления × 3 шага = 12 прямоугольников)
    private rectanglePools: Map<FlashDirection, Rectangle[]> = new Map();
    
    // Активная вспышка
    private activeFlash: ActiveFlash | null = null;
    
    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<ScreenFlashConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }
    
    /**
     * Создание контейнера и пула прямоугольников
     */
    private create(): void {
        // Контейнер на весь экран
        this.container = new Rectangle("screenFlashContainer");
        this.container.width = "100%";
        this.container.height = "100%";
        this.container.thickness = 0;
        this.container.isPointerBlocker = false;
        this.guiTexture.addControl(this.container);
        
        // Создаём пулы прямоугольников для каждого направления
        const directions: FlashDirection[] = ["top", "right", "bottom", "left"];
        for (const direction of directions) {
            const pool: Rectangle[] = [];
            for (let i = 0; i < this.config.gradientSteps; i++) {
                const rect = this.createGradientRect(direction, i);
                rect.isVisible = false;
                rect.alpha = 0;
                this.container.addControl(rect);
                pool.push(rect);
            }
            this.rectanglePools.set(direction, pool);
        }
    }
    
    /**
     * Создание прямоугольника градиента
     * ИЗМЕНЕНО: Вспышка только по краям экрана (15% от края), не на весь экран
     */
    private createGradientRect(direction: FlashDirection, step: number): Rectangle {
        const rect = new Rectangle(`flash_${direction}_${step}`);
        rect.thickness = 0;
        rect.background = this.config.color;
        rect.cornerRadius = 0;
        
        // ИЗМЕНЕНО: Фиксированный небольшой размер - только по краям экрана
        // Каждый шаг градиента занимает 5% экрана, максимум 15% при 3 шагах
        const stepSize = 5; // Фиксированный размер шага (5% экрана)
        
        switch (direction) {
            case "top":
                rect.width = "100%";
                rect.height = `${stepSize}%`;
                rect.top = `${step * stepSize}%`; // Исправлено: положительное смещение от края
                rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                break;
            case "bottom":
                rect.width = "100%";
                rect.height = `${stepSize}%`;
                rect.top = `${-step * stepSize}%`; // Исправлено: отрицательное смещение от края
                rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
                break;
            case "left":
                rect.width = `${stepSize}%`;
                rect.height = "100%";
                rect.left = `${step * stepSize}%`; // Исправлено: положительное смещение от края
                rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                break;
            case "right":
                rect.width = `${stepSize}%`;
                rect.height = "100%";
                rect.left = `${-step * stepSize}%`; // Исправлено: отрицательное смещение от края
                rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
                break;
        }
        
        return rect;
    }
    
    /**
     * Показать вспышку
     */
    flash(direction: FlashDirection, intensity: number = 1): void {
        // Если уже есть активная вспышка, обновляем её
        if (this.activeFlash && this.activeFlash.direction === direction) {
            this.activeFlash.intensity = Math.max(this.activeFlash.intensity, intensity);
            this.activeFlash.startTime = Date.now();
            return;
        }
        
        // Скрываем предыдущую вспышку если есть
        if (this.activeFlash) {
            this.hideFlash(this.activeFlash);
        }
        
        // Получаем прямоугольники для направления
        const rectangles = this.rectanglePools.get(direction);
        if (!rectangles) return;
        
        // Показываем прямоугольники
        for (const rect of rectangles) {
            rect.isVisible = true;
        }
        
        // Создаём активную вспышку
        this.activeFlash = {
            direction,
            intensity: Math.max(0, Math.min(1, intensity)),
            startTime: Date.now(),
            rectangles
        };
        
        // Запускаем анимацию
        this.animateFlash();
    }
    
    /**
     * Анимация вспышки (вызывается из update())
     */
    private animateFlash(): void {
        if (!this.activeFlash) return;
        
        const now = Date.now();
        const elapsed = now - this.activeFlash.startTime;
        const { intensity, rectangles } = this.activeFlash;
        
        if (elapsed < this.config.appearDuration) {
            // Фаза 1: Быстрое появление (0 → maxAlpha)
            const appearProgress = elapsed / this.config.appearDuration;
            const appearCurve = EFFECTS_CONFIG.screenFlash.appearCurve;
            const baseAlpha = appearCurve(appearProgress) * this.config.maxAlpha * intensity;
            
            // УЛУЧШЕНО: Применяем градиент: ближе к краю - ярче
            // Первый прямоугольник (край) - 100%, второй - 70%, третий - 40%
            for (let i = 0; i < rectangles.length; i++) {
                const rect = rectangles[i];
                if (!rect) continue; // Защита от undefined
                const gradientFactor = 1 - (i * 0.3); // Каждый шаг на 30% темнее
                const stepAlpha = baseAlpha * gradientFactor;
                rect.alpha = Math.max(0, Math.min(1, stepAlpha));
            }
        } else if (elapsed < this.config.duration) {
            // Фаза 2: Плавное затухание (maxAlpha → 0)
            const fadeElapsed = elapsed - this.config.appearDuration;
            const fadeProgress = fadeElapsed / this.config.fadeDuration;
            const fadeCurve = EFFECTS_CONFIG.screenFlash.fadeCurve;
            const baseAlpha = (1 - fadeCurve(fadeProgress)) * this.config.maxAlpha * intensity;
            
            // УЛУЧШЕНО: Применяем градиент с затуханием
            for (let i = 0; i < rectangles.length; i++) {
                const rect = rectangles[i];
                if (!rect) continue; // Защита от undefined
                const gradientFactor = 1 - (i * 0.3);
                const stepAlpha = baseAlpha * gradientFactor;
                rect.alpha = Math.max(0, Math.min(1, stepAlpha));
            }
        } else {
            // Завершение - скрываем
            this.hideFlash(this.activeFlash);
            this.activeFlash = null;
            return;
        }
    }
    
    /**
     * Скрыть вспышку
     */
    private hideFlash(flash: ActiveFlash): void {
        for (const rect of flash.rectangles) {
            rect.isVisible = false;
            rect.alpha = 0;
        }
    }
    
    /**
     * Обновление (вызывается каждый кадр)
     */
    update(): void {
        if (this.activeFlash) {
            this.animateFlash();
        }
    }
    
    /**
     * Очистить все вспышки
     */
    clear(): void {
        if (this.activeFlash) {
            this.hideFlash(this.activeFlash);
            this.activeFlash = null;
        }
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
        
        this.rectanglePools.clear();
    }
}

