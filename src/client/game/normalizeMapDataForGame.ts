/**
 * Нормализация MapData к единому формату (совместимо с MapEditor).
 * Вызывается из Game при загрузке кастомной карты.
 */

const CURRENT_VERSION = 1;

export interface NormalizedMapDataMetadata {
    createdAt?: number;
    modifiedAt?: number;
    author?: string;
    description?: string;
    isPreset?: boolean;
    mapSize?: number;
}

export interface NormalizedMapData {
    version: number;
    name: string;
    mapType: string;
    terrainEdits: unknown[];
    placedObjects: unknown[];
    triggers: unknown[];
    metadata: NormalizedMapDataMetadata;
    seed?: number;
}

/**
 * Нормализует сырые данные карты к единому формату.
 * @returns Нормализованный объект или null при невалидных данных
 */
export function normalizeMapDataForGame(data: unknown): NormalizedMapData | null {
    if (!data || typeof data !== "object" || !(data as Record<string, unknown>).name) {
        return null;
    }

    const d = data as Record<string, unknown>;
    const name = String(d.name);

    const normalized: NormalizedMapData = {
        version: CURRENT_VERSION,
        name,
        mapType: (d.mapType as string) || "normal",
        terrainEdits: Array.isArray(d.terrainEdits) ? d.terrainEdits : [],
        placedObjects: Array.isArray(d.placedObjects) ? d.placedObjects : [],
        triggers: Array.isArray(d.triggers) ? d.triggers : [],
        metadata: {
            createdAt: (d.metadata as Record<string, unknown>)?.createdAt as number | undefined ?? Date.now(),
            modifiedAt: (d.metadata as Record<string, unknown>)?.modifiedAt as number | undefined ?? Date.now(),
            author: (d.metadata as Record<string, unknown>)?.author as string | undefined,
            description: (d.metadata as Record<string, unknown>)?.description as string | undefined,
            isPreset: (d.metadata as Record<string, unknown>)?.isPreset !== undefined
                ? (d.metadata as Record<string, unknown>).isPreset as boolean
                : name.startsWith("[Предустановленная]"),
            mapSize: (d.metadata as Record<string, unknown>)?.mapSize as number | undefined
        }
    };

    if (d.seed !== undefined) {
        normalized.seed = d.seed as number;
    }

    return normalized;
}
