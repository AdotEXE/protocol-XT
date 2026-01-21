// Real World Generator Component - Uses OSMBuildings for fast tile streaming
import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import { fetchOSMData, OSMData, OSMNode } from '../services/osmService';
import { fetchElevationGrid, getElevationAt, getBaseElevation } from '../services/elevationService';
import { parseLocationSeed, GeoLocationData } from '../services/geminiService';
import { loadMapFromCache, saveMapToCache, clearMapCache } from '../services/cacheService';
import { CubeElement } from '../types';
// NEW: OSMBuildings tile streaming for fast building data
import { fetchOSMBuildingsData, streamOSMBuildingsData, OSMBuildingFeature } from '../services/osmBuildingsService';
import { convertBuildingsToCubes } from '../services/buildingConverter';

// Terrain data for 3D mesh visualization
export interface TerrainData {
    elevationGrid: number[];
    gridSize: number;
    width: number;
    baseElevation: number;
}

interface RealWorldGeneratorProps {
    onGenerate: (cubes: CubeElement[], mapName: string, terrainData?: TerrainData) => void;
    /** NEW: Callback for streaming mode - adds cubes incrementally with animation */
    onAddCubes?: (cubes: CubeElement[], animate?: boolean) => void;
    generateId: () => string;
}

type GenerationState = 'idle' | 'parsing' | 'fetching' | 'streaming' | 'generating' | 'ready' | 'error';

const RealWorldGenerator: React.FC<RealWorldGeneratorProps> = ({ onGenerate, onAddCubes, generateId }) => {
    const [locationInput, setLocationInput] = useState('TARTU');  // DEV default
    const [state, setState] = useState<GenerationState>('idle');
    const [statusMessage, setStatusMessage] = useState('Введите название города или адрес');
    const [radius, setRadius] = useState(1000); // DEV: 1000m default
    const [lastLocation, setLastLocation] = useState<GeoLocationData | null>(null);
    const [forceRefresh, setForceRefresh] = useState(true);  // DEV: force refresh on
    const [progress, setProgress] = useState(0);

    // Advanced settings panel
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Road type toggles
    const [enableMotorways, setEnableMotorways] = useState(true);
    const [enablePrimary, setEnablePrimary] = useState(true);
    const [enableSecondary, setEnableSecondary] = useState(true);
    const [enableResidential, setEnableResidential] = useState(true);
    const [enableService, setEnableService] = useState(true);

    // Feature toggles
    const [enableBuildings, setEnableBuildings] = useState(true);
    const [enableWater, setEnableWater] = useState(true);
    const [enableRoads, setEnableRoads] = useState(true);

    // Quality settings
    const [buildingHeightMultiplier, setBuildingHeightMultiplier] = useState(1.0);
    const [roadWidthMultiplier, setRoadWidthMultiplier] = useState(1.0);

    const handleGenerate = useCallback(async () => {
        if (!locationInput.trim()) return;

        setState('parsing');
        setStatusMessage('Поиск координат через AI...');

        try {
            // Step 1: Parse location via Gemini AI
            let locationData: GeoLocationData;

            // Check if input is just lat,lng
            const coordsMatch = locationInput.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
            if (coordsMatch) {
                locationData = {
                    name: "Custom Location",
                    lat: parseFloat(coordsMatch[1]),
                    lng: parseFloat(coordsMatch[3]),
                    terrainType: "urban",  // Valid terrain type
                    estimatedBuildingCount: 0
                };
                setLastLocation(locationData);
            } else {
                locationData = await parseLocationSeed(locationInput);
                setLastLocation(locationData);
            }

            if (locationData.lat === 0 && locationData.lng === 0) {
                // Fallback: Use some known locations
                const fallbackLocations: Record<string, { lat: number; lng: number }> = {
                    'moscow': { lat: 55.7558, lng: 37.6173 },
                    'москва': { lat: 55.7558, lng: 37.6173 },
                    'tartu': { lat: 58.3780, lng: 26.7290 },
                    'paris': { lat: 48.8566, lng: 2.3522 },
                    'london': { lat: 51.5074, lng: -0.1278 },
                    'new york': { lat: 40.7128, lng: -74.0060 },
                    'tokyo': { lat: 35.6762, lng: 139.6503 },
                    'berlin': { lat: 52.5200, lng: 13.4050 },
                };

                const key = locationInput.toLowerCase();
                if (fallbackLocations[key]) {
                    locationData.lat = fallbackLocations[key].lat;
                    locationData.lng = fallbackLocations[key].lng;
                } else {
                    throw new Error('Невозможно определить координаты. Попробуйте другой город.');
                }
            }

            setState('fetching');
            const cacheKey = `${locationInput}-${radius}`;
            setStatusMessage(`Загрузка OSM данных для ${locationData.name}...`);

            // Step 2: Check cache or fetch OSM data
            let osmData: OSMData;
            let elevationData: number[];
            let fromCache = false;

            // Clear cache if force refresh is enabled
            if (forceRefresh) {
                await clearMapCache(cacheKey);
            }

            if (!forceRefresh) {
                const cached = await loadMapFromCache(cacheKey);
                if (cached) {
                    osmData = cached.osm;
                    elevationData = cached.elevation;
                    setStatusMessage('Загружено из кэша');
                    fromCache = true;
                }
            }

            if (!fromCache) {
                // Fetch fresh data
                const { lat, lng } = locationData;
                const width = radius * 2.2;
                const subdivs = 50;

                // Prepare elevation grid points
                const metersPerLat = 111132.92;
                const metersPerLon = 111412.84 * Math.cos(lat * (Math.PI / 180));

                const lats: number[] = [];
                const lngs: number[] = [];

                for (let row = 0; row <= subdivs; row++) {
                    for (let col = 0; col <= subdivs; col++) {
                        const x = (col / subdivs - 0.5) * width;
                        const z = (row / subdivs - 0.5) * width;
                        lngs.push((x / metersPerLon) + lng);
                        lats.push((z / metersPerLat) + lat);
                    }
                }

                // ============================================================
                // STREAMING MODE: Progressive loading for smooth UX
                // ============================================================

                // Step 1: Load OSM data for roads/water/forests (fast, single request)
                setStatusMessage('📡 Загрузка дорог и водоёмов...');
                setProgress(5);
                const osm = await fetchOSMData(lat, lng, radius);
                osmData = osm;
                setProgress(15);

                // Step 2: Skip elevation for now (use flat terrain for speed)
                // TODO: Load elevation in background after initial render
                elevationData = new Array(2601).fill(0); // 51x51 flat grid
                console.log('[RealWorld] Using flat terrain for fast loading');

                // Step 3: Generate base objects immediately (ground, roads, water)
                setState('generating');
                setStatusMessage('🏗️ Создание базовых объектов...');
                setProgress(20);

                const cubes: CubeElement[] = [];

                // Project function: lat/lon -> local meters
                // MUST MATCH PoltGenMap projection exactly!
                const project = (nLat: number, nLon: number): { x: number; z: number } => {
                    // metersPerLat formula expects lat in DEGREES (not radians!)
                    const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
                    // metersPerLon uses lat in RADIANS
                    const metersPerLon = 111132.954 * Math.cos(lat * (Math.PI / 180));
                    const x = (nLon - lng) * metersPerLon;
                    const z = (nLat - lat) * metersPerLat;  // No negation here - shape handles it
                    return { x, z };
                };

                // Height function (flat for now)
                const getHeight = (_x: number, _z: number): number => 0;

                // NOTE: Ground plane removed - TerrainMesh component handles terrain rendering


                // Generate roads from OSM - BLACK for all roads
                const roadColors: Record<string, string> = {
                    'motorway': '#111111', 'trunk': '#111111', 'primary': '#111111',
                    'secondary': '#111111', 'tertiary': '#111111', 'residential': '#111111',
                    'service': '#222222', 'footway': '#444444', 'path': '#555555'
                };
                let roadCount = 0;
                let debuggedRoad = false;
                if (osmData.highways) {
                    osmData.highways.forEach(way => {
                        // No road limit - generate all roads from OSM
                        const points: { x: number; z: number }[] = [];
                        const rawCoords: { lat: number; lon: number }[] = [];
                        way.nodes.forEach(nid => {
                            const n = osmData.nodes.get(nid);
                            if (n) {
                                rawCoords.push({ lat: n.lat, lon: n.lon });
                                points.push(project(n.lat, n.lon));
                            }
                        });

                        // DEBUG: Log first road's coordinates
                        if (!debuggedRoad && points.length >= 2) {
                            console.log('[COORD DEBUG] First road from Overpass:', {
                                roadId: way.id,
                                centerLatLng: { lat, lng },
                                firstNodeRaw: rawCoords[0],
                                firstNodeProjected: points[0],
                                formula: 'x = (lon - centerLng) * metersPerLon, z = (lat - centerLat) * metersPerLat'
                            });
                            debuggedRoad = true;
                        }

                        if (points.length >= 2) {
                            const roadType = way.tags['highway'] || 'residential';

                            // Skip pedestrian paths - they clutter intersections
                            if (roadType === 'footway' || roadType === 'path' || roadType === 'pedestrian' || roadType === 'cycleway') {
                                return;  // Don't generate pedestrian/bike paths
                            }

                            // Filter by road type toggles
                            if (!enableRoads) return;
                            if ((roadType === 'motorway' || roadType === 'trunk') && !enableMotorways) return;
                            if (roadType === 'primary' && !enablePrimary) return;
                            if ((roadType === 'secondary' || roadType === 'tertiary') && !enableSecondary) return;
                            if (roadType === 'residential' && !enableResidential) return;
                            if (roadType === 'service' && !enableService) return;

                            const roadColor = roadColors[roadType] || '#111111';
                            const widthMap: Record<string, number> = {
                                'motorway': 8, 'trunk': 7, 'primary': 6, 'secondary': 5,
                                'tertiary': 4, 'residential': 3, 'service': 2, 'footway': 1.5, 'path': 1
                            };
                            const roadWidth = (widthMap[roadType] || 3) * roadWidthMultiplier;

                            // Store road as a PATH with all polygon points (like rivers)
                            // Much more efficient than creating many cube segments!
                            cubes.push({
                                id: generateId(),
                                name: `Road_${way.id}`,
                                type: 'road',  // Dedicated road type
                                position: { x: 0, y: 0.6, z: 0 },  // Raised higher for visibility
                                rotation: { x: 0, y: 0, z: 0 },
                                size: { x: roadWidth, y: 0.1, z: 1 },  // Width stored in size.x
                                color: roadColor,
                                polygon: points,  // Store path as polygon array!
                                properties: {
                                    roadType: roadType,
                                    color: roadColor,
                                    width: roadWidth
                                },
                                visible: true,
                                isLocked: false,
                                isFavorite: false
                            });
                            roadCount++;
                        }
                    });
                }

                // ========== WATER: Process water bodies ==========
                let waterCount = 0;
                if (enableWater && osmData.water) {
                    osmData.water.forEach(way => {
                        if (waterCount >= 50) return;
                        const points: { x: number; z: number }[] = [];
                        let centerX = 0, centerZ = 0;
                        let minX = Infinity, maxX = -Infinity;
                        let minZ = Infinity, maxZ = -Infinity;

                        way.nodes.forEach(nid => {
                            const n = osmData.nodes.get(nid);
                            if (n) {
                                const p = project(n.lat, n.lon);
                                points.push(p);
                                centerX += p.x;
                                centerZ += p.z;
                                if (p.x < minX) minX = p.x;
                                if (p.x > maxX) maxX = p.x;
                                if (p.z < minZ) minZ = p.z;
                                if (p.z > maxZ) maxZ = p.z;
                            }
                        });

                        if (points.length < 3) return;
                        centerX /= points.length;
                        centerZ /= points.length;
                        const waterElevation = getHeight(centerX, centerZ);

                        // Water as POLYGON (like buildings but flat)
                        cubes.push({
                            id: generateId(),
                            name: `Water_${way.id}`,
                            type: 'water',  // Special type for water
                            position: { x: 0, y: waterElevation + 0.5, z: 0 },  // Well ABOVE ground to prevent z-fighting
                            rotation: { x: 0, y: 0, z: 0 },
                            size: { x: 1, y: 0.1, z: 1 },  // Very thin for water
                            color: '#1e5f8a', // Water blue
                            polygon: points,  // ABSOLUTE polygon coordinates
                            height: 0.3,  // Thin water surface
                            visible: true,
                            isLocked: false,
                            isFavorite: false
                        });
                        waterCount++;
                    });
                }


                // ========== RIVERS: Process rivers (linear waterways) ==========
                let riverCount = 0;
                if (enableWater && osmData.rivers) {
                    osmData.rivers.forEach(way => {
                        const points: { x: number; z: number }[] = [];
                        way.nodes.forEach(nid => {
                            const n = osmData.nodes.get(nid);
                            if (n) points.push(project(n.lat, n.lon));
                        });

                        if (points.length < 2) return;

                        // Calculate average elevation for the river
                        let avgElevation = 0;
                        points.forEach(p => {
                            avgElevation += getHeight(p.x, p.z);
                        });
                        avgElevation /= points.length;

                        // Store river as a water path with all points
                        cubes.push({
                            id: generateId(),
                            name: `River_${way.id}`,
                            type: 'water',  // Same type as lakes, rendered by SmoothRivers
                            position: { x: 0, y: avgElevation + 0.5, z: 0 },  // Raised to prevent z-fighting
                            rotation: { x: 0, y: 0, z: 0 },
                            size: { x: 1, y: 0.1, z: 1 },
                            color: '#1e90ff',
                            polygon: points,  // Store path points
                            visible: true,
                            isLocked: false,
                            isFavorite: false
                        });
                        riverCount++;
                    });
                }

                // Send initial objects (ground + roads + water)
                const terrainData: TerrainData = {
                    elevationGrid: elevationData!,
                    gridSize: 51,
                    width: radius * 2.2,
                    baseElevation: 0
                };

                onGenerate(cubes, `${locationData.name} (${radius}m)`, terrainData);
                console.log(`[RealWorld] Initial: ${cubes.length} objects (ground + roads + ${waterCount + riverCount} water)`);

                // ========== BUILDINGS: Generate from Overpass data ==========
                const buildingColors = ['#e5e7eb', '#d1d5db', '#f3f4f6', '#fef3c7', '#fee2e2', '#e0f2fe'];
                const roofColors = ['#4b5563', '#374151', '#7f1d1d', '#92400e', '#3f6212', '#1e3a8a'];
                let buildingCount = 0;
                let skippedSmall = 0, skippedLarge = 0;

                console.log(`[RealWorld] OSM returned ${osmData.buildings?.length || 0} buildings`);

                if (osmData.buildings) {
                    osmData.buildings.forEach(way => {

                        const points: { x: number; z: number }[] = [];
                        let centerX = 0, centerZ = 0;

                        way.nodes.forEach(nid => {
                            const n = osmData.nodes.get(nid);
                            if (n) {
                                const p = project(n.lat, n.lon);
                                points.push(p);
                                centerX += p.x;
                                centerZ += p.z;
                            }
                        });

                        if (points.length > 2) {
                            centerX /= points.length;
                            centerZ /= points.length;

                            let minX = Infinity, maxX = -Infinity;
                            let minZ = Infinity, maxZ = -Infinity;
                            points.forEach(p => {
                                if (p.x < minX) minX = p.x;
                                if (p.x > maxX) maxX = p.x;
                                if (p.z < minZ) minZ = p.z;
                                if (p.z > maxZ) maxZ = p.z;
                            });

                            const width = Math.max(2, maxX - minX);
                            const depth = Math.max(2, maxZ - minZ);
                            if (width > 200 || depth > 200) {
                                skippedLarge++;
                                return;  // Skip very large structures
                            }

                            let height = 6 + Math.random() * 8;
                            const tHeight = way.tags['height'];
                            const tLevels = way.tags['building:levels'] || way.tags['levels'];
                            if (tHeight) {
                                const parsed = parseFloat(tHeight);
                                if (!isNaN(parsed)) height = parsed;
                            } else if (tLevels) {
                                const parsed = parseFloat(tLevels);
                                if (!isNaN(parsed)) height = parsed * 3.5;
                            }

                            const terrainHeight = getHeight(centerX, centerZ);
                            const baseColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];

                            // ========== REAL POLYGON BUILDING (PoltGenMap style) ==========
                            // Store ABSOLUTE polygon coordinates - mesh positioned only by Y!
                            // This matches PoltGenMap's Babylon.js ExtrudePolygon approach
                            cubes.push({
                                id: generateId(),
                                name: `Building_${way.id}`,
                                type: 'polygon',
                                position: { x: 0, y: terrainHeight, z: 0 },  // Only Y for terrain height!
                                rotation: { x: 0, y: 0, z: 0 },
                                size: { x: width, y: height, z: depth },
                                color: baseColor,
                                properties: {
                                    material: 'rough_concrete',
                                    shape: 'polygon',
                                    osmId: way.id,
                                    buildingType: way.tags['building'] || 'yes'
                                },
                                polygon: points,  // ABSOLUTE coordinates (like PoltGenMap)!
                                height: height,
                                visible: true,
                                isLocked: false,
                                isFavorite: false
                            });

                            buildingCount++;
                        }
                    });
                }


                console.log(`[RealWorld] Generated ${buildingCount} buildings (skipped: ${skippedLarge} large, ${skippedSmall} small)`);

                // Send ALL objects at once (no streaming)
                const finalTerrainData: TerrainData = {
                    elevationGrid: elevationData!,
                    gridSize: 51,
                    width: radius * 2.2,
                    baseElevation: 0
                };

                onGenerate(cubes, `${locationData.name} (${radius}m)`, finalTerrainData);

                // Set final state
                setState('ready');
                setProgress(100);
                setStatusMessage(`✅ Готово! ${cubes.length} объектов`);
                console.log(`[RealWorld] 🌍 Imported ${cubes.length} objects from ${locationData.name.toUpperCase()} (${radius}m)`);

                return; // Exit early - all objects generated at once
            }

            setState('generating');
            if (state !== 'error') setStatusMessage('Генерация 3D геометрии...');

            // Step 3: Convert OSM data to CubeElements
            const cubes: CubeElement[] = [];
            const { lat, lng } = locationData;

            // Elevation grid parameters
            const gridSize = 51; // subdivs + 1 (matches the 50 subdivisions used in fetch)
            const mapWidth = radius * 2.2;
            const baseElevation = getBaseElevation(elevationData!);

            // Helper to get normalized elevation at any position
            const getHeight = (x: number, z: number): number => {
                const rawElevation = getElevationAt(x, z, elevationData!, gridSize, mapWidth);
                // Normalize: subtract base elevation so lowest point is at y=0
                return Math.max(0, (rawElevation - baseElevation) * 0.5); // 0.5 = vertical scale factor
            };

            // Project function: lat/lon -> local meters
            const project = (nLat: number, nLon: number): { x: number; z: number } => {
                // IMPORTANT: Math.cos expects radians, so convert lat to radians
                const latRad = lat * Math.PI / 180;
                const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
                const metersPerLon = 111132.954 * Math.cos(latRad);
                const x = (nLon - lng) * metersPerLon;
                const z = (nLat - lat) * metersPerLat;
                return { x, z };
            };

            // NOTE: Ground plane removed - TerrainMesh component handles terrain rendering


            // ============================================================
            // NEW: OSMBuildings tile-based building generation (FAST)
            // ============================================================
            let buildingCount = 0;

            // Check for cached OSMBuildings data or use fresh fetch
            const buildingFeatures = (osmData as any)._osmBuildingsFeatures || [];

            if (enableBuildings && buildingFeatures.length > 0) {
                console.log(`[RealWorld] Using OSMBuildings data: ${buildingFeatures.length} buildings`);

                // Convert OSMBuildings GeoJSON to CubeElements
                const buildingCubes = convertBuildingsToCubes(
                    buildingFeatures,
                    generateId,
                    lat,
                    lng,
                    getHeight,  // Pass terrain height function
                    600  // max buildings
                );

                cubes.push(...buildingCubes);
                buildingCount = buildingFeatures.length;
            } else if (enableBuildings) {
                console.warn('[RealWorld] No OSMBuildings data, falling back to Overpass');
                // Fallback to old Overpass-based building generation
                // This code path is used if OSMBuildings API fails
                const buildingColors = ['#e5e7eb', '#d1d5db', '#f3f4f6', '#fef3c7', '#fee2e2', '#e0f2fe'];
                const roofColors = ['#4b5563', '#374151', '#7f1d1d', '#92400e', '#3f6212', '#1e3a8a'];
                const buildingLimit = 600;

                if (osmData.buildings) {
                    osmData.buildings.forEach(way => {
                        if (buildingCount >= buildingLimit) return;

                        const points: { x: number; z: number }[] = [];
                        let centerX = 0, centerZ = 0;

                        way.nodes.forEach(nid => {
                            const n = osmData.nodes.get(nid);
                            if (n) {
                                const p = project(n.lat, n.lon);
                                points.push(p);
                                centerX += p.x;
                                centerZ += p.z;
                            }
                        });

                        if (points.length > 2) {
                            centerX /= points.length;
                            centerZ /= points.length;

                            let minX = Infinity, maxX = -Infinity;
                            let minZ = Infinity, maxZ = -Infinity;
                            points.forEach(p => {
                                if (p.x < minX) minX = p.x;
                                if (p.x > maxX) maxX = p.x;
                                if (p.z < minZ) minZ = p.z;
                                if (p.z > maxZ) maxZ = p.z;
                            });

                            const width = Math.max(2, maxX - minX);
                            const depth = Math.max(2, maxZ - minZ);
                            if (width > 120 || depth > 120) return;

                            let height = 6 + Math.random() * 8;
                            const tHeight = way.tags['height'];
                            const tLevels = way.tags['building:levels'] || way.tags['levels'];
                            if (tHeight) {
                                const parsed = parseFloat(tHeight);
                                if (!isNaN(parsed)) height = parsed;
                            } else if (tLevels) {
                                const parsed = parseFloat(tLevels);
                                if (!isNaN(parsed)) height = parsed * 3.5;
                            }

                            const terrainHeight = getHeight(centerX, centerZ);
                            const baseColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];

                            cubes.push({
                                id: generateId(),
                                name: `Building_${way.id}`,
                                type: 'cube',
                                color: baseColor,  // Required field
                                position: { x: centerX, y: terrainHeight + height / 2, z: centerZ },
                                rotation: { x: 0, y: 0, z: 0 },
                                size: { x: width, y: height, z: depth },
                                properties: { color: baseColor, material: 'rough_concrete', shape: 'box' },
                                visible: true, isLocked: false, isFavorite: false
                            });
                            buildingCount++;
                        }
                    });
                }
            }

            // Process highways/roads
            let roadCount = 0;
            osmData.highways.forEach(way => {
                if (roadCount >= 300) return; // Limit for performance

                const points: { x: number; z: number }[] = [];
                way.nodes.forEach(nid => {
                    const n = osmData.nodes.get(nid);
                    if (n) points.push(project(n.lat, n.lon));
                });

                if (points.length < 2) return;

                // Create road segments as flat cubes
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];
                    const dx = p2.x - p1.x;
                    const dz = p2.z - p1.z;
                    const length = Math.sqrt(dx * dx + dz * dz);
                    if (length < 1) continue; // Skip tiny segments

                    const angle = Math.atan2(dz, dx) * (180 / Math.PI);

                    // Road width based on type
                    const roadType = way.tags.highway;
                    const roadWidth = roadType === 'primary' || roadType === 'trunk' ? 10 :
                        roadType === 'secondary' ? 8 :
                            roadType === 'tertiary' ? 6 :
                                roadType === 'residential' ? 5 : 4;

                    // Get terrain elevation for road segment (average of endpoints)
                    const roadElevation = (getHeight(p1.x, p1.z) + getHeight(p2.x, p2.z)) / 2;

                    cubes.push({
                        id: generateId(),
                        name: `Road_${roadType || 'road'}`,
                        type: 'cube',
                        position: { x: (p1.x + p2.x) / 2, y: roadElevation + 0.05, z: (p1.z + p2.z) / 2 },
                        rotation: { x: 0, y: -angle, z: 0 },
                        size: { x: length + 0.5, y: 0.1, z: roadWidth },
                        color: '#2a2a2a', // Dark asphalt
                        visible: true,
                        isLocked: false,
                        isFavorite: false
                    });
                    roadCount++;
                }
            });

            // Process rivers (linear waterways)
            let riverCount = 0;
            if (osmData.rivers) {
                osmData.rivers.forEach(way => {
                    const points: { x: number; z: number }[] = [];
                    way.nodes.forEach(nid => {
                        const n = osmData.nodes.get(nid);
                        if (n) points.push(project(n.lat, n.lon));
                    });

                    if (points.length < 2) return;

                    // Create river segments
                    for (let i = 0; i < points.length - 1; i++) {
                        const p1 = points[i];
                        const p2 = points[i + 1];
                        const dx = p2.x - p1.x;
                        const dz = p2.z - p1.z;
                        const length = Math.sqrt(dx * dx + dz * dz);
                        if (length < 0.5) continue;

                        const angle = Math.atan2(dz, dx) * (180 / Math.PI);

                        // Rivers are wide and sit lower than terrain
                        const riverWidth = 12 + Math.random() * 4;

                        // Get terrain elevation
                        const riverElevation = (getHeight(p1.x, p1.z) + getHeight(p2.x, p2.z)) / 2;

                        cubes.push({
                            id: generateId(),
                            name: `River_${way.id}_${i}`,
                            type: 'cube',
                            position: { x: (p1.x + p2.x) / 2, y: riverElevation - 0.8, z: (p1.z + p2.z) / 2 },
                            rotation: { x: 0, y: -angle, z: 0 },
                            size: { x: length + 0.5, y: 0.8, z: riverWidth },
                            color: '#1e5f8a', // Water blue
                            visible: true,
                            isLocked: false,
                            isFavorite: false
                        });
                        riverCount++;
                    }
                });
            }

            // Process vegetation (trees and forests)
            let treeCount = 0;
            if (osmData.trees) {
                osmData.trees.forEach(node => {
                    const p = project(node.lat, node.lon);
                    const treeHeight = getHeight(p.x, p.z);
                    cubes.push({
                        id: generateId(),
                        name: `Tree_${node.id}`,
                        type: 'cube',
                        position: { x: p.x, y: treeHeight + 1.5, z: p.z },
                        rotation: { x: 0, y: Math.random() * 360, z: 0 },
                        size: { x: 0.5, y: 3 + Math.random() * 2, z: 0.5 },
                        color: '#2d5c1e',
                        visible: true,
                        isLocked: false,
                        isFavorite: false
                    });
                    treeCount++;
                });
            }

            // Process forests
            if (osmData.forests) {
                osmData.forests.forEach(way => {
                    const points: { x: number; z: number }[] = [];
                    let minX = Infinity, maxX = -Infinity;
                    let minZ = Infinity, maxZ = -Infinity;

                    way.nodes.forEach(nid => {
                        const n = osmData.nodes.get(nid);
                        if (n) {
                            const p = project(n.lat, n.lon);
                            points.push(p);
                            if (p.x < minX) minX = p.x;
                            if (p.x > maxX) maxX = p.x;
                            if (p.z < minZ) minZ = p.z;
                            if (p.z > maxZ) maxZ = p.z;
                        }
                    });

                    if (points.length < 3) return;

                    const width = maxX - minX;
                    const depth = maxZ - minZ;
                    const area = width * depth * 0.5;
                    // Scale tree count by area, limit max
                    const numTrees = Math.min(300, Math.floor(area / 30));

                    for (let i = 0; i < numTrees; i++) {
                        const tx = minX + Math.random() * (maxX - minX);
                        const tz = minZ + Math.random() * (maxZ - minZ);

                        // Point in polygon check (Ray Casting)
                        let inside = false;
                        for (let j = 0, k = points.length - 1; j < points.length; k = j++) {
                            const xi = points[j].x, yi = points[j].z;
                            const xj = points[k].x, yj = points[k].z;
                            const intersect = ((yi > tz) !== (yj > tz))
                                && (tx < (xj - xi) * (tz - yi) / (yj - yi) + xi);
                            if (intersect) inside = !inside;
                        }

                        if (inside) {
                            const th = getHeight(tx, tz);
                            cubes.push({
                                id: generateId(),
                                name: `ForestTree_${way.id}_${i}`,
                                type: 'cube',
                                position: { x: tx, y: th + 1.5, z: tz },
                                rotation: { x: 0, y: Math.random() * 360, z: 0 },
                                size: { x: 0.6 + Math.random() * 0.4, y: 2.5 + Math.random() * 2.5, z: 0.6 + Math.random() * 0.4 },
                                color: '#1a4015', // Forest green
                                visible: true,
                                isLocked: false,
                                isFavorite: false
                            });
                            treeCount++;
                        }
                    }
                });
            }

            // Process water bodies
            let waterCount = 0;
            osmData.water.forEach(way => {
                if (waterCount >= 50) return; // Limit

                const points: { x: number; z: number }[] = [];
                let centerX = 0, centerZ = 0;
                let minX = Infinity, maxX = -Infinity;
                let minZ = Infinity, maxZ = -Infinity;

                way.nodes.forEach(nid => {
                    const n = osmData.nodes.get(nid);
                    if (n) {
                        const p = project(n.lat, n.lon);
                        points.push(p);
                        centerX += p.x;
                        centerZ += p.z;
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.z < minZ) minZ = p.z;
                        if (p.z > maxZ) maxZ = p.z;
                    }
                });

                if (points.length < 3) return;

                centerX /= points.length;
                centerZ /= points.length;
                const width = Math.max(3, maxX - minX);
                const depth = Math.max(3, maxZ - minZ);

                // Get terrain elevation for water (water sits in low areas)
                const waterElevation = getHeight(centerX, centerZ);

                cubes.push({
                    id: generateId(),
                    name: `Water_${way.id}`,
                    type: 'cube',
                    position: { x: centerX, y: waterElevation - 0.3, z: centerZ },
                    rotation: { x: 0, y: 0, z: 0 },
                    size: { x: width, y: 0.4, z: depth },
                    color: '#1e5f8a', // Water blue
                    visible: true,
                    isLocked: false,
                    isFavorite: false
                });
                waterCount++;
            });

            setState('ready');
            setStatusMessage(`Готово! ${cubes.length} объектов (${buildingCount} зданий, ${roadCount} дорог, ${waterCount + riverCount} водных, ${treeCount} деревьев)`);

            // Pass to parent with terrain data
            const terrainData: TerrainData = {
                elevationGrid: elevationData!,
                gridSize: gridSize,
                width: mapWidth,
                baseElevation: baseElevation
            };
            onGenerate(cubes, locationInput, terrainData);

        } catch (error) {
            console.error('[RealWorld] Generation error:', error);
            setState('error');
            setStatusMessage(error instanceof Error ? error.message : 'Ошибка генерации');
        }
    }, [locationInput, radius, onGenerate, generateId, forceRefresh,
        enableRoads, enableMotorways, enablePrimary, enableSecondary, enableResidential, enableService,
        enableBuildings, enableWater, roadWidthMultiplier, buildingHeightMultiplier]);

    return (
        <div className="p-4 space-y-4 bg-gray-900 rounded-lg border border-gray-700">
            <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2">🌍 Real World Generator</span>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={`p-1 rounded transition-colors ${showAdvanced ? 'text-green-400 bg-gray-700' : 'text-gray-500 hover:text-gray-300'}`}
                    title="Расширенные настройки"
                >
                    ⚙️
                </button>
            </h3>

            <div className="space-y-3">
                {/* Location Input */}
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Город или адрес</label>
                    <input
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        placeholder="Moscow, Tartu, Paris..."
                        className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-400 block mb-1">
                        Радиус: {radius}м ({(radius * 2 / 1000).toFixed(1)} км)
                    </label>
                    <input
                        type="range"
                        min={100}
                        max={5000}
                        step={50}
                        value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        className="w-full accent-green-500"
                    />
                </div>

                {/* Options */}
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="forceRefresh"
                        checked={forceRefresh}
                        onChange={(e) => setForceRefresh(e.target.checked)}
                        className="accent-green-500 w-3 h-3"
                    />
                    <label htmlFor="forceRefresh" className="text-[10px] text-gray-400 cursor-pointer select-none">
                        Принудительно обновить (без кэша)
                    </label>
                </div>

                {/* Advanced Settings Panel */}
                {showAdvanced && (
                    <div className="mt-2 p-3 bg-gray-800 rounded border border-gray-600 space-y-3">
                        <div className="text-xs font-semibold text-gray-300 border-b border-gray-600 pb-1">
                            🛣️ Типы дорог
                        </div>
                        <div className="flex flex-col gap-1 text-[10px]">
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableMotorways} onChange={e => setEnableMotorways(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                Автомагистрали
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enablePrimary} onChange={e => setEnablePrimary(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                Главные дороги
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableSecondary} onChange={e => setEnableSecondary(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                Второстепенные
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableResidential} onChange={e => setEnableResidential(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                Жилые улицы
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableService} onChange={e => setEnableService(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                Служебные
                            </label>
                        </div>

                        <div className="text-xs font-semibold text-gray-300 border-b border-gray-600 pb-1 pt-2">
                            🏗️ Объекты
                        </div>
                        <div className="flex flex-col gap-1 text-[10px]">
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableBuildings} onChange={e => setEnableBuildings(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                🏠 Здания
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableRoads} onChange={e => setEnableRoads(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                🛣️ Дороги
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={enableWater} onChange={e => setEnableWater(e.target.checked)} className="accent-green-500 w-3 h-3" />
                                🌊 Водоёмы
                            </label>
                        </div>

                        <div className="text-xs font-semibold text-gray-300 border-b border-gray-600 pb-1 pt-2">
                            📏 Масштаб
                        </div>
                        <div className="space-y-2">
                            <div>
                                <label className="text-[10px] text-gray-400 block mb-1">
                                    Высота зданий: ×{buildingHeightMultiplier.toFixed(1)}
                                </label>
                                <input
                                    type="range"
                                    min={0.5}
                                    max={3}
                                    step={0.1}
                                    value={buildingHeightMultiplier}
                                    onChange={e => setBuildingHeightMultiplier(Number(e.target.value))}
                                    className="w-full accent-green-500 h-1"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 block mb-1">
                                    Ширина дорог: ×{roadWidthMultiplier.toFixed(1)}
                                </label>
                                <input
                                    type="range"
                                    min={0.5}
                                    max={3}
                                    step={0.1}
                                    value={roadWidthMultiplier}
                                    onChange={e => setRoadWidthMultiplier(Number(e.target.value))}
                                    className="w-full accent-green-500 h-1"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={!locationInput.trim() || state === 'parsing' || state === 'fetching' || state === 'generating'}
                    className={`w-full py-2 px-4 rounded font-bold text-sm uppercase transition-colors ${state === 'parsing' || state === 'fetching' || state === 'generating'
                        ? 'bg-gray-700 text-gray-400 cursor-wait'
                        : 'bg-green-600 text-white hover:bg-green-500'
                        }`}
                >
                    {state === 'parsing' && '🔍 Поиск координат...'}
                    {state === 'fetching' && '📡 Загрузка данных...'}
                    {state === 'generating' && '🏗️ Генерация...'}
                    {(state === 'idle' || state === 'ready' || state === 'error') && '🚀 Сгенерировать'}
                </button>

                {/* Progress Bar */}
                {(state === 'fetching' || state === 'generating') && progress > 0 && (
                    <div className="w-full bg-gray-800 rounded-full h-2.5 mt-2 border border-gray-700 overflow-hidden">
                        <div
                            className="bg-green-500 h-full transition-all duration-300 ease-out flex items-center justify-end pr-1"
                            style={{ width: `${progress}%` }}
                        >
                        </div>
                        <div className="text-center text-[10px] text-gray-400 mt-1">{Math.round(progress)}%</div>
                    </div>
                )}

                {/* Status Message */}
                <div className={`text-xs p-2 rounded ${state === 'error' ? 'bg-red-900/50 text-red-300' :
                    state === 'ready' ? 'bg-green-900/50 text-green-300' :
                        'bg-gray-800 text-gray-400'
                    }`}>
                    {statusMessage}
                </div>

                {/* Last Location Info */}
                {lastLocation && (
                    <div className="text-[10px] text-gray-500 space-y-0.5">
                        <div>📍 {lastLocation.lat.toFixed(4)}, {lastLocation.lng.toFixed(4)}</div>
                        <div>🏔️ Тип: {lastLocation.terrainType}</div>
                        {lastLocation.estimatedBuildingCount > 0 && (
                            <div>🏢 ~{lastLocation.estimatedBuildingCount.toLocaleString()} зданий в городе</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RealWorldGenerator;
