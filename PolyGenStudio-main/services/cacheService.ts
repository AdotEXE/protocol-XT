// IndexedDB caching for downloaded map data
import { OSMData, OSMNode } from "./osmService";

const DB_NAME = 'PolyGenMapCache';
const STORE_NAME = 'maps';
const DB_VERSION = 1;

interface CachedMap {
    id: string;
    timestamp: number;
    osm: {
        nodes: [number, OSMNode][];
        buildings: any[];
        water: any[];
        highways: any[];
    };
    elevation: number[];
}

export const initCacheDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject("DB Error");

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
    });
};

export const saveMapToCache = async (seed: string, osm: OSMData, elevation: number[]) => {
    try {
        const db = await initCacheDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const nodesArray = Array.from(osm.nodes.entries());

        const record: CachedMap = {
            id: seed,
            timestamp: Date.now(),
            osm: {
                nodes: nodesArray,
                buildings: osm.buildings,
                water: osm.water,
                highways: osm.highways
            },
            elevation
        };

        store.put(record);
        console.log(`[Cache] Saved map: ${seed}`);
    } catch (e) {
        console.warn("[Cache] Failed to cache map", e);
    }
};

export const loadMapFromCache = async (seed: string): Promise<{ osm: OSMData, elevation: number[] } | null> => {
    try {
        const db = await initCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(seed);

            request.onsuccess = () => {
                const result = request.result as CachedMap;
                if (result) {
                    const nodesMap = new Map<number, OSMNode>(result.osm.nodes);
                    console.log(`[Cache] Loaded map: ${seed}`);
                    resolve({
                        osm: {
                            nodes: nodesMap,
                            buildings: result.osm.buildings,
                            water: result.osm.water,
                            highways: result.osm.highways
                        },
                        elevation: result.elevation
                    });
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
};
