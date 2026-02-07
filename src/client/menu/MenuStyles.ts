/**
 * @module menu/MenuStyles
 * @description Централизованные стили для меню - CSS переменные, классы и темы
 * 
 * Этот модуль содержит:
 * - CSS переменные и константы
 * - Функции для генерации стилей
 * - Темы и пресеты
 */

// ============================================
// CSS ПЕРЕМЕННЫЕ
// ============================================

export const CSS_VARIABLES = {
    // Основные цвета
    "--color-primary": "#00ff00",
    "--color-primary-dark": "#00aa00",
    "--color-primary-light": "#66ff66",
    "--color-secondary": "#008800",
    "--color-accent": "#ffff00",

    // Фоны
    "--bg-dark": "rgba(0, 10, 0, 0.95)",
    "--bg-panel": "rgba(0, 20, 0, 0.9)",
    "--bg-overlay": "rgba(0, 0, 0, 0.8)",
    "--bg-button": "rgba(0, 40, 0, 0.8)",
    "--bg-button-hover": "rgba(0, 60, 0, 0.9)",
    "--bg-input": "rgba(0, 30, 0, 0.7)",

    // Границы
    "--border-color": "#00ff00",
    "--border-dim": "#006600",
    "--border-width": "2px",
    "--border-radius": "5px",
    "--border-radius-lg": "10px",

    // Тени
    "--shadow-glow": "0 0 10px rgba(0, 255, 0, 0.5)",
    "--shadow-strong": "0 0 20px rgba(0, 255, 0, 0.8)",
    "--shadow-panel": "0 4px 20px rgba(0, 0, 0, 0.5)",

    // Текст
    "--text-primary": "#ffffff",
    "--text-secondary": "#aaaaaa",
    "--text-muted": "#666666",
    "--text-success": "#00ff00",
    "--text-warning": "#ffff00",
    "--text-danger": "#ff0000",

    // Шрифты
    "--font-primary": "'Press Start 2P', monospace",
    "--font-secondary": "'Press Start 2P', monospace",
    "--font-size-xs": "10px",
    "--font-size-sm": "12px",
    "--font-size-md": "14px",
    "--font-size-lg": "18px",
    "--font-size-xl": "24px",
    "--font-size-xxl": "32px",

    // Размеры
    "--spacing-xs": "4px",
    "--spacing-sm": "8px",
    "--spacing-md": "16px",
    "--spacing-lg": "24px",
    "--spacing-xl": "32px",

    // Переходы
    "--transition-fast": "0.15s ease",
    "--transition-normal": "0.3s ease",
    "--transition-slow": "0.5s ease"
} as const;

// ============================================
// [Opus 4.5] Z-INDEX HIERARCHY - единая система слоёв
// ============================================

export const Z_INDEX = {
    // Базовые элементы UI (0-99)
    BASE: 0,
    HUD_BACKGROUND: 10,

    // HUD элементы (100-999)
    HUD: 100,
    HUD_OVERLAY: 500,
    MINIMAP: 600,

    // Панели меню (1000-9999)
    PANEL: 1000,
    PANEL_ABOVE: 2000,
    SETTINGS: 3000,

    // Модальные окна (10000-19999)
    MODAL: 10000,
    MODAL_OVERLAY: 10001,
    MODAL_CONTENT: 10002,

    // Попапы и селекторы (20000-29999)
    POPUP: 20000,
    AVATAR_SELECTOR: 20000,
    DROPDOWN: 25000,

    // Критические оверлеи (30000+)
    LOADING: 30000,
    AUTH: 35000,
    ERROR: 40000,
    DEBUG: 50000
} as const;

// ============================================
// КЛАССЫ КНОПОК
// ============================================

export const BUTTON_STYLES = {
    base: `
        background: var(--bg-button);
        border: var(--border-width) solid var(--border-color);
        color: var(--color-primary);
        font-family: var(--font-primary);
        font-size: var(--font-size-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        cursor: pointer;
        transition: all var(--transition-fast);
        text-transform: uppercase;
        letter-spacing: 1px;
    `,

    primary: `
        background: linear-gradient(180deg, #004400 0%, #002200 100%);
        border-color: var(--color-primary);
        color: var(--color-primary);
        box-shadow: var(--shadow-glow);
    `,

    secondary: `
        background: transparent;
        border-color: var(--border-dim);
        color: var(--text-secondary);
    `,

    danger: `
        background: linear-gradient(180deg, #440000 0%, #220000 100%);
        border-color: var(--text-danger);
        color: var(--text-danger);
    `,

    hover: `
        background: var(--bg-button-hover);
        box-shadow: var(--shadow-strong);
        transform: scale(1.02);
    `,

    disabled: `
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
    `,

    large: `
        font-size: var(--font-size-md);
        padding: var(--spacing-md) var(--spacing-lg);
    `,

    small: `
        font-size: var(--font-size-xs);
        padding: var(--spacing-xs) var(--spacing-sm);
    `
};

// ============================================
// КЛАССЫ ПАНЕЛЕЙ
// ============================================

export const PANEL_STYLES = {
    base: `
        background: var(--bg-panel);
        border: var(--border-width) solid var(--border-color);
        border-radius: var(--border-radius);
        padding: var(--spacing-md);
        box-shadow: var(--shadow-panel);
    `,

    overlay: `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 1000;
    `,

    sidebar: `
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        width: 350px;
    `,

    modal: `
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
    `,

    transparent: `
        background: transparent;
        border: none;
        box-shadow: none;
    `
};

// ============================================
// КЛАССЫ ИНПУТОВ
// ============================================

export const INPUT_STYLES = {
    base: `
        background: var(--bg-input);
        border: 1px solid var(--border-dim);
        color: var(--text-primary);
        font-family: var(--font-secondary);
        font-size: var(--font-size-md);
        padding: var(--spacing-sm);
        outline: none;
        transition: border-color var(--transition-fast);
    `,

    focus: `
        border-color: var(--color-primary);
        box-shadow: 0 0 5px var(--color-primary);
    `,

    slider: `
        -webkit-appearance: none;
        width: 100%;
        height: 8px;
        background: var(--bg-input);
        border-radius: 4px;
        outline: none;
    `,

    sliderThumb: `
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        background: var(--color-primary);
        border-radius: 50%;
        cursor: pointer;
    `,

    checkbox: `
        width: 20px;
        height: 20px;
        accent-color: var(--color-primary);
    `,

    select: `
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%2300ff00' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        background-size: 16px;
        padding-right: 32px;
    `
};

// ============================================
// АНИМАЦИИ
// ============================================

export const ANIMATIONS = {
    fadeIn: `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `,

    fadeOut: `
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `,

    slideIn: `
        @keyframes slideIn {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `,

    slideOut: `
        @keyframes slideOut {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(-20px); opacity: 0; }
        }
    `,

    pulse: `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `,

    glow: `
        @keyframes glow {
            0%, 100% { box-shadow: 0 0 5px var(--color-primary); }
            50% { box-shadow: 0 0 20px var(--color-primary); }
        }
    `,

    scan: `
        @keyframes scan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
        }
    `,

    blink: `
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }
    `
};

// ============================================
// ТЕМЫ
// ============================================

export interface MenuTheme {
    name: string;
    cssVariables: Record<string, string>;
}

export const THEMES: Record<string, MenuTheme> = {
    military: {
        name: "Военная",
        cssVariables: {
            "--color-primary": "#00ff00",
            "--color-primary-dark": "#00aa00",
            "--bg-dark": "rgba(0, 10, 0, 0.95)",
            "--bg-panel": "rgba(0, 20, 0, 0.9)",
            "--border-color": "#00ff00"
        }
    },

    cyberpunk: {
        name: "Киберпанк",
        cssVariables: {
            "--color-primary": "#00ffff",
            "--color-primary-dark": "#0088aa",
            "--bg-dark": "rgba(10, 0, 20, 0.95)",
            "--bg-panel": "rgba(20, 0, 40, 0.9)",
            "--border-color": "#00ffff"
        }
    },

    classic: {
        name: "Классика",
        cssVariables: {
            "--color-primary": "#ffaa00",
            "--color-primary-dark": "#aa6600",
            "--bg-dark": "rgba(20, 15, 10, 0.95)",
            "--bg-panel": "rgba(30, 25, 20, 0.9)",
            "--border-color": "#ffaa00"
        }
    },

    minimal: {
        name: "Минимализм",
        cssVariables: {
            "--color-primary": "#ffffff",
            "--color-primary-dark": "#aaaaaa",
            "--bg-dark": "rgba(20, 20, 20, 0.95)",
            "--bg-panel": "rgba(30, 30, 30, 0.9)",
            "--border-color": "#ffffff"
        }
    }
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Генерировать CSS переменные
 */
export function generateCSSVariables(variables: Record<string, string> = CSS_VARIABLES): string {
    const lines = Object.entries(variables).map(([key, value]) => `    ${key}: ${value};`);
    return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * Применить тему
 */
export function applyTheme(themeName: string): void {
    const theme = THEMES[themeName];
    if (!theme) return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.cssVariables)) {
        root.style.setProperty(key, value);
    }
}

/**
 * Получить текущую тему
 */
export function getCurrentTheme(): string {
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim();

    for (const [name, theme] of Object.entries(THEMES)) {
        if (theme.cssVariables["--color-primary"] === primary) {
            return name;
        }
    }

    return "military";
}

/**
 * Генерировать стиль кнопки
 */
export function generateButtonStyle(
    variant: "primary" | "secondary" | "danger" = "primary",
    size: "small" | "medium" | "large" = "medium",
    disabled: boolean = false
): string {
    let style = BUTTON_STYLES.base + BUTTON_STYLES[variant];

    if (size === "small") style += BUTTON_STYLES.small;
    if (size === "large") style += BUTTON_STYLES.large;
    if (disabled) style += BUTTON_STYLES.disabled;

    return style;
}

/**
 * Генерировать стиль панели
 */
export function generatePanelStyle(
    type: "base" | "overlay" | "sidebar" | "modal" = "base",
    transparent: boolean = false
): string {
    let style = PANEL_STYLES.base + PANEL_STYLES[type];
    if (transparent) style += PANEL_STYLES.transparent;
    return style;
}

/**
 * Конвертировать hex в rgba
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;

    const r = parseInt(result[1] || "0", 16);
    const g = parseInt(result[2] || "0", 16);
    const b = parseInt(result[3] || "0", 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Затемнить цвет
 */
export function darkenColor(hex: string, percent: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;

    const r = Math.max(0, Math.floor(parseInt(result[1] || "0", 16) * (1 - percent / 100)));
    const g = Math.max(0, Math.floor(parseInt(result[2] || "0", 16) * (1 - percent / 100)));
    const b = Math.max(0, Math.floor(parseInt(result[3] || "0", 16) * (1 - percent / 100)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Осветлить цвет
 */
export function lightenColor(hex: string, percent: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;

    const r = Math.min(255, Math.floor(parseInt(result[1] || "0", 16) * (1 + percent / 100)));
    const g = Math.min(255, Math.floor(parseInt(result[2] || "0", 16) * (1 + percent / 100)));
    const b = Math.min(255, Math.floor(parseInt(result[3] || "0", 16) * (1 + percent / 100)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Генерировать все анимации
 */
export function generateAnimations(): string {
    return Object.values(ANIMATIONS).join('\n');
}

/**
 * Генерировать полный CSS
 */
export function generateFullCSS(): string {
    return `
${generateCSSVariables()}

${generateAnimations()}

/* Base reset */
* {
    box-sizing: border-box;
}

/* Scrollbar styling */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: var(--bg-dark);
}

::-webkit-scrollbar-thumb {
    background: var(--border-dim);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--color-primary);
}

/* Focus outline */
:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}

/* Selection */
::selection {
    background: var(--color-primary);
    color: var(--bg-dark);
}
`;
}

export default {
    CSS_VARIABLES,
    BUTTON_STYLES,
    PANEL_STYLES,
    INPUT_STYLES,
    ANIMATIONS,
    THEMES
};

