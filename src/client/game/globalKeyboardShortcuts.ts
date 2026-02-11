// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL KEYBOARD SHORTCUTS - регистрация Ctrl+7, F2, F6–F11, Enter/Backquote
// Вызывается из Game.setupGlobalKeyboardShortcuts(); принимает Game-like API.
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";

/** Минимальный API для регистрации глобальных горячих клавиш (ожидается Game). */
export interface GlobalKeyboardShortcutsAPI {
    getUnifiedMenu(): Promise<{ toggle?: () => void } | null>;
    unifiedMenu?: { toggle?: () => void; visible?: boolean } | null;
    tank?: unknown;
    hud?: { showMessage?: (msg: string, color: string, ms: number) => void; getGuiTexture?: () => unknown } | null;
    garage?: { isGarageOpen?: () => boolean } | null;
    chatSystem?: { toggleTerminal?: () => void; isTerminalVisible?: () => boolean } | null;
    screenshotManager?: {
        capture: (opts: unknown) => Promise<Blob>;
        copyToClipboard: (blob: Blob) => Promise<void>;
        download: (blob: Blob) => void;
        saveToLocalStorage: (blob: Blob, opts: unknown) => Promise<void>;
    } | null;
    engine?: unknown;
    scene?: unknown;
    botPerformanceMonitor?: unknown;
    botPerformanceUI?: { isVisible?: () => boolean; show?: () => void; hide?: () => void } | null;
    botPerformanceSettingsUI?: { isVisible?: () => boolean; show?: () => void; hide?: () => void } | null;
    networkMenu?: { setGame: (g: unknown) => void; isVisible?: () => boolean; show?: () => void; hide?: () => void } | null;
    sessionSettings?: { setGame: (g: unknown) => void; isVisible?: () => boolean; show?: () => void; hide?: () => void } | null;
    getMemoryStats?: () => { materials: number; textures: number };
    cleanupUnusedResources?: () => void;
}

/**
 * Регистрирует глобальные горячие клавиши: Ctrl+7, F2, F6, F7, F8, F9, F10, F11,
 * Enter/Backquote (чат), события botPerformance UI.
 * Ожидается объект с API игры (обычно экземпляр Game).
 */
export function registerGlobalKeyboardShortcuts(game: GlobalKeyboardShortcutsAPI): void {
    const g = game;

    const ctrlHotkeysHandler = (e: KeyboardEvent) => {
        if (!e.ctrlKey) return;
        if (e.code === "Digit7" || e.code === "Numpad7") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!g.unifiedMenu) {
                logger.log("[Game] Loading unified menu (Ctrl+7 CAPTURE)...");
                g.getUnifiedMenu?.().then((menu) => {
                    if (menu && typeof menu.toggle === "function") menu.toggle();
                    logger.log("[Game] Unified menu loaded (Ctrl+7)");
                }).catch((err) => logger.error("[Game] Failed to load unified menu:", err));
            } else {
                if (typeof g.unifiedMenu.toggle === "function") {
                    g.unifiedMenu.toggle();
                    logger.log("[Game] Unified menu toggled (Ctrl+7)");
                }
            }
        }
    };
    window.addEventListener("keydown", ctrlHotkeysHandler, true);

    window.addEventListener("keydown", (e) => {
        if (e.code === "F7" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!g.unifiedMenu) {
                logger.log("[Game] Loading unified menu (F7)...");
                g.getUnifiedMenu?.().then((menu) => {
                    if (menu && typeof menu.toggle === "function") menu.toggle();
                    logger.log("[Game] Unified menu loaded (F7)");
                }).catch((err) => logger.error("[Game] Failed to load unified menu:", err));
            } else {
                if (typeof g.unifiedMenu.toggle === "function") {
                    g.unifiedMenu.toggle();
                    logger.log("[Game] Unified menu toggled (F7)");
                }
            }
        }
    }, true);

    window.addEventListener("keydown", async (e) => {
        if (e.code === "F8" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            try {
                logger.log("[Game] Toggling physics editor (F8)...");
                const { getPhysicsEditor } = await import("../physicsEditor");
                const physicsEditor = getPhysicsEditor();
                if (g.tank) (physicsEditor as { setTank?: (t: unknown) => void }).setTank?.(g.tank);
                (physicsEditor as { setGame?: (game: unknown) => void }).setGame?.(game);
                physicsEditor.toggle();
                logger.log("[Game] Physics editor toggled (F8)");
            } catch (error) {
                logger.error("[Game] Failed to load physics editor:", error);
                g.hud?.showMessage?.("❌ Ошибка загрузки редактора физики", "#f00", 2000);
            }
        }
    }, true);

    window.addEventListener("keydown", async (e) => {
        if (e.code === "F9" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            try {
                logger.log("[Game] Toggling network menu (F9)...");
                if (!g.networkMenu) {
                    const { NetworkMenu } = await import("../networkMenu");
                    const nm = new (NetworkMenu as new () => { setGame: (game: unknown) => void; isVisible?: () => boolean; show?: () => void; hide?: () => void })();
                    nm.setGame(game);
                    (game as Record<string, unknown>).networkMenu = nm;
                }
                const nm = g.networkMenu as { isVisible?: () => boolean; show?: () => void; hide?: () => void };
                if (nm?.isVisible?.()) nm.hide?.();
                else nm?.show?.();
                logger.log("[Game] Network menu toggled (F9)");
            } catch (error) {
                logger.error("[Game] Failed to load network menu:", error);
                g.hud?.showMessage?.("❌ Ошибка загрузки меню сети", "#f00", 2000);
            }
        }
    }, true);

    window.addEventListener("keydown", (e) => {
        if (g.garage?.isGarageOpen?.()) return;
        if ((e.code === "Enter" || e.code === "Backquote") && !e.ctrlKey && !e.altKey && g.chatSystem) {
            const cs = g.chatSystem;
            if (e.code === "Backquote") {
                e.preventDefault();
                cs.toggleTerminal?.();
            } else if (e.code === "Enter" && typeof cs.isTerminalVisible === "function" && !cs.isTerminalVisible()) {
                e.preventDefault();
                cs.toggleTerminal?.();
            }
        }
    });

    window.addEventListener("keydown", async (e) => {
        if (e.code === "F2" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            logger.log("[Game] Taking screenshot (F2)...");
            try {
                let sm = g.screenshotManager;
                if (!sm && g.engine != null && g.scene != null) {
                    const { ScreenshotManager } = await import("../screenshotManager");
                    sm = new (ScreenshotManager as new (a: unknown, b: unknown, c: unknown) => typeof sm)(g.engine, g.scene, g.hud ?? null);
                    (game as Record<string, unknown>).screenshotManager = sm;
                }
                if (sm) {
                    const { ScreenshotFormat, ScreenshotMode } = await import("../screenshotManager");
                    const blob = await sm.capture({ format: ScreenshotFormat.PNG, mode: ScreenshotMode.FULL_SCREEN });
                    await sm.copyToClipboard(blob);
                    sm.download(blob);
                    await sm.saveToLocalStorage(blob, { format: ScreenshotFormat.PNG, mode: ScreenshotMode.FULL_SCREEN });
                    g.hud?.showMessage?.("📸 Скриншот сохранён! [F2]", "#0f0", 2000);
                    logger.log("[Game] Screenshot taken successfully (F2)");
                }
            } catch (error) {
                logger.error("[Game] Screenshot failed:", error);
                g.hud?.showMessage?.("❌ Ошибка скриншота", "#f00", 2000);
            }
        }
    }, true);

    window.addEventListener("keydown", (e) => {
        if (e.code === "F10" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            try {
                if (g.botPerformanceMonitor && g.botPerformanceUI) {
                    if (g.botPerformanceUI.isVisible?.()) {
                        g.botPerformanceUI.hide?.();
                        logger.log("[Game] Bot performance UI hidden (F10)");
                    } else {
                        g.botPerformanceUI.show?.();
                        logger.log("[Game] Bot performance UI shown (F10)");
                    }
                } else {
                    logger.warn("[Game] Bot performance monitor not initialized");
                }
            } catch (error) {
                logger.error("[Game] Failed to toggle bot performance UI:", error);
            }
        }
    }, true);

    window.addEventListener("botPerformanceUI:show", () => {
        try {
            if (g.botPerformanceMonitor && g.botPerformanceUI) {
                g.botPerformanceUI.show?.();
                logger.log("[Game] Bot performance UI shown from mini panel");
            }
        } catch (error) {
            logger.error("[Game] Failed to show bot performance UI from mini panel:", error);
        }
    });

    window.addEventListener("botPerformanceSettingsUI:show", async () => {
        try {
            if (!g.botPerformanceMonitor || !g.hud) {
                logger.warn("[Game] Bot performance monitor or HUD not initialized");
                return;
            }
            const guiTexture = (g.hud as { getGuiTexture?: () => unknown }).getGuiTexture?.();
            if (!guiTexture) {
                logger.warn("[Game] GUI texture not available for bot performance settings");
                return;
            }
            let settingsUI = g.botPerformanceSettingsUI;
            if (!settingsUI) {
                const { BotPerformanceSettingsUI } = await import("../bots/BotPerformanceSettingsUI");
                settingsUI = new (BotPerformanceSettingsUI as new (a: unknown, b: unknown) => typeof settingsUI)(g.botPerformanceMonitor, guiTexture);
                (game as Record<string, unknown>).botPerformanceSettingsUI = settingsUI;
                logger.log("[Game] Bot performance settings UI created");
            }
            if (settingsUI.isVisible?.()) {
                settingsUI.hide?.();
                logger.log("[Game] Bot performance settings UI hidden");
            } else {
                settingsUI.show?.();
                logger.log("[Game] Bot performance settings UI shown");
            }
        } catch (error) {
            logger.error("[Game] Failed to toggle bot performance settings UI:", error);
        }
    });

    const ctrlBHandler = (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.code === "KeyB" || e.key === "b" || e.key === "B")) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            try {
                if (g.botPerformanceMonitor && g.botPerformanceUI) {
                    if (g.botPerformanceUI.isVisible?.()) {
                        g.botPerformanceUI.hide?.();
                        logger.log("[Game] Bot performance UI hidden (Ctrl+B)");
                    } else {
                        g.botPerformanceUI.show?.();
                        logger.log("[Game] Bot performance UI shown (Ctrl+B)");
                    }
                } else {
                    logger.warn("[Game] Bot performance monitor not initialized");
                }
            } catch (error) {
                logger.error("[Game] Failed to toggle bot performance UI:", error);
            }
        }
    };
    window.addEventListener("keydown", ctrlBHandler, true);

    window.addEventListener("keydown", async (e) => {
        if (e.code === "F6" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            try {
                logger.log("[Game] Toggling session settings (F6)...");
                let ss = g.sessionSettings;
                if (!ss) {
                    const { SessionSettings } = await import("../sessionSettings");
                    ss = new (SessionSettings as new (arg: boolean) => typeof ss)(false);
                    (ss as { setGame: (game: unknown) => void }).setGame(game);
                    (game as Record<string, unknown>).sessionSettings = ss;
                }
                if (ss && typeof ss.isVisible === "function") {
                    if (ss.isVisible() && ss.hide) {
                        ss.hide();
                        logger.log("[Game] Session settings hidden (F6)");
                    } else if (ss.show) {
                        ss.show();
                        logger.log("[Game] Session settings shown (F6)");
                    }
                }
            } catch (error) {
                logger.error("[Game] Failed to load session settings:", error);
                g.hud?.showMessage?.("❌ Ошибка загрузки настроек сессии", "#f00", 2000);
            }
        }
    }, true);

    window.addEventListener("keydown", (e) => {
        if (e.code === "F11" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            const statsBefore = g.getMemoryStats?.() ?? { materials: 0, textures: 0 };
            g.cleanupUnusedResources?.();
            const statsAfter = g.getMemoryStats?.() ?? { materials: 0, textures: 0 };
            logger.log(`[Game] 🧹 Manual memory cleanup (F11): Materials ${statsBefore.materials} → ${statsAfter.materials}, Textures ${statsBefore.textures} → ${statsAfter.textures}`);
            g.hud?.showMessage?.(
                `🧹 Очистка памяти: ${statsBefore.materials - statsAfter.materials} мат. ${statsBefore.textures - statsAfter.textures} текст.`,
                "#4ade80",
                3000
            );
        }
    }, true);

    logger.log("[Game] Global keyboard shortcuts registered successfully");
}
