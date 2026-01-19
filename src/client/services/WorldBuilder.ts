
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { OverpassService, MapBounds } from "./OverpassService";
import { GeoDataService, WorldEntity } from "./GeoDataService";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics";

export interface WorldBuilderOptions {
    scene: Scene;
    centerLat: number;
    centerLon: number;
    radius: number; // meters (approx)
}

/**
 * Main service to generate 3D world from real-world coordinates
 */
export class WorldBuilder {
    private scene: Scene;
    private overpass: OverpassService;
    private geo: GeoDataService;

    // Materials
    private roadMat: StandardMaterial;
    private buildingMat: StandardMaterial;
    private waterMat: StandardMaterial;
    private parkMat: StandardMaterial;

    constructor(scene: Scene) {
        this.scene = scene;
        this.overpass = new OverpassService();
        this.geo = new GeoDataService();

        this.initMaterials();
    }

    private initMaterials() {
        this.roadMat = new StandardMaterial("roadMat", this.scene);
        this.roadMat.diffuseColor = new Color3(0.15, 0.15, 0.15); // Dark asphalt
        this.roadMat.specularColor = new Color3(0.1, 0.1, 0.1);
        this.roadMat.roughness = 0.8;

        this.buildingMat = new StandardMaterial("buildingMat", this.scene);
        this.buildingMat.diffuseColor = new Color3(0.7, 0.7, 0.7);
        this.buildingMat.specularColor = new Color3(0.1, 0.1, 0.1);

        this.waterMat = new StandardMaterial("waterMat", this.scene);
        this.waterMat.diffuseColor = new Color3(0.1, 0.4, 0.8);
        this.waterMat.specularColor = new Color3(0.5, 0.5, 0.5);
        this.waterMat.alpha = 0.7;
        this.waterMat.backFaceCulling = false;

        this.parkMat = new StandardMaterial("parkMat", this.scene);
        this.parkMat.diffuseColor = new Color3(0.2, 0.6, 0.2); // Lush green
        this.parkMat.specularColor = new Color3(0, 0, 0); // Grass isn't shiny
    }

    /**
     * Download and process map data for a specific location
     * @returns Array of WorldEntity to be saved or rendered
     */
    public async downloadArea(lat: number, lon: number, radiusMeters: number = 500): Promise<WorldEntity[]> {
        console.log(`[WorldBuilder] Downloading area at ${lat}, ${lon} (radius: ${radiusMeters}m)`);

        // Convert radius to degree offsets (rough approximation)
        const latOffset = radiusMeters / 111132;
        const lonOffset = radiusMeters / (111321 * Math.cos(lat * Math.PI / 180));

        const bounds: MapBounds = {
            south: lat - latOffset,
            north: lat + latOffset,
            west: lon - lonOffset,
            east: lon + lonOffset
        };

        // 1. Fetch Data
        const osmData = await this.overpass.fetchMapData(bounds);

        // 2. Process Data
        return this.geo.processMapData(osmData);
    }

    /**
     * Generate meshes from pre-processed entities
     */
    public async buildWorldFromEntities(entities: WorldEntity[]): Promise<void> {
        console.log(`[WorldBuilder] Building world from ${entities.length} entities...`);
        this.buildEntities(entities);
    }

    /**
     * Generate world around a specific coordinate (Legacy/Direct)
     */
    public async generateWorld(lat: number, lon: number, radiusMeters: number = 500): Promise<void> {
        const entities = await this.downloadArea(lat, lon, radiusMeters);
        this.buildEntities(entities);
    }

    private buildEntities(entities: WorldEntity[]) {
        // Group by type for efficiency? For now, just iterate.
        let buildingCount = 0;
        let roadCount = 0;

        for (const entity of entities) {
            if (entity.type === "building") {
                this.buildBuilding(entity);
                buildingCount++;
            } else if (entity.type === "road") {
                this.buildRoad(entity);
                roadCount++;
            } else if (entity.type === "water" || entity.type === "park") {
                this.buildArea(entity);
            }
        }

        console.log(`[WorldBuilder] Built ${buildingCount} buildings, ${roadCount} roads`);
    }

    private buildBuilding(entity: WorldEntity) {
        if (entity.points.length < 3) return;

        // Ensure closed loop
        const path = [...entity.points];
        if (!path[0].equals(path[path.length - 1])) {
            path.push(path[0]);
        }

        try {
            const building = MeshBuilder.ExtrudePolygon("b_" + entity.id, {
                shape: path,
                depth: entity.height || 10,
                sideOrientation: Mesh.DOUBLESIDE,
                wrap: true
            }, this.scene);

            building.position.y = (entity.height || 10);

            // Randomize building color slightly for realism
            if (!entity.tags?.["color"]) { // Only if no specific color tag
                const randomVal = Math.random();
                const mat = this.buildingMat.clone("b_mat_" + entity.id);
                if (randomVal > 0.7) {
                    mat.diffuseColor = new Color3(0.8 + Math.random() * 0.1, 0.8 + Math.random() * 0.1, 0.75); // Beige/White
                } else if (randomVal > 0.4) {
                    mat.diffuseColor = new Color3(0.6 + Math.random() * 0.1, 0.6 + Math.random() * 0.1, 0.65); // Grey
                } else {
                    mat.diffuseColor = new Color3(0.7 + Math.random() * 0.1, 0.6, 0.5); // Brick-ish
                }
                building.material = mat;
            } else {
                building.material = this.buildingMat;
            }

            building.checkCollisions = true;

            // Add Physics Impostor (Static)
            new PhysicsAggregate(building, PhysicsShapeType.MESH, { mass: 0, restitution: 0.1 }, this.scene);
        } catch (e) {
            // console.warn("Failed to build polygon", e);
        }
    }

    private buildRoad(entity: WorldEntity) {
        if (entity.points.length < 2) return;

        // Create ribbon or tube
        const road = MeshBuilder.CreateTube("r_" + entity.id, {
            path: entity.points,
            radius: 2, // Road width approx 4m
            tessellation: 4
        }, this.scene);

        road.material = this.roadMat;
        // road.position.y = 0.1; // Slight offset to prevent z-fighting if we have ground

        // Add Physics
        new PhysicsAggregate(road, PhysicsShapeType.MESH, { mass: 0, restitution: 0.1, friction: 0.8 }, this.scene);
    }

    private buildArea(entity: WorldEntity) {
        if (entity.points.length < 3) return;

        try {
            const area = MeshBuilder.CreatePolygon("a_" + entity.id, {
                shape: entity.points,
                sideOrientation: Mesh.DOUBLESIDE
            }, this.scene);

            area.position.y = 0.05;
            area.material = entity.type === "water" ? this.waterMat : this.parkMat;
        } catch (e) {
            // ignore
        }
    }

    /**
     * Clear all generated meshes
     */
    public clear() {
        // TODO: Track created meshes and dispose them
    }
}
