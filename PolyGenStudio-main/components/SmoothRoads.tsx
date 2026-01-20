/**
 * SmoothRoads.tsx
 * 
 * Renders roads as smooth ribbons with proper width using CatmullRomCurve3 interpolation.
 * Creates flat ribbon geometry that follows terrain.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CubeElement } from '../types';

interface SmoothRoadsProps {
    cubes: CubeElement[];
    roadWidth?: number;
    smoothness?: number; // Points per segment for interpolation
}

// Create ribbon geometry from a smooth curve
function createRibbonGeometry(
    points: THREE.Vector3[],
    width: number,
    closed: boolean = false
): THREE.BufferGeometry {
    if (points.length < 2) {
        return new THREE.BufferGeometry();
    }

    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];

    const halfWidth = width / 2;
    let totalLength = 0;

    // Calculate total length for UV mapping
    for (let i = 1; i < points.length; i++) {
        totalLength += points[i].distanceTo(points[i - 1]);
    }

    let currentLength = 0;

    for (let i = 0; i < points.length; i++) {
        const point = points[i];

        // Calculate direction
        let direction: THREE.Vector3;
        if (i === 0) {
            direction = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
        } else if (i === points.length - 1) {
            direction = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
        } else {
            // Average direction at corner
            const dir1 = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
            const dir2 = new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize();
            direction = new THREE.Vector3().addVectors(dir1, dir2).normalize();
        }

        // Calculate perpendicular vector (flat on XZ plane, Y is up)
        const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();

        // Calculate current UV coordinate
        if (i > 0) {
            currentLength += points[i].distanceTo(points[i - 1]);
        }
        const u = totalLength > 0 ? currentLength / totalLength : 0;

        // Left and right vertices
        const left = new THREE.Vector3().copy(point).addScaledVector(perpendicular, halfWidth);
        const right = new THREE.Vector3().copy(point).addScaledVector(perpendicular, -halfWidth);

        // Add vertices (left, right)
        vertices.push(left.x, left.y, left.z);
        vertices.push(right.x, right.y, right.z);

        // Add UVs
        uvs.push(u, 0);
        uvs.push(u, 1);

        // Add normals (pointing up)
        normals.push(0, 1, 0);
        normals.push(0, 1, 0);
    }

    // Create triangles
    for (let i = 0; i < points.length - 1; i++) {
        const baseIndex = i * 2;
        // Triangle 1
        indices.push(baseIndex, baseIndex + 2, baseIndex + 1);
        // Triangle 2
        indices.push(baseIndex + 1, baseIndex + 2, baseIndex + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    return geometry;
}

// Smooth points using CatmullRomCurve3
function smoothPoints(
    rawPoints: { x: number; y: number; z: number }[],
    divisions: number
): THREE.Vector3[] {
    if (rawPoints.length < 2) return [];
    if (rawPoints.length === 2) {
        // Just 2 points - return as is
        return rawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    }

    const vec3Points = rawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(vec3Points, false, 'catmullrom', 0.5);

    // Get interpolated points
    const totalPoints = Math.max(rawPoints.length * divisions, 10);
    return curve.getPoints(totalPoints);
}

export const SmoothRoads: React.FC<SmoothRoadsProps> = React.memo(({
    cubes,
    roadWidth = 6,
    smoothness = 3
}) => {
    // Group road segments by road ID
    const roadData = useMemo(() => {
        const roadCubes = cubes.filter(c =>
            c.visible !== false &&
            c.name?.startsWith('Road_')
        );

        // Group segments by road ID (Road_123456_0, Road_123456_1, etc -> Road_123456)
        const roadGroups = new Map<string, CubeElement[]>();

        roadCubes.forEach(cube => {
            const parts = cube.name!.split('_');
            if (parts.length >= 2) {
                const roadId = `${parts[0]}_${parts[1]}`;
                if (!roadGroups.has(roadId)) {
                    roadGroups.set(roadId, []);
                }
                roadGroups.get(roadId)!.push(cube);
            }
        });

        return roadGroups;
    }, [cubes]);

    // Create smooth ribbon geometries for each road
    const roadGeometries = useMemo(() => {
        const roads: { geometry: THREE.BufferGeometry; color: string; key: string }[] = [];

        roadData.forEach((segments, roadId) => {
            // Sort segments by index
            segments.sort((a, b) => {
                const aIdx = parseInt(a.name!.split('_')[2] || '0');
                const bIdx = parseInt(b.name!.split('_')[2] || '0');
                return aIdx - bIdx;
            });

            // Extract raw points from segment positions
            const rawPoints = segments.map(s => ({
                x: s.position.x,
                y: s.position.y + 0.4, // Elevated ABOVE terrain to prevent z-fighting
                z: s.position.z
            }));

            if (rawPoints.length >= 2) {
                // Smooth the points
                const smoothedPoints = smoothPoints(rawPoints, smoothness);

                // Create ribbon geometry
                const geometry = createRibbonGeometry(smoothedPoints, roadWidth);
                const color = segments[0]?.properties?.color || '#555555';

                roads.push({
                    geometry,
                    color,
                    key: roadId
                });
            }
        });

        return roads;
    }, [roadData, roadWidth, smoothness]);

    // Clean up geometries on unmount
    React.useEffect(() => {
        return () => {
            roadGeometries.forEach(r => r.geometry.dispose());
        };
    }, [roadGeometries]);

    return (
        <group name="smooth-roads">
            {roadGeometries.map(({ geometry, color, key }, index) => (
                <mesh key={`${key}_${index}`} geometry={geometry} receiveShadow>
                    <meshStandardMaterial
                        color={color}
                        roughness={0.9}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            ))}
        </group>
    );
});

SmoothRoads.displayName = 'SmoothRoads';

export default SmoothRoads;
