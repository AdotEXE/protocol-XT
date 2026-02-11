/**
 * EditorMapGeneratorInitializer
 * 
 * Standalone utility to initialize map generators for editor map import
 * WITHOUT requiring full ChunkSystem or game initialization.
 * 
 * This is called when PolyGenStudio requests to import a game map
 * and ChunkSystem hasn't been initialized yet.
 */

import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math";
import { MapGeneratorFactory } from "./shared";
import { GenerationContext } from "./shared/MapTypes";
import { logger } from "../utils/logger";

// Import only Sand map generator (all other maps removed per user request)
import { SandGenerator } from "./sand/SandGenerator";

// Flag to prevent multiple initializations
let isInitialized = false;

// Cache for basic materials (for export only)
const materialCache: Map<string, StandardMaterial> = new Map();

/**
 * Get a basic material for export purposes
 */
function getBasicMaterial(name: string, scene: Scene): StandardMaterial {
    const cached = materialCache.get(name);
    // Check if material is still valid (not disposed)
    if (cached && cached.getScene() && !cached.getScene()?.isDisposed) return cached;

    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    mat.specularColor = Color3.Black();
    materialCache.set(name, mat);
    return mat;
}

/**
 * Initialize all map generators for editor export/import
 * This is a lightweight initialization that doesn't require full game systems
 */
export function initializeGeneratorsForEditor(scene: Scene): void {
    // Skip if already initialized and generators are registered
    if (isInitialized && MapGeneratorFactory.get("sand") !== null) {
        logger.log("[EditorMapGeneratorInitializer] Generators already initialized, skipping");
        return;
    }

    logger.log("[EditorMapGeneratorInitializer] Initializing map generators for editor...");

    // Create minimal context for generator initialization
    const minimalContext: GenerationContext = {
        scene: scene,
        config: {
            chunkSize: 50,
            renderDistance: 4,
            unloadDistance: 6,
            worldSeed: 12345,
            mapType: "normal"
        },
        materials: new Map(),
        garagePositions: [],
        isPositionInGarageArea: () => false,
        isPositionNearRoad: () => false,
        getTerrainHeight: () => 0,
        getMat: (name: string) => getBasicMaterial(name, scene)
    };

    // Register only Sand generator (all other maps removed)
    const generators = [
        new SandGenerator()
    ];

    generators.forEach(gen => {
        try {
            gen.initialize(minimalContext);
            MapGeneratorFactory.register(gen);
            logger.log(`[EditorMapGeneratorInitializer] Registered: ${gen.mapType}`);
        } catch (e) {
            logger.warn(`[EditorMapGeneratorInitializer] Failed to register ${gen.mapType}:`, e);
        }
    });

    isInitialized = true;
    logger.log(`[EditorMapGeneratorInitializer] Completed. ${generators.length} generators registered.`);
}

/**
 * Reset initialization flag (for testing or scene changes)
 */
export function resetGeneratorInitialization(): void {
    isInitialized = false;
    materialCache.clear();
}
