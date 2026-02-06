
import { Scene, Vector3, Mesh, PhysicsBody, PhysicsMotionType, MeshBuilder, StandardMaterial, Color3, Quaternion } from "@babylonjs/core";
import { EnemyTank } from "./enemyTank";
import { AircraftPhysics } from "./tank/aircraftPhysics";
import { getAircraftPhysicsConfig } from "./config/aircraftPhysicsConfig";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import { logger } from "./utils/logger";
import { CHASSIS_TYPES, CANNON_TYPES } from "./tankTypes";

export class EnemyPlane extends EnemyTank {
    public aircraftPhysics: AircraftPhysics | null = null;
    private targetVector: Vector3 = Vector3.Zero();

    constructor(
        scene: Scene,
        position: Vector3,
        soundManager: SoundManager,
        effectsManager: EffectsManager,
        difficulty: "easy" | "medium" | "hard" | "nightmare" = "medium",
        difficultyScale = 1,
        groundNormal: Vector3 = Vector3.Up()
    ) {
        super(scene, position, soundManager, effectsManager, difficulty, difficultyScale, groundNormal);
        this.type = "plane"; // Tag for debugging/identification
    }

    // Override to select plane chassis
    protected selectRandomModules(): any[] {
        // Force plane chassis
        this.chassisType = CHASSIS_TYPES.find(c => c.id === "plane") || CHASSIS_TYPES[0];
        this.cannonType = CANNON_TYPES[0]; // Standard cannon
        this.trackType = { id: "none", name: "None", mass: 0 }; // No tracks
        return [];
    }

    // Override to setup AircraftPhysics instead of Tank physics
    protected setupPhysics(): void {
        if (!this.chassis) return;

        // Create Physics Body (Dynamic)
        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, this.scene);
        this.physicsBody.setMassProperties({ mass: this.config.mass || 1000 });

        const config = getAircraftPhysicsConfig("fighter"); // Use 'fighter' preset

        // Mock controller for input map (empty)
        const mockController = { _inputMap: {} };

        // Initialize AircraftPhysics
        this.aircraftPhysics = new AircraftPhysics(
            this.chassis,
            this.physicsBody,
            this.scene,
            this.scene.activeCamera!,
            mockController,
            config
        );

        // Enable mouse aim / AI control mode
        // AircraftPhysics defaults to MouseAim if config says so, which 'fighter' does.
    }

    // VISUAL OVERRIDES

    protected createChassis(position: Vector3): Mesh {
        // Create a Plane shape
        const length = 4.0;
        const width = 1.0;
        const wingSpan = 5.0;

        // Fuselage
        const fuselage = MeshBuilder.CreateCylinder(`planeFuselage_${this.id}`, {
            height: length,
            diameterTop: 0.5,
            diameterBottom: 1.0,
            tessellation: 8
        }, this.scene);
        // Cylinder is vertical by default, rotate it
        fuselage.rotation.x = Math.PI / 2;

        // Wings
        const wings = MeshBuilder.CreateBox(`planeWings_${this.id}`, {
            width: wingSpan,
            height: 0.1,
            depth: 1.2
        }, this.scene);
        wings.parent = fuselage;
        wings.position.y = 0.2; // slightly above center

        // Tail
        const tail = MeshBuilder.CreateBox(`planeTail_${this.id}`, {
            width: 2.0,
            height: 0.1,
            depth: 0.8
        }, this.scene);
        tail.parent = fuselage;
        tail.position.y = 0.2;
        tail.position.z = -length * 0.45;

        const tailFin = MeshBuilder.CreateBox(`planeTailFin_${this.id}`, {
            width: 0.1,
            height: 1.0,
            depth: 0.8
        }, this.scene);
        tailFin.parent = fuselage;
        tailFin.position.y = 0.5;
        tailFin.position.z = -length * 0.45;

        // Parent mesh (pivot)
        // We return the fuselage as the main chassis mesh
        fuselage.position.copyFrom(position);

        // Material
        const mat = new StandardMaterial(`enemyPlaneMat_${this.id}`, this.scene);
        mat.diffuseColor = Color3.FromHexString(this.chassisType.color || "#dfeeff");
        mat.specularColor = new Color3(0.2, 0.2, 0.2);
        fuselage.material = mat;
        wings.material = mat;
        tail.material = mat;
        tailFin.material = mat;

        fuselage.metadata = { type: "enemyPlane", instance: this };

        // Ensure correct initial orientation (Flying horizontal)
        fuselage.rotationQuaternion = Quaternion.Identity();

        return fuselage;
    }

    protected createTracks(): void {
        // No tracks for planes
    }

    // Override update to drive AI
    public update(): void {
        if (!this.isAlive || !this.aircraftPhysics || !this.chassis) return;

        // 1. AI Logic: Find target
        let targetPos = Vector3.Zero();

        if (this.target && this.target.isAlive && this.target.chassis) {
            targetPos = this.target.chassis.absolutePosition;
        } else {
            // Default patrol: fly forward or circle
            // For now, just fly level
            targetPos = this.chassis.position.add(this.chassis.forward.scale(100));
        }

        // 2. Avoid Ground
        // Simple Raycast down? Or just check Y
        // Check Y relative to terrain if possible.
        // Game has getGroundHeight?
        const game = (window as any).gameInstance;
        let groundHeight = 0;
        if (game && typeof game.getGroundHeight === 'function') {
            groundHeight = game.getGroundHeight(this.chassis.position.x, this.chassis.position.z);
        }

        // Minimum altitude 30m
        if (this.chassis.position.y < groundHeight + 30) {
            // Panic pull up
            // Override target to be WAY UP
            targetPos = this.chassis.position.add(Vector3.Up().scale(200));
        }

        // 3. Set Target Override for Physics
        this.aircraftPhysics.setTargetOverride(targetPos);

        // 4. Update Physics
        const dt = this.scene.getEngine().getDeltaTime() / 1000;
        this.aircraftPhysics.update(dt);

        // 5. Shooting
        // Fire if target is in front and in range
        if (this.target && this.target.isAlive && this.target.chassis) {
            const vectorToTarget = this.target.chassis.absolutePosition.subtract(this.chassis.absolutePosition);
            const dist = vectorToTarget.length();

            // Check angle
            vectorToTarget.normalize();
            const forward = this.chassis.forward;
            const dot = Vector3.Dot(forward, vectorToTarget);

            // If roughly facing (> 0.95, ~18 degrees) and in range (< 400m)
            if (dot > 0.95 && dist < 400) {
                // Try to fire
                // EnemyTank.fire checks cooldown
                try {
                    // Force update turret aiming to forward (locked)
                    if (this.turret) this.turret.rotationQuaternion = Quaternion.Identity();

                    // Call fire logic from EnemyTank
                    // Cast to any to access if protected/private
                    (this as any).fire();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }
}
