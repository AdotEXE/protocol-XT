import { Mesh, Vector3, PhysicsBody, Quaternion, PhysicsMotionType, Scalar } from "@babylonjs/core";

/**
 * Aircraft Physics Controller - STABLE AUTO-LEVEL
 * Fixes:
 * - Removed Euler-based leveling (caused shaking/singularities).
 * - Uses Quaternion Slerp for stable leveling to the horizon.
 * - Input Smoothing via damping.
 */
export class AircraftPhysics {
    private mesh: Mesh;
    private physicsBody: PhysicsBody;

    // State
    private currentSpeed: number = 0;

    // Smoothed Inputs
    private smoothedPitchInput: number = 0;
    private smoothedRollInput: number = 0;
    private smoothedYawInput: number = 0;

    // Tuning
    private readonly MAX_SPEED = 60.0;
    private readonly MIN_SPEED = 15.0;
    private readonly ACCELERATION = 20.0;
    private readonly DRAG = 0.99;

    // Control Sensitivity
    private readonly PITCH_SENSITIVITY = 1.5;
    private readonly ROLL_SENSITIVITY = 2.0;
    private readonly YAW_SENSITIVITY = 1.0;

    // Smoothing (Higher = Smoother/Slower)
    private readonly INPUT_SMOOTHING = 5.0;

    // Auto-Leveling
    private readonly AUTO_LEVEL_STRENGTH = 2.0; // Speed of returning to level

    private inputState: Record<string, boolean> = {};
    private mouseDeltaX: number = 0;
    private mouseDeltaY: number = 0;

    constructor(mesh: Mesh, physicsBody: PhysicsBody) {
        this.mesh = mesh;
        this.physicsBody = physicsBody;

        // Force Kinematic
        this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);

        this.mesh.computeWorldMatrix(true);
        if (!this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = Quaternion.FromEulerVector(this.mesh.rotation);
        }

        this.currentSpeed = 30;

        // Listeners
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        this.setupMouseListener();

        console.log("[AircraftPhysics] Initialized (Stable Auto-Level)");
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.inputState[e.code] = true;
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.inputState[e.code] = false;
    }

    private setupMouseListener(): void {
        window.addEventListener("aircraftMouseDelta", ((e: CustomEvent) => {
            // Raw Accumulation
            this.mouseDeltaX += (e.detail.deltaX || 0) * 0.002;
            this.mouseDeltaY += (e.detail.deltaY || 0) * 0.002;
        }) as EventListener);
    }

    public dispose(): void {
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        if (this.physicsBody) {
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
    }

    public update(dt: number): void {
        if (!this.mesh || !this.physicsBody || this.physicsBody.isDisposed) return;

        if (this.physicsBody.getMotionType() !== PhysicsMotionType.ANIMATED) {
            this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
        }

        // --- 1. Speed ---
        if (this.inputState["KeyW"]) this.currentSpeed += this.ACCELERATION * dt;
        else if (this.inputState["KeyS"]) this.currentSpeed -= this.ACCELERATION * dt;
        else this.currentSpeed *= Math.pow(this.DRAG, dt * 60);

        this.currentSpeed = Scalar.Clamp(this.currentSpeed, this.MIN_SPEED, this.MAX_SPEED);

        // --- 2. Input smoothing ---
        // Target Inputs directly from controls
        let targetPitch = this.mouseDeltaY * this.PITCH_SENSITIVITY;
        let targetRoll = this.mouseDeltaX * this.ROLL_SENSITIVITY;
        let targetYaw = 0;

        // Reset Mouse
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        if (this.inputState["KeyQ"]) targetYaw -= 1.0;
        if (this.inputState["KeyE"]) targetYaw += 1.0;
        targetYaw *= this.YAW_SENSITIVITY * dt; // Yaw is time-based rate

        // Check active input
        const isInputActive = Math.abs(targetPitch) > 0.0001 ||
            Math.abs(targetRoll) > 0.0001 ||
            Math.abs(targetYaw) > 0.0001;

        // Smoothly interpolate current inputs towards targets
        const lerpFactor = this.INPUT_SMOOTHING * dt;
        this.smoothedPitchInput = Scalar.Lerp(this.smoothedPitchInput, targetPitch, lerpFactor);
        this.smoothedRollInput = Scalar.Lerp(this.smoothedRollInput, targetRoll, lerpFactor);
        this.smoothedYawInput = Scalar.Lerp(this.smoothedYawInput, targetYaw, lerpFactor);

        // --- 3. Apply Rotation ---
        // Construct rotation step from inputs
        const qPitch = Quaternion.RotationAxis(Vector3.Right(), this.smoothedPitchInput);
        const qRoll = Quaternion.RotationAxis(Vector3.Forward(), -this.smoothedRollInput);
        const qYaw = Quaternion.RotationAxis(Vector3.Up(), this.smoothedYawInput);

        // Apply Input Rotation
        if (this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = this.mesh.rotationQuaternion.multiply(qPitch).multiply(qRoll).multiply(qYaw);
            this.mesh.rotationQuaternion.normalize();
        }

        // --- 4. Auto-Leveling (Stable) ---
        // Only if NO input and sufficient speed
        if (!isInputActive && this.mesh.rotationQuaternion) {
            // We want to align Up with World Up, but keep Forward roughly same.
            // Actually, simplest 'Level' is to kill Roll and Pitch.

            // Get Forward and correct it to be horizontal
            const forward = this.mesh.forward;
            // Project forward onto XZ plane
            const forwardHorizontal = new Vector3(forward.x, 0, forward.z).normalize();

            // If nose is straight up/down, keep current forward (avoid singularity)
            if (forwardHorizontal.length() > 0.01) {
                // Target Rotation: Look at ForwardHorizontal with Up = WorldUp
                const targetRotation = Quaternion.FromLookDirectionLH(forwardHorizontal, Vector3.Up());

                // Slerp towards it
                // '0.0' to '1.0' factor. 
                // Using a small fixed step or time-based step.
                const levelFactor = this.AUTO_LEVEL_STRENGTH * dt;

                this.mesh.rotationQuaternion = Quaternion.Slerp(this.mesh.rotationQuaternion, targetRotation, levelFactor);
            }
        }

        // --- 5. Movement ---
        const forward = this.mesh.forward;
        const moveStep = forward.scale(this.currentSpeed * dt);
        const newPos = this.mesh.absolutePosition.add(moveStep);
        if (newPos.y < 2.0) newPos.y = 2.0;

        this.mesh.setAbsolutePosition(newPos);
        this.physicsBody.setTargetTransform(newPos, this.mesh.rotationQuaternion!);
    }

    public getSpeed(): number {
        return this.currentSpeed;
    }
}
