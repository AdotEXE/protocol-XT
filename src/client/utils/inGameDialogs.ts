/**
 * @module utils/inGameDialogs
 * @description Система внутриигровых модальных окон для замены браузерных alert/confirm/prompt
 */

import {
    AdvancedDynamicTexture,
    Rectangle,
    TextBlock,
    Button,
    Control,
    StackPanel
} from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";

/**
 * Результат диалога подтверждения
 */
export interface DialogResult {
    confirmed: boolean;
    value?: string; // Для prompt
}

/**
 * Система внутриигровых диалогов
 */
export class InGameDialogs {
    private guiTexture: AdvancedDynamicTexture | null = null;
    private currentDialog: Rectangle | null = null;
    private dialogResult: DialogResult | null = null;
    private resolveCallback: ((result: DialogResult) => void) | null = null;

    /**
     * Инициализация с GUI текстурой
     */
    initialize(guiTexture: AdvancedDynamicTexture): void {
        this.guiTexture = guiTexture;
    }

    /**
     * Показать уведомление (замена alert)
     */
    async alert(message: string, title: string = "Уведомление"): Promise<void> {
        // Пытаемся получить GUI texture из игры, если не инициализирован
        if (!this.guiTexture) {
            console.log("[InGameDialogs] GUI texture not initialized, trying to get from game...");
            const game = (window as any).gameInstance;
            if (game && game.hud && typeof game.hud.getGuiTexture === 'function') {
                const guiTexture = game.hud.getGuiTexture();
                if (guiTexture) {
                    this.guiTexture = guiTexture;
                    console.log("[InGameDialogs] GUI texture obtained from game HUD");
                }
            }
        }
        
        if (!this.guiTexture) {
            const { gameAlert } = await import("./gameDialogs");
            return gameAlert(message, title);
        }
        return new Promise<void>((resolve) => {
            this.showDialog(title, message, ["OK"], (result) => {
                resolve();
            });
        });
    }

    /**
     * Показать диалог подтверждения (замена confirm)
     */
    async confirm(message: string, title: string = "Подтверждение"): Promise<boolean> {
        // Пытаемся получить GUI texture из игры, если не инициализирован
        if (!this.guiTexture) {
            console.log("[InGameDialogs] GUI texture not initialized, trying to get from game...");
            const game = (window as any).gameInstance;
            if (game && game.hud && typeof game.hud.getGuiTexture === 'function') {
                const guiTexture = game.hud.getGuiTexture();
                if (guiTexture) {
                    this.guiTexture = guiTexture;
                    console.log("[InGameDialogs] GUI texture obtained from game HUD");
                }
            }
        }
        
        if (!this.guiTexture) {
            const { gameConfirm } = await import("./gameDialogs");
            return gameConfirm(message, title);
        }
        return new Promise<boolean>((resolve) => {
            this.showDialog(title, message, ["Отмена", "OK"], (result) => {
                resolve(result.confirmed);
            });
        });
    }

    /**
     * Показать диалог ввода (замена prompt)
     */
    async prompt(message: string, defaultValue: string = "", title: string = "Ввод"): Promise<string | null> {
        // Пытаемся получить GUI texture из игры, если не инициализирован
        if (!this.guiTexture) {
            console.log("[InGameDialogs] GUI texture not initialized, trying to get from game...");
            const game = (window as any).gameInstance;
            if (game && game.hud && typeof game.hud.getGuiTexture === 'function') {
                const guiTexture = game.hud.getGuiTexture();
                if (guiTexture) {
                    this.guiTexture = guiTexture;
                    console.log("[InGameDialogs] GUI texture obtained from game HUD");
                }
            }
        }
        
        if (!this.guiTexture) {
            const { gamePrompt } = await import("./gameDialogs");
            return gamePrompt(message, defaultValue, title);
        }
        return new Promise<string | null>((resolve) => {
            this.showInputDialog(title, message, defaultValue, (result) => {
                resolve(result.value || null);
            });
        });
    }

    /**
     * Показать диалог с кнопками
     */
    private showDialog(
        title: string,
        message: string,
        buttons: string[],
        callback: (result: DialogResult) => void
    ): void {
        if (!this.guiTexture) {
            console.error("[InGameDialogs] GUI texture not initialized");
            callback({ confirmed: false });
            return;
        }

        console.log("[InGameDialogs] Creating dialog:", title, message);
        console.log("[InGameDialogs] GUI texture:", this.guiTexture ? "exists" : "null");

        // Закрываем предыдущий диалог если есть
        this.closeDialog();

        // Создаём затемнение фона
        const overlay = new Rectangle("dialog_overlay");
        overlay.width = "100%";
        overlay.height = "100%";
        overlay.background = "rgba(0, 0, 0, 0.7)";
        overlay.thickness = 0;
        overlay.zIndex = 1000;
        overlay.isPointerBlocker = true;

        // Создаём модальное окно
        const dialog = new Rectangle("dialog_" + Date.now());
        dialog.width = "600px";
        dialog.adaptHeightToChildren = true;
        dialog.background = "rgba(20, 20, 30, 0.98)";
        dialog.thickness = 2;
        dialog.color = "#4ade80";
        dialog.cornerRadius = 12;
        dialog.zIndex = 1001;
        dialog.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        dialog.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        dialog.paddingTop = "20px";
        dialog.paddingBottom = "20px";
        dialog.paddingLeft = "30px";
        dialog.paddingRight = "30px";
        dialog.isPointerBlocker = true;

        // Заголовок
        const titleBlock = new TextBlock("dialog_title");
        titleBlock.text = title;
        titleBlock.color = "#4ade80";
        titleBlock.fontSize = "20px";
        titleBlock.fontFamily = "'Press Start 2P', monospace";
        titleBlock.height = "30px";
        titleBlock.paddingBottom = "15px";

        // Сообщение
        const messageBlock = new TextBlock("dialog_message");
        messageBlock.text = message;
        messageBlock.color = "#ffffff";
        messageBlock.fontSize = "14px";
        messageBlock.fontFamily = "'Press Start 2P', monospace";
        messageBlock.textWrapping = true;
        messageBlock.resizeToFit = true;
        messageBlock.paddingBottom = "20px";
        messageBlock.lineSpacing = "4px";

        // Панель кнопок
        const buttonPanel = new StackPanel("dialog_buttons");
        buttonPanel.isVertical = false;
        buttonPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        buttonPanel.spacing = 10;
        buttonPanel.width = "100%";

        // Создаём кнопки (в обратном порядке для правильного отображения)
        const buttonControls: Button[] = [];
        for (let i = buttons.length - 1; i >= 0; i--) {
            const buttonText = buttons[i] || "OK";
            const isConfirm = buttonText === "OK" || buttonText === "Да" || buttonText === "Подтвердить";
            
            const button = Button.CreateSimpleButton(`dialog_btn_${i}`, buttonText);
            button.width = "150px";
            button.height = "40px";
            button.color = "#ffffff";
            button.fontSize = "12px";
            button.fontFamily = "'Press Start 2P', monospace";
            button.background = isConfirm ? "#4ade80" : "#666666";
            button.thickness = 1;
            button.cornerRadius = 6;
            button.paddingTop = "8px";
            button.paddingBottom = "8px";

            // Обработчик нажатия
            button.onPointerClickObservable.add(() => {
                this.closeDialog();
                callback({
                    confirmed: isConfirm,
                    value: undefined
                });
            });

            buttonControls.push(button);
            buttonPanel.addControl(button);
        }

        // Добавляем элементы в диалог
        dialog.addControl(titleBlock);
        dialog.addControl(messageBlock);
        dialog.addControl(buttonPanel);

        // Добавляем в GUI
        console.log("[InGameDialogs] Adding overlay and dialog to GUI texture...");
        this.guiTexture.addControl(overlay);
        this.guiTexture.addControl(dialog);
        console.log("[InGameDialogs] ✅ Dialog added to GUI texture");

        this.currentDialog = dialog;
        
        // Убеждаемся, что диалог виден
        dialog.isVisible = true;
        overlay.isVisible = true;
        console.log("[InGameDialogs] Dialog visibility:", dialog.isVisible, "Overlay visibility:", overlay.isVisible);

        // Закрытие по ESC
        const escHandler = (evt: KeyboardEvent) => {
            if (evt.key === "Escape" && this.currentDialog === dialog) {
                this.closeDialog();
                callback({ confirmed: false });
                window.removeEventListener("keydown", escHandler);
            }
        };
        window.addEventListener("keydown", escHandler);
    }

    /**
     * Показать диалог ввода (prompt)
     */
    private showInputDialog(
        title: string,
        message: string,
        defaultValue: string,
        callback: (result: DialogResult) => void
    ): void {
        if (!this.guiTexture) {
            console.error("[InGameDialogs] GUI texture not initialized");
            callback({ confirmed: false });
            return;
        }

        this.closeDialog();

        // Создаём затемнение фона
        const overlay = new Rectangle("dialog_overlay");
        overlay.width = "100%";
        overlay.height = "100%";
        overlay.background = "rgba(0, 0, 0, 0.7)";
        overlay.thickness = 0;
        overlay.zIndex = 1000;
        overlay.isPointerBlocker = true;

        // Создаём модальное окно
        const dialog = new Rectangle("dialog_input_" + Date.now());
        dialog.width = "600px";
        dialog.adaptHeightToChildren = true;
        dialog.background = "rgba(20, 20, 30, 0.98)";
        dialog.thickness = 2;
        dialog.color = "#4ade80";
        dialog.cornerRadius = 12;
        dialog.zIndex = 1001;
        dialog.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        dialog.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        dialog.paddingTop = "20px";
        dialog.paddingBottom = "20px";
        dialog.paddingLeft = "30px";
        dialog.paddingRight = "30px";
        dialog.isPointerBlocker = true;

        // Заголовок
        const titleBlock = new TextBlock("dialog_title");
        titleBlock.text = title;
        titleBlock.color = "#4ade80";
        titleBlock.fontSize = "20px";
        titleBlock.fontFamily = "'Press Start 2P', monospace";
        titleBlock.height = "30px";
        titleBlock.paddingBottom = "15px";

        // Сообщение
        const messageBlock = new TextBlock("dialog_message");
        messageBlock.text = message;
        messageBlock.color = "#ffffff";
        messageBlock.fontSize = "14px";
        messageBlock.fontFamily = "'Press Start 2P', monospace";
        messageBlock.textWrapping = true;
        messageBlock.resizeToFit = true;
        messageBlock.paddingBottom = "15px";
        messageBlock.lineSpacing = "4px";

        // Поле ввода - используем DOM overlay для текстового ввода
        // Создаём DOM input элемент поверх GUI
        const domInput = document.createElement("input");
        domInput.type = "text";
        domInput.value = defaultValue;
        domInput.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 540px;
            height: 40px;
            background: rgba(0, 0, 0, 0.8);
            border: 2px solid #4ade80;
            border-radius: 6px;
            color: #ffffff;
            font-family: 'Press Start 2P', monospace;
            font-size: 12px;
            padding: 8px 15px;
            outline: none;
            z-index: 10002;
            margin-top: 60px;
        `;
        document.body.appendChild(domInput);

        // Панель кнопок
        const buttonPanel = new StackPanel("dialog_buttons");
        buttonPanel.isVertical = false;
        buttonPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        buttonPanel.spacing = 10;
        buttonPanel.width = "100%";
        buttonPanel.paddingTop = "15px";

        // Кнопка Отмена
        const cancelButton = Button.CreateSimpleButton("dialog_cancel", "Отмена");
        cancelButton.width = "150px";
        cancelButton.height = "40px";
        cancelButton.color = "#ffffff";
        cancelButton.fontSize = "12px";
        cancelButton.fontFamily = "'Press Start 2P', monospace";
        cancelButton.background = "#666666";
        cancelButton.thickness = 1;
        cancelButton.cornerRadius = 6;
        cancelButton.paddingTop = "8px";
        cancelButton.paddingBottom = "8px";

        cancelButton.onPointerClickObservable.add(() => {
            if (document.body.contains(domInput)) {
                document.body.removeChild(domInput);
            }
            this.closeDialog();
            callback({ confirmed: false, value: undefined });
        });

        // Кнопка OK
        const okButton = Button.CreateSimpleButton("dialog_ok", "OK");
        okButton.width = "150px";
        okButton.height = "40px";
        okButton.color = "#ffffff";
        okButton.fontSize = "12px";
        okButton.fontFamily = "'Press Start 2P', monospace";
        okButton.background = "#4ade80";
        okButton.thickness = 1;
        okButton.cornerRadius = 6;
        okButton.paddingTop = "8px";
        okButton.paddingBottom = "8px";

        okButton.onPointerClickObservable.add(() => {
            const value = domInput.value || "";
            document.body.removeChild(domInput);
            this.closeDialog();
            callback({ confirmed: true, value });
        });

        buttonPanel.addControl(okButton);
        buttonPanel.addControl(cancelButton);

        // Добавляем элементы в диалог
        dialog.addControl(titleBlock);
        dialog.addControl(messageBlock);
        // inputContainer удален - используем DOM input напрямую
        dialog.addControl(buttonPanel);

        // Добавляем в GUI
        this.guiTexture.addControl(overlay);
        this.guiTexture.addControl(dialog);

        this.currentDialog = dialog;

        // Фокус на input (для DOM элемента)
        setTimeout(() => {
            domInput.focus();
            domInput.select();
        }, 100);

        // Обработка Enter
        const enterHandler = (evt: KeyboardEvent) => {
            if (evt.key === "Enter" && this.currentDialog === dialog && document.activeElement === domInput) {
                const value = domInput.value || "";
                if (document.body.contains(domInput)) {
                    document.body.removeChild(domInput);
                }
                this.closeDialog();
                callback({ confirmed: true, value });
                window.removeEventListener("keydown", enterHandler);
                window.removeEventListener("keydown", escHandler);
            }
        };

        // Закрытие по ESC
        const escHandler = (evt: KeyboardEvent) => {
            if (evt.key === "Escape" && this.currentDialog === dialog) {
                if (document.body.contains(domInput)) {
                    document.body.removeChild(domInput);
                }
                this.closeDialog();
                callback({ confirmed: false, value: undefined });
                window.removeEventListener("keydown", enterHandler);
                window.removeEventListener("keydown", escHandler);
            }
        };

        window.addEventListener("keydown", enterHandler);
        window.addEventListener("keydown", escHandler);
        
        // Фокус на input
        setTimeout(() => {
            domInput.focus();
            domInput.select();
        }, 100);
    }

    /**
     * Закрыть текущий диалог
     */
    private closeDialog(): void {
        if (this.currentDialog && this.guiTexture) {
            console.log("[InGameDialogs] Closing dialog...");
            // Удаляем диалог и overlay
            const overlay = this.guiTexture.getControlByName("dialog_overlay");
            if (overlay) {
                this.guiTexture.removeControl(overlay);
                overlay.dispose();
            }
            this.guiTexture.removeControl(this.currentDialog);
            this.currentDialog.dispose();
            this.currentDialog = null;
            console.log("[InGameDialogs] ✅ Dialog closed");
        }
    }

    /**
     * Очистка ресурсов
     */
    dispose(): void {
        this.closeDialog();
        this.guiTexture = null;
    }
}

// Глобальный экземпляр
let globalDialogs: InGameDialogs | null = null;

/**
 * Получить или создать глобальный экземпляр диалогов
 */
export function getInGameDialogs(): InGameDialogs {
    if (!globalDialogs) {
        globalDialogs = new InGameDialogs();
    }
    return globalDialogs;
}

/**
 * Инициализировать диалоги с GUI текстурой
 */
export function initializeInGameDialogs(guiTexture: AdvancedDynamicTexture): void {
    const dialogs = getInGameDialogs();
    dialogs.initialize(guiTexture);
}

/**
 * Замена для alert()
 */
export async function inGameAlert(message: string, title?: string): Promise<void> {
    const dialogs = getInGameDialogs();
    return dialogs.alert(message, title);
}

/**
 * Замена для confirm()
 */
export async function inGameConfirm(message: string, title?: string): Promise<boolean> {
    const dialogs = getInGameDialogs();
    return dialogs.confirm(message, title);
}

/**
 * Замена для prompt()
 */
export async function inGamePrompt(message: string, defaultValue?: string, title?: string): Promise<string | null> {
    const dialogs = getInGameDialogs();
    return dialogs.prompt(message, defaultValue || "", title);
}

