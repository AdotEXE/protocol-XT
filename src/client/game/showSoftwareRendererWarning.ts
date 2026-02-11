/**
 * Показ постоянного предупреждения при обнаружении программного рендерера (нет реального GPU).
 */

/**
 * Показывает баннер с предупреждением и кнопкой Dismiss.
 * Не создаёт дубликат, если элемент #software-renderer-warning уже есть.
 */
export function showSoftwareRendererWarning(rendererName: string): void {
    if (document.getElementById("software-renderer-warning")) return;

    const banner = document.createElement("div");
    banner.id = "software-renderer-warning";
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        background: linear-gradient(90deg, #8b0000, #b22222, #8b0000);
        color: #fff;
        padding: 10px 20px;
        font-family: 'Press Start 2P', 'Consolas', monospace;
        font-size: 11px;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        pointer-events: auto;
    `;
    banner.innerHTML = `
        <div style="flex: 1;">
            <strong>WARNING: SOFTWARE RENDERER</strong><br>
            <span style="font-size: 9px; opacity: 0.9;">
                GPU: ${rendererName}. Hardware acceleration is disabled or unavailable.<br>
                Enable it in Chrome: chrome://settings/system → "Use hardware acceleration"
            </span>
        </div>
        <button id="sw-renderer-dismiss" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.5);
            color: #fff;
            padding: 5px 12px;
            cursor: pointer;
            font-family: inherit;
            font-size: 10px;
            margin-left: 15px;
            white-space: nowrap;
        ">DISMISS</button>
    `;
    document.body.appendChild(banner);

    document.getElementById("sw-renderer-dismiss")?.addEventListener("click", () => {
        banner.remove();
    });
}
