import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import type { NetworkPlayer } from "./multiplayer";
import { getChassisById } from "./tankTypes";

export class NetworkPlayerTank {
    scene: Scene;
    playerId: string;
    
    // Visuals
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    
    // Network player reference
    networkPlayer: NetworkPlayer;
    
    // Interpolation
    private interpolationAlpha: number = 0;
    private readonly INTERPOLATION_SPEED = 0.2; // How fast to interpolate (adaptive based on RTT)
    private estimatedVelocity: Vector3 = new Vector3(0, 0, 0);
    private lastNetworkUpdateTime: number = 0;
    
    // Lag compensation - store history for rewind
    private positionHistory: Array<{ time: number; position: Vector3; rotation: number }> = [];
    private readonly MAX_HISTORY_TIME = 1000; // 1 second of history
    
    // Diagnostic logging
    private _lastDiagnosticLog: number = 0;
    
    constructor(scene: Scene, networkPlayer: NetworkPlayer) {
        this.scene = scene;
        this.playerId = networkPlayer.id;
        this.networkPlayer = networkPlayer;
        
        // Validate scene
        if (!scene) {
            console.error(`[NetworkPlayerTank] Cannot create tank: scene is null for player ${this.playerId}`);
            throw new Error("Scene is required to create NetworkPlayerTank");
        }
        
        // Validate network player
        if (!networkPlayer || !networkPlayer.position) {
            console.error(`[NetworkPlayerTank] Cannot create tank: invalid networkPlayer for ${this.playerId}`);
            throw new Error("Valid networkPlayer with position is required");
        }
        
        // Create visuals (similar to TankController)
        this.chassis = this.createChassis();
        this.turret = this.createTurret();
        this.barrel = this.createBarrel();
        
        // КРИТИЧНО: Убеждаемся, что все меши добавлены в сцену и видимы
        this.ensureMeshesInScene();
        
        // КРИТИЧНО: Устанавливаем начальную позицию ПЕРЕД вызовом updateVisuals
        // Это гарантирует, что танк появится в правильной позиции сразу
        if (networkPlayer.position) {
            this.chassis.position.copyFrom(networkPlayer.position);
            console.log(`[NetworkPlayerTank] ✅ Initial position set: (${networkPlayer.position.x.toFixed(2)}, ${networkPlayer.position.y.toFixed(2)}, ${networkPlayer.position.z.toFixed(2)})`);
        } else {
            console.warn(`[NetworkPlayerTank] ⚠️ No initial position for ${this.playerId}, using (0, 2, 0)`);
            this.chassis.position.set(0, 2, 0);
        }
        
        // Set initial visuals (rotation, turret, etc.)
        this.updateVisuals();
        
        // ДИАГНОСТИКА: Проверяем финальное состояние
        const finalPos = this.chassis.position;
        const finalStatus = this.networkPlayer.status;
        const finalVisible = this.chassis.isVisible && this.chassis.isEnabled();
        const finalInScene = this.scene.meshes.includes(this.chassis);
        console.log(`[NetworkPlayerTank] ✅ Tank created for ${this.playerId}: pos=(${finalPos.x.toFixed(2)}, ${finalPos.y.toFixed(2)}, ${finalPos.z.toFixed(2)}), status=${finalStatus}, visible=${finalVisible}, inScene=${finalInScene}`);
    }
    
    /**
     * Убедиться, что все меши добавлены в сцену и видимы
     */
    private ensureMeshesInScene(): void {
        if (!this.scene) return;
        
        const meshes = [this.chassis, this.turret, this.barrel].filter(m => m !== null && m !== undefined);
        
        for (const mesh of meshes) {
            if (!mesh) continue;
            
            // Убеждаемся, что меш видим
            mesh.isVisible = true;
            mesh.setEnabled(true);
            
            // Убеждаемся, что меш добавлен в сцену
            if (!this.scene.meshes.includes(mesh)) {
                this.scene.addMesh(mesh);
                console.log(`[NetworkPlayerTank] ✅ Added mesh ${mesh.name} to scene for player ${this.playerId}`);
            }
        }
    }
    
    private createChassis(): Mesh {
        // Use player's chassis type or default
        const chassisId = this.networkPlayer.chassisType || "medium";
        const chassisData = getChassisById(chassisId) || getChassisById("medium");
        
        const chassis = MeshBuilder.CreateBox(
            `networkPlayer_chassis_${this.playerId}`,
            {
                width: chassisData.width,
                height: chassisData.height,
                depth: chassisData.depth
            },
            this.scene
        );
        
        const mat = new StandardMaterial(`networkPlayer_mat_${this.playerId}`, this.scene);
        // Use player's custom color or default
        const tankColor = this.networkPlayer.tankColor || chassisData.color;
        const color = Color3.FromHexString(tankColor);
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.3);
        mat.specularColor = Color3.Black();
        chassis.material = mat;
        
        // КРИТИЧНО: Убеждаемся, что меш видим и добавлен в сцену
        chassis.isVisible = true;
        chassis.setEnabled(true);
        if (!this.scene.meshes.includes(chassis)) {
            this.scene.addMesh(chassis);
        }
        
        return chassis;
    }
    
    private createTurret(): Mesh {
        // ИСПРАВЛЕНИЕ: Используем Box вместо Cylinder (НИКОГДА НЕ ИСПОЛЬЗОВАТЬ КРУГЛЫЕ ФОРМЫ)
        const turret = MeshBuilder.CreateBox(
            `networkPlayer_turret_${this.playerId}`,
            {
                width: 1.2,
                height: 0.8,
                depth: 1.2
            },
            this.scene
        );
        
        turret.position.y = 0.6;
        turret.parent = this.chassis;
        
        const mat = new StandardMaterial(`networkPlayer_turret_mat_${this.playerId}`, this.scene);
        // Use player's custom turret color or default
        const turretColor = this.networkPlayer.turretColor || this.networkPlayer.tankColor || "#888888";
        const color = Color3.FromHexString(turretColor);
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.3);
        turret.material = mat;
        
        // КРИТИЧНО: Убеждаемся, что меш видим
        turret.isVisible = true;
        turret.setEnabled(true);
        
        return turret;
    }
    
    private createBarrel(): Mesh {
        // ИСПРАВЛЕНИЕ: Используем Box вместо Cylinder (НИКОГДА НЕ ИСПОЛЬЗОВАТЬ КРУГЛЫЕ ФОРМЫ)
        const barrel = MeshBuilder.CreateBox(
            `networkPlayer_barrel_${this.playerId}`,
            {
                width: 0.3,
                height: 0.3,
                depth: 2.5
            },
            this.scene
        );
        
        barrel.position.set(0, 0.4, 1.25);
        // Для Box не нужно поворачивать по X, так как он уже ориентирован правильно
        barrel.parent = this.turret;
        
        const mat = new StandardMaterial(`networkPlayer_barrel_mat_${this.playerId}`, this.scene);
        mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        barrel.material = mat;
        
        // КРИТИЧНО: Убеждаемся, что меш видим
        barrel.isVisible = true;
        barrel.setEnabled(true);
        
        return barrel;
    }
    
    update(deltaTime: number): void {
        // ДИАГНОСТИКА: Проверяем что танк существует и валиден
        if (!this.chassis || !this.networkPlayer) {
            console.error(`[NetworkPlayerTank] ⚠️ Invalid tank state for ${this.playerId}: chassis=${!!this.chassis}, networkPlayer=${!!this.networkPlayer}`);
            return;
        }
        
        const currentTime = Date.now();
        
        // Calculate time since last network update
        const timeSinceUpdate = currentTime - this.lastNetworkUpdateTime;
        const needsExtrapolation = timeSinceUpdate > 50; // More than 50ms since last update
        
        // ДИАГНОСТИКА: Логируем позицию и статус (только раз в секунду)
        if (!this._lastDiagnosticLog || currentTime - this._lastDiagnosticLog > 1000) {
            const pos = this.chassis.position;
            const status = this.networkPlayer.status;
            const visible = this.chassis.isVisible && this.chassis.isEnabled();
            const inScene = this.scene.meshes.includes(this.chassis);
            console.log(`[NetworkPlayerTank] 🔍 ${this.playerId}: pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}), status=${status}, visible=${visible}, inScene=${inScene}`);
            this._lastDiagnosticLog = currentTime;
        }
        
        // Store position history for lag compensation
        if (this.lastNetworkUpdateTime > 0) {
            this.positionHistory.push({
                time: currentTime,
                position: this.networkPlayer.position.clone(),
                rotation: this.networkPlayer.rotation
            });
        }
        
        // Remove old history
        this.positionHistory = this.positionHistory.filter(
            entry => currentTime - entry.time < this.MAX_HISTORY_TIME
        );
        
        // Calculate estimated velocity for dead reckoning
        if (this.positionHistory.length >= 2) {
            const last = this.positionHistory[this.positionHistory.length - 1]!;
            const prev = this.positionHistory[this.positionHistory.length - 2]!;
            const timeDelta = (last.time - prev.time) / 1000; // Convert to seconds
            if (timeDelta > 0) {
                // Clone before scaling to avoid mutating
                this.estimatedVelocity = last.position.subtract(prev.position).clone().scaleInPlace(1 / timeDelta);
            }
        }
        
        // Adaptive interpolation speed based on network conditions
        // Get RTT from multiplayer manager if available
        const multiplayerManager = (this as any).multiplayerManager;
        const rtt = multiplayerManager?.getRTT?.() || 100;
        let adaptiveSpeed = this.INTERPOLATION_SPEED;
        
        // Adjust interpolation speed based on RTT
        if (rtt < 50) {
            adaptiveSpeed = 0.3; // Fast interpolation for low ping
        } else if (rtt < 150) {
            adaptiveSpeed = 0.2; // Normal speed
        } else {
            adaptiveSpeed = 0.1; // Slower for high ping to smooth jitter
        }
        
        // Interpolate position
        if (!needsExtrapolation) {
            this.interpolationAlpha = Math.min(1, this.interpolationAlpha + adaptiveSpeed * deltaTime * 60);
        } else {
            // Use dead reckoning when updates are delayed
            this.interpolationAlpha = 1; // Full extrapolation
        }
        
        // Update visuals based on network player state
        this.updateVisuals(needsExtrapolation, deltaTime);
    }
    
    // Get position at a specific time (for lag compensation)
    getPositionAtTime(time: number): Vector3 | null {
        if (this.positionHistory.length === 0) return null;
        
        // Find closest history entries
        let before: typeof this.positionHistory[0] | null = null;
        let after: typeof this.positionHistory[0] | null = null;
        
        for (let i = 0; i < this.positionHistory.length; i++) {
            const entry = this.positionHistory[i];
            if (!entry) continue;
            if (entry.time <= time) {
                before = entry;
            }
            if (entry.time >= time && !after) {
                after = entry;
                break;
            }
        }
        
        if (!before && !after) return null;
        if (!before) return after!.position.clone();
        if (!after) return before.position.clone();
        
        // Interpolate between before and after
        const t = (time - before.time) / (after.time - before.time);
        return Vector3.Lerp(before.position, after.position, t);
    }
    
    private updateVisuals(extrapolate: boolean = false, deltaTime: number = 0): void {
        if (!this.networkPlayer) {
            console.warn(`[NetworkPlayerTank] updateVisuals: networkPlayer is null for ${this.playerId}`);
            return;
        }
        
        // Interpolate position
        const targetPos = this.networkPlayer.position;
        const currentPos = this.chassis.position;
        
        // Проверяем валидность позиции
        if (!targetPos || !Number.isFinite(targetPos.x) || !Number.isFinite(targetPos.y) || !Number.isFinite(targetPos.z)) {
            console.warn(`[NetworkPlayerTank] Invalid position for ${this.playerId}:`, targetPos);
            return;
        }
        
        // ИСПРАВЛЕНО: Убеждаемся, что меши видимы и добавлены в сцену
        if (this.chassis) {
            this.chassis.isVisible = true;
            this.chassis.setEnabled(true);
            // КРИТИЧНО: Убеждаемся, что меш добавлен в сцену
            if (!this.scene.meshes.includes(this.chassis)) {
                this.scene.addMesh(this.chassis);
            }
        }
        if (this.turret) {
            this.turret.isVisible = true;
            this.turret.setEnabled(true);
        }
        if (this.barrel) {
            this.barrel.isVisible = true;
            this.barrel.setEnabled(true);
        }
        
        if (extrapolate && this.estimatedVelocity.length() > 0.1) {
            // Dead reckoning: extrapolate based on estimated velocity
            // Limit extrapolation to max 500ms to prevent runaway predictions
            const timeSinceUpdate = Date.now() - this.lastNetworkUpdateTime;
            const MAX_EXTRAPOLATION_TIME = 500; // 500ms max extrapolation
            
            if (timeSinceUpdate < MAX_EXTRAPOLATION_TIME) {
                // Extrapolate forward by deltaTime, but reduce confidence over time
                const confidenceFactor = 1.0 - (timeSinceUpdate / MAX_EXTRAPOLATION_TIME);
                const extrapolationTime = deltaTime * confidenceFactor; // Reduce extrapolation as time passes
                
                // Clone velocity before scaling to avoid mutation
                const extrapolatedPos = targetPos.add(this.estimatedVelocity.clone().scale(extrapolationTime));
                
                // Limit max extrapolation distance (prevent teleportation)
                const maxExtrapolationDistance = this.estimatedVelocity.length() * 0.5; // Max 0.5 seconds ahead
                const extrapolationDelta = extrapolatedPos.subtract(currentPos);
                const extrapolationDistance = extrapolationDelta.length();
                
                if (extrapolationDistance > maxExtrapolationDistance && maxExtrapolationDistance > 0.01) {
                    // Clamp to max distance
                    extrapolatedPos.copyFrom(currentPos.add(extrapolationDelta.normalize().scale(maxExtrapolationDistance)));
                }
                
                // Smoothly move towards extrapolated position (faster when confident)
                const lerpSpeed = 0.1 + 0.2 * confidenceFactor;
                Vector3.LerpToRef(
                    currentPos,
                    extrapolatedPos,
                    lerpSpeed,
                    currentPos
                );
            }
            // If beyond MAX_EXTRAPOLATION_TIME, don't move (freeze position until update arrives)
        } else if (this.interpolationAlpha < 1) {
            // ENHANCED: Hermite cubic interpolation for smoother movement
            // Uses position and velocity at both endpoints for natural-looking curves
            const t = this.smoothstep(0, 1, this.interpolationAlpha);
            
            // Get start and end positions
            const startPos = this.networkPlayer.lastPosition;
            const endPos = targetPos;
            
            // Calculate velocities for Hermite spline
            // Start velocity: use last known velocity direction
            const startVelocity = this.estimatedVelocity && this.estimatedVelocity.lengthSquared() > 0.01
                ? this.estimatedVelocity.clone().scale(0.5) // Scale down for smoother curves
                : new Vector3(0, 0, 0);
            
            // End velocity: estimate from recent history or use current velocity
            let endVelocity = new Vector3(0, 0, 0);
            if (this.positionHistory.length >= 2) {
                const lastIdx = this.positionHistory.length - 1;
                endVelocity = this.calculateVelocityAtIndex(lastIdx).scale(0.5);
            } else if (this.estimatedVelocity && this.estimatedVelocity.lengthSquared() > 0.01) {
                endVelocity = this.estimatedVelocity.clone().scale(0.5);
            }
            
            // Use Hermite interpolation for position
            const hermitePos = this.hermiteInterpolate(startPos, startVelocity, endPos, endVelocity, t);
            
            // Validate Hermite result and fallback to linear if invalid
            if (Number.isFinite(hermitePos.x) && Number.isFinite(hermitePos.y) && Number.isFinite(hermitePos.z)) {
                currentPos.copyFrom(hermitePos);
            } else {
                // Fallback to simple linear interpolation
                Vector3.LerpToRef(startPos, endPos, t, currentPos);
            }
        } else {
            // Интерполяция завершена - устанавливаем позицию напрямую
            currentPos.copyFrom(targetPos);
            
            // ДИАГНОСТИКА: Проверяем что позиция действительно обновилась
            const distance = Vector3.Distance(currentPos, targetPos);
            if (distance > 0.1) {
                console.warn(`[NetworkPlayerTank] ⚠️ Position mismatch for ${this.playerId}: current=(${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}), target=(${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)}), distance=${distance.toFixed(2)})`);
                // Принудительно устанавливаем позицию
                currentPos.set(targetPos.x, targetPos.y, targetPos.z);
            }
        }
        
        // Interpolate rotation with smoothstep
        let targetRotation = this.networkPlayer.rotation;
        let currentRotation = this.chassis.rotation.y;
        
        // Normalize angles
        while (targetRotation - currentRotation > Math.PI) targetRotation -= Math.PI * 2;
        while (targetRotation - currentRotation < -Math.PI) targetRotation += Math.PI * 2;
        
        if (this.interpolationAlpha < 1 && !extrapolate) {
            // Use smoothstep for smoother rotation
            const t = this.smoothstep(0, 1, this.interpolationAlpha);
            currentRotation = currentRotation + (targetRotation - currentRotation) * t;
        } else {
            currentRotation = targetRotation;
        }
        
        this.chassis.rotation.y = currentRotation;
        
        // Update turret rotation with smoothstep
        let targetTurretRotation = this.networkPlayer.turretRotation;
        let currentTurretRotation = this.turret.rotation.y;
        
        // Normalize angles
        while (targetTurretRotation - currentTurretRotation > Math.PI) targetTurretRotation -= Math.PI * 2;
        while (targetTurretRotation - currentTurretRotation < -Math.PI) targetTurretRotation += Math.PI * 2;
        
        if (this.interpolationAlpha < 1 && !extrapolate) {
            // Use smoothstep for smoother turret rotation
            const t = this.smoothstep(0, 1, this.interpolationAlpha);
            currentTurretRotation = currentTurretRotation + (targetTurretRotation - currentTurretRotation) * t;
        } else {
            currentTurretRotation = targetTurretRotation;
        }
        
        this.turret.rotation.y = currentTurretRotation;
        
        // Update barrel pitch (для Box поворачиваем по X для вертикального наклона)
        this.barrel.rotation.x = Math.PI / 2 - this.networkPlayer.aimPitch;
        
        // Update visibility based on status
        const isVisible = this.networkPlayer.status === "alive";
        
        // КРИТИЧНО: Если статус не "alive", но танк должен быть виден, логируем
        if (!isVisible) {
            const now = Date.now();
            if (!this._lastVisibilityWarning || now - this._lastVisibilityWarning > 1000) {
                console.warn(`[NetworkPlayerTank] ⚠️ Tank ${this.playerId} will be hidden: status=${this.networkPlayer.status}, position=(${this.chassis.position.x.toFixed(1)}, ${this.chassis.position.y.toFixed(1)}, ${this.chassis.position.z.toFixed(1)})`);
                this._lastVisibilityWarning = now;
            }
        }
        
        // КРИТИЧНО: Всегда устанавливаем видимость, даже если статус не "alive" (для отладки)
        // В продакшене можно вернуть проверку статуса
        const shouldBeVisible = isVisible || true; // ВРЕМЕННО: всегда видим для отладки
        
        this.chassis.setEnabled(shouldBeVisible);
        this.turret.setEnabled(shouldBeVisible);
        this.barrel.setEnabled(shouldBeVisible);
        
        // КРИТИЧНО: Также устанавливаем isVisible напрямую (setEnabled может не работать в некоторых случаях)
        this.chassis.isVisible = shouldBeVisible;
        this.turret.isVisible = shouldBeVisible;
        this.barrel.isVisible = shouldBeVisible;
        
        // КРИТИЧНО: Убеждаемся, что меши в сцене
        if (this.chassis && !this.scene.meshes.includes(this.chassis)) {
            console.warn(`[NetworkPlayerTank] ⚠️ Tank ${this.playerId} chassis not in scene! Adding...`);
            this.scene.addMesh(this.chassis);
        }
    }
    
    private _lastVisibilityWarning: number = 0;
    
    /**
     * Smoothstep function for smooth interpolation (cubic)
     */
    private smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t); // Cubic smoothstep
    }
    
    /**
     * Hermite interpolation for smooth curves using position and velocity at both endpoints
     * Creates a cubic spline that matches position AND velocity at both ends
     * 
     * @param p0 - Starting position
     * @param v0 - Starting velocity (scaled by time interval)
     * @param p1 - Ending position
     * @param v1 - Ending velocity (scaled by time interval)
     * @param t - Interpolation factor (0-1)
     * @returns Interpolated position
     */
    private hermiteInterpolate(p0: Vector3, v0: Vector3, p1: Vector3, v1: Vector3, t: number): Vector3 {
        // Hermite basis functions
        const t2 = t * t;
        const t3 = t2 * t;
        
        // H1 = 2t³ - 3t² + 1 (position at p0)
        const h1 = 2 * t3 - 3 * t2 + 1;
        // H2 = t³ - 2t² + t (tangent at p0)
        const h2 = t3 - 2 * t2 + t;
        // H3 = -2t³ + 3t² (position at p1)
        const h3 = -2 * t3 + 3 * t2;
        // H4 = t³ - t² (tangent at p1)
        const h4 = t3 - t2;
        
        // Position = p0*H1 + v0*H2 + p1*H3 + v1*H4
        return new Vector3(
            p0.x * h1 + v0.x * h2 + p1.x * h3 + v1.x * h4,
            p0.y * h1 + v0.y * h2 + p1.y * h3 + v1.y * h4,
            p0.z * h1 + v0.z * h2 + p1.z * h3 + v1.z * h4
        );
    }
    
    /**
     * Calculate velocity from position history for Hermite interpolation
     * Returns velocity scaled by the time interval for proper Hermite tangent
     */
    private calculateVelocityAtIndex(index: number): Vector3 {
        if (this.positionHistory.length < 2) {
            return new Vector3(0, 0, 0);
        }
        
        // Clamp index to valid range
        const clampedIndex = Math.max(1, Math.min(this.positionHistory.length - 1, index));
        
        const current = this.positionHistory[clampedIndex];
        const previous = this.positionHistory[clampedIndex - 1];
        
        if (!current || !previous) {
            return new Vector3(0, 0, 0);
        }
        
        const timeDelta = (current.time - previous.time) / 1000; // Convert to seconds
        if (timeDelta <= 0) {
            return new Vector3(0, 0, 0);
        }
        
        // Return velocity scaled appropriately
        return current.position.subtract(previous.position);
    }
    
    setNetworkPlayer(networkPlayer: NetworkPlayer): void {
        // Reset interpolation when player data changes
        this.interpolationAlpha = 0;
        this.lastNetworkUpdateTime = Date.now();
        this.networkPlayer = networkPlayer;
    }
    
    /**
     * Mark that a network update was received.
     * This resets interpolation and updates the timestamp so that
     * dead reckoning/extrapolation works correctly.
     */
    public markNetworkUpdate(): void {
        this.lastNetworkUpdateTime = Date.now();
        this.interpolationAlpha = 0; // Reset interpolation to start fresh
    }
    
    dispose(): void {
        this.barrel.dispose();
        this.turret.dispose();
        this.chassis.dispose();
    }
}

