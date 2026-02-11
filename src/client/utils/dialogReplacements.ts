/**
 * @module utils/dialogReplacements
 * @description Fallback: любой оставшийся вызов window.alert показывается как внутриигровой диалог.
 * confirm/prompt не перехватываем — весь код должен использовать inGameConfirm/inGamePrompt.
 */

import { inGameAlert } from "./inGameDialogs";
import { logger } from "./logger";

if (typeof window !== "undefined") {
    const originalAlert = window.alert.bind(window);
    window.alert = function (message: string): void {
        inGameAlert(String(message), "Уведомление").catch((e) => {
            logger.error("[dialogReplacements] inGameAlert failed:", e);
            originalAlert(message);
        });
    };
}
