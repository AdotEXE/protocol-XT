// ═══════════════════════════════════════════════════════════════════════════
// DISTANCE HELPERS - формат и цвет расстояния в HUD (враг, цель)
// ═══════════════════════════════════════════════════════════════════════════

/** Пороги расстояния до врага (м): ближе redUnder — красный, ближе yellowUnder — жёлтый. */
export const ENEMY_DISTANCE_THRESHOLDS = { redUnder: 30, yellowUnder: 60 } as const;

const DISTANCE_COLORS = { red: "#f00", yellow: "#ff0", green: "#0f0" } as const;

/**
 * Форматирует расстояние в метрах для отображения (например "42m").
 */
export function formatDistanceMeters(distance: number): string {
    return `${Math.round(distance)}m`;
}

/**
 * Цвет по расстоянию до врага: ближе — опаснее (красный), дальше — зелёный.
 */
export function getEnemyDistanceColor(distance: number): string {
    if (distance < ENEMY_DISTANCE_THRESHOLDS.redUnder) return DISTANCE_COLORS.red;
    if (distance < ENEMY_DISTANCE_THRESHOLDS.yellowUnder) return DISTANCE_COLORS.yellow;
    return DISTANCE_COLORS.green;
}
