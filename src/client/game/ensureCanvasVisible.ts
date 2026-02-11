/**
 * Установка стилей видимости и размера canvas перед стартом игры.
 */

import { logger } from "../utils/logger";

export interface EngineResizeLike {
    resize(): void;
}

/**
 * Делает canvas видимым (display, visibility, position, size) и вызывает engine.resize().
 * @returns false если canvas отсутствует (логирует ошибку), иначе true
 */
export function ensureCanvasVisible(
    canvas: HTMLCanvasElement | null,
    engine: EngineResizeLike
): boolean {
    if (!canvas) {
        logger.error("ERROR: Canvas not initialized!");
        return false;
    }

    canvas.style.display = "block";
    canvas.style.visibility = "visible";
    canvas.style.opacity = "1";
    canvas.style.zIndex = "1";
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    if (canvas.width === 0 || canvas.height === 0) {
        engine.resize();
    }
    engine.resize();

    logger.debug("Canvas visible, size:", canvas.width, "x", canvas.height);
    return true;
}
