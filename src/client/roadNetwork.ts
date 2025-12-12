// ═══════════════════════════════════════════════════════════════════════════
// ROAD NETWORK - Система генерации дорожной сети
// ═══════════════════════════════════════════════════════════════════════════

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    PhysicsAggregate,
    PhysicsShapeType
} from "@babylonjs/core";

// Seeded random for consistent generation
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

export interface RoadSegment {
    start: Vector3;
    end: Vector3;
    width: number;
    type: "highway" | "street" | "path";
}

export interface Intersection {
    position: Vector3;
    roads: RoadSegment[];
    type: "crossroad" | "t_junction" | "corner";
}

interface RoadNetworkConfig {
    worldSeed: number;
    chunkSize: number;
    highwaySpacing: number;  // Distance between main highways
    streetSpacing: number;   // Distance between streets
}

export class RoadNetwork {
    private scene: Scene;
    private config: RoadNetworkConfig;
    private roads: Map<string, RoadSegment[]> = new Map();
    private intersections: Map<string, Intersection[]> = new Map();
    private materials: Map<string, StandardMaterial> = new Map();
    
    constructor(scene: Scene, config?: Partial<RoadNetworkConfig>) {
        this.scene = scene;
        this.config = {
            worldSeed: Date.now(),
            chunkSize: 80,
            highwaySpacing: 200,
            streetSpacing: 40,
            ...config
        };
        this.createMaterials();
    }
    
    private createMaterials(): void {
        // Asphalt for highways
        const highwayMat = new StandardMaterial("roadHighway", this.scene);
        highwayMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        highwayMat.specularColor = new Color3(0.05, 0.05, 0.05);
        highwayMat.freeze();
        this.materials.set("highway", highwayMat);
        
        // Darker asphalt for streets
        const streetMat = new StandardMaterial("roadStreet", this.scene);
        streetMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
        streetMat.specularColor = new Color3(0.03, 0.03, 0.03);
        streetMat.freeze();
        this.materials.set("street", streetMat);
        
        // Dirt path
        const pathMat = new StandardMaterial("roadPath", this.scene);
        pathMat.diffuseColor = new Color3(0.35, 0.28, 0.2);
        pathMat.specularColor = Color3.Black();
        pathMat.freeze();
        this.materials.set("path", pathMat);
        
        // Road markings (white)
        const markingMat = new StandardMaterial("roadMarking", this.scene);
        markingMat.diffuseColor = new Color3(0.9, 0.9, 0.85);
        markingMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
        markingMat.specularColor = Color3.Black();
        markingMat.freeze();
        this.materials.set("marking", markingMat);
        
        // Yellow road markings
        const yellowMarkingMat = new StandardMaterial("roadMarkingYellow", this.scene);
        yellowMarkingMat.diffuseColor = new Color3(0.9, 0.8, 0.2);
        yellowMarkingMat.emissiveColor = new Color3(0.1, 0.08, 0.02);
        yellowMarkingMat.specularColor = Color3.Black();
        yellowMarkingMat.freeze();
        this.materials.set("markingYellow", yellowMarkingMat);
    }
    
    // Generate roads for a chunk
    generateRoadsForChunk(chunkX: number, chunkZ: number, biome: string): RoadSegment[] {
        const key = `${chunkX}_${chunkZ}`;
        
        if (this.roads.has(key)) {
            return this.roads.get(key)!;
        }
        
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);
        const roads: RoadSegment[] = [];
        
        const worldX = chunkX * this.config.chunkSize;
        const worldZ = chunkZ * this.config.chunkSize;
        const size = this.config.chunkSize;
        
        // Check if this chunk should have highways
        const hasHorizontalHighway = Math.abs(worldZ % this.config.highwaySpacing) < size;
        const hasVerticalHighway = Math.abs(worldX % this.config.highwaySpacing) < size;
        
        // Generate highways
        if (hasHorizontalHighway && biome !== "wasteland" && biome !== "park") {
            roads.push({
                start: new Vector3(worldX, 0.02, worldZ + size / 2),
                end: new Vector3(worldX + size, 0.02, worldZ + size / 2),
                width: 12,
                type: "highway"
            });
        }
        
        if (hasVerticalHighway && biome !== "wasteland" && biome !== "park") {
            roads.push({
                start: new Vector3(worldX + size / 2, 0.02, worldZ),
                end: new Vector3(worldX + size / 2, 0.02, worldZ + size),
                width: 12,
                type: "highway"
            });
        }
        
        // Generate streets based on biome
        if (biome === "city" || biome === "industrial" || biome === "residential") {
            // Grid-based streets
            const numStreets = random.int(1, 3);
            for (let i = 0; i < numStreets; i++) {
                if (random.chance(0.5)) {
                    // Horizontal street
                    const z = worldZ + random.range(10, size - 10);
                    roads.push({
                        start: new Vector3(worldX, 0.02, z),
                        end: new Vector3(worldX + size, 0.02, z),
                        width: 8,
                        type: "street"
                    });
                } else {
                    // Vertical street
                    const x = worldX + random.range(10, size - 10);
                    roads.push({
                        start: new Vector3(x, 0.02, worldZ),
                        end: new Vector3(x, 0.02, worldZ + size),
                        width: 8,
                        type: "street"
                    });
                }
            }
        } else if (biome === "park" || biome === "desert") {
            // Organic paths
            if (random.chance(0.4)) {
                const startX = worldX + random.range(0, size);
                const startZ = worldZ + random.range(0, size);
                const endX = worldX + random.range(0, size);
                const endZ = worldZ + random.range(0, size);
                
                roads.push({
                    start: new Vector3(startX, 0.02, startZ),
                    end: new Vector3(endX, 0.02, endZ),
                    width: 4,
                    type: "path"
                });
            }
        } else if (biome === "military") {
            // Military base has organized roads
            if (random.chance(0.6)) {
                roads.push({
                    start: new Vector3(worldX, 0.02, worldZ + size / 2),
                    end: new Vector3(worldX + size, 0.02, worldZ + size / 2),
                    width: 10,
                    type: "street"
                });
            }
            if (random.chance(0.6)) {
                roads.push({
                    start: new Vector3(worldX + size / 2, 0.02, worldZ),
                    end: new Vector3(worldX + size / 2, 0.02, worldZ + size),
                    width: 10,
                    type: "street"
                });
            }
        }
        
        this.roads.set(key, roads);
        return roads;
    }
    
    // Create road meshes for a chunk
    createRoadMeshes(chunkX: number, chunkZ: number, biome: string, parentNode: any): Mesh[] {
        const roads = this.generateRoadsForChunk(chunkX, chunkZ, biome);
        const meshes: Mesh[] = [];
        
        for (let i = 0; i < roads.length; i++) {
            const road = roads[i];
            const mesh = this.createRoadMesh(road, `road_${chunkX}_${chunkZ}_${i}`);
            if (mesh) {
                mesh.parent = parentNode;
                meshes.push(mesh);
                
                // Add road markings
                const markings = this.createRoadMarkings(road, `marking_${chunkX}_${chunkZ}_${i}`);
                for (const marking of markings) {
                    marking.parent = parentNode;
                    meshes.push(marking);
                }
            }
        }
        
        return meshes;
    }
    
    private createRoadMesh(road: RoadSegment, name: string): Mesh | null {
        const direction = road.end.subtract(road.start);
        const length = direction.length();
        if (length < 1) return null;
        
        const center = road.start.add(direction.scale(0.5));
        const angle = Math.atan2(direction.x, direction.z);
        
        const mesh = MeshBuilder.CreateBox(name, {
            width: road.width,
            height: 0.1,
            depth: length
        }, this.scene);
        
        mesh.position = center;
        mesh.position.y = 0.05;
        mesh.rotation.y = angle;
        
        const mat = this.materials.get(road.type);
        if (mat) {
            mesh.material = mat;
        }
        
        // Add physics (static ground)
        new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        
        return mesh;
    }
    
    private createRoadMarkings(road: RoadSegment, baseName: string): Mesh[] {
        const markings: Mesh[] = [];
        
        if (road.type === "path") return markings; // No markings on paths
        
        const direction = road.end.subtract(road.start);
        const length = direction.length();
        if (length < 5) return markings;
        
        const normalized = direction.normalize();
        const angle = Math.atan2(direction.x, direction.z);
        
        // Center line (dashed for streets, solid for highways)
        if (road.type === "highway") {
            // Solid yellow center line
            const centerLine = MeshBuilder.CreateBox(`${baseName}_center`, {
                width: 0.15,
                height: 0.02,
                depth: length - 2
            }, this.scene);
            
            const center = road.start.add(direction.scale(0.5));
            centerLine.position = new Vector3(center.x, 0.12, center.z);
            centerLine.rotation.y = angle;
            centerLine.material = this.materials.get("markingYellow")!;
            centerLine.isPickable = false;
            markings.push(centerLine);
            
            // Edge lines (white)
            for (const side of [-1, 1]) {
                const offset = side * (road.width / 2 - 0.5);
                const perpendicular = new Vector3(-normalized.z, 0, normalized.x);
                
                const edgeLine = MeshBuilder.CreateBox(`${baseName}_edge_${side}`, {
                    width: 0.15,
                    height: 0.02,
                    depth: length - 2
                }, this.scene);
                
                const edgePos = center.add(perpendicular.scale(offset));
                edgeLine.position = new Vector3(edgePos.x, 0.12, edgePos.z);
                edgeLine.rotation.y = angle;
                edgeLine.material = this.materials.get("marking")!;
                edgeLine.isPickable = false;
                markings.push(edgeLine);
            }
        } else if (road.type === "street") {
            // Dashed white center line
            const dashLength = 3;
            const gapLength = 3;
            const numDashes = Math.floor(length / (dashLength + gapLength));
            
            for (let i = 0; i < numDashes; i++) {
                const t = (i * (dashLength + gapLength) + dashLength / 2) / length;
                const dashPos = road.start.add(direction.scale(t));
                
                const dash = MeshBuilder.CreateBox(`${baseName}_dash_${i}`, {
                    width: 0.12,
                    height: 0.02,
                    depth: dashLength
                }, this.scene);
                
                dash.position = new Vector3(dashPos.x, 0.12, dashPos.z);
                dash.rotation.y = angle;
                dash.material = this.materials.get("marking")!;
                dash.isPickable = false;
                markings.push(dash);
            }
        }
        
        return markings;
    }
    
    // Check if a point is on a road
    isOnRoad(worldX: number, worldZ: number): boolean {
        const chunkX = Math.floor(worldX / this.config.chunkSize);
        const chunkZ = Math.floor(worldZ / this.config.chunkSize);
        const key = `${chunkX}_${chunkZ}`;
        
        const roads = this.roads.get(key);
        if (!roads) return false;
        
        for (const road of roads) {
            if (this.isPointOnSegment(worldX, worldZ, road)) {
                return true;
            }
        }
        
        return false;
    }
    
    private isPointOnSegment(x: number, z: number, road: RoadSegment): boolean {
        const dx = road.end.x - road.start.x;
        const dz = road.end.z - road.start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        
        if (length < 1) return false;
        
        // Project point onto line
        const t = ((x - road.start.x) * dx + (z - road.start.z) * dz) / (length * length);
        
        if (t < 0 || t > 1) return false;
        
        // Distance from projected point
        const projX = road.start.x + t * dx;
        const projZ = road.start.z + t * dz;
        const dist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
        
        return dist < road.width / 2;
    }
    
    // Get road width at a point (0 if not on road)
    getRoadWidth(worldX: number, worldZ: number): number {
        const chunkX = Math.floor(worldX / this.config.chunkSize);
        const chunkZ = Math.floor(worldZ / this.config.chunkSize);
        const key = `${chunkX}_${chunkZ}`;
        
        const roads = this.roads.get(key);
        if (!roads) return 0;
        
        for (const road of roads) {
            if (this.isPointOnSegment(worldX, worldZ, road)) {
                return road.width;
            }
        }
        
        return 0;
    }
    
    // Clear roads for a chunk (when unloading)
    clearChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        this.roads.delete(key);
        this.intersections.delete(key);
    }
}

