/**
 * @module hud/components/BattleRoyaleHUD
 * @description HUD компонент для режима Battle Royale
 */

import { Rectangle, TextBlock, Control, AdvancedDynamicTexture } from "@babylonjs/gui";
import type { SafeZoneData } from "../../battleRoyale";

export interface BattleRoyaleHUDConfig {
    containerWidth: number;
    containerHeight: number;
    backgroundColor: string;
    safeColor: string;
    dangerColor: string;
    warningColor: string;
    fontSize: number;
    top: number;
    left: number;
}

export const DEFAULT_CONFIG: BattleRoyaleHUDConfig = {
    containerWidth: 300,
    containerHeight: 150,
    backgroundColor: "rgba(0, 20, 0, 0.85)",
    safeColor: "#00ff00",
    dangerColor: "#ff0000",
    warningColor: "#ffff00",
    fontSize: 12,
    top: 20,
    left: 20
};

export class BattleRoyaleHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: BattleRoyaleHUDConfig;
    private container: Rectangle | null = null;
    private playersAliveText: TextBlock | null = null;
    private zoneStatusText: TextBlock | null = null;
    private zoneRadiusText: TextBlock | null = null;
    private timeUntilShrinkText: TextBlock | null = null;
    private distanceToZoneText: TextBlock | null = null;
    private damageText: TextBlock | null = null;
    private isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<BattleRoyaleHUDConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Контейнер
        this.container = new Rectangle("brHUDContainer");
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
        const title = new TextBlock("brHUDTitle");
        title.text = "👑 BATTLE ROYALE";
        title.color = "#ffaa00";
        title.fontSize = this.config.fontSize + 2;
        title.fontFamily = "'Press Start 2P', monospace";
        title.fontWeight = "bold";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        title.top = "10px";
        title.left = "10px";
        this.container.addControl(title);

        // Игроков осталось
        this.playersAliveText = new TextBlock("brPlayersAlive");
        this.playersAliveText.text = "Игроков: 0/0";
        this.playersAliveText.color = "#0f0";
        this.playersAliveText.fontSize = this.config.fontSize;
        this.playersAliveText.fontFamily = "'Press Start 2P', monospace";
        this.playersAliveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.playersAliveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.playersAliveText.top = "35px";
        this.playersAliveText.left = "10px";
        this.container.addControl(this.playersAliveText);

        // Статус зоны
        this.zoneStatusText = new TextBlock("brZoneStatus");
        this.zoneStatusText.text = "ЗОНА: БЕЗОПАСНА";
        this.zoneStatusText.color = this.config.safeColor;
        this.zoneStatusText.fontSize = this.config.fontSize;
        this.zoneStatusText.fontFamily = "'Press Start 2P', monospace";
        this.zoneStatusText.fontWeight = "bold";
        this.zoneStatusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.zoneStatusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.zoneStatusText.top = "55px";
        this.zoneStatusText.left = "10px";
        this.container.addControl(this.zoneStatusText);

        // Радиус зоны
        this.zoneRadiusText = new TextBlock("brZoneRadius");
        this.zoneRadiusText.text = "Радиус: 200m";
        this.zoneRadiusText.color = "#fff";
        this.zoneRadiusText.fontSize = this.config.fontSize - 2;
        this.zoneRadiusText.fontFamily = "'Press Start 2P', monospace";
        this.zoneRadiusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.zoneRadiusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.zoneRadiusText.top = "75px";
        this.zoneRadiusText.left = "10px";
        this.container.addControl(this.zoneRadiusText);

        // Время до сжатия
        this.timeUntilShrinkText = new TextBlock("brTimeUntilShrink");
        this.timeUntilShrinkText.text = "Сжатие: --:--";
        this.timeUntilShrinkText.color = "#ffff00";
        this.timeUntilShrinkText.fontSize = this.config.fontSize - 2;
        this.timeUntilShrinkText.fontFamily = "'Press Start 2P', monospace";
        this.timeUntilShrinkText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.timeUntilShrinkText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.timeUntilShrinkText.top = "95px";
        this.timeUntilShrinkText.left = "10px";
        this.container.addControl(this.timeUntilShrinkText);

        // Расстояние до зоны
        this.distanceToZoneText = new TextBlock("brDistanceToZone");
        this.distanceToZoneText.text = "До зоны: 0m";
        this.distanceToZoneText.color = "#fff";
        this.distanceToZoneText.fontSize = this.config.fontSize - 2;
        this.distanceToZoneText.fontFamily = "'Press Start 2P', monospace";
        this.distanceToZoneText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.distanceToZoneText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.distanceToZoneText.top = "115px";
        this.distanceToZoneText.left = "10px";
        this.container.addControl(this.distanceToZoneText);

        // Урон вне зоны
        this.damageText = new TextBlock("brDamage");
        this.damageText.text = "";
        this.damageText.color = this.config.dangerColor;
        this.damageText.fontSize = this.config.fontSize;
        this.damageText.fontFamily = "'Press Start 2P', monospace";
        this.damageText.fontWeight = "bold";
        this.damageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.damageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.damageText.top = "135px";
        this.damageText.left = "10px";
        this.container.addControl(this.damageText);
    }

    update(data: {
        playersAlive: number;
        totalPlayers: number;
        zoneData: SafeZoneData | null;
        playerPosition: { x: number; y: number; z: number };
        isInZone: boolean;
    }): void {
        if (!this.container || !this.isVisible) return;

        // Игроков осталось
        if (this.playersAliveText) {
            this.playersAliveText.text = `Игроков: ${data.playersAlive}/${data.totalPlayers}`;
            const color = data.playersAlive <= 5 ? this.config.dangerColor : "#0f0";
            this.playersAliveText.color = color;
        }

        if (!data.zoneData) return;

        const zone = data.zoneData;
        const distance = this.calculateDistanceToZone(data.playerPosition, zone);

        // Статус зоны
        if (this.zoneStatusText) {
            if (data.isInZone) {
                this.zoneStatusText.text = "ЗОНА: БЕЗОПАСНА";
                this.zoneStatusText.color = this.config.safeColor;
            } else {
                this.zoneStatusText.text = "ЗОНА: ОПАСНОСТЬ!";
                this.zoneStatusText.color = this.config.dangerColor;
            }
        }

        // Радиус зоны
        if (this.zoneRadiusText) {
            this.zoneRadiusText.text = `Радиус: ${Math.round(zone.radius)}m`;
        }

        // Время до сжатия
        if (this.timeUntilShrinkText) {
            const time = zone.timeUntilShrink || 0;
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            this.timeUntilShrinkText.text = `Сжатие: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.timeUntilShrinkText.color = time < 30 ? this.config.warningColor : "#ffff00";
        }

        // Расстояние до зоны
        if (this.distanceToZoneText) {
            if (data.isInZone) {
                this.distanceToZoneText.text = "В безопасной зоне";
                this.distanceToZoneText.color = this.config.safeColor;
            } else {
                this.distanceToZoneText.text = `До зоны: ${Math.round(distance)}m`;
                this.distanceToZoneText.color = distance < 50 ? this.config.warningColor : this.config.dangerColor;
            }
        }

        // Урон вне зоны
        if (this.damageText) {
            if (!data.isInZone && zone.damagePerSecond) {
                this.damageText.text = `⚠ УРОН: ${zone.damagePerSecond.toFixed(1)}/сек`;
                this.damageText.isVisible = true;
            } else {
                this.damageText.isVisible = false;
            }
        }
    }

    private calculateDistanceToZone(playerPos: { x: number; y: number; z: number }, zone: SafeZoneData): number {
        const dx = playerPos.x - zone.center.x;
        const dz = playerPos.z - zone.center.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return Math.max(0, distance - zone.radius);
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
        this.playersAliveText = null;
        this.zoneStatusText = null;
        this.zoneRadiusText = null;
        this.timeUntilShrinkText = null;
        this.distanceToZoneText = null;
        this.damageText = null;
    }
}
