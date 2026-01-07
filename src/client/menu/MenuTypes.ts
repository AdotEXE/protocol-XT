/**
 * Типы и интерфейсы для системы меню
 */

/**
 * Тип карты
 */
export type MapType = 
    | "normal" 
    | "sandbox" 
    | "sand"
    | "polygon" 
    | "frontline" 
    | "ruins" 
    | "canyon" 
    | "industrial" 
    | "urban_warfare" 
    | "underground" 
    | "coastal" 
    | "tartaria";

/**
 * Конфигурация танка
 */
export interface TankConfig {
    chassisId: string;
    cannonId: string;
    trackId?: string;
    skinId?: string;
}

/**
 * Конфигурация карты
 */
export interface MapConfig {
    type: MapType;
    seed?: number;
    options?: {
        weather?: string;
        timeOfDay?: string;
        difficulty?: string;
    };
}

/**
 * Информация о карте для отображения в меню
 */
export interface MapInfo {
    id: MapType;
    nameKey: string;
    descKey: string;
    icon?: string;
    preview?: string;
    isNew?: boolean;
    isLocked?: boolean;
    unlockCondition?: string;
}

/**
 * Состояние меню
 */
export interface MenuState {
    isOpen: boolean;
    currentPanel: MenuPanel;
    selectedMapType: MapType;
    selectedTankConfig: TankConfig;
    language: "ru" | "en";
}

/**
 * Панели меню
 */
export type MenuPanel = 
    | "main" 
    | "mapSelection" 
    | "tankSelection" 
    | "garage"
    | "stats" 
    | "skills" 
    | "settings" 
    | "controls" 
    | "profile";

/**
 * Callback для событий меню
 */
export interface MenuCallbacks {
    onPlay: (mapType: MapType, tankConfig: TankConfig) => void;
    onOpenGarage: () => void;
    onOpenStats: () => void;
    onOpenSettings: () => void;
    onClose: () => void;
}

/**
 * Статистика игрока
 */
export interface PlayerStats {
    totalKills: number;
    totalDeaths: number;
    totalDamage: number;
    totalGamesPlayed: number;
    totalPlayTime: number; // в секундах
    bestKillStreak: number;
    favoriteChassisId: string;
    favoriteCannonId: string;
}

