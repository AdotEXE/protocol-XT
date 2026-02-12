import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Animation } from "@babylonjs/core";

export interface ControlPointData {
    id: string;
    position: Vector3;
    team: number | null; // 0, 1, or null (neutral)
    captureProgress: number; // 0-100
    isContested: boolean;
}

export class ControlPointVisualizer {
    private scene: Scene;
    private points: Map<string, {
        platform: Mesh;
        pole: Mesh;
        indicator: Mesh;
        progressRing: Mesh;
        platformMaterial: StandardMaterial;
        indicatorMaterial: StandardMaterial;
        progressMaterial: StandardMaterial;
    }> = new Map();
    private animationTime: number = 0;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    updatePoints(points: ControlPointData[]): void {
        for (const point of points) {
            let pointVisual = this.points.get(point.id);
            
            if (!pointVisual) {
                // Create platform (base)
                const platform = MeshBuilder.CreateCylinder(`cp_platform_${point.id}`, {
                    height: 0.5,
                    diameter: 8
                }, this.scene);
                platform.position = point.position.clone();
                platform.position.y = 0.25;
                platform.isPickable = false;

                const platformMaterial = new StandardMaterial(`cp_platform_mat_${point.id}`, this.scene);
                platformMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
                platformMaterial.emissiveColor = new Color3(0.2, 0.2, 0.2);
                platform.material = platformMaterial;

                // Create pole (center)
                const pole = MeshBuilder.CreateCylinder(`cp_pole_${point.id}`, {
                    height: 4,
                    diameter: 0.5
                }, this.scene);
                pole.position = point.position.clone();
                pole.position.y = 2;
                pole.isPickable = false;

                const poleMaterial = new StandardMaterial(`cp_pole_mat_${point.id}`, this.scene);
                poleMaterial.diffuseColor = new Color3(0.4, 0.4, 0.4);
                pole.material = poleMaterial;

                // Create indicator sphere (top)
                const indicator = MeshBuilder.CreateSphere(`cp_indicator_${point.id}`, {
                    diameter: 2
                }, this.scene);
                indicator.position = point.position.clone();
                indicator.position.y = 4;
                indicator.isPickable = false;

                const indicatorMaterial = new StandardMaterial(`cp_indicator_mat_${point.id}`, this.scene);
                indicatorMaterial.disableLighting = true;
                indicator.material = indicatorMaterial;

                // Create progress ring (around platform)
                const progressRing = MeshBuilder.CreateTorus(`cp_progress_${point.id}`, {
                    diameter: 10,
                    thickness: 0.3,
                    tessellation: 32
                }, this.scene);
                progressRing.position = point.position.clone();
                progressRing.position.y = 0.5;
                progressRing.rotation.x = Math.PI / 2;
                progressRing.isPickable = false;

                const progressMaterial = new StandardMaterial(`cp_progress_mat_${point.id}`, this.scene);
                progressMaterial.disableLighting = true;
                progressRing.material = progressMaterial;

                pointVisual = {
                    platform,
                    pole,
                    indicator,
                    progressRing,
                    platformMaterial,
                    indicatorMaterial,
                    progressMaterial
                };
                this.points.set(point.id, pointVisual);
            }

            // Update colors based on team
            const team0Color = new Color3(0, 0.5, 1); // Blue
            const team1Color = new Color3(1, 0.2, 0.2); // Red
            const neutralColor = new Color3(0.5, 0.5, 0.5); // Gray

            let color: Color3;
            if (point.team === 0) {
                color = team0Color;
            } else if (point.team === 1) {
                color = team1Color;
            } else {
                color = neutralColor;
            }

            // Update indicator color
            pointVisual.indicatorMaterial.emissiveColor = color;
            pointVisual.indicatorMaterial.diffuseColor = color;

            // Update platform color (lighter)
            const platformColor = color.scale(0.3);
            pointVisual.platformMaterial.emissiveColor = platformColor;

            // Update progress ring
            if (point.captureProgress > 0 && point.captureProgress < 100) {
                pointVisual.progressRing.isVisible = true;
                pointVisual.progressMaterial.emissiveColor = color;
                // Animate progress ring based on capture progress
                const progressAngle = (point.captureProgress / 100) * Math.PI * 2;
                // Visual representation of progress (could use custom shader, but for now just show ring)
            } else {
                pointVisual.progressRing.isVisible = false;
            }

            // Pulse animation when contested
            if (point.isContested) {
                const pulse = Math.sin(this.animationTime * 5) * 0.3 + 1.0;
                pointVisual.indicator.scaling.setAll(pulse);
            } else {
                pointVisual.indicator.scaling.setAll(1.0);
            }

            // Update positions
            pointVisual.platform.position.copyFrom(point.position);
            pointVisual.platform.position.y = 0.25;
            pointVisual.pole.position.copyFrom(point.position);
            pointVisual.pole.position.y = 2;
            pointVisual.indicator.position.copyFrom(point.position);
            pointVisual.indicator.position.y = 4;
            pointVisual.progressRing.position.copyFrom(point.position);
            pointVisual.progressRing.position.y = 0.5;
        }

        // Remove points that no longer exist
        const currentIds = new Set(points.map(p => p.id));
        for (const [id, visual] of this.points.entries()) {
            if (!currentIds.has(id)) {
                visual.platform.dispose();
                visual.pole.dispose();
                visual.indicator.dispose();
                visual.progressRing.dispose();
                visual.platformMaterial.dispose();
                visual.indicatorMaterial.dispose();
                visual.progressMaterial.dispose();
                this.points.delete(id);
            }
        }
    }

    update(deltaTime: number): void {
        this.animationTime += deltaTime / 1000; // Convert to seconds
    }

    dispose(): void {
        for (const visual of this.points.values()) {
            visual.platform.dispose();
            visual.pole.dispose();
            visual.indicator.dispose();
            visual.progressRing.dispose();
            visual.platformMaterial.dispose();
            visual.indicatorMaterial.dispose();
            visual.progressMaterial.dispose();
        }
        this.points.clear();
    }
}
