import { Vector3 } from "@babylonjs/core";
import { nanoid } from "nanoid";

export interface EnemyData {
    id: string;
    position: Vector3;
    rotation: number;
    turretRotation: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
    targetId: string | null;
    state: "idle" | "patrol" | "chase" | "attack" | "retreat";
}

export class ServerEnemy {
    id: string;
    position: Vector3;
    rotation: number;
    turretRotation: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
    targetId: string | null;
    difficulty: "easy" | "medium" | "hard" = "medium";
    state: "idle" | "patrol" | "chase" | "attack" | "retreat";

    // Movement
    private throttleTarget: number = 0;
    private steerTarget: number = 0;
    private moveSpeed: number = 20;
    private turnSpeed: number = 2.2;

    // AI
    private lastDecisionTime: number = 0;
    private decisionInterval: number = 500; // ms
    private patrolPoints: Vector3[] = [];
    private currentPatrolIndex: number = 0;
    private lastShotTime: number = 0;
    private cooldown: number = 2500; // ms

    // Targeting
    private detectRange: number = 200;
    private attackRange: number = 60;

    // Equipment
    modules: string[] = [];

    // NOTE: Module Registry is Client-Side only. 
    // We hardcode some common module IDs here for random selection to avoid importing client code.
    private static AVAILABLE_MODULES = [
        "module_armor_composite",
        "module_engine_turbo",
        "module_sensor_laser",
        "module_utility_repair"
    ];

    constructor(position: Vector3, difficulty: "easy" | "medium" | "hard" = "medium") {
        this.id = nanoid();
        this.position = position;
        this.rotation = 0;
        this.turretRotation = 0;
        this.maxHealth = difficulty === "hard" ? 120 : difficulty === "medium" ? 100 : 80;
        this.health = this.maxHealth;
        this.isAlive = true;
        this.targetId = null;
        this.state = "patrol";

        // Randomly select modules (0 to 2)
        const moduleCount = Math.floor(Math.random() * 3); // 0, 1, or 2
        // Shuffle and pick
        const shuffled = [...ServerEnemy.AVAILABLE_MODULES].sort(() => 0.5 - Math.random());
        this.modules = shuffled.slice(0, moduleCount);

        // Apply difficulty
        if (difficulty === "easy") {
            this.moveSpeed = 15;
            this.cooldown = 3500;
        } else if (difficulty === "hard") {
            this.moveSpeed = 25;
            this.cooldown = 2000;
            // Hard enemies always have at least 1 module
            if (this.modules.length === 0) {
                this.modules.push(ServerEnemy.AVAILABLE_MODULES[Math.floor(Math.random() * ServerEnemy.AVAILABLE_MODULES.length)] || "module_engine_turbo");
            }
        }

        // Generate patrol points
        this.generatePatrolPoints();
    }

    private generatePatrolPoints(): void {
        // Simple patrol around spawn
        const radius = 30;
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            this.patrolPoints.push(new Vector3(
                this.position.x + Math.cos(angle) * radius,
                this.position.y,
                this.position.z + Math.sin(angle) * radius
            ));
        }
    }

    update(deltaTime: number, players: Array<{ id: string; position: Vector3; status: string }>): void {
        if (!this.isAlive) return;

        const currentTime = Date.now();

        // AI Decision making
        if (currentTime - this.lastDecisionTime > this.decisionInterval) {
            this.updateAI(players);
            this.lastDecisionTime = currentTime;
        }

        // Update movement
        this.updateMovement(deltaTime, players);

        // Update turret
        this.updateTurret(deltaTime, players);
    }

    private updateAI(players: Array<{ id: string; position: Vector3; status: string }>): void {
        // Find nearest alive player
        let nearestPlayer: { id: string; position: Vector3 } | null = null;
        let nearestDist = Infinity;

        // Also find all nearby players for group tactics
        const nearbyPlayers: Array<{ id: string; position: Vector3; distance: number }> = [];

        for (const player of players) {
            if (player.status !== "alive") continue;

            const dist = Vector3.Distance(this.position, player.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestPlayer = { id: player.id, position: player.position };
            }

            if (dist < this.detectRange) {
                nearbyPlayers.push({ id: player.id, position: player.position, distance: dist });
            }
        }

        // State machine with improved logic
        if (nearestPlayer && nearestDist < this.detectRange) {
            this.targetId = nearestPlayer.id;

            if (nearestDist < this.attackRange) {
                this.state = "attack";
            } else if (nearestDist < this.detectRange * 0.5) {
                this.state = "chase";
            } else {
                // Player detected but far - approach cautiously
                this.state = "chase";
            }
        } else {
            this.targetId = null;
            this.state = "patrol";
        }

        // Health-based retreat (improved)
        const healthPercent = this.health / this.maxHealth;
        if (healthPercent < 0.3) {
            this.state = "retreat";
            // When retreating, try to find cover or move away from all players
            if (nearbyPlayers.length > 0) {
                // Calculate average position of nearby players
                const avgPos = nearbyPlayers.reduce((sum, p) => {
                    return sum.add(p.position);
                }, new Vector3(0, 0, 0)).scale(1 / nearbyPlayers.length);

                // Move away from average position
                const retreatDir = this.position.subtract(avgPos);
                retreatDir.y = 0;
                if (retreatDir.length() > 0.1) {
                    retreatDir.normalize();
                    const targetAngle = Math.atan2(retreatDir.x, retreatDir.z);
                    let angleDiff = targetAngle - this.rotation;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    this.steerTarget = Math.max(-1, Math.min(1, angleDiff * 2));
                    this.throttleTarget = 0.8; // Move away
                }
            }
        }

        // Group tactics: if multiple enemies nearby, coordinate
        // (This would require access to other enemies, simplified for now)
    }

    private updateMovement(deltaTime: number, players?: Array<{ id: string; position: Vector3; status: string }>): void {
        if (this.state === "patrol") {
            this.updatePatrol(deltaTime);
        } else if (this.state === "chase") {
            this.updateChase(deltaTime, players);
        } else if (this.state === "attack") {
            // In attack range - circle around target
            this.updateAttackMovement(deltaTime, players);
        } else if (this.state === "retreat") {
            // Movement handled in updateAI
        }

        // Apply movement
        if (this.steerTarget !== 0) {
            this.rotation += this.steerTarget * this.turnSpeed * deltaTime;
            // Normalize
            while (this.rotation > Math.PI) this.rotation -= Math.PI * 2;
            while (this.rotation < -Math.PI) this.rotation += Math.PI * 2;
        }

        if (this.throttleTarget !== 0) {
            const moveDir = new Vector3(
                Math.sin(this.rotation) * this.throttleTarget,
                0,
                Math.cos(this.rotation) * this.throttleTarget
            );
            const moveDelta = moveDir.scale(this.moveSpeed * deltaTime);
            this.position = this.position.add(moveDelta);
        }
    }

    private updateChase(_deltaTime: number, players?: Array<{ id: string; position: Vector3; status: string }>): void {
        if (!this.targetId || !players) return;

        const target = players.find(p => p.id === this.targetId);
        if (!target || target.status !== "alive") {
            this.targetId = null;
            this.state = "patrol";
            return;
        }

        // Move towards target
        const direction = target.position.subtract(this.position);
        direction.y = 0;

        if (direction.length() < 0.1) return;

        direction.normalize();
        const targetAngle = Math.atan2(direction.x, direction.z);
        let angleDiff = targetAngle - this.rotation;

        // Normalize angle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        this.steerTarget = Math.max(-1, Math.min(1, angleDiff * 2));
        this.throttleTarget = Math.abs(angleDiff) < Math.PI / 3 ? 1 : 0.5; // Slow down when turning
    }

    private updateAttackMovement(_deltaTime: number, players?: Array<{ id: string; position: Vector3; status: string }>): void {
        if (!this.targetId || !players) return;

        const target = players.find(p => p.id === this.targetId);
        if (!target || target.status !== "alive") {
            this.targetId = null;
            this.state = "patrol";
            return;
        }

        const distance = Vector3.Distance(this.position, target.position);

        // Circle around target while maintaining attack range
        const toTarget = target.position.subtract(this.position);
        toTarget.y = 0;
        toTarget.normalize();

        // Perpendicular direction for circling
        const circleDir = new Vector3(-toTarget.z, 0, toTarget.x);

        // Combine forward and circle movement
        const moveDir = toTarget.scale(0.3).add(circleDir.scale(0.7));
        moveDir.normalize();

        const targetAngle = Math.atan2(moveDir.x, moveDir.z);
        let angleDiff = targetAngle - this.rotation;

        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        this.steerTarget = Math.max(-1, Math.min(1, angleDiff * 2));

        // Adjust speed based on distance
        if (distance > this.attackRange * 1.2) {
            this.throttleTarget = 1; // Too far, move closer
        } else if (distance < this.attackRange * 0.8) {
            this.throttleTarget = -0.5; // Too close, back up
        } else {
            this.throttleTarget = 0.5; // Good distance, circle
        }
    }

    private updatePatrol(_deltaTime: number): void {
        if (this.patrolPoints.length === 0) return;

        const targetPoint = this.patrolPoints[this.currentPatrolIndex];
        if (!targetPoint) return;
        const direction = targetPoint.subtract(this.position);
        direction.y = 0;

        if (direction.length() < 5) {
            // Reached patrol point, move to next
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
            return;
        }

        direction.normalize();
        const targetAngle = Math.atan2(direction.x, direction.z);
        let angleDiff = targetAngle - this.rotation;

        // Normalize angle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        this.steerTarget = Math.max(-1, Math.min(1, angleDiff * 2));
        this.throttleTarget = Math.abs(angleDiff) < Math.PI / 2 ? 1 : 0.3;
    }

    private updateTurret(_deltaTime: number, players: Array<{ id: string; position: Vector3; status: string }>): void {
        if (!this.targetId) {
            // Center turret
            let angleDiff = -this.turretRotation;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            this.turretRotation += angleDiff * 0.1;
            return;
        }

        // Aim at target
        const target = players.find(p => p.id === this.targetId);
        if (!target || target.status !== "alive") {
            this.targetId = null;
            return;
        }

        const direction = target.position.subtract(this.position);
        direction.y = 0;
        direction.normalize();

        const targetAngle = Math.atan2(direction.x, direction.z);
        let angleDiff = targetAngle - this.turretRotation;

        // Normalize
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Smooth rotation
        this.turretRotation += angleDiff * 0.15;
    }

    canShoot(): boolean {
        if (!this.isAlive || !this.targetId) return false;
        const currentTime = Date.now();
        return (currentTime - this.lastShotTime) >= this.cooldown;
    }

    shoot(): void {
        if (!this.canShoot()) return;
        this.lastShotTime = Date.now();
    }

    takeDamage(damage: number): boolean {
        if (!this.isAlive) return false;

        this.health = Math.max(0, this.health - damage);

        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            return true; // Died
        }

        return false; // Still alive
    }

    toEnemyData(): EnemyData {
        return {
            id: this.id,
            position: this.position,
            rotation: this.rotation,
            turretRotation: this.turretRotation,
            health: this.health,
            maxHealth: this.maxHealth,
            isAlive: this.isAlive,
            targetId: this.targetId,
            state: this.state
        };
    }
}
