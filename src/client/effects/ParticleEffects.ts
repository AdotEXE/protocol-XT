/**
 * @module effects/ParticleEffects
 * @description Улучшенная система частиц
 */

import { Scene, Vector3, MeshBuilder, StandardMaterial, Color3, Mesh } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { EFFECTS_CONFIG } from "./EffectsConfig";

/**
 * Конфигурация эффекта частиц
 */
export interface ParticleConfig {
    count: number;           // Количество частиц
    size: number;            // Размер частицы
    speed: number;           // Скорость движения
    lifetime: number;        // Время жизни (мс)
    color: Color3;           // Цвет
    gravity: number;         // Влияние гравитации
    spread: number;          // Разброс направления
    fadeOut: boolean;        // Затухание
}

/**
 * Пресеты эффектов
 */
export const PARTICLE_PRESETS = {
    explosion: {
        count: 15,
        size: 0.5,
        speed: 15,
        lifetime: 800,
        color: new Color3(1, 0.5, 0),
        gravity: -5,
        spread: 1.0,
        fadeOut: true
    } as ParticleConfig,

    smoke: {
        count: 8,
        size: 0.8,
        speed: 3,
        lifetime: 1500,
        color: new Color3(0.3, 0.3, 0.3),
        gravity: 2,
        spread: 0.5,
        fadeOut: true
    } as ParticleConfig,

    dust: {
        count: 10,
        size: 0.4,
        speed: 5,
        lifetime: 1000,
        color: new Color3(0.6, 0.5, 0.4),
        gravity: -3,
        spread: 0.8,
        fadeOut: true
    } as ParticleConfig,

    sparks: {
        count: 12,
        size: 0.15,
        speed: 20,
        lifetime: 500,
        color: new Color3(1, 0.8, 0.2),
        gravity: -10,
        spread: 0.8,
        fadeOut: false
    } as ParticleConfig,

    fire: {
        count: 6,
        size: 0.6,
        speed: 4,
        lifetime: 600,
        color: new Color3(1, 0.3, 0),
        gravity: 3,
        spread: 0.3,
        fadeOut: true
    } as ParticleConfig,

    debris: {
        count: 8,
        size: 0.3,
        speed: 12,
        lifetime: 1200,
        color: new Color3(0.4, 0.4, 0.4),
        gravity: -15,
        spread: 0.9,
        fadeOut: false
    } as ParticleConfig,

    hit: {
        count: 5,
        size: 0.2,
        speed: 10,
        lifetime: 300,
        color: new Color3(1, 1, 0),
        gravity: -8,
        spread: 0.6,
        fadeOut: true
    } as ParticleConfig,
    respawn: {
        count: 20,
        size: 0.4,
        speed: 8,
        lifetime: 1000,
        color: new Color3(0, 1, 1), // Сyan
        gravity: 5, // Рисуем вверх (антигравитация)
        spread: 0.5,
        fadeOut: true
    } as ParticleConfig
};



interface Particle {
    mesh: Mesh;
    velocity: Vector3;
    lifetime: number;
    maxLifetime: number;
    fadeOut: boolean;
    gravity: number;
}

/**
 * ParticleEffects - Система частиц
 * 
 * Простая система частиц на основе мешей (без GPU particles для совместимости).
 * Использует пулинг для производительности.
 */
export class ParticleEffects {
    private scene: Scene;
    private materials: Map<string, StandardMaterial> = new Map();
    private particles: Particle[] = [];
    private particlePool: Mesh[] = [];
    private maxPoolSize = 100;
    private maxActiveParticles = 200;

    // УЛУЧШЕНО: Флаги для дыма и пыли
    private enableSmoke: boolean = false;
    private enableDust: boolean = false;

    constructor(scene: Scene) {
        this.scene = scene;
        this.initMaterials();

        // Запускаем обновление
        this.scene.onBeforeRenderObservable.add(() => {
            this.update();
        });

        logger.log("[ParticleEffects] Initialized");
    }

    // УЛУЧШЕНО: Методы для управления флагами
    setSmokeEnabled(enabled: boolean): void {
        this.enableSmoke = enabled;
    }

    setDustEnabled(enabled: boolean): void {
        this.enableDust = enabled;
    }

    /**
     * Инициализация материалов
     */
    private initMaterials(): void {
        for (const [name, preset] of Object.entries(PARTICLE_PRESETS)) {
            const mat = new StandardMaterial(`particle_${name}`, this.scene);
            mat.diffuseColor = preset.color;
            mat.emissiveColor = preset.color.scale(0.5);
            mat.specularColor = Color3.Black();
            mat.disableLighting = true;
            mat.freeze();
            this.materials.set(name, mat);
        }
    }

    /**
     * Создание эффекта по пресету
     */
    emit(presetName: keyof typeof PARTICLE_PRESETS, position: Vector3, direction?: Vector3): void {
        const preset = PARTICLE_PRESETS[presetName];
        if (!preset) {
            logger.warn(`[ParticleEffects] Unknown preset: ${presetName}`);
            return;
        }

        this.emitCustom(position, preset, direction);
    }

    /**
     * Создание кастомного эффекта
     */
    emitCustom(position: Vector3, config: ParticleConfig, direction?: Vector3): void {
        if (this.particles.length >= this.maxActiveParticles) {
            // Удаляем старые частицы
            this.removeOldest(config.count);
        }

        const baseDir = direction?.normalize() || Vector3.Up();

        for (let i = 0; i < config.count; i++) {
            const mesh = this.getParticleMesh(config.size);
            if (!mesh) continue;

            // Позиция с небольшим разбросом
            mesh.position = position.add(new Vector3(
                (Math.random() - 0.5) * config.size,
                (Math.random() - 0.5) * config.size,
                (Math.random() - 0.5) * config.size
            ));

            // Направление с разбросом
            const spreadVec = new Vector3(
                (Math.random() - 0.5) * config.spread,
                (Math.random() - 0.5) * config.spread,
                (Math.random() - 0.5) * config.spread
            );
            const velocity = baseDir.add(spreadVec).normalize().scale(config.speed * (0.5 + Math.random() * 0.5));

            // Материал
            const matName = this.findMaterialName(config.color);
            mesh.material = this.materials.get(matName) || this.createTempMaterial(config.color);
            mesh.isVisible = true;

            this.particles.push({
                mesh,
                velocity,
                lifetime: config.lifetime,
                maxLifetime: config.lifetime,
                fadeOut: config.fadeOut,
                gravity: config.gravity
            });
        }
    }

    /**
     * Эффект взрыва
     */
    createExplosion(position: Vector3, scale: number = 1): void {
        const config = { ...PARTICLE_PRESETS.explosion };
        config.count = Math.round(config.count * scale);
        config.size *= scale;
        config.speed *= scale * 0.7;
        this.emitCustom(position, config);

        // УЛУЧШЕНО: Добавляем дым только если флаг включен
        if (this.enableSmoke) {
            setTimeout(() => {
                const smokeConfig = { ...PARTICLE_PRESETS.smoke };
                smokeConfig.count = Math.round(smokeConfig.count * scale);
                this.emitCustom(position.add(new Vector3(0, 0.5, 0)), smokeConfig, Vector3.Up());
            }, 100);
        }
    }

    /**
     * Эффект попадания
     */
    createHit(position: Vector3, normal?: Vector3): void {
        const dir = normal?.scale(-1) || Vector3.Up();
        this.emit("hit", position, dir);
        this.emit("sparks", position, dir);
    }

    /**
     * Эффект респавна (телепортации)
     */
    createRespawnEffect(position: Vector3): void {
        const config = { ...PARTICLE_PRESETS.respawn };

        // Создаем столб света/частиц
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.emitCustom(position.add(new Vector3(0, i * 0.5, 0)), config, Vector3.Up());
            }, i * 100);
        }

        // Добавляем немного "искр"
        const sparksConfig = { ...PARTICLE_PRESETS.sparks };
        sparksConfig.color = new Color3(0.5, 1, 1);
        sparksConfig.gravity = 2;
        this.emitCustom(position.add(new Vector3(0, 1, 0)), sparksConfig, Vector3.Up());
    }

    /**
     * Эффект пыли от движения
     */
    createDust(position: Vector3): void {
        // УЛУЧШЕНО: Проверка флага перед созданием пыли
        if (!this.enableDust) return;
        this.emit("dust", position.add(new Vector3(0, 0.3, 0)));
    }

    /**
     * Эффект дыма от повреждённого танка
     */
    createDamageSmoke(position: Vector3): void {
        // УЛУЧШЕНО: Проверка флага перед созданием дыма
        if (!this.enableSmoke) return;
        this.emit("smoke", position.add(new Vector3(0, 1, 0)), Vector3.Up());
    }

    /**
     * Эффект огня
     */
    createFire(position: Vector3, duration: number = 2000): void {
        let elapsed = 0;
        const interval = 100;

        const spawnFire = () => {
            if (elapsed >= duration) return;

            this.emit("fire", position.add(new Vector3(
                (Math.random() - 0.5) * 0.5,
                Math.random() * 0.5,
                (Math.random() - 0.5) * 0.5
            )), Vector3.Up());

            elapsed += interval;
            setTimeout(spawnFire, interval);
        };

        spawnFire();
    }

    /**
     * Обновление частиц
     */
    private update(): void {
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            if (!particle) continue; // Защита от undefined

            // Уменьшаем время жизни
            particle.lifetime -= deltaTime * 1000;

            if (particle.lifetime <= 0) {
                this.recycleParticle(particle);
                this.particles.splice(i, 1);
                continue;
            }

            // Применяем гравитацию
            particle.velocity.y += particle.gravity * deltaTime;

            // Обновляем позицию
            particle.mesh.position.addInPlace(particle.velocity.scale(deltaTime));

            // УЛУЧШЕНО: Затухание через alpha материала вместо visibility
            if (particle.fadeOut) {
                const lifeRatio = particle.lifetime / particle.maxLifetime;
                // Плавная кривая затухания (ease-out)
                const fadePower = EFFECTS_CONFIG.particle.fadePower;
                const alpha = Math.pow(lifeRatio, fadePower);

                // Применяем alpha к материалу
                if (particle.mesh.material instanceof StandardMaterial) {
                    particle.mesh.material.alpha = alpha;
                } else {
                    // Fallback на visibility если материал не StandardMaterial
                    particle.mesh.visibility = alpha;
                }
            }

            // Уменьшаем размер к концу жизни
            const shrinkFactor = Math.max(0.3, particle.lifetime / particle.maxLifetime);
            particle.mesh.scaling.setAll(shrinkFactor);
        }
    }

    /**
     * Получение меша частицы (из пула или новый)
     */
    private getParticleMesh(size: number): Mesh | null {
        let mesh: Mesh;

        if (this.particlePool.length > 0) {
            mesh = this.particlePool.pop()!;
            mesh.scaling.setAll(1);
            mesh.visibility = 1;
            // УЛУЧШЕНО: Сбрасываем alpha материала при получении из пула
            if (mesh.material instanceof StandardMaterial) {
                mesh.material.alpha = 1;
            }
        } else {
            mesh = MeshBuilder.CreateBox("particle", { size: size }, this.scene);
            mesh.isPickable = false; // КРИТИЧНО: Отключаем пикинг для частиц
            mesh.checkCollisions = false; // КРИТИЧНО: Отключаем проверку коллизий для частиц
        }

        return mesh;
    }

    /**
     * Возврат частицы в пул
     */
    private recycleParticle(particle: Particle): void {
        particle.mesh.isVisible = false;

        if (this.particlePool.length < this.maxPoolSize) {
            this.particlePool.push(particle.mesh);
        } else {
            particle.mesh.dispose();
        }
    }

    /**
     * Удаление старых частиц
     */
    private removeOldest(count: number): void {
        for (let i = 0; i < count && this.particles.length > 0; i++) {
            const oldest = this.particles.shift()!;
            this.recycleParticle(oldest);
        }
    }

    /**
     * Поиск материала по цвету
     */
    private findMaterialName(color: Color3): string {
        for (const [name, preset] of Object.entries(PARTICLE_PRESETS)) {
            if (preset.color.equals(color)) {
                return name;
            }
        }
        return "explosion"; // Fallback
    }

    /**
     * Создание временного материала
     */
    private createTempMaterial(color: Color3): StandardMaterial {
        const mat = new StandardMaterial(`particle_temp_${Date.now()}`, this.scene);
        mat.diffuseColor = color;
        mat.emissiveColor = color.scale(0.5);
        mat.specularColor = Color3.Black();
        mat.disableLighting = true;
        return mat;
    }

    /**
     * Очистка всех частиц
     */
    clear(): void {
        for (const particle of this.particles) {
            particle.mesh.dispose();
        }
        this.particles = [];

        for (const mesh of this.particlePool) {
            mesh.dispose();
        }
        this.particlePool = [];
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.clear();

        // ИСПРАВЛЕНО: Используем Array.from для совместимости с TypeScript
        for (const mat of Array.from(this.materials.values())) {
            mat.dispose();
        }
        this.materials.clear();

        logger.log("[ParticleEffects] Disposed");
    }
}

