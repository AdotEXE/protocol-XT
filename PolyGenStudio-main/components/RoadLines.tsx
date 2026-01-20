/**
 * RoadLines.tsx
 * 
 * Renders roads as lines instead of cubes for better visual representation.
 * Roads follow the actual path from OSM data.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { CubeElement } from '../types';

interface RoadLinesProps {
    cubes: CubeElement[];
}

// Convert road segments to line paths
export const RoadLines: React.FC<RoadLinesProps> = React.memo(({ cubes }) => {
    // Filter road cubes and group by road ID prefix
    const roads = useMemo(() => {
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

    // Render roads as thick lines
    const roadLines = useMemo(() => {
        const lines: React.ReactElement[] = [];

        roads.forEach((segments, roadId) => {
            // Sort segments by index and extract positions
            segments.sort((a, b) => {
                const aIdx = parseInt(a.name!.split('_')[2] || '0');
                const bIdx = parseInt(b.name!.split('_')[2] || '0');
                return aIdx - bIdx;
            });

            // Create line points from segment centers
            const points: [number, number, number][] = segments.map(s =>
                [s.position.x, s.position.y + 0.1, s.position.z]
            );

            if (points.length >= 2) {
                const color = segments[0]?.properties?.color || '#666666';

                lines.push(
                    <Line
                        key={roadId}
                        points={points}
                        color={color}
                        lineWidth={2}
                        dashed={false}
                    />
                );
            }
        });

        return lines;
    }, [roads]);

    return (
        <group name="road-lines">
            {roadLines}
        </group>
    );
});

RoadLines.displayName = 'RoadLines';

export default RoadLines;
