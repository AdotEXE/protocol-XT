/**
 * Сборка данных для детальной панели характеристик танка и синхронизация бонусов с танком.
 */
import type {
    TankStatsData,
    ChassisStatsData,
    CannonStatsData,
    TracksStatsData,
    BonusesStatsData,
    StatWithBonus
} from "../hud/HUDTypes";

/** Минимальный интерфейс танка для расчёта статов */
export interface TankForStatsLike {
    chassisType: { id: string; name: string; width: number; height: number; depth: number; mass: number; maxHealth: number; moveSpeed: number; turnSpeed: number; acceleration: number; color: string; specialAbility?: string };
    cannonType: { id: string; name: string; barrelLength: number; barrelWidth: number; damage: number; cooldown: number; projectileSpeed: number; projectileSize: number; color: string; recoilMultiplier: number; maxRicochets?: number; ricochetSpeedRetention?: number; ricochetAngle?: number; maxRange?: number };
    trackType?: { id: string; name: string; color: string; style: string; stats: { speedBonus?: number; durabilityBonus?: number; armorBonus?: number } };
    currentHealth: number;
    maxHealth: number;
    currentFuel: number;
    maxFuel: number;
    currentArmor?: number;
    critChance?: number;
    evasion?: number;
    repairRate?: number;
    fuelEfficiencyBonus?: number;
}

/** Минимальный интерфейс менеджера прокачки */
export interface UpgradeManagerLike {
    getCannonBonuses(cannonId: string): { damageMultiplier?: number; cooldownMultiplier?: number; projectileSpeedMultiplier?: number };
    getChassisBonuses(chassisId: string): { healthMultiplier?: number; armorMultiplier?: number };
    getTracksBonuses(tracksId: string): { speedMultiplier?: number; turnSpeedMultiplier?: number; accelerationMultiplier?: number };
    getElementLevel(category: string, elementId: string): number;
    getPlayerLevel(): number;
}

/** Данные для синхронизации бонусов обратно в танк */
export interface DetailedTankStatsSync {
    critChance: number;
    evasion: number;
    repairRate: number;
    fuelEfficiency: number;
}

/** Результат сборки данных детальной панели */
export interface BuildDetailedTankStatsResult {
    syncToTank: DetailedTankStatsSync;
    tankStatsData: TankStatsData;
}

function statWithBonus(base: number, multiplier: number = 1, bonusType: "percent" | "absolute" = "percent"): StatWithBonus {
    const bonus = multiplier !== 1 ? (multiplier - 1) * 100 : 0;
    const total = multiplier * base;
    return { base, bonus, total, bonusType };
}

/**
 * Собирает данные для детальной панели характеристик танка и значения бонусов для синхронизации с танком.
 */
export function buildDetailedTankStatsData(
    tank: TankForStatsLike,
    upgradeManager: UpgradeManagerLike
): BuildDetailedTankStatsResult | null {
    const chassis = tank.chassisType;
    const cannon = tank.cannonType;
    const track = tank.trackType;
    const trackId = track?.id ?? "standard";
    const cannonBonuses = upgradeManager.getCannonBonuses(cannon.id);
    const chassisBonuses = upgradeManager.getChassisBonuses(chassis.id);
    const tracksBonuses = upgradeManager.getTracksBonuses(trackId);

    const damageMult = cannonBonuses.damageMultiplier ?? 1;
    const cooldownMult = cannonBonuses.cooldownMultiplier ?? 1;
    const projSpeedMult = cannonBonuses.projectileSpeedMultiplier ?? 1;
    const healthMult = chassisBonuses.healthMultiplier ?? 1;
    const armorMult = chassisBonuses.armorMultiplier ?? 1;
    const speedMult = tracksBonuses.speedMultiplier ?? 1;
    const turnMult = tracksBonuses.turnSpeedMultiplier ?? 1;
    const accelMult = tracksBonuses.accelerationMultiplier ?? 1;

    const cannonLevel = upgradeManager.getElementLevel("cannon", cannon.id);
    const chassisLevel = upgradeManager.getElementLevel("chassis", chassis.id);
    const tracksLevel = upgradeManager.getElementLevel("tracks", trackId);
    const playerLevel = upgradeManager.getPlayerLevel();

    const chassisData: ChassisStatsData = {
        id: chassis.id,
        name: chassis.name,
        maxHealth: statWithBonus(chassis.maxHealth, healthMult),
        moveSpeed: statWithBonus(chassis.moveSpeed, speedMult),
        turnSpeed: statWithBonus(chassis.turnSpeed, turnMult),
        acceleration: statWithBonus(chassis.acceleration, accelMult),
        mass: chassis.mass,
        width: chassis.width,
        height: chassis.height,
        depth: chassis.depth,
        specialAbility: chassis.specialAbility ?? null,
        upgradeLevel: chassisLevel,
        color: chassis.color
    };

    const cannonData: CannonStatsData = {
        id: cannon.id,
        name: cannon.name,
        damage: statWithBonus(cannon.damage, damageMult),
        cooldown: statWithBonus(cannon.cooldown, cooldownMult),
        projectileSpeed: statWithBonus(cannon.projectileSpeed, projSpeedMult),
        projectileSize: cannon.projectileSize,
        recoilMultiplier: cannon.recoilMultiplier,
        barrelLength: cannon.barrelLength,
        barrelWidth: cannon.barrelWidth,
        maxRicochets: cannon.maxRicochets ?? null,
        ricochetSpeedRetention: cannon.ricochetSpeedRetention ?? null,
        ricochetAngle: cannon.ricochetAngle ?? null,
        maxRange: cannon.maxRange ?? 500,
        upgradeLevel: cannonLevel,
        color: cannon.color
    };

    const speedBonus = track?.stats?.speedBonus ?? 0;
    const durabilityBonus = track?.stats?.durabilityBonus ?? 0;
    const armorBonus = track?.stats?.armorBonus ?? 0;

    const tracksData: TracksStatsData = {
        id: trackId,
        name: track?.name ?? "Standard",
        style: (track?.style as string) ?? "standard",
        speedBonus: (speedMult - 1) + speedBonus,
        durabilityBonus: durabilityBonus,
        armorBonus: (armorMult - 1) + armorBonus,
        upgradeLevel: tracksLevel,
        color: track?.color ?? "#1a1a1a"
    };

    const damageBonusPercent = (damageMult - 1) * 100;
    const cooldownBonusPercent = (1 - cooldownMult) * 100;
    const healthBonusPercent = (healthMult - 1) * 100;
    const armorBonusPercent = (armorMult - 1) * 100;
    const speedBonusPercent = (speedMult - 1) * 100;
    const turnSpeedBonusPercent = (turnMult - 1) * 100;
    const accelerationBonusPercent = (accelMult - 1) * 100;
    const projectileSpeedBonusPercent = (projSpeedMult - 1) * 100;

    const critChance = tank.critChance ?? 0;
    const evasion = tank.evasion ?? 0;
    const repairRate = tank.repairRate ?? 0;
    const fuelEfficiency = tank.fuelEfficiencyBonus ?? 0;

    const bonusesData: BonusesStatsData = {
        damageBonus: damageBonusPercent,
        cooldownBonus: cooldownBonusPercent,
        healthBonus: healthBonusPercent,
        armorBonus: armorBonusPercent,
        speedBonus: speedBonusPercent,
        turnSpeedBonus: turnSpeedBonusPercent,
        accelerationBonus: accelerationBonusPercent,
        projectileSpeedBonus: projectileSpeedBonusPercent,
        critChance,
        evasion,
        repairRate,
        fuelEfficiency,
        playerLevel,
        installedModules: []
    };

    const tankStatsData: TankStatsData = {
        chassis: chassisData,
        cannon: cannonData,
        tracks: tracksData,
        bonuses: bonusesData,
        currentHealth: tank.currentHealth,
        currentFuel: tank.currentFuel,
        maxFuel: tank.maxFuel,
        currentArmor: tank.currentArmor ?? 0
    };

    return {
        syncToTank: {
            critChance,
            evasion,
            repairRate,
            fuelEfficiency
        },
        tankStatsData
    };
}
