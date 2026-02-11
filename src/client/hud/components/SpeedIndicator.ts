/**
 * @module hud/components/SpeedIndicator
 * @description Индикатор скорости танка
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";

export interface SpeedIndicatorConfig {
    fontSize: number;
    color: string;
    warningColor: string;
    criticalColor: string;
    warningThreshold: number;
    criticalThreshold: number;
}

export const DEFAULT_SPEED_CONFIG: SpeedIndicatorConfig = {
    fontSize: 14,
    color: "#0f0",
    warningColor: "#ff0",
    criticalColor: "#f00",
    warningThreshold: 50,
    criticalThreshold: 80
};

export class SpeedIndicator {
    private guiTexture: AdvancedDynamicTexture;
    private config: SpeedIndicatorConfig;

    private container: Rectangle | null = null;
    private speedText: TextBlock | null = null;
    private currentSpeed = 0;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<SpeedIndicatorConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_SPEED_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер (скрытый по умолчанию - данные отображаются в радаре)
        this.container = new Rectangle("speedContainer");
        this.container.width = "120px";
        this.container.height = "40px";
        this.container.thickness = 0;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.left = "20px";
        this.container.top = "-100px";
        this.container.isVisible = false; // Скрыт по умолчанию
        this.guiTexture.addControl(this.container);

        // Текст скорости
        this.speedText = new TextBlock("speedText");
        this.speedText.text = "0 km/h";
        this.speedText.color = this.config.color;
        this.speedText.fontSize = this.config.fontSize;
        this.speedText.fontWeight = "bold";
        this.speedText.fontFamily = "'Press Start 2P', monospace";
        this.speedText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.speedText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.speedText.outlineWidth = 1;
        this.speedText.outlineColor = "#000";
        this.container.addControl(this.speedText);
    }

    update(speed: number): void {
        this.currentSpeed = Math.abs(speed);

        if (!this.speedText) return;

        this.speedText.text = `${Math.round(this.currentSpeed)} km/h`;

        // Цвет в зависимости от скорости
        if (this.currentSpeed >= this.config.criticalThreshold) {
            this.speedText.color = this.config.criticalColor;
        } else if (this.currentSpeed >= this.config.warningThreshold) {
            this.speedText.color = this.config.warningColor;
        } else {
            this.speedText.color = this.config.color;
        }
    }

    getSpeed(): number {
        return this.currentSpeed;
    }

    getFormattedSpeed(): string {
        return `${Math.round(this.currentSpeed)} km/h`;
    }

    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.isVisible = visible;
        }
    }

    isVisible(): boolean {
        return this.container?.isVisible ?? false;
    }

    dispose(): void {
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

export default SpeedIndicator;

