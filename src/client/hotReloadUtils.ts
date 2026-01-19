import { HUD } from "./hud";

/**
 * Setup Hot Reload notifications
 * @param hud HUD instance to show notifications
 */
export function setupHotReload(hud: HUD) {
    if (import.meta.hot) {
        console.log("[HotReload] HMR listener setup");

        // Listen for HMR updates
        import.meta.hot.on('vite:beforeUpdate', (pl) => {
            console.log("[HotReload] Update incoming...", pl);
            hud.showHotReloadNotification();
        });

        // We can't strictly detect "afterUpdate" globally easily without a plugin, 
        // but often the module re-executes. 
        // However, standard HMR might verify by just seeing the invalidation.

        // Let's at least notify we are monitoring.
        // hud.showNotification("DEV MODE: HMR ACTIVE", "info");
    }
}
