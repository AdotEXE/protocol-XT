// ═══════════════════════════════════════════════════════════════════════════
// NETWORK INDICATOR HELPERS - текст и цвет для PING/DRIFT в HUD
// ═══════════════════════════════════════════════════════════════════════════

/** Пороги пинга (мс): ниже greenUnder — зелёный, ниже yellowUnder — жёлтый, иначе красный. */
export const PING_THRESHOLDS_DEFAULT = { greenUnder: 50, yellowUnder: 150 } as const;
export const PING_THRESHOLDS_QUALITY = { greenUnder: 100, yellowUnder: 200 } as const;

/** Пороги дрифта (м): ниже greenUnder — зелёный, ниже yellowUnder — жёлтый. */
export const DRIFT_THRESHOLDS = { greenUnder: 0.5, yellowUnder: 2.0 } as const;

const NETWORK_COLORS = { green: "#00FF00", yellow: "#FFFF00", red: "#FF0000" } as const;

export function formatPingText(ping: number): string {
    return `PING: ${Math.round(ping)} ms`;
}

export function getPingColor(
    ping: number,
    thresholds: { greenUnder: number; yellowUnder: number } = PING_THRESHOLDS_DEFAULT
): string {
    if (ping < thresholds.greenUnder) return NETWORK_COLORS.green;
    if (ping < thresholds.yellowUnder) return NETWORK_COLORS.yellow;
    return NETWORK_COLORS.red;
}

export function formatDriftText(drift: number): string {
    return `DRIFT: ${drift.toFixed(2)} m`;
}

export function getDriftColor(
    drift: number,
    thresholds: { greenUnder: number; yellowUnder: number } = DRIFT_THRESHOLDS
): string {
    if (drift < thresholds.greenUnder) return NETWORK_COLORS.green;
    if (drift < thresholds.yellowUnder) return NETWORK_COLORS.yellow;
    return NETWORK_COLORS.red;
}
