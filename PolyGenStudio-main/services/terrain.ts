
import { CubeElement, Vector3 } from '../types';
import { v4 as uuidv4 } from 'uuid';

const generateId = () => Math.random().toString(36).substr(2, 9);

export type TerrainToolMode = 'raise' | 'lower' | 'flatten' | 'paint';

export const applyTerrainBrush = (
    cubes: CubeElement[],
    center: Vector3,
    radius: number,
    mode: TerrainToolMode,
    strength: number = 1,
    color: string = '#2d4c1e' // Grass color
): CubeElement[] => {
    const newCubes = [...cubes];
    const affectedIndices = new Set<number>();

    // Simple voxel manipulation
    // Filter for "ground" or "nature" pixels to modify? 
    // Or just check strictly by position.

    // For 'raise': Find highest block at x,z within radius and add block on top.
    // For 'lower': Remove highest block at x,z within radius.

    const rSq = radius * radius;

    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            if (x * x + z * z > rSq) continue;

            const targetX = Math.round(center.x + x);
            const targetZ = Math.round(center.z + z);

            // Find stack at this X,Z
            const stack = newCubes.filter(c =>
                Math.abs(c.position.x - targetX) < 0.5 &&
                Math.abs(c.position.z - targetZ) < 0.5
            ).sort((a, b) => b.position.y - a.position.y); // Highest first

            const topBlock = stack[0];
            const currentHeight = topBlock ? topBlock.position.y : 0; // 0 is base floor

            if (mode === 'raise') {
                if (Math.random() > 0.8) continue; // Noise for organic feel? Or just full fill. Let's do full for now.

                // Add block on top
                newCubes.push({
                    id: generateId(),
                    name: `terrain_${targetX}_${currentHeight + 1}_${targetZ}`,
                    type: 'cube',
                    position: { x: targetX, y: currentHeight + 1, z: targetZ }, // Assuming visual height 1
                    size: { x: 1, y: 1, z: 1 },
                    color: color,
                    visible: true,
                    properties: { txCategory: 'nature', txType: 'ground' }
                });
            } else if (mode === 'lower') {
                if (topBlock) {
                    // Remove top block
                    const idx = newCubes.indexOf(topBlock);
                    if (idx > -1) newCubes.splice(idx, 1);
                }
            } else if (mode === 'paint') {
                if (topBlock) {
                    topBlock.color = color;
                }
            }
        }
    }

    return newCubes;
};
