/**
 * @module mobile/FreeLookZone
 * @description Зона свободного обзора камеры без поворота башни
 * 
 * Позволяет осматриваться, не сбивая наведение орудия.
 * Активируется в верхней центральной части экрана.
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    Control,
    TextBlock
} from "@babylonjs/gui";
import { getMobileScale } from "./MobileDetection";
import { getHapticFeedback } from "./HapticFeedback";

/**
 * Конфигурация зоны свободного обзора
 */
export interface FreeLookConfig {
    zoneTop: number;        // Верхняя граница зоны (0% = верх экрана)
    zoneBottom: number;     // Нижняя граница зоны (30% = 30% от верха)
    zoneLeft: number;       // Левая граница зоны (30% = 30% от левого края)
    zoneRight: number;      // Правая граница зоны (70% = 70% от левого края)
    sensitivity: number;     // Чувствительность (0.003, как у мыши)
    showIndicator: boolean;  // Показывать ли индикатор
    indicatorColor: string; // Цвет индикатора
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_FREE_LOOK_CONFIG: FreeLookConfig = {
    zoneTop: 0,
    zoneBottom: 30,
    zoneLeft: 30,
    zoneRight: 70,
    sensitivity: 0.003,
    showIndicator: true,
    indicatorColor: "#00ffaa"
};

/**
 * Зона свободного обзора
 */
export class FreeLookZone {
    private guiTexture: AdvancedDynamicTexture;
    private config: FreeLookConfig;
    private scale: number;

    // UI элементы
    private indicator: Rectangle | null = null;
    private indicatorText: TextBlock | null = null;

    // Состояние
    private isActive: boolean = false;
    private pointerId: number | null = null;
    private lastX: number = 0;
    private lastY: number = 0;
    private deltaX: number = 0;
    private deltaY: number = 0;

    // Callbacks
    private onFreeLookChange: ((deltaX: number, deltaY: number) => void) | null = null;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<FreeLookConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scale = getMobileScale();
        this.config = { ...DEFAULT_FREE_LOOK_CONFIG, ...config };

        if (this.config.showIndicator) {
            this.createIndicator();
        }
        this.setupEventHandlers();
    }

    /**
     * Создать индикатор зоны
     */
    private createIndicator(): void {
        // Индикатор (показывается только при активном free-look)
        this.indicator = new Rectangle("freeLookIndicator");
        this.indicator.width = "100%";
        this.indicator.height = "100%";
        this.indicator.thickness = 3;
        this.indicator.color = this.config.indicatorColor;
        this.indicator.background = "transparent";
        this.indicator.alpha = 0;
        this.indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.indicator.isPointerBlocker = false;
        this.indicator.zIndex = 999;
        this.guiTexture.addControl(this.indicator);

        // Текст индикатора
        this.indicatorText = new TextBlock("freeLookIndicatorText");
        this.indicatorText.text = "FREE LOOK";
        this.indicatorText.fontSize = 20 * this.scale;
        this.indicatorText.color = this.config.indicatorColor;
        this.indicatorText.fontFamily = "'Press Start 2P', Consolas, monospace";
        this.indicatorText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.indicatorText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.indicatorText.top = "20px";
        this.indicator.addControl(this.indicatorText);
    }

    /**
     * Настроить обработчики событий
     */
    private setupEventHandlers(): void {
        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        canvas.addEventListener('touchstart', (e) => {
            this.handleTouchStart(e);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            this.handleTouchMove(e);
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            this.handleTouchEnd(e);
        }, { passive: true });

        canvas.addEventListener('touchcancel', (e) => {
            this.handleTouchEnd(e);
        }, { passive: true });
    }

    /**
     * Обработка начала касания
     */
    private handleTouchStart(e: TouchEvent): void {
        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch) continue;

            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // Проверяем, попало ли касание в зону free-look
            if (this.isPointInZone(x, y, canvasWidth, canvasHeight)) {
                e.preventDefault();
                this.isActive = true;
                this.pointerId = touch.identifier;
                this.lastX = x;
                this.lastY = y;
                this.deltaX = 0;
                this.deltaY = 0;

                // Показываем индикатор
                if (this.indicator) {
                    this.indicator.alpha = 0.3;
                }

                getHapticFeedback().button();

                // Уведомляем о начале free-look
                if (this.onFreeLookChange) {
                    this.onFreeLookChange(0, 0); // Начальное состояние
                }
                return;
            }
        }
    }

    /**
     * Обработка движения касания
     */
    private handleTouchMove(e: TouchEvent): void {
        if (!this.isActive || this.pointerId === null) return;

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch || touch.identifier !== this.pointerId) continue;

            e.preventDefault();

            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // Вычисляем дельту движения
            this.deltaX = (x - this.lastX) * this.config.sensitivity;
            this.deltaY = (y - this.lastY) * this.config.sensitivity;

            this.lastX = x;
            this.lastY = y;

            // Вызываем callback с дельтой
            if (this.onFreeLookChange) {
                this.onFreeLookChange(this.deltaX, this.deltaY);
            }
            return;
        }
    }

    /**
     * Обработка окончания касания
     */
    private handleTouchEnd(e: TouchEvent): void {
        if (!this.isActive || this.pointerId === null) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch || touch.identifier !== this.pointerId) continue;

            // Скрываем индикатор
            if (this.indicator) {
                this.indicator.alpha = 0;
            }

            this.isActive = false;
            this.pointerId = null;
            this.deltaX = 0;
            this.deltaY = 0;

            // Уведомляем об окончании free-look
            if (this.onFreeLookChange) {
                this.onFreeLookChange(0, 0); // Конечное состояние
            }
            return;
        }
    }

    /**
     * Проверить, попадает ли точка в зону free-look
     */
    private isPointInZone(x: number, y: number, canvasWidth: number, canvasHeight: number): boolean {
        const zoneTop = (this.config.zoneTop / 100) * canvasHeight;
        const zoneBottom = (this.config.zoneBottom / 100) * canvasHeight;
        const zoneLeft = (this.config.zoneLeft / 100) * canvasWidth;
        const zoneRight = (this.config.zoneRight / 100) * canvasWidth;

        return (
            x >= zoneLeft &&
            x <= zoneRight &&
            y >= zoneTop &&
            y <= zoneBottom
        );
    }

    /**
     * Установить callback изменения free-look
     */
    setOnFreeLookChange(callback: (deltaX: number, deltaY: number) => void): void {
        this.onFreeLookChange = callback;
    }

    /**
     * Проверить, активна ли зона
     */
    isActive(): boolean {
        return this.isActive;
    }

    /**
     * Включить/выключить зону
     */
    setEnabled(enabled: boolean): void {
        // Можно добавить логику для полного отключения зоны
        if (!enabled && this.isActive) {
            this.isActive = false;
            this.pointerId = null;
            if (this.indicator) {
                this.indicator.alpha = 0;
            }
        }
    }

    /**
     * Уничтожить элемент
     */
    dispose(): void {
        if (this.indicator) {
            this.guiTexture.removeControl(this.indicator);
            this.indicator.dispose();
            this.indicator = null;
        }
    }
}

export default FreeLookZone;

