/**
 * @module mobile/RadialMenu
 * @description Радиальное меню для доступа к модулям 0-9
 * 
 * Решает проблему 10 кнопок через вложенную структуру меню.
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    Ellipse,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { getMobileScale } from "./MobileDetection";
import { getHapticFeedback } from "./HapticFeedback";

export interface RadialMenuItem {
    id: string;
    label: string;
    icon?: string;
    action: () => void;
    submenu?: RadialMenuItem[];
}

export interface RadialMenuConfig {
    radius: number;
    sectors: number;
    activationTime: number;
    autoCloseTime: number;
    showLabels: boolean;
}

export const DEFAULT_RADIAL_MENU_CONFIG: RadialMenuConfig = {
    radius: 80,
    sectors: 8,
    activationTime: 300,
    autoCloseTime: 1000,
    showLabels: true
};

export class RadialMenu {
    private guiTexture: AdvancedDynamicTexture;
    private config: RadialMenuConfig;
    private scale: number;
    private container: Rectangle | null = null;
    private items: RadialMenuItem[] = [];
    private _isVisible: boolean = false;
    private activationTimer: number | null = null;
    private autoCloseTimer: number | null = null;
    private selectedSector: number = -1;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<RadialMenuConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scale = getMobileScale();
        this.config = {
            ...DEFAULT_RADIAL_MENU_CONFIG,
            ...config,
            radius: (config.radius || DEFAULT_RADIAL_MENU_CONFIG.radius) * this.scale
        };
    }

    show(items: RadialMenuItem[], position: { x: number, y: number }): void {
        this.items = items;
        this.create(position);
        this._isVisible = true;
    }

    hide(): void {
        this._isVisible = false;
        if (this.container) {
            this.guiTexture.removeControl(this.container);
            this.container.dispose();
            this.container = null;
        }
        this.clearTimers();
    }

    isVisible(): boolean {
        return this._isVisible;
    }

    private create(position: { x: number, y: number }): void {
        // Упрощенная реализация - можно расширить позже
        this.container = new Rectangle("radialMenu");
        this.container.width = `${this.config.radius * 2}px`;
        this.container.height = `${this.config.radius * 2}px`;
        this.container.thickness = 2;
        this.container.color = "#00ffaa";
        this.container.background = "rgba(0, 0, 0, 0.8)";
        this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.container.left = `${position.x - this.config.radius}px`;
        this.container.top = `${position.y - this.config.radius}px`;
        this.container.zIndex = 2000;
        this.guiTexture.addControl(this.container);

        // Создаем секторы для каждого элемента
        const angleStep = (Math.PI * 2) / Math.min(this.items.length, this.config.sectors);
        this.items.forEach((item, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const x = Math.cos(angle) * (this.config.radius * 0.6);
            const y = Math.sin(angle) * (this.config.radius * 0.6);

            const sector = new Ellipse(`radialSector_${item.id}`);
            sector.width = "40px";
            sector.height = "40px";
            sector.thickness = 2;
            sector.color = "#00ffaa";
            sector.background = "rgba(0, 255, 170, 0.3)";
            sector.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            sector.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            sector.left = `${x}px`;
            sector.top = `${y}px`;
            this.container!.addControl(sector);

            const label = new TextBlock(`radialLabel_${item.id}`);
            label.text = item.icon || item.label.substring(0, 2);
            label.fontSize = 16;
            label.color = "#ffffff";
            sector.addControl(label);

            // Обработчик касания
            sector.onPointerDownObservable.add(() => {
                item.action();
                this.hide();
                getHapticFeedback().button();
            });
        });

        // Автозакрытие
        this.autoCloseTimer = window.setTimeout(() => {
            this.hide();
        }, this.config.autoCloseTime);
    }

    private clearTimers(): void {
        if (this.activationTimer) {
            clearTimeout(this.activationTimer);
            this.activationTimer = null;
        }
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }
    }

    dispose(): void {
        this.hide();
    }
}

export default RadialMenu;

