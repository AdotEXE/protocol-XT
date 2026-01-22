/**
 * Building Converter
 * 
 * Converts GeoJSON building features from OSMBuildings API
 * to CubeElements that can be rendered in our Three.js/Babylon.js scene.
 */

import { CubeElement } from '../types';
import { OSMBuildingFeature, OSMBuildingProperties } from './osmBuildingsService';

// Color palettes for realistic urban appearance
const WALL_COLORS = [
    '#e8e4e0', // Beige/cream
    '#d4cfc8', // Light grey
    '#f5f0eb', // Off-white
    '#e0d8d0', // Sand
    '#c8c0b8', // Warm grey
    '#f0e8e0', // Ivory
    '#d8d4d0', // Silver grey
    '#e8e0d8', // Pearl
];

const ROOF_COLORS = [
    '#4a4a4a', // Dark grey
    '#3d3d3d', // Charcoal
    '#6b3d2e', // Brown/terracotta
    '#8b4513', // Saddle brown
    '#2d4a3e', // Forest green
    '#1a2a40', // Dark blue slate
    '#4a3d30', // Dark brown
    '#5c5c5c', // Medium grey
];

/**
 * Calculate the Oriented Bounding Box (OBB) of a polygon
 * Returns center, dimensions, and ROTATION ANGLE based on longest edge
 */
function calculatePolygonBounds(coordinates: number[][]): {
    center: { lng: number; lat: number };
    width: number;   // in degrees
    height: number;  // in degrees
    rotation: number; // in radians - rotation of the building
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
} {
    if (coordinates.length < 3) {
        return {
            center: { lng: 0, lat: 0 },
            width: 0, height: 0, rotation: 0,
            minLng: 0, maxLng: 0, minLat: 0, maxLat: 0
        };
    }

    // Calculate centroid
    let sumLng = 0, sumLat = 0;
    for (const [lng, lat] of coordinates) {
        sumLng += lng;
        sumLat += lat;
    }
    const centerLng = sumLng / coordinates.length;
    const centerLat = sumLat / coordinates.length;

    // Find the longest edge to determine building orientation
    let longestEdgeLength = 0;
    let longestEdgeAngle = 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const [lng1, lat1] = coordinates[i];
        const [lng2, lat2] = coordinates[i + 1];

        const dx = lng2 - lng1;
        const dy = lat2 - lat1;
        const edgeLength = Math.sqrt(dx * dx + dy * dy);

        if (edgeLength > longestEdgeLength) {
            longestEdgeLength = edgeLength;
            // Angle of longest edge (building orientation)
            longestEdgeAngle = Math.atan2(dy, dx);
        }
    }

    // Rotate all points to align with longest edge, then find bounds
    const cosA = Math.cos(-longestEdgeAngle);
    const sinA = Math.sin(-longestEdgeAngle);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const [lng, lat] of coordinates) {
        // Translate to origin
        const tx = lng - centerLng;
        const ty = lat - centerLat;
        // Rotate
        const rx = tx * cosA - ty * sinA;
        const ry = tx * sinA + ty * cosA;
        // Track bounds in rotated space
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
    }

    // AABB bounds (for filtering)
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coordinates) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }

    return {
        center: { lng: centerLng, lat: centerLat },
        width: maxX - minX,   // OBB width (along longest edge)
        height: maxY - minY,  // OBB height (perpendicular)
        rotation: longestEdgeAngle, // Building rotation
        minLng, maxLng, minLat, maxLat
    };
}

/**
 * Convert degrees to meters at a given latitude
 * IMPORTANT: Must match the formula in RealWorldGenerator.tsx exactly!
 */
function degreesToMeters(
    dLng: number,
    dLat: number,
    atLatitude: number
): { x: number; z: number } {
    // Match RealWorldGenerator's exact formula
    const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * atLatitude * Math.PI / 180) + 1.175 * Math.cos(4 * atLatitude * Math.PI / 180);
    const metersPerLon = 111132.954 * Math.cos(atLatitude * Math.PI / 180);

    return {
        x: dLng * metersPerLon,
        z: dLat * metersPerLat
    };
}

/**
 * Determine building height from properties
 */
function getBuildingHeight(props: OSMBuildingProperties): number {
    // Direct height
    if (props.height && props.height > 0) {
        return props.height;
    }

    // Calculate from levels (3.5m per level is standard)
    if (props.levels && props.levels > 0) {
        return props.levels * 3.5;
    }

    // Default random height for visual variety
    return 6 + Math.random() * 10;
}

/**
 * Get roof height from properties
 */
function getRoofHeight(props: OSMBuildingProperties, buildingHeight: number): number {
    if (props.roofHeight && props.roofHeight > 0) {
        return props.roofHeight;
    }

    // Smaller buildings get proportionally larger roofs
    if (buildingHeight < 12) {
        return 1.5 + Math.random() * 2;
    }

    return 0; // Flat roof for tall buildings
}

/**
 * Convert a single GeoJSON building feature to CubeElements
 */
function convertBuildingToCubes(
    feature: OSMBuildingFeature,
    generateId: () => string,
    centerLat: number,
    centerLng: number,
    getTerrainHeight: (x: number, z: number) => number
): CubeElement[] {
    const cubes: CubeElement[] = [];
    const props = feature.properties;

    // Handle both Polygon and MultiPolygon
    let polygons: number[][][] = [];
    if (feature.geometry.type === 'Polygon') {
        polygons = [feature.geometry.coordinates as number[][][]][0] as unknown as number[][][];
        // Fix: Polygon coordinates are [ring1, ring2, ...] where ring1 is outer
        polygons = [feature.geometry.coordinates[0] as number[][]];
    } else if (feature.geometry.type === 'MultiPolygon') {
        // MultiPolygon: take outer ring of each polygon
        polygons = (feature.geometry.coordinates as number[][][][]).map(poly => poly[0]);
    }

    for (const ring of polygons) {
        const bounds = calculatePolygonBounds(ring);

        // Convert center position to local meters
        const offset = degreesToMeters(
            bounds.center.lng - centerLng,
            bounds.center.lat - centerLat,
            centerLat
        );

        // Convert dimensions to meters
        const dims = degreesToMeters(bounds.width, bounds.height, centerLat);
        const width = Math.max(2, Math.abs(dims.x));
        const depth = Math.max(2, Math.abs(dims.z));

        // DEBUG: Log first building with same format as road debug
        if (cubes.length < 1) {
            console.log('[COORD DEBUG] First building from OSMBuildings:', {
                centerLatLng: { lat: centerLat, lng: centerLng },
                buildingRaw: { lat: bounds.center.lat, lng: bounds.center.lng },
                buildingProjected: { x: offset.x, z: offset.z },
                formula: 'x = (lng - centerLng) * metersPerLon, z = (lat - centerLat) * metersPerLat'
            });
        }

        // Skip unreasonably large buildings (likely parsing errors)
        if (width > 150 || depth > 150) continue;

        // Get heights
        const height = getBuildingHeight(props);
        const minHeight = props.minHeight || 0;
        const effectiveHeight = height - minHeight;

        // Get terrain elevation
        const terrainHeight = getTerrainHeight(offset.x, offset.z);

        // Pick colors
        const wallColor = props.color || WALL_COLORS[Math.floor(Math.random() * WALL_COLORS.length)];
        const roofColor = props.roofColor || ROOF_COLORS[Math.floor(Math.random() * ROOF_COLORS.length)];

        // Calculate rotation for Three.js (Y-axis rotation)
        // OBB rotation is in lat/lng space, we need to convert to scene space
        // In our projection: X = lng (east), Z = lat (north)
        // So rotation around Y axis should use the same angle
        const buildingRotation = bounds.rotation;

        // Create main building body with ROTATION
        const buildingId = generateId();

        // Generate descriptive name based on properties
        const heightCategory = effectiveHeight > 30 ? 'Highrise' : effectiveHeight > 15 ? 'MidRise' : 'LowRise';
        const levelInfo = props.levels ? `_L${props.levels}` : '';
        const buildingName = `${heightCategory}_${props.id || buildingId.slice(-6)}${levelInfo}`;

        // КРИТИЧНО: Конвертируем polygon во vertices для game engine
        const polygonVertices: { x: number; y: number; z: number }[] = [];
        for (const [lng, lat] of ring) {
            const vertOffset = degreesToMeters(lng - centerLng, lat - centerLat, centerLat);
            polygonVertices.push({
                x: vertOffset.x,
                y: 0,  // Polygon is on ground plane
                z: vertOffset.z
            });
        }

        // DEBUG: Log first building polygon data
        if (cubes.length < 3) {
            console.log(`[BuildingConverter] 🏢 Building polygon: ${polygonVertices.length} vertices, height: ${effectiveHeight}m, first vertex: (${polygonVertices[0]?.x.toFixed(1)}, ${polygonVertices[0]?.z.toFixed(1)})`);
        }

        cubes.push({
            id: buildingId,
            name: buildingName,
            type: 'cube',
            position: {
                x: offset.x,
                y: terrainHeight + minHeight + effectiveHeight / 2,
                z: offset.z
            },
            rotation: { x: 0, y: buildingRotation, z: 0 },  // APPLY ROTATION
            size: { x: width, y: effectiveHeight, z: depth },
            color: wallColor,
            properties: {
                material: 'rough_concrete',
                shape: 'box'
            },
            visible: true,
            isLocked: false,
            isFavorite: false,
            // КРИТИЧНО: Polygon data for proper extrusion in game
            polygon: polygonVertices,
            height: effectiveHeight  // Real building height
        } as CubeElement);

        // Add roof for smaller buildings (with same rotation as building)
        const roofHeight = getRoofHeight(props, height);
        if (roofHeight > 0) {
            const roofShape = props.roofShape || (Math.random() > 0.5 ? 'pyramid' : 'box');

            cubes.push({
                id: generateId(),
                name: `Roof_${buildingName}`,
                type: 'cube',
                position: {
                    x: offset.x,
                    y: terrainHeight + height + roofHeight / 2,
                    z: offset.z
                },
                rotation: { x: 0, y: buildingRotation, z: 0 },  // SAME ROTATION AS BUILDING
                size: { x: width, y: roofHeight, z: depth },
                color: roofColor,
                properties: {
                    shape: roofShape === 'pyramidal' || roofShape === 'pyramid' ? 'pyramid' : 'box'
                },
                visible: true,
                isLocked: false,
                isFavorite: false
            });
        }
    }

    return cubes;
}

/**
 * Convert all OSMBuildings GeoJSON features to CubeElements
 * 
 * @param features - Array of GeoJSON building features
 * @param generateId - Function to generate unique IDs
 * @param centerLat - Center latitude of the map
 * @param centerLng - Center longitude of the map
 * @param getTerrainHeight - Function to get terrain height at a position
 * @param maxBuildings - Maximum number of buildings to process
 * @returns Array of CubeElements
 */
export function convertBuildingsToCubes(
    features: OSMBuildingFeature[],
    generateId: () => string,
    centerLat: number,
    centerLng: number,
    getTerrainHeight: (x: number, z: number) => number = () => 0,
    maxBuildings: number = 600
): CubeElement[] {
    const allCubes: CubeElement[] = [];
    let buildingCount = 0;

    for (const feature of features) {
        if (buildingCount >= maxBuildings) break;

        try {
            const cubes = convertBuildingToCubes(
                feature,
                generateId,
                centerLat,
                centerLng,
                getTerrainHeight
            );
            allCubes.push(...cubes);
            buildingCount++;
        } catch (error) {
            console.warn('[BuildingConverter] Failed to convert building:', error);
        }
    }

    console.log(`[BuildingConverter] Converted ${buildingCount} buildings to ${allCubes.length} cubes`);
    return allCubes;
}
