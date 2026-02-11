
import { CubeElement, Vector3 } from '../types';
import { v4 as uuidv4 } from 'uuid';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const createRoadPath = (
    start: Vector3,
    end: Vector3,
    width: number,
    color: string = '#2a2a2a'
): CubeElement[] => {
    const cubes: CubeElement[] = [];

    // Vector math
    const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2));
    const steps = Math.ceil(dist); // 1 unit steps? Or usually road blocks are larger. Let's do 1 unit for smoothness.

    const dirX = (end.x - start.x) / dist;
    const dirZ = (end.z - start.z) / dist;

    // Perpendicular vector for width
    const perpX = -dirZ;
    const perpZ = dirX;

    const added = new Set<string>();

    for (let i = 0; i <= steps; i++) {
        const cx = start.x + dirX * i;
        const cz = start.z + dirZ * i;

        // Fill width
        for (let w = -width / 2; w <= width / 2; w += 1) {
            const wx = Math.round(cx + perpX * w);
            const wz = Math.round(cz + perpZ * w);
            const key = `${wx},${wz}`;

            if (!added.has(key)) {
                added.add(key);
                cubes.push({
                    id: generateId(),
                    name: `road_seg_${wx}_${wz}`,
                    type: 'cube',
                    position: { x: wx, y: start.y, z: wz }, // Use Start Y, usually -0.5 or 0
                    size: { x: 1, y: 1, z: 1 },
                    color: color,
                    visible: true,
                    properties: { txCategory: 'infrastructure', txType: 'road' }
                });
            }
        }
    }
    return cubes;
};

export const scatterObjects = (
    center: Vector3,
    radius: number,
    density: number, // 0-1 probability
    template: Partial<CubeElement> // object to clone
): CubeElement[] => {
    const cubes: CubeElement[] = [];
    const rSq = radius * radius;

    // Iterate area
    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            if (x * x + z * z > rSq) continue;

            if (Math.random() < density) {
                const tx = center.x + x;
                const tz = center.z + z;

                // Clone template
                cubes.push({
                    ...template as CubeElement,
                    id: generateId(),
                    name: `${template.name}_${tx}_${tz}`,
                    position: { x: tx, y: center.y + (template.position?.y || 0), z: tz },
                    // Add slight random rotation?
                    // rotation: { x: 0, y: Math.random() * 360, z: 0 } // if supported
                });
            }
        }
    }
    return cubes;
};
