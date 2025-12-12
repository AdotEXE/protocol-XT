// ═══════════════════════════════════════════════════════════════════════════
// POI SYSTEM - Система точек интереса (Points of Interest)
// ═══════════════════════════════════════════════════════════════════════════

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    PhysicsAggregate,
    PhysicsShapeType,
    TransformNode,
    Animation
} from "@babylonjs/core";

// Seeded random
class SeededRandom {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    range(min: number, max: number): number { return min + this.next() * (max - min); }
    int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
    chance(p: number): boolean { return this.next() < p; }
}

export type POIType = 
    | "capturePoint" 
    | "ammoDepot" 
    | "repairStation" 
    | "fuelDepot" 
    | "radarStation" 
    | "headquarters"
    | "bridge"
    | "tunnel";

export interface POI {
    id: string;
    type: POIType;
    position: Vector3;
    meshes: Mesh[];
    radius: number;
    capturable: boolean;
    ownerId: string | null;
    captureProgress: number;
    active: boolean;
    metadata: Record<string, any>;
}

interface POISystemConfig {
    worldSeed: number;
    poiSpacing: number; // Minimum distance between POIs
}

export class POISystem {
    private scene: Scene;
    private config: POISystemConfig;
    private materials: Map<string, StandardMaterial> = new Map();
    private pois: Map<string, POI> = new Map();
    private chunkPOIs: Map<string, string[]> = new Map(); // chunk key -> POI ids
    
    constructor(scene: Scene, config?: Partial<POISystemConfig>) {
        this.scene = scene;
        this.config = {
            worldSeed: Date.now(),
            poiSpacing: 150,
            ...config
        };
        this.createMaterials();
    }
    
    private createMaterials(): void {
        // Capture point - neutral
        const captureNeutral = new StandardMaterial("poiCaptureNeutral", this.scene);
        captureNeutral.diffuseColor = new Color3(0.5, 0.5, 0.5);
        captureNeutral.emissiveColor = new Color3(0.1, 0.1, 0.1);
        captureNeutral.freeze();
        this.materials.set("captureNeutral", captureNeutral);
        
        // Capture point - player owned
        const capturePlayer = new StandardMaterial("poiCapturePlayer", this.scene);
        capturePlayer.diffuseColor = new Color3(0.1, 0.6, 0.1);
        capturePlayer.emissiveColor = new Color3(0.05, 0.2, 0.05);
        capturePlayer.freeze();
        this.materials.set("capturePlayer", capturePlayer);
        
        // Capture point - enemy owned
        const captureEnemy = new StandardMaterial("poiCaptureEnemy", this.scene);
        captureEnemy.diffuseColor = new Color3(0.6, 0.1, 0.1);
        captureEnemy.emissiveColor = new Color3(0.2, 0.05, 0.05);
        captureEnemy.freeze();
        this.materials.set("captureEnemy", captureEnemy);
        
        // Ammo depot
        const ammoMat = new StandardMaterial("poiAmmo", this.scene);
        ammoMat.diffuseColor = new Color3(0.4, 0.35, 0.2);
        ammoMat.specularColor = new Color3(0.1, 0.1, 0.1);
        ammoMat.freeze();
        this.materials.set("ammo", ammoMat);
        
        // Repair station
        const repairMat = new StandardMaterial("poiRepair", this.scene);
        repairMat.diffuseColor = new Color3(0.2, 0.4, 0.6);
        repairMat.specularColor = new Color3(0.15, 0.15, 0.15);
        repairMat.freeze();
        this.materials.set("repair", repairMat);
        
        // Fuel depot
        const fuelMat = new StandardMaterial("poiFuel", this.scene);
        fuelMat.diffuseColor = new Color3(0.6, 0.3, 0.1);
        fuelMat.specularColor = new Color3(0.2, 0.1, 0.05);
        fuelMat.freeze();
        this.materials.set("fuel", fuelMat);
        
        // Radar
        const radarMat = new StandardMaterial("poiRadar", this.scene);
        radarMat.diffuseColor = new Color3(0.3, 0.3, 0.35);
        radarMat.specularColor = new Color3(0.2, 0.2, 0.2);
        radarMat.freeze();
        this.materials.set("radar", radarMat);
        
        // HQ
        const hqMat = new StandardMaterial("poiHQ", this.scene);
        hqMat.diffuseColor = new Color3(0.35, 0.3, 0.25);
        hqMat.specularColor = Color3.Black();
        hqMat.freeze();
        this.materials.set("hq", hqMat);
        
        // Flag
        const flagMat = new StandardMaterial("poiFlag", this.scene);
        flagMat.diffuseColor = new Color3(0.8, 0.8, 0.8);
        flagMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
        flagMat.freeze();
        this.materials.set("flag", flagMat);
    }
    
    // Create a capture point POI
    private createCapturePoint(position: Vector3, id: string, parent: TransformNode): POI {
        const meshes: Mesh[] = [];
        
        // Base platform
        const platform = MeshBuilder.CreateCylinder(`${id}_platform`, {
            height: 0.3,
            diameter: 8,
            tessellation: 16
        }, this.scene);
        platform.position = position.clone();
        platform.position.y = 0.15;
        platform.material = this.materials.get("captureNeutral")!;
        platform.parent = parent;
        meshes.push(platform);
        
        // Flag pole
        const pole = MeshBuilder.CreateBox(`${id}_pole`, {
            width: 0.2,
            height: 6,
            depth: 0.2
        }, this.scene);
        pole.position = position.clone();
        pole.position.y = 3;
        pole.material = this.materials.get("captureNeutral")!;
        pole.parent = parent;
        meshes.push(pole);
        
        // Flag
        const flag = MeshBuilder.CreateBox(`${id}_flag`, {
            width: 2,
            height: 1.2,
            depth: 0.05
        }, this.scene);
        flag.position = position.clone();
        flag.position.x += 1.1;
        flag.position.y = 5.4;
        flag.material = this.materials.get("flag")!;
        flag.parent = parent;
        meshes.push(flag);
        
        // Add waving animation to flag
        const animation = new Animation(
            "flagWave", "rotation.y", 30,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
        animation.setKeys([
            { frame: 0, value: -0.1 },
            { frame: 15, value: 0.1 },
            { frame: 30, value: -0.1 }
        ]);
        flag.animations.push(animation);
        this.scene.beginAnimation(flag, 0, 30, true);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
        }
        
        return {
            id,
            type: "capturePoint",
            position: position.clone(),
            meshes,
            radius: 10,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            active: true,
            metadata: {}
        };
    }
    
    // Create an ammo depot POI
    private createAmmoDepot(position: Vector3, id: string, parent: TransformNode): POI {
        const meshes: Mesh[] = [];
        
        // Main building
        const building = MeshBuilder.CreateBox(`${id}_building`, {
            width: 8,
            height: 4,
            depth: 6
        }, this.scene);
        building.position = position.clone();
        building.position.y = 2;
        building.material = this.materials.get("ammo")!;
        building.parent = parent;
        meshes.push(building);
        
        new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Ammo crates
        for (let i = 0; i < 3; i++) {
            const crate = MeshBuilder.CreateBox(`${id}_crate_${i}`, {
                width: 1,
                height: 0.6,
                depth: 1
            }, this.scene);
            crate.position = position.clone();
            crate.position.x += (i - 1) * 1.5;
            crate.position.y = 0.3;
            crate.position.z += 4;
            crate.material = this.materials.get("ammo")!;
            crate.parent = parent;
            meshes.push(crate);
        }
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "ammoDepot" };
        }
        
        return {
            id,
            type: "ammoDepot",
            position: position.clone(),
            meshes,
            radius: 8,
            capturable: false,
            ownerId: null,
            captureProgress: 0,
            active: true,
            metadata: { ammoAmount: 50 }
        };
    }
    
    // Create repair station POI
    private createRepairStation(position: Vector3, id: string, parent: TransformNode): POI {
        const meshes: Mesh[] = [];
        
        // Garage-like structure
        const walls = MeshBuilder.CreateBox(`${id}_walls`, {
            width: 10,
            height: 5,
            depth: 12
        }, this.scene);
        walls.position = position.clone();
        walls.position.y = 2.5;
        walls.material = this.materials.get("repair")!;
        walls.parent = parent;
        meshes.push(walls);
        
        new PhysicsAggregate(walls, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Repair equipment indicator
        const indicator = MeshBuilder.CreateCylinder(`${id}_indicator`, {
            height: 0.2,
            diameter: 6,
            tessellation: 16
        }, this.scene);
        indicator.position = position.clone();
        indicator.position.y = 0.1;
        indicator.material = this.materials.get("repair")!;
        indicator.parent = parent;
        meshes.push(indicator);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "repairStation" };
        }
        
        return {
            id,
            type: "repairStation",
            position: position.clone(),
            meshes,
            radius: 8,
            capturable: false,
            ownerId: null,
            captureProgress: 0,
            active: true,
            metadata: { repairRate: 10 }
        };
    }
    
    // Create fuel depot POI (explosive!)
    private createFuelDepot(position: Vector3, id: string, parent: TransformNode): POI {
        const meshes: Mesh[] = [];
        
        // Fuel tanks
        for (let i = 0; i < 3; i++) {
            const tank = MeshBuilder.CreateCylinder(`${id}_tank_${i}`, {
                height: 4,
                diameter: 2.5,
                tessellation: 12
            }, this.scene);
            tank.position = position.clone();
            tank.position.x += (i - 1) * 3;
            tank.position.y = 2;
            tank.material = this.materials.get("fuel")!;
            tank.parent = parent;
            meshes.push(tank);
            
            new PhysicsAggregate(tank, PhysicsShapeType.CYLINDER, { mass: 0 }, this.scene);
        }
        
        // Warning sign
        const sign = MeshBuilder.CreateBox(`${id}_sign`, {
            width: 1,
            height: 1.5,
            depth: 0.1
        }, this.scene);
        sign.position = position.clone();
        sign.position.z += 5;
        sign.position.y = 1.5;
        sign.material = this.materials.get("fuel")!;
        sign.parent = parent;
        meshes.push(sign);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "fuelDepot", explosive: true };
        }
        
        return {
            id,
            type: "fuelDepot",
            position: position.clone(),
            meshes,
            radius: 10,
            capturable: false,
            ownerId: null,
            captureProgress: 0,
            active: true,
            metadata: { explosive: true, explosionRadius: 15 }
        };
    }
    
    // Create radar station POI
    private createRadarStation(position: Vector3, id: string, parent: TransformNode): POI {
        const meshes: Mesh[] = [];
        
        // Base building
        const base = MeshBuilder.CreateBox(`${id}_base`, {
            width: 6,
            height: 3,
            depth: 6
        }, this.scene);
        base.position = position.clone();
        base.position.y = 1.5;
        base.material = this.materials.get("radar")!;
        base.parent = parent;
        meshes.push(base);
        
        new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Radar tower
        const tower = MeshBuilder.CreateBox(`${id}_tower`, {
            width: 1,
            height: 8,
            depth: 1
        }, this.scene);
        tower.position = position.clone();
        tower.position.y = 7;
        tower.material = this.materials.get("radar")!;
        tower.parent = parent;
        meshes.push(tower);
        
        // Radar dish
        const dish = MeshBuilder.CreateCylinder(`${id}_dish`, {
            height: 0.3,
            diameterTop: 4,
            diameterBottom: 3,
            tessellation: 16
        }, this.scene);
        dish.position = position.clone();
        dish.position.y = 11;
        dish.rotation.x = Math.PI / 6;
        dish.material = this.materials.get("radar")!;
        dish.parent = parent;
        meshes.push(dish);
        
        // Rotating animation
        const rotAnim = new Animation(
            "radarRotate", "rotation.y", 30,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
        rotAnim.setKeys([
            { frame: 0, value: 0 },
            { frame: 120, value: Math.PI * 2 }
        ]);
        dish.animations.push(rotAnim);
        this.scene.beginAnimation(dish, 0, 120, true);
        
        for (const mesh of meshes) {
            mesh.freezeWorldMatrix();
            mesh.metadata = { type: "poi", poiType: "radarStation" };
        }
        
        return {
            id,
            type: "radarStation",
            position: position.clone(),
            meshes,
            radius: 12,
            capturable: true,
            ownerId: null,
            captureProgress: 0,
            active: true,
            metadata: { detectionRadius: 100 }
        };
    }
    
    // Generate POIs for a chunk
    generatePOIsForChunk(
        chunkX: number,
        chunkZ: number,
        chunkSize: number,
        biome: string,
        parent: TransformNode
    ): POI[] {
        const key = `${chunkX}_${chunkZ}`;
        
        if (this.chunkPOIs.has(key)) {
            const poiIds = this.chunkPOIs.get(key)!;
            return poiIds.map(id => this.pois.get(id)!).filter(p => p);
        }
        
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);
        const createdPOIs: POI[] = [];
        const poiIds: string[] = [];
        
        const worldX = chunkX * chunkSize;
        const worldZ = chunkZ * chunkSize;
        
        // Determine if this chunk should have a POI
        const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
        
        // POI probability based on distance and biome
        let poiChance = 0;
        switch (biome) {
            case "military":
                poiChance = 0.5;
                break;
            case "industrial":
                poiChance = 0.3;
                break;
            case "city":
                poiChance = 0.15;
                break;
            case "wasteland":
                poiChance = 0.2;
                break;
            default:
                poiChance = 0.1;
        }
        
        // Reduce chance near center (already has garages)
        if (distFromCenter < 100) {
            poiChance *= 0.2;
        }
        
        if (random.chance(poiChance)) {
            const x = worldX + random.range(15, chunkSize - 15);
            const z = worldZ + random.range(15, chunkSize - 15);
            const localPos = new Vector3(x - worldX, 0, z - worldZ);
            const id = `poi_${chunkX}_${chunkZ}_${Date.now()}`;
            
            // Choose POI type based on biome
            let poi: POI;
            
            if (biome === "military") {
                const type = random.int(0, 3);
                if (type === 0) {
                    poi = this.createCapturePoint(localPos, id, parent);
                } else if (type === 1) {
                    poi = this.createAmmoDepot(localPos, id, parent);
                } else if (type === 2) {
                    poi = this.createRadarStation(localPos, id, parent);
                } else {
                    poi = this.createFuelDepot(localPos, id, parent);
                }
            } else if (biome === "industrial") {
                const type = random.int(0, 2);
                if (type === 0) {
                    poi = this.createFuelDepot(localPos, id, parent);
                } else if (type === 1) {
                    poi = this.createRepairStation(localPos, id, parent);
                } else {
                    poi = this.createAmmoDepot(localPos, id, parent);
                }
            } else if (biome === "city") {
                const type = random.int(0, 1);
                if (type === 0) {
                    poi = this.createCapturePoint(localPos, id, parent);
                } else {
                    poi = this.createRepairStation(localPos, id, parent);
                }
            } else {
                // wasteland, park, residential
                const type = random.int(0, 1);
                if (type === 0) {
                    poi = this.createCapturePoint(localPos, id, parent);
                } else {
                    poi = this.createAmmoDepot(localPos, id, parent);
                }
            }
            
            this.pois.set(id, poi);
            poiIds.push(id);
            createdPOIs.push(poi);
        }
        
        this.chunkPOIs.set(key, poiIds);
        return createdPOIs;
    }
    
    // Get all POIs
    getAllPOIs(): POI[] {
        return Array.from(this.pois.values());
    }
    
    // Get POI by ID
    getPOI(id: string): POI | undefined {
        return this.pois.get(id);
    }
    
    // Check if position is near any POI
    getNearbyPOI(position: Vector3, maxDistance: number): POI | null {
        for (const poi of this.pois.values()) {
            const dist = Vector3.Distance(position, poi.position);
            if (dist < maxDistance) {
                return poi;
            }
        }
        return null;
    }
    
    // Update capture progress for a POI
    updateCaptureProgress(poiId: string, captorId: string, delta: number): void {
        const poi = this.pois.get(poiId);
        if (!poi || !poi.capturable) return;
        
        if (poi.ownerId === captorId) {
            // Already owned
            return;
        }
        
        if (poi.ownerId === null) {
            // Neutral - capture directly
            poi.captureProgress += delta;
            if (poi.captureProgress >= 100) {
                poi.ownerId = captorId;
                poi.captureProgress = 100;
                this.updatePOIMaterial(poi);
            }
        } else {
            // Owned by someone else - need to neutralize first
            poi.captureProgress -= delta;
            if (poi.captureProgress <= 0) {
                poi.ownerId = null;
                poi.captureProgress = 0;
                this.updatePOIMaterial(poi);
            }
        }
    }
    
    private updatePOIMaterial(poi: POI): void {
        if (poi.type !== "capturePoint" && poi.type !== "radarStation") return;
        
        let matName = "captureNeutral";
        if (poi.ownerId === "player") {
            matName = "capturePlayer";
        } else if (poi.ownerId !== null) {
            matName = "captureEnemy";
        }
        
        const mat = this.materials.get(matName);
        if (mat) {
            for (const mesh of poi.meshes) {
                if (mesh.name.includes("platform") || mesh.name.includes("pole")) {
                    mesh.material = mat;
                }
            }
        }
    }
    
    // Clear POIs for a chunk
    clearChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        const poiIds = this.chunkPOIs.get(key);
        if (poiIds) {
            for (const id of poiIds) {
                this.pois.delete(id);
            }
            this.chunkPOIs.delete(key);
        }
    }
}

