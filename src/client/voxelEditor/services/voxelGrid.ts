/**
 * Minimal voxel grid utilities for functional Voxel Editor.
 * Ported from ai_model_editor for TX integration.
 */

export enum VoxelMaterial {
    Empty = 0,
    Ground = 1,
    Building = 2,
    Road = 3,
    Water = 4,
}

export interface VoxelChunk {
    id: string;
    chunkX: number;
    chunkZ: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    voxelSize: number;
    data: Uint8Array;
}

// In the game, we likely want to allow edits, so we might toggle this to false later.
// For now, keeping it compatible with the source logic.
export const VOXEL_VISUAL_ONLY = false;

export interface VoxelChunkJSON {
    id: string;
    chunkX: number;
    chunkZ: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    voxelSize: number;
    data: number[];
}

export interface TerrainColumnsOptions {
    chunkX: number;
    chunkZ: number;
    sizeX: number;
    sizeZ: number;
    maxHeight: number;
    voxelSize: number;
    /**
     * Height of ground column in voxel units (0..maxHeight) for the given
     * local coordinates (x, z). Non‑integer values will be floored.
     */
    heightAt: (x: number, z: number) => number;
}

function indexOf(chunk: VoxelChunk, lx: number, ly: number, lz: number): number {
    const { sizeX, sizeY, sizeZ } = chunk;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= sizeX || ly >= sizeY || lz >= sizeZ) {
        return -1;
    }
    // x + z * sizeX + y * sizeX * sizeZ
    return lx + lz * sizeX + ly * sizeX * sizeZ;
}

export function createEmptyChunk(
    chunkX: number,
    chunkZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    voxelSize: number
): VoxelChunk {
    const total = sizeX * sizeY * sizeZ;
    const data = new Uint8Array(total);
    return {
        id: `chunk_${chunkX}_${chunkZ}`,
        chunkX,
        chunkZ,
        sizeX,
        sizeY,
        sizeZ,
        voxelSize,
        data,
    };
}

export function getVoxel(
    chunk: VoxelChunk,
    lx: number,
    ly: number,
    lz: number
): VoxelMaterial {
    const idx = indexOf(chunk, lx, ly, lz);
    if (idx < 0) return VoxelMaterial.Empty;
    return chunk.data[idx] as VoxelMaterial;
}

export function setVoxel(
    chunk: VoxelChunk,
    lx: number,
    ly: number,
    lz: number,
    mat: VoxelMaterial
): void {
    const idx = indexOf(chunk, lx, ly, lz);
    if (idx < 0) return;
    chunk.data[idx] = mat;
}

export function forEachVoxel(
    chunk: VoxelChunk,
    cb: (lx: number, ly: number, lz: number, mat: VoxelMaterial) => void
): void {
    const { sizeX, sizeY, sizeZ, data } = chunk;
    let idx = 0;
    for (let y = 0; y < sizeY; y++) {
        for (let z = 0; z < sizeZ; z++) {
            for (let x = 0; x < sizeX; x++, idx++) {
                cb(x, y, z, data[idx] as VoxelMaterial);
            }
        }
    }
}

/**
 * Fill a voxel chunk with simple terrain columns (ground up to heightAt(x,z)).
 */
export function generateTerrainColumnsChunk(options: TerrainColumnsOptions): VoxelChunk {
    const { chunkX, chunkZ, sizeX, sizeZ, maxHeight, voxelSize, heightAt } = options;

    const chunk = createEmptyChunk(chunkX, chunkZ, sizeX, maxHeight, sizeZ, voxelSize);

    for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
            let h = Math.floor(heightAt(x, z));
            if (h <= 0) continue;
            if (h > maxHeight) h = maxHeight;

            for (let y = 0; y < h; y++) {
                setVoxel(chunk, x, y, z, VoxelMaterial.Ground);
            }
        }
    }

    return chunk;
}

export function serializeVoxelChunk(chunk: VoxelChunk): VoxelChunkJSON {
    return {
        id: chunk.id,
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        sizeX: chunk.sizeX,
        sizeY: chunk.sizeY,
        sizeZ: chunk.sizeZ,
        voxelSize: chunk.voxelSize,
        data: Array.from(chunk.data),
    };
}

export function deserializeVoxelChunk(payload: VoxelChunkJSON): VoxelChunk {
    const { id, chunkX, chunkZ, sizeX, sizeY, sizeZ, voxelSize, data } = payload;
    const arr = new Uint8Array(data);
    return {
        id,
        chunkX,
        chunkZ,
        sizeX,
        sizeY,
        sizeZ,
        voxelSize,
        data: arr,
    };
}
