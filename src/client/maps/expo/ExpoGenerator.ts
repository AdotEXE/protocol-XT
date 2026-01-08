/**
 * @module maps/expo/ExpoGenerator
 * @description Генератор карты "Экспо" - расширенная киберспортивная арена
 * 
 * Расширенная киберспортивная карта с:
 * - Большим размером (200x200)
 * - Множеством уровней (5 уровней)
 * - Полыми постройками с проездами (ворота, двери, окна, отверстия)
 * - Большим количеством мостов
 * - Дорогами и множеством домов/зданий
 * - Тактическими позициями и укрытиями
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
 * Конфигурация карты Экспо
 */
export interface ExpoConfig {
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
    /** Высота пятого уровня */
    level5Height: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_EXPO_CONFIG: ExpoConfig = {
    arenaSize: MAP_SIZES.expo?.size ?? 200,
    level1Height: 3.0,
    level2Height: 6.0,
    level3Height: 9.0,
    level4Height: 12.0,
    level5Height: 15.0
};

/**
 * Генератор карты "Экспо"
 * 
 * Расширенная киберспортивная арена:
 * - 5 уровней высоты
 * - Полые постройки с проездами
 * - Множество мостов и рамп
 * - Дороги и здания
 */
export class ExpoGenerator extends BaseMapGenerator {
    readonly mapType = "expo";
    readonly displayName = "Экспо";
    readonly description = "Расширенная киберспортивная арена с множеством уровней и постройками";
    
    /** Конфигурация генератора */
    private config: ExpoConfig;
    
    constructor(config: Partial<ExpoConfig> = {}) {
        super();
        this.config = { ...DEFAULT_EXPO_CONFIG, ...config };
    }
    
    /**
     * Основной метод генерации контента чанка
     */
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size } = context;
        const arenaHalf = this.config.arenaSize / 2; // 100 для карты 200x200
        
        // Проверяем, находится ли чанк в области карты
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        const mapMinX = -arenaHalf;
        const mapMaxX = arenaHalf;
        const mapMinZ = -arenaHalf;
        const mapMaxZ = arenaHalf;
        
        // Если чанк не пересекается с картой, ничего не генерируем
        if (chunkMaxX < mapMinX || chunkMinX > mapMaxX ||
            chunkMaxZ < mapMinZ || chunkMinZ > mapMaxZ) {
            return;
        }
        
        // Генерируем элементы только если чанк пересекается с картой
        this.generateRoads(context);
        this.generatePlatforms(context);
        this.generateFloatingPlatforms(context);
        this.generateBridges(context);
        this.generateAngledBridges(context);
        this.generateRamps(context);
        this.generateHollowBuildings(context);
        this.generateHouses(context);
        this.generateTacticalCover(context);
        this.generatePerimeter(context);
    }
    
    /**
     * Генерация дорог
     */
    private generateRoads(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const roadWidth = 8;
        const roadThickness = 0.2;
        
        // Главные дороги (крест)
        // Горизонтальная дорога
        const roadH = MeshBuilder.CreateBox("road_horizontal", {
            width: this.config.arenaSize,
            height: roadThickness,
            depth: roadWidth
        }, chunkParent.getScene());
        roadH.position.x = 0;
        roadH.position.y = roadThickness / 2;
        roadH.position.z = 0;
        
        // Вертикальная дорога
        const roadV = MeshBuilder.CreateBox("road_vertical", {
            width: roadWidth,
            height: roadThickness,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        roadV.position.x = 0;
        roadV.position.y = roadThickness / 2;
        roadV.position.z = 0;
        
        // Диагональные дороги
        const diagLength = this.config.arenaSize * 0.7;
        const diagAngle = Math.PI / 4;
        
        // Диагональ 1 (северо-восток - юго-запад)
        const roadD1 = MeshBuilder.CreateBox("road_diagonal_1", {
            width: roadWidth,
            height: roadThickness,
            depth: diagLength
        }, chunkParent.getScene());
        roadD1.position.x = 0;
        roadD1.position.y = roadThickness / 2;
        roadD1.position.z = 0;
        roadD1.rotation.y = diagAngle;
        
        // Диагональ 2 (северо-запад - юго-восток)
        const roadD2 = MeshBuilder.CreateBox("road_diagonal_2", {
            width: roadWidth,
            height: roadThickness,
            depth: diagLength
        }, chunkParent.getScene());
        roadD2.position.x = 0;
        roadD2.position.y = roadThickness / 2;
        roadD2.position.z = 0;
        roadD2.rotation.y = -diagAngle;
        
        // Материал дорог
        const roadMaterial = new StandardMaterial("road_material", chunkParent.getScene());
        roadMaterial.diffuseColor = new Color3(0.2, 0.2, 0.25);
        roadMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
        roadH.material = roadMaterial;
        roadV.material = roadMaterial;
        roadD1.material = roadMaterial;
        roadD2.material = roadMaterial;
        
        // Физика дорог
        [roadH, roadV, roadD1, roadD2].forEach(road => {
            const physicsAggregate = new PhysicsAggregate(
                road,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
    
    /**
     * Генерация платформ разных уровней (УПРОЩЕНО)
     */
    private generatePlatforms(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        
        // ========== УРОВЕНЬ 1: Центральная платформа (большая) ==========
        this.generatePlatform(context, 0, 0, 60, this.config.level1Height, "platform_l1_center");
        
        // ========== УРОВЕНЬ 2: Угловые базы (4 штуки) ==========
        const cornerBasePos = arenaHalf - 50;
        this.generatePlatform(context, cornerBasePos, cornerBasePos, 30, this.config.level2Height, "platform_l2_corner_1");
        this.generatePlatform(context, -cornerBasePos, cornerBasePos, 30, this.config.level2Height, "platform_l2_corner_2");
        this.generatePlatform(context, -cornerBasePos, -cornerBasePos, 30, this.config.level2Height, "platform_l2_corner_3");
        this.generatePlatform(context, cornerBasePos, -cornerBasePos, 30, this.config.level2Height, "platform_l2_corner_4");
        
        // ========== УРОВЕНЬ 3: Центральная башня ==========
        this.generatePlatform(context, 0, 0, 25, this.config.level3Height, "platform_l3_tower");
        
        // ========== УРОВЕНЬ 5: Самая высокая центральная башня ==========
        this.generatePlatform(context, 0, 0, 15, this.config.level5Height, "platform_l5_tower");
    }
    
    /**
     * Генерация плавающих платформ в воздухе (УПРОЩЕНО)
     */
    private generateFloatingPlatforms(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const maxPos = arenaHalf - 10;
        
        // Только несколько плавающих платформ для разнообразия
        const floatHeight25 = (this.config.level2Height + this.config.level3Height) / 2; // 7.5м
        this.generatePlatform(context, 40, 40, 12, floatHeight25, "float_platform_1");
        this.generatePlatform(context, -40, -40, 12, floatHeight25, "float_platform_2");
        
        const floatHeight35 = (this.config.level3Height + this.config.level4Height) / 2; // 10.5м
        this.generatePlatform(context, 50, 0, 10, floatHeight35, "float_platform_3");
        this.generatePlatform(context, -50, 0, 10, floatHeight35, "float_platform_4");
    }
    
    /**
     * Создание одной платформы
     */
    private generatePlatform(
        context: ChunkGenerationContext,
        centerX: number,
        centerZ: number,
        platformSize: number,
        height: number,
        name: string
    ): void {
        const { chunkParent } = context;
        
        const platform = MeshBuilder.CreateBox(name, {
            width: platformSize,
            height: 0.5,
            depth: platformSize
        }, chunkParent.getScene());
        
        platform.position.x = centerX;
        platform.position.y = height;
        platform.position.z = centerZ;
        
        // Материал платформы
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.7, 0.7, 0.75);
        material.specularColor = new Color3(0.3, 0.3, 0.3);
        platform.material = material;
        
        // Физика
        const physicsAggregate = new PhysicsAggregate(
            platform,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Генерация мостов от пола ко всем уровням
     */
    private generateBridges(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const groundLevel = 0;
        
        // Размеры платформ
        const level1Size = 60;
        const level2Size = 30;
        const level3Size = 20;
        const level4Size = 18;
        const level5Size = 15;
        const level1Edge = level1Size / 2;
        const level2Edge = level2Size / 2;
        const level3Edge = level3Size / 2;
        const level4Edge = level4Size / 2;
        const level5Edge = level5Size / 2;
        
        const cornerBasePos = arenaHalf - 50;
        const level2CornerEdgeX = cornerBasePos - level2Edge;
        const level2CornerEdgeZ = cornerBasePos - level2Edge;
        
        const level3Pos = arenaHalf - 70;
        const level3EdgeX = level3Pos - level3Edge;
        const level3EdgeZ = level3Pos - level3Edge;
        
        const level4Pos = arenaHalf - 60;
        
        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 1 ==========
        this.createBridge(context, 0, 40, groundLevel, 0, level1Edge, this.config.level1Height, 10, "bridge_ground_l1_n");
        this.createBridge(context, 0, -40, groundLevel, 0, -level1Edge, this.config.level1Height, 10, "bridge_ground_l1_s");
        this.createBridge(context, 40, 0, groundLevel, level1Edge, 0, this.config.level1Height, 10, "bridge_ground_l1_e");
        this.createBridge(context, -40, 0, groundLevel, -level1Edge, 0, this.config.level1Height, 10, "bridge_ground_l1_w");
        
        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 2 (угловые базы) ==========
        const edgeStart = Math.min(arenaHalf - 30, 70); // Не выходить за границы
        this.createBridge(context, -edgeStart, -edgeStart, groundLevel, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 8, "bridge_ground_l2_1");
        this.createBridge(context, edgeStart, -edgeStart, groundLevel, -level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 8, "bridge_ground_l2_2");
        this.createBridge(context, edgeStart, edgeStart, groundLevel, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 8, "bridge_ground_l2_3");
        this.createBridge(context, -edgeStart, edgeStart, groundLevel, level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 8, "bridge_ground_l2_4");
        
        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 2 (боковые платформы) ==========
        const sideStart = Math.min(arenaHalf - 25, 75); // Не выходить за границы
        this.createBridge(context, 0, -sideStart, groundLevel, 0, -cornerBasePos + level2Edge, this.config.level2Height, 8, "bridge_ground_l2_n");
        this.createBridge(context, 0, sideStart, groundLevel, 0, cornerBasePos - level2Edge, this.config.level2Height, 8, "bridge_ground_l2_s");
        this.createBridge(context, sideStart, 0, groundLevel, cornerBasePos - level2Edge, 0, this.config.level2Height, 8, "bridge_ground_l2_e");
        this.createBridge(context, -sideStart, 0, groundLevel, -cornerBasePos + level2Edge, 0, this.config.level2Height, 8, "bridge_ground_l2_w");
        
        // ========== МОСТЫ ОТ УРОВНЯ 1 К УРОВНЮ 2 ==========
        this.createBridge(context, level1Edge, level1Edge, this.config.level1Height, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 8, "bridge_l1_l2_1");
        this.createBridge(context, -level1Edge, -level1Edge, this.config.level1Height, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 8, "bridge_l1_l2_2");
        
        // ========== МОСТЫ ОТ УРОВНЯ 1 К УРОВНЮ 3 ==========
        this.createBridge(context, 0, level1Edge, this.config.level1Height, 0, level3Edge, this.config.level3Height, 7, "bridge_l1_l3_n");
        this.createBridge(context, level1Edge, 0, this.config.level1Height, level3Edge, 0, this.config.level3Height, 7, "bridge_l1_l3_e");
        
        // ========== МОСТЫ ОТ УРОВНЯ 2 К УРОВНЮ 3 ==========
        this.createBridge(context, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, level3EdgeX, level3EdgeZ, this.config.level3Height, 7, "bridge_l2_l3_1");
        this.createBridge(context, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, -level3EdgeX, -level3EdgeZ, this.config.level3Height, 7, "bridge_l2_l3_2");
        
        // ========== МОСТЫ ОТ УРОВНЯ 3 К УРОВНЮ 5 ==========
        this.createBridge(context, 0, level3Edge, this.config.level3Height, 0, level5Edge, this.config.level5Height, 5, "bridge_l3_l5_n");
        this.createBridge(context, level3Edge, 0, this.config.level3Height, level5Edge, 0, this.config.level5Height, 5, "bridge_l3_l5_e");
        
        // ========== МОСТЫ ОТ ПОЛА К УРОВНЮ 3, 4, 5 ==========
        this.createBridge(context, -25, -25, groundLevel, -level3Edge, -level3Edge, this.config.level3Height, 6, "bridge_ground_l3_1");
        this.createBridge(context, 25, -25, groundLevel, level3Edge, -level3Edge, this.config.level3Height, 6, "bridge_ground_l3_2");
        this.createBridge(context, 25, 25, groundLevel, level3Edge, level3Edge, this.config.level3Height, 6, "bridge_ground_l3_3");
        this.createBridge(context, -25, 25, groundLevel, -level3Edge, level3Edge, this.config.level3Height, 6, "bridge_ground_l3_4");
        
        this.createBridge(context, -20, -20, groundLevel, -level4Edge, -level4Edge, this.config.level4Height, 5, "bridge_ground_l4_1");
        this.createBridge(context, 20, -20, groundLevel, level4Edge, -level4Edge, this.config.level4Height, 5, "bridge_ground_l4_2");
        
        this.createBridge(context, -15, -15, groundLevel, -level5Edge, -level5Edge, this.config.level5Height, 4, "bridge_ground_l5_1");
        this.createBridge(context, 15, -15, groundLevel, level5Edge, -level5Edge, this.config.level5Height, 4, "bridge_ground_l5_2");
        this.createBridge(context, 15, 15, groundLevel, level5Edge, level5Edge, this.config.level5Height, 4, "bridge_ground_l5_3");
        this.createBridge(context, -15, 15, groundLevel, -level5Edge, level5Edge, this.config.level5Height, 4, "bridge_ground_l5_4");
        
        // ========== ДОПОЛНИТЕЛЬНЫЕ МОСТЫ МЕЖДУ ВСЕМИ УРОВНЯМИ ==========
        // Мосты от уровня 1 к уровню 4
        this.createBridge(context, level1Edge * 0.6, 0, this.config.level1Height, level4Pos - level4Edge, 0, this.config.level4Height, 6, "bridge_l1_l4_e");
        this.createBridge(context, -level1Edge * 0.6, 0, this.config.level1Height, -level4Pos + level4Edge, 0, this.config.level4Height, 6, "bridge_l1_l4_w");
        this.createBridge(context, 0, level1Edge * 0.6, this.config.level1Height, 0, level4Pos - level4Edge, this.config.level4Height, 6, "bridge_l1_l4_n");
        this.createBridge(context, 0, -level1Edge * 0.6, this.config.level1Height, 0, -level4Pos + level4Edge, this.config.level4Height, 6, "bridge_l1_l4_s");
        
        // Мосты от уровня 1 к уровню 5
        this.createBridge(context, level1Edge * 0.5, level1Edge * 0.5, this.config.level1Height, level5Edge * 0.8, level5Edge * 0.8, this.config.level5Height, 5, "bridge_l1_l5_ne");
        this.createBridge(context, -level1Edge * 0.5, level1Edge * 0.5, this.config.level1Height, -level5Edge * 0.8, level5Edge * 0.8, this.config.level5Height, 5, "bridge_l1_l5_nw");
        this.createBridge(context, -level1Edge * 0.5, -level1Edge * 0.5, this.config.level1Height, -level5Edge * 0.8, -level5Edge * 0.8, this.config.level5Height, 5, "bridge_l1_l5_sw");
        this.createBridge(context, level1Edge * 0.5, -level1Edge * 0.5, this.config.level1Height, level5Edge * 0.8, -level5Edge * 0.8, this.config.level5Height, 5, "bridge_l1_l5_se");
        
        // Мосты от уровня 2 к уровню 5 (диагональные)
        this.createBridge(context, level2CornerEdgeX * 0.8, level2CornerEdgeZ * 0.8, this.config.level2Height, level5Edge * 0.6, level5Edge * 0.6, this.config.level5Height, 5, "bridge_l2_l5_diag_1");
        this.createBridge(context, -level2CornerEdgeX * 0.8, level2CornerEdgeZ * 0.8, this.config.level2Height, -level5Edge * 0.6, level5Edge * 0.6, this.config.level5Height, 5, "bridge_l2_l5_diag_2");
        this.createBridge(context, -level2CornerEdgeX * 0.8, -level2CornerEdgeZ * 0.8, this.config.level2Height, -level5Edge * 0.6, -level5Edge * 0.6, this.config.level5Height, 5, "bridge_l2_l5_diag_3");
        this.createBridge(context, level2CornerEdgeX * 0.8, -level2CornerEdgeZ * 0.8, this.config.level2Height, level5Edge * 0.6, -level5Edge * 0.6, this.config.level5Height, 5, "bridge_l2_l5_diag_4");
        
        // Мосты от уровня 3 к уровню 5 (диагональные)
        this.createBridge(context, level3EdgeX * 0.7, level3EdgeZ * 0.7, this.config.level3Height, level5Edge * 0.5, level5Edge * 0.5, this.config.level5Height, 5, "bridge_l3_l5_diag_1");
        this.createBridge(context, -level3EdgeX * 0.7, level3EdgeZ * 0.7, this.config.level3Height, -level5Edge * 0.5, level5Edge * 0.5, this.config.level5Height, 5, "bridge_l3_l5_diag_2");
        this.createBridge(context, -level3EdgeX * 0.7, -level3EdgeZ * 0.7, this.config.level3Height, -level5Edge * 0.5, -level5Edge * 0.5, this.config.level5Height, 5, "bridge_l3_l5_diag_3");
        this.createBridge(context, level3EdgeX * 0.7, -level3EdgeZ * 0.7, this.config.level3Height, level5Edge * 0.5, -level5Edge * 0.5, this.config.level5Height, 5, "bridge_l3_l5_diag_4");
    }
    
    /**
     * Генерация мостов под углами (до 45 градусов) к плавающим платформам
     */
    private generateAngledBridges(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const groundLevel = 0;
        
        // Мосты к плавающим платформам уровня 2.5
        const floatHeight25 = (this.config.level2Height + this.config.level3Height) / 2;
        const floatSize25 = 12;
        const floatEdge25 = floatSize25 / 2;
        
        // Мосты от земли под углом ~30-40 градусов
        this.createAngledBridge(context, 20, 20, groundLevel, 30, 30, floatHeight25, 6, "angled_bridge_float_1");
        this.createAngledBridge(context, -20, 20, groundLevel, -30, 30, floatHeight25, 6, "angled_bridge_float_2");
        this.createAngledBridge(context, -20, -20, groundLevel, -30, -30, floatHeight25, 6, "angled_bridge_float_3");
        this.createAngledBridge(context, 20, -20, groundLevel, 30, -30, floatHeight25, 6, "angled_bridge_float_4");
        
        // Мосты от уровня 1 к плавающим платформам 2.5
        const level1Size = 60;
        const level1Edge = level1Size / 2;
        this.createAngledBridge(context, level1Edge * 0.5, level1Edge * 0.5, this.config.level1Height, 30, 30, floatHeight25, 6, "angled_bridge_l1_float_1");
        this.createAngledBridge(context, -level1Edge * 0.5, level1Edge * 0.5, this.config.level1Height, -30, 30, floatHeight25, 6, "angled_bridge_l1_float_2");
        this.createAngledBridge(context, -level1Edge * 0.5, -level1Edge * 0.5, this.config.level1Height, -30, -30, floatHeight25, 6, "angled_bridge_l1_float_3");
        this.createAngledBridge(context, level1Edge * 0.5, -level1Edge * 0.5, this.config.level1Height, 30, -30, floatHeight25, 6, "angled_bridge_l1_float_4");
        
        // Мосты к плавающим платформам уровня 3.5
        const floatHeight35 = (this.config.level3Height + this.config.level4Height) / 2;
        const floatSize35 = 10;
        const floatEdge35 = floatSize35 / 2;
        
        // Мосты от уровня 2 к плавающим платформам 3.5 под углом ~35 градусов
        const cornerBasePos = arenaHalf - 50;
        const level2Size = 30;
        const level2Edge = level2Size / 2;
        const level2CornerEdgeX = cornerBasePos - level2Edge;
        const level2CornerEdgeZ = cornerBasePos - level2Edge;
        
        this.createAngledBridge(context, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 50, 0, floatHeight35, 5, "angled_bridge_l2_float_1");
        this.createAngledBridge(context, -level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, -50, 0, floatHeight35, 5, "angled_bridge_l2_float_2");
        this.createAngledBridge(context, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 0, -50, floatHeight35, 5, "angled_bridge_l2_float_3");
        this.createAngledBridge(context, level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 0, 50, floatHeight35, 5, "angled_bridge_l2_float_4");
        
        // Мосты от уровня 3 к плавающим платформам 3.5
        const level3Size = 20;
        const level3Edge = level3Size / 2;
        this.createAngledBridge(context, level3Edge, 0, this.config.level3Height, 50, 0, floatHeight35, 5, "angled_bridge_l3_float_1");
        this.createAngledBridge(context, -level3Edge, 0, this.config.level3Height, -50, 0, floatHeight35, 5, "angled_bridge_l3_float_2");
        this.createAngledBridge(context, 0, level3Edge, this.config.level3Height, 0, 50, floatHeight35, 5, "angled_bridge_l3_float_3");
        this.createAngledBridge(context, 0, -level3Edge, this.config.level3Height, 0, -50, floatHeight35, 5, "angled_bridge_l3_float_4");
        
        // Мосты к плавающим платформам уровня 4.5
        const floatHeight45 = (this.config.level4Height + this.config.level5Height) / 2;
        const floatSize45 = 8;
        const floatEdge45 = floatSize45 / 2;
        
        // Мосты от уровня 4 к плавающим платформам 4.5 под углом ~40 градусов
        const level4Pos = arenaHalf - 60;
        const level4Size = 18;
        const level4Edge = level4Size / 2;
        this.createAngledBridge(context, level4Pos - level4Edge, 0, this.config.level4Height, 40, 40, floatHeight45, 4, "angled_bridge_l4_float_1");
        this.createAngledBridge(context, -level4Pos + level4Edge, 0, this.config.level4Height, -40, 40, floatHeight45, 4, "angled_bridge_l4_float_2");
        this.createAngledBridge(context, 0, level4Pos - level4Edge, this.config.level4Height, -40, 40, floatHeight45, 4, "angled_bridge_l4_float_3");
        this.createAngledBridge(context, 0, -level4Pos + level4Edge, this.config.level4Height, 40, -40, floatHeight45, 4, "angled_bridge_l4_float_4");
        
        // Мосты к высоким плавающим платформам
        const floatHeightHigh = this.config.level5Height + 3;
        const floatSizeHigh = 6;
        const floatEdgeHigh = floatSizeHigh / 2;
        
        // Мосты от уровня 5 к высоким плавающим платформам под углом ~45 градусов
        const level5Size = 15;
        const level5Edge = level5Size / 2;
        this.createAngledBridge(context, level5Edge, level5Edge, this.config.level5Height, 60, 60, floatHeightHigh, 4, "angled_bridge_l5_float_1");
        this.createAngledBridge(context, -level5Edge, level5Edge, this.config.level5Height, -60, 60, floatHeightHigh, 4, "angled_bridge_l5_float_2");
        this.createAngledBridge(context, -level5Edge, -level5Edge, this.config.level5Height, -60, -60, floatHeightHigh, 4, "angled_bridge_l5_float_3");
        this.createAngledBridge(context, level5Edge, -level5Edge, this.config.level5Height, 60, -60, floatHeightHigh, 4, "angled_bridge_l5_float_4");
        
        // Мосты между плавающими платформами под углами
        // Между платформами 2.5 и 3.5
        this.createAngledBridge(context, 30, 30, floatHeight25, 50, 0, floatHeight35, 5, "angled_bridge_float_25_35_1");
        this.createAngledBridge(context, -30, 30, floatHeight25, -50, 0, floatHeight35, 5, "angled_bridge_float_25_35_2");
        
        // Между платформами 3.5 и 4.5
        this.createAngledBridge(context, 50, 0, floatHeight35, 40, 40, floatHeight45, 4, "angled_bridge_float_35_45_1");
        this.createAngledBridge(context, -50, 0, floatHeight35, -40, 40, floatHeight45, 4, "angled_bridge_float_35_45_2");
        
        // Между платформами 4.5 и высокими
        this.createAngledBridge(context, 40, 40, floatHeight45, 60, 60, floatHeightHigh, 4, "angled_bridge_float_45_high_1");
        this.createAngledBridge(context, -40, 40, floatHeight45, -60, 60, floatHeightHigh, 4, "angled_bridge_float_45_high_2");
        
        // Мосты к угловым плавающим платформам
        const cornerFloatPos = Math.min(arenaHalf - 30, 70); // Не выходить за границы
        const cornerFloatSize = 10;
        const cornerFloatEdge = cornerFloatSize / 2;
        const cornerFloatHeight = this.config.level3Height;
        
        // От земли под углом ~30 градусов (ВНУТРИ границ!)
        const cornerStart = Math.min(arenaHalf - 40, 60);
        this.createAngledBridge(context, -cornerStart, -cornerStart, groundLevel, cornerFloatPos - cornerFloatEdge, cornerFloatPos - cornerFloatEdge, cornerFloatHeight, 6, "angled_bridge_corner_1");
        this.createAngledBridge(context, cornerStart, -cornerStart, groundLevel, -cornerFloatPos + cornerFloatEdge, cornerFloatPos - cornerFloatEdge, cornerFloatHeight, 6, "angled_bridge_corner_2");
        this.createAngledBridge(context, cornerStart, cornerStart, groundLevel, -cornerFloatPos + cornerFloatEdge, -cornerFloatPos + cornerFloatEdge, cornerFloatHeight, 6, "angled_bridge_corner_3");
        this.createAngledBridge(context, -cornerStart, cornerStart, groundLevel, cornerFloatPos - cornerFloatEdge, -cornerFloatPos + cornerFloatEdge, cornerFloatHeight, 6, "angled_bridge_corner_4");
        
        // От уровня 2 к угловым плавающим платформам
        this.createAngledBridge(context, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, cornerFloatPos - cornerFloatEdge, cornerFloatPos - cornerFloatEdge, cornerFloatHeight, 5, "angled_bridge_l2_corner_1");
        this.createAngledBridge(context, -level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, -cornerFloatPos + cornerFloatEdge, cornerFloatPos - cornerFloatEdge, cornerFloatHeight, 5, "angled_bridge_l2_corner_2");
        this.createAngledBridge(context, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, -cornerFloatPos + cornerFloatEdge, -cornerFloatPos + cornerFloatEdge, cornerFloatHeight, 5, "angled_bridge_l2_corner_3");
        this.createAngledBridge(context, level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, cornerFloatPos - cornerFloatEdge, -cornerFloatPos + cornerFloatEdge, cornerFloatHeight, 5, "angled_bridge_l2_corner_4");
    }
    
    /**
     * Создание моста под углом (до 45 градусов)
     */
    private createAngledBridge(
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
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        const totalDistance = Math.sqrt(horizontalDistance * horizontalDistance + dy * dy);
        
        // Проверяем, что угол не больше 45 градусов
        const angle = Math.atan2(dy, horizontalDistance);
        if (angle > Math.PI / 4) {
            // Если угол больше 45 градусов, уменьшаем высоту
            const maxHeight = horizontalDistance * Math.tan(Math.PI / 4);
            const adjustedY2 = y1 + maxHeight;
            return this.createAngledBridge(context, x1, z1, y1, x2, z2, adjustedY2, width, name);
        }
        
        const pitchAngle = angle;
        
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
     * Создание одного мостика между двумя точками
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
     * Генерация рамп для соединения уровней
     */
    private generateRamps(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const groundLevel = 0;
        
        const level1Size = 60;
        const level2Size = 30;
        const level1Edge = level1Size / 2;
        const level2Edge = level2Size / 2;
        
        const cornerBasePos = arenaHalf - 50;
        const level2CornerEdgeX = cornerBasePos - level2Edge;
        const level2CornerEdgeZ = cornerBasePos - level2Edge;
        
        // Рампы от земли к уровню 1 (только 2 для доступа)
        this.createRamp(context, 30, 30, groundLevel, level1Edge * 0.7, level1Edge * 0.7, this.config.level1Height, 10, 8, "ramp_ground_l1_ne");
        this.createRamp(context, -30, -30, groundLevel, -level1Edge * 0.7, -level1Edge * 0.7, this.config.level1Height, 10, 8, "ramp_ground_l1_sw");
        
        // Рампы между уровнями (только 2)
        this.createRamp(context, level1Edge * 0.8, level1Edge * 0.8, this.config.level1Height, level2CornerEdgeX, level2CornerEdgeZ, this.config.level2Height, 8, 6, "ramp_l1_l2_1");
        this.createRamp(context, -level1Edge * 0.8, -level1Edge * 0.8, this.config.level1Height, -level2CornerEdgeX, -level2CornerEdgeZ, this.config.level2Height, 8, 6, "ramp_l1_l2_2");
        
        // Рампы к уровню 3 (только 2)
        const level3Size = 20;
        const level3Edge = level3Size / 2;
        this.createRamp(context, level1Edge * 0.6, 0, this.config.level1Height, level3Edge, 0, this.config.level3Height, 7, 5, "ramp_l1_l3_e");
        this.createRamp(context, 0, level1Edge * 0.6, this.config.level1Height, 0, level3Edge, this.config.level3Height, 7, 5, "ramp_l1_l3_n");
    }
    
    /**
     * Создание одной рампы
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
        const pitchAngle = Math.atan2(dy, totalDistance);
        
        const ramp = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, chunkParent.getScene());
        
        ramp.position.x = (x1 + x2) / 2;
        ramp.position.y = (y1 + y2) / 2;
        ramp.position.z = (z1 + z2) / 2;
        
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
     * Генерация полых построек с проездами (УПРОЩЕНО)
     */
    private generateHollowBuildings(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        
        // Только несколько зданий
        this.createHollowBuilding(context, 40, 40, 0, 15, 15, 8, "building_hollow_1", "gate");
        this.createHollowBuilding(context, -40, -40, 0, 15, 15, 8, "building_hollow_2", "gate");
        this.createHollowBuilding(context, 60, 0, 0, 12, 12, 6, "building_door_1", "door");
        this.createHollowBuilding(context, -60, 0, 0, 12, 12, 6, "building_door_2", "door");
    }
    
    /**
     * Создание полого здания с проездом
     */
    private createHollowBuilding(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        baseY: number,
        width: number,
        depth: number,
        height: number,
        name: string,
        openingType: "gate" | "door" | "windows"
    ): void {
        const { chunkParent } = context;
        const wallThickness = 1;
        const openingSize = openingType === "gate" ? 6 : openingType === "door" ? 4 : 3;
        
        // Пол здания
        const floor = MeshBuilder.CreateBox(`${name}_floor`, {
            width: width,
            height: 0.2,
            depth: depth
        }, chunkParent.getScene());
        floor.position.x = x;
        floor.position.y = baseY;
        floor.position.z = z;
        
        // Стены здания (4 стены с проездами)
        // Северная стена
        if (openingType === "windows") {
            // Стена с несколькими проездами
            this.createWallWithOpenings(context, x, z + depth/2, baseY, width, height, wallThickness, "north", openingSize, 3, `${name}_wall_n`);
        } else {
            this.createWallWithOpening(context, x, z + depth/2, baseY, width, height, wallThickness, "north", openingSize, `${name}_wall_n`);
        }
        
        // Южная стена
        if (openingType === "windows") {
            this.createWallWithOpenings(context, x, z - depth/2, baseY, width, height, wallThickness, "south", openingSize, 3, `${name}_wall_s`);
        } else {
            this.createWallWithOpening(context, x, z - depth/2, baseY, width, height, wallThickness, "south", openingSize, `${name}_wall_s`);
        }
        
        // Восточная стена
        if (openingType === "windows") {
            this.createWallWithOpenings(context, x + width/2, z, baseY, depth, height, wallThickness, "east", openingSize, 3, `${name}_wall_e`);
        } else {
            this.createWallWithOpening(context, x + width/2, z, baseY, depth, height, wallThickness, "east", openingSize, `${name}_wall_e`);
        }
        
        // Западная стена
        if (openingType === "windows") {
            this.createWallWithOpenings(context, x - width/2, z, baseY, depth, height, wallThickness, "west", openingSize, 3, `${name}_wall_w`);
        } else {
            this.createWallWithOpening(context, x - width/2, z, baseY, depth, height, wallThickness, "west", openingSize, `${name}_wall_w`);
        }
        
        // Крыша
        const roof = MeshBuilder.CreateBox(`${name}_roof`, {
            width: width,
            height: 0.2,
            depth: depth
        }, chunkParent.getScene());
        roof.position.x = x;
        roof.position.y = baseY + height;
        roof.position.z = z;
        
        // Материал
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.5, 0.5, 0.55);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        floor.material = material;
        roof.material = material;
        
        // Физика
        [floor, roof].forEach(mesh => {
            const physicsAggregate = new PhysicsAggregate(
                mesh,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
    
    /**
     * Создание стены с одним проездом
     */
    private createWallWithOpening(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        length: number,
        height: number,
        thickness: number,
        direction: "north" | "south" | "east" | "west",
        openingSize: number,
        name: string
    ): void {
        const { chunkParent } = context;
        const wallHeight = height;
        const openingHeight = Math.min(openingSize, height - 1);
        
        // Левая часть стены
        const leftWall = MeshBuilder.CreateBox(`${name}_left`, {
            width: direction === "north" || direction === "south" ? (length - openingSize) / 2 : thickness,
            height: wallHeight,
            depth: direction === "east" || direction === "west" ? (length - openingSize) / 2 : thickness
        }, chunkParent.getScene());
        
        // Правая часть стены
        const rightWall = MeshBuilder.CreateBox(`${name}_right`, {
            width: direction === "north" || direction === "south" ? (length - openingSize) / 2 : thickness,
            height: wallHeight,
            depth: direction === "east" || direction === "west" ? (length - openingSize) / 2 : thickness
        }, chunkParent.getScene());
        
        // Позиционирование
        if (direction === "north" || direction === "south") {
            leftWall.position.x = x - (length - openingSize) / 4;
            leftWall.position.z = z;
            rightWall.position.x = x + (length - openingSize) / 4;
            rightWall.position.z = z;
        } else {
            leftWall.position.x = x;
            leftWall.position.z = z - (length - openingSize) / 4;
            rightWall.position.x = x;
            rightWall.position.z = z + (length - openingSize) / 4;
        }
        
        leftWall.position.y = y + wallHeight / 2;
        rightWall.position.y = y + wallHeight / 2;
        
        // Материал
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.5, 0.5, 0.55);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        leftWall.material = material;
        rightWall.material = material;
        
        // Физика
        [leftWall, rightWall].forEach(wall => {
            const physicsAggregate = new PhysicsAggregate(
                wall,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
    
    /**
     * Создание стены с несколькими проездами (окна)
     */
    private createWallWithOpenings(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        length: number,
        height: number,
        thickness: number,
        direction: "north" | "south" | "east" | "west",
        openingSize: number,
        numOpenings: number,
        name: string
    ): void {
        const { chunkParent } = context;
        const totalOpeningSize = openingSize * numOpenings;
        const wallSegmentSize = (length - totalOpeningSize) / (numOpenings + 1);
        
        for (let i = 0; i <= numOpenings; i++) {
            const segmentX = direction === "north" || direction === "south" 
                ? x - length/2 + wallSegmentSize/2 + i * (wallSegmentSize + openingSize)
                : x;
            const segmentZ = direction === "east" || direction === "west"
                ? z - length/2 + wallSegmentSize/2 + i * (wallSegmentSize + openingSize)
                : z;
            
            const segment = MeshBuilder.CreateBox(`${name}_segment_${i}`, {
                width: direction === "north" || direction === "south" ? wallSegmentSize : thickness,
                height: height,
                depth: direction === "east" || direction === "west" ? wallSegmentSize : thickness
            }, chunkParent.getScene());
            
            segment.position.x = segmentX;
            segment.position.z = segmentZ;
            segment.position.y = y + height / 2;
            
            const material = new StandardMaterial(`${name}_mat_${i}`, chunkParent.getScene());
            material.diffuseColor = new Color3(0.5, 0.5, 0.55);
            material.specularColor = new Color3(0.2, 0.2, 0.2);
            segment.material = material;
            
            const physicsAggregate = new PhysicsAggregate(
                segment,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        }
    }
    
    /**
     * Генерация домов (УПРОЩЕНО)
     */
    private generateHouses(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const maxPos = arenaHalf - 10;
        
        // Только несколько домов
        this.createHouse(context, 50, 50, 0, 8, 8, 5, "house_1");
        this.createHouse(context, -50, -50, 0, 8, 8, 5, "house_2");
        this.createHouse(context, 70, 0, 0, 8, 8, 5, "house_3");
        this.createHouse(context, -70, 0, 0, 8, 8, 5, "house_4");
    }
    
    /**
     * Создание дома
     */
    private createHouse(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        baseY: number,
        width: number,
        depth: number,
        height: number,
        name: string
    ): void {
        const { chunkParent } = context;
        
        // Основание дома
        const base = MeshBuilder.CreateBox(`${name}_base`, {
            width: width,
            height: 0.3,
            depth: depth
        }, chunkParent.getScene());
        base.position.x = x;
        base.position.y = baseY;
        base.position.z = z;
        
        // Стены дома (сплошные, без проездов для маленьких домов)
        const wallThickness = 0.5;
        const wallHeight = height;
        
        // Северная стена
        const wallN = MeshBuilder.CreateBox(`${name}_wall_n`, {
            width: width,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        wallN.position.x = x;
        wallN.position.y = baseY + wallHeight / 2;
        wallN.position.z = z + depth / 2;
        
        // Южная стена
        const wallS = MeshBuilder.CreateBox(`${name}_wall_s`, {
            width: width,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        wallS.position.x = x;
        wallS.position.y = baseY + wallHeight / 2;
        wallS.position.z = z - depth / 2;
        
        // Восточная стена
        const wallE = MeshBuilder.CreateBox(`${name}_wall_e`, {
            width: wallThickness,
            height: wallHeight,
            depth: depth
        }, chunkParent.getScene());
        wallE.position.x = x + width / 2;
        wallE.position.y = baseY + wallHeight / 2;
        wallE.position.z = z;
        
        // Западная стена
        const wallW = MeshBuilder.CreateBox(`${name}_wall_w`, {
            width: wallThickness,
            height: wallHeight,
            depth: depth
        }, chunkParent.getScene());
        wallW.position.x = x - width / 2;
        wallW.position.y = baseY + wallHeight / 2;
        wallW.position.z = z;
        
        // Крыша
        const roof = MeshBuilder.CreateBox(`${name}_roof`, {
            width: width + 0.5,
            height: 0.3,
            depth: depth + 0.5
        }, chunkParent.getScene());
        roof.position.x = x;
        roof.position.y = baseY + height;
        roof.position.z = z;
        
        // Материал
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.6, 0.5, 0.4);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        base.material = material;
        wallN.material = material;
        wallS.material = material;
        wallE.material = material;
        wallW.material = material;
        roof.material = material;
        
        // Физика
        [base, wallN, wallS, wallE, wallW, roof].forEach(mesh => {
            const physicsAggregate = new PhysicsAggregate(
                mesh,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
    
    /**
     * Генерация тактических укрытий и контейнеров
     */
    private generateTacticalCover(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Контейнеры на разных уровнях
        const level1Size = 60;
        const level1Edge = level1Size / 2;
        
        // Контейнеры на уровне 1
        this.createContainer(context, level1Edge * 0.7, level1Edge * 0.7, this.config.level1Height + 0.25, 3, 3, 2.5, "container_l1_1");
        this.createContainer(context, -level1Edge * 0.7, level1Edge * 0.7, this.config.level1Height + 0.25, 3, 3, 2.5, "container_l1_2");
        this.createContainer(context, -level1Edge * 0.7, -level1Edge * 0.7, this.config.level1Height + 0.25, 3, 3, 2.5, "container_l1_3");
        this.createContainer(context, level1Edge * 0.7, -level1Edge * 0.7, this.config.level1Height + 0.25, 3, 3, 2.5, "container_l1_4");
        
        // Укрытия на земле
        this.createCoverWall(context, 25, 0, 0.5, 10, 2, 0.5, "cover_ground_1");
        this.createCoverWall(context, -25, 0, 0.5, 10, 2, 0.5, "cover_ground_2");
        this.createCoverWall(context, 0, 25, 0.5, 10, 2, 0.5, "cover_ground_3");
        this.createCoverWall(context, 0, -25, 0.5, 10, 2, 0.5, "cover_ground_4");
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
        material.specularColor = new Color3(0.3, 0.3, 0.3);
        container.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            container,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.2 },
            chunkParent.getScene()
        );
        
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Создание укрытия (низкая стена)
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
     * Генерация периметра (ЗАБОР/СТЕНКИ по краям арены)
     * ВЫСОКИЕ ЗАМЕТНЫЕ СТЕНЫ С ЯРКИМ МАТЕРИАЛОМ
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2; // 100 для карты 200x200
        const wallHeight = 8; // ВЫСОКИЕ СТЕНЫ
        const wallThickness = 2; // ТОЛСТЫЕ СТЕНЫ
        
        // Стены по периметру - ВИДИМЫЕ ГРАНИЦЫ КАРТЫ
        const northWall = MeshBuilder.CreateBox("wall_north", {
            width: this.config.arenaSize,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        northWall.position.x = 0;
        northWall.position.y = wallHeight / 2;
        northWall.position.z = arenaHalf;
        
        const southWall = MeshBuilder.CreateBox("wall_south", {
            width: this.config.arenaSize,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        southWall.position.x = 0;
        southWall.position.y = wallHeight / 2;
        southWall.position.z = -arenaHalf;
        
        const eastWall = MeshBuilder.CreateBox("wall_east", {
            width: wallThickness,
            height: wallHeight,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        eastWall.position.x = arenaHalf;
        eastWall.position.y = wallHeight / 2;
        eastWall.position.z = 0;
        
        const westWall = MeshBuilder.CreateBox("wall_west", {
            width: wallThickness,
            height: wallHeight,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        westWall.position.x = -arenaHalf;
        westWall.position.y = wallHeight / 2;
        westWall.position.z = 0;
        
        // ЯРКИЙ МАТЕРИАЛ ДЛЯ ЗАМЕТНОСТИ ГРАНИЦ
        const wallMaterial = new StandardMaterial("wall_material", chunkParent.getScene());
        wallMaterial.diffuseColor = new Color3(0.8, 0.3, 0.3); // КРАСНЫЙ ЦВЕТ ДЛЯ ЗАМЕТНОСТИ
        wallMaterial.specularColor = new Color3(0.4, 0.2, 0.2);
        wallMaterial.emissiveColor = new Color3(0.2, 0.0, 0.0); // СЛАБОЕ СВЕЧЕНИЕ
        northWall.material = wallMaterial;
        southWall.material = wallMaterial;
        eastWall.material = wallMaterial;
        westWall.material = wallMaterial;
        
        // Физика для всех стен
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
