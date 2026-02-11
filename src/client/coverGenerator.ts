// ═══════════════════════════════════════════════════════════════════════════
// COVER GENERATOR - Генератор укрытий и препятствий
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
    TransformNode
} from "@babylonjs/core";

// Seeded random for consistent generation
class SeededRandom {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    range(min: number, max: number): number { return min + this.next() * (max - min); }
    int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
    chance(p: number): boolean { return this.next() < p; }
    pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)] as T; }
}

export interface CoverObject {
    mesh: Mesh;
    type: "container" | "car" | "barrier" | "sandbag" | "rubble" | "vegetation" | "wall";
    destructible: boolean;
    health: number;
    maxHealth: number;
}

interface CoverGeneratorConfig {
    worldSeed: number;
    mapType?: string;
}

export class CoverGenerator {
    private scene: Scene;
    private config: CoverGeneratorConfig;
    private materials: Map<string, StandardMaterial> = new Map();
    private covers: Map<string, CoverObject[]> = new Map();
    private isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean;
    
    constructor(scene: Scene, config?: Partial<CoverGeneratorConfig>, isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean) {
        this.scene = scene;
        this.config = {
            worldSeed: Date.now(),
            ...config
        };
        this.isPositionInGarageArea = isPositionInGarageArea;
        this.createMaterials();
    }
    
    private createMaterials(): void {
        // Container colors
        const containerColors = [
            { name: "containerRed", color: new Color3(0.6, 0.15, 0.1) },
            { name: "containerBlue", color: new Color3(0.1, 0.2, 0.5) },
            { name: "containerGreen", color: new Color3(0.15, 0.4, 0.15) },
            { name: "containerYellow", color: new Color3(0.6, 0.5, 0.1) },
            { name: "containerGray", color: new Color3(0.35, 0.35, 0.35) },
            { name: "containerRust", color: new Color3(0.45, 0.3, 0.2) }
        ];
        
        for (const { name, color } of containerColors) {
            const mat = new StandardMaterial(name, this.scene);
            mat.diffuseColor = color;
            mat.specularColor = new Color3(0.1, 0.1, 0.1);
            mat.freeze();
            this.materials.set(name, mat);
        }
        
        // Car materials
        const carMat = new StandardMaterial("carBody", this.scene);
        carMat.diffuseColor = new Color3(0.3, 0.1, 0.1);
        carMat.specularColor = new Color3(0.15, 0.15, 0.15);
        carMat.freeze();
        this.materials.set("carBody", carMat);
        
        const carRust = new StandardMaterial("carRust", this.scene);
        carRust.diffuseColor = new Color3(0.4, 0.25, 0.15);
        carRust.specularColor = Color3.Black();
        carRust.freeze();
        this.materials.set("carRust", carRust);
        
        // Barrier materials
        const concrete = new StandardMaterial("concreteBarrier", this.scene);
        concrete.diffuseColor = new Color3(0.5, 0.48, 0.45);
        concrete.specularColor = Color3.Black();
        concrete.freeze();
        this.materials.set("concreteBarrier", concrete);
        
        // Sandbag material
        const sandbag = new StandardMaterial("sandbag", this.scene);
        sandbag.diffuseColor = new Color3(0.55, 0.45, 0.35);
        sandbag.specularColor = Color3.Black();
        sandbag.freeze();
        this.materials.set("sandbag", sandbag);
        
        // Rubble material
        const rubble = new StandardMaterial("rubble", this.scene);
        rubble.diffuseColor = new Color3(0.4, 0.38, 0.35);
        rubble.specularColor = Color3.Black();
        rubble.freeze();
        this.materials.set("rubble", rubble);
        
        // Vegetation
        const bush = new StandardMaterial("bush", this.scene);
        bush.diffuseColor = new Color3(0.2, 0.35, 0.15);
        bush.specularColor = Color3.Black();
        bush.freeze();
        this.materials.set("bush", bush);
        
        const tree = new StandardMaterial("treeTrunk", this.scene);
        tree.diffuseColor = new Color3(0.35, 0.25, 0.15);
        tree.specularColor = Color3.Black();
        tree.freeze();
        this.materials.set("treeTrunk", tree);
        
        const foliage = new StandardMaterial("foliage", this.scene);
        foliage.diffuseColor = new Color3(0.15, 0.4, 0.1);
        foliage.specularColor = Color3.Black();
        foliage.freeze();
        this.materials.set("foliage", foliage);
    }
    
    // УЛУЧШЕНО: Create a shipping container с вариациями размера
    createContainer(position: Vector3, rotation: number, parent: TransformNode, random: SeededRandom): CoverObject {
        const containerColors = ["containerRed", "containerBlue", "containerGreen", "containerYellow", "containerGray", "containerRust"];
        const colorName = random.pick(containerColors);
        
        // УЛУЧШЕНО: Standard container dimensions с вариациями
        const baseWidth = random.chance(0.3) ? 12 : 6; // 20ft or 40ft container
        const sizeVariation = random.range(0.9, 1.1); // ±10% вариация
        const width = baseWidth * sizeVariation;
        const height = 2.6 * sizeVariation;
        const depth = 2.4 * sizeVariation;
        
        const container = MeshBuilder.CreateBox("container", {
            width: width,
            height: height,
            depth: depth
        }, this.scene);
        
        container.position = position.clone();
        container.position.y = height / 2;
        container.rotation.y = rotation;
        container.material = this.materials.get(colorName)!;
        container.parent = parent;
        container.freezeWorldMatrix();
        
        // Add physics
        new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        container.metadata = { type: "cover", coverType: "container", destructible: true };
        
        return {
            mesh: container,
            type: "container",
            destructible: true,
            health: 150,
            maxHealth: 150
        };
    }
    
    // Create a wrecked car
    createWreckedCar(position: Vector3, rotation: number, parent: TransformNode, random: SeededRandom): CoverObject {
        const carType = random.int(0, 2); // Different car types
        
        let bodyWidth: number, bodyHeight: number, bodyDepth: number;
        
        if (carType === 0) {
            // Sedan
            bodyWidth = 1.8;
            bodyHeight = 1.2;
            bodyDepth = 4.2;
        } else if (carType === 1) {
            // Truck
            bodyWidth = 2.2;
            bodyHeight = 1.8;
            bodyDepth = 5.5;
        } else {
            // Van
            bodyWidth = 2.0;
            bodyHeight = 2.0;
            bodyDepth = 4.8;
        }
        
        // Main body
        const body = MeshBuilder.CreateBox("carBody", {
            width: bodyWidth,
            height: bodyHeight,
            depth: bodyDepth
        }, this.scene);
        
        body.position = position.clone();
        body.position.y = bodyHeight / 2 + 0.2; // Slightly off ground
        body.rotation.y = rotation;
        
        // Random tilt for wrecked look
        body.rotation.x = random.range(-0.1, 0.1);
        body.rotation.z = random.range(-0.15, 0.15);
        
        body.material = random.chance(0.6) ? this.materials.get("carRust")! : this.materials.get("carBody")!;
        body.parent = parent;
        body.freezeWorldMatrix();
        
        // Add physics
        new PhysicsAggregate(body, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        body.metadata = { type: "cover", coverType: "car", destructible: true };
        
        return {
            mesh: body,
            type: "car",
            destructible: true,
            health: 80,
            maxHealth: 80
        };
    }
    
    // Create a concrete barrier
    createBarrier(position: Vector3, rotation: number, parent: TransformNode, random: SeededRandom): CoverObject {
        const barrierType = random.int(0, 2);
        
        let width: number, height: number, depth: number;
        
        if (barrierType === 0) {
            // Jersey barrier
            width = 3.0;
            height = 0.8;
            depth = 0.6;
        } else if (barrierType === 1) {
            // Tall concrete block
            width = 1.5;
            height = 1.5;
            depth = 1.5;
        } else {
            // Long wall segment
            width = 4.0;
            height = 1.2;
            depth = 0.4;
        }
        
        const barrier = MeshBuilder.CreateBox("barrier", {
            width: width,
            height: height,
            depth: depth
        }, this.scene);
        
        barrier.position = position.clone();
        barrier.position.y = height / 2;
        barrier.rotation.y = rotation;
        barrier.material = this.materials.get("concreteBarrier")!;
        barrier.parent = parent;
        barrier.freezeWorldMatrix();
        
        new PhysicsAggregate(barrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        barrier.metadata = { type: "cover", coverType: "barrier", destructible: true };
        
        return {
            mesh: barrier,
            type: "barrier",
            destructible: true,
            health: 200,
            maxHealth: 200
        };
    }
    
    // Create sandbag fortification
    createSandbags(position: Vector3, rotation: number, parent: TransformNode, random: SeededRandom): CoverObject {
        const rows = random.int(2, 4);
        const width = random.range(2, 4);
        
        const fortification = MeshBuilder.CreateBox("sandbags", {
            width: width,
            height: rows * 0.4,
            depth: 0.6
        }, this.scene);
        
        fortification.position = position.clone();
        fortification.position.y = (rows * 0.4) / 2;
        fortification.rotation.y = rotation;
        fortification.material = this.materials.get("sandbag")!;
        fortification.parent = parent;
        fortification.freezeWorldMatrix();
        
        new PhysicsAggregate(fortification, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        fortification.metadata = { type: "cover", coverType: "sandbag", destructible: true };
        
        return {
            mesh: fortification,
            type: "sandbag",
            destructible: true,
            health: 60,
            maxHealth: 60
        };
    }
    
    // Create rubble pile
    createRubble(position: Vector3, parent: TransformNode, random: SeededRandom): CoverObject {
        const size = random.range(2, 5);
        const height = random.range(0.5, 1.5);
        
        const rubble = MeshBuilder.CreateBox("rubble", {
            width: size,
            height: height,
            depth: size
        }, this.scene);
        
        rubble.position = position.clone();
        rubble.position.y = height / 2;
        rubble.rotation.y = random.range(0, Math.PI * 2);
        rubble.material = this.materials.get("rubble")!;
        rubble.parent = parent;
        rubble.freezeWorldMatrix();
        
        // Small rubble doesn't need physics
        if (height > 0.8) {
            new PhysicsAggregate(rubble, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        rubble.metadata = { type: "cover", coverType: "rubble", destructible: false };
        
        return {
            mesh: rubble,
            type: "rubble",
            destructible: false,
            health: 0,
            maxHealth: 0
        };
    }
    
    // Create vegetation (bush or tree)
    createVegetation(position: Vector3, parent: TransformNode, random: SeededRandom): CoverObject {
        const isTree = random.chance(0.3);
        
        if (isTree) {
            // Tree
            const trunkHeight = random.range(3, 6);
            const trunkWidth = random.range(0.3, 0.6);
            
            const trunk = MeshBuilder.CreateBox("treeTrunk", {
                width: trunkWidth,
                height: trunkHeight,
                depth: trunkWidth
            }, this.scene);
            
            trunk.position = position.clone();
            trunk.position.y = trunkHeight / 2;
            trunk.material = this.materials.get("treeTrunk")!;
            trunk.parent = parent;
            
            // Foliage
            const foliageSize = random.range(2, 4);
            const foliage = MeshBuilder.CreateBox("foliage", {
                width: foliageSize,
                height: foliageSize,
                depth: foliageSize
            }, this.scene);
            
            foliage.position = position.clone();
            foliage.position.y = trunkHeight + foliageSize / 2 - 0.5;
            foliage.material = this.materials.get("foliage")!;
            foliage.parent = parent;
            
            trunk.freezeWorldMatrix();
            foliage.freezeWorldMatrix();
            
            trunk.metadata = { type: "cover", coverType: "vegetation", destructible: true };
            
            return {
                mesh: trunk,
                type: "vegetation",
                destructible: true,
                health: 40,
                maxHealth: 40
            };
        } else {
            // Bush
            const bushSize = random.range(1, 2.5);
            const bush = MeshBuilder.CreateBox("bush", {
                width: bushSize,
                height: bushSize * 0.8,
                depth: bushSize
            }, this.scene);
            
            bush.position = position.clone();
            bush.position.y = (bushSize * 0.8) / 2;
            bush.material = this.materials.get("bush")!;
            bush.parent = parent;
            bush.freezeWorldMatrix();
            
            bush.metadata = { type: "cover", coverType: "vegetation", destructible: true };
            
            return {
                mesh: bush,
                type: "vegetation",
                destructible: true,
                health: 20,
                maxHealth: 20
            };
        }
    }
    
    // Generate cover objects for a chunk
    generateCoversForChunk(
        chunkX: number, 
        chunkZ: number, 
        chunkSize: number, 
        biome: string,
        parent: TransformNode,
        roadNetwork?: any
    ): CoverObject[] {
        // Специальная обработка для Тарту
        // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
        if (this.config.mapType !== undefined && this.config.mapType === "tartaria") {
            return this.generateTartuCoversForChunk(chunkX, chunkZ, chunkSize, biome, parent, roadNetwork);
        }
        
        const key = `${chunkX}_${chunkZ}`;
        
        if (this.covers.has(key)) {
            return this.covers.get(key)!;
        }
        
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);
        const covers: CoverObject[] = [];
        
        const worldX = chunkX * chunkSize;
        const worldZ = chunkZ * chunkSize;
        
        // Number of covers based on biome - много укрытий (увеличено в 1.5-2 раза)
        let coverCount = 0;
        switch (biome) {
            case "city":
            case "industrial":
                coverCount = random.int(5, 9); // Увеличено с 3-6
                break;
            case "military":
                coverCount = random.int(6, 12); // Увеличено с 4-8
                break;
            case "wasteland":
                coverCount = random.int(3, 8); // Увеличено с 2-5
                break;
            case "park":
                coverCount = random.int(3, 6); // Увеличено с 2-4
                break;
            case "residential":
                coverCount = random.int(2, 5); // Увеличено с 1-3
                break;
            default:
                coverCount = random.int(2, 5); // Увеличено с 1-3
        }
        
        for (let i = 0; i < coverCount; i++) {
            const x = random.range(8, chunkSize - 8);
            const z = random.range(8, chunkSize - 8);
            const localPos = new Vector3(x, 0, z);
            const rotation = random.range(0, Math.PI * 2);
            const worldX_pos = worldX + x;
            const worldZ_pos = worldZ + z;
            
            // Check if position is on a road (skip if so)
            if (roadNetwork && roadNetwork.isOnRoad(worldX_pos, worldZ_pos)) {
                continue;
            }
            
            // КРИТИЧЕСКИ ВАЖНО: Проверяем, не находится ли объект в области гаража
            if (this.isPositionInGarageArea && this.isPositionInGarageArea(worldX_pos, worldZ_pos, 3)) {
                continue; // Пропускаем этот объект
            }
            
            // УЛУЧШЕНО: Choose cover type based on biome с большим разнообразием
            let cover: CoverObject;
            
            if (biome === "city" || biome === "industrial") {
                // УЛУЧШЕНО: Больше вариантов укрытий
                const type = random.int(0, 5);
                if (type === 0) {
                    cover = this.createContainer(localPos, rotation, parent, random);
                } else if (type === 1) {
                    cover = this.createWreckedCar(localPos, rotation, parent, random);
                } else if (type === 2) {
                    cover = this.createBarrier(localPos, rotation, parent, random);
                } else if (type === 3) {
                    cover = this.createRubble(localPos, parent, random);
                } else {
                    // Дополнительные контейнеры для разнообразия
                    cover = this.createContainer(localPos, rotation, parent, random);
                }
            } else if (biome === "military") {
                const type = random.int(0, 3);
                if (type === 0) {
                    cover = this.createSandbags(localPos, rotation, parent, random);
                } else if (type === 1) {
                    cover = this.createBarrier(localPos, rotation, parent, random);
                } else {
                    cover = this.createContainer(localPos, rotation, parent, random);
                }
            } else if (biome === "park") {
                cover = this.createVegetation(localPos, parent, random);
            } else if (biome === "wasteland") {
                const type = random.int(0, 2);
                if (type === 0) {
                    cover = this.createRubble(localPos, parent, random);
                } else {
                    cover = this.createWreckedCar(localPos, rotation, parent, random);
                }
            } else {
                // residential and others
                const type = random.int(0, 2);
                if (type === 0) {
                    cover = this.createVegetation(localPos, parent, random);
                } else {
                    cover = this.createWreckedCar(localPos, rotation, parent, random);
                }
            }
            
            covers.push(cover);
        }
        
        this.covers.set(key, covers);
        return covers;
    }
    
    /**
     * Генерирует укрытия для карты Тарту с учетом биомов
     */
    private generateTartuCoversForChunk(
        chunkX: number,
        chunkZ: number,
        chunkSize: number,
        biome: string,
        parent: TransformNode,
        roadNetwork?: any
    ): CoverObject[] {
        const key = `${chunkX}_${chunkZ}`;
        
        if (this.covers.has(key)) {
            return this.covers.get(key)!;
        }
        
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);
        const covers: CoverObject[] = [];
        
        const worldX = chunkX * chunkSize;
        const worldZ = chunkZ * chunkSize;
        
        // Меньше укрытий в городе (здания уже обеспечивают укрытие)
        // Больше в парках (деревья, скамейки)
        // Промышленные зоны - контейнеры, барьеры
        
        let coverCount = 0;
        switch (biome) {
            case "city":
                coverCount = random.int(2, 4); // Меньше, так как есть здания
                break;
            case "park":
            case "university":
                coverCount = random.int(4, 8); // Больше деревьев
                break;
            case "industrial":
                coverCount = random.int(3, 6); // Контейнеры, барьеры
                break;
            case "residential":
                coverCount = random.int(2, 5); // Среднее количество
                break;
            case "river":
                coverCount = 0; // Нет укрытий в реке
                break;
            default:
                coverCount = random.int(2, 4);
        }
        
        for (let i = 0; i < coverCount; i++) {
            const x = random.range(8, chunkSize - 8);
            const z = random.range(8, chunkSize - 8);
            const localPos = new Vector3(x, 0, z);
            const rotation = random.range(0, Math.PI * 2);
            const worldX_pos = worldX + x;
            const worldZ_pos = worldZ + z;
            
            // Check if position is on a road (skip if so)
            if (roadNetwork && roadNetwork.isOnRoad(worldX_pos, worldZ_pos)) {
                continue;
            }
            
            // Проверяем, не находится ли объект в области гаража
            if (this.isPositionInGarageArea && this.isPositionInGarageArea(worldX_pos, worldZ_pos, 3)) {
                continue;
            }
            
            // Choose cover type based on biome
            let cover: CoverObject;
            
            if (biome === "city" || biome === "industrial") {
                const type = random.int(0, 3);
                if (type === 0) {
                    cover = this.createContainer(localPos, rotation, parent, random);
                } else if (type === 1) {
                    cover = this.createBarrier(localPos, rotation, parent, random);
                } else {
                    cover = this.createWreckedCar(localPos, rotation, parent, random);
                }
            } else if (biome === "park" || biome === "university") {
                // В парках - только растительность
                cover = this.createVegetation(localPos, parent, random);
            } else if (biome === "residential") {
                const type = random.int(0, 2);
                if (type === 0) {
                    cover = this.createVegetation(localPos, parent, random);
                } else {
                    cover = this.createWreckedCar(localPos, rotation, parent, random);
                }
            } else {
                // По умолчанию
                cover = this.createVegetation(localPos, parent, random);
            }
            
            covers.push(cover);
        }
        
        this.covers.set(key, covers);
        return covers;
    }
    
    // Clear covers for a chunk
    clearChunk(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        this.covers.delete(key);
    }
}

