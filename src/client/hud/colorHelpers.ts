// ═══════════════════════════════════════════════════════════════════════════
// COLOR HELPERS - парсинг hex, интерполяция цветов для HUD
// ═══════════════════════════════════════════════════════════════════════════

export interface Rgb {
    r: number;
    g: number;
    b: number;
}

/**
 * Парсит hex-цвет (#rgb или #rrggbb) в объект { r, g, b }.
 */
export function hexToRgb(hex: string): Rgb {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1] ?? "00", 16),
            g: parseInt(result[2] ?? "ff", 16),
            b: parseInt(result[3] ?? "00", 16)
        }
        : { r: 0, g: 255, b: 0 };
}

/**
 * Собирает hex-строку из компонент r, g, b (0–255).
 */
export function rgbToHex(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Линейная интерполяция между двумя hex-цветами. t в [0, 1].
 */
export function interpolateColor(color1: string, color2: string, t: number): string {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return rgbToHex(r, g, b);
}
