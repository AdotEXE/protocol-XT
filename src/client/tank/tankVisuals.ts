// Модуль управления визуальными эффектами и анимациями танка
import { Scene, Vector3, Mesh } from "@babylonjs/core";
import type { ITankController } from "./types";
import { createUniqueCannon } from "./tankCannon";
import { createUniqueChassis, type ChassisAnimationElements } from "./tankChassis";
import type { ChassisType } from "../tankTypes";

export class TankVisualsModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Создание уникального корпуса танка
     */
    createUniqueChassis(scene: Scene, position: Vector3): Mesh {
        const tankAny = this.tank as any;
        const chassisType = tankAny.chassisType as ChassisType;
        const animationElements = (tankAny.chassisAnimationElements || {}) as ChassisAnimationElements;
        return createUniqueChassis(chassisType, scene, position, animationElements);
    }
    
    /**
     * Создание уникальной пушки
     */
    createUniqueCannon(scene: Scene, barrelWidth: number, barrelLength: number): Mesh {
        const cannonType = (this.tank as any).cannonType;
        const animationElements = (this.tank as any).cannonAnimationElements || {};
        return createUniqueCannon(cannonType, scene, barrelWidth, barrelLength, animationElements);
    }
    
    /**
     * Создание визуальных колес
     */
    createVisualWheels(): void {
        (this.tank as any).createVisualWheels?.();
    }
    
    /**
     * Обновление анимаций пушки
     */
    updateCannonAnimations(): void {
        (this.tank as any).updateCannonAnimations?.();
    }
    
    /**
     * Обновление анимаций корпуса
     */
    updateChassisAnimations(): void {
        (this.tank as any).updateChassisAnimations?.();
    }
    
    /**
     * Обновление видимости пушки
     */
    updateBarrelVisibility(baseZ: number): void {
        (this.tank as any).updateBarrelVisibility?.(baseZ);
    }
}




