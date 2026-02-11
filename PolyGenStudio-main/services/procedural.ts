
import { CubeElement, Vector3 } from '../types';
import { v4 as uuidv4 } from 'uuid'; // We need a UUID generator, or use helper

const generateId = () => Math.random().toString(36).substr(2, 9);

export interface BuildingConfig {
    width: number;  // X size
    depth: number;  // Z size
    floors: number;
    floorHeight: number;
    style: 'modern' | 'industrial' | 'concrete' | 'brick';
    color?: string;
}

export const generateProceduralBuilding = (config: BuildingConfig, position: Vector3): CubeElement[] => {
    const cubes: CubeElement[] = [];
    const { width, depth, floors, floorHeight, style } = config;

    // Materials based on style
    let wallColor = '#808080';
    let windowColor = '#87ceeb';
    let frameColor = '#333333';
    let roofColor = '#222222';

    if (style === 'brick') { wallColor = '#8b4513'; roofColor = '#5a3a2a'; }
    if (style === 'industrial') { wallColor = '#5a5a5a'; windowColor = '#a0a0a0'; }
    if (style === 'modern') { wallColor = '#eeeeee'; windowColor = '#336699'; }

    // Override if provided
    if (config.color) wallColor = config.color;

    const startY = position.y;

    for (let f = 0; f < floors; f++) {
        const currentY = startY + (f * floorHeight);

        // Floor Slab
        cubes.push({
            id: generateId(),
            name: `floor_${f}_slab`,
            type: 'cube',
            parentId: null,
            position: { x: position.x, y: currentY - 0.1, z: position.z },
            size: { x: width, y: 0.2, z: depth },
            rotation: { x: 0, y: 0, z: 0 },
            color: frameColor,
            visible: true,
            properties: { txCategory: 'buildings', txType: 'building' }
        });

        // Walls (Simplified as 4 blocks or single if solid, but we want windows)
        // Let's make it a solid block for now with "window" blocks embedded if we want detail,
        // OR just simple stacked blocks for the "concept".
        // Better: 4 corner pillars and glass walls?
        // Let's do simple: 1 big block for the floor body per floor.

        cubes.push({
            id: generateId(),
            name: `floor_${f}_walls`,
            type: 'cube',
            parentId: null,
            position: { x: position.x, y: currentY + (floorHeight / 2), z: position.z },
            size: { x: width - 0.4, y: floorHeight, z: depth - 0.4 }, // Inset slightly
            rotation: { x: 0, y: 0, z: 0 },
            color: wallColor,
            visible: true,
            properties: { txCategory: 'buildings', txType: 'building' }
        });

        // Windows (Simple strips)
        if (width > 2) {
            cubes.push({
                id: generateId(),
                name: `floor_${f}_window_f`,
                type: 'cube',
                parentId: null,
                position: { x: position.x, y: currentY + (floorHeight / 2), z: position.z + (depth / 2) },
                size: { x: width - 1, y: floorHeight - 1, z: 0.6 },
                rotation: { x: 0, y: 0, z: 0 },
                color: windowColor,
                visible: true,
                material: { opacity: 0.6, roughness: 0.1, metalness: 0.9, emissive: 0.1, transparent: true },
                properties: { txCategory: 'buildings', txType: 'building' }
            });
            cubes.push({
                id: generateId(),
                name: `floor_${f}_window_b`,
                type: 'cube',
                parentId: null,
                position: { x: position.x, y: currentY + (floorHeight / 2), z: position.z - (depth / 2) },
                size: { x: width - 1, y: floorHeight - 1, z: 0.6 },
                rotation: { x: 0, y: 0, z: 0 },
                color: windowColor,
                visible: true,
                material: { opacity: 0.6, roughness: 0.1, metalness: 0.9, emissive: 0.1, transparent: true },
                properties: { txCategory: 'buildings', txType: 'building' }
            });
        }
    }

    // Roof
    const roofY = startY + (floors * floorHeight);
    cubes.push({
        id: generateId(),
        name: `roof`,
        type: 'cube',
        parentId: null,
        position: { x: position.x, y: roofY + 0.5, z: position.z },
        size: { x: width + 0.5, y: 1, z: depth + 0.5 },
        rotation: { x: 0, y: 0, z: 0 },
        color: roofColor,
        visible: true,
        properties: { txCategory: 'buildings', txType: 'building' }
    });

    // Entrance at ground floor
    cubes.push({
        id: generateId(),
        name: `entrance`,
        type: 'cube',
        parentId: null,
        position: { x: position.x, y: startY + 1, z: position.z + (depth / 2) + 0.2 },
        size: { x: 2, y: 2, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        color: '#222222',
        visible: true,
        properties: { txCategory: 'buildings', txType: 'building' }
    });

    return cubes;
};
