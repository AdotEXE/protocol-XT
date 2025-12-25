/**
 * Типы и интерфейсы для системы гаража
 */

export type CategoryType = "chassis" | "cannons" | "tracks" | "modules" | "supplies" | "shop" | "skins" | "presets";

/**
 * Интерфейс апгрейда танка
 */
export interface TankUpgrade {
    id: string;
    name: string;
    description: string;
    cost: number;
    level: number;
    maxLevel: number;
    stat: "health" | "speed" | "armor" | "firepower" | "reload" | "damage";
    value: number;
}

/**
 * Интерфейс части танка
 */
export interface TankPart {
    id: string;
    name: string;
    description: string;
    cost: number;
    unlocked: boolean;
    type: "chassis" | "turret" | "barrel" | "engine" | "module" | "supply" | "preset";
    stats: {
        health?: number;
        speed?: number;
        armor?: number;
        firepower?: number;
        reload?: number;
        damage?: number;
    };
}

/**
 * Состояние UI гаража
 */
export interface GarageUIState {
    currentCategory: CategoryType;
    selectedItemIndex: number;
    searchText: string;
    sortBy: "name" | "stats" | "custom" | "unique";
    filterMode: "all" | "owned" | "locked";
    currentChassisId: string;
    currentCannonId: string;
    currentTrackId: string;
}

/**
 * Конфигурация внешних систем для гаража
 */
export interface GarageExternalSystems {
    chatSystem: { success: (message: string, duration?: number) => void } | null;
    tankController: { 
        chassis: any; 
        turret: any; 
        barrel: any; 
        respawn: () => void; 
        setChassisType?: (id: string) => void; 
        setCannonType?: (id: string) => void; 
        setTrackType?: (id: string) => void 
    } | null;
    experienceSystem: { addExperience: (partId: string, type: "chassis" | "cannon", amount: number) => void } | null;
    playerProgression: { addExperience: (amount: number) => void } | null;
    soundManager: { play: (sound: string, volume?: number) => void; playGarageOpen?: () => void } | null;
}

