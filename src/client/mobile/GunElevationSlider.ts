/**
 * @module mobile/GunElevationSlider
 * @description Вертикальный слайдер для независимого управления углом возвышения орудия
 * 
 * Позволяет управлять стволом независимо от камеры для навесной стрельбы
 * и точного наведения на дальних дистанциях.
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    Control,
    TextBlock,
    Line
} from "@babylonjs/gui";
import { getMobileScale } from "./MobileDetection";
import { getHapticFeedback } from "./HapticFeedback";

/**
 * Конфигурация слайдера возвышения орудия
 */
export interface GunElevationConfig {
    width: number;          // Ширина полосы (40px)
    height: number;         // Высота полосы (150px)
    position: {
        horizontalAlignment: number;
        verticalAlignment: number;
        left: string;
        top: string;
    };
    minAngle: number;       // Минимальный угол (-15° = депрессия)
    maxAngle: number;       // Максимальный угол (+30° = возвышение)
    sensitivity: number;    // Чувствительность (0.5° за пиксель)
    showMarkers: boolean;   // Показывать ли маркеры углов
    markerInterval: number; // Интервал маркеров (5°)
    showAngleText: boolean; // Показывать ли текст угла
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_GUN_ELEVATION_CONFIG: GunElevationConfig = {
    width: 40,
    height: 150,
    position: {
        horizontalAlignment: Control.HORIZONTAL_ALIGNMENT_RIGHT,
        verticalAlignment: Control.VERTICAL_ALIGNMENT_CENTER,
        left: "-20px",
        top: "0px"
    },
    minAngle: -15,
    maxAngle: 30,
    sensitivity: 0.5,
    showMarkers: true,
    markerInterval: 5,
    showAngleText: true
};

/**
 * Слайдер возвышения орудия
 */
export class GunElevationSlider {
    private guiTexture: AdvancedDynamicTexture;
    private config: GunElevationConfig;
    private scale: number;

    // UI элементы
    private container: Rectangle | null = null;
    private track: Rectangle | null = null;
    private thumb: Rectangle | null = null;
    private markers: Line[] = [];
    private angleText: TextBlock | null = null;

    // Состояние
    private currentAngle: number = 0; // В градусах
    private targetAngle: number = 0;
    private isActive: boolean = false;
    private pointerId: number | null = null;
    private startY: number = 0;

    // Callbacks
    private onAngleChange: ((angle: number) => void) | null = null;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<GunElevationConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scale = getMobileScale();
        this.config = {
            ...DEFAULT_GUN_ELEVATION_CONFIG,
            ...config,
            width: (config.width || DEFAULT_GUN_ELEVATION_CONFIG.width) * this.scale,
            height: (config.height || DEFAULT_GUN_ELEVATION_CONFIG.height) * this.scale
        };

        this.create();
        this.setupEventHandlers();
    }

    /**
     * Создать UI элементы
     */
    private create(): void {
        // Контейнер
        this.container = new Rectangle("gunElevationContainer");
        this.container.width = `${this.config.width + 20}px`;
        this.container.height = `${this.config.height + 40}px`;
        this.container.thickness = 0;
        this.container.background = "transparent";
        this.container.alpha = 0.7;
        this.container.horizontalAlignment = this.config.position.horizontalAlignment;
        this.container.verticalAlignment = this.config.position.verticalAlignment;
        this.container.left = this.config.position.left;
        this.container.top = this.config.position.top;
        this.container.isPointerBlocker = true;
        this.container.zIndex = 1001;
        this.guiTexture.addControl(this.container);

        // Дорожка слайдера
        this.track = new Rectangle("gunElevationTrack");
        this.track.width = `${this.config.width}px`;
        this.track.height = `${this.config.height}px`;
        this.track.thickness = 2;
        this.track.color = "#00aaff";
        this.track.background = "rgba(0, 0, 0, 0.4)";
        this.track.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.track.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.container.addControl(this.track);

        // Маркеры углов
        if (this.config.showMarkers) {
            this.createMarkers();
        }

        // Ползунок (thumb)
        this.thumb = new Rectangle("gunElevationThumb");
        this.thumb.width = `${this.config.width + 4}px`;
        this.thumb.height = "6px";
        this.thumb.thickness = 0;
        this.thumb.background = "#00ffaa";
        this.thumb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.thumb.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.thumb.top = "0px";
        this.container.addControl(this.thumb);

        // Текст угла
        if (this.config.showAngleText) {
            this.angleText = new TextBlock("gunElevationAngle");
            this.angleText.text = "0°";
            this.angleText.fontSize = 12 * this.scale;
            this.angleText.color = "#ffffff";
            this.angleText.fontFamily = "'Press Start 2P', Consolas, monospace";
            this.angleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.angleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            this.angleText.top = "-5px";
            this.container.addControl(this.angleText);
        }
    }

    /**
     * Создать маркеры углов
     */
    private createMarkers(): void {
        const angleRange = this.config.maxAngle - this.config.minAngle;
        const numMarkers = Math.floor(angleRange / this.config.markerInterval) + 1;

        for (let i = 0; i < numMarkers; i++) {
            const angle = this.config.minAngle + i * this.config.markerInterval;
            const normalizedY = (angle - this.config.minAngle) / angleRange;
            const y = -this.config.height / 2 + normalizedY * this.config.height;

            const marker = new Line(`gunElevationMarker_${i}`);
            marker.x1 = -this.config.width / 2 - 5;
            marker.x2 = -this.config.width / 2;
            marker.y1 = y;
            marker.y2 = y;
            marker.lineWidth = 1;
            marker.color = "#00aaff";
            marker.alpha = 0.6;
            marker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            marker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            this.container!.addControl(marker);
            this.markers.push(marker);
        }
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
        if (!this.container) return;

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch) continue;

            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            if (this.isPointInContainer(x, y)) {
                e.preventDefault();
                this.isActive = true;
                this.pointerId = touch.identifier;
                this.startY = y;

                // Визуальная обратная связь
                if (this.container) {
                    this.container.alpha = 1.0;
                }
                if (this.thumb) {
                    this.thumb.background = "#00ffaa";
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
        if (!this.isActive || this.pointerId === null || !this.container) return;

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch || touch.identifier !== this.pointerId) continue;

            e.preventDefault();

            const y = touch.clientY - rect.top;
            const deltaY = this.startY - y; // Инвертируем (вверх = больше угол)

            // Вычисляем изменение угла
            const angleDelta = deltaY * (this.config.sensitivity / 100); // Конвертируем в градусы
            this.targetAngle = Math.max(
                this.config.minAngle,
                Math.min(this.config.maxAngle, this.targetAngle + angleDelta)
            );

            this.startY = y; // Обновляем стартовую позицию для следующего движения
            this.updateAngle();
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

            // Восстанавливаем прозрачность
            if (this.container) {
                this.container.alpha = 0.7;
            }
            if (this.thumb) {
                this.thumb.background = "#00ffaa";
            }

            this.isActive = false;
            this.pointerId = null;
            return;
        }
    }

    /**
     * Обновить угол и визуализацию
     */
    private updateAngle(): void {
        // Плавная интерполяция
        const diff = this.targetAngle - this.currentAngle;
        this.currentAngle += diff * 0.3; // Быстрая интерполяция

        // Ограничиваем значения
        this.currentAngle = Math.max(
            this.config.minAngle,
            Math.min(this.config.maxAngle, this.currentAngle)
        );

        // Обновляем позицию ползунка
        if (this.thumb && this.track) {
            const angleRange = this.config.maxAngle - this.config.minAngle;
            const normalized = (this.currentAngle - this.config.minAngle) / angleRange;
            const y = -this.config.height / 2 + normalized * this.config.height;
            this.thumb.top = `${y}px`;
        }

        // Обновляем текст
        if (this.angleText) {
            const sign = this.currentAngle >= 0 ? '+' : '';
            this.angleText.text = `${sign}${this.currentAngle.toFixed(0)}°`;
        }

        // Вызываем callback
        if (this.onAngleChange) {
            this.onAngleChange(this.currentAngle);
        }
    }

    /**
     * Проверить, попадает ли точка в контейнер
     */
    private isPointInContainer(x: number, y: number): boolean {
        if (!this.container) return false;

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return false;

        const rect = canvas.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        // Вычисляем позицию контейнера
        let containerX = 0;
        let containerY = 0;

        if (this.config.position.horizontalAlignment === Control.HORIZONTAL_ALIGNMENT_RIGHT) {
            containerX = canvasWidth - (this.config.width + 20) + parseFloat(this.config.position.left.replace('px', ''));
        } else if (this.config.position.horizontalAlignment === Control.HORIZONTAL_ALIGNMENT_LEFT) {
            containerX = parseFloat(this.config.position.left.replace('px', ''));
        } else {
            containerX = canvasWidth / 2 + parseFloat(this.config.position.left.replace('px', ''));
        }

        if (this.config.position.verticalAlignment === Control.VERTICAL_ALIGNMENT_CENTER) {
            containerY = canvasHeight / 2 + parseFloat(this.config.position.top.replace('px', ''));
        } else if (this.config.position.verticalAlignment === Control.VERTICAL_ALIGNMENT_BOTTOM) {
            containerY = canvasHeight - (this.config.height + 40) + parseFloat(this.config.position.top.replace('px', ''));
        } else {
            containerY = parseFloat(this.config.position.top.replace('px', ''));
        }

        return (
            x >= containerX &&
            x <= containerX + (this.config.width + 20) &&
            y >= containerY &&
            y <= containerY + (this.config.height + 40)
        );
    }

    /**
     * Установить callback изменения угла
     */
    setOnAngleChange(callback: (angle: number) => void): void {
        this.onAngleChange = callback;
    }

    /**
     * Получить текущий угол
     */
    getCurrentAngle(): number {
        return this.currentAngle;
    }

    /**
     * Установить угол программно
     */
    setAngle(angle: number): void {
        this.targetAngle = Math.max(
            this.config.minAngle,
            Math.min(this.config.maxAngle, angle)
        );
        this.currentAngle = this.targetAngle;
        this.updateAngle();
    }

    /**
     * Показать/скрыть элемент
     */
    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.isVisible = visible;
        }
    }

    /**
     * Уничтожить элемент
     */
    dispose(): void {
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
        this.markers = [];
    }
}

export default GunElevationSlider;

