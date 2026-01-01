import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import type { NetworkPlayer } from "./multiplayer";
import { getChassisById } from "./tankTypes";

export class NetworkPlayerTank {
    scene: Scene;
    playerId: string;
    
    // Visuals
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    
    // Network player reference
    networkPlayer: NetworkPlayer;
    
    // Interpolation
    private interpolationAlpha: number = 0;
    private readonly INTERPOLATION_SPEED = 0.2; // How fast to interpolate (adaptive based on RTT)
    private estimatedVelocity: Vector3 = new Vector3(0, 0, 0);
    private lastNetworkUpdateTime: number = 0;
    
    // Lag compensation - store history for rewind
    private positionHistory: Array<{ time: number; position: Vector3; rotation: number }> = [];
    private readonly MAX_HISTORY_TIME = 1000; // 1 second of history
    
    constructor(scene: Scene, networkPlayer: NetworkPlayer) {
        this.scene = scene;
        this.playerId = networkPlayer.id;
        this.networkPlayer = networkPlayer;
        
        // Create visuals (similar to TankController)
        this.chassis = this.createChassis();
        this.turret = this.createTurret();
        this.barrel = this.createBarrel();
        
        // Set initial position
        this.updateVisuals();
    }
    
    private createChassis(): Mesh {
        // Use player's chassis type or default
        const chassisId = this.networkPlayer.chassisType || "medium";
        const chassisData = getChassisById(chassisId) || getChassisById("medium");
        
        const chassis = MeshBuilder.CreateBox(
            `networkPlayer_chassis_${this.playerId}`,
            {
                width: chassisData.width,
                height: chassisData.height,
                depth: chassisData.depth
            },
            this.scene
        );
        
        const mat = new StandardMaterial(`networkPlayer_mat_${this.playerId}`, this.scene);
        // Use player's custom color or default
        const tankColor = this.networkPlayer.tankColor || chassisData.color;
        const color = Color3.FromHexString(tankColor);
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.3);
        mat.specularColor = Color3.Black();
        chassis.material = mat;
        
        // КРИТИЧНО: Убеждаемся, что меш видим и добавлен в сцену
        chassis.isVisible = true;
        chassis.setEnabled(true);
        if (!this.scene.meshes.includes(chassis)) {
            this.scene.addMesh(chassis);
        }
        
        return chassis;
    }
    
    private createTurret(): Mesh {
        // ИСПРАВЛЕНИЕ: Используем Box вместо Cylinder (НИКОГДА НЕ ИСПОЛЬЗОВАТЬ КРУГЛЫЕ ФОРМЫ)
        const turret = MeshBuilder.CreateBox(
            `networkPlayer_turret_${this.playerId}`,
            {
                width: 1.2,
                height: 0.8,
                depth: 1.2
            },
            this.scene
        );
        
        turret.position.y = 0.6;
        turret.parent = this.chassis;
        
        const mat = new StandardMaterial(`networkPlayer_turret_mat_${this.playerId}`, this.scene);
        // Use player's custom turret color or default
        const turretColor = this.networkPlayer.turretColor || this.networkPlayer.tankColor || "#888888";
        const color = Color3.FromHexString(turretColor);
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.3);
        turret.material = mat;
        
        // КРИТИЧНО: Убеждаемся, что меш видим
        turret.isVisible = true;
        turret.setEnabled(true);
        
        return turret;
    }
    
    private createBarrel(): Mesh {
        // ИСПРАВЛЕНИЕ: Используем Box вместо Cylinder (НИКОГДА НЕ ИСПОЛЬЗОВАТЬ КРУГЛЫЕ ФОРМЫ)
        const barrel = MeshBuilder.CreateBox(
            `networkPlayer_barrel_${this.playerId}`,
            {
                width: 0.3,
                height: 0.3,
                depth: 2.5
            },
            this.scene
        );
        
        barrel.position.set(0, 0.4, 1.25);
        // Для Box не нужно поворачивать по X, так как он уже ориентирован правильно
        barrel.parent = this.turret;
        
        const mat = new StandardMaterial(`networkPlayer_barrel_mat_${this.playerId}`, this.scene);
        mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        barrel.material = mat;
        
        // КРИТИЧНО: Убеждаемся, что меш видим
        barrel.isVisible = true;
        barrel.setEnabled(true);
        
        return barrel;
    }
    
    update(deltaTime: number): void {
        const currentTime = Date.now();
        
        // Calculate time since last network update
        const timeSinceUpdate = currentTime - this.lastNetworkUpdateTime;
        const needsExtrapolation = timeSinceUpdate > 50; // More than 50ms since last update
        
        // Store position history for lag compensation
        if (this.lastNetworkUpdateTime > 0) {
            this.positionHistory.push({
                time: currentTime,
                position: this.networkPlayer.position.clone(),
                rotation: this.networkPlayer.rotation
            });
        }
        
        // Remove old history
        this.positionHistory = this.positionHistory.filter(
            entry => currentTime - entry.time < this.MAX_HISTORY_TIME
        );
        
        // Calculate estimated velocity for dead reckoning
        if (this.positionHistory.length >= 2) {
            const last = this.positionHistory[this.positionHistory.length - 1]!;
            const prev = this.positionHistory[this.positionHistory.length - 2]!;
            const timeDelta = (last.time - prev.time) / 1000; // Convert to seconds
            if (timeDelta > 0) {
                // Clone before scaling to avoid mutating
                this.estimatedVelocity = last.position.subtract(prev.position).clone().scaleInPlace(1 / timeDelta);
            }
        }
        
        // Adaptive interpolation speed based on network conditions
        // Get RTT from multiplayer manager if available
        const multiplayerManager = (this as any).multiplayerManager;
        const rtt = multiplayerManager?.getRTT?.() || 100;
        let adaptiveSpeed = this.INTERPOLATION_SPEED;
        
        // Adjust interpolation speed based on RTT
        if (rtt < 50) {
            adaptiveSpeed = 0.3; // Fast interpolation for low ping
        } else if (rtt < 150) {
            adaptiveSpeed = 0.2; // Normal speed
        } else {
            adaptiveSpeed = 0.1; // Slower for high ping to smooth jitter
        }
        
        // Interpolate position
        if (!needsExtrapolation) {
            this.interpolationAlpha = Math.min(1, this.interpolationAlpha + adaptiveSpeed * deltaTime * 60);
        } else {
            // Use dead reckoning when updates are delayed
            this.interpolationAlpha = 1; // Full extrapolation
        }
        
        // Update visuals based on network player state
        this.updateVisuals(needsExtrapolation, deltaTime);
    }
    
    // Get position at a specific time (for lag compensation)
    getPositionAtTime(time: number): Vector3 | null {
        if (this.positionHistory.length === 0) return null;
        
        // Find closest history entries
        let before: typeof this.positionHistory[0] | null = null;
        let after: typeof this.positionHistory[0] | null = null;
        
        for (let i = 0; i < this.positionHistory.length; i++) {
            const entry = this.positionHistory[i];
            if (!entry) continue;
            if (entry.time <= time) {
                before = entry;
            }
            if (entry.time >= time && !after) {
                after = entry;
                break;
            }
        }
        
        if (!before && !after) return null;
        if (!before) return after!.position.clone();
        if (!after) return before.position.clone();
        
        // Interpolate between before and after
        const t = (time - before.time) / (after.time - before.time);
        return Vector3.Lerp(before.position, after.position, t);
    }
    
    private updateVisuals(extrapolate: boolean = false, deltaTime: number = 0): void {
        if (!this.networkPlayer) {
            console.warn(`[NetworkPlayerTank] updateVisuals: networkPlayer is null for ${this.playerId}`);
            return;
        }
        
        // Interpolate position
        const targetPos = this.networkPlayer.position;
        const currentPos = this.chassis.position;
        
        // Проверяем валидность позиции
        if (!targetPos || !Number.isFinite(targetPos.x) || !Number.isFinite(targetPos.y) || !Number.isFinite(targetPos.z)) {
            console.warn(`[NetworkPlayerTank] Invalid position for ${this.playerId}:`, targetPos);
            return;
        }
        
        // ИСПРАВЛЕНО: Убеждаемся, что меши видимы и добавлены в сцену
        if (this.chassis) {
            this.chassis.isVisible = true;
            this.chassis.setEnabled(true);
            // КРИТИЧНО: Убеждаемся, что меш добавлен в сцену
            if (!this.scene.meshes.includes(this.chassis)) {
                this.scene.addMesh(this.chassis);
            }
        }
        if (this.turret) {
            this.turret.isVisible = true;
            this.turret.setEnabled(true);
        }
        if (this.barrel) {
            this.barrel.isVisible = true;
            this.barrel.setEnabled(true);
        }
        
        if (extrapolate && this.estimatedVelocity.length() > 0.1) {
            // Dead reckoning: extrapolate based on estimated velocity
            const extrapolationTime = deltaTime; // Extrapolate forward by deltaTime
            // Clone velocity before scaling to avoid mutation
            const extrapolatedPos = targetPos.add(this.estimatedVelocity.clone().scale(extrapolationTime));
            // Smoothly move towards extrapolated position
            Vector3.LerpToRef(
                currentPos,
                extrapolatedPos,
                0.3, // Fast movement towards extrapolated position
                currentPos
            );
        } else if (this.interpolationAlpha < 1) {
            // Enhanced cubic interpolation with velocity-based prediction
            const t = this.smoothstep(0, 1, this.interpolationAlpha);
            
            // Use velocity for better prediction during interpolation
            if (this.estimatedVelocity && this.estimatedVelocity.lengthSquared() > 0.01) {
                // Add velocity-based offset for smoother prediction
                const velocityOffset = this.estimatedVelocity.scale(this.interpolationAlpha * 0.016); // ~1 frame ahead
                const predictedPos = this.networkPlayer.lastPosition.add(velocityOffset);
                Vector3.LerpToRef(
                    this.networkPlayer.lastPosition,
                    predictedPos,
                    t,
                    this.chassis.position
                );
            } else {
                Vector3.LerpToRef(
                    this.networkPlayer.lastPosition,
                    targetPos,
                    t,
                    currentPos
                );
            }
        } else {
            currentPos.copyFrom(targetPos);
        }
        
        // Interpolate rotation with smoothstep
        let targetRotation = this.networkPlayer.rotation;
        let currentRotation = this.chassis.rotation.y;
        
        // Normalize angles
        while (targetRotation - currentRotation > Math.PI) targetRotation -= Math.PI * 2;
        while (targetRotation - currentRotation < -Math.PI) targetRotation += Math.PI * 2;
        
        if (this.interpolationAlpha < 1 && !extrapolate) {
            // Use smoothstep for smoother rotation
            const t = this.smoothstep(0, 1, this.interpolationAlpha);
            currentRotation = currentRotation + (targetRotation - currentRotation) * t;
        } else {
            currentRotation = targetRotation;
        }
        
        this.chassis.rotation.y = currentRotation;
        
        // Update turret rotation with smoothstep
        let targetTurretRotation = this.networkPlayer.turretRotation;
        let currentTurretRotation = this.turret.rotation.y;
        
        // Normalize angles
        while (targetTurretRotation - currentTurretRotation > Math.PI) targetTurretRotation -= Math.PI * 2;
        while (targetTurretRotation - currentTurretRotation < -Math.PI) targetTurretRotation += Math.PI * 2;
        
        if (this.interpolationAlpha < 1 && !extrapolate) {
            // Use smoothstep for smoother turret rotation
            const t = this.smoothstep(0, 1, this.interpolationAlpha);
            currentTurretRotation = currentTurretRotation + (targetTurretRotation - currentTurretRotation) * t;
        } else {
            currentTurretRotation = targetTurretRotation;
        }
        
        this.turret.rotation.y = currentTurretRotation;
        
        // Update barrel pitch (для Box поворачиваем по X для вертикального наклона)
        this.barrel.rotation.x = Math.PI / 2 - this.networkPlayer.aimPitch;
        
        // Update visibility based on status
        const isVisible = this.networkPlayer.status === "alive";
        this.chassis.setEnabled(isVisible);
        this.turret.setEnabled(isVisible);
        this.barrel.setEnabled(isVisible);
    }
    
    /**
     * Smoothstep function for smooth interpolation (cubic)
     */
    private smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t); // Cubic smoothstep
    }
    
    setNetworkPlayer(networkPlayer: NetworkPlayer): void {
        // Reset interpolation when player data changes
        this.interpolationAlpha = 0;
        this.lastNetworkUpdateTime = Date.now();
        this.networkPlayer = networkPlayer;
    }
    
    dispose(): void {
        this.barrel.dispose();
        this.turret.dispose();
        this.chassis.dispose();
    }
}

