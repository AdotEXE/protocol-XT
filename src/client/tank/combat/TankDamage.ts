/**
 * @module tank/combat/TankDamage
 * @description Система урона танка
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Типы урона
 */
export const DAMAGE_TYPES = {
    KINETIC: "kinetic",       // Кинетический (AP, APCR, APDS)
    EXPLOSIVE: "explosive",    // Осколочно-фугасный (HE)
    FIRE: "fire",              // Огненный
    COLLISION: "collision"     // От столкновения
} as const;

export type DamageType = typeof DAMAGE_TYPES[keyof typeof DAMAGE_TYPES];

/**
 * Данные урона
 */
export interface DamageData {
    /** Базовый урон */
    amount: number;
    /** Тип урона */
    type: DamageType;
    /** Позиция попадания */
    hitPosition: Vector3;
    /** Угол попадания (относительно нормали) */
    impactAngle: number;
    /** Бронепробиваемость */
    penetration: number;
    /** ID атакующего */
    attackerId?: string;
    /** Критическое попадание */
    isCritical?: boolean;
}

/**
 * Результат расчёта урона
 */
export interface DamageResult {
    /** Итоговый урон */
    finalDamage: number;
    /** Пробита ли броня */
    isPenetrated: boolean;
    /** Рикошет */
    isRicochet: boolean;
    /** Критическое попадание */
    isCritical: boolean;
    /** Повреждённый модуль */
    damagedModule?: string;
    /** Множитель урона */
    damageMultiplier: number;
}

/**
 * Конфигурация брони
 */
export interface ArmorConfig {
    /** Лобовая броня */
    front: number;
    /** Боковая броня */
    side: number;
    /** Кормовая броня */
    rear: number;
    /** Крыша */
    top: number;
    /** Днище */
    bottom: number;
}

/**
 * Конфигурация брони по умолчанию
 */
export const DEFAULT_ARMOR_CONFIG: ArmorConfig = {
    front: 100,
    side: 50,
    rear: 30,
    top: 20,
    bottom: 20
};

/**
 * Уязвимые модули
 */
export const VULNERABLE_MODULES = [
    { id: "ammo_rack", name: "Боеукладка", critMultiplier: 3.0, chance: 0.1 },
    { id: "engine", name: "Двигатель", critMultiplier: 1.5, chance: 0.15 },
    { id: "fuel_tank", name: "Топливный бак", critMultiplier: 2.0, chance: 0.1 },
    { id: "commander", name: "Командир", critMultiplier: 1.3, chance: 0.08 },
    { id: "driver", name: "Мехвод", critMultiplier: 1.3, chance: 0.08 },
    { id: "gunner", name: "Наводчик", critMultiplier: 1.2, chance: 0.08 }
] as const;

/**
 * Система расчёта урона
 */
export class TankDamage {
    private armor: ArmorConfig;
    
    constructor(armor: Partial<ArmorConfig> = {}) {
        this.armor = { ...DEFAULT_ARMOR_CONFIG, ...armor };
    }
    
    /**
     * Рассчитать урон
     */
    calculateDamage(data: DamageData, tankRotation: number): DamageResult {
        const result: DamageResult = {
            finalDamage: 0,
            isPenetrated: false,
            isRicochet: false,
            isCritical: false,
            damageMultiplier: 1.0
        };
        
        // Определить зону попадания
        const hitZone = this.getHitZone(data.hitPosition, tankRotation);
        const effectiveArmor = this.getEffectiveArmor(hitZone, data.impactAngle);
        
        // Проверка рикошета (угол > 70 градусов)
        if (data.impactAngle > 70 && data.type === DAMAGE_TYPES.KINETIC) {
            result.isRicochet = true;
            result.finalDamage = 0;
            return result;
        }
        
        // Проверка пробития
        if (data.type === DAMAGE_TYPES.KINETIC) {
            result.isPenetrated = data.penetration > effectiveArmor;
            
            if (!result.isPenetrated) {
                // Непробитие - минимальный урон
                result.finalDamage = data.amount * 0.1;
                return result;
            }
        } else if (data.type === DAMAGE_TYPES.EXPLOSIVE) {
            // ОФ снаряды всегда наносят урон, но меньше по броне
            result.isPenetrated = data.penetration > effectiveArmor * 0.5;
            result.damageMultiplier = result.isPenetrated ? 1.0 : 0.5;
        }
        
        // Базовый урон
        let damage = data.amount * result.damageMultiplier;
        
        // Проверка критического попадания
        if (result.isPenetrated) {
            const critResult = this.checkCriticalHit(data.isCritical);
            if (critResult.isCritical) {
                result.isCritical = true;
                result.damagedModule = critResult.module;
                damage *= critResult.multiplier;
            }
        }
        
        // Зональный множитель
        const zoneMultiplier = this.getZoneMultiplier(hitZone);
        damage *= zoneMultiplier;
        
        result.finalDamage = Math.round(damage);
        return result;
    }
    
    /**
     * Определить зону попадания
     */
    private getHitZone(
        hitPosition: Vector3, 
        tankRotation: number
    ): "front" | "side" | "rear" | "top" | "bottom" {
        // Упрощённая логика - по Y координате
        if (hitPosition.y > 1.5) return "top";
        if (hitPosition.y < 0.3) return "bottom";
        
        // По углу относительно танка
        const hitAngle = Math.atan2(hitPosition.x, hitPosition.z);
        const relativeAngle = ((hitAngle - tankRotation) + Math.PI * 4) % (Math.PI * 2);
        
        if (relativeAngle < Math.PI * 0.25 || relativeAngle > Math.PI * 1.75) {
            return "front";
        } else if (relativeAngle > Math.PI * 0.75 && relativeAngle < Math.PI * 1.25) {
            return "rear";
        } else {
            return "side";
        }
    }
    
    /**
     * Получить эффективную броню с учётом угла
     */
    private getEffectiveArmor(zone: keyof ArmorConfig, impactAngle: number): number {
        const baseArmor = this.armor[zone];
        
        // Эффект наклона брони
        const angleRad = impactAngle * (Math.PI / 180);
        const angleMultiplier = 1 / Math.cos(Math.min(angleRad, Math.PI * 0.45));
        
        return baseArmor * angleMultiplier;
    }
    
    /**
     * Множитель урона по зонам
     */
    private getZoneMultiplier(zone: string): number {
        switch (zone) {
            case "rear": return 1.5;
            case "top": return 2.0;
            case "bottom": return 1.3;
            case "side": return 1.2;
            default: return 1.0;
        }
    }
    
    /**
     * Проверка критического попадания
     */
    private checkCriticalHit(forceCrit?: boolean): { 
        isCritical: boolean; 
        module?: string; 
        multiplier: number 
    } {
        if (!forceCrit && Math.random() > 0.25) {
            return { isCritical: false, multiplier: 1.0 };
        }
        
        // Выбрать случайный модуль
        const roll = Math.random();
        let cumChance = 0;
        
        for (const mod of VULNERABLE_MODULES) {
            cumChance += mod.chance;
            if (roll < cumChance) {
                return {
                    isCritical: true,
                    module: mod.id,
                    multiplier: mod.critMultiplier
                };
            }
        }
        
        // Обычный крит без модуля
        return { isCritical: true, multiplier: 1.5 };
    }
    
    /**
     * Получить конфигурацию брони
     */
    getArmor(): ArmorConfig {
        return { ...this.armor };
    }
    
    /**
     * Установить броню
     */
    setArmor(armor: Partial<ArmorConfig>): void {
        this.armor = { ...this.armor, ...armor };
    }
}

export default TankDamage;

