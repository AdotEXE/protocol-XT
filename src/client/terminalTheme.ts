/**
 * Terminal Theme - Темы и подсветка синтаксиса для терминала
 */

import { logger } from "./utils/logger";

export interface TerminalTheme {
    name: string;
    background: string;
    foreground: string;
    accent: string;
    border: string;
    text: string;
    textSecondary: string;
    error: string;
    warning: string;
    success: string;
    info: string;
    syntax: {
        keyword: string;
        string: string;
        number: string;
        comment: string;
        function: string;
        variable: string;
    };
}

export class TerminalThemeManager {
    private themes: Map<string, TerminalTheme> = new Map();
    private currentTheme: TerminalTheme;
    
    constructor() {
        this.initializeThemes();
        this.currentTheme = this.loadTheme();
        this.applyTheme(this.currentTheme);
    }
    
    /**
     * Инициализация тем
     */
    private initializeThemes(): void {
        // Тема по умолчанию (зелёная)
        this.themes.set("default", {
            name: "По умолчанию",
            background: "rgba(0, 10, 0, 0.95)",
            foreground: "rgba(0, 5, 0, 0.8)",
            accent: "rgba(0, 255, 4, 0.6)",
            border: "rgba(0, 255, 4, 0.4)",
            text: "#0f0",
            textSecondary: "#0a0",
            error: "#f00",
            warning: "#ff0",
            success: "#0f0",
            info: "#0ff",
            syntax: {
                keyword: "#0ff",
                string: "#ff0",
                number: "#0f0",
                comment: "#666",
                function: "#0af",
                variable: "#f0f"
            }
        });
        
        // Тема "Matrix"
        this.themes.set("matrix", {
            name: "Matrix",
            background: "rgba(0, 0, 0, 0.98)",
            foreground: "rgba(0, 20, 0, 0.9)",
            accent: "rgba(0, 255, 0, 0.8)",
            border: "rgba(0, 255, 0, 0.5)",
            text: "#00ff00",
            textSecondary: "#00aa00",
            error: "#ff0000",
            warning: "#ffff00",
            success: "#00ff00",
            info: "#00ffff",
            syntax: {
                keyword: "#00ffff",
                string: "#ffff00",
                number: "#00ff00",
                comment: "#666666",
                function: "#00aaff",
                variable: "#ff00ff"
            }
        });
        
        // Тема "Cyberpunk"
        this.themes.set("cyberpunk", {
            name: "Cyberpunk",
            background: "rgba(10, 0, 20, 0.95)",
            foreground: "rgba(5, 0, 10, 0.8)",
            accent: "rgba(255, 0, 255, 0.6)",
            border: "rgba(255, 0, 255, 0.4)",
            text: "#ff00ff",
            textSecondary: "#aa00aa",
            error: "#ff0000",
            warning: "#ffaa00",
            success: "#00ff00",
            info: "#00ffff",
            syntax: {
                keyword: "#00ffff",
                string: "#ffff00",
                number: "#00ff00",
                comment: "#666666",
                function: "#00aaff",
                variable: "#ff00ff"
            }
        });
        
        // Тема "Monochrome"
        this.themes.set("monochrome", {
            name: "Монохром",
            background: "rgba(0, 0, 0, 0.95)",
            foreground: "rgba(10, 10, 10, 0.8)",
            accent: "rgba(255, 255, 255, 0.6)",
            border: "rgba(255, 255, 255, 0.4)",
            text: "#ffffff",
            textSecondary: "#aaaaaa",
            error: "#ffffff",
            warning: "#ffffff",
            success: "#ffffff",
            info: "#ffffff",
            syntax: {
                keyword: "#ffffff",
                string: "#cccccc",
                number: "#ffffff",
                comment: "#666666",
                function: "#ffffff",
                variable: "#ffffff"
            }
        });
    }
    
    /**
     * Применение темы
     */
    applyTheme(theme: TerminalTheme): void {
        this.currentTheme = theme;
        const root = document.documentElement;
        
        // Применяем CSS переменные
        root.style.setProperty('--terminal-bg', theme.background);
        root.style.setProperty('--terminal-fg', theme.foreground);
        root.style.setProperty('--terminal-accent', theme.accent);
        root.style.setProperty('--terminal-border', theme.border);
        root.style.setProperty('--terminal-text', theme.text);
        root.style.setProperty('--terminal-text-secondary', theme.textSecondary);
        root.style.setProperty('--terminal-error', theme.error);
        root.style.setProperty('--terminal-warning', theme.warning);
        root.style.setProperty('--terminal-success', theme.success);
        root.style.setProperty('--terminal-info', theme.info);
        
        // Применяем к терминалу
        const terminal = document.getElementById("system-terminal");
        if (terminal) {
            terminal.style.background = theme.background;
            terminal.style.borderColor = theme.border;
            terminal.style.color = theme.text;
        }
        
        // Применяем к сообщениям
        const messages = document.getElementById("terminal-messages");
        if (messages) {
            messages.style.background = theme.foreground;
            messages.style.color = theme.text;
        }
        
        // Применяем к полю ввода
        const input = document.getElementById("terminal-command-input");
        if (input) {
            input.style.background = theme.foreground;
            input.style.borderColor = theme.border;
            input.style.color = theme.text;
        }
        
        this.saveTheme(theme.name);
    }
    
    /**
     * Подсветка синтаксиса команды
     */
    highlightSyntax(text: string): string {
        if (!this.currentTheme) return text;
        
        const theme = this.currentTheme;
        
        // Ключевые слова команд
        const keywords = ['help', 'clear', 'spawn', 'teleport', 'set', 'get', 'fps', 'pos', 'health', 'echo', 'script', 'macro'];
        let highlighted = text;
        
        // Подсветка ключевых слов
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            highlighted = highlighted.replace(regex, `<span style="color: ${theme.syntax.keyword};">${keyword}</span>`);
        });
        
        // Подсветка строк (в кавычках)
        highlighted = highlighted.replace(/"([^"]*)"/g, `<span style="color: ${theme.syntax.string};">"$1"</span>`);
        highlighted = highlighted.replace(/'([^']*)'/g, `<span style="color: ${theme.syntax.string};">'$1'</span>`);
        
        // Подсветка чисел
        highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g, `<span style="color: ${theme.syntax.number};">$1</span>`);
        
        // Подсветка комментариев (после //)
        highlighted = highlighted.replace(/\/\/(.*)/g, `<span style="color: ${theme.syntax.comment};">//$1</span>`);
        
        // Подсветка функций (следующее слово после команды)
        highlighted = highlighted.replace(/\b(script|macro)\s+(\w+)/g, (match, cmd, func) => {
            void match; // помечаем как использованный для TS
            return `<span style="color: ${theme.syntax.keyword};">${cmd}</span> <span style="color: ${theme.syntax.function};">${func}</span>`;
        });
        
        return highlighted;
    }
    
    /**
     * Получить список тем
     */
    getThemes(): TerminalTheme[] {
        return Array.from(this.themes.values());
    }
    
    /**
     * Получить тему по имени
     */
    getTheme(name: string): TerminalTheme | undefined {
        return this.themes.get(name);
    }
    
    /**
     * Получить текущую тему
     */
    getCurrentTheme(): TerminalTheme {
        return this.currentTheme;
    }
    
    /**
     * Сохранение темы в localStorage
     */
    private saveTheme(themeName: string): void {
        try {
            localStorage.setItem('ptx_terminal_theme', themeName);
        } catch (error) {
            logger.warn("[TerminalThemeManager] Failed to save theme:", error);
        }
    }
    
    /**
     * Загрузка темы из localStorage
     */
    private loadTheme(): TerminalTheme {
        try {
            const saved = localStorage.getItem('ptx_terminal_theme');
            if (saved) {
                const theme = this.themes.get(saved);
                if (theme) {
                    return theme;
                }
            }
        } catch (error) {
            logger.warn("[TerminalThemeManager] Failed to load theme:", error);
        }
        return this.themes.get("default")!;
    }
}

