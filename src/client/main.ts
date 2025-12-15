import { Game } from './game';
import './styles/responsive.css';
import { injectSpeedInsights } from '@vercel/speed-insights';

console.log('Protocol TX Client Starting...');

// Initialize Vercel Speed Insights (client-side only)
injectSpeedInsights();

// Global resize handler for UI scaling
let resizeTimeout: number | null = null;
window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
        // Trigger custom resize event for UI components
        window.dispatchEvent(new CustomEvent('uiresize'));
    }, 100);
});

new Game();
