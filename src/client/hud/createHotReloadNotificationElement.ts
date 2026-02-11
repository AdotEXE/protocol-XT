/**
 * Создание элемента уведомления о горячей перезагрузке (контейнер с текстом и кнопкой рестарта).
 * Используется в hud.ts showHotReloadNotification().
 */

import { Rectangle, TextBlock, Button, Control } from "@babylonjs/gui";

const CONTAINER_NAME = "hotReloadNotification";
const BUTTON_NAME = "restartBtn";

/**
 * Создаёт Rectangle с текстом "GAME UPDATED! RESTART NEEDED" и кнопкой "RESTART NOW".
 * При нажатии кнопки вызывается onRestart (обычно window.location.reload).
 * Caller должен удалить старый элемент с тем же именем (getControlByName) и добавить возвращённый контейнер в guiTexture.
 */
export function createHotReloadNotificationElement(onRestart: () => void): Rectangle {
    const container = new Rectangle(CONTAINER_NAME);
    container.width = "400px";
    container.height = "80px";
    container.background = "#000000dd";
    container.thickness = 2;
    container.color = "#0f0";
    container.cornerRadius = 10;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    container.top = "100px";
    container.zIndex = 1000;

    const text = new TextBlock();
    text.text = "GAME UPDATED! RESTART NEEDED";
    text.color = "#fff";
    text.fontSize = "16px";
    text.top = "-15px";
    container.addControl(text);

    const button = Button.CreateSimpleButton(BUTTON_NAME, "RESTART NOW");
    button.width = "150px";
    button.height = "30px";
    button.background = "#0f0";
    button.color = "#000";
    button.top = "20px";
    button.cornerRadius = 5;
    button.onPointerUpObservable.add(onRestart);
    container.addControl(button);

    return container;
}

export { CONTAINER_NAME as HOT_RELOAD_NOTIFICATION_NAME };
