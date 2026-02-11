/**
 * Стили уведомлений HUD (cyberspace/terminal).
 * Используется в hud.ts showNotification и при необходимости в других компонентах.
 */

export type NotificationStyleType = "success" | "warning" | "error" | "info";

export interface NotificationStyle {
    background: string;
    color: string;
    shadowColor: string;
}

const CYBERSPACE_BG = "#000000f0";

/** Цвета и тени для типов уведомлений в стиле терминала */
export function getNotificationStyle(type: NotificationStyleType): NotificationStyle {
    switch (type) {
        case "success":
            return { background: CYBERSPACE_BG, color: "#00ff00", shadowColor: "#00ff0066" };
        case "warning":
            return { background: CYBERSPACE_BG, color: "#ffff00", shadowColor: "#ffff0066" };
        case "error":
            return { background: CYBERSPACE_BG, color: "#ff3333", shadowColor: "#ff333366" };
        default:
            return { background: CYBERSPACE_BG, color: "#00ff00", shadowColor: "#00ff0066" };
    }
}
