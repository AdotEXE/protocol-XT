/**
 * @module menu
 * @description Menu Module - централизованный экспорт меню и настроек
 */

// Типы
export type {
    MapType,
    TankConfig,
    MapConfig,
    MapInfo,
    MenuState,
    MenuPanel,
    MenuCallbacks,
    PlayerStats
} from './MenuTypes';

// Константы
export {
    MENU_LANG,
    MAP_LIST,
    MENU_COLORS,
    MENU_SIZES
} from './MenuConstants';

// Настройки
export { 
    loadSettings, 
    saveSettingsFromUI, 
    DEFAULT_SETTINGS
} from './settings';

export type { GameSettings } from './settings';

// Авторизация
export { authUI } from './authUI';

// Скилл-дерево
export { 
    createSkillsPanelHTML, 
    updateSkillTreeDisplay,
    saveSkillTreeCameraPosition
} from './skillTreeUI';

export type { SkillTreeCallbacks } from './skillTreeUI';

// Экраны меню
export { MAIN_MENU_ITEMS, DEFAULT_MAIN_MENU_CONFIG, SETTINGS_CATEGORIES } from './screens';
export type { 
    MainMenuConfig, 
    MainMenuItemId, 
    MainMenuEventHandler,
    SettingsCategoryId,
    GraphicsSettings,
    AudioSettings,
    ControlSettings,
    CameraSettings
} from './screens';
