// ═══════════════════════════════════════════════════════════════════════════
// SCALE HELPERS - масштабирование пикселей и шрифтов для Babylon GUI
// Использует utils/uiScale (scalePixels, getResponsiveSize).
// ═══════════════════════════════════════════════════════════════════════════

import { scalePixels, getResponsiveSize } from "../utils/uiScale";

/**
 * Масштабирует значение в пикселях и возвращает строку для GUI (например "24px").
 */
export function scalePx(px: number): string {
    return `${scalePixels(px)}px`;
}

/**
 * Масштабирует размер шрифта с ограничением min/max.
 */
export function scaleFontSize(baseSize: number, minSize: number = 8, maxSize: number = 48): number {
    return getResponsiveSize(baseSize, minSize, maxSize);
}
