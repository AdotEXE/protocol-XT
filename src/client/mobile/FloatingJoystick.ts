/**
 * @module mobile/FloatingJoystick
 * @description Плавающий джойстик (появляется где коснёшься)
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    Ellipse,
    TextBlock,
    Control
} from "@babylonjs/gui";

/**
 * Конфигурация джойстика
 */
export interface FloatingJoystickConfig {
    size: number;
    knobSize: number;
    color: string;
    knobColor: string;
    backgroundColor: string;
    baseAlpha: number;
    activeAlpha: number;
    fadeDelay: number; // Задержка перед исчезновением (мс)
}

export const DEFAULT_FLOATING_JOYSTICK_CONFIG: FloatingJoystickConfig = {
    size: 120,
    knobSize: 50,
    color: "#00ff44",
    knobColor: "#ffffff",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    baseAlpha: 0.7,
    activeAlpha: 1.0,
    fadeDelay: 100 // Исчезает через 100мс после отпускания
};

/**
 * Данные джойстика
 */
interface JoystickData {
    container: Rectangle;
    base: Ellipse;
    knob: Ellipse;
    pointerId: number | null;
    startX: number;
    startY: number;
    valueX: number;
    valueY: number;
    fadeTimeout: number | null;
}

/**
 * Плавающий джойстик
 */
export class FloatingJoystick {
    private guiTexture: AdvancedDynamicTexture;
    private config: FloatingJoystickConfig;
    private joystick: JoystickData | null = null;
    private onValueChange: ((x: number, y: number) => void) | null = null;
    private side: 'left' | 'right';
    private enabled: boolean = true;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        side: 'left' | 'right',
        config: Partial<FloatingJoystickConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.side = side;
        this.config = { ...DEFAULT_FLOATING_JOYSTICK_CONFIG, ...config };
        this.setupGlobalHandlers();
    }

    /**
     * Set visibility/enabled state
     */
    public setVisible(visible: boolean): void {
        this.enabled = visible;
        if (!visible) {
            this.removeJoystick();
        }
    }

    /**
     * Настроить глобальные обработчики
     */
    private setupGlobalHandlers(): void {
        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;

        canvas.addEventListener('touchstart', (e) => {
            if (!this.enabled) return;
            this.handleTouchStart(e);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (!this.enabled) return;
            this.handleTouchMove(e);
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            // Always handle touch end to ensure cleanup even if disabled mid-touch
            this.handleTouchEnd(e);
        }, { passive: true });

        canvas.addEventListener('touchcancel', (e) => {
            // Always handle touch cancel
            this.handleTouchEnd(e);
        }, { passive: true });
    }

    /**
     * Обработка начала касания
     */
    private handleTouchStart(e: TouchEvent): void {
        if (!this.enabled) return;

        // Check if we already have an active joystick
        if (this.joystick && this.joystick.pointerId !== null) {
            return;
        }

        const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const canvasWidth = rect.width || canvas.width || window.innerWidth;

        // Iterate through all changed touches to find one in our zone
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch) continue;
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            const isLeftZone = x < canvasWidth / 2;
            const isRightZone = x >= canvasWidth / 2;

            if ((this.side === 'left' && isLeftZone) ||
                (this.side === 'right' && isRightZone)) {

                // Found a valid touch for this joystick
                e.preventDefault();
                this.createJoystick(x, y, touch.identifier);
                return; // Only handle one touch per joystick
            }
        }
    }

    /**
     * Создать джойстик в указанной позиции
     */
    private createJoystick(x: number, y: number, pointerId: number): void {
        const cfg = this.config;
        const size = cfg.size;

        // Удаляем старый джойстик если есть
        if (this.joystick) {
            this.removeJoystick();
        }

        const container = new Rectangle(`floatingJoystick_${this.side}`);
        container.width = `${size + 40}px`;
        container.height = `${size + 40}px`;
        container.thickness = 0;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.left = `${x - size / 2 - 20}px`;
        container.top = `${y - size / 2 - 20}px`;
        container.isPointerBlocker = true;
        container.zIndex = 1001;
        this.guiTexture.addControl(container);

        const base = new Ellipse(`joystickBase_${this.side}`);
        base.width = `${size}px`;
        base.height = `${size}px`;
        base.thickness = 4;
        base.color = cfg.color;
        base.background = cfg.backgroundColor;
        base.alpha = cfg.activeAlpha;
        base.shadowColor = cfg.color;
        base.shadowBlur = 10;
        container.addControl(base);

        const knob = new Ellipse(`joystickKnob_${this.side}`);
        knob.width = `${cfg.knobSize}px`;
        knob.height = `${cfg.knobSize}px`;
        knob.thickness = 3;
        knob.color = cfg.knobColor;
        knob.background = cfg.color;
        knob.alpha = cfg.activeAlpha;
        knob.shadowColor = cfg.knobColor;
        knob.shadowBlur = 8;
        knob.isPointerBlocker = false;
        container.addControl(knob);

        this.joystick = {
            container,
            base,
            knob,
            pointerId,
            startX: x,
            startY: y,
            valueX: 0,
            valueY: 0,
            fadeTimeout: null
        };
    }

    /**
     * Обработка движения касания
     */
    private handleTouchMove(e: TouchEvent): void {
        const joystick = this.joystick;
        if (!joystick || joystick.pointerId === null) return;

        // Find the touch that matches our pointerId
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch) continue;
            if (touch.identifier === joystick.pointerId) {
                e.preventDefault();

                const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
                if (!canvas) return;

                const rect = canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;

                this.updateJoystick(x, y);
                return;
            }
        }
    }

    /**
     * Обновить позицию джойстика
     */
    private updateJoystick(pointerX: number, pointerY: number): void {
        if (!this.joystick) return;

        const cfg = this.config;
        const maxRadius = (cfg.size - cfg.knobSize) / 2;

        let deltaX = pointerX - this.joystick.startX;
        let deltaY = pointerY - this.joystick.startY;

        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > maxRadius) {
            const scale = maxRadius / distance;
            deltaX *= scale;
            deltaY *= scale;
        }

        this.joystick.knob.left = `${deltaX}px`;
        this.joystick.knob.top = `${deltaY}px`;

        this.joystick.valueX = deltaX / maxRadius;
        this.joystick.valueY = -deltaY / maxRadius; // Инвертируем Y

        if (this.onValueChange) {
            this.onValueChange(this.joystick.valueX, this.joystick.valueY);
        }
    }

    /**
     * Обработка окончания касания
     */
    private handleTouchEnd(e: TouchEvent): void {
        if (!this.joystick) return;

        // Check if our pointerId was among the ended touches
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (!touch) continue;

            if (touch.identifier === this.joystick.pointerId) {
                // Reset values
                if (this.onValueChange) {
                    this.onValueChange(0, 0);
                }

                // Fade out
                if (this.joystick.fadeTimeout) {
                    clearTimeout(this.joystick.fadeTimeout);
                }

                this.joystick.fadeTimeout = window.setTimeout(() => {
                    this.removeJoystick();
                }, this.config.fadeDelay);

                this.joystick.pointerId = null; // Mark as inactive
                return;
            }
        }
    }

    /**
     * Удалить джойстик
     */
    private removeJoystick(): void {
        if (!this.joystick) return;

        if (this.joystick.fadeTimeout) {
            clearTimeout(this.joystick.fadeTimeout);
            this.joystick.fadeTimeout = null;
        }

        this.guiTexture.removeControl(this.joystick.container);
        this.joystick.container.dispose();
        this.joystick = null;
    }

    /**
     * Установить callback изменения значений
     */
    setOnValueChange(callback: (x: number, y: number) => void): void {
        this.onValueChange = callback;
    }

    /**
     * Получить текущие значения
     */
    getValues(): { x: number; y: number } {
        if (!this.joystick) {
            return { x: 0, y: 0 };
        }
        return {
            x: this.joystick.valueX,
            y: this.joystick.valueY
        };
    }

    /**
     * Уничтожить джойстик
     */
    dispose(): void {
        this.removeJoystick();
    }
}

export default FloatingJoystick;

