
import { Scene, Vector3, Mesh, StandardMaterial, Color3, TrailMesh, Ray } from "@babylonjs/core";
import { EffectsManager } from "../effects";

/**
 * NetworkProjectile
 * 
 * Handles client-side rendering and interpolation of network projectiles.
 * Ensures smooth 60 FPS movement even with low server tick rates.
 */
export class NetworkProjectile {
    public id: string;
    public mesh: Mesh;
    public velocity: Vector3;
    public isDisposed: boolean = false;
    private lastUpdateTime: number;
    private readonly maxLifetime: number = 5000; // 5 seconds max lifetime
    private scene: Scene;

    private effectsManager: EffectsManager | null = null;
    private cannonType: string | undefined;
    // Removed unused trail timer fields

    constructor(id: string, mesh: Mesh, velocity: Vector3, scene: Scene, effectsManager: EffectsManager | null, startDelay: number = 0, cannonType?: string) {
        this.id = id;
        this.mesh = mesh;
        this.velocity = velocity;
        this.scene = scene;
        this.effectsManager = effectsManager;
        this.cannonType = cannonType;
        this.lastUpdateTime = Date.now();

        // Apply latency compensation (fast-forward)
        if (startDelay > 0) {
            this.mesh.position.addInPlace(this.velocity.scale(startDelay));
        }

        // Initialize continuous trail matching local player visuals
        // Синхронизация цвета трейла с типом пушки
        if (this.effectsManager) {
            this.effectsManager.createBulletTrail(
                this.mesh,
                undefined, // Цвет будет определен по типу пушки
                this.cannonType
            );
        }
    }

    /**
     * Update projectile position based on velocity
     * @param deltaTime Time since last frame in seconds
     */
    update(deltaTime: number): void {
        if (this.isDisposed) return;

        // Verify max lifetime
        if (Date.now() - this.lastUpdateTime > this.maxLifetime) {
            this.dispose();
            return;
        }

        // Apply constant velocity movement
        this.mesh.position.addInPlace(this.velocity.scale(deltaTime));
    }

    /**
     * Update trajectory properties from server update
     * @param position New position
     * @param velocity New velocity
     */
    sync(position: Vector3, velocity: Vector3): void {
        const dist = Vector3.Distance(this.mesh.position, position);
        if (dist > 2.0) {
            this.mesh.position.copyFrom(position);
        } else if (dist > 0.1) {
            this.mesh.position = Vector3.Lerp(this.mesh.position, position, 0.5);
        }

        this.velocity.copyFrom(velocity);
        this.lastUpdateTime = Date.now();
    }

    dispose(): void {
        if (this.isDisposed) return;
        this.isDisposed = true;

        if (this.mesh) {
            this.mesh.dispose();
        }
    }
}
