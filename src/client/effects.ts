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
    
    // Улучшенный эффект использования припаса - свечение вокруг танка
    createConsumableEffect(position: Vector3, color: Color3, type: string): void {
        // Основное светящееся кольцо (расширяется)
        const ring = MeshBuilder.CreateCylinder("consumableRing", { diameter: 5, height: 0.3, tessellation: 32 }, this.scene);
        ring.position = position.clone();
        ring.position.y = 1;
        ring.rotation.x = Math.PI / 2;
        
        const ringMat = new StandardMaterial("consumableRingMat", this.scene);
        ringMat.diffuseColor = color;
        ringMat.emissiveColor = color.scale(0.9);
        ringMat.disableLighting = true;
        ring.material = ringMat;
        
        // Второе кольцо (меньше, для глубины)
        const ring2 = MeshBuilder.CreateCylinder("consumableRing2", { diameter: 3, height: 0.2, tessellation: 32 }, this.scene);
        ring2.position = position.clone();
        ring2.position.y = 1.1;
        ring2.rotation.x = Math.PI / 2;
        ring2.material = ringMat;
        
        // Анимация расширения основного кольца
        let scale = 0.5;
        let scale2 = 0.3;
        const animate = () => {
            scale += 0.12;
            scale2 += 0.15;
            ring.scaling.setAll(scale);
            ring2.scaling.setAll(scale2);
            
            if (scale < 2.5) {
                setTimeout(animate, 30);
            } else {
                ring.dispose();
                ring2.dispose();
            }
        };
        animate();
        
        // Улучшенные частицы (больше и ярче)
        const particleCount = 16;
        for (let i = 0; i < particleCount; i++) {
            const particle = MeshBuilder.CreateBox("particle", { size: 0.25 }, this.scene);
            particle.position = position.clone();
            particle.position.y = 1;
            
            const particleMat = new StandardMaterial("particleMat", this.scene);
            particleMat.diffuseColor = color;
            particleMat.emissiveColor = color;
            particleMat.disableLighting = true;
            particle.material = particleMat;
            
            const angle = (Math.PI * 2 * i) / particleCount;
            const radius = 2;
            const speed = 0.4;
            const verticalSpeed = speed * 2.5;
            let t = 0;
            const moveParticle = () => {
                t += 0.06;
                particle.position.x = position.x + Math.cos(angle) * radius * t;
                particle.position.y = position.y + 1 + verticalSpeed * t - t * t * 2; // Параболическая траектория
                particle.position.z = position.z + Math.sin(angle) * radius * t;
                particle.scaling.setAll(1 - t * 0.8);
                
                if (t < 1) {
                    setTimeout(moveParticle, 30);
                } else {
                    particle.dispose();
                }
            };
            moveParticle();
        }
        
        // Центральная вспышка
        const flash = MeshBuilder.CreateBox("consumableFlash", { size: 1.5 }, this.scene);
        flash.position = position.clone();
        flash.position.y = 1.5;
        
        const flashMat = new StandardMaterial("consumableFlashMat", this.scene);
        flashMat.diffuseColor = Color3.White();
        flashMat.emissiveColor = Color3.White();
        flashMat.disableLighting = true;
        flash.material = flashMat;
        
        let flashScale = 0.3;
        let flashFrame = 0;
        const flashAnimate = () => {
            flashFrame++;
            flashScale += 0.25;
            flash.scaling.setAll(flashScale);
            
            if (flashFrame < 6) {
                setTimeout(flashAnimate, 30);
            } else {
                flash.dispose();
            }
        };
        flashAnimate();
    }
    
    // Эффект подбора припаса (на карте)
    createPickupEffect(position: Vector3, color: Color3, type: string): void {
        // Вспышка при подборе
        const pickupFlash = MeshBuilder.CreateBox("pickupFlash", { size: 1.2 }, this.scene);
        pickupFlash.position = position.clone();
        pickupFlash.position.y = 1;
        
        const flashMat = new StandardMaterial("pickupFlashMat", this.scene);
        flashMat.diffuseColor = color;
        flashMat.emissiveColor = color.scale(1.2);
        flashMat.disableLighting = true;
        pickupFlash.material = flashMat;
        
        let flashScale = 0.5;
        let flashFrame = 0;
        const flashAnimate = () => {
            flashFrame++;
            flashScale += 0.3;
            pickupFlash.scaling.setAll(flashScale);
            
            if (flashFrame < 5) {
                setTimeout(flashAnimate, 40);
            } else {
                pickupFlash.dispose();
            }
        };
        flashAnimate();
        
        // Кольцо энергии
        const energyRing = MeshBuilder.CreateCylinder("energyRing", { diameter: 2, height: 0.2, tessellation: 32 }, this.scene);
        energyRing.position = position.clone();
        energyRing.position.y = 1;
        energyRing.rotation.x = Math.PI / 2;
        
        const ringMat = new StandardMaterial("energyRingMat", this.scene);
        ringMat.diffuseColor = color;
        ringMat.emissiveColor = color.scale(1.0);
        ringMat.disableLighting = true;
        energyRing.material = ringMat;
        
        let ringScale = 0.3;
        let ringFrame = 0;
        const ringAnimate = () => {
            ringFrame++;
            ringScale += 0.2;
            energyRing.scaling.setAll(ringScale);
            
            if (ringFrame < 8) {
                setTimeout(ringAnimate, 30);
            } else {
                energyRing.dispose();
            }
        };
        ringAnimate();
        
        // Частицы вверх
        for (let i = 0; i < 12; i++) {
            const particle = MeshBuilder.CreateBox("pickupParticle", { size: 0.2 }, this.scene);
            particle.position = position.clone();
            particle.position.y = 1;
            particle.material = ringMat;
            
            const angle = (Math.PI * 2 * i) / 12;
            const speed = 0.5;
            let t = 0;
            const moveParticle = () => {
                t += 0.08;
                particle.position.x = position.x + Math.cos(angle) * speed * t;
                particle.position.y = position.y + 1 + speed * 3 * t;
                particle.position.z = position.z + Math.sin(angle) * speed * t;
                particle.scaling.setAll(1 - t);
                
                if (t < 1) {
                    setTimeout(moveParticle, 30);
                } else {
                    particle.dispose();
                }
            };
            moveParticle();
        }
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
    createHitSpark(position: Vector3, direction?: Vector3): void {
        const spark = MeshBuilder.CreateBox("spark", { size: 0.3 }, this.scene);
        spark.position = position.clone();
        spark.material = this.flashMat;
        
        setTimeout(() => spark.dispose(), 100);
    }
    
    // Эффект респавна - светящееся кольцо и частицы
    createRespawnEffect(position: Vector3): void {
        // Основное светящееся кольцо
        const ring = MeshBuilder.CreateCylinder("respawnRing", { 
            diameter: 6, 
            height: 0.4, 
            tessellation: 32 
        }, this.scene);
        ring.position = position.clone();
        ring.position.y = 1;
        ring.rotation.x = Math.PI / 2;
        
        const ringMat = new StandardMaterial("respawnRingMat", this.scene);
        ringMat.diffuseColor = new Color3(0, 1, 1); // Голубой
        ringMat.emissiveColor = new Color3(0, 0.8, 0.8);
        ringMat.disableLighting = true;
        ring.material = ringMat;
        
        // Анимация расширения
        let scale = 0.3;
        let frame = 0;
        const animate = () => {
            frame++;
            scale += 0.15;
            ring.scaling.setAll(scale);
            
            if (frame < 15) {
                setTimeout(animate, 40);
            } else {
                ring.dispose();
            }
        };
        animate();
        
        // Частицы вверх (энергия)
        for (let i = 0; i < 12; i++) {
            const particle = MeshBuilder.CreateBox("respawnParticle", { size: 0.3 }, this.scene);
            particle.position = position.clone();
            particle.position.y = 0.5;
            
            const particleMat = new StandardMaterial("respawnParticleMat", this.scene);
            particleMat.diffuseColor = new Color3(0, 1, 1);
            particleMat.emissiveColor = new Color3(0, 0.9, 0.9);
            particleMat.disableLighting = true;
            particle.material = particleMat;
            
            const angle = (Math.PI * 2 * i) / 12;
            const radius = 2;
            const speed = 0.4;
            let t = 0;
            const moveParticle = () => {
                t += 0.05;
                particle.position.x = position.x + Math.cos(angle) * radius * (1 - t);
                particle.position.y = position.y + 0.5 + t * 3;
                particle.position.z = position.z + Math.sin(angle) * radius * (1 - t);
                particle.scaling.setAll(1 - t * 0.8);
                
                if (t < 1) {
                    setTimeout(moveParticle, 30);
                } else {
                    particle.dispose();
                }
            };
            moveParticle();
        }
        
        // Вспышка в центре
        const flash = MeshBuilder.CreateBox("respawnFlash", { size: 2 }, this.scene);
        flash.position = position.clone();
        flash.position.y = 1.5;
        
        const flashMat = new StandardMaterial("respawnFlashMat", this.scene);
        flashMat.diffuseColor = new Color3(1, 1, 1); // Белый
        flashMat.emissiveColor = new Color3(1, 1, 1);
        flashMat.disableLighting = true;
        flash.material = flashMat;
        
        let flashScale = 0.5;
        let flashFrame = 0;
        const flashAnimate = () => {
            flashFrame++;
            flashScale += 0.2;
            flash.scaling.setAll(flashScale);
            
            if (flashFrame < 8) {
                setTimeout(flashAnimate, 30);
            } else {
                flash.dispose();
            }
        };
        flashAnimate();
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
