import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Path3D, LinesMesh } from "@babylonjs/core";

export interface EscortPayloadData {
    position: Vector3;
    health: number;
    maxHealth: number;
    progress: number; // 0-100
    route: Vector3[]; // Route waypoints
    team: number; // 0 or 1
}

export class EscortVisualizer {
    private scene: Scene;
    private convoy: Mesh | null = null;
    private routeLine: LinesMesh | null = null;
    private progressMarker: Mesh | null = null;
    private convoyMaterial: StandardMaterial | null = null;
    private routeMaterial: StandardMaterial | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    updatePayload(data: EscortPayloadData): void {
        // Create convoy mesh if it doesn't exist
        if (!this.convoy) {
            // Main convoy body (simplified tank-like shape)
            const body = MeshBuilder.CreateBox("escort_body", {
                width: 3,
                height: 2,
                depth: 5
            }, this.scene);
            body.position.y = 1;
            body.isPickable = false;

            // Conveyor belt/platform
            const platform = MeshBuilder.CreateBox("escort_platform", {
                width: 4,
                height: 0.3,
                depth: 6
            }, this.scene);
            platform.position.y = 0.15;
            platform.isPickable = false;

            this.convoy = Mesh.MergeMeshes([body, platform], true, true, undefined, false, true) || body;
            this.convoy.name = "escort_convoy";

            this.convoyMaterial = new StandardMaterial("escort_convoy_mat", this.scene);
            this.convoy.material = this.convoyMaterial;
        }

        // Update convoy position
        if (this.convoy) {
            this.convoy.position.copyFrom(data.position);
        }

        // Update convoy color based on team
        if (this.convoyMaterial) {
            const team0Color = new Color3(0, 0.5, 1); // Blue
            const team1Color = new Color3(1, 0.2, 0.2); // Red
            const color = data.team === 0 ? team0Color : team1Color;
            this.convoyMaterial.diffuseColor = color;
            this.convoyMaterial.emissiveColor = color.scale(0.3);
        }

        // Create route line
        if (data.route && data.route.length > 1) {
            if (this.routeLine) {
                this.routeLine.dispose();
            }

            const path = new Path3D(data.route);
            const points = path.getCurve();
            this.routeLine = MeshBuilder.CreateLines("escort_route", {
                points: points,
                updatable: true
            }, this.scene);

            if (!this.routeMaterial) {
                this.routeMaterial = new StandardMaterial("escort_route_mat", this.scene);
                this.routeMaterial.disableLighting = true;
                this.routeMaterial.emissiveColor = new Color3(1, 1, 0); // Yellow
            }
            this.routeLine.color = new Color3(1, 1, 0);
        }

        // Create progress marker
        if (data.route && data.route.length > 0 && data.progress > 0) {
            const progressIndex = Math.floor((data.progress / 100) * (data.route.length - 1));
            const targetPos = data.route[Math.min(progressIndex, data.route.length - 1)];

            if (!this.progressMarker) {
                this.progressMarker = MeshBuilder.CreateSphere("escort_progress", {
                    diameter: 1.5
                }, this.scene);
                this.progressMarker.isPickable = false;

                const progressMat = new StandardMaterial("escort_progress_mat", this.scene);
                progressMat.disableLighting = true;
                progressMat.emissiveColor = new Color3(0, 1, 0); // Green
                this.progressMarker.material = progressMat;
            }

            this.progressMarker.position.copyFrom(targetPos);
            this.progressMarker.position.y = 2;
        }
    }

    dispose(): void {
        if (this.convoy) {
            this.convoy.dispose();
            this.convoy = null;
        }
        if (this.routeLine) {
            this.routeLine.dispose();
            this.routeLine = null;
        }
        if (this.progressMarker) {
            this.progressMarker.dispose();
            this.progressMarker = null;
        }
        if (this.convoyMaterial) {
            this.convoyMaterial.dispose();
            this.convoyMaterial = null;
        }
        if (this.routeMaterial) {
            this.routeMaterial.dispose();
            this.routeMaterial = null;
        }
    }
}
