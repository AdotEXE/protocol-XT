import { Mesh, Vector3, PhysicsBody, Quaternion, PhysicsMotionType, Ray, Matrix, Scalar } from "@babylonjs/core";

/**
 * Aircraft Physics Controller - "Mouse Aim" / Virtual Joystick Standard
 * 
 * Concept:
 * - The Pilot controls a "Virtual Cursor" (Target Direction) relative to the horizon.
 * - The Plane AI (Fly-By-Wire) automatically banks and pitches to fly towards that cursor.
 * - The Camera follows the Plane (Chase Cam).
 */
export class AircraftPhysics {
    private mesh: Mesh;
    private physicsBody: PhysicsBody;

    // State
    private targetDirection: Vector3 = Vector3.Forward(); // The "Cursor" direction in World Space
    private currentVelocity: Vector3 = Vector3.Zero();
    private currentSpeed: number = 0;

    // Inputs (Normalized -1 to +1)
    private inputRoll: number = 0; // A/D override
    private inputYaw: number = 0;  // Q/E (Rudder)
    private inputPitch: number = 0; // Mouse Y
    private inputTurn: number = 0;  // Mouse X

    // Tuning - FLIGHT MODEL
    private readonly MAX_SPEED = 80.0;          // Units per second
    private readonly MIN_SPEED = 20.0;           // Stall speed / Landing speed
    private readonly ACCELERATION = 15.0;        // Engine power
    private readonly DRAG = 0.99;                // Air resistance

    private readonly TURN_RATE = 1.5;            // Radians per second (Pitch/Yaw agility)
    private readonly ROLL_SPEED = 3.0;           // Roll agility
    private readonly AUTO_BANK_FACTOR = 1.5;     // How much to bank when turning (0 = flat turn, 1 = 90deg bank)
    private readonly LEVELING_RATE = 0.5;        // How fast it returns to level when flying straight

    // Input States
    private inputState: Record<string, boolean> = {};

    // Mouse Accumulator (Virtual Joystick)
    private mouseAccumulatorX: number = 0;
    private mouseAccumulatorY: number = 0;

    constructor(mesh: Mesh, physicsBody: PhysicsBody) {
        this.mesh = mesh;
        this.physicsBody = physicsBody;

        // Force ANIMATED (Kinematic) mode
        this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);

        // Initialize Target Direction from current heading
        this.mesh.computeWorldMatrix(true);
        this.targetDirection = this.mesh.forward.clone().normalize();
        this.currentSpeed = 0;

        // Ensure we have a rotation quaternion
        if (!this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = Quaternion.FromEulerVector(this.mesh.rotation);
        }

        // Listeners
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        this.setupMouseListener();

        console.log("[AircraftPhysics] Initialized (Mouse Aim Standard)");
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.inputState[e.code] = true;
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.inputState[e.code] = false;
    }

    private setupMouseListener(): void {
        window.addEventListener("aircraftMouseDelta", ((e: CustomEvent) => {
            // Sensitivity - DRASTICALLY REDUCED to prevent twitching
            const sensitivity = 0.0005;
            this.mouseAccumulatorX += (e.detail.deltaX || 0) * sensitivity;
            this.mouseAccumulatorY += (e.detail.deltaY || 0) * sensitivity;
        }) as EventListener);
    }

    public dispose(): void {
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        if (this.physicsBody) {
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
    }

    /**
     * Main Flight Loop
     */
    public update(dt: number): void {
        // Enforce Motion Type - SAFETY CHECK
        if (!this.physicsBody || this.physicsBody.isDisposed) return;

        try {
            if (this.physicsBody.getMotionType() !== PhysicsMotionType.ANIMATED) {
                this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
            }
        } catch (e) {
            console.warn("[AircraftPhysics] Physics body invalid, stopping update");
            return;
        }

        this.processInput(dt);
        this.updatePhysics(dt);
        this.applyToMesh(dt);
    }

    /**
     * Convert Inputs + Mouse -> Flight Commands
     */
    private processInput(dt: number): void {
        // 1. Throttle (W/S)
        if (this.inputState["KeyW"]) {
            this.currentSpeed += this.ACCELERATION * dt;
        } else if (this.inputState["KeyS"]) {
            this.currentSpeed -= this.ACCELERATION * dt;
        } else {
            // Drag / Decay
            this.currentSpeed *= Math.pow(this.DRAG, dt * 60);
        }
        // Clamp Speed
        this.currentSpeed = Scalar.Clamp(this.currentSpeed, 0, this.MAX_SPEED);

        // 2. Update Target Direction (The "Cursor") based on Mouse
        // Mouse X controls Yaw of the Target Vector
        // Mouse Y controls Pitch of the Target Vector


        // Clamp accumulated mouse to avoid infinite spinning if mouse moves fast
        // LIMIT the maximum turn per frame to avoid "twitching"
        const maxInputPerFrame = 0.1; // Max 0.1 radians per frame (~5 degrees)
        this.mouseAccumulatorX = Scalar.Clamp(this.mouseAccumulatorX, -maxInputPerFrame, maxInputPerFrame);
        this.mouseAccumulatorY = Scalar.Clamp(this.mouseAccumulatorY, -maxInputPerFrame, maxInputPerFrame);

        let yawInput = this.mouseAccumulatorX;
        let pitchInput = this.mouseAccumulatorY;

        // Reset accumulator (consumed)
        this.mouseAccumulatorX = 0;
        this.mouseAccumulatorY = 0;

        // Apply Keyboard Overrides (WASD standard if mouse not used, or Q/E for rudder)
        // Apply Keyboard Overrides (Q/E for rudder/yaw)
        if (this.inputState["KeyQ"]) yawInput -= 1.0 * dt;
        if (this.inputState["KeyE"]) yawInput += 1.0 * dt;

        // Rotate the Target Direction Vector
        // We rotate it relative to World Up (Gravitational Yaw) and Local Right (Pitch)

        // Yaw (Global Y axis)
        const yawMatrix = Matrix.RotationY(yawInput);
        Vector3.TransformCoordinatesToRef(this.targetDirection, yawMatrix, this.targetDirection);

        // Pitch (Local Right axis - approximated by Cross(Up, Fwd))
        const right = Vector3.Cross(Vector3.Up(), this.targetDirection).normalize();
        const pitchMatrix = Matrix.RotationAxis(right, pitchInput);
        Vector3.TransformCoordinatesToRef(this.targetDirection, pitchMatrix, this.targetDirection);

        this.targetDirection.normalize();

        // Prevent Loop-the-loop gimbal lock issues if needed, but full freedom is requested.
        // We just ensure targetDirection never hits absolute Up/Down singularity perfectly? 
        // Actually vector math handles it fine usually.
    }

    /**
     * Fly-By-Wire: Fly the mesh towards the Target Direction
     */
    private updatePhysics(dt: number): void {
        if (!this.mesh.rotationQuaternion) return;

        // 1. Get current orientation
        const currentForward = this.mesh.forward;

        // 2. Calculate "Error" rotation needed to look at Target
        // We use Quaternion.FromToRotation? Or manually calculate.

        // We want to Rotate CurrentForward -> TargetDirection
        // BUT we also want to Roll into the turn.

        // Determine "Turn Intensity" for Banking (Cross product magnitude)
        const turnAxis = Vector3.Cross(currentForward, this.targetDirection);
        const turnIntensity = turnAxis.length(); // 0 = straight, 1 = 90deg turn
        const turnSign = Math.sign(Vector3.Dot(turnAxis, Vector3.Up())); // +Left, -Right relative to world? Check.

        // Correct Bank Banking Logic:
        // We want local Up to point "into" the turn loop.
        // If we are turning Left (Yaw Left), we bank Left.

        // Let's generate the Desired Orientation Matrix
        // Forward = TargetDirection
        // Up = mixture of WorldUp and Banking

        // Bank Calculation:
        // Calculate Yaw difference between current and target
        // We need local Yaw.
        const localTarget = Vector3.TransformCoordinates(this.targetDirection, this.mesh.getWorldMatrix().invert());
        const yawError = Math.atan2(localTarget.x, localTarget.z);

        // Desired Roll: Proportional to Yaw Error (banking into turn)
        let desiredRoll = -yawError * this.AUTO_BANK_FACTOR;

        // Manual Roll Override (Q/E or A/D if assigned)
        // Let's use Q/E for manual roll? Or A/D?
        // User wants "Mouse Aim". Usually A/D is Roll in that mode.
        // Manual Roll Override (A/D for Roll)
        if (this.inputState["KeyA"]) desiredRoll = 0.5; // Bank Left
        if (this.inputState["KeyD"]) desiredRoll = -0.5; // Bank Right

        // Construct Target Quaternion
        // 1. Face the target vector
        const faceTargetQuat = Quaternion.FromLookDirectionLH(this.targetDirection, Vector3.Up());

        // 2. Apply Bank (Roll) offset
        const bankQuat = Quaternion.RotationAxis(Vector3.Forward(), desiredRoll); // Roll around Z

        // Combine: Face Target * Bank? No, Bank is local.
        // Note: FromLookDirectionLH enforces Up=WorldUp. We want to tilt that Up.

        // Better approach: Slerp Current -> Target
        // But we must inject Roll.

        // Let's just Slerp to the "Face Target" rotation first
        const slerpFactor = this.TURN_RATE * dt;
        const nextRot = Quaternion.Slerp(this.mesh.rotationQuaternion, faceTargetQuat, slerpFactor);

        // Apply Roll manually to the result
        // We interpret 'nextRot' as the leveled orientation, then add roll.
        // Get Euler
        const euler = nextRot.toEulerAngles();
        // Overwrite Roll
        // Smoothly interpolate roll
        const currentRoll = this.mesh.rotationQuaternion.toEulerAngles().z;
        const newRoll = Scalar.Lerp(currentRoll, desiredRoll, this.ROLL_SPEED * dt);

        // Reconstruct
        const finalQuat = Quaternion.RotationYawPitchRoll(euler.y, euler.x, newRoll);
        this.mesh.rotationQuaternion = finalQuat;
    }

    private applyToMesh(dt: number): void {
        // Move forward along the NEW forward vector
        const forward = this.mesh.forward;
        const velocity = forward.scale(this.currentSpeed);

        // Apply Gravity / Lift?
        // Simple Flight: Just fly where aiming.
        // Gravity? If speed is low, drop.
        if (this.currentSpeed < this.MIN_SPEED) {
            velocity.y -= 9.8 * dt * 2; // Stall drop
        }

        const moveDelta = velocity.scale(dt);
        const newPos = this.mesh.getAbsolutePosition().add(moveDelta);

        // Ground Collision
        if (newPos.y < 2.0) newPos.y = 2.0;

        this.mesh.setAbsolutePosition(newPos);

        // Sync Physics
        this.physicsBody.setTargetTransform(newPos, this.mesh.rotationQuaternion!);
    }

    // Public getters for Camera
    public getTargetDirection(): Vector3 {
        return this.targetDirection;
    }

    public getSpeed(): number {
        return this.currentSpeed;
    }
}
