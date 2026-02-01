/**
 * @module maps/madness/MadnessGenerator
 * @description Генератор карты "Безумие" - многоуровневая арена с мостиками, рампами и переходами
 * 
 * Безумная карта с:
 * - Множественными уровнями (3-4 уровня)
 * - Мостиками между платформами
 * - Кучей рамп и переходов
 * - Вертикальными ходами
 * - Хаотичным, но функциональным дизайном
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { MAP_SIZES } from "../MapConstants";

/**
 * Конфигурация карты Безумие
 */
export interface MadnessConfig {
    /** Размер арены в единицах */
    arenaSize: number;
    /** Высота первого уровня */
    level1Height: number;
    /** Высота второго уровня */
    level2Height: number;
    /** Высота третьего уровня */
    level3Height: number;
    /** Высота четвёртого уровня */
    level4Height: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_MADNESS_CONFIG: MadnessConfig = {
    arenaSize: MAP_SIZES.madness?.size ?? 150,
    level1Height: 3.5,
    level2Height: 7.0,
    level3Height: 10.5,
    level4Height: 14.0
};

/**
 * Генератор карты "Безумие"
 * 
 * Многоуровневая арена с множеством платформ, мостиков, рамп и переходов
 */
export class MadnessGenerator extends BaseMapGenerator {
    readonly mapType = "madness";
    readonly displayName = "Безумие";
    readonly description = "Многоуровневая арена с мостиками, рампами и переходами";

    /** Конфигурация генератора */
    private config: MadnessConfig;

    constructor(config: Partial<MadnessConfig> = {}) {
        super();
        this.config = { ...DEFAULT_MADNESS_CONFIG, ...config };
    }

    /**
     * Основной метод генерации контента чанка
     */
    generateContent(context: ChunkGenerationContext): void {
        // Генерируем множественные уровни платформ
        this.generateMultipleLevels(context);

        // Генерируем мостики между платформами
        this.generateBridges(context);

        // Генерируем множество рамп
        this.generateManyRamps(context);

        // Генерируем вертикальные переходы
        this.generateVerticalPassages(context);

        // Генерируем контейнеры и укрытия
        this.generateContainers(context);

        // Генерируем стены периметра
        this.generatePerimeter(context);

        // ОПТИМИЗАЦИЯ: Объединяем все собранные меши в один
        this.mergePendingMeshes(context.chunkParent);
    }

    /**
     * Генерация множественных уровней платформ
     */
    private generateMultipleLevels(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;

        // Уровень 1: Центральная платформа (как в оригинале)
        this.generatePlatform(context, 0, 0, 35, this.config.level1Height, "madness_platform_l1");

        // Упрощено: только 2 угловые платформы уровня 2
        const level2Size = 20;
        this.generatePlatform(context, -arenaHalf + 30, -arenaHalf + 30, level2Size, this.config.level2Height, "madness_platform_l2_1");
        this.generatePlatform(context, arenaHalf - 30, arenaHalf - 30, level2Size, this.config.level2Height, "madness_platform_l2_2");

        // Упрощено: только 2 боковые платформы уровня 2
        this.generatePlatform(context, 0, -arenaHalf + 25, level2Size, this.config.level2Height, "madness_platform_l2_n");
        this.generatePlatform(context, arenaHalf - 25, 0, level2Size, this.config.level2Height, "madness_platform_l2_e");

        // Упрощено: только 2 платформы уровня 3
        const level3Size = 15;
        this.generatePlatform(context, -25, -25, level3Size, this.config.level3Height, "madness_platform_l3_1");
        this.generatePlatform(context, 25, 25, level3Size, this.config.level3Height, "madness_platform_l3_2");

        // Уровень 4 убран для упрощения
    }

    /**
     * Генерация одной платформы
     */
    private generatePlatform(
        context: ChunkGenerationContext,
        centerX: number,
        centerZ: number,
        platformSize: number,
        height: number,
        name: string
    ): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const platformHalf = platformSize / 2;

        const platformMinX = centerX - platformHalf;
        const platformMaxX = centerX + platformHalf;
        const platformMinZ = centerZ - platformHalf;
        const platformMaxZ = centerZ + platformHalf;

        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        if (chunkMaxX < platformMinX || chunkMinX > platformMaxX ||
            chunkMaxZ < platformMinZ || chunkMinZ > platformMaxZ) {
            return;
        }

        const intersectMinX = Math.max(chunkMinX, platformMinX);
        const intersectMaxX = Math.min(chunkMaxX, platformMaxX);
        const intersectMinZ = Math.max(chunkMinZ, platformMinZ);
        const intersectMaxZ = Math.min(chunkMaxZ, platformMaxZ);

        const intersectWidth = intersectMaxX - intersectMinX;
        const intersectDepth = intersectMaxZ - intersectMinZ;
        const intersectCenterX = (intersectMinX + intersectMaxX) / 2;
        const intersectCenterZ = (intersectMinZ + intersectMaxZ) / 2;

        const platform = this.createBox(
            name,
            {
                width: intersectWidth,
                height: height,
                depth: intersectDepth
            },
            new Vector3(
                intersectCenterX - worldX,
                height / 2,
                intersectCenterZ - worldZ
            ),
            "concrete",
            chunkParent,
            true
        );
    }

    /**
     * Генерация мостиков между платформами
     * ВСЕ мосты начинаются ТОЧНО с края платформы или земли и заканчиваются ТОЧНО на краю другой платформы
     * КРИТИЧНО: Мосты от ПОЛА (земли) должны идти на ВСЕ уровни!
     */
    private generateBridges(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const groundLevel = 0;

        // Размеры платформ для вычисления краёв
        const level1Size = 35; // Центральная платформа уровня 1
        const level2Size = 20; // Угловые и боковые платформы уровня 2
        const level3Size = 15; // Платформы уровня 3
        const level1Edge = level1Size / 2; // 17.5
        const level2Edge = level2Size / 2; // 10
        const level3HalfSize = level3Size / 2; // 7.5

        // ========== МОСТЫ ОТ ПОЛА (ЗЕМЛИ) К УРОВНЮ 1 (центральная платформа) ==========
        this.createBridge(context, 0, 25, groundLevel, 0, level1Edge, this.config.level1Height, 8, "bridge_ground_l1_n");
        this.createBridge(context, 0, -25, groundLevel, 0, -level1Edge, this.config.level1Height, 8, "bridge_ground_l1_s");
        this.createBridge(context, 25, 0, groundLevel, level1Edge, 0, this.config.level1Height, 8, "bridge_ground_l1_e");
        this.createBridge(context, -25, 0, groundLevel, -level1Edge, 0, this.config.level1Height, 8, "bridge_ground_l1_w");

        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 2 (угловые платформы) ==========
        const level2CornerX = arenaHalf - 30; // Центр угловой платформы
        const level2CornerZ = arenaHalf - 30;
        const level2CornerEdgeX = level2CornerX - level2Edge; // Край платформы (ближе к центру)
        const level2CornerEdgeZ = level2CornerZ - level2Edge;
        this.createBridge(context, -arenaHalf + 20, -arenaHalf + 20, groundLevel, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 6, "bridge_ground_l2_corner_1");
        this.createBridge(context, arenaHalf - 20, -arenaHalf + 20, groundLevel, -level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 6, "bridge_ground_l2_corner_2");
        this.createBridge(context, arenaHalf - 20, arenaHalf - 20, groundLevel, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 6, "bridge_ground_l2_corner_3");
        this.createBridge(context, -arenaHalf + 20, arenaHalf - 20, groundLevel, level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 6, "bridge_ground_l2_corner_4");

        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 2 (боковые платформы) ==========
        const level2SideEdge = arenaHalf - 25 - level2Edge; // Край боковой платформы (ближе к центру)
        this.createBridge(context, 0, -arenaHalf + 15, groundLevel, 0, -level2SideEdge, this.config.level2Height, 6, "bridge_ground_l2_n");
        this.createBridge(context, 0, arenaHalf - 15, groundLevel, 0, level2SideEdge, this.config.level2Height, 6, "bridge_ground_l2_s");
        this.createBridge(context, arenaHalf - 15, 0, groundLevel, level2SideEdge, 0, this.config.level2Height, 6, "bridge_ground_l2_e");
        this.createBridge(context, -arenaHalf + 15, 0, groundLevel, -level2SideEdge, 0, this.config.level2Height, 6, "bridge_ground_l2_w");

        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 3 ==========
        const level3Center = 25;
        const level3Edge = level3Center - level3HalfSize; // 17.5
        this.createBridge(context, -30, -30, groundLevel, -level3Edge, -level3Edge, this.config.level3Height, 6, "bridge_ground_l3_1");
        this.createBridge(context, 30, -30, groundLevel, level3Edge, -level3Edge, this.config.level3Height, 6, "bridge_ground_l3_2");
        this.createBridge(context, 30, 30, groundLevel, level3Edge, level3Edge, this.config.level3Height, 6, "bridge_ground_l3_3");
        this.createBridge(context, -30, 30, groundLevel, -level3Edge, level3Edge, this.config.level3Height, 6, "bridge_ground_l3_4");

        // Упрощено: убраны мосты к уровню 4 и дополнительные мосты между уровнями, оставлены только основные от пола
    }

    /**
     * Создание одного мостика между двумя точками
     * Мост соединяет края платформ, начинается и заканчивается на их поверхности
     */
    private createBridge(
        context: ChunkGenerationContext,
        x1: number, z1: number, y1: number,
        x2: number, z2: number, y2: number,
        width: number,
        name: string
    ): void {
        const { worldX, worldZ, size, chunkParent } = context;

        // Вычисляем направление
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);

        // Вычисляем наклон моста (если есть разница высот)
        const totalDistance = Math.sqrt(horizontalDistance * horizontalDistance + dy * dy);
        const pitchAngle = Math.atan2(dy, horizontalDistance);

        // Позиция мостика (середина между точками)
        // ВАЖНО: Высота моста должна быть на уровне поверхности платформ (y1 и y2 - это высота поверхности)
        const bridgeX = (x1 + x2) / 2;
        const bridgeZ = (z1 + z2) / 2;
        // Мост должен лежать на поверхности, поэтому его центр на средней высоте между точками
        const bridgeY = (y1 + y2) / 2;

        // Проверяем, попадает ли мостик в чанк
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        const bridgeMinX = bridgeX - totalDistance / 2;
        const bridgeMaxX = bridgeX + totalDistance / 2;
        const bridgeMinZ = bridgeZ - totalDistance / 2;
        const bridgeMaxZ = bridgeZ + totalDistance / 2;

        if (chunkMaxX < bridgeMinX || chunkMinX > bridgeMaxX ||
            chunkMaxZ < bridgeMinZ || chunkMinZ > bridgeMaxZ) {
            return;
        }

        const localX = bridgeX - worldX;
        const localZ = bridgeZ - worldZ;

        // Создаём мост БЕЗ ограждений с наклоном
        // Мост должен лежать ТОЧНО на поверхности платформ
        // Высота моста 0.5, поэтому его центр должен быть на высоте поверхности
        const bridge = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, this.scene);
        // Позиция моста: центр на средней высоте между точками (поверхность платформ)
        bridge.position = new Vector3(localX, bridgeY, localZ);
        bridge.rotation.y = angle;
        bridge.rotation.x = pitchAngle; // Наклон моста по высоте
        bridge.material = this.getMat("concrete");
        bridge.parent = chunkParent;
        bridge.freezeWorldMatrix();
        new PhysicsAggregate(bridge, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    }

    /**
     * Генерация множества рамп для всех уровней
     * ВАЖНО: Каждая платформа должна иметь хотя бы одну рампу для доступа
     */
    private generateManyRamps(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const groundLevel = 0;

        // Размеры платформ для вычисления краёв
        const level1Size = 35;
        const level2Size = 20;
        const level3Size = 15;
        const level1Edge = level1Size / 2; // 17.5
        const level2Edge = level2Size / 2; // 10
        const level3HalfSize = level3Size / 2; // 7.5 (половина размера платформы уровня 3)

        // ========== РАМПЫ ОТ ЗЕМЛИ К УРОВНЮ 1 (центральная платформа) ==========
        // 4 рампы по сторонам света
        this.createRamp(context, 0, 25, groundLevel, 0, level1Edge, this.config.level1Height, 10, 8, "ramp_ground_l1_n");
        this.createRamp(context, 0, -25, groundLevel, 0, -level1Edge, this.config.level1Height, 10, 8, "ramp_ground_l1_s");
        this.createRamp(context, 25, 0, groundLevel, level1Edge, 0, this.config.level1Height, 10, 8, "ramp_ground_l1_e");
        this.createRamp(context, -25, 0, groundLevel, -level1Edge, 0, this.config.level1Height, 10, 8, "ramp_ground_l1_w");

        // ========== РАМПЫ ОТ ЗЕМЛИ К УРОВНЮ 2 (угловые платформы) ==========
        const level2CornerX = arenaHalf - 30;
        const level2CornerZ = arenaHalf - 30;
        const level2CornerEdgeX = level2CornerX - level2Edge; // Край платформы
        const level2CornerEdgeZ = level2CornerZ - level2Edge;
        this.createRamp(context, -arenaHalf + 20, -arenaHalf + 20, groundLevel, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 8, 6, "ramp_ground_l2_corner_1");
        this.createRamp(context, arenaHalf - 20, -arenaHalf + 20, groundLevel, -level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 8, 6, "ramp_ground_l2_corner_2");
        this.createRamp(context, arenaHalf - 20, arenaHalf - 20, groundLevel, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 8, 6, "ramp_ground_l2_corner_3");
        this.createRamp(context, -arenaHalf + 20, arenaHalf - 20, groundLevel, level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 8, 6, "ramp_ground_l2_corner_4");

        // ========== РАМПЫ ОТ БОКОВЫХ ПЛАТФОРМ УРОВНЯ 2 К ЦЕНТРУ (развернуты на 180 градусов) ==========
        const level2SideEdge = arenaHalf - 25 - level2Edge; // Край боковой платформы
        // Рампы идут от боковых платформ к центру (к уровню 1)
        this.createRamp(context, 0, -level2SideEdge, this.config.level2Height, 0, level1Edge, this.config.level1Height, 8, 6, "ramp_l2_l1_n");
        this.createRamp(context, 0, level2SideEdge, this.config.level2Height, 0, -level1Edge, this.config.level1Height, 8, 6, "ramp_l2_l1_s");
        this.createRamp(context, level2SideEdge, 0, this.config.level2Height, -level1Edge, 0, this.config.level1Height, 8, 6, "ramp_l2_l1_e");
        this.createRamp(context, -level2SideEdge, 0, this.config.level2Height, level1Edge, 0, this.config.level1Height, 8, 6, "ramp_l2_l1_w");

        // Упрощено: убраны дополнительные рампы между уровнями, оставлены только основные от пола
    }

    /**
     * Создание одной рампы между двумя точками
     */
    private createRamp(
        context: ChunkGenerationContext,
        x1: number, z1: number, y1: number,
        x2: number, z2: number, y2: number,
        width: number,
        depth: number,
        name: string
    ): void {
        const { worldX, worldZ, size, chunkParent } = context;

        // Позиция рампы (середина между точками)
        const rampX = (x1 + x2) / 2;
        const rampZ = (z1 + z2) / 2;
        const rampY = (y1 + y2) / 2;

        // Вычисляем направление
        const dx = x2 - x1;
        const dz = z2 - z1;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);

        // Вычисляем наклон
        const heightDiff = y2 - y1;
        const rampAngle = Math.atan2(heightDiff, distance);

        // Проверяем, попадает ли рампа в чанк
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        const rampMinX = rampX - width / 2;
        const rampMaxX = rampX + width / 2;
        const rampMinZ = rampZ - depth / 2;
        const rampMaxZ = rampZ + depth / 2;

        if (chunkMaxX < rampMinX || chunkMinX > rampMaxX ||
            chunkMaxZ < rampMinZ || chunkMinZ > rampMaxZ) {
            return;
        }

        const localX = rampX - worldX;
        const localZ = rampZ - worldZ;

        // Создаём рампу
        const ramp = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: depth
        }, this.scene);
        ramp.position = new Vector3(localX, rampY, localZ);
        ramp.rotation.y = angle;
        ramp.rotation.x = rampAngle;
        ramp.material = this.getMat("concrete");
        ramp.parent = chunkParent;
        ramp.freezeWorldMatrix();
        new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    }

    /**
     * Генерация вертикальных переходов (лестниц/колонн)
     */
    private generateVerticalPassages(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;

        // Упрощено: уменьшено количество колонн
        const columns = [
            { x: -30, z: -30, height: this.config.level2Height },
            { x: 30, z: 30, height: this.config.level2Height },
            { x: -15, z: -15, height: this.config.level3Height },
            { x: 15, z: 15, height: this.config.level3Height }
        ];

        columns.forEach((col, index) => {
            const chunkMinX = worldX;
            const chunkMaxX = worldX + size;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + size;

            const colSize = 2;
            const colMinX = col.x - colSize / 2;
            const colMaxX = col.x + colSize / 2;
            const colMinZ = col.z - colSize / 2;
            const colMaxZ = col.z + colSize / 2;

            if (chunkMaxX < colMinX || chunkMinX > colMaxX ||
                chunkMaxZ < colMinZ || chunkMinZ > colMaxZ) {
                return;
            }

            const localX = col.x - worldX;
            const localZ = col.z - worldZ;

            const column = this.createBox(
                `madness_column_${index}`,
                { width: colSize, height: col.height, depth: colSize },
                new Vector3(localX, col.height / 2, localZ),
                "concrete",
                chunkParent,
                true
            );
        });
    }

    /**
     * Генерация контейнеров на разных уровнях
     */
    private generateContainers(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;

        // Упрощено: только половина контейнеров
        const containers = [
            // На земле
            { x: -50, z: -50, y: 0, width: 3, height: 2.5, depth: 6, material: "metal" },
            { x: 50, z: 50, y: 0, width: 3, height: 2.5, depth: 6, material: "metal" },

            // На уровне 2
            { x: -arenaHalf + 30, z: -arenaHalf + 30, y: this.config.level2Height, width: 2.5, height: 2, depth: 5, material: "red" },
            { x: arenaHalf - 30, z: arenaHalf - 30, y: this.config.level2Height, width: 2.5, height: 2, depth: 5, material: "red" },

            // На уровне 3
            { x: -25, z: -25, y: this.config.level3Height, width: 2, height: 1.8, depth: 4, material: "metal" },
            { x: 25, z: 25, y: this.config.level3Height, width: 2, height: 1.8, depth: 4, material: "metal" }
        ];

        containers.forEach((container, index) => {
            const chunkMinX = worldX;
            const chunkMaxX = worldX + size;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + size;

            const containerMinX = container.x - container.width / 2;
            const containerMaxX = container.x + container.width / 2;
            const containerMinZ = container.z - container.depth / 2;
            const containerMaxZ = container.z + container.depth / 2;

            if (chunkMaxX < containerMinX || chunkMinX > containerMaxX ||
                chunkMaxZ < containerMinZ || chunkMinZ > containerMaxZ) {
                return;
            }

            const localX = container.x - worldX;
            const localZ = container.z - worldZ;

            const box = this.createBox(
                `madness_container_${index}`,
                { width: container.width, height: container.height, depth: container.depth },
                new Vector3(localX, container.y + container.height / 2, localZ),
                container.material,
                chunkParent,
                true
            );
            box.rotation.y = Math.random() * Math.PI * 2;
        });
    }

    /**
     * Генерация стен периметра
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = MAP_SIZES.madness?.wallHeight ?? 4;
        const wallThickness = 1;

        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;

        // Северная стена
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createBox(
                    "madness_wall_n",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, arenaHalf - worldZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }

        // Южная стена
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createBox(
                    "madness_wall_s",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }

        // Восточная стена
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createBox(
                    "madness_wall_e",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }

        // Западная стена
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createBox(
                    "madness_wall_w",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
    }
}

export default MadnessGenerator;

