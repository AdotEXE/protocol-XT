// Модуль управления визуальными эффектами и анимациями танка
import { Scene, Vector3, Mesh } from "@babylonjs/core";
import type { ITankController } from "./types";
import { createUniqueCannon } from "./tankCannon";

export class TankVisualsModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Создание уникального корпуса танка
     */
    createUniqueChassis(scene: Scene, position: Vector3): Mesh {
        return (this.tank as any).createUniqueChassis?.(scene, position);
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




