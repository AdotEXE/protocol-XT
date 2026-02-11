// ═══════════════════════════════════════════════════════════════════════════
// TIME FORMATTERS - форматирование времени для HUD (игра, защита, таймеры)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Форматирует число секунд в строку "MM:SS" (например 125 → "02:05").
 */
export function formatTimeMMSS(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Текст таймера неуязвимости для HUD (например "ЗАЩИТА (3s)").
 * @param timeLeftMs — оставшееся время в миллисекундах
 */
export function formatInvulnerabilityText(timeLeftMs: number): string {
    const seconds = Math.ceil(timeLeftMs / 1000);
    return seconds > 0 ? `ЗАЩИТА (${seconds}s)` : "ЗАЩИТА";
}
