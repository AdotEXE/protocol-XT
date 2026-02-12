/**
 * @module hud/components/CoopHUD
 * @description HUD компонент для режима Co-op PvE
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface CoopHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    accentColor: string;
    fontSize: number;
    top: number;
    left: number;
}

export const DEFAULT_CONFIG: CoopHUDConfig = {
    containerWidth: 280,
    containerHeight: 120,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    accentColor: "#00aaff",
    fontSize: 12,
    top: 20,
    left: 20
};

export class CoopHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: CoopHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private enemiesRemainingText: TextBlock | null = null;
    private playersAliveText: TextBlock | null = null;
    private timerText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<CoopHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("coopHUDContainer");
        this.container.width = `${this.config.containerWidth}px`;
        this.container.height = `${this.config.containerHeight}px`;
        this.container.background = this.config.backgroundColor;
        this.container.thickness = 2;
        this.container.color = "#0f0";
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = `${this.config.top}px`;
        this.container.left = `${this.config.left}px`;
        this.container.isVisible = false;
        this.container.zIndex = 200;
        this.guiTexture.addControl(this.container);

        // Заголовок
        this.titleText = new TextBlock("coopHUDTitle");
        this.titleText.text = "🤝 CO-OP PvE";
        this.titleText.color = this.config.accentColor;
        this.titleText.fontSize = this.config.fontSize + 2;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Врагов осталось
        this.enemiesRemainingText = new TextBlock("coopEnemiesRemaining");
        this.enemiesRemainingText.text = "Врагов: 0";
        this.enemiesRemainingText.color = "#ff4444";
        this.enemiesRemainingText.fontSize = this.config.fontSize;
        this.enemiesRemainingText.fontFamily = "'Press Start 2P', monospace";
        this.enemiesRemainingText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.enemiesRemainingText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.enemiesRemainingText.top = "35px";
        this.enemiesRemainingText.left = "10px";
        this.container.addControl(this.enemiesRemainingText);

        // Игроков в живых
        this.playersAliveText = new TextBlock("coopPlayersAlive");
        this.playersAliveText.text = "Игроков: 0/0";
        this.playersAliveText.color = "#0f0";
        this.playersAliveText.fontSize = this.config.fontSize;
        this.playersAliveText.fontFamily = "'Press Start 2P', monospace";
        this.playersAliveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.playersAliveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.playersAliveText.top = "55px";
        this.playersAliveText.left = "10px";
        this.container.addControl(this.playersAliveText);

        // Таймер
        this.timerText = new TextBlock("coopTimer");
        this.timerText.text = "Время: 00:00";
        this.timerText.color = "#ffff00";
        this.timerText.fontSize = this.config.fontSize - 2;
        this.timerText.fontFamily = "'Press Start 2P', monospace";
        this.timerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.timerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.timerText.top = "75px";
        this.timerText.left = "10px";
        this.container.addControl(this.timerText);
    }

    update(data: {
        enemiesRemaining: number;
        enemiesTotal: number;
        playersAlive: number;
        playersTotal: number;
        gameTime: number; // в секундах
    }): void {
        if (!this.container || !this.isVisible) return;

        // Обновляем врагов
        if (this.enemiesRemainingText) {
            this.enemiesRemainingText.text = `Врагов: ${data.enemiesRemaining}`;
            // Меняем цвет в зависимости от количества
            if (data.enemiesRemaining === 0) {
                this.enemiesRemainingText.color = "#00ff00";
            } else if (data.enemiesRemaining <= data.enemiesTotal * 0.2) {
                this.enemiesRemainingText.color = "#ffaa00";
            } else {
                this.enemiesRemainingText.color = "#ff4444";
            }
        }

        // Обновляем игроков
        if (this.playersAliveText) {
            this.playersAliveText.text = `Игроков: ${data.playersAlive}/${data.playersTotal}`;
            // Меняем цвет если мало игроков
            if (data.playersAlive <= data.playersTotal * 0.3) {
                this.playersAliveText.color = "#ff0000";
            } else if (data.playersAlive <= data.playersTotal * 0.5) {
                this.playersAliveText.color = "#ffaa00";
            } else {
                this.playersAliveText.color = "#0f0";
            }
        }

        // Обновляем таймер
        if (this.timerText) {
            const minutes = Math.floor(data.gameTime / 60);
            const seconds = Math.floor(data.gameTime % 60);
            this.timerText.text = `Время: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    show(): void {
        if (this.container) {
            this.container.isVisible = true;
            this.isVisible = true;
        }
    }

    hide(): void {
        if (this.container) {
            this.container.isVisible = false;
            this.isVisible = false;
        }
    }

    dispose(): void {
        if (this.container) {
            this.container.dispose();
            this.container = null;
        }
        this.enemiesRemainingText = null;
        this.playersAliveText = null;
        this.timerText = null;
        this.titleText = null;
    }
}
