/**
 * @module mobile/ContextualRepair
 * @description Контекстные кнопки ремонта, появляющиеся только при повреждении модулей
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
import { RadialMenu } from "./RadialMenu";

export interface DamagedModule {
    id: string;
    name: string;
    icon: string;
    severity: 'critical' | 'damaged';
    repairAction: () => void;
}

export interface ContextualRepairConfig {
    position: {
        horizontalAlignment: number;
        verticalAlignment: number;
        left: string;
        top: string;
    };
    buttonSize: number;
    animationDuration: number;
}

export const DEFAULT_CONTEXTUAL_REPAIR_CONFIG: ContextualRepairConfig = {
    position: {
        horizontalAlignment: Control.HORIZONTAL_ALIGNMENT_LEFT,
        verticalAlignment: Control.VERTICAL_ALIGNMENT_BOTTOM,
        left: "20px",
        top: "-200px"
    },
    buttonSize: 60,
    animationDuration: 300
};

export class ContextualRepair {
    private guiTexture: AdvancedDynamicTexture;
    private config: ContextualRepairConfig;
    private scale: number;
    private damagedModules: Map<string, DamagedModule> = new Map();
    private repairButtons: Map<string, Rectangle> = new Map();
    private radialMenu: RadialMenu | null = null;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<ContextualRepairConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.scale = getMobileScale();
        this.config = {
            ...DEFAULT_CONTEXTUAL_REPAIR_CONFIG,
            ...config,
            buttonSize: (config.buttonSize || DEFAULT_CONTEXTUAL_REPAIR_CONFIG.buttonSize) * this.scale
        };
        this.radialMenu = new RadialMenu(guiTexture);
    }

    onModuleDamaged(module: DamagedModule): void {
        this.damagedModules.set(module.id, module);
        this.updateButtons();
    }

    onModuleRepaired(moduleId: string): void {
        this.damagedModules.delete(moduleId);
        this.removeButton(moduleId);
        this.updateButtons();
    }

    private updateButtons(): void {
        if (this.damagedModules.size === 0) {
            // Скрываем все кнопки
            this.repairButtons.forEach(button => {
                button.isVisible = false;
            });
            return;
        }

        if (this.damagedModules.size === 1) {
            // Показываем одну кнопку
            const [module] = Array.from(this.damagedModules.values());
            if (module) this.createOrUpdateButton(module); // [Opus 4.6] Null-safe check
        } else {
            // Показываем кнопку с количеством, открывающую радиальное меню
            this.createMultiRepairButton();
        }
    }

    private createOrUpdateButton(module: DamagedModule): void {
        let button = this.repairButtons.get(module.id);
        
        if (!button) {
            button = new Rectangle(`repairButton_${module.id}`);
            button.width = `${this.config.buttonSize}px`;
            button.height = `${this.config.buttonSize}px`;
            button.thickness = 3;
            button.color = module.severity === 'critical' ? "#ff0000" : "#ffaa00";
            button.background = "rgba(0, 0, 0, 0.7)";
            button.horizontalAlignment = this.config.position.horizontalAlignment;
            button.verticalAlignment = this.config.position.verticalAlignment;
            button.left = this.config.position.left;
            button.top = this.config.position.top;
            button.zIndex = 1002;
            this.guiTexture.addControl(button);
            this.repairButtons.set(module.id, button);

            const icon = new TextBlock(`repairIcon_${module.id}`);
            icon.text = module.icon;
            icon.fontSize = this.config.buttonSize * 0.5;
            icon.color = "#ffffff";
            button.addControl(icon);

            button.onPointerDownObservable.add(() => {
                module.repairAction();
                getHapticFeedback().button();
            });
        }

        button.isVisible = true;
        
        // Пульсация для критических повреждений
        if (module.severity === 'critical') {
            this.startPulse(button);
        }
    }

    private createMultiRepairButton(): void {
        // Упрощенная реализация - можно расширить
        const button = new Rectangle("multiRepairButton");
        button.width = `${this.config.buttonSize}px`;
        button.height = `${this.config.buttonSize}px`;
        button.thickness = 3;
        button.color = "#ff0000";
        button.background = "rgba(0, 0, 0, 0.7)";
        button.horizontalAlignment = this.config.position.horizontalAlignment;
        button.verticalAlignment = this.config.position.verticalAlignment;
        button.left = this.config.position.left;
        button.top = this.config.position.top;
        button.zIndex = 1002;
        this.guiTexture.addControl(button);

        const count = new TextBlock("repairCount");
        count.text = `${this.damagedModules.size}`;
        count.fontSize = this.config.buttonSize * 0.4;
        count.color = "#ffffff";
        button.addControl(count);

        button.onPointerDownObservable.add(() => {
            // Открываем радиальное меню с опциями ремонта
            const items = Array.from(this.damagedModules.values()).map(module => ({
                id: module.id,
                label: module.name,
                icon: module.icon,
                action: module.repairAction
            }));
            
            const canvas = this.guiTexture.getScene()?.getEngine().getRenderingCanvas();
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                this.radialMenu!.show(items, {
                    x: rect.width * 0.1,
                    y: rect.height * 0.7
                });
            }
        });
    }

    private removeButton(moduleId: string): void {
        const button = this.repairButtons.get(moduleId);
        if (button) {
            this.guiTexture.removeControl(button);
            button.dispose();
            this.repairButtons.delete(moduleId);
        }
    }

    private startPulse(button: Rectangle): void {
        let phase = 0;
        const pulse = () => {
            if (!button.isVisible) return;
            phase += 0.1;
            button.alpha = 0.7 + Math.sin(phase) * 0.3;
            requestAnimationFrame(pulse);
        };
        requestAnimationFrame(pulse);
    }

    setVisible(visible: boolean): void {
        this.repairButtons.forEach(button => {
            button.isVisible = visible && button.isVisible;
        });
    }

    dispose(): void {
        this.repairButtons.forEach(button => {
            this.guiTexture.removeControl(button);
            button.dispose();
        });
        this.repairButtons.clear();
        if (this.radialMenu) {
            this.radialMenu.dispose();
        }
    }
}

export default ContextualRepair;

