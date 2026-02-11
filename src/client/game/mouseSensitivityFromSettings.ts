/**
 * Преобразование настройки чувствительности мыши (шкала 1–10) в значение для движка.
 */

/** Минимальное значение (при sens 1). */
const MIN_SENS = 0.001;
/** Максимальное значение (при sens 10). */
const MAX_SENS = 0.006;

/**
 * Преобразует значение из настроек (1–10) в коэффициент чувствительности мыши.
 * @param settingsValue — значение из настроек (обычно 1–10)
 * @returns значение для движка (0.001–0.006)
 */
export function getMouseSensitivityFromSettings(settingsValue: number): number {
    const v = Math.max(1, Math.min(10, settingsValue));
    return MIN_SENS + (v / 10) * (MAX_SENS - MIN_SENS);
}
