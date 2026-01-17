/**
 * @module hud/components/DeathScreen
 * @description Экран смерти с статистикой сессии и таймером респавна
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";

export interface DeathScreenConfig {
    respawnTime: number;
    backgroundColor: string;
    titleColor: string;
    statsBackgroundColor: string;
}

export const DEFAULT_DEATH_SCREEN_CONFIG: DeathScreenConfig = {
    respawnTime: 3,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    titleColor: "#ff0000",
    statsBackgroundColor: "rgba(20, 0, 0, 0.8)"
};

export class DeathScreen {
    private guiTexture: AdvancedDynamicTexture;
    private config: DeathScreenConfig;

    private container: Rectangle | null = null;
    private statsContainer: Rectangle | null = null;
    private killsText: TextBlock | null = null;
    private damageText: TextBlock | null = null;
    private timeText: TextBlock | null = null;
    private respawnText: TextBlock | null = null;

    private sessionKills = 0;
    private sessionDamage = 0;
    private sessionStartTime = Date.now();

    private onRespawnCallback: (() => void) | null = null;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<DeathScreenConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_DEATH_SCREEN_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Основной контейнер экрана смерти
        this.container = new Rectangle("deathScreen");
        this.container.width = "100%";
        this.container.height = "100%";
        this.container.background = this.config.backgroundColor;
        this.container.thickness = 0;
        this.container.isVisible = false;
        this.container.zIndex = 500;
        this.guiTexture.addControl(this.container);

        // Заголовок DESTROYED
        const title = new TextBlock("deathTitle");
        title.text = "💀 DESTROYED 💀";
        title.color = this.config.titleColor;
        title.fontSize = 48;
        title.fontWeight = "bold";
        title.fontFamily = "'Press Start 2P', monospace";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        title.top = "-150px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.addControl(title);

        // Контейнер для статистики
        this.statsContainer = new Rectangle("deathStats");
        this.statsContainer.width = "400px";
        this.statsContainer.height = "200px";
        this.statsContainer.background = this.config.statsBackgroundColor;
        this.statsContainer.thickness = 2;
        this.statsContainer.color = "#f00";
        this.statsContainer.cornerRadius = 10;
        this.statsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.statsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.statsContainer.top = "0px";
        this.container.addControl(this.statsContainer);

        // Заголовок статистики
        const statsTitle = new TextBlock("statsTitle");
        statsTitle.text = "📊 SESSION STATS";
        statsTitle.color = "#ff6666";
        statsTitle.fontSize = 16;
        statsTitle.fontFamily = "'Press Start 2P', monospace";
        statsTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        statsTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        statsTitle.top = "-80px";
        statsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.statsContainer.addControl(statsTitle);

        // Убийства
        this.killsText = new TextBlock("deathKills");
        this.killsText.text = "☠ Kills: 0";
        this.killsText.color = "#0f0";
        this.killsText.fontSize = 14;
        this.killsText.fontFamily = "'Press Start 2P', monospace";
        this.killsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.killsText.top = "-30px";
        this.killsText.left = "0px";
        this.killsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.statsContainer.addControl(this.killsText);

        // Урон
        this.damageText = new TextBlock("deathDamage");
        this.damageText.text = "💥 Damage: 0";
        this.damageText.color = "#ff8800";
        this.damageText.fontSize = 14;
        this.damageText.fontFamily = "'Press Start 2P', monospace";
        this.damageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.damageText.top = "10px";
        this.damageText.left = "0px";
        this.damageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.statsContainer.addControl(this.damageText);

        // Время игры
        this.timeText = new TextBlock("deathTime");
        this.timeText.text = "⏱ Time: 0:00";
        this.timeText.color = "#88ffff";
        this.timeText.fontSize = 14;
        this.timeText.fontFamily = "'Press Start 2P', monospace";
        this.timeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.timeText.top = "50px";
        this.timeText.left = "0px";
        this.timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.statsContainer.addControl(this.timeText);

        // Таймер респавна
        this.respawnText = new TextBlock("deathRespawn");
        this.respawnText.text = "RESPAWN IN 3...";
        this.respawnText.color = "#ffff00";
        this.respawnText.fontSize = 20;
        this.respawnText.fontFamily = "'Press Start 2P', monospace";
        this.respawnText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.respawnText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.respawnText.top = "150px";
        this.respawnText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.container.addControl(this.respawnText);
    }

    show(onRespawn?: () => void): void {
        if (!this.container) return;

        this.onRespawnCallback = onRespawn || null;

        // Обновляем статистику
        const sessionTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        const minutes = Math.floor(sessionTime / 60);
        const seconds = sessionTime % 60;

        if (this.killsText) {
            this.killsText.text = `☠ Kills: ${this.sessionKills}`;
        }
        if (this.damageText) {
            this.damageText.text = `💥 Damage: ${this.sessionDamage}`;
        }
        if (this.timeText) {
            this.timeText.text = `⏱ Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        this.container.isVisible = true;

        // Анимация обратного отсчёта
        let countdown = this.config.respawnTime;
        const updateCountdown = () => {
            if (this.respawnText && this.container?.isVisible) {
                if (countdown > 0) {
                    this.respawnText.text = `RESPAWN IN ${countdown}...`;
                    countdown--;
                    setTimeout(updateCountdown, 1000);
                } else {
                    this.respawnText.text = "RESPAWNING...";
                    setTimeout(() => {
                        this.hide();
                        if (this.onRespawnCallback) {
                            this.onRespawnCallback();
                        }
                    }, 500);
                }
            }
        };
        updateCountdown();
    }

    hide(): void {
        if (this.container) {
            this.container.isVisible = false;
        }
    }

    isVisible(): boolean {
        return this.container?.isVisible ?? false;
    }

    addKill(): void {
        this.sessionKills++;
    }

    addDamage(amount: number): void {
        this.sessionDamage += amount;
    }

    resetSession(): void {
        this.sessionKills = 0;
        this.sessionDamage = 0;
        this.sessionStartTime = Date.now();
    }

    getSessionStats(): { kills: number; damage: number; time: number } {
        return {
            kills: this.sessionKills,
            damage: this.sessionDamage,
            time: Math.floor((Date.now() - this.sessionStartTime) / 1000)
        };
    }

    updateTimer(seconds: number): void {
        if (this.respawnText) {
            if (seconds > 0) {
                this.respawnText.text = `RESPAWN IN ${Math.ceil(seconds)}...`;
            } else {
                this.respawnText.text = "RESPAWNING...";
            }
        }
    }

    dispose(): void {
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

export default DeathScreen;

