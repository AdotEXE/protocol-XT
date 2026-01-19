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

    capturedObjects.forEach(obj => {
        // Read final transforms from mesh ref
        const mesh = obj.ref as Mesh;
        const position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };

        // Handle hierarchy (parent position addition if needed? Babylon computes world matrix)
        // Ideally we use AbsolutePosition, but PolyGen expects local/flat?
        // PolyGen objects are flat content usually.
        // We should use world position.
        // mesh.computeWorldMatrix(true);
        // But we are in a dummy scene setup, hierarchy works.
        // Let's rely on local position if parent is root.

        // Actually, ArenaGenerator uses parent logic.
        // If I use absolute position, I flatten the hierarchy.
        let finalPos = { x: 0, y: 0, z: 0 };
        let finalRot = { x: 0, y: 0, z: 0 };

        if (mesh.parent === root) {
            finalPos = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
            finalRot = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
        } else {
            // Deep hierarchy?
            // mesh.computeWorldMatrix(true);
            // finalPos = mesh.absolutePosition ...
            // For now assume shallow hierarchy or relative to root.
            // ArenaGenerator uses single parent "contentRoot".
            // But contentRoot might be attached to chunkParent.
            // generator.generateContent uses 'chunkParent'.

            // If mesh.parent is 'contentRoot' (created inside generateContent)
            // and contentRoot.parent is 'root'.
            // Then we need to accumulate.
            // Simpler: use world matrix.
            mesh.computeWorldMatrix(true);
            const matrix = mesh.getWorldMatrix();
            const pos = Vector3.Zero();
            const rot = new Vector3(0, 0, 0); // Quaternion better?
            const scale = new Vector3(0, 0, 0);

            // Babylon extract
            // But wait, the mesh is bare bones.
            // If I didn't set rotation on parents, simple sum is enough.
            // ArenaGenerator creates 'contentRoot' at 0,0,0 relative to chunkParent.
            // So essentially it's flat.
            finalPos = { x: mesh.absolutePosition.x, y: mesh.absolutePosition.y, z: mesh.absolutePosition.z };
            finalRot = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z }; // Absolute rotation simplified
        }

        // Determine type
        let txType: "building" | "tree" | "rock" | "custom" = "custom";
        if (obj.name.includes('tree')) txType = 'tree';
        if (obj.name.includes('rock')) txType = 'rock';
        if (obj.name.includes('wall') || obj.name.includes('house')) txType = 'building';

        // Size
        const scale = { x: obj.size.width || obj.size.x, y: obj.size.height || obj.size.y, z: obj.size.depth || obj.size.z };

        placedObjects.push({
            id: Math.random().toString(36).substr(2, 9),
            type: txType,
            position: finalPos,
            rotation: finalRot, // varying rotation
            scale: scale,
            properties: {
                color: capturedMaterials[obj.mat] || '#888888',
                material: obj.mat,
                originalName: obj.name
            }
        });
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
