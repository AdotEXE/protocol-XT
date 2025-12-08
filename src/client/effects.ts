import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh
} from "@babylonjs/core";

// Ultra-simple effects - NO shaders, NO particles, NO gradients
// Just simple boxes that appear and disappear

export class EffectsManager {
    private scene: Scene;
    private flashMat: StandardMaterial;
    private explosionMat: StandardMaterial;
    private dustMat: StandardMaterial;
    
    constructor(scene: Scene) {
        this.scene = scene;
        
        // Pre-create simple materials - FLAT colors only, NO emissive, NO alpha
        this.flashMat = new StandardMaterial("flashMat", scene);
        this.flashMat.diffuseColor = new Color3(1, 1, 0); // Pure yellow
        this.flashMat.specularColor = Color3.Black();
        this.flashMat.freeze();
        
        this.explosionMat = new StandardMaterial("explosionMat", scene);
        this.explosionMat.diffuseColor = new Color3(1, 0.5, 0); // Orange
        this.explosionMat.specularColor = Color3.Black();
        this.explosionMat.freeze();
        
        this.dustMat = new StandardMaterial("dustMat", scene);
        this.dustMat.diffuseColor = new Color3(0.5, 0.4, 0.3); // Brown - NO alpha
        this.dustMat.specularColor = Color3.Black();
        this.dustMat.freeze();
        
        console.log("[EffectsManager] Initialized (simple mode)");
    }
    
    // Simple muzzle flash - just a yellow box
    createMuzzleFlash(position: Vector3, direction: Vector3): void {
        const flash = MeshBuilder.CreateBox("flash", { width: 0.8, height: 0.8, depth: 0.3 }, this.scene);
        flash.position = position.add(direction.scale(0.5));
        flash.material = this.flashMat;
        
        // Simple 3-frame animation
        let frame = 0;
        const animate = () => {
            frame++;
            if (frame === 1) {
                flash.scaling.setAll(1.5);
            } else if (frame === 2) {
                flash.scaling.setAll(2);
            } else {
                flash.dispose();
                return;
            }
            setTimeout(animate, 30);
        };
        animate();
    }
    
    // Simple explosion - expanding box
    createExplosion(position: Vector3, scale: number = 1.0): void {
        const explosion = MeshBuilder.CreateBox("explosion", { size: 1 * scale }, this.scene);
        explosion.position = position.clone();
        explosion.material = this.explosionMat;
        
        // Simple expand and fade
        let frame = 0;
        const animate = () => {
            frame++;
            explosion.scaling.setAll(1 + frame * 0.5);
            
            if (frame >= 6) {
                explosion.dispose();
                return;
            }
            setTimeout(animate, 50);
        };
        animate();
        
        // Add debris boxes
        for (let i = 0; i < 4; i++) {
            const debris = MeshBuilder.CreateBox("debris", { size: 0.3 * scale }, this.scene);
            debris.position = position.clone();
            debris.material = this.explosionMat;
            
            const vx = (Math.random() - 0.5) * 10;
            const vy = Math.random() * 8;
            const vz = (Math.random() - 0.5) * 10;
            
            let t = 0;
            const moveDebris = () => {
                t += 0.05;
                debris.position.x += vx * 0.05;
                debris.position.y += (vy - t * 20) * 0.05;
                debris.position.z += vz * 0.05;
                
                if (t > 1 || debris.position.y < 0) {
                    debris.dispose();
                    return;
                }
                setTimeout(moveDebris, 30);
            };
            moveDebris();
        }
    }
    
    // Simple dust - just a semi-transparent box
    createDustCloud(position: Vector3): void {
        const dust = MeshBuilder.CreateBox("dust", { size: 1 }, this.scene);
        dust.position = position.clone();
        dust.material = this.dustMat;
        
        let frame = 0;
        const animate = () => {
            frame++;
            dust.scaling.setAll(1 + frame * 0.3);
            dust.position.y += 0.1;
            
            if (frame >= 8) {
                dust.dispose();
                return;
            }
            setTimeout(animate, 50);
        };
        animate();
    }
    
    // Simple hit spark - just a small bright box
    createHitSpark(position: Vector3): void {
        const spark = MeshBuilder.CreateBox("spark", { size: 0.3 }, this.scene);
        spark.position = position.clone();
        spark.material = this.flashMat;
        
        setTimeout(() => spark.dispose(), 100);
    }
    
    // Simple tracer - elongated box
    createTracer(start: Vector3, end: Vector3): void {
        const length = Vector3.Distance(start, end);
        const tracer = MeshBuilder.CreateBox("tracer", { width: 0.1, height: 0.1, depth: length }, this.scene);
        
        const mid = start.add(end).scale(0.5);
        tracer.position = mid;
        tracer.lookAt(end);
        tracer.material = this.flashMat;
        
        setTimeout(() => tracer.dispose(), 100);
    }
}
