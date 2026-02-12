/**
 * @module hud/components/CTFHUD
 * @description HUD компонент для режима Capture the Flag (улучшенный)
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface CTFFlagData {
    team: number; // 0 или 1
    status: "base" | "carried" | "dropped";
    carrierName?: string;
    position?: { x: number; y: number; z: number };
}

export interface CTFHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    team0Color: string;
    team1Color: string;
    fontSize: number;
    top: number;
    left: number;
}

export const DEFAULT_CONFIG: CTFHUDConfig = {
    containerWidth: 300,
    containerHeight: 180,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    team0Color: "#4444ff",
    team1Color: "#ff4444",
    fontSize: 11,
    top: 20,
    left: 20
};

export class CTFHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: CTFHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private team0ScoreText: TextBlock | null = null;
    private team1ScoreText: TextBlock | null = null;
    private team0FlagText: TextBlock | null = null;
    private team1FlagText: TextBlock | null = null;
    private timerText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<CTFHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("ctfHUDContainer");
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
        this.titleText = new TextBlock("ctfHUDTitle");
        this.titleText.text = "🏴 CAPTURE THE FLAG";
        this.titleText.color = "#0f0";
        this.titleText.fontSize = this.config.fontSize + 1;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Счет команды 0
        this.team0ScoreText = new TextBlock("ctfTeam0Score");
        this.team0ScoreText.text = "Синие: 0/3";
        this.team0ScoreText.color = this.config.team0Color;
        this.team0ScoreText.fontSize = this.config.fontSize;
        this.team0ScoreText.fontFamily = "'Press Start 2P', monospace";
        this.team0ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team0ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team0ScoreText.top = "35px";
        this.team0ScoreText.left = "10px";
        this.container.addControl(this.team0ScoreText);

        // Флаг команды 0
        this.team0FlagText = new TextBlock("ctfTeam0Flag");
        this.team0FlagText.text = "🏴 Синий флаг: На базе";
        this.team0FlagText.color = this.config.team0Color;
        this.team0FlagText.fontSize = this.config.fontSize - 1;
        this.team0FlagText.fontFamily = "'Press Start 2P', monospace";
        this.team0FlagText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team0FlagText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team0FlagText.top = "60px";
        this.team0FlagText.left = "10px";
        this.container.addControl(this.team0FlagText);

        // Счет команды 1
        this.team1ScoreText = new TextBlock("ctfTeam1Score");
        this.team1ScoreText.text = "Красные: 0/3";
        this.team1ScoreText.color = this.config.team1Color;
        this.team1ScoreText.fontSize = this.config.fontSize;
        this.team1ScoreText.fontFamily = "'Press Start 2P', monospace";
        this.team1ScoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team1ScoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team1ScoreText.top = "95px";
        this.team1ScoreText.left = "10px";
        this.container.addControl(this.team1ScoreText);

        // Флаг команды 1
        this.team1FlagText = new TextBlock("ctfTeam1Flag");
        this.team1FlagText.text = "🏴 Красный флаг: На базе";
        this.team1FlagText.color = this.config.team1Color;
        this.team1FlagText.fontSize = this.config.fontSize - 1;
        this.team1FlagText.fontFamily = "'Press Start 2P', monospace";
        this.team1FlagText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.team1FlagText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.team1FlagText.top = "120px";
        this.team1FlagText.left = "10px";
        this.container.addControl(this.team1FlagText);

        // Таймер
        this.timerText = new TextBlock("ctfTimer");
        this.timerText.text = "Время: 00:00";
        this.timerText.color = "#ffff00";
        this.timerText.fontSize = this.config.fontSize - 1;
        this.timerText.fontFamily = "'Press Start 2P', monospace";
        this.timerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.timerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.timerText.top = "150px";
        this.timerText.left = "10px";
        this.container.addControl(this.timerText);
    }

    update(data: {
        team0Score: number;
        team1Score: number;
        maxScore: number;
        team0Flag: CTFFlagData;
        team1Flag: CTFFlagData;
        gameTime: number; // в секундах
        playerTeam?: number; // Команда игрока
    }): void {
        if (!this.container || !this.isVisible) return;

        // Обновляем счет команд
        if (this.team0ScoreText) {
            this.team0ScoreText.text = `Синие: ${data.team0Score}/${data.maxScore}`;
            if (data.playerTeam === 0 && data.team0Score >= data.maxScore * 0.8) {
                this.team0ScoreText.color = "#00ff00";
            } else {
                this.team0ScoreText.color = this.config.team0Color;
            }
        }

        if (this.team1ScoreText) {
            this.team1ScoreText.text = `Красные: ${data.team1Score}/${data.maxScore}`;
            if (data.playerTeam === 1 && data.team1Score >= data.maxScore * 0.8) {
                this.team1ScoreText.color = "#00ff00";
            } else {
                this.team1ScoreText.color = this.config.team1Color;
            }
        }

        // Обновляем статус флагов
        if (this.team0FlagText) {
            let statusText = "На базе";
            let color = this.config.team0Color;
            if (data.team0Flag.status === "carried") {
                statusText = data.team0Flag.carrierName ? `Несет: ${data.team0Flag.carrierName}` : "Несется";
                color = "#ff0000"; // Красный если враг несет
            } else if (data.team0Flag.status === "dropped") {
                statusText = "Брошен";
                color = "#ffff00";
            }
            this.team0FlagText.text = `🏴 Синий флаг: ${statusText}`;
            this.team0FlagText.color = color;
        }

        if (this.team1FlagText) {
            let statusText = "На базе";
            let color = this.config.team1Color;
            if (data.team1Flag.status === "carried") {
                statusText = data.team1Flag.carrierName ? `Несет: ${data.team1Flag.carrierName}` : "Несется";
                color = "#ff0000"; // Красный если враг несет
            } else if (data.team1Flag.status === "dropped") {
                statusText = "Брошен";
                color = "#ffff00";
            }
            this.team1FlagText.text = `🏴 Красный флаг: ${statusText}`;
            this.team1FlagText.color = color;
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
        this.team0FlagText = null;
        this.team1FlagText = null;
        this.timerText = null;
        this.titleText = null;
    }
}
