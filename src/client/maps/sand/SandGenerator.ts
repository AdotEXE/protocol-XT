/**
 * @module maps/sand/SandGenerator
 * @description Генератор карты "Песок" - фиксированная двухуровневая арена
 * 
 * Карта вдохновлена "Песочницей" из Tanki Online:
 * - Компактная симметричная арена 150x150
 * - Двухуровневая структура (плоское основание + центральная платформа)
 * - Фиксированный layout без рандомной генерации
 * - Контейнеры, укрытия, рампы в фиксированных позициях
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { MAP_SIZES } from "../MapConstants";

/**
 * Конфигурация карты Песок
 */
export interface SandConfig {
    /** Размер арены в единицах */
    arenaSize: number;
    /** Высота центральной платформы */
    platformHeight: number;
    /** Размер центральной платформы */
    platformSize: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_SAND_CONFIG: SandConfig = {
    arenaSize: MAP_SIZES.sand?.size ?? 150,
    platformHeight: 3.5,
    platformSize: 40
};

/**
 * Генератор карты "Песок"
 * 
 * Фиксированная двухуровневая арена с центральной платформой,
 * рампами, контейнерами и укрытиями в симметричном расположении.
 */
export class SandGenerator extends BaseMapGenerator {
    readonly mapType = "sand";
    readonly displayName = "Песок";
    readonly description = "Компактная двухуровневая арена в стиле Песочницы";

    /** Конфигурация генератора */
    private config: SandConfig;

    constructor(config: Partial<SandConfig> = {}) {
        super();
        this.config = { ...DEFAULT_SAND_CONFIG, ...config };
    }

    /**
     * Основной метод генерации контента чанка
     * Создаёт фиксированные элементы карты
     * 
     * ПРИМЕЧАНИЕ: Базовый ground создаётся в ChunkSystem.createBaseTerrain(),
     * здесь мы только добавляем элементы поверх плоского ground
     */
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;

        // Режим редактора: worldX=0 и size >= arenaSize означает что генерируем всю карту
        const isEditorMode = worldX === 0 && worldZ === 0 && size >= this.config.arenaSize;

        // Границы текущего чанка
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        const arenaHalf = this.config.arenaSize / 2;

        // Проверяем, пересекается ли чанк с картой
        if (!isEditorMode) {
            if (chunkMaxX < -arenaHalf || chunkMinX > arenaHalf ||
                chunkMaxZ < -arenaHalf || chunkMinZ > arenaHalf) {
                return; // Чанк вне карты
            }
        }

        // Вспомогательная функция для преобразования координат
        const toLocal = (x: number, z: number) => ({
            x: isEditorMode ? x : x - worldX,
            z: isEditorMode ? z : z - worldZ
        });

        // Вспомогательная функция для проверки, находится ли точка в чанке
        const isInChunk = (x: number, z: number) => {
            if (isEditorMode) return true;
            return x >= chunkMinX && x < chunkMaxX && z >= chunkMinZ && z < chunkMaxZ;
        };

        // Генерируем все элементы карты
        this.generateCentralPlatform(context, isEditorMode, toLocal, isInChunk);
        this.generateRamps(context, isEditorMode, toLocal, isInChunk);
        this.generateRuins(context, isEditorMode, toLocal, isInChunk);
        this.generateBuildings(context, isEditorMode, toLocal, isInChunk);
        this.generatePerimeter(context, isEditorMode, toLocal, isInChunk);
        this.generateCornerRamps(context, isEditorMode, toLocal, isInChunk);
        this.generateCoverWalls(context, isEditorMode, toLocal, isInChunk);
    }

    /**
     * Генерация центральной платформы
     */
    private generateCentralPlatform(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;
        const platformHalf = this.config.platformSize / 2;

        // Центр платформы в (0, 0)
        if (isEditorMode || isInChunk(0, 0)) {
            const local = toLocal(0, 0);
            const box = MeshBuilder.CreateBox("sand_platform", {
                width: this.config.platformSize,
                height: this.config.platformHeight,
                depth: this.config.platformSize
            }, this.scene);
            box.position = new Vector3(local.x, this.config.platformHeight / 2, local.z);
            box.material = this.getMat("concrete");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            if (this.hasPhysics()) {
                try {
                    new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } catch (error) {
                    console.warn("[SandGenerator] Failed to create physics for central platform:", error);
                }
            }
        }
    }

    /**
     * Генерация рамп для заезда на платформу
     * 4 рампы по сторонам света
     */
    private generateRamps(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;
        const platformHalf = this.config.platformSize / 2;
        const rampWidth = 10;
        const rampDepth = 8;
        const rampHeight = this.config.platformHeight;
        const rampThickness = 0.5;

        const rampPositions = [
            { x: 0, z: platformHalf + rampDepth / 2, rotationX: Math.PI / 6, rotationZ: 0 },      // Север
            { x: 0, z: -(platformHalf + rampDepth / 2), rotationX: -Math.PI / 6, rotationZ: 0 },   // Юг
            { x: platformHalf + rampDepth / 2, z: 0, rotationX: 0, rotationZ: -Math.PI / 6 },       // Восток
            { x: -(platformHalf + rampDepth / 2), z: 0, rotationX: 0, rotationZ: Math.PI / 6 }     // Запад
        ];

        rampPositions.forEach((pos, index) => {
            if (isEditorMode || isInChunk(pos.x, pos.z)) {
                const local = toLocal(pos.x, pos.z);
                const ramp = MeshBuilder.CreateBox(`sand_ramp_${index}`, {
                    width: rampWidth,
                    height: rampThickness,
                    depth: rampDepth
                }, this.scene);
                ramp.position = new Vector3(local.x, rampHeight / 2 - rampThickness / 2, local.z);
                ramp.rotation.x = pos.rotationX;
                ramp.rotation.z = pos.rotationZ;
                ramp.material = this.getMat("concrete");
                ramp.parent = chunkParent;
                ramp.freezeWorldMatrix();
                ramp.freezeWorldMatrix();
                this.addPhysicsIfAvailable(ramp, PhysicsShapeType.BOX, { mass: 0 });
            }
        });
    }

    /**
     * Генерация разрушенных заборов - Г-образные и разной высоты (как обломанные)
     * На платформе и вне центра карты
     */
    private generateRuins(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;
        const platformHeight = this.config.platformHeight;

        // === ЗАБОРЫ НА ЦЕНТРАЛЬНОЙ ПЛАТФОРМЕ (Г-образные, собранные группами) ===
        // ВАЖНО: Рампы находятся в центре каждой стороны (x: ±24, z: 0 и x: 0, z: ±24)
        // Размер платформы 40x40, так что безопасная зона для объектов: |x| < 15 и |z| < 15 (избегаем рамп)

        // Группа 1: Г-образный забор в северо-западной части платформы (далеко от рамп)
        const group1 = [
            { x: -12, z: 10, width: 6, height: 2.2, depth: 0.6, rotation: 0 },      // длинная часть Г
            { x: -14.5, z: 12, width: 0.6, height: 1.6, depth: 4, rotation: 0 },    // короткая часть Г (пониже)
        ];

        // Группа 2: Г-образный забор в юго-восточной части (далеко от рамп)
        const group2 = [
            { x: 12, z: -10, width: 5, height: 1.8, depth: 0.6, rotation: 0 },        // длинная часть
            { x: 14, z: -12, width: 0.6, height: 2.4, depth: 3.5, rotation: 0 },      // короткая часть (повыше)
        ];

        // Группа 3: Обломанный Г-забор в северо-восточной части платформы
        const group3 = [
            { x: 10, z: 12, width: 4, height: 1.4, depth: 0.5, rotation: Math.PI / 4 },   // основа
            { x: 11.5, z: 13.5, width: 0.5, height: 2.0, depth: 2.5, rotation: Math.PI / 4 }, // вертикальная часть
        ];

        // Одиночные обломки разной высоты (в безопасных зонах)
        const singleRuins = [
            { x: -8, z: -8, width: 3, height: 1.0, depth: 0.5, rotation: Math.PI / 6 },    // низкий в углу
            { x: 8, z: 8, width: 2.5, height: 1.8, depth: 0.5, rotation: -Math.PI / 3 }, // средний в другом углу
        ];

        // Объединяем все руины на платформе
        const platformRuins = [...group1, ...group2, ...group3, ...singleRuins];

        platformRuins.forEach((ruin, index) => {
            if (isEditorMode || isInChunk(ruin.x, ruin.z)) {
                const local = toLocal(ruin.x, ruin.z);
                const ruinWall = MeshBuilder.CreateBox(`sand_ruin_platform_${index}`, {
                    width: ruin.width,
                    height: ruin.height,
                    depth: ruin.depth
                }, this.scene);
                ruinWall.position = new Vector3(local.x, platformHeight + ruin.height / 2, local.z);
                ruinWall.rotation.y = ruin.rotation;
                ruinWall.material = this.getMat("concrete");
                ruinWall.parent = chunkParent;
                ruinWall.freezeWorldMatrix();
                ruinWall.freezeWorldMatrix();
                this.addPhysicsIfAvailable(ruinWall, PhysicsShapeType.BOX, { mass: 0 });
            }
        });

        // === ЗАБОРЫ ПО ПЕРИМЕТРУ ЦЕНТРАЛЬНОЙ ПЛАТФОРМЫ (на земле вокруг платформы) ===
        // Платформа 40x40, так что периметр на расстоянии ~22-28 от центра
        const platformHalf = this.config.platformSize / 2; // 20
        const perimeterDistance = platformHalf + 3; // ~23 от центра

        const perimeterRuins = [
            // Северная сторона (избегаем рампу в центре)
            { x: -15, z: perimeterDistance, width: 4, height: 1.8, depth: 0.6, rotation: 0 },
            { x: -8, z: perimeterDistance, width: 3.5, height: 1.2, depth: 0.5, rotation: 0 },
            { x: 8, z: perimeterDistance, width: 3, height: 2.2, depth: 0.6, rotation: 0 },
            { x: 15, z: perimeterDistance, width: 4.5, height: 1.4, depth: 0.5, rotation: 0 },

            // Южная сторона
            { x: -15, z: -perimeterDistance, width: 3.5, height: 1.6, depth: 0.6, rotation: 0 },
            { x: -8, z: -perimeterDistance, width: 4, height: 0.9, depth: 0.5, rotation: 0 },
            { x: 8, z: -perimeterDistance, width: 3, height: 2.0, depth: 0.6, rotation: 0 },
            { x: 15, z: -perimeterDistance, width: 4, height: 1.3, depth: 0.5, rotation: 0 },

            // Восточная сторона
            { x: perimeterDistance, z: -15, width: 0.6, height: 1.5, depth: 4, rotation: 0 },
            { x: perimeterDistance, z: -8, width: 0.5, height: 2.3, depth: 3.5, rotation: 0 },
            { x: perimeterDistance, z: 8, width: 0.6, height: 1.1, depth: 3, rotation: 0 },
            { x: perimeterDistance, z: 15, width: 0.5, height: 1.9, depth: 4.5, rotation: 0 },

            // Западная сторона
            { x: -perimeterDistance, z: -15, width: 0.6, height: 1.7, depth: 4, rotation: 0 },
            { x: -perimeterDistance, z: -8, width: 0.5, height: 0.8, depth: 3.5, rotation: 0 },
            { x: -perimeterDistance, z: 8, width: 0.6, height: 2.1, depth: 3, rotation: 0 },
            { x: -perimeterDistance, z: 15, width: 0.5, height: 1.4, depth: 4, rotation: 0 },

            // Углы (диагональные обломки)
            { x: -18, z: 18, width: 3, height: 1.6, depth: 0.5, rotation: Math.PI / 4 },
            { x: 18, z: 18, width: 3.5, height: 1.2, depth: 0.6, rotation: -Math.PI / 4 },
            { x: 18, z: -18, width: 3, height: 1.9, depth: 0.5, rotation: Math.PI / 4 },
            { x: -18, z: -18, width: 4, height: 1.3, depth: 0.6, rotation: -Math.PI / 4 },
        ];

        perimeterRuins.forEach((ruin, index) => {
            if (isEditorMode || isInChunk(ruin.x, ruin.z)) {
                const local = toLocal(ruin.x, ruin.z);
                const ruinWall = MeshBuilder.CreateBox(`sand_ruin_perimeter_${index}`, {
                    width: ruin.width,
                    height: ruin.height,
                    depth: ruin.depth
                }, this.scene);
                // На земле (y = 0)
                ruinWall.position = new Vector3(local.x, ruin.height / 2, local.z);
                ruinWall.rotation.y = ruin.rotation;
                ruinWall.material = this.getMat("concrete");
                ruinWall.parent = chunkParent;
                ruinWall.freezeWorldMatrix();
                ruinWall.freezeWorldMatrix();
                this.addPhysicsIfAvailable(ruinWall, PhysicsShapeType.BOX, { mass: 0 });
            }
        });

        // === ЗАБОРЫ ВНЕ ЦЕНТРА КАРТЫ (на земле, дальше от центра) ===

        // Г-образный забор в юго-западной части
        const groundRuins1 = [
            { x: -35, z: -20, width: 5, height: 2.0, depth: 0.6, rotation: 0 },
            { x: -37, z: -18, width: 0.6, height: 1.4, depth: 3.5, rotation: 0 },
        ];

        // Г-образный забор в северо-восточной части
        const groundRuins2 = [
            { x: 35, z: 18, width: 4.5, height: 1.6, depth: 0.6, rotation: Math.PI },
            { x: 37, z: 16, width: 0.6, height: 2.2, depth: 3, rotation: 0 },
        ];

        // Обломки забора на юге
        const groundRuins3 = [
            { x: 10, z: -38, width: 3.5, height: 1.2, depth: 0.5, rotation: Math.PI / 5 },
            { x: -12, z: -40, width: 4, height: 1.8, depth: 0.6, rotation: -Math.PI / 4 },
        ];

        const groundRuins = [...groundRuins1, ...groundRuins2, ...groundRuins3];

        groundRuins.forEach((ruin, index) => {
            if (isEditorMode || isInChunk(ruin.x, ruin.z)) {
                const local = toLocal(ruin.x, ruin.z);
                const ruinWall = MeshBuilder.CreateBox(`sand_ruin_ground_${index}`, {
                    width: ruin.width,
                    height: ruin.height,
                    depth: ruin.depth
                }, this.scene);
                // На земле (y = 0)
                ruinWall.position = new Vector3(local.x, ruin.height / 2, local.z);
                ruinWall.rotation.y = ruin.rotation;
                ruinWall.material = this.getMat("concrete");
                ruinWall.parent = chunkParent;
                ruinWall.freezeWorldMatrix();
                ruinWall.freezeWorldMatrix();
                this.addPhysicsIfAvailable(ruinWall, PhysicsShapeType.BOX, { mass: 0 });
            }
        });
    }

    /**
     * Генерация 4 тактических зданий по углам карты
     * Здания сложной формы (Г, L, Т, П) из нескольких боксов с окнами
     */
    private generateBuildings(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;

        // Здание 1: Г-образное (северо-запад) - высота 6
        const nwX = -45, nwZ = 45;
        if (isEditorMode || isInChunk(nwX, nwZ)) {
            const local = toLocal(nwX, nwZ);
            // Длинная часть
            let box = MeshBuilder.CreateBox("sand_bld_nw_long", {
                width: 4, height: 6, depth: 16
            }, this.scene);
            box.position = new Vector3(local.x - 4, 3, local.z);
            box.material = this.getMat("concrete");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });

            // Короткая часть
            box = MeshBuilder.CreateBox("sand_bld_nw_short", {
                width: 12, height: 6, depth: 4
            }, this.scene);
            box.position = new Vector3(local.x + 2, 3, local.z + 6);
            box.material = this.getMat("concrete");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });

            // Окно в длинной части
            box = MeshBuilder.CreateBox("sand_bld_nw_window", {
                width: 4.2, height: 1.5, depth: 3
            }, this.scene);
            box.position = new Vector3(local.x - 4, 2.5, local.z);
            box.material = this.getMat("sand");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Здание 2: L-образное (юго-восток) - высота 4
        const seX = 45, seZ = -45;
        if (isEditorMode || isInChunk(seX, seZ)) {
            const local = toLocal(seX, seZ);
            let box = MeshBuilder.CreateBox("sand_bld_se_long", {
                width: 3, height: 4, depth: 10
            }, this.scene);
            box.position = new Vector3(local.x + 3, 2, local.z);
            box.material = this.getMat("brick");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });

            box = MeshBuilder.CreateBox("sand_bld_se_short", {
                width: 8, height: 4, depth: 3
            }, this.scene);
            box.position = new Vector3(local.x, 2, local.z - 5);
            box.material = this.getMat("brick");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Здание 3: Т-образное (северо-восток) - высота 8
        const neX = 45, neZ = 45;
        if (isEditorMode || isInChunk(neX, neZ)) {
            const local = toLocal(neX, neZ);
            // Ножка
            let box = MeshBuilder.CreateBox("sand_bld_ne_stem", {
                width: 5, height: 8, depth: 14
            }, this.scene);
            box.position = new Vector3(local.x, 4, local.z - 2);
            box.material = this.getMat("concrete");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });

            // Шапка
            box = MeshBuilder.CreateBox("sand_bld_ne_top", {
                width: 18, height: 9, depth: 4
            }, this.scene);
            box.position = new Vector3(local.x, 4.5, local.z + 6);
            box.material = this.getMat("concrete");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Здание 4: П-образное (юго-запад) - высота 5
        const swX = -45, swZ = -45;
        if (isEditorMode || isInChunk(swX, swZ)) {
            const local = toLocal(swX, swZ);
            // Левая стенка
            let box = MeshBuilder.CreateBox("sand_bld_sw_left", {
                width: 3, height: 5, depth: 14
            }, this.scene);
            box.position = new Vector3(local.x - 6, 2.5, local.z);
            box.material = this.getMat("brick");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });

            // Правая стенка
            box = MeshBuilder.CreateBox("sand_bld_sw_right", {
                width: 3, height: 5, depth: 14
            }, this.scene);
            box.position = new Vector3(local.x + 6, 2.5, local.z);
            box.material = this.getMat("brick");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });

            // Перемычка
            box = MeshBuilder.CreateBox("sand_bld_sw_bridge", {
                width: 15, height: 5, depth: 3
            }, this.scene);
            box.position = new Vector3(local.x, 2.5, local.z + 6);
            box.material = this.getMat("brick");
            box.parent = chunkParent;
            box.freezeWorldMatrix();
            box.freezeWorldMatrix();
            this.addPhysicsIfAvailable(box, PhysicsShapeType.BOX, { mass: 0 });
        }
    }

    /**
     * Генерация стен периметра с платформой наверху
     */
    private generatePerimeter(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = MAP_SIZES.sand?.wallHeight ?? 4;
        const wallThickness = 1;
        const wallLength = this.config.arenaSize;

        // Северная стена
        if (isEditorMode || isInChunk(0, arenaHalf)) {
            const local = toLocal(0, arenaHalf);
            const wall = MeshBuilder.CreateBox("sand_wall_n", {
                width: wallLength,
                height: wallHeight,
                depth: wallThickness
            }, this.scene);
            wall.position = new Vector3(local.x, wallHeight / 2, local.z);
            wall.material = this.getMat("concrete");
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            wall.freezeWorldMatrix();
            this.addPhysicsIfAvailable(wall, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Южная стена
        if (isEditorMode || isInChunk(0, -arenaHalf)) {
            const local = toLocal(0, -arenaHalf);
            const wall = MeshBuilder.CreateBox("sand_wall_s", {
                width: wallLength,
                height: wallHeight,
                depth: wallThickness
            }, this.scene);
            wall.position = new Vector3(local.x, wallHeight / 2, local.z);
            wall.material = this.getMat("concrete");
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            wall.freezeWorldMatrix();
            this.addPhysicsIfAvailable(wall, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Восточная стена
        if (isEditorMode || isInChunk(arenaHalf, 0)) {
            const local = toLocal(arenaHalf, 0);
            const wall = MeshBuilder.CreateBox("sand_wall_e", {
                width: wallThickness,
                height: wallHeight,
                depth: wallLength
            }, this.scene);
            wall.position = new Vector3(local.x, wallHeight / 2, local.z);
            wall.material = this.getMat("concrete");
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            wall.freezeWorldMatrix();
            this.addPhysicsIfAvailable(wall, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Западная стена
        if (isEditorMode || isInChunk(-arenaHalf, 0)) {
            const local = toLocal(-arenaHalf, 0);
            const wall = MeshBuilder.CreateBox("sand_wall_w", {
                width: wallThickness,
                height: wallHeight,
                depth: wallLength
            }, this.scene);
            wall.position = new Vector3(local.x, wallHeight / 2, local.z);
            wall.material = this.getMat("concrete");
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            wall.freezeWorldMatrix();
            this.addPhysicsIfAvailable(wall, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Платформа-дорожка по верху забора
        this.generateWallWalkway(context, isEditorMode, toLocal, isInChunk, arenaHalf, wallHeight);
    }

    /**
     * Генерация платформы-дорожки по верху забора
     */
    private generateWallWalkway(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean,
        arenaHalf: number,
        wallHeight: number
    ): void {
        const { chunkParent } = context;
        const walkwayWidth = 3;
        const walkwayThickness = 0.3;
        const walkwayLength = this.config.arenaSize;
        const y = wallHeight + walkwayThickness / 2;

        // Северная дорожка
        if (isEditorMode || isInChunk(0, arenaHalf + walkwayWidth / 2)) {
            const local = toLocal(0, arenaHalf + walkwayWidth / 2);
            const walkway = MeshBuilder.CreateBox("sand_walkway_n", {
                width: walkwayLength,
                height: walkwayThickness,
                depth: walkwayWidth
            }, this.scene);
            walkway.position = new Vector3(local.x, y, local.z);
            walkway.material = this.getMat("concrete");
            walkway.parent = chunkParent;
            walkway.freezeWorldMatrix();
            walkway.freezeWorldMatrix();
            this.addPhysicsIfAvailable(walkway, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Южная дорожка
        if (isEditorMode || isInChunk(0, -arenaHalf - walkwayWidth / 2)) {
            const local = toLocal(0, -arenaHalf - walkwayWidth / 2);
            const walkway = MeshBuilder.CreateBox("sand_walkway_s", {
                width: walkwayLength,
                height: walkwayThickness,
                depth: walkwayWidth
            }, this.scene);
            walkway.position = new Vector3(local.x, y, local.z);
            walkway.material = this.getMat("concrete");
            walkway.parent = chunkParent;
            walkway.freezeWorldMatrix();
            walkway.freezeWorldMatrix();
            this.addPhysicsIfAvailable(walkway, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Восточная дорожка
        if (isEditorMode || isInChunk(arenaHalf + walkwayWidth / 2, 0)) {
            const local = toLocal(arenaHalf + walkwayWidth / 2, 0);
            const walkway = MeshBuilder.CreateBox("sand_walkway_e", {
                width: walkwayWidth,
                height: walkwayThickness,
                depth: walkwayLength
            }, this.scene);
            walkway.position = new Vector3(local.x, y, local.z);
            walkway.material = this.getMat("concrete");
            walkway.parent = chunkParent;
            walkway.freezeWorldMatrix();
            walkway.freezeWorldMatrix();
            this.addPhysicsIfAvailable(walkway, PhysicsShapeType.BOX, { mass: 0 });
        }

        // Западная дорожка
        if (isEditorMode || isInChunk(-arenaHalf - walkwayWidth / 2, 0)) {
            const local = toLocal(-arenaHalf - walkwayWidth / 2, 0);
            const walkway = MeshBuilder.CreateBox("sand_walkway_w", {
                width: walkwayWidth,
                height: walkwayThickness,
                depth: walkwayLength
            }, this.scene);
            walkway.position = new Vector3(local.x, y, local.z);
            walkway.material = this.getMat("concrete");
            walkway.parent = chunkParent;
            walkway.freezeWorldMatrix();
            walkway.freezeWorldMatrix();
            this.addPhysicsIfAvailable(walkway, PhysicsShapeType.BOX, { mass: 0 });
        }
    }

    /**
     * Генерация рамп на забор - ВДОЛЬ стен под углом 30°
     */
    private generateCornerRamps(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = MAP_SIZES.sand?.wallHeight ?? 4;
        const rampWidth = 6;
        const rampThickness = 0.5;
        const rampAngle = Math.PI / 6; // 30 градусов
        const rampLength = wallHeight / Math.sin(rampAngle);
        const rampHorizontal = rampLength * Math.cos(rampAngle);

        const wallRamps = [
            { x: -arenaHalf + 3, z: -arenaHalf + rampHorizontal / 2 + 5, rotationY: 0, rotationX: -rampAngle },
            { x: arenaHalf - 3, z: arenaHalf - rampHorizontal / 2 - 5, rotationY: 0, rotationX: rampAngle }
        ];

        wallRamps.forEach((ramp, index) => {
            if (isEditorMode || isInChunk(ramp.x, ramp.z)) {
                const local = toLocal(ramp.x, ramp.z);
                const cornerRampMesh = MeshBuilder.CreateBox(`sand_wall_ramp_${index}`, {
                    width: rampWidth,
                    height: rampThickness,
                    depth: rampLength
                }, this.scene);

                cornerRampMesh.position = new Vector3(local.x, wallHeight / 2, local.z);
                cornerRampMesh.rotation.y = ramp.rotationY;
                cornerRampMesh.rotation.x = ramp.rotationX;
                cornerRampMesh.material = this.getMat("concrete");
                cornerRampMesh.parent = chunkParent;
                cornerRampMesh.freezeWorldMatrix();
                cornerRampMesh.freezeWorldMatrix();
                this.addPhysicsIfAvailable(cornerRampMesh, PhysicsShapeType.BOX, { mass: 0 });
            }
        });
    }

    /**
     * Генерация низких стен-укрытий
     */
    private generateCoverWalls(
        context: ChunkGenerationContext,
        isEditorMode: boolean,
        toLocal: (x: number, z: number) => { x: number; z: number },
        isInChunk: (x: number, z: number) => boolean
    ): void {
        const { chunkParent } = context;
        const platformHalf = this.config.platformSize / 2;

        const coverWalls = [
            { x: -28, z: -28, width: 10, depth: 1.8, height: 1.8, rotation: Math.PI / 4 },
            { x: 28, z: -28, width: 10, depth: 1.8, height: 1.8, rotation: -Math.PI / 4 },
            { x: 28, z: 28, width: 10, depth: 1.8, height: 1.8, rotation: Math.PI / 4 },
            { x: -28, z: 28, width: 10, depth: 1.8, height: 1.8, rotation: -Math.PI / 4 },
            // УБРАНЫ объекты на рампе: (-24, 0), (24, 0), (0, -24), (0, 24)
            // Перемещены подальше от рамп:
            { x: -30, z: 0, width: 8, depth: 1.8, height: 1.8, rotation: 0 },
            { x: 30, z: 0, width: 8, depth: 1.8, height: 1.8, rotation: 0 },
            { x: 0, z: -30, width: 8, depth: 1.8, height: 1.8, rotation: Math.PI / 2 },
            { x: 0, z: 30, width: 8, depth: 1.8, height: 1.8, rotation: Math.PI / 2 },
            { x: -40, z: -15, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 6 },
            { x: 40, z: -15, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 6 },
            { x: -40, z: 15, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 6 },
            { x: 40, z: 15, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 6 },
            { x: -15, z: -40, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 3 },
            { x: 15, z: -40, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 3 },
            { x: -15, z: 40, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 3 },
            { x: 15, z: 40, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 3 },
            { x: -50, z: -50, width: 4, depth: 1.2, height: 1.2, rotation: Math.PI / 4 },
            { x: 50, z: -50, width: 4, depth: 1.2, height: 1.2, rotation: -Math.PI / 4 },
            { x: 50, z: 50, width: 4, depth: 1.2, height: 1.2, rotation: Math.PI / 4 },
            { x: -50, z: 50, width: 4, depth: 1.2, height: 1.2, rotation: -Math.PI / 4 }
        ];

        coverWalls.forEach((wall, index) => {
            if (isEditorMode || isInChunk(wall.x, wall.z)) {
                const local = toLocal(wall.x, wall.z);
                const coverWall = MeshBuilder.CreateBox(`sand_cover_wall_${index}`, {
                    width: wall.width,
                    height: wall.height,
                    depth: wall.depth
                }, this.scene);
                coverWall.position = new Vector3(local.x, wall.height / 2, local.z);
                coverWall.rotation.y = wall.rotation;
                coverWall.material = this.getMat("concrete");
                coverWall.parent = chunkParent;
                coverWall.freezeWorldMatrix();
                coverWall.freezeWorldMatrix();
                this.addPhysicsIfAvailable(coverWall, PhysicsShapeType.BOX, { mass: 0 });
            }
        });
    }
}

export default SandGenerator;
