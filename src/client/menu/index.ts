/**
 * Menu Module - централизованный экспорт
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
    updateSkillTreeDisplay
} from './skillTreeUI';

export type { SkillTreeCallbacks } from './skillTreeUI';
