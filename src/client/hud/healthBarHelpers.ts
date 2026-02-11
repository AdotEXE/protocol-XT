// ═══════════════════════════════════════════════════════════════════════════
// HEALTH BAR HELPERS - цвет и ширина полосы здоровья по проценту
// ═══════════════════════════════════════════════════════════════════════════

/** Порог (0–1), выше которого полоса зелёная. */
export const HEALTH_BAR_GREEN_THRESHOLD = 0.6;
/** Порог (0–1), выше которого полоса жёлтая (ниже — красная). */
export const HEALTH_BAR_YELLOW_THRESHOLD = 0.3;

/** Порог (0–1): ниже этого отношения current/max считается «низкое HP» (виньетка и т.д.). */
export const LOW_HP_THRESHOLD = 0.4;

/** Цвета полосы здоровья (HUD). */
export const HEALTH_BAR_COLORS = {
    green: "#0f0",
    yellow: "#ff0",
    red: "#f00"
} as const;

/**
 * Возвращает цвет заливки полосы здоровья по проценту (0–1).
 * > 0.6 — зелёный, > 0.3 — жёлтый, иначе красный.
 */
export function getHealthBarFillColor(percentage: number): string {
    if (percentage > HEALTH_BAR_GREEN_THRESHOLD) return HEALTH_BAR_COLORS.green;
    if (percentage > HEALTH_BAR_YELLOW_THRESHOLD) return HEALTH_BAR_COLORS.yellow;
    return HEALTH_BAR_COLORS.red;
}

/**
 * Возвращает строку ширины заливки в процентах для GUI (например "75%").
 * percentage должен быть в диапазоне 0–1. Подходит для любой полосы прогресса (здоровье, перезарядка и т.д.).
 */
export function getHealthBarFillWidth(percentage: number): string {
    const clamped = Math.max(0, Math.min(1, percentage));
    return `${clamped * 100}%`;
}

/**
 * Возвращает true, если здоровье считается «низким» (для виньетки и эффектов).
 * Низкое = текущее < max * LOW_HP_THRESHOLD и текущее > 0.
 */
export function isLowHealth(currentHealth: number, maxHealth: number): boolean {
    if (maxHealth <= 0) return false;
    return currentHealth > 0 && currentHealth < maxHealth * LOW_HP_THRESHOLD;
}

/**
 * Форматирует отображаемый текст полосы здоровья (например "75 / 100").
 */
export function formatHealthText(currentHealth: number, maxHealth: number): string {
    return `${Math.round(currentHealth)} / ${Math.round(maxHealth)}`;
}
