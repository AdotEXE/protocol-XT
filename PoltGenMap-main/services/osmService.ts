// Simple OSM Fetcher using Overpass API
// Limits radius to prevent browser crash

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
  // Timeout increased to 90s to prevent 504 Gateway Timeout on complex queries
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
      console.log(`Fetching map data from: ${endpoint}`);
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      
      // Client-side fetch timeout slightly larger than query timeout (95s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 95000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // If server is busy (429) or timed out (504), throw to trigger next loop
        if (response.status === 429 || response.status === 504 || response.status >= 500) {
           throw new Error(`Server Error ${response.status}`);
        }
        throw new Error(`Overpass API Error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      
      // Check for HTML response (common when rate-limited or error page)
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

      // If we got here, success
      return { nodes, buildings, water, highways };

    } catch (error) {
      console.warn(`Failed to fetch from ${endpoint}:`, error);
      lastError = error as Error;
      // Continue to next endpoint
    }
  }

  throw lastError || new Error("All map data providers failed. Please try again later.");
};