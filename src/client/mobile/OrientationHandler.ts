/**
 * @module mobile/OrientationHandler
 * @description Обработка ориентации экрана для мобильных устройств
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";

/**
 * Обработчик ориентации экрана
 */
export class OrientationHandler {
    private guiTexture: AdvancedDynamicTexture;
    private overlay: Rectangle | null = null;
    private isPortrait: boolean = false;
    private checkInterval: number | null = null;

    constructor(guiTexture: AdvancedDynamicTexture) {
        this.guiTexture = guiTexture;
        this.checkOrientation();
        this.setupOrientationListener();
    }

    /**
     * Проверить текущую ориентацию
     */
    private checkOrientation(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const wasPortrait = this.isPortrait;
        this.isPortrait = height > width;

        if (this.isPortrait && !wasPortrait) {
            this.showLandscapeHint();
        } else if (!this.isPortrait && wasPortrait) {
            this.hideLandscapeHint();
        }
    }

    /**
     * Настроить слушатель изменения ориентации
     */
    private setupOrientationListener(): void {
        // Слушаем изменение размера окна
        window.addEventListener('resize', () => {
            this.checkOrientation();
        });

        // Слушаем изменение ориентации (для мобильных)
        if (window.orientation !== undefined) {
            window.addEventListener('orientationchange', () => {
                // Небольшая задержка для корректного определения размеров
                setTimeout(() => {
                    this.checkOrientation();
                }, 100);
            });
        }

        // Периодическая проверка (на случай если события не сработали)
        this.checkInterval = window.setInterval(() => {
            this.checkOrientation();
        }, 1000);
    }

    /**
     * Показать подсказку повернуть экран
     */
    private showLandscapeHint(): void {
        if (this.overlay) return; // Уже показано

        const overlay = new Rectangle("orientationOverlay");
        overlay.width = "100%";
        overlay.height = "100%";
        overlay.thickness = 0;
        overlay.background = "rgba(0, 0, 0, 0.85)";
        overlay.zIndex = 10000;
        overlay.isPointerBlocker = true;
        this.guiTexture.addControl(overlay);

        const icon = new TextBlock("orientationIcon");
        icon.text = "📱";
        icon.fontSize = "120px";
        icon.color = "#00ff00";
        icon.fontFamily = "'Press Start 2P', monospace";
        icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        icon.top = "-80px";
        overlay.addControl(icon);

        const text = new TextBlock("orientationText");
        text.text = "ПОВЕРНИТЕ УСТРОЙСТВО\nВ ГОРИЗОНТАЛЬНОЕ ПОЛОЖЕНИЕ";
        text.fontSize = "32px";
        text.color = "#00ff00";
        text.fontFamily = "'Press Start 2P', monospace";
        text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        text.lineSpacing = "10px";
        overlay.addControl(text);

        const hint = new TextBlock("orientationHint");
        hint.text = "ROTATE DEVICE TO LANDSCAPE";
        hint.fontSize = "24px";
        hint.color = "#00aa00";
        hint.fontFamily = "'Press Start 2P', monospace";
        hint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        hint.top = "100px";
        overlay.addControl(hint);

        this.overlay = overlay;
    }

    /**
     * Скрыть подсказку
     */
    private hideLandscapeHint(): void {
        if (!this.overlay) return;

        this.guiTexture.removeControl(this.overlay);
        this.overlay.dispose();
        this.overlay = null;
    }

    /**
     * Получить текущую ориентацию
     */
    isLandscape(): boolean {
        return !this.isPortrait;
    }

    /**
     * Уничтожить обработчик
     */
    dispose(): void {
        if (this.checkInterval !== null) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.hideLandscapeHint();
    }
}

export default OrientationHandler;

