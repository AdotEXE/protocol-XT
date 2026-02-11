/**
 * @module tank/tankAbilities
 * @description Система способностей танка - типы, конфигурация и вспомогательные функции
 * 
 * Этот модуль содержит:
 * - Типы и интерфейсы способностей
 * - Конфигурацию модулей и способностей корпусов
 * - Вспомогательные функции
 * - Класс управления способностями
 */

import type { ITankController } from "./types";

// ============================================
// ТИПЫ СПОСОБНОСТЕЙ
// ============================================

export type AbilityType = 
    | "active"       // Активная (нажатие)
    | "passive"      // Пассивная (всегда активна)
    | "toggle"       // Переключаемая
    | "charged";     // Заряжаемая

export type AbilityTarget = 
    | "self"
    | "enemy"
    | "ally"
    | "area"
    | "projectile";

/**
 * Базовое описание способности
 */
export interface AbilityData {
    id: string;
    name: string;
    description: string;
    icon: string;
    type: AbilityType;
    target: AbilityTarget;
    cooldown: number;          // Время восстановления (мс)
    duration: number;          // Длительность эффекта (мс), 0 для мгновенных
    energyCost: number;        // Стоимость энергии (0-100)
    charges?: number;          // Количество зарядов
    chargeTime?: number;       // Время перезарядки одного заряда
}

/**
 * Состояние способности
 */
export interface AbilityState {
    id: string;
    isActive: boolean;
    isOnCooldown: boolean;
    cooldownRemaining: number;
    cooldownTotal: number;
    currentCharges: number;
    maxCharges: number;
    isCharging: boolean;
    chargeProgress: number;    // 0-1
}

// ============================================
// СПОСОБНОСТИ КОРПУСОВ
// ============================================

export type ChassisAbilityId = 
    | "none"
    | "stealth"        // Невидимость
    | "shield"         // Энергетический щит
    | "drones"         // Боевые дроны
    | "command_aura"   // Аура командира
    | "racer_boost"    // Турбо-ускорение
    | "siege_regen"    // Режим осады
    | "ram"            // Таран
    | "jump"           // Прыжок
    | "emp"            // ЭМИ
    | "repair_aura";   // Аура ремонта

export const CHASSIS_ABILITIES: Record<ChassisAbilityId, AbilityData> = {
    none: {
        id: "none",
        name: "Нет способности",
        description: "Этот корпус не имеет специальной способности",
        icon: "❌",
        type: "passive",
        target: "self",
        cooldown: 0,
        duration: 0,
        energyCost: 0
    },
    stealth: {
        id: "stealth",
        name: "Невидимость",
        description: "Танк становится невидимым на 5 секунд",
        icon: "👁️",
        type: "active",
        target: "self",
        cooldown: 30000,
        duration: 5000,
        energyCost: 40
    },
    shield: {
        id: "shield",
        name: "Энергетический щит",
        description: "Создаёт щит, поглощающий 500 урона",
        icon: "🛡️",
        type: "active",
        target: "self",
        cooldown: 25000,
        duration: 8000,
        energyCost: 50
    },
    drones: {
        id: "drones",
        name: "Боевые дроны",
        description: "Выпускает 3 атакующих дрона",
        icon: "🤖",
        type: "active",
        target: "enemy",
        cooldown: 45000,
        duration: 20000,
        energyCost: 60
    },
    command_aura: {
        id: "command_aura",
        name: "Аура командира",
        description: "Усиливает союзников в радиусе 30м",
        icon: "⭐",
        type: "toggle",
        target: "ally",
        cooldown: 5000,
        duration: 0,
        energyCost: 10
    },
    racer_boost: {
        id: "racer_boost",
        name: "Турбо-ускорение",
        description: "Увеличивает скорость на 50% на 3 секунды",
        icon: "🚀",
        type: "active",
        target: "self",
        cooldown: 15000,
        duration: 3000,
        energyCost: 25
    },
    siege_regen: {
        id: "siege_regen",
        name: "Режим осады",
        description: "Неподвижность даёт +50% к урону и регенерацию",
        icon: "🏰",
        type: "toggle",
        target: "self",
        cooldown: 3000,
        duration: 0,
        energyCost: 5
    },
    ram: {
        id: "ram",
        name: "Таран",
        description: "Мощный рывок вперёд, наносящий урон",
        icon: "🐏",
        type: "active",
        target: "enemy",
        cooldown: 20000,
        duration: 500,
        energyCost: 35
    },
    jump: {
        id: "jump",
        name: "Прыжок",
        description: "Совершает высокий прыжок",
        icon: "⬆️",
        type: "active",
        target: "self",
        cooldown: 10000,
        duration: 1000,
        energyCost: 20
    },
    emp: {
        id: "emp",
        name: "ЭМИ",
        description: "Отключает электронику врагов в радиусе",
        icon: "⚡",
        type: "active",
        target: "area",
        cooldown: 40000,
        duration: 3000,
        energyCost: 70
    },
    repair_aura: {
        id: "repair_aura",
        name: "Аура ремонта",
        description: "Восстанавливает здоровье союзников поблизости",
        icon: "💚",
        type: "toggle",
        target: "ally",
        cooldown: 5000,
        duration: 0,
        energyCost: 15
    }
};

// ============================================
// МОДУЛИ
// ============================================

export type ModuleId = 
    | "module_jump"
    | "module_wall"
    | "module_rapid_fire"
    | "module_shield"
    | "module_damage_boost"
    | "module_speed_boost"
    | "module_repair"
    | "module_mines"
    | "module_smoke"
    | "module_platform";

export const MODULE_ABILITIES: Record<ModuleId, AbilityData> = {
    module_jump: {
        id: "module_jump",
        name: "Модуль прыжка",
        description: "Совершает прыжок вверх",
        icon: "⬆️",
        type: "active",
        target: "self",
        cooldown: 8000,
        duration: 1000,
        energyCost: 15,
        charges: 2,
        chargeTime: 8000
    },
    module_wall: {
        id: "module_wall",
        name: "Защитная стена",
        description: "Создаёт временную стену перед танком",
        icon: "🧱",
        type: "active",
        target: "area",
        cooldown: 20000,
        duration: 10000,
        energyCost: 30
    },
    module_rapid_fire: {
        id: "module_rapid_fire",
        name: "Ускоренная стрельба",
        description: "Увеличивает скорострельность на 50%",
        icon: "🔥",
        type: "active",
        target: "self",
        cooldown: 25000,
        duration: 5000,
        energyCost: 35
    },
    module_shield: {
        id: "module_shield",
        name: "Временный щит",
        description: "Создаёт защитный барьер",
        icon: "🛡️",
        type: "active",
        target: "self",
        cooldown: 30000,
        duration: 4000,
        energyCost: 40
    },
    module_damage_boost: {
        id: "module_damage_boost",
        name: "Усиление урона",
        description: "Увеличивает урон на 25%",
        icon: "💥",
        type: "active",
        target: "self",
        cooldown: 35000,
        duration: 8000,
        energyCost: 45
    },
    module_speed_boost: {
        id: "module_speed_boost",
        name: "Ускорение",
        description: "Увеличивает скорость на 30%",
        icon: "💨",
        type: "active",
        target: "self",
        cooldown: 15000,
        duration: 5000,
        energyCost: 20
    },
    module_repair: {
        id: "module_repair",
        name: "Ремонтный набор",
        description: "Восстанавливает 30% здоровья",
        icon: "🔧",
        type: "active",
        target: "self",
        cooldown: 45000,
        duration: 0,
        energyCost: 50
    },
    module_mines: {
        id: "module_mines",
        name: "Мины",
        description: "Сбрасывает 3 мины позади танка",
        icon: "💣",
        type: "active",
        target: "area",
        cooldown: 25000,
        duration: 60000,
        energyCost: 30,
        charges: 3,
        chargeTime: 25000
    },
    module_smoke: {
        id: "module_smoke",
        name: "Дымовая завеса",
        description: "Создаёт облако дыма для маскировки",
        icon: "💨",
        type: "active",
        target: "area",
        cooldown: 20000,
        duration: 15000,
        energyCost: 20
    },
    module_platform: {
        id: "module_platform",
        name: "Платформа",
        description: "Поднимает платформу под танком (удерживание)",
        icon: "⬆️",
        type: "charged",
        target: "self",
        cooldown: 15000,
        duration: 10000, // Максимум 10 секунд
        energyCost: 25
    }
};

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Создать начальное состояние способности
 */
export function createAbilityState(ability: AbilityData): AbilityState {
    return {
        id: ability.id,
        isActive: false,
        isOnCooldown: false,
        cooldownRemaining: 0,
        cooldownTotal: ability.cooldown,
        currentCharges: ability.charges || 1,
        maxCharges: ability.charges || 1,
        isCharging: false,
        chargeProgress: 0
    };
}

/**
 * Обновить кулдаун способности
 */
export function updateAbilityCooldown(state: AbilityState, deltaMs: number): AbilityState {
    if (!state.isOnCooldown) return state;
    
    const newCooldown = Math.max(0, state.cooldownRemaining - deltaMs);
    
    return {
        ...state,
        cooldownRemaining: newCooldown,
        isOnCooldown: newCooldown > 0
    };
}

/**
 * Проверить, можно ли использовать способность
 */
export function canUseAbility(
    state: AbilityState,
    ability: AbilityData,
    currentEnergy: number
): { canUse: boolean; reason?: string } {
    if (state.isOnCooldown) {
        return { canUse: false, reason: "На перезарядке" };
    }
    
    if (state.currentCharges <= 0) {
        return { canUse: false, reason: "Нет зарядов" };
    }
    
    if (currentEnergy < ability.energyCost) {
        return { canUse: false, reason: "Недостаточно энергии" };
    }
    
    return { canUse: true };
}

/**
 * Активировать способность
 */
export function activateAbility(state: AbilityState, ability: AbilityData): AbilityState {
    return {
        ...state,
        isActive: ability.duration > 0,
        isOnCooldown: true,
        cooldownRemaining: ability.cooldown,
        currentCharges: Math.max(0, state.currentCharges - 1)
    };
}

/**
 * Деактивировать способность
 */
export function deactivateAbility(state: AbilityState): AbilityState {
    return {
        ...state,
        isActive: false
    };
}

/**
 * Форматировать кулдаун
 */
export function formatCooldown(ms: number): string {
    if (ms < 1000) return `${Math.ceil(ms / 100) / 10}s`;
    return `${Math.ceil(ms / 1000)}s`;
}

/**
 * Получить процент кулдауна
 */
export function getCooldownProgress(state: AbilityState): number {
    if (!state.isOnCooldown) return 1;
    return 1 - (state.cooldownRemaining / state.cooldownTotal);
}

/**
 * Получить данные способности корпуса
 */
export function getChassisAbility(id: ChassisAbilityId): AbilityData {
    return CHASSIS_ABILITIES[id] || CHASSIS_ABILITIES.none;
}

/**
 * Получить данные модуля
 */
export function getModuleAbility(id: ModuleId): AbilityData | undefined {
    return MODULE_ABILITIES[id];
}

// ============================================
// КЛАСС УПРАВЛЕНИЯ СПОСОБНОСТЯМИ
// ============================================

export class TankAbilitiesModule {
    private tank: ITankController;
    private abilityStates: Map<string, AbilityState> = new Map();
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Инициализировать способности
     */
    initializeAbilities(chassisAbilityId: ChassisAbilityId, moduleIds: ModuleId[]): void {
        // Способность корпуса
        const chassisAbility = getChassisAbility(chassisAbilityId);
        if (chassisAbility.id !== "none") {
            this.abilityStates.set(chassisAbility.id, createAbilityState(chassisAbility));
        }
        
        // Модули
        for (const moduleId of moduleIds) {
            const moduleAbility = getModuleAbility(moduleId);
            if (moduleAbility) {
                this.abilityStates.set(moduleAbility.id, createAbilityState(moduleAbility));
            }
        }
    }
    
    /**
     * Обновление модулей (вызывается каждый кадр)
     */
    updateModules(): void {
        (this.tank as any).updateModules?.();
    }
    
    /**
     * Активация способности корпуса (V)
     */
    activateChassisAbility(): void {
        (this.tank as any).activateChassisAbility?.();
    }
    
    /**
     * Активация модуля 0 (Прыжок)
     */
    activateModule0(): void {
        (this.tank as any).executeModule0Jump?.();
    }
    
    /**
     * Активация модуля 6 (Стена)
     */
    activateModule6(): void {
        (this.tank as any).activateModule6?.();
    }
    
    /**
     * Активация модуля 7 (Ускоренная стрельба)
     */
    activateModule7(): void {
        (this.tank as any).activateModule7?.();
    }
    
    /**
     * Активация модуля 8 (Временная защита)
     */
    activateModule8(): void {
        (this.tank as any).activateModule8?.();
    }
    
    /**
     * Активация модуля 9 (Платформа)
     */
    activateModule9(): void {
        (this.tank as any).activateModule9?.();
    }
    
    /**
     * Активация стелса (способность корпуса)
     */
    activateStealth(): void {
        (this.tank as any).activateStealth?.();
    }
    
    /**
     * Активация щита (способность корпуса)
     */
    activateShield(): void {
        (this.tank as any).activateShield?.();
    }
    
    /**
     * Активация дронов (способность корпуса)
     */
    activateDrones(): void {
        (this.tank as any).activateDrones?.();
    }
    
    /**
     * Активация ауры командира (способность корпуса)
     */
    activateCommandAura(): void {
        (this.tank as any).activateCommandAura?.();
    }
    
    /**
     * Активация ускорения гонщика (способность корпуса)
     */
    activateRacerBoost(): void {
        (this.tank as any).activateRacerBoost?.();
    }
    
    /**
     * Активация регенерации осады (способность корпуса)
     */
    activateSiegeRegen(): void {
        (this.tank as any).activateSiegeRegen?.();
    }
    
    /**
     * Получить состояние способности
     */
    getAbilityState(id: string): AbilityState | undefined {
        return this.abilityStates.get(id);
    }
    
    /**
     * Получить все состояния способностей
     */
    getAllAbilityStates(): Map<string, AbilityState> {
        return new Map(this.abilityStates);
    }
}

export default {
    CHASSIS_ABILITIES,
    MODULE_ABILITIES
};





















