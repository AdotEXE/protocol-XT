import { Mesh, Vector3, PhysicsBody, Quaternion, PhysicsMotionType, Matrix, Scalar } from "@babylonjs/core";

/**
 * Aircraft Physics Controller - "Mouse Aim" / Virtual Joystick Standard
 * AAA-Style Flight Model (War Thunder Arcade / World of Warplanes style)
 */
export class AircraftPhysics {
    private mesh: Mesh;
    private physicsBody: PhysicsBody;

    // State
    private currentSpeed: number = 0;

    // Virtual Joystick / Cursor State
    // "Where the pilot wants to go" (Unit Vector)
    private targetDirection: Vector3 = Vector3.Forward();

    // Inputs
    private inputState: Record<string, boolean> = {};
    private mouseAccumulatorX: number = 0; // Accumulated mouse input X
    private mouseAccumulatorY: number = 0; // Accumulated mouse input Y

    // TUNING PARAMETERS (The "Feel")
    // ============================================
    private readonly MAX_SPEED = 70.0;          // Max flight speed
    private readonly MIN_SPEED = 15.0;           // Stall speed
    private readonly ACCELERATION = 25.0;        // Engine power
    private readonly DRAG = 0.99;                // Air resistance (speed decay)

    // Agility
    private readonly TURN_SPEED = 1.1;           // How fast the VIRTUAL CURSOR moves (Radians/Sec)
    private readonly PITCH_SPEED = 1.1;          // How fast the VIRTUAL CURSOR moves (Radians/Sec)

    // Response / Inertia (How fast the plane follows the cursor)
    private readonly ALIGNMENT_SPEED = 3.0;      // How fast the nose aligns with cursor (Higher = Snappier, Lower = Weightier)
    private readonly ROLL_SPEED = 4.0;           // How fast the plane banks

    // Banking Logic
    private readonly AUTO_BANK_FACTOR = 3.5;     // How much to bank when turning (Roll angle per Radian of Yaw error)
    private readonly MAX_BANK_ANGLE = Math.PI / 2.2; // Max bank angle (~80 degrees)

    // Stability
    private readonly GRAVITY_FACTOR = 5.0;       // Fake gravity that pulls the nose down at low speeds

    constructor(mesh: Mesh, physicsBody: PhysicsBody) {
        this.mesh = mesh;
        this.physicsBody = physicsBody;

        // Force KINEMATIC (Animated) mode
        // We calculate physics manually for perfect control, then update the physics engine
        this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);

        // Initialize State
        this.mesh.computeWorldMatrix(true);
        if (!this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = Quaternion.FromEulerVector(this.mesh.rotation);
        }

        // Initialize target direction to current forward
        this.targetDirection = this.mesh.forward.clone().normalize();
        this.currentSpeed = 30; // Start with some speed

        // Listeners
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        this.setupMouseListener();

        console.log("[AircraftPhysics] Initialized (AAA Arcade Model)");
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.inputState[e.code] = true;
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.inputState[e.code] = false;
    }

    private setupMouseListener(): void {
        window.addEventListener("aircraftMouseDelta", ((e: CustomEvent) => {
            // Apply sensitivity immediately
            const sensitivity = 0.002;
            this.mouseAccumulatorX += (e.detail.deltaX || 0) * sensitivity;
            this.mouseAccumulatorY += (e.detail.deltaY || 0) * sensitivity;
        }) as EventListener);
    }

    public dispose(): void {
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        // Clean up event listener? (Named function would be better, but acceptable for now)
        if (this.physicsBody) {
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
    }

    /**
     * Main Physics Loop
     */
    public update(dt: number): void {
        if (!this.mesh || !this.physicsBody || this.physicsBody.isDisposed) return;

        // Ensure Kinematic Mode
        if (this.physicsBody.getMotionType() !== PhysicsMotionType.ANIMATED) {
            this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
        }

        // 1. Process Inputs (Update Virtual Cursor)
        this.updateVirtualJoystick(dt);

        // 2. Physics & Kinematics (Move Plane towards Cursor)
        this.updateKinematics(dt);
    }

    /**
     * Update the "Virtual Cursor" / Target Direction based on inputs
     */
    private updateVirtualJoystick(dt: number): void {
        // --- 1. Speed Control ---
        if (this.inputState["KeyW"]) {
            this.currentSpeed += this.ACCELERATION * dt;
        } else if (this.inputState["KeyS"]) {
            this.currentSpeed -= this.ACCELERATION * dt;
        } else {
            this.currentSpeed *= Math.pow(this.DRAG, dt * 60); // Friction
        }
        this.currentSpeed = Scalar.Clamp(this.currentSpeed, this.MIN_SPEED, this.MAX_SPEED);

        // --- 2. Calculate Input Deltas ---
        // Mouse Input
        let yawInput = this.mouseAccumulatorX;
        let pitchInput = this.mouseAccumulatorY;

        // Reset Accumulator
        this.mouseAccumulatorX = 0;
        this.mouseAccumulatorY = 0;

        // Keyboard Overrides (Q/E for Yaw, Arrows/Mouse for Pitch)
        // Q/E - Rudder (Yaw)
        if (this.inputState["KeyQ"]) yawInput -= 1.5 * dt;
        if (this.inputState["KeyE"]) yawInput += 1.5 * dt;

        // Limit Turn Rate per frame to avoid snapping
        const maxTurn = this.TURN_SPEED * dt;
        const maxPitch = this.PITCH_SPEED * dt;

        yawInput = Scalar.Clamp(yawInput, -maxTurn, maxTurn);
        pitchInput = Scalar.Clamp(pitchInput, -maxPitch, maxPitch);

        // --- 3. Rotate Target Direction ---
        // We rotate the TargetDirection vector purely in 3D space.

        // Yaw (Global Y Axis) - Turns the cursor along the horizon
        const yawMatrix = Matrix.RotationY(yawInput);
        Vector3.TransformCoordinatesToRef(this.targetDirection, yawMatrix, this.targetDirection);

        // Pitch (Local Right Axis) - Turns the cursor Up/Down relative to itself
        // We must calculate the "Right" vector relative to the cursor and World Up
        const right = Vector3.Cross(Vector3.Up(), this.targetDirection).normalize();

        // Prevent gimbal lock/singularity at poles
        // If forward is too close to Up/Down, Cross product is unstable.
        if (Math.abs(this.targetDirection.y) > 0.95) {
            // Near pole, just use X axis as fallback right
            right.copyFrom(Vector3.Right());
        }

        const pitchMatrix = Matrix.RotationAxis(right, pitchInput);
        Vector3.TransformCoordinatesToRef(this.targetDirection, pitchMatrix, this.targetDirection);

        this.targetDirection.normalize();

        // Gravity Drop on Cursor (at low speeds, nose drops)
        if (this.currentSpeed < this.MAX_SPEED * 0.4) {
            const dropFactor = (1.0 - (this.currentSpeed / (this.MAX_SPEED * 0.4))) * this.GRAVITY_FACTOR * dt;
            const gravityMatrix = Matrix.RotationAxis(right, dropFactor); // Pitch down
            Vector3.TransformCoordinatesToRef(this.targetDirection, gravityMatrix, this.targetDirection);
            this.targetDirection.normalize();
        }
    }

    /**
     * Move the actual Mesh towards the Target Direction with inertia
     */
    private updateKinematics(dt: number): void {
        if (!this.mesh.rotationQuaternion) return;

        // --- 1. Orientation Update ---

        // We want to align Mesh.Forward with TargetDirection.
        // BUT we also want to Roll properly.

        // A. Calculate Desired Roll (Auto-Banking)
        // Find Yaw Difference between CurrentForward and TargetDirection
        // Project both onto horizontal plane (XZ)
        const currentFwdFlat = new Vector3(this.mesh.forward.x, 0, this.mesh.forward.z).normalize();
        const targetFwdFlat = new Vector3(this.targetDirection.x, 0, this.targetDirection.z).normalize();

        // Cross product Y component gives us the sign and magnitude of the turn
        const turnCross = Vector3.Cross(currentFwdFlat, targetFwdFlat);
        const yawError = Math.asin(Scalar.Clamp(turnCross.y, -1, 1));

        // Banking Law: Bank INTO the turn
        // If turning LEFT (Positive Cross Y?), Bank LEFT.
        let targetRoll = -yawError * this.AUTO_BANK_FACTOR * 5.0; // Multiplier defines "Aggressiveness"

        // Clamp Roll
        targetRoll = Scalar.Clamp(targetRoll, -this.MAX_BANK_ANGLE, this.MAX_BANK_ANGLE);

        // Manual Roll Override (A/D)
        if (this.inputState["KeyA"]) targetRoll = 0.8; // Hard Bank Left
        if (this.inputState["KeyD"]) targetRoll = -0.8; // Hard Bank Right

        // B. Construct Target Rotation
        // Look at Target Loop
        const lookRot = Quaternion.FromLookDirectionLH(this.targetDirection, Vector3.Up());

        // Apply Roll to the Look Rotation
        // We need to rotate around the Local Z axis of the Look Rotation
        const rollRot = Quaternion.RotationAxis(Vector3.Forward(), targetRoll);

        // Combine: First Look, Then Roll (Multiplication order matters)
        // Q_final = Q_look * Q_roll
        const finalTargetRot = lookRot.multiply(rollRot);

        // C. Slerp Current -> Target (Simulates Rotational Inertia/Weight)
        const slerpFactor = this.ALIGNMENT_SPEED * dt;
        this.mesh.rotationQuaternion = Quaternion.Slerp(this.mesh.rotationQuaternion, finalTargetRot, slerpFactor);

        // --- 2. Position Update ---
        // Move along the ACTUAL mesh forward (not the cursor) to simulate 'sliding' through air during turns
        const moveStep = this.mesh.forward.scale(this.currentSpeed * dt);
        const newPos = this.mesh.absolutePosition.add(moveStep);

        // Ground Clamp
        if (newPos.y < 2.0) newPos.y = 2.0;

        this.mesh.setAbsolutePosition(newPos);

        // Sync Physics Body
        this.physicsBody.setTargetTransform(newPos, this.mesh.rotationQuaternion);
    }

    // --- Public API ---
    public getSpeed(): number {
        return this.currentSpeed;
    }
}
