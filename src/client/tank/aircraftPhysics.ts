import { Mesh, Vector3, PhysicsBody, Quaternion, PhysicsMotionType, Matrix, Scalar } from "@babylonjs/core";

/**
 * Aircraft Physics Controller - CLASSIC DIRECT CONTROL
 * Reverted to standard behavior:
 * - Mouse X -> Roll/Turn
 * - Mouse Y -> Pitch
 * - W/S -> Speed
 * - No "Virtual Cursor"
 */
export class AircraftPhysics {
    private mesh: Mesh;
    private physicsBody: PhysicsBody;

    // State
    private currentSpeed: number = 0;

    // Inputs (Direct)
    private inputRoll: number = 0;
    private inputPitch: number = 0;
    private inputYaw: number = 0;

    // Tuning
    private readonly MAX_SPEED = 60.0;
    private readonly MIN_SPEED = 15.0;
    private readonly ACCELERATION = 20.0;
    private readonly DRAG = 0.98;

    // Agility (Direct Rotation Speed)
    private readonly PITCH_SPEED = 1.5;
    private readonly ROLL_SPEED = 2.5;
    private readonly YAW_SPEED = 1.0;

    private inputState: Record<string, boolean> = {};
    private mouseDeltaX: number = 0;
    private mouseDeltaY: number = 0;

    // Smoothed Values
    private currentPitchRate: number = 0;
    private currentRollRate: number = 0;
    private currentYawRate: number = 0;

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

        console.log("[AircraftPhysics] Initialized (Classic Direct Control)");
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.inputState[e.code] = true;
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.inputState[e.code] = false;
    }

    private setupMouseListener(): void {
        window.addEventListener("aircraftMouseDelta", ((e: CustomEvent) => {
            // Direct input accumulation for this frame
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

        // 1. Speed
        if (this.inputState["KeyW"]) this.currentSpeed += this.ACCELERATION * dt;
        else if (this.inputState["KeyS"]) this.currentSpeed -= this.ACCELERATION * dt;
        else this.currentSpeed *= Math.pow(this.DRAG, dt * 60);

        this.currentSpeed = Scalar.Clamp(this.currentSpeed, this.MIN_SPEED, this.MAX_SPEED);

        // 2. Rotation (Direct)
        // Mouse X -> Roll (Bank)
        // Mouse Y -> Pitch
        // Q/E -> Yaw (Rudder)

        let pitchInput = this.mouseDeltaY;
        let rollInput = this.mouseDeltaX;

        // Reset deltas
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        // Keyboard Yaw
        let yawInput = 0;
        if (this.inputState["KeyQ"]) yawInput -= 1.0;
        if (this.inputState["KeyE"]) yawInput += 1.0;

        // Apply Rotations directly to Quaternion
        // Pitch (Local X)
        // Yaw (Local Y)
        // Roll (Local Z)

        const rotAmountPitch = pitchInput * this.PITCH_SPEED; // Speed is already factored in mouse delta sort of, but let's just use it direct
        const rotAmountRoll = rollInput * this.ROLL_SPEED;
        const rotAmountYaw = yawInput * this.YAW_SPEED * dt;

        // Create rotation Quaternions
        // Pitch around Local X
        const qPitch = Quaternion.RotationAxis(Vector3.Right(), rotAmountPitch);
        // Roll around Local Z
        const qRoll = Quaternion.RotationAxis(Vector3.Forward(), -rotAmountRoll); // Invert X for Roll usually? Mouse Right -> Roll Right
        // Yaw around Local Y
        const qYaw = Quaternion.RotationAxis(Vector3.Up(), rotAmountYaw);

        // Apply pitch/roll/yaw to current rotation
        // Order: Yaw -> Pitch -> Roll usually, but for local updates:
        // We multiply the current rotation by the changes.

        // Let's try Yaw (Global) or Local? Local is better for planes.

        // Apply steps:
        if (this.mesh.rotationQuaternion) {
            // Local Pitch
            this.mesh.rotationQuaternion = this.mesh.rotationQuaternion.multiply(qPitch);
            // Local Roll
            this.mesh.rotationQuaternion = this.mesh.rotationQuaternion.multiply(qRoll);
            // Local Yaw (Rudder)
            this.mesh.rotationQuaternion = this.mesh.rotationQuaternion.multiply(qYaw);

            // Normalize to prevent drift
            this.mesh.rotationQuaternion.normalize();
        }

        // 3. Move Speed
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
