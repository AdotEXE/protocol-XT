/**
 * @module maps/shared/ChunkHelpers
 * @description Вспомогательные функции для генерации объектов на картах
 * 
 * Содержит общие функции для создания:
 * - Кратеров и воронок
 * - Зданий и руин
 * - Рек и озёр
 * - Гор и скал
 * - Баррикад и укреплений
 * - Транспортных средств
 */

import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { SeededRandom } from "./SeededRandom";

/**
 * Параметры создания объекта
 */
export interface ObjectCreationParams {
    scene: Scene;
    parent: TransformNode;
    getMat: (name: string) => StandardMaterial;
    random: SeededRandom;
    chunkX: number;
    chunkZ: number;
    chunkSize: number;
}

/**
 * Создать кратер/воронку
 */
export function createCrater(
    params: ObjectCreationParams,
    x: number,
    z: number,
    radius: number,
    depth: number
): Mesh {
    const { scene, parent, getMat } = params;
    
    // Внешний край кратера (box вместо torus)
    const rim = MeshBuilder.CreateBox("craterRim", {
        width: radius * 2,
        height: radius * 0.3,
        depth: radius * 2
    }, scene);
    rim.position = new Vector3(x, 0.1, z);
    rim.material = getMat("dirt");
    rim.parent = parent;
    rim.freezeWorldMatrix();
    
    // Дно кратера (box вместо disc)
    const bottomRad = radius * 0.8;
    const bottom = MeshBuilder.CreateBox("craterBottom", {
        width: bottomRad * 2,
        height: 0.01,
        depth: bottomRad * 2
    }, scene);
    bottom.position = new Vector3(x, 0.05 - depth * 0.5, z);
    bottom.material = getMat("dirt");
    bottom.parent = parent;
    bottom.freezeWorldMatrix();
    
    return rim;
}

/**
 * Создать руины здания
 */
export function createRuinedBuilding(
    params: ObjectCreationParams,
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    destructionLevel: number = 0.5
): Mesh[] {
    const { scene, parent, getMat, random } = params;
    const meshes: Mesh[] = [];
    
    // Основание здания
    const baseHeight = height * (1 - destructionLevel * 0.5);
    const base = MeshBuilder.CreateBox("ruinBase", {
        width: width,
        height: baseHeight,
        depth: depth
    }, scene);
    base.position = new Vector3(x, baseHeight / 2, z);
    base.material = getMat(random.pick(["concrete", "brick", "brickDark"]));
    base.parent = parent;
    new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
    base.freezeWorldMatrix();
    meshes.push(base);
    
    // Обломки стен
    const debrisCount = random.int(2, 5);
    for (let i = 0; i < debrisCount; i++) {
        const debrisW = random.range(0.5, width * 0.4);
        const debrisH = random.range(0.3, height * 0.3);
        const debrisD = random.range(0.3, 0.8);
        
        const debris = MeshBuilder.CreateBox("debris", {
            width: debrisW,
            height: debrisH,
            depth: debrisD
        }, scene);
        
        const angle = random.range(0, Math.PI * 2);
        const dist = random.range(width * 0.3, width * 0.8);
        debris.position = new Vector3(
            x + Math.cos(angle) * dist,
            debrisH / 2,
            z + Math.sin(angle) * dist
        );
        debris.rotation.y = random.range(0, Math.PI);
        debris.rotation.z = random.range(-0.3, 0.3);
        debris.material = getMat(random.pick(["concrete", "brick"]));
        debris.parent = parent;
        debris.freezeWorldMatrix();
        meshes.push(debris);
    }
    
    return meshes;
}

/**
 * Создать горный пик
 */
export function createMountain(
    params: ObjectCreationParams,
    x: number,
    z: number,
    baseSize: number,
    height: number
): Mesh {
    const { scene, parent, getMat, random } = params;
    
    const mountain = MeshBuilder.CreateBox("mountain", {
        width: baseSize,
        height: height,
        depth: baseSize
    }, scene);
    mountain.position = new Vector3(x, height / 2, z);
    mountain.material = getMat(random.pick(["rock", "rockDark", "rockLight"]));
    mountain.parent = parent;
    new PhysicsAggregate(mountain, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    mountain.freezeWorldMatrix();
    
    return mountain;
}

/**
 * Создать реку/ручей
 */
export function createRiver(
    params: ObjectCreationParams,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    width: number
): Mesh[] {
    const { scene, parent, getMat } = params;
    const meshes: Mesh[] = [];
    
    const dx = endX - startX;
    const dz = endZ - startZ;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    
    // Русло реки
    const riverbed = MeshBuilder.CreateBox("riverbed", {
        width: length,
        height: 0.3,
        depth: width
    }, scene);
    riverbed.position = new Vector3(
        (startX + endX) / 2,
        -0.1,
        (startZ + endZ) / 2
    );
    riverbed.rotation.y = angle;
    riverbed.material = getMat("dirt");
    riverbed.parent = parent;
    riverbed.freezeWorldMatrix();
    meshes.push(riverbed);
    
    // Вода
    const water = MeshBuilder.CreateBox("riverWater", {
        width: length,
        height: 0.1,
        depth: width * 0.9
    }, scene);
    water.position = new Vector3(
        (startX + endX) / 2,
        0.05,
        (startZ + endZ) / 2
    );
    water.rotation.y = angle;
    water.material = getMat("water");
    water.parent = parent;
    water.freezeWorldMatrix();
    meshes.push(water);
    
    return meshes;
}

/**
 * Создать озеро
 */
export function createLake(
    params: ObjectCreationParams,
    x: number,
    z: number,
    radius: number
): Mesh {
    const { scene, parent, getMat } = params;
    
    const lake = MeshBuilder.CreateBox("lake", {
        width: radius * 2,
        height: 0.1,
        depth: radius * 2
    }, scene);
    lake.position = new Vector3(x, 0.05, z);
    lake.material = getMat("water");
    lake.parent = parent;
    lake.freezeWorldMatrix();
    
    return lake;
}

/**
 * Создать баррикаду
 */
export function createBarricade(
    params: ObjectCreationParams,
    x: number,
    z: number,
    length: number,
    type: "concrete" | "sandbags" | "vehicles" = "concrete"
): Mesh[] {
    const { scene, parent, getMat, random } = params;
    const meshes: Mesh[] = [];
    
    if (type === "concrete") {
        // Бетонные блоки
        const blockCount = Math.floor(length / 2);
        for (let i = 0; i < blockCount; i++) {
            const block = MeshBuilder.CreateBox("barrier", {
                width: 1.8,
                height: 1.2,
                depth: 0.8
            }, scene);
            block.position = new Vector3(x + i * 2, 0.6, z);
            block.material = getMat("concrete");
            block.parent = parent;
            new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
            block.freezeWorldMatrix();
            meshes.push(block);
        }
    } else if (type === "sandbags") {
        // Мешки с песком
        const rows = random.int(2, 4);
        for (let row = 0; row < rows; row++) {
            const bagsInRow = Math.floor(length / 1.5) - row;
            for (let i = 0; i < bagsInRow; i++) {
                const bag = MeshBuilder.CreateBox("sandbag", {
                    width: 1.2,
                    height: 0.4,
                    depth: 0.5
                }, scene);
                bag.position = new Vector3(
                    x + i * 1.5 + row * 0.3,
                    0.2 + row * 0.35,
                    z
                );
                bag.material = getMat("sand");
                bag.parent = parent;
                bag.freezeWorldMatrix();
                meshes.push(bag);
            }
        }
        
        // Физика для всей стопки
        if (meshes.length > 0) {
            const first = meshes[0];
            if (first) {
                new PhysicsAggregate(first, PhysicsShapeType.BOX, { mass: 0, friction: 0.6 }, scene);
            }
        }
    }
    
    return meshes;
}

/**
 * Создать военную технику (подбитую)
 */
export function createMilitaryVehicle(
    params: ObjectCreationParams,
    x: number,
    z: number,
    type: "tank" | "truck" | "apc" = "tank"
): Mesh[] {
    const { scene, parent, getMat, random } = params;
    const meshes: Mesh[] = [];
    
    if (type === "tank") {
        // Корпус танка
        const hull = MeshBuilder.CreateBox("tankHull", {
            width: 3,
            height: 1,
            depth: 5
        }, scene);
        hull.position = new Vector3(x, 0.5, z);
        hull.rotation.y = random.range(0, Math.PI * 2);
        hull.material = getMat("metalRust");
        hull.parent = parent;
        new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
        hull.freezeWorldMatrix();
        meshes.push(hull);
        
        // Башня
        const turret = MeshBuilder.CreateBox("tankTurret", {
            width: 2,
            height: 0.8,
            depth: 2.5
        }, scene);
        turret.position = new Vector3(x, 1.4, z);
        turret.rotation.y = random.range(0, Math.PI * 2);
        turret.material = getMat("metalRust");
        turret.parent = parent;
        turret.freezeWorldMatrix();
        meshes.push(turret);
    } else if (type === "truck") {
        // Кабина
        const cabin = MeshBuilder.CreateBox("truckCabin", {
            width: 2,
            height: 2,
            depth: 2
        }, scene);
        cabin.position = new Vector3(x, 1, z - 1.5);
        cabin.material = getMat("metalRust");
        cabin.parent = parent;
        new PhysicsAggregate(cabin, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
        cabin.freezeWorldMatrix();
        meshes.push(cabin);
        
        // Кузов
        const bed = MeshBuilder.CreateBox("truckBed", {
            width: 2.2,
            height: 1,
            depth: 4
        }, scene);
        bed.position = new Vector3(x, 0.5, z + 1.5);
        bed.material = getMat("metalRust");
        bed.parent = parent;
        bed.freezeWorldMatrix();
        meshes.push(bed);
    }
    
    return meshes;
}

/**
 * Создать сторожевую вышку
 */
export function createWatchtower(
    params: ObjectCreationParams,
    x: number,
    z: number,
    height: number = 8
): Mesh[] {
    const { scene, parent, getMat } = params;
    const meshes: Mesh[] = [];
    
    // Ноги вышки (4 штуки)
    const legPositions = [
        { x: -1, z: -1 },
        { x: 1, z: -1 },
        { x: -1, z: 1 },
        { x: 1, z: 1 }
    ];
    
    for (const pos of legPositions) {
        const leg = MeshBuilder.CreateBox("towerLeg", {
            width: 0.3,
            height: height,
            depth: 0.3
        }, scene);
        leg.position = new Vector3(x + pos.x, height / 2, z + pos.z);
        leg.material = getMat("wood");
        leg.parent = parent;
        leg.freezeWorldMatrix();
        meshes.push(leg);
    }
    
    // Платформа
    const platform = MeshBuilder.CreateBox("towerPlatform", {
        width: 3,
        height: 0.2,
        depth: 3
    }, scene);
    platform.position = new Vector3(x, height - 0.5, z);
    platform.material = getMat("wood");
    platform.parent = parent;
    new PhysicsAggregate(platform, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
    platform.freezeWorldMatrix();
    meshes.push(platform);
    
    // Ограждение
    const railHeight = 1;
    const rails = [
        { x: 0, z: 1.4, w: 3, d: 0.1 },
        { x: 0, z: -1.4, w: 3, d: 0.1 },
        { x: 1.4, z: 0, w: 0.1, d: 3 },
        { x: -1.4, z: 0, w: 0.1, d: 3 }
    ];
    
    for (const rail of rails) {
        const railMesh = MeshBuilder.CreateBox("towerRail", {
            width: rail.w,
            height: railHeight,
            depth: rail.d
        }, scene);
        railMesh.position = new Vector3(x + rail.x, height + railHeight / 2, z + rail.z);
        railMesh.material = getMat("wood");
        railMesh.parent = parent;
        railMesh.freezeWorldMatrix();
        meshes.push(railMesh);
    }
    
    return meshes;
}

/**
 * Создать дерево
 */
export function createTree(
    params: ObjectCreationParams,
    x: number,
    z: number,
    height: number = 6,
    type: "pine" | "oak" | "dead" = "oak"
): Mesh[] {
    const { scene, parent, getMat, random } = params;
    const meshes: Mesh[] = [];
    
    // Ствол (box вместо cylinder)
    const trunk = MeshBuilder.CreateBox("treeTrunk", {
        width: 0.4,
        height: height * 0.4,
        depth: 0.4
    }, scene);
    trunk.position = new Vector3(x, height * 0.2, z);
    trunk.material = getMat("wood");
    trunk.parent = parent;
    new PhysicsAggregate(trunk, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
    trunk.freezeWorldMatrix();
    meshes.push(trunk);
    
    if (type !== "dead") {
        // Крона
        const crownHeight = height * 0.7;
        if (type === "pine") {
            // Крона сосны (box вместо cylinder)
            const crownD = height * 0.5;
            const crown = MeshBuilder.CreateBox("treeCrown", {
                width: crownD,
                height: crownHeight,
                depth: crownD
            }, scene);
            crown.position = new Vector3(x, height * 0.4 + crownHeight / 2, z);
            crown.material = getMat("leaves");
            crown.parent = parent;
            crown.freezeWorldMatrix();
            meshes.push(crown);
        } else {
            // Крона дуба (box вместо sphere)
            const crownD = height * 0.6;
            const crown = MeshBuilder.CreateBox("treeCrown", {
                width: crownD,
                height: crownD,
                depth: crownD
            }, scene);
            crown.position = new Vector3(x, height * 0.6, z);
            crown.material = getMat("leaves");
            crown.parent = parent;
            crown.freezeWorldMatrix();
            meshes.push(crown);
        }
    }
    
    return meshes;
}

/**
 * Создать забор/ограждение
 */
export function createFence(
    params: ObjectCreationParams,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    height: number = 2,
    type: "wood" | "chain" | "concrete" = "wood"
): Mesh[] {
    const { scene, parent, getMat } = params;
    const meshes: Mesh[] = [];
    
    const dx = endX - startX;
    const dz = endZ - startZ;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    
    // Основная панель забора
    const fence = MeshBuilder.CreateBox("fence", {
        width: length,
        height: height,
        depth: 0.1
    }, scene);
    fence.position = new Vector3(
        (startX + endX) / 2,
        height / 2,
        (startZ + endZ) / 2
    );
    fence.rotation.y = angle;
    
    const matName = type === "wood" ? "wood" : type === "chain" ? "metal" : "concrete";
    fence.material = getMat(matName);
    fence.parent = parent;
    new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
    fence.freezeWorldMatrix();
    meshes.push(fence);
    
    // Столбы
    const postCount = Math.max(2, Math.floor(length / 3));
    for (let i = 0; i <= postCount; i++) {
        const t = i / postCount;
        const px = startX + dx * t;
        const pz = startZ + dz * t;
        
        const post = MeshBuilder.CreateBox("fencePost", {
            width: 0.15,
            height: height + 0.3,
            depth: 0.15
        }, scene);
        post.position = new Vector3(px, (height + 0.3) / 2, pz);
        post.material = getMat(matName);
        post.parent = parent;
        post.freezeWorldMatrix();
        meshes.push(post);
    }
    
    return meshes;
}

export default {
    createCrater,
    createRuinedBuilding,
    createMountain,
    createRiver,
    createLake,
    createBarricade,
    createMilitaryVehicle,
    createWatchtower,
    createTree,
    createFence
};

