// Типы и интерфейсы для системы танка
import { Scene, Vector3, Mesh, PhysicsBody } from "@babylonjs/core";
import { HUD } from "../hud";
import { SoundManager } from "../soundManager";
import { EffectsManager } from "../effects";
import type { EnemyManager } from "../enemy";
import type { ChassisType, CannonType } from "../tankTypes";

// Типы для анимационных элементов
export interface ChassisAnimationElements {
    stealthActive?: boolean;
    stealthMesh?: Mesh;
    hoverThrusters?: Mesh[];
    shieldMesh?: Mesh;
    shieldActive?: boolean;
    droneMeshes?: Mesh[];
    commandAura?: Mesh;
    animationTime?: number;
}

export interface ITankController {
    scene: Scene;
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    physicsBody: PhysicsBody;
    chassisType: ChassisType;
    cannonType: CannonType;

    // Системы
    hud: HUD | null;
    soundManager: SoundManager | null;
    effectsManager: EffectsManager | null;
    enemyManager: EnemyManager | null;
    enemyTanks: any[];
    networkPlayers: Map<string, any> | null;

    // Callbacks
    chatSystem: any;
    experienceSystem: any;
    playerProgression: any;
    achievementsSystem: any;
    cameraShakeCallback?: ((intensity: number) => void) | null;
    respawnPositionCallback?: (() => Vector3 | null) | null;
    onRespawnRequest?: (() => void) | null;

    // Состояние
    isAlive: boolean;
    currentHealth: number;
    maxHealth: number;
    currentFuel: number;
    maxFuel: number;
    isFuelEmpty: boolean;
    fuelConsumptionRate: number;

    // Tank bonuses (for tankHealth.ts)
    evasion: number;
    fuelEfficiencyBonus: number;
    repairRate: number;

    // Движение
    throttleTarget: number;
    steerTarget: number;
    smoothThrottle: number;
    smoothSteer: number;
    turretTurnTarget: number;
    turretTurnSmooth: number;
    barrelPitchTarget: number;
    aimPitch: number;

    // Стрельба
    lastShotTime: number;
    cooldown: number;
    isReloading: boolean;
    damage: number;
    projectileSpeed: number;
    projectileSize: number;

    // Гильзы (для доступа из модулей)
    shellCasings: ShellCasing[];

    // Визуальные элементы
    visualWheels: Mesh[];
    leftTrack: Mesh | null;
    rightTrack: Mesh | null;

    // Анимационные элементы (для доступа из модулей)
    chassisAnimationElements: ChassisAnimationElements;

    // Методы, которые могут быть вызваны из модулей
    respawn?(): void;
    applyUpgrades?(): void;
}

export interface ITankMovement {
    update(deltaTime: number): void;
    setupInput(): void;
}

export interface ITankShooting {
    fire(): void;
    fireTracer(): void;
    setupProjectileHitDetection(ball: Mesh, body: any): void;
}

export interface ITankAbilities {
    updateModules(): void;
    activateModule0(): void;
    activateModule6(): void;
    activateModule7(): void;
    activateModule8(): void;
    activateModule9(): void;
    activateChassisAbility(): void;
}

export interface ITankHealth {
    takeDamage(amount: number, attackerPosition?: Vector3): void;
    heal(amount: number): void;
    die(): void;
    respawn(): void;
    addFuel(amount: number): void;
    consumeFuel(deltaTime: number): void;
    getFuelPercent(): number;
    isInvulnerableNow(): boolean;
    getInvulnerabilityTimeLeft(): number;
}

export interface ITankVisuals {
    createUniqueChassis(scene: Scene, position: Vector3): Mesh;
    createUniqueCannon(scene: Scene, barrelWidth: number, barrelLength: number): Mesh;
    createVisualWheels(): void;
    updateCannonAnimations(): void;
    updateChassisAnimations(): void;
    updateBarrelVisibility(baseZ: number): void;
}

// Тип для гильзы
export interface ShellCasing {
    mesh: Mesh;
    physics: PhysicsBody;
    lifetime: number;
}

export interface ITankProjectiles {
    createShellCasing(muzzlePos: Vector3, barrelDir: Vector3): void;
    updateShellCasings(): void;
    createStandardProjectile(pos: Vector3, dir: Vector3, damage: number, cannonType: string): Mesh;
    fireShotgunSpread(muzzlePos: Vector3, direction: Vector3): void;
    fireClusterProjectiles(muzzlePos: Vector3, direction: Vector3): void;
}

