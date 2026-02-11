/**
 * Управление pointer-events на canvas в зависимости от видимости меню.
 * Блокирует клики по canvas, когда меню открыто.
 */

/**
 * Устанавливает pointer-events на canvas: none при открытом меню, auto при закрытом.
 */
export function updateCanvasPointerEvents(
    canvas: HTMLCanvasElement | null,
    isMenuVisible: boolean
): void {
    if (!canvas) return;
    if (isMenuVisible) {
        canvas.style.setProperty("pointer-events", "none", "important");
        canvas.setAttribute("data-menu-blocked", "true");
    } else {
        canvas.style.setProperty("pointer-events", "auto", "important");
        canvas.removeAttribute("data-menu-blocked");
    }
}
