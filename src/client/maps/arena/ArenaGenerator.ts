import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { MAP_SIZES } from "../MapConstants";

export interface ArenaConfig {
    arenaSize: number;
    centerPlatformSize: number;
    centerPlatformHeight: number;
    sidePlatformSize: number;
    sidePlatformHeight: number;
    bridgeWidth: number;
}

export const DEFAULT_ARENA_CONFIG: ArenaConfig = {
    arenaSize: MAP_SIZES.arena?.size ?? 160,
    centerPlatformSize: 30,
    centerPlatformHeight: 4.0,
    sidePlatformSize: 20,
    sidePlatformHeight: 6.0,
    bridgeWidth: 8
};

export class ArenaGenerator extends BaseMapGenerator {
    readonly mapType = "arena";
    readonly displayName = "Арена";
    readonly description = "Киберспортивная арена с симметричной структурой";
    private config: ArenaConfig;

    constructor(config: Partial<ArenaConfig> = {}) {
        super();
        this.config = { ...DEFAULT_ARENA_CONFIG, ...config };
    }

    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size } = context;
        const arenaHalf = this.config.arenaSize / 2;
        
        const mapMinX = -arenaHalf;
        const mapMaxX = arenaHalf;
        const mapMinZ = -arenaHalf;
        const mapMaxZ = arenaHalf;

        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        if (chunkMaxX < mapMinX || chunkMinX > mapMaxX ||
            chunkMaxZ < mapMinZ || chunkMinZ > mapMaxZ) {
            return;
        }

        // Генерируем элементы (упрощено)
        this.generateCenterPlatform(context);
        // Упрощено: только 2 боковые платформы вместо 8
        this.generateSidePlatforms(context);
        this.generateBridges(context);
        this.generateRamps(context);
        // Убрано: generateTacticalCover для упрощения
        // Убрано: generateElevatedPositions для упрощения (большие крыши)
        this.generatePerimeter(context);
    }

    /**
     * Центральная платформа
     */
    private generateCenterPlatform(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const platformHalf = this.config.centerPlatformSize / 2;
        
        // Проверяем, пересекается ли платформа с чанком
        const platformMinX = -platformHalf;
        const platformMaxX = platformHalf;
        const platformMinZ = -platformHalf;
        const platformMaxZ = platformHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        if (chunkMaxX < platformMinX || chunkMinX > platformMaxX ||
            chunkMaxZ < platformMinZ || chunkMinZ > platformMaxZ) {
            return; // Платформа не попадает в этот чанк
        }
        
        const platform = MeshBuilder.CreateBox("center_platform", {
            width: this.config.centerPlatformSize,
            height: 0.5,
            depth: this.config.centerPlatformSize
        }, chunkParent.getScene());
        
        platform.position.x = 0;
        platform.position.y = this.config.centerPlatformHeight;
        platform.position.z = 0;

        const material = new StandardMaterial("center_platform_mat", chunkParent.getScene());
        material.diffuseColor = new Color3(0.7, 0.7, 0.75);
        material.specularColor = new Color3(0.3, 0.3, 0.3);
        platform.material = material;

        const physicsAggregate = new PhysicsAggregate(
            platform,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }

    /**
     * Боковые платформы (упрощено: только 2)
     */
    private generateSidePlatforms(context: ChunkGenerationContext): void {
        const offset = this.config.arenaSize / 2 - 30;
        
        // Упрощено: только 2 угловые платформы
        this.generatePlatform(context, offset, offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_ne");
        this.generatePlatform(context, -offset, -offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_sw");
    }

    /**
     * Создание одной платформы (с проверкой попадания в чанк)
     */
    private generatePlatform(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        size: number,
        height: number,
        name: string
    ): void {
        const { worldX, worldZ, size: chunkSize, chunkParent } = context;
        const platformHalf = size / 2;
        
        // Проверяем, пересекается ли платформа с чанком
        const platformMinX = x - platformHalf;
        const platformMaxX = x + platformHalf;
        const platformMinZ = z - platformHalf;
        const platformMaxZ = z + platformHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + chunkSize;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + chunkSize;
        
        if (chunkMaxX < platformMinX || chunkMinX > platformMaxX ||
            chunkMaxZ < platformMinZ || chunkMinZ > platformMaxZ) {
            return; // Платформа не попадает в этот чанк
        }
        
        const platform = MeshBuilder.CreateBox(name, {
            width: size,
            height: 0.5,
            depth: size
        }, chunkParent.getScene());
        
        platform.position.x = x;
        platform.position.y = height;
        platform.position.z = z;

        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.65, 0.65, 0.7);
        material.specularColor = new Color3(0.25, 0.25, 0.25);
        platform.material = material;

        const physicsAggregate = new PhysicsAggregate(
            platform,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }

    /**
     * Мосты между платформами (ИСПРАВЛЕНО: точное соединение с краями платформ)
     */
    private generateBridges(context: ChunkGenerationContext): void {
        const offset = this.config.arenaSize / 2 - 30; // 50
        const centerHalf = this.config.centerPlatformSize / 2; // 15
        const sideHalf = this.config.sidePlatformSize / 2; // 10
        const bridgeWidth = this.config.bridgeWidth;

        // Упрощено: только 2 моста от центра к угловым платформам
        this.createBridge(context, centerHalf, centerHalf, this.config.centerPlatformHeight, offset - sideHalf, offset - sideHalf, this.config.sidePlatformHeight, bridgeWidth, "bridge_center_ne");
        this.createBridge(context, -centerHalf, -centerHalf, this.config.centerPlatformHeight, -offset + sideHalf, -offset + sideHalf, this.config.sidePlatformHeight, bridgeWidth, "bridge_center_sw");
    }

    /**
     * Создание моста (с проверкой попадания в чанк)
     */
    private createBridge(
        context: ChunkGenerationContext,
        x1: number,
        z1: number,
        y1: number,
        x2: number,
        z2: number,
        y2: number,
        width: number,
        name: string
    ): void {
        const { worldX, worldZ, size, chunkParent } = context;
        
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const totalDistance = Math.sqrt(dx * dx + dz * dz);
        const pitchAngle = Math.atan2(dy, totalDistance);
        
        const bridgeX = (x1 + x2) / 2;
        const bridgeZ = (z1 + z2) / 2;
        const bridgeY = (y1 + y2) / 2;
        
        // Проверяем, попадает ли мост в чанк
        const bridgeHalf = Math.max(width, totalDistance) / 2;
        const bridgeMinX = bridgeX - bridgeHalf;
        const bridgeMaxX = bridgeX + bridgeHalf;
        const bridgeMinZ = bridgeZ - bridgeHalf;
        const bridgeMaxZ = bridgeZ + bridgeHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        if (chunkMaxX < bridgeMinX || chunkMinX > bridgeMaxX ||
            chunkMaxZ < bridgeMinZ || chunkMinZ > bridgeMaxZ) {
            return; // Мост не попадает в этот чанк
        }
        
        const bridge = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, chunkParent.getScene());
        
        bridge.position.x = bridgeX;
        bridge.position.y = bridgeY;
        bridge.position.z = bridgeZ;
        
        const yawAngle = Math.atan2(dx, dz);
        bridge.rotation.y = yawAngle;
        bridge.rotation.x = pitchAngle;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.6, 0.6, 0.65);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        bridge.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            bridge,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }

    /**
     * Рампы для доступа (ИЗМЕНЕНО: более разнообразные рампы)
     */
    private generateRamps(context: ChunkGenerationContext): void {
        const offset = this.config.arenaSize / 2 - 30;
        const sideHalf = this.config.sidePlatformSize / 2;
        const centerHalf = this.config.centerPlatformSize / 2;
        const rampWidth = 10;
        const rampDepth = 10; // Увеличена глубина для более пологого подъема

        // Рампы к угловым платформам: начинаются дальше от платформы, заканчиваются ВНУТРИ платформы
        this.createRamp(context, offset + 15, offset + 15, 0, offset - sideHalf * 0.3, offset - sideHalf * 0.3, this.config.sidePlatformHeight, rampWidth * 0.9, rampDepth, "ramp_ne");
        this.createRamp(context, -offset - 15, -offset - 15, 0, -offset + sideHalf * 0.3, -offset + sideHalf * 0.3, this.config.sidePlatformHeight, rampWidth * 0.9, rampDepth, "ramp_sw");

        // Рампы к центральной платформе: начинаются дальше, заканчиваются ВНУТРИ платформы
        this.createRamp(context, centerHalf + 12, 0, 0, centerHalf * 0.5, 0, this.config.centerPlatformHeight, rampWidth, rampDepth, "ramp_center_e");
        this.createRamp(context, 0, centerHalf + 12, 0, 0, centerHalf * 0.5, this.config.centerPlatformHeight, rampWidth, rampDepth, "ramp_center_n");
    }

    /**
     * Создание простой наклонной рампы (с проверкой попадания в чанк)
     */
    private createRamp(
        context: ChunkGenerationContext,
        x1: number,
        z1: number,
        y1: number,
        x2: number,
        z2: number,
        y2: number,
        width: number,
        depth: number,
        name: string
    ): void {
        const { worldX, worldZ, size, chunkParent } = context;
        
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const totalDistance = Math.sqrt(dx * dx + dz * dz);
        const pitchAngle = Math.atan2(dy, totalDistance);
        
        const rampX = (x1 + x2) / 2;
        const rampZ = (z1 + z2) / 2;
        const rampY = (y1 + y2) / 2;
        
        // Проверяем, попадает ли рампа в чанк
        const rampHalf = Math.max(width, totalDistance) / 2;
        const rampMinX = rampX - rampHalf;
        const rampMaxX = rampX + rampHalf;
        const rampMinZ = rampZ - rampHalf;
        const rampMaxZ = rampZ + rampHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        if (chunkMaxX < rampMinX || chunkMinX > rampMaxX ||
            chunkMaxZ < rampMinZ || chunkMinZ > rampMaxZ) {
            return; // Рампа не попадает в этот чанк
        }
        
        const ramp = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, chunkParent.getScene());
        
        ramp.position.x = rampX;
        ramp.position.y = rampY;
        ramp.position.z = rampZ;
        
        const yawAngle = Math.atan2(dx, dz);
        ramp.rotation.y = yawAngle;
        ramp.rotation.x = pitchAngle;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.65, 0.65, 0.7);
        material.specularColor = new Color3(0.25, 0.25, 0.25);
        ramp.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            ramp,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }

    /**
     * Тактические укрытия
     */
    private generateTacticalCover(context: ChunkGenerationContext): void {
        const offset = this.config.arenaSize / 2 - 30;
        
        // Контейнеры на платформах
        this.createContainer(context, offset * 0.5, offset * 0.5, this.config.sidePlatformHeight + 0.25, 4, 4, 3, "cover_1");
        this.createContainer(context, -offset * 0.5, offset * 0.5, this.config.sidePlatformHeight + 0.25, 4, 4, 3, "cover_2");
        this.createContainer(context, -offset * 0.5, -offset * 0.5, this.config.sidePlatformHeight + 0.25, 4, 4, 3, "cover_3");
        this.createContainer(context, offset * 0.5, -offset * 0.5, this.config.sidePlatformHeight + 0.25, 4, 4, 3, "cover_4");

        // Укрытия на центральной платформе
        this.createContainer(context, 8, 0, this.config.centerPlatformHeight + 0.25, 3, 3, 2.5, "cover_center_1");
        this.createContainer(context, -8, 0, this.config.centerPlatformHeight + 0.25, 3, 3, 2.5, "cover_center_2");
        this.createContainer(context, 0, 8, this.config.centerPlatformHeight + 0.25, 3, 3, 2.5, "cover_center_3");
        this.createContainer(context, 0, -8, this.config.centerPlatformHeight + 0.25, 3, 3, 2.5, "cover_center_4");

        // Низкие стены-укрытия на земле
        this.createCoverWall(context, offset * 0.3, 0, 0.5, 12, 2, 0.5, "wall_cover_1");
        this.createCoverWall(context, -offset * 0.3, 0, 0.5, 12, 2, 0.5, "wall_cover_2");
        this.createCoverWall(context, 0, offset * 0.3, 0.5, 0.5, 2, 12, "wall_cover_3");
        this.createCoverWall(context, 0, -offset * 0.3, 0.5, 0.5, 2, 12, "wall_cover_4");
    }

    // Метод generateElevatedPositions убран для упрощения (большие крыши)

    /**
     * Создание контейнера
     */
    private createContainer(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        width: number,
        depth: number,
        height: number,
        name: string
    ): void {
        const { chunkParent } = context;
        const container = MeshBuilder.CreateBox(name, {
            width: width,
            height: height,
            depth: depth
        }, chunkParent.getScene());
        
        container.position.x = x;
        container.position.y = y;
        container.position.z = z;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.4, 0.4, 0.45);
        material.specularColor = new Color3(0.1, 0.1, 0.1);
        container.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            container,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }

    /**
     * Создание стены-укрытия
     */
    private createCoverWall(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        width: number,
        height: number,
        depth: number,
        name: string
    ): void {
        const { chunkParent } = context;
        const wall = MeshBuilder.CreateBox(name, {
            width: width,
            height: height,
            depth: depth
        }, chunkParent.getScene());
        
        wall.position.x = x;
        wall.position.y = y;
        wall.position.z = z;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.5, 0.5, 0.55);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        wall.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            wall,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }

    /**
     * Периметр карты (создается только частично в каждом чанке)
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = 6;
        const wallThickness = 2;

        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;

        // Северная стена - создаем только часть, попадающую в чанк
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2;
                const northWall = MeshBuilder.CreateBox("perimeter_wall_north", {
                    width: wallLength,
                    height: wallHeight,
                    depth: wallThickness
                }, chunkParent.getScene());
                northWall.position.x = wallX;
                northWall.position.y = wallHeight / 2;
                northWall.position.z = arenaHalf;

                const wallMaterial = new StandardMaterial("perimeter_wall_material", chunkParent.getScene());
                wallMaterial.diffuseColor = new Color3(0.3, 0.5, 0.7);
                wallMaterial.specularColor = new Color3(0.2, 0.3, 0.4);
                wallMaterial.emissiveColor = new Color3(0.05, 0.1, 0.15);
                northWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    northWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }

        // Южная стена
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2;
                const southWall = MeshBuilder.CreateBox("perimeter_wall_south", {
                    width: wallLength,
                    height: wallHeight,
                    depth: wallThickness
                }, chunkParent.getScene());
                southWall.position.x = wallX;
                southWall.position.y = wallHeight / 2;
                southWall.position.z = -arenaHalf;

                const wallMaterial = new StandardMaterial("perimeter_wall_material", chunkParent.getScene());
                wallMaterial.diffuseColor = new Color3(0.3, 0.5, 0.7);
                wallMaterial.specularColor = new Color3(0.2, 0.3, 0.4);
                wallMaterial.emissiveColor = new Color3(0.05, 0.1, 0.15);
                southWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    southWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }

        // Восточная стена
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2;
                const eastWall = MeshBuilder.CreateBox("perimeter_wall_east", {
                    width: wallThickness,
                    height: wallHeight,
                    depth: wallLength
                }, chunkParent.getScene());
                eastWall.position.x = arenaHalf;
                eastWall.position.y = wallHeight / 2;
                eastWall.position.z = wallZ;

                const wallMaterial = new StandardMaterial("perimeter_wall_material", chunkParent.getScene());
                wallMaterial.diffuseColor = new Color3(0.3, 0.5, 0.7);
                wallMaterial.specularColor = new Color3(0.2, 0.3, 0.4);
                wallMaterial.emissiveColor = new Color3(0.05, 0.1, 0.15);
                eastWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    eastWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }

        // Западная стена
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2;
                const westWall = MeshBuilder.CreateBox("perimeter_wall_west", {
                    width: wallThickness,
                    height: wallHeight,
                    depth: wallLength
                }, chunkParent.getScene());
                westWall.position.x = -arenaHalf;
                westWall.position.y = wallHeight / 2;
                westWall.position.z = wallZ;

                const wallMaterial = new StandardMaterial("perimeter_wall_material", chunkParent.getScene());
                wallMaterial.diffuseColor = new Color3(0.3, 0.5, 0.7);
                wallMaterial.specularColor = new Color3(0.2, 0.3, 0.4);
                wallMaterial.emissiveColor = new Color3(0.05, 0.1, 0.15);
                westWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    westWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }
    }
}

