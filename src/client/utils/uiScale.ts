/**
 * UI Scaling Utilities
 * Provides functions for scaling UI elements based on screen size
 * Base resolution: 1920x1080
 */

// Base resolution for scaling calculations
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

// User-configurable UI scale (50% - 150%)
let userScaleFactor = 1.0;

// Event listeners for scale changes
const scaleChangeListeners: Array<(scale: number) => void> = [];

/**
 * Load user scale from localStorage
 */
function loadUserScale(): number {
    try {
        const saved = localStorage.getItem('ui-scale');
        if (saved) {
            const scale = parseFloat(saved);
            if (!isNaN(scale) && scale >= 0.5 && scale <= 1.5) {
                return scale;
            }
        }
    } catch (e) {
        // Ignore localStorage errors
    }
    return 1.0;
}

// Initialize user scale
userScaleFactor = loadUserScale();

/**
 * Set user UI scale factor
 * @param scale - Scale factor (0.5 to 1.5)
 */
export function setUserScale(scale: number): void {
    const clampedScale = Math.max(0.5, Math.min(1.5, scale));
    userScaleFactor = clampedScale;
    
    try {
        localStorage.setItem('ui-scale', clampedScale.toString());
    } catch (e) {
        // Ignore localStorage errors
    }
    
    // Notify listeners
    scaleChangeListeners.forEach(listener => listener(clampedScale));
}

/**
 * Get current user scale factor
 */
export function getUserScale(): number {
    return userScaleFactor;
}

/**
 * Subscribe to scale changes
 */
export function onScaleChange(callback: (scale: number) => void): () => void {
    scaleChangeListeners.push(callback);
    return () => {
        const index = scaleChangeListeners.indexOf(callback);
        if (index > -1) scaleChangeListeners.splice(index, 1);
    };
}

/**
 * Get scale factor based on current screen size
 * @returns Scale factor (1.0 = base resolution)
 */
export function getScaleFactor(): number {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Use the smaller dimension to maintain aspect ratio
    const scaleX = width / BASE_WIDTH;
    const scaleY = height / BASE_HEIGHT;
    
    // Base scale from screen size
    const baseScale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x for very large screens
    
    // Apply user scale factor
    return baseScale * userScaleFactor;
}

/**
 * Scale pixels based on screen size
 * @param px - Pixel value at base resolution
 * @returns Scaled pixel value
 */
export function scalePixels(px: number): number {
    return px * getScaleFactor();
}

/**
 * Get responsive size with min/max constraints
 * @param baseSize - Base size at 1920x1080
 * @param minSize - Minimum size
 * @param maxSize - Maximum size
 * @returns Clamped scaled size
 */
export function getResponsiveSize(baseSize: number, minSize: number, maxSize: number): number {
    const scaled = scalePixels(baseSize);
    return Math.max(minSize, Math.min(maxSize, scaled));
}

/**
 * Convert pixels to viewport width units
 * @param px - Pixel value at base resolution
 * @returns Viewport width percentage
 */
export function pxToVw(px: number): number {
    return (px / BASE_WIDTH) * 100;
}

/**
 * Convert pixels to viewport height units
 * @param px - Pixel value at base resolution
 * @returns Viewport height percentage
 */
export function pxToVh(px: number): number {
    return (px / BASE_HEIGHT) * 100;
}

/**
 * Get responsive font size using clamp
 * @param baseSize - Base font size at 1920x1080
 * @param minSize - Minimum font size
 * @param maxSize - Maximum font size
 * @returns CSS clamp() string
 */
export function getResponsiveFontSize(baseSize: number, minSize: number, maxSize: number): string {
    const vwSize = pxToVw(baseSize);
    return `clamp(${minSize}px, ${vwSize}vw, ${maxSize}px)`;
}

/**
 * Get screen size category
 * @returns Screen size category
 */
export function getScreenSizeCategory(): 'mobile' | 'tablet' | 'desktop' | 'large' {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    if (width < 1920) return 'desktop';
    return 'large';
}

/**
 * Check if screen is mobile
 */
export function isMobile(): boolean {
    return getScreenSizeCategory() === 'mobile';
}

/**
 * Check if screen is tablet
 */
export function isTablet(): boolean {
    return getScreenSizeCategory() === 'tablet';
}

/**
 * Get current viewport dimensions
 */
export function getViewportSize(): { width: number; height: number } {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

/**
 * Calculate percentage position from pixel position
 * @param px - Pixel position at base resolution
 * @param isHorizontal - True for horizontal (width), false for vertical (height)
 * @returns Percentage value (0-100)
 */
export function pxToPercent(px: number, isHorizontal: boolean = true): number {
    const base = isHorizontal ? BASE_WIDTH : BASE_HEIGHT;
    return (px / base) * 100;
}









