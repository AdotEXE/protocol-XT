// TerrainMesh.tsx - Visual terrain elevation mesh
import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface TerrainMeshProps {
    elevationGrid: number[];
    gridSize: number;     // e.g., 51 for 50 subdivisions
    width: number;        // Total width in meters
    baseElevation: number;
    verticalScale?: number;
    color?: string;
    wireframe?: boolean;
}

const TerrainMesh: React.FC<TerrainMeshProps> = ({
    elevationGrid,
    gridSize,
    width,
    baseElevation,
    verticalScale = 0.5,
    color = '#3a5a40',
    wireframe = false
}) => {
    const geometryRef = useRef<THREE.BufferGeometry | null>(null);
    const materialRef = useRef<THREE.Material | null>(null);

    const { geometry, material } = useMemo(() => {
        // Dispose previous geometry and material
        if (geometryRef.current) {
            geometryRef.current.dispose();
        }
        if (materialRef.current) {
            materialRef.current.dispose();
        }

        // Create plane geometry with subdivisions matching the grid
        const segments = gridSize - 1;
        const geo = new THREE.PlaneGeometry(width, width, segments, segments);

        // Rotate to horizontal (XZ plane)
        geo.rotateX(-Math.PI / 2);

        // Get position attribute
        const positions = geo.attributes.position;

        // Apply elevation to each vertex
        for (let i = 0; i < positions.count; i++) {
            // Get grid indices from vertex index
            // PlaneGeometry creates vertices row by row
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            const elevationIndex = row * gridSize + col;

            // Get raw elevation and normalize
            const rawElevation = elevationGrid[elevationIndex] ?? 0;
            const normalizedElevation = (rawElevation - baseElevation) * verticalScale;

            // Y is up in Three.js (after rotation)
            positions.setY(i, Math.max(0, normalizedElevation));
        }

        // Update geometry
        positions.needsUpdate = true;
        geo.computeVertexNormals();

        // Create material with vertex colors for height-based coloring
        const mat = new THREE.MeshStandardMaterial({
            color: color,
            wireframe: wireframe,
            flatShading: false,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.1
        });

        geometryRef.current = geo;
        materialRef.current = mat;

        return { geometry: geo, material: mat };
    }, [elevationGrid, gridSize, width, baseElevation, verticalScale, color, wireframe]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (geometryRef.current) {
                geometryRef.current.dispose();
                geometryRef.current = null;
            }
            if (materialRef.current) {
                materialRef.current.dispose();
                materialRef.current = null;
            }
        };
    }, []);

    if (!elevationGrid || elevationGrid.length === 0) {
        return null;
    }

    return (
        <mesh
            geometry={geometry}
            material={material}
            receiveShadow
            castShadow={false}
            position={[0, 0, 0]}
        />
    );
};

export default TerrainMesh;
