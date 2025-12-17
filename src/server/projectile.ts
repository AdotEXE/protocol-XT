import { Vector3 } from "@babylonjs/core";
import type { ProjectileData } from "../shared/types";

export class ServerProjectile {
    id: string;
    ownerId: string;
    position: Vector3;
    velocity: Vector3;
    damage: number;
    cannonType: string;
    spawnTime: number;
    lifetime: number = 6000; // 6 seconds
    shooterRTT: number = 100; // RTT of shooter for lag compensation
    
    constructor(data: {
        id: string;
        ownerId: string;
        position: Vector3;
        velocity: Vector3;
        damage: number;
        cannonType: string;
        spawnTime: number;
        shooterRTT?: number;
    }) {
        this.id = data.id;
        this.ownerId = data.ownerId;
        this.position = data.position;
        this.velocity = data.velocity;
        this.damage = data.damage;
        this.cannonType = data.cannonType;
        this.spawnTime = data.spawnTime;
        this.shooterRTT = data.shooterRTT || 100;
    }
    
    update(deltaTime: number): void {
        // Simple physics: apply gravity and move
        const gravity = -9.81;
        this.velocity.y += gravity * deltaTime;
        
        const moveDelta = this.velocity.scale(deltaTime);
        this.position = this.position.add(moveDelta);
        
        // Ground collision
        if (this.position.y < 0.5) {
            this.position.y = 0.5;
            // Mark for removal
            this.lifetime = 0;
        }
    }
    
    checkHit(targetPos: Vector3, hitRadius: number = 3.0): boolean {
        const dist = Vector3.Distance(this.position, targetPos);
        return dist < hitRadius;
    }
    
    /**
     * Get shooter RTT for lag compensation
     */
    getShooterRTT(): number {
        return this.shooterRTT;
    }
    
    isExpired(currentTime: number): boolean {
        return (currentTime - this.spawnTime) > this.lifetime;
    }
    
    toProjectileData(): ProjectileData {
        return {
            id: this.id,
            ownerId: this.ownerId,
            position: this.position,
            velocity: this.velocity,
            damage: this.damage,
            cannonType: this.cannonType,
            spawnTime: this.spawnTime
        };
    }
}

