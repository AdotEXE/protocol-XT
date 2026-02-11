/**
 * Анти-спам для уведомлений: подавление повторных одинаковых уведомлений в течение cooldown.
 * Используется в hud.ts showNotification().
 */

/**
 * Проверяет, нужно ли подавить уведомление (одинаковый ключ и не прошёл cooldown).
 * @param key Ключ текущего уведомления (например, `${type}:${text}`)
 * @param lastKey Ключ последнего показанного уведомления
 * @param lastTime Время последнего показа (Date.now())
 * @param cooldownMs Минимальный интервал между одинаковыми уведомлениями (мс)
 * @returns true — подавить, false — показывать
 */
export function shouldSuppressNotificationSpam(
    key: string,
    lastKey: string | null,
    lastTime: number,
    cooldownMs: number
): boolean {
    if (lastKey !== key) return false;
    return (Date.now() - lastTime) < cooldownMs;
}

/** Рекомендуемый cooldown по умолчанию (мс) */
export const DEFAULT_NOTIFICATION_SPAM_COOLDOWN = 800;
