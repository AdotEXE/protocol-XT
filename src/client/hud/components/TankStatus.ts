/**
 * @module hud/components/TankStatus
 * @description Компонент сводного статуса танка (здоровье, топливо, броня)
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS } from "../HUDConstants";

export interface TankStatusData {
    health: number;
    maxHealth: number;
    fuel: number;
    maxFuel: number;
    armor: number;
}

export interface TankStatusConfig {
    width: number;
    height: number;
    showHealth: boolean;
    showFuel: boolean;
    showArmor: boolean;
    fontSize: number;
}

export const DEFAULT_TANK_STATUS_CONFIG: TankStatusConfig = {
    width: 200,
    height: 48,
    showHealth: true,
    showFuel: true,
    showArmor: true,
    fontSize: 12
};

/**
 * TankStatus - сводный индикатор статуса танка (здоровье/топливо/броня).
 * Может использоваться как единый блок или данные передаются в HealthBar/FuelIndicator отдельно.
 */
export class TankStatus {
    private guiTexture: AdvancedDynamicTexture;
    private config: TankStatusConfig;
    private container: Rectangle | null = null;
    private statusText: TextBlock | null = null;
    private data: TankStatusData = { health: 100, maxHealth: 100, fuel: 100, maxFuel: 100, armor: 0 };

    constructor(guiTexture: AdvancedDynamicTexture, config: Partial<TankStatusConfig> = {}) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_TANK_STATUS_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        this.container = new Rectangle("tankStatusContainer");
        this.container.width = `${this.config.width}px`;
        this.container.height = `${this.config.height}px`;
        this.container.thickness = 0;
        this.container.background = HUD_COLORS.BG_PANEL;
        this.container.thickness = 1;
        this.container.color = HUD_COLORS.PRIMARY;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.left = "20px";
        this.container.top = "-80px";
        this.guiTexture.addControl(this.container);

        this.statusText = new TextBlock("tankStatusText");
        this.statusText.text = "HP 100% | Fuel 100%";
        this.statusText.color = "white";
        this.statusText.fontSize = this.config.fontSize;
        this.statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        if (this.container) this.container.addControl(this.statusText);
    }

    update(data: Partial<TankStatusData>): void {
        this.data = { ...this.data, ...data };
        if (!this.statusText) return;
        const hp = this.data.maxHealth > 0 ? Math.round((this.data.health / this.data.maxHealth) * 100) : 0;
        const fuel = this.data.maxFuel > 0 ? Math.round((this.data.fuel / this.data.maxFuel) * 100) : 0;
        this.statusText.text = `HP ${hp}% | Fuel ${fuel}%${this.config.showArmor ? ` | Armor ${this.data.armor}` : ""}`;
    }

    setVisible(visible: boolean): void {
        if (this.container) this.container.isVisible = visible;
    }

    dispose(): void {
        this.container?.dispose();
        this.container = null;
        this.statusText = null;
    }
}
