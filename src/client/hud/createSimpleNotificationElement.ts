/**
 * Создание элемента уведомления (Rectangle + TextBlock) в стиле cyberspace/terminal.
 * Используется в hud.ts showNotification().
 */

import { Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { getNotificationStyle, type NotificationStyleType } from "./notificationStyle";

/** Константы оформления простого уведомления */
const NOTIFICATION_WIDTH = "450px";
const TEXT_WIDTH = "410px";
const FONT_SIZE = "13px";
const FONT_FAMILY = "'Press Start 2P', monospace";
const SHADOW_BLUR = 8;

export interface SimpleNotificationElement {
    element: Rectangle;
    textBlock: TextBlock;
}

/**
 * Создаёт Rectangle с TextBlock внутри в стиле терминала.
 * Caller должен добавить element в контейнер и настроить автоудаление.
 */
export function createSimpleNotificationElement(
    text: string,
    type: NotificationStyleType,
    name: string = "notification_" + Date.now()
): SimpleNotificationElement {
    const notification = new Rectangle(name);
    notification.width = NOTIFICATION_WIDTH;
    notification.adaptHeightToChildren = true;
    notification.cornerRadius = 0;
    notification.thickness = 2;
    notification.paddingTop = "12px";
    notification.paddingBottom = "12px";
    notification.paddingLeft = "15px";
    notification.paddingRight = "15px";
    notification.shadowBlur = 15;

    const style = getNotificationStyle(type);
    notification.background = style.background;
    notification.color = style.color;
    notification.shadowColor = style.shadowColor;

    const textBlock = new TextBlock();
    textBlock.text = text;
    textBlock.color = style.color;
    textBlock.fontSize = FONT_SIZE;
    textBlock.fontFamily = FONT_FAMILY;
    textBlock.textWrapping = true;
    textBlock.resizeToFit = true;
    textBlock.width = TEXT_WIDTH;
    textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    textBlock.shadowColor = style.color;
    textBlock.shadowBlur = SHADOW_BLUR;
    textBlock.shadowOffsetX = 0;
    textBlock.shadowOffsetY = 0;

    notification.addControl(textBlock);

    return { element: notification, textBlock };
}
