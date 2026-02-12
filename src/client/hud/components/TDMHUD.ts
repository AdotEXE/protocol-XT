/**
 * @module hud/components/TDMHUD
 * @description HUD компонент для режима Team Deathmatch
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface TDMHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    team0Color: string;
    team1Color: string;
    fontSize: number;
    top: number;
    centerX: number;
}

export const DEFAULT_CONFIG: TDMHUDConfig = {
    containerWidth: 400,
    containerHeight: 120,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    team0Color: "#4444ff",
    team1Color: "#ff4444",
    fontSize: 14,
    top: 20,
    centerX: 0
};

export class TDMHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: TDMHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private team0ScoreText: TextBlock | null = null;
    private team1ScoreText: TextBlock | null = null;
    private vsText: TextBlock | null = null;
    private killLimitText: TextBlock | null = null;
    private timerText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<TDMHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("tdmHUDContainer");
        this.container.width = `${this.config.containerWidth}px`;
        this.container.height = `${this.config.containerHeight}px`;
        this.container.background = this.config.backgroundColor;
        this.container.thickness = 2;
        this.container.color = "#0f0";
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = `${this.config.top}px`;
        this.container.isVisible = false;
        this.container.zIndex = 200;
        this.guiTexture.addControl(this.container);

        // Заголовок
        this.titleText = new TextBlock("tdmHUDTitle");
        this.titleText.text = "⚔️ TEAM DEATHMATCH";
        this.titleText.color = "#0f0";
        this.titleText.fontSize = this.config.fontSize;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.container.addControl(this.titleText);

        // Счет команды 0 (Синие)
        this.team0ScoreText = new TextBlock("tdmTeam0Score");
        this.team0ScoreText.text = "СИНИЕ: 0";
        this.team0ScoreText.color = this.config.team0Color;
        this.team0ScoreText.fontSize = this.config.fontSize + 4;
        this.team0ScoreText.fontFamily = "'Press Start 2P', monospace";
        this.team0ScoreText.fontWeight = "bold";
        this.team0ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team0ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team0ScoreText.top = "40px";
        this.team0ScoreText.left = "20px";
        this.container.addControl(this.team0ScoreText);

        // VS текст
        this.vsText = new TextBlock("tdmVS");
        this.vsText.text = "VS";
        this.vsText.color = "#fff";
        this.vsText.fontSize = this.config.fontSize + 2;
        this.vsText.fontFamily = "'Press Start 2P', monospace";
        this.vsText.fontWeight = "bold";
        this.vsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.vsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.vsText.top = "45px";
        this.container.addControl(this.vsText);

        // Счет команды 1 (Красные)
        this.team1ScoreText = new TextBlock("tdmTeam1Score");
        this.team1ScoreText.text = "КРАСНЫЕ: 0";
        this.team1ScoreText.color = this.config.team1Color;
        this.team1ScoreText.fontSize = this.config.fontSize + 4;
        this.team1ScoreText.fontFamily = "'Press Start 2P', monospace";
        this.team1ScoreText.fontWeight = "bold";
        this.team1ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.team1ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team1ScoreText.top = "40px";
        this.team1ScoreText.left = "-20px";
        this.container.addControl(this.team1ScoreText);

        // Лимит убийств
        this.killLimitText = new TextBlock("tdmKillLimit");
        this.killLimitText.text = "Лимит: 50";
        this.killLimitText.color = "#888";
        this.killLimitText.fontSize = this.config.fontSize - 2;
        this.killLimitText.fontFamily = "'Press Start 2P', monospace";
        this.killLimitText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.killLimitText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.killLimitText.top = "80px";
        this.container.addControl(this.killLimitText);

        // Таймер
        this.timerText = new TextBlock("tdmTimer");
        this.timerText.text = "Время: 00:00";
        this.timerText.color = "#ffff00";
        this.timerText.fontSize = this.config.fontSize - 2;
        this.timerText.fontFamily = "'Press Start 2P', monospace";
        this.timerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.timerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.timerText.top = "100px";
        this.container.addControl(this.timerText);
    }

    update(data: {
        team0Kills: number;
        team1Kills: number;
        killLimit: number;
        gameTime: number; // в секундах
        playerTeam?: number; // Команда игрока (0 или 1)
    }): void {
        if (!this.container || !this.isVisible) return;

        // Обновляем счет команд
        if (this.team0ScoreText) {
            this.team0ScoreText.text = `СИНИЕ: ${data.team0Kills}`;
            // Подсвечиваем если команда игрока лидирует
            if (data.playerTeam === 0 && data.team0Kills > data.team1Kills) {
                this.team0ScoreText.color = "#00ff00";
            } else {
                this.team0ScoreText.color = this.config.team0Color;
            }
        }

        if (this.team1ScoreText) {
            this.team1ScoreText.text = `КРАСНЫЕ: ${data.team1Kills}`;
            // Подсвечиваем если команда игрока лидирует
            if (data.playerTeam === 1 && data.team1Kills > data.team0Kills) {
                this.team1ScoreText.color = "#00ff00";
            } else {
                this.team1ScoreText.color = this.config.team1Color;
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
        this.team0ScoreText = null;
        this.team1ScoreText = null;
        this.vsText = null;
        this.killLimitText = null;
        this.timerText = null;
        this.titleText = null;
    }
}
