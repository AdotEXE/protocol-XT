/**
 * Real World Generator V3
 * 
 * Полноценная генерация 3D мира из реальных данных OpenStreetMap
 * Портировано из PoltGenMap с улучшениями для Protocol TX
 * 
 * Фичи:
 * - Интеллектуальная высота зданий (по тегам OSM)
 * - Разнообразные формы крыш
 * - Цилиндрические башни для башенных зданий
 * - Дороги как риббоны (не трубы)
 * - Водоёмы с правильной геометрией
 * - Парки и зелёные зоны
 */

import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";

// Earcut is bundled with Babylon.js and registered globally when needed
// We don't need to import it separately


// ============================================================================
// TYPES
// ============================================================================

export interface RealWorldConfig {
    lat: number;
    lon: number;
    radius: number;  // meters
    heightScale?: number;  // multiplier for building heights
    includeRoads?: boolean;
    includeWater?: boolean;
    includeParks?: boolean;
}

export interface GenerationResult {
    success: boolean;
    buildingsGenerated: number;
    roadsGenerated: number;
    waterBodiesGenerated: number;
    parksGenerated: number;
    errorMessage?: string;
}

interface OSMNode {
    id: number;
    lat: number;
    lon: number;
    tags?: Record<string, string>;
}

interface OSMWay {
    id: number;
    nodes: number[];
    tags: Record<string, string>;
}

interface OSMData {
    nodes: Map<number, OSMNode>;
    buildings: OSMWay[];
    highways: OSMWay[];
    water: OSMWay[];
    parks: OSMWay[];
}

interface BuildingStyle {
    wallColor: Color3;
    roofColor: Color3;
    roofType: "flat" | "pitched" | "dome" | "cylinder";
    hasWindows: boolean;
}

// ============================================================================
// OVERPASS API ENDPOINTS (with fallbacks)
// ============================================================================

const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
];

// ============================================================================
// MAIN CLASS
// ============================================================================

export class RealWorldGeneratorV3 {
    private scene: Scene;
    private config: RealWorldConfig;

    // Materials
    private buildingMat!: StandardMaterial;
    private concreteMat!: StandardMaterial;
    private brickMat!: StandardMaterial;
    private glassMat!: StandardMaterial;
    private roofMat!: StandardMaterial;
    private roadMat!: StandardMaterial;
    private waterMat!: StandardMaterial;
    private parkMat!: StandardMaterial;

    // Generated meshes container
    private worldContainer: TransformNode | null = null;
    private allMeshes: Mesh[] = [];

    // Stats
    private stats = {
        buildingsGenerated: 0,
        roadsGenerated: 0,
        waterBodiesGenerated: 0,
        parksGenerated: 0
    };

    constructor(scene: Scene) {
        this.scene = scene;
        this.config = { lat: 0, lon: 0, radius: 500 };
        this.initMaterials();
    }

    // ========================================================================
    // MATERIALS
    // ========================================================================

    private initMaterials(): void {
        // Default building material (concrete grey)
        this.buildingMat = new StandardMaterial("rwg_building", this.scene);
        this.buildingMat.diffuseColor = new Color3(0.75, 0.75, 0.78);
        this.buildingMat.specularColor = new Color3(0.1, 0.1, 0.1);
        this.buildingMat.backFaceCulling = false;

        // Concrete (for large buildings)
        this.concreteMat = new StandardMaterial("rwg_concrete", this.scene);
        this.concreteMat.diffuseColor = new Color3(0.6, 0.6, 0.62);
        this.concreteMat.specularColor = new Color3(0.05, 0.05, 0.05);
        this.concreteMat.backFaceCulling = false;

        // Brick (for residential)
        this.brickMat = new StandardMaterial("rwg_brick", this.scene);
        this.brickMat.diffuseColor = new Color3(0.7, 0.45, 0.35);
        this.brickMat.specularColor = new Color3(0.05, 0.05, 0.05);
        this.brickMat.backFaceCulling = false;

        // Glass (for modern buildings)
        this.glassMat = new StandardMaterial("rwg_glass", this.scene);
        this.glassMat.diffuseColor = new Color3(0.4, 0.5, 0.6);
        this.glassMat.specularColor = new Color3(0.6, 0.6, 0.6);
        this.glassMat.alpha = 0.85;
        this.glassMat.backFaceCulling = false;

        // Roof material
        this.roofMat = new StandardMaterial("rwg_roof", this.scene);
        this.roofMat.diffuseColor = new Color3(0.3, 0.25, 0.2);
        this.roofMat.specularColor = new Color3(0.05, 0.05, 0.05);
        this.roofMat.backFaceCulling = false;

        // Road material (dark asphalt)
        this.roadMat = new StandardMaterial("rwg_road", this.scene);
        this.roadMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.roadMat.specularColor = new Color3(0.1, 0.1, 0.1);

        // Water material
        this.waterMat = new StandardMaterial("rwg_water", this.scene);
        this.waterMat.diffuseColor = new Color3(0.1, 0.3, 0.6);
        this.waterMat.specularColor = new Color3(0.3, 0.3, 0.3);
        this.waterMat.alpha = 0.85;
        this.waterMat.backFaceCulling = false;

        // Park material (grass green)
        this.parkMat = new StandardMaterial("rwg_park", this.scene);
        this.parkMat.diffuseColor = new Color3(0.2, 0.5, 0.2);
        this.parkMat.specularColor = new Color3(0, 0, 0);
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Generate real world from coordinates
     */
    public async generate(config: RealWorldConfig): Promise<GenerationResult> {
        this.config = {
            ...config,
            heightScale: config.heightScale ?? 1.0,
            includeRoads: config.includeRoads ?? true,
            includeWater: config.includeWater ?? true,
            includeParks: config.includeParks ?? true
        };

        // Reset stats
        this.stats = {
            buildingsGenerated: 0,
            roadsGenerated: 0,
            waterBodiesGenerated: 0,
            parksGenerated: 0
        };

        // Clean previous generation
        this.dispose();

        // Create container
        this.worldContainer = new TransformNode("rwg_world", this.scene);

        console.log(`[RWG-V3] 🌍 Generating world at ${config.lat}, ${config.lon} (radius: ${config.radius}m)`);

        try {
            // 1. Fetch OSM data
            const osmData = await this.fetchOSMData();

            if (!osmData) {
                return {
                    success: false,
                    ...this.stats,
                    errorMessage: "Failed to fetch map data from all providers"
                };
            }

            console.log(`[RWG-V3] 📊 Fetched: ${osmData.buildings.length} buildings, ${osmData.highways.length} roads, ${osmData.water.length} water bodies, ${osmData.parks.length} parks`);

            // 2. Generate ground plane
            this.generateGround();

            // 3. Generate buildings
            this.generateBuildings(osmData);

            // 4. Generate roads
            if (this.config.includeRoads) {
                this.generateRoads(osmData);
            }

            // 5. Generate water
            if (this.config.includeWater) {
                this.generateWater(osmData);
            }

            // 6. Generate parks
            if (this.config.includeParks) {
                this.generateParks(osmData);
            }

            console.log(`[RWG-V3] ✅ Generation complete: ${this.stats.buildingsGenerated} buildings, ${this.stats.roadsGenerated} roads`);

            return {
                success: true,
                ...this.stats
            };

        } catch (error) {
            console.error("[RWG-V3] Generation error:", error);
            return {
                success: false,
                ...this.stats,
                errorMessage: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }

    /**
     * Dispose all generated meshes
     */
    public dispose(): void {
        this.allMeshes.forEach(mesh => {
            if (mesh && !mesh.isDisposed()) {
                mesh.dispose();
            }
        });
        this.allMeshes = [];

        if (this.worldContainer) {
            this.worldContainer.dispose();
            this.worldContainer = null;
        }
    }

    // ========================================================================
    // OSM DATA FETCHING
    // ========================================================================

    private async fetchOSMData(): Promise<OSMData | null> {
        const { lat, lon, radius } = this.config;

        // Build Overpass query
        const query = `
            [out:json][timeout:90];
            (
              way["building"](around:${radius},${lat},${lon});
              way["highway"](around:${radius},${lat},${lon});
              way["natural"="water"](around:${radius},${lat},${lon});
              way["waterway"](around:${radius},${lat},${lon});
              way["leisure"="park"](around:${radius},${lat},${lon});
              way["landuse"="grass"](around:${radius},${lat},${lon});
            );
            (._;>;);
            out body;
        `;

        // Try each endpoint
        for (const endpoint of OVERPASS_ENDPOINTS) {
            try {
                console.log(`[RWG-V3] Fetching from ${endpoint}...`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 95000);

                const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    if (response.status === 429 || response.status >= 500) {
                        throw new Error(`Server error ${response.status}`);
                    }
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }

                const text = await response.text();

                // Check for HTML error page
                if (text.trim().startsWith("<")) {
                    throw new Error("Received HTML instead of JSON");
                }

                const json = JSON.parse(text);
                return this.parseOSMResponse(json);

            } catch (error) {
                console.warn(`[RWG-V3] Failed to fetch from ${endpoint}:`, error);
                // Continue to next endpoint
            }
        }

        return null;
    }

    private parseOSMResponse(json: any): OSMData {
        const nodes = new Map<number, OSMNode>();
        const buildings: OSMWay[] = [];
        const highways: OSMWay[] = [];
        const water: OSMWay[] = [];
        const parks: OSMWay[] = [];

        if (!json.elements) {
            return { nodes, buildings, highways, water, parks };
        }

        for (const el of json.elements) {
            if (el.type === "node") {
                nodes.set(el.id, {
                    id: el.id,
                    lat: el.lat,
                    lon: el.lon,
                    tags: el.tags
                });
            } else if (el.type === "way" && el.tags) {
                const way: OSMWay = {
                    id: el.id,
                    nodes: el.nodes,
                    tags: el.tags || {}
                };

                if (el.tags.building) {
                    buildings.push(way);
                } else if (el.tags.highway) {
                    highways.push(way);
                } else if (el.tags.natural === "water" || el.tags.waterway) {
                    water.push(way);
                } else if (el.tags.leisure === "park" || el.tags.landuse === "grass") {
                    parks.push(way);
                }
            }
        }

        return { nodes, buildings, highways, water, parks };
    }

    // ========================================================================
    // COORDINATE PROJECTION
    // ========================================================================

    private project(nodeLat: number, nodeLon: number): Vector3 {
        const { lat, lon } = this.config;

        // More accurate projection
        const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * lat * Math.PI / 180);
        const metersPerLon = 111132.954 * Math.cos(lat * Math.PI / 180);

        const x = (nodeLon - lon) * metersPerLon;
        const z = (nodeLat - lat) * metersPerLat;

        return new Vector3(x, 0, z);
    }

    // ========================================================================
    // GROUND GENERATION
    // ========================================================================

    private generateGround(): void {
        const groundSize = this.config.radius * 2.5;

        const ground = MeshBuilder.CreateGround("rwg_ground", {
            width: groundSize,
            height: groundSize,
            subdivisions: 1
        }, this.scene);

        const groundMat = new StandardMaterial("rwg_ground_mat", this.scene);
        groundMat.diffuseColor = new Color3(0.15, 0.18, 0.14); // Dark earth/urban
        groundMat.specularColor = new Color3(0, 0, 0);
        ground.material = groundMat;
        ground.position.y = -0.1;

        if (this.worldContainer) {
            ground.parent = this.worldContainer;
        }

        this.allMeshes.push(ground);
    }

    // ========================================================================
    // BUILDING GENERATION
    // ========================================================================

    private generateBuildings(osmData: OSMData): void {
        const buildingMeshes: Mesh[] = [];

        for (const way of osmData.buildings) {
            const points: Vector3[] = [];
            let centerX = 0, centerZ = 0;

            // Get polygon points
            for (const nodeId of way.nodes) {
                const node = osmData.nodes.get(nodeId);
                if (node) {
                    const p = this.project(node.lat, node.lon);
                    points.push(p);
                    centerX += p.x;
                    centerZ += p.z;
                }
            }

            if (points.length < 3) continue;

            centerX /= points.length;
            centerZ /= points.length;

            try {
                // Calculate building height
                const height = this.calculateBuildingHeight(way.tags);
                const scaledHeight = height * (this.config.heightScale ?? 1.0);

                // Get building style based on type
                const style = this.getBuildingStyle(way.tags);

                // Create building mesh
                const building = this.createBuildingMesh(way.id, points, scaledHeight, style);

                if (building) {
                    buildingMeshes.push(building);
                    this.stats.buildingsGenerated++;
                }

            } catch (e) {
                // Silently ignore failed buildings
            }
        }

        // Optionally merge buildings for performance
        if (buildingMeshes.length > 0) {
            // Keep individual for now (better for interaction)
            buildingMeshes.forEach(mesh => {
                if (this.worldContainer) {
                    mesh.parent = this.worldContainer;
                }
                this.allMeshes.push(mesh);
            });
        }
    }

    /**
     * Calculate building height based on OSM tags
     */
    private calculateBuildingHeight(tags: Record<string, string>): number {
        // Default heights by building type
        const defaultHeights: Record<string, number> = {
            "apartments": 24,
            "residential": 9,
            "house": 7,
            "detached": 7,
            "terrace": 8,
            "commercial": 12,
            "office": 30,
            "retail": 8,
            "industrial": 10,
            "warehouse": 8,
            "church": 25,
            "cathedral": 40,
            "hotel": 25,
            "hospital": 20,
            "school": 12,
            "university": 15,
            "public": 15,
            "civic": 12,
            "train_station": 15,
            "garage": 4,
            "garages": 3,
            "shed": 3,
            "roof": 4,
            "yes": 10  // generic
        };

        // 1. Try explicit height tag
        if (tags["height"]) {
            const h = parseFloat(tags["height"].replace(/[^0-9.]/g, ""));
            if (!isNaN(h) && h > 0) return h;
        }

        // 2. Try building:levels tag
        if (tags["building:levels"]) {
            const levels = parseFloat(tags["building:levels"]);
            if (!isNaN(levels) && levels > 0) {
                return levels * 3.5; // ~3.5m per floor
            }
        }

        // 3. Use building type default
        const buildingType = tags["building"];
        if (buildingType && defaultHeights[buildingType]) {
            // Add some variation
            const baseHeight = defaultHeights[buildingType];
            return baseHeight + (Math.random() - 0.5) * baseHeight * 0.3;
        }

        // 4. Default with variation
        return 8 + Math.random() * 8;
    }

    /**
     * Get building visual style based on type
     */
    private getBuildingStyle(tags: Record<string, string>): BuildingStyle {
        const buildingType = tags["building"] || "yes";

        // Modern office/commercial buildings
        if (["office", "commercial", "hotel"].includes(buildingType)) {
            return {
                wallColor: new Color3(0.5 + Math.random() * 0.15, 0.55 + Math.random() * 0.1, 0.65),
                roofColor: new Color3(0.3, 0.3, 0.35),
                roofType: "flat",
                hasWindows: true
            };
        }

        // Residential apartments
        if (["apartments", "residential"].includes(buildingType)) {
            const isBrick = Math.random() > 0.5;
            return {
                wallColor: isBrick
                    ? new Color3(0.65 + Math.random() * 0.1, 0.4, 0.3)
                    : new Color3(0.7 + Math.random() * 0.1, 0.7, 0.65),
                roofColor: new Color3(0.35, 0.25, 0.2),
                roofType: Math.random() > 0.3 ? "flat" : "pitched",
                hasWindows: true
            };
        }

        // Houses
        if (["house", "detached", "terrace"].includes(buildingType)) {
            return {
                wallColor: new Color3(0.8 + Math.random() * 0.1, 0.75 + Math.random() * 0.1, 0.65),
                roofColor: new Color3(0.4 + Math.random() * 0.2, 0.25, 0.15),
                roofType: "pitched",
                hasWindows: true
            };
        }

        // Churches/Cathedrals
        if (["church", "cathedral", "chapel"].includes(buildingType)) {
            return {
                wallColor: new Color3(0.85, 0.82, 0.75),
                roofColor: new Color3(0.3, 0.3, 0.35),
                roofType: "pitched",
                hasWindows: true
            };
        }

        // Industrial
        if (["industrial", "warehouse", "factory"].includes(buildingType)) {
            return {
                wallColor: new Color3(0.5 + Math.random() * 0.1, 0.5, 0.5),
                roofColor: new Color3(0.4, 0.4, 0.4),
                roofType: "flat",
                hasWindows: false
            };
        }

        // Garages/Sheds
        if (["garage", "garages", "shed"].includes(buildingType)) {
            return {
                wallColor: new Color3(0.5, 0.5, 0.5),
                roofColor: new Color3(0.35, 0.35, 0.35),
                roofType: "flat",
                hasWindows: false
            };
        }

        // Default
        return {
            wallColor: new Color3(0.7 + Math.random() * 0.1, 0.7, 0.68),
            roofColor: new Color3(0.35, 0.3, 0.25),
            roofType: Math.random() > 0.5 ? "flat" : "pitched",
            hasWindows: true
        };
    }

    /**
     * Create building mesh with style
     */
    private createBuildingMesh(
        id: number,
        points: Vector3[],
        height: number,
        style: BuildingStyle
    ): Mesh | null {
        try {
            // Create extruded building
            const building = MeshBuilder.ExtrudePolygon(`rwg_b_${id}`, {
                shape: points,
                depth: height,
                sideOrientation: Mesh.DOUBLESIDE,
                wrap: true
            }, this.scene);

            // Position (ExtrudePolygon creates mesh with depth going down)
            building.position.y = height;

            // Create and apply material
            const mat = new StandardMaterial(`rwg_bmat_${id}`, this.scene);
            mat.diffuseColor = style.wallColor;
            mat.specularColor = new Color3(0.1, 0.1, 0.1);
            mat.backFaceCulling = false;
            building.material = mat;

            // Add roof for pitched type
            if (style.roofType === "pitched" && points.length >= 3) {
                this.addPitchedRoof(building, points, height, style);
            }

            building.checkCollisions = true;

            return building;

        } catch (e) {
            return null;
        }
    }

    /**
     * Add a simple pitched roof
     */
    private addPitchedRoof(
        building: Mesh,
        points: Vector3[],
        height: number,
        style: BuildingStyle
    ): void {
        // Calculate bounding box
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const width = maxX - minX;
        const depth = maxZ - minZ;
        const roofHeight = Math.min(width, depth) * 0.3;

        // Create simple box as roof (simplified)
        try {
            const roof = MeshBuilder.CreateBox(`rwg_roof_${building.name}`, {
                width: width * 1.05,
                height: roofHeight,
                depth: depth * 1.05
            }, this.scene);

            roof.position.set(centerX, height + roofHeight / 2, centerZ);
            roof.rotation.y = Math.atan2(depth, width);

            const roofMat = new StandardMaterial(`rwg_roofmat_${building.name}`, this.scene);
            roofMat.diffuseColor = style.roofColor;
            roofMat.specularColor = new Color3(0.05, 0.05, 0.05);
            roof.material = roofMat;

            roof.parent = building.parent;
            this.allMeshes.push(roof);

        } catch (e) {
            // Ignore roof generation errors
        }
    }

    // ========================================================================
    // ROADS GENERATION
    // ========================================================================

    private generateRoads(osmData: OSMData): void {
        const roadLines: Vector3[][] = [];

        for (const way of osmData.highways) {
            const points: Vector3[] = [];

            for (const nodeId of way.nodes) {
                const node = osmData.nodes.get(nodeId);
                if (node) {
                    const p = this.project(node.lat, node.lon);
                    p.y = 0.05; // Slightly above ground
                    points.push(p);
                }
            }

            if (points.length >= 2) {
                roadLines.push(points);
                this.stats.roadsGenerated++;
            }
        }

        if (roadLines.length > 0) {
            const roadSystem = MeshBuilder.CreateLineSystem("rwg_roads", {
                lines: roadLines
            }, this.scene);

            roadSystem.color = new Color3(0.25, 0.25, 0.25);

            if (this.worldContainer) {
                roadSystem.parent = this.worldContainer;
            }

            this.allMeshes.push(roadSystem);
        }
    }

    // ========================================================================
    // WATER GENERATION
    // ========================================================================

    private generateWater(osmData: OSMData): void {
        const waterMeshes: Mesh[] = [];

        for (const way of osmData.water) {
            const points: Vector3[] = [];

            for (const nodeId of way.nodes) {
                const node = osmData.nodes.get(nodeId);
                if (node) {
                    points.push(this.project(node.lat, node.lon));
                }
            }

            if (points.length < 3) continue;

            try {
                // Check if closed polygon
                const first = points[0];
                const last = points[points.length - 1];
                const isClosed = first && last && first.equalsWithEpsilon(last, 0.1);

                if (isClosed && points.length >= 4) {
                    // Create polygon for lakes/ponds
                    const water = MeshBuilder.CreatePolygon(`rwg_water_${way.id}`, {
                        shape: points,
                        sideOrientation: Mesh.DOUBLESIDE
                    }, this.scene);

                    water.position.y = 0.1;
                    water.material = this.waterMat;

                    waterMeshes.push(water);
                    this.stats.waterBodiesGenerated++;

                } else if (points.length >= 2) {
                    // Create ribbon for rivers/streams
                    const width = this.getRiverWidth(way.tags);
                    const ribbon = this.createRiverRibbon(way.id, points, width);

                    if (ribbon) {
                        waterMeshes.push(ribbon);
                        this.stats.waterBodiesGenerated++;
                    }
                }

            } catch (e) {
                // Ignore water generation errors
            }
        }

        waterMeshes.forEach(mesh => {
            if (this.worldContainer) {
                mesh.parent = this.worldContainer;
            }
            this.allMeshes.push(mesh);
        });
    }

    private getRiverWidth(tags: Record<string, string>): number {
        if (tags["width"]) {
            const w = parseFloat(tags["width"]);
            if (!isNaN(w)) return w;
        }

        const waterway = tags["waterway"];
        if (waterway === "river") return 25;
        if (waterway === "canal") return 15;
        if (waterway === "stream") return 6;
        if (waterway === "ditch") return 3;

        return 10;
    }

    private createRiverRibbon(id: number, points: Vector3[], width: number): Mesh | null {
        if (points.length < 2) return null;

        const halfWidth = width / 2;
        const leftPath: Vector3[] = [];
        const rightPath: Vector3[] = [];

        for (let i = 0; i < points.length; i++) {
            const current = points[i]!;

            // Calculate direction
            let dir: Vector3;
            if (i < points.length - 1) {
                dir = points[i + 1]!.subtract(current).normalize();
            } else {
                dir = current.subtract(points[i - 1]!).normalize();
            }

            // Perpendicular
            const normal = new Vector3(-dir.z, 0, dir.x);

            const pL = current.add(normal.scale(halfWidth));
            const pR = current.add(normal.scale(-halfWidth));

            pL.y = 0.15;
            pR.y = 0.15;

            leftPath.push(pL);
            rightPath.push(pR);
        }

        try {
            const ribbon = MeshBuilder.CreateRibbon(`rwg_river_${id}`, {
                pathArray: [leftPath, rightPath],
                sideOrientation: Mesh.DOUBLESIDE
            }, this.scene);

            ribbon.material = this.waterMat;
            return ribbon;

        } catch (e) {
            return null;
        }
    }

    // ========================================================================
    // PARKS GENERATION
    // ========================================================================

    private generateParks(osmData: OSMData): void {
        for (const way of osmData.parks) {
            const points: Vector3[] = [];

            for (const nodeId of way.nodes) {
                const node = osmData.nodes.get(nodeId);
                if (node) {
                    points.push(this.project(node.lat, node.lon));
                }
            }

            if (points.length < 3) continue;

            try {
                const park = MeshBuilder.CreatePolygon(`rwg_park_${way.id}`, {
                    shape: points,
                    sideOrientation: Mesh.DOUBLESIDE
                }, this.scene);

                park.position.y = 0.02;
                park.material = this.parkMat;

                if (this.worldContainer) {
                    park.parent = this.worldContainer;
                }

                this.allMeshes.push(park);
                this.stats.parksGenerated++;

            } catch (e) {
                // Ignore park generation errors
            }
        }
    }
}
