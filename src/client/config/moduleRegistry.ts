import { TankModule } from "../../shared/types/moduleTypes";

export const MODULES: TankModule[] = [
    // 🛡️ Armor: Composite Plating
    {
        id: "module_armor_composite",
        name: "Composite Armor",
        description: "Heavy plating that increases HP but reduces speed slightly.",
        type: "armor",
        rarity: "common",
        price: 500,
        attachmentPoint: "chassis_front",
        modelPath: "box", // Placeholder
        color: "#4a5d4a", // Military Green
        scale: 1.0,
        stats: {
            hpAdd: 200,
            massAdd: 500,
            speedMultiplier: 0.95, // -5% speed
            armorMultiplier: 1.2   // +20% effective armor (if implemented)
        }
    },

    // 🚀 Engine: Turbocharger
    {
        id: "module_engine_turbo",
        name: "Turbocharger Mk1",
        description: "Boosts engine power for higher top speed and acceleration.",
        type: "engine",
        rarity: "rare",
        price: 1200,
        attachmentPoint: "engine_deck",
        modelPath: "cylinder_pair", // Placeholder
        color: "#a0a0a0", // Chrome/Grey
        scale: 0.8,
        stats: {
            speedMultiplier: 1.15, // +15% speed
            turnSpeedMultiplier: 1.1 // +10% turn speed
        }
    },

    // 👁️ Sensor: Laser Rangefinder
    {
        id: "module_sensor_laser",
        name: "Laser Sight",
        description: "Improves aiming accuracy and reload speed.",
        type: "sensor",
        rarity: "common",
        price: 300,
        attachmentPoint: "turret_cheek",
        modelPath: "box_small",
        color: "#ff0000", // Red Accents
        scale: 0.5,
        stats: {
            reloadMultiplier: 0.9, // -10% reload time (faster)
            radarRange: 50         // +50m view range
        }
    },

    // 💊 Utility: Auto-Repair Kit
    {
        id: "module_utility_repair",
        name: "Nano-Repair Unit",
        description: "Slowly regenerates hull integrity over time.",
        type: "utility",
        rarity: "epic",
        price: 2500,
        attachmentPoint: "chassis_rear",
        modelPath: "box_kit",
        color: "#00ff00", // Green Light
        scale: 0.7,
        stats: {
            autoRepair: true,
            massAdd: 100
        }
    }
];

export const getModuleById = (id: string): TankModule | undefined => {
    return MODULES.find(m => m.id === id);
};
