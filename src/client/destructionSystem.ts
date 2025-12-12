// ═══════════════════════════════════════════════════════════════════════════
// DESTRUCTION SYSTEM - Система разрушаемости объектов
// ═══════════════════════════════════════════════════════════════════════════

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType
} from "@babylonjs/core";

export interface Destructible {
    mesh: Mesh;
    health: number;
    maxHealth: number;
    type: "wall" | "building_part" | "car" | "tree" | "container" | "barrier";
    onDestroy?: () => void;
    destroyed: boolean;
}

interface DestructionConfig {
    enableDebris: boolean;
    debrisLifetime: number; // ms
    maxDebrisPerObject: number;
}

export class DestructionSystem {
    private scene: Scene;
    private config: DestructionConfig;
    private destructibles: Map<string, Destructible> = new Map();
    private debrisMeshes: Mesh[] = [];
    private debrisMaterial: StandardMaterial;
    
    constructor(scene: Scene, config?: Partial<DestructionConfig>) {
        this.scene = scene;
        this.config = {
            enableDebris: true,
            debrisLifetime: 10000, // 10 seconds
            maxDebrisPerObject: 5,
            ...config
        };
        
        // Create debris material
        this.debrisMaterial = new StandardMaterial("debrisMat", this.scene);
        this.debrisMaterial.diffuseColor = new Color3(0.4, 0.38, 0.35);
        this.debrisMaterial.specularColor = Color3.Black();
        this.debrisMaterial.freeze();
    }
    
    // Register a mesh as destructible
    registerDestructible(
        mesh: Mesh,
        type: Destructible["type"],
        health: number,
        onDestroy?: () => void
    ): Destructible {
        const id = mesh.uniqueId.toString();
        
        const destructible: Destructible = {
            mesh,
            health,
            maxHealth: health,
            type,
            onDestroy,
            destroyed: false
        };
        
        this.destructibles.set(id, destructible);
        
        // Add metadata to mesh
        mesh.metadata = {
            ...mesh.metadata,
            destructible: true,
            destructibleId: id
        };
        
        return destructible;
    }
    
    // Register from CoverObject
    registerFromCover(coverMesh: Mesh, type: string, health: number, maxHealth: number): void {
        if (!coverMesh || health <= 0) return;
        
        let destructibleType: Destructible["type"] = "wall";
        switch (type) {
            case "container": destructibleType = "container"; break;
            case "car": destructibleType = "car"; break;
            case "barrier": destructibleType = "barrier"; break;
            case "vegetation": destructibleType = "tree"; break;
            default: destructibleType = "wall";
        }
        
        this.registerDestructible(coverMesh, destructibleType, health);
    }
    
    // Apply damage to a destructible mesh
    damage(mesh: Mesh, amount: number): boolean {
        const id = mesh.uniqueId.toString();
        const destructible = this.destructibles.get(id);
        
        if (!destructible || destructible.destroyed) {
            return false;
        }
        
        destructible.health -= amount;
        
        // Visual damage feedback
        this.applyDamageVisual(destructible);
        
        if (destructible.health <= 0) {
            this.destroyObject(destructible);
            return true;
        }
        
        return false;
    }
    
    // Apply visual feedback for damage
    private applyDamageVisual(destructible: Destructible): void {
        const healthPercent = destructible.health / destructible.maxHealth;
        
        // Darken material as damage increases
        if (destructible.mesh.material instanceof StandardMaterial) {
            const mat = destructible.mesh.material as StandardMaterial;
            // Create a new material for this damaged object
            if (!mat.name.includes("_damaged")) {
                const damagedMat = mat.clone(mat.name + "_damaged");
                destructible.mesh.material = damagedMat;
            }
            
            const damagedMat = destructible.mesh.material as StandardMaterial;
            const darkenFactor = 0.5 + healthPercent * 0.5;
            damagedMat.diffuseColor = damagedMat.diffuseColor.scale(darkenFactor);
        }
    }
    
    // Destroy an object
    private destroyObject(destructible: Destructible): void {
        destructible.destroyed = true;
        
        const position = destructible.mesh.absolutePosition.clone();
        const type = destructible.type;
        
        // Create debris
        if (this.config.enableDebris) {
            this.createDebris(position, type);
        }
        
        // Call custom destroy callback
        if (destructible.onDestroy) {
            destructible.onDestroy();
        }
        
        // Dispose of the mesh
        if (destructible.mesh.material && !destructible.mesh.material.name.includes("shared")) {
            destructible.mesh.material.dispose();
        }
        destructible.mesh.dispose();
        
        // Remove from registry
        const id = destructible.mesh.uniqueId.toString();
        this.destructibles.delete(id);
    }
    
    // Create debris particles/meshes
    private createDebris(position: Vector3, type: Destructible["type"]): void {
        const debrisCount = Math.min(
            this.config.maxDebrisPerObject,
            Math.floor(Math.random() * 3) + 2
        );
        
        for (let i = 0; i < debrisCount; i++) {
            const size = 0.2 + Math.random() * 0.5;
            
            const debris = MeshBuilder.CreateBox(`debris_${Date.now()}_${i}`, {
                width: size,
                height: size * 0.5,
                depth: size
            }, this.scene);
            
            // Random offset from center
            debris.position = position.clone();
            debris.position.x += (Math.random() - 0.5) * 2;
            debris.position.y += Math.random() * 1.5 + 0.5;
            debris.position.z += (Math.random() - 0.5) * 2;
            
            // Random rotation
            debris.rotation.x = Math.random() * Math.PI;
            debris.rotation.y = Math.random() * Math.PI;
            debris.rotation.z = Math.random() * Math.PI;
            
            debris.material = this.debrisMaterial;
            
            // Add physics for flying debris
            const aggregate = new PhysicsAggregate(
                debris,
                PhysicsShapeType.BOX,
                { mass: 0.5, restitution: 0.3, friction: 0.5 },
                this.scene
            );
            
            // Apply initial impulse
            const impulse = new Vector3(
                (Math.random() - 0.5) * 3,
                Math.random() * 5 + 2,
                (Math.random() - 0.5) * 3
            );
            aggregate.body.applyImpulse(impulse, debris.absolutePosition);
            
            this.debrisMeshes.push(debris);
            
            // Schedule debris removal
            setTimeout(() => {
                this.removeDebris(debris);
            }, this.config.debrisLifetime);
        }
    }
    
    // Remove debris mesh
    private removeDebris(debris: Mesh): void {
        const index = this.debrisMeshes.indexOf(debris);
        if (index > -1) {
            this.debrisMeshes.splice(index, 1);
        }
        debris.dispose();
    }
    
    // Check if a mesh is destructible
    isDestructible(mesh: Mesh): boolean {
        return mesh.metadata?.destructible === true;
    }
    
    // Get destructible by mesh
    getDestructible(mesh: Mesh): Destructible | undefined {
        const id = mesh.uniqueId.toString();
        return this.destructibles.get(id);
    }
    
    // Get health percentage
    getHealthPercent(mesh: Mesh): number {
        const destructible = this.getDestructible(mesh);
        if (!destructible) return 1;
        return destructible.health / destructible.maxHealth;
    }
    
    // Handle bullet hit on mesh
    handleBulletHit(mesh: Mesh, damage: number): { destroyed: boolean, isDestructible: boolean } {
        if (!this.isDestructible(mesh)) {
            return { destroyed: false, isDestructible: false };
        }
        
        const destroyed = this.damage(mesh, damage);
        return { destroyed, isDestructible: true };
    }
    
    // Cleanup
    dispose(): void {
        // Remove all debris
        for (const debris of this.debrisMeshes) {
            debris.dispose();
        }
        this.debrisMeshes = [];
        
        // Clear destructibles
        this.destructibles.clear();
        
        // Dispose material
        this.debrisMaterial.dispose();
    }
}

