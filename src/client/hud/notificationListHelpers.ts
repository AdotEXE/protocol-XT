/**
 * Хелперы для работы со списком уведомлений HUD.
 * Используются в hud.ts showNotification() и removeNotification().
 */

import type { Rectangle } from "@babylonjs/gui";

/** Длительность показа простого уведомления (мс) перед автоудалением */
export const NOTIFICATION_DISPLAY_MS = 4000;

export interface NotificationEntry {
    text: string;
    type: string;
    element: Rectangle;
}

/**
 * Удаляет уведомление из списка и вызывает dispose элемента.
 * @returns true, если элемент был найден и удалён
 */
export function removeNotificationFromList(
    list: NotificationEntry[],
    element: Rectangle
): boolean {
    const index = list.findIndex((n) => n.element === element);
    if (index === -1) return false;
    list.splice(index, 1);
    element.dispose();
    return true;
}
