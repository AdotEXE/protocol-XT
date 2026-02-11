/**
 * Извлечение сырых позиций спавна из данных кастомной карты (triggers + placedObjects или дефолты).
 * Используется в Game.injectCustomMapSpawnPositions().
 */

import { Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { NormalizedMapData } from "./normalizeMapDataForGame";

function getPos(obj: { position?: { x: number; y?: number; z: number } }): Vector3 | null {
    if (!obj.position || typeof obj.position.x !== "number" || typeof obj.position.z !== "number") return null;
    return new Vector3(obj.position.x, obj.position.y ?? 2, obj.position.z);
}

/**
 * Собирает массив сырых позиций спавна из customMapData.
 * Сначала из triggers (type === 'spawn'), затем из placedObjects (type === 'spawn') — они добавляются в начало.
 * Если позиций нет — возвращает дефолтные по mapSize.
 */
export function getRawSpawnPositionsFromMapData(customMapData: NormalizedMapData | Record<string, unknown>): Vector3[] {
    const raw: Vector3[] = [];

    const triggers = customMapData.triggers;
    if (Array.isArray(triggers)) {
        for (const trigger of triggers as { type?: string; position?: { x: number; y?: number; z: number } }[]) {
            if (trigger.type === "spawn") {
                const p = getPos(trigger);
                if (p) raw.push(p);
            }
        }
    }

    const placedObjects = customMapData.placedObjects;
    if (Array.isArray(placedObjects)) {
        const spawnObjects: Vector3[] = [];
        for (const obj of placedObjects as { type?: string; position?: { x: number; y?: number; z: number } }[]) {
            if (obj.type === "spawn") {
                const p = getPos(obj);
                if (p) spawnObjects.push(p);
            }
        }
        if (spawnObjects.length > 0) {
            raw.unshift(...spawnObjects);
            logger.log(`[Game] Found ${spawnObjects.length} spawn point objects from placedObjects - they will be used FIRST`);
        }
    }

    if (raw.length === 0) {
        logger.warn("[Game] No spawn positions in custom map - creating defaults");
        const mapSize = (customMapData as { mapSize?: number }).mapSize ?? (customMapData.metadata as { mapSize?: number } | undefined)?.mapSize ?? 200;
        const half = mapSize / 2;
        const offset = half * 0.7;
        raw.push(
            new Vector3(-offset, 2, -offset),
            new Vector3(offset, 2, -offset),
            new Vector3(-offset, 2, offset),
            new Vector3(offset, 2, offset),
            new Vector3(0, 2, 0)
        );
    }

    return raw;
}
