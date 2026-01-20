/**
 * InstancedBuildings.tsx
 * 
 * GPU Instanced rendering for buildings and static objects.
 * Groups objects by color and renders each group as a single InstancedMesh.
 * 
 * Performance: 500 objects → ~10 draw calls instead of 500
 */

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CubeElement } from '../types';

interface InstancedBuildingsProps {
    cubes: CubeElement[];
    excludeIds: Set<string>;  // Selected objects - rendered individually
    onClick?: (id: string, event: any) => void;
}

// Shared box geometry for all instances
const sharedBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

// Color grouping helper
interface ColorGroup {
    color: string;
    cubes: CubeElement[];
}

function groupByColor(cubes: CubeElement[]): ColorGroup[] {
    const groups = new Map<string, CubeElement[]>();

    cubes.forEach(cube => {
        const color = cube.color || '#ffffff';
        if (!groups.has(color)) {
            groups.set(color, []);
        }
        groups.get(color)!.push(cube);
    });

    return Array.from(groups.entries()).map(([color, cubes]) => ({ color, cubes }));
}

// Single instanced mesh for a color group
const InstancedColorGroup = React.memo(({
    group,
    onClick
}: {
    group: ColorGroup;
    onClick?: (id: string, event: any) => void;
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const idMapRef = useRef<Map<number, string>>(new Map());

    // Update instance matrices when cubes change
    useEffect(() => {
        if (!meshRef.current) return;

        const mesh = meshRef.current;
        const tempMatrix = new THREE.Matrix4();
        const tempPosition = new THREE.Vector3();
        const tempQuaternion = new THREE.Quaternion();
        const tempEuler = new THREE.Euler();
        const tempScale = new THREE.Vector3();

        idMapRef.current.clear();

        group.cubes.forEach((cube, index) => {
            // Position
            tempPosition.set(cube.position.x, cube.position.y, cube.position.z);

            // Rotation (degrees to radians)
            tempEuler.set(
                THREE.MathUtils.degToRad(cube.rotation?.x || 0),
                THREE.MathUtils.degToRad(cube.rotation?.y || 0),
                THREE.MathUtils.degToRad(cube.rotation?.z || 0)
            );
            tempQuaternion.setFromEuler(tempEuler);

            // Scale (size)
            tempScale.set(cube.size.x, cube.size.y, cube.size.z);

            // Compose matrix
            tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
            mesh.setMatrixAt(index, tempMatrix);

            // Store ID mapping for click detection
            idMapRef.current.set(index, cube.id);
        });

        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [group.cubes]);

    const handleClick = (event: any) => {
        if (!onClick || event.instanceId === undefined) return;

        event.stopPropagation();
        const cubeId = idMapRef.current.get(event.instanceId);
        if (cubeId) {
            onClick(cubeId, event);
        }
    };

    if (group.cubes.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[sharedBoxGeometry, undefined, group.cubes.length]}
            onClick={handleClick}
            frustumCulled={true}
            castShadow
            receiveShadow
        >
            <meshStandardMaterial
                color={group.color}
                roughness={0.7}
                metalness={0.1}
            />
        </instancedMesh>
    );
});

InstancedColorGroup.displayName = 'InstancedColorGroup';

// Main component - groups cubes and renders instanced meshes
export const InstancedBuildings: React.FC<InstancedBuildingsProps> = React.memo(({
    cubes,
    excludeIds,
    onClick
}) => {
    // Filter out excluded (selected) cubes and only include visible cubes
    const instancedCubes = useMemo(() => {
        return cubes.filter(cube =>
            cube.visible !== false &&
            cube.type === 'cube' &&
            !excludeIds.has(cube.id)
        );
    }, [cubes, excludeIds]);

    // Group by color for efficient instancing
    const colorGroups = useMemo(() => {
        return groupByColor(instancedCubes);
    }, [instancedCubes]);

    // Debug logging
    useEffect(() => {
        const totalInstanced = instancedCubes.length;
        const groupCount = colorGroups.length;
        console.log(`[InstancedBuildings] Rendering ${totalInstanced} objects in ${groupCount} instanced groups`);
    }, [instancedCubes.length, colorGroups.length]);

    return (
        <group name="instanced-buildings">
            {colorGroups.map((group, index) => (
                <InstancedColorGroup
                    key={`${group.color}-${index}`}
                    group={group}
                    onClick={onClick}
                />
            ))}
        </group>
    );
});

InstancedBuildings.displayName = 'InstancedBuildings';

export default InstancedBuildings;
