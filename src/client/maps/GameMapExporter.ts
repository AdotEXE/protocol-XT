import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MapGeneratorFactory } from "./shared";
import { TXMapData } from "./custom";
import { ChunkGenerationContext } from "./shared/MapGenerator";
import { SeededRandom } from "./shared/SeededRandom";

/**
 * Export standard game maps to TXMapData format for editing
 */
export async function exportGameMap(mapId: string, scene: Scene): Promise<TXMapData | null> {
    console.log(`[GameMapExporter] Exporting map: ${mapId}`);

    const factory = MapGeneratorFactory.get(mapId);
    if (!factory) {
        console.error(`[GameMapExporter] Generator factory not found for ${mapId}`);
        return null;
    }

    const generator = factory as any;

    // Store original methods to restore them later
    const originalInitialize = generator.initialize;
    const originalCreateBox = generator.createBox;
    const originalCreateCylinder = generator.createCylinder;
    const originalCreateMaterial = generator.createMaterial;
    const originalGetMat = generator.getMat;

    const capturedObjects: any[] = [];
    const capturedMaterials: Record<string, string> = {}; // name -> hex color

    // Mock Context
    const mockContext = {
        scene: scene,
        getMat: (name: string) => {
            return new StandardMaterial(name, scene);
        },
        isPositionInGarageArea: () => false,
        isPositionNearRoad: () => false,
        getTerrainHeight: () => 0
    };

    const root = new TransformNode("export_root", scene);

    try {
        // Initialize with mock context
        // We use call/apply to ensure 'this' context if needed, but direct call is usually fine for these
        generator.initialize(mockContext);

        // --- INTERCEPT METHODS ---

        // Spy on createBox
        generator.createBox = (name: string, options: any, pos: Vector3, mat: any, parent: any) => {
            const matName = (typeof mat === 'string') ? mat : mat.name;

            // Capture
            capturedObjects.push({
                type: 'box',
                name,
                pos: pos.clone(),
                size: options,
                mat: matName,
                rotation: { x: 0, y: 0, z: 0 } // Default
            });

            // Create dummy mesh
            const mesh = new Mesh(name, scene);
            mesh.position = pos.clone();
            mesh.parent = parent;

            // Link mesh to captured object for final transform read
            capturedObjects[capturedObjects.length - 1].ref = mesh;

            return mesh;
        };

        // Spy on createCylinder
        generator.createCylinder = (name: string, options: any, pos: Vector3, mat: any, parent: any) => {
            const matName = (typeof mat === 'string') ? mat : mat.name;
            capturedObjects.push({
                type: 'cylinder',
                name,
                pos: pos.clone(),
                size: { x: options.diameter || 1, y: options.height, z: options.diameter || 1 },
                mat: matName,
                ref: null
            });
            const mesh = new Mesh(name, scene);
            mesh.position = pos.clone();
            mesh.parent = parent;
            capturedObjects[capturedObjects.length - 1].ref = mesh;
            return mesh;
        };

        // Spy on createMaterial to capture colors
        generator.createMaterial = (name: string, color: Color3) => {
            capturedMaterials[name] = color.toHexString();
            const mat = new StandardMaterial(name, scene);
            mat.diffuseColor = color;
            return mat;
        };

        // Spy on getMat
        generator.getMat = (name: string) => {
            return new StandardMaterial(name, scene);
        };



        // --- RUN GENERATION ---



        // Use larger area to capture more map content (maps like frontline are 1000x1000)
        // Generate in 600x600 centered at origin to cover most map designs
        const context: ChunkGenerationContext = {
            worldX: -300, // Start at -300 to cover center
            worldZ: -300,
            size: 600,
            chunkX: 0,
            chunkZ: 0,
            chunkParent: root,
            random: new SeededRandom(123),
            biome: 'plains',
            lodLevel: 0,
            isEdgeChunk: false
        };

        generator.generateContent(context);

    } catch (e) {
        console.error("[GameMapExporter] Generation failed", e);
    } finally {
        // --- RESTORE ORIGINAL METHODS ---
        console.log("[GameMapExporter] Restoring generator methods...");
        generator.initialize = originalInitialize;
        generator.createBox = originalCreateBox;
        generator.createCylinder = originalCreateCylinder;
        generator.createMaterial = originalCreateMaterial;
        generator.getMat = originalGetMat;
    }

    // --- PROCESS RESULTS ---

    const placedObjects: TXMapData['placedObjects'] = [];
    const capturedRefIds = new Set<number>();

    // Helper to process a mesh (captured or discovered)
    const processObject = (mesh: Mesh, capturedData?: any) => {
        // Position & Rotation
        // Use absolute values if not direct child of root, or relative if shallow.
        // For robustness, we'll store world position/rotation relative to the map origin (which is 0,0,0 usually).
        // Since root is at 0,0,0 (identity), world matrix is fine.

        mesh.computeWorldMatrix(true);
        const matrix = mesh.getWorldMatrix();
        const position = { x: mesh.absolutePosition.x, y: mesh.absolutePosition.y, z: mesh.absolutePosition.z };

        // Rotation is tricky from matrix, but usually Euler from mesh is enough if not complex parenting.
        let rotation = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
        if (mesh.rotationQuaternion) {
            const euler = mesh.rotationQuaternion.toEulerAngles();
            rotation = { x: euler.x, y: euler.y, z: euler.z };
        } else if (mesh.parent !== root) {
            // If nested, absolute rotation might be needed. For now using local as fallback or decomposition if strict.
            // But for PolyGen map export, simple rotation is typical.
        }

        // Determine Type
        let txType: "building" | "tree" | "rock" | "custom" = "custom";
        const name = capturedData?.name || mesh.name;
        if (name.includes('tree')) txType = 'tree';
        if (name.includes('rock')) txType = 'rock';
        if (name.includes('wall') || name.includes('house')) txType = 'building';

        // Determine Scale/Size
        // If capturedData has size (creation params), use it.
        // Otherwise calculate from bounding box.
        let scale = { x: 1, y: 1, z: 1 };
        if (capturedData && capturedData.size) {
            scale = {
                x: capturedData.size.width || capturedData.size.x || 1,
                y: capturedData.size.height || capturedData.size.y || 1,
                z: capturedData.size.depth || capturedData.size.z || 1
            };
        } else {
            // Calculate from bounding box (Local bounds * scaling)
            const bounds = mesh.getBoundingInfo().boundingBox;
            const sizeX = (bounds.maximum.x - bounds.minimum.x) * mesh.scaling.x;
            const sizeY = (bounds.maximum.y - bounds.minimum.y) * mesh.scaling.y;
            const sizeZ = (bounds.maximum.z - bounds.minimum.z) * mesh.scaling.z;
            scale = { x: sizeX, y: sizeY, z: sizeZ };
        }

        // Material Color
        let color = '#888888';
        if (capturedData && capturedData.mat && capturedMaterials[capturedData.mat]) {
            color = capturedMaterials[capturedData.mat];
        } else if (mesh.material instanceof StandardMaterial) {
            color = mesh.material.diffuseColor.toHexString();
        }

        placedObjects.push({
            id: Math.random().toString(36).substr(2, 9),
            type: txType,
            position: position,
            rotation: rotation,
            scale: scale,
            properties: {
                color: color,
                material: capturedData?.mat || mesh.material?.name || 'default',
                originalName: name
            }
        });
    };

    // 1. Process explicitly captured objects
    capturedObjects.forEach(obj => {
        if (obj.ref && obj.ref instanceof Mesh) {
            capturedRefIds.add(obj.ref.uniqueId);
            processObject(obj.ref, obj);
        }
    });

    // 2. Scan scene for uncaptured objects (created directly via MeshBuilder/etc)
    const allMeshes = root.getChildMeshes(false);
    allMeshes.forEach(node => {
        if (node instanceof Mesh) {
            if (!capturedRefIds.has(node.uniqueId)) {
                processObject(node);
            }
        }
    });

    // Cleanup
    root.dispose();

    const mapData: TXMapData = {
        version: 1,
        name: mapId,
        mapType: "custom",
        terrainEdits: [],
        placedObjects: placedObjects,
        triggers: [],
        metadata: {
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            author: "TX Game Import",
            description: `Imported from ${mapId}`,
            isPreset: false,
            mapSize: 200
        }
    };

    console.log(`[GameMapExporter] Exported ${placedObjects.length} objects`);
    return mapData;
}
