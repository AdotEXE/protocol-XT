/**
 * PolygonBuildings.tsx
 * 
 * Renders buildings with REAL polygon shapes from OSM data.
 * Uses THREE.ExtrudeGeometry for accurate building footprints.
 * 
 * This is the key component for realistic city rendering!
 */

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { CubeElement } from '../types';

interface PolygonBuildingsProps {
    cubes: CubeElement[];
    excludeIds: Set<string>;
    onClick?: (id: string, event: any) => void;
}

// Create extruded building geometry from polygon vertices
function createBuildingGeometry(polygon: Array<{ x: number; z: number }>, height: number): THREE.ExtrudeGeometry | null {
    if (!polygon || polygon.length < 3) return null;

    try {
        // Create 2D shape from polygon vertices
        // THREE.Shape is in XY plane, ExtrudeGeometry extrudes along Z
        // After rotateX(-90°): Shape Y becomes World -Z
        // So we use -z to get correct world Z orientation
        const shape = new THREE.Shape();

        // Move to first point (negate z for correct orientation after rotation)
        shape.moveTo(polygon[0].x, -polygon[0].z);

        // Draw lines to all subsequent points
        for (let i = 1; i < polygon.length; i++) {
            shape.lineTo(polygon[i].x, -polygon[i].z);
        }

        // Close the shape
        shape.closePath();

        // Extrude settings - depth is the building height
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
            depth: height,
            bevelEnabled: false,
            steps: 1
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Rotate to Y-up: XY plane with Z extrusion becomes XZ plane with Y extrusion
        geometry.rotateX(-Math.PI / 2);

        return geometry;

    } catch (e) {
        console.warn('[PolygonBuildings] Failed to create building geometry:', e);
        return null;
    }
}


// Single building mesh component
const PolygonBuilding = React.memo(({
    cube,
    onClick
}: {
    cube: CubeElement;
    onClick?: (id: string, event: any) => void;
}) => {
    const meshRef = useRef<THREE.Mesh>(null);

    // Create geometry from polygon
    const geometry = useMemo(() => {
        if (!cube.polygon || cube.polygon.length < 3) return null;

        const height = cube.height || cube.size.y || 10;
        return createBuildingGeometry(cube.polygon, height);
    }, [cube.polygon, cube.height, cube.size.y]);

    // Fallback to box if polygon geometry fails
    const fallbackGeometry = useMemo(() => {
        return new THREE.BoxGeometry(cube.size.x, cube.size.y, cube.size.z);
    }, [cube.size.x, cube.size.y, cube.size.z]);

    const handleClick = (event: any) => {
        if (onClick) {
            event.stopPropagation();
            onClick(cube.id, event);
        }
    };

    // Use polygon geometry if available, otherwise fallback to box
    const finalGeometry = geometry || fallbackGeometry;

    // For polygon buildings with ABSOLUTE coordinates:
    // THREE.js ExtrudeGeometry after rotateX(-90°) extrudes UPWARD from origin
    // So position.y = terrain height (base of building)
    const height = cube.height || cube.size.y || 10;
    const positionY = geometry
        ? cube.position.y  // Polygon: Y = terrain height (base)
        : cube.position.y + height / 2;  // Box: center at terrain + half height

    const isWater = cube.type === 'water';

    return (
        <mesh
            ref={meshRef}
            geometry={finalGeometry}
            position={[0, positionY, 0]}
            onClick={handleClick}
            castShadow={!isWater}  // Water doesn't cast shadow
            receiveShadow
        >
            {isWater ? (
                // Water material - transparent blue
                <meshStandardMaterial
                    color={cube.color || '#1e5f8a'}
                    transparent
                    opacity={0.7}
                    roughness={0.2}
                    metalness={0.3}
                />
            ) : (
                // Building material - opaque concrete
                <meshStandardMaterial
                    color={cube.color || '#cccccc'}
                    roughness={0.8}
                    metalness={0.1}
                />
            )}
        </mesh>
    );
});

PolygonBuilding.displayName = 'PolygonBuilding';

// Main component - renders all polygon buildings AND water
export const PolygonBuildings: React.FC<PolygonBuildingsProps> = React.memo(({
    cubes,
    excludeIds,
    onClick
}) => {
    // Filter polygon-type objects (buildings AND lakes, but NOT rivers)
    // Rivers are rendered by SmoothRivers as ribbon paths
    const polygonCubes = useMemo(() => {
        return cubes.filter(cube =>
            cube.visible !== false &&
            (cube.type === 'polygon' || cube.type === 'water') &&
            !cube.name?.startsWith('River_') &&  // EXCLUDE rivers - rendered by SmoothRivers
            !excludeIds.has(cube.id) &&
            cube.polygon &&
            cube.polygon.length >= 3
        );
    }, [cubes, excludeIds]);

    // Debug logging
    useEffect(() => {
        const buildings = polygonCubes.filter(c => c.type === 'polygon').length;
        const water = polygonCubes.filter(c => c.type === 'water').length;
        console.log(`[PolygonBuildings] Rendering ${buildings} buildings + ${water} water polygons`);
    }, [polygonCubes.length]);

    return (
        <group name="polygon-objects">
            {polygonCubes.map((cube, index) => (
                <PolygonBuilding
                    key={`${cube.id}_${index}`}
                    cube={cube}
                    onClick={onClick}
                />
            ))}
        </group>
    );
});

PolygonBuildings.displayName = 'PolygonBuildings';

export default PolygonBuildings;
