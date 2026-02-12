/**
 * @module hud/components/SurvivalHUD
 * @description HUD компонент для режима Survival
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface SurvivalWaveData {
    currentWave: number;
    enemiesRemaining: number;
    enemiesTotal: number;
    timeUntilNextWave: number; // seconds
    waveState: "FIGHTING" | "RESTING";
    isEliteWave: boolean;
}

export interface SurvivalHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    waveColor: string;
    warningColor: string;
    fontSize: number;
    top: number;
    right: number;
}

export const DEFAULT_CONFIG: SurvivalHUDConfig = {
    containerWidth: 300,
    containerHeight: 140,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    waveColor: "#ffaa00",
    warningColor: "#ff0000",
    fontSize: 11,
    top: 20,
    right: 20
};

export class SurvivalHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: SurvivalHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private waveText: TextBlock | null = null;
    private enemiesText: TextBlock | null = null;
    private timeText: TextBlock | null = null;
    private statusText: TextBlock | null = null;
    private eliteBadge: Rectangle | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<SurvivalHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("survivalHUDContainer");
        this.container.width = `${this.config.containerWidth}px`;
        this.container.height = `${this.config.containerHeight}px`;
        this.container.background = this.config.backgroundColor;
        this.container.thickness = 2;
        this.container.color = "#0f0";
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.top = `${this.config.top}px`;
        this.container.left = `-${this.config.right}px`;
        this.container.isVisible = false;
        this.container.zIndex = 200;
        this.guiTexture.addControl(this.container);

        // Заголовок
        this.titleText = new TextBlock("survivalHUDTitle");
        this.titleText.text = "🛡️ ВЫЖИВАНИЕ";
        this.titleText.color = "#0f0";
        this.titleText.fontSize = this.config.fontSize + 1;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Текущая волна
        this.waveText = new TextBlock("survivalWave");
        this.waveText.text = "Волна: 1";
        this.waveText.color = this.config.waveColor;
        this.waveText.fontSize = this.config.fontSize + 2;
        this.waveText.fontFamily = "'Press Start 2P', monospace";
        this.waveText.fontWeight = "bold";
        this.waveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.waveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.waveText.top = "35px";
        this.waveText.left = "10px";
        this.container.addControl(this.waveText);

        // Элитная волна бейдж
        this.eliteBadge = new Rectangle("survivalEliteBadge");
        this.eliteBadge.width = "120px";
        this.eliteBadge.height = "20px";
        this.eliteBadge.background = "rgba(255, 170, 0, 0.3)";
        this.eliteBadge.thickness = 2;
        this.eliteBadge.color = "#ffaa00";
        this.eliteBadge.cornerRadius = 2;
        this.eliteBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.eliteBadge.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.eliteBadge.top = "60px";
        this.eliteBadge.left = "10px";
        this.eliteBadge.isVisible = false;
        this.container.addControl(this.eliteBadge);

        const eliteText = new TextBlock("survivalEliteText");
        eliteText.text = "⚡ ЭЛИТНАЯ ВОЛНА";
        eliteText.color = "#ffaa00";
        eliteText.fontSize = this.config.fontSize - 3;
        eliteText.fontFamily = "'Press Start 2P', monospace";
        eliteText.fontWeight = "bold";
        eliteText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        eliteText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.eliteBadge.addControl(eliteText);

        // Враги осталось
        this.enemiesText = new TextBlock("survivalEnemies");
        this.enemiesText.text = "Врагов: 0/0";
        this.enemiesText.color = "#fff";
        this.enemiesText.fontSize = this.config.fontSize;
        this.enemiesText.fontFamily = "'Press Start 2P', monospace";
        this.enemiesText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.enemiesText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.enemiesText.top = "85px";
        this.enemiesText.left = "10px";
        this.container.addControl(this.enemiesText);

        // Время до следующей волны / Статус
        this.timeText = new TextBlock("survivalTime");
        this.timeText.text = "";
        this.timeText.color = "#0f0";
        this.timeText.fontSize = this.config.fontSize;
        this.timeText.fontFamily = "'Press Start 2P', monospace";
        this.timeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.timeText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.timeText.top = "105px";
        this.timeText.left = "10px";
        this.container.addControl(this.timeText);

        // Статус
        this.statusText = new TextBlock("survivalStatus");
        this.statusText.text = "";
        this.statusText.color = "#888";
        this.statusText.fontSize = this.config.fontSize - 2;
        this.statusText.fontFamily = "'Press Start 2P', monospace";
        this.statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.statusText.top = "125px";
        this.statusText.left = "10px";
        this.container.addControl(this.statusText);
    }

    update(data: SurvivalWaveData): void {
        if (!this.container || !this.isVisible) return;

        // Текущая волна
        if (this.waveText) {
            this.waveText.text = `Волна: ${data.currentWave}`;
            if (data.isEliteWave) {
                this.waveText.color = this.config.warningColor;
            } else {
                this.waveText.color = this.config.waveColor;
            }
        }

        // Элитная волна бейдж
        if (this.eliteBadge) {
            this.eliteBadge.isVisible = data.isEliteWave;
        }

        // Враги осталось
        if (this.enemiesText) {
            this.enemiesText.text = `Врагов: ${data.enemiesRemaining}/${data.enemiesTotal}`;
            if (data.enemiesRemaining === 0 && data.waveState === "FIGHTING") {
                this.enemiesText.color = "#0f0";
            } else {
                this.enemiesText.color = "#fff";
            }
        }

        // Время / Статус
        if (data.waveState === "RESTING") {
            if (this.timeText) {
                const minutes = Math.floor(data.timeUntilNextWave / 60);
                const seconds = Math.floor(data.timeUntilNextWave % 60);
                this.timeText.text = `Следующая волна: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                this.timeText.color = "#0f0";
            }
            if (this.statusText) {
                this.statusText.text = "⏸ ПОДГОТОВКА";
                this.statusText.color = "#0f0";
            }
        } else {
            if (this.timeText) {
                this.timeText.text = "⚔ БОЙ";
                this.timeText.color = this.config.warningColor;
            }
            if (this.statusText) {
                if (data.enemiesRemaining === 0) {
                    this.statusText.text = "✅ ВОЛНА ЗАВЕРШЕНА";
                    this.statusText.color = "#0f0";
                } else {
                    this.statusText.text = "Уничтожьте всех врагов!";
                    this.statusText.color = "#fff";
                }
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
        this.waveText = null;
        this.enemiesText = null;
        this.timeText = null;
        this.statusText = null;
        this.eliteBadge = null;
    }
}
