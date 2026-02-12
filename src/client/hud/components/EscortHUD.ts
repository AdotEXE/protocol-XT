/**
 * @module hud/components/EscortHUD
 * @description HUD компонент для режима Escort
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface EscortPayloadData {
    position: { x: number; y: number; z: number };
    health: number;
    maxHealth: number;
    progress: number; // 0-1
    isMoving: boolean;
    attackersNearby: number;
    defendersNearby: number;
}

export interface EscortHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    attackerColor: string;
    defenderColor: string;
    fontSize: number;
    top: number;
    left: number;
}

export const DEFAULT_CONFIG: EscortHUDConfig = {
    containerWidth: 320,
    containerHeight: 180,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    attackerColor: "#00ff00",
    defenderColor: "#ff0000",
    fontSize: 11,
    top: 20,
    left: 20
};

export class EscortHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: EscortHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private progressText: TextBlock | null = null;
    private progressBar: Rectangle | null = null;
    private progressFill: Rectangle | null = null;
    private healthText: TextBlock | null = null;
    private healthBar: Rectangle | null = null;
    private healthFill: Rectangle | null = null;
    private statusText: TextBlock | null = null;
    private playersText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<EscortHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("escortHUDContainer");
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
        this.titleText = new TextBlock("escortHUDTitle");
        this.titleText.text = "🚛 СОПРОВОЖДЕНИЕ";
        this.titleText.color = "#0f0";
        this.titleText.fontSize = this.config.fontSize + 1;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Прогресс доставки
        const progressLabel = new TextBlock("escortProgressLabel");
        progressLabel.text = "Прогресс доставки:";
        progressLabel.color = "#fff";
        progressLabel.fontSize = this.config.fontSize - 2;
        progressLabel.fontFamily = "'Press Start 2P', monospace";
        progressLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        progressLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        progressLabel.top = "35px";
        progressLabel.left = "10px";
        this.container.addControl(progressLabel);

        this.progressBar = new Rectangle("escortProgressBar");
        this.progressBar.width = "300px";
        this.progressBar.height = "12px";
        this.progressBar.background = "rgba(255, 255, 255, 0.2)";
        this.progressBar.thickness = 1;
        this.progressBar.color = "#0f0";
        this.progressBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.progressBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.progressBar.top = "55px";
        this.progressBar.left = "10px";
        this.container.addControl(this.progressBar);

        this.progressFill = new Rectangle("escortProgressFill");
        this.progressFill.width = "0%";
        this.progressFill.height = "12px";
        this.progressFill.background = this.config.attackerColor;
        this.progressFill.thickness = 0;
        this.progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.progressFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.progressFill.top = "0px";
        this.progressFill.left = "0px";
        this.progressBar.addControl(this.progressFill);

        this.progressText = new TextBlock("escortProgressText");
        this.progressText.text = "0%";
        this.progressText.color = "#0f0";
        this.progressText.fontSize = this.config.fontSize;
        this.progressText.fontFamily = "'Press Start 2P', monospace";
        this.progressText.fontWeight = "bold";
        this.progressText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.progressText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.progressBar.addControl(this.progressText);

        // Здоровье конвоя
        const healthLabel = new TextBlock("escortHealthLabel");
        healthLabel.text = "Здоровье конвоя:";
        healthLabel.color = "#fff";
        healthLabel.fontSize = this.config.fontSize - 2;
        healthLabel.fontFamily = "'Press Start 2P', monospace";
        healthLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        healthLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        healthLabel.top = "75px";
        healthLabel.left = "10px";
        this.container.addControl(healthLabel);

        this.healthBar = new Rectangle("escortHealthBar");
        this.healthBar.width = "300px";
        this.healthBar.height = "12px";
        this.healthBar.background = "rgba(255, 0, 0, 0.2)";
        this.healthBar.thickness = 1;
        this.healthBar.color = "#f00";
        this.healthBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.healthBar.top = "95px";
        this.healthBar.left = "10px";
        this.container.addControl(this.healthBar);

        this.healthFill = new Rectangle("escortHealthFill");
        this.healthFill.width = "100%";
        this.healthFill.height = "12px";
        this.healthFill.background = "#0f0";
        this.healthFill.thickness = 0;
        this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.healthFill.top = "0px";
        this.healthFill.left = "0px";
        this.healthBar.addControl(this.healthFill);

        this.healthText = new TextBlock("escortHealthText");
        this.healthText.text = "100%";
        this.healthText.color = "#0f0";
        this.healthText.fontSize = this.config.fontSize;
        this.healthText.fontFamily = "'Press Start 2P', monospace";
        this.healthText.fontWeight = "bold";
        this.healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthBar.addControl(this.healthText);

        // Статус
        this.statusText = new TextBlock("escortStatus");
        this.statusText.text = "Ожидание...";
        this.statusText.color = "#888";
        this.statusText.fontSize = this.config.fontSize - 2;
        this.statusText.fontFamily = "'Press Start 2P', monospace";
        this.statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.statusText.top = "115px";
        this.statusText.left = "10px";
        this.container.addControl(this.statusText);

        // Игроки рядом
        this.playersText = new TextBlock("escortPlayers");
        this.playersText.text = "";
        this.playersText.color = "#fff";
        this.playersText.fontSize = this.config.fontSize - 3;
        this.playersText.fontFamily = "'Press Start 2P', monospace";
        this.playersText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.playersText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.playersText.top = "135px";
        this.playersText.left = "10px";
        this.container.addControl(this.playersText);
    }

    update(data: EscortPayloadData, playerTeam: number | null): void {
        if (!this.container || !this.isVisible) return;

        // Прогресс доставки
        const progressPercent = Math.round(data.progress * 100);
        if (this.progressFill) {
            this.progressFill.width = `${progressPercent}%`;
        }
        if (this.progressText) {
            this.progressText.text = `${progressPercent}%`;
        }

        // Здоровье конвоя
        const healthPercent = (data.health / data.maxHealth) * 100;
        if (this.healthFill) {
            this.healthFill.width = `${healthPercent}%`;
            // Меняем цвет в зависимости от здоровья
            if (healthPercent > 60) {
                this.healthFill.background = "#0f0";
            } else if (healthPercent > 30) {
                this.healthFill.background = "#ffaa00";
            } else {
                this.healthFill.background = "#f00";
            }
        }
        if (this.healthText) {
            this.healthText.text = `${Math.round(healthPercent)}%`;
            this.healthText.color = healthPercent > 60 ? "#0f0" : healthPercent > 30 ? "#ffaa00" : "#f00";
        }

        // Статус
        if (this.statusText) {
            if (data.isMoving && data.attackersNearby > 0) {
                this.statusText.text = "➡ ДВИЖЕТСЯ ВПЕРЕД";
                this.statusText.color = this.config.attackerColor;
            } else if (data.defendersNearby > 0 && data.attackersNearby === 0) {
                this.statusText.text = "⬅ ОТТАЛКИВАЕТСЯ НАЗАД";
                this.statusText.color = this.config.defenderColor;
            } else {
                this.statusText.text = "⏸ ОСТАНОВЛЕН";
                this.statusText.color = "#888";
            }
        }

        // Игроки рядом
        if (this.playersText) {
            if (playerTeam === 0) {
                // Атакующие
                this.playersText.text = `Атакующих рядом: ${data.attackersNearby} | Защитников: ${data.defendersNearby}`;
            } else if (playerTeam === 1) {
                // Защитники
                this.playersText.text = `Защитников рядом: ${data.defendersNearby} | Атакующих: ${data.attackersNearby}`;
            } else {
                this.playersText.text = `Атакующих: ${data.attackersNearby} | Защитников: ${data.defendersNearby}`;
            }
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
        this.titleText = null;
        this.progressText = null;
        this.progressBar = null;
        this.progressFill = null;
        this.healthText = null;
        this.healthBar = null;
        this.healthFill = null;
        this.statusText = null;
        this.playersText = null;
    }
}
