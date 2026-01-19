/**
 * @module mobile/AimZoomButton
 * @description Кнопка прицеливания и зума с авто-выстрелом
 * 
 * МЕХАНИКА:
 * - Зажатие кнопки = включение прицела + показ кнопок +/- для зума
 * - Отпускание кнопки = выстрел
 */

import {
    AdvancedDynamicTexture,
    Ellipse,
    TextBlock,
    Control
} from "@babylonjs/gui";
import { getHapticFeedback } from "./HapticFeedback";

/**
 * Конфигурация кнопки AIM/ZOOM
 */
export interface AimZoomButtonConfig {
    size: number;
    color: string;
    backgroundColor: string;
    baseAlpha: number;
    activeAlpha: number;
    zoomButtonSize: number;
    zoomButtonGap: number;
}

export const DEFAULT_AIM_ZOOM_CONFIG: AimZoomButtonConfig = {
    size: 80,
    color: "#ffaa00",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    baseAlpha: 0.7,
    activeAlpha: 1.0,
    zoomButtonSize: 50,
    zoomButtonGap: 10
};

/**
 * Кнопка AIM/ZOOM
 */
export class AimZoomButton {
    private guiTexture: AdvancedDynamicTexture;
    private config: AimZoomButtonConfig;

    // Основная кнопка
    private aimButton: Ellipse | null = null;
    private aimText: TextBlock | null = null;

    // Кнопки зума (появляются при зажатии)
    private zoomInButton: Ellipse | null = null;
    private zoomOutButton: Ellipse | null = null;
    private zoomInText: TextBlock | null = null;
    private zoomOutText: TextBlock | null = null;

    // Состояние
    private isHolding: boolean = false;
    private pointerId: number | null = null;

    // Callbacks
    private onAimStart: (() => void) | null = null;
    private onAimEnd: (() => void) | null = null;
    private onFire: (() => void) | null = null;
    private onZoomIn: (() => void) | null = null;
    private onZoomOut: (() => void) | null = null;

    constructor(
        guiTexture: AdvancedDynamicTexture,
        config: Partial<AimZoomButtonConfig> = {}
    ) {
        this.guiTexture = guiTexture;
        this.config = { ...DEFAULT_AIM_ZOOM_CONFIG, ...config };
        this.create();
    }

    /**
     * Показать/скрыть кнопку
     */
    public setVisible(visible: boolean): void {
        const targetAlpha = visible ? 1 : 0;
        // Don't just set isVisible, as that might break animation or state. 
        // But for simply hiding it completely:
        if (this.aimButton) {
            this.aimButton.isVisible = visible;
        }
        if (!visible) {
            this.hideZoomButtons();
            this.isHolding = false;
            this.pointerId = null;
        }
    }

    /**
     * Создать UI элементы
     */
    private create(): void {
        this.createAimButton();
        this.createZoomButtons();
    }

    /**
     * Создать основную кнопку прицела
     */
    private createAimButton(): void {
        const cfg = this.config;

        this.aimButton = new Ellipse("aimZoomButton");
        this.aimButton.width = `${cfg.size}px`;
        this.aimButton.height = `${cfg.size}px`;
        this.aimButton.thickness = 4;
        this.aimButton.color = cfg.color;
        this.aimButton.background = cfg.backgroundColor;
        this.aimButton.alpha = cfg.baseAlpha;
        this.aimButton.shadowColor = cfg.color;
        this.aimButton.shadowBlur = 15;
        this.aimButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.aimButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.aimButton.left = "-20px";
        this.aimButton.top = "-20px";
        this.aimButton.isPointerBlocker = true;
        this.aimButton.zIndex = 1002;
        this.guiTexture.addControl(this.aimButton);

        this.aimText = new TextBlock("aimText");
        this.aimText.text = "🎯";
        this.aimText.fontSize = cfg.size * 0.5;
        this.aimText.color = "#ffffff";
        this.aimButton.addControl(this.aimText);

        // Обработчики событий
        this.aimButton.onPointerDownObservable.add((eventData) => {
            this.handleAimStart(eventData);
        });

        this.aimButton.onPointerUpObservable.add(() => {
            this.handleAimEnd();
        });

        this.aimButton.onPointerOutObservable.add(() => {
            this.handleAimEnd();
        });
    }

    /**
     * Создать кнопки зума (скрыты по умолчанию)
     */
    private createZoomButtons(): void {
        const cfg = this.config;
        const totalWidth = cfg.zoomButtonSize * 2 + cfg.zoomButtonGap;
        const leftOffset = -(totalWidth + cfg.size / 2 + 20);

        // Кнопка Zoom In (+)
        this.zoomInButton = new Ellipse("zoomInButton");
        this.zoomInButton.width = `${cfg.zoomButtonSize}px`;
        this.zoomInButton.height = `${cfg.zoomButtonSize}px`;
        this.zoomInButton.thickness = 3;
        this.zoomInButton.color = "#00ffaa";
        this.zoomInButton.background = cfg.backgroundColor;
        this.zoomInButton.alpha = 0; // Скрыта по умолчанию
        this.zoomInButton.shadowColor = "#00ffaa";
        this.zoomInButton.shadowBlur = 10;
        this.zoomInButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.zoomInButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.zoomInButton.left = `${leftOffset}px`;
        this.zoomInButton.top = "-20px";
        this.zoomInButton.isPointerBlocker = true;
        this.zoomInButton.zIndex = 1003;
        this.guiTexture.addControl(this.zoomInButton);

        this.zoomInText = new TextBlock("zoomInText");
        this.zoomInText.text = "+";
        this.zoomInText.fontSize = cfg.zoomButtonSize * 0.6;
        this.zoomInText.fontWeight = "bold";
        this.zoomInText.fontFamily = "'Press Start 2P', Consolas, monospace";
        this.zoomInText.color = "#ffffff";
        this.zoomInButton.addControl(this.zoomInText);

        // Кнопка Zoom Out (-)
        this.zoomOutButton = new Ellipse("zoomOutButton");
        this.zoomOutButton.width = `${cfg.zoomButtonSize}px`;
        this.zoomOutButton.height = `${cfg.zoomButtonSize}px`;
        this.zoomOutButton.thickness = 3;
        this.zoomOutButton.color = "#00ffaa";
        this.zoomOutButton.background = cfg.backgroundColor;
        this.zoomOutButton.alpha = 0; // Скрыта по умолчанию
        this.zoomOutButton.shadowColor = "#00ffaa";
        this.zoomOutButton.shadowBlur = 10;
        this.zoomOutButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.zoomOutButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.zoomOutButton.left = `${leftOffset + cfg.zoomButtonSize + cfg.zoomButtonGap}px`;
        this.zoomOutButton.top = "-20px";
        this.zoomOutButton.isPointerBlocker = true;
        this.zoomOutButton.zIndex = 1003;
        this.guiTexture.addControl(this.zoomOutButton);

        this.zoomOutText = new TextBlock("zoomOutText");
        this.zoomOutText.text = "-";
        this.zoomOutText.fontSize = cfg.zoomButtonSize * 0.6;
        this.zoomOutText.fontWeight = "bold";
        this.zoomOutText.fontFamily = "'Press Start 2P', Consolas, monospace";
        this.zoomOutText.color = "#ffffff";
        this.zoomOutButton.addControl(this.zoomOutText);

        // Обработчики для кнопок зума
        this.zoomInButton.onPointerDownObservable.add(() => {
            if (this.onZoomIn) {
                this.onZoomIn();
            }
            getHapticFeedback().button();
        });

        this.zoomOutButton.onPointerDownObservable.add(() => {
            if (this.onZoomOut) {
                this.onZoomOut();
            }
            getHapticFeedback().button();
        });
    }

    /**
     * Обработка начала зажатия (включение прицела)
     */
    private handleAimStart(eventData: any): void {
        if (this.isHolding) return;

        this.isHolding = true;
        this.pointerId = eventData.pointerId ?? Date.now();

        const cfg = this.config;

        // Визуальная обратная связь
        if (this.aimButton) {
            this.aimButton.alpha = cfg.activeAlpha;
            this.aimButton.background = cfg.color;
            this.aimButton.thickness = 6;
        }

        // Показать кнопки зума
        this.showZoomButtons();

        // Вызвать callback начала прицеливания
        if (this.onAimStart) {
            this.onAimStart();
        }

        // Вибрация
        getHapticFeedback().button();
    }

    /**
     * Обработка отпускания (выстрел)
     */
    private handleAimEnd(): void {
        if (!this.isHolding) return;

        this.isHolding = false;
        this.pointerId = null;

        const cfg = this.config;

        // Визуальная обратная связь
        if (this.aimButton) {
            this.aimButton.alpha = cfg.baseAlpha;
            this.aimButton.background = cfg.backgroundColor;
            this.aimButton.thickness = 4;
        }

        // Скрыть кнопки зума
        this.hideZoomButtons();

        // onFire ONLY via dedicated button now. Tap-to-fire removed.
        // if (this.onFire) {
        //     this.onFire();
        // }

        // Вызвать callback окончания прицеливания
        if (this.onAimEnd) {
            this.onAimEnd();
        }

        // Вибрация выстрела
        getHapticFeedback().fire();
    }

    /**
     * Показать кнопки зума
     */
    private showZoomButtons(): void {
        const cfg = this.config;

        if (this.zoomInButton) {
            this.zoomInButton.alpha = cfg.activeAlpha;
        }
        if (this.zoomOutButton) {
            this.zoomOutButton.alpha = cfg.activeAlpha;
        }
    }

    /**
     * Скрыть кнопки зума
     */
    private hideZoomButtons(): void {
        if (this.zoomInButton) {
            this.zoomInButton.alpha = 0;
        }
        if (this.zoomOutButton) {
            this.zoomOutButton.alpha = 0;
        }
    }

    /**
     * Установить callback начала прицеливания
     */
    setOnAimStart(callback: () => void): void {
        this.onAimStart = callback;
    }

    /**
     * Установить callback окончания прицеливания
     */
    setOnAimEnd(callback: () => void): void {
        this.onAimEnd = callback;
    }

    /**
     * Установить callback выстрела
     */
    setOnFire(callback: () => void): void {
        this.onFire = callback;
    }

    /**
     * Установить callback зума
     */
    setOnZoomIn(callback: () => void): void {
        this.onZoomIn = callback;
    }

    /**
     * Установить callback зума
     */
    setOnZoomOut(callback: () => void): void {
        this.onZoomOut = callback;
    }

    /**
     * Проверить зажата ли кнопка
     */
    isAiming(): boolean {
        return this.isHolding;
    }

    /**
     * Уничтожить кнопку
     */
    dispose(): void {
        if (this.aimButton) {
            this.guiTexture.removeControl(this.aimButton);
            this.aimButton.dispose();
            this.aimButton = null;
        }

        if (this.zoomInButton) {
            this.guiTexture.removeControl(this.zoomInButton);
            this.zoomInButton.dispose();
            this.zoomInButton = null;
        }

        if (this.zoomOutButton) {
            this.guiTexture.removeControl(this.zoomOutButton);
            this.zoomOutButton.dispose();
            this.zoomOutButton = null;
        }
    }
}

export default AimZoomButton;

