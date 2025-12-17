// Модуль управления специальными способностями танка
import type { ITankController } from "./types";

export class TankAbilitiesModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
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
     * Активация модуля 9 (Дополнительный урон)
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
}











