/**
 * @module mobile/MobileHUD
 * @description Упрощённый мобильный HUD с крупными элементами
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { getMobileScale } from "./MobileDetection";

/**
 * Конфигурация мобильного HUD
 */
export interface MobileHUDConfig {
    healthBarHeight: number;
    healthBarWidth: number;
    fontSize: number;
    iconSize: number;
    margin: number;
}

export const DEFAULT_MOBILE_HUD_CONFIG: MobileHUDConfig = {
    healthBarHeight: 30,
    healthBarWidth: 300,
    fontSize: 24,
    iconSize: 40,
    margin: 15
};

/**
 * Мобильный HUD
 */
export class MobileHUD {
    private guiTexture: AdvancedDynamicTexture;
    private config: MobileHUDConfig;
    private scale: number;
    
    // Health bar
    private healthContainer: Rectangle | null = null;
    private healthFill: Rectangle | null = null;
    private healthText: TextBlock | null = null;
    private healthIcon: TextBlock | null = null;
    
    // Ammo display
    private ammoContainer: Rectangle | null = null;
    private ammoText: TextBlock | null = null;
    private ammoIcon: TextBlock | null = null;
    
    // Kills counter
    private killsContainer: Rectangle | null = null;
    private killsText: TextBlock | null = null;
    
    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<MobileHUDConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scale = getMobileScale();
        this.config = {
            healthBarHeight: DEFAULT_MOBILE_HUD_CONFIG.healthBarHeight * this.scale,
            healthBarWidth: DEFAULT_MOBILE_HUD_CONFIG.healthBarWidth * this.scale,
            fontSize: DEFAULT_MOBILE_HUD_CONFIG.fontSize * this.scale,
            iconSize: DEFAULT_MOBILE_HUD_CONFIG.iconSize * this.scale,
            margin: DEFAULT_MOBILE_HUD_CONFIG.margin * this.scale
        };
        this.create();
    }
    
    /**
     * Создать элементы HUD
     */
    private create(): void {
        this.createHealthBar();
        this.createAmmoDisplay();
        this.createKillsCounter();
    }
    
    /**
     * Создать полосу здоровья
     */
    private createHealthBar(): void {
        const cfg = this.config;
        
        // Контейнер
        this.healthContainer = new Rectangle("mobileHealthContainer");
        this.healthContainer.width = `${cfg.healthBarWidth}px`;
        this.healthContainer.height = `${cfg.healthBarHeight}px`;
        this.healthContainer.thickness = 3;
        this.healthContainer.color = "#ff0000";
        this.healthContainer.background = "rgba(0, 0, 0, 0.6)";
        this.healthContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.healthContainer.left = `${cfg.margin}px`;
        this.healthContainer.top = `${cfg.margin}px`;
        this.healthContainer.zIndex = 1000;
        this.guiTexture.addControl(this.healthContainer);
        
        // Иконка
        this.healthIcon = new TextBlock("mobileHealthIcon");
        this.healthIcon.text = "❤️";
        this.healthIcon.fontSize = cfg.iconSize * 0.6;
        this.healthIcon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthIcon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthIcon.left = "5px";
        this.healthContainer.addControl(this.healthIcon);
        
        // Заполнение
        this.healthFill = new Rectangle("mobileHealthFill");
        this.healthFill.width = "0%";
        this.healthFill.height = "100%";
        this.healthFill.thickness = 0;
        this.healthFill.background = "#00ff00";
        this.healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthContainer.addControl(this.healthFill);
        
        // Текст
        this.healthText = new TextBlock("mobileHealthText");
        this.healthText.text = "100/100";
        this.healthText.fontSize = cfg.fontSize * 0.7;
        this.healthText.fontWeight = "bold";
        this.healthText.fontFamily = "'Press Start 2P', Consolas, monospace";
        this.healthText.color = "#ffffff";
        this.healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.healthContainer.addControl(this.healthText);
    }
    
    /**
     * Создать отображение боеприпасов
     */
    private createAmmoDisplay(): void {
        const cfg = this.config;
        
        // Контейнер
        this.ammoContainer = new Rectangle("mobileAmmoContainer");
        this.ammoContainer.width = `${cfg.healthBarWidth * 0.6}px`;
        this.ammoContainer.height = `${cfg.healthBarHeight}px`;
        this.ammoContainer.thickness = 3;
        this.ammoContainer.color = "#00aaff";
        this.ammoContainer.background = "rgba(0, 0, 0, 0.6)";
        this.ammoContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.ammoContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.ammoContainer.left = `${cfg.margin}px`;
        this.ammoContainer.top = `${cfg.margin + cfg.healthBarHeight + 10}px`;
        this.ammoContainer.zIndex = 1000;
        this.guiTexture.addControl(this.ammoContainer);
        
        // Иконка
        this.ammoIcon = new TextBlock("mobileAmmoIcon");
        this.ammoIcon.text = "💥";
        this.ammoIcon.fontSize = cfg.iconSize * 0.6;
        this.ammoIcon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.ammoIcon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.ammoIcon.left = "5px";
        this.ammoContainer.addControl(this.ammoIcon);
        
        // Текст
        this.ammoText = new TextBlock("mobileAmmoText");
        this.ammoText.text = "30/30";
        this.ammoText.fontSize = cfg.fontSize * 0.7;
        this.ammoText.fontWeight = "bold";
        this.ammoText.fontFamily = "'Press Start 2P', Consolas, monospace";
        this.ammoText.color = "#ffffff";
        this.ammoText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.ammoText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.ammoContainer.addControl(this.ammoText);
    }
    
    /**
     * Создать счётчик убийств
     */
    private createKillsCounter(): void {
        const cfg = this.config;
        
        // Контейнер
        this.killsContainer = new Rectangle("mobileKillsContainer");
        this.killsContainer.width = `${cfg.healthBarWidth * 0.4}px`;
        this.killsContainer.height = `${cfg.healthBarHeight}px`;
        this.killsContainer.thickness = 3;
        this.killsContainer.color = "#ffff00";
        this.killsContainer.background = "rgba(0, 0, 0, 0.6)";
        this.killsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.killsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.killsContainer.left = `-${cfg.margin}px`;
        this.killsContainer.top = `${cfg.margin}px`;
        this.killsContainer.zIndex = 1000;
        this.guiTexture.addControl(this.killsContainer);
        
        // Текст
        this.killsText = new TextBlock("mobileKillsText");
        this.killsText.text = "0";
        this.killsText.fontSize = cfg.fontSize * 0.8;
        this.killsText.fontWeight = "bold";
        this.killsText.fontFamily = "'Press Start 2P', Consolas, monospace";
        this.killsText.color = "#ffffff";
        this.killsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.killsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.killsContainer.addControl(this.killsText);
    }
    
    /**
     * Обновить здоровье
     */
    updateHealth(current: number, max: number): void {
        if (!this.healthFill || !this.healthText) return;
        
        const percent = Math.max(0, Math.min(100, (current / max) * 100));
        this.healthFill.width = `${percent}%`;
        this.healthText.text = `${Math.floor(current)}/${Math.floor(max)}`;
        
        // Изменение цвета в зависимости от здоровья
        if (percent < 25) {
            this.healthFill.background = "#ff0000";
        } else if (percent < 50) {
            this.healthFill.background = "#ffaa00";
        } else {
            this.healthFill.background = "#00ff00";
        }
    }
    
    /**
     * Обновить боеприпасы
     */
    updateAmmo(current: number, max: number): void {
        if (!this.ammoText) return;
        this.ammoText.text = `${current}/${max}`;
    }
    
    /**
     * Обновить счётчик убийств
     */
    updateKills(count: number): void {
        if (!this.killsText) return;
        this.killsText.text = `${count}`;
    }
    
    /**
     * Показать/скрыть HUD
     */
    setVisible(visible: boolean): void {
        if (this.healthContainer) {
            this.healthContainer.isVisible = visible;
        }
        if (this.ammoContainer) {
            this.ammoContainer.isVisible = visible;
        }
        if (this.killsContainer) {
            this.killsContainer.isVisible = visible;
        }
    }
    
    /**
     * Уничтожить HUD
     */
    dispose(): void {
        if (this.healthContainer) {
            this.guiTexture.removeControl(this.healthContainer);
            this.healthContainer.dispose();
        }
        if (this.ammoContainer) {
            this.guiTexture.removeControl(this.ammoContainer);
            this.ammoContainer.dispose();
        }
        if (this.killsContainer) {
            this.guiTexture.removeControl(this.killsContainer);
            this.killsContainer.dispose();
        }
    }
}

export default MobileHUD;

