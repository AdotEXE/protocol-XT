import { Rectangle, AdvancedDynamicTexture, Control } from "@babylonjs/gui";

export interface LowHealthVignetteConfig {
    visible: boolean;
}

export const DEFAULT_LOW_HEALTH_CONFIG: LowHealthVignetteConfig = {
    visible: true
};

export class LowHealthVignette {
    private container: Rectangle;
    private _isVisible: boolean = false;

    constructor(guiTexture: AdvancedDynamicTexture) {
        this.container = new Rectangle("lowHealthVignette");
        this.container.width = "100%";
        this.container.height = "100%";
        this.container.thickness = 0;
        this.container.isHitTestVisible = false;
        this.container.background = "radial-gradient(circle, transparent 40%, rgba(255, 0, 0, 0.0) 60%, rgba(255, 0, 0, 0.4) 90%, rgba(255, 0, 0, 0.6) 100%)";
        this.container.alpha = 0;
        this.container.zIndex = -1; // Behind HUD elements
        guiTexture.addControl(this.container);
    }

    /**
     * Update vignette intensity based on health percentage
     * @param currentHealth 
     * @param maxHealth 
     */
    public update(currentHealth: number, maxHealth: number): void {
        const healthPercent = currentHealth / maxHealth;

        // Show only when health is below 40%
        if (healthPercent < 0.4) {
            // Intensity increases as health drops from 40% to 0%
            // 0.4 -> 0 alpha
            // 0.0 -> 1 alpha
            const intensity = 1 - (healthPercent / 0.4);

            // Pulse effect when very low (< 20%)
            let pulse = 0;
            if (healthPercent < 0.2) {
                pulse = (Math.sin(Date.now() / 200) + 1) * 0.15; // Fast pulse
            }

            this.container.alpha = Math.min(0.8, intensity * 0.8 + pulse);
            this.container.isVisible = true;

            // Optional: Make it redder? Gradient is fixed, but alpha changes intensity.
        } else {
            this.container.isVisible = false;
            this.container.alpha = 0;
        }
    }

    public dispose(): void {
        this.container.dispose();
    }
}
