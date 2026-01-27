import { Game } from './game';
import './styles/responsive.css';
import { registerServiceWorker } from './serviceWorker';
import { Logger } from "@babylonjs/core";

// Отключаем логи Babylon.js (убираем дублирование "BJS - Babylon.js v8.40.1")
Logger.LogLevels = Logger.NoneLogLevel;

// Подавляем ошибки от внешних скриптов (расширения браузера, Sentry и т.д.)
window.addEventListener('error', (event): boolean | void => {
    // Игнорируем ошибки от внешних скриптов (расширения браузера, Sentry)
    if (event.message && (
        event.message.includes('sentry.io') ||
        event.message.includes('ERR_BLOCKED_BY_CLIENT') ||
        event.filename?.includes('chrome-extension://') ||
        event.filename?.includes('moz-extension://')
    )) {
        event.preventDefault();
        return false;
    }
    return true;
}, true);

// Подавляем ошибки от fetch/XMLHttpRequest для внешних скриптов
const originalFetch = window.fetch;
window.fetch = function (...args: Parameters<typeof fetch>) {
    const url = typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof Request
            ? args[0].url
            : String(args[0]);
    // Игнорируем запросы к Sentry и другим внешним сервисам от расширений
    if (url && (
        url.includes('sentry.io') ||
        url.includes('chrome-extension://') ||
        url.includes('moz-extension://')
    )) {
        return Promise.reject(new Error('Blocked by client'));
    }
    return originalFetch.apply(this, args);
};

// Aggressive Browser Hotkey Blocker
window.addEventListener('keydown', (e) => {
    // Block Ctrl+S, Ctrl+P, Ctrl+U, F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if (
        (e.ctrlKey && (e.code === 'KeyS' || e.code === 'KeyP' || e.code === 'KeyU')) ||
        e.code === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.code === 'KeyI' || e.code === 'KeyJ' || e.code === 'KeyC'))
    ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}, true);

// Global resize handler for UI scaling
let resizeTimeout: number | null = null;
window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
        // Trigger custom resize event for UI components
        window.dispatchEvent(new CustomEvent('uiresize'));
    }, 100);
});

// Register Service Worker for caching and offline support
registerServiceWorker();

// Show loading screen immediately for better UX
import { showLoading, setLoadingStage, nextLoadingStage, hideLoading } from './loadingScreen';
showLoading();
setLoadingStage(0, 0); // Инициализация движка

// Initialize game
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _game = new Game();

// Expose game instance globally for CustomMapBridge map reload
(window as any).gameInstance = _game;

// Expose loading screen controls for game to update progress
(window as any).loadingScreenControls = {
    setStage: setLoadingStage,
    nextStage: nextLoadingStage,
    hide: hideLoading
};

// Lazy load analytics after game initialization to reduce initial bundle size
(async () => {
    try {
        const [{ inject }, { injectSpeedInsights }] = await Promise.all([
            import('@vercel/analytics'),
            import('@vercel/speed-insights')
        ]);

        // Suppress Vercel analytics console logs in development
        const originalConsoleLog = console.log;
        const originalConsoleWarn = console.warn;
        console.log = (...args: any[]) => {
            if (!args[0]?.toString().includes('[Vercel') && !args[0]?.toString().includes('Vercel')) {
                originalConsoleLog.apply(console, args);
            }
        };
        console.warn = (...args: any[]) => {
            if (!args[0]?.toString().includes('[Vercel') && !args[0]?.toString().includes('Vercel')) {
                originalConsoleWarn.apply(console, args);
            }
        };

        // Initialize Vercel Web Analytics
        inject();
        // Initialize Vercel Speed Insights (client-side only)
        injectSpeedInsights();

        // Restore console after a delay
        setTimeout(() => {
            console.log = originalConsoleLog;
            console.warn = originalConsoleWarn;
        }, 1000);
    } catch (error) {
        console.warn('Failed to load analytics:', error);
    }
})();
