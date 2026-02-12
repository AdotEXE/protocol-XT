/**
 * @module client/enemyPlane
 * @description AI-управляемый вражеский самолёт с продвинутой тактикой
 * 
 * Реализует:
 * - Состояния AI: патруль, атака, уклонение, набор высоты
 * - Тактики: Boom-and-Zoom (пикирование), штурмовка, кружение
 * - Манёвры уклонения: бочка, Split-S
 * - Автоматическое управление газом и высотой
 */

import { Scene, Vector3, Mesh, PhysicsBody, PhysicsMotionType, MeshBuilder, StandardMaterial, Color3, Quaternion } from "@babylonjs/core";
import { EnemyTank } from "./enemyTank";
import { AircraftPhysics } from "./tank/aircraftPhysics";
import { getAircraftPhysicsConfig } from "./config/aircraftPhysicsConfig";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import { logger } from "./utils/logger";
import { CHASSIS_TYPES, CANNON_TYPES, getCannonById } from "./tankTypes";
import { MaterialFactory } from "./garage/materials";
import { ChassisDetailsGenerator } from "./garage/chassisDetails";

/**
 * Состояния AI самолёта
 */
enum PlaneAIState {
    PATROL = "patrol",           // Патрулирование (круговой полёт)
    APPROACH = "approach",       // Сближение с целью
    ATTACK_RUN = "attack_run",   // Боевой заход (пикирование/атака)
    EVASION = "evasion",         // Уклонение от огня
    CLIMB = "climb",             // Набор высоты после атаки
    PURSUIT = "pursuit"          // Преследование цели
}

/**
 * Типы атакующих манёвров
 */
enum AttackType {
    BOOM_AND_ZOOM = "boom_zoom",   // Пикирование с отрывом
    STRAFING = "strafing",         // Горизонтальная штурмовка
    CIRCLING = "circling"          // Кружение вокруг цели
}

/**
 * Типы манёвров уклонения
 */
enum EvasionManeuver {
    BARREL_ROLL = "barrel_roll",   // Бочка
    SPLIT_S = "split_s",           // Пикирование с разворотом
    JINKING = "jinking",           // Хаотичные изменения
    CHANDELLE = "chandelle"        // Крутой подъём с разворотом
}

export class EnemyPlane extends EnemyTank {
    public aircraftPhysics: AircraftPhysics | null = null;
    private targetVector: Vector3 = Vector3.Zero();

    // === AI State Machine ===
    private aiState: PlaneAIState = PlaneAIState.PATROL;
    private stateStartTime: number = 0;
    private lastStateChange: number = 0;

    // === Attack System ===
    private currentAttackType: AttackType = AttackType.BOOM_AND_ZOOM;
    private attackStartPos: Vector3 = Vector3.Zero();
    private attackPhase: number = 0; // 0=approach, 1=dive, 2=fire, 3=pullup
    private lastAttackTime: number = 0;
    private attackCooldown: number = 5000; // 5 сек между заходами

    // === Evasion System ===
    private currentEvasion: EvasionManeuver | null = null;
    private evasionStartTime: number = 0;
    private evasionDuration: number = 2000; // 2 сек на манёвр
    // [Opus 4.6] lastDamageTime inherited from EnemyTank (protected)
    private damageThreshold: number = 0.1; // 10% урона для триггера уклонения

    // === Altitude Control ===
    private readonly MIN_ALTITUDE: number = 50;    // Минимальная высота над землёй
    private readonly CRUISE_ALTITUDE: number = 80; // Крейсерская высота
    private readonly ATTACK_ALTITUDE: number = 120; // Высота для начала атаки
    private readonly MAX_ALTITUDE: number = 200;   // Максимальная высота

    // === Throttle Control ===
    private targetThrottle: number = 0.8;          // Целевой газ (80%)
    private readonly MIN_THROTTLE: number = 0.5;   // Минимальный газ
    private readonly MAX_THROTTLE: number = 1.0;   // Максимальный газ
    private readonly ATTACK_THROTTLE: number = 1.0; // Газ при атаке

    // === Patrol ===
    private patrolCenter: Vector3 = Vector3.Zero();
    private patrolRadius: number = 150;
    private patrolAngle: number = 0;
    private patrolDirection: number = 1; // 1 = по часовой, -1 = против

    // === Combat Stats ===
    private previousHealth: number = 100;
    private shotsFiredThisRun: number = 0;
    private readonly MAX_SHOTS_PER_RUN: number = 5;

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
        (this as any).type = "plane";

        // Инициализация патруля вокруг точки спавна
        this.patrolCenter = position.clone();
        this.patrolAngle = Math.random() * Math.PI * 2;
        this.patrolDirection = Math.random() > 0.5 ? 1 : -1;

        // Случайный тип атаки в зависимости от сложности
        if (difficulty === "nightmare" || difficulty === "hard") {
            this.currentAttackType = Math.random() > 0.5 ? AttackType.BOOM_AND_ZOOM : AttackType.STRAFING;
        } else {
            this.currentAttackType = AttackType.CIRCLING;
        }

        this.stateStartTime = Date.now();
        this.previousHealth = this.currentHealth / Math.max(this.maxHealth, 1);

        logger.log(`[EnemyPlane] Created with difficulty=${difficulty}, attackType=${this.currentAttackType}`);
    }

    // Override to select plane chassis
    protected selectRandomModules(): any[] {
        this.chassisType = CHASSIS_TYPES.find(c => c.id === "plane") || CHASSIS_TYPES[0]!;
        this.cannonType = getCannonById("aircraft_mg") || CANNON_TYPES[0];
        this.trackType = { id: "none", name: "None" } as any;
        return [];
    }

    // Override to setup AircraftPhysics
    protected setupPhysics(): void {
        if (!this.chassis) return;

        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, this.scene);
        this.physicsBody.setMassProperties({ mass: 1000 });

        const config = getAircraftPhysicsConfig("fighter");

        const mockController = { _inputMap: {} };

        this.aircraftPhysics = new AircraftPhysics(
            this.chassis,
            this.physicsBody,
            this.scene,
            this.scene.activeCamera!,
            mockController,
            config
        );

        // ИСПРАВЛЕНО: Устанавливаем начальный газ и начальную скорость вперёд
        // Это предотвращает падение самолёта на землю сразу после спавна
        this.setThrottle(0.7);
        
        // Устанавливаем начальную скорость вперёд (чтобы самолёт сразу начал лететь)
        // Направление вперёд по оси Z (локальная система координат самолёта)
        const forward = this.chassis.forward || new Vector3(0, 0, 1);
        const initialSpeed = 30; // Начальная скорость для предотвращения падения
        this.physicsBody.setLinearVelocity(forward.scale(initialSpeed));
    }

    // === VISUAL OVERRIDES ===

    protected createChassis(position: Vector3): Mesh {
        // ИСПРАВЛЕНО: Используем детализированную модель Warhawk как у игрока
        // Создаём базовый контейнер (невидимый) и добавляем детали из JSON
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        // Базовый контейнер (невидимый, используется только для физики и как родитель деталей)
        const chassis = MeshBuilder.CreateBox(`enemyPlane_${this.id}`, {
            width: w,
            height: h,
            depth: d
        }, this.scene);
        chassis.position.copyFrom(position);
        chassis.rotationQuaternion = Quaternion.Identity();

        // Базовый материал (невидимый, так как показываем только детали)
        const baseColor = Color3.FromHexString(this.chassisType.color);
        const mat = MaterialFactory.createEnemyPlaneMaterial(this.scene);
        chassis.material = mat;
        chassis.isVisible = false; // Скрываем базовый контейнер, показываем только детали

        // Добавляем детализированную модель Warhawk из JSON данных
        ChassisDetailsGenerator.addPlaneDetails(
            this.scene,
            chassis,
            w, h, d,
            baseColor,
            `enemyPlane_${this.id}` // префикс для материалов
        );

        chassis.metadata = { type: "enemyPlane", instance: this };

        return chassis;
    }

    protected createTracks(): void {
        // No tracks for planes
    }

    // ИСПРАВЛЕНО: Переопределяем создание башни - для самолёта не нужна отдельная башня
    // Стрельба происходит из носа самолёта (ствол интегрирован в модель)
    protected createTurret(): Mesh | null {
        // Для самолёта не создаём отдельную башню - стрельба из носа
        // Создаём минимальный невидимый меш для совместимости с кодом EnemyTank
        const turret = MeshBuilder.CreateBox(`enemyPlaneTurret_${this.id}`, {
            width: 0.01,
            height: 0.01,
            depth: 0.01
        }, this.scene);
        turret.parent = this.chassis;
        // Башня в центре корпуса (для совместимости с кодом стрельбы)
        turret.position = Vector3.Zero();
        turret.isVisible = false; // Невидимая башня для совместимости
        turret.metadata = { type: "enemyPlane", instance: this };
        return turret;
    }

    // ИСПРАВЛЕНО: Переопределяем создание ствола - для самолёта ствол интегрирован в модель
    protected createBarrel(): Mesh | null {
        // Для самолёта не создаём отдельный ствол - он уже есть в модели Warhawk
        // Создаём минимальный невидимый меш для совместимости с кодом EnemyTank
        // ВАЖНО: Позиционируем ствол в носу самолёта (вперёд по оси Z)
        const barrel = MeshBuilder.CreateBox(`enemyPlaneBarrel_${this.id}`, {
            width: 0.01,
            height: 0.01,
            depth: 0.01
        }, this.scene);
        if (this.turret) {
            barrel.parent = this.turret;
        } else {
            barrel.parent = this.chassis;
        }
        // ИСПРАВЛЕНО: Позиционируем ствол в носу самолёта (вперёд по локальной оси Z)
        // Для самолёта нос находится в положительном направлении Z
        const d = this.chassisType.depth;
        barrel.position = new Vector3(0, 0, d * 0.5); // В носу корпуса
        barrel.isVisible = false; // Невидимый ствол для совместимости
        barrel.metadata = { type: "enemyPlane", instance: this };
        return barrel;
    }

    // === THROTTLE CONTROL ===

    private setThrottle(value: number): void {
        if (!this.aircraftPhysics) return;

        const physics = this.aircraftPhysics as any;
        if (physics.aerodynamicsSystem?.setThrottle) {
            physics.aerodynamicsSystem.setThrottle(Math.max(0, Math.min(1, value)));
        }
    }

    private getThrottle(): number {
        if (!this.aircraftPhysics) return 0;

        const physics = this.aircraftPhysics as any;
        return physics.aerodynamicsSystem?.getThrottle?.() ?? 0;
    }

    // === ALTITUDE HELPERS ===

    private getGroundHeight(): number {
        if (!this.chassis) return 0;
        const game = (window as any).gameInstance;
        if (game?.getGroundHeight) {
            return game.getGroundHeight(this.chassis.position.x, this.chassis.position.z);
        }
        return 0;
    }

    private getCurrentAltitude(): number {
        if (!this.chassis) return 0;
        return this.chassis.position.y - this.getGroundHeight();
    }

    // === STATE MACHINE ===

    private changeState(newState: PlaneAIState): void {
        if (this.aiState === newState) return;

        logger.debug(`[EnemyPlane] State: ${this.aiState} -> ${newState}`);

        this.aiState = newState;
        this.stateStartTime = Date.now();
        this.lastStateChange = Date.now();

        // Reset state-specific variables
        switch (newState) {
            case PlaneAIState.ATTACK_RUN:
                this.attackPhase = 0;
                this.attackStartPos = this.chassis?.position.clone() ?? Vector3.Zero();
                this.shotsFiredThisRun = 0;
                break;
            case PlaneAIState.EVASION:
                this.currentEvasion = this.pickRandomEvasion();
                this.evasionStartTime = Date.now();
                break;
            case PlaneAIState.CLIMB:
                this.setThrottle(this.MAX_THROTTLE);
                break;
        }
    }

    private pickRandomEvasion(): EvasionManeuver {
        const maneuvers = [
            EvasionManeuver.BARREL_ROLL,
            EvasionManeuver.SPLIT_S,
            EvasionManeuver.JINKING,
            EvasionManeuver.CHANDELLE
        ];
        return maneuvers[Math.floor(Math.random() * maneuvers.length)]!;
    }

    private getStateDuration(): number {
        return Date.now() - this.stateStartTime;
    }

    // === MAIN UPDATE ===

    public update(): void {
        if (!this.isAlive || !this.aircraftPhysics || !this.chassis) return;

        const now = Date.now();
        const dt = this.scene.getEngine().getDeltaTime() / 1000;

        // Check for damage -> trigger evasion
        this.checkDamageAndEvade();

        // Update throttle towards target
        this.updateThrottle(dt);

        // Calculate target position based on AI state
        let targetPos = this.calculateTargetPosition(now, dt);

        // Safety: Ground avoidance (always)
        targetPos = this.applyGroundAvoidance(targetPos);

        // Safety: Altitude limits
        targetPos = this.applyAltitudeLimits(targetPos);

        // Set target for physics
        this.aircraftPhysics.setTargetOverride(targetPos);

        // Update physics
        this.aircraftPhysics.update(dt);

        // Handle shooting
        this.updateShooting();

        // Update state machine
        this.updateStateMachine(now);
    }

    private checkDamageAndEvade(): void {
        const currentHealth = this.currentHealth / Math.max(this.maxHealth, 1);
        const healthLost = (this.previousHealth - currentHealth);

        if (healthLost > this.damageThreshold) {
            // Significant damage taken - evade!
            this.lastDamageTime = Date.now();
            if (this.aiState !== PlaneAIState.EVASION) {
                this.changeState(PlaneAIState.EVASION);
            }
        }

        // Phase 7.2: При низком HP (< 30%) — уклоняемся от противника
        if (currentHealth < 0.3 && this.aiState !== PlaneAIState.EVASION && this.aiState !== PlaneAIState.CLIMB) {
            // С вероятностью 10% за кадр пытаемся уклониться
            if (Math.random() < 0.1) {
                this.changeState(PlaneAIState.EVASION);
            }
        }

        this.previousHealth = currentHealth;
    }

    private updateThrottle(dt: number): void {
        const currentThrottle = this.getThrottle();
        const diff = this.targetThrottle - currentThrottle;

        if (Math.abs(diff) > 0.01) {
            const step = 0.5 * dt; // Плавное изменение
            const newThrottle = currentThrottle + Math.sign(diff) * Math.min(Math.abs(diff), step);
            this.setThrottle(newThrottle);
        }
    }

    private calculateTargetPosition(now: number, dt: number): Vector3 {
        switch (this.aiState) {
            case PlaneAIState.PATROL:
                return this.calculatePatrolTarget(dt);

            case PlaneAIState.APPROACH:
                return this.calculateApproachTarget();

            case PlaneAIState.ATTACK_RUN:
                return this.calculateAttackTarget(dt);

            case PlaneAIState.EVASION:
                return this.calculateEvasionTarget(dt);

            case PlaneAIState.CLIMB:
                return this.calculateClimbTarget();

            case PlaneAIState.PURSUIT:
                return this.calculatePursuitTarget();

            default:
                return this.calculatePatrolTarget(dt);
        }
    }

    // === PATROL STATE ===

    private calculatePatrolTarget(dt: number): Vector3 {
        if (!this.chassis) return Vector3.Zero();

        // Круговой полёт вокруг центра патруля
        this.patrolAngle += this.patrolDirection * 0.3 * dt;

        const groundHeight = this.getGroundHeight();
        const targetX = this.patrolCenter.x + Math.cos(this.patrolAngle) * this.patrolRadius;
        const targetZ = this.patrolCenter.z + Math.sin(this.patrolAngle) * this.patrolRadius;
        const targetY = groundHeight + this.CRUISE_ALTITUDE;

        // Phase 7.1: Держим газ достаточно высоким для генерации подъёмной силы
        this.targetThrottle = 0.7;

        // Если теряем высоту — добавляем газу
        const currentAlt = this.getCurrentAltitude();
        if (currentAlt < this.CRUISE_ALTITUDE * 0.8) {
            this.targetThrottle = 0.9;
        }

        return new Vector3(targetX, targetY, targetZ);
    }

    // === APPROACH STATE ===

    private calculateApproachTarget(): Vector3 {
        if (!this.chassis || !this.target?.chassis) {
            return this.calculatePatrolTarget(0);
        }

        const targetPos = this.target.chassis.absolutePosition.clone();
        const myPos = this.chassis.position;
        const groundHeight = this.getGroundHeight();

        // Подходим на высоте атаки
        const approachPos = targetPos.clone();
        approachPos.y = Math.max(groundHeight + this.ATTACK_ALTITUDE, targetPos.y + 50);

        this.targetThrottle = 0.9;

        return approachPos;
    }

    // === ATTACK RUN STATE ===

    private calculateAttackTarget(dt: number): Vector3 {
        if (!this.chassis || !this.target?.chassis) {
            this.changeState(PlaneAIState.PATROL);
            return this.calculatePatrolTarget(dt);
        }

        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.position;
        const distToTarget = Vector3.Distance(myPos, targetPos);

        switch (this.currentAttackType) {
            case AttackType.BOOM_AND_ZOOM:
                return this.calculateBoomAndZoomTarget(targetPos, myPos, distToTarget);

            case AttackType.STRAFING:
                return this.calculateStrafingTarget(targetPos, myPos, distToTarget);

            case AttackType.CIRCLING:
                return this.calculateCirclingTarget(targetPos, myPos);

            default:
                return targetPos;
        }
    }

    private calculateBoomAndZoomTarget(targetPos: Vector3, myPos: Vector3, distance: number): Vector3 {
        const groundHeight = this.getGroundHeight();

        switch (this.attackPhase) {
            case 0: // Набор высоты над целью
                if (myPos.y > targetPos.y + 80) {
                    this.attackPhase = 1;
                }
                this.targetThrottle = this.MAX_THROTTLE;
                return new Vector3(targetPos.x, groundHeight + this.ATTACK_ALTITUDE + 50, targetPos.z);

            case 1: // Пикирование
                if (distance < 100 || myPos.y < targetPos.y + 20) {
                    this.attackPhase = 2;
                }
                this.targetThrottle = this.ATTACK_THROTTLE;
                return targetPos.clone();

            case 2: // Стрельба и выход
                if (distance < 50 || myPos.y < groundHeight + this.MIN_ALTITUDE) {
                    this.attackPhase = 3;
                    this.lastAttackTime = Date.now();
                    this.changeState(PlaneAIState.CLIMB);
                }
                this.targetThrottle = this.MAX_THROTTLE;
                return targetPos.clone();

            default:
                this.changeState(PlaneAIState.CLIMB);
                return myPos.add(Vector3.Up().scale(100));
        }
    }

    private calculateStrafingTarget(targetPos: Vector3, myPos: Vector3, distance: number): Vector3 {
        const groundHeight = this.getGroundHeight();
        const lowAltitude = groundHeight + 30; // Низко над землёй

        if (distance < 50) {
            // Прошли мимо - уходим на набор высоты
            this.lastAttackTime = Date.now();
            this.changeState(PlaneAIState.CLIMB);
            return myPos.add(this.chassis!.forward.scale(100)).add(Vector3.Up().scale(50));
        }

        this.targetThrottle = this.ATTACK_THROTTLE;

        // Летим низко на цель
        const strafingTarget = targetPos.clone();
        strafingTarget.y = lowAltitude;
        return strafingTarget;
    }

    private calculateCirclingTarget(targetPos: Vector3, myPos: Vector3): Vector3 {
        // Кружим вокруг цели на средней дистанции
        const toTarget = targetPos.subtract(myPos);
        const angle = Math.atan2(toTarget.z, toTarget.x);
        const circleAngle = angle + Math.PI / 2 * this.patrolDirection;

        const circleRadius = 80;
        const groundHeight = this.getGroundHeight();

        const circlePos = new Vector3(
            targetPos.x + Math.cos(circleAngle) * circleRadius,
            groundHeight + this.CRUISE_ALTITUDE,
            targetPos.z + Math.sin(circleAngle) * circleRadius
        );

        this.targetThrottle = 0.8;
        return circlePos;
    }

    // === EVASION STATE ===

    private calculateEvasionTarget(dt: number): Vector3 {
        if (!this.chassis) return Vector3.Zero();

        const elapsed = Date.now() - this.evasionStartTime;

        if (elapsed > this.evasionDuration) {
            // Манёвр завершён
            this.changeState(PlaneAIState.CLIMB);
            return this.chassis.position.add(Vector3.Up().scale(100));
        }

        const progress = elapsed / Math.max(this.evasionDuration, 1);
        const forward = this.chassis.forward;
        const right = this.chassis.right;
        const up = Vector3.Up();

        this.targetThrottle = this.MAX_THROTTLE;

        switch (this.currentEvasion) {
            case EvasionManeuver.BARREL_ROLL:
                // Бочка: вращение + боковое смещение
                const rollOffset = Math.sin(progress * Math.PI * 2) * 30;
                return this.chassis.position
                    .add(forward.scale(50))
                    .add(right.scale(rollOffset))
                    .add(up.scale(20));

            case EvasionManeuver.SPLIT_S:
                // Split-S: резкое пикирование с разворотом
                const diveAmount = progress * 50;
                return this.chassis.position
                    .add(forward.scale(-30))
                    .subtract(up.scale(diveAmount));

            case EvasionManeuver.CHANDELLE:
                // Chandelle: крутой подъём с разворотом
                const climbAmount = progress * 80;
                const turnAmount = Math.sin(progress * Math.PI) * 50;
                return this.chassis.position
                    .add(forward.scale(30))
                    .add(up.scale(climbAmount))
                    .add(right.scale(turnAmount * this.patrolDirection));

            case EvasionManeuver.JINKING:
            default:
                // Jinking: хаотичные изменения
                const jinkX = Math.sin(progress * Math.PI * 4) * 40;
                const jinkY = Math.cos(progress * Math.PI * 3) * 20;
                return this.chassis.position
                    .add(forward.scale(40))
                    .add(right.scale(jinkX))
                    .add(up.scale(jinkY + 10));
        }
    }

    // === CLIMB STATE ===

    private calculateClimbTarget(): Vector3 {
        if (!this.chassis) return Vector3.Zero();

        const groundHeight = this.getGroundHeight();
        const currentAlt = this.getCurrentAltitude();

        // Набираем высоту пока не достигнем крейсерской
        if (currentAlt > this.CRUISE_ALTITUDE) {
            // Достигли высоты - можно атаковать снова
            if (this.target?.isAlive && Date.now() - this.lastAttackTime > this.attackCooldown) {
                this.changeState(PlaneAIState.APPROACH);
            } else {
                this.changeState(PlaneAIState.PATROL);
            }
        }

        this.targetThrottle = this.MAX_THROTTLE;

        // Летим вперёд и вверх
        return this.chassis.position
            .add(this.chassis.forward.scale(100))
            .add(Vector3.Up().scale(80));
    }

    // === PURSUIT STATE ===

    private calculatePursuitTarget(): Vector3 {
        if (!this.target?.chassis || !this.chassis) {
            this.changeState(PlaneAIState.PATROL);
            return this.calculatePatrolTarget(0);
        }

        const targetPos = this.target.chassis.absolutePosition;
        const distance = Vector3.Distance(this.chassis.position, targetPos);

        // Если близко - атакуем
        if (distance < 200) {
            this.changeState(PlaneAIState.ATTACK_RUN);
        }

        this.targetThrottle = this.MAX_THROTTLE;

        // Лететь прямо на цель
        return targetPos.clone();
    }

    // === SAFETY SYSTEMS ===

    private applyGroundAvoidance(targetPos: Vector3): Vector3 {
        if (!this.chassis) return targetPos;

        const groundHeight = this.getGroundHeight();
        const currentAlt = this.getCurrentAltitude();

        // Phase 7.2: Аварийное уклонение от земли (улучшено)
        if (currentAlt < this.MIN_ALTITUDE * 0.3) {
            // КРИТИЧЕСКИ НИЗКО — максимальная паника!
            this.targetThrottle = this.MAX_THROTTLE;
            // Тянем резко вверх и вперёд (чтобы не потерять скорость)
            const forward = this.chassis.forward || new Vector3(0, 0, 1);
            return this.chassis.position.add(Vector3.Up().scale(250)).add(forward.scale(50));
        }

        if (currentAlt < this.MIN_ALTITUDE * 0.5) {
            // Очень низко — паника
            this.targetThrottle = this.MAX_THROTTLE;
            return this.chassis.position.add(Vector3.Up().scale(200));
        }

        if (currentAlt < this.MIN_ALTITUDE) {
            // Низковато — подтягиваем цель вверх
            this.targetThrottle = Math.max(this.targetThrottle, 0.8);
            const correctedTarget = targetPos.clone();
            correctedTarget.y = Math.max(targetPos.y, groundHeight + this.MIN_ALTITUDE + 30);
            return correctedTarget;
        }

        return targetPos;
    }

    private applyAltitudeLimits(targetPos: Vector3): Vector3 {
        const groundHeight = this.getGroundHeight();

        // Ограничение максимальной высоты
        if (targetPos.y > groundHeight + this.MAX_ALTITUDE) {
            targetPos.y = groundHeight + this.MAX_ALTITUDE;
        }

        return targetPos;
    }

    // === SHOOTING ===

    // ИСПРАВЛЕНО: Переопределяем проверку наведения для самолёта
    // Для самолёта проверяем направление корпуса, а не башни (башня невидима и всегда вперёд)
    private isAimedAtTarget(): boolean {
        if (!this.target?.chassis || !this.chassis) return false;

        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const toTarget = targetPos.subtract(myPos).normalize();
        const forward = this.chassis.forward;

        const dot = Vector3.Dot(forward, toTarget);
        // Для самолёта используем более мягкий допуск (0.92 = ~23°)
        // так как самолёт движется быстро и сложнее точно навестись
        return dot > 0.92;
    }

    private updateShooting(): void {
        if (!this.target?.isAlive || !this.target.chassis || !this.chassis) return;

        // Не стрелять во время уклонения или набора высоты
        if (this.aiState === PlaneAIState.EVASION || this.aiState === PlaneAIState.CLIMB) return;

        // Лимит выстрелов за заход
        if (this.shotsFiredThisRun >= this.MAX_SHOTS_PER_RUN) return;

        const vectorToTarget = this.target.chassis.absolutePosition.subtract(this.chassis.absolutePosition);
        const dist = vectorToTarget.length();

        vectorToTarget.normalize();
        const forward = this.chassis.forward;
        const dot = Vector3.Dot(forward, vectorToTarget);

        // Стреляем если:
        // - Смотрим на цель (dot > 0.92, ~23°)
        // - В зоне поражения (< 350м)
        // - В состоянии атаки или преследования
        const canFire = (this.aiState === PlaneAIState.ATTACK_RUN ||
            this.aiState === PlaneAIState.PURSUIT ||
            this.aiState === PlaneAIState.APPROACH);

        if (dot > 0.92 && dist < 350 && canFire) {
            try {
                // Выравниваем турель вперёд
                if (this.turret) {
                    this.turret.rotationQuaternion = Quaternion.Identity();
                }

                (this as any).fire();
                this.shotsFiredThisRun++;
            } catch (e) {
                // Ignore
            }
        }
    }

    // === STATE MACHINE UPDATE ===

    private updateStateMachine(now: number): void {
        const stateDuration = this.getStateDuration();

        switch (this.aiState) {
            case PlaneAIState.PATROL:
                // Ищем цель
                if (this.target?.isAlive && this.target.chassis) {
                    const dist = Vector3.Distance(
                        this.chassis!.position,
                        this.target.chassis.absolutePosition
                    );

                    if (dist < 400) {
                        // Цель в зоне - атакуем!
                        this.changeState(PlaneAIState.APPROACH);
                    }
                }

                // Обновляем центр патруля если цель есть
                if (this.target?.chassis) {
                    this.patrolCenter = this.target.chassis.absolutePosition.clone();
                }
                break;

            case PlaneAIState.APPROACH:
                if (this.target?.isAlive && this.target.chassis) {
                    const dist = Vector3.Distance(
                        this.chassis!.position,
                        this.target.chassis.absolutePosition
                    );

                    // Достаточно близко и выше - начинаем атаку
                    if (dist < 250 && this.getCurrentAltitude() > this.target.chassis.position.y + 30) {
                        this.changeState(PlaneAIState.ATTACK_RUN);
                    }
                } else {
                    this.changeState(PlaneAIState.PATROL);
                }

                // Таймаут подхода
                if (stateDuration > 15000) {
                    this.changeState(PlaneAIState.ATTACK_RUN);
                }
                break;

            case PlaneAIState.ATTACK_RUN:
                // Атака управляется в calculateAttackTarget
                // Таймаут атаки
                if (stateDuration > 10000) {
                    this.changeState(PlaneAIState.CLIMB);
                }
                break;

            case PlaneAIState.EVASION:
                // Управляется в calculateEvasionTarget
                break;

            case PlaneAIState.CLIMB:
                // Управляется в calculateClimbTarget
                // Таймаут набора высоты
                if (stateDuration > 8000) {
                    this.changeState(PlaneAIState.PATROL);
                }
                break;

            case PlaneAIState.PURSUIT:
                // Таймаут преследования
                if (stateDuration > 20000) {
                    this.changeState(PlaneAIState.PATROL);
                }
                break;
        }
    }
}
