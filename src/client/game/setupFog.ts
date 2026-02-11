/**
 * Настройка тумана сцены для плавного перехода на границе видимости.
 * Единые настройки для карт 500x500.
 */

import type { Scene } from "@babylonjs/core";
import { logger } from "../utils/logger";

/** Дистанция начала тумана (увеличено по запросу игрока). */
export const FOG_START = 360;
/** Дистанция конца тумана (граница видимости). */
export const FOG_END = 560;

/**
 * Устанавливает fogStart и fogEnd на сцене.
 */
export function setupFog(scene: Scene): void {
    if (!scene) return;
    scene.fogStart = FOG_START;
    scene.fogEnd = FOG_END;
    logger.log(`[setupFog] start=${FOG_START}, end=${FOG_END} (increased visibility)`);
}

/**
 * Интенсивность «погоды» (туман): 0 = стандарт, 1 = плотный туман (меньше видимость).
 * Меняет fogStart/fogEnd для эффекта ухудшения видимости.
 */
export function setFogWeatherIntensity(scene: Scene, intensity: number): void {
    if (!scene) return;
    const t = Math.max(0, Math.min(1, intensity));
    const start = FOG_START * (1 - t * 0.5); // до 50% ближе
    const end = FOG_END * (1 - t * 0.4);     // до 40% ближе
    scene.fogStart = start;
    scene.fogEnd = end;
}
