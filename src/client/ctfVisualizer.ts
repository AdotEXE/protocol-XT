import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, Animation } from "@babylonjs/core";
import type { FlagData } from "../shared/types";

export class CTFVisualizer {
    private scene: Scene;
    private flags: Map<string, Mesh> = new Map(); // flagId -> mesh
    private flagPoles: Map<string, Mesh> = new Map(); // flagId -> pole mesh
    private flagBeacons: Map<string, Mesh> = new Map(); // flagId -> beacon mesh
    private flagMaterials: Map<number, StandardMaterial> = new Map(); // team -> material
    private beaconMaterials: Map<string, StandardMaterial> = new Map(); // flagId -> beacon material
    private animationTime: number = 0;

    constructor(scene: Scene) {
        this.scene = scene;
        this.createMaterials();
    }

    private createMaterials(): void {
        // Team 0 - Blue
        const team0Mat = new StandardMaterial("ctfFlagTeam0", this.scene);
        team0Mat.diffuseColor = new Color3(0, 0.5, 1);
        team0Mat.emissiveColor = new Color3(0, 0.3, 0.6);
        team0Mat.disableLighting = true;
        this.flagMaterials.set(0, team0Mat);

        // Team 1 - Red
        const team1Mat = new StandardMaterial("ctfFlagTeam1", this.scene);
        team1Mat.diffuseColor = new Color3(1, 0.2, 0.2);
        team1Mat.emissiveColor = new Color3(0.6, 0.1, 0.1);
        team1Mat.disableLighting = true;
        this.flagMaterials.set(1, team1Mat);
    }

    updateFlags(flags: FlagData[]): void {
        for (const flag of flags) {
            let flagMesh = this.flags.get(flag.id);
            let poleMesh = this.flagPoles.get(flag.id);
            let beaconMesh = this.flagBeacons.get(flag.id);

            if (!flagMesh) {
                // Create flag mesh with better shape
                flagMesh = MeshBuilder.CreateBox(`ctfFlag_${flag.id}`, {
                    width: 2.5,
                    height: 1.8,
                    depth: 0.01
                }, this.scene);
                flagMesh.billboardMode = Mesh.BILLBOARDMODE_Y;
                flagMesh.isPickable = false;
                
                const material = this.flagMaterials.get(flag.team);
                if (material) {
                    flagMesh.material = material;
                }
                
                // Add flag waving animation
                const waveAnim = new Animation(
                    "flagWave",
                    "rotation.z",
                    30,
                    Animation.ANIMATIONTYPE_FLOAT,
                    Animation.ANIMATIONLOOPMODE_CYCLE
                );
                waveAnim.setKeys([
                    { frame: 0, value: -0.2 },
                    { frame: 15, value: 0.2 },
                    { frame: 30, value: -0.2 }
                ]);
                flagMesh.animations.push(waveAnim);
                this.scene.beginAnimation(flagMesh, 0, 30, true);
                
                this.flags.set(flag.id, flagMesh);
            }

            if (!poleMesh) {
                // Create flag pole
                poleMesh = MeshBuilder.CreateBox(`ctfPole_${flag.id}`, {
                    width: 0.25,
                    height: 4,
                    depth: 0.25
                }, this.scene);
                poleMesh.isPickable = false;
                
                const poleMat = new StandardMaterial(`ctfPoleMat_${flag.id}`, this.scene);
                poleMat.diffuseColor = new Color3(0.4, 0.4, 0.4);
                poleMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
                poleMesh.material = poleMat;
                
                this.flagPoles.set(flag.id, poleMesh);
            }

            if (!beaconMesh) {
                // Create beacon light on top of pole
                beaconMesh = MeshBuilder.CreateBox(`ctfBeacon_${flag.id}`, {
                    width: 1.2,
                    height: 1.2,
                    depth: 1.2
                }, this.scene);
                beaconMesh.isPickable = false;
                
                const beaconMat = new StandardMaterial(`ctfBeaconMat_${flag.id}`, this.scene);
                const teamColor = flag.team === 0 
                    ? new Color3(0, 0.5, 1) 
                    : new Color3(1, 0.2, 0.2);
                beaconMat.emissiveColor = teamColor;
                beaconMat.diffuseColor = teamColor;
                beaconMat.disableLighting = true;
                beaconMesh.material = beaconMat;
                
                // Add pulsing animation
                const pulseAnim = new Animation(
                    "beaconPulse",
                    "material.emissiveColor",
                    30,
                    Animation.ANIMATIONTYPE_COLOR3,
                    Animation.ANIMATIONLOOPMODE_CYCLE
                );
                pulseAnim.setKeys([
                    { frame: 0, value: teamColor.scale(0.3) },
                    { frame: 15, value: teamColor },
                    { frame: 30, value: teamColor.scale(0.3) }
                ]);
                beaconMesh.animations.push(pulseAnim);
                this.scene.beginAnimation(beaconMesh, 0, 30, true);
                
                this.flagBeacons.set(flag.id, beaconMesh);
                this.beaconMaterials.set(flag.id, beaconMat);
            }

            // Update position
            if (flag.isCarried) {
                // Hide flag and pole when carried, but show beacon at carrier position
                flagMesh.setEnabled(false);
                poleMesh.setEnabled(false);
                
                // Show beacon at carrier position (will be updated by server)
                if (beaconMesh) {
                    beaconMesh.setEnabled(true);
                    const pos = new Vector3(flag.position.x, flag.position.y, flag.position.z);
                    beaconMesh.position = pos.clone();
                    beaconMesh.position.y += 3; // Above carrier
                }
            } else {
                // Show at base position
                flagMesh.setEnabled(true);
                poleMesh.setEnabled(true);
                if (beaconMesh) beaconMesh.setEnabled(true);
                
                const pos = new Vector3(flag.position.x, flag.position.y, flag.position.z);
                flagMesh.position = pos.clone();
                flagMesh.position.y += 3.5; // Flag on top of pole
                
                poleMesh.position = pos.clone();
                poleMesh.position.y = 2; // Pole height
                
                if (beaconMesh) {
                    beaconMesh.position = pos.clone();
                    beaconMesh.position.y = 4.5; // Beacon on top
                }
            }
        }
    }

    update(deltaTime: number): void {
        this.animationTime += deltaTime;
        // Additional animations can be added here
    }

    getFlagPosition(flagId: string): Vector3 | null {
        const flag = this.flags.get(flagId);
        if (flag && flag.isEnabled()) {
            return flag.position.clone();
        }
        const beacon = this.flagBeacons.get(flagId);
        if (beacon && beacon.isEnabled()) {
            return beacon.position.clone();
        }
        return null;
    }

    getFlagTeam(flagId: string): number | null {
        // Find flag by checking materials
        for (const [id, flag] of this.flags.entries()) {
            if (id === flagId) {
                const material = flag.material as StandardMaterial;
                if (material === this.flagMaterials.get(0)) return 0;
                if (material === this.flagMaterials.get(1)) return 1;
            }
        }
        return null;
    }

    dispose(): void {
        this.flags.forEach(flag => flag.dispose());
        this.flagPoles.forEach(pole => pole.dispose());
        this.flagBeacons.forEach(beacon => beacon.dispose());
        this.flagMaterials.forEach(mat => mat.dispose());
        this.beaconMaterials.forEach(mat => mat.dispose());
        this.flags.clear();
        this.flagPoles.clear();
        this.flagBeacons.clear();
        this.flagMaterials.clear();
        this.beaconMaterials.clear();
    }
}

