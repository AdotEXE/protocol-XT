import { Game } from './game';
import './styles/responsive.css';
import { registerServiceWorker } from './serviceWorker';

console.log('Protocol TX Client Starting...');

// Подавляем ошибки от внешних скриптов (расширения браузера, Sentry и т.д.)
window.addEventListener('error', (event) => {
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
}, true);

// Подавляем ошибки от fetch/XMLHttpRequest для внешних скриптов
const originalFetch = window.fetch;
window.fetch = function(...args: Parameters<typeof fetch>) {
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

// Initialize game
const game = new Game();

// Lazy load analytics after game initialization to reduce initial bundle size
(async () => {
    try {
        const [{ inject }, { injectSpeedInsights }] = await Promise.all([
            import('@vercel/analytics'),
            import('@vercel/speed-insights')
        ]);
        
        // Initialize Vercel Web Analytics
        inject();
        // Initialize Vercel Speed Insights (client-side only)
        injectSpeedInsights();
    } catch (error) {
        console.warn('Failed to load analytics:', error);
    }
})();
