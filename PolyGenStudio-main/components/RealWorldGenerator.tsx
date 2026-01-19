// Real World Generator Component - Uses OSM data to create Three.js geometry
import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import { fetchOSMData, OSMData, OSMNode } from '../services/osmService';
import { fetchElevationGrid } from '../services/elevationService';
import { parseLocationSeed, GeoLocationData } from '../services/geminiService';
import { loadMapFromCache, saveMapToCache } from '../services/cacheService';
import { CubeElement } from '../types';

interface RealWorldGeneratorProps {
    onGenerate: (cubes: CubeElement[], mapName: string) => void;
    generateId: () => string;
}

type GenerationState = 'idle' | 'parsing' | 'fetching' | 'generating' | 'ready' | 'error';

const RealWorldGenerator: React.FC<RealWorldGeneratorProps> = ({ onGenerate, generateId }) => {
    const [locationInput, setLocationInput] = useState('');
    const [state, setState] = useState<GenerationState>('idle');
    const [statusMessage, setStatusMessage] = useState('Введите название города или адрес');
    const [radius, setRadius] = useState(300); // meters
    const [lastLocation, setLastLocation] = useState<GeoLocationData | null>(null);

    const handleGenerate = useCallback(async () => {
        if (!locationInput.trim()) return;

        setState('parsing');
        setStatusMessage('Поиск координат через AI...');

        try {
            // Step 1: Parse location via Gemini AI
            const locationData = await parseLocationSeed(locationInput);
            setLastLocation(locationData);

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

            const cached = await loadMapFromCache(cacheKey);
            if (cached) {
                osmData = cached.osm;
                elevationData = cached.elevation;
                setStatusMessage('Загружено из кэша');
            } else {
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

                // Fetch OSM and elevation in parallel
                const [osm, elevation] = await Promise.all([
                    fetchOSMData(lat, lng, radius),
                    fetchElevationGrid(lats, lngs)
                ]);

                osmData = osm;
                elevationData = elevation;

                // Cache the data
                await saveMapToCache(cacheKey, osmData, elevationData);
            }

            setState('generating');
            setStatusMessage('Генерация 3D геометрии...');

            // Step 3: Convert OSM data to CubeElements
            const cubes: CubeElement[] = [];
            const { lat, lng } = locationData;

            // Project function: lat/lon -> local meters
            const project = (nLat: number, nLon: number): { x: number; z: number } => {
                const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
                const metersPerLon = 111132.954 * Math.cos(lat * (Math.PI / 180));
                const x = (nLon - lng) * metersPerLon;
                const z = (nLat - lat) * metersPerLat;
                return { x, z };
            };

            // Generate ground plane
            cubes.push({
                id: generateId(),
                name: 'Ground',
                type: 'cube',
                position: { x: 0, y: -0.5, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: radius * 2.5, y: 1, z: radius * 2.5 },
                color: '#2d4a3e', // Dark green/grey ground
                visible: true,
                isLocked: true,
                isFavorite: false
            });

            // Process buildings
            let buildingCount = 0;
            osmData.buildings.forEach(way => {
                if (buildingCount >= 500) return; // Limit for performance

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

                    // Calculate bounding box for size
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

                    // Determine height from tags or heuristics
                    let height = 8 + Math.random() * 8;
                    const tHeight = way.tags['height'];
                    const tLevels = way.tags['building:levels'] || way.tags['levels'];

                    if (tHeight) {
                        const parsed = parseFloat(tHeight);
                        if (!isNaN(parsed)) height = parsed;
                    } else if (tLevels) {
                        const parsed = parseFloat(tLevels);
                        if (!isNaN(parsed)) height = parsed * 3.5;
                    } else {
                        const type = way.tags['building'];
                        if (type === 'apartments' || type === 'office' || type === 'hotel') {
                            height = 16 + Math.random() * 24;
                        } else if (type === 'church' || type === 'cathedral') {
                            height = 25 + Math.random() * 20;
                        } else if (type === 'industrial' || type === 'retail') {
                            height = 8 + Math.random() * 6;
                        }
                    }

                    cubes.push({
                        id: generateId(),
                        name: `Building_${way.id}`,
                        type: 'cube',
                        position: { x: centerX, y: height / 2, z: centerZ },
                        rotation: { x: 0, y: 0, z: 0 },
                        size: { x: width, y: height, z: depth },
                        color: '#c8c8d0', // Light grey concrete
                        visible: true,
                        isLocked: false,
                        isFavorite: false
                    });

                    buildingCount++;
                }
            });

            setState('ready');
            setStatusMessage(`Готово! ${cubes.length} объектов (${buildingCount} зданий)`);

            // Pass to parent
            onGenerate(cubes, locationInput);

        } catch (error) {
            console.error('[RealWorld] Generation error:', error);
            setState('error');
            setStatusMessage(error instanceof Error ? error.message : 'Ошибка генерации');
        }
    }, [locationInput, radius, onGenerate, generateId]);

    return (
        <div className="p-4 space-y-4 bg-gray-900 rounded-lg border border-gray-700">
            <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                🌍 Real World Generator
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

                {/* Radius Slider */}
                <div>
                    <label className="text-xs text-gray-400 block mb-1">
                        Радиус: {radius}м ({(radius * 2 / 1000).toFixed(1)} км)
                    </label>
                    <input
                        type="range"
                        min={100}
                        max={1000}
                        step={50}
                        value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        className="w-full accent-green-500"
                    />
                </div>

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
                    {state === 'fetching' && '📡 Загрузка OSM...'}
                    {state === 'generating' && '🏗️ Генерация...'}
                    {(state === 'idle' || state === 'ready' || state === 'error') && '🚀 Сгенерировать'}
                </button>

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
