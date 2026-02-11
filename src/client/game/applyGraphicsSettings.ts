/**
 * Применение графических настроек (тени, частицы, полноэкранный режим, постобработка).
 * Вызывается из Game.applyGraphicsSettings().
 */

import type { Scene } from "@babylonjs/core";
import type { GameSettings } from "../menu";
import { logger } from "../utils/logger";

export interface PostProcessingManagerLike {
    setBloom(enabled: boolean): void;
    setMotionBlur(enabled: boolean): void;
    setFXAA(enabled: boolean): void;
}

/**
 * Применяет настройки графики к сцене и постобработке.
 */
export function applyGraphicsSettings(params: {
    scene: Scene;
    settings: GameSettings;
    postProcessingManager?: PostProcessingManagerLike | null;
}): void {
    const { scene, settings, postProcessingManager } = params;

    scene.shadowsEnabled = (settings.shadows ?? true) && (settings.shadowQuality ?? 0) > 0;
    scene.particlesEnabled = (settings.particleQuality ?? 0) > 0;

    if (settings.fullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else if (!settings.fullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    if (postProcessingManager) {
        postProcessingManager.setBloom(settings.bloom ?? false);
        postProcessingManager.setMotionBlur(settings.motionBlur ?? false);
        postProcessingManager.setFXAA(settings.antiAliasing ?? true);
    }

    logger.debug("Graphics settings applied");
}
