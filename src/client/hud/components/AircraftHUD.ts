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
    /** Показывать подсказку по управлению (исчезает через N сек) */
    showControlsHint: boolean;
    /** Через сколько мс скрыть подсказку */
    controlsHintDurationMs: number;
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
    showGForceIndicator: true,
    showControlsHint: true,
    controlsHintDurationMs: 15000
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

    // Throttle indicator (газ %)
    private throttleIndicator: TextBlock | null = null;

    // Brake indicator (тормоза)
    private brakeIndicator: TextBlock | null = null;

    // Phase 6.1: Airbrake indicator
    private airbrakeIndicator: TextBlock | null = null;

    // Phase 6.2: Airspeed indicator
    private airspeedIndicator: TextBlock | null = null;

    // Phase 4.2: G-force vignette overlay
    private gForceVignette: Rectangle | null = null;

    // Подсказка по управлению (показывается при входе в самолёт, исчезает через N сек)
    private controlsHint: TextBlock | null = null;
    private firstVisibleTime: number = 0;

    // Состояние
    private isVisible: boolean = false;
    private aimCircleScreenPos: Vector3 = new Vector3(0.5, 0.5, 0);
    private headingCrossScreenPos: Vector3 = new Vector3(0.5, 0.5, 0);

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<AircraftHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_AIRCRAFT_HUD_CONFIG, ...config };

        this.createDeadzoneCircle(); // Большой круг deadzone в центре
        this.createAimCircle();
        this.createHeadingCross();
        this.createStallWarning();
        this.createGForceIndicator();
        this.createThrottleIndicator();
        this.createBrakeIndicator();
        this.createAirbrakeIndicator();
        this.createAirspeedIndicator();
        this.createGForceVignette();
        this.createControlsHint();

        this.setVisible(false);
    }

    private createControlsHint(): void {
        if (!this.config.showControlsHint) return;
        this.controlsHint = new TextBlock("aircraftControlsHint");
        this.controlsHint.text = "Мышь — направление | W/S — газ | A/D — крен | Q/E — тангаж | Shift — обзор";
        this.controlsHint.fontSize = scalePixels(10);
        this.controlsHint.color = "rgba(0, 255, 0, 0.85)";
        this.controlsHint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.controlsHint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.controlsHint.top = "-32px";
        this.controlsHint.isVisible = false;
        this.guiTexture.addControl(this.controlsHint);
    }

    // Deadzone boundary circle
    private deadzoneCircle: Ellipse | null = null;

    /**
     * Создать большой круг в центре — граница deadzone
     * Курсор может двигаться внутри без коррекций
     */
    private createDeadzoneCircle(): void {
        this.deadzoneCircle = new Ellipse("aircraftDeadzoneCircle");
        // Радиус 300px = диаметр 600px
        const size = scalePixels(600);
        this.deadzoneCircle.width = `${size}px`;
        this.deadzoneCircle.height = `${size}px`;
        this.deadzoneCircle.thickness = scalePixels(2);
        this.deadzoneCircle.color = "transparent"; // Полностью невидимый
        this.deadzoneCircle.background = "transparent";
        this.deadzoneCircle.isHitTestVisible = false;
        this.deadzoneCircle.isVisible = false; // ДОБАВЛЕНО: Полностью скрыт
        // По центру экрана
        this.deadzoneCircle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.deadzoneCircle.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.guiTexture.addControl(this.deadzoneCircle);
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
        // ИСПРАВЛЕНО: Установка alignment для корректного позиционирования через left/top
        this.aimCircleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimCircleContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
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
        // ИСПРАВЛЕНО: Установка alignment для корректного позиционирования через left/top
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
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

    private createThrottleIndicator(): void {
        this.throttleIndicator = new TextBlock("aircraftThrottleIndicator");
        this.throttleIndicator.text = "T: 0%";
        this.throttleIndicator.fontSize = scalePixels(18);
        this.throttleIndicator.color = "#88ff88";
        this.throttleIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.throttleIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.throttleIndicator.left = "20px";
        this.throttleIndicator.top = "44px";
        this.throttleIndicator.isVisible = false;
        this.guiTexture.addControl(this.throttleIndicator);
    }

    private createBrakeIndicator(): void {
        this.brakeIndicator = new TextBlock("aircraftBrakeIndicator");
        this.brakeIndicator.text = "BRAKE";
        this.brakeIndicator.fontSize = scalePixels(18);
        this.brakeIndicator.color = "#ff4444";
        this.brakeIndicator.fontWeight = "bold";
        this.brakeIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.brakeIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.brakeIndicator.left = "20px";
        this.brakeIndicator.top = "68px";
        this.brakeIndicator.isVisible = false;
        this.guiTexture.addControl(this.brakeIndicator);
    }

    // Phase 6.1: Индикатор воздушных тормозов
    private createAirbrakeIndicator(): void {
        this.airbrakeIndicator = new TextBlock("aircraftAirbrakeIndicator");
        this.airbrakeIndicator.text = "AIR BRAKE";
        this.airbrakeIndicator.fontSize = scalePixels(20);
        this.airbrakeIndicator.color = "#ff6600";
        this.airbrakeIndicator.fontWeight = "bold";
        this.airbrakeIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.airbrakeIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.airbrakeIndicator.top = "140px";
        this.airbrakeIndicator.isVisible = false;
        this.guiTexture.addControl(this.airbrakeIndicator);
    }

    // Phase 6.2: Индикатор скорости
    private createAirspeedIndicator(): void {
        this.airspeedIndicator = new TextBlock("aircraftAirspeedIndicator");
        this.airspeedIndicator.text = "SPD: 0";
        this.airspeedIndicator.fontSize = scalePixels(18);
        this.airspeedIndicator.color = "#88ff88";
        this.airspeedIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.airspeedIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.airspeedIndicator.left = "20px";
        this.airspeedIndicator.top = "92px";
        this.airspeedIndicator.isVisible = false;
        this.guiTexture.addControl(this.airspeedIndicator);
    }

    // Phase 4.2: G-force vignette (затемнение краёв экрана при перегрузке)
    private createGForceVignette(): void {
        this.gForceVignette = new Rectangle("gForceVignette");
        this.gForceVignette.width = "100%";
        this.gForceVignette.height = "100%";
        this.gForceVignette.thickness = 0;
        this.gForceVignette.background = "transparent";
        this.gForceVignette.isHitTestVisible = false;
        this.gForceVignette.isVisible = false;
        this.gForceVignette.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.gForceVignette.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        // Используем радиальный градиент через border эффект (упрощение для GUI)
        // Фактический эффект: толстая полупрозрачная чёрная рамка
        this.gForceVignette.cornerRadius = 0;
        this.guiTexture.addControl(this.gForceVignette);
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

            // Phase 6.3: Мигание красным текстом при сваливании
            if (isStalling) {
                const t = Date.now() / 150;
                const blink = Math.sin(t) > 0;
                this.stallWarning.color = blink ? "#ff0000" : "#ff6600";
                this.stallWarning.alpha = blink ? 1.0 : 0.6;
                this.stallWarning.text = "!! STALL !!";
            } else {
                this.stallWarning.alpha = 1.0;
                this.stallWarning.text = "STALL!";
                this.stallWarning.color = "#ff0000";
            }
        }
    }

    /**
     * Обновить индикатор G-force
     * @param gForce Текущая перегрузка
     */
    updateGForceIndicator(gForce: number): void {
        if (this.gForceIndicator) {
            // Phase 6.4: Числовое отображение с цветовой кодировкой
            this.gForceIndicator.text = `${gForce.toFixed(1)}G`;

            if (gForce > 5) {
                this.gForceIndicator.color = "#ff0000"; // Красный > 5G
                this.gForceIndicator.fontWeight = "bold";
            } else if (gForce > 3) {
                this.gForceIndicator.color = "#ffff00"; // Жёлтый 3-5G
                this.gForceIndicator.fontWeight = "bold";
            } else {
                this.gForceIndicator.color = "#ffffff"; // Белый < 3G
                this.gForceIndicator.fontWeight = "normal";
            }
        }

        // Phase 4.2: G-force vignette
        if (this.gForceVignette) {
            if (gForce > 4.0) {
                this.gForceVignette.isVisible = true;
                const vignetteStrength = Math.min(0.6, (gForce - 4.0) * 0.1);
                // Чёрный полупрозрачный overlay для имитации виньетирования
                this.gForceVignette.background = `rgba(0, 0, 0, ${vignetteStrength.toFixed(2)})`;

                // При очень высоком G — добавляем красный оттенок
                if (gForce > 7) {
                    const redStrength = Math.min(0.3, (gForce - 7.0) * 0.05);
                    this.gForceVignette.background = `rgba(80, 0, 0, ${(vignetteStrength + redStrength).toFixed(2)})`;
                }
            } else {
                this.gForceVignette.isVisible = false;
            }
        }
    }

    /**
     * Обновить индикатор тяги (0–100%)
     */
    updateThrottleIndicator(throttle: number): void {
        if (this.throttleIndicator) {
            const pct = Math.round(Math.max(0, Math.min(1, throttle)) * 100);
            this.throttleIndicator.text = `T: ${pct}%`;
        }
    }

    /**
     * Обновить индикатор тормозов
     */
    updateBrakeIndicator(isBraking: boolean): void {
        if (this.brakeIndicator) {
            this.brakeIndicator.isVisible = isBraking && this.isVisible;
            if (isBraking) {
                const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
                this.brakeIndicator.alpha = pulse;
            }
        }
    }

    /**
     * Phase 6.1: Обновить индикатор воздушных тормозов
     */
    updateAirbrakeIndicator(isActive: boolean): void {
        if (this.airbrakeIndicator) {
            this.airbrakeIndicator.isVisible = isActive && this.isVisible;
            if (isActive) {
                // Мигание оранжевым
                const blink = Math.sin(Date.now() / 200) > 0;
                this.airbrakeIndicator.alpha = blink ? 1.0 : 0.5;
                this.airbrakeIndicator.color = blink ? "#ff6600" : "#ff3300";
            }
        }
    }

    /**
     * Phase 6.2: Обновить индикатор скорости
     * @param speed Скорость в м/с
     * @param maxSpeed Максимальная скорость для цветовой кодировки
     * @param isStalling Флаг сваливания
     */
    updateAirspeedIndicator(speed: number, maxSpeed: number = 185, isStalling: boolean = false): void {
        if (this.airspeedIndicator) {
            const kmh = Math.round(speed * 3.6); // м/с -> км/ч
            this.airspeedIndicator.text = `SPD: ${kmh} km/h`;

            // Цветовая кодировка
            if (isStalling) {
                this.airspeedIndicator.color = "#ff0000"; // Красный при сваливании
            } else if (speed < maxSpeed * 0.2) {
                this.airspeedIndicator.color = "#ffff00"; // Жёлтый при низкой скорости
            } else {
                this.airspeedIndicator.color = "#88ff88"; // Зелёный в норме
            }
        }
    }

    /**
     * Показать/скрыть HUD
     */
    setVisible(visible: boolean): void {
        this.isVisible = visible;
        if (visible && this.firstVisibleTime === 0) {
            this.firstVisibleTime = Date.now();
        }
        if (!visible) {
            this.firstVisibleTime = 0;
        }

        if (this.deadzoneCircle) {
            this.deadzoneCircle.isVisible = visible;
        }
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
        if (this.throttleIndicator) {
            this.throttleIndicator.isVisible = visible;
        }
        if (this.brakeIndicator) {
            this.brakeIndicator.isVisible = false; // Скрыт по умолчанию, показывается только при торможении
        }
        if (this.airbrakeIndicator) {
            this.airbrakeIndicator.isVisible = false; // Показывается только при активных аэробрейках
        }
        if (this.airspeedIndicator) {
            this.airspeedIndicator.isVisible = visible;
        }
        if (this.gForceVignette) {
            this.gForceVignette.isVisible = false; // Управляется через updateGForceIndicator
        }
        if (this.controlsHint) {
            this.controlsHint.isVisible = visible && this.config.showControlsHint;
        }
    }

    /**
     * Обновить HUD (вызывается каждый кадр)
     * @param aimCircleScreenPos Позиция Aim Circle на экране (0-1)
     * @param headingCrossScreenPos Позиция Heading Cross на экране (0-1)
     * @param isStalling Флаг сваливания
     * @param gForce Текущая перегрузка
     * @param throttle Тяга 0–1
     * @param isBraking Активны ли тормоза
     */
    update(
        aimCircleScreenPos: { x: number; y: number },
        headingCrossScreenPos: { x: number; y: number },
        isStalling: boolean,
        gForce: number,
        throttle: number = 0,
        isBraking: boolean = false,
        airbrakeActive: boolean = false,
        speed: number = 0,
        maxSpeed: number = 185
    ): void {
        this.updateAimCirclePosition(aimCircleScreenPos.x, aimCircleScreenPos.y);
        this.updateHeadingCrossPosition(headingCrossScreenPos.x, headingCrossScreenPos.y);
        this.updateStallWarning(isStalling);
        this.updateGForceIndicator(gForce);
        this.updateThrottleIndicator(throttle);
        this.updateBrakeIndicator(isBraking);
        this.updateAirbrakeIndicator(airbrakeActive);
        this.updateAirspeedIndicator(speed, maxSpeed, isStalling);
        if (this.controlsHint && this.config.showControlsHint && this.firstVisibleTime > 0) {
            const elapsed = Date.now() - this.firstVisibleTime;
            if (elapsed > this.config.controlsHintDurationMs) {
                this.controlsHint.isVisible = false;
            } else if (elapsed > this.config.controlsHintDurationMs - 2000) {
                this.controlsHint.alpha = (this.config.controlsHintDurationMs - elapsed) / 2000;
            }
        }
    }

    /**
     * Dispose
     */
    dispose(): void {
        if (this.deadzoneCircle) {
            this.deadzoneCircle.dispose();
        }
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
        if (this.throttleIndicator) {
            this.throttleIndicator.dispose();
        }
        if (this.controlsHint) {
            this.controlsHint.dispose();
        }
        if (this.brakeIndicator) {
            this.brakeIndicator.dispose();
        }
        if (this.airbrakeIndicator) {
            this.airbrakeIndicator.dispose();
        }
        if (this.airspeedIndicator) {
            this.airspeedIndicator.dispose();
        }
        if (this.gForceVignette) {
            this.gForceVignette.dispose();
        }
    }
}



