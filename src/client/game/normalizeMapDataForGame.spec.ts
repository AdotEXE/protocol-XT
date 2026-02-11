import { describe, it, expect } from "vitest";
import {
    normalizeMapDataForGame,
    type NormalizedMapData,
    type NormalizedMapDataMetadata,
} from "./normalizeMapDataForGame";

describe("normalizeMapDataForGame", () => {
    it("returns null for null or non-object", () => {
        expect(normalizeMapDataForGame(null)).toBe(null);
        expect(normalizeMapDataForGame(undefined)).toBe(null);
        expect(normalizeMapDataForGame(42)).toBe(null);
        expect(normalizeMapDataForGame("")).toBe(null);
    });

    it("returns null when name is missing", () => {
        expect(normalizeMapDataForGame({})).toBe(null);
        expect(normalizeMapDataForGame({ mapType: "normal" })).toBe(null);
    });

    it("normalizes minimal valid object", () => {
        const result = normalizeMapDataForGame({ name: "Test Map" });
        expect(result).not.toBe(null);
        const out = result as NormalizedMapData;
        expect(out.version).toBe(1);
        expect(out.name).toBe("Test Map");
        expect(out.mapType).toBe("normal");
        expect(out.terrainEdits).toEqual([]);
        expect(out.placedObjects).toEqual([]);
        expect(out.triggers).toEqual([]);
        expect(out.metadata).toBeDefined();
        expect(typeof (out.metadata as NormalizedMapDataMetadata).createdAt).toBe("number");
    });

    it("preserves mapType, arrays and seed", () => {
        const input = {
            name: "Custom",
            mapType: "desert",
            terrainEdits: [{ x: 1 }],
            placedObjects: [{ id: "tree" }],
            triggers: [{ type: "start" }],
            seed: 12345,
        };
        const result = normalizeMapDataForGame(input) as NormalizedMapData;
        expect(result.mapType).toBe("desert");
        expect(result.terrainEdits).toEqual([{ x: 1 }]);
        expect(result.placedObjects).toEqual([{ id: "tree" }]);
        expect(result.triggers).toEqual([{ type: "start" }]);
        expect(result.seed).toBe(12345);
    });

    it("normalizes metadata", () => {
        const input = {
            name: "Meta Map",
            metadata: {
                createdAt: 1000,
                modifiedAt: 2000,
                author: "Dev",
                description: "A map",
                isPreset: true,
                mapSize: 512,
            },
        };
        const result = normalizeMapDataForGame(input) as NormalizedMapData;
        const meta = result.metadata as NormalizedMapDataMetadata;
        expect(meta.createdAt).toBe(1000);
        expect(meta.modifiedAt).toBe(2000);
        expect(meta.author).toBe("Dev");
        expect(meta.description).toBe("A map");
        expect(meta.isPreset).toBe(true);
        expect(meta.mapSize).toBe(512);
    });

    it("sets isPreset from name prefix when not in metadata", () => {
        const withPrefix = normalizeMapDataForGame({ name: "[Предустановленная] Hills" }) as NormalizedMapData;
        expect((withPrefix.metadata as NormalizedMapDataMetadata).isPreset).toBe(true);
        const withoutPrefix = normalizeMapDataForGame({ name: "Hills" }) as NormalizedMapData;
        expect((withoutPrefix.metadata as NormalizedMapDataMetadata).isPreset).toBe(false);
    });
});
