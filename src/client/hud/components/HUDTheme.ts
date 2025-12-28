/**
 * @module hud/components/HUDTheme
 * @description Система тем и стилей для HUD
 */

/**
 * Цветовая схема HUD
 */
export interface HUDColorScheme {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    textSecondary: string;
    success: string;
    warning: string;
    error: string;
    health: string;
    fuel: string;
    armor: string;
}

/**
 * Тема HUD
 */
export interface HUDTheme {
    name: string;
    colors: HUDColorScheme;
    fontFamily: string;
    fontSize: number;
}

/**
 * Стандартная тема (по умолчанию)
 */
export const DEFAULT_THEME: HUDTheme = {
    name: "default",
    colors: {
        primary: "#0066ff",
        secondary: "#00aaff",
        accent: "#ffaa00",
        background: "rgba(0, 0, 0, 0.7)",
        text: "#ffffff",
        textSecondary: "#aaaaaa",
        success: "#00ff00",
        warning: "#ffaa00",
        error: "#ff0000",
        health: "#ff0000",
        fuel: "#00ff00",
        armor: "#8888ff"
    },
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 12
};

/**
 * Темная тема
 */
export const DARK_THEME: HUDTheme = {
    name: "dark",
    colors: {
        primary: "#3333ff",
        secondary: "#5555ff",
        accent: "#ff8800",
        background: "rgba(0, 0, 0, 0.9)",
        text: "#ffffff",
        textSecondary: "#cccccc",
        success: "#00ff00",
        warning: "#ffaa00",
        error: "#ff0000",
        health: "#ff3333",
        fuel: "#33ff33",
        armor: "#8888ff"
    },
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 12
};

/**
 * Светлая тема
 */
export const LIGHT_THEME: HUDTheme = {
    name: "light",
    colors: {
        primary: "#0066ff",
        secondary: "#0088ff",
        accent: "#ff6600",
        background: "rgba(255, 255, 255, 0.8)",
        text: "#000000",
        textSecondary: "#333333",
        success: "#00aa00",
        warning: "#ff8800",
        error: "#cc0000",
        health: "#cc0000",
        fuel: "#00aa00",
        armor: "#6666ff"
    },
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 12
};

/**
 * Менеджер тем HUD
 */
export class HUDThemeManager {
    private currentTheme: HUDTheme;
    private themes: Map<string, HUDTheme>;
    
    constructor(initialTheme: HUDTheme = DEFAULT_THEME) {
        this.currentTheme = initialTheme;
        this.themes = new Map();
        this.themes.set("default", DEFAULT_THEME);
        this.themes.set("dark", DARK_THEME);
        this.themes.set("light", LIGHT_THEME);
    }
    
    /**
     * Получить текущую тему
     */
    getCurrentTheme(): HUDTheme {
        return this.currentTheme;
    }
    
    /**
     * Установить тему
     */
    setTheme(name: string): boolean {
        const theme = this.themes.get(name);
        if (theme) {
            this.currentTheme = theme;
            return true;
        }
        return false;
    }
    
    /**
     * Зарегистрировать новую тему
     */
    registerTheme(theme: HUDTheme): void {
        this.themes.set(theme.name, theme);
    }
    
    /**
     * Получить список доступных тем
     */
    getAvailableThemes(): string[] {
        return Array.from(this.themes.keys());
    }
}

