
import { Scene, Vector3, Mesh, StandardMaterial, Color3, TrailMesh, Ray } from "@babylonjs/core";
import { EffectsManager } from "../effects";

/**
 * NetworkProjectile
 * 
 * Handles client-side rendering and interpolation of network projectiles.
 * Ensures smooth 60 FPS movement even with low server tick rates.
 * Improved with better interpolation and client-side prediction.
 */
interface PositionSnapshot {
    position: Vector3;
    velocity: Vector3;
    timestamp: number;
}

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

    // Improved interpolation: position history for smooth movement
    private positionHistory: PositionSnapshot[] = [];
    private readonly maxHistorySize: number = 3; // Keep last 3 snapshots
    private serverPosition: Vector3;
    private serverVelocity: Vector3;
    private lastSyncTime: number = 0;
    private readonly interpolationDelay: number = 0.05; // 50ms delay for interpolation

    constructor(id: string, mesh: Mesh, velocity: Vector3, scene: Scene, effectsManager: EffectsManager | null, startDelay: number = 0, cannonType?: string) {
        this.id = id;
        this.mesh = mesh;
        this.velocity = velocity;
        this.scene = scene;
        this.effectsManager = effectsManager;
        this.cannonType = cannonType;
        this.lastUpdateTime = Date.now();
        this.serverPosition = mesh.position.clone();
        this.serverVelocity = velocity.clone();
        this.lastSyncTime = Date.now();

        // Apply latency compensation (fast-forward)
        if (startDelay > 0) {
            this.mesh.position.addInPlace(this.velocity.scale(startDelay));
            this.serverPosition.copyFrom(this.mesh.position);
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
     * Update projectile position based on velocity with improved interpolation
     * @param deltaTime Time since last frame in seconds
     */
    update(deltaTime: number): void {
        if (this.isDisposed) return;

        // Verify max lifetime
        if (Date.now() - this.lastUpdateTime > this.maxLifetime) {
            this.dispose();
            return;
        }

        const currentTime = Date.now();
        const timeSinceSync = (currentTime - this.lastSyncTime) / 1000; // Convert to seconds

        // If we have recent server data, use interpolation
        if (timeSinceSync < 0.2 && this.positionHistory.length > 0) {
            // Interpolate between snapshots for smooth movement
            const renderTime = currentTime - (this.interpolationDelay * 1000);

            // Find two snapshots to interpolate between
            let prevSnapshot: PositionSnapshot | undefined = undefined;
            let nextSnapshot: PositionSnapshot | undefined = undefined;

            for (let i = 0; i < this.positionHistory.length - 1; i++) {
                const curr = this.positionHistory[i];
                const next = this.positionHistory[i + 1];
                if (curr && next && curr.timestamp <= renderTime && next.timestamp >= renderTime) {
                    prevSnapshot = curr;
                    nextSnapshot = next;
                    break;
                }
            }

            if (prevSnapshot && nextSnapshot) {
                // Interpolate position
                const t = (renderTime - prevSnapshot.timestamp) /
                    (nextSnapshot.timestamp - prevSnapshot.timestamp);
                const interpolatedPos = Vector3.Lerp(prevSnapshot.position, nextSnapshot.position, t);
                this.mesh.position.copyFrom(interpolatedPos);
            } else {
                // Fallback: extrapolate from latest snapshot
                const latest = this.positionHistory[this.positionHistory.length - 1];
                if (latest) {
                    const extrapolationTime = (renderTime - latest.timestamp) / 1000;
                    this.mesh.position.copyFrom(latest.position);
                    this.mesh.position.addInPlace(latest.velocity.scale(extrapolationTime));
                }
            }
        } else {
            // No recent server data: use client-side prediction (extrapolation)
            this.mesh.position.addInPlace(this.velocity.scale(deltaTime));
        }
    }

    /**
     * Update trajectory properties from server update with improved interpolation
     * @param position New position from server
     * @param velocity New velocity from server
     */
    sync(position: Vector3, velocity: Vector3): void {
        const currentTime = Date.now();

        // Add snapshot to history
        this.positionHistory.push({
            position: position.clone(),
            velocity: velocity.clone(),
            timestamp: currentTime
        });

        // Keep only recent snapshots
        if (this.positionHistory.length > this.maxHistorySize) {
            this.positionHistory.shift();
        }

        // Remove old snapshots (older than 200ms)
        const cutoffTime = currentTime - 200;
        this.positionHistory = this.positionHistory.filter(s => s.timestamp > cutoffTime);

        // Update server state
        this.serverPosition.copyFrom(position);
        this.serverVelocity.copyFrom(velocity);
        this.lastSyncTime = currentTime;

        // Smooth velocity update (avoid sudden changes)
        const velocityDiff = Vector3.Distance(this.velocity, velocity);
        if (velocityDiff > 5.0) {
            // Large difference: snap immediately
            this.velocity.copyFrom(velocity);
        } else if (velocityDiff > 0.1) {
            // Small difference: smooth transition
            this.velocity = Vector3.Lerp(this.velocity, velocity, 0.3);
        }

        // If position is very far off, snap immediately (likely due to lag spike)
        const positionDiff = Vector3.Distance(this.mesh.position, position);
        if (positionDiff > 3.0) {
            this.mesh.position.copyFrom(position);
        }
    }

    dispose(): void {
        if (this.isDisposed) return;
        this.isDisposed = true;

        if (this.mesh) {
            this.mesh.dispose();
        }
    }
}
