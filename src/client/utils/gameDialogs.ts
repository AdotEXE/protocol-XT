/**
 * Внутриигровые диалоги на DOM (стиль протокола).
 * Замена браузерных alert/confirm/prompt — везде вызывать эти функции вместо window.*
 */

function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

const overlayStyle = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const boxStyle = `
    background: rgba(0, 20, 0, 0.95);
    border: 2px solid #0f0;
    border-radius: 4px;
    padding: 24px;
    max-width: 480px;
    color: #0f0;
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    line-height: 1.6;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
`;

const btnStyle = `
    background: #000;
    border: 2px solid #0f0;
    color: #0f0;
    padding: 10px 24px;
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    cursor: pointer;
    margin-left: 8px;
`;

/**
 * Уведомление (замена alert)
 */
export function gameAlert(message: string, title: string = "Уведомление"): Promise<void> {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = overlayStyle;

        const dialog = document.createElement("div");
        dialog.style.cssText = boxStyle;
        dialog.innerHTML = `
            <div style="color: #0f0; font-size: 12px; margin-bottom: 12px; text-shadow: 0 0 8px #0f0;">${escapeHtml(title)}</div>
            <div style="margin-bottom: 20px; line-height: 1.7;">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
            <button type="button" class="game-dialog-ok" style="${btnStyle}">OK</button>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => {
            if (overlay.parentNode) document.body.removeChild(overlay);
            resolve();
        };

        dialog.querySelector(".game-dialog-ok")?.addEventListener("click", close);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    });
}

/**
 * Подтверждение (замена confirm)
 */
export function gameConfirm(message: string, title: string = "Подтверждение"): Promise<boolean> {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = overlayStyle;

        const dialog = document.createElement("div");
        dialog.style.cssText = boxStyle;
        dialog.innerHTML = `
            <div style="color: #0f0; font-size: 12px; margin-bottom: 12px; text-shadow: 0 0 8px #0f0;">${escapeHtml(title)}</div>
            <div style="margin-bottom: 20px; line-height: 1.7;">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" class="game-dialog-cancel" style="${btnStyle}">ОТМЕНА</button>
                <button type="button" class="game-dialog-ok" style="${btnStyle}">OK</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = (result: boolean) => {
            if (overlay.parentNode) document.body.removeChild(overlay);
            resolve(result);
        };

        dialog.querySelector(".game-dialog-cancel")?.addEventListener("click", () => close(false));
        dialog.querySelector(".game-dialog-ok")?.addEventListener("click", () => close(true));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    });
}

/**
 * Ввод строки (замена prompt)
 */
export function gamePrompt(
    message: string,
    defaultValue: string = "",
    title: string = "Ввод"
): Promise<string | null> {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = overlayStyle;

        const dialog = document.createElement("div");
        dialog.style.cssText = boxStyle;
        const inputId = "game-prompt-input-" + Date.now();
        dialog.innerHTML = `
            <div style="color: #0f0; font-size: 12px; margin-bottom: 12px; text-shadow: 0 0 8px #0f0;">${escapeHtml(title)}</div>
            <div style="margin-bottom: 12px; line-height: 1.7;">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
            <input type="text" id="${inputId}" value="${escapeHtml(defaultValue)}" style="
                width: 100%;
                box-sizing: border-box;
                margin-bottom: 16px;
                padding: 10px;
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
            " />
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" class="game-dialog-cancel" style="${btnStyle}">ОТМЕНА</button>
                <button type="button" class="game-dialog-ok" style="${btnStyle}">OK</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector("#" + inputId) as HTMLInputElement;

        const close = (result: string | null) => {
            if (overlay.parentNode) document.body.removeChild(overlay);
            resolve(result);
        };

        const submit = () => close(input?.value ?? "");

        dialog.querySelector(".game-dialog-cancel")?.addEventListener("click", () => close(null));
        dialog.querySelector(".game-dialog-ok")?.addEventListener("click", submit);
        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") close(null);
        });
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

        setTimeout(() => input?.focus(), 50);
    });
}
