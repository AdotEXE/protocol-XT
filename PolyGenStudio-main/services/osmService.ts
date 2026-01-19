// Simple OSM Fetcher using Overpass API
// Fetches buildings, roads, water from OpenStreetMap

export interface OSMNode {
    id: number;
    lat: number;
    lon: number;
}

export interface OSMWay {
    id: number;
    nodes: number[];
    tags: Record<string, string>;
}

export interface OSMData {
    nodes: Map<number, OSMNode>;
    buildings: OSMWay[];
    water: OSMWay[];
    highways: OSMWay[];
}

const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
];

export const fetchOSMData = async (lat: number, lng: number, radius: number = 500): Promise<OSMData> => {
    const query = `
    [out:json][timeout:90];
    (
      way["building"](around:${radius},${lat},${lng});
      way["natural"="water"](around:${radius},${lat},${lng});
      way["waterway"](around:${radius},${lat},${lng});
      way["highway"](around:${radius},${lat},${lng});
    );
    (._;>;);
    out body;
  `;

    let lastError: Error | null = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            console.log(`[OSM] Fetching data from: ${endpoint}`);
            const url = `${endpoint}?data=${encodeURIComponent(query)}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 95000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429 || response.status === 504 || response.status >= 500) {
                    throw new Error(`Server Error ${response.status}`);
                }
                throw new Error(`Overpass API Error: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();

            if (text.trim().startsWith('<')) {
                throw new Error("Received HTML instead of JSON. Server likely overloaded.");
            }

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error("Invalid JSON response.");
            }

            const nodes = new Map<number, OSMNode>();
            const buildings: OSMWay[] = [];
            const water: OSMWay[] = [];
            const highways: OSMWay[] = [];

            if (json.elements) {
                for (const el of json.elements) {
                    if (el.type === 'node') {
                        nodes.set(el.id, { id: el.id, lat: el.lat, lon: el.lon });
                    } else if (el.type === 'way' && el.tags) {
                        if (el.tags.building) buildings.push(el as OSMWay);
                        else if (el.tags.natural === 'water' || el.tags.waterway) water.push(el as OSMWay);
                        else if (el.tags.highway) highways.push(el as OSMWay);
                    }
                }
            }

            console.log(`[OSM] Loaded: ${buildings.length} buildings, ${highways.length} roads, ${water.length} water`);
            return { nodes, buildings, water, highways };

        } catch (error) {
            console.warn(`[OSM] Failed to fetch from ${endpoint}:`, error);
            lastError = error as Error;
        }
    }

    throw lastError || new Error("All map data providers failed. Please try again later.");
};
