/**
 * SmoothRoads.tsx
 * 
 * Renders roads as smooth ribbons with proper width using CatmullRomCurve3 interpolation.
 * Creates flat ribbon geometry that follows terrain.
 */

import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { CubeElement } from '../types';

// Memoized material pool for roads by color
const roadMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getRoadMaterial(color: string): THREE.MeshStandardMaterial {
    if (!roadMaterialCache.has(color)) {
        roadMaterialCache.set(color, new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
        }));
    }
    return roadMaterialCache.get(color)!;
}

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
    // Filter roads with polygon paths
    const roadElements = useMemo(() => {
        return cubes.filter(c =>
            c.visible !== false &&
            c.type === 'road' &&
            c.polygon &&
            c.polygon.length >= 2
        );
    }, [cubes]);

    // Create smooth ribbon geometries for each road
    const roadGeometries = useMemo(() => {
        const roads: { geometry: THREE.BufferGeometry; color: string; key: string; width: number }[] = [];

        roadElements.forEach((road, index) => {
            // Get road width from size.x or properties, but enforce minimum for visibility
            const rawWidth = road.properties?.width || road.size.x || roadWidth;
            const width = Math.max(rawWidth, 4);  // Minimum 4m width for visibility

            // Convert polygon points to 3D with Y from position
            const baseY = road.position.y;
            const rawPoints = road.polygon!.map(p => ({
                x: p.x,
                y: baseY,
                z: -p.z  // Negate Z for correct orientation (like rivers)
            }));

            if (rawPoints.length >= 2) {
                // Smooth the points
                const smoothedPoints = smoothPoints(rawPoints, smoothness);

                // Create ribbon geometry
                const geometry = createRibbonGeometry(smoothedPoints, width);

                roads.push({
                    geometry,
                    color: road.color || '#555555',
                    key: `${road.id}_${index}`,
                    width
                });
            }
        });

        // console.log removed - was spamming console
        return roads;
    }, [roadElements, roadWidth, smoothness]);

    // OPTIMIZATION: Merge all road geometries by color for fewer draw calls
    const mergedRoads = useMemo(() => {
        const colorGroups = new Map<string, THREE.BufferGeometry[]>();

        roadGeometries.forEach(({ geometry, color }) => {
            if (!colorGroups.has(color)) {
                colorGroups.set(color, []);
            }
            colorGroups.get(color)!.push(geometry);
        });

        const merged: { geometry: THREE.BufferGeometry; color: string }[] = [];

        colorGroups.forEach((geometries, color) => {
            if (geometries.length === 0) return;

            // Merge all geometries of this color
            const mergedGeometry = mergeBufferGeometries(geometries);
            if (mergedGeometry) {
                merged.push({ geometry: mergedGeometry, color });
            }
        });

        // console.log removed - was spamming console
        return merged;
    }, [roadGeometries]);

    // Clean up geometries on unmount and when mergedRoads changes
    React.useEffect(() => {
        const currentMerged = mergedRoads;
        return () => {
            // Dispose merged geometries
            currentMerged.forEach(r => r.geometry.dispose());
            // Also dispose individual geometries that were merged
            roadGeometries.forEach(r => r.geometry.dispose());
        };
    }, [mergedRoads, roadGeometries]);

    return (
        <group name="smooth-roads">
            {mergedRoads.map(({ geometry, color }, index) => (
                <mesh key={`roads_batch_${index}`} geometry={geometry} receiveShadow>
                    <primitive object={getRoadMaterial(color)} attach="material" />
                </mesh>
            ))}
        </group>
    );
});

SmoothRoads.displayName = 'SmoothRoads';

export default SmoothRoads;
