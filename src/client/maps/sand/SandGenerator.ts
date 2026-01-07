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
import { Color3 } from "@babylonjs/core/Maths/math.color";
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
        
        // Генерируем центральную платформу (только в центральных чанках)
        this.generateCentralPlatform(context);
        
        // Генерируем рампы для заезда на платформу
        this.generateRamps(context);
        
        // Генерируем контейнеры и укрытия
        this.generateContainers(context);
        
        // Генерируем стены периметра
        this.generatePerimeter(context);
        
        // Генерируем низкие стены-укрытия
        this.generateCoverWalls(context);
    }
    
    /**
     * Генерация центральной платформы
     */
    private generateCentralPlatform(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const platformHalf = this.config.platformSize / 2;
        
        // Центральная платформа находится в центре карты (0, 0)
        // Проверяем, попадает ли чанк в область платформы
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;
        
        const platformMinX = -platformHalf;
        const platformMaxX = platformHalf;
        const platformMinZ = -platformHalf;
        const platformMaxZ = platformHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Проверяем пересечение чанка с платформой
        if (chunkMaxX < platformMinX || chunkMinX > platformMaxX ||
            chunkMaxZ < platformMinZ || chunkMinZ > platformMaxZ) {
            return; // Чанк не пересекается с платформой
        }
        
        // Вычисляем область пересечения
        const intersectMinX = Math.max(chunkMinX, platformMinX);
        const intersectMaxX = Math.min(chunkMaxX, platformMaxX);
        const intersectMinZ = Math.max(chunkMinZ, platformMinZ);
        const intersectMaxZ = Math.min(chunkMaxZ, platformMaxZ);
        
        const intersectWidth = intersectMaxX - intersectMinX;
        const intersectDepth = intersectMaxZ - intersectMinZ;
        const intersectCenterX = (intersectMinX + intersectMaxX) / 2;
        const intersectCenterZ = (intersectMinZ + intersectMaxZ) / 2;
        
        // Создаём часть платформы в этом чанке
        const platform = this.createBox(
            "sand_platform",
            { 
                width: intersectWidth, 
                height: this.config.platformHeight, 
                depth: intersectDepth 
            },
            new Vector3(
                intersectCenterX - worldX,
                this.config.platformHeight / 2,
                intersectCenterZ - worldZ
            ),
            "concrete",
            chunkParent,
            true
        );
    }
    
    /**
     * Генерация рамп для заезда на платформу
     * 4 улучшенные рампы по сторонам света с боковыми ограждениями
     */
    private generateRamps(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const platformHalf = this.config.platformSize / 2;
        const rampWidth = 10; // Увеличена ширина для удобства
        const rampDepth = 8; // Увеличена глубина
        const rampHeight = this.config.platformHeight;
        const rampThickness = 0.5;
        
        // Позиции рамп (относительно центра карты 0,0)
        const rampPositions = [
            { x: 0, z: platformHalf + rampDepth / 2, direction: "north" },      // Север
            { x: 0, z: -(platformHalf + rampDepth / 2), direction: "south" }, // Юг
            { x: platformHalf + rampDepth / 2, z: 0, direction: "east" },    // Восток
            { x: -(platformHalf + rampDepth / 2), z: 0, direction: "west" }   // Запад
        ];
        
        rampPositions.forEach((pos, index) => {
            const chunkCenterX = worldX + size / 2;
            const chunkCenterZ = worldZ + size / 2;
            
            // Проверяем, попадает ли рамп в этот чанк
            const rampMinX = pos.x - rampWidth / 2;
            const rampMaxX = pos.x + rampWidth / 2;
            const rampMinZ = pos.z - rampDepth / 2;
            const rampMaxZ = pos.z + rampDepth / 2;
            
            const chunkMinX = worldX;
            const chunkMaxX = worldX + size;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + size;
            
            if (chunkMaxX < rampMinX || chunkMinX > rampMaxX ||
                chunkMaxZ < rampMinZ || chunkMinZ > rampMaxZ) {
                return; // Рампа не в этом чанке
            }
            
            // Вычисляем позицию рампы относительно чанка
            const localX = pos.x - worldX;
            const localZ = pos.z - worldZ;
            
            // Определяем направление наклона
            // Цель: во всех случаях рампа поднимается от внешнего края к центру платформы.
            let rotationX = 0;
            let rotationZ = 0;

            // E и W правильные, оставляем их как есть.
            // По твоему запросу: N и S меняем местами по наклону.
            if (pos.direction === "north") {
                rotationX = Math.PI / 6; // как была S
            } else if (pos.direction === "south") {
                rotationX = -Math.PI / 6; // как была N
            } else if (pos.direction === "east") {
                rotationZ = -Math.PI / 6; // Правильная, оставляем
            } else if (pos.direction === "west") {
                rotationZ = Math.PI / 6;
            }
            
            // Создаём основную рампу
            const ramp = MeshBuilder.CreateBox(`sand_ramp_${index}`, {
                width: rampWidth,
                height: rampThickness,
                depth: rampDepth
            }, this.scene);
            ramp.position = new Vector3(localX, rampHeight / 2 - rampThickness / 2, localZ);
            ramp.rotation.x = rotationX;
            ramp.rotation.z = rotationZ;
            ramp.material = this.getMat("concrete");
            ramp.parent = chunkParent;
            ramp.freezeWorldMatrix();
            new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Добавляем боковые ограждения для безопасности
            const barrierHeight = 0.8;
            const barrierThickness = 0.3;
            
            if (pos.direction === "north" || pos.direction === "south") {
                // Боковые ограждения для север/юг рамп
                const leftBarrier = MeshBuilder.CreateBox(`sand_ramp_barrier_l_${index}`, {
                    width: barrierThickness,
                    height: barrierHeight,
                    depth: rampDepth
                }, this.scene);
                leftBarrier.position = new Vector3(localX - rampWidth / 2 + barrierThickness / 2, rampHeight / 2 + barrierHeight / 2, localZ);
                leftBarrier.rotation.x = rotationX;
                leftBarrier.material = this.getMat("concrete");
                leftBarrier.parent = chunkParent;
                leftBarrier.freezeWorldMatrix();
                new PhysicsAggregate(leftBarrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                
                const rightBarrier = MeshBuilder.CreateBox(`sand_ramp_barrier_r_${index}`, {
                    width: barrierThickness,
                    height: barrierHeight,
                    depth: rampDepth
                }, this.scene);
                rightBarrier.position = new Vector3(localX + rampWidth / 2 - barrierThickness / 2, rampHeight / 2 + barrierHeight / 2, localZ);
                rightBarrier.rotation.x = rotationX;
                rightBarrier.material = this.getMat("concrete");
                rightBarrier.parent = chunkParent;
                rightBarrier.freezeWorldMatrix();
                new PhysicsAggregate(rightBarrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else {
                // Боковые ограждения для восток/запад рамп
                const leftBarrier = MeshBuilder.CreateBox(`sand_ramp_barrier_l_${index}`, {
                    width: rampDepth,
                    height: barrierHeight,
                    depth: barrierThickness
                }, this.scene);
                leftBarrier.position = new Vector3(localX, rampHeight / 2 + barrierHeight / 2, localZ - rampWidth / 2 + barrierThickness / 2);
                leftBarrier.rotation.z = rotationZ;
                leftBarrier.material = this.getMat("concrete");
                leftBarrier.parent = chunkParent;
                leftBarrier.freezeWorldMatrix();
                new PhysicsAggregate(leftBarrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                
                const rightBarrier = MeshBuilder.CreateBox(`sand_ramp_barrier_r_${index}`, {
                    width: rampDepth,
                    height: barrierHeight,
                    depth: barrierThickness
                }, this.scene);
                rightBarrier.position = new Vector3(localX, rampHeight / 2 + barrierHeight / 2, localZ + rampWidth / 2 - barrierThickness / 2);
                rightBarrier.rotation.z = rotationZ;
                rightBarrier.material = this.getMat("concrete");
                rightBarrier.parent = chunkParent;
                rightBarrier.freezeWorldMatrix();
                new PhysicsAggregate(rightBarrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        });
    }
    
    /**
     * Генерация контейнеров и укрытий в фиксированных позициях
     * Улучшенная версия с разнообразием размеров и позиций
     */
    private generateContainers(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        
        // Фиксированные позиции контейнеров (симметрично)
        // Контейнеры разных размеров для тактического разнообразия
        const containerPositions = [
            // Большие контейнеры по углам (высокие укрытия)
            { x: -arenaHalf + 12, z: -arenaHalf + 12, width: 4, height: 3.5, depth: 8, rotation: 0, material: "metal" },
            { x: arenaHalf - 12, z: -arenaHalf + 12, width: 4, height: 3.5, depth: 8, rotation: Math.PI / 2, material: "metal" },
            { x: arenaHalf - 12, z: arenaHalf - 12, width: 4, height: 3.5, depth: 8, rotation: Math.PI, material: "metal" },
            { x: -arenaHalf + 12, z: arenaHalf - 12, width: 4, height: 3.5, depth: 8, rotation: -Math.PI / 2, material: "metal" },
            
            // Средние контейнеры по сторонам
            { x: 0, z: arenaHalf - 18, width: 3, height: 2.5, depth: 6, rotation: 0, material: "red" },
            { x: 0, z: -arenaHalf + 18, width: 3, height: 2.5, depth: 6, rotation: Math.PI, material: "red" },
            { x: arenaHalf - 18, z: 0, width: 3, height: 2.5, depth: 6, rotation: Math.PI / 2, material: "blue" },
            { x: -arenaHalf + 18, z: 0, width: 3, height: 2.5, depth: 6, rotation: -Math.PI / 2, material: "blue" },
            
            // Дополнительные контейнеры между углами и центром (малые)
            { x: -35, z: -35, width: 2.5, height: 2, depth: 5, rotation: Math.PI / 4, material: "metal" },
            { x: 35, z: -35, width: 2.5, height: 2, depth: 5, rotation: -Math.PI / 4, material: "metal" },
            { x: 35, z: 35, width: 2.5, height: 2, depth: 5, rotation: Math.PI / 4, material: "metal" },
            { x: -35, z: 35, width: 2.5, height: 2, depth: 5, rotation: -Math.PI / 4, material: "metal" },
            
            // Дополнительные контейнеры ближе к центру (для тактики)
            { x: -22, z: -22, width: 2, height: 1.8, depth: 4, rotation: Math.PI / 4, material: "metal" },
            { x: 22, z: -22, width: 2, height: 1.8, depth: 4, rotation: -Math.PI / 4, material: "metal" },
            { x: 22, z: 22, width: 2, height: 1.8, depth: 4, rotation: Math.PI / 4, material: "metal" },
            { x: -22, z: 22, width: 2, height: 1.8, depth: 4, rotation: -Math.PI / 4, material: "metal" },
            
            // Контейнеры в промежуточных позициях
            { x: -45, z: 0, width: 2.5, height: 2.2, depth: 5.5, rotation: 0, material: "metal" },
            { x: 45, z: 0, width: 2.5, height: 2.2, depth: 5.5, rotation: Math.PI, material: "metal" },
            { x: 0, z: -45, width: 2.5, height: 2.2, depth: 5.5, rotation: Math.PI / 2, material: "metal" },
            { x: 0, z: 45, width: 2.5, height: 2.2, depth: 5.5, rotation: -Math.PI / 2, material: "metal" }
        ];
        
        containerPositions.forEach((pos, index) => {
            const chunkCenterX = worldX + size / 2;
            const chunkCenterZ = worldZ + size / 2;
            
            // Проверяем, попадает ли контейнер в этот чанк
            const containerMinX = pos.x - pos.width / 2;
            const containerMaxX = pos.x + pos.width / 2;
            const containerMinZ = pos.z - pos.depth / 2;
            const containerMaxZ = pos.z + pos.depth / 2;
            
            const chunkMinX = worldX;
            const chunkMaxX = worldX + size;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + size;
            
            if (chunkMaxX < containerMinX || chunkMinX > containerMaxX ||
                chunkMaxZ < containerMinZ || chunkMinZ > containerMaxZ) {
                return; // Контейнер не в этом чанке
            }
            
            // Получаем высоту террейна (0 для плоской карты)
            const terrainHeight = this.getTerrainHeight(pos.x, pos.z, "wasteland");
            
            // Создаём контейнер
            const container = this.createBox(
                `sand_container_${index}`,
                { width: pos.width, height: pos.height, depth: pos.depth },
                new Vector3(
                    pos.x - worldX,
                    terrainHeight + pos.height / 2,
                    pos.z - worldZ
                ),
                pos.material,
                chunkParent,
                true
            );
            container.rotation.y = pos.rotation;
        });
    }
    
    /**
     * Генерация стен периметра
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = MAP_SIZES.sand?.wallHeight ?? 4;
        const wallThickness = 1;
        
        // Проверяем, находится ли чанк на границе арены
        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;
        
        // Северная стена (z = arenaHalf)
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createBox(
                    "sand_wall_n",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, arenaHalf - worldZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
        
        // Южная стена (z = -arenaHalf)
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createBox(
                    "sand_wall_s",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
        
        // Восточная стена (x = arenaHalf)
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createBox(
                    "sand_wall_e",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
        
        // Западная стена (x = -arenaHalf)
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createBox(
                    "sand_wall_w",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
    }
    
    /**
     * Генерация низких стен-укрытий и декоративных элементов
     * Улучшенная версия с большим разнообразием укрытий
     */
    private generateCoverWalls(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        
        // Низкие стены для укрытия в фиксированных позициях
        const coverWalls = [
            // Вокруг центральной платформы (диагональные)
            { x: -28, z: -28, width: 10, depth: 1.8, height: 1.8, rotation: Math.PI / 4 },
            { x: 28, z: -28, width: 10, depth: 1.8, height: 1.8, rotation: -Math.PI / 4 },
            { x: 28, z: 28, width: 10, depth: 1.8, height: 1.8, rotation: Math.PI / 4 },
            { x: -28, z: 28, width: 10, depth: 1.8, height: 1.8, rotation: -Math.PI / 4 },
            
            // По сторонам от платформы (прямые)
            { x: -24, z: 0, width: 8, depth: 1.8, height: 1.8, rotation: 0 },
            { x: 24, z: 0, width: 8, depth: 1.8, height: 1.8, rotation: 0 },
            { x: 0, z: -24, width: 8, depth: 1.8, height: 1.8, rotation: Math.PI / 2 },
            { x: 0, z: 24, width: 8, depth: 1.8, height: 1.8, rotation: Math.PI / 2 },
            
            // Дополнительные укрытия в промежуточных зонах
            { x: -40, z: -15, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 6 },
            { x: 40, z: -15, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 6 },
            { x: -40, z: 15, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 6 },
            { x: 40, z: 15, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 6 },
            { x: -15, z: -40, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 3 },
            { x: 15, z: -40, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 3 },
            { x: -15, z: 40, width: 6, depth: 1.5, height: 1.5, rotation: -Math.PI / 3 },
            { x: 15, z: 40, width: 6, depth: 1.5, height: 1.5, rotation: Math.PI / 3 },
            
            // Маленькие укрытия для тактики
            { x: -50, z: -50, width: 4, depth: 1.2, height: 1.2, rotation: Math.PI / 4 },
            { x: 50, z: -50, width: 4, depth: 1.2, height: 1.2, rotation: -Math.PI / 4 },
            { x: 50, z: 50, width: 4, depth: 1.2, height: 1.2, rotation: Math.PI / 4 },
            { x: -50, z: 50, width: 4, depth: 1.2, height: 1.2, rotation: -Math.PI / 4 }
        ];
        
        coverWalls.forEach((wall, index) => {
            const chunkCenterX = worldX + size / 2;
            const chunkCenterZ = worldZ + size / 2;
            
            // Проверяем, попадает ли стена в этот чанк
            const wallMinX = wall.x - wall.width / 2;
            const wallMaxX = wall.x + wall.width / 2;
            const wallMinZ = wall.z - wall.depth / 2;
            const wallMaxZ = wall.z + wall.depth / 2;
            
            const chunkMinX = worldX;
            const chunkMaxX = worldX + size;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + size;
            
            if (chunkMaxX < wallMinX || chunkMinX > wallMaxX ||
                chunkMaxZ < wallMinZ || chunkMinZ > wallMaxZ) {
                return; // Стена не в этом чанке
            }
            
            const terrainHeight = this.getTerrainHeight(wall.x, wall.z, "wasteland");
            
            const coverWall = this.createBox(
                `sand_cover_wall_${index}`,
                { width: wall.width, height: wall.height, depth: wall.depth },
                new Vector3(
                    wall.x - worldX,
                    terrainHeight + wall.height / 2,
                    wall.z - worldZ
                ),
                "concrete",
                chunkParent,
                true
            );
            coverWall.rotation.y = wall.rotation;
        });
        
        // Добавляем декоративные ящики для тактического разнообразия
        this.generateDecorativeBoxes(context);
    }
    
    /**
     * Генерация декоративных ящиков и баррикад
     */
    private generateDecorativeBoxes(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        
        // Маленькие ящики для тактического укрытия
        const boxes = [
            // Ящики вокруг центра
            { x: -18, z: -18, size: 1.5, height: 1.2 },
            { x: 18, z: -18, size: 1.5, height: 1.2 },
            { x: 18, z: 18, size: 1.5, height: 1.2 },
            { x: -18, z: 18, size: 1.5, height: 1.2 },
            
            // Ящики в промежуточных зонах
            { x: -32, z: 0, size: 1.2, height: 1.0 },
            { x: 32, z: 0, size: 1.2, height: 1.0 },
            { x: 0, z: -32, size: 1.2, height: 1.0 },
            { x: 0, z: 32, size: 1.2, height: 1.0 },
            
            // Ящики по краям
            { x: -55, z: -20, size: 1.0, height: 0.8 },
            { x: 55, z: -20, size: 1.0, height: 0.8 },
            { x: -55, z: 20, size: 1.0, height: 0.8 },
            { x: 55, z: 20, size: 1.0, height: 0.8 },
            { x: -20, z: -55, size: 1.0, height: 0.8 },
            { x: 20, z: -55, size: 1.0, height: 0.8 },
            { x: -20, z: 55, size: 1.0, height: 0.8 },
            { x: 20, z: 55, size: 1.0, height: 0.8 }
        ];
        
        boxes.forEach((box, index) => {
            const chunkMinX = worldX;
            const chunkMaxX = worldX + size;
            const chunkMinZ = worldZ;
            const chunkMaxZ = worldZ + size;
            
            const boxMinX = box.x - box.size / 2;
            const boxMaxX = box.x + box.size / 2;
            const boxMinZ = box.z - box.size / 2;
            const boxMaxZ = box.z + box.size / 2;
            
            if (chunkMaxX < boxMinX || chunkMinX > boxMaxX ||
                chunkMaxZ < boxMinZ || chunkMinZ > boxMaxZ) {
                return;
            }
            
            const terrainHeight = this.getTerrainHeight(box.x, box.z, "wasteland");
            
            const decorativeBox = this.createBox(
                `sand_box_${index}`,
                { width: box.size, height: box.height, depth: box.size },
                new Vector3(
                    box.x - worldX,
                    terrainHeight + box.height / 2,
                    box.z - worldZ
                ),
                "wood",
                chunkParent,
                true
            );
            // Случайный поворот для разнообразия
            decorativeBox.rotation.y = Math.random() * Math.PI * 2;
        });
    }
}

export default SandGenerator;

