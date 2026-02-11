/**
 * @module hud/components/AmmoIndicator
 * @description Индикатор боеприпасов танка
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    StackPanel,
    Control
} from "@babylonjs/gui";

export interface AmmoIndicatorConfig {
    fontSize: number;
    color: string;
    lowAmmoColor: string;
    criticalAmmoColor: string;
    lowAmmoThreshold: number;      // Процент (например, 30 = 30%)
    criticalAmmoThreshold: number; // Процент (например, 10 = 10%)
    showAmmoType: boolean;
    showMagazine: boolean;
}

export const DEFAULT_AMMO_CONFIG: AmmoIndicatorConfig = {
    fontSize: 14,
    color: "#0ff",
    lowAmmoColor: "#ff0",
    criticalAmmoColor: "#f00",
    lowAmmoThreshold: 30,
    criticalAmmoThreshold: 10,
    showAmmoType: true,
    showMagazine: true
};

export interface AmmoState {
    currentAmmo: number;
    maxAmmo: number;
    currentMagazine?: number;
    maxMagazine?: number;
    ammoType?: string;
    isReloading?: boolean;
}

export class AmmoIndicator {
    private guiTexture: AdvancedDynamicTexture;
    private config: AmmoIndicatorConfig;

    private container: Rectangle | null = null;
    private mainPanel: StackPanel | null = null;
    private ammoText: TextBlock | null = null;
    private ammoTypeText: TextBlock | null = null;
    private magazineText: TextBlock | null = null;
    private reloadingText: TextBlock | null = null;

    private state: AmmoState = {
        currentAmmo: 0,
        maxAmmo: 0,
        currentMagazine: 0,
        maxMagazine: 0,
        ammoType: "AP",
        isReloading: false
    };

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<AmmoIndicatorConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_AMMO_CONFIG, ...config };
        this.create();
    }

    private create(): void {
        // Главный контейнер
        this.container = new Rectangle("ammoContainer");
        this.container.width = "140px";
        this.container.height = "80px";
        this.container.thickness = 1;
        this.container.color = "rgba(0, 255, 255, 0.3)";
        this.container.background = "rgba(0, 0, 0, 0.4)";
        this.container.cornerRadius = 4;
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.left = "-20px";
        this.container.top = "-120px";
        this.container.isVisible = false; // Скрыт по умолчанию (данные в арсенал блоке)
        this.guiTexture.addControl(this.container);

        // Панель для вертикального выравнивания
        this.mainPanel = new StackPanel("ammoPanel");
        this.mainPanel.isVertical = true;
        this.mainPanel.width = "100%";
        this.mainPanel.height = "100%";
        this.mainPanel.paddingTop = "5px";
        this.mainPanel.paddingBottom = "5px";
        this.container.addControl(this.mainPanel);

        // Тип снаряда
        if (this.config.showAmmoType) {
            this.ammoTypeText = new TextBlock("ammoTypeText");
            this.ammoTypeText.text = "AP";
            this.ammoTypeText.color = "#888";
            this.ammoTypeText.fontSize = 10;
            this.ammoTypeText.fontFamily = "'Press Start 2P', monospace";
            this.ammoTypeText.height = "16px";
            this.ammoTypeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.mainPanel.addControl(this.ammoTypeText);
        }

        // Основной счётчик патронов
        this.ammoText = new TextBlock("ammoText");
        this.ammoText.text = "0 / 0";
        this.ammoText.color = this.config.color;
        this.ammoText.fontSize = this.config.fontSize + 4;
        this.ammoText.fontWeight = "bold";
        this.ammoText.fontFamily = "'Press Start 2P', monospace";
        this.ammoText.height = "24px";
        this.ammoText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.ammoText.outlineWidth = 1;
        this.ammoText.outlineColor = "#000";
        this.mainPanel.addControl(this.ammoText);

        // Магазин
        if (this.config.showMagazine) {
            this.magazineText = new TextBlock("magazineText");
            this.magazineText.text = "MAG: 0/0";
            this.magazineText.color = "#666";
            this.magazineText.fontSize = 10;
            this.magazineText.fontFamily = "'Press Start 2P', monospace";
            this.magazineText.height = "14px";
            this.magazineText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.mainPanel.addControl(this.magazineText);
        }

        // Индикатор перезарядки
        this.reloadingText = new TextBlock("reloadingText");
        this.reloadingText.text = "RELOADING...";
        this.reloadingText.color = "#ff0";
        this.reloadingText.fontSize = 10;
        this.reloadingText.fontWeight = "bold";
        this.reloadingText.fontFamily = "'Press Start 2P', monospace";
        this.reloadingText.height = "14px";
        this.reloadingText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.reloadingText.isVisible = false;
        this.mainPanel.addControl(this.reloadingText);
    }

    update(state: Partial<AmmoState>): void {
        this.state = { ...this.state, ...state };

        // Обновляем текст типа снаряда
        if (this.ammoTypeText && this.state.ammoType) {
            this.ammoTypeText.text = this.state.ammoType.toUpperCase();
        }

        // Обновляем основной счётчик
        if (this.ammoText) {
            this.ammoText.text = `${this.state.currentAmmo} / ${this.state.maxAmmo}`;

            // Цвет в зависимости от количества патронов
            const ammoPercent = this.state.maxAmmo > 0
                ? (this.state.currentAmmo / this.state.maxAmmo) * 100
                : 0;

            if (ammoPercent <= this.config.criticalAmmoThreshold) {
                this.ammoText.color = this.config.criticalAmmoColor;
            } else if (ammoPercent <= this.config.lowAmmoThreshold) {
                this.ammoText.color = this.config.lowAmmoColor;
            } else {
                this.ammoText.color = this.config.color;
            }
        }

        // Обновляем магазин
        if (this.magazineText && this.state.currentMagazine !== undefined && this.state.maxMagazine !== undefined) {
            this.magazineText.text = `MAG: ${this.state.currentMagazine}/${this.state.maxMagazine}`;
        }

        // Обновляем индикатор перезарядки
        if (this.reloadingText) {
            this.reloadingText.isVisible = this.state.isReloading ?? false;
            if (this.magazineText) {
                this.magazineText.isVisible = !(this.state.isReloading ?? false);
            }
        }
    }

    setAmmo(current: number, max: number): void {
        this.update({ currentAmmo: current, maxAmmo: max });
    }

    setMagazine(current: number, max: number): void {
        this.update({ currentMagazine: current, maxMagazine: max });
    }

    setAmmoType(type: string): void {
        this.update({ ammoType: type });
    }

    setReloading(isReloading: boolean): void {
        this.update({ isReloading });
    }

    getState(): AmmoState {
        return { ...this.state };
    }

    getCurrentAmmo(): number {
        return this.state.currentAmmo;
    }

    getMaxAmmo(): number {
        return this.state.maxAmmo;
    }

    isLowAmmo(): boolean {
        if (this.state.maxAmmo === 0) return false;
        const percent = (this.state.currentAmmo / this.state.maxAmmo) * 100;
        return percent <= this.config.lowAmmoThreshold;
    }

    isCriticalAmmo(): boolean {
        if (this.state.maxAmmo === 0) return false;
        const percent = (this.state.currentAmmo / this.state.maxAmmo) * 100;
        return percent <= this.config.criticalAmmoThreshold;
    }

    setVisible(visible: boolean): void {
        if (this.container) {
            this.container.isVisible = visible;
        }
    }

    isVisible(): boolean {
        return this.container?.isVisible ?? false;
    }

    /**
     * Flash effect when ammo changes (for low ammo warning)
     */
    flashWarning(): void {
        if (!this.ammoText) return;

        const originalColor = this.ammoText.color;
        this.ammoText.color = "#fff";

        setTimeout(() => {
            if (this.ammoText) {
                this.ammoText.color = originalColor;
            }
        }, 100);
    }

    dispose(): void {
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
    }
}

export default AmmoIndicator;

