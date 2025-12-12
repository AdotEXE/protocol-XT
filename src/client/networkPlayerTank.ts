import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Quaternion } from "@babylonjs/core";
import type { NetworkPlayer } from "./multiplayer";
import { getChassisById, getCannonById } from "./tankTypes";

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
    private readonly INTERPOLATION_SPEED = 0.2; // How fast to interpolate
    
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
        
        return chassis;
    }
    
    private createTurret(): Mesh {
        const turret = MeshBuilder.CreateCylinder(
            `networkPlayer_turret_${this.playerId}`,
            {
                height: 0.8,
                diameter: 1.2
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
        
        return turret;
    }
    
    private createBarrel(): Mesh {
        const barrel = MeshBuilder.CreateCylinder(
            `networkPlayer_barrel_${this.playerId}`,
            {
                height: 2.5,
                diameter: 0.3
            },
            this.scene
        );
        
        barrel.position.set(0, 0.4, 1.25);
        barrel.rotation.x = Math.PI / 2;
        barrel.parent = this.turret;
        
        const mat = new StandardMaterial(`networkPlayer_barrel_mat_${this.playerId}`, this.scene);
        mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        barrel.material = mat;
        
        return barrel;
    }
    
    update(deltaTime: number): void {
        // Store position history for lag compensation
        const currentTime = Date.now();
        this.positionHistory.push({
            time: currentTime,
            position: this.networkPlayer.position.clone(),
            rotation: this.networkPlayer.rotation
        });
        
        // Remove old history
        this.positionHistory = this.positionHistory.filter(
            entry => currentTime - entry.time < this.MAX_HISTORY_TIME
        );
        
        // Interpolate position
        this.interpolationAlpha = Math.min(1, this.interpolationAlpha + this.INTERPOLATION_SPEED * deltaTime * 60);
        
        // Update visuals based on network player state
        this.updateVisuals();
    }
    
    // Get position at a specific time (for lag compensation)
    getPositionAtTime(time: number): Vector3 | null {
        if (this.positionHistory.length === 0) return null;
        
        // Find closest history entries
        let before: typeof this.positionHistory[0] | null = null;
        let after: typeof this.positionHistory[0] | null = null;
        
        for (let i = 0; i < this.positionHistory.length; i++) {
            const entry = this.positionHistory[i];
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
    
    private updateVisuals(): void {
        if (!this.networkPlayer) return;
        
        // Interpolate position
        const targetPos = this.networkPlayer.position;
        const currentPos = this.chassis.position;
        
        if (this.interpolationAlpha < 1) {
            // Smooth interpolation
            Vector3.LerpToRef(
                this.networkPlayer.lastPosition,
                targetPos,
                this.interpolationAlpha,
                currentPos
            );
        } else {
            currentPos.copyFrom(targetPos);
        }
        
        // Interpolate rotation
        let targetRotation = this.networkPlayer.rotation;
        let currentRotation = this.chassis.rotation.y;
        
        // Normalize angles
        while (targetRotation - currentRotation > Math.PI) targetRotation -= Math.PI * 2;
        while (targetRotation - currentRotation < -Math.PI) targetRotation += Math.PI * 2;
        
        if (this.interpolationAlpha < 1) {
            currentRotation = currentRotation + (targetRotation - currentRotation) * this.interpolationAlpha;
        } else {
            currentRotation = targetRotation;
        }
        
        this.chassis.rotation.y = currentRotation;
        
        // Update turret rotation
        let targetTurretRotation = this.networkPlayer.turretRotation;
        let currentTurretRotation = this.turret.rotation.y;
        
        // Normalize angles
        while (targetTurretRotation - currentTurretRotation > Math.PI) targetTurretRotation -= Math.PI * 2;
        while (targetTurretRotation - currentTurretRotation < -Math.PI) targetTurretRotation += Math.PI * 2;
        
        if (this.interpolationAlpha < 1) {
            currentTurretRotation = currentTurretRotation + (targetTurretRotation - currentTurretRotation) * this.interpolationAlpha;
        } else {
            currentTurretRotation = targetTurretRotation;
        }
        
        this.turret.rotation.y = currentTurretRotation;
        
        // Update barrel pitch
        this.barrel.rotation.x = Math.PI / 2 - this.networkPlayer.aimPitch;
        
        // Update visibility based on status
        const isVisible = this.networkPlayer.status === "alive";
        this.chassis.setEnabled(isVisible);
        this.turret.setEnabled(isVisible);
        this.barrel.setEnabled(isVisible);
    }
    
    setNetworkPlayer(networkPlayer: NetworkPlayer): void {
        // Reset interpolation when player data changes
        this.interpolationAlpha = 0;
        this.networkPlayer = networkPlayer;
    }
    
    dispose(): void {
        this.barrel.dispose();
        this.turret.dispose();
        this.chassis.dispose();
    }
}

