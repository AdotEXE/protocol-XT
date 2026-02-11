/**
 * Анимация появления и исчезновения уведомления о достижении (fade in → показ → fade out → dispose).
 * Используется в hud.ts showAchievementNotification().
 */

/** Длительность показа уведомления о достижении (мс) перед началом fade out */
export const ACHIEVEMENT_NOTIFICATION_DISPLAY_MS = 5000;

/** Интервал шага анимации fade (мс) */
export const FADE_STEP_MS = 20;

/** Шаг изменения alpha за один тик */
const FADE_STEP = 0.1;

export interface FadeScheduler {
    setInterval(callback: () => void, interval: number): string;
    setTimeout(callback: () => void, delay: number): string;
    clear(id: string): void;
}

export interface FadeableElement {
    alpha: number;
    dispose(): void;
}

/**
 * Запускает анимацию: fade in (alpha 0→1), показ displayMs, fade out (alpha 1→0), затем onComplete (обычно dispose).
 */
export function runAchievementNotificationFade(
    element: FadeableElement,
    displayMs: number,
    stepMs: number,
    scheduler: FadeScheduler,
    onComplete: () => void
): void {
    element.alpha = 0;

    const fadeInId = scheduler.setInterval(() => {
        if (element.alpha < 1) {
            element.alpha += FADE_STEP;
        } else {
            scheduler.clear(fadeInId);
        }
    }, stepMs);

    scheduler.setTimeout(() => {
        const fadeOutId = scheduler.setInterval(() => {
            if (element.alpha > 0) {
                element.alpha -= FADE_STEP;
            } else {
                scheduler.clear(fadeOutId);
                onComplete();
            }
        }, stepMs);
    }, displayMs);
}
