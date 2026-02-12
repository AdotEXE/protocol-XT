/**
 * @module hud/components/FFAHUD
 * @description HUD компонент для режима Free-for-All
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface FFAHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    accentColor: string;
    fontSize: number;
    top: number;
    left: number;
}

export const DEFAULT_CONFIG: FFAHUDConfig = {
    containerWidth: 250,
    containerHeight: 100,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    accentColor: "#ffaa00",
    fontSize: 12,
    top: 20,
    left: 20
};

export class FFAHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: FFAHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private killsText: TextBlock | null = null;
    private killLimitText: TextBlock | null = null;
    private timerText: TextBlock | null = null;
    private leaderboardText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<FFAHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("ffaHUDContainer");
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
        this.titleText = new TextBlock("ffaHUDTitle");
        this.titleText.text = "⚔️ FREE-FOR-ALL";
        this.titleText.color = this.config.accentColor;
        this.titleText.fontSize = this.config.fontSize + 2;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Убийства игрока
        this.killsText = new TextBlock("ffaKills");
        this.killsText.text = "Убийств: 0";
        this.killsText.color = "#0f0";
        this.killsText.fontSize = this.config.fontSize;
        this.killsText.fontFamily = "'Press Start 2P', monospace";
        this.killsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.killsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.killsText.top = "35px";
        this.killsText.left = "10px";
        this.container.addControl(this.killsText);

        // Лимит убийств
        this.killLimitText = new TextBlock("ffaKillLimit");
        this.killLimitText.text = "Лимит: 20";
        this.killLimitText.color = "#fff";
        this.killLimitText.fontSize = this.config.fontSize - 2;
        this.killLimitText.fontFamily = "'Press Start 2P', monospace";
        this.killLimitText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.killLimitText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.killLimitText.top = "55px";
        this.killLimitText.left = "10px";
        this.container.addControl(this.killLimitText);

        // Таймер
        this.timerText = new TextBlock("ffaTimer");
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
        playerKills: number;
        killLimit: number;
        gameTime: number; // в секундах
        leaderboard?: Array<{ name: string; kills: number }>; // Топ-3 игрока
    }): void {
        if (!this.container || !this.isVisible) return;

        // Обновляем убийства
        if (this.killsText) {
            this.killsText.text = `Убийств: ${data.playerKills}`;
            // Меняем цвет если близко к лимиту
            if (data.playerKills >= data.killLimit * 0.8) {
                this.killsText.color = "#ffaa00";
            } else if (data.playerKills >= data.killLimit * 0.9) {
                this.killsText.color = "#ff0000";
            } else {
                this.killsText.color = "#0f0";
            }
        }

        // Обновляем лимит
        if (this.killLimitText) {
            this.killLimitText.text = `Лимит: ${data.killLimit}`;
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
        this.killsText = null;
        this.killLimitText = null;
        this.timerText = null;
        this.titleText = null;
    }
}
