
import { CubeElement, Vector3 } from '../types';
import { generateProceduralBuilding, BuildingConfig } from './procedural';
import { v4 as uuidv4 } from 'uuid';

const generateId = () => Math.random().toString(36).substr(2, 9);

export interface CityConfig {
    gridSize: number; // Number of blocks (e.g. 5x5)
    blockSize: number; // Size of each block in voxels (e.g. 20)
    density: number; // 0-1, building probability
    organicness: number; // 0-1, 0 = perfect grid, 1 = chaotic
}

type TileType = 'road' | 'building' | 'park' | 'empty';

interface CityTile {
    x: number;
    y: number;
    type: TileType;
    zone?: 'industrial' | 'modern' | 'brick';
    roadConnections?: { n: boolean, s: boolean, e: boolean, w: boolean };
}

export const generateCity = (config: CityConfig): CubeElement[] => {
    const { gridSize, blockSize, density } = config;
    const cubes: CubeElement[] = [];

    // 1. Initialize Grid
    const tiles: CityTile[][] = [];
    for (let x = 0; x < gridSize; x++) {
        tiles[x] = [];
        for (let y = 0; y < gridSize; y++) {
            tiles[x][y] = { x, y, type: 'empty' };
        }
    }

    // 2. Road Network (Simple Grid for starts)
    // Roads on even indices? No, let's say every cell is a potential block, separated by roads?
    // Alternative: The grid REPRESENTS the layout. 
    // Let's make a maze-like or cellular automata structure? 
    // Simple approach: Main roads every N blocks.

    // Let's try "Block" logic. A "Tile" is a chunk of land (e.g. 20x20).
    // Some tiles are Roads, some are Buildings.
    // Standard Grid layout: All borders of tiles are roads? That's too much road.

    // Better: Recursive Division or just a Roadmap.
    // Let's assume the grid nodes are intersections. 
    // Actually, let's keep it simple: 2D array where 1 = Road, 0 = Building Slot.

    // New Approach for Grid:
    // Generate a boolean grid [size*2+1][size*2+1].
    // Odd rows/cols are potential roads. Even are building blocks.
    const mapW = gridSize * 2 + 1;
    const mapH = gridSize * 2 + 1;
    const map: number[][] = Array(mapW).fill(0).map(() => Array(mapH).fill(0)); // 0 = building/empty, 1 = road

    // Fill Roads
    for (let x = 0; x < mapW; x++) {
        for (let y = 0; y < mapH; y++) {
            if (x % 2 !== 0 || y % 2 !== 0) {
                // Randomly prune some roads based on "organicness" ? 
                // For now, full grid.
                map[x][y] = 1;
            }
            // Intersection
            if (x % 2 !== 0 && y % 2 !== 0) map[x][y] = 1;
        }
    }

    // 3. Place Objects
    const roadWidth = 4;
    const buildingSpace = blockSize;

    const getWorldPos = (mx: number, my: number) => {
        // Calculate world position based on grid index
        // Even indices are blocks (size: blockSize), Odd are roads (size: roadWidth)
        let wx = 0;
        for (let i = 0; i < mx; i++) wx += (i % 2 === 0) ? buildingSpace : roadWidth;
        let wz = 0;
        for (let i = 0; i < my; i++) wz += (i % 2 === 0) ? buildingSpace : roadWidth;
        return { x: wx, z: wz };
    };

    for (let x = 0; x < mapW; x++) {
        for (let y = 0; y < mapH; y++) {
            const isRoad = map[x][y] === 1;
            const pos = getWorldPos(x, y);
            const sizeX = (x % 2 === 0) ? buildingSpace : roadWidth;
            const sizeZ = (y % 2 === 0) ? buildingSpace : roadWidth;

            if (isRoad) {
                // Determine road type (intersection vs straight)
                // For now, simpler: Just place dark asphalt blocks.
                // Later: auto-tiling logic.
                cubes.push({
                    id: generateId(),
                    name: `road_${x}_${y}`,
                    type: 'cube',
                    position: { x: pos.x + (sizeX / 2), y: -0.5, z: pos.z + (sizeZ / 2) },
                    size: { x: sizeX, y: 1, z: sizeZ },
                    color: '#2a2a2a',
                    visible: true,
                    properties: { txCategory: 'infrastructure', txType: 'road' }
                });

                // Add markings?
            } else {
                // Building Lot (Even/Even)
                if (Math.random() < density) {
                    const centerX = pos.x + (sizeX / 2);
                    const centerZ = pos.z + (sizeZ / 2);

                    const zoneType = (Math.random() > 0.5) ? 'industrial' : (Math.random() > 0.5 ? 'modern' : 'brick');

                    // Generate Building
                    const bWidth = Math.floor(sizeX * 0.8);
                    const bDepth = Math.floor(sizeZ * 0.8);
                    const bFloors = Math.floor(Math.random() * 5) + 2;

                    const building = generateProceduralBuilding({
                        width: bWidth,
                        depth: bDepth,
                        floors: bFloors,
                        floorHeight: 4,
                        style: zoneType as any
                    }, { x: centerX, y: 0, z: centerZ });

                    // Shift building to world pos (generateProceduralBuilding uses center logic mostly, let's verify)
                    // It uses "position" as "startY" and center of X/Z? 
                    // Looking at procedural.ts: 
                    // position.x, position.z are used directly as center.
                    // Correct.

                    cubes.push(...building);
                } else {
                    // Park
                    cubes.push({
                        id: generateId(),
                        name: `park_${x}_${y}`,
                        type: 'cube',
                        position: { x: pos.x + (sizeX / 2), y: -0.5, z: pos.z + (sizeZ / 2) },
                        size: { x: sizeX, y: 1, z: sizeZ },
                        color: '#2d4c1e',
                        visible: true,
                        properties: { txCategory: 'nature', txType: 'ground' }
                    });
                    // Add a tree
                    cubes.push({
                        id: generateId(),
                        name: `tree_${x}_${y}`,
                        type: 'cube',
                        position: { x: pos.x + (sizeX / 2), y: 2, z: pos.z + (sizeZ / 2) },
                        size: { x: 2, y: 4, z: 2 },
                        color: '#1e3c10',
                        visible: true,
                        properties: { txCategory: 'nature', txType: 'tree' }
                    });
                    cubes.push({
                        id: generateId(),
                        name: `tree_top_${x}_${y}`,
                        type: 'cube',
                        position: { x: pos.x + (sizeX / 2), y: 5, z: pos.z + (sizeZ / 2) },
                        size: { x: 4, y: 3, z: 4 },
                        color: '#2d5c1e',
                        visible: true,
                        properties: { txCategory: 'nature', txType: 'tree' }
                    });
                }
            }
        }
    }

    return cubes;
};
