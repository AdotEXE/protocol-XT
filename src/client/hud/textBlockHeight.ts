/**
 * Расчёт высоты текстового блока по длине текста или количеству строк.
 * Используется в hud.ts для showMessage и showAchievementNotification.
 */

export interface CalculateTextBlockHeightOptions {
    /** Количество строк (если задано, textLength/charsPerLine не используются) */
    lineCount?: number;
    /** Длина текста в символах */
    textLength?: number;
    /** Символов на строку (для оценки числа строк по textLength) */
    charsPerLine?: number;
    /** Высота одной строки в px */
    lineHeight?: number;
    /** Минимальная высота блока в px */
    minHeight?: number;
    /** Дополнительный отступ (padding) в px */
    padding?: number;
}

const DEFAULTS = {
    lineHeight: 20,
    minHeight: 40,
    padding: 10,
    charsPerLine: 50
};

/**
 * Возвращает высоту в пикселях для текстового блока.
 * Либо задайте lineCount, либо (textLength + charsPerLine).
 */
export function calculateTextBlockHeight(options: CalculateTextBlockHeightOptions): number {
    const lineHeight = options.lineHeight ?? DEFAULTS.lineHeight;
    const minHeight = options.minHeight ?? DEFAULTS.minHeight;
    const padding = options.padding ?? DEFAULTS.padding;
    const charsPerLine = options.charsPerLine ?? DEFAULTS.charsPerLine;

    const lineCount =
        options.lineCount ??
        (options.textLength != null
            ? Math.ceil(options.textLength / charsPerLine)
            : 1);

    return Math.max(minHeight, lineCount * lineHeight + padding);
}
