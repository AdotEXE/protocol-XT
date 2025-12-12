import { Vector3 } from "@babylonjs/core";
import type { PlayerInput } from "../shared/types";

export interface ValidationResult {
    valid: boolean;
    reason?: string;
}

export class InputValidator {
    // Maximum values
    private static readonly MAX_SPEED = 40; // units per second (increased for fastest tanks)
    private static readonly MAX_TURN_SPEED = 5; // radians per second
    private static readonly MAX_POSITION_DELTA = 50; // maximum position change per tick
    private static readonly MAX_POSITION = 10000; // maximum absolute position
    private static readonly MIN_POSITION = -10000; // minimum absolute position
    
    // Anti-cheat thresholds
    private static readonly TELEPORT_DISTANCE = 100; // Distance that triggers teleport detection
    private static readonly MAX_SPEED_MULTIPLIER = 1.5; // Allow 50% speed boost (for abilities)
    private static readonly SUSPICIOUS_MOVEMENT_COUNT = 5; // Number of suspicious movements before action
    private static readonly SPEED_CHECK_WINDOW = 1000; // Check speed over 1 second window
    
    // Input ranges
    private static readonly MIN_THROTTLE = -1;
    private static readonly MAX_THROTTLE = 1;
    private static readonly MIN_STEER = -1;
    private static readonly MAX_STEER = 1;
    private static readonly MIN_TURRET_ROTATION = -Math.PI * 2;
    private static readonly MAX_TURRET_ROTATION = Math.PI * 2;
    private static readonly MIN_AIM_PITCH = -Math.PI / 2;
    private static readonly MAX_AIM_PITCH = Math.PI / 2;
    
    // Rate limits
    private static readonly MAX_INPUTS_PER_SECOND = 60; // 60 Hz max
    private static readonly MAX_SHOOTS_PER_SECOND = 10; // 10 shots per second max
    
    static validatePlayerInput(input: PlayerInput, lastPosition: Vector3, currentPosition: Vector3, deltaTime: number): ValidationResult {
        // Validate input structure
        if (typeof input.throttle !== "number" || isNaN(input.throttle)) {
            return { valid: false, reason: "Invalid throttle value" };
        }
        
        if (typeof input.steer !== "number" || isNaN(input.steer)) {
            return { valid: false, reason: "Invalid steer value" };
        }
        
        if (typeof input.turretRotation !== "number" || isNaN(input.turretRotation)) {
            return { valid: false, reason: "Invalid turretRotation value" };
        }
        
        if (typeof input.aimPitch !== "number" || isNaN(input.aimPitch)) {
            return { valid: false, reason: "Invalid aimPitch value" };
        }
        
        if (typeof input.isShooting !== "boolean") {
            return { valid: false, reason: "Invalid isShooting value" };
        }
        
        if (typeof input.timestamp !== "number" || isNaN(input.timestamp)) {
            return { valid: false, reason: "Invalid timestamp value" };
        }
        
        // Validate ranges
        if (input.throttle < this.MIN_THROTTLE || input.throttle > this.MAX_THROTTLE) {
            return { valid: false, reason: `Throttle out of range: ${input.throttle}` };
        }
        
        if (input.steer < this.MIN_STEER || input.steer > this.MAX_STEER) {
            return { valid: false, reason: `Steer out of range: ${input.steer}` };
        }
        
        if (input.turretRotation < this.MIN_TURRET_ROTATION || input.turretRotation > this.MAX_TURRET_ROTATION) {
            return { valid: false, reason: `Turret rotation out of range: ${input.turretRotation}` };
        }
        
        if (input.aimPitch < this.MIN_AIM_PITCH || input.aimPitch > this.MAX_AIM_PITCH) {
            return { valid: false, reason: `Aim pitch out of range: ${input.aimPitch}` };
        }
        
        // Validate timestamp (not too old, not in future)
        const now = Date.now();
        const timeDiff = now - input.timestamp;
        if (timeDiff > 5000) { // More than 5 seconds old
            return { valid: false, reason: "Input timestamp too old" };
        }
        if (timeDiff < -1000) { // More than 1 second in future
            return { valid: false, reason: "Input timestamp in future" };
        }
        
        // Validate position change (anti-teleport)
        const positionDelta = Vector3.Distance(lastPosition, currentPosition);
        const maxDelta = this.MAX_POSITION_DELTA * deltaTime;
        if (positionDelta > maxDelta) {
            return { valid: false, reason: `Position change too large: ${positionDelta} (max: ${maxDelta})` };
        }
        
        // Enhanced teleport detection
        if (positionDelta > this.TELEPORT_DISTANCE) {
            return { valid: false, reason: `Teleport detected: ${positionDelta} units` };
        }
        
        // Speed validation (check if movement is physically possible)
        const timeDelta = deltaTime || (1 / 60); // Default to 60 Hz
        const speed = positionDelta / timeDelta;
        const maxAllowedSpeed = this.MAX_SPEED * this.MAX_SPEED_MULTIPLIER;
        if (speed > maxAllowedSpeed) {
            return { valid: false, reason: `Speed too high: ${speed.toFixed(2)} units/s (max: ${maxAllowedSpeed})` };
        }
        
        return { valid: true };
    }
    
    /**
     * Validate movement with position history (for advanced anti-cheat)
     */
    static validateMovementWithHistory(
        newPosition: Vector3,
        positionHistory: Array<{ time: number; position: Vector3 }>,
        deltaTime: number
    ): ValidationResult {
        if (positionHistory.length === 0) {
            return { valid: true };
        }
        
        const lastEntry = positionHistory[positionHistory.length - 1];
        const timeSinceLastUpdate = Date.now() - lastEntry.time;
        
        // Check for time manipulation
        if (timeSinceLastUpdate > 2000) {
            return { valid: false, reason: "Time gap too large (possible lag or manipulation)" };
        }
        
        // Check for impossible acceleration
        if (positionHistory.length >= 2) {
            const prevEntry = positionHistory[positionHistory.length - 2];
            const prevDelta = Vector3.Distance(prevEntry.position, lastEntry.position);
            const prevTime = (lastEntry.time - prevEntry.time) / 1000;
            const prevSpeed = prevTime > 0 ? prevDelta / prevTime : 0;
            
            const currentDelta = Vector3.Distance(lastEntry.position, newPosition);
            const currentTime = timeSinceLastUpdate / 1000;
            const currentSpeed = currentTime > 0 ? currentDelta / currentTime : 0;
            
            // Check for impossible acceleration (more than 2x speed increase in one frame)
            if (prevSpeed > 0 && currentSpeed > prevSpeed * 2) {
                return { valid: false, reason: `Impossible acceleration: ${currentSpeed.toFixed(2)} from ${prevSpeed.toFixed(2)}` };
            }
        }
        
        // Use standard validation
        return this.validatePlayerInput(
            { throttle: 0, steer: 0, turretRotation: 0, aimPitch: 0, isShooting: false, timestamp: Date.now() },
            lastEntry.position,
            newPosition,
            deltaTime
        );
    }
    
    /**
     * Check for suspicious movement patterns
     */
    static checkSuspiciousMovement(
        positionHistory: Array<{ time: number; position: Vector3 }>
    ): { suspicious: boolean; reason?: string } {
        if (positionHistory.length < 3) {
            return { suspicious: false };
        }
        
        // Check for zigzag pattern (possible aimbot or movement hack)
        let directionChanges = 0;
        for (let i = 1; i < positionHistory.length - 1; i++) {
            const prev = positionHistory[i - 1];
            const curr = positionHistory[i];
            const next = positionHistory[i + 1];
            
            const dir1 = curr.position.subtract(prev.position).normalize();
            const dir2 = next.position.subtract(curr.position).normalize();
            
            const dot = Vector3.Dot(dir1, dir2);
            if (dot < -0.5) { // Sharp direction change
                directionChanges++;
            }
        }
        
        if (directionChanges > positionHistory.length * 0.5) {
            return { suspicious: true, reason: "Suspicious zigzag movement pattern" };
        }
        
        // Check for perfect movement (possible bot)
        let perfectMovements = 0;
        for (let i = 1; i < positionHistory.length; i++) {
            const prev = positionHistory[i - 1];
            const curr = positionHistory[i];
            const distance = Vector3.Distance(prev.position, curr.position);
            const time = (curr.time - prev.time) / 1000;
            const speed = time > 0 ? distance / time : 0;
            
            // Check if speed is exactly constant (suspicious)
            if (i > 1) {
                const prevDistance = Vector3.Distance(positionHistory[i - 2].position, prev.position);
                const prevTime = (prev.time - positionHistory[i - 2].time) / 1000;
                const prevSpeed = prevTime > 0 ? prevDistance / prevTime : 0;
                
                if (Math.abs(speed - prevSpeed) < 0.01 && speed > 0) {
                    perfectMovements++;
                }
            }
        }
        
        if (perfectMovements > positionHistory.length * 0.8) {
            return { suspicious: true, reason: "Suspiciously perfect movement (possible bot)" };
        }
        
        return { suspicious: false };
    }
    
    static validatePosition(position: Vector3): ValidationResult {
        if (!position || typeof position.x !== "number" || typeof position.y !== "number" || typeof position.z !== "number") {
            return { valid: false, reason: "Invalid position structure" };
        }
        
        if (isNaN(position.x) || isNaN(position.y) || isNaN(position.z)) {
            return { valid: false, reason: "Position contains NaN values" };
        }
        
        if (position.x < this.MIN_POSITION || position.x > this.MAX_POSITION ||
            position.y < this.MIN_POSITION || position.y > this.MAX_POSITION ||
            position.z < this.MIN_POSITION || position.z > this.MAX_POSITION) {
            return { valid: false, reason: `Position out of bounds: (${position.x}, ${position.y}, ${position.z})` };
        }
        
        return { valid: true };
    }
    
    static validateShootData(data: any): ValidationResult {
        if (!data.position || !data.direction) {
            return { valid: false, reason: "Missing position or direction" };
        }
        
        const posResult = this.validatePosition(data.position);
        if (!posResult.valid) {
            return posResult;
        }
        
        const dirResult = this.validatePosition(data.direction);
        if (!dirResult.valid) {
            return { valid: false, reason: "Invalid direction vector" };
        }
        
        // Validate direction is normalized (approximately)
        const dirLength = Math.sqrt(
            data.direction.x * data.direction.x +
            data.direction.y * data.direction.y +
            data.direction.z * data.direction.z
        );
        if (dirLength < 0.1 || dirLength > 2.0) {
            return { valid: false, reason: `Direction vector not normalized: length=${dirLength}` };
        }
        
        // Validate damage
        if (data.damage !== undefined) {
            if (typeof data.damage !== "number" || isNaN(data.damage) || data.damage < 0 || data.damage > 1000) {
                return { valid: false, reason: `Invalid damage value: ${data.damage}` };
            }
        }
        
        return { valid: true };
    }
    
    static validateChatMessage(message: string): ValidationResult {
        if (typeof message !== "string") {
            return { valid: false, reason: "Message must be a string" };
        }
        
        if (message.length === 0) {
            return { valid: false, reason: "Message cannot be empty" };
        }
        
        if (message.length > 200) {
            return { valid: false, reason: "Message too long (max 200 characters)" };
        }
        
        // Check for potentially malicious content
        if (message.includes("<script") || message.includes("javascript:")) {
            return { valid: false, reason: "Message contains potentially malicious content" };
        }
        
        return { valid: true };
    }
}

