/**
 * OSMBuildings Data API Service
 * 
 * Fetches pre-processed building data from OSMBuildings tile server.
 * Much faster than Overpass API due to optimized tile-based streaming.
 * 
 * API: https://{s}.data.osmbuildings.org/0.2/{key}/tile/{z}/{x}/{y}.json
 */

export interface OSMBuildingProperties {
    height?: number;
    minHeight?: number;
    levels?: number;
    minLevel?: number;
    color?: string;
    roofColor?: string;
    roofShape?: string;
    roofHeight?: number;
    shape?: string;
    id?: string | number;
}

export interface OSMBuildingFeature {
    type: 'Feature';
    properties: OSMBuildingProperties;
    geometry: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: number[][][] | number[][][][];
    };
}

export interface OSMBuildingsResponse {
    type: 'FeatureCollection';
    features: OSMBuildingFeature[];
}

// Public API key from OSMBuildings documentation
const API_KEY = '59fcc2e8';
const TILE_SERVERS = ['a', 'b', 'c', 'd'];

/**
 * Convert lat/lng to tile coordinates at a given zoom level
 * Uses Web Mercator projection (standard for web maps)
 */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

/**
 * Convert tile coordinates back to lat/lng (top-left corner of tile)
 */
export function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
    const n = Math.pow(2, zoom);
    const lng = x / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lng };
}

/**
 * Calculate the optimal zoom level for a given radius
 * Higher zoom = more detail but more tiles
 * NOTE: OSMBuildings API only supports up to zoom 16 for most regions
 */
function getOptimalZoom(radiusMeters: number): number {
    // Max zoom is 16 - zoom 17+ returns 400 errors for most regions
    if (radiusMeters <= 200) return 16; // Was 17, but causes 400 errors
    if (radiusMeters <= 400) return 16;
    if (radiusMeters <= 800) return 15;
    return 14;
}

/**
 * Calculate which tiles cover a circular area
 */
function getTilesForArea(
    centerLat: number,
    centerLng: number,
    radiusMeters: number,
    zoom: number
): { x: number; y: number }[] {
    // Approximate degrees per meter at this latitude
    const metersPerDegLat = 111132.92;
    const metersPerDegLng = 111412.84 * Math.cos(centerLat * Math.PI / 180);

    // Convert radius to degrees
    const latDelta = radiusMeters / metersPerDegLat;
    const lngDelta = radiusMeters / metersPerDegLng;

    // Get corner tiles
    const topLeft = latLngToTile(centerLat + latDelta, centerLng - lngDelta, zoom);
    const bottomRight = latLngToTile(centerLat - latDelta, centerLng + lngDelta, zoom);

    // Collect all tiles in the bounding box
    const tiles: { x: number; y: number }[] = [];
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
        for (let y = topLeft.y; y <= bottomRight.y; y++) {
            tiles.push({ x, y });
        }
    }

    return tiles;
}

/**
 * Fetch a single tile from OSMBuildings server
 */
async function fetchTile(
    x: number,
    y: number,
    zoom: number,
    retries = 3
): Promise<OSMBuildingFeature[]> {
    const server = TILE_SERVERS[(x + y) % TILE_SERVERS.length];
    const url = `https://${server}.data.osmbuildings.org/0.2/${API_KEY}/tile/${zoom}/${x}/${y}.json`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url);

            if (response.status === 404) {
                // No data for this tile - that's fine
                return [];
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OSMBuildingsResponse = await response.json();
            return data.features || [];

        } catch (error) {
            lastError = error as Error;
            // Wait before retry with exponential backoff
            if (attempt < retries - 1) {
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
            }
        }
    }

    console.warn(`[OSMBuildings] Failed to fetch tile ${zoom}/${x}/${y}:`, lastError);
    return [];
}

/**
 * Fetch all building data for a circular area
 * 
 * @param lat - Center latitude
 * @param lng - Center longitude
 * @param radiusMeters - Radius in meters
 * @param onProgress - Optional progress callback (0-100)
 * @returns Array of building features as GeoJSON
 */
export async function fetchOSMBuildingsData(
    lat: number,
    lng: number,
    radiusMeters: number,
    onProgress?: (percent: number) => void
): Promise<OSMBuildingFeature[]> {
    const zoom = getOptimalZoom(radiusMeters);
    const tiles = getTilesForArea(lat, lng, radiusMeters, zoom);

    console.log(`[OSMBuildings] Fetching ${tiles.length} tiles at zoom ${zoom}`);

    const allFeatures: OSMBuildingFeature[] = [];
    const seenIds = new Set<string | number>();

    // Fetch tiles in parallel batches to avoid overwhelming the server
    const BATCH_SIZE = 4;

    for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
        const batch = tiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batch.map(tile => fetchTile(tile.x, tile.y, zoom))
        );

        // Merge results, deduplicating by ID
        for (const features of results) {
            for (const feature of features) {
                const id = feature.properties?.id;
                if (id && seenIds.has(id)) continue;
                if (id) seenIds.add(id);
                allFeatures.push(feature);
            }
        }

        if (onProgress) {
            onProgress(Math.round(((i + batch.length) / tiles.length) * 100));
        }
    }

    console.log(`[OSMBuildings] Loaded ${allFeatures.length} buildings from ${tiles.length} tiles`);
    return allFeatures;
}

/**
 * STREAMING VERSION: Fetch buildings progressively with real-time callbacks
 * 
 * @param lat - Center latitude
 * @param lng - Center longitude
 * @param radiusMeters - Radius in meters
 * @param onBatch - Called for each batch of buildings loaded (enables progressive rendering)
 * @param onComplete - Called when all tiles are loaded
 */
export async function streamOSMBuildingsData(
    lat: number,
    lng: number,
    radiusMeters: number,
    onBatch: (features: OSMBuildingFeature[], progress: number, totalTiles: number) => void,
    onComplete?: (totalFeatures: number) => void
): Promise<void> {
    const zoom = getOptimalZoom(radiusMeters);
    const tiles = getTilesForArea(lat, lng, radiusMeters, zoom);

    console.log(`[OSMBuildings] Streaming ${tiles.length} tiles at zoom ${zoom}`);

    const seenIds = new Set<string | number>();
    let totalFeatures = 0;

    // Helper to delay between batches (prevents WebGL Context Lost)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Fetch tiles one by one for smooth progressive loading
    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];

        try {
            const features = await fetchTile(tile.x, tile.y, zoom);

            // Filter duplicates
            const newFeatures: OSMBuildingFeature[] = [];
            for (const feature of features) {
                const id = feature.properties?.id;
                if (id && seenIds.has(id)) continue;
                if (id) seenIds.add(id);
                newFeatures.push(feature);
            }

            if (newFeatures.length > 0) {
                totalFeatures += newFeatures.length;
                const progress = Math.round(((i + 1) / tiles.length) * 100);
                onBatch(newFeatures, progress, tiles.length);

                // IMPORTANT: Small delay to let WebGL process the new objects
                // This prevents "WebGL Context Lost" errors
                await delay(500);
            }
        } catch (error) {
            console.warn(`[OSMBuildings] Failed to fetch tile ${tile.x}/${tile.y}:`, error);
        }
    }

    console.log(`[OSMBuildings] Streaming complete: ${totalFeatures} buildings`);
    if (onComplete) {
        onComplete(totalFeatures);
    }
}

