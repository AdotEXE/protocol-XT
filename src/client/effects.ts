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
        
        // УЛУЧШЕНО: Улучшенные частицы (больше и ярче)
        const particleCount = 20; // УВЕЛИЧЕНО с 16 до 20 для более эффектного вида
        for (let i = 0; i < particleCount; i++) {
            const particle = MeshBuilder.CreateBox("particle", { size: 0.3 }, this.scene); // УВЕЛИЧЕН размер с 0.25 до 0.3
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
    
    // УЛУЧШЕНО: Simple muzzle flash - более яркий и заметный
    createMuzzleFlash(position: Vector3, direction: Vector3, cannonType?: string): void {
        // Get unique color based on cannon type
        let flashColor = new Color3(1, 1, 0); // Default yellow
        let flashSize = 1.0; // УВЕЛИЧЕНО с 0.8 до 1.0 для лучшей видимости
        
        if (cannonType) {
            switch (cannonType) {
                case "plasma":
                    flashColor = new Color3(1, 0, 1); flashSize = 1.2; break;
                case "laser":
                    flashColor = new Color3(1, 0, 0); flashSize = 0.6; break;
                case "tesla":
                    flashColor = new Color3(0, 1, 1); flashSize = 1.0; break;
                case "rocket":
                case "explosive":
                case "mortar":
                    flashColor = new Color3(1, 0.5, 0); flashSize = 1.5; break;
                case "flamethrower":
                    flashColor = new Color3(1, 0.3, 0); flashSize = 1.3; break;
                case "acid":
                    flashColor = new Color3(0, 1, 0); flashSize = 0.9; break;
                case "freeze":
                    flashColor = new Color3(0.5, 0.8, 1); flashSize = 1.0; break;
                case "poison":
                    flashColor = new Color3(0.5, 0, 1); flashSize = 0.9; break;
                case "emp":
                    flashColor = new Color3(1, 1, 0); flashSize = 1.4; break;
                case "beam":
                    flashColor = new Color3(1, 0, 0.5); flashSize = 0.7; break;
                case "heavy":
                    flashColor = new Color3(1, 0.8, 0); flashSize = 1.3; break;
                case "sniper":
                    flashColor = new Color3(0.8, 0.8, 1); flashSize = 0.5; break;
            }
        }
        
        const flash = MeshBuilder.CreateBox("flash", { width: flashSize, height: flashSize, depth: 0.3 }, this.scene);
        flash.position = position.add(direction.scale(0.5));
        
        const flashMat = new StandardMaterial("flashMat", this.scene);
        flashMat.diffuseColor = flashColor;
        flashMat.emissiveColor = flashColor.scale(1.2);
        flashMat.disableLighting = true;
        flash.material = flashMat;
        
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
    
    // УЛУЧШЕНО: Enhanced explosion - более эффектные взрывы
    createExplosion(position: Vector3, scale: number = 1.0): void {
        // Main explosion sphere (expanding) - УВЕЛИЧЕН начальный размер
        const explosion = MeshBuilder.CreateSphere("explosion", { diameter: 0.7 * scale, segments: 8 }, this.scene); // УВЕЛИЧЕНО с 0.5 до 0.7
        explosion.position = position.clone();
        explosion.material = this.explosionMat;
        
        // Expand and fade
        let frame = 0;
        const animate = () => {
            frame++;
            const scaleFactor = 1 + frame * 0.8;
            explosion.scaling.setAll(scaleFactor);
            
            // Fade effect (reduce opacity by scaling material brightness)
            const brightness = Math.max(0, 1 - frame * 0.15);
            (explosion.material as StandardMaterial).diffuseColor = new Color3(
                1 * brightness,
                0.5 * brightness,
                0 * brightness
            );
            
            if (frame >= 8) {
                explosion.dispose();
                return;
            }
            setTimeout(animate, 40);
        };
        animate();
        
        // Secondary explosion rings
        for (let ring = 0; ring < 2; ring++) {
            setTimeout(() => {
                const ringMesh = MeshBuilder.CreateTorus("explosionRing", {
                    diameter: 0.3 * scale,
                    thickness: 0.1 * scale,
                    tessellation: 16
                }, this.scene);
                ringMesh.position = position.clone();
                ringMesh.position.y += ring * 0.5;
                ringMesh.material = this.explosionMat;
                
                let ringFrame = 0;
                const ringAnimate = () => {
                    ringFrame++;
                    ringMesh.scaling.setAll(1 + ringFrame * 0.6);
                    ringMesh.rotation.y += 0.1;
                    
                    if (ringFrame >= 6) {
                        ringMesh.dispose();
                        return;
                    }
                    setTimeout(ringAnimate, 40);
                };
                ringAnimate();
            }, ring * 50);
        }
        
        // Enhanced debris with more variety
        const debrisCount = Math.floor(6 * scale);
        for (let i = 0; i < debrisCount; i++) {
            const debrisSize = (0.2 + Math.random() * 0.3) * scale;
            const debris = MeshBuilder.CreateBox("debris", { size: debrisSize }, this.scene);
            debris.position = position.clone();
            debris.material = this.explosionMat;
            debris.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            const vx = (Math.random() - 0.5) * 12 * scale;
            const vy = Math.random() * 10 * scale;
            const vz = (Math.random() - 0.5) * 12 * scale;
            const rotSpeed = (Math.random() - 0.5) * 0.3;
            
            let t = 0;
            const moveDebris = () => {
                t += 0.04;
                debris.position.x += vx * 0.04;
                debris.position.y += (vy - t * 25) * 0.04;
                debris.position.z += vz * 0.04;
                debris.rotation.x += rotSpeed;
                debris.rotation.y += rotSpeed;
                
                if (t > 1.2 || debris.position.y < 0) {
                    debris.dispose();
                    return;
                }
                setTimeout(moveDebris, 30);
            };
            moveDebris();
        }
        
        // Flash effect
        const flash = MeshBuilder.CreateSphere("flash", { diameter: 0.3 * scale, segments: 8 }, this.scene);
        flash.position = position.clone();
        const flashMat = new StandardMaterial("flashMat", this.scene);
        flashMat.diffuseColor = new Color3(1, 1, 0.8); // Bright yellow-white
        flash.material = flashMat;
        
        let flashFrame = 0;
        const flashAnimate = () => {
            flashFrame++;
            flash.scaling.setAll(1 + flashFrame * 2);
            
            if (flashFrame >= 3) {
                flash.dispose();
                return;
            }
            setTimeout(flashAnimate, 30);
        };
        flashAnimate();
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
        const direction = end.subtract(start).normalize();
        
        // Main tracer line - brighter and thicker
        const tracer = MeshBuilder.CreateCylinder("tracer", {
            height: length,
            diameter: 0.15,
            tessellation: 8
        }, this.scene);
        
        const mid = start.add(end).scale(0.5);
        tracer.position = mid;
        tracer.lookAt(end);
        
        // Bright yellow-orange material
        const tracerMat = new StandardMaterial("tracerMat", this.scene);
        tracerMat.diffuseColor = new Color3(1, 0.8, 0.2);
        tracerMat.emissiveColor = new Color3(1, 0.6, 0.1);
        tracerMat.disableLighting = true;
        tracer.material = tracerMat;
        
        // Fade out animation
        let frame = 0;
        const fade = () => {
            frame++;
            const alpha = 1 - (frame / 10);
            tracer.scaling.y = alpha;
            tracer.scaling.x = alpha;
            tracer.scaling.z = alpha;
            
            if (frame >= 10) {
                tracer.dispose();
                return;
            }
            setTimeout(fade, 15);
        };
        fade();
        
        // Glow effect at start
        const glow = MeshBuilder.CreateSphere("tracerGlow", { diameter: 0.3, segments: 8 }, this.scene);
        glow.position = start.clone();
        const glowMat = new StandardMaterial("tracerGlowMat", this.scene);
        glowMat.diffuseColor = new Color3(1, 1, 0.5);
        glowMat.emissiveColor = new Color3(1, 0.8, 0.2);
        glowMat.disableLighting = true;
        glow.material = glowMat;
        
        let glowFrame = 0;
        const glowFade = () => {
            glowFrame++;
            const scale = 1 + glowFrame * 0.3;
            const alpha = 1 - (glowFrame / 8);
            glow.scaling.setAll(scale);
            (glow.material as StandardMaterial).diffuseColor = new Color3(
                1 * alpha,
                1 * alpha,
                0.5 * alpha
            );
            
            if (glowFrame >= 8) {
                glow.dispose();
                return;
            }
            setTimeout(glowFade, 15);
        };
        glowFade();
    }
    
    // Bullet trail - follows projectile and fades out
    createBulletTrail(bullet: Mesh, color?: Color3, cannonType?: string): void {
        if (!bullet || bullet.isDisposed()) return;
        
        // Get trail color based on cannon type or provided color
        let trailColor = color || new Color3(1, 0.7, 0.2); // Default yellow/orange
        
        if (cannonType && !color) {
            switch (cannonType) {
                case "plasma":
                    trailColor = new Color3(1, 0, 1); break;
                case "laser":
                    trailColor = new Color3(1, 0, 0); break;
                case "tesla":
                    trailColor = new Color3(0, 1, 1); break;
                case "rocket":
                case "explosive":
                case "mortar":
                    trailColor = new Color3(1, 0.5, 0); break;
                case "flamethrower":
                    trailColor = new Color3(1, 0.3, 0); break;
                case "acid":
                    trailColor = new Color3(0, 1, 0); break;
                case "freeze":
                    trailColor = new Color3(0.5, 0.8, 1); break;
                case "poison":
                    trailColor = new Color3(0.5, 0, 1); break;
                case "emp":
                    trailColor = new Color3(1, 1, 0); break;
                case "beam":
                    trailColor = new Color3(1, 0, 0.5); break;
            }
        }
        
        // Trail material with unique color
        const trailMat = new StandardMaterial("trailMat", this.scene);
        trailMat.diffuseColor = trailColor;
        trailMat.emissiveColor = trailColor.scale(0.8);
        trailMat.disableLighting = true;
        trailMat.alpha = 0.5;
        
        const trailSegments: Mesh[] = [];
        let lastPos = bullet.absolutePosition.clone();
        let frameCount = 0;
        const maxSegments = 6;
        
        const updateTrail = () => {
            if (bullet.isDisposed()) {
                // Fade out remaining segments
                trailSegments.forEach((seg, i) => {
                    setTimeout(() => {
                        if (!seg.isDisposed()) seg.dispose();
                    }, i * 20);
                });
                trailMat.dispose();
                return;
            }
            
            frameCount++;
            const currentPos = bullet.absolutePosition.clone();
            const dist = Vector3.Distance(lastPos, currentPos);
            
            // Only create segment if moved enough
            if (dist > 0.3) {
                const segment = MeshBuilder.CreateBox("trailSeg", { 
                    width: 0.08, 
                    height: 0.08, 
                    depth: Math.max(0.15, dist * 0.6)
                }, this.scene);
                
                const mid = lastPos.add(currentPos).scale(0.5);
                segment.position = mid;
                segment.lookAt(currentPos);
                segment.material = trailMat;
                
                trailSegments.push(segment);
                lastPos = currentPos.clone();
                
                // Remove old segments (keep very short tail)
                while (trailSegments.length > maxSegments) {
                    const old = trailSegments.shift();
                    if (old && !old.isDisposed()) old.dispose();
                }
            }
            
            // Fade out older segments
            trailSegments.forEach((seg, i) => {
                const age = trailSegments.length - i;
                const fade = Math.max(0.05, 0.5 - age * 0.08);
                seg.scaling.x = Math.max(0.05, 0.6 - age * 0.08);
                seg.scaling.y = Math.max(0.05, 0.6 - age * 0.08);
                seg.visibility = fade;
            });
            
            // Continue for a very short lifetime
            if (frameCount < 120) {
                requestAnimationFrame(updateTrail);
            } else {
                trailSegments.forEach(seg => { if (!seg.isDisposed()) seg.dispose(); });
                trailMat.dispose();
            }
        };
        
        requestAnimationFrame(updateTrail);
    }
    
    // Movement dust - particles from tank tracks
    createMovementDust(position: Vector3, direction: Vector3, intensity: number = 1): void {
        // Create 2-4 dust particles based on intensity
        const particleCount = Math.floor(2 + intensity * 2);
        
        for (let i = 0; i < particleCount; i++) {
            const dust = MeshBuilder.CreateBox("moveDust", { size: 0.4 + Math.random() * 0.3 }, this.scene);
            dust.position = position.clone();
            dust.position.x += (Math.random() - 0.5) * 2;
            dust.position.z += (Math.random() - 0.5) * 2;
            dust.position.y = 0.2;
            dust.material = this.dustMat;
            
            // Random drift
            const driftX = (Math.random() - 0.5) * 0.1 - direction.x * 0.05;
            const driftZ = (Math.random() - 0.5) * 0.1 - direction.z * 0.05;
            const driftY = 0.03 + Math.random() * 0.02;
            
            let frame = 0;
            const animateDust = () => {
                frame++;
                dust.position.x += driftX;
                dust.position.y += driftY;
                dust.position.z += driftZ;
                dust.scaling.setAll(1 + frame * 0.08);
                
                if (frame >= 20) {
                    dust.dispose();
                    return;
                }
                setTimeout(animateDust, 40);
            };
            animateDust();
        }
    }
    
    // ============ LOW HEALTH SMOKE ============
    // Subtle, barely visible smoke when tank has low health
    createLowHealthSmoke(position: Vector3): void {
        // Create a very subtle, transparent smoke particle
        const smoke = MeshBuilder.CreateBox("lowHealthSmoke", { size: 0.3 + Math.random() * 0.2 }, this.scene);
        smoke.position = position.clone();
        smoke.position.x += (Math.random() - 0.5) * 0.5;
        smoke.position.z += (Math.random() - 0.5) * 0.5;
        smoke.position.y = 0.5 + Math.random() * 0.3; // Slightly above tank
        
        // Create individual material for this smoke particle (to avoid affecting others)
        const smokeMat = new StandardMaterial("lowHealthSmokeMat", this.scene);
        smokeMat.diffuseColor = new Color3(0.3, 0.3, 0.3); // Dark gray
        smokeMat.specularColor = Color3.Black();
        smokeMat.alpha = 0.15; // Very transparent (15% opacity)
        smoke.material = smokeMat;
        
        // Very slow drift upward
        const driftX = (Math.random() - 0.5) * 0.02;
        const driftZ = (Math.random() - 0.5) * 0.02;
        const driftY = 0.01 + Math.random() * 0.01; // Very slow upward
        
        let frame = 0;
        const animateSmoke = () => {
            frame++;
            smoke.position.x += driftX;
            smoke.position.y += driftY;
            smoke.position.z += driftZ;
            smoke.scaling.setAll(1 + frame * 0.02); // Very slow expansion
            
            // Fade out gradually
            smokeMat.alpha = Math.max(0, 0.15 - frame * 0.005);
            
            if (frame >= 30) {
                smokeMat.dispose();
                smoke.dispose();
                return;
            }
            setTimeout(animateSmoke, 60); // Slower animation
        };
        animateSmoke();
    }
    
    // ============ UNIQUE HIT EFFECTS ============
    
    createPlasmaBurst(position: Vector3): void {
        // Plasma burst - expanding magenta sphere
        const burst = MeshBuilder.CreateSphere("plasmaBurst", { diameter: 0.3, segments: 12 }, this.scene);
        burst.position = position.clone();
        
        const mat = new StandardMaterial("plasmaBurstMat", this.scene);
        mat.diffuseColor = new Color3(1, 0, 1);
        mat.emissiveColor = new Color3(0.8, 0, 0.8);
        mat.disableLighting = true;
        burst.material = mat;
        
        let frame = 0;
        const animate = () => {
            frame++;
            burst.scaling.setAll(1 + frame * 0.3);
            const brightness = Math.max(0, 1 - frame * 0.1);
            mat.diffuseColor = new Color3(1 * brightness, 0, 1 * brightness);
            
            if (frame < 10) {
                setTimeout(animate, 40);
            } else {
                burst.dispose();
            }
        };
        animate();
    }
    
    createIceShards(position: Vector3): void {
        // Ice shards - multiple blue crystals
        for (let i = 0; i < 8; i++) {
            const shard = MeshBuilder.CreateBox("iceShard", { size: 0.2 }, this.scene);
            shard.position = position.clone();
            shard.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            const mat = new StandardMaterial("iceShardMat", this.scene);
            mat.diffuseColor = new Color3(0.5, 0.8, 1);
            mat.emissiveColor = new Color3(0.3, 0.5, 0.7);
            mat.disableLighting = true;
            shard.material = mat;
            
            const angle = (i * Math.PI * 2) / 8;
            const speed = 0.3;
            let t = 0;
            const move = () => {
                t += 0.05;
                shard.position.x = position.x + Math.cos(angle) * speed * t;
                shard.position.y = position.y + t * 0.2;
                shard.position.z = position.z + Math.sin(angle) * speed * t;
                shard.rotation.y += 0.1;
                
                if (t < 2) {
                    setTimeout(move, 30);
                } else {
                    shard.dispose();
                }
            };
            move();
        }
    }
    
    createPoisonCloud(position: Vector3): void {
        // Poison cloud - expanding green cloud
        const cloud = MeshBuilder.CreateSphere("poisonCloud", { diameter: 0.5, segments: 8 }, this.scene);
        cloud.position = position.clone();
        cloud.position.y += 0.5;
        
        const mat = new StandardMaterial("poisonCloudMat", this.scene);
        mat.diffuseColor = new Color3(0, 1, 0);
        mat.emissiveColor = new Color3(0, 0.5, 0);
        mat.disableLighting = true;
        cloud.material = mat;
        
        let frame = 0;
        const animate = () => {
            frame++;
            cloud.scaling.setAll(1 + frame * 0.2);
            cloud.position.y += 0.05;
            const brightness = Math.max(0, 1 - frame * 0.08);
            mat.diffuseColor = new Color3(0, 1 * brightness, 0);
            
            if (frame < 15) {
                setTimeout(animate, 50);
            } else {
                cloud.dispose();
            }
        };
        animate();
    }
    
    createFireEffect(position: Vector3): void {
        // Fire effect - upward flames
        for (let i = 0; i < 6; i++) {
            const flame = MeshBuilder.CreateBox("flame", { width: 0.15, height: 0.4, depth: 0.15 }, this.scene);
            flame.position = position.clone();
            flame.position.x += (Math.random() - 0.5) * 0.5;
            flame.position.z += (Math.random() - 0.5) * 0.5;
            
            const mat = new StandardMaterial("flameMat", this.scene);
            mat.diffuseColor = new Color3(1, 0.3, 0);
            mat.emissiveColor = new Color3(1, 0.5, 0);
            mat.disableLighting = true;
            flame.material = mat;
            
            let t = 0;
            const animate = () => {
                t += 0.06;
                flame.position.y = position.y + t * 0.8;
                flame.scaling.y = 1 + t * 0.5;
                const brightness = Math.max(0, 1 - t * 0.3);
                mat.diffuseColor = new Color3(1 * brightness, 0.3 * brightness, 0);
                
                if (t < 3) {
                    setTimeout(animate, 30);
                } else {
                    flame.dispose();
                }
            };
            animate();
        }
    }
}
