/**
 * ThinInstanceManager - Manages thin instances for repeating objects
 * 
 * Thin instances allow rendering thousands of identical objects with a single draw call.
 * Objects are grouped by geometry type and material for optimal batching.
 */

import {
    Scene,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    Matrix,
    TransformNode
} from "@babylonjs/core";
import { logger } from "../utils/logger";

// Template definition for instanced objects
interface InstanceTemplate {
    mesh: Mesh;
    material: StandardMaterial;
    instanceCount: number;
    matricesData: number[]; // Float32 array data for matrices
    chunkInstances: Map<string, number[]>; // chunkKey -> instance indices
}

// Instance configuration
interface InstanceConfig {
    position: Vector3;
    rotation?: Vector3;
    scale?: Vector3;
}

// Predefined object types for instancing
type InstanceableObjectType = 
    | "car_red" | "car_yellow" | "car_metal" | "car_dark"
    | "fence_wood" | "fence_metal" | "fence_concrete"
    | "barrier_concrete"
    | "container_red" | "container_yellow" | "container_metal" | "container_rust"
    | "dumpster"
    | "lampPole" | "lampHead"
    | "bench"
    | "mailbox"
    | "pipe"
    | "crate";

// Geometry definitions for each object type
const GEOMETRY_DEFS: Record<InstanceableObjectType, { width: number; height: number; depth: number }> = {
    // Cars (width, height, depth)
    car_red: { width: 2, height: 1.5, depth: 4 },
    car_yellow: { width: 2, height: 1.5, depth: 4 },
    car_metal: { width: 2, height: 1.5, depth: 4 },
    car_dark: { width: 2, height: 1.5, depth: 4 },
    
    // Fences (standard segment)
    fence_wood: { width: 10, height: 2, depth: 0.3 },
    fence_metal: { width: 10, height: 2, depth: 0.3 },
    fence_concrete: { width: 10, height: 2, depth: 0.3 },
    
    // Barriers
    barrier_concrete: { width: 3, height: 1, depth: 1.5 },
    
    // Containers
    container_red: { width: 3, height: 2.8, depth: 8 },
    container_yellow: { width: 3, height: 2.8, depth: 8 },
    container_metal: { width: 3, height: 2.8, depth: 8 },
    container_rust: { width: 3, height: 2.8, depth: 8 },
    
    // Dumpster
    dumpster: { width: 2, height: 1.5, depth: 3 },
    
    // Lamp components
    lampPole: { width: 0.15, height: 4, depth: 0.15 },
    lampHead: { width: 0.4, height: 0.4, depth: 0.4 },
    
    // Bench
    bench: { width: 2, height: 0.5, depth: 0.5 },
    
    // Mailbox
    mailbox: { width: 0.3, height: 1.2, depth: 0.3 },
    
    // Pipe
    pipe: { width: 1, height: 1, depth: 6 },
    
    // Crate
    crate: { width: 1.5, height: 1.5, depth: 1.5 }
};

// Material colors for each object type
const MATERIAL_COLORS: Record<InstanceableObjectType, { diffuse: Color3; emissive?: Color3 }> = {
    car_red: { diffuse: new Color3(0.8, 0.2, 0.2) },
    car_yellow: { diffuse: new Color3(0.9, 0.8, 0.2) },
    car_metal: { diffuse: new Color3(0.5, 0.5, 0.55) },
    car_dark: { diffuse: new Color3(0.2, 0.2, 0.25) },
    
    fence_wood: { diffuse: new Color3(0.55, 0.35, 0.2) },
    fence_metal: { diffuse: new Color3(0.4, 0.4, 0.45) },
    fence_concrete: { diffuse: new Color3(0.6, 0.6, 0.6) },
    
    barrier_concrete: { diffuse: new Color3(0.6, 0.6, 0.6) },
    
    container_red: { diffuse: new Color3(0.7, 0.15, 0.1) },
    container_yellow: { diffuse: new Color3(0.85, 0.75, 0.15) },
    container_metal: { diffuse: new Color3(0.45, 0.45, 0.5) },
    container_rust: { diffuse: new Color3(0.5, 0.3, 0.2) },
    
    dumpster: { diffuse: new Color3(0.4, 0.3, 0.25) },
    
    lampPole: { diffuse: new Color3(0.2, 0.2, 0.2) },
    lampHead: { diffuse: new Color3(1, 0.95, 0.8), emissive: new Color3(0.4, 0.35, 0.3) },
    
    bench: { diffuse: new Color3(0.55, 0.35, 0.2) },
    
    mailbox: { diffuse: new Color3(0.4, 0.4, 0.45) },
    
    pipe: { diffuse: new Color3(0.5, 0.3, 0.2) },
    
    crate: { diffuse: new Color3(0.5, 0.4, 0.3) }
};

export class ThinInstanceManager {
    private scene: Scene;
    private templates: Map<InstanceableObjectType, InstanceTemplate> = new Map();
    private initialized = false;
    private updatePending = false;
    
    // Statistics
    private stats = {
        totalInstances: 0,
        templateCount: 0,
        drawCallsSaved: 0
    };
    
    constructor(scene: Scene) {
        this.scene = scene;
    }
    
    /**
     * Initialize all template meshes
     * Call this once after scene is ready
     */
    initialize(): void {
        if (this.initialized) return;
        
        logger.log("[ThinInstanceManager] Initializing templates...");
        
        for (const objType of Object.keys(GEOMETRY_DEFS) as InstanceableObjectType[]) {
            this.createTemplate(objType);
        }
        
        this.initialized = true;
        this.stats.templateCount = this.templates.size;
        logger.log(`[ThinInstanceManager] Initialized ${this.stats.templateCount} templates`);
    }
    
    /**
     * Create a template mesh for an object type
     */
    private createTemplate(objType: InstanceableObjectType): void {
        const geom = GEOMETRY_DEFS[objType];
        const colors = MATERIAL_COLORS[objType];
        
        // Create template mesh (not visible, used only as source)
        const templateMesh = MeshBuilder.CreateBox(
            `template_${objType}`,
            { width: geom.width, height: geom.height, depth: geom.depth },
            this.scene
        );
        
        // Create and configure material
        const material = new StandardMaterial(`mat_${objType}`, this.scene);
        material.diffuseColor = colors.diffuse;
        if (colors.emissive) {
            material.emissiveColor = colors.emissive;
        }
        material.specularPower = 32;
        material.specularColor = new Color3(0.1, 0.1, 0.1);
        material.freeze(); // Optimize material
        
        templateMesh.material = material;
        templateMesh.isVisible = false; // Template is invisible
        templateMesh.isPickable = false;
        
        // Enable thin instances on the mesh
        templateMesh.thinInstanceEnablePicking = false;
        
        // Store template
        this.templates.set(objType, {
            mesh: templateMesh,
            material: material,
            instanceCount: 0,
            matricesData: [],
            chunkInstances: new Map()
        });
    }
    
    /**
     * Add an instance of an object type
     * @param objType - Type of object to instance
     * @param config - Position, rotation, scale configuration
     * @param chunkKey - Key of the chunk this instance belongs to (for cleanup)
     * @returns Index of the instance, or -1 if failed
     */
    addInstance(
        objType: InstanceableObjectType, 
        config: InstanceConfig, 
        chunkKey: string
    ): number {
        if (!this.initialized) {
            this.initialize();
        }
        
        const template = this.templates.get(objType);
        if (!template) {
            logger.warn(`[ThinInstanceManager] Unknown object type: ${objType}`);
            return -1;
        }
        
        // Create transformation matrix
        const matrix = Matrix.Compose(
            config.scale || Vector3.One(),
            config.rotation 
                ? Vector3.Zero().copyFrom(config.rotation).toQuaternion() 
                : new Vector3(0, 0, 0).toQuaternion(),
            config.position
        );
        
        // For rotation, we need to handle Y rotation properly
        if (config.rotation && config.rotation.y !== 0) {
            const rotationMatrix = Matrix.RotationY(config.rotation.y);
            const translationMatrix = Matrix.Translation(
                config.position.x, 
                config.position.y, 
                config.position.z
            );
            const scaleMatrix = config.scale 
                ? Matrix.Scaling(config.scale.x, config.scale.y, config.scale.z)
                : Matrix.Identity();
            
            matrix.copyFrom(scaleMatrix.multiply(rotationMatrix).multiply(translationMatrix));
        }
        
        // Add to thin instances
        const instanceIndex = template.mesh.thinInstanceAdd(matrix);
        template.instanceCount++;
        
        // Track which instances belong to which chunk
        if (!template.chunkInstances.has(chunkKey)) {
            template.chunkInstances.set(chunkKey, []);
        }
        template.chunkInstances.get(chunkKey)!.push(instanceIndex);
        
        this.stats.totalInstances++;
        this.stats.drawCallsSaved++;
        
        return instanceIndex;
    }
    
    /**
     * Add multiple instances at once (more efficient than individual adds)
     */
    addInstances(
        objType: InstanceableObjectType,
        configs: InstanceConfig[],
        chunkKey: string
    ): number[] {
        if (!this.initialized) {
            this.initialize();
        }
        
        const template = this.templates.get(objType);
        if (!template) {
            logger.warn(`[ThinInstanceManager] Unknown object type: ${objType}`);
            return [];
        }
        
        const indices: number[] = [];
        const matrices: Matrix[] = [];
        
        for (const config of configs) {
            const matrix = Matrix.Identity();
            
            // Handle rotation
            if (config.rotation && config.rotation.y !== 0) {
                const rotationMatrix = Matrix.RotationY(config.rotation.y);
                const translationMatrix = Matrix.Translation(
                    config.position.x, 
                    config.position.y, 
                    config.position.z
                );
                const scaleMatrix = config.scale 
                    ? Matrix.Scaling(config.scale.x, config.scale.y, config.scale.z)
                    : Matrix.Identity();
                
                matrix.copyFrom(scaleMatrix.multiply(rotationMatrix).multiply(translationMatrix));
            } else {
                Matrix.ComposeToRef(
                    config.scale || Vector3.One(),
                    new Vector3(0, 0, 0).toQuaternion(),
                    config.position,
                    matrix
                );
            }
            
            matrices.push(matrix);
        }
        
        // Batch add all instances
        for (const matrix of matrices) {
            const idx = template.mesh.thinInstanceAdd(matrix);
            indices.push(idx);
            template.instanceCount++;
            this.stats.totalInstances++;
            this.stats.drawCallsSaved++;
        }
        
        // Track chunk instances
        if (!template.chunkInstances.has(chunkKey)) {
            template.chunkInstances.set(chunkKey, []);
        }
        template.chunkInstances.get(chunkKey)!.push(...indices);
        
        return indices;
    }
    
    /**
     * Remove all instances belonging to a specific chunk
     * Note: Thin instances don't support individual removal efficiently,
     * so we rebuild the instance buffer after removing
     */
    removeChunkInstances(chunkKey: string): void {
        for (const [objType, template] of this.templates) {
            const chunkIndices = template.chunkInstances.get(chunkKey);
            if (!chunkIndices || chunkIndices.length === 0) continue;
            
            // Mark instances as removed by setting scale to 0
            // (More efficient than rebuilding the entire buffer)
            const zeroMatrix = Matrix.Scaling(0, 0, 0);
            for (const idx of chunkIndices) {
                template.mesh.thinInstanceSetMatrixAt(idx, zeroMatrix, false);
            }
            
            this.stats.totalInstances -= chunkIndices.length;
            template.instanceCount -= chunkIndices.length;
            template.chunkInstances.delete(chunkKey);
        }
        
        // Schedule buffer refresh
        this.scheduleBufferRefresh();
    }
    
    /**
     * Schedule a deferred buffer refresh to clean up zeroed instances
     */
    private scheduleBufferRefresh(): void {
        if (this.updatePending) return;
        this.updatePending = true;
        
        // Use requestIdleCallback if available, otherwise setTimeout
        const scheduleUpdate = (window as any).requestIdleCallback || 
            ((cb: () => void) => setTimeout(cb, 100));
        
        scheduleUpdate(() => {
            this.refreshBuffers();
            this.updatePending = false;
        });
    }
    
    /**
     * Refresh instance buffers, removing zeroed instances
     */
    private refreshBuffers(): void {
        for (const [objType, template] of this.templates) {
            // Only refresh if we have instances
            if (template.instanceCount <= 0) {
                template.mesh.thinInstanceCount = 0;
                continue;
            }
            
            // Refresh the buffer to apply changes
            template.mesh.thinInstanceRefreshBoundingInfo();
        }
    }
    
    /**
     * Completely rebuild instance buffers (use sparingly, expensive)
     */
    rebuildAllBuffers(): void {
        logger.log("[ThinInstanceManager] Rebuilding all instance buffers...");
        
        for (const [objType, template] of this.templates) {
            if (template.instanceCount <= 0) continue;
            
            // Collect all valid matrices from all chunks
            const validMatrices: Matrix[] = [];
            const newChunkIndices: Map<string, number[]> = new Map();
            
            for (const [chunkKey, indices] of template.chunkInstances) {
                const newIndices: number[] = [];
                for (const idx of indices) {
                    // Get the matrix for this instance
                    const matrix = template.mesh.thinInstanceGetWorldMatrices()[idx];
                    if (matrix) {
                        // Check if it's not zeroed (scale > 0)
                        const scale = new Vector3();
                        matrix.decompose(scale, undefined, undefined);
                        if (scale.x > 0.001) {
                            newIndices.push(validMatrices.length);
                            validMatrices.push(matrix.clone());
                        }
                    }
                }
                if (newIndices.length > 0) {
                    newChunkIndices.set(chunkKey, newIndices);
                }
            }
            
            // Clear and rebuild
            template.mesh.thinInstanceCount = 0;
            
            if (validMatrices.length > 0) {
                // Re-add all valid instances
                for (const matrix of validMatrices) {
                    template.mesh.thinInstanceAdd(matrix);
                }
            }
            
            template.chunkInstances = newChunkIndices;
            template.instanceCount = validMatrices.length;
        }
        
        // Recalculate stats
        this.stats.totalInstances = 0;
        for (const template of this.templates.values()) {
            this.stats.totalInstances += template.instanceCount;
        }
        
        logger.log(`[ThinInstanceManager] Rebuild complete. ${this.stats.totalInstances} instances active`);
    }
    
    /**
     * Get statistics
     */
    getStats(): { totalInstances: number; templateCount: number; drawCallsSaved: number } {
        return { ...this.stats };
    }
    
    /**
     * Check if a type is instanceable
     */
    isInstanceableType(type: string): type is InstanceableObjectType {
        return type in GEOMETRY_DEFS;
    }
    
    /**
     * Get available object types
     */
    getAvailableTypes(): InstanceableObjectType[] {
        return Object.keys(GEOMETRY_DEFS) as InstanceableObjectType[];
    }
    
    /**
     * Dispose all resources
     */
    dispose(): void {
        for (const template of this.templates.values()) {
            template.mesh.dispose();
            template.material.dispose();
        }
        this.templates.clear();
        this.initialized = false;
        this.stats = { totalInstances: 0, templateCount: 0, drawCallsSaved: 0 };
        logger.log("[ThinInstanceManager] Disposed");
    }
}

// Export types for external use
export type { InstanceableObjectType, InstanceConfig };


