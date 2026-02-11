
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { OSMData, OSMNode, OSMWay, MapBounds } from "./OverpassService";
import { logger } from "../utils/logger";

export interface WorldEntity {
    id: string;
    type: "road" | "building" | "park" | "water";
    points: Vector3[];
    height?: number;
    tags?: Record<string, string>;
}

/**
 * Service to process raw OSM data into game world entities
 * Handles coordinate projection (Lat/Lon -> Meters)
 */
export class GeoDataService {
    // Meters per degree approximation (at equator/generic)
    // For more precision we calculate based on latitude
    private static readonly EARTH_RADIUS = 6378137; // Meters

    /**
     * Convert OSM Data into Game Entities (Vector3 coordinates)
     * Origin (0,0,0) will be the center of the bounds
     */
    public processMapData(osmData: OSMData): WorldEntity[] {
        const centerLat = (osmData.bounds.north + osmData.bounds.south) / 2;
        const centerLon = (osmData.bounds.east + osmData.bounds.west) / 2;

        const entities: WorldEntity[] = [];

        // Helper to project lat/lon to local x/z (meters) relative to center
        const project = (lat: number, lon: number): Vector3 => {
            const x = (lon - centerLon) * (Math.PI / 180) * GeoDataService.EARTH_RADIUS * Math.cos(centerLat * Math.PI / 180);
            const z = (lat - centerLat) * (Math.PI / 180) * GeoDataService.EARTH_RADIUS;
            return new Vector3(x, 0, z);
        };

        for (const wayId in osmData.ways) {
            const way = osmData.ways[wayId];
            if (!way || !way.tags) continue;

            const points: Vector3[] = [];
            let valid = true;

            for (const nodeId of way.nodes) {
                const node = osmData.nodes[nodeId];
                if (node) {
                    points.push(project(node.lat, node.lon));
                } else {
                    // Incomplete way (missing nodes usually due to clip)
                    // We can still try to render what we have or skip
                    // For now, let's keep partial if we have points
                }
            }

            if (points.length < 2) continue;

            let type: WorldEntity["type"] | null = null;
            let height = 0;

            if (way.tags["building"]) {
                type = "building";
                // Try to guess height from levels or height tag
                if (way.tags["building:levels"]) {
                    height = parseInt(way.tags["building:levels"]) * 3.5; // ~3.5m per floor
                } else if (way.tags["height"]) {
                    height = parseFloat(way.tags["height"]);
                } else {
                    height = 10; // Default height
                }
            } else if (way.tags["highway"]) {
                type = "road";
                height = 0.1; // Slightly raised
            } else if (way.tags["leisure"] === "park" || way.tags["landuse"] === "grass") {
                type = "park";
            } else if (way.tags["waterway"] || way.tags["natural"] === "water") {
                type = "water";
            }

            if (type) {
                entities.push({
                    id: String(way.id),
                    type: type,
                    points: points,
                    height: height,
                    tags: way.tags
                });
            }
        }

        logger.log(`[GeoDataService] Processed ${entities.length} world entities`);
        return entities;
    }
}
