import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, LinesMesh, CreateLines } from "@babylonjs/core";

export interface SafeZoneData {
    center: Vector3;
    radius: number;
    nextCenter: Vector3;
    nextRadius: number;
    shrinkProgress: number;
    timeUntilShrink?: number; // Time in seconds until next shrink
    damagePerSecond?: number;
}

export class BattleRoyaleVisualizer {
    private scene: Scene;
    private safeZoneMesh: Mesh | null = null;
    private safeZoneMaterial: StandardMaterial | null = null;
    private safeZoneBorder: LinesMesh | null = null;
    private nextZoneMesh: Mesh | null = null;
    private nextZoneMaterial: StandardMaterial | null = null;
    private nextZoneBorder: LinesMesh | null = null;
    private warningZoneMesh: Mesh | null = null;
    private warningZoneMaterial: StandardMaterial | null = null;
    private currentZoneData: SafeZoneData | null = null;
    private animationTime: number = 0;
    private pulseSpeed: number = 2; // Pulses per second

    constructor(scene: Scene) {
        this.scene = scene;
        this.createVisuals();
    }

    private createVisuals(): void {
        // Current safe zone - green box with border (replaced cylinder with box)
        this.safeZoneMesh = MeshBuilder.CreateBox("safeZone", {
            width: 400,
            height: 0.1,
            depth: 400
        }, this.scene);
        this.safeZoneMesh.rotation.x = Math.PI / 2;
        this.safeZoneMesh.position.y = 0.05;
        this.safeZoneMesh.isPickable = false;

        this.safeZoneMaterial = new StandardMaterial("safeZoneMat", this.scene);
        this.safeZoneMaterial.diffuseColor = new Color3(0, 1, 0);
        this.safeZoneMaterial.emissiveColor = new Color3(0, 0.5, 0);
        this.safeZoneMaterial.alpha = 0.25;
        this.safeZoneMaterial.disableLighting = true;
        this.safeZoneMesh.material = this.safeZoneMaterial;

        // Safe zone border (green circle on ground)
        this.createZoneBorder(true);

        // Next safe zone - yellow box (shows where zone will move) (replaced cylinder with box)
        this.nextZoneMesh = MeshBuilder.CreateBox("nextSafeZone", {
            width: 200,
            height: 0.1,
            depth: 200
        }, this.scene);
        this.nextZoneMesh.rotation.x = Math.PI / 2;
        this.nextZoneMesh.position.y = 0.1;
        this.nextZoneMesh.setEnabled(false);
        this.nextZoneMesh.isPickable = false;

        this.nextZoneMaterial = new StandardMaterial("nextSafeZoneMat", this.scene);
        this.nextZoneMaterial.diffuseColor = new Color3(1, 1, 0);
        this.nextZoneMaterial.emissiveColor = new Color3(0.5, 0.5, 0);
        this.nextZoneMaterial.alpha = 0.15;
        this.nextZoneMaterial.disableLighting = true;
        this.nextZoneMesh.material = this.nextZoneMaterial;

        // Next zone border
        this.createZoneBorder(false);

        // Warning zone - red box (area outside safe zone) (replaced torus with box)
        this.warningZoneMesh = MeshBuilder.CreateBox("warningZone", {
            width: 500,
            height: 8,
            depth: 500
        }, this.scene);
        this.warningZoneMesh.rotation.x = Math.PI / 2;
        this.warningZoneMesh.position.y = 0.2;
        this.warningZoneMesh.isPickable = false;

        this.warningZoneMaterial = new StandardMaterial("warningZoneMat", this.scene);
        this.warningZoneMaterial.diffuseColor = new Color3(1, 0, 0);
        this.warningZoneMaterial.emissiveColor = new Color3(0.8, 0, 0);
        this.warningZoneMaterial.alpha = 0.6;
        this.warningZoneMaterial.disableLighting = true;
        this.warningZoneMesh.material = this.warningZoneMaterial;
    }

    private createZoneBorder(isCurrent: boolean): void {
        const points: Vector3[] = [];
        const numSegments = 64;
        const radius = isCurrent ? 200 : 100;
        const y = isCurrent ? 0.15 : 0.2;
        
        for (let i = 0; i <= numSegments; i++) {
            const angle = (i / numSegments) * Math.PI * 2;
            points.push(new Vector3(
                Math.cos(angle) * radius,
                y,
                Math.sin(angle) * radius
            ));
        }
        
        const border = CreateLines("safeZoneBorder", { points: points, updatable: true }, this.scene);
        border.color = isCurrent ? new Color3(0, 1, 0) : new Color3(1, 1, 0);
        border.isPickable = false;
        
        if (isCurrent) {
            this.safeZoneBorder = border;
        } else {
            this.nextZoneBorder = border;
            border.setEnabled(false);
        }
    }

    updateSafeZone(data: SafeZoneData): void {
        this.currentZoneData = data;

        // Update current safe zone
        if (this.safeZoneMesh) {
            this.safeZoneMesh.position.x = data.center.x;
            this.safeZoneMesh.position.z = data.center.z;
            this.safeZoneMesh.scaling.x = data.radius / 200; // Scale based on radius
            this.safeZoneMesh.scaling.z = data.radius / 200;
        }

        // Update safe zone border
        if (this.safeZoneBorder) {
            this.safeZoneBorder.position.x = data.center.x;
            this.safeZoneBorder.position.z = data.center.z;
            // Update border points to match new radius
            const points: Vector3[] = [];
            const numSegments = 64;
            for (let i = 0; i <= numSegments; i++) {
                const angle = (i / numSegments) * Math.PI * 2;
                points.push(new Vector3(
                    data.center.x + Math.cos(angle) * data.radius,
                    0.15,
                    data.center.z + Math.sin(angle) * data.radius
                ));
            }
            this.safeZoneBorder.dispose();
            this.safeZoneBorder = CreateLines("safeZoneBorder", { points: points }, this.scene);
            this.safeZoneBorder.color = new Color3(0, 1, 0);
            this.safeZoneBorder.isPickable = false;
        }

        // Update next safe zone (show when shrinking)
        if (this.nextZoneMesh && data.shrinkProgress > 0.3) {
            this.nextZoneMesh.setEnabled(true);
            const nextPos = Vector3.Lerp(data.center, data.nextCenter, data.shrinkProgress);
            this.nextZoneMesh.position.x = nextPos.x;
            this.nextZoneMesh.position.z = nextPos.z;
            this.nextZoneMesh.scaling.x = data.nextRadius / 200;
            this.nextZoneMesh.scaling.z = data.nextRadius / 200;
            
            // Update next zone border
            if (this.nextZoneBorder) {
                this.nextZoneBorder.setEnabled(true);
                this.nextZoneBorder.position.x = nextPos.x;
                this.nextZoneBorder.position.z = nextPos.z;
                const points: Vector3[] = [];
                const numSegments = 64;
                for (let i = 0; i <= numSegments; i++) {
                    const angle = (i / numSegments) * Math.PI * 2;
                    points.push(new Vector3(
                        nextPos.x + Math.cos(angle) * data.nextRadius,
                        0.2,
                        nextPos.z + Math.sin(angle) * data.nextRadius
                    ));
                }
                this.nextZoneBorder.dispose();
                this.nextZoneBorder = CreateLines("nextSafeZoneBorder", { points: points }, this.scene);
                this.nextZoneBorder.color = new Color3(1, 1, 0);
                this.nextZoneBorder.isPickable = false;
            }
        } else {
            if (this.nextZoneMesh) this.nextZoneMesh.setEnabled(false);
            if (this.nextZoneBorder) this.nextZoneBorder.setEnabled(false);
        }

        // Update warning zone (red ring at edge of safe zone)
        if (this.warningZoneMesh) {
            this.warningZoneMesh.position.x = data.center.x;
            this.warningZoneMesh.position.z = data.center.z;
            this.warningZoneMesh.scaling.x = (data.radius + 15) / 250; // Slightly outside safe zone
            this.warningZoneMesh.scaling.z = (data.radius + 15) / 250;
        }

        // Update material color based on shrink progress
        if (this.safeZoneMaterial) {
            const greenAmount = 1 - data.shrinkProgress * 0.5; // Fade to yellow as zone shrinks
            const redAmount = data.shrinkProgress * 0.3;
            this.safeZoneMaterial.diffuseColor = new Color3(redAmount, greenAmount, 0);
            this.safeZoneMaterial.emissiveColor = new Color3(redAmount * 0.5, greenAmount * 0.5, 0);
        }
    }

    update(deltaTime: number): void {
        this.animationTime += deltaTime;
        
        // Pulse animation for safe zone
        if (this.safeZoneMaterial && this.currentZoneData) {
            const pulse = Math.sin(this.animationTime * this.pulseSpeed * Math.PI * 2) * 0.1 + 0.9;
            this.safeZoneMaterial.alpha = 0.15 + pulse * 0.1;
            
            // Increase emissive intensity as zone shrinks (визуальный индикатор опасности)
            const shrinkMultiplier = 1 + this.currentZoneData.shrinkProgress * 2;
            this.safeZoneMaterial.emissiveColor = new Color3(
                this.currentZoneData.shrinkProgress * 0.3 * pulse * shrinkMultiplier,
                (1 - this.currentZoneData.shrinkProgress * 0.5) * pulse,
                0
            );
        }
        
        // Pulse animation for warning zone (if player is outside)
        if (this.warningZoneMaterial) {
            const pulse = Math.sin(this.animationTime * this.pulseSpeed * 2 * Math.PI * 2) * 0.2 + 0.8;
            this.warningZoneMaterial.alpha = 0.4 + pulse * 0.2;
            this.warningZoneMaterial.emissiveColor = new Color3(0.8 * pulse, 0, 0);
        }
    }

    isPlayerInSafeZone(playerPosition: Vector3): boolean {
        if (!this.currentZoneData) return true;
        
        const distance = Vector3.Distance(playerPosition, this.currentZoneData.center);
        return distance <= this.currentZoneData.radius;
    }

    getDistanceToSafeZone(playerPosition: Vector3): number {
        if (!this.currentZoneData) return 0;
        
        const distance = Vector3.Distance(playerPosition, this.currentZoneData.center);
        return Math.max(0, distance - this.currentZoneData.radius);
    }

    getTimeUntilShrink(): number {
        return this.currentZoneData?.timeUntilShrink || 0;
    }

    getDamagePerSecond(): number {
        return this.currentZoneData?.damagePerSecond || 0;
    }

    getZoneInfo(): { radius: number; shrinkProgress: number; timeUntilShrink: number } | null {
        if (!this.currentZoneData) return null;
        return {
            radius: this.currentZoneData.radius,
            shrinkProgress: this.currentZoneData.shrinkProgress,
            timeUntilShrink: this.currentZoneData.timeUntilShrink || 0
        };
    }

    dispose(): void {
        if (this.safeZoneMesh) this.safeZoneMesh.dispose();
        if (this.nextZoneMesh) this.nextZoneMesh.dispose();
        if (this.warningZoneMesh) this.warningZoneMesh.dispose();
        if (this.safeZoneBorder) this.safeZoneBorder.dispose();
        if (this.nextZoneBorder) this.nextZoneBorder.dispose();
        if (this.safeZoneMaterial) this.safeZoneMaterial.dispose();
        if (this.nextZoneMaterial) this.nextZoneMaterial.dispose();
        if (this.warningZoneMaterial) this.warningZoneMaterial.dispose();
    }
}

