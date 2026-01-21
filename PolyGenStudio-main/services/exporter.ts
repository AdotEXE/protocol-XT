import { CubeElement } from "../types";
import * as THREE from 'three';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const exportToJSON = (cubes: CubeElement[], name: string) => {
    const json = JSON.stringify(cubes, null, 2);
    downloadFile(json, `${name}.json`, 'application/json');
};

export const exportToPoly = (cubes: CubeElement[], name: string) => {
    const json = JSON.stringify(cubes, null, 2);
    downloadFile(json, `${name}.poly`, 'application/json');
};

export const exportToOBJ = (cubes: CubeElement[], name: string) => {
    let output = `# PolyGen AI Export - ${name}\n`;
    output += `mtllib ${name}.mtl\n`;
    output += `o ${name}\n`;

    let vertexOffset = 1;

    cubes.forEach((cube, index) => {
        if (!cube.visible) return;

        output += `g ${cube.name}_${index}\n`;

        const geometry = new THREE.BoxGeometry(cube.size.x, cube.size.y, cube.size.z);
        const mesh = new THREE.Mesh(geometry);

        mesh.position.set(cube.position.x, cube.position.y, cube.position.z);
        mesh.rotation.set(
            THREE.MathUtils.degToRad(cube.rotation.x),
            THREE.MathUtils.degToRad(cube.rotation.y),
            THREE.MathUtils.degToRad(cube.rotation.z)
        );
        mesh.updateMatrix();

        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            vertex.applyMatrix4(mesh.matrix);
            output += `v ${vertex.x.toFixed(4)} ${vertex.y.toFixed(4)} ${vertex.z.toFixed(4)}\n`;
        }

        const indexAttribute = geometry.index;
        if (indexAttribute) {
            for (let i = 0; i < indexAttribute.count; i += 3) {
                const a = indexAttribute.getX(i) + vertexOffset;
                const b = indexAttribute.getX(i + 1) + vertexOffset;
                const c = indexAttribute.getX(i + 2) + vertexOffset;
                output += `f ${a} ${b} ${c}\n`;
            }
            vertexOffset += posAttribute.count;
        }
    });

    downloadFile(output, `${name}.obj`, 'text/plain');
};

export const exportToPLY = (cubes: CubeElement[], name: string) => {
    let vertexCount = 0;
    let faceCount = 0;
    let body = '';

    cubes.forEach(cube => {
        if (!cube.visible) return;

        // 8 vertices per cube
        const hw = cube.size.x / 2;
        const hh = cube.size.y / 2;
        const hd = cube.size.z / 2;

        const vertices = [
            new THREE.Vector3(hw, hh, hd), new THREE.Vector3(hw, hh, -hd), new THREE.Vector3(hw, -hh, hd), new THREE.Vector3(hw, -hh, -hd),
            new THREE.Vector3(-hw, hh, -hd), new THREE.Vector3(-hw, hh, hd), new THREE.Vector3(-hw, -hh, -hd), new THREE.Vector3(-hw, -hh, hd)
        ];

        // Apply transforms
        const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(cube.position.x, cube.position.y, cube.position.z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(
                THREE.MathUtils.degToRad(cube.rotation.x),
                THREE.MathUtils.degToRad(cube.rotation.y),
                THREE.MathUtils.degToRad(cube.rotation.z)
            )),
            new THREE.Vector3(1, 1, 1)
        );

        const color = new THREE.Color(cube.color);
        const r = Math.floor(color.r * 255);
        const g = Math.floor(color.g * 255);
        const b = Math.floor(color.b * 255);

        vertices.forEach(v => {
            v.applyMatrix4(matrix);
            body += `${v.x.toFixed(3)} ${v.y.toFixed(3)} ${v.z.toFixed(3)} ${r} ${g} ${b}\n`;
        });

        // 6 faces (quads converted to indices)
        // Indices relative to current cube
        const base = vertexCount;
        const faces = [
            [0, 2, 3, 1], // Right
            [4, 6, 7, 5], // Left
            [0, 1, 4, 5], // Top
            [7, 3, 2, 6], // Bottom
            [5, 1, 3, 7], // Back
            [0, 5, 4, 1]  // Front (Correcting order might be needed based on ply viewer, using generic box winding)
        ];

        const f = [
            [0, 1, 3, 2], // +X
            [5, 4, 6, 7], // -X
            [5, 0, 2, 7], // +Z (Front)
            [1, 4, 6, 3], // -Z (Back)
            [5, 4, 1, 0], // +Y
            [7, 2, 3, 6], // -Y
        ];

        f.forEach(face => {
            body += `4 ${base + face[0]} ${base + face[1]} ${base + face[2]} ${base + face[3]}\n`;
        });

        vertexCount += 8;
        faceCount += 6;
    });

    let header = `ply\nformat ascii 1.0\nelement vertex ${vertexCount}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${faceCount}\nproperty list uchar int vertex_index\nend_header\n`;

    downloadFile(header + body, `${name}.ply`, 'text/plain');
};

export const exportToBlockbench = (cubes: CubeElement[], name: string) => {
    const bbModel = {
        meta: {
            format_version: "4.0",
            model_format: "free",
            box_uv: false
        },
        name: name,
        resolution: { width: 16, height: 16 },
        elements: cubes.map(cube => {
            const from = [
                cube.position.x - cube.size.x / 2,
                cube.position.y - cube.size.y / 2,
                cube.position.z - cube.size.z / 2
            ];
            const to = [
                cube.position.x + cube.size.x / 2,
                cube.position.y + cube.size.y / 2,
                cube.position.z + cube.size.z / 2
            ];
            return {
                name: cube.name,
                from: from,
                to: to,
                rotation: {
                    origin: [cube.position.x, cube.position.y, cube.position.z],
                    axis: 'y',
                    angle: cube.rotation.y
                },
                color: parseInt(cube.color.replace('#', ''), 16)
            };
        })
    };

    downloadFile(JSON.stringify(bbModel, null, 2), `${name}.bbmodel`, 'application/json');
};

export const importFromBlockbench = (content: string): CubeElement[] => {
    try {
        const data = JSON.parse(content);
        if (!data.elements) return [];

        return data.elements.map((el: any) => {
            const from = el.from || [0, 0, 0];
            const to = el.to || [1, 1, 1];

            const size = {
                x: Math.abs(to[0] - from[0]),
                y: Math.abs(to[1] - from[1]),
                z: Math.abs(to[2] - from[2])
            };

            const position = {
                x: from[0] + size.x / 2,
                y: from[1] + size.y / 2,
                z: from[2] + size.z / 2
            };

            const rotation = { x: 0, y: 0, z: 0 };
            if (el.rotation) {
                if (el.rotation.axis === 'x') rotation.x = el.rotation.angle;
                if (el.rotation.axis === 'y') rotation.y = el.rotation.angle;
                if (el.rotation.axis === 'z') rotation.z = el.rotation.angle;
            }

            let color = '#ffffff';
            if (typeof el.color === 'number') {
                color = '#' + el.color.toString(16).padStart(6, '0');
            } else if (typeof el.color === 'string') {
                color = el.color; // Some BB versions use hex string
            }

            return {
                id: el.uuid || generateId(),
                name: el.name || 'Cube',
                type: 'cube',
                parentId: null,
                position,
                size,
                rotation,
                color,
                visible: true,
                isLocked: false
            };
        });
    } catch (e) {
        console.error("Failed to parse BBModel", e);
        return [];
    }
};

// ============================================
// TX MAP FORMAT EXPORT/IMPORT
// ============================================

/**
 * TX MapData format interface (matches TX game format)
 */
interface TXMapData {
    version: number;
    name: string;
    mapType: string;
    terrainEdits: Array<{
        x: number;
        z: number;
        height: number;
        radius: number;
        operation: "raise" | "lower" | "flatten" | "smooth";
    }>;
    placedObjects: Array<{
        id: string;
        type: "building" | "tree" | "rock" | "spawn" | "garage" | "custom" | "npc";
        position: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
        scale?: { x: number; y: number; z: number };
        properties?: Record<string, any>;
    }>;
    triggers: Array<{
        id: string;
        type: "spawn" | "teleport" | "damage" | "heal" | "custom";
        position: { x: number; y: number; z: number };
        size: { width: number; height: number; depth: number };
        properties?: Record<string, any>;
    }>;
    metadata: {
        createdAt: number;
        modifiedAt: number;
        author?: string;
        description?: string;
        isPreset?: boolean;
        mapSize?: number;
    };
}

/**
 * Determine TX object type from cube properties
 */
const determineTXObjectType = (cube: CubeElement): TXMapData['placedObjects'][0]['type'] => {
    const name = cube.name.toLowerCase();

    // Check name for hints
    if (name.includes('building') || name.includes('house') || name.includes('factory')) return 'building';
    if (name.includes('tree') || name.includes('plant') || name.includes('forest')) return 'tree';
    if (name.includes('rock') || name.includes('stone') || name.includes('boulder')) return 'rock';
    if (name.includes('spawn') || name.includes('start')) return 'spawn';
    if (name.includes('spawn') || name.includes('start')) return 'spawn';
    if (name.includes('garage') || name.includes('repair')) return 'garage';
    if (name.includes('npc') || name.includes('enemy') || name.includes('tank_heavy') || name.includes('turret')) return 'npc';

    // Determine by size/shape
    const { x, y, z } = cube.size;

    // Tall and thin = tree
    if (y > Math.max(x, z) * 2 && x < 3 && z < 3) return 'tree';

    // Large and box-shaped = building
    if (x > 5 || z > 5) return 'building';

    // Small round-ish = rock
    if (Math.abs(x - z) < 1 && x < 5 && y < 3) return 'rock';

    // Default to custom
    return 'custom';
};

/**
 * Export cubes to TX Map format
 */

// ============================================
// HELPERS
// ============================================

const determineTXTriggerType = (name: string): TXMapData['triggers'][0]['type'] => {
    if (name.includes('damage')) return 'damage';
    if (name.includes('heal')) return 'heal';
    if (name.includes('teleport')) return 'teleport';
    if (name.includes('spawn')) return 'spawn'; // Spawn points can be triggers too? No, usually placed objects.
    return 'custom';
};

/**
 * Scale factor for converting editor coordinates to game world coordinates
 * Set to 1 for 1:1 mapping (editor units = game units)
 */
const EDITOR_TO_GAME_SCALE = 1;

/**
 * Extract map data from cubes (Separates Objects and Triggers)
 * Applies EDITOR_TO_GAME_SCALE to convert editor units to game world units
 */
const extractMapData = (cubes: CubeElement[]) => {
    const placedObjects: TXMapData['placedObjects'] = [];
    const triggers: TXMapData['triggers'] = [];

    cubes.forEach(cube => {
        // Экспортируем ВСЕ видимые объекты (убрана проверка на type === 'cube')
        if (!cube.visible) return;

        // КРИТИЧНО: Для polygon-объектов (Real World Generator) позиция хранится в вершинах полигона,
        // а cube.position всегда (0, Y, 0). Нужно вычислить центр полигона!
        let actualPosition = cube.position;

        if (cube.polygon && cube.polygon.length >= 3) {
            // Вычисляем центроид (центр) полигона
            let sumX = 0, sumZ = 0;
            for (const vertex of cube.polygon) {
                sumX += vertex.x;
                sumZ += vertex.z;
            }
            const centerX = sumX / cube.polygon.length;
            const centerZ = sumZ / cube.polygon.length;

            // Позиция = центр полигона + высота Y
            actualPosition = {
                x: centerX,
                y: cube.position.y,
                z: centerZ
            };
        }

        // Scale position and size from editor to game coordinates
        const scaledPosition = {
            x: actualPosition.x * EDITOR_TO_GAME_SCALE,
            y: actualPosition.y * EDITOR_TO_GAME_SCALE,
            z: actualPosition.z * EDITOR_TO_GAME_SCALE
        };

        // КРИТИЧНО: Для polygon-зданий высота хранится в cube.height, а не cube.size.y!
        const actualHeight = cube.height || cube.size.y || 10;

        const scaledSize = {
            x: cube.size.x * EDITOR_TO_GAME_SCALE,
            y: actualHeight * EDITOR_TO_GAME_SCALE,
            z: cube.size.z * EDITOR_TO_GAME_SCALE
        };

        // Check if Trigger
        if (cube.name.startsWith('trigger_') || cube.name.includes('Zone')) {
            triggers.push({
                id: cube.id,
                type: determineTXTriggerType(cube.name),
                position: scaledPosition,
                size: { width: scaledSize.x, height: scaledSize.y, depth: scaledSize.z },
                properties: {
                    name: cube.name,
                    ...cube.material // Pass material if needed
                }
            });
        } else {
            // Standard Object
            placedObjects.push({
                id: cube.id,
                type: determineTXObjectType(cube),
                position: scaledPosition,
                rotation: cube.rotation,
                scale: scaledSize,
                properties: {
                    color: cube.color,
                    material: cube.material,
                    name: cube.name,
                    hasCollision: true,
                    isDestructible: false
                }
            });
        }
    });

    return { placedObjects, triggers };
};

/**
 * Export cubes to TX Map format
 */
export const exportToTXMap = (cubes: CubeElement[], name: string, description?: string) => {
    const now = Date.now();
    const { placedObjects, triggers } = extractMapData(cubes);

    const mapData: TXMapData = {
        version: 1,
        name: name,
        mapType: "custom",
        terrainEdits: [],
        placedObjects: placedObjects,
        triggers: triggers,
        metadata: {
            createdAt: now,
            modifiedAt: now,
            author: "PolyGenStudio",
            description: description || `Map generated with PolyGenStudio AI`,
            isPreset: false,
            mapSize: 200,
            requireGarage: false // Custom maps: tank customization applies without entering garage
        }
    };

    const json = JSON.stringify(mapData, null, 2);
    downloadFile(json, `${name}.txmap`, 'application/json');

    return mapData;
};

/**
 * Export cubes for TEST mode - NO file download, just returns data
 */
export const exportForTest = (cubes: CubeElement[], name: string = 'test_map'): TXMapData => {
    const now = Date.now();
    const { placedObjects, triggers } = extractMapData(cubes);

    console.log(`[Exporter] exportForTest: ${cubes.length} cubes -> ${placedObjects.length} objects`);

    const mapData: TXMapData = {
        version: 1,
        name: name,
        mapType: "custom",
        terrainEdits: [],
        placedObjects: placedObjects,
        triggers: triggers,
        metadata: {
            createdAt: now,
            modifiedAt: now,
            author: "PolyGenStudio",
            description: `Test map from PolyGenStudio`,
            isPreset: false,
            mapSize: 200,
            requireGarage: false // No garage needed for tank customization
        }
    };

    console.log(`[Exporter] Map data created:`, {
        name: mapData.name,
        objects: mapData.placedObjects.length,
        mapType: mapData.mapType
    });

    return mapData;
};

/**
 * Import TX Map format to cubes
 */
export const importFromTXMap = (content: string): CubeElement[] => {
    try {
        const mapData: TXMapData = JSON.parse(content);
        if (!mapData.placedObjects && !mapData.triggers) {
            console.warn("TX Map has no objects or triggers");
            return [];
        }

        const cubes: CubeElement[] = [];

        // Import Placed Objects
        if (mapData.placedObjects) {
            cubes.push(...mapData.placedObjects.map(obj => {
                let color = '#808080';
                switch (obj.type) {
                    case 'building': color = '#44aa44'; break;
                    case 'tree': color = '#228b22'; break;
                    case 'rock': color = '#696969'; break;
                    case 'spawn': color = '#00ff00'; break;
                    case 'garage': color = '#ff8800'; break;
                    case 'npc': color = '#8b0000'; break;
                    default: color = obj.properties?.color || '#808080';
                }
                const scale = obj.scale || { x: 1, y: 1, z: 1 };
                return {
                    id: obj.id || generateId(),
                    name: obj.properties?.name || `${obj.type}_${obj.id}`,
                    type: 'cube' as const,
                    parentId: null,
                    position: obj.position,
                    size: { x: scale.x, y: scale.y, z: scale.z }, // Map scale back to size
                    rotation: obj.rotation || { x: 0, y: 0, z: 0 },
                    color: color,
                    visible: true,
                    isLocked: false
                };
            }));
        }

        // Import Triggers
        if (mapData.triggers) {
            cubes.push(...mapData.triggers.map(trig => {
                let color = '#ffff00';
                switch (trig.type) {
                    case 'damage': color = '#ff0000'; break;
                    case 'heal': color = '#00ff00'; break;
                    case 'teleport': color = '#8a2be2'; break;
                }
                return {
                    id: trig.id || generateId(),
                    name: `trigger_${trig.type}`,
                    type: 'cube' as const,
                    parentId: null,
                    position: trig.position,
                    size: { x: trig.size.width, y: trig.size.height, z: trig.size.depth },
                    rotation: { x: 0, y: 0, z: 0 },
                    color: color,
                    visible: true,
                    isLocked: false,
                    material: {
                        opacity: 0.3,
                        transparent: true,
                        roughness: 1,
                        metalness: 0,
                        emissive: 0
                    }
                };
            }));
        }

        return cubes;
    } catch (e) {
        console.error("Failed to parse TX Map", e);
        return [];
    }
};

/**
 * Save cubes to browser localStorage as TX Map
 */
export const saveTXMapToLocal = (cubes: CubeElement[], mapName: string) => {
    const mapData = exportToTXMap(cubes, mapName);
    const key = `txmap_${mapName}`;
    localStorage.setItem(key, JSON.stringify(mapData));

    // Update map list
    const mapList = JSON.parse(localStorage.getItem('txmap_list') || '[]');
    if (!mapList.includes(mapName)) {
        mapList.push(mapName);
        localStorage.setItem('txmap_list', JSON.stringify(mapList));
    }

    return mapData;
};

/**
 * Load TX Map from browser localStorage
 */
export const loadTXMapFromLocal = (mapName: string): CubeElement[] => {
    const key = `txmap_${mapName}`;
    const content = localStorage.getItem(key);
    if (!content) {
        console.warn(`TX Map "${mapName}" not found in localStorage`);
        return [];
    }
    return importFromTXMap(content);
};

/**
 * Get list of saved TX Maps from localStorage
 */
export const getTXMapList = (): string[] => {
    return JSON.parse(localStorage.getItem('txmap_list') || '[]');
};

/**
 * Send map to TX game via postMessage (when embedded in iframe)
 */
export const sendMapToTX = (cubes: CubeElement[], mapName: string, autoPlay: boolean = false): Promise<boolean> => {
    return new Promise((resolve) => {
        // Create map data
        const now = Date.now();
        const { placedObjects, triggers } = extractMapData(cubes);

        // VALIDATION: Check for Spawn Point
        const hasSpawn = placedObjects.some(obj => obj.type === 'spawn');
        if (!hasSpawn) {
            const proceed = window.confirm("⚠️ WARNING: This map has no SPAWN POINT!\n\nThe game might crash or you will spawn in the void.\nAre you sure you want to send it?");
            if (!proceed) {
                resolve(false);
                return;
            }
        }

        const mapData: TXMapData = {
            version: 1,
            name: mapName,
            mapType: "custom",

            terrainEdits: [],
            placedObjects,
            triggers,
            metadata: {
                createdAt: now,
                modifiedAt: now,
                description: `Map created in PolyGenStudio`,
                author: "PolyGenStudio User"
            }
        };

        // Listen for response
        const messageHandler = (event: MessageEvent) => {
            if (event.data?.type === 'MAP_LOADED') {
                window.removeEventListener('message', messageHandler);
                resolve(event.data.success === true);
            }
        };
        window.addEventListener('message', messageHandler);

        // Send to parent
        if (window.parent && window.parent !== window) {
            console.log(`[Exporter] Sending message LOAD_CUSTOM_MAP to parent...`);
            try {
                window.parent.postMessage({
                    type: 'LOAD_CUSTOM_MAP',
                    mapData,
                    autoPlay
                }, '*');
                console.log(`[Exporter] Sent map '${mapName}' to TX game`);
            } catch (e) {
                console.error("[Exporter] Failed to postMessage:", e);
                resolve(false);
                return;
            }
        } else {
            // Not in iframe, just save to localStorage with TX format
            const mapsJson = localStorage.getItem('tx_custom_maps');
            let maps: Record<string, TXMapData> = {};
            if (mapsJson) {
                try { maps = JSON.parse(mapsJson); } catch { }
            }
            maps[mapName] = mapData;
            localStorage.setItem('tx_custom_maps', JSON.stringify(maps));
            console.log(`[Exporter] Saved map '${mapName}' to localStorage (not in iframe)`);
            resolve(true);
        }

        // Timeout after 5 seconds
        setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            resolve(false);
        }, 5000);
    });
};

/**
 * Check if running inside TX game iframe
 */
export const isInTXIframe = (): boolean => {
    return window.parent !== window;
};

/**
 * Request TX game to export a standard map
 */
export const requestGameMap = (mapId: string) => {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'GET_GAME_MAP',
            mapId
        }, '*');
        console.log(`[Exporter] Requested import for '${mapId}'`);
    } else {
        console.warn("[Exporter] Cannot request map - not in iframe");
        alert("This feature only works when running inside the game!");
    }
};