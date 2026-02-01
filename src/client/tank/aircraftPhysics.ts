import { Mesh, Vector3, PhysicsBody, Quaternion, PhysicsMotionType, Matrix, Scalar } from "@babylonjs/core";

/**
 * Aircraft Physics Controller - SMOOTHED DIRECT CONTROL + AUTO-LEVEL
 * Features:
 * - Direct Input (Mouse/Keys) -> Target Rotation Rates
 * - Inertia: Rates are smoothed over time (Lerp)
 * - Auto-Level: When no input, plane slowly rotates to level flight (Pitch 0, Roll 0)
 */
export class AircraftPhysics {
    private mesh: Mesh;
    private physicsBody: PhysicsBody;

    // State
    private currentSpeed: number = 0;

    // Smoothed Rotation Rates (Radians per Sec)
    private currentPitchRate: number = 0;
    private currentRollRate: number = 0;
    private currentYawRate: number = 0;

    // Tuning
    private readonly MAX_SPEED = 60.0;
    private readonly MIN_SPEED = 15.0;
    private readonly ACCELERATION = 20.0;
    private readonly DRAG = 0.99;

    // Agility (Max Rates)
    private readonly PITCH_SPEED = 1.2;
    private readonly ROLL_SPEED = 2.0;
    private readonly YAW_SPEED = 0.8;

    // Smoothing / Inertia (Lower = heavily damped/smooth, Higher = snappy)
    private readonly INERTIA_FACTOR = 2.0;

    // Auto-Leveling
    private readonly AUTO_LEVEL_SPEED = 1.0; // How fast it returns to level (Rad/Sec)
    private readonly LEVELING_DEADZONE = 0.05; // Input threshold to disable auto-level

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

        console.log("[AircraftPhysics] Initialized (Auto-Level + Smooth)");
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.inputState[e.code] = true;
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.inputState[e.code] = false;
    }

    private setupMouseListener(): void {
        window.addEventListener("aircraftMouseDelta", ((e: CustomEvent) => {
            // Sensitivity
            const sensitivity = 0.002;
            this.mouseDeltaX += (e.detail.deltaX || 0) * sensitivity;
            this.mouseDeltaY += (e.detail.deltaY || 0) * sensitivity;
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

        // --- 1. Speed Control ---
        if (this.inputState["KeyW"]) this.currentSpeed += this.ACCELERATION * dt;
        else if (this.inputState["KeyS"]) this.currentSpeed -= this.ACCELERATION * dt;
        else this.currentSpeed *= Math.pow(this.DRAG, dt * 60);

        this.currentSpeed = Scalar.Clamp(this.currentSpeed, this.MIN_SPEED, this.MAX_SPEED);

        // --- 2. Input Processing ---

        // Raw Inputs
        let inputPitch = this.mouseDeltaY;
        let inputRoll = this.mouseDeltaX;
        let inputYaw = 0;

        if (this.inputState["KeyQ"]) inputYaw -= 1.0;
        if (this.inputState["KeyE"]) inputYaw += 1.0;

        // Reset accumulator
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        // Calculate Target Rates
        let targetPitchRate = inputPitch * this.PITCH_SPEED;
        let targetRollRate = inputRoll * this.ROLL_SPEED;
        let targetYawRate = inputYaw * this.YAW_SPEED;

        // --- 3. Auto-Leveling Logic ---
        // If minimal input, apply leveling forces
        const isInputActive = Math.abs(inputPitch) > this.LEVELING_DEADZONE ||
            Math.abs(inputRoll) > this.LEVELING_DEADZONE ||
            Math.abs(inputYaw) > 0.1;

        if (!isInputActive && this.mesh.rotationQuaternion) {
            // Get current Euler angles
            const euler = this.mesh.rotationQuaternion.toEulerAngles();
            // Pitch (X), Yaw (Y), Roll (Z)

            // We want Pitch -> 0 and Roll -> 0
            // Yaw stays same

            // Calculate error
            // Pitch: euler.x
            // Roll: euler.z

            // Apply a corrective rate proportional to error (P-controller)
            // Invert sign because if Roll is positive (Right down?), we want negative rate.
            // Check Babylon coordinates: Usually +Z Roll is tilt one way. We want to go to 0.

            const levelRatePitch = -euler.x * this.AUTO_LEVEL_SPEED;
            const levelRateRoll = -euler.z * this.AUTO_LEVEL_SPEED;

            // Apply to targets (softly override 0)
            targetPitchRate = levelRatePitch;
            targetRollRate = levelRateRoll;
        }

        // --- 4. Inertia / Smoothing ---
        // Lerp current rates to target rates
        const lerpFactor = this.INERTIA_FACTOR * dt;

        this.currentPitchRate = Scalar.Lerp(this.currentPitchRate, targetPitchRate, lerpFactor);
        this.currentRollRate = Scalar.Lerp(this.currentRollRate, targetRollRate, lerpFactor);
        this.currentYawRate = Scalar.Lerp(this.currentYawRate, targetYawRate, lerpFactor);

        // --- 5. Apply Rotation ---
        // Amount to rotate THIS frame
        // Note: Rates are Rad/Sec? Mouse delta is already "Amount".
        // If mouse delta is "Amount to move", then Rate = Amount / dt?
        // Actually, let's treat mouse input as "Desired Rate Intensity" for continuous movement?
        // NO, classic controls: Mouse Move = Plane Move. Stop Mouse = Stop Plane.
        // So Mouse Delta IS the Target Rate (scaled).
        // BUT for Auto-Level, we need continuous rate.

        // So:
        // Input -> Target Rate (OK)
        // Rate * dt -> Delta Rotation (OK)

        // HOWEVER: Mouse Delta is "Pixels moved this frame". 
        // If we treat it as Rate, it means "While moving mouse, we rotate". "Stop moving mouse, we stop rotating".
        // This is correct for direct control.

        // BUT: targetPitchRate derived from mouseDeltaY (per frame) is effectively "Angle per frame".
        // We shouldn't multiply by dt again if it's already frame-based?
        // Wait, "Rate" in physics usually implies per second.
        // If I say targetPitchRate = mouseDelta * Speed, that's "Angle per frame".
        // The auto-level rate is "Angle per second".

        // Let's normalize to "Angle per Frame" for simplicity in this block

        let framePitch = 0;
        let frameRoll = 0;
        let frameYaw = 0;

        if (isInputActive) {
            // Input Mode: Mouse Delta is the frame step
            framePitch = this.currentPitchRate; // This is actually smoothed mouse delta
            frameRoll = this.currentRollRate;
            frameYaw = this.currentYawRate * dt; // Yaw input is -1/1 state, so needs dt
        } else {
            // Leveling Mode: Rates are Per Second
            framePitch = this.currentPitchRate * dt;
            frameRoll = this.currentRollRate * dt;
            // Yaw is 0 or smoothed 0
            frameYaw = this.currentYawRate * dt;
        }

        // Wait, mixing units (Frame vs Second) in the Lerp state `currentPitchRate` is bad.
        // Let's standardize state to "Radians Per Second".

        // Mouse Delta is "Radians this frame". 
        // Rate = MouseDelta / dt.

        // Better:
        // Just treat everything as "Radians to rotate LOW PASS FILTERED".
        // If Auto-Leveling, inject a "Fake Mouse Delta" that corrects orientation.

        // RE-DO LOGIC SIMPLIFIED:
        // We process "Desired Rotation Step" this frame.

        let stepPitch = inputPitch * this.PITCH_SPEED;
        let stepRoll = inputRoll * this.ROLL_SPEED;
        let stepYaw = inputYaw * this.YAW_SPEED * dt;

        if (!isInputActive && this.mesh.rotationQuaternion) {
            const euler = this.mesh.rotationQuaternion.toEulerAngles();
            // Auto-level steps (Frame based approximation)
            // Move 5% towards 0 per frame?
            const correctionFactor = 0.05;
            stepPitch = -euler.x * correctionFactor;
            stepRoll = -euler.z * correctionFactor;
        }

        // Apply Smoothing to the STEP
        // currentPitchRate here acts as "Last Frame Step"
        // We lerp from Last Step to New Step.

        this.currentPitchRate = Scalar.Lerp(this.currentPitchRate, stepPitch, lerpFactor);
        this.currentRollRate = Scalar.Lerp(this.currentRollRate, stepRoll, lerpFactor);
        this.currentYawRate = Scalar.Lerp(this.currentYawRate, stepYaw, lerpFactor);

        // Apply
        const qPitch = Quaternion.RotationAxis(Vector3.Right(), this.currentPitchRate);
        const qRoll = Quaternion.RotationAxis(Vector3.Forward(), -this.currentRollRate);
        const qYaw = Quaternion.RotationAxis(Vector3.Up(), this.currentYawRate);

        if (this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = this.mesh.rotationQuaternion.multiply(qPitch).multiply(qRoll).multiply(qYaw);
            this.mesh.rotationQuaternion.normalize();
        }

        // --- 6. Position Update ---
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
