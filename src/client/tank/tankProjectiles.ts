// Модуль управления снарядами и гильзами танка
import { Vector3, Mesh, PhysicsBody } from "@babylonjs/core";
import type { ITankController } from "./types";

export class TankProjectilesModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Создание гильзы после выстрела
     */
    createShellCasing(muzzlePos: Vector3, barrelDir: Vector3): void {
        (this.tank as any).createShellCasing?.(muzzlePos, barrelDir);
    }
    
    /**
     * Обновление гильз (вызывается каждый кадр)
     */
    updateShellCasings(): void {
        (this.tank as any).updateShellCasings?.();
    }
}

