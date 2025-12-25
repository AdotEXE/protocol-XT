/**
 * @module menu/screens/MainMenuScreen
 * @description Главное меню игры
 */

/**
 * Конфигурация главного меню
 */
export interface MainMenuConfig {
    showVersion: boolean;
    showSocialLinks: boolean;
    animateBackground: boolean;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_MAIN_MENU_CONFIG: MainMenuConfig = {
    showVersion: true,
    showSocialLinks: true,
    animateBackground: true
};

/**
 * Пункты главного меню
 */
export const MAIN_MENU_ITEMS = [
    { id: "play", label: "Играть", icon: "🎮" },
    { id: "garage", label: "Гараж", icon: "🔧" },
    { id: "multiplayer", label: "Мультиплеер", icon: "🌐" },
    { id: "settings", label: "Настройки", icon: "⚙️" },
    { id: "help", label: "Помощь", icon: "❓" }
] as const;

/**
 * Типы пунктов меню
 */
export type MainMenuItemId = typeof MAIN_MENU_ITEMS[number]["id"];

/**
 * Интерфейс обработчика событий меню
 */
export interface MainMenuEventHandler {
    onPlay?: () => void;
    onGarage?: () => void;
    onMultiplayer?: () => void;
    onSettings?: () => void;
    onHelp?: () => void;
}

export default { MAIN_MENU_ITEMS, DEFAULT_MAIN_MENU_CONFIG };

