import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { logger } from "../utils/logger";

export interface MapBounds {
    south: number;
    west: number;
    north: number;
    east: number;
}

export interface OSMNode {
    id: number;
    lat: number;
    lon: number;
    tags?: Record<string, string>;
}

export interface OSMWay {
    id: number;
    nodes: number[];
    tags?: Record<string, string>;
}

export interface OSMData {
    nodes: Record<number, OSMNode>;
    ways: Record<number, OSMWay>;
    bounds: MapBounds;
}

/**
 * Service to fetch real-world map data from OpenStreetMap via Overpass API
 */
export class OverpassService {
    private static readonly OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

    /**
     * Fetch map data for a specific bounding box
     * @param bounds Bounding box coordinates
     */
    public async fetchMapData(bounds: MapBounds): Promise<OSMData> {
        logger.log("[OverpassService] Fetching map data for bounds:", bounds);

        // Query to get ways (roads, buildings) and their nodes within the bounding box
        // We use [out:json] for JSON response
        const query = `
            [out:json][timeout:25];
            (
              way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
              way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
              way["leisure"="park"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
              way["landuse"="grass"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
              way["waterway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
            );
            out body;
            >;
            out skel qt;
        `;

        try {
            const response = await fetch(OverpassService.OVERPASS_API_URL, {
                method: "POST",
                body: "data=" + encodeURIComponent(query),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });

            if (!response.ok) {
                throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return this.parseOverpassResponse(data, bounds);

        } catch (error) {
            logger.error("[OverpassService] API Request failed:", error);
            throw error;
        }
    }

    /**
     * Parse raw Overpass JSON into structured OSMData
     */
    private parseOverpassResponse(data: any, bounds: MapBounds): OSMData {
        const nodes: Record<number, OSMNode> = {};
        const ways: Record<number, OSMWay> = {};

        if (!data.elements) {
            logger.warn("[OverpassService] No elements found in response");
            return { nodes, ways, bounds };
        }

        for (const el of data.elements) {
            if (el.type === "node") {
                nodes[el.id] = {
                    id: el.id,
                    lat: el.lat,
                    lon: el.lon,
                    tags: el.tags
                };
            } else if (el.type === "way") {
                ways[el.id] = {
                    id: el.id,
                    nodes: el.nodes,
                    tags: el.tags
                };
            }
        }

        logger.log(`[OverpassService] Parsed ${Object.keys(nodes).length} nodes and ${Object.keys(ways).length} ways`);
        return { nodes, ways, bounds };
    }
}
