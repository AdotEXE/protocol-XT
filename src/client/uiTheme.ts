/**
 * UI Theme Manager - Единая система тем для всех меню
 */

import { logger } from "./utils/logger";

export interface UITheme {
    name: string;
    colors: {
        background: string;
        foreground: string;
        accent: string;
        border: string;
        text: string;
        textSecondary: string;
        success: string;
        warning: string;
        error: string;
    };
    fonts: {
        primary: string;
        monospace: string;
    };
}

export class ThemeManager {
    private currentTheme!: UITheme;
    private themes: Map<string, UITheme> = new Map();

    constructor() {
        this.loadDefaultThemes();
        this.applyTheme('dark');
    }

    /**
     * Загрузка предустановленных тем
     */
    private loadDefaultThemes(): void {
        // Тёмная тема (по умолчанию)
        this.themes.set('dark', {
            name: 'Dark',
            colors: {
                background: 'rgba(0, 10, 0, 0.95)',
                foreground: 'rgba(0, 20, 0, 0.9)',
                accent: 'rgba(0, 255, 4, 0.6)',
                border: 'rgba(0, 255, 4, 0.4)',
                text: '#0f0',
                textSecondary: '#aaa',
                success: '#0f0',
                warning: '#ff0',
                error: '#f00'
            },
            fonts: {
                primary: "'Press Start 2P', 'Consolas', monospace",
                monospace: "'Press Start 2P', 'Consolas', monospace"
            }
        });

        // Светлая тема
        this.themes.set('light', {
            name: 'Light',
            colors: {
                background: 'rgba(240, 240, 240, 0.95)',
                foreground: 'rgba(255, 255, 255, 0.9)',
                accent: 'rgba(0, 150, 0, 0.6)',
                border: 'rgba(0, 150, 0, 0.4)',
                text: '#000',
                textSecondary: '#666',
                success: '#0a0',
                warning: '#aa0',
                error: '#a00'
            },
            fonts: {
                primary: "'Press Start 2P', 'Consolas', monospace",
                monospace: "'Press Start 2P', 'Consolas', monospace"
            }
        });

        // Синяя тема
        this.themes.set('blue', {
            name: 'Blue',
            colors: {
                background: 'rgba(0, 10, 20, 0.95)',
                foreground: 'rgba(0, 20, 40, 0.9)',
                accent: 'rgba(0, 150, 255, 0.6)',
                border: 'rgba(0, 150, 255, 0.4)',
                text: '#0af',
                textSecondary: '#aaa',
                success: '#0f0',
                warning: '#ff0',
                error: '#f00'
            },
            fonts: {
                primary: "'Press Start 2P', 'Consolas', monospace",
                monospace: "'Press Start 2P', 'Consolas', monospace"
            }
        });

        // Загрузка из localStorage
        this.loadThemesFromStorage();
    }

    /**
     * Применение темы
     */
    applyTheme(name: string): void {
        const theme = this.themes.get(name);
        if (!theme) {
            logger.warn(`[ThemeManager] Theme "${name}" not found, using dark`);
            this.applyTheme('dark');
            return;
        }

        this.currentTheme = theme;

        // Установка CSS переменных
        const root = document.documentElement;
        root.style.setProperty('--theme-bg', theme.colors.background);
        root.style.setProperty('--theme-fg', theme.colors.foreground);
        root.style.setProperty('--theme-accent', theme.colors.accent);
        root.style.setProperty('--theme-border', theme.colors.border);
        root.style.setProperty('--theme-text', theme.colors.text);
        root.style.setProperty('--theme-text-secondary', theme.colors.textSecondary);
        root.style.setProperty('--theme-success', theme.colors.success);
        root.style.setProperty('--theme-warning', theme.colors.warning);
        root.style.setProperty('--theme-error', theme.colors.error);
        root.style.setProperty('--theme-font-primary', theme.fonts.primary);
        root.style.setProperty('--theme-font-mono', theme.fonts.monospace);

        // Сохранение выбранной темы
        localStorage.setItem('ptx_ui_theme', name);

        // Событие изменения темы
        window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: name } }));
    }

    /**
     * Создание кастомной темы
     */
    createCustomTheme(name: string, colors: Partial<UITheme['colors']>): void {
        const baseTheme = this.themes.get('dark')!;
        const customTheme: UITheme = {
            name,
            colors: { ...baseTheme.colors, ...colors },
            fonts: baseTheme.fonts
        };
        this.themes.set(name, customTheme);
        this.saveThemesToStorage();
    }

    /**
     * Получить текущую тему
     */
    getCurrentTheme(): UITheme {
        return this.currentTheme;
    }

    /**
     * Получить список всех тем
     */
    getThemes(): UITheme[] {
        return Array.from(this.themes.values());
    }

    /**
     * Удалить тему
     */
    deleteTheme(name: string): boolean {
        if (name === 'dark' || name === 'light' || name === 'blue') {
            return false; // Нельзя удалить предустановленные темы
        }

        const deleted = this.themes.delete(name);
        if (deleted) {
            this.saveThemesToStorage();
            if (this.currentTheme.name === name) {
                this.applyTheme('dark');
            }
        }
        return deleted;
    }

    /**
     * Загрузка тем из localStorage
     */
    private loadThemesFromStorage(): void {
        try {
            const saved = localStorage.getItem('ptx_custom_themes');
            if (saved) {
                const customThemes: UITheme[] = JSON.parse(saved);
                customThemes.forEach(theme => {
                    this.themes.set(theme.name.toLowerCase(), theme);
                });
            }

            // Применить сохранённую тему
            const savedTheme = localStorage.getItem('ptx_ui_theme');
            if (savedTheme && this.themes.has(savedTheme)) {
                this.applyTheme(savedTheme);
            }
        } catch (error) {
            logger.warn('[ThemeManager] Failed to load themes from storage:', error);
        }
    }

    /**
     * Сохранение кастомных тем в localStorage
     */
    private saveThemesToStorage(): void {
        try {
            const customThemes = Array.from(this.themes.values()).filter(
                theme => theme.name !== 'dark' && theme.name !== 'light' && theme.name !== 'blue'
            );
            localStorage.setItem('ptx_custom_themes', JSON.stringify(customThemes));
        } catch (error) {
            logger.warn('[ThemeManager] Failed to save themes to storage:', error);
        }
    }
}

// LAZY SINGLETON
let _themeManagerInstance: ThemeManager | null = null;

export function getThemeManager(): ThemeManager {
    if (!_themeManagerInstance) {
        _themeManagerInstance = new ThemeManager();
    }
    return _themeManagerInstance;
}

export const themeManager: ThemeManager = new Proxy({} as ThemeManager, {
    get(_target, prop) {
        const instance = getThemeManager();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getThemeManager();
        (instance as any)[prop] = value;
        return true;
    }
});

