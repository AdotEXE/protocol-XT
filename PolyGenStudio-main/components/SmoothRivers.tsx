/**
 * SmoothRivers.tsx
 * 
 * Renders rivers as smooth ribbons with proper width using CatmullRomCurve3 interpolation.
 * Uses polygon path data from river CubeElements for accurate positioning.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { CubeElement } from '../types';

interface SmoothRiversProps {
    cubes: CubeElement[];
    riverWidth?: number;
    smoothness?: number;
}

// Create ribbon geometry from points
function createRibbonGeometry(
    points: THREE.Vector3[],
    width: number
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

    for (let i = 1; i < points.length; i++) {
        totalLength += points[i].distanceTo(points[i - 1]);
    }

    let currentLength = 0;

    for (let i = 0; i < points.length; i++) {
        const point = points[i];

        let direction: THREE.Vector3;
        if (i === 0) {
            direction = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
        } else if (i === points.length - 1) {
            direction = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
        } else {
            const dir1 = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
            const dir2 = new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize();
            direction = new THREE.Vector3().addVectors(dir1, dir2).normalize();
        }

        // Perpendicular in XZ plane
        const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();

        if (i > 0) {
            currentLength += points[i].distanceTo(points[i - 1]);
        }
        const u = totalLength > 0 ? currentLength / totalLength : 0;

        const left = new THREE.Vector3().copy(point).addScaledVector(perpendicular, halfWidth);
        const right = new THREE.Vector3().copy(point).addScaledVector(perpendicular, -halfWidth);

        vertices.push(left.x, left.y, left.z);
        vertices.push(right.x, right.y, right.z);

        uvs.push(u, 0);
        uvs.push(u, 1);

        normals.push(0, 1, 0);
        normals.push(0, 1, 0);
    }

    for (let i = 0; i < points.length - 1; i++) {
        const baseIndex = i * 2;
        indices.push(baseIndex, baseIndex + 2, baseIndex + 1);
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
        return rawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    }

    const vec3Points = rawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(vec3Points, false, 'catmullrom', 0.5);

    const totalPoints = Math.max(rawPoints.length * divisions, 10);
    return curve.getPoints(totalPoints);
}

export const SmoothRivers: React.FC<SmoothRiversProps> = React.memo(({
    cubes,
    riverWidth = 15,
    smoothness = 4
}) => {
    // Find river elements with polygon path data
    const riverGeometries = useMemo(() => {
        const rivers: { geometry: THREE.BufferGeometry; key: string }[] = [];

        // Filter for river elements by name pattern (Rivers have polygon paths, not closed shapes)
        const riverElements = cubes.filter(c =>
            c.visible !== false &&
            c.name?.startsWith('River_') &&
            c.polygon &&
            c.polygon.length >= 2
        );

        riverElements.forEach(river => {
            const baseY = river.position.y;  // Elevation from generator

            // Convert polygon points to 3D with Y from position
            // NEGATE Z to match correct world orientation
            const rawPoints = river.polygon!.map(p => ({
                x: p.x,
                y: baseY,  // Use the elevation stored in position.y
                z: -p.z    // Negate Z for correct world orientation
            }));

            // Smooth the points
            const smoothedPoints = smoothPoints(rawPoints, smoothness);

            // Create ribbon geometry
            const geometry = createRibbonGeometry(smoothedPoints, riverWidth);

            rivers.push({
                geometry,
                key: river.id
            });
        });

        return rivers;
    }, [cubes, riverWidth, smoothness]);

    // OPTIMIZATION: Merge all river geometries into one for single draw call
    const mergedRiver = useMemo(() => {
        if (riverGeometries.length === 0) return null;
        const geometries = riverGeometries.map(r => r.geometry);
        const merged = mergeBufferGeometries(geometries);
        console.log(`[SmoothRivers] Merged ${riverGeometries.length} rivers into 1 mesh`);
        return merged;
    }, [riverGeometries]);

    // Clean up geometries on unmount
    React.useEffect(() => {
        return () => {
            mergedRiver?.dispose();
        };
    }, [mergedRiver]);

    if (!mergedRiver) return null;

    return (
        <group name="smooth-rivers">
            <mesh geometry={mergedRiver} receiveShadow>
                <meshStandardMaterial
                    color="#1e90ff"
                    roughness={0.2}
                    metalness={0.1}
                    transparent
                    opacity={0.8}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
});

SmoothRivers.displayName = 'SmoothRivers';

export default SmoothRivers;
