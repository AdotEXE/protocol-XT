import { Scene, Vector3 } from "@babylonjs/core";
import { TerrainGenerator } from "./noiseGenerator";
import { POISystem } from "./poiSystem";
import { logger } from "./utils/logger";

export interface ChunkSystemConfig {
    chunkSize: number;
    renderDistance: number;
    unloadDistance: number;
    worldSeed: number;
    mapType: string;
}

export interface GaragePosition {
    x: number;
    z: number;
    id?: string;
}

export interface GarageDoor {
    position: Vector3;
    garageId?: string;
}

export interface GarageWall {
    position: Vector3;
    garageId?: string;
}

export interface GarageCapturePoint {
    position: Vector3;
    garageId?: string;
    captured?: boolean;
}

export interface ConsumablePickup {
    position: Vector3;
    type: string;
    id?: string;
}

export class ChunkSystem {
    private scene: Scene;
    private config: ChunkSystemConfig;
    public terrainGenerator: TerrainGenerator;
    private poiSystem: POISystem;
    
    public garagePositions: GaragePosition[] = [];
    public garageDoors: GarageDoor[] = [];
    public garageWalls: GarageWall[] = [];
    public garageCapturePoints: GarageCapturePoint[] = [];
    public consumablePickups: ConsumablePickup[] = [];
    
    private loadedChunks: Set<string> = new Set();
    private chunks: Map<string, any> = new Map();
    
    constructor(scene: Scene, config: ChunkSystemConfig) {
        this.scene = scene;
        this.config = config;
        
        // Initialize terrain generator
        this.terrainGenerator = new TerrainGenerator(config.worldSeed, (x, z, margin) => {
            // Check if position is in garage area
            return this.garagePositions.some(garage => {
                const dx = Math.abs(garage.x - x);
                const dz = Math.abs(garage.z - z);
                return dx < margin && dz < margin;
            });
        });
        
        // Initialize POI system
        this.poiSystem = new POISystem(scene, {
            worldSeed: config.worldSeed,
            poiSpacing: 50
        });
        
        // Generate initial garages
        this.generateGarages();
        
        logger.log(`[ChunkSystem] Initialized with ${this.garagePositions.length} garages`);
    }
    
    private generateGarages(): void {
        // Generate garages based on map type and seed
        const random = this.seededRandom(this.config.worldSeed);
        const garageCount = 5 + Math.floor(random() * 10); // 5-15 garages
        
        for (let i = 0; i < garageCount; i++) {
            const x = (random() - 0.5) * 500;
            const z = (random() - 0.5) * 500;
            
            this.garagePositions.push({ x, z, id: `garage_${i}` });
            
            // Generate garage door
            this.garageDoors.push({
                position: new Vector3(x, 0, z),
                garageId: `garage_${i}`
            });
            
            // Generate garage walls
            for (let j = 0; j < 4; j++) {
                this.garageWalls.push({
                    position: new Vector3(x + (j % 2 === 0 ? -5 : 5), 0, z + (j < 2 ? -5 : 5)),
                    garageId: `garage_${i}`
                });
            }
            
            // Generate capture point
            this.garageCapturePoints.push({
                position: new Vector3(x, 0, z),
                garageId: `garage_${i}`,
                captured: false
            });
        }
    }
    
    private seededRandom(seed: number): () => number {
        let currentSeed = seed;
        return () => {
            currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
            return currentSeed / 0x7fffffff;
        };
    }
    
    public update(position: Vector3): void {
        const chunkX = Math.floor(position.x / this.config.chunkSize);
        const chunkZ = Math.floor(position.z / this.config.chunkSize);
        
        // Load chunks within render distance
        const renderChunks = Math.ceil(this.config.renderDistance);
        for (let dx = -renderChunks; dx <= renderChunks; dx++) {
            for (let dz = -renderChunks; dz <= renderChunks; dz++) {
                const key = `${chunkX + dx}_${chunkZ + dz}`;
                if (!this.loadedChunks.has(key)) {
                    this.loadChunk(chunkX + dx, chunkZ + dz);
                    this.loadedChunks.add(key);
                }
            }
        }
        
        // Unload chunks beyond unload distance
        const unloadChunks = Math.ceil(this.config.unloadDistance);
        for (const key of this.loadedChunks) {
            const [cx, cz] = key.split('_').map(Number);
            const dx = Math.abs(cx - chunkX);
            const dz = Math.abs(cz - chunkZ);
            if (dx > unloadChunks || dz > unloadChunks) {
                this.unloadChunk(cx, cz);
                this.loadedChunks.delete(key);
            }
        }
    }
    
    private loadChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        // Chunk loading logic would go here
        // For now, just mark as loaded
    }
    
    private unloadChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        const chunk = this.chunks.get(key);
        if (chunk) {
            // Dispose chunk resources
            this.chunks.delete(key);
        }
    }
    
    public getPOISystem(): POISystem {
        return this.poiSystem;
    }
    
    public updateConsumablesAnimation(deltaTime: number): void {
        // Update consumable pickups animation
        // This would handle rotation, floating, etc.
    }
    
    public dispose(): void {
        // Clean up resources
        this.loadedChunks.clear();
        this.chunks.clear();
        this.garagePositions = [];
        this.garageDoors = [];
        this.garageWalls = [];
        this.garageCapturePoints = [];
        this.consumablePickups = [];
    }
}

