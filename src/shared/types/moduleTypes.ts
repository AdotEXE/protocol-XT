export type ModuleType = 'armor' | 'engine' | 'sensor' | 'utility' | 'weapon';
export type ModuleRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AttachmentPoint = 'chassis_front' | 'chassis_side' | 'chassis_rear' | 'turret_cheek' | 'turret_roof' | 'barrel_mount' | 'engine_deck';

export interface TankModuleStats {
    // Multipliers (1.0 = base)
    speedMultiplier?: number;
    damageMultiplier?: number;
    reloadMultiplier?: number;
    armorMultiplier?: number;
    turnSpeedMultiplier?: number;

    // Flat bonuses
    massAdd?: number; // kg
    hpAdd?: number;

    // Special Abilities flags
    autoRepair?: boolean;      // Passive regen
    radarRange?: number;       // Extended view/spotting
    stealthFactor?: number;    // Reduced visibility range
    jumpPower?: number;        // For Jump modules
}

export interface TankModule {
    id: string;
    name: string;
    description: string;
    type: ModuleType;
    rarity: ModuleRarity;
    price: number;

    // Visuals
    modelPath: string;         // 'box', 'cylinder' or path to glb
    attachmentPoint: AttachmentPoint;
    scale?: number;
    color?: string;            // Hex color for placeholder

    // Gameplay
    stats: TankModuleStats;
}
