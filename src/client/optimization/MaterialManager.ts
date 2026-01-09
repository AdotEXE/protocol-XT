/**
 * MaterialManager - Centralized material management for performance optimization
 * 
 * Problems solved:
 * - 65+ materials created inline causing extra draw calls
 * - Duplicate materials created for same colors
 * - Materials not frozen/cached properly
 * 
 * Solution:
 * - Single global cache for all materials
 * - Pre-defined palette with named materials
 * - Dynamic material creation with automatic caching
 */

import { Scene, StandardMaterial, Color3 } from "@babylonjs/core";
import { logger } from "../utils/logger";

// Pre-defined material palette
const MATERIAL_PALETTE: Record<string, [number, number, number]> = {
    // Ground types
    asphalt: [0.12, 0.12, 0.12],
    concrete: [0.45, 0.43, 0.40],
    dirt: [0.35, 0.28, 0.20],
    sand: [0.65, 0.55, 0.40],
    gravel: [0.40, 0.38, 0.35],
    
    // Building materials
    brick: [0.45, 0.28, 0.20],
    brickDark: [0.30, 0.20, 0.15],
    plaster: [0.55, 0.52, 0.48],
    plasterYellow: [0.58, 0.52, 0.38],
    metal: [0.32, 0.34, 0.36],
    metalRust: [0.40, 0.28, 0.20],
    glass: [0.22, 0.26, 0.30],
    roof: [0.25, 0.22, 0.20],
    roofRed: [0.45, 0.22, 0.18],
    roofGreen: [0.22, 0.30, 0.22],
    building: [0.35, 0.35, 0.40],
    
    // General colors
    wood: [0.42, 0.30, 0.18],
    woodDark: [0.28, 0.20, 0.14],
    white: [0.60, 0.58, 0.55],
    black: [0.08, 0.08, 0.08],
    yellow: [0.65, 0.55, 0.12],
    red: [0.55, 0.18, 0.12],
    
    // Nature
    grass: [0.30, 0.38, 0.22],
    grassDark: [0.22, 0.30, 0.18],
    treeTrunk: [0.35, 0.28, 0.20],
    leaves: [0.25, 0.35, 0.20],
    water: [0.15, 0.25, 0.35],
    rock: [0.35, 0.32, 0.30],
    
    // Windows and doors (previously created inline)
    windowLit: [0.8, 0.9, 1.0],
    windowDark: [0.1, 0.1, 0.15],
    doorBrown: [0.2, 0.15, 0.1],
    
    // Park/decoration
    statue: [0.5, 0.55, 0.5],
    flowerBed: [0.3, 0.2, 0.1],
    flowerRed: [1.0, 0.2, 0.2],
    flowerYellow: [1.0, 1.0, 0.2],
    flowerPink: [1.0, 0.4, 0.6],
    flowerWhite: [0.9, 0.9, 0.9],
    flowerPurple: [0.6, 0.2, 0.8],
    
    // Lamp materials
    lampPole: [0.2, 0.2, 0.2],
    lampHead: [1.0, 0.95, 0.8],
    
    // Military/industrial
    camo: [0.2, 0.25, 0.2],
    camoBrown: [0.35, 0.28, 0.22],
    camoBlack: [0.15, 0.15, 0.15],
    
    // Garage materials
    garageDoor: [0.35, 0.35, 0.4],
    garageFloor: [0.25, 0.25, 0.28],
    workbench: [0.4, 0.25, 0.15],
    tool: [0.5, 0.5, 0.55],
    track: [0.15, 0.15, 0.15],
    gear: [0.6, 0.6, 0.65],
    engine: [0.25, 0.22, 0.2],
    bolt: [0.7, 0.7, 0.75],
    wheel: [0.4, 0.4, 0.45],
    spring: [0.55, 0.55, 0.6],
    armor: [0.2, 0.25, 0.2],
    hose: [0.1, 0.1, 0.1],
    
    // Targets
    targetRed: [0.9, 0.1, 0.1],
    targetWhite: [1.0, 1.0, 1.0],
    targetBlack: [0.0, 0.0, 0.0],
    
    // Collision (invisible)
    collision: [0.0, 0.0, 0.0],
    
    // Containers (for thin instances that might fallback)
    containerRed: [0.7, 0.15, 0.1],
    containerBlue: [0.1, 0.2, 0.5],
    containerGreen: [0.15, 0.4, 0.15],
    containerYellow: [0.85, 0.75, 0.15],
    containerMetal: [0.45, 0.45, 0.5],
    containerRust: [0.5, 0.3, 0.2],
    
    // Cars
    carRed: [0.8, 0.2, 0.2],
    carYellow: [0.9, 0.8, 0.2],
    carMetal: [0.5, 0.5, 0.55],
    carDark: [0.2, 0.2, 0.25],
    
    // Military/Training objects
    tire: [0.1, 0.1, 0.1],
    barrelGreen: [0.1, 0.4, 0.1],
    barrelRed: [0.6, 0.1, 0.1],
    crate: [0.3, 0.25, 0.1],
    crateBrown: [0.25, 0.2, 0.1],
    dummy: [0.2, 0.15, 0.1],
    wreck: [0.15, 0.12, 0.1],
    wreckBrown: [0.2, 0.15, 0.1],
    slit: [0.05, 0.05, 0.05],
    slitDark: [0.1, 0.1, 0.1],
    wire: [0.3, 0.25, 0.2],
    smoke: [0.2, 0.2, 0.2],
    
    // Urban objects
    burned: [0.1, 0.08, 0.05],
    signRed: [0.8, 0, 0],
    signYellow: [0.8, 0.8, 0],
    signBlue: [0, 0.5, 0.8],
    trash: [0.3, 0.25, 0.2],
    
    // Arena/Expo objects
    flagRed: [1, 0, 0],
    flagGreen: [0, 0.5, 0],
    flagBlue: [0, 0, 0.8],
    spotlight: [0.3, 0.3, 0.3],
    tankCamo: [0.2, 0.3, 0.2],
    boxWood: [0.6, 0.5, 0.3],
    barrelMulti: [0.4, 0.3, 0.2],
    fence: [0.5, 0.5, 0.5],
    lightBulb: [1, 0.95, 0.8],
    bin: [0.2, 0.4, 0.2],
    containerGray: [0.3, 0.3, 0.35],
    boardWhite: [0.9, 0.9, 0.85],
    boardBlue: [0.1, 0.3, 0.6],
    boothRed: [0.8, 0.1, 0.1],
    shelter: [0.4, 0.4, 0.5],
    hydrant: [0.9, 0.2, 0.1],
    
    // Nature/Coastal
    mushroom: [0.8, 0.3, 0.2],
    mushroom2: [0.9, 0.85, 0.7],
    column: [0.6, 0.55, 0.5],
    altar: [0.4, 0.35, 0.3],
    crystalPurple: [0.5, 0.2, 0.7],
    crystalBlue: [0.2, 0.4, 0.8],
    crystalGreen: [0.2, 0.7, 0.3],
    kayakRed: [0.8, 0.2, 0.2],
    kayakYellow: [0.9, 0.7, 0.2],
    kayakBlue: [0.2, 0.4, 0.7],
    net: [0.5, 0.4, 0.3],
    trap: [0.4, 0.3, 0.2],
    canopyRed: [0.8, 0.3, 0.2],
    canopyBlue: [0.3, 0.4, 0.7],
    canopyGreen: [0.3, 0.6, 0.3],
    buoyRed: [0.9, 0.2, 0.1],
    buoyOrange: [0.9, 0.5, 0.1],
    buoyYellow: [0.9, 0.8, 0.2],
    
    // Roof materials
    roofBrown: [0.3, 0.2, 0.1],
    roofDark: [0.35, 0.25, 0.15],
};

// Special materials that need emissive or other properties
interface SpecialMaterialConfig {
    diffuse: [number, number, number];
    emissive?: [number, number, number];
    specular?: [number, number, number];
    alpha?: number;
}

const SPECIAL_MATERIALS: Record<string, SpecialMaterialConfig> = {
    lampHeadEmissive: {
        diffuse: [1.0, 0.95, 0.8],
        emissive: [0.4, 0.35, 0.3],
    },
    targetRedEmissive: {
        diffuse: [0.9, 0.1, 0.1],
        emissive: [0.3, 0.0, 0.0],
    },
    workbenchEmissive: {
        diffuse: [0.4, 0.25, 0.15],
        emissive: [0.05, 0.05, 0.05],
        specular: [0.1, 0.1, 0.1],
    },
    toolShiny: {
        diffuse: [0.5, 0.5, 0.55],
        specular: [0.3, 0.3, 0.3],
        emissive: [0.02, 0.02, 0.02],
    },
    gearShiny: {
        diffuse: [0.6, 0.6, 0.65],
        specular: [0.5, 0.5, 0.5],
    },
    boltShiny: {
        diffuse: [0.7, 0.7, 0.75],
        specular: [0.6, 0.6, 0.6],
    },
    collisionInvisible: {
        diffuse: [0, 0, 0],
        alpha: 0,
    },
};

export class MaterialManager {
    private static instance: MaterialManager | null = null;
    private scene: Scene;
    private materials: Map<string, StandardMaterial> = new Map();
    private dynamicMaterialCache: Map<string, StandardMaterial> = new Map();
    
    private stats = {
        totalMaterials: 0,
        cachedHits: 0,
        cacheMisses: 0,
    };
    
    private constructor(scene: Scene) {
        this.scene = scene;
        this.initializeMaterials();
    }
    
    /**
     * Get or create the singleton instance
     */
    static getInstance(scene?: Scene): MaterialManager {
        if (!MaterialManager.instance) {
            if (!scene) {
                throw new Error("[MaterialManager] Scene required for initialization");
            }
            MaterialManager.instance = new MaterialManager(scene);
        }
        return MaterialManager.instance;
    }
    
    /**
     * Reset the singleton (for scene changes)
     */
    static reset(): void {
        if (MaterialManager.instance) {
            MaterialManager.instance.dispose();
            MaterialManager.instance = null;
        }
    }
    
    /**
     * Initialize all pre-defined materials
     */
    private initializeMaterials(): void {
        logger.log("[MaterialManager] Initializing materials...");
        
        // Create standard palette materials
        for (const [name, [r, g, b]] of Object.entries(MATERIAL_PALETTE)) {
            const mat = new StandardMaterial(`mat_${name}`, this.scene);
            mat.diffuseColor = new Color3(r, g, b);
            mat.specularColor = Color3.Black();
            mat.specularPower = 0;
            mat.freeze();
            this.materials.set(name, mat);
            this.stats.totalMaterials++;
        }
        
        // Create special materials with emissive/specular
        for (const [name, config] of Object.entries(SPECIAL_MATERIALS)) {
            const mat = new StandardMaterial(`mat_${name}`, this.scene);
            mat.diffuseColor = new Color3(...config.diffuse);
            
            if (config.emissive) {
                mat.emissiveColor = new Color3(...config.emissive);
            }
            if (config.specular) {
                mat.specularColor = new Color3(...config.specular);
            } else {
                mat.specularColor = Color3.Black();
            }
            if (config.alpha !== undefined) {
                mat.alpha = config.alpha;
            }
            
            mat.freeze();
            this.materials.set(name, mat);
            this.stats.totalMaterials++;
        }
        
        logger.log(`[MaterialManager] Initialized ${this.stats.totalMaterials} materials`);
    }
    
    /**
     * Get a material by name (primary API)
     */
    get(name: string): StandardMaterial {
        const cached = this.materials.get(name);
        if (cached) {
            this.stats.cachedHits++;
            return cached;
        }
        
        // Check dynamic cache
        const dynamic = this.dynamicMaterialCache.get(name);
        if (dynamic) {
            this.stats.cachedHits++;
            return dynamic;
        }
        
        this.stats.cacheMisses++;
        
        // Fallback to concrete
        const fallback = this.materials.get("concrete");
        if (fallback) {
            logger.warn(`[MaterialManager] Unknown material: ${name}, using concrete`);
            return fallback;
        }
        
        // Emergency fallback - create default
        return this.createDefault();
    }
    
    /**
     * Get or create a material with a specific color
     * Uses color hash for caching
     */
    getByColor(r: number, g: number, b: number): StandardMaterial {
        // Round to 2 decimal places for cache key
        const rr = Math.round(r * 100) / 100;
        const gr = Math.round(g * 100) / 100;
        const br = Math.round(b * 100) / 100;
        const key = `color_${rr}_${gr}_${br}`;
        
        const cached = this.dynamicMaterialCache.get(key);
        if (cached) {
            this.stats.cachedHits++;
            return cached;
        }
        
        // Create new material
        const mat = new StandardMaterial(key, this.scene);
        mat.diffuseColor = new Color3(r, g, b);
        mat.specularColor = Color3.Black();
        mat.specularPower = 0;
        mat.freeze();
        
        this.dynamicMaterialCache.set(key, mat);
        this.stats.cacheMisses++;
        this.stats.totalMaterials++;
        
        return mat;
    }
    
    /**
     * Check if a material exists
     */
    has(name: string): boolean {
        return this.materials.has(name) || this.dynamicMaterialCache.has(name);
    }
    
    /**
     * Get all available material names
     */
    getAvailableNames(): string[] {
        return [...this.materials.keys(), ...this.dynamicMaterialCache.keys()];
    }
    
    /**
     * Get statistics
     */
    getStats(): { totalMaterials: number; cachedHits: number; cacheMisses: number; hitRate: number } {
        const hitRate = this.stats.cachedHits + this.stats.cacheMisses > 0
            ? this.stats.cachedHits / (this.stats.cachedHits + this.stats.cacheMisses)
            : 1;
        return { ...this.stats, hitRate };
    }
    
    /**
     * Create a default material (emergency fallback)
     */
    private createDefault(): StandardMaterial {
        let def = this.materials.get("_default");
        if (!def) {
            def = new StandardMaterial("_default", this.scene);
            def.diffuseColor = new Color3(0.5, 0.5, 0.5);
            def.specularColor = Color3.Black();
            def.freeze();
            this.materials.set("_default", def);
            this.stats.totalMaterials++;
        }
        return def;
    }
    
    /**
     * Dispose all materials
     */
    dispose(): void {
        for (const mat of this.materials.values()) {
            mat.dispose();
        }
        for (const mat of this.dynamicMaterialCache.values()) {
            mat.dispose();
        }
        this.materials.clear();
        this.dynamicMaterialCache.clear();
        this.stats = { totalMaterials: 0, cachedHits: 0, cacheMisses: 0 };
        logger.log("[MaterialManager] Disposed");
    }
}

// Export for convenience
export const getMaterial = (name: string, scene?: Scene): StandardMaterial => {
    return MaterialManager.getInstance(scene).get(name);
};

export const getMaterialByColor = (r: number, g: number, b: number, scene?: Scene): StandardMaterial => {
    return MaterialManager.getInstance(scene).getByColor(r, g, b);
};

