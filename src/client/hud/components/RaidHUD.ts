/**
 * @module hud/components/RaidHUD
 * @description HUD компонент для режима Raid
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";

export interface RaidBossData {
    id: string;
    name: string;
    health: number;
    maxHealth: number;
    phase: number; // 1, 2, 3...
    isEnraged: boolean;
    minionsCount: number;
}

export interface RaidHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    bossColor: string;
    phaseColor: string;
    fontSize: number;
    top: number;
    left: number;
}

export const DEFAULT_CONFIG: RaidHUDConfig = {
    containerWidth: 350,
    containerHeight: 200,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    bossColor: "#ff0000",
    phaseColor: "#ffaa00",
    fontSize: 11,
    top: 20,
    left: 20
};

export class RaidHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: RaidHUDConfig;
    private container: Rectangle | null = null;
    private titleText: TextBlock | null = null;
    private bossNameText: TextBlock | null = null;
    private bossHealthBar: Rectangle | null = null;
    private bossHealthFill: Rectangle | null = null;
    private bossHealthText: TextBlock | null = null;
    private phaseText: TextBlock | null = null;
    private minionsText: TextBlock | null = null;
    private progressText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<RaidHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("raidHUDContainer");
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
        this.titleText = new TextBlock("raidHUDTitle");
        this.titleText.text = "🐉 РЕЙД";
        this.titleText.color = "#0f0";
        this.titleText.fontSize = this.config.fontSize + 1;
        this.titleText.fontFamily = "'Press Start 2P', monospace";
        this.titleText.fontWeight = "bold";
        this.titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.titleText.top = "10px";
        this.titleText.left = "10px";
        this.container.addControl(this.titleText);

        // Имя босса
        this.bossNameText = new TextBlock("raidBossName");
        this.bossNameText.text = "Босс не найден";
        this.bossNameText.color = this.config.bossColor;
        this.bossNameText.fontSize = this.config.fontSize + 1;
        this.bossNameText.fontFamily = "'Press Start 2P', monospace";
        this.bossNameText.fontWeight = "bold";
        this.bossNameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.bossNameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.bossNameText.top = "35px";
        this.bossNameText.left = "10px";
        this.container.addControl(this.bossNameText);

        // Полоса здоровья босса
        this.bossHealthBar = new Rectangle("raidBossHealthBar");
        this.bossHealthBar.width = "330px";
        this.bossHealthBar.height = "20px";
        this.bossHealthBar.background = "rgba(255, 0, 0, 0.2)";
        this.bossHealthBar.thickness = 2;
        this.bossHealthBar.color = this.config.bossColor;
        this.bossHealthBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.bossHealthBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.bossHealthBar.top = "60px";
        this.bossHealthBar.left = "10px";
        this.container.addControl(this.bossHealthBar);

        this.bossHealthFill = new Rectangle("raidBossHealthFill");
        this.bossHealthFill.width = "100%";
        this.bossHealthFill.height = "20px";
        this.bossHealthFill.background = this.config.bossColor;
        this.bossHealthFill.thickness = 0;
        this.bossHealthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.bossHealthFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.bossHealthFill.top = "0px";
        this.bossHealthFill.left = "0px";
        this.bossHealthBar.addControl(this.bossHealthFill);

        this.bossHealthText = new TextBlock("raidBossHealthText");
        this.bossHealthText.text = "100%";
        this.bossHealthText.color = "#fff";
        this.bossHealthText.fontSize = this.config.fontSize;
        this.bossHealthText.fontFamily = "'Press Start 2P', monospace";
        this.bossHealthText.fontWeight = "bold";
        this.bossHealthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.bossHealthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.bossHealthBar.addControl(this.bossHealthText);

        // Фаза босса
        this.phaseText = new TextBlock("raidPhase");
        this.phaseText.text = "Фаза: 1";
        this.phaseText.color = this.config.phaseColor;
        this.phaseText.fontSize = this.config.fontSize;
        this.phaseText.fontFamily = "'Press Start 2P', monospace";
        this.phaseText.fontWeight = "bold";
        this.phaseText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.phaseText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.phaseText.top = "90px";
        this.phaseText.left = "10px";
        this.container.addControl(this.phaseText);

        // Миньоны
        this.minionsText = new TextBlock("raidMinions");
        this.minionsText.text = "Миньонов: 0";
        this.minionsText.color = "#fff";
        this.minionsText.fontSize = this.config.fontSize - 1;
        this.minionsText.fontFamily = "'Press Start 2P', monospace";
        this.minionsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.minionsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.minionsText.top = "115px";
        this.minionsText.left = "10px";
        this.container.addControl(this.minionsText);

        // Прогресс рейда
        this.progressText = new TextBlock("raidProgress");
        this.progressText.text = "Боссов побеждено: 0/3";
        this.progressText.color = "#0f0";
        this.progressText.fontSize = this.config.fontSize - 1;
        this.progressText.fontFamily = "'Press Start 2P', monospace";
        this.progressText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.progressText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.progressText.top = "140px";
        this.progressText.left = "10px";
        this.container.addControl(this.progressText);
    }

    update(data: {
        boss: RaidBossData | null;
        bossesDefeated: number;
        totalBosses: number;
    }): void {
        if (!this.container || !this.isVisible) return;

        if (!data.boss) {
            if (this.bossNameText) {
                this.bossNameText.text = "Босс не найден";
            }
            if (this.bossHealthBar) {
                this.bossHealthBar.isVisible = false;
            }
            if (this.phaseText) {
                this.phaseText.isVisible = false;
            }
            if (this.minionsText) {
                this.minionsText.isVisible = false;
            }
            return;
        }

        const boss = data.boss;

        // Имя босса
        if (this.bossNameText) {
            this.bossNameText.text = boss.isEnraged ? `⚡ ${boss.name.toUpperCase()} [ЭНРЕЙДЖ]` : boss.name.toUpperCase();
            this.bossNameText.color = boss.isEnraged ? this.config.phaseColor : this.config.bossColor;
        }

        // Здоровье босса
        const healthPercent = (boss.health / boss.maxHealth) * 100;
        if (this.bossHealthBar) {
            this.bossHealthBar.isVisible = true;
        }
        if (this.bossHealthFill) {
            this.bossHealthFill.width = `${healthPercent}%`;
            // Меняем цвет в зависимости от здоровья
            if (healthPercent > 50) {
                this.bossHealthFill.background = this.config.bossColor;
            } else if (healthPercent > 25) {
                this.bossHealthFill.background = "#ff6600";
            } else {
                this.bossHealthFill.background = "#ff0000";
            }
        }
        if (this.bossHealthText) {
            this.bossHealthText.text = `${Math.round(healthPercent)}% (${Math.round(boss.health)}/${Math.round(boss.maxHealth)})`;
        }

        // Фаза
        if (this.phaseText) {
            this.phaseText.isVisible = true;
            this.phaseText.text = `Фаза: ${boss.phase}${boss.isEnraged ? " [ЭНРЕЙДЖ]" : ""}`;
            this.phaseText.color = boss.isEnraged ? this.config.phaseColor : this.config.phaseColor;
        }

        // Миньоны
        if (this.minionsText) {
            this.minionsText.isVisible = true;
            this.minionsText.text = `Миньонов: ${boss.minionsCount}`;
            this.minionsText.color = boss.minionsCount > 0 ? this.config.warningColor : "#fff";
        }

        // Прогресс рейда
        if (this.progressText) {
            this.progressText.text = `Боссов побеждено: ${data.bossesDefeated}/${data.totalBosses}`;
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
        this.bossNameText = null;
        this.bossHealthBar = null;
        this.bossHealthFill = null;
        this.bossHealthText = null;
        this.phaseText = null;
        this.minionsText = null;
        this.progressText = null;
    }
}
