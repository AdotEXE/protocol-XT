/**
 * @module mobile/VirtualScrollWheel
 * @description Виртуальное колесо прокрутки для плавного управления зумом
 * 
 * Эмулирует колесо мыши для плавного изменения FOV от 1x до 4x.
 * Поддерживает инерционную прокрутку для быстрого входа в режим прицела.
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
 * Конфигурация виртуального колеса прокрутки
 */
export interface VirtualScrollWheelConfig {
    width: number;          // Ширина полосы (60px)
    height: number;        // Высота полосы (200px)
    position: {
        horizontalAlignment: number;
        verticalAlignment: number;
        left: string;
        top: string;
    };
    minZoom: number;        // Минимальный зум (1.0x)
    maxZoom: number;        // Максимальный зум (4.0x)
    sensitivity: number;    // Чувствительность (0.02 = зум за пиксель)
    inertiaDecay: number;   // Затухание инерции (0.95)
    showIndicator: boolean; // Показывать ли индикатор уровня зума
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_SCROLL_WHEEL_CONFIG: VirtualScrollWheelConfig = {
    width: 60,
    height: 200,
    position: {
        horizontalAlignment: Control.HORIZONTAL_ALIGNMENT_RIGHT,
        verticalAlignment: Control.VERTICAL_ALIGNMENT_BOTTOM,
        left: "-140px",
        top: "-200px"
    },
    minZoom: 1.0,
    maxZoom: 4.0,
    sensitivity: 0.02,
    inertiaDecay: 0.95,
    showIndicator: false
};

/**
 * Виртуальное колесо прокрутки
 */
export class VirtualScrollWheel {
    private guiTexture: AdvancedDynamicTexture;
    private config: VirtualScrollWheelConfig;
    private scale: number;

    // UI элементы
    private hitbox: Rectangle | null = null;
    private indicator: Rectangle | null = null;
    private indicatorText: TextBlock | null = null;

    // Состояние
    private currentZoom: number = 1.0;
    private targetZoom: number = 1.0;
    private isActive: boolean = false;
    private pointerId: number | null = null;
    private startY: number = 0;
    private lastY: number = 0;
    private velocity: number = 0;
    private lastZoomLevel: number = 1.0;

    // Callbacks
    private onZoomChange: ((zoom: number) => void) | null = null;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<VirtualScrollWheelConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scale = getMobileScale();
        this.config = {
            ...DEFAULT_SCROLL_WHEEL_CONFIG,
            ...config,
            width: (config.width || DEFAULT_SCROLL_WHEEL_CONFIG.width) * this.scale,
            height: (config.height || DEFAULT_SCROLL_WHEEL_CONFIG.height) * this.scale
        };

        this.create();
        this.setupEventHandlers();
    }

    /**
     * Создать UI элементы
     */
    private create(): void {
        // Невидимая зона касания
        this.hitbox = new Rectangle("virtualScrollWheel");
        this.hitbox.width = `${this.config.width}px`;
        this.hitbox.height = `${this.config.height}px`;
        this.hitbox.thickness = 0;
        this.hitbox.background = "transparent";
        this.hitbox.alpha = 0; // Полностью невидима
        this.hitbox.horizontalAlignment = this.config.position.horizontalAlignment;
        this.hitbox.verticalAlignment = this.config.position.verticalAlignment;
        this.hitbox.left = this.config.position.left;
        this.hitbox.top = this.config.position.top;
        this.hitbox.isPointerBlocker = true;
        this.hitbox.zIndex = 1001;
        this.guiTexture.addControl(this.hitbox);

        // Индикатор (опционально, появляется при касании)
        if (this.config.showIndicator) {
            this.createIndicator();
        }
    }

    /**
     * Создать индикатор уровня зума
     */
    private createIndicator(): void {
        this.indicator = new Rectangle("zoomIndicator");
        this.indicator.width = "80px";
        this.indicator.height = "30px";
        this.indicator.thickness = 2;
        this.indicator.color = "#00ffaa";
        this.indicator.background = "rgba(0, 0, 0, 0.7)";
        this.indicator.alpha = 0;
        this.indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.indicator.left = "-20px";
        this.indicator.top = "20px";
        this.indicator.zIndex = 1002;
        this.guiTexture.addControl(this.indicator);

        this.indicatorText = new TextBlock("zoomIndicatorText");
        this.indicatorText.text = "1.0x";
        this.indicatorText.fontSize = 16;
        this.indicatorText.color = "#ffffff";
        this.indicatorText.fontFamily = "'Press Start 2P', Consolas, monospace";
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
        if (!this.hitbox) return;

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch) continue;

            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // Проверяем, попало ли касание в зону hitbox
            if (this.isPointInHitbox(x, y)) {
                e.preventDefault();
                this.isActive = true;
                this.pointerId = touch.identifier;
                this.startY = y;
                this.lastY = y;
                this.velocity = 0;

                // Показываем индикатор
                if (this.indicator) {
                    this.indicator.alpha = 0.8;
                }

                // Показываем визуальную полосу при касании
                if (this.hitbox) {
                    this.hitbox.alpha = 0.3;
                    this.hitbox.background = "rgba(0, 255, 170, 0.2)";
                }

                getHapticFeedback().button();
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

            const y = touch.clientY - rect.top;
            const deltaY = this.lastY - y; // Инвертируем для интуитивности (вверх = зум in)

            // Применяем изменение зума
            const zoomDelta = deltaY * this.config.sensitivity;
            this.targetZoom = Math.max(
                this.config.minZoom,
                Math.min(this.config.maxZoom, this.targetZoom + zoomDelta)
            );

            // Вычисляем скорость для инерции
            this.velocity = deltaY * 0.1; // Масштабируем для инерции

            this.lastY = y;
            this.updateZoom();
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

            // Скрываем визуальную полосу
            if (this.hitbox) {
                this.hitbox.alpha = 0;
                this.hitbox.background = "transparent";
            }

            // Скрываем индикатор через небольшую задержку
            if (this.indicator) {
                setTimeout(() => {
                    if (this.indicator && !this.isActive) {
                        this.indicator.alpha = 0;
                    }
                }, 500);
            }

            this.isActive = false;
            this.pointerId = null;

            // Запускаем инерционную прокрутку
            if (Math.abs(this.velocity) > 0.1) {
                this.startInertia();
            }
            return;
        }
    }

    /**
     * Запустить инерционную прокрутку
     */
    private startInertia(): void {
        const inertiaStep = () => {
            if (Math.abs(this.velocity) < 0.01) {
                this.velocity = 0;
                return;
            }

            // Применяем инерцию
            const zoomDelta = this.velocity * this.config.sensitivity;
            this.targetZoom = Math.max(
                this.config.minZoom,
                Math.min(this.config.maxZoom, this.targetZoom + zoomDelta)
            );

            // Затухание скорости
            this.velocity *= this.config.inertiaDecay;

            this.updateZoom();

            // Продолжаем инерцию
            requestAnimationFrame(inertiaStep);
        };

        requestAnimationFrame(inertiaStep);
    }

    /**
     * Обновить зум
     */
    private updateZoom(): void {
        // Плавная интерполяция к целевому зуму
        const diff = this.targetZoom - this.currentZoom;
        this.currentZoom += diff * 0.2; // Быстрая интерполяция

        // Ограничиваем значения
        this.currentZoom = Math.max(
            this.config.minZoom,
            Math.min(this.config.maxZoom, this.currentZoom)
        );

        // Проверяем, изменился ли уровень зума (для тактильной обратной связи)
        const newZoomLevel = Math.floor(this.currentZoom * 2) / 2; // Округляем до 0.5
        if (newZoomLevel !== this.lastZoomLevel) {
            this.lastZoomLevel = newZoomLevel;
            getHapticFeedback().button(); // Тактильная обратная связь при изменении уровня
        }

        // Обновляем индикатор
        if (this.indicatorText) {
            this.indicatorText.text = `${this.currentZoom.toFixed(1)}x`;
        }

        // Вызываем callback
        if (this.onZoomChange) {
            this.onZoomChange(this.currentZoom);
        }
    }

    /**
     * Проверить, попадает ли точка в зону hitbox
     */
    private isPointInHitbox(x: number, y: number): boolean {
        if (!this.hitbox) return false;

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return false;

        const rect = canvas.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        // Вычисляем позицию hitbox на экране
        let hitboxX = 0;
        let hitboxY = 0;

        if (this.config.position.horizontalAlignment === Control.HORIZONTAL_ALIGNMENT_RIGHT) {
            hitboxX = canvasWidth - this.config.width + parseFloat(this.config.position.left.replace('px', ''));
        } else if (this.config.position.horizontalAlignment === Control.HORIZONTAL_ALIGNMENT_LEFT) {
            hitboxX = parseFloat(this.config.position.left.replace('px', ''));
        } else {
            hitboxX = canvasWidth / 2 + parseFloat(this.config.position.left.replace('px', ''));
        }

        if (this.config.position.verticalAlignment === Control.VERTICAL_ALIGNMENT_BOTTOM) {
            hitboxY = canvasHeight - this.config.height + parseFloat(this.config.position.top.replace('px', ''));
        } else if (this.config.position.verticalAlignment === Control.VERTICAL_ALIGNMENT_TOP) {
            hitboxY = parseFloat(this.config.position.top.replace('px', ''));
        } else {
            hitboxY = canvasHeight / 2 + parseFloat(this.config.position.top.replace('px', ''));
        }

        return (
            x >= hitboxX &&
            x <= hitboxX + this.config.width &&
            y >= hitboxY &&
            y <= hitboxY + this.config.height
        );
    }

    /**
     * Установить callback изменения зума
     */
    setOnZoomChange(callback: (zoom: number) => void): void {
        this.onZoomChange = callback;
    }

    /**
     * Получить текущий зум
     */
    getCurrentZoom(): number {
        return this.currentZoom;
    }

    /**
     * Установить зум программно
     */
    setZoom(zoom: number): void {
        this.targetZoom = Math.max(
            this.config.minZoom,
            Math.min(this.config.maxZoom, zoom)
        );
        this.currentZoom = this.targetZoom;
        this.updateZoom();
    }

    /**
     * Показать/скрыть элемент
     */
    setVisible(visible: boolean): void {
        if (this.hitbox) {
            this.hitbox.isVisible = visible;
        }
        if (this.indicator) {
            this.indicator.isVisible = visible;
        }
    }

    /**
     * Уничтожить элемент
     */
    dispose(): void {
        if (this.hitbox) {
            this.guiTexture.removeControl(this.hitbox);
            this.hitbox.dispose();
            this.hitbox = null;
        }
        if (this.indicator) {
            this.guiTexture.removeControl(this.indicator);
            this.indicator.dispose();
            this.indicator = null;
        }
    }
}

export default VirtualScrollWheel;

