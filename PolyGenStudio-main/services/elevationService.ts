// Elevation grid fetching using Open-Meteo API

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchElevationGrid = async (
    lats: number[],
    lngs: number[],
    onProgress?: (percent: number) => void
): Promise<number[]> => {
    // Reduced chunk size to avoid 400/414 errors from URL length limits
    // Open-Meteo has ~8KB URL limit. 100 coords ~3-4KB.
    const CHUNK_SIZE = 100;
    let allElevations: number[] = [];

    for (let i = 0; i < lats.length; i += CHUNK_SIZE) {
        if (onProgress) {
            onProgress(Math.round((i / lats.length) * 100));
        }

        const chunkLats = lats.slice(i, i + CHUNK_SIZE);
        const chunkLngs = lngs.slice(i, i + CHUNK_SIZE);
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunkLats.join(',')}&longitude=${chunkLngs.join(',')}`;

        let retries = 5;
        let success = false;
        let backoff = 2000; // Start with 2s delay for safety

        while (retries > 0 && !success) {
            try {
                // Add a delay between every request to be polite to the API
                if (i > 0) await delay(1000);

                const response = await fetch(url);

                if (response.status === 429) {
                    console.warn(`[Elevation] Rate limited (429). Waiting ${backoff}ms...`);
                    await delay(backoff);
                    backoff *= 2; // Exponential backoff
                    retries--;
                    continue;
                }

                if (!response.ok) throw new Error(`Elevation API Error: ${response.status}`);

                const data = await response.json();
                if (data.elevation) {
                    allElevations = [...allElevations, ...data.elevation];
                    success = true;
                } else {
                    throw new Error("Invalid format");
                }
            } catch (e) {
                console.warn(`[Elevation] Fetch failed (attempt ${4 - retries}/3):`, e);
                retries--;
                if (retries === 0) {
                    console.error("[Elevation] Failed after retries, using flat terrain.");
                    allElevations = [...allElevations, ...new Array(chunkLats.length).fill(0)];
                } else {
                    await delay(backoff);
                    backoff *= 1.5;
                }
            }
        }
    }

    return allElevations;
};

/**
 * Get interpolated elevation at a specific world position
 * @param x - X coordinate in world space (meters from center)
 * @param z - Z coordinate in world space (meters from center)
 * @param elevationGrid - Flat array of elevation values
 * @param gridSize - Number of points per side (e.g., 51 for 50 subdivisions)
 * @param width - Total width of the grid in meters
 * @returns Interpolated elevation in meters
 */
export const getElevationAt = (
    x: number,
    z: number,
    elevationGrid: number[],
    gridSize: number,
    width: number
): number => {
    if (!elevationGrid || elevationGrid.length === 0) return 0;

    const halfWidth = width / 2;
    const cellSize = width / (gridSize - 1);

    // Convert world coordinates to grid coordinates
    const gx = (x + halfWidth) / cellSize;
    const gz = (z + halfWidth) / cellSize;

    // Clamp to grid bounds
    const col = Math.max(0, Math.min(gridSize - 2, Math.floor(gx)));
    const row = Math.max(0, Math.min(gridSize - 2, Math.floor(gz)));

    // Fractional position within the cell
    const fx = gx - col;
    const fz = gz - row;

    // Get four corner elevations
    const idx00 = row * gridSize + col;
    const idx10 = row * gridSize + (col + 1);
    const idx01 = (row + 1) * gridSize + col;
    const idx11 = (row + 1) * gridSize + (col + 1);

    const e00 = elevationGrid[idx00] ?? 0;
    const e10 = elevationGrid[idx10] ?? 0;
    const e01 = elevationGrid[idx01] ?? 0;
    const e11 = elevationGrid[idx11] ?? 0;

    // Bilinear interpolation
    const top = e00 * (1 - fx) + e10 * fx;
    const bottom = e01 * (1 - fx) + e11 * fx;
    const elevation = top * (1 - fz) + bottom * fz;

    return elevation;
};

/**
 * Get the base elevation (minimum) from the grid to normalize terrain
 */
export const getBaseElevation = (elevationGrid: number[]): number => {
    if (!elevationGrid || elevationGrid.length === 0) return 0;
    return Math.min(...elevationGrid.filter(e => e !== 0));
};
