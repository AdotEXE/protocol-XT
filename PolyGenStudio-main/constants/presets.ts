export interface MapPreset {
    name: string;
    prompt: string;
    description: string;
    icon?: string;
    settings?: {
        complexity?: 'simple' | 'medium' | 'detailed';
        organicness?: number;
        detailDensity?: number;
        voxelSize?: number;
        forceGround?: boolean;
    }
}

export const MAP_PRESETS: MapPreset[] = [
    {
        name: "Military Base",
        prompt: "Military base with bunkers, high walls, watch towers, and defensive structures, tactical layout",
        description: "Tactical outpost with heavy fortifications",
        icon: "🏰",
        settings: { complexity: 'medium', organicness: 0.1, forceGround: true }
    },
    {
        name: "Urban Zone",
        prompt: "Urban combat zone with buildings, streets, alleyways, and city infrastructure, skyscrapers",
        description: "Dense city environment for close combat",
        icon: "🏙",
        settings: { complexity: 'detailed', organicness: 0.0, voxelSize: 0.5, forceGround: true }
    },
    {
        name: "Ruins",
        prompt: "Destroyed city with rubble, collapsed buildings, debris, and broken walls",
        description: "Post-apocalyptic landscape",
        icon: "🏚",
        settings: { complexity: 'detailed', organicness: 0.4, forceGround: true }
    },
    {
        name: "Canyon",
        prompt: "Rocky canyon with high cliffs, narrow passages, bridges, and natural stone cover",
        description: "Natural terrain with verticality",
        icon: "⛰",
        settings: { complexity: 'medium', organicness: 0.8, forceGround: true }
    },
    {
        name: "Industrial",
        prompt: "Industrial factory complex with pipes, machinery, warehouses, and storage tanks",
        description: "Heavy industry environment",
        icon: "🏭",
        settings: { complexity: 'medium', organicness: 0.1, forceGround: true }
    },
    {
        name: "Arena",
        prompt: "Symmetrical competitive arena with balanced cover, central objective, and clear sightlines",
        description: "Balanced map for competitive play",
        icon: "⚔️",
        settings: { complexity: 'simple', organicness: 0.0, forceGround: true }
    },
    {
        name: "Bunkers",
        prompt: "Network of underground bunkers, tunnels, and fortified rooms",
        description: "Close quarters interior combat",
        icon: "🕳",
        settings: { complexity: 'detailed', organicness: 0.0, forceGround: false }
    },
    {
        name: "Forest",
        prompt: "Dense forest with many trees, rocks, bushes, and natural uneven terrain",
        description: "Open natural environment",
        icon: "🌲",
        settings: { complexity: 'medium', organicness: 1.0, forceGround: true }
    }
];
