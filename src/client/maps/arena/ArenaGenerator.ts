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

        // Генерируем элементы
        this.generateCenterPlatform(context);
        this.generateSidePlatforms(context);
        this.generateBridges(context);
        this.generateRamps(context);
        this.generateTacticalCover(context);
        this.generateElevatedPositions(context);
        this.generatePerimeter(context);
    }

    /**
     * Центральная платформа
     */
    private generateCenterPlatform(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
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
     * Боковые платформы (симметричные)
     */
    private generateSidePlatforms(context: ChunkGenerationContext): void {
        const offset = this.config.arenaSize / 2 - 30;
        
        // 4 угловые платформы
        this.generatePlatform(context, offset, offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_ne");
        this.generatePlatform(context, -offset, offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_nw");
        this.generatePlatform(context, -offset, -offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_sw");
        this.generatePlatform(context, offset, -offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_se");

        // 4 боковые платформы (север, юг, восток, запад)
        this.generatePlatform(context, 0, offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_n");
        this.generatePlatform(context, 0, -offset, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_s");
        this.generatePlatform(context, offset, 0, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_e");
        this.generatePlatform(context, -offset, 0, this.config.sidePlatformSize, this.config.sidePlatformHeight, "platform_w");
    }

    /**
     * Создание одной платформы
     */
    private generatePlatform(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        size: number,
        height: number,
        name: string
    ): void {
        const { chunkParent } = context;
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

        // Мосты от центра к боковым платформам (север, юг, восток, запад)
        // Север: от края центральной платформы к краю северной боковой
        this.createBridge(context, 0, centerHalf, this.config.centerPlatformHeight, 0, offset - sideHalf, this.config.sidePlatformHeight, bridgeWidth, "bridge_center_n");
        
        // Юг: от края центральной платформы к краю южной боковой
        this.createBridge(context, 0, -centerHalf, this.config.centerPlatformHeight, 0, -offset + sideHalf, this.config.sidePlatformHeight, bridgeWidth, "bridge_center_s");
        
        // Восток: от края центральной платформы к краю восточной боковой
        this.createBridge(context, centerHalf, 0, this.config.centerPlatformHeight, offset - sideHalf, 0, this.config.sidePlatformHeight, bridgeWidth, "bridge_center_e");
        
        // Запад: от края центральной платформы к краю западной боковой
        this.createBridge(context, -centerHalf, 0, this.config.centerPlatformHeight, -offset + sideHalf, 0, this.config.sidePlatformHeight, bridgeWidth, "bridge_center_w");

        // Мосты между боковыми платформами (север-юг и восток-запад)
        // Север: от северо-восточной к северо-западной
        this.createBridge(context, offset - sideHalf, offset, this.config.sidePlatformHeight, -offset + sideHalf, offset, this.config.sidePlatformHeight, bridgeWidth, "bridge_n");
        
        // Юг: от юго-восточной к юго-западной
        this.createBridge(context, offset - sideHalf, -offset, this.config.sidePlatformHeight, -offset + sideHalf, -offset, this.config.sidePlatformHeight, bridgeWidth, "bridge_s");
        
        // Восток: от северо-восточной к юго-восточной
        this.createBridge(context, offset, offset - sideHalf, this.config.sidePlatformHeight, offset, -offset + sideHalf, this.config.sidePlatformHeight, bridgeWidth, "bridge_e");
        
        // Запад: от северо-западной к юго-западной
        this.createBridge(context, -offset, offset - sideHalf, this.config.sidePlatformHeight, -offset, -offset + sideHalf, this.config.sidePlatformHeight, bridgeWidth, "bridge_w");
    }

    /**
     * Создание моста
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
        const { chunkParent } = context;
        
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const totalDistance = Math.sqrt(dx * dx + dz * dz);
        const pitchAngle = Math.atan2(dy, totalDistance);
        
        const bridge = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, chunkParent.getScene());
        
        bridge.position.x = (x1 + x2) / 2;
        bridge.position.y = (y1 + y2) / 2;
        bridge.position.z = (z1 + z2) / 2;
        
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

        // Рампы от земли к боковым платформам (север, юг, восток, запад)
        this.createRamp(context, 0, offset + 12, 0, 0, offset - sideHalf, this.config.sidePlatformHeight, rampWidth, rampDepth, "ramp_n");
        this.createRamp(context, 0, -offset - 12, 0, 0, -offset + sideHalf, this.config.sidePlatformHeight, rampWidth, rampDepth, "ramp_s");
        this.createRamp(context, offset + 12, 0, 0, offset - sideHalf, 0, this.config.sidePlatformHeight, rampWidth, rampDepth, "ramp_e");
        this.createRamp(context, -offset - 12, 0, 0, -offset + sideHalf, 0, this.config.sidePlatformHeight, rampWidth, rampDepth, "ramp_w");

        // Диагональные рампы к угловым платформам
        this.createRamp(context, offset + 10, offset + 10, 0, offset - sideHalf * 0.7, offset - sideHalf * 0.7, this.config.sidePlatformHeight, rampWidth * 0.9, rampDepth, "ramp_ne");
        this.createRamp(context, -offset - 10, offset + 10, 0, -offset + sideHalf * 0.7, offset - sideHalf * 0.7, this.config.sidePlatformHeight, rampWidth * 0.9, rampDepth, "ramp_nw");
        this.createRamp(context, -offset - 10, -offset - 10, 0, -offset + sideHalf * 0.7, -offset + sideHalf * 0.7, this.config.sidePlatformHeight, rampWidth * 0.9, rampDepth, "ramp_sw");
        this.createRamp(context, offset + 10, -offset - 10, 0, offset - sideHalf * 0.7, -offset + sideHalf * 0.7, this.config.sidePlatformHeight, rampWidth * 0.9, rampDepth, "ramp_se");

        // Рампы от земли к центральной платформе (4 стороны)
        this.createRamp(context, centerHalf + 8, 0, 0, centerHalf, 0, this.config.centerPlatformHeight, rampWidth, rampDepth, "ramp_center_e");
        this.createRamp(context, -centerHalf - 8, 0, 0, -centerHalf, 0, this.config.centerPlatformHeight, rampWidth, rampDepth, "ramp_center_w");
        this.createRamp(context, 0, centerHalf + 8, 0, 0, centerHalf, this.config.centerPlatformHeight, rampWidth, rampDepth, "ramp_center_n");
        this.createRamp(context, 0, -centerHalf - 8, 0, 0, -centerHalf, this.config.centerPlatformHeight, rampWidth, rampDepth, "ramp_center_s");

        // Диагональные рампы к центральной платформе
        this.createRamp(context, centerHalf + 6, centerHalf + 6, 0, centerHalf * 0.7, centerHalf * 0.7, this.config.centerPlatformHeight, rampWidth * 0.8, rampDepth, "ramp_center_ne");
        this.createRamp(context, -centerHalf - 6, centerHalf + 6, 0, -centerHalf * 0.7, centerHalf * 0.7, this.config.centerPlatformHeight, rampWidth * 0.8, rampDepth, "ramp_center_nw");
        this.createRamp(context, -centerHalf - 6, -centerHalf - 6, 0, -centerHalf * 0.7, -centerHalf * 0.7, this.config.centerPlatformHeight, rampWidth * 0.8, rampDepth, "ramp_center_sw");
        this.createRamp(context, centerHalf + 6, -centerHalf - 6, 0, centerHalf * 0.7, -centerHalf * 0.7, this.config.centerPlatformHeight, rampWidth * 0.8, rampDepth, "ramp_center_se");
    }

    /**
     * Создание лестницы с площадками для разворота (как в подъезде)
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
        const { chunkParent } = context;
        
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const totalDistance = Math.sqrt(dx * dx + dz * dz);
        const directionAngle = Math.atan2(dx, dz);
        
        // Параметры лестницы
        const stepHeight = 0.25; // Высота одной ступени
        const stepDepth = 0.4; // Глубина одной ступени
        const platformSize = width + 1.0; // Размер площадки для разворота (квадратная)
        const stepsPerFlight = 6; // Ступеней на один марш (до площадки)
        const numSteps = Math.ceil(dy / stepHeight); // Общее количество ступеней
        const numFlights = Math.ceil(numSteps / stepsPerFlight); // Количество маршей
        
        let currentX = x1;
        let currentZ = z1;
        let currentY = y1;
        let currentDirection = directionAngle; // Направление текущего марша
        
        // Создаем марши с площадками для разворота
        for (let flight = 0; flight < numFlights; flight++) {
            const stepsInThisFlight = Math.min(stepsPerFlight, Math.ceil((y2 - currentY) / stepHeight));
            const flightHeight = stepsInThisFlight * stepHeight;
            const flightLength = stepsInThisFlight * stepDepth;
            
            // Создаем ступени текущего марша
            for (let step = 0; step < stepsInThisFlight; step++) {
                const stepY = currentY + step * stepHeight;
                const stepProgress = step / stepsInThisFlight;
                const stepX = currentX + Math.sin(currentDirection) * (flightLength * stepProgress);
                const stepZ = currentZ + Math.cos(currentDirection) * (flightLength * stepProgress);
                
                const stepMesh = MeshBuilder.CreateBox(`${name}_step_${flight}_${step}`, {
                    width: width,
                    height: stepHeight,
                    depth: stepDepth
                }, chunkParent.getScene());
                
                stepMesh.position.x = stepX;
                stepMesh.position.y = stepY + stepHeight / 2;
                stepMesh.position.z = stepZ;
                stepMesh.rotation.y = currentDirection;
                
                const material = new StandardMaterial(`${name}_step_mat`, chunkParent.getScene());
                material.diffuseColor = new Color3(0.65, 0.65, 0.7);
                material.specularColor = new Color3(0.25, 0.25, 0.25);
                stepMesh.material = material;
                
                const physicsAggregate = new PhysicsAggregate(
                    stepMesh,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
            
            // Обновляем позицию после марша
            currentY += flightHeight;
            currentX += Math.sin(currentDirection) * flightLength;
            currentZ += Math.cos(currentDirection) * flightLength;
            
            // Создаем площадку для разворота (кроме последнего марша)
            if (flight < numFlights - 1 && currentY < y2) {
                const platformMesh = MeshBuilder.CreateBox(`${name}_platform_${flight}`, {
                    width: platformSize,
                    height: 0.2,
                    depth: platformSize
                }, chunkParent.getScene());
                
                platformMesh.position.x = currentX;
                platformMesh.position.y = currentY;
                platformMesh.position.z = currentZ;
                platformMesh.rotation.y = currentDirection;
                
                const platformMaterial = new StandardMaterial(`${name}_platform_mat`, chunkParent.getScene());
                platformMaterial.diffuseColor = new Color3(0.7, 0.7, 0.75);
                platformMaterial.specularColor = new Color3(0.3, 0.3, 0.3);
                platformMesh.material = platformMaterial;
                
                const physicsAggregate = new PhysicsAggregate(
                    platformMesh,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
                
                // Поворачиваем направление на 180 градусов для следующего марша (разворот)
                currentDirection += Math.PI;
                
                // Смещаемся немного вперед от площадки для начала следующего марша
                currentX += Math.sin(currentDirection) * (platformSize / 2);
                currentZ += Math.cos(currentDirection) * (platformSize / 2);
            }
        }
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

    /**
     * Высокие тактические позиции
     */
    private generateElevatedPositions(context: ChunkGenerationContext): void {
        const offset = this.config.arenaSize / 2 - 30;
        const highPlatformHeight = 9.0;
        const highPlatformSize = 12;

        // Высокие платформы для снайперских позиций
        this.generatePlatform(context, offset * 0.7, offset * 0.7, highPlatformSize, highPlatformHeight, "high_platform_1");
        this.generatePlatform(context, -offset * 0.7, offset * 0.7, highPlatformSize, highPlatformHeight, "high_platform_2");
        this.generatePlatform(context, -offset * 0.7, -offset * 0.7, highPlatformSize, highPlatformHeight, "high_platform_3");
        this.generatePlatform(context, offset * 0.7, -offset * 0.7, highPlatformSize, highPlatformHeight, "high_platform_4");

        // Рампы на высокие платформы
        const rampWidth = 8;
        const rampDepth = 6;
        this.createRamp(context, offset * 0.5, offset * 0.7, this.config.sidePlatformHeight, offset * 0.7, offset * 0.7, highPlatformHeight, rampWidth, rampDepth, "ramp_high_1");
        this.createRamp(context, -offset * 0.5, offset * 0.7, this.config.sidePlatformHeight, -offset * 0.7, offset * 0.7, highPlatformHeight, rampWidth, rampDepth, "ramp_high_2");
        this.createRamp(context, -offset * 0.5, -offset * 0.7, this.config.sidePlatformHeight, -offset * 0.7, -offset * 0.7, highPlatformHeight, rampWidth, rampDepth, "ramp_high_3");
        this.createRamp(context, offset * 0.5, -offset * 0.7, this.config.sidePlatformHeight, offset * 0.7, -offset * 0.7, highPlatformHeight, rampWidth, rampDepth, "ramp_high_4");
    }

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
     * Периметр карты
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = 6;
        const wallThickness = 2;

        const northWall = MeshBuilder.CreateBox("perimeter_wall_north", {
            width: this.config.arenaSize,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        northWall.position.x = 0;
        northWall.position.y = wallHeight / 2;
        northWall.position.z = arenaHalf;

        const southWall = MeshBuilder.CreateBox("perimeter_wall_south", {
            width: this.config.arenaSize,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        southWall.position.x = 0;
        southWall.position.y = wallHeight / 2;
        southWall.position.z = -arenaHalf;

        const eastWall = MeshBuilder.CreateBox("perimeter_wall_east", {
            width: wallThickness,
            height: wallHeight,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        eastWall.position.x = arenaHalf;
        eastWall.position.y = wallHeight / 2;
        eastWall.position.z = 0;

        const westWall = MeshBuilder.CreateBox("perimeter_wall_west", {
            width: wallThickness,
            height: wallHeight,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        westWall.position.x = -arenaHalf;
        westWall.position.y = wallHeight / 2;
        westWall.position.z = 0;

        const wallMaterial = new StandardMaterial("perimeter_wall_material", chunkParent.getScene());
        wallMaterial.diffuseColor = new Color3(0.3, 0.5, 0.7);
        wallMaterial.specularColor = new Color3(0.2, 0.3, 0.4);
        wallMaterial.emissiveColor = new Color3(0.05, 0.1, 0.15);
        northWall.material = wallMaterial;
        southWall.material = wallMaterial;
        eastWall.material = wallMaterial;
        westWall.material = wallMaterial;

        [northWall, southWall, eastWall, westWall].forEach(wall => {
            const physicsAggregate = new PhysicsAggregate(
                wall,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
}

