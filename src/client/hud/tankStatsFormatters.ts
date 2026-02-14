/**
 * Форматирование строк и цветов для панели статистики танка (HUD).
 */

/** Строка вида "LABEL: value" для одной строки статов. */
export function formatTankStatsRow(label: string, value: string): string {
    return `${label} ${value}`.trim();
}

/** Бонус в долях (0.1 = 10%) → "+10%" или "—". */
export function formatBonusPercent(val: number): string {
    if (val === 0) return "—";
    const sign = val > 0 ? "+" : "";
    return `${sign}${(val * 100).toFixed(0)}%`;
}

/** Бонус числом: "+5", "-10", "—". negativeIsGood — для перезарядки (минус лучше). */
export function formatBonusValue(val: number, negativeIsGood?: boolean): string {
    if (val === 0) return "—";
    const sign = val > 0 ? "+" : "";
    return `${sign}${val}`;
}

/** Число с опциональными десятичными и суффиксом (например "100 мс"). */
export function formatStatWithBonus(base: number, decimals: number = 0, suffix: string = ""): string {
    const s = decimals >= 0 ? base.toFixed(decimals) : String(base);
    return suffix ? `${s} ${suffix}` : s;
}

const RARITY_COLORS: Record<string, string> = {
    common: "#888888",
    rare: "#4a9eff",
    epic: "#a855f7",
    legendary: "#eab308",
    default: "#cccccc"
};

/** Цвет по редкости модуля. */
export function getRarityColor(rarity: string): string {
    if (!rarity) return RARITY_COLORS.default;
    const key = String(rarity).toLowerCase();
    return RARITY_COLORS[key] ?? RARITY_COLORS.default;
}
