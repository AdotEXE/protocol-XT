import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Color4,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType,
    Mesh,
    TransformNode,
    VertexBuffer,
    Animation,
    PointLight,
    EdgesRenderer,
    Matrix
} from "@babylonjs/core";
import { ThinInstanceManager, InstanceableObjectType, InstanceConfig } from "./optimization/ThinInstanceManager";
import { MaterialManager } from "./optimization/MaterialManager";
import { MapType } from "./menu";

// Интерфейс для requestIdleCallback (не во всех версиях TypeScript)
interface IdleDeadline {
    didTimeout: boolean;
    timeRemaining: () => number;
}
import { RoadNetwork } from "./roadNetwork";
import { TerrainGenerator, NoiseGenerator } from "./noiseGenerator";
import { CoverGenerator } from "./coverGenerator";
import { POISystem, POI } from "./poiSystem";
import { logger } from "./utils/logger";
import { getMapBoundsFromConfig, getMapSize, getWallHeight, getPlayerGaragePosition, MAP_SIZES } from "./maps/MapConstants";
// Импорт генераторов карт и фабрики
import {
    MapGeneratorFactory,
    PolygonGenerator,
    FrontlineGenerator,
    RuinsGenerator,
    CanyonGenerator,
    IndustrialGenerator,
    UrbanWarfareGenerator,
    UndergroundGenerator,
    CoastalGenerator,
    SandGenerator,
    MadnessGenerator,
    ExpoGenerator,
    BrestGenerator,
    ArenaGenerator,
    SeededRandom as MapsSeededRandom,
    GenerationContext,
    ChunkGenerationContext
} from "./maps";

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
    pick<T>(arr: T[]): T {
        if (arr.length === 0) throw new Error("Cannot pick from empty array");
        return arr[Math.floor(this.next() * arr.length)]!;
    }
}

interface ChunkData {
    x: number;
    z: number;
    node: TransformNode;
    meshes: Mesh[];
    loaded: boolean;
    lastAccess: number;
}

interface ChunkConfig {
    chunkSize: number;
    renderDistance: number;       // Дистанция прорисовки террейна (в чанках)
    detailsRenderDistance: number; // Дистанция прорисовки объектов/деталей (в чанках)
    unloadDistance: number;
    worldSeed: number;
    mapType?: MapType;
    enableTerrainEdges?: boolean; // Показывать рёбра полигонов террейна (по умолчанию false)
}

// Biome types for variety
type BiomeType = "city" | "industrial" | "residential" | "park" | "wasteland" | "military";

// Biome color definitions for smooth blending (RGB values 0-1)
const BIOME_COLORS: Record<BiomeType, { r: number; g: number; b: number }> = {
    city: { r: 0.3, g: 0.3, b: 0.35 },        // dark gray (asphalt)
    industrial: { r: 0.45, g: 0.4, b: 0.35 }, // gray-brown (gravel)
    residential: { r: 0.3, g: 0.45, b: 0.25 }, // dark green (lawn)
    park: { r: 0.4, g: 0.6, b: 0.3 },          // green (grass)
    wasteland: { r: 0.5, g: 0.4, b: 0.3 },     // brown (dirt)
    military: { r: 0.7, g: 0.6, b: 0.4 }       // tan (sand)
};

export class ChunkSystem {
    private scene: Scene;
    private config: ChunkConfig;

    // Public getter for mapType
    public get mapType(): MapType {
        return this.config.mapType || "normal";
    }

    private chunks: Map<string, ChunkData> = new Map();
    private materials: Map<string, StandardMaterial> = new Map();
    private lastPlayerChunk = { x: 0, z: 0 };

    // ОПТИМИЗАЦИЯ: Пулы базовых мешей для инстансинга
    private meshPools: Map<string, Mesh> = new Map();

    // ОПТИМИЗАЦИЯ: ThinInstanceManager для массового инстансинга повторяющихся объектов
    private thinInstanceManager: ThinInstanceManager | null = null;

    // ОПТИМИЗАЦИЯ: MaterialManager для централизованного управления материалами
    private materialManager: MaterialManager | null = null;

    // Позиции гаражей для спавна
    public garagePositions: Vector3[] = [];

    // Области гаражей (для исключения из генерации других объектов)
    private garageAreas: Array<{ x: number, z: number, width: number, depth: number }> = [];

    // Ворота гаражей (для открытия/закрытия)
    public garageDoors: Array<{
        frontDoor: Mesh,
        backDoor: Mesh,
        frontDoorPhysics: PhysicsAggregate,
        backDoorPhysics: PhysicsAggregate,
        position: Vector3,
        garageDepth: number,     // Глубина гаража для вычисления позиций ворот
        frontOpenY: number,
        backOpenY: number,
        frontClosedY: number,
        backClosedY: number,
        frontDoorOpen: boolean,  // Флаг состояния передних ворот
        backDoorOpen: boolean,   // Флаг состояния задних ворот
        manualControl: boolean,  // Флаг ручного управления
        manualControlTime: number  // Время последнего ручного управления
    }> = [];

    // Стены гаражей (для прозрачности когда игрок внутри)
    public garageWalls: Array<{
        walls: Mesh[],
        position: Vector3,
        width: number,
        depth: number
    }> = [];

    // Точки захвата гаражей (верстаки)
    public garageCapturePoints: Array<{
        wrench: Mesh, // Название оставлено для совместимости, но теперь это верстак
        position: Vector3,
        garageIndex: number
    }> = [];

    // Владение гаражами (Map<garageKey, { ownerId: string | null }>)
    public garageOwnership: Map<string, { ownerId: string | null }> = new Map();

    // Припасы на карте (для подбора)
    public consumablePickups: Array<{ mesh: Mesh, type: string, position: Vector3 }> = [];

    // Road network for procedural road generation
    private roadNetwork: RoadNetwork | null = null;

    // Публичный геттер для roadNetwork (для game.ts)
    public getRoadNetwork(): RoadNetwork | null {
        return this.roadNetwork;
    }

    // Terrain generator for heightmap (public for external access)
    public terrainGenerator: TerrainGenerator | null = null;

    // Cover generator for obstacles and cover objects
    private coverGenerator: CoverGenerator | null = null;

    // POI system for points of interest
    private poiSystem: POISystem | null = null;

    // Noise generator for biome transitions
    private biomeNoise: NoiseGenerator | null = null;

    // УЛУЧШЕНО: Biome cache for optimization с увеличенным размером
    private biomeCache: Map<string, BiomeType> = new Map();
    private static readonly MAX_BIOME_CACHE_SIZE = 50000; // УВЕЛИЧЕНО для лучшего кэширования

    // УЛУЧШЕНО: Кэш для проверки позиций гаража
    private garageAreaCache: Map<string, boolean> = new Map();
    private static readonly MAX_GARAGE_CACHE_SIZE = 10000;

    // Кеш для материалов с модификациями по высоте
    private heightTintedMaterials: Map<string, StandardMaterial> = new Map();

    // Кеш для контрастных цветов краев (Color4 для EdgesRenderer)
    private contrastEdgeColors: Map<string, Color4> = new Map();

    public stats = {
        loadedChunks: 0,
        totalMeshes: 0,
        lastUpdateTime: 0
    };

    // Границы карты для ограничения генерации террейна
    private mapBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

    /**
     * Получить границы карты для текущего типа карты
     * Все карты имеют ограниченный размер с естественными горными барьерами по краям
     * 
     * ВАЖНО: Использует централизованные константы из MapConstants.ts
     */
    public getMapBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
        if (this.mapBounds) return this.mapBounds;

        const mapType = this.config.mapType ?? "normal";

        // Используем централизованные константы из MapConstants.ts
        const bounds = getMapBoundsFromConfig(mapType);
        if (bounds) {
            this.mapBounds = bounds;
        } else {
            // Fallback для неизвестных карт - большой открытый мир
            this.mapBounds = { minX: -1250, maxX: 1250, minZ: -1250, maxZ: 1250 };
        }

        return this.mapBounds;
    }

    /**
     * Проверить, находится ли чанк в границах карты
     */
    private isChunkInBounds(cx: number, cz: number): boolean {
        const bounds = this.getMapBounds();
        if (!bounds) return true; // Бесконечный мир - все чанки разрешены

        const chunkSize = this.config.chunkSize;
        const chunkMinX = cx * chunkSize;
        const chunkMaxX = chunkMinX + chunkSize;
        const chunkMinZ = cz * chunkSize;
        const chunkMaxZ = chunkMinZ + chunkSize;

        // Чанк в границах если хотя бы частично пересекает границы карты
        return !(chunkMaxX < bounds.minX || chunkMinX > bounds.maxX ||
            chunkMaxZ < bounds.minZ || chunkMinZ > bounds.maxZ);
    }

    // ОПТИМИЗАЦИЯ: Прогрессивная загрузка чанков
    private chunkLoadQueue: Array<{ cx: number, cz: number, priority: number }> = [];
    private chunksLoading: Set<string> = new Set();
    private readonly MAX_CHUNKS_PER_FRAME = 1; // Загружать по 1 чанку за кадр
    private readonly INITIAL_LOAD_RADIUS = 1; // Начальный радиус загрузки
    private currentLoadRadius = 1;
    private spawnChunk = { x: 0, z: 0 }; // Чанк места спавна
    private progressiveLoadingEnabled = false; // Флаг включения прогрессивной загрузки
    private totalChunksInRadius = 0; // Общее количество чанков в радиусе видимости
    private loadedChunksInRadius = 0; // Загруженные чанки в радиусе

    // ОПТИМИЗАЦИЯ FPS: Очередь для ленивой генерации деталей через requestIdleCallback
    private detailsQueue: Array<{ cx: number, cz: number, chunkParent: TransformNode, seed: number }> = [];
    private isProcessingDetails = false;

    constructor(scene: Scene, config?: Partial<ChunkConfig>) {
        this.scene = scene;

        // Базовый конфиг
        const baseConfig = {
            chunkSize: 50,
            renderDistance: 4,           // Базовая дистанция террейна (x2 от старой)
            detailsRenderDistance: 4,    // Дистанция объектов = дистанции террейна
            unloadDistance: 6,
            worldSeed: Date.now(),
            mapType: "normal" as MapType,
            enableTerrainEdges: false,
            ...config
        };

        // КРИТИЧНО: Для ограниченных карт автоматически рассчитываем renderDistance
        // чтобы загружать ВСЮ карту, а не только область вокруг игрока
        const mapType = baseConfig.mapType;
        const mapBounds = getMapBoundsFromConfig(mapType);

        if (mapBounds) {
            const mapWidth = mapBounds.maxX - mapBounds.minX;
            const mapHeight = mapBounds.maxZ - mapBounds.minZ;
            const maxMapDimension = Math.max(mapWidth, mapHeight);

            // Рассчитываем сколько чанков нужно для покрытия всей карты
            // Добавляем +2 для запаса на границах
            const neededChunks = Math.ceil(maxMapDimension / baseConfig.chunkSize) + 2;
            const neededRenderDistance = Math.ceil(neededChunks / 2);

            // Для маленьких карт (polygon, frontline, canyon, sandbox, sand) загружаем всё
            // Увеличиваем дистанцию террейна в 2 раза для плавного перехода с туманом
            if (mapType === "polygon" || mapType === "frontline" ||
                mapType === "canyon" || mapType === "sandbox" || mapType === "sand" || mapType === "madness" || mapType === "expo" || mapType === "brest" || mapType === "arena") {
                // Террейн: покрываем всю карту x2 для тумана
                baseConfig.renderDistance = neededRenderDistance * 2;
                // Объекты: такая же дистанция как террейн
                baseConfig.detailsRenderDistance = neededRenderDistance * 2;
                baseConfig.unloadDistance = baseConfig.renderDistance + 2;
                logger.log(`[ChunkSystem] Bounded map "${mapType}": terrainDist=${baseConfig.renderDistance}, detailsDist=${baseConfig.detailsRenderDistance}`);
            }
        }

        this.config = baseConfig;
        // ChunkSystem constructor called

        // ОПТИМИЗАЦИЯ: Инициализируем MaterialManager (централизованный кэш материалов)
        // КРИТИЧНО: Сбрасываем singleton при смене scene (например, перезапуск игры)
        MaterialManager.reset();
        this.materialManager = MaterialManager.getInstance(this.scene);

        // Создаем локальный кэш материалов для обратной совместимости
        this.createMaterials();

        // ОПТИМИЗАЦИЯ: Инициализируем ThinInstanceManager для уменьшения draw calls
        this.thinInstanceManager = new ThinInstanceManager(this.scene);
        this.thinInstanceManager.initialize();

        // КРИТИЧНО: Создаём terrain generator для ВСЕХ типов карт, не только для "normal"!
        // Это необходимо для генерации террейна (ground mesh) во всех типах карт
        this.terrainGenerator = new TerrainGenerator(
            this.config.worldSeed,
            (x: number, z: number, margin: number) => this.isPositionInGarageArea(x, z, margin),
            this.config.mapType // Передаем mapType для специальной обработки (например, tartaria)
        );

        // Create separate noise generator for biome transitions (different seed offset)
        // Инициализируем для всех типов карт (нужно для горного барьера)
        this.biomeNoise = new NoiseGenerator(this.config.worldSeed + 12345);

        // Initialize road network and terrain generator for normal map
        if (this.config.mapType === "normal") {
            this.roadNetwork = new RoadNetwork(
                this.scene,
                {
                    worldSeed: this.config.worldSeed,
                    chunkSize: this.config.chunkSize,
                    highwaySpacing: 200,
                    streetSpacing: 40,
                    terrainGenerator: this.terrainGenerator
                },
                (x: number, z: number, margin: number) => this.isPositionInGarageArea(x, z, margin)
            );

            this.coverGenerator = new CoverGenerator(
                this.scene,
                {
                    worldSeed: this.config.worldSeed
                },
                (x: number, z: number, margin: number) => this.isPositionInGarageArea(x, z, margin)
            );

            this.poiSystem = new POISystem(
                this.scene,
                {
                    worldSeed: this.config.worldSeed,
                    poiSpacing: 150
                },
                (x: number, z: number, margin: number) => this.isPositionInGarageArea(x, z, margin)
            );

            // All generators initialized
        }

        // СРАЗУ создаём гаражи для спавна!
        this.createAllGarages();

        // Инициализируем генераторы карт
        this.initializeMapGenerators();

        // ChunkSystem initialized
    }

    /**
     * Создать контекст генерации для генераторов карт
     */
    private createGenerationContext(): GenerationContext {
        // Преобразуем garagePositions в формат { x, z }
        const garagePositionsArray = this.garagePositions.map(pos => ({
            x: pos.x,
            z: pos.z
        }));

        return {
            scene: this.scene,
            config: {
                chunkSize: this.config.chunkSize,
                renderDistance: this.config.renderDistance,
                unloadDistance: this.config.unloadDistance,
                worldSeed: this.config.worldSeed,
                mapType: this.config.mapType
            },
            materials: this.materials,
            garagePositions: garagePositionsArray,
            isPositionInGarageArea: (x: number, z: number, margin: number) =>
                this.isPositionInGarageArea(x, z, margin),
            isPositionNearRoad: (x: number, z: number, distance: number) =>
                this.isPositionNearRoad(x, z, distance),
            getTerrainHeight: (x: number, z: number, biome: string) => {
                if (!this.terrainGenerator) return 0;
                return this.terrainGenerator.getHeight(x, z, biome);
            },
            getMat: (name: string) => this.getMat(name)
        };
    }

    /**
     * Инициализировать и зарегистрировать все генераторы карт
     */
    private initializeMapGenerators(): void {
        const genContext = this.createGenerationContext();

        // Создаём и регистрируем генераторы
        const polygonGen = new PolygonGenerator();
        polygonGen.initialize(genContext);
        MapGeneratorFactory.register(polygonGen);
        // logger.log(`[ChunkSystem] Registered PolygonGenerator, mapType: ${polygonGen.mapType}`);

        const frontlineGen = new FrontlineGenerator();
        frontlineGen.initialize(genContext);
        MapGeneratorFactory.register(frontlineGen);
        // logger.log(`[ChunkSystem] Registered FrontlineGenerator, mapType: ${frontlineGen.mapType}`);

        const ruinsGen = new RuinsGenerator();
        ruinsGen.initialize(genContext);
        MapGeneratorFactory.register(ruinsGen);

        const canyonGen = new CanyonGenerator();
        canyonGen.initialize(genContext);
        MapGeneratorFactory.register(canyonGen);

        const industrialGen = new IndustrialGenerator();
        industrialGen.initialize(genContext);
        MapGeneratorFactory.register(industrialGen);

        const urbanGen = new UrbanWarfareGenerator();
        urbanGen.initialize(genContext);
        MapGeneratorFactory.register(urbanGen);

        const undergroundGen = new UndergroundGenerator();
        undergroundGen.initialize(genContext);
        MapGeneratorFactory.register(undergroundGen);

        const coastalGen = new CoastalGenerator();
        coastalGen.initialize(genContext);
        MapGeneratorFactory.register(coastalGen);

        const sandGen = new SandGenerator();
        sandGen.initialize(genContext);
        MapGeneratorFactory.register(sandGen);

        const madnessGen = new MadnessGenerator();
        madnessGen.initialize(genContext);
        MapGeneratorFactory.register(madnessGen);

        const expoGen = new ExpoGenerator();
        expoGen.initialize(genContext);
        MapGeneratorFactory.register(expoGen);

        const brestGen = new BrestGenerator();
        brestGen.initialize(genContext);
        MapGeneratorFactory.register(brestGen);

        const arenaGen = new ArenaGenerator();
        arenaGen.initialize(genContext);
        MapGeneratorFactory.register(arenaGen);
    }

    private createMaterials(): void {
        // FLAT colors only - NO gradients, realistic palette
        const mats: [string, number, number, number][] = [
            // Ground types - more muted, realistic
            ["asphalt", 0.12, 0.12, 0.12],      // Dark gray road
            ["concrete", 0.45, 0.43, 0.40],     // Gray concrete
            ["dirt", 0.35, 0.28, 0.20],         // Brown dirt
            ["sand", 0.65, 0.55, 0.40],         // Sandy
            ["gravel", 0.40, 0.38, 0.35],       // Gray gravel

            // Building materials - MORE MUTED, no bright whites
            ["brick", 0.45, 0.28, 0.20],        // Red brick
            ["brickDark", 0.30, 0.20, 0.15],    // Dark brick
            ["plaster", 0.55, 0.52, 0.48],      // Muted plaster (was too bright!)
            ["plasterYellow", 0.58, 0.52, 0.38],// Muted yellow building
            ["metal", 0.32, 0.34, 0.36],        // Metal gray
            ["metalRust", 0.40, 0.28, 0.20],    // Rusty metal
            ["glass", 0.22, 0.26, 0.30],        // Dark glass
            ["roof", 0.25, 0.22, 0.20],         // Dark roof
            ["roofRed", 0.45, 0.22, 0.18],      // Red roof
            ["roofGreen", 0.22, 0.30, 0.22],    // Green roof

            // Other - NO pure white, all muted
            ["wood", 0.42, 0.30, 0.18],         // Wood brown
            ["woodDark", 0.28, 0.20, 0.14],     // Dark wood
            ["white", 0.60, 0.58, 0.55],        // Muted off-white (was 0.80!)
            ["black", 0.08, 0.08, 0.08],        // Near black
            ["yellow", 0.65, 0.55, 0.12],       // Warning yellow (muted)
            ["red", 0.55, 0.18, 0.12],          // Red (muted)

            // Nature - more muted greens (NOT bright!)
            ["grass", 0.30, 0.38, 0.22],        // Muted grass
            ["grassDark", 0.22, 0.30, 0.18],    // Dark grass
            ["treeTrunk", 0.35, 0.28, 0.20],    // Tree trunk
            ["leaves", 0.25, 0.35, 0.20],       // Dark green leaves
            ["water", 0.15, 0.25, 0.35],        // Water (dark blue-green)
            ["rock", 0.35, 0.32, 0.30],         // Rock/stone
            
            // ОПТИМИЗАЦИЯ: Кэшированные материалы для объектов (вместо создания новых)
            ["tireBlack", 0.1, 0.1, 0.1],       // Черные шины
            ["barrelGreen", 0.1, 0.4, 0.1],     // Зеленые бочки
            ["barrelRed", 0.6, 0.1, 0.1],       // Красные бочки
            ["crateWood", 0.3, 0.25, 0.1],      // Деревянные ящики
            ["dummy", 0.2, 0.15, 0.1],          // Тренировочные манекены
            ["wreck", 0.2, 0.15, 0.1],          // Обломки техники
            ["targetRed", 0.9, 0.1, 0.1],       // Красные мишени
            ["ringWhite", 1.0, 1.0, 1.0],       // Белые кольца мишеней
            ["ringBlack", 0.0, 0.0, 0.0],       // Черные кольца мишеней
            ["movingTargetRed", 0.9, 0.1, 0.1], // Движущиеся мишени
        ];

        mats.forEach(([name, r, g, b]) => {
            const mat = new StandardMaterial(name, this.scene);
            mat.diffuseColor = new Color3(r, g, b);
            mat.specularColor = Color3.Black();
            mat.specularPower = 0;
            mat.freeze();
            this.materials.set(name, mat);
        });
        
        // ОПТИМИЗАЦИЯ: Специальные материалы с emissive (мишени)
        const targetMat = new StandardMaterial("targetRedEmissive", this.scene);
        targetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
        targetMat.emissiveColor = new Color3(0.3, 0, 0);
        targetMat.specularColor = Color3.Black();
        targetMat.freeze();
        this.materials.set("targetRedEmissive", targetMat);
        
        const movingTargetMat = new StandardMaterial("movingTargetRedEmissive", this.scene);
        movingTargetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
        movingTargetMat.emissiveColor = new Color3(0.3, 0, 0);
        movingTargetMat.specularColor = Color3.Black();
        movingTargetMat.freeze();
        this.materials.set("movingTargetRedEmissive", movingTargetMat);
        
        // ОПТИМИЗАЦИЯ: Материал дыма с прозрачностью
        const smokeMat = new StandardMaterial("smokeGray", this.scene);
        smokeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        smokeMat.alpha = 0.4;
        smokeMat.specularColor = Color3.Black();
        smokeMat.freeze();
        this.materials.set("smokeGray", smokeMat);
        
        // ОПТИМИЗАЦИЯ: Материал забора с прозрачностью
        const fenceMat = new StandardMaterial("fenceGray", this.scene);
        fenceMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
        fenceMat.alpha = 0.7;
        fenceMat.specularColor = Color3.Black();
        fenceMat.freeze();
        this.materials.set("fenceGray", fenceMat);
        
        // ОПТИМИЗАЦИЯ: Материал остановки с прозрачностью
        const shelterMat = new StandardMaterial("shelterGray", this.scene);
        shelterMat.diffuseColor = new Color3(0.4, 0.4, 0.5);
        shelterMat.alpha = 0.7;
        shelterMat.specularColor = Color3.Black();
        shelterMat.freeze();
        this.materials.set("shelterGray", shelterMat);
        
        // ОПТИМИЗАЦИЯ: Материал уличного фонаря с emissive
        const streetLightMat = new StandardMaterial("streetLight", this.scene);
        streetLightMat.diffuseColor = new Color3(1, 0.95, 0.8);
        streetLightMat.emissiveColor = new Color3(0.5, 0.45, 0.4);
        streetLightMat.specularColor = Color3.Black();
        streetLightMat.freeze();
        this.materials.set("streetLight", streetLightMat);
        
        // ОПТИМИЗАЦИЯ: Материалы припасов (consumables) с emissive
        const consumableTypes: { [key: string]: Color3 } = {
            "health": new Color3(1, 0, 0),
            "speed": new Color3(1, 1, 0),
            "armor": new Color3(0, 1, 1),
            "ammo": new Color3(1, 0.5, 0),
            "damage": new Color3(1, 0, 0)
        };
        for (const [type, color] of Object.entries(consumableTypes)) {
            const consMat = new StandardMaterial(`consumableMat_${type}`, this.scene);
            consMat.diffuseColor = color;
            consMat.emissiveColor = color.scale(0.8);
            consMat.specularColor = Color3.Black();
            consMat.disableLighting = true;
            consMat.freeze();
            this.materials.set(`consumable_${type}`, consMat);
        }
    }

    // Оптимизация меша (freeze + отключение ненужных вычислений)
    private optimizeMesh(mesh: Mesh): void {
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        mesh.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
        mesh.isPickable = false;

        // Дополнительные оптимизации для производительности
        if (mesh.material) {
            const mat = mesh.material as StandardMaterial;
            if (!mat.isFrozen) {
                mat.freeze();
            }
        }

        // Отключаем ненужные вычисления для статических объектов
        // mesh.computeBoundingInfo = false; // Removed: property doesn't exist on Mesh
    }

    // Батчинг одинаковых мешей для оптимизации
    private batchSimilarMeshes(meshes: Mesh[]): void {
        // Оптимизируем все меши чанка для максимальной производительности
        meshes.forEach(mesh => {
            if (mesh && !mesh.isDisposed()) {
                this.optimizeMesh(mesh);
            }
        });
    }

    // Helper to get material (with fallback)
    // ОПТИМИЗАЦИЯ: Использует MaterialManager для централизованного кэширования
    private getMat(name: string): StandardMaterial {
        // Сначала проверяем локальный кэш (для обратной совместимости)
        const localMat = this.materials.get(name);
        if (localMat) return localMat;

        // Затем используем глобальный MaterialManager
        if (this.materialManager) {
            return this.materialManager.get(name);
        }

        // Аварийный fallback
        const fallback = this.materials.get("concrete");
        if (fallback) return fallback;

        // Создаем default если ничего не существует
        const def = new StandardMaterial("default", this.scene);
        def.diffuseColor = new Color3(0.5, 0.5, 0.5);
        def.specularColor = Color3.Black();
        def.freeze();
        this.materials.set("default", def);
        return def;
    }

    /**
     * ОПТИМИЗАЦИЯ: Добавить инстансированный объект через ThinInstanceManager
     * Уменьшает draw calls для повторяющихся объектов (машины, заборы, контейнеры и т.д.)
     * 
     * @param objType - Тип объекта из ThinInstanceManager
     * @param position - Позиция объекта (в локальных координатах чанка)
     * @param chunkKey - Ключ чанка для отслеживания
     * @param rotationY - Угол поворота по Y (опционально)
     * @param scale - Масштаб (опционально)
     * @returns true если объект был добавлен как instance, false если нужно создать обычный меш
     */
    private addInstancedObject(
        objType: InstanceableObjectType,
        position: Vector3,
        chunkKey: string,
        rotationY?: number,
        scale?: Vector3
    ): boolean {
        if (!this.thinInstanceManager) return false;

        const config: InstanceConfig = {
            position: position,
            rotation: rotationY !== undefined ? new Vector3(0, rotationY, 0) : undefined,
            scale: scale
        };

        const idx = this.thinInstanceManager.addInstance(objType, config, chunkKey);
        return idx >= 0;
    }

    /**
     * Получить ключ чанка для ThinInstanceManager и других систем
     */
    private getChunkKey(cx: number, cz: number): string {
        return `${cx},${cz}`;
    }

    /**
     * Очистить инстансы чанка при выгрузке
     */
    private cleanupChunkInstances(cx: number, cz: number): void {
        if (!this.thinInstanceManager) return;
        const chunkKey = this.getChunkKey(cx, cz);
        this.thinInstanceManager.removeChunkInstances(chunkKey);
    }

    /**
     * ОПТИМИЗАЦИЯ: Создать невидимый коллайдер для инстансированного объекта
     * Позволяет использовать thin instances для визуала при сохранении физики
     * 
     * @param position - Позиция коллайдера (в локальных координатах чанка)
     * @param dimensions - Размеры коллайдера { width, height, depth }
     * @param rotationY - Поворот по Y (опционально)
     * @param chunkParent - Родительский узел чанка
     */
    private createInvisibleCollider(
        position: Vector3,
        dimensions: { width: number; height: number; depth: number },
        chunkParent: TransformNode,
        rotationY?: number
    ): void {
        const collider = MeshBuilder.CreateBox("collider", dimensions, this.scene);
        collider.position = position;
        if (rotationY !== undefined) {
            collider.rotation.y = rotationY;
        }
        collider.isVisible = false;
        collider.isPickable = false;
        collider.parent = chunkParent;
        collider.freezeWorldMatrix();

        // Добавляем физику к невидимому коллайдеру
        new PhysicsAggregate(collider, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    }

    /**
     * Получить контрастный цвет краев на основе яркости материала
     * Использует кеш для оптимизации
     * ИСПРАВЛЕНО: Возвращает Color4 (EdgesRenderer требует Color4, а не Color3)
     */
    private getContrastEdgeColor(materialName: string): Color4 {
        // Проверяем кеш
        const cached = this.contrastEdgeColors.get(materialName);
        if (cached) return cached;

        // Получаем базовый материал
        const baseMat = this.getMat(materialName);
        const baseColor = baseMat.diffuseColor;

        // Вычисляем яркость по формуле: 0.299*R + 0.587*G + 0.114*B
        const luminance = 0.299 * baseColor.r + 0.587 * baseColor.g + 0.114 * baseColor.b;

        // Определяем контрастный цвет на основе яркости
        // ИСПРАВЛЕНО: Используем Color4 с альфа-каналом для EdgesRenderer
        let edgeColor: Color4;
        if (luminance < 0.3) {
            // Темные материалы - светлые края
            edgeColor = new Color4(0.7, 0.7, 0.7, 1);
        } else if (luminance > 0.5) {
            // Светлые материалы - темные края
            edgeColor = new Color4(0.15, 0.15, 0.15, 1);
        } else {
            // Средние материалы - нейтральные края
            edgeColor = new Color4(0.4, 0.4, 0.4, 1);
        }

        // Сохраняем в кеш
        this.contrastEdgeColors.set(materialName, edgeColor);
        return edgeColor;
    }

    /**
     * Получить материал с модификацией цвета по высоте
     * Использует кеш для оптимизации (диапазоны высот: 0-2, 2-5, 5-10, 10+)
     */
    private getHeightTintedMaterial(baseMatName: string, height: number): StandardMaterial {
        // Определяем диапазон высоты для кеширования
        let heightRange: string;
        const absHeight = Math.abs(height);
        if (absHeight < 2) {
            heightRange = "0-2";
        } else if (absHeight < 5) {
            heightRange = "2-5";
        } else if (absHeight < 10) {
            heightRange = "5-10";
        } else {
            heightRange = "10+";
        }

        const cacheKey = `${baseMatName}_h${heightRange}`;

        // Проверяем кеш
        const cached = this.heightTintedMaterials.get(cacheKey);
        if (cached) return cached;

        // Получаем базовый материал и клонируем его
        const baseMat = this.getMat(baseMatName);
        const tintedMat = baseMat.clone(`${baseMatName}_tinted_${heightRange}`);

        // Вычисляем множитель для изменения яркости/насыщенности
        // УСИЛЕНО: Максимум +40% для очень высоких блоков (было +15%)
        const heightMultiplier = 0.85 + Math.min(absHeight / 15, 0.40);

        // Применяем модификацию цвета
        const baseColor = baseMat.diffuseColor;
        const tintedColor = baseColor.scale(heightMultiplier);

        // Для насыщенности: УСИЛЕНО - значительно увеличиваем различия между каналами RGB
        // Это делает цвет более насыщенным для высоких блоков
        const maxChannel = Math.max(tintedColor.r, tintedColor.g, tintedColor.b);
        const minChannel = Math.min(tintedColor.r, tintedColor.g, tintedColor.b);
        const saturationBoost = Math.min((absHeight / 15) * 0.25, 0.25); // УСИЛЕНО: До +25% насыщенности (было +10%)

        if (maxChannel > 0) {
            const currentSaturation = (maxChannel - minChannel) / maxChannel;
            const targetSaturation = Math.min(currentSaturation + saturationBoost, 1.0);

            // Применяем насыщенность
            const gray = maxChannel * (1 - targetSaturation);
            tintedMat.diffuseColor = new Color3(
                gray + (tintedColor.r - gray) * targetSaturation,
                gray + (tintedColor.g - gray) * targetSaturation,
                gray + (tintedColor.b - gray) * targetSaturation
            );
        } else {
            tintedMat.diffuseColor = tintedColor;
        }

        // Сохраняем настройки материала
        tintedMat.specularColor = Color3.Black();
        tintedMat.specularPower = 0;
        tintedMat.freeze();

        // Сохраняем в кеш
        this.heightTintedMaterials.set(cacheKey, tintedMat);
        return tintedMat;
    }

    /**
     * Вычислить среднюю высоту вершин для определения оттенка материала
     */
    private calculateAverageHeight(positions: Float32Array | number[] | null, _vertsPerSide: number): number {
        if (!positions || positions.length === 0) return 0;

        let totalHeight = 0;
        let count = 0;

        for (let i = 1; i < positions.length; i += 3) {
            const height = positions[i]; // Y координата
            if (height !== undefined && isFinite(height)) {
                totalHeight += height;
                count++;
            }
        }

        return count > 0 ? totalHeight / count : 0;
    }

    /**
     * Получить биом для позиции с учётом плавного перехода через шум.
     * Используется для vertex color blending на границах биомов.
     * УЛУЧШЕНО: Добавлены дополнительные слои шума для более плавных переходов между чанками.
     */
    private getBiomeColorAtPosition(worldX: number, worldZ: number): { r: number; g: number; b: number } {
        if (!this.biomeNoise) {
            return BIOME_COLORS.park; // Fallback
        }

        // Масштаб шума для переходов (меньше = более плавные переходы)
        const transitionScale = 0.015; // ~40-60m transition zones
        const detailScale = 0.008; // Крупномасштабный шум для основных зон

        // БАЗОВЫЕ слои шума для естественных переходов
        const n1 = (this.biomeNoise.fbm(worldX * detailScale, worldZ * detailScale, 3, 2.0, 0.5) + 1) / 2;
        const n2 = (this.biomeNoise.fbm(worldX * transitionScale + 500, worldZ * transitionScale + 500, 2, 2.0, 0.6) + 1) / 2;
        const n3 = (this.biomeNoise.fbm(worldX * detailScale * 0.5 - 300, worldZ * detailScale * 0.5 - 300, 2, 2.0, 0.4) + 1) / 2;

        // НОВЫЕ: Дополнительные слои шума для более плавных переходов между чанками
        // Мелкомасштабный шум для детализации переходов
        const n4 = (this.biomeNoise.fbm(worldX * transitionScale * 2.5 + 1000, worldZ * transitionScale * 2.5 + 1000, 2, 2.0, 0.5) + 1) / 2;
        // Среднемасштабный шум для плавного смешивания
        const n5 = (this.biomeNoise.fbm(worldX * transitionScale * 1.5 - 800, worldZ * transitionScale * 1.5 - 800, 3, 2.0, 0.55) + 1) / 2;
        // Высокочастотный шум для естественных вариаций
        const n6 = (this.biomeNoise.fbm(worldX * transitionScale * 4.0 + 2000, worldZ * transitionScale * 4.0 + 2000, 2, 2.0, 0.45) + 1) / 2;

        // Комбинированный шум с дополнительными слоями для более плавных переходов
        // Базовые слои: 40%, новые слои: 60% для лучшего смешивания
        const blendNoise = n1 * 0.2 + n2 * 0.15 + n3 * 0.1 + n4 * 0.2 + n5 * 0.2 + n6 * 0.15;

        // Расстояние от центра карты влияет на распределение биомов
        const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
        const distFactor = Math.min(dist / 400, 1); // 0 в центре, 1 на краях

        // Определяем веса биомов на основе шума и расстояния
        let weights: Record<BiomeType, number> = {
            city: 0,
            industrial: 0,
            residential: 0,
            park: 0,
            wasteland: 0,
            military: 0
        };

        // УЛУЧШЕНО: Используем smoothstep для более плавного смешивания весов
        const smoothBlend = blendNoise * blendNoise * (3 - 2 * blendNoise); // smoothstep для blendNoise

        // Центральная зона - больше города
        if (dist < 120) {
            // Используем smoothstep для плавных переходов
            const cityWeight = 0.6 - distFactor * 0.3;
            weights.city = cityWeight * (1 - smoothBlend * 0.2) + (cityWeight * 0.8) * (smoothBlend * 0.2);
            weights.industrial = 0.2 + smoothBlend * 0.15;
            weights.residential = 0.15;
            weights.park = 0.05 + smoothBlend * 0.1;
        }
        // Средняя зона - смешанная
        else if (dist < 250) {
            const zoneFactor = (dist - 120) / 130; // 0 to 1
            // Smoothstep для zoneFactor для более плавных переходов
            const smoothZoneFactor = zoneFactor * zoneFactor * (3 - 2 * zoneFactor);
            weights.city = (0.3 - smoothZoneFactor * 0.2) * (1 - smoothBlend * 0.3);
            weights.industrial = 0.2 + smoothZoneFactor * 0.1 + smoothBlend * 0.05;
            weights.residential = 0.25 + smoothZoneFactor * 0.1;
            weights.park = 0.15 + smoothBlend * 0.2;
            weights.wasteland = smoothZoneFactor * 0.1 + smoothBlend * 0.05;
            weights.military = smoothZoneFactor * 0.05 * smoothBlend;
        }
        // Внешняя зона - природа и военные объекты
        else {
            const outerFactor = Math.min((dist - 250) / 200, 1);
            // Smoothstep для outerFactor
            const smoothOuterFactor = outerFactor * outerFactor * (3 - 2 * outerFactor);
            weights.city = 0.05 * (1 - smoothOuterFactor) * (1 - smoothBlend * 0.3);
            weights.industrial = 0.1 * (1 - smoothOuterFactor * 0.5) * (1 - smoothBlend * 0.2);
            weights.residential = 0.15 * (1 - smoothOuterFactor * 0.7) * (1 - smoothBlend * 0.15);
            weights.park = 0.3 + smoothBlend * 0.15 + smoothOuterFactor * 0.05;
            weights.wasteland = 0.25 + smoothOuterFactor * 0.2 + smoothBlend * 0.1;
            weights.military = 0.15 + smoothOuterFactor * 0.15 * smoothBlend;
        }

        // Нормализуем веса
        let totalWeight = 0;
        for (const key in weights) {
            totalWeight += weights[key as BiomeType];
        }
        if (totalWeight > 0) {
            for (const key in weights) {
                weights[key as BiomeType] /= totalWeight;
            }
        }

        // Смешиваем цвета биомов по весам
        let r = 0, g = 0, b = 0;
        for (const biome in weights) {
            const w = weights[biome as BiomeType];
            const color = BIOME_COLORS[biome as BiomeType];
            r += color.r * w;
            g += color.g * w;
            b += color.b * w;
        }

        return { r, g, b };
    }

    /**
     * Применить vertex colors с учётом высоты И плавных переходов биомов.
     * Комбинирует height-based brightness с biome-based coloring.
     */
    private applyHeightVertexColors(
        ground: Mesh,
        positions: Float32Array | number[] | null,
        vertsPerSide: number,
        cornerX?: number,
        cornerZ?: number,
        chunkSize?: number
    ): void {
        if (!positions || positions.length === 0) return;

        // Находим минимальную и максимальную высоту для нормализации
        let minHeight = Infinity;
        let maxHeight = -Infinity;

        for (let i = 1; i < positions.length; i += 3) {
            const height = positions[i];
            if (height !== undefined && isFinite(height)) {
                minHeight = Math.min(minHeight, height);
                maxHeight = Math.max(maxHeight, height);
            }
        }

        // Если данные невалидные, выходим
        if (!isFinite(minHeight) || !isFinite(maxHeight)) return;

        const heightRange = Math.max(maxHeight - minHeight, 0.1);
        const colors: number[] = [];
        const subdivisions = vertsPerSide - 1;
        const cSize = chunkSize ?? this.config.chunkSize;

        // Если нет cornerX/cornerZ, используем только высотную модуляцию
        const useBiomeBlending = cornerX !== undefined && cornerZ !== undefined && this.biomeNoise !== null;

        // Создаем цвета для каждой вершины
        let vertexIndex = 0;
        for (let gz = 0; gz < vertsPerSide; gz++) {
            for (let gx = 0; gx < vertsPerSide; gx++) {
                const idx = vertexIndex * 3;
                const height = positions[idx + 1];

                if (height !== undefined && isFinite(height)) {
                    // Нормализуем высоту от 0 до 1
                    const normalizedHeight = heightRange > 0 ? (height - minHeight) / heightRange : 0;

                    // Модулятор яркости по высоте: низкие - темнее, высокие - светлее
                    // От 0.6 до 1.15 для сохранения читаемости цветов биомов
                    const brightness = 0.6 + normalizedHeight * 0.55;
                    const clampedBrightness = Math.min(brightness, 1.15);

                    let r: number, g: number, b: number;

                    if (useBiomeBlending) {
                        // Вычисляем мировые координаты вершины
                        // X: стандартный порядок от cornerX до cornerX + chunkSize
                        const worldX = cornerX! + (gx / subdivisions) * cSize;
                        // Z: ИНВЕРТИРОВАННЫЙ порядок! gz=0 → дальний край, gz=max → ближний край
                        const worldZ = cornerZ! + cSize - (gz / subdivisions) * cSize;

                        // Получаем цвет биома с плавным переходом
                        const biomeColor = this.getBiomeColorAtPosition(worldX, worldZ);

                        // УЛУЧШЕНО: Добавляем дополнительный слой шума для вариации яркости
                        // Это создаёт более естественные переходы между чанками
                        let brightnessVariation = 1.0;
                        if (this.biomeNoise) {
                            // Высокочастотный шум для мелких вариаций яркости
                            const brightnessNoise = (this.biomeNoise.fbm(worldX * 0.05, worldZ * 0.05, 2, 2.0, 0.5) + 1) / 2;
                            // Среднечастотный шум для плавных переходов
                            const smoothNoise = (this.biomeNoise.fbm(worldX * 0.02, worldZ * 0.02, 2, 2.0, 0.6) + 1) / 2;
                            // Комбинируем для естественной вариации
                            brightnessVariation = 0.92 + (brightnessNoise * 0.5 + smoothNoise * 0.5) * 0.16; // От 0.92 до 1.08
                        }

                        // Применяем яркость с вариацией к цвету биома
                        const finalBrightness = clampedBrightness * brightnessVariation;
                        r = biomeColor.r * finalBrightness;
                        g = biomeColor.g * finalBrightness;
                        b = biomeColor.b * finalBrightness;
                    } else {
                        // Без biome blending - только яркость (серый)
                        r = clampedBrightness;
                        g = clampedBrightness;
                        b = clampedBrightness;
                    }

                    // Ограничиваем значения цветов
                    colors.push(
                        Math.min(1.0, Math.max(0.0, r)),
                        Math.min(1.0, Math.max(0.0, g)),
                        Math.min(1.0, Math.max(0.0, b)),
                        1.0 // Alpha
                    );
                } else {
                    colors.push(0.5, 0.5, 0.5, 1.0); // Серый по умолчанию
                }

                vertexIndex++;
            }
        }

        // Применяем vertex colors
        ground.setVerticesData(VertexBuffer.ColorKind, colors);
    }

    // NOTE: getChunkKey moved to line ~588 for ThinInstanceManager integration

    private worldToChunk(x: number, z: number): { cx: number, cz: number } {
        return {
            cx: Math.floor(x / this.config.chunkSize),
            cz: Math.floor(z / this.config.chunkSize)
        };
    }

    private _guaranteedGarageCreated = false;

    update(playerPos: Vector3): void {
        const startTime = performance.now();
        const { cx, cz } = this.worldToChunk(playerPos.x, playerPos.z);

        // ОПТИМИЗАЦИЯ: При прогрессивной загрузке обновляем каждый кадр
        if (this.progressiveLoadingEnabled || cx !== this.lastPlayerChunk.x || cz !== this.lastPlayerChunk.z) {
            this.lastPlayerChunk = { x: cx, z: cz };
            this.updateChunks(cx, cz);
        }

        this.stats.lastUpdateTime = performance.now() - startTime;
    }

    // Создаёт все гаражи на карте
    private createAllGarages(): void {
        this._guaranteedGarageCreated = true;

        // В режиме песочницы создаём только один гараж в центре
        if (this.config.mapType === "sandbox") {
            this.createGarageAt(0, 0, 0);
            // Sandbox mode: Created garage and capture points
            return;
        }

        // Для карт "sand", "madness" и "brest" НЕ создаём гаражи - спавн будет случайным внутри карты
        if (this.config.mapType === "sand" || this.config.mapType === "madness" || this.config.mapType === "brest" || this.config.mapType === "arena") {
            // Sand/Madness/Brest/Arena map: No garages, random spawn inside map
            return;
        }

        // Для карты "expo" создаём ОДИН гараж в центре
        if (this.config.mapType === "expo") {
            const garagePos = getPlayerGaragePosition("expo") ?? [0, 0];
            this.createGarageAt(garagePos[0], garagePos[1], 0);
            // Expo map: Created single garage at center
            return;
        }

        // В режиме полигона создаём гараж в углу арены
        if (this.config.mapType === "polygon") {
            // Позиция гаража из централизованных констант MapConstants.ts
            const garagePos = getPlayerGaragePosition("polygon") ?? [-70, -70];
            this.createGarageAt(garagePos[0], garagePos[1], 0);
            // Polygon mode: Created garage and capture points
            return;
        }

        // В режиме передовой создаём гараж на западной стороне (база игрока)
        if (this.config.mapType === "frontline") {
            // Позиция гаража из централизованных констант MapConstants.ts
            const garagePos = getPlayerGaragePosition("frontline") ?? [-400, 0];
            this.createGarageAt(garagePos[0], garagePos[1], 0);
            // Frontline mode: Created garage and capture points
            return;
        }

        // В режиме каньона создаём гараж на южной стороне
        if (this.config.mapType === "canyon") {
            // Позиция гаража из централизованных констант MapConstants.ts
            const garagePos = getPlayerGaragePosition("canyon") ?? [0, -350];
            this.createGarageAt(garagePos[0], garagePos[1], 0);
            // Canyon mode: Created garage and capture points
            return;
        }

        // Позиции гаражей по карте - МНОГО гаражей для врагов!
        // Центральный гараж (0, 0) - ТОЛЬКО для игрока!
        const garageLocations = [
            { x: 0, z: 0 },        // Центр (ИГРОК - защищён радиусом 100)
            // Ближнее кольцо (150 единиц) - 4 гаража
            { x: 150, z: 150 },    // Северо-восток
            { x: -150, z: 150 },   // Северо-запад
            { x: 150, z: -150 },   // Юго-восток
            { x: -150, z: -150 },  // Юго-запад
            // Среднее кольцо (250 единиц) - 4 гаража
            { x: 250, z: 0 },      // Восток
            { x: -250, z: 0 },     // Запад
            { x: 0, z: 250 },      // Север
            { x: 0, z: -250 },     // Юг
            // Дальнее кольцо (350 единиц) - 4 гаража
            { x: 350, z: 150 },    // Восток-северо-восток
            { x: -350, z: 150 },   // Запад-северо-запад
            { x: 350, z: -150 },   // Восток-юго-восток
            { x: -350, z: -150 },  // Запад-юго-запад
            // Очень дальнее кольцо (500 единиц для карты 1000x1000) - 4 гаража
            { x: 150, z: 500 },    // Дальний север-восток
            { x: -150, z: 500 },   // Дальний север-запад
            { x: 150, z: -500 },   // Дальний юг-восток
            { x: -150, z: -500 },  // Дальний юг-запад
        ];

        garageLocations.forEach((loc, index) => {
            this.createGarageAt(loc.x, loc.z, index);
        });

        // Created garages and capture points
    }

    // Создаёт гараж в указанной позиции
    private createGarageAt(garageX: number, garageZ: number, index: number = 0): void {

        // РАЗМЕРЫ ГАРАЖА - достаточно большой для танка
        const garageWidth = 16;   // Ширина (танк ~4 единицы)
        const garageDepth = 20;   // Глубина (танк ~6 единиц)
        const wallHeight = 8;     // Высота стен
        const wallThickness = 0.4;
        const doorWidth = 8;      // Ширина проёма (танк ~4 единицы)

        // ОПТИМИЗАЦИЯ: Используем материалы из пула для переиспользования
        let garageMat = this.materials.get("building");
        if (!garageMat) {
            garageMat = new StandardMaterial("garageMat", this.scene);
            garageMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
            garageMat.specularColor = Color3.Black();
            garageMat.freeze();
            this.materials.set("building", garageMat); // Сохраняем в пул
        }

        let floorMat = this.materials.get("concrete");
        if (!floorMat) {
            floorMat = new StandardMaterial("garageFloorMat", this.scene);
            floorMat.diffuseColor = new Color3(0.25, 0.25, 0.28);
            floorMat.specularColor = Color3.Black();
            floorMat.freeze();
            this.materials.set("concrete", floorMat); // Сохраняем в пул
        }

        // Материал для дверей с прозрачностью 50%
        // Используем visibility на меше вместо alpha на материале для избежания мерцания
        let doorMat = this.materials.get("garageDoor");
        if (!doorMat) {
            doorMat = new StandardMaterial("garageDoorMat", this.scene);
            doorMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
            doorMat.specularColor = Color3.Black();
            // НЕ используем alpha на материале - это вызывает мерцание
            // Вместо этого установим visibility на самом меше ворот
            doorMat.backFaceCulling = false; // Видны обе стороны
            this.materials.set("garageDoor", doorMat);
        }

        // ПОЛ ГАРАЖА (бетонный) - цельный пол
        const floor = MeshBuilder.CreateBox(`garageFloor_${index}`, {
            width: garageWidth - 0.5,
            height: 0.15,
            depth: garageDepth - 0.5
        }, this.scene);
        floor.position = new Vector3(garageX, 0.075, garageZ);
        floor.material = floorMat;
        floor.name = `garageFloor_${index}`;

        // Прозрачный физический пол для предотвращения проваливания танка
        const collisionFloor = MeshBuilder.CreateBox(`garageFloorCollision_${index}`, {
            width: garageWidth - 0.5,
            height: 0.15,
            depth: garageDepth - 0.5
        }, this.scene);
        collisionFloor.position = new Vector3(garageX, 0.075, garageZ);
        collisionFloor.isVisible = false;
        collisionFloor.visibility = 0;
        // ОПТИМИЗАЦИЯ: Переиспользуем материал для collision полов
        let collisionMat = this.materials.get("collision");
        if (!collisionMat) {
            collisionMat = new StandardMaterial("collisionMat", this.scene);
            collisionMat.alpha = 0;
            collisionMat.freeze();
            this.materials.set("collision", collisionMat);
        }
        collisionFloor.material = collisionMat;
        collisionFloor.name = `garageFloorCollision_${index}`;
        new PhysicsAggregate(collisionFloor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ЗАДНЯЯ СТЕНА С ПРОЁМОМ (ворота)
        // Левая часть задней стены
        const backLeftWidth = (garageWidth - doorWidth) / 2;
        const backLeftWall = MeshBuilder.CreateBox(`garageBackLeft_${index}`, {
            width: backLeftWidth,
            height: wallHeight,
            depth: wallThickness
        }, this.scene);
        backLeftWall.position = new Vector3(
            garageX - garageWidth / 2 + backLeftWidth / 2 + wallThickness / 2,
            wallHeight / 2,
            garageZ - garageDepth / 2 + wallThickness / 2
        );
        backLeftWall.material = garageMat;
        const backLeftWallPhysics = new PhysicsAggregate(backLeftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Правая часть задней стены
        const backRightWall = MeshBuilder.CreateBox(`garageBackRight_${index}`, {
            width: backLeftWidth,
            height: wallHeight,
            depth: wallThickness
        }, this.scene);
        backRightWall.position = new Vector3(
            garageX + garageWidth / 2 - backLeftWidth / 2 - wallThickness / 2,
            wallHeight / 2,
            garageZ - garageDepth / 2 + wallThickness / 2
        );
        backRightWall.material = garageMat;
        const backRightWallPhysics = new PhysicsAggregate(backRightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ПЕРЕМЫЧКА НАД ПРОЁМОМ ЗАДНЕЙ СТЕНЫ
        const backLintel = MeshBuilder.CreateBox(`garageBackLintel_${index}`, {
            width: doorWidth + 0.5,
            height: wallHeight * 0.25,
            depth: wallThickness
        }, this.scene);
        backLintel.position = new Vector3(
            garageX,
            wallHeight * 0.875,
            garageZ - garageDepth / 2 + wallThickness / 2
        );
        backLintel.material = garageMat;
        const backLintelPhysics = new PhysicsAggregate(backLintel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ЛЕВАЯ СТЕНА (сплошная)
        const leftWall = MeshBuilder.CreateBox(`garageLeft_${index}`, {
            width: wallThickness,
            height: wallHeight,
            depth: garageDepth
        }, this.scene);
        leftWall.position = new Vector3(garageX - garageWidth / 2 + wallThickness / 2, wallHeight / 2, garageZ);
        leftWall.material = garageMat;
        const leftWallPhysics = new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ПРАВАЯ СТЕНА (сплошная)
        const rightWall = MeshBuilder.CreateBox(`garageRight_${index}`, {
            width: wallThickness,
            height: wallHeight,
            depth: garageDepth
        }, this.scene);
        rightWall.position = new Vector3(garageX + garageWidth / 2 - wallThickness / 2, wallHeight / 2, garageZ);
        rightWall.material = garageMat;
        const rightWallPhysics = new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ПЕРЕДНЯЯ СТЕНА С ПРОЁМОМ
        // Левая часть передней стены
        const frontLeftWidth = (garageWidth - doorWidth) / 2;
        const frontLeftWall = MeshBuilder.CreateBox(`garageFrontLeft_${index}`, {
            width: frontLeftWidth,
            height: wallHeight,
            depth: wallThickness
        }, this.scene);
        frontLeftWall.position = new Vector3(
            garageX - garageWidth / 2 + frontLeftWidth / 2 + wallThickness / 2,
            wallHeight / 2,
            garageZ + garageDepth / 2 - wallThickness / 2
        );
        frontLeftWall.material = garageMat;
        const frontLeftWallPhysics = new PhysicsAggregate(frontLeftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Правая часть передней стены
        const frontRightWall = MeshBuilder.CreateBox(`garageFrontRight_${index}`, {
            width: frontLeftWidth,
            height: wallHeight,
            depth: wallThickness
        }, this.scene);
        frontRightWall.position = new Vector3(
            garageX + garageWidth / 2 - frontLeftWidth / 2 - wallThickness / 2,
            wallHeight / 2,
            garageZ + garageDepth / 2 - wallThickness / 2
        );
        frontRightWall.material = garageMat;
        const frontRightWallPhysics = new PhysicsAggregate(frontRightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ПЕРЕМЫЧКА НАД ПРОЁМОМ
        const lintel = MeshBuilder.CreateBox(`garageLintel_${index}`, {
            width: doorWidth + 0.5,
            height: wallHeight * 0.25,
            depth: wallThickness
        }, this.scene);
        lintel.position = new Vector3(
            garageX,
            wallHeight * 0.875,
            garageZ + garageDepth / 2 - wallThickness / 2
        );
        lintel.material = garageMat;
        const lintelPhysics = new PhysicsAggregate(lintel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // ПЕРЕДНИЕ ВОРОТА (поднимающиеся вверх)
        const frontDoor = MeshBuilder.CreateBox(`garageFrontDoor_${index}`, {
            width: doorWidth - 0.2,
            height: wallHeight * 0.7,
            depth: wallThickness * 0.8
        }, this.scene);
        const frontDoorClosedY = wallHeight * 0.35;
        const frontDoorOpenY = wallHeight * 0.85; // Ворота прячутся в перемычку над проёмом (не улетают выше крыши)
        frontDoor.position = new Vector3(
            garageX,
            frontDoorClosedY,
            garageZ + garageDepth / 2 - wallThickness / 2 + 0.1  // Выносим на 0.1 наружу от гаража
        );
        frontDoor.material = doorMat;
        frontDoor.visibility = 0.5; // 50% прозрачность через visibility (не вызывает мерцания)
        frontDoor.isPickable = true; // Включаем возможность raycast для определения, на какую ворота смотрит игрок
        // Физика для непробиваемых ворот (как стены) - анимированный тип для движения
        const frontDoorPhysics = new PhysicsAggregate(frontDoor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        frontDoorPhysics.body.setMotionType(PhysicsMotionType.ANIMATED);

        // КРИТИЧНО: Отключаем коллизию ворот полностью - устанавливаем фильтр коллизий на 0
        if (frontDoorPhysics.shape) {
            frontDoorPhysics.shape.filterCollideMask = 0; // Не коллизится ни с чем
            frontDoorPhysics.shape.filterMembershipMask = 0; // Не является частью никакой группы
        }

        // ЗАДНИЕ ВОРОТА (поднимающиеся вверх)
        const backDoor = MeshBuilder.CreateBox(`garageBackDoor_${index}`, {
            width: doorWidth - 0.2,
            height: wallHeight * 0.7,
            depth: wallThickness * 0.8
        }, this.scene);
        const backDoorClosedY = wallHeight * 0.35;
        const backDoorOpenY = wallHeight * 0.85; // Ворота прячутся в перемычку над проёмом (не улетают выше крыши)
        backDoor.position = new Vector3(
            garageX,
            backDoorClosedY,
            garageZ - garageDepth / 2 + wallThickness / 2 - 0.1  // Выносим на 0.1 наружу от гаража
        );
        backDoor.material = doorMat;
        backDoor.visibility = 0.5; // 50% прозрачность через visibility (не вызывает мерцания)
        backDoor.isPickable = true; // Включаем возможность raycast для определения, на какую ворота смотрит игрок
        // Физика для непробиваемых ворот (как стены) - анимированный тип для движения
        const backDoorPhysics = new PhysicsAggregate(backDoor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        backDoorPhysics.body.setMotionType(PhysicsMotionType.ANIMATED);

        // КРИТИЧНО: Отключаем коллизию ворот полностью - устанавливаем фильтр коллизий на 0
        if (backDoorPhysics.shape) {
            backDoorPhysics.shape.filterCollideMask = 0; // Не коллизится ни с чем
            backDoorPhysics.shape.filterMembershipMask = 0; // Не является частью никакой группы
        }

        // КРИТИЧНО: Отключаем коллизии между воротами и стенами гаража
        // Собираем все PhysicsAggregate стен
        const wallPhysicsAggregates = [
            backLeftWallPhysics,
            backRightWallPhysics,
            backLintelPhysics,
            leftWallPhysics,
            rightWallPhysics,
            frontLeftWallPhysics,
            frontRightWallPhysics,
            lintelPhysics
        ];

        // Отключаем коллизии между воротами и всеми стенами
        // Ворота полностью отключаются ниже, поэтому эти вызовы не нужны

        // Сохраняем ворота для управления
        this.garageDoors.push({
            frontDoor,
            backDoor,
            frontDoorPhysics,
            backDoorPhysics,
            position: new Vector3(garageX, 0, garageZ),
            garageDepth: garageDepth, // Сохраняем глубину гаража
            frontOpenY: frontDoorOpenY,
            backOpenY: backDoorOpenY,
            frontClosedY: frontDoorClosedY,
            backClosedY: backDoorClosedY,
            frontDoorOpen: false,  // По умолчанию закрыты
            backDoorOpen: false,    // По умолчанию закрыты
            manualControl: false,  // Ручное управление не активно
            manualControlTime: 0  // Время последнего ручного управления
        });

        // КРЫША
        const roof = MeshBuilder.CreateBox(`garageRoof_${index}`, {
            width: garageWidth + 0.5,
            height: 0.25,
            depth: garageDepth + 0.5
        }, this.scene);
        roof.position = new Vector3(garageX, wallHeight + 0.125, garageZ);
        roof.material = garageMat;
        const roofPhysics = new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Отключаем коллизии между воротами и крышей
        // Ворота полностью отключаются ниже, поэтому эти вызовы не нужны

        // КРИТИЧНО: Отключаем коллизию ворот со ВСЕМИ объектами в сцене
        // Ворота теперь не имеют коллизии вообще
        if (frontDoorPhysics && frontDoorPhysics.body) {
            // Отключаем коллизию со всеми объектами через отключение callback
            frontDoorPhysics.body.setCollisionCallbackEnabled(false);
        }
        if (backDoorPhysics && backDoorPhysics.body) {
            // Отключаем коллизию со всеми объектами через отключение callback
            backDoorPhysics.body.setCollisionCallbackEnabled(false);
        }

        // Сохраняем все стены гаража и крышу для управления прозрачностью
        const garageWalls: Mesh[] = [
            backLeftWall,
            backRightWall,
            backLintel,
            leftWall,
            rightWall,
            frontLeftWall,
            frontRightWall,
            lintel,
            roof // Крыша теперь включена - работает по тому же принципу, что и стены
        ];
        this.garageWalls.push({
            walls: garageWalls,
            position: new Vector3(garageX, 0, garageZ),
            width: garageWidth,
            depth: garageDepth
        });

        // ПОЗИЦИЯ СПАВНА - ТОЧНО В ЦЕНТРЕ ГАРАЖА!
        // Гараж: X=0, Z=0, глубина=20 (от Z=-10 до Z=+10), ширина=16 (от X=-8 до X=+8)
        // Танк спавнится в центре гаража, 1 метр над полом
        const spawnPos = new Vector3(garageX, 2.0, garageZ);
        this.garagePositions.push(spawnPos);

        // КРИТИЧНО: Сохраняем область гаража с УВЕЛИЧЕННЫМ запасом для 100% гарантии
        // КРИТИЧНО: Адаптивный запас - для специальных карт (полигон, фронтлайн) используем меньший запас
        const isSpecialMap = this.config.mapType === "polygon" || this.config.mapType === "frontline";
        const garageMargin = isSpecialMap ? 15 : 30; // Меньший запас для специальных карт, чтобы не блокировать генерацию
        this.garageAreas.push({
            x: garageX - garageWidth / 2 - garageMargin,
            z: garageZ - garageDepth / 2 - garageMargin,
            width: garageWidth + garageMargin * 2, // Запас с обеих сторон
            depth: garageDepth + garageMargin * 2
        });

        // ТОЧКА ЗАХВАТА - ВЕРСТАК у левой стены гаража (без ворот)
        const legHeight = 1.7; // Высота ножек верстака
        const topThickness = 0.15; // Толщина столешницы

        // Позиция верстака у левой стены (немного от стены)
        const workbenchX = garageX - garageWidth / 2 + 1.5; // От левой стены на 1.5 единицы
        const workbenchZ = garageZ; // По центру по глубине

        // Высота нижней столешницы
        const bottomTopY = 0.4; // Нижняя столешница
        // Высота верхней столешницы (на верху ножек)
        const topTopY = legHeight + topThickness / 2; // Верхняя столешница на верху ножек

        // ОПТИМИЗАЦИЯ: Материал для верстака из пула
        let workbenchMat = this.materials.get("workbench");
        if (!workbenchMat) {
            workbenchMat = new StandardMaterial("workbenchMat", this.scene);
            workbenchMat.diffuseColor = new Color3(0.4, 0.25, 0.15); // Коричневый цвет дерева
            workbenchMat.specularColor = new Color3(0.1, 0.1, 0.1); // Немного блеска
            workbenchMat.emissiveColor = new Color3(0.05, 0.05, 0.05); // Легкое свечение
            workbenchMat.freeze();
            this.materials.set("workbench", workbenchMat);
        }

        // Материал для инструментов (металл - серый)
        let toolMat = this.materials.get("tool");
        if (!toolMat) {
            toolMat = new StandardMaterial("toolMat", this.scene);
            toolMat.diffuseColor = new Color3(0.5, 0.5, 0.55); // Серый металл
            toolMat.specularColor = new Color3(0.3, 0.3, 0.3); // Блеск металла
            toolMat.emissiveColor = new Color3(0.02, 0.02, 0.02);
            this.materials.set("tool", toolMat);
        }

        // Материалы для деталей танка
        // Гусеничная лента (темно-серый/черный резина/металл)
        let trackMat = this.materials.get("track");
        if (!trackMat) {
            trackMat = new StandardMaterial("trackMat", this.scene);
            trackMat.diffuseColor = new Color3(0.15, 0.15, 0.15); // Очень темно-серый
            trackMat.specularColor = new Color3(0.1, 0.1, 0.1);
            this.materials.set("track", trackMat);
        }

        // Шестерня (блестящий металл)
        let gearMat = this.materials.get("gear");
        if (!gearMat) {
            gearMat = new StandardMaterial("gearMat", this.scene);
            gearMat.diffuseColor = new Color3(0.6, 0.6, 0.65); // Светло-серый металл
            gearMat.specularColor = new Color3(0.5, 0.5, 0.5); // Сильный блеск
            this.materials.set("gear", gearMat);
        }

        // Деталь двигателя (темный металл с масляным оттенком)
        let engineMat = this.materials.get("engine");
        if (!engineMat) {
            engineMat = new StandardMaterial("engineMat", this.scene);
            engineMat.diffuseColor = new Color3(0.25, 0.22, 0.2); // Темно-коричневый/черный
            engineMat.specularColor = new Color3(0.2, 0.2, 0.2);
            this.materials.set("engine", engineMat);
        }

        // Болт (хромированный/светлый металл)
        let boltMat = this.materials.get("bolt");
        if (!boltMat) {
            boltMat = new StandardMaterial("boltMat", this.scene);
            boltMat.diffuseColor = new Color3(0.7, 0.7, 0.75); // Светло-серый
            boltMat.specularColor = new Color3(0.6, 0.6, 0.6); // Очень блестящий
            this.materials.set("bolt", boltMat);
        }

        // Опорный каток (металл с резиной)
        let wheelMat = this.materials.get("wheel");
        if (!wheelMat) {
            wheelMat = new StandardMaterial("wheelMat", this.scene);
            wheelMat.diffuseColor = new Color3(0.4, 0.4, 0.45); // Средне-серый металл
            wheelMat.specularColor = new Color3(0.3, 0.3, 0.3);
            this.materials.set("wheel", wheelMat);
        }

        // Пружина (металлический)
        let springMat = this.materials.get("spring");
        if (!springMat) {
            springMat = new StandardMaterial("springMat", this.scene);
            springMat.diffuseColor = new Color3(0.55, 0.55, 0.6); // Серый металл
            springMat.specularColor = new Color3(0.4, 0.4, 0.4);
            this.materials.set("spring", springMat);
        }

        // Броневая пластина (темно-зеленый/серый камуфляж)
        let armorMat = this.materials.get("armor");
        if (!armorMat) {
            armorMat = new StandardMaterial("armorMat", this.scene);
            armorMat.diffuseColor = new Color3(0.2, 0.25, 0.2); // Темно-зеленый
            armorMat.specularColor = new Color3(0.15, 0.15, 0.15);
            this.materials.set("armor", armorMat);
        }

        // Шланг (черная резина)
        let hoseMat = this.materials.get("hose");
        if (!hoseMat) {
            hoseMat = new StandardMaterial("hoseMat", this.scene);
            hoseMat.diffuseColor = new Color3(0.1, 0.1, 0.1); // Почти черный
            hoseMat.specularColor = new Color3(0.05, 0.05, 0.05); // Матовый
            this.materials.set("hose", hoseMat);
        }

        // Нижняя столешница верстака (почти у пола)
        const workbenchTop = MeshBuilder.CreateBox(`workbenchTop_${index}`, {
            width: 2.0,   // Ширина столешницы (от стены)
            height: topThickness, // Толщина столешницы
            depth: 4.0    // Глубина столешницы (вдоль стены)
        }, this.scene);
        workbenchTop.position = new Vector3(workbenchX, bottomTopY, workbenchZ);
        workbenchTop.rotation.y = Math.PI; // Поворот на 180 градусов
        workbenchTop.material = workbenchMat;
        workbenchTop.isPickable = false;
        workbenchTop.visibility = 1.0;
        workbenchTop.renderingGroupId = 0;

        // Верхняя столешница верстака (на верху ножек)
        const workbenchTop2 = MeshBuilder.CreateBox(`workbenchTop2_${index}`, {
            width: 1.8,   // Ширина верхней столешницы (немного уже)
            height: topThickness, // Толщина столешницы
            depth: 3.5    // Глубина верхней столешницы (немного короче)
        }, this.scene);
        workbenchTop2.position = new Vector3(workbenchX, topTopY, workbenchZ);
        workbenchTop2.rotation.y = Math.PI; // Поворот на 180 градусов
        workbenchTop2.material = workbenchMat;
        workbenchTop2.isPickable = false;
        workbenchTop2.visibility = 1.0;
        workbenchTop2.renderingGroupId = 0;

        // Ножки верстака (4 ножки, вдоль стены, от пола до верхней столешницы)
        const legSize = 0.15;
        const legPositions = [
            new Vector3(workbenchX - 0.8, legHeight / 2, workbenchZ - 1.5), // Левая передняя (ближе к стене)
            new Vector3(workbenchX - 0.8, legHeight / 2, workbenchZ + 1.5), // Левая задняя (ближе к стене)
            new Vector3(workbenchX + 0.8, legHeight / 2, workbenchZ - 1.5), // Правая передняя (дальше от стены)
            new Vector3(workbenchX + 0.8, legHeight / 2, workbenchZ + 1.5)  // Правая задняя (дальше от стены)
        ];

        const legs: Mesh[] = [];
        legPositions.forEach((pos, i) => {
            const leg = MeshBuilder.CreateBox(`workbenchLeg_${index}_${i}`, {
                width: legSize,
                height: legHeight,
                depth: legSize
            }, this.scene);
            leg.position = pos;
            leg.rotation.y = Math.PI; // Поворот на 180 градусов
            leg.material = workbenchMat || null; // workbenchMat гарантированно определен выше
            leg.isPickable = false;
            leg.visibility = 1.0;
            leg.renderingGroupId = 0;
            legs.push(leg);
        });

        // Задняя стенка верстака (с инструментами) - со стороны стены гаража, на верхней столешнице
        const backWallHeight = 1.0; // Высота задней стенки
        const backWall = MeshBuilder.CreateBox(`workbenchBackWall_${index}`, {
            width: 0.1,   // Толщина стенки
            height: backWallHeight,
            depth: 4.0    // Длина стенки (вдоль стены, такая же как глубина столешницы)
        }, this.scene);
        backWall.position = new Vector3(workbenchX - 0.95, topTopY + backWallHeight / 2, workbenchZ); // Со стороны стены (минус вместо плюса)
        backWall.rotation.y = Math.PI; // Поворот на 180 градусов
        backWall.material = workbenchMat;
        backWall.isPickable = false;
        backWall.visibility = 1.0;
        backWall.renderingGroupId = 0;

        // Инструменты на задней стенке (молоток, ключ, пила) - вдоль стены
        const tools: Mesh[] = [];

        // Молоток (слева по оси Z, на задней стенке со стороны стены)
        const hammer = MeshBuilder.CreateBox(`workbenchHammer_${index}`, {
            width: 0.1,
            height: 0.6,
            depth: 0.3
        }, this.scene);
        hammer.position = new Vector3(workbenchX - 0.95, topTopY + 0.5, workbenchZ - 1.2); // Со стороны стены
        hammer.rotation.y = Math.PI; // Поворот на 180 градусов
        hammer.material = toolMat;
        hammer.isPickable = false;
        hammer.visibility = 1.0;
        hammer.renderingGroupId = 0;
        tools.push(hammer);

        // Гаечный ключ (центр по оси Z, на задней стенке со стороны стены)
        const wrench = MeshBuilder.CreateBox(`workbenchWrench_${index}`, {
            width: 0.1,
            height: 0.4,
            depth: 0.2
        }, this.scene);
        wrench.position = new Vector3(workbenchX - 0.95, topTopY + 0.5, workbenchZ); // Со стороны стены
        wrench.rotation.y = Math.PI; // Поворот на 180 градусов
        wrench.material = toolMat;
        wrench.isPickable = false;
        wrench.visibility = 1.0;
        wrench.renderingGroupId = 0;
        tools.push(wrench);

        // Пила (справа по оси Z, на задней стенке со стороны стены)
        const saw = MeshBuilder.CreateBox(`workbenchSaw_${index}`, {
            width: 0.1,
            height: 0.5,
            depth: 0.3
        }, this.scene);
        saw.position = new Vector3(workbenchX - 0.95, topTopY + 0.5, workbenchZ + 1.2); // Со стороны стены
        saw.rotation.y = Math.PI; // Поворот на 180 градусов
        saw.material = toolMat;
        saw.isPickable = false;
        saw.visibility = 1.0;
        saw.renderingGroupId = 0;
        tools.push(saw);

        // Дополнительные инструменты на задней стенке
        // Отвертка (между молотком и ключом)
        const screwdriver = MeshBuilder.CreateBox(`workbenchScrewdriver_${index}`, {
            width: 0.08,
            height: 0.35,
            depth: 0.15
        }, this.scene);
        screwdriver.position = new Vector3(workbenchX - 0.95, topTopY + 0.5, workbenchZ - 0.6);
        screwdriver.rotation.y = Math.PI;
        screwdriver.material = toolMat;
        screwdriver.isPickable = false;
        screwdriver.visibility = 1.0;
        screwdriver.renderingGroupId = 0;
        tools.push(screwdriver);

        // Плоскогубцы (между ключом и пилой)
        const pliers = MeshBuilder.CreateBox(`workbenchPliers_${index}`, {
            width: 0.1,
            height: 0.3,
            depth: 0.2
        }, this.scene);
        pliers.position = new Vector3(workbenchX - 0.95, topTopY + 0.5, workbenchZ + 0.6);
        pliers.rotation.y = Math.PI;
        pliers.material = toolMat;
        pliers.isPickable = false;
        pliers.visibility = 1.0;
        pliers.renderingGroupId = 0;
        tools.push(pliers);

        // Инструменты на нижней столешнице
        const bottomTools: Mesh[] = [];

        // Тиски на нижней столешнице (слева) - на столешнице, не в ней
        const vise = MeshBuilder.CreateBox(`workbenchVise_${index}`, {
            width: 0.3,
            height: 0.2,
            depth: 0.25
        }, this.scene);
        vise.position = new Vector3(workbenchX - 0.6, bottomTopY + topThickness / 2 + 0.1, workbenchZ - 1.0); // На столешнице
        vise.rotation.y = Math.PI;
        vise.material = toolMat;
        vise.isPickable = false;
        vise.visibility = 1.0;
        vise.renderingGroupId = 0;
        bottomTools.push(vise);

        // Дрель на нижней столешнице (справа) - на столешнице
        const drill = MeshBuilder.CreateBox(`workbenchDrill_${index}`, {
            width: 0.2,
            height: 0.15,
            depth: 0.3
        }, this.scene);
        drill.position = new Vector3(workbenchX + 0.5, bottomTopY + topThickness / 2 + 0.075, workbenchZ + 1.0); // На столешнице
        drill.rotation.y = Math.PI;
        drill.material = toolMat;
        drill.isPickable = false;
        drill.visibility = 1.0;
        drill.renderingGroupId = 0;
        bottomTools.push(drill);

        // Инструменты на верхней столешнице
        const topTools: Mesh[] = [];

        // Набор ключей на верхней столешнице (слева) - на столешнице
        const keySet = MeshBuilder.CreateBox(`workbenchKeySet_${index}`, {
            width: 0.15,
            height: 0.1,
            depth: 0.4
        }, this.scene);
        keySet.position = new Vector3(workbenchX - 0.5, topTopY + topThickness / 2 + 0.05, workbenchZ - 1.0); // На столешнице
        keySet.rotation.y = Math.PI;
        keySet.material = toolMat;
        keySet.isPickable = false;
        keySet.visibility = 1.0;
        keySet.renderingGroupId = 0;
        topTools.push(keySet);

        // Рулетка на верхней столешнице (справа) - на столешнице
        const tapeMeasure = MeshBuilder.CreateBox(`workbenchTapeMeasure_${index}`, {
            width: 0.12,
            height: 0.08,
            depth: 0.25
        }, this.scene);
        tapeMeasure.position = new Vector3(workbenchX + 0.4, topTopY + topThickness / 2 + 0.04, workbenchZ + 1.0); // На столешнице
        tapeMeasure.rotation.y = Math.PI;
        tapeMeasure.material = toolMat;
        tapeMeasure.isPickable = false;
        tapeMeasure.visibility = 1.0;
        tapeMeasure.renderingGroupId = 0;
        topTools.push(tapeMeasure);

        // ДЕТАЛИ ОТ ТАНКА на верхней столешнице
        // Гусеничная лента (часть) - темно-серый/черный
        const trackSegment = MeshBuilder.CreateBox(`workbenchTrack_${index}`, {
            width: 0.6,
            height: 0.15,
            depth: 0.3
        }, this.scene);
        trackSegment.position = new Vector3(workbenchX + 0.2, topTopY + topThickness / 2 + 0.075, workbenchZ - 0.3);
        trackSegment.rotation.y = Math.PI / 4;
        trackSegment.material = trackMat; // Темно-серый материал
        trackSegment.isPickable = false;
        trackSegment.visibility = 1.0;
        trackSegment.renderingGroupId = 0;
        topTools.push(trackSegment);

        // Зубчатое колесо (шестерня) - блестящий металл
        const gear = MeshBuilder.CreateCylinder(`workbenchGear_${index}`, {
            height: 0.1,
            diameter: 0.25
        }, this.scene);
        gear.position = new Vector3(workbenchX - 0.3, topTopY + topThickness / 2 + 0.05, workbenchZ + 0.5);
        gear.material = gearMat; // Блестящий металл
        gear.isPickable = false;
        gear.visibility = 1.0;
        gear.renderingGroupId = 0;
        topTools.push(gear);

        // Деталь двигателя (блок) - темный металл с масляным оттенком
        const enginePart = MeshBuilder.CreateBox(`workbenchEnginePart_${index}`, {
            width: 0.4,
            height: 0.2,
            depth: 0.35
        }, this.scene);
        enginePart.position = new Vector3(workbenchX + 0.6, topTopY + topThickness / 2 + 0.1, workbenchZ - 0.6);
        enginePart.rotation.y = Math.PI / 6;
        enginePart.material = engineMat; // Темно-коричневый/черный
        enginePart.isPickable = false;
        enginePart.visibility = 1.0;
        enginePart.renderingGroupId = 0;
        topTools.push(enginePart);

        // Болт/гайка (большая) - хромированный/светлый металл
        const bolt = MeshBuilder.CreateCylinder(`workbenchBolt_${index}`, {
            height: 0.12,
            diameter: 0.15
        }, this.scene);
        bolt.position = new Vector3(workbenchX - 0.7, topTopY + topThickness / 2 + 0.06, workbenchZ - 0.8);
        bolt.rotation.x = Math.PI / 2;
        bolt.material = boltMat; // Светло-серый блестящий
        bolt.isPickable = false;
        bolt.visibility = 1.0;
        bolt.renderingGroupId = 0;
        topTools.push(bolt);

        // ДЕТАЛИ ОТ ТАНКА на нижней столешнице
        // Опорный каток (колесо) - металл с резиной
        const roadWheel = MeshBuilder.CreateCylinder(`workbenchRoadWheel_${index}`, {
            height: 0.2,
            diameter: 0.4
        }, this.scene);
        roadWheel.position = new Vector3(workbenchX - 0.4, bottomTopY + topThickness / 2 + 0.1, workbenchZ - 0.5);
        roadWheel.rotation.z = Math.PI / 2;
        roadWheel.material = wheelMat; // Средне-серый металл
        roadWheel.isPickable = false;
        roadWheel.visibility = 1.0;
        roadWheel.renderingGroupId = 0;
        bottomTools.push(roadWheel);

        // Пружина подвески - металлический
        const spring = MeshBuilder.CreateCylinder(`workbenchSpring_${index}`, {
            height: 0.3,
            diameter: 0.12
        }, this.scene);
        spring.position = new Vector3(workbenchX + 0.5, bottomTopY + topThickness / 2 + 0.15, workbenchZ + 0.6);
        spring.material = springMat; // Серый металл
        spring.isPickable = false;
        spring.visibility = 1.0;
        spring.renderingGroupId = 0;
        bottomTools.push(spring);

        // Металлическая пластина (броня) - темно-зеленый камуфляж
        const armorPlate = MeshBuilder.CreateBox(`workbenchArmorPlate_${index}`, {
            width: 0.5,
            height: 0.08,
            depth: 0.4
        }, this.scene);
        armorPlate.position = new Vector3(workbenchX + 0.3, bottomTopY + topThickness / 2 + 0.04, workbenchZ - 0.8);
        armorPlate.rotation.y = Math.PI / 3;
        armorPlate.material = armorMat; // Темно-зеленый
        armorPlate.isPickable = false;
        armorPlate.visibility = 1.0;
        armorPlate.renderingGroupId = 0;
        bottomTools.push(armorPlate);

        // Трубка/шланг - черная резина
        const hose = MeshBuilder.CreateCylinder(`workbenchHose_${index}`, {
            height: 0.4,
            diameter: 0.06
        }, this.scene);
        hose.position = new Vector3(workbenchX - 0.6, bottomTopY + topThickness / 2 + 0.2, workbenchZ + 0.3);
        hose.rotation.z = Math.PI / 4;
        hose.rotation.y = Math.PI / 3;
        hose.material = hoseMat; // Почти черный
        hose.isPickable = false;
        hose.visibility = 1.0;
        hose.renderingGroupId = 0;
        bottomTools.push(hose);

        // ТОКАРНЫЙ СТАНОК перед верстаком (в 2 раза больше, на массивной станине)
        const latheX = workbenchX; // Та же позиция X что и у верстака
        const latheZ = workbenchZ + 5.5; // Перед верстаком на расстоянии 5.5 единиц (2.5 + 3.0)
        const latheScale = 2.0; // Масштаб увеличения в 2 раза
        const latheHeight = 0.6 * latheScale; // Высота станины (увеличена в 2 раза)
        const baseHeight = 0.3; // Высота массивной металлической станины

        // Массивная металлическая станина (основание под токарным станком)
        const latheBase = MeshBuilder.CreateBox(`latheBase_${index}`, {
            width: 1.2 * latheScale,  // Ширина станины
            height: baseHeight,       // Высота станины
            depth: 4.0 * latheScale   // Длина станины (увеличена в 2 раза)
        }, this.scene);
        latheBase.position = new Vector3(latheX, baseHeight / 2, latheZ);
        latheBase.rotation.y = Math.PI;
        latheBase.material = toolMat; // Металлический материал
        latheBase.isPickable = false;
        latheBase.visibility = 1.0;
        latheBase.renderingGroupId = 0;

        // Станина токарного станка (основание)
        const latheBed = MeshBuilder.CreateBox(`latheBed_${index}`, {
            width: 0.3 * latheScale,
            height: 0.2 * latheScale,
            depth: 3.0 * latheScale
        }, this.scene);
        latheBed.position = new Vector3(latheX, baseHeight + latheHeight / 2, latheZ);
        latheBed.rotation.y = Math.PI;
        latheBed.material = toolMat;
        latheBed.isPickable = false;
        latheBed.visibility = 1.0;
        latheBed.renderingGroupId = 0;

        // Передняя бабка (с патроном) - увеличена в 2 раза
        const latheHeadstock = MeshBuilder.CreateBox(`latheHeadstock_${index}`, {
            width: 0.4 * latheScale,
            height: 0.5 * latheScale,
            depth: 0.4 * latheScale
        }, this.scene);
        latheHeadstock.position = new Vector3(latheX, baseHeight + latheHeight + 0.25 * latheScale, latheZ - 1.2 * latheScale);
        latheHeadstock.rotation.y = Math.PI;
        latheHeadstock.material = toolMat;
        latheHeadstock.isPickable = false;
        latheHeadstock.visibility = 1.0;
        latheHeadstock.renderingGroupId = 0;

        // Патрон (цилиндр) - увеличен в 2 раза
        const latheChuck = MeshBuilder.CreateCylinder(`latheChuck_${index}`, {
            height: 0.15 * latheScale,
            diameter: 0.25 * latheScale
        }, this.scene);
        latheChuck.position = new Vector3(latheX, baseHeight + latheHeight + 0.5 * latheScale, latheZ - 1.2 * latheScale);
        latheChuck.rotation.z = Math.PI / 2;
        latheChuck.rotation.y = Math.PI;
        latheChuck.material = toolMat;
        latheChuck.isPickable = false;
        latheChuck.visibility = 1.0;
        latheChuck.renderingGroupId = 0;

        // Задняя бабка - увеличена в 2 раза
        const latheTailstock = MeshBuilder.CreateBox(`latheTailstock_${index}`, {
            width: 0.3 * latheScale,
            height: 0.4 * latheScale,
            depth: 0.3 * latheScale
        }, this.scene);
        latheTailstock.position = new Vector3(latheX, baseHeight + latheHeight + 0.2 * latheScale, latheZ + 1.2 * latheScale);
        latheTailstock.rotation.y = Math.PI;
        latheTailstock.material = toolMat;
        latheTailstock.isPickable = false;
        latheTailstock.visibility = 1.0;
        latheTailstock.renderingGroupId = 0;

        // Суппорт - увеличен в 2 раза
        const latheCarriage = MeshBuilder.CreateBox(`latheCarriage_${index}`, {
            width: 0.25 * latheScale,
            height: 0.15 * latheScale,
            depth: 0.35 * latheScale
        }, this.scene);
        latheCarriage.position = new Vector3(latheX, baseHeight + latheHeight + 0.075 * latheScale, latheZ);
        latheCarriage.rotation.y = Math.PI;
        latheCarriage.material = toolMat;
        latheCarriage.isPickable = false;
        latheCarriage.visibility = 1.0;
        latheCarriage.renderingGroupId = 0;

        // Резцедержатель - увеличен в 2 раза
        const latheToolpost = MeshBuilder.CreateBox(`latheToolpost_${index}`, {
            width: 0.15 * latheScale,
            height: 0.2 * latheScale,
            depth: 0.15 * latheScale
        }, this.scene);
        latheToolpost.position = new Vector3(latheX, baseHeight + latheHeight + 0.2 * latheScale, latheZ);
        latheToolpost.rotation.y = Math.PI;
        latheToolpost.material = toolMat;
        latheToolpost.isPickable = false;
        latheToolpost.visibility = 1.0;
        latheToolpost.renderingGroupId = 0;

        // Шпиндель (вращающийся вал в передней бабке)
        const latheSpindle = MeshBuilder.CreateCylinder(`latheSpindle_${index}`, {
            height: 0.3 * latheScale,
            diameter: 0.12 * latheScale
        }, this.scene);
        latheSpindle.position = new Vector3(latheX, baseHeight + latheHeight + 0.35 * latheScale, latheZ - 1.2 * latheScale);
        latheSpindle.rotation.z = Math.PI / 2;
        latheSpindle.rotation.y = Math.PI;
        latheSpindle.material = gearMat; // Блестящий металл
        latheSpindle.isPickable = false;
        latheSpindle.visibility = 1.0;
        latheSpindle.renderingGroupId = 0;

        // Центр задней бабки (конус)
        const latheCenter = MeshBuilder.CreateCylinder(`latheCenter_${index}`, {
            height: 0.2 * latheScale,
            diameter: 0.1 * latheScale
        }, this.scene);
        latheCenter.position = new Vector3(latheX, baseHeight + latheHeight + 0.3 * latheScale, latheZ + 1.2 * latheScale);
        latheCenter.rotation.z = Math.PI / 2;
        latheCenter.rotation.y = Math.PI;
        latheCenter.material = gearMat;
        latheCenter.isPickable = false;
        latheCenter.visibility = 1.0;
        latheCenter.renderingGroupId = 0;

        // Резец в резцедержателе
        const latheTool = MeshBuilder.CreateBox(`latheTool_${index}`, {
            width: 0.08 * latheScale,
            height: 0.1 * latheScale,
            depth: 0.12 * latheScale
        }, this.scene);
        latheTool.position = new Vector3(latheX, baseHeight + latheHeight + 0.25 * latheScale, latheZ + 0.08 * latheScale);
        latheTool.rotation.y = Math.PI;
        latheTool.material = toolMat;
        latheTool.isPickable = false;
        latheTool.visibility = 1.0;
        latheTool.renderingGroupId = 0;

        // Рукоятки управления (на передней бабке)
        const latheHandle1 = MeshBuilder.CreateCylinder(`latheHandle1_${index}`, {
            height: 0.15 * latheScale,
            diameter: 0.05 * latheScale
        }, this.scene);
        latheHandle1.position = new Vector3(latheX - 0.2 * latheScale, baseHeight + latheHeight + 0.4 * latheScale, latheZ - 1.2 * latheScale);
        latheHandle1.rotation.x = Math.PI / 2;
        latheHandle1.material = toolMat;
        latheHandle1.isPickable = false;
        latheHandle1.visibility = 1.0;
        latheHandle1.renderingGroupId = 0;

        const latheHandle2 = MeshBuilder.CreateCylinder(`latheHandle2_${index}`, {
            height: 0.15 * latheScale,
            diameter: 0.05 * latheScale
        }, this.scene);
        latheHandle2.position = new Vector3(latheX + 0.2 * latheScale, baseHeight + latheHeight + 0.4 * latheScale, latheZ - 1.2 * latheScale);
        latheHandle2.rotation.x = Math.PI / 2;
        latheHandle2.material = toolMat;
        latheHandle2.isPickable = false;
        latheHandle2.visibility = 1.0;
        latheHandle2.renderingGroupId = 0;

        // Панель управления (на передней бабке)
        const latheControlPanel = MeshBuilder.CreateBox(`latheControlPanel_${index}`, {
            width: 0.25 * latheScale,
            height: 0.15 * latheScale,
            depth: 0.1 * latheScale
        }, this.scene);
        latheControlPanel.position = new Vector3(latheX, baseHeight + latheHeight + 0.55 * latheScale, latheZ - 1.2 * latheScale);
        latheControlPanel.rotation.y = Math.PI;
        latheControlPanel.material = toolMat;
        latheControlPanel.isPickable = false;
        latheControlPanel.visibility = 1.0;
        latheControlPanel.renderingGroupId = 0;

        // Направляющие станины (рельсы)
        const latheRail1 = MeshBuilder.CreateBox(`latheRail1_${index}`, {
            width: 0.1 * latheScale,
            height: 0.08 * latheScale,
            depth: 2.8 * latheScale
        }, this.scene);
        latheRail1.position = new Vector3(latheX - 0.1 * latheScale, baseHeight + latheHeight - 0.04 * latheScale, latheZ);
        latheRail1.rotation.y = Math.PI;
        latheRail1.material = gearMat; // Блестящие направляющие
        latheRail1.isPickable = false;
        latheRail1.visibility = 1.0;
        latheRail1.renderingGroupId = 0;

        const latheRail2 = MeshBuilder.CreateBox(`latheRail2_${index}`, {
            width: 0.1 * latheScale,
            height: 0.08 * latheScale,
            depth: 2.8 * latheScale
        }, this.scene);
        latheRail2.position = new Vector3(latheX + 0.1 * latheScale, baseHeight + latheHeight - 0.04 * latheScale, latheZ);
        latheRail2.rotation.y = Math.PI;
        latheRail2.material = gearMat;
        latheRail2.isPickable = false;
        latheRail2.visibility = 1.0;
        latheRail2.renderingGroupId = 0;

        // Маховик на задней бабке
        const latheWheel = MeshBuilder.CreateCylinder(`latheWheel_${index}`, {
            height: 0.05 * latheScale,
            diameter: 0.2 * latheScale
        }, this.scene);
        latheWheel.position = new Vector3(latheX, baseHeight + latheHeight + 0.35 * latheScale, latheZ + 1.4 * latheScale);
        latheWheel.rotation.z = Math.PI / 2;
        latheWheel.rotation.y = Math.PI;
        latheWheel.material = toolMat;
        latheWheel.isPickable = false;
        latheWheel.visibility = 1.0;
        latheWheel.renderingGroupId = 0;

        const latheParts = [latheBase, latheBed, latheHeadstock, latheChuck, latheTailstock, latheCarriage, latheToolpost,
            latheSpindle, latheCenter, latheTool, latheHandle1, latheHandle2, latheControlPanel,
            latheRail1, latheRail2, latheWheel];

        // Объединяем все части верстака в один меш (БЕЗ токарного станка - он отдельно)
        const workbenchParts = [workbenchTop, workbenchTop2, ...legs, backWall, ...tools, ...bottomTools, ...topTools];
        const workbench = Mesh.MergeMeshes(workbenchParts, true, false, undefined, false, true);
        if (!workbench) {
            // Если объединение не удалось, используем столешницу как основной меш
            workbenchTop.metadata = { type: "wrench", garageIndex: index }; // Оставляем тип "wrench" для совместимости
            this.garageCapturePoints.push({
                wrench: workbenchTop,
                position: new Vector3(workbenchX, topTopY, workbenchZ),
                garageIndex: index
            });
        } else {
            workbench.name = `garageWorkbench_${index}`;
            workbench.metadata = { type: "wrench", garageIndex: index }; // Оставляем тип "wrench" для совместимости
            workbench.material = workbenchMat;
            this.garageCapturePoints.push({
                wrench: workbench,
                position: new Vector3(workbenchX, topTopY, workbenchZ),
                garageIndex: index
            });
        }

        // Токарный станок - отдельный объект (не объединяем с верстаком)
        const lathe = Mesh.MergeMeshes(latheParts, true, false, undefined, false, true);
        if (lathe) {
            lathe.name = `garageLathe_${index}`;
            lathe.material = toolMat;
        }

        // ПУШКА ОТ ТАНКА на полу под углом (с левой стороны гаража, напротив верстака)
        const cannonLength = 5;
        const cannonDiameter = 0.3;
        const cannonX = garageX - garageWidth / 2 + 3; // С левой стороны
        const cannonZ = garageZ - 3; // Немного ближе к передней части
        const cannonAngle = Math.PI / 6; // Угол 30 градусов

        // Ствол пушки (цилиндр)
        const cannonBarrel = MeshBuilder.CreateCylinder(`garageCannonBarrel_${index}`, {
            height: cannonLength,
            diameter: cannonDiameter
        }, this.scene);
        cannonBarrel.position = new Vector3(cannonX, cannonDiameter / 2, cannonZ);
        cannonBarrel.rotation.z = Math.PI / 2; // Поворачиваем горизонтально
        cannonBarrel.rotation.y = cannonAngle; // Наклон под углом
        cannonBarrel.material = toolMat;
        cannonBarrel.isPickable = false;

        // Основание пушки (блок)
        const cannonBase = MeshBuilder.CreateBox(`garageCannonBase_${index}`, {
            width: 0.8,
            height: 0.4,
            depth: 0.8
        }, this.scene);
        cannonBase.position = new Vector3(cannonX, 0.2, cannonZ);
        cannonBase.rotation.y = cannonAngle;
        cannonBase.material = toolMat;
        cannonBase.isPickable = false;

        // ЯЩИКИ СО СНАРЯДАМИ с правой стороны гаража (напротив верстака)
        const ammoBoxX = garageX + garageWidth / 2 - 2; // С правой стороны
        const ammoBoxZ = garageZ; // По центру по глубине

        // Материал для ящиков (дерево) - используем существующий материал
        let ammoBoxMat2 = this.materials.get("wood");
        if (!ammoBoxMat2) {
            ammoBoxMat2 = new StandardMaterial("ammoBoxMat2", this.scene);
            ammoBoxMat2.diffuseColor = new Color3(0.35, 0.25, 0.15); // Коричневый деревянный
            this.materials.set("wood", ammoBoxMat2);
        }

        // Создаём больше ящиков со снарядами (в два ряда)
        const ammoBoxCount = 8; // Увеличено количество ящиков
        const ammoBoxSpacing = 1.3;
        const ammoBoxRowOffset = 1.5; // Смещение для второго ряда

        for (let i = 0; i < ammoBoxCount; i++) {
            const row = Math.floor(i / 4); // 4 ящика в ряду
            const col = i % 4;

            // Ящик
            const ammoBox = MeshBuilder.CreateBox(`garageAmmoBox_${index}_${i}`, {
                width: 1.2,
                height: 0.8,
                depth: 1.0
            }, this.scene);
            ammoBox.position = new Vector3(
                ammoBoxX - row * ammoBoxRowOffset, // Второй ряд ближе к стене
                0.4,
                ammoBoxZ - 2 + col * ammoBoxSpacing // Размещаем в ряд
            );
            ammoBox.material = ammoBoxMat2;
            ammoBox.isPickable = false;

            // Снаряды в ящике (несколько цилиндров)
            for (let j = 0; j < 4; j++) {
                const shell = MeshBuilder.CreateCylinder(`garageShell_${index}_${i}_${j}`, {
                    height: 0.3,
                    diameter: 0.08
                }, this.scene);
                shell.position = new Vector3(
                    ammoBoxX - row * ammoBoxRowOffset + (j % 2 - 0.5) * 0.3,
                    0.55 + Math.floor(j / 2) * 0.15,
                    ammoBoxZ - 2 + col * ammoBoxSpacing + (j % 2 - 0.5) * 0.2
                );
                shell.rotation.z = Math.PI / 2; // Горизонтально
                shell.material = toolMat;
                shell.isPickable = false;
            }
        }

        // Дополнительные ящики в углу гаража
        const cornerBoxCount = 3;
        const cornerBoxX = garageX + garageWidth / 2 - 1.5;
        const cornerBoxZ = garageZ + garageDepth / 2 - 2;

        for (let i = 0; i < cornerBoxCount; i++) {
            const cornerBox = MeshBuilder.CreateBox(`garageCornerBox_${index}_${i}`, {
                width: 1.0,
                height: 0.7,
                depth: 0.8
            }, this.scene);
            cornerBox.position = new Vector3(
                cornerBoxX - i * 0.5,
                0.35,
                cornerBoxZ
            );
            cornerBox.material = ammoBoxMat2;
            cornerBox.isPickable = false;
        }

        // Инициализируем владение гаража (нейтральный)
        const garageKey = `${garageX.toFixed(1)}_${garageZ.toFixed(1)}`;
        this.garageOwnership.set(garageKey, { ownerId: null });

        // Логирование создания верстака
        // Created workbench for garage
    }

    private updateChunks(playerCx: number, playerCz: number): void {
        const { renderDistance, unloadDistance } = this.config;

        // ОПТИМИЗАЦИЯ: Прогрессивная загрузка чанков
        if (this.progressiveLoadingEnabled) {
            this.updateProgressiveChunkLoading(playerCx, playerCz, renderDistance);
        } else {
            // Стандартная загрузка всех чанков сразу (для обратной совместимости)
            for (let dx = -renderDistance; dx <= renderDistance; dx++) {
                for (let dz = -renderDistance; dz <= renderDistance; dz++) {
                    const cx = playerCx + dx;
                    const cz = playerCz + dz;
                    const key = this.getChunkKey(cx, cz);

                    if (!this.chunks.has(key)) {
                        this.loadChunk(cx, cz);
                    } else {
                        const chunk = this.chunks.get(key)!;
                        chunk.lastAccess = Date.now();
                        if (!chunk.loaded) this.showChunk(chunk);
                    }
                }
            }
        }

        // Обновляем доступ к существующим чанкам
        for (let dx = -renderDistance; dx <= renderDistance; dx++) {
            for (let dz = -renderDistance; dz <= renderDistance; dz++) {
                const cx = playerCx + dx;
                const cz = playerCz + dz;
                const key = this.getChunkKey(cx, cz);

                if (this.chunks.has(key)) {
                    const chunk = this.chunks.get(key)!;
                    chunk.lastAccess = Date.now();
                    if (!chunk.loaded) this.showChunk(chunk);
                }
            }
        }

        // Выгрузка дальних чанков
        this.chunks.forEach((chunk, key) => {
            const dist = Math.max(Math.abs(chunk.x - playerCx), Math.abs(chunk.z - playerCz));
            if (dist > unloadDistance && chunk.loaded) this.hideChunk(chunk);
            if (dist > unloadDistance * 2) this.destroyChunk(key);
        });

        // ОПТИМИЗАЦИЯ: Принудительная выгрузка при нехватке памяти
        this.forceUnloadIfNeeded(playerCx, playerCz);

        this.updateStats();
    }

    /**
     * ОПТИМИЗАЦИЯ: Прогрессивная загрузка чанков по спирали от места спавна
     */
    private updateProgressiveChunkLoading(playerCx: number, playerCz: number, renderDistance: number): void {
        // Обновляем очередь загрузки если нужно
        this.updateChunkLoadQueue(playerCx, playerCz, renderDistance);

        // Загружаем чанки из очереди (максимум MAX_CHUNKS_PER_FRAME за кадр)
        let loadedThisFrame = 0;
        while (loadedThisFrame < this.MAX_CHUNKS_PER_FRAME && this.chunkLoadQueue.length > 0) {
            // Сортируем очередь по приоритету (высший приоритет первым)
            this.chunkLoadQueue.sort((a, b) => b.priority - a.priority);

            const chunkToLoad = this.chunkLoadQueue.shift();
            if (!chunkToLoad) break;

            const key = this.getChunkKey(chunkToLoad.cx, chunkToLoad.cz);

            // Проверяем, не загружается ли уже этот чанк
            if (this.chunksLoading.has(key) || this.chunks.has(key)) {
                continue;
            }

            // Загружаем чанк
            this.chunksLoading.add(key);
            try {
                this.loadChunk(chunkToLoad.cx, chunkToLoad.cz);
                this.loadedChunksInRadius++;
            } catch (e) {
                logger.warn("[ChunkSystem] Error loading chunk:", e);
            } finally {
                this.chunksLoading.delete(key);
            }

            loadedThisFrame++;
        }

        // Обновляем статистику загрузки
        this.updateLoadingProgress();
    }

    /**
     * Обновляет очередь загрузки чанков на основе текущей позиции игрока
     */
    private updateChunkLoadQueue(playerCx: number, playerCz: number, renderDistance: number): void {
        // Очищаем очередь от уже загруженных чанков
        this.chunkLoadQueue = this.chunkLoadQueue.filter(item => {
            const key = this.getChunkKey(item.cx, item.cz);
            return !this.chunks.has(key);
        });

        // Вычисляем общее количество чанков в радиусе видимости от текущей позиции игрока
        const totalChunks = Math.pow(Math.floor(renderDistance * 2) + 1, 2);
        this.totalChunksInRadius = totalChunks;

        // Пересчитываем количество загруженных чанков в радиусе
        let loadedCount = 0;
        for (let dx = -renderDistance; dx <= renderDistance; dx++) {
            for (let dz = -renderDistance; dz <= renderDistance; dz++) {
                const cx = playerCx + dx;
                const cz = playerCz + dz;
                const key = this.getChunkKey(cx, cz);
                if (this.chunks.has(key)) {
                    loadedCount++;
                }
            }
        }
        this.loadedChunksInRadius = loadedCount;

        // Добавляем чанки в очередь по спирали от места спавна
        const maxRadius = Math.ceil(renderDistance);
        for (let radius = this.currentLoadRadius; radius <= maxRadius; radius++) {
            // Генерируем чанки на текущем радиусе по спирали
            const chunksAtRadius: Array<{ cx: number, cz: number, priority: number }> = [];

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    // Только чанки на границе текущего радиуса
                    const dist = Math.max(Math.abs(dx), Math.abs(dz));
                    if (dist !== radius) continue;

                    const cx = this.spawnChunk.x + dx;
                    const cz = this.spawnChunk.z + dz;

                    // Проверяем границы карты - не добавляем чанки за пределами
                    if (!this.isChunkInBounds(cx, cz)) continue;

                    // Проверяем, что чанк в радиусе видимости
                    const distFromPlayer = Math.max(Math.abs(cx - playerCx), Math.abs(cz - playerCz));
                    if (distFromPlayer > renderDistance) continue;

                    const key = this.getChunkKey(cx, cz);
                    if (this.chunks.has(key) || this.chunksLoading.has(key)) continue;

                    // Вычисляем приоритет (ближе к игроку = выше приоритет)
                    const priority = renderDistance - distFromPlayer;

                    // Проверяем, нет ли уже этого чанка в очереди
                    const exists = this.chunkLoadQueue.some(item => item.cx === cx && item.cz === cz);
                    if (!exists) {
                        chunksAtRadius.push({ cx, cz, priority });
                    }
                }
            }

            // Добавляем чанки в очередь
            this.chunkLoadQueue.push(...chunksAtRadius);

            // Если нашли чанки на этом радиусе, останавливаемся
            if (chunksAtRadius.length > 0) {
                break;
            }
        }

        // Увеличиваем радиус загрузки если текущий радиус полностью загружен
        if (this.chunkLoadQueue.length === 0 && this.currentLoadRadius < maxRadius) {
            this.currentLoadRadius++;
        }
    }

    /**
     * Обновляет статистику прогресса загрузки
     */
    private updateLoadingProgress(): void {
        // Вычисляем процент загруженных чанков
        // Уже вычисляется в getLoadingProgress()
    }

    /**
     * Получить прогресс загрузки чанков (0-100%) - для совместимости
     * @deprecated Используйте getMapLoadingProgress() для детальной информации
     */
    getChunkLoadingProgress(): number {
        if (!this.progressiveLoadingEnabled || this.totalChunksInRadius === 0) {
            return 100; // Если прогрессивная загрузка не включена, считаем что все загружено
        }

        const progress = Math.min(100, Math.round((this.loadedChunksInRadius / this.totalChunksInRadius) * 100));
        return progress;
    }

    /**
     * Включить прогрессивную загрузку чанков
     * @param spawnPos Позиция места спавна
     */
    enableProgressiveLoading(spawnPos: Vector3): void {
        this.progressiveLoadingEnabled = true;
        this.currentLoadRadius = this.INITIAL_LOAD_RADIUS;
        this.loadedChunksInRadius = 0;
        this.totalChunksInRadius = 0;
        this.chunkLoadQueue = [];
        this.chunksLoading.clear();

        // Вычисляем чанк места спавна
        this.spawnChunk.x = Math.floor(spawnPos.x / this.config.chunkSize);
        this.spawnChunk.z = Math.floor(spawnPos.z / this.config.chunkSize);

        // ОПТИМИЗАЦИЯ: Загружаем начальные чанки вокруг места спавна сразу (радиус 1)
        // Это гарантирует, что игрок может начать играть сразу
        const initialRadius = 1;
        for (let dx = -initialRadius; dx <= initialRadius; dx++) {
            for (let dz = -initialRadius; dz <= initialRadius; dz++) {
                const cx = this.spawnChunk.x + dx;
                const cz = this.spawnChunk.z + dz;
                const key = this.getChunkKey(cx, cz);

                if (!this.chunks.has(key)) {
                    try {
                        this.loadChunk(cx, cz);
                        this.loadedChunksInRadius++;
                    } catch (e) {
                        logger.warn(`[ChunkSystem] Error loading initial chunk (${cx}, ${cz}):`, e);
                    }
                }
            }
        }

        logger.log(`[ChunkSystem] Progressive loading enabled, spawn chunk: (${this.spawnChunk.x}, ${this.spawnChunk.z}), initial chunks loaded: ${this.loadedChunksInRadius}`);
    }

    /**
     * Выключить прогрессивную загрузку (вернуться к стандартной)
     */
    disableProgressiveLoading(): void {
        this.progressiveLoadingEnabled = false;
        this.chunkLoadQueue = [];
        this.chunksLoading.clear();
    }

    /**
     * КРИТИЧНО: Предзагрузка ВСЕЙ карты в пределах границ (СИНХРОННАЯ - вызывает freeze!)
     * @deprecated Используйте preloadEntireMapProgressive() для плавной загрузки
     */
    public preloadEntireMap(): void {
        const bounds = this.getMapBounds();
        if (!bounds) {
            logger.warn("[ChunkSystem] Cannot preload map: no bounds defined");
            return;
        }

        const chunkSize = this.config.chunkSize;

        // Вычисляем диапазон чанков для загрузки
        const minChunkX = Math.floor(bounds.minX / chunkSize);
        const maxChunkX = Math.ceil(bounds.maxX / chunkSize);
        const minChunkZ = Math.floor(bounds.minZ / chunkSize);
        const maxChunkZ = Math.ceil(bounds.maxZ / chunkSize);

        const totalChunks = (maxChunkX - minChunkX + 1) * (maxChunkZ - minChunkZ + 1);
        logger.log(`[ChunkSystem] Preloading entire map: chunks X[${minChunkX}..${maxChunkX}] Z[${minChunkZ}..${maxChunkZ}], total: ${totalChunks}`);

        let loadedCount = 0;
        for (let cx = minChunkX; cx <= maxChunkX; cx++) {
            for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
                const key = this.getChunkKey(cx, cz);
                if (!this.chunks.has(key)) {
                    this.loadChunk(cx, cz);
                    loadedCount++;
                }
            }
        }

        logger.log(`[ChunkSystem] Preloaded ${loadedCount} chunks for entire map`);
        this._preloadComplete = true;
    }

    // Флаг для отслеживания завершения предзагрузки
    private _preloadComplete = false;

    /**
     * Ожидание завершения предзагрузки карты
     * @param maxWaitMs Максимальное время ожидания в миллисекундах
     * @returns Promise который резолвится когда карта готова или истекло время ожидания
     */
    public waitForPreload(maxWaitMs: number = 10000): Promise<void> {
        return new Promise((resolve) => {
            // Если уже загружено - резолвим сразу
            if (this._preloadComplete) {
                logger.log("[ChunkSystem] Map already preloaded");
                resolve();
                return;
            }

            const startTime = Date.now();
            const checkInterval = 100;

            const check = () => {
                if (this._preloadComplete) {
                    logger.log("[ChunkSystem] Map preload complete");
                    resolve();
                    return;
                }

                // Проверяем, есть ли хотя бы базовые чанки
                if (this.chunks.size > 0) {
                    // Считаем загруженные чанки (чанки с мешами)
                    const loadedChunks = Array.from(this.chunks.values()).filter(c => c && c.meshes && c.meshes.length > 0).length;
                    if (loadedChunks > 0) {
                        logger.log(`[ChunkSystem] Map has ${loadedChunks} loaded chunks`);
                        resolve();
                        return;
                    }
                }

                if (Date.now() - startTime > maxWaitMs) {
                    logger.warn(`[ChunkSystem] Timeout waiting for preload after ${maxWaitMs}ms`);
                    resolve(); // Резолвим всё равно чтобы не блокировать
                    return;
                }

                setTimeout(check, checkInterval);
            };

            check();
        });
    }

    /**
     * Проверка готовности карты
     */
    public isMapReady(): boolean {
        return this._preloadComplete || this.chunks.size > 0;
    }

    // Флаг для отслеживания прогрессивной загрузки карты
    private isProgressiveMapLoading = false;
    private progressiveLoadTotal = 0;
    private progressiveLoadCurrent = 0;
    private onProgressiveLoadComplete: (() => void) | null = null;

    /**
     * ПРОГРЕССИВНАЯ загрузка карты - загружает чанки пакетами по N штук за кадр
     * НЕ вызывает freeze, позволяет игре работать во время загрузки
     * 
     * @param chunksPerFrame Количество чанков за один кадр (рекомендуется 5-10)
     * @param onProgress Callback для отслеживания прогресса (loaded, total)
     * @returns Promise который резолвится когда вся карта загружена
     */
    public async preloadEntireMapProgressive(
        chunksPerFrame: number = 8,
        onProgress?: (loaded: number, total: number) => void
    ): Promise<void> {
        const bounds = this.getMapBounds();
        if (!bounds) {
            logger.warn("[ChunkSystem] Cannot preload map: no bounds defined");
            return;
        }

        const chunkSize = this.config.chunkSize;

        // Вычисляем диапазон чанков для загрузки
        const minChunkX = Math.floor(bounds.minX / chunkSize);
        const maxChunkX = Math.ceil(bounds.maxX / chunkSize);
        const minChunkZ = Math.floor(bounds.minZ / chunkSize);
        const maxChunkZ = Math.ceil(bounds.maxZ / chunkSize);

        // Собираем все чанки в очередь (спиральная загрузка от центра)
        const chunkQueue: Array<{ cx: number, cz: number, priority: number }> = [];
        const centerX = Math.floor((minChunkX + maxChunkX) / 2);
        const centerZ = Math.floor((minChunkZ + maxChunkZ) / 2);

        for (let cx = minChunkX; cx <= maxChunkX; cx++) {
            for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
                const key = this.getChunkKey(cx, cz);
                if (!this.chunks.has(key) && this.isChunkInBounds(cx, cz)) {
                    // Приоритет - расстояние от центра (ближе к центру = выше приоритет)
                    const distFromCenter = Math.abs(cx - centerX) + Math.abs(cz - centerZ);
                    chunkQueue.push({ cx, cz, priority: distFromCenter });
                }
            }
        }

        // Сортируем: сначала центральные чанки, потом периферия
        chunkQueue.sort((a, b) => a.priority - b.priority);

        const totalChunks = chunkQueue.length;
        this.progressiveLoadTotal = totalChunks;
        this.progressiveLoadCurrent = 0;
        this.isProgressiveMapLoading = true;

        logger.log(`[ChunkSystem] Progressive loading: ${totalChunks} chunks, ${chunksPerFrame} per frame`);

        // Загружаем пакетами
        let loadedCount = 0;
        while (chunkQueue.length > 0) {
            const batch = chunkQueue.splice(0, chunksPerFrame);

            for (const { cx, cz } of batch) {
                const key = this.getChunkKey(cx, cz);
                if (!this.chunks.has(key)) {
                    this.loadChunk(cx, cz);
                    loadedCount++;
                    this.progressiveLoadCurrent = loadedCount;
                }
            }

            // Callback прогресса
            if (onProgress) {
                onProgress(loadedCount, totalChunks);
            }

            // Логируем каждые 10% прогресса
            const progress = Math.floor((loadedCount / totalChunks) * 100);
            // Логируем только каждые 25% для снижения спама
            if (progress % 25 === 0 && loadedCount > 0 && progress > 0) {
                logger.log(`[ChunkSystem] Loading: ${progress}%`);
            }

            // Ждём следующий кадр перед загрузкой следующего пакета
            if (chunkQueue.length > 0) {
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            }
        }

        this.isProgressiveMapLoading = false;
        logger.log(`[ChunkSystem] Progressive loading complete: ${loadedCount} chunks loaded`);

        if (this.onProgressiveLoadComplete) {
            this.onProgressiveLoadComplete();
            this.onProgressiveLoadComplete = null;
        }
    }

    /**
     * Получить прогресс загрузки карты
     * @returns { loaded, total, percent, isLoading }
     */
    public getLoadingProgress(): { loaded: number; total: number; percent: number; isLoading: boolean } {
        return {
            loaded: this.progressiveLoadCurrent,
            total: this.progressiveLoadTotal,
            percent: this.progressiveLoadTotal > 0
                ? Math.floor((this.progressiveLoadCurrent / this.progressiveLoadTotal) * 100)
                : 100,
            isLoading: this.isProgressiveMapLoading
        };
    }

    private loadChunk(cx: number, cz: number): void {
        // Проверяем границы карты - не генерируем чанки за пределами арены
        if (!this.isChunkInBounds(cx, cz)) {
            return; // Чанк за пределами карты - пропускаем
        }

        const key = this.getChunkKey(cx, cz);
        const chunkSize = this.config.chunkSize;

        // cornerX, cornerZ - это координаты УГЛА чанка (левый нижний)
        const cornerX = cx * chunkSize;
        const cornerZ = cz * chunkSize;

        const chunkParent = new TransformNode(`chunk_${key}`, this.scene);
        chunkParent.position = new Vector3(cornerX, 0, cornerZ);

        const chunk: ChunkData = {
            x: cx, z: cz, node: chunkParent, meshes: [], loaded: true, lastAccess: Date.now()
        };

        const seed = this.config.worldSeed + cx * 10000 + cz;

        // ФАЗА 1: БЫСТРАЯ - создаём только базовый terrain (синхронно, ~5ms)
        this.createBaseTerrain(cx, cz, cornerX, cornerZ, chunkParent, seed);

        // Сохраняем чанк СРАЗУ (terrain уже готов)
        this.chunks.set(key, chunk);

        // ФАЗА 2: ЛЕНИВАЯ - детали через requestIdleCallback (не блокирует FPS)
        this.scheduleDetailsGeneration(cx, cz, chunkParent, seed);

        // ОПТИМИЗАЦИЯ: Сразу скрываем чанк если он за пределами unloadDistance от игрока
        // Это предотвращает рендеринг далёких чанков при фоновой загрузке карты
        const playerChunk = this.lastPlayerChunk;
        const dist = Math.max(Math.abs(cx - playerChunk.x), Math.abs(cz - playerChunk.z));
        if (dist > this.config.unloadDistance) {
            this.hideChunk(chunk);
        }
    }

    /**
     * ФАЗА 1: Быстрое создание базового terrain (только ground mesh)
     * Выполняется синхронно, занимает ~5ms
     */
    private createBaseTerrain(cx: number, cz: number, worldX: number, worldZ: number, chunkParent: TransformNode, seed: number): void {
        const size = this.config.chunkSize;
        const random = new SeededRandom(seed);

        // Sandbox, Sand, Madness, Expo и Custom - просто плоская земля БЕЗ террейна
        // Custom карты будут отредактированы через mapEditor после загрузки
        if (this.config.mapType === "sandbox" || this.config.mapType === "sand" || this.config.mapType === "madness" || this.config.mapType === "expo" || this.config.mapType === "brest" || this.config.mapType === "arena" || this.config.mapType === "custom") {
            this.createGround(cx, cz, worldX, worldZ, size, "wasteland", random, chunkParent);
            return;
        }

        // Специальные карты
        const mapType = this.config.mapType || "normal";
        const specialMaps = ["polygon", "frontline", "ruins", "canyon", "industrial", "urban_warfare", "underground", "coastal"];

        if (specialMaps.includes(mapType)) {
            const groundBiome = this.config.mapType === "polygon" ? "military" :
                this.config.mapType === "frontline" ? "wasteland" :
                    this.config.mapType === "ruins" ? "wasteland" :
                        this.config.mapType === "canyon" ? "park" :
                            this.config.mapType === "industrial" ? "industrial" :
                                this.config.mapType === "urban_warfare" ? "city" :
                                    this.config.mapType === "underground" ? "wasteland" :
                                        this.config.mapType === "coastal" ? "park" : "military";
            this.createGround(cx, cz, worldX, worldZ, size, groundBiome, random, chunkParent);
            return;
        }

        // Normal/tartaria карты - определяем биом
        let biome: BiomeType;
        if (this.config.mapType === "normal") {
            biome = this.getRandomBiome(worldX + size / 2, worldZ + size / 2, random);
        } else if (this.config.mapType === "tartaria") {
            biome = this.getBiome(worldX + size / 2, worldZ + size / 2, random);
        } else {
            // Fallback для неизвестных типов карт - используем sandbox поведение
            logger.warn(`[ChunkSystem] Unknown map type: ${this.config.mapType}, using sandbox terrain`);
            this.createGround(cx, cz, worldX, worldZ, size, "wasteland", random, chunkParent);
            return;
        }

        // Создаём только ground mesh
        this.createGround(cx, cz, worldX, worldZ, size, biome, random, chunkParent);
    }

    /**
     * Генерирует детали чанка СИНХРОННО (сразу при загрузке)
     * Для полной загрузки карты без дыр и ожидания
     */
    private scheduleDetailsGeneration(cx: number, cz: number, chunkParent: TransformNode, seed: number): void {
        // СИНХРОННАЯ генерация деталей - сразу при загрузке чанка
        // Это может вызвать freeze при загрузке, но гарантирует что все объекты будут на месте
        this.generateChunkDetails(cx, cz, chunkParent, seed);
    }

    /**
     * Обрабатывает очередь деталей через requestIdleCallback
     */
    private processDetailsQueue(): void {
        if (this.detailsQueue.length === 0) {
            this.isProcessingDetails = false;
            return;
        }

        this.isProcessingDetails = true;

        const processOne = (deadline: IdleDeadline) => {
            // Обрабатываем пока есть время (минимум 10ms) или таймаут
            while (this.detailsQueue.length > 0 && (deadline.timeRemaining() > 10 || deadline.didTimeout)) {
                const item = this.detailsQueue.shift();
                if (item && this.chunks.has(this.getChunkKey(item.cx, item.cz))) {
                    this.generateChunkDetails(item.cx, item.cz, item.chunkParent, item.seed);
                }

                // Ограничиваем количество за один idle callback
                if (deadline.timeRemaining() < 5) break;
            }

            // Продолжаем если есть ещё элементы
            if (this.detailsQueue.length > 0) {
                if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(processOne, { timeout: 1000 });
                } else {
                    setTimeout(() => processOne({ timeRemaining: () => 50, didTimeout: true } as IdleDeadline), 16);
                }
            } else {
                this.isProcessingDetails = false;
            }
        };

        if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(processOne, { timeout: 1000 });
        } else {
            // Fallback для браузеров без requestIdleCallback
            setTimeout(() => processOne({ timeRemaining: () => 50, didTimeout: true } as IdleDeadline), 16);
        }
    }

    /**
     * ФАЗА 2: Генерация деталей чанка (здания, деревья, дороги)
     * Вызывается асинхронно через requestIdleCallback
     */
    private generateChunkDetails(cx: number, cz: number, chunkParent: TransformNode, seed: number): void {
        const size = this.config.chunkSize;
        const worldX = cx * size;
        const worldZ = cz * size;
        const random = new SeededRandom(seed);

        // Sandbox - без деталей
        if (this.config.mapType === "sandbox") {
            return;
        }

        const mapType = this.config.mapType || "normal";
        const specialMaps = ["polygon", "frontline", "ruins", "canyon", "industrial", "urban_warfare", "underground", "coastal", "sand", "madness", "expo", "brest", "arena"];

        if (specialMaps.includes(mapType)) {
            const generator = MapGeneratorFactory.get(mapType);
            if (generator) {
                const groundBiome = this.config.mapType === "polygon" ? "military" :
                    this.config.mapType === "frontline" ? "wasteland" :
                        this.config.mapType === "sand" ? "wasteland" :
                            this.config.mapType === "madness" ? "wasteland" :
                                this.config.mapType === "expo" ? "wasteland" :
                                    this.config.mapType === "brest" ? "wasteland" :
                                        this.config.mapType === "arena" ? "wasteland" : "military";
                const chunkContext: ChunkGenerationContext = {
                    scene: this.scene,
                    chunkX: cx,
                    chunkZ: cz,
                    worldX,
                    worldZ,
                    size,
                    random: new MapsSeededRandom(seed),
                    chunkParent,
                    biome: groundBiome
                };
                try {
                    generator.generateContent(chunkContext);
                } catch (error) {
                    logger.error(`[ChunkSystem] Error generating details for ${mapType}:`, error);
                }
            }
            // Merge после генерации деталей
            this.mergeStaticMeshesInChunk(chunkParent);
            return;
        }

        // Normal/tartaria карты
        let biome: BiomeType;
        if (this.config.mapType === "normal") {
            biome = this.getRandomBiome(worldX + size / 2, worldZ + size / 2, random);
        } else {
            biome = this.getBiome(worldX + size / 2, worldZ + size / 2, random);
        }

        // Гаражи
        this.generateGarages(cx, cz, worldX, worldZ, size, random, chunkParent);

        // Дороги
        this.createRoads(cx, cz, size, random, biome, chunkParent);

        // Контент по биому
        switch (biome) {
            case "city": this.generateCity(cx, cz, size, random, chunkParent); break;
            case "industrial": this.generateIndustrial(cx, cz, size, random, chunkParent); break;
            case "residential": this.generateResidential(cx, cz, size, random, chunkParent); break;
            case "park": this.generatePark(cx, cz, size, random, chunkParent); break;
            case "wasteland": this.generateWasteland(cx, cz, size, random, chunkParent); break;
            case "military": this.generateMilitary(cx, cz, size, random, chunkParent); break;
        }

        // Merge после генерации деталей
        this.mergeStaticMeshesInChunk(chunkParent);
    }

    // Get completely random biome for normal map (no distance dependency)
    private getRandomBiome(worldX: number, worldZ: number, random: SeededRandom): BiomeType {
        const cacheKey = `rand_${Math.floor(worldX / 10)}_${Math.floor(worldZ / 10)}`;
        if (this.biomeCache.has(cacheKey)) {
            return this.biomeCache.get(cacheKey)!;
        }

        // Use noise for smooth transitions, but random distribution
        const biomeNoiseScale = 0.003;
        const biomeNoise1 = this.biomeNoise ?
            (this.biomeNoise.fbm(worldX * biomeNoiseScale, worldZ * biomeNoiseScale, 3, 2, 0.5) + 1) / 2 :
            random.next();
        const biomeNoise2 = this.biomeNoise ?
            (this.biomeNoise.fbm(worldX * biomeNoiseScale * 1.7, worldZ * biomeNoiseScale * 1.7, 2, 2, 0.6) + 1) / 2 :
            random.next();

        // Completely random distribution of all biomes
        const allBiomes: BiomeType[] = ["city", "industrial", "residential", "park", "wasteland", "military"];
        const weights = [0.2, 0.15, 0.2, 0.15, 0.15, 0.15]; // Equal-ish distribution

        // Select biome based on combined noise
        const combinedNoise = (biomeNoise1 + biomeNoise2) / 2;
        const cumulative = weights.reduce((acc, w, i) => {
            acc.push((acc[i] ?? 0) + w);
            return acc;
        }, [0] as number[]);
        const total = cumulative[cumulative.length - 1] ?? 1;
        const normalizedNoise = combinedNoise * total;

        let selectedBiome: BiomeType = allBiomes[0] ?? "city";
        for (let i = 0; i < cumulative.length - 1; i++) {
            if (normalizedNoise >= (cumulative[i] ?? 0) && normalizedNoise < (cumulative[i + 1] ?? 1)) {
                selectedBiome = allBiomes[i] ?? "city";
                break;
            }
        }

        // Smooth transitions between biomes using neighbor sampling
        const sampleRadius = this.config.chunkSize * 1.5;
        const samples: Array<{ biome: BiomeType, weight: number }> = [];

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const sampleX = worldX + dx * sampleRadius / 2;
                const sampleZ = worldZ + dz * sampleRadius / 2;

                const sampleNoise = this.biomeNoise ?
                    (this.biomeNoise.fbm(sampleX * biomeNoiseScale, sampleZ * biomeNoiseScale, 2, 2, 0.5) + 1) / 2 :
                    random.next();

                const sampleCombined = (sampleNoise + random.next()) / 2;
                const sampleNormalized = sampleCombined * total;

                let sampleBiome: BiomeType = allBiomes[0] ?? "city";
                for (let i = 0; i < cumulative.length - 1; i++) {
                    if (sampleNormalized >= (cumulative[i] ?? 0) && sampleNormalized < (cumulative[i + 1] ?? 1)) {
                        sampleBiome = allBiomes[i] ?? "city";
                        break;
                    }
                }

                const weight = dx === 0 && dz === 0 ? 0.4 : 0.075;
                samples.push({ biome: sampleBiome, weight });
            }
        }

        // Blend in transition zones
        const boundaryNoise = this.biomeNoise ?
            (this.biomeNoise.fbm(worldX * biomeNoiseScale * 3, worldZ * biomeNoiseScale * 3, 2, 2, 0.5) + 1) / 2 :
            biomeNoise2;

        const isTransitionZone = boundaryNoise > 0.4 && boundaryNoise < 0.6;
        if (isTransitionZone && samples.length > 0) {
            const biomeVotes = new Map<BiomeType, number>();
            samples.forEach(s => {
                biomeVotes.set(s.biome, (biomeVotes.get(s.biome) || 0) + s.weight);
            });

            let maxVotes = 0;
            let blendedBiome = selectedBiome;
            biomeVotes.forEach((votes, biome) => {
                if (votes > maxVotes) {
                    maxVotes = votes;
                    blendedBiome = biome;
                }
            });

            const blendFactor = (boundaryNoise - 0.4) / 0.2;
            if (blendFactor > 0.3 && blendFactor < 0.7) {
                selectedBiome = blendedBiome;
            }
        }

        this.biomeCache.set(cacheKey, selectedBiome);
        return selectedBiome;
    }

    private getBiome(worldX: number, worldZ: number, random: SeededRandom): BiomeType {
        // Check cache first
        const cacheKey = `${Math.floor(worldX / 10)}_${Math.floor(worldZ / 10)}`;
        if (this.biomeCache.has(cacheKey)) {
            return this.biomeCache.get(cacheKey)!;
        }

        const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);

        // Use noise-based biome determination for organic transitions
        // Multiple noise layers for smooth, natural transitions over 2-3 chunks
        const biomeNoiseScale = 0.003; // Scale for biome transitions (~2-3 chunks)
        const biomeNoise1 = this.biomeNoise ?
            (this.biomeNoise.fbm(worldX * biomeNoiseScale, worldZ * biomeNoiseScale, 3, 2, 0.5) + 1) / 2 :
            random.next();
        const biomeNoise2 = this.biomeNoise ?
            (this.biomeNoise.fbm(worldX * biomeNoiseScale * 1.7, worldZ * biomeNoiseScale * 1.7, 2, 2, 0.6) + 1) / 2 :
            random.next();

        // Combine distance-based zones with noise for smooth transitions
        let baseBiome: BiomeType;
        let biomeOptions: BiomeType[] = [];
        let weights: number[] = [];

        if (dist < 100) {
            // Center zone - dense city with rare parks
            baseBiome = "city";
            if (biomeNoise1 < 0.85) {
                biomeOptions = ["city"];
                weights = [1.0];
            } else if (biomeNoise1 < 0.95) {
                biomeOptions = ["city", "industrial"];
                weights = [0.7, 0.3];
            } else {
                biomeOptions = ["city", "park"];
                weights = [0.6, 0.4];
            }
        } else if (dist < 200) {
            // Middle zone - mixed development with gradual transitions
            const transitionFactor = (dist - 100) / 100; // 0 to 1

            if (transitionFactor < 0.3) {
                // Still mostly city, transitioning to residential
                biomeOptions = ["city", "residential", "industrial", "park"];
                weights = [
                    0.5 - transitionFactor * 0.3,
                    0.2 + transitionFactor * 0.2,
                    0.15,
                    0.15 + transitionFactor * 0.1
                ];
            } else {
                // More suburban mix
                biomeOptions = ["city", "residential", "industrial", "park", "military"];
                weights = [
                    0.25 - transitionFactor * 0.1,
                    0.3 + transitionFactor * 0.1,
                    0.2,
                    0.2,
                    0.05
                ];
            }
            baseBiome = "residential";
        } else if (dist < 350) {
            // Outer zone - suburb and nature
            const transitionFactor = (dist - 200) / 150; // 0 to 1

            biomeOptions = ["residential", "park", "industrial", "wasteland", "military"];
            weights = [
                0.3 - transitionFactor * 0.2,
                0.25 + transitionFactor * 0.1,
                0.15 - transitionFactor * 0.1,
                0.2 + transitionFactor * 0.15,
                0.1
            ];
            baseBiome = "park";
        } else {
            // Far zone - nature and military
            const transitionFactor = Math.min((dist - 350) / 200, 1); // 0 to 1

            biomeOptions = ["wasteland", "park", "military", "residential", "industrial"];
            weights = [
                0.35 + transitionFactor * 0.15,
                0.25 - transitionFactor * 0.15,
                0.2 + transitionFactor * 0.1,
                0.15 - transitionFactor * 0.1,
                0.05
            ];
            baseBiome = "wasteland";
        }

        // Use noise to select from options with weighted probability
        let selectedBiome: BiomeType = baseBiome;
        if (biomeOptions.length > 0) {
            const cumulative = weights.reduce((acc, w, i) => {
                acc.push((acc[i] ?? 0) + w);
                return acc;
            }, [0] as number[]);
            const total = cumulative[cumulative.length - 1] ?? 1;
            const normalizedNoise = biomeNoise1 * total;

            for (let i = 0; i < cumulative.length - 1; i++) {
                if (normalizedNoise >= (cumulative[i] ?? 0) && normalizedNoise < (cumulative[i + 1] ?? 1)) {
                    selectedBiome = (biomeOptions[i] ?? baseBiome) as BiomeType;
                    break;
                }
            }
        }

        // Apply additional noise for organic boundary variation
        // This creates irregular, non-rectangular biome boundaries
        const boundaryNoise = this.biomeNoise ?
            (this.biomeNoise.fbm(worldX * biomeNoiseScale * 3, worldZ * biomeNoiseScale * 3, 2, 2, 0.5) + 1) / 2 :
            biomeNoise2;

        // Sample neighboring regions for gradient blending
        const sampleRadius = this.config.chunkSize * 1.5; // ~1.5 chunks
        const samples: Array<{ biome: BiomeType, weight: number }> = [];

        // Sample center and 8 surrounding points
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const sampleX = worldX + dx * sampleRadius / 2;
                const sampleZ = worldZ + dz * sampleRadius / 2;
                const sampleDist = Math.sqrt(sampleX * sampleX + sampleZ * sampleZ);

                // Quick biome estimation for sample point
                let sampleBiome: BiomeType;
                if (sampleDist < 100) {
                    sampleBiome = "city";
                } else if (sampleDist < 200) {
                    const sampleNoise = this.biomeNoise ?
                        (this.biomeNoise.fbm(sampleX * biomeNoiseScale, sampleZ * biomeNoiseScale, 2, 2, 0.5) + 1) / 2 :
                        random.next();
                    if (sampleNoise < 0.4) sampleBiome = "city";
                    else if (sampleNoise < 0.6) sampleBiome = "residential";
                    else if (sampleNoise < 0.8) sampleBiome = "industrial";
                    else if (sampleNoise < 0.92) sampleBiome = "park";
                    else sampleBiome = "military";
                } else if (sampleDist < 350) {
                    const sampleNoise = this.biomeNoise ?
                        (this.biomeNoise.fbm(sampleX * biomeNoiseScale, sampleZ * biomeNoiseScale, 2, 2, 0.5) + 1) / 2 :
                        random.next();
                    if (sampleNoise < 0.3) sampleBiome = "residential";
                    else if (sampleNoise < 0.5) sampleBiome = "park";
                    else if (sampleNoise < 0.7) sampleBiome = "industrial";
                    else if (sampleNoise < 0.85) sampleBiome = "wasteland";
                    else sampleBiome = "military";
                } else {
                    const sampleNoise = this.biomeNoise ?
                        (this.biomeNoise.fbm(sampleX * biomeNoiseScale, sampleZ * biomeNoiseScale, 2, 2, 0.5) + 1) / 2 :
                        random.next();
                    if (sampleNoise < 0.35) sampleBiome = "wasteland";
                    else if (sampleNoise < 0.6) sampleBiome = "park";
                    else if (sampleNoise < 0.8) sampleBiome = "military";
                    else if (sampleNoise < 0.92) sampleBiome = "residential";
                    else sampleBiome = "industrial";
                }

                // Weight based on distance (center gets highest weight)
                const weight = dx === 0 && dz === 0 ? 0.4 : 0.075;
                samples.push({ biome: sampleBiome, weight });
            }
        }

        // Blend samples if we're in transition zone (boundaryNoise indicates edge)
        const isTransitionZone = boundaryNoise > 0.4 && boundaryNoise < 0.6;
        if (isTransitionZone && samples.length > 0) {
            // Count biome votes
            const biomeVotes = new Map<BiomeType, number>();
            samples.forEach(s => {
                biomeVotes.set(s.biome, (biomeVotes.get(s.biome) || 0) + s.weight);
            });

            // Find most common neighboring biome
            let maxVotes = 0;
            let blendedBiome = selectedBiome;
            biomeVotes.forEach((votes, biome) => {
                if (votes > maxVotes) {
                    maxVotes = votes;
                    blendedBiome = biome;
                }
            });

            // Blend between primary and neighboring biome
            const blendFactor = (boundaryNoise - 0.4) / 0.2; // 0 to 1
            if (blendFactor > 0.3 && blendFactor < 0.7) {
                selectedBiome = blendedBiome;
            }
        }

        // Cache result
        this.biomeCache.set(cacheKey, selectedBiome);

        return selectedBiome;
    }

    private generateChunkContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, chunkParent: TransformNode): void {
        const size = this.config.chunkSize;
        const seed = this.config.worldSeed + chunkX * 10000 + chunkZ;
        const random = new SeededRandom(seed);

        // В режиме песочницы генерируем только землю
        if (this.config.mapType === "sandbox") {
            // Простая плоская земля для песочницы
            this.createGround(chunkX, chunkZ, worldX, worldZ, size, "wasteland", random, chunkParent);
            // Гаражи уже созданы в createAllGarages(), пропускаем generateGarages
            return;
        }

        // Используем новую систему генераторов через MapGeneratorFactory
        // Проверяем, есть ли зарегистрированный генератор для этого типа карты
        const mapType = this.config.mapType || "normal";

        // Для специальных карт (polygon, frontline и т.д.) используем новую систему генераторов
        const specialMaps = ["polygon", "frontline", "ruins", "canyon", "industrial", "urban_warfare", "underground", "coastal", "sand", "madness", "expo", "brest", "arena"];
        if (specialMaps.includes(mapType)) {
            const generator = MapGeneratorFactory.get(mapType);

            // Отладочное логирование
            if (mapType === "polygon") {
                // logger.log(`[ChunkSystem] Polygon map detected, generator found: ${generator !== undefined}`);
                if (!generator) {
                    const available = MapGeneratorFactory.getAvailableMapTypes();
                    logger.error(`[ChunkSystem] Polygon generator not found! Available generators: ${available.join(", ")}`);
                    // Fallback на старую логику если генератор не найден
                } else {
                    // logger.log(`[ChunkSystem] Using PolygonGenerator for chunk (${chunkX}, ${chunkZ})`);
                }
            }

            // Отладочное логирование для frontline
            if (mapType === "frontline") {
                // logger.log(`[ChunkSystem] Frontline map detected, generator found: ${generator !== undefined}`);
                if (!generator) {
                    const available = MapGeneratorFactory.getAvailableMapTypes();
                    logger.error(`[ChunkSystem] Frontline generator not found! Available generators: ${available.join(", ")}`);
                } else {
                    // logger.log(`[ChunkSystem] Using FrontlineGenerator for chunk (${chunkX}, ${chunkZ})`);
                }
            }

            if (generator) {
                // КРИТИЧНО: Создаём базовый ground mesh с heightmap ПЕРЕД вызовом генератора
                // Это гарантирует, что террейн правильно обходит гаражи на всех картах
                // Для polygon используем "military" биом, для других карт - соответствующий
                const groundBiome = this.config.mapType === "polygon" ? "military" :
                    this.config.mapType === "frontline" ? "wasteland" :
                        this.config.mapType === "ruins" ? "wasteland" :
                            this.config.mapType === "canyon" ? "park" :
                                this.config.mapType === "industrial" ? "industrial" :
                                    this.config.mapType === "urban_warfare" ? "city" :
                                        this.config.mapType === "underground" ? "wasteland" :
                                            this.config.mapType === "coastal" ? "park" :
                                                this.config.mapType === "sand" ? "wasteland" :
                                                    this.config.mapType === "madness" ? "wasteland" : "military";

                // Логируем создание ground mesh для отладки
                // Отключено для снижения спама
                // if (mapType === "frontline") {
                //     logger.log(`[ChunkSystem] Creating ground mesh for frontline chunk (${chunkX}, ${chunkZ}) with biome: ${groundBiome}`);
                // }
                this.createGround(chunkX, chunkZ, worldX, worldZ, size, groundBiome, random, chunkParent);

                // Создаём контекст генерации чанка
                const chunkContext: ChunkGenerationContext = {
                    scene: this.scene,
                    chunkX,
                    chunkZ,
                    worldX,
                    worldZ,
                    size,
                    random: new MapsSeededRandom(seed), // Используем SeededRandom из maps
                    chunkParent,
                    biome: groundBiome
                };

                // Генерируем контент через генератор (холмы, здания, препятствия и т.д.)
                try {
                    generator.generateContent(chunkContext);
                    // Логируем успешную генерацию контента для frontline
                    // Отключено для снижения спама
                    // if (mapType === "frontline") {
                    //     logger.log(`[ChunkSystem] FrontlineGenerator.generateContent completed for chunk (${chunkX}, ${chunkZ})`);
                    // }
                } catch (error) {
                    logger.error(`[ChunkSystem] Error generating content for ${mapType}:`, error);
                    // Fallback на старую логику при ошибке
                    if (mapType === "polygon") {
                        this.generatePolygonContent(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
                    }
                    // Для frontline ground mesh уже создан выше, просто логируем ошибку
                    if (mapType === "frontline") {
                        logger.warn(`[ChunkSystem] FrontlineGenerator.generateContent failed, but ground mesh was already created for chunk (${chunkX}, ${chunkZ})`);
                    }
                }
                return;
            } else {
                // Генератор не найден - используем старую логику как fallback
                logger.warn(`[ChunkSystem] Generator for ${mapType} not found, using fallback`);
                if (mapType === "polygon") {
                    this.generatePolygonContent(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
                    return;
                }
                // Fallback для frontline: создаём ground mesh даже если генератор не найден
                if (mapType === "frontline") {
                    logger.warn(`[ChunkSystem] Frontline generator not found, creating fallback ground mesh for chunk (${chunkX}, ${chunkZ})`);
                    this.createGround(chunkX, chunkZ, worldX, worldZ, size, "wasteland", random, chunkParent);
                    return;
                }
            }
        }

        // Fallback для старых карт (normal, tartaria) или если генератор не найден
        // Для normal карты используем старую логику

        // For normal map, use completely random biomes (no distance dependency)
        let biome: BiomeType;
        if (this.config.mapType === "normal") {
            biome = this.getRandomBiome(worldX + size / 2, worldZ + size / 2, random);
        } else {
            biome = this.getBiome(worldX + size / 2, worldZ + size / 2, random);
        }

        // Ground based on biome (heightmap)
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, biome, random, chunkParent);

        // КРИТИЧЕСКИ ВАЖНО: Гаражи генерируем ПЕРВЫМИ, чтобы исключить их области из генерации других объектов
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Roads - use RoadNetwork for better procedural roads
        this.createRoads(chunkX, chunkZ, size, random, biome, chunkParent);

        // Content based on biome
        switch (biome) {
            case "city": this.generateCity(chunkX, chunkZ, size, random, chunkParent); break;
            case "industrial": this.generateIndustrial(chunkX, chunkZ, size, random, chunkParent); break;
            case "residential": this.generateResidential(chunkX, chunkZ, size, random, chunkParent); break;
            case "park": this.generatePark(chunkX, chunkZ, size, random, chunkParent); break;
            case "wasteland": this.generateWasteland(chunkX, chunkZ, size, random, chunkParent); break;
            case "military": this.generateMilitary(chunkX, chunkZ, size, random, chunkParent); break;
        }

        // Terrain features (hills, water, craters, platforms)
        this.addTerrainFeatures(chunkX, chunkZ, size, random, biome, chunkParent);

        // Add terrain details (rocks, boulders) for natural biomes
        if (biome === "park" || biome === "wasteland" || biome === "military") {
            this.addTerrainDetails(chunkX, chunkZ, size, random, biome, chunkParent);
        }

        // Generate cover objects (containers, cars, barriers, etc.)
        this.generateCoverObjects(chunkX, chunkZ, worldX, worldZ, size, biome, chunkParent);

        // Generate POIs (capture points, ammo depots, etc.)
        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, biome, chunkParent);

        // Scatter generic props for uniqueness (уменьшено количество)
        // this.addScatteredProps(chunk, size, random); // Временно отключено для оптимизации

        // Генерируем припасы
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    /**
     * ЕДИНСТВЕННАЯ функция для получения высоты террейна.
     * Гарантирует детерминизм: одинаковые координаты = одинаковая высота.
     * Используется для ВСЕХ вершин террейна.
     * 
     * ВАЖНО: Высота НЕ ЗАВИСИТ от биома! Биом влияет только на текстуру.
     * Это гарантирует бесшовность между чанками с разными биомами.
     */
    private getWorldHeight(worldX: number, worldZ: number): number {
        if (!this.terrainGenerator) return 0;

        // Округление для устранения погрешностей float
        const precision = 0.0001; // 0.1mm точность
        const x = Math.round(worldX / precision) * precision;
        const z = Math.round(worldZ / precision) * precision;

        // Проверка гаража - плоская область
        if (this.isPositionInGarageArea(x, z, 10)) {
            return 0; // Пол гаража
        }

        // Плавный переход от гаража
        const garageTransitionRadius = 25;
        let garageBlend = 0;
        for (const area of this.garageAreas) {
            const centerX = area.x + area.width / 2;
            const centerZ = area.z + area.depth / 2;
            const dist = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
            const edgeDist = dist - Math.max(area.width, area.depth) / 2;
            if (edgeDist < garageTransitionRadius && edgeDist > 0) {
                const t = edgeDist / garageTransitionRadius;
                // Smoothstep для плавного перехода
                garageBlend = Math.max(garageBlend, 1 - t * t * (3 - 2 * t));
            }
        }

        // КРИТИЧЕСКИ ВАЖНО: Используем ОДИН биом "park" для ВСЕХ вершин
        // Это гарантирует бесшовность между чанками с разными биомами
        // Биом чанка влияет только на текстуру, но НЕ на геометрию
        let height = this.terrainGenerator.getHeight(x, z, "park");

        // УДАЛЕНО: Горный барьер по краям карты (вызывал проблемы с производительностью)
        // Теперь края карты плоские

        // Смешивание с высотой гаража (0) для плавного перехода
        if (garageBlend > 0) {
            height = height * (1 - garageBlend);
        }

        // Валидация
        if (!isFinite(height) || isNaN(height)) {
            height = 0;
        }

        return Math.max(height, 0);
    }

    /**
     * Создаёт террейн (ground mesh) для чанка.
     * БЕСШОВНАЯ ГЕНЕРАЦИЯ: Использует единую функцию getWorldHeight для всех вершин,
     * что гарантирует идентичные высоты на границах соседних чанков.
     * 
     * @param chunkX - Индекс чанка по X
     * @param chunkZ - Индекс чанка по Z  
     * @param cornerX - Мировая координата X угла чанка
     * @param cornerZ - Мировая координата Z угла чанка
     * @param size - Размер чанка
     * @param biome - Биом для выбора материала
     * @param _random - Генератор случайных чисел (не используется)
     * @param chunkParent - Родительский узел чанка
     */
    private createGround(chunkX: number, chunkZ: number, cornerX: number, cornerZ: number, size: number, biome: BiomeType | string, _random: SeededRandom, chunkParent: TransformNode): void {
        const chunkSize = this.config.chunkSize;

        // Определяем материал на основе биома
        let groundMat: string;
        switch (biome) {
            case "city": groundMat = "asphalt"; break;
            case "industrial": groundMat = "gravel"; break;
            case "residential": groundMat = "grassDark"; break;
            case "park": groundMat = "grass"; break;
            case "wasteland": groundMat = "dirt"; break;
            case "military": groundMat = "sand"; break;
            default: groundMat = typeof biome === "string" ? biome : "dirt";
        }

        // Для sandbox, sand, madness, expo и brest - ТОЛЬКО плоский ground без heightmap
        if (this.config.mapType === "sandbox" || this.config.mapType === "sand" || this.config.mapType === "madness" || this.config.mapType === "expo" || this.config.mapType === "brest" || this.config.mapType === "arena") {
            const ground = MeshBuilder.CreateBox(`ground_${chunkX}_${chunkZ}`, {
                width: chunkSize,
                height: 0.1,
                depth: chunkSize
            }, this.scene);
            ground.position = new Vector3(chunkSize / 2, -0.05, chunkSize / 2);
            ground.renderingGroupId = 0;
            ground.receiveShadows = false;
            ground.material = this.getMat(groundMat);
            ground.parent = chunkParent;
            // КРИТИЧНО: Ground должен быть pickable для raycast (стенки, спавн и т.д.)
            ground.isPickable = true;
            this.optimizeMesh(ground);
            // КРИТИЧНО: После optimizeMesh снова устанавливаем isPickable, так как optimizeMesh может его сбросить
            ground.isPickable = true;
            new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            return;
        }

        // Защитная проверка: если terrainGenerator отсутствует, логируем предупреждение
        if (!this.terrainGenerator) {
            logger.warn(`[ChunkSystem] createGround: terrainGenerator is null for chunk (${chunkX}, ${chunkZ}), using flat fallback ground`);
        }

        // Если есть terrain generator - создаём heightmap terrain
        if (this.terrainGenerator) {
            const subdivisions = 12; // 13x13 = 169 вершин на чанк

            // БЕЗ OVERLAP - точное соответствие размеру чанка
            // Это гарантирует что границы чанков точно совпадают
            const ground = MeshBuilder.CreateGround(`ground_${chunkX}_${chunkZ}`, {
                width: chunkSize,
                height: chunkSize,
                subdivisions,
                updatable: true // ВАЖНО: true чтобы можно было обновить высоты вершин
            }, this.scene);

            const positions = ground.getVerticesData(VertexBuffer.PositionKind);
            if (!positions) {
                ground.dispose();
                return;
            }

            const vertsPerSide = subdivisions + 1;

            // ЕДИНАЯ ФОРМУЛА для всех вершин - ключ к бесшовности
            // ВАЖНО: В Babylon.js CreateGround порядок вершин по Z ИНВЕРТИРОВАН!
            // row=0 → z = +height/2 (дальняя сторона), row=max → z = -height/2 (ближняя)
            // Поэтому формула для worldZ учитывает эту инверсию
            for (let gz = 0; gz < vertsPerSide; gz++) {
                for (let gx = 0; gx < vertsPerSide; gx++) {
                    const idx = (gz * vertsPerSide + gx) * 3;

                    // Мировые координаты вершины
                    // X: стандартный порядок от cornerX до cornerX + chunkSize
                    const worldX = cornerX + (gx / subdivisions) * chunkSize;
                    // Z: ИНВЕРТИРОВАННЫЙ порядок! gz=0 → дальний край, gz=max → ближний край
                    const worldZ = cornerZ + chunkSize - (gz / subdivisions) * chunkSize;

                    // Единая детерминистическая функция высоты для ВСЕХ вершин
                    // ВАЖНО: Без параметра biome - высота независима от биома!
                    const height = this.getWorldHeight(worldX, worldZ);

                    // Устанавливаем высоту (X и Z уже установлены CreateGround)
                    positions[idx + 1] = height;
                }
            }

            // Обновляем вершины
            ground.updateVerticesData(VertexBuffer.PositionKind, positions);
            ground.refreshBoundingInfo(true);

            // Позиция: chunkParent в углу, ground центрирован в чанке
            ground.position = new Vector3(chunkSize / 2, 0, chunkSize / 2);

            // Применяем материал с модификацией цвета по высоте
            const avgHeight = this.calculateAverageHeight(positions, vertsPerSide);
            const tintedMaterial = this.getHeightTintedMaterial(groundMat, avgHeight);
            ground.material = tintedMaterial;

            // Добавляем vertex colors с плавными переходами биомов через шум
            this.applyHeightVertexColors(ground, positions, vertsPerSide, cornerX, cornerZ, chunkSize);

            ground.parent = chunkParent;

            // Рендеринг рёбер террейна (опционально, по умолчанию выключено)
            if (this.config.enableTerrainEdges) {
                ground.enableEdgesRendering();
                const edgeColor = this.getContrastEdgeColor(groundMat);
                const edgesRenderer = (ground as any)._edgesRenderer;
                if (edgesRenderer) {
                    edgesRenderer.edgesWidth = 2.0;
                    edgesRenderer.edgesColor = edgeColor;
                }
            }

            ground.renderingGroupId = 0;
            ground.receiveShadows = false;

            this.optimizeMesh(ground);
            new PhysicsAggregate(ground, PhysicsShapeType.MESH, { mass: 0 }, this.scene);

            // Логируем успешное создание ground mesh для отладки
            // Отключено для снижения спама
            // if (this.config.mapType === "frontline") {
            //     logger.log(`[ChunkSystem] Ground mesh created successfully for frontline chunk (${chunkX}, ${chunkZ})`);
            // }
            return;
        }

        // Fallback: плоская земля если нет terrain generator
        logger.warn(`[ChunkSystem] createGround: Using flat fallback ground for chunk (${chunkX}, ${chunkZ}), biome: ${biome}`);
        const ground = MeshBuilder.CreateBox(`ground_${chunkX}_${chunkZ}`, {
            width: chunkSize,
            height: 0.1,
            depth: chunkSize
        }, this.scene);
        ground.position = new Vector3(chunkSize / 2, -0.05, chunkSize / 2);
        ground.renderingGroupId = 0;
        ground.receiveShadows = false;
        ground.material = this.getMat(groundMat);
        ground.parent = chunkParent;
        this.optimizeMesh(ground);
        new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Логируем создание fallback ground для отладки
        // Отключено для снижения спама
        // if (this.config.mapType === "frontline") {
        //     logger.log(`[ChunkSystem] Fallback flat ground mesh created for frontline chunk (${chunkX}, ${chunkZ})`);
        // }
    }

    private createRoads(chunkX: number, chunkZ: number, size: number, random: SeededRandom, biome: BiomeType | undefined, chunkParent: TransformNode): void {
        // Use RoadNetwork if available
        if (this.roadNetwork && biome) {
            const worldX = chunkX * size;
            const worldZ = chunkZ * size;
            const roadMeshes = this.roadNetwork.createRoadMeshes(chunkX, chunkZ, biome, chunkParent);
            for (const mesh of roadMeshes) {
                // Adjust position relative to chunk
                mesh.position.x -= worldX;
                mesh.position.z -= worldZ;
                mesh.freezeWorldMatrix();
                // chunk.meshes.push(mesh);
            }
            return;
        }

        // Fallback: Road variety - different patterns
        const pattern = random.int(0, 3);
        const asphalt = this.getMat("asphalt");

        if (pattern === 0) {
            // Horizontal road
            const road = MeshBuilder.CreateBox("rd", { width: size, height: 0.01, depth: 8 }, this.scene);
            road.position = new Vector3(size / 2, 0.02, size - 4);
            road.material = asphalt;
            road.parent = chunkParent;
            road.freezeWorldMatrix();
            // chunk.meshes.push(road);
        } else if (pattern === 1) {
            // Vertical road
            const road = MeshBuilder.CreateBox("rd", { width: 8, height: 0.01, depth: size }, this.scene);
            road.position = new Vector3(size - 4, 0.02, size / 2);
            road.material = asphalt;
            road.parent = chunkParent;
            road.freezeWorldMatrix();
            // chunk.meshes.push(road);
        } else if (pattern === 2) {
            // Cross roads
            const hRoad = MeshBuilder.CreateBox("rd", { width: size, height: 0.01, depth: 6 }, this.scene);
            hRoad.position = new Vector3(size / 2, 0.02, size / 2);
            hRoad.material = asphalt;
            hRoad.parent = chunkParent;
            hRoad.freezeWorldMatrix();
            // chunk.meshes.push(hRoad);

            const vRoad = MeshBuilder.CreateBox("rd", { width: 6, height: 0.01, depth: size }, this.scene);
            vRoad.position = new Vector3(size / 2, 0.02, size / 2);
            vRoad.material = asphalt;
            vRoad.parent = chunkParent;
            vRoad.freezeWorldMatrix();
            // chunk.meshes.push(vRoad);
        } else {
            // L-shaped road
            const hRoad = MeshBuilder.CreateBox("rd", { width: size / 2, height: 0.01, depth: 6 }, this.scene);
            hRoad.position = new Vector3(size * 0.75, 0.02, size - 3);
            hRoad.material = asphalt;
            hRoad.parent = chunkParent;
            hRoad.freezeWorldMatrix();
            // chunk.meshes.push(hRoad);

            const vRoad = MeshBuilder.CreateBox("rd", { width: 6, height: 0.01, depth: size / 2 }, this.scene);
            vRoad.position = new Vector3(size - 3, 0.02, size * 0.75);
            vRoad.material = asphalt;
            vRoad.parent = chunkParent;
            vRoad.freezeWorldMatrix();
            // chunk.meshes.push(vRoad);
        }
    }

    // Object placement helpers with clustering and context awareness
    private generateClusteredPositions(
        count: number,
        chunkSize: number,
        minRadius: number,
        maxRadius: number,
        clusterCount: number,
        random: SeededRandom
    ): Vector3[] {
        const positions: Vector3[] = [];
        const placed: Vector3[] = [];

        // Generate cluster centers
        const clusters: Vector3[] = [];
        for (let i = 0; i < clusterCount; i++) {
            clusters.push(new Vector3(
                random.range(10, chunkSize - 10),
                0,
                random.range(10, chunkSize - 10)
            ));
        }

        // Place objects around cluster centers
        for (let i = 0; i < count; i++) {
            let attempts = 0;
            let validPos: Vector3 | null = null;

            while (attempts < 30 && !validPos) {
                const cluster = random.pick(clusters);
                const angle = random.range(0, Math.PI * 2);
                const distance = random.range(minRadius, maxRadius);
                const candidate = new Vector3(
                    cluster.x + Math.cos(angle) * distance,
                    0,
                    cluster.z + Math.sin(angle) * distance
                );

                // Check bounds
                if (candidate.x < 5 || candidate.x > chunkSize - 5 ||
                    candidate.z < 5 || candidate.z > chunkSize - 5) {
                    attempts++;
                    continue;
                }

                // Check minimum distance from other objects
                let tooClose = false;
                for (const placedPos of placed) {
                    const dist = Vector3.Distance(candidate, placedPos);
                    if (dist < minRadius * 0.8) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    validPos = candidate;
                    placed.push(candidate);
                }

                attempts++;
            }

            if (validPos) {
                positions.push(validPos);
            }
        }

        return positions;
    }

    private isPositionNearRoad(worldX: number, worldZ: number, _threshold: number = 5): boolean {
        if (!this.roadNetwork) return false;
        return this.roadNetwork.isOnRoad(worldX, worldZ) ||
            this.roadNetwork.getRoadWidth(worldX, worldZ) > 0;
    }

    private getTerrainHeight(worldX: number, worldZ: number, biome: BiomeType): number {
        if (!this.terrainGenerator) return 0;
        return this.terrainGenerator.getHeight(worldX, worldZ, biome);
    }

    // Add terrain details (rocks, boulders, small features) - ENHANCED with more variety
    private addTerrainDetails(chunkX: number, chunkZ: number, size: number, random: SeededRandom, biome: BiomeType, chunkParent: TransformNode): void {
        // More details for natural biomes
        let detailCount = random.int(3, 8);
        if (biome === "park" || biome === "residential" || biome === "wasteland") {
            detailCount = random.int(5, 12);
        } else if (biome === "city" || biome === "industrial") {
            detailCount = random.int(2, 5);
        }

        for (let i = 0; i < detailCount; i++) {
            const dx = random.range(5, size - 5);
            const dz = random.range(5, size - 5);
            const dWorldX = chunkX * this.config.chunkSize + dx;
            const dWorldZ = chunkZ * this.config.chunkSize + dz;

            // КРИТИЧНО: УВЕЛИЧЕННЫЙ запас проверки гаражей (30 единиц для полной защиты)
            if (this.isPositionInGarageArea(dWorldX, dWorldZ, 30)) continue;
            if (this.isPositionNearRoad(dWorldX, dWorldZ, 2)) continue;

            const terrainHeight = this.getTerrainHeight(dWorldX, dWorldZ, biome);

            // Biome-specific detail types
            let detailType: string;
            if (biome === "park" || biome === "residential") {
                detailType = random.pick(["rock", "small_rock", "moss_rock", "boulder"]);
            } else if (biome === "wasteland") {
                detailType = random.pick(["rock", "boulder", "debris", "rubble"]);
            } else if (biome === "military") {
                detailType = random.pick(["rock", "boulder", "stone"]);
            } else if (biome === "city" || biome === "industrial") {
                detailType = random.pick(["debris", "rubble", "concrete_chunk"]);
            } else {
                detailType = random.pick(["rock", "boulder", "small_rock"]);
            }

            let detail: Mesh;
            switch (detailType) {
                case "rock":
                    // Natural rock - rectangular block (LOW POLY)
                    const rockW = random.range(0.8, 1.5);
                    const rockH = random.range(0.5, 1);
                    const rockD = random.range(0.8, 1.5);
                    detail = MeshBuilder.CreateBox("rock", {
                        width: rockW,
                        height: rockH,
                        depth: rockD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + rockH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.rotation.x = random.range(-0.3, 0.3);
                    detail.rotation.z = random.range(-0.3, 0.3);
                    detail.material = this.getMat("rock") || this.getMat("gravel");
                    break;
                case "boulder":
                    // Large boulder - rectangular block (LOW POLY)
                    const boulderW = random.range(2, 3.5);
                    const boulderH = random.range(1.5, 2.5);
                    const boulderD = random.range(2, 3.5);
                    detail = MeshBuilder.CreateBox("boulder", {
                        width: boulderW,
                        height: boulderH,
                        depth: boulderD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + boulderH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.rotation.x = random.range(-0.4, 0.4);
                    detail.rotation.z = random.range(-0.4, 0.4);
                    detail.material = this.getMat("rock") || this.getMat("gravel");
                    new PhysicsAggregate(detail, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    break;
                case "small_rock":
                    // Small natural rock - rectangular block
                    const smallW = random.range(0.4, 0.8);
                    const smallH = random.range(0.2, 0.5);
                    const smallD = random.range(0.4, 0.8);
                    detail = MeshBuilder.CreateBox("smallRock", {
                        width: smallW,
                        height: smallH,
                        depth: smallD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + smallH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.material = this.getMat("gravel");
                    break;
                case "moss_rock":
                    // Rock with moss - rectangular block
                    const mossW = random.range(0.6, 1.2);
                    const mossH = random.range(0.4, 0.8);
                    const mossD = random.range(0.6, 1.2);
                    detail = MeshBuilder.CreateBox("mossRock", {
                        width: mossW,
                        height: mossH,
                        depth: mossD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + mossH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.material = this.getMat("grassDark") || this.getMat("gravel");
                    break;
                case "debris":
                    // Debris chunk - irregular rectangular block
                    const debrisW = random.range(0.5, 1.2);
                    const debrisH = random.range(0.3, 0.7);
                    const debrisD = random.range(0.5, 1.2);
                    detail = MeshBuilder.CreateBox("debris", {
                        width: debrisW,
                        height: debrisH,
                        depth: debrisD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + debrisH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.rotation.x = random.range(-0.5, 0.5);
                    detail.rotation.z = random.range(-0.5, 0.5);
                    detail.material = this.getMat("concrete") || this.getMat("gravel");
                    break;
                case "rubble":
                    // Rubble pile - multiple small rectangular blocks
                    const rubbleCount = random.int(2, 4);
                    for (let j = 0; j < rubbleCount; j++) {
                        const rubbleW = random.range(0.3, 0.7);
                        const rubbleH = random.range(0.2, 0.5);
                        const rubbleD = random.range(0.3, 0.7);
                        const rubblePiece = MeshBuilder.CreateBox(`rubble_${j}`, {
                            width: rubbleW,
                            height: rubbleH,
                            depth: rubbleD
                        }, this.scene);
                        rubblePiece.position = new Vector3(
                            dx + random.range(-0.5, 0.5),
                            terrainHeight + rubbleH / 2,
                            dz + random.range(-0.5, 0.5)
                        );
                        rubblePiece.rotation.y = random.range(0, Math.PI * 2);
                        rubblePiece.rotation.x = random.range(-0.5, 0.5);
                        rubblePiece.rotation.z = random.range(-0.5, 0.5);
                        rubblePiece.material = this.getMat("concrete") || this.getMat("gravel");
                        rubblePiece.parent = chunkParent;
                        this.optimizeMesh(rubblePiece);
                        // chunk.meshes.push(rubblePiece);
                    }
                    continue; // Skip the standard detail creation
                case "concrete_chunk":
                    // Concrete chunk - angular rectangular block
                    const chunkW = random.range(0.6, 1.4);
                    const chunkH = random.range(0.4, 1);
                    const chunkD = random.range(0.6, 1.4);
                    detail = MeshBuilder.CreateBox("concreteChunk", {
                        width: chunkW,
                        height: chunkH,
                        depth: chunkD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + chunkH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.rotation.x = random.range(-0.3, 0.3);
                    detail.rotation.z = random.range(-0.3, 0.3);
                    detail.material = this.getMat("concrete");
                    break;
                case "stone":
                    // Stone - rectangular block
                    const stoneW = random.range(1, 2);
                    const stoneH = random.range(0.6, 1.2);
                    const stoneD = random.range(1, 2);
                    detail = MeshBuilder.CreateBox("stone", {
                        width: stoneW,
                        height: stoneH,
                        depth: stoneD
                    }, this.scene);
                    detail.position = new Vector3(dx, terrainHeight + stoneH / 2, dz);
                    detail.rotation.y = random.range(0, Math.PI * 2);
                    detail.rotation.x = random.range(-0.2, 0.2);
                    detail.rotation.z = random.range(-0.2, 0.2);
                    detail.material = this.getMat("rock") || this.getMat("gravel");
                    break;
                default:
                    continue;
            }

            detail.parent = chunkParent;
            this.optimizeMesh(detail); // Use optimized mesh function for better performance
            // chunk.meshes.push(detail);
        }
    }

    private checkObjectCollision(
        pos: Vector3,
        radius: number,
        existingObjects: Array<{ pos: Vector3, radius: number }>
    ): boolean {
        for (const obj of existingObjects) {
            const dist = Vector3.Distance(pos, obj.pos);
            if (dist < radius + obj.radius) {
                return true;
            }
        }
        return false;
    }

    // Add building details (windows, doors)
    // ОПТИМИЗАЦИЯ: Использует кэшированные материалы вместо inline создания
    private addBuildingDetails(building: Mesh, width: number, height: number, depth: number, random: SeededRandom): void {
        // Add windows (simple dark rectangles)
        const windowRows = Math.floor(height / 4);
        const windowCols = Math.floor(width / 4);

        for (let row = 1; row < windowRows; row++) {
            for (let col = 0; col < windowCols; col++) {
                if (random.chance(0.7)) { // Not every window position has a window
                    const window = MeshBuilder.CreateBox("window", { width: 1.5, height: 1.5, depth: 0.1 }, this.scene);
                    const windowX = (col - (windowCols - 1) / 2) * (width / (windowCols + 1));
                    const windowY = (row * (height / (windowRows + 1))) - height / 2;
                    window.position = new Vector3(windowX, windowY, depth / 2 + 0.05);
                    // ОПТИМИЗАЦИЯ: Используем кэшированные материалы
                    window.material = random.chance(0.3) ? this.getMat("windowLit") : this.getMat("windowDark");
                    window.parent = building;
                    // chunk.meshes.push(window);
                }
            }
        }

        // Add door at ground level (if building is tall enough)
        if (height > 5 && random.chance(0.8)) {
            const door = MeshBuilder.CreateBox("door", { width: 2, height: 3, depth: 0.1 }, this.scene);
            door.position = new Vector3(0, -height / 2 + 1.5, depth / 2 + 0.05);
            // ОПТИМИЗАЦИЯ: Используем кэшированный материал
            door.material = this.getMat("doorBrown");
            door.parent = building;
            // chunk.meshes.push(door);
        }
    }

    private generateCity(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // UNIQUE buildings - each chunk different! ЕЩЁ БОЛЬШЕ РАЗНООБРАЗИЯ!
        const buildingTypes = [
            // Tall buildings
            { w: 12, h: 25, d: 12, mat: "concrete" },   // Office
            { w: 15, h: 35, d: 15, mat: "glass" },      // Skyscraper
            { w: 18, h: 30, d: 18, mat: "concrete" },   // Tower
            { w: 14, h: 28, d: 14, mat: "plaster" },    // Residential tower
            // Medium buildings
            { w: 20, h: 20, d: 20, mat: "plaster" },    // Mall
            { w: 16, h: 16, d: 16, mat: "brick" },      // Commercial
            { w: 18, h: 18, d: 18, mat: "concrete" },   // Office block
            { w: 14, h: 14, d: 14, mat: "brickDark" },  // Warehouse style
            // Wide buildings
            { w: 25, h: 15, d: 20, mat: "plaster" },    // Shopping center
            { w: 22, h: 12, d: 18, mat: "concrete" },   // Factory/industrial
            { w: 30, h: 10, d: 25, mat: "brick" },      // Large warehouse
            { w: 10, h: 40, d: 10, mat: "metal" },      // Tower
            { w: 18, h: 15, d: 25, mat: "brick" },      // Warehouse
            { w: 8, h: 12, d: 8, mat: "plasterYellow" },// Kiosk
            { w: 25, h: 8, d: 30, mat: "metalRust" },   // Parking garage
            { w: 6, h: 18, d: 6, mat: "brickDark" },    // Chimney
            { w: 14, h: 6, d: 20, mat: "concrete" },    // Gas station
            { w: 10, h: 4, d: 15, mat: "metal" },       // Car wash
            { w: 16, h: 22, d: 16, mat: "brick" },      // Apartment block
            { w: 22, h: 18, d: 14, mat: "plaster" },    // Shopping center
            { w: 9, h: 30, d: 9, mat: "glass" },         // Office tower
            { w: 13, h: 10, d: 18, mat: "concrete" },   // Low-rise office
            { w: 7, h: 16, d: 7, mat: "brickDark" },    // Residential tower
            { w: 19, h: 12, d: 22, mat: "metal" },       // Factory building
            { w: 11, h: 28, d: 11, mat: "glass" },       // Modern skyscraper
            { w: 17, h: 14, d: 19, mat: "brick" },      // Mixed-use building
        ];

        // Generate clustered buildings - cities have building clusters (увеличено количество)
        const buildingCount = random.int(5, 12);
        const clusterCount = Math.min(buildingCount, 4); // 2-4 clusters
        const buildingPositions = this.generateClusteredPositions(
            buildingCount,
            size,
            8, // min distance between buildings
            25, // max distance from cluster center
            clusterCount,
            random
        );

        const existingObjects: Array<{ pos: Vector3, radius: number }> = [];

        for (const buildingPos of buildingPositions) {
            const type = random.pick(buildingTypes);
            const bx = buildingPos.x;
            const bz = buildingPos.z;

            // КРИТИЧНО: Проверяем, не находится ли здание внутри гаража с УВЕЛИЧЕННЫМ запасом
            const worldX = chunkX * this.config.chunkSize + bx;
            const worldZ = chunkZ * this.config.chunkSize + bz;
            const buildingSize = Math.max(type.w, type.d);
            // Используем размер здания + дополнительный запас 20 единиц для полной защиты
            if (this.isPositionInGarageArea(worldX, worldZ, buildingSize / 2 + 20)) {
                continue; // Пропускаем это здание
            }

            // Check collision with other objects
            const buildingRadius = Math.max(type.w, type.d) / 2;
            if (this.checkObjectCollision(new Vector3(bx, 0, bz), buildingRadius, existingObjects)) {
                continue;
            }

            // Adjust height based on terrain
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "city");

            const building = MeshBuilder.CreateBox("b", { width: type.w, height: type.h, depth: type.d }, this.scene);
            building.position = new Vector3(bx, type.h / 2 + terrainHeight, bz);

            // Add size variation
            const scale = random.range(0.85, 1.15);
            building.scaling = new Vector3(scale, scale, scale);

            building.material = this.getMat(type.mat);
            building.parent = chunkParent;
            building.freezeWorldMatrix();
            // chunk.meshes.push(building);
            new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Add building details (windows, doors) for taller buildings
            if (type.h > 10 && random.chance(0.6)) {
                this.addBuildingDetails(building, type.w * scale, type.h * scale, type.d * scale, random);
            }

            existingObjects.push({ pos: new Vector3(bx, 0, bz), radius: buildingRadius });
        }

        // If no buildings were placed, try placing one at center (fallback)
        if (existingObjects.length === 0) {
            const type = random.pick(buildingTypes);
            const bx = size / 2 + random.range(-15, 15);
            const bz = size / 2 + random.range(-15, 15);

            const worldX = chunkX * this.config.chunkSize + bx;
            const worldZ = chunkZ * this.config.chunkSize + bz;
            if (!this.isPositionInGarageArea(worldX, worldZ, Math.max(type.w, type.d) / 2)) {
                const terrainHeight = this.getTerrainHeight(worldX, worldZ, "city");
                const building = MeshBuilder.CreateBox("b", { width: type.w, height: type.h, depth: type.d }, this.scene);
                building.position = new Vector3(bx, type.h / 2 + terrainHeight, bz);
                building.material = this.getMat(type.mat);
                building.parent = chunkParent;
                building.freezeWorldMatrix();
                // chunk.meshes.push(building);
                new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
            return;
        }

        // Continue with rest of generation using first building position as reference
        const mainBuilding = existingObjects[0];
        if (!mainBuilding) return;
        const bx = mainBuilding.pos.x;
        const bz = mainBuilding.pos.z;

        // Get a random building type for the main building
        const buildingType = random.pick(buildingTypes);
        const building = MeshBuilder.CreateBox("b", { width: buildingType.w, height: buildingType.h, depth: buildingType.d }, this.scene);
        building.position = new Vector3(bx, buildingType.h / 2, bz);
        building.material = this.getMat(buildingType.mat);
        building.parent = chunkParent;
        building.freezeWorldMatrix();
        // chunk.meshes.push(building);
        new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // GARAGE/TUNNEL you can drive into!
        if (random.chance(0.3)) {
            const gw = 8, gh = 4, gd = 12;
            const gx = bx + random.range(-20, 20);
            const gz = bz + random.range(-20, 20);

            // Проверяем, не находится ли гараж/туннель внутри гаража игрока
            const gWorldX = chunkX * this.config.chunkSize + gx;
            const gWorldZ = chunkZ * this.config.chunkSize + gz;
            if (this.isPositionInGarageArea(gWorldX, gWorldZ, Math.max(gw, gd) / 2)) {
                // Пропускаем создание гаража/туннеля
            } else {
                // Roof
                const roof = MeshBuilder.CreateBox("gr", { width: gw, height: 0.5, depth: gd }, this.scene);
                roof.position = new Vector3(gx, gh, gz);
                roof.material = this.getMat("concrete");
                roof.parent = chunkParent;
                roof.freezeWorldMatrix();
                // chunk.meshes.push(roof);
                // Left wall
                const lw = MeshBuilder.CreateBox("gw", { width: 0.5, height: gh, depth: gd }, this.scene);
                lw.position = new Vector3(gx - gw / 2, gh / 2, gz);
                lw.material = this.getMat("brick");
                lw.parent = chunkParent;
                lw.freezeWorldMatrix();
                // chunk.meshes.push(lw);
                // Right wall
                const rw = MeshBuilder.CreateBox("gw", { width: 0.5, height: gh, depth: gd }, this.scene);
                rw.position = new Vector3(gx + gw / 2, gh / 2, gz);
                rw.material = this.getMat("brick");
                rw.parent = chunkParent;
                rw.freezeWorldMatrix();
                // chunk.meshes.push(rw);
            }

            // PARKED CAR - ОПТИМИЗИРОВАНО через ThinInstances
            if (random.chance(0.4)) {
                const cx = bx + random.range(-25, 25);
                const cz = bz + random.range(-25, 25);
                const rotY = random.range(0, Math.PI * 2);
                const chunkKey = this.getChunkKey(chunkX, chunkZ);
                const worldX = chunkX * this.config.chunkSize;
                const worldZ = chunkZ * this.config.chunkSize;

                // Выбираем тип машины и используем thin instances
                const carColor = random.pick(["red", "yellow", "metal", "dark"]) as "red" | "yellow" | "metal" | "dark";
                const carType = `car_${carColor}` as InstanceableObjectType;

                // Позиция в мировых координатах для ThinInstanceManager
                const worldPos = new Vector3(worldX + cx, 0.75, worldZ + cz);
                this.addInstancedObject(carType, worldPos, chunkKey, rotY);
            }
        }

        // FENCE / WALL
        if (random.chance(0.5)) {
            const fenceLen = random.range(8, 20);
            const fx = bx + random.range(-30, 30);
            const fz = bz + random.range(-30, 30);

            // Проверяем, не находится ли забор внутри гаража
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, fenceLen / 2)) {
                // Пропускаем создание забора
            } else {
                const fence = MeshBuilder.CreateBox("f", { width: fenceLen, height: 2, depth: 0.3 }, this.scene);
                fence.position = new Vector3(fx, 1.01, fz); // Y offset to avoid z-fighting
                fence.rotation.y = random.pick([0, Math.PI / 2]);
                fence.material = this.getMat(random.pick(["wood", "metal", "concrete"]));
                fence.parent = chunkParent;
                fence.freezeWorldMatrix();
                // chunk.meshes.push(fence);
                // Убрана физика для декоративных заборов (оптимизация)
            }
        }

        // CONCRETE BARRIERS (multiple) - ОПТИМИЗИРОВАНО через ThinInstances
        const barrierCount = random.int(0, 3);
        const chunkKey = this.getChunkKey(chunkX, chunkZ);
        const worldOffsetX = chunkX * this.config.chunkSize;
        const worldOffsetZ = chunkZ * this.config.chunkSize;

        for (let i = 0; i < barrierCount; i++) {
            const barrierX = random.range(5, size - 5);
            const barrierZ = random.range(5, size - 5);

            // Проверяем, не находится ли барьер внутри гаража
            const bWorldX = worldOffsetX + barrierX;
            const bWorldZ = worldOffsetZ + barrierZ;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 2)) {
                continue; // Пропускаем этот барьер
            }

            const rotY = random.range(0, Math.PI);
            const worldPos = new Vector3(bWorldX, 0.51, bWorldZ);
            this.addInstancedObject("barrier_concrete", worldPos, chunkKey, rotY);
        }

        // DUMPSTER - ОПТИМИЗИРОВАНО через ThinInstances
        if (random.chance(0.3)) {
            const dumpX = bx + random.range(-20, 20);
            const dumpZ = bz + random.range(-20, 20);

            // Проверяем, не находится ли мусорный бак внутри гаража
            const dWorldX = worldOffsetX + dumpX;
            const dWorldZ = worldOffsetZ + dumpZ;
            if (this.isPositionInGarageArea(dWorldX, dWorldZ, 2)) {
                // Пропускаем создание мусорного бака
            } else {
                const worldPos = new Vector3(dWorldX, 0.76, dWorldZ);
                this.addInstancedObject("dumpster", worldPos, chunkKey);
            }
        }

        // ДОПОЛНИТЕЛЬНЫЕ СТЕНЫ И ЗАБОРЫ
        const wallCount = random.int(1, 4);
        for (let i = 0; i < wallCount; i++) {
            const wallLen = random.range(6, 18);
            const wx = random.range(5, size - 5);
            const wz = random.range(5, size - 5);

            // Проверяем, не находится ли стена внутри гаража
            const wWorldX = chunkX * this.config.chunkSize + wx;
            const wWorldZ = chunkZ * this.config.chunkSize + wz;
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, wallLen / 2)) {
                continue; // Пропускаем эту стену
            }
            const wall = MeshBuilder.CreateBox("wall", { width: wallLen, height: random.range(2, 4), depth: 0.4 }, this.scene);
            wall.position = new Vector3(wx, random.range(1, 2) + 0.01, wz);
            wall.rotation.y = random.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]);
            wall.material = this.getMat(random.pick(["concrete", "brick", "brickDark", "metal"]));
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            // chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // МОСТЫ (над дорогами или реками)
        if (random.chance(0.3)) {
            const bridgeW = random.range(8, 15);
            const bridgeH = random.range(3, 6);
            const bridgeD = random.range(12, 20);
            const bridgeX = random.range(10, size - 10);
            const bridgeZ = random.range(10, size - 10);

            // Проверяем, не находится ли мост внутри гаража
            const brWorldX = chunkX * this.config.chunkSize + bridgeX;
            const brWorldZ = chunkZ * this.config.chunkSize + bridgeZ;
            if (this.isPositionInGarageArea(brWorldX, brWorldZ, Math.max(bridgeW, bridgeD) / 2)) {
                // Пропускаем создание моста
            } else {

                // Bridge deck
                const deck = MeshBuilder.CreateBox("bridge", { width: bridgeW, height: 0.3, depth: bridgeD }, this.scene);
                deck.position = new Vector3(bridgeX, bridgeH + 0.15, bridgeZ);
                deck.material = this.getMat("asphalt");
                deck.parent = chunkParent;
                deck.freezeWorldMatrix();
                // chunk.meshes.push(deck);
                new PhysicsAggregate(deck, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                // Bridge supports (columns)
                const supportCount = random.int(2, 4);
                for (let j = 0; j < supportCount; j++) {
                    const support = MeshBuilder.CreateBox("bsup", { width: 1.5, height: bridgeH, depth: 1.5 }, this.scene);
                    support.position = new Vector3(
                        bridgeX + random.range(-bridgeW / 2 + 2, bridgeW / 2 - 2),
                        bridgeH / 2,
                        bridgeZ + random.range(-bridgeD / 2 + 2, bridgeD / 2 - 2)
                    );
                    support.material = this.getMat("concrete");
                    support.parent = chunkParent;
                    support.freezeWorldMatrix();
                    // chunk.meshes.push(support);
                    new PhysicsAggregate(support, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            }
        }
    }

    private generateIndustrial(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // UNIQUE industrial buildings - увеличено разнообразие
        const types = [
            { w: 15, h: 8, d: 12, mat: "metal" },       // Warehouse
            { w: 20, h: 6, d: 30, mat: "metalRust" },   // Factory
            { w: 8, h: 12, d: 8, mat: "brick" },        // Silo
            { w: 25, h: 5, d: 15, mat: "concrete" },    // Hangar
            { w: 10, h: 15, d: 10, mat: "brickDark" },  // Smokestack
            { w: 30, h: 4, d: 20, mat: "metal" },       // Depot
            { w: 18, h: 10, d: 22, mat: "metalRust" },  // Large factory
            { w: 12, h: 8, d: 12, mat: "concrete" },    // Power station
        ];

        // Генерируем 2-5 зданий вместо одного
        const buildingCount = random.int(2, 5);
        for (let b = 0; b < buildingCount; b++) {
            const type = random.pick(types);
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + bx;
            const worldZ = chunkZ * this.config.chunkSize + bz;
            // КРИТИЧНО: Проверяем с УВЕЛИЧЕННЫМ запасом для полной защиты
            const buildingSize = Math.max(type.w, type.d);
            if (this.isPositionInGarageArea(worldX, worldZ, buildingSize / 2 + 20)) {
                continue;
            }

            const building = MeshBuilder.CreateBox("w", { width: type.w, height: type.h, depth: type.d }, this.scene);
            building.position = new Vector3(bx, type.h / 2, bz);
            building.material = this.getMat(type.mat);
            building.parent = chunkParent;
            building.freezeWorldMatrix();
            new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // MULTIPLE CONTAINERS - увеличено количество - ОПТИМИЗИРОВАНО через ThinInstances
        const containerCount = random.int(8, 18);
        const indChunkKey = this.getChunkKey(chunkX, chunkZ);
        const indWorldOffsetX = chunkX * this.config.chunkSize;
        const indWorldOffsetZ = chunkZ * this.config.chunkSize;

        for (let i = 0; i < containerCount; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);

            // Проверяем, не находится ли контейнер внутри гаража
            const cWorldX = indWorldOffsetX + cx;
            const cWorldZ = indWorldOffsetZ + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 3)) {
                continue; // Пропускаем этот контейнер
            }

            const stackHeight = random.int(0, 1); // Can be stacked!
            const containerY = 1.26 + stackHeight * 2.5;
            const rotY = random.range(0, Math.PI);

            // Визуал через thin instances (1 draw call на все контейнеры одного цвета)
            const containerColors = ["red", "yellow", "metal", "rust"] as const;
            const colorIdx = Math.floor(random.next() * containerColors.length);
            const containerColor = containerColors[colorIdx] || "red";
            const containerType = `container_${containerColor}` as InstanceableObjectType;
            const worldPos = new Vector3(cWorldX, containerY, cWorldZ);
            this.addInstancedObject(containerType, worldPos, indChunkKey, rotY);

            // Невидимый коллайдер для физики (в локальных координатах чанка)
            const localPos = new Vector3(cx, containerY, cz);
            this.createInvisibleCollider(
                localPos,
                { width: 3, height: 2.8, depth: 8 }, // Размеры контейнера из ThinInstanceManager
                chunkParent,
                rotY
            );
        }

        // TRUCKS - увеличено количество (2-4 грузовика)
        const truckCount = random.int(2, 4);
        for (let t = 0; t < truckCount; t++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);

            const tWorldX = chunkX * this.config.chunkSize + tx;
            const tWorldZ = chunkZ * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) continue;

            const cab = MeshBuilder.CreateBox("tcab", { width: 2.5, height: 2, depth: 3 }, this.scene);
            cab.position = new Vector3(tx, 1.01, tz);
            cab.material = this.getMat("metal");
            cab.parent = chunkParent;
            cab.freezeWorldMatrix();

            const trailer = MeshBuilder.CreateBox("ttr", { width: 2.5, height: 3, depth: 8 }, this.scene);
            trailer.position = new Vector3(tx, 1.51, tz - 5.5);
            trailer.material = this.getMat(random.pick(["yellow", "red", "metal"]));
            trailer.parent = chunkParent;
            trailer.freezeWorldMatrix();
        }

        // CRANES - увеличено количество (2-4 крана)
        const craneCount = random.int(2, 4);
        for (let c = 0; c < craneCount; c++) {
            const cx = random.range(15, size - 15);
            const cz = random.range(15, size - 15);

            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) continue;

            const tower = MeshBuilder.CreateBox("ct", { width: 2, height: 15, depth: 2 }, this.scene);
            tower.position = new Vector3(cx, 7.5, cz);
            tower.material = this.getMat("yellow");
            tower.parent = chunkParent;
            tower.freezeWorldMatrix();

            const arm = MeshBuilder.CreateBox("ca", { width: 1, height: 1, depth: 18 }, this.scene);
            arm.position = new Vector3(cx, 14, cz + 8);
            arm.material = this.getMat("yellow");
            arm.parent = chunkParent;
            arm.freezeWorldMatrix();
        }

        // PIPES / RAILS
        if (random.chance(0.4)) {
            const pipeLen = random.range(10, 25);
            const pipeX = random.range(5, size - 5);
            const pipeZ = random.range(5, size - 5);

            // Проверяем, не находится ли труба внутри гаража
            const pWorldX = chunkX * this.config.chunkSize + pipeX;
            const pWorldZ = chunkZ * this.config.chunkSize + pipeZ;
            if (this.isPositionInGarageArea(pWorldX, pWorldZ, pipeLen / 2)) {
                // Пропускаем создание трубы
            } else {
                const pipe = MeshBuilder.CreateBox("pp", { width: 0.8, height: 0.8, depth: pipeLen }, this.scene);
                pipe.position = new Vector3(pipeX, 0.41, pipeZ);
                pipe.rotation.y = random.range(0, Math.PI);
                pipe.material = this.getMat("metalRust");
                pipe.parent = chunkParent;
                pipe.freezeWorldMatrix();
                // chunk.meshes.push(pipe);
            }
        }

        // CHAIN LINK FENCE
        if (random.chance(0.4)) {
            const fenceLen = random.range(15, 30);
            const fenceX = random.range(10, size - 10);
            const fenceZ = random.range(10, size - 10);

            // Проверяем, не находится ли забор внутри гаража
            const fWorldX = chunkX * this.config.chunkSize + fenceX;
            const fWorldZ = chunkZ * this.config.chunkSize + fenceZ;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, fenceLen / 2)) {
                // Пропускаем создание забора
            } else {
                const fence = MeshBuilder.CreateBox("clf", { width: fenceLen, height: 3, depth: 0.1 }, this.scene);
                fence.position = new Vector3(fenceX, 1.51, fenceZ);
                fence.rotation.y = random.pick([0, Math.PI / 2]);
                fence.material = this.getMat("metal");
                fence.parent = chunkParent;
                fence.freezeWorldMatrix();
                // chunk.meshes.push(fence);
            }
        }
    }

    private generateResidential(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // UNIQUE residential area with more diversity!
        const houseTypes = [
            { w: 7, h: 4, d: 7, mat: "plaster" },
            { w: 8, h: 5, d: 6, mat: "brick" },
            { w: 6, h: 3, d: 8, mat: "plasterYellow" },
            { w: 9, h: 6, d: 9, mat: "wood" },
            { w: 10, h: 4, d: 8, mat: "plaster" },      // Bungalow
            { w: 6, h: 8, d: 6, mat: "brick" },         // Tall house
            { w: 11, h: 5, d: 10, mat: "brick" },       // Large house
            { w: 5, h: 3.5, d: 6, mat: "plaster" },     // Small cottage
            { w: 12, h: 7, d: 11, mat: "wood" },        // Mansion
            { w: 8, h: 6, d: 8, mat: "brickDark" },     // Modern house
            { w: 9, h: 4.5, d: 9, mat: "plasterYellow" }, // Yellow house
            { w: 7, h: 5.5, d: 7, mat: "wood" },        // Wooden house
        ];

        // Use clustering for natural neighborhood feel
        const houseCount = random.int(2, 4);
        const clusterCount = Math.min(houseCount, 2);
        const housePositions = this.generateClusteredPositions(
            houseCount,
            size,
            6, // min distance between houses
            20, // max distance from cluster center
            clusterCount,
            random
        );

        const existingObjects: Array<{ pos: Vector3, radius: number }> = [];
        for (let i = 0; i < houseCount; i++) {
            const type = random.pick(houseTypes);
            const hx = size / 3 + i * (size / 3) + random.range(-10, 10);
            const hz = size / 2 + random.range(-15, 15);

            // Проверяем, не находится ли дом внутри гаража
            const hWorldX = chunkX * this.config.chunkSize + hx;
            const hWorldZ = chunkZ * this.config.chunkSize + hz;
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, Math.max(type.w, type.d) / 2)) {
                continue; // Пропускаем этот дом
            }

            const house = MeshBuilder.CreateBox("h", { width: type.w, height: type.h, depth: type.d }, this.scene);
            house.position = new Vector3(hx, type.h / 2, hz);
            house.material = this.getMat(type.mat);
            house.parent = chunkParent;
            house.freezeWorldMatrix();
            // chunk.meshes.push(house);
            new PhysicsAggregate(house, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // GARAGE attached to house
            if (random.chance(0.4)) {
                const garX = hx + type.w / 2 + 2;
                const garZ = hz;

                // Проверяем, не находится ли гараж дома внутри гаража игрока
                const gWorldX = chunkX * this.config.chunkSize + garX;
                const gWorldZ = chunkZ * this.config.chunkSize + garZ;
                if (this.isPositionInGarageArea(gWorldX, gWorldZ, 3)) {
                    // Пропускаем создание гаража дома
                } else {
                    const garage = MeshBuilder.CreateBox("gar", { width: 4, height: 3, depth: 5 }, this.scene);
                    garage.position = new Vector3(garX, 1.5, garZ);
                    garage.material = this.getMat("plaster");
                    garage.parent = chunkParent;
                    garage.freezeWorldMatrix();
                    // chunk.meshes.push(garage);
                    new PhysicsAggregate(garage, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            }
        }

        // PARKED CARS in driveways - ОПТИМИЗИРОВАНО через ThinInstances
        const carCount = random.int(0, 2);
        const resChunkKey = this.getChunkKey(chunkX, chunkZ);
        const resWorldOffsetX = chunkX * this.config.chunkSize;
        const resWorldOffsetZ = chunkZ * this.config.chunkSize;

        for (let i = 0; i < carCount; i++) {
            const carX = random.range(10, size - 10);
            const carZ = random.range(10, size - 10);

            // Проверяем, не находится ли машина внутри гаража
            const cWorldX = resWorldOffsetX + carX;
            const cWorldZ = resWorldOffsetZ + carZ;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) {
                continue; // Пропускаем эту машину
            }

            const rotY = random.range(0, Math.PI * 2);
            const carColor = random.pick(["red", "metal", "dark", "yellow"]) as "red" | "metal" | "dark" | "yellow";
            const carType = `car_${carColor}` as InstanceableObjectType;
            const worldPos = new Vector3(cWorldX, 0.66, cWorldZ);
            this.addInstancedObject(carType, worldPos, resChunkKey, rotY);
        }

        // УДАЛЕНО: Деревья в жилых районах (оптимизация производительности)

        // MAILBOX - ОПТИМИЗИРОВАНО через ThinInstances
        if (random.chance(0.3)) {
            const mbX = random.range(10, size - 10);
            const mbZ = random.range(10, size - 10);

            // Проверяем, не находится ли почтовый ящик внутри гаража
            const mbWorldX = resWorldOffsetX + mbX;
            const mbWorldZ = resWorldOffsetZ + mbZ;
            if (this.isPositionInGarageArea(mbWorldX, mbWorldZ, 1)) {
                // Пропускаем создание почтового ящика
            } else {
                const worldPos = new Vector3(mbWorldX, 0.61, mbWorldZ);
                this.addInstancedObject("mailbox", worldPos, resChunkKey);
            }
        }

        // WOODEN FENCE around property
        if (random.chance(0.5)) {
            const fenceLen = random.range(10, 20);
            const fenceX = random.range(10, size - 10);
            const fenceZ = random.range(10, size - 10);

            // Проверяем, не находится ли забор внутри гаража
            const fWorldX = chunkX * this.config.chunkSize + fenceX;
            const fWorldZ = chunkZ * this.config.chunkSize + fenceZ;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, fenceLen / 2)) {
                // Пропускаем создание забора
            } else {
                const fence = MeshBuilder.CreateBox("wf", { width: fenceLen, height: 1.5, depth: 0.2 }, this.scene);
                fence.position = new Vector3(fenceX, 0.76, fenceZ);
                fence.rotation.y = random.pick([0, Math.PI / 2]);
                fence.material = this.getMat("wood");
                fence.parent = chunkParent;
                fence.freezeWorldMatrix();
                // chunk.meshes.push(fence);
            }
        }

        // PLAYGROUND equipment
        if (random.chance(0.2)) {
            const swingX = random.range(15, size - 15);
            const swingZ = random.range(15, size - 15);

            // Проверяем, не находится ли качели внутри гаража
            const sWorldX = chunkX * this.config.chunkSize + swingX;
            const sWorldZ = chunkZ * this.config.chunkSize + swingZ;
            if (this.isPositionInGarageArea(sWorldX, sWorldZ, 2)) {
                // Пропускаем создание качелей
            } else {
                const swing = MeshBuilder.CreateBox("sw", { width: 3, height: 2.5, depth: 0.3 }, this.scene);
                swing.position = new Vector3(swingX, 1.26, swingZ);
                swing.material = this.getMat("metal");
                swing.parent = chunkParent;
                swing.freezeWorldMatrix();
                // chunk.meshes.push(swing);
            }
        }
    }

    private generatePark(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // УДАЛЕНО: Деревья в парках (оптимизация производительности)

        const parkChunkKey = this.getChunkKey(chunkX, chunkZ);
        const parkWorldOffsetX = chunkX * this.config.chunkSize;
        const parkWorldOffsetZ = chunkZ * this.config.chunkSize;

        // Bench - увеличена вероятность - ОПТИМИЗИРОВАНО через ThinInstances
        if (random.chance(0.6)) {
            const benchX = size / 2;
            const benchZ = size / 2;

            // Проверяем, не находится ли скамейка внутри гаража
            const bWorldX = parkWorldOffsetX + benchX;
            const bWorldZ = parkWorldOffsetZ + benchZ;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 1)) {
                // Пропускаем создание скамейки
            } else {
                const worldPos = new Vector3(bWorldX, 0.25, bWorldZ);
                this.addInstancedObject("bench", worldPos, parkChunkKey);
            }
        }

        // Фонтаны (1-2 на чанк)
        if (random.chance(0.25)) {
            const fx = random.range(15, size - 15);
            const fz = random.range(15, size - 15);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (!this.isPositionInGarageArea(fWorldX, fWorldZ, 4)) {
                // Бассейн
                const pool = MeshBuilder.CreateCylinder("fountainPool", { diameter: 6, height: 0.5 }, this.scene);
                pool.position = new Vector3(fx, 0.25, fz);
                pool.material = this.getMat("concrete");
                pool.parent = chunkParent;
                pool.freezeWorldMatrix();

                // Вода
                const water = MeshBuilder.CreateCylinder("fountainWater", { diameter: 5.5, height: 0.3 }, this.scene);
                water.position = new Vector3(fx, 0.35, fz);
                water.material = this.getMat("water");
                water.parent = chunkParent;
                water.freezeWorldMatrix();

                // Центральная колонна
                const column = MeshBuilder.CreateCylinder("fountainColumn", { diameter: 0.8, height: 2 }, this.scene);
                column.position = new Vector3(fx, 1.25, fz);
                column.material = this.getMat("concrete");
                column.parent = chunkParent;
                column.freezeWorldMatrix();
            }
        }

        // Статуи (1 на чанк) - ОПТИМИЗАЦИЯ: используем кэшированные материалы
        if (random.chance(0.15)) {
            const sx = random.range(10, size - 10);
            const sz = random.range(10, size - 10);
            const sWorldX = chunkX * this.config.chunkSize + sx;
            const sWorldZ = chunkZ * this.config.chunkSize + sz;
            if (!this.isPositionInGarageArea(sWorldX, sWorldZ, 2)) {
                // Постамент
                const pedestal = MeshBuilder.CreateBox("pedestal", { width: 2, height: 1, depth: 2 }, this.scene);
                pedestal.position = new Vector3(sx, 0.5, sz);
                pedestal.material = this.getMat("concrete");
                pedestal.parent = chunkParent;
                pedestal.freezeWorldMatrix();

                // Статуя (упрощённая) - ОПТИМИЗАЦИЯ: кэшированный материал
                const statue = MeshBuilder.CreateBox("statue", { width: 1, height: 3, depth: 0.8 }, this.scene);
                statue.position = new Vector3(sx, 2.5, sz);
                statue.material = this.getMat("statue");
                statue.parent = chunkParent;
                statue.freezeWorldMatrix();
            }
        }

        // Фонарные столбы парковые (3-5 штук) - ОПТИМИЗИРОВАНО через ThinInstances
        const lampCount = random.int(3, 5);
        for (let l = 0; l < lampCount; l++) {
            const lx = random.range(5, size - 5);
            const lz = random.range(5, size - 5);
            const lWorldX = parkWorldOffsetX + lx;
            const lWorldZ = parkWorldOffsetZ + lz;
            if (this.isPositionInGarageArea(lWorldX, lWorldZ, 1)) continue;

            // Используем thin instances для столбов и фонарей
            const polePos = new Vector3(lWorldX, 2, lWorldZ);
            this.addInstancedObject("lampPole", polePos, parkChunkKey);

            const lampPos = new Vector3(lWorldX, 4, lWorldZ);
            this.addInstancedObject("lampHead", lampPos, parkChunkKey);
        }

        // Клумбы с цветами (2-4 штуки) - ОПТИМИЗАЦИЯ: кэшированные материалы
        const flowerBedCount = random.int(2, 4);
        for (let f = 0; f < flowerBedCount; f++) {
            const fx = random.range(5, size - 5);
            const fz = random.range(5, size - 5);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 2)) continue;

            const bedSize = random.range(2, 4);
            const bed = MeshBuilder.CreateCylinder("flowerBed", { diameter: bedSize, height: 0.3 }, this.scene);
            bed.position = new Vector3(fx, 0.15, fz);
            bed.material = this.getMat("flowerBed"); // ОПТИМИЗАЦИЯ: кэшированный материал
            bed.parent = chunkParent;
            bed.freezeWorldMatrix();

            // Цветы - ОПТИМИЗАЦИЯ: кэшированные материалы цветов
            const flowerColors = ["flowerRed", "flowerYellow", "flowerPink", "flowerWhite"];
            for (let c = 0; c < random.int(5, 10); c++) {
                const angle = random.range(0, Math.PI * 2);
                const radius = random.range(0.2, bedSize / 2 - 0.2);
                const flower = MeshBuilder.CreateBox("flower", { width: 0.2, height: 0.4, depth: 0.2 }, this.scene);
                flower.position = new Vector3(
                    fx + Math.cos(angle) * radius,
                    0.35,
                    fz + Math.sin(angle) * radius
                );
                flower.material = this.getMat(random.pick(flowerColors));
                flower.parent = chunkParent;
                flower.freezeWorldMatrix();
            }
        }
    }

    private generateWasteland(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Ruins variety - увеличено количество
        const ruinCount = random.int(5, 12);
        for (let i = 0; i < ruinCount; i++) {
            const rx = random.range(10, size - 10);
            const rz = random.range(10, size - 10);

            // Проверяем, не находится ли руины внутри гаража
            const rWorldX = chunkX * this.config.chunkSize + rx;
            const rWorldZ = chunkZ * this.config.chunkSize + rz;
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 3)) {
                continue; // Пропускаем эти руины
            }

            const w = random.range(2, 6);
            const h = random.range(1, 4);

            const ruin = MeshBuilder.CreateBox("r", { width: w, height: h, depth: 0.5 }, this.scene);
            ruin.position = new Vector3(rx, h / 2, rz);
            ruin.rotation.y = random.range(0, Math.PI);
            ruin.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
            ruin.parent = chunkParent;
            ruin.freezeWorldMatrix();
            // chunk.meshes.push(ruin);
        }
    }

    private generateMilitary(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Military variety - увеличено количество структур
        const structTypes = [
            { w: 6, h: 2.5, d: 8, mat: "concrete" },    // Bunker
            { w: 4, h: 6, d: 4, mat: "metal" },         // Tower
            { w: 10, h: 3, d: 6, mat: "metalRust" },    // Barracks
            { w: 8, h: 4, d: 10, mat: "concrete" },     // Command post
            { w: 12, h: 5, d: 8, mat: "metal" },        // Hangar
        ];

        // Генерируем 2-4 структуры вместо одной
        const structCount = random.int(2, 4);
        for (let s = 0; s < structCount; s++) {
            const type = random.pick(structTypes);
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);

            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, Math.max(type.w, type.d) / 2)) {
                continue;
            }

            const bunker = MeshBuilder.CreateBox("bk", { width: type.w, height: type.h, depth: type.d }, this.scene);
            bunker.position = new Vector3(bx, type.h / 2, bz);
            bunker.material = this.getMat(type.mat);
            bunker.parent = chunkParent;
            bunker.freezeWorldMatrix();
            new PhysicsAggregate(bunker, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Barriers - увеличена вероятность и количество - ОПТИМИЗИРОВАНО через ThinInstances
        const milChunkKey = this.getChunkKey(chunkX, chunkZ);
        const milWorldOffsetX = chunkX * this.config.chunkSize;
        const milWorldOffsetZ = chunkZ * this.config.chunkSize;

        if (random.chance(0.7)) {
            for (let i = 0; i < random.int(6, 12); i++) {
                const barrierX = random.range(5, size - 5);
                const barrierZ = random.range(5, size - 5);

                const brWorldX = milWorldOffsetX + barrierX;
                const brWorldZ = milWorldOffsetZ + barrierZ;
                if (this.isPositionInGarageArea(brWorldX, brWorldZ, 1)) {
                    continue;
                }

                const worldPos = new Vector3(brWorldX, 0.5, brWorldZ);
                this.addInstancedObject("barrier_concrete", worldPos, milChunkKey);
            }
        }

        // Противотанковые ежи
        for (let i = 0; i < random.int(3, 8); i++) {
            const hx = random.range(5, size - 5);
            const hz = random.range(5, size - 5);
            const hWorldX = chunkX * this.config.chunkSize + hx;
            const hWorldZ = chunkZ * this.config.chunkSize + hz;
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 2)) continue;

            for (let j = 0; j < 3; j++) {
                const beam = MeshBuilder.CreateBox("hedgehog", { width: 0.3, height: 2, depth: 0.3 }, this.scene);
                beam.position = new Vector3(hx, 0.7, hz);
                beam.rotation.x = Math.PI / 4;
                beam.rotation.y = (j * Math.PI) / 3;
                beam.material = this.getMat("metalRust");
                beam.parent = chunkParent;
                beam.freezeWorldMatrix();
            }
        }

        // Мешки с песком
        for (let i = 0; i < random.int(2, 5); i++) {
            const sx = random.range(5, size - 5);
            const sz = random.range(5, size - 5);
            const sWorldX = chunkX * this.config.chunkSize + sx;
            const sWorldZ = chunkZ * this.config.chunkSize + sz;
            if (this.isPositionInGarageArea(sWorldX, sWorldZ, 2)) continue;

            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    const bag = MeshBuilder.CreateBox("sandbag", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    bag.position = new Vector3(sx + col * 1.3 - (3 - row) * 0.65 + 0.65, row * 0.4 + 0.2, sz);
                    bag.material = this.getMat("sand");
                    bag.parent = chunkParent;
                    bag.freezeWorldMatrix();
                }
            }
        }
    }

    // === HELPER METHODS FOR MAP GENERATION ===

    // Create craters for frontline/ruins maps
    private createCraters(chunkX: number, chunkZ: number, size: number, random: SeededRandom, worldX: number, worldZ: number, count: number, chunkParent: TransformNode): void {
        for (let i = 0; i < count; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;

            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 5)) continue;

            const radius = random.range(3, 8);
            const depth = random.range(1, 3);

            // Create crater as rectangular depression (LOW POLY)
            const crater = MeshBuilder.CreateBox("crater", {
                width: radius * 2,
                height: depth,
                depth: radius * 2
            }, this.scene);
            crater.position = new Vector3(cx, -depth / 2, cz);
            crater.material = this.getMat("dirt");
            crater.parent = chunkParent;
            crater.freezeWorldMatrix();
            // chunk.meshes.push(crater);
        }
    }

    // Create trenches (linear depressions)
    private _createTrenches(chunkX: number, chunkZ: number, size: number, random: SeededRandom, worldX: number, worldZ: number, chunkParent: TransformNode): void {
        if (random.chance(0.4)) {
            const length = random.range(15, 30);
            const width = 2;
            const depth = 1.5;
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const angle = random.range(0, Math.PI * 2);

            // Create rectangular trench (LOW POLY)
            const trench = MeshBuilder.CreateBox("trench", {
                width: length,
                height: depth,
                depth: width
            }, this.scene);

            trench.position = new Vector3(tx, -depth / 2, tz);
            trench.rotation.y = angle;
            trench.material = this.getMat("dirt");
            trench.parent = chunkParent;
            trench.freezeWorldMatrix();
            // chunk.meshes.push(trench);
        }
    }

    // Create ruined building (partially destroyed) - 30-70% здания остаётся
    private createRuinedBuilding(chunkX: number, chunkZ: number, x: number, z: number, w: number, h: number, d: number, random: SeededRandom, chunkParent: TransformNode, destructionLevel?: number): void {
        // Уровень разрушения: 0.3-0.7 (30-70% здания остаётся)
        const destruction = destructionLevel !== undefined ? destructionLevel : random.range(0.3, 0.7);

        // Передняя стена
        if (random.chance(destruction)) {
            const wallW = w * random.range(0.6, 1.0);
            const wallH = h * random.range(0.7, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_front", { width: wallW, height: wallH, depth: 0.3 }, this.scene);
            wall.position = new Vector3(x, wallH / 2, z - d / 2);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            // chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Задняя стена
        if (random.chance(destruction)) {
            const wallW = w * random.range(0.6, 1.0);
            const wallH = h * random.range(0.7, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_back", { width: wallW, height: wallH, depth: 0.3 }, this.scene);
            wall.position = new Vector3(x, wallH / 2, z + d / 2);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            // chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Левая стена
        if (random.chance(destruction)) {
            const wallH = h * random.range(0.7, 1.0);
            const wallD = d * random.range(0.6, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_left", { width: 0.3, height: wallH, depth: wallD }, this.scene);
            wall.position = new Vector3(x - w / 2, wallH / 2, z);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            // chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Правая стена
        if (random.chance(destruction)) {
            const wallH = h * random.range(0.7, 1.0);
            const wallD = d * random.range(0.6, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_right", { width: 0.3, height: wallH, depth: wallD }, this.scene);
            wall.position = new Vector3(x + w / 2, wallH / 2, z);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            // chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Крыша (частично)
        if (random.chance(destruction * 0.8)) {
            const roofW = w * random.range(0.5, 0.9);
            const roofD = d * random.range(0.5, 0.9);
            const roof = MeshBuilder.CreateBox("ruinRoof", { width: roofW, height: 0.2, depth: roofD }, this.scene);
            roof.position = new Vector3(x, h, z);
            roof.material = this.getMat("roof");
            roof.parent = chunkParent;
            roof.freezeWorldMatrix();
            // chunk.meshes.push(roof);
        }
    }

    // Create mountain/rock formation using rectangular blocks (LOW POLY)
    private createMountain(chunkX: number, chunkZ: number, x: number, z: number, baseSize: number, height: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Create irregular mountain using overlapping rectangular blocks
        const segments = random.int(2, 4);
        for (let i = 0; i < segments; i++) {
            const segmentW = baseSize * random.range(0.4, 0.8);
            const segmentD = baseSize * random.range(0.4, 0.8);
            const segmentHeight = height * random.range(0.5, 1.0);
            const offsetX = random.range(-baseSize / 3, baseSize / 3);
            const offsetZ = random.range(-baseSize / 3, baseSize / 3);

            // Use rectangular block for mountain (LOW POLY)
            const segment = MeshBuilder.CreateBox("mountain", {
                width: segmentW,
                height: segmentHeight,
                depth: segmentD
            }, this.scene);

            segment.position = new Vector3(x + offsetX, segmentHeight / 2, z + offsetZ);
            segment.material = this.getMat("rock") || this.getMat("gravel");
            segment.parent = chunkParent;
            segment.freezeWorldMatrix();
            // chunk.meshes.push(segment);
            new PhysicsAggregate(segment, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }

    // Create river (flat depression with water-like appearance)
    private createRiver(chunkX: number, chunkZ: number, startX: number, startZ: number, endX: number, endZ: number, width: number, random: SeededRandom, chunkParent: TransformNode): void {
        const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
        const angle = Math.atan2(endZ - startZ, endX - startX);
        const centerX = (startX + endX) / 2;
        const centerZ = (startZ + endZ) / 2;

        // Create rectangular river valley (LOW POLY)
        const river = MeshBuilder.CreateBox("river", {
            width: length,
            height: 1.5,
            depth: width
        }, this.scene);

        river.position = new Vector3(centerX, -1.5 / 2, centerZ);
        river.rotation.y = angle;

        const waterMat = this.materials.has("water") ? this.getMat("water") : this.getMat("glass");
        river.material = waterMat;
        river.parent = chunkParent;
        river.freezeWorldMatrix();
        // chunk.meshes.push(river);
    }

    // Create watchtower
    private createWatchtower(chunkX: number, chunkZ: number, x: number, z: number, random: SeededRandom, chunkParent: TransformNode): void {
        const towerHeight = random.range(8, 12);
        const baseSize = 2;

        // Base
        const base = MeshBuilder.CreateBox("towerBase", { width: baseSize, height: 3, depth: baseSize }, this.scene);
        base.position = new Vector3(x, 1.5, z);
        base.material = this.getMat("concrete");
        base.parent = chunkParent;
        base.freezeWorldMatrix();
        // chunk.meshes.push(base);
        new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Tower
        const tower = MeshBuilder.CreateBox("tower", { width: 1.5, height: towerHeight - 3, depth: 1.5 }, this.scene);
        tower.position = new Vector3(x, 3 + (towerHeight - 3) / 2, z);
        tower.material = this.getMat("metal");
        tower.parent = chunkParent;
        tower.freezeWorldMatrix();
        // chunk.meshes.push(tower);
        new PhysicsAggregate(tower, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Top platform
        const platform = MeshBuilder.CreateBox("towerPlatform", { width: 2.5, height: 0.3, depth: 2.5 }, this.scene);
        platform.position = new Vector3(x, towerHeight, z);
        platform.material = this.getMat("concrete");
        platform.parent = chunkParent;
        platform.freezeWorldMatrix();
        // chunk.meshes.push(platform);
    }

    // Create military vehicle (tank wreck, truck, etc.)
    private createMilitaryVehicle(chunkX: number, chunkZ: number, x: number, z: number, random: SeededRandom, type: "tank" | "truck" | "apc" = "tank", chunkParent: TransformNode): void {
        if (type === "tank") {
            // Tank wreck
            const body = MeshBuilder.CreateBox("tankWreck", { width: 4, height: 2, depth: 6 }, this.scene);
            body.position = new Vector3(x, 1, z);
            body.rotation.y = random.range(0, Math.PI * 2);
            body.material = this.getMat("metalRust");
            body.parent = chunkParent;
            body.freezeWorldMatrix();
            // chunk.meshes.push(body);
            new PhysicsAggregate(body, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Turret (fallen off)
            if (random.chance(0.5)) {
                const turret = MeshBuilder.CreateBox("tankTurret", { width: 2.5, height: 1.5, depth: 2.5 }, this.scene);
                turret.position = new Vector3(x + random.range(-2, 2), 0.75, z + random.range(-2, 2));
                turret.rotation.y = random.range(0, Math.PI * 2);
                turret.material = this.getMat("metalRust");
                turret.parent = chunkParent;
                turret.freezeWorldMatrix();
                // chunk.meshes.push(turret);
            }
        } else if (type === "truck") {
            const cab = MeshBuilder.CreateBox("truckCab", { width: 2.5, height: 2, depth: 3 }, this.scene);
            cab.position = new Vector3(x, 1, z);
            cab.rotation.y = random.range(0, Math.PI * 2);
            cab.material = this.getMat("metalRust");
            cab.parent = chunkParent;
            cab.freezeWorldMatrix();
            // chunk.meshes.push(cab);

            const trailer = MeshBuilder.CreateBox("truckTrailer", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
            trailer.position = new Vector3(x, 1.25, z - 4.5);
            trailer.rotation.y = random.range(0, Math.PI * 2);
            trailer.material = this.getMat("metalRust");
            trailer.parent = chunkParent;
            trailer.freezeWorldMatrix();
            // chunk.meshes.push(trailer);
        }
    }

    // Create barricade - все типы: бетонные блоки, мешки с песком, заблокированные машины
    private createBarricade(chunkX: number, chunkZ: number, x: number, z: number, length: number, random: SeededRandom, type: "concrete" | "sandbags" | "vehicles" | undefined, chunkParent: TransformNode): void {
        const barricadeType = type || random.pick(["concrete", "sandbags", "vehicles"]);

        if (barricadeType === "concrete") {
            // Бетонные блоки
            const blockCount = random.int(3, 6);
            for (let i = 0; i < blockCount; i++) {
                const offset = (i - blockCount / 2) * 1.5;
                const block = MeshBuilder.CreateBox("concrete_block", { width: 1, height: 1, depth: 1 }, this.scene);
                block.position = new Vector3(x + offset, 0.5, z);
                block.rotation.y = random.range(-0.2, 0.2);
                block.material = this.getMat("concrete");
                block.parent = chunkParent;
                block.freezeWorldMatrix();
                // chunk.meshes.push(block);
                new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        } else if (barricadeType === "sandbags") {
            // Мешки с песком
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 4; col++) {
                    const bag = MeshBuilder.CreateBox("sandbag", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    bag.position = new Vector3(x + col * 1.3 - 2, row * 0.4 + 0.2, z);
                    bag.material = this.getMat("sand");
                    bag.parent = chunkParent;
                    bag.freezeWorldMatrix();
                    // chunk.meshes.push(bag);
                }
            }
            const sbPhysics = MeshBuilder.CreateBox("sb_phys", { width: 5, height: 0.8, depth: 1 }, this.scene);
            sbPhysics.position = new Vector3(x, 0.4, z);
            sbPhysics.isVisible = false;
            sbPhysics.parent = chunkParent;
            new PhysicsAggregate(sbPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            // chunk.meshes.push(sbPhysics);
        } else {
            // Заблокированные машины
            const vehicleCount = random.int(2, 4);
            for (let i = 0; i < vehicleCount; i++) {
                const offset = (i - vehicleCount / 2) * 3;
                const angle = random.pick([0, Math.PI / 2]);
                const vx = x + (angle === 0 ? offset : 0);
                const vz = z + (angle === 0 ? 0 : offset);

                const vehicle = MeshBuilder.CreateBox("barricadeVehicle", { width: 2, height: 1.5, depth: 4 }, this.scene);
                vehicle.position = new Vector3(vx, 0.75, vz);
                vehicle.rotation.y = angle;
                vehicle.material = this.getMat(random.pick(["metal", "metalRust", "red"]));
                vehicle.parent = chunkParent;
                vehicle.freezeWorldMatrix();
                // chunk.meshes.push(vehicle);
                new PhysicsAggregate(vehicle, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }

    // === POLYGON (Training Ground) GENERATION ===

    // Размер арены полигона - использует централизованные константы из MapConstants.ts
    private get POLYGON_ARENA_SIZE(): number {
        return getMapSize("polygon");
    }
    private get POLYGON_WALL_HEIGHT(): number {
        return getWallHeight("polygon");
    }
    private _polygonInitialized = false;

    private generatePolygonContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Земля военного типа (песок/грязь)
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "military", random, chunkParent);

        // Генерируем смешанную местность (холмы + равнины)
        this.generatePolygonTerrain(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Определяем границы арены
        const arenaHalf = this.POLYGON_ARENA_SIZE / 2;
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;

        // Генерируем периметр только один раз для чанков на границе
        this.generatePolygonPerimeter(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Определяем зону на основе позиции чанка
        const zoneType = this.getPolygonZone(chunkCenterX, chunkCenterZ);

        switch (zoneType) {
            case "shooting":
                this.generatePolygonTargets(chunkX, chunkZ, size, random, chunkParent);
                break;
            case "obstacles":
                this.generatePolygonObstacles(chunkX, chunkZ, size, random, chunkParent);
                break;
            case "combat":
                // Зона боя - открытое пространство с укрытиями
                this.generatePolygonCombatZone(chunkX, chunkZ, size, random, chunkParent);
                break;
            case "base":
                this.generatePolygonBuildings(chunkX, chunkZ, size, random, chunkParent);
                break;
        }
    }

    private generatePolygonTerrain(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Смешанная местность: 30-40% холмы, 60-70% равнины
        // Создаём несколько холмов на чанке
        const hillCount = random.int(2, 4);
        for (let i = 0; i < hillCount; i++) {
            if (random.chance(0.35)) { // 35% шанс = примерно 30-40% площади
                const hx = random.range(10, size - 10);
                const hz = random.range(10, size - 10);
                const hWorldX = chunkX * this.config.chunkSize + hx;
                const hWorldZ = chunkZ * this.config.chunkSize + hz;

                if (this.isPositionInGarageArea(hWorldX, hWorldZ, 5)) continue;

                const hillSize = random.range(8, 15);
                const hillHeight = random.range(2, 5);

                const hill = MeshBuilder.CreateBox("polygon_hill", { width: hillSize, height: hillHeight, depth: hillSize }, this.scene);
                hill.position = new Vector3(hx, hillHeight / 2, hz);
                hill.material = this.getMat("dirt");
                hill.parent = chunkParent;
                hill.freezeWorldMatrix();
                // chunk.meshes.push(hill);
                new PhysicsAggregate(hill, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }

    private getPolygonZone(x: number, z: number): "shooting" | "obstacles" | "combat" | "base" | "empty" {
        const arenaHalf = this.POLYGON_ARENA_SIZE / 2;

        // За пределами арены
        if (Math.abs(x) > arenaHalf || Math.abs(z) > arenaHalf) {
            return "empty";
        }

        // Зоны пропорциональны размеру арены (центральная зона = 10% от половины арены)
        const centerZone = arenaHalf * 0.1;

        // Квадранты арены:
        // Северо-восток (x > centerZone, z > centerZone) - стрельбище
        // Северо-запад (x < -centerZone, z > centerZone) - полоса препятствий
        // Юго-восток (x > centerZone, z < -centerZone) - зона боя
        // Юго-запад (x < -centerZone, z < -centerZone) - военная база (рядом с гаражом)
        // Центр: пустое пространство

        if (x > centerZone && z > centerZone) return "shooting";
        if (x < -centerZone && z > centerZone) return "obstacles";
        if (x > centerZone && z < -centerZone) return "combat";
        if (x < -centerZone && z < -centerZone) return "base";

        return "empty"; // Центральная область - пустое пространство
    }

    private generatePolygonPerimeter(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, _random: SeededRandom, chunkParent: TransformNode): void {
        const arenaHalf = this.POLYGON_ARENA_SIZE / 2;
        const fenceHeight = 3; // Fence instead of wall
        const fenceThickness = 0.2;

        // Проверяем, находится ли чанк на границе арены
        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;

        // Создаём стены только для чанков на границе арены

        // Северная стена (z = arenaHalf)
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                // Create fence with posts
                const postSpacing = 5;
                const postCount = Math.floor(wallLength / postSpacing);
                for (let i = 0; i < postCount; i++) {
                    const postX = wallX + (i - postCount / 2) * postSpacing;
                    const post = MeshBuilder.CreateBox("fencePost", { width: 0.3, height: fenceHeight, depth: 0.3 }, this.scene);
                    post.position = new Vector3(postX, fenceHeight / 2, arenaHalf - worldZ);
                    post.material = this.getMat("metal");
                    post.parent = chunkParent;
                    post.freezeWorldMatrix();
                    // chunk.meshes.push(post);
                }

                // Fence mesh between posts
                const fence = MeshBuilder.CreateBox("pfence_n", { width: wallLength, height: fenceHeight * 0.7, depth: fenceThickness }, this.scene);
                fence.position = new Vector3(wallX, fenceHeight * 0.5, arenaHalf - worldZ);
                fence.material = this.getMat("metal");
                fence.parent = chunkParent;
                fence.freezeWorldMatrix();
                // chunk.meshes.push(fence);
                new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Южная стена (z = -arenaHalf)
        const wallHeight = this.POLYGON_WALL_HEIGHT;
        const wallThickness = 1;
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                const wall = MeshBuilder.CreateBox("pwall_s", { width: wallLength, height: wallHeight, depth: wallThickness }, this.scene);
                wall.position = new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Восточная стена (x = arenaHalf)
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                const wall = MeshBuilder.CreateBox("pwall_e", { width: wallThickness, height: wallHeight, depth: wallLength }, this.scene);
                wall.position = new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Западная стена (x = -arenaHalf)
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                const wall = MeshBuilder.CreateBox("pwall_w", { width: wallThickness, height: wallHeight, depth: wallLength }, this.scene);
                wall.position = new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }

    private generatePolygonTargets(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Стрельбище - мишени-силуэты танков
        const targetCount = random.int(3, 6);

        for (let i = 0; i < targetCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);

            // Проверяем, не в гараже ли
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            // Основа мишени - вертикальный столб
            const pole = MeshBuilder.CreateBox("target_pole", { width: 0.3, height: 3, depth: 0.3 }, this.scene);
            pole.position = new Vector3(x, 1.5, z);
            pole.material = this.getMat("metal");
            pole.parent = chunkParent;
            pole.freezeWorldMatrix();
            // chunk.meshes.push(pole);

            // Силуэт танка (упрощённый - прямоугольник)
            const targetWidth = random.range(3, 5);
            const targetHeight = random.range(2, 3);
            const target = MeshBuilder.CreateBox("target", { width: targetWidth, height: targetHeight, depth: 0.2 }, this.scene);
            target.position = new Vector3(x, targetHeight / 2 + 1, z + 0.3);

            // Красная мишень (кэшированный материал)
            target.material = this.getMat("targetRedEmissive");
            target.parent = chunkParent;
            target.freezeWorldMatrix();
            // chunk.meshes.push(target);

            // Квадратные рамки на мишени (LOW POLY)
            for (let ring = 1; ring <= 3; ring++) {
                const ringSize = ring * 0.4;
                const ringThickness = 0.1;
                // Создаём квадратную рамку из 4 прямоугольных блоков
                // Используем кэшированный материал
                const ringMat = ring % 2 === 0 ? this.getMat("ringWhite") : this.getMat("ringBlack");
                // Верх
                const top = MeshBuilder.CreateBox("ring_top", { width: ringSize * 2, height: ringThickness, depth: ringThickness }, this.scene);
                top.position = new Vector3(x, 2 + targetHeight / 2, z + 0.35 - ringSize);
                top.material = ringMat;
                top.parent = chunkParent;
                top.freezeWorldMatrix();
                // chunk.meshes.push(top);
                // Низ
                const bottom = MeshBuilder.CreateBox("ring_bottom", { width: ringSize * 2, height: ringThickness, depth: ringThickness }, this.scene);
                bottom.position = new Vector3(x, 2 + targetHeight / 2, z + 0.35 + ringSize);
                bottom.material = ringMat;
                bottom.parent = chunkParent;
                bottom.freezeWorldMatrix();
                // chunk.meshes.push(bottom);
                // Лево
                const left = MeshBuilder.CreateBox("ring_left", { width: ringThickness, height: ringThickness, depth: ringSize * 2 }, this.scene);
                left.position = new Vector3(x - ringSize, 2 + targetHeight / 2, z + 0.35);
                left.material = ringMat;
                left.parent = chunkParent;
                left.freezeWorldMatrix();
                // chunk.meshes.push(left);
                // Право
                const right = MeshBuilder.CreateBox("ring_right", { width: ringThickness, height: ringThickness, depth: ringSize * 2 }, this.scene);
                right.position = new Vector3(x + ringSize, 2 + targetHeight / 2, z + 0.35);
                right.material = ringMat;
                right.parent = chunkParent;
                right.freezeWorldMatrix();
                // chunk.meshes.push(right);
            }
        }

        // Добавляем рельсы для движущихся мишеней
        if (random.chance(0.5)) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const rail = MeshBuilder.CreateBox("rail", { width: size - 20, height: 0.1, depth: 0.5 }, this.scene);
            rail.position = new Vector3(size / 2, 0.05, railZ);
            rail.material = this.getMat("metalRust");
            rail.parent = chunkParent;
            rail.freezeWorldMatrix();
            // chunk.meshes.push(rail);
        }

        // Генерируем движущиеся мишени
        this.generateMovingTargets(chunkX, chunkZ, size, random, chunkParent);
    }

    private generateMovingTargets(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Создаём 2-3 движущиеся мишени на стрельбище
        const movingTargetCount = random.int(2, 3);

        for (let i = 0; i < movingTargetCount; i++) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const startX = random.range(15, size - 15);
            const endX = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + startX;
            const worldZ = chunkZ * this.config.chunkSize + railZ;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            // Рельсы для движущейся мишени
            const railLength = Math.abs(endX - startX);
            const rail = MeshBuilder.CreateBox("moving_rail", { width: railLength, height: 0.1, depth: 0.5 }, this.scene);
            rail.position = new Vector3((startX + endX) / 2, 0.05, railZ);
            rail.material = this.getMat("metalRust");
            rail.parent = chunkParent;
            rail.freezeWorldMatrix();
            // chunk.meshes.push(rail);

            // Мишень на рельсах
            const targetWidth = random.range(3, 5);
            const targetHeight = random.range(2, 3);
            const target = MeshBuilder.CreateBox("moving_target", { width: targetWidth, height: targetHeight, depth: 0.2 }, this.scene);
            target.position = new Vector3(startX, targetHeight / 2 + 1, railZ + 0.3);

            target.material = this.getMat("movingTargetRedEmissive");
            target.parent = chunkParent;
            // chunk.meshes.push(target);

            // Анимация движения мишени вдоль рельсов - циклическое движение туда-обратно
            let animDirection = 1;
            const animSpeed = 0.15;
            const animObserver = this.scene.onBeforeRenderObservable.add(() => {
                if (target && !target.isDisposed() && target.parent === chunkParent) {
                    const currentX = target.position.x;
                    if (animDirection > 0 && currentX >= endX) {
                        animDirection = -1;
                    } else if (animDirection < 0 && currentX <= startX) {
                        animDirection = 1;
                    }
                    target.position.x += animDirection * animSpeed;
                } else {
                    // Если меш удалён, удаляем observer
                    this.scene.onBeforeRenderObservable.remove(animObserver);
                }
            });
        }
    }

    private generatePolygonObstacles(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Полоса препятствий - танкодром

        // Рампы
        const rampCount = random.int(2, 4);
        for (let i = 0; i < rampCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 4)) continue;

            const rampWidth = random.range(4, 8);
            const rampHeight = random.range(1, 2.5);
            const rampDepth = random.range(6, 10);

            const ramp = MeshBuilder.CreateBox("ramp", { width: rampWidth, height: rampHeight, depth: rampDepth }, this.scene);
            ramp.position = new Vector3(x, rampHeight / 2, z);
            ramp.rotation.x = -Math.PI * 0.1; // Небольшой наклон
            ramp.material = this.getMat("concrete");
            ramp.parent = chunkParent;
            ramp.freezeWorldMatrix();
            // chunk.meshes.push(ramp);
            new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Бетонные блоки (укрытия)
        const blockCount = random.int(4, 8);
        for (let i = 0; i < blockCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            const blockW = random.range(2, 4);
            const blockH = random.range(1, 2);
            const blockD = random.range(2, 4);

            const block = MeshBuilder.CreateBox("block", { width: blockW, height: blockH, depth: blockD }, this.scene);
            block.position = new Vector3(x, blockH / 2, z);
            block.rotation.y = random.range(0, Math.PI);
            block.material = this.getMat("concrete");
            block.parent = chunkParent;
            block.freezeWorldMatrix();
            // chunk.meshes.push(block);
            new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Противотанковые ежи (увеличено количество)
        const hedgehogCount = random.int(5, 10);
        for (let i = 0; i < hedgehogCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            // Создаём "ёж" из 3 пересекающихся балок
            const beamLength = 3;
            const beamThickness = 0.3;

            for (let j = 0; j < 3; j++) {
                const beam = MeshBuilder.CreateBox("hedgehog", { width: beamThickness, height: beamLength, depth: beamThickness }, this.scene);
                beam.position = new Vector3(x, beamLength / 2 * 0.7, z);
                beam.rotation.x = Math.PI / 4;
                beam.rotation.y = (j * Math.PI) / 3;
                beam.material = this.getMat("metalRust");
                beam.parent = chunkParent;
                beam.freezeWorldMatrix();
                // chunk.meshes.push(beam);
            }

            // Физика для ежа (LOW POLY - box)
            const hedgehogPhysics = MeshBuilder.CreateBox("hedgehog_phys", { width: 2, height: 2, depth: 2 }, this.scene);
            hedgehogPhysics.position = new Vector3(x, 1, z);
            hedgehogPhysics.isVisible = false;
            hedgehogPhysics.parent = chunkParent;
            new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Бетонные надолбы (пирамидальные блоки)
        const dragonTeethCount = random.int(8, 15);
        for (let i = 0; i < dragonTeethCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            const tooth = MeshBuilder.CreateBox("dragonTooth", { width: 1.5, height: 1.5, depth: 1.5 }, this.scene);
            tooth.position = new Vector3(x, 0.75, z);
            tooth.rotation.y = Math.PI / 4;
            tooth.material = this.getMat("concrete");
            tooth.parent = chunkParent;
            tooth.freezeWorldMatrix();
            new PhysicsAggregate(tooth, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Траншеи (вырытые ямы)
        const trenchCount = random.int(1, 3);
        for (let i = 0; i < trenchCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) continue;

            const trenchLength = random.range(15, 30);
            const trenchWidth = random.range(3, 5);
            const trench = MeshBuilder.CreateBox("trench", { width: trenchWidth, height: 1.5, depth: trenchLength }, this.scene);
            trench.position = new Vector3(x, -0.5, z);
            trench.rotation.y = random.range(0, Math.PI);
            trench.material = this.getMat("dirt");
            trench.parent = chunkParent;
            trench.freezeWorldMatrix();
        }

        // Колючая проволока
        const wireCount = random.int(3, 7);
        for (let i = 0; i < wireCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            // Столбики
            const wireLength = random.range(5, 12);
            for (let p = 0; p <= wireLength / 2; p++) {
                const post = MeshBuilder.CreateBox("wirePost", { width: 0.1, height: 1.2, depth: 0.1 }, this.scene);
                post.position = new Vector3(x + p * 2, 0.6, z);
                post.material = this.getMat("metalRust");
                post.parent = chunkParent;
                post.freezeWorldMatrix();
            }
            // Линии проволоки
            const wire = MeshBuilder.CreateBox("wire", { width: wireLength, height: 0.05, depth: 0.05 }, this.scene);
            wire.position = new Vector3(x + wireLength / 2, 1, z);
            wire.material = this.getMat("metalRust");
            wire.parent = chunkParent;
            wire.freezeWorldMatrix();

            const wire2 = MeshBuilder.CreateBox("wire2", { width: wireLength, height: 0.05, depth: 0.05 }, this.scene);
            wire2.position = new Vector3(x + wireLength / 2, 0.5, z);
            wire2.material = this.getMat("metalRust");
            wire2.parent = chunkParent;
            wire2.freezeWorldMatrix();
        }

        // Рампы для прыжков (дополнительные)
        const jumpRampCount = random.int(1, 3);
        for (let i = 0; i < jumpRampCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 6)) continue;

            const jumpRamp = MeshBuilder.CreateBox("jumpRamp", { width: 6, height: 2, depth: 8 }, this.scene);
            jumpRamp.position = new Vector3(x, 0.5, z);
            jumpRamp.rotation.x = -0.3; // Наклон
            jumpRamp.rotation.y = random.range(0, Math.PI * 2);
            jumpRamp.material = this.getMat("concrete");
            jumpRamp.parent = chunkParent;
            jumpRamp.freezeWorldMatrix();
            new PhysicsAggregate(jumpRamp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }

    private generatePolygonCombatZone(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Зона боя - открытое пространство с укрытиями для тренировки с ботами

        // Низкие укрытия (увеличено количество)
        const coverCount = random.int(5, 10);
        for (let i = 0; i < coverCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            // Низкая стена-укрытие
            const coverWidth = random.range(4, 8);
            const coverHeight = random.range(1.5, 2.5);

            const cover = MeshBuilder.CreateBox("cover", { width: coverWidth, height: coverHeight, depth: 1 }, this.scene);
            cover.position = new Vector3(x, coverHeight / 2, z);
            cover.rotation.y = random.range(0, Math.PI);
            cover.material = this.getMat("concrete");
            cover.parent = chunkParent;
            cover.freezeWorldMatrix();
            // chunk.meshes.push(cover);
            new PhysicsAggregate(cover, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Песчаные мешки (декоративные кучи)
        const sandbagCount = random.int(2, 4);
        for (let i = 0; i < sandbagCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            // Куча мешков
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    const bag = MeshBuilder.CreateBox("sandbag", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    bag.position = new Vector3(
                        x + col * 1.3 - (3 - row) * 0.65 + 0.65,
                        row * 0.4 + 0.2,
                        z
                    );
                    bag.material = this.getMat("sand");
                    bag.parent = chunkParent;
                    bag.freezeWorldMatrix();
                    // chunk.meshes.push(bag);
                }
            }

            // Физика для кучи (один бокс)
            const sandbagPhysics = MeshBuilder.CreateBox("sandbag_phys", { width: 4, height: 1.2, depth: 1 }, this.scene);
            sandbagPhysics.position = new Vector3(x, 0.6, z);
            sandbagPhysics.isVisible = false;
            sandbagPhysics.parent = chunkParent;
            new PhysicsAggregate(sandbagPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Стопки шин (укрытие)
        const tireStackCount = random.int(2, 5);
        for (let i = 0; i < tireStackCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            const stackHeight = random.int(2, 4);
            for (let h = 0; h < stackHeight; h++) {
                const tire = MeshBuilder.CreateBox("tire", { width: 1.5, height: 0.4, depth: 1.5 }, this.scene);
                tire.position = new Vector3(x + random.range(-0.1, 0.1), h * 0.4 + 0.2, z + random.range(-0.1, 0.1));
                tire.material = this.getMat("tireBlack");
                tire.parent = chunkParent;
                tire.freezeWorldMatrix();
            }
            // Физика для стопки
            const tirePhys = MeshBuilder.CreateBox("tirePhys", { width: 1.5, height: stackHeight * 0.4, depth: 1.5 }, this.scene);
            tirePhys.position = new Vector3(x, stackHeight * 0.2, z);
            tirePhys.isVisible = false;
            tirePhys.parent = chunkParent;
            new PhysicsAggregate(tirePhys, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Бочки с топливом
        const barrelCount = random.int(3, 8);
        for (let i = 0; i < barrelCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            const barrel = MeshBuilder.CreateBox("barrel", { width: 0.8, height: 1.2, depth: 0.8 }, this.scene);
            barrel.position = new Vector3(x, 0.6, z);
            barrel.material = random.chance(0.5) ? this.getMat("barrelGreen") : this.getMat("barrelRed");
            barrel.parent = chunkParent;
            barrel.freezeWorldMatrix();
            new PhysicsAggregate(barrel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Ящики с боеприпасами
        const crateCount = random.int(2, 6);
        for (let i = 0; i < crateCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            const crate = MeshBuilder.CreateBox("ammoCrate", { width: 1.5, height: 0.8, depth: 1 }, this.scene);
            crate.position = new Vector3(x, 0.4, z);
            crate.rotation.y = random.range(0, Math.PI);
            crate.material = this.getMat("crateWood");
            crate.parent = chunkParent;
            crate.freezeWorldMatrix();
            new PhysicsAggregate(crate, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Тренировочные манекены (силуэты солдат)
        const dummyCount = random.int(2, 4);
        for (let i = 0; i < dummyCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;

            // Столб
            const pole = MeshBuilder.CreateBox("dummyPole", { width: 0.15, height: 2, depth: 0.15 }, this.scene);
            pole.position = new Vector3(x, 1, z);
            pole.material = this.getMat("metal");
            pole.parent = chunkParent;
            pole.freezeWorldMatrix();

            // Силуэт
            const dummy = MeshBuilder.CreateBox("dummy", { width: 0.8, height: 1.6, depth: 0.1 }, this.scene);
            dummy.position = new Vector3(x, 1.3, z + 0.1);
            dummy.material = this.getMat("dummy");
            dummy.parent = chunkParent;
            dummy.freezeWorldMatrix();
        }

        // Разрушенная техника (укрытие)
        if (random.chance(0.6)) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (!this.isPositionInGarageArea(worldX, worldZ, 5)) {
                // Корпус разрушенного танка
                const hull = MeshBuilder.CreateBox("wreckHull", { width: 3, height: 1.2, depth: 5 }, this.scene);
                hull.position = new Vector3(x, 0.6, z);
                hull.rotation.y = random.range(0, Math.PI * 2);
                hull.material = this.getMat("wreck");
                hull.parent = chunkParent;
                hull.freezeWorldMatrix();
                new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }

    private generatePolygonBuildings(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Военная база - бункеры, башни, казармы, ангары, склады, техника

        // Hangars (large enclosed buildings for vehicles)
        const hangarCount = random.int(1, 3);
        for (let i = 0; i < hangarCount; i++) {
            const hx = random.range(15, size - 15);
            const hz = random.range(15, size - 15);
            const hWorldX = chunkX * this.config.chunkSize + hx;
            const hWorldZ = chunkZ * this.config.chunkSize + hz;

            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 15)) continue;

            const hangarW = random.range(20, 30);
            const hangarH = random.range(6, 10);
            const hangarD = random.range(25, 35);

            // Main hangar building
            const hangar = MeshBuilder.CreateBox("hangar", { width: hangarW, height: hangarH, depth: hangarD }, this.scene);
            hangar.position = new Vector3(hx, hangarH / 2, hz);
            hangar.material = this.getMat("metal");
            hangar.parent = chunkParent;
            hangar.freezeWorldMatrix();
            // chunk.meshes.push(hangar);
            new PhysicsAggregate(hangar, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Large door opening (front missing wall)
            // Door frame
            const doorHeight = hangarH * 0.7;
            const leftFrame = MeshBuilder.CreateBox("doorFrame", { width: 1, height: doorHeight, depth: 1 }, this.scene);
            leftFrame.position = new Vector3(hx - hangarW / 2 + 1, doorHeight / 2, hz - hangarD / 2);
            leftFrame.material = this.getMat("metal");
            leftFrame.parent = chunkParent;
            leftFrame.freezeWorldMatrix();
            // chunk.meshes.push(leftFrame);

            const rightFrame = MeshBuilder.CreateBox("doorFrame", { width: 1, height: doorHeight, depth: 1 }, this.scene);
            rightFrame.position = new Vector3(hx + hangarW / 2 - 1, doorHeight / 2, hz - hangarD / 2);
            rightFrame.material = this.getMat("metal");
            rightFrame.parent = chunkParent;
            rightFrame.freezeWorldMatrix();
            // chunk.meshes.push(rightFrame);

            // Top frame
            const topFrame = MeshBuilder.CreateBox("doorFrame", { width: hangarW - 2, height: 1, depth: 1 }, this.scene);
            topFrame.position = new Vector3(hx, doorHeight, hz - hangarD / 2);
            topFrame.material = this.getMat("metal");
            topFrame.parent = chunkParent;
            topFrame.freezeWorldMatrix();
            // chunk.meshes.push(topFrame);

            // Vehicles inside hangar (occasionally)
            if (random.chance(0.5)) {
                this.createMilitaryVehicle(chunkX, chunkZ, hx, hz, random, random.pick(["tank", "truck", "apc"]), chunkParent);
            }
        }

        // Warehouses (storage buildings) - 1-2 склада
        const warehouseCount = random.int(1, 2);
        for (let i = 0; i < warehouseCount; i++) {
            const wx = random.range(10, size - 10);
            const wz = random.range(10, size - 10);
            const wWorldX = chunkX * this.config.chunkSize + wx;
            const wWorldZ = chunkZ * this.config.chunkSize + wz;

            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 12)) continue;

            const warehouse = MeshBuilder.CreateBox("warehouse", { width: random.range(15, 25), height: random.range(5, 8), depth: random.range(20, 30) }, this.scene);
            warehouse.position = new Vector3(wx, random.range(2.5, 4), wz);
            warehouse.material = this.getMat("metalRust");
            warehouse.parent = chunkParent;
            warehouse.freezeWorldMatrix();
            // chunk.meshes.push(warehouse);
            new PhysicsAggregate(warehouse, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Containers near warehouse
            for (let j = 0; j < random.int(2, 5); j++) {
                const cx = wx + random.range(-12, 12);
                const cz = wz + random.range(-12, 12);
                const cWorldX = chunkX * this.config.chunkSize + cx;
                const cWorldZ = chunkZ * this.config.chunkSize + cz;

                if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) continue;

                const container = MeshBuilder.CreateBox("warehouseContainer", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
                container.position = new Vector3(cx, 1.26, cz);
                container.rotation.y = random.pick([0, Math.PI / 2]);
                container.material = this.getMat(random.pick(["red", "yellow", "blue", "metal"]));
                container.parent = chunkParent;
                container.freezeWorldMatrix();
                // chunk.meshes.push(container);
                new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Watchtowers - 2-3 вышки
        const towerCount = random.int(2, 3);
        for (let i = 0; i < towerCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunkX * this.config.chunkSize + tx;
            const tWorldZ = chunkZ * this.config.chunkSize + tz;

            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) continue;

            this.createWatchtower(chunkX, chunkZ, tx, tz, random, chunkParent);
        }

        // Cranes (for loading/unloading) - 1-2 крана
        const craneCount = random.int(1, 2);
        for (let i = 0; i < craneCount; i++) {
            const cx = random.range(15, size - 15);
            const cz = random.range(15, size - 15);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;

            if (!this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
                const tower = MeshBuilder.CreateBox("craneTower", { width: 2, height: 15, depth: 2 }, this.scene);
                tower.position = new Vector3(cx, 7.5, cz);
                tower.material = this.getMat("yellow");
                tower.parent = chunkParent;
                tower.freezeWorldMatrix();
                // chunk.meshes.push(tower);

                const arm = MeshBuilder.CreateBox("craneArm", { width: 1, height: 1, depth: 20 }, this.scene);
                arm.position = new Vector3(cx, 14, cz + 10);
                arm.material = this.getMat("yellow");
                arm.parent = chunkParent;
                arm.freezeWorldMatrix();
                // chunk.meshes.push(arm);
            }
        }

        // Military vehicles (parked/driving range)
        const vehicleCount = random.int(2, 5);
        for (let i = 0; i < vehicleCount; i++) {
            const vx = random.range(10, size - 10);
            const vz = random.range(10, size - 10);
            const vWorldX = chunkX * this.config.chunkSize + vx;
            const vWorldZ = chunkZ * this.config.chunkSize + vz;

            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 4)) continue;

            this.createMilitaryVehicle(chunkX, chunkZ, vx, vz, random, random.pick(["tank", "truck", "apc"]), chunkParent);
        }

        // Barracks/Administrative buildings
        if (random.chance(0.7)) {
            const kx = random.range(15, size - 15);
            const kz = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + kx;
            const worldZ = chunkZ * this.config.chunkSize + kz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 10)) {
                const barrackW = random.range(12, 20);
                const barrackH = 4;
                const barrackD = 8;

                const barrack = MeshBuilder.CreateBox("barrack", { width: barrackW, height: barrackH, depth: barrackD }, this.scene);
                barrack.position = new Vector3(kx, barrackH / 2, kz);
                barrack.material = this.getMat("metalRust");
                barrack.parent = chunkParent;
                barrack.freezeWorldMatrix();
                // chunk.meshes.push(barrack);
                new PhysicsAggregate(barrack, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Бункер
        if (random.chance(0.6)) {
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + bx;
            const worldZ = chunkZ * this.config.chunkSize + bz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 8)) {
                const bunkerW = random.range(8, 12);
                const bunkerH = random.range(3, 4);
                const bunkerD = random.range(6, 10);

                const bunker = MeshBuilder.CreateBox("bunker", { width: bunkerW, height: bunkerH, depth: bunkerD }, this.scene);
                bunker.position = new Vector3(bx, bunkerH / 2, bz);
                bunker.material = this.getMat("concrete");
                bunker.parent = chunkParent;
                bunker.freezeWorldMatrix();
                // chunk.meshes.push(bunker);
                new PhysicsAggregate(bunker, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                // Амбразура на бункере
                const slit = MeshBuilder.CreateBox("slit", { width: bunkerW * 0.6, height: 0.5, depth: 0.5 }, this.scene);
                slit.position = new Vector3(bx, bunkerH - 0.5, bz + bunkerD / 2);
                slit.material = this.getMat("tireBlack");
                slit.parent = chunkParent;
                slit.freezeWorldMatrix();
                // chunk.meshes.push(slit);
            }
        }

        // Смотровая башня
        if (random.chance(0.4)) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);

            const worldX = chunkX * this.config.chunkSize + tx;
            const worldZ = chunkZ * this.config.chunkSize + tz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 5)) {
                const towerH = random.range(8, 12);

                // Основание башни
                const base = MeshBuilder.CreateBox("tower_base", { width: 4, height: towerH, depth: 4 }, this.scene);
                base.position = new Vector3(tx, towerH / 2, tz);
                base.material = this.getMat("metal");
                base.parent = chunkParent;
                base.freezeWorldMatrix();
                // chunk.meshes.push(base);
                new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                // Платформа наверху
                const platform = MeshBuilder.CreateBox("tower_platform", { width: 6, height: 0.5, depth: 6 }, this.scene);
                platform.position = new Vector3(tx, towerH + 0.25, tz);
                platform.material = this.getMat("metal");
                platform.parent = chunkParent;
                platform.freezeWorldMatrix();
                // chunk.meshes.push(platform);

                // Ограждение
                const railH = 1.2;
                for (let side = 0; side < 4; side++) {
                    const rail = MeshBuilder.CreateBox("rail", { width: side % 2 === 0 ? 6 : 0.1, height: railH, depth: side % 2 === 0 ? 0.1 : 6 }, this.scene);
                    const offsetX = side === 1 ? 3 : (side === 3 ? -3 : 0);
                    const offsetZ = side === 0 ? 3 : (side === 2 ? -3 : 0);
                    rail.position = new Vector3(tx + offsetX, towerH + 0.5 + railH / 2, tz + offsetZ);
                    rail.material = this.getMat("metalRust");
                    rail.parent = chunkParent;
                    rail.freezeWorldMatrix();
                    // chunk.meshes.push(rail);
                }
            }
        }

        // Казарма (длинное здание)
        if (random.chance(0.3)) {
            const kx = random.range(15, size - 15);
            const kz = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + kx;
            const worldZ = chunkZ * this.config.chunkSize + kz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 10)) {
                const barrackW = random.range(12, 18);
                const barrackH = 4;
                const barrackD = 8;

                const barrack = MeshBuilder.CreateBox("barrack", { width: barrackW, height: barrackH, depth: barrackD }, this.scene);
                barrack.position = new Vector3(kx, barrackH / 2, kz);
                barrack.material = this.getMat("metalRust");
                barrack.parent = chunkParent;
                barrack.freezeWorldMatrix();
                // chunk.meshes.push(barrack);
                new PhysicsAggregate(barrack, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                // Крыша
                const roof = MeshBuilder.CreateBox("roof", { width: barrackW + 1, height: 0.3, depth: barrackD + 1 }, this.scene);
                roof.position = new Vector3(kx, barrackH + 0.15, kz);
                roof.material = this.getMat("metal");
                roof.parent = chunkParent;
                roof.freezeWorldMatrix();
            }
        }

        // Флагштоки с флагами (2-4 штуки)
        const flagCount = random.int(2, 4);
        for (let i = 0; i < flagCount; i++) {
            const fx = random.range(10, size - 10);
            const fz = random.range(10, size - 10);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 2)) continue;

            // Мачта
            const pole = MeshBuilder.CreateBox("flagPole", { width: 0.15, height: 10, depth: 0.15 }, this.scene);
            pole.position = new Vector3(fx, 5, fz);
            pole.material = this.getMat("metal");
            pole.parent = chunkParent;
            pole.freezeWorldMatrix();

            // Флаг
            const flag = MeshBuilder.CreateBox("flag", { width: 2.5, height: 1.5, depth: 0.05 }, this.scene);
            flag.position = new Vector3(fx + 1.25, 9, fz);
            flag.material = random.pick([this.getMat("red"), this.getMat("barrelGreen"), this.getMat("metal")]);
            flag.parent = chunkParent;
            flag.freezeWorldMatrix();
        }

        // Прожекторные вышки (2-3 штуки)
        const spotlightCount = random.int(2, 3);
        for (let i = 0; i < spotlightCount; i++) {
            const sx = random.range(10, size - 10);
            const sz = random.range(10, size - 10);
            const sWorldX = chunkX * this.config.chunkSize + sx;
            const sWorldZ = chunkZ * this.config.chunkSize + sz;
            if (this.isPositionInGarageArea(sWorldX, sWorldZ, 3)) continue;

            // Столб
            const lightPole = MeshBuilder.CreateBox("lightPole", { width: 0.3, height: 8, depth: 0.3 }, this.scene);
            lightPole.position = new Vector3(sx, 4, sz);
            lightPole.material = this.getMat("metal");
            lightPole.parent = chunkParent;
            lightPole.freezeWorldMatrix();

            // Прожектор
            const spotlight = MeshBuilder.CreateBox("spotlight", { width: 1, height: 0.5, depth: 0.8 }, this.scene);
            spotlight.position = new Vector3(sx, 8, sz);
            spotlight.rotation.x = 0.3;
            spotlight.material = this.getMat("gravel");
            spotlight.parent = chunkParent;
            spotlight.freezeWorldMatrix();
        }

        // Радарные станции (1-2 штуки)
        if (random.chance(0.6)) {
            const rx = random.range(15, size - 15);
            const rz = random.range(15, size - 15);
            const rWorldX = chunkX * this.config.chunkSize + rx;
            const rWorldZ = chunkZ * this.config.chunkSize + rz;
            if (!this.isPositionInGarageArea(rWorldX, rWorldZ, 5)) {
                // Платформа
                const radarBase = MeshBuilder.CreateBox("radarBase", { width: 5, height: 1, depth: 5 }, this.scene);
                radarBase.position = new Vector3(rx, 0.5, rz);
                radarBase.material = this.getMat("concrete");
                radarBase.parent = chunkParent;
                radarBase.freezeWorldMatrix();
                new PhysicsAggregate(radarBase, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                // Мачта
                const radarPole = MeshBuilder.CreateBox("radarPole", { width: 0.5, height: 6, depth: 0.5 }, this.scene);
                radarPole.position = new Vector3(rx, 4, rz);
                radarPole.material = this.getMat("metal");
                radarPole.parent = chunkParent;
                radarPole.freezeWorldMatrix();

                // Антенна
                const radarDish = MeshBuilder.CreateBox("radarDish", { width: 3, height: 2, depth: 0.3 }, this.scene);
                radarDish.position = new Vector3(rx, 7, rz);
                radarDish.material = this.getMat("metal");
                radarDish.parent = chunkParent;
                radarDish.freezeWorldMatrix();
            }
        }

        // Топливный склад (цистерны)
        if (random.chance(0.5)) {
            const fuelX = random.range(15, size - 15);
            const fuelZ = random.range(15, size - 15);
            const fuelWorldX = chunkX * this.config.chunkSize + fuelX;
            const fuelWorldZ = chunkZ * this.config.chunkSize + fuelZ;
            if (!this.isPositionInGarageArea(fuelWorldX, fuelWorldZ, 8)) {
                // Несколько горизонтальных цистерн
                const tankCount = random.int(2, 4);
                for (let t = 0; t < tankCount; t++) {
                    const tank = MeshBuilder.CreateCylinder("fuelTank", { diameter: 3, height: 8 }, this.scene);
                    tank.position = new Vector3(fuelX + t * 4 - tankCount * 2, 1.5, fuelZ);
                    tank.rotation.z = Math.PI / 2;
                    tank.material = this.getMat("grassDark");
                    tank.parent = chunkParent;
                    tank.freezeWorldMatrix();
                    new PhysicsAggregate(tank, PhysicsShapeType.CYLINDER, { mass: 0 }, this.scene);
                }
            }
        }

        // Заграждение из мешков с песком вокруг важных зданий
        const sandbagWallCount = random.int(2, 4);
        for (let w = 0; w < sandbagWallCount; w++) {
            const wx = random.range(10, size - 10);
            const wz = random.range(10, size - 10);
            const wWorldX = chunkX * this.config.chunkSize + wx;
            const wWorldZ = chunkZ * this.config.chunkSize + wz;
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 3)) continue;

            const wallLength = random.int(4, 8);
            const wallAngle = random.range(0, Math.PI);
            for (let s = 0; s < wallLength; s++) {
                for (let h = 0; h < 2; h++) {
                    const bag = MeshBuilder.CreateBox("sandbagWall", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    bag.position = new Vector3(
                        wx + Math.cos(wallAngle) * s * 1.3,
                        h * 0.4 + 0.2,
                        wz + Math.sin(wallAngle) * s * 1.3
                    );
                    bag.rotation.y = wallAngle;
                    bag.material = this.getMat("sand");
                    bag.parent = chunkParent;
                    bag.freezeWorldMatrix();
                }
            }
        }

        // Антенны связи (3-5 штук)
        const antennaCount = random.int(3, 5);
        for (let a = 0; a < antennaCount; a++) {
            const ax = random.range(5, size - 5);
            const az = random.range(5, size - 5);
            const aWorldX = chunkX * this.config.chunkSize + ax;
            const aWorldZ = chunkZ * this.config.chunkSize + az;
            if (this.isPositionInGarageArea(aWorldX, aWorldZ, 1)) continue;

            const antennaH = random.range(5, 12);
            const antenna = MeshBuilder.CreateBox("antenna", { width: 0.1, height: antennaH, depth: 0.1 }, this.scene);
            antenna.position = new Vector3(ax, antennaH / 2, az);
            antenna.material = this.getMat("metal");
            antenna.parent = chunkParent;
            antenna.freezeWorldMatrix();
        }
    }

    // === FRONTLINE (Передовая) MAP GENERATION ===

    // Размер арены передовой - использует централизованные константы из MapConstants.ts
    private get FRONTLINE_ARENA_SIZE(): number {
        return getMapSize("frontline");
    }
    private get FRONTLINE_WALL_HEIGHT(): number {
        return getWallHeight("frontline");
    }

    private generateFrontlineContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Земля военного типа (грязь)
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "wasteland", random, chunkParent);

        // Определяем границы карты
        const arenaHalf = this.FRONTLINE_ARENA_SIZE / 2;
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;

        // Генерируем периметр
        this.generateFrontlinePerimeter(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Определяем зону на основе позиции чанка
        const zoneType = this.getFrontlineZone(chunkCenterX);

        switch (zoneType) {
            case "allied":
                // Западная сторона - база игрока
                this.generateFrontlineTrenches(chunkX, chunkZ, size, random, "allied", chunkParent);
                this.generateFrontlineBunkers(chunkX, chunkZ, size, random, "allied", chunkParent);
                break;
            case "nomansland":
                // Нейтральная полоса - опасная зона с множеством кратеров, окопов, укреплений
                this.generateFrontlineCraters(chunkX, chunkZ, size, random, chunkParent);
                this.generateFrontlineTrenches(chunkX, chunkZ, size, random, "neutral", chunkParent);
                this.generateFrontlineRuins(chunkX, chunkZ, size, random, chunkParent);
                this.generateFrontlineWire(chunkX, chunkZ, size, random, chunkParent);
                this.generateFrontlineWrecks(chunkX, chunkZ, size, random, chunkParent);
                // Все типы баррикад
                this.generateAllBarriers(chunkX, chunkZ, size, random, chunkParent);
                break;
            case "enemy":
                // Восточная сторона - вражеская база
                this.generateFrontlineTrenches(chunkX, chunkZ, size, random, "enemy", chunkParent);
                this.generateFrontlineBunkers(chunkX, chunkZ, size, random, "enemy", chunkParent);
                this.generateFrontlineBarricades(chunkX, chunkZ, size, random, chunkParent);
                break;
            case "outside":
                // За пределами арены - пустота
                break;
        }
    }

    private getFrontlineZone(x: number): "allied" | "nomansland" | "enemy" | "outside" {
        const arenaHalf = this.FRONTLINE_ARENA_SIZE / 2;

        // За пределами арены
        if (Math.abs(x) > arenaHalf) {
            return "outside";
        }

        // Зоны пропорциональны размеру арены (25% по краям, 50% в центре)
        const zoneWidth = arenaHalf * 0.5; // 25% от всей арены с каждой стороны

        // Западная сторона - союзники (25% карты)
        if (x < -zoneWidth) return "allied";
        // Восточная сторона - враги (25% карты)
        if (x > zoneWidth) return "enemy";
        // Нейтральная полоса (50% карты в центре)
        return "nomansland";
    }

    private generateFrontlinePerimeter(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, _random: SeededRandom, chunkParent: TransformNode): void {
        const arenaHalf = this.FRONTLINE_ARENA_SIZE / 2;
        const wallHeight = this.FRONTLINE_WALL_HEIGHT;
        const wallThickness = 3;

        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;

        // Северная стена (z = arenaHalf)
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                const wall = MeshBuilder.CreateBox("fwall_n", { width: wallLength, height: wallHeight, depth: wallThickness }, this.scene);
                wall.position = new Vector3(wallX, wallHeight / 2, arenaHalf - worldZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Южная стена (z = -arenaHalf)
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                const wall = MeshBuilder.CreateBox("fwall_s", { width: wallLength, height: wallHeight, depth: wallThickness }, this.scene);
                wall.position = new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Восточная стена (x = arenaHalf)
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                const wall = MeshBuilder.CreateBox("fwall_e", { width: wallThickness, height: wallHeight, depth: wallLength }, this.scene);
                wall.position = new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Западная стена (x = -arenaHalf)
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                const wall = MeshBuilder.CreateBox("fwall_w", { width: wallThickness, height: wallHeight, depth: wallLength }, this.scene);
                wall.position = new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ);
                wall.material = this.getMat("concrete");
                wall.parent = chunkParent;
                wall.freezeWorldMatrix();
                // chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }

    private generateFrontlineTrenches(chunkX: number, chunkZ: number, size: number, random: SeededRandom, side: "allied" | "enemy" | "neutral", chunkParent: TransformNode): void {
        // Окопы - длинные траншеи с земляными валами
        // Увеличена плотность: 4-6 в allied/enemy, 6-10 в neutral
        const trenchCount = side === "neutral" ? random.int(6, 10) : random.int(4, 6);

        for (let i = 0; i < trenchCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) continue;

            const trenchLength = random.range(15, 30);
            const trenchWidth = 3;
            const trenchDepth = 1.5;

            // Сам окоп (углубление в земле - представлено низкими стенами по бокам)
            // Левый вал
            const leftWall = MeshBuilder.CreateBox("trench_l", { width: trenchLength, height: trenchDepth, depth: 0.8 }, this.scene);
            leftWall.position = new Vector3(x, trenchDepth / 2, z - trenchWidth / 2);
            leftWall.material = this.getMat("dirt");
            leftWall.parent = chunkParent;
            leftWall.freezeWorldMatrix();
            // chunk.meshes.push(leftWall);
            new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Правый вал
            const rightWall = MeshBuilder.CreateBox("trench_r", { width: trenchLength, height: trenchDepth, depth: 0.8 }, this.scene);
            rightWall.position = new Vector3(x, trenchDepth / 2, z + trenchWidth / 2);
            rightWall.material = this.getMat("dirt");
            rightWall.parent = chunkParent;
            rightWall.freezeWorldMatrix();
            // chunk.meshes.push(rightWall);
            new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Мешки с песком на валах
            if (random.chance(0.6)) {
                for (let bag = 0; bag < 3; bag++) {
                    const sandbag = MeshBuilder.CreateBox("sb", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    sandbag.position = new Vector3(
                        x - trenchLength / 2 + bag * 2 + random.range(-0.5, 0.5),
                        trenchDepth + 0.2,
                        z - trenchWidth / 2
                    );
                    sandbag.material = this.getMat("sand");
                    sandbag.parent = chunkParent;
                    sandbag.freezeWorldMatrix();
                    // chunk.meshes.push(sandbag);
                }
            }
        }
    }

    private generateFrontlineCraters(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Воронки от взрывов в нейтральной полосе - увеличено количество кратеров
        const craterCount = random.int(10, 18);

        for (let i = 0; i < craterCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) continue;

            const craterRadius = random.range(3, 8);
            const craterDepth = random.range(0.5, 1.5);

            // Воронка представлена как прямоугольные блоки вокруг центра (LOW POLY)
            const rimHeight = craterDepth * 0.5;
            const rimW = craterRadius * 0.4;
            // Создаём квадратный обод из 4 прямоугольных блоков
            // Север
            const rimN = MeshBuilder.CreateBox("crater_rim_n", { width: craterRadius * 2.2, height: rimHeight, depth: rimW }, this.scene);
            rimN.position = new Vector3(x, rimHeight / 2, z - craterRadius - rimW / 2);
            rimN.material = this.getMat("dirt");
            rimN.parent = chunkParent;
            rimN.freezeWorldMatrix();
            // chunk.meshes.push(rimN);
            // Юг
            const rimS = MeshBuilder.CreateBox("crater_rim_s", { width: craterRadius * 2.2, height: rimHeight, depth: rimW }, this.scene);
            rimS.position = new Vector3(x, rimHeight / 2, z + craterRadius + rimW / 2);
            rimS.material = this.getMat("dirt");
            rimS.parent = chunkParent;
            rimS.freezeWorldMatrix();
            // chunk.meshes.push(rimS);
            // Восток
            const rimE = MeshBuilder.CreateBox("crater_rim_e", { width: rimW, height: rimHeight, depth: craterRadius * 2.2 }, this.scene);
            rimE.position = new Vector3(x + craterRadius + rimW / 2, rimHeight / 2, z);
            rimE.material = this.getMat("dirt");
            rimE.parent = chunkParent;
            rimE.freezeWorldMatrix();
            // chunk.meshes.push(rimE);
            // Запад
            const rimWest = MeshBuilder.CreateBox("crater_rim_w", { width: rimW, height: rimHeight, depth: craterRadius * 2.2 }, this.scene);
            rimWest.position = new Vector3(x - craterRadius - rimW / 2, rimHeight / 2, z);
            rimWest.material = this.getMat("dirt");
            rimWest.parent = chunkParent;
            rimWest.freezeWorldMatrix();
            // chunk.meshes.push(rimWest);

            // Физика для обода воронки (box вместо cylinder)
            const rimPhysics = MeshBuilder.CreateBox("crater_phys", { width: craterRadius * 2.2, height: rimHeight, depth: craterRadius * 2.2 }, this.scene);
            rimPhysics.position = new Vector3(x, rimHeight / 2, z);
            rimPhysics.isVisible = false;
            rimPhysics.parent = chunkParent;
            // Не добавляем физику, чтобы танк мог проехать через воронку
            // chunk.meshes.push(rimPhysics);
        }
    }

    private generateFrontlineRuins(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Разрушенные здания - увеличена вероятность
        if (!random.chance(0.7)) return; // В большинстве чанков

        const x = random.range(15, size - 15);
        const z = random.range(15, size - 15);

        const worldX = chunkX * this.config.chunkSize + x;
        const worldZ = chunkZ * this.config.chunkSize + z;
        if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;

        const ruinW = random.range(8, 15);
        const ruinH = random.range(2, 5);
        const ruinD = random.range(8, 12);

        // Остатки стен (неполный прямоугольник)
        // Задняя стена
        const backWall = MeshBuilder.CreateBox("ruin_back", { width: ruinW, height: ruinH, depth: 0.5 }, this.scene);
        backWall.position = new Vector3(x, ruinH / 2, z - ruinD / 2);
        backWall.material = this.getMat("brick");
        backWall.parent = chunkParent;
        backWall.freezeWorldMatrix();
        // chunk.meshes.push(backWall);
        new PhysicsAggregate(backWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Левая стена (частичная)
        if (random.chance(0.7)) {
            const leftH = ruinH * random.range(0.4, 0.8);
            const leftWall = MeshBuilder.CreateBox("ruin_left", { width: 0.5, height: leftH, depth: ruinD * 0.7 }, this.scene);
            leftWall.position = new Vector3(x - ruinW / 2, leftH / 2, z);
            leftWall.material = this.getMat("brick");
            leftWall.parent = chunkParent;
            leftWall.freezeWorldMatrix();
            // chunk.meshes.push(leftWall);
            new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Правая стена (частичная)
        if (random.chance(0.5)) {
            const rightH = ruinH * random.range(0.3, 0.6);
            const rightWall = MeshBuilder.CreateBox("ruin_right", { width: 0.5, height: rightH, depth: ruinD * 0.5 }, this.scene);
            rightWall.position = new Vector3(x + ruinW / 2, rightH / 2, z + ruinD * 0.2);
            rightWall.material = this.getMat("brickDark");
            rightWall.parent = chunkParent;
            rightWall.freezeWorldMatrix();
            // chunk.meshes.push(rightWall);
            new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Обломки на земле
        const debrisCount = random.int(2, 5);
        for (let i = 0; i < debrisCount; i++) {
            const debrisX = x + random.range(-ruinW / 2, ruinW / 2);
            const debrisZ = z + random.range(-ruinD / 2, ruinD / 2);
            const debrisW = random.range(1, 3);
            const debrisH = random.range(0.3, 1);
            const debrisD = random.range(1, 3);

            const debris = MeshBuilder.CreateBox("debris", { width: debrisW, height: debrisH, depth: debrisD }, this.scene);
            debris.position = new Vector3(debrisX, debrisH / 2, debrisZ);
            debris.rotation.y = random.range(0, Math.PI);
            debris.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            debris.parent = chunkParent;
            debris.freezeWorldMatrix();
            // chunk.meshes.push(debris);
            new PhysicsAggregate(debris, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }

    private generateFrontlineBarricades(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Баррикады на вражеской стороне
        const barricadeCount = random.int(2, 5);

        for (let i = 0; i < barricadeCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            const barricadeType = random.int(0, 2);

            if (barricadeType === 0) {
                // Бетонные блоки
                const blockW = random.range(3, 6);
                const blockH = random.range(1.5, 2.5);
                const block = MeshBuilder.CreateBox("barricade", { width: blockW, height: blockH, depth: 1.5 }, this.scene);
                block.position = new Vector3(x, blockH / 2, z);
                block.rotation.y = random.range(-0.3, 0.3);
                block.material = this.getMat("concrete");
                block.parent = chunkParent;
                block.freezeWorldMatrix();
                // chunk.meshes.push(block);
                new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else if (barricadeType === 1) {
                // Противотанковые ежи
                const beamLength = 3;
                const beamThickness = 0.25;

                for (let j = 0; j < 3; j++) {
                    const beam = MeshBuilder.CreateBox("hedgehog", { width: beamThickness, height: beamLength, depth: beamThickness }, this.scene);
                    beam.position = new Vector3(x, beamLength / 2 * 0.7, z);
                    beam.rotation.x = Math.PI / 4;
                    beam.rotation.y = (j * Math.PI) / 3;
                    beam.material = this.getMat("metalRust");
                    beam.parent = chunkParent;
                    beam.freezeWorldMatrix();
                    // chunk.meshes.push(beam);
                }

                // Физика (LOW POLY - box)
                const hedgehogPhysics = MeshBuilder.CreateBox("hh_phys", { width: 2.5, height: 2.5, depth: 2.5 }, this.scene);
                hedgehogPhysics.position = new Vector3(x, 1.2, z);
                hedgehogPhysics.isVisible = false;
                hedgehogPhysics.parent = chunkParent;
                new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                // chunk.meshes.push(hedgehogPhysics);
            } else {
                // Мешки с песком
                for (let row = 0; row < 2; row++) {
                    for (let col = 0; col < 4; col++) {
                        const bag = MeshBuilder.CreateBox("sandbag", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                        bag.position = new Vector3(
                            x + col * 1.3 - 2,
                            row * 0.4 + 0.2,
                            z
                        );
                        bag.material = this.getMat("sand");
                        bag.parent = chunkParent;
                        bag.freezeWorldMatrix();
                        // chunk.meshes.push(bag);
                    }
                }

                // Физика для мешков
                const sbPhysics = MeshBuilder.CreateBox("sb_phys", { width: 5, height: 0.8, depth: 1 }, this.scene);
                sbPhysics.position = new Vector3(x, 0.4, z);
                sbPhysics.isVisible = false;
                sbPhysics.parent = chunkParent;
                new PhysicsAggregate(sbPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                // chunk.meshes.push(sbPhysics);
            }
        }
    }

    // Generate sandbag fortifications
    private generateFrontlineSandbags(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Sandbag piles and barriers in no man's land
        const sandbagCount = random.int(3, 7);

        for (let i = 0; i < sandbagCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;

            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            // Create sandbag pile
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    const bag = MeshBuilder.CreateBox("sandbag", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    bag.position = new Vector3(
                        x + (col - (3 - row - 1) / 2) * 1.2,
                        row * 0.4,
                        z + random.range(-0.5, 0.5)
                    );
                    bag.material = this.getMat("dirt");
                    bag.parent = chunkParent;
                    bag.freezeWorldMatrix();
                    // chunk.meshes.push(bag);
                }
            }
        }
    }

    private generateFrontlineBunkers(chunkX: number, chunkZ: number, size: number, random: SeededRandom, side: "allied" | "enemy", chunkParent: TransformNode): void {
        // Бункеры на позициях - несколько бункеров (1-2 на зону)
        const bunkerCount = random.int(1, 2);

        for (let i = 0; i < bunkerCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;

            const bunkerW = random.range(8, 14);
            const bunkerH = random.range(3, 5);
            const bunkerD = random.range(6, 10);

            const bunker = MeshBuilder.CreateBox("bunker", { width: bunkerW, height: bunkerH, depth: bunkerD }, this.scene);
            bunker.position = new Vector3(x, bunkerH / 2, z);
            bunker.material = this.getMat("concrete");
            bunker.parent = chunkParent;
            bunker.freezeWorldMatrix();
            // chunk.meshes.push(bunker);
            new PhysicsAggregate(bunker, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Амбразура
            const slitW = bunkerW * 0.5;
            const slit = MeshBuilder.CreateBox("slit", { width: slitW, height: 0.6, depth: 0.5 }, this.scene);
            // Амбразура направлена к центру карты (в сторону врага для союзников, в сторону союзников для врага)
            const slitZ = side === "allied" ? z + bunkerD / 2 : z - bunkerD / 2;
            slit.position = new Vector3(x, bunkerH - 0.6, slitZ);
            slit.material = this.getMat("black");
            slit.parent = chunkParent;
            slit.freezeWorldMatrix();
            // chunk.meshes.push(slit);
        }
    }

    private generateFrontlineWire(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Колючая проволока в нейтральной полосе
        const wireCount = random.int(2, 5);

        for (let i = 0; i < wireCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;

            const wireLength = random.range(8, 20);
            const wireHeight = 1.2;

            // Столбы
            for (let post = 0; post < 3; post++) {
                const postX = x - wireLength / 2 + post * wireLength / 2;
                const postMesh = MeshBuilder.CreateBox("wire_post", { width: 0.15, height: wireHeight + 0.3, depth: 0.15 }, this.scene);
                postMesh.position = new Vector3(postX, (wireHeight + 0.3) / 2, z);
                postMesh.material = this.getMat("metalRust");
                postMesh.parent = chunkParent;
                postMesh.freezeWorldMatrix();
                // chunk.meshes.push(postMesh);
            }

            // Проволока (несколько горизонтальных линий)
            for (let line = 0; line < 3; line++) {
                const lineY = 0.3 + line * 0.4;
                const wireMesh = MeshBuilder.CreateBox("wire", { width: wireLength, height: 0.05, depth: 0.05 }, this.scene);
                wireMesh.position = new Vector3(x, lineY, z);
                wireMesh.material = this.getMat("dirt");
                wireMesh.parent = chunkParent;
                wireMesh.freezeWorldMatrix();
                // chunk.meshes.push(wireMesh);
            }

            // Физика - невидимый барьер (замедляет танк)
            const wirePhysics = MeshBuilder.CreateBox("wire_phys", { width: wireLength, height: wireHeight, depth: 0.5 }, this.scene);
            wirePhysics.position = new Vector3(x, wireHeight / 2, z);
            wirePhysics.isVisible = false;
            wirePhysics.parent = chunkParent;
            new PhysicsAggregate(wirePhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            // chunk.meshes.push(wirePhysics);
        }
    }

    private generateFrontlineWrecks(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Подбитая техника (декорации) - увеличено количество обломков (3-6 на чанк)
        const wreckCount = random.int(3, 6);

        for (let i = 0; i < wreckCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);

            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) return;

            // Подбитый танк (силуэт)
            // Корпус
            const hullW = random.range(4, 6);
            const hullH = random.range(1.5, 2.5);
            const hullD = random.range(6, 9);

            const hull = MeshBuilder.CreateBox("wreck_hull", { width: hullW, height: hullH, depth: hullD }, this.scene);
            hull.position = new Vector3(x, hullH / 2, z);
            hull.rotation.y = random.range(0, Math.PI * 2);
            hull.material = this.getMat("wreck");
            hull.parent = chunkParent;
            hull.freezeWorldMatrix();
            // chunk.meshes.push(hull);
            new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Башня (может быть сбита)
            if (random.chance(0.6)) {
                const turretSize = hullW * 0.6;
                const turret = MeshBuilder.CreateBox("wreck_turret", { width: turretSize, height: turretSize * 0.7, depth: turretSize }, this.scene);

                if (random.chance(0.4)) {
                    // Башня сбита - лежит рядом
                    turret.position = new Vector3(x + random.range(-3, 3), turretSize * 0.35, z + random.range(-3, 3));
                    turret.rotation.x = random.range(-0.5, 0.5);
                    turret.rotation.z = random.range(-0.5, 0.5);
                } else {
                    // Башня на месте
                    turret.position = new Vector3(x, hullH + turretSize * 0.35, z);
                }
                turret.rotation.y = random.range(0, Math.PI * 2);
                turret.material = wreckMat;
                turret.parent = chunkParent;
                turret.freezeWorldMatrix();
                // chunk.meshes.push(turret);
            }

            // Дым / огонь (простой визуальный эффект - вертикальный столб)
            if (random.chance(0.3)) {
                const smoke = MeshBuilder.CreateCylinder("smoke", { diameter: 1.5, height: 4 }, this.scene);
                smoke.position = new Vector3(x, hullH + 2, z);
                smoke.material = this.getMat("smokeGray");
                smoke.parent = chunkParent;
                smoke.freezeWorldMatrix();
                // chunk.meshes.push(smoke);
            }
        }
    }

    private generateAllBarriers(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Все типы баррикад: мешки с песком, проволока, баррикады
        // Мешки с песком
        this.generateFrontlineSandbags(chunkX, chunkZ, size, random, chunkParent);

        // Проволока
        this.generateFrontlineWire(chunkX, chunkZ, size, random, chunkParent);

        // Баррикады
        this.generateFrontlineBarricades(chunkX, chunkZ, size, random, chunkParent);

        // Артиллерийские позиции (2-4 штуки)
        this.generateFrontlineArtillery(chunkX, chunkZ, size, random, chunkParent);

        // Блиндажи (1-3 штуки)
        this.generateFrontlineDugouts(chunkX, chunkZ, size, random, chunkParent);

        // Воронки с водой (затопленные)
        this.generateFrontlineWaterCraters(chunkX, chunkZ, size, random, chunkParent);
    }

    private generateFrontlineArtillery(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const artilleryCount = random.int(2, 4);
        for (let i = 0; i < artilleryCount; i++) {
            const ax = random.range(15, size - 15);
            const az = random.range(15, size - 15);
            const aWorldX = chunkX * this.config.chunkSize + ax;
            const aWorldZ = chunkZ * this.config.chunkSize + az;
            if (this.isPositionInGarageArea(aWorldX, aWorldZ, 5)) continue;

            // Основание орудия
            const base = MeshBuilder.CreateBox("artilleryBase", { width: 3, height: 0.5, depth: 4 }, this.scene);
            base.position = new Vector3(ax, 0.25, az);
            base.rotation.y = random.range(0, Math.PI * 2);
            base.material = this.getMat("metalRust");
            base.parent = chunkParent;
            base.freezeWorldMatrix();
            new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Ствол орудия
            const barrel = MeshBuilder.CreateBox("artilleryBarrel", { width: 0.4, height: 0.4, depth: 4 }, this.scene);
            barrel.position = new Vector3(ax, 1.2, az + 2);
            barrel.rotation.x = -0.2;
            barrel.material = this.getMat("metal");
            barrel.parent = chunkParent;
            barrel.freezeWorldMatrix();

            // Щит
            const shield = MeshBuilder.CreateBox("artilleryShield", { width: 2.5, height: 1.5, depth: 0.1 }, this.scene);
            shield.position = new Vector3(ax, 1, az);
            shield.material = this.getMat("metalRust");
            shield.parent = chunkParent;
            shield.freezeWorldMatrix();

            // Ящики с боеприпасами рядом
            const crateCount = random.int(2, 5);
            for (let c = 0; c < crateCount; c++) {
                const crate = MeshBuilder.CreateBox("ammoCrate", { width: 0.8, height: 0.5, depth: 0.6 }, this.scene);
                crate.position = new Vector3(ax + random.range(-2, 2), 0.25, az + random.range(-2, 2));
                crate.material = this.getMat("crateWood");
                crate.parent = chunkParent;
                crate.freezeWorldMatrix();
            }
        }
    }

    private generateFrontlineDugouts(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const dugoutCount = random.int(1, 3);
        for (let i = 0; i < dugoutCount; i++) {
            const dx = random.range(15, size - 15);
            const dz = random.range(15, size - 15);
            const dWorldX = chunkX * this.config.chunkSize + dx;
            const dWorldZ = chunkZ * this.config.chunkSize + dz;
            if (this.isPositionInGarageArea(dWorldX, dWorldZ, 6)) continue;

            // Блиндаж - полузаглублённое укрытие
            const dugoutW = random.range(6, 10);
            const dugoutD = random.range(8, 12);

            // Крыша (бревенчатый накат)
            const roof = MeshBuilder.CreateBox("dugoutRoof", { width: dugoutW, height: 0.8, depth: dugoutD }, this.scene);
            roof.position = new Vector3(dx, 0.8, dz);
            roof.material = this.getMat("wood");
            roof.parent = chunkParent;
            roof.freezeWorldMatrix();
            new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Земляная насыпь вокруг
            const embankment = MeshBuilder.CreateBox("embankment", { width: dugoutW + 2, height: 1.2, depth: dugoutD + 2 }, this.scene);
            embankment.position = new Vector3(dx, 0.2, dz);
            embankment.material = this.getMat("dirt");
            embankment.parent = chunkParent;
            embankment.freezeWorldMatrix();

            // Вход
            const entrance = MeshBuilder.CreateBox("entrance", { width: 2, height: 1.5, depth: 1 }, this.scene);
            entrance.position = new Vector3(dx, 0.5, dz + dugoutD / 2 + 0.5);
            entrance.material = this.getMat("dirt");
            entrance.parent = chunkParent;
            entrance.freezeWorldMatrix();
        }
    }

    private generateFrontlineWaterCraters(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const waterCraterCount = random.int(2, 5);
        for (let i = 0; i < waterCraterCount; i++) {
            const cx = random.range(10, size - 10);
            const cz = random.range(10, size - 10);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 4)) continue;

            const radius = random.range(3, 6);

            // Затопленная воронка
            const water = MeshBuilder.CreateCylinder("waterCrater", { diameter: radius * 2, height: 0.1 }, this.scene);
            water.position = new Vector3(cx, -0.3, cz);
            water.material = this.getMat("water");
            water.parent = chunkParent;
            water.freezeWorldMatrix();

            // Грязевые края
            for (let e = 0; e < 6; e++) {
                const angle = (e / 6) * Math.PI * 2;
                const mud = MeshBuilder.CreateBox("mud", { width: 1.5, height: 0.4, depth: 1.5 }, this.scene);
                mud.position = new Vector3(
                    cx + Math.cos(angle) * (radius - 0.5),
                    0.1,
                    cz + Math.sin(angle) * (radius - 0.5)
                );
                mud.material = this.getMat("dirt");
                mud.parent = chunkParent;
                mud.freezeWorldMatrix();
            }
        }
    }

    // === BUILDING CREATORS ===





    // removed unused helpers (tree/bench/streetlight/house/apartment)

    // Generic scattered props with varied forms/sizes (avoid z-fighting via Y offsets)
    private _addScatteredProps(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(2, 5); // больше пропсов
        for (let i = 0; i < count; i++) {
            const kind = random.int(0, 4);
            let x = random.range(6, size - 6);
            let z = random.range(6, size - 6);

            // КРИТИЧЕСКИ ВАЖНО: Пропускаем позиции внутри гаражей
            // Получаем мировые координаты
            const worldX = chunkX * this.config.chunkSize + x;
            const worldZ = chunkZ * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 1)) {
                continue; // Пропускаем эту позицию
            }

            if (kind === 0) {
                // Crate
                const w = random.range(1.5, 3);
                const h = random.range(1, 2.5);
                const d = random.range(1.5, 3);
                const box = MeshBuilder.CreateBox("crate", { width: w, height: h, depth: d }, this.scene);
                box.position = new Vector3(x, h / 2 + 0.01, z);
                box.material = this.getMat(random.pick(["wood", "metal", "brickDark"]));
                box.parent = chunkParent;
                box.freezeWorldMatrix();
                // chunk.meshes.push(box);
            } else if (kind === 1) {
                // Ramp (flattened box)
                const ramp = MeshBuilder.CreateBox("ramp", { width: 4, height: 0.5, depth: 3 }, this.scene);
                ramp.position = new Vector3(x, 0.26, z);
                ramp.rotation.y = random.range(0, Math.PI * 2);
                ramp.material = this.getMat(random.pick(["asphalt", "concrete", "metal"]));
                ramp.parent = chunkParent;
                ramp.freezeWorldMatrix();
                // chunk.meshes.push(ramp);
            } else if (kind === 2) {
                // Pole / pillar
                const h = random.range(2, 5);
                const pole = MeshBuilder.CreateBox("pole", { width: 0.4, height: h, depth: 0.4 }, this.scene);
                pole.position = new Vector3(x, h / 2 + 0.01, z);
                pole.material = this.getMat(random.pick(["metal", "yellow", "brick"]));
                pole.parent = chunkParent;
                pole.freezeWorldMatrix();
                // chunk.meshes.push(pole);
            } else {
                // Fence segment
                const fenceLen = random.range(6, 14);
                const fence = MeshBuilder.CreateBox("fence", { width: fenceLen, height: 1.4, depth: 0.2 }, this.scene);
                fence.position = new Vector3(x, 0.7, z);
                fence.rotation.y = random.pick([0, Math.PI / 2]);
                fence.material = this.getMat(random.pick(["wood", "metal", "concrete"]));
                fence.parent = chunkParent;
                fence.freezeWorldMatrix();
                // chunk.meshes.push(fence);
            }
        }
    }

    // Legacy BLOCKY terrain generator (kept for reference; not used after heightmap switch)
    // eslint-disable-next-line @typescript-eslint/no-unused-private-class-members
    private _createTerrainFromNoise(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, biome: BiomeType, random: SeededRandom, chunkParent: TransformNode): void {
        if (!this.terrainGenerator) return;

        // Use grid for blocky terrain (voxel-style)
        const gridSize = 8; // Grid for block-based terrain
        const cellSize = size / gridSize;

        // Sample heights at grid points - HEIGHTS ARE ALREADY QUANTIZED in terrainGenerator
        const heights: number[][] = [];
        for (let gx = 0; gx <= gridSize; gx++) {
            heights[gx] = [];
            for (let gz = 0; gz <= gridSize; gz++) {
                const sampleX = worldX + gx * cellSize;
                const sampleZ = worldZ + gz * cellSize;
                const heightsRow = heights[gx];
                if (heightsRow) {
                    heightsRow[gz] = this.terrainGenerator.getHeight(sampleX, sampleZ, biome);
                }
            }
        }

        // Create blocky terrain mesh - each cell is a rectangular block
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gz = 0; gz < gridSize; gz++) {
                const localX = gx * cellSize + cellSize / 2;
                const localZ = gz * cellSize + cellSize / 2;

                // Get heights at cell corners (for stepped/blended blocks)
                const h00 = heights[gx]?.[gz] ?? 0;
                const h10 = heights[gx + 1]?.[gz] ?? 0;
                const h01 = heights[gx]?.[gz + 1] ?? 0;
                const h11 = heights[gx + 1]?.[gz + 1] ?? 0;

                // Use average height for this cell (or use stepped approach)
                const avgHeight = (h00 + h10 + h01 + h11) / 4;
                const finalHeight = avgHeight;

                // Create blocky terrain - only rectangular blocks (LOW POLY style)
                // Only create blocks for significant height differences
                if (Math.abs(finalHeight) > 0.5) {
                    // Create rectangular block based on height
                    const blockSize = cellSize * 0.95; // Slightly smaller to avoid z-fighting
                    const blockHeight = Math.max(Math.abs(finalHeight), 0.5);

                    if (finalHeight > 0.5) {
                        // Hill/raised terrain - rectangular block
                        const hillBlock = MeshBuilder.CreateBox(`terrainHill_${gx}_${gz}`, {
                            width: blockSize,
                            height: blockHeight,
                            depth: blockSize
                        }, this.scene);

                        hillBlock.position = new Vector3(localX, blockHeight / 2, localZ);

                        // Material based on biome
                        let matName = "dirt";
                        if (biome === "park" || biome === "residential") matName = random.chance(0.7) ? "grass" : "grassDark";
                        else if (biome === "military") matName = "sand";
                        else if (biome === "wasteland") matName = random.chance(0.5) ? "gravel" : "dirt";
                        else if (biome === "city" || biome === "industrial") matName = "concrete";

                        // Используем материал с модификацией по высоте
                        hillBlock.material = this.getHeightTintedMaterial(matName, blockHeight);
                        hillBlock.parent = chunkParent;

                        // Рендеринг рёбер (опционально)
                        if (this.config.enableTerrainEdges) {
                            hillBlock.enableEdgesRendering();
                            const edgeColor = this.getContrastEdgeColor(matName);
                            const edgesRenderer = (hillBlock as any)._edgesRenderer;
                            if (edgesRenderer) {
                                edgesRenderer.edgesWidth = 1.0;
                                edgesRenderer.edgesColor = edgeColor;
                            }
                        }

                        this.optimizeMesh(hillBlock);
                        // chunk.meshes.push(hillBlock);

                        // Add physics for significant blocks
                        if (blockHeight > 1.5) {
                            new PhysicsAggregate(hillBlock, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                        }
                    } else if (finalHeight < -0.5) {
                        // Depression/valley - create hollow rectangular block
                        const depDepth = Math.min(Math.abs(finalHeight), 15);
                        const depBlock = MeshBuilder.CreateBox(`terrainDep_${gx}_${gz}`, {
                            width: blockSize,
                            height: depDepth,
                            depth: blockSize
                        }, this.scene);

                        depBlock.position = new Vector3(localX, -depDepth / 2, localZ);

                        // Material based on biome
                        let matName = "dirt";
                        if (biome === "park") matName = "grassDark";
                        else if (biome === "wasteland") matName = random.chance(0.6) ? "gravel" : "dirt";

                        // Используем материал с модификацией по высоте (учитываем отрицательную высоту)
                        depBlock.material = this.getHeightTintedMaterial(matName, -depDepth);
                        depBlock.parent = chunkParent;

                        // Рендеринг рёбер (опционально)
                        if (this.config.enableTerrainEdges) {
                            depBlock.enableEdgesRendering();
                            const edgeColor = this.getContrastEdgeColor(matName);
                            const edgesRenderer = (depBlock as any)._edgesRenderer;
                            if (edgesRenderer) {
                                edgesRenderer.edgesWidth = 1.0;
                                edgesRenderer.edgesColor = edgeColor;
                            }
                        }

                        this.optimizeMesh(depBlock);
                        // chunk.meshes.push(depBlock);
                    }
                }
            }
        }
    }

    // Extra terrain features for uniqueness (lightweight) - УЛУЧШЕННАЯ ГЕНЕРАЦИЯ!
    private addTerrainFeatures(chunkX: number, chunkZ: number, size: number, random: SeededRandom, biome: BiomeType, chunkParent: TransformNode): void {
        const features = random.int(2, 5); // Уменьшено с 3-7 до 2-5 для оптимизации
        const worldX = chunkX * size;
        const worldZ = chunkZ * size;

        for (let i = 0; i < features; i++) {
            const kind = random.int(0, 15); // МНОГО больше типов фич!
            let x = random.range(8, size - 8);
            let z = random.range(8, size - 8);

            // ИСПРАВЛЕНИЕ: Проверка на важные объекты перед генерацией terrain features
            const worldX_pos = worldX + x;
            const worldZ_pos = worldZ + z;

            // КРИТИЧНО: УВЕЛИЧЕННЫЙ радиус исключения для гаражей (30 единиц для полной защиты)
            if (this.isPositionInGarageArea(worldX_pos, worldZ_pos, 30)) {
                continue; // Пропускаем генерацию terrain feature на этом месте
            }

            // Проверка на POI (заправки, склады и т.д.) - расширенный радиус 20 единиц
            if (this.poiSystem && typeof (this.poiSystem as any).getAllPOIs === 'function') {
                const poiCheckRadius = 20;
                const allPOIs = (this.poiSystem as any).getAllPOIs();

                if (allPOIs && allPOIs.length > 0) {
                    let tooCloseToPOI = false;
                    for (const poi of allPOIs) {
                        if (poi && poi.worldPosition) {
                            const dist = Math.sqrt(
                                Math.pow(worldX_pos - poi.worldPosition.x, 2) +
                                Math.pow(worldZ_pos - poi.worldPosition.z, 2)
                            );
                            if (dist < poiCheckRadius) {
                                tooCloseToPOI = true;
                                break;
                            }
                        }
                    }

                    if (tooCloseToPOI) {
                        continue; // Пропускаем генерацию terrain feature рядом с POI
                    }
                }
            }
            if (kind === 0) {
                // Small natural hill - rectangular block (LOW POLY)
                const h = random.range(1, 3);
                const w = random.range(3, 7.5);
                const d = random.range(3, 7.5);
                const hill = MeshBuilder.CreateBox("hill", {
                    width: w,
                    height: h,
                    depth: d
                }, this.scene);

                hill.position = new Vector3(x, h / 2 + 0.01, z);
                hill.material = this.getMat(biome === "residential" || biome === "park" ? "grass" : "dirt");
                hill.parent = chunkParent;
                hill.freezeWorldMatrix();
                // chunk.meshes.push(hill);
            } else if (kind === 1) {
                // БОЛЬШАЯ ГОРА - высокий холм прямоугольной формы (LOW POLY)
                const h = random.range(4, 8);
                const w = random.range(6, 12.5);
                const d = random.range(6, 12.5);
                const mountain = MeshBuilder.CreateBox("mountain", {
                    width: w,
                    height: h,
                    depth: d
                }, this.scene);

                mountain.position = new Vector3(x, h / 2 + 0.01, z);
                mountain.material = this.getMat("dirt");
                mountain.parent = chunkParent;
                mountain.freezeWorldMatrix();
                // chunk.meshes.push(mountain);
            } else if (kind === 2) {
                // Natural crater - rectangular depression with rectangular rim blocks (LOW POLY)
                const craterW = random.range(4, 7);
                const craterD = random.range(4, 7);
                const craterDepth = random.range(0.8, 2.5);
                const crater = MeshBuilder.CreateBox("crater", {
                    width: craterW,
                    height: craterDepth,
                    depth: craterD
                }, this.scene);

                crater.position = new Vector3(x, -craterDepth / 2 - 0.01, z);
                crater.material = this.getMat("dirt");
                crater.parent = chunkParent;
                crater.freezeWorldMatrix();
                // chunk.meshes.push(crater);

                // Rectangular rim blocks around crater
                const rimHeight = random.range(0.6, 1.2);
                const rimW = craterW * 0.3;
                const rimD = craterD * 0.3;

                // North rim
                const rimN = MeshBuilder.CreateBox("rim_n", { width: craterW * 1.4, height: rimHeight, depth: rimW }, this.scene);
                rimN.position = new Vector3(x, rimHeight / 2 + 0.01, z - craterD / 2 - rimW / 2);
                rimN.material = this.getMat("dirt");
                rimN.parent = chunkParent;
                rimN.freezeWorldMatrix();
                // chunk.meshes.push(rimN);

                // South rim
                const rimS = MeshBuilder.CreateBox("rim_s", { width: craterW * 1.4, height: rimHeight, depth: rimW }, this.scene);
                rimS.position = new Vector3(x, rimHeight / 2 + 0.01, z + craterD / 2 + rimW / 2);
                rimS.material = this.getMat("dirt");
                rimS.parent = chunkParent;
                rimS.freezeWorldMatrix();
                // chunk.meshes.push(rimS);

                // East rim
                const rimE = MeshBuilder.CreateBox("rim_e", { width: rimD, height: rimHeight, depth: craterD * 1.4 }, this.scene);
                rimE.position = new Vector3(x + craterW / 2 + rimD / 2, rimHeight / 2 + 0.01, z);
                rimE.material = this.getMat("dirt");
                rimE.parent = chunkParent;
                rimE.freezeWorldMatrix();
                // chunk.meshes.push(rimE);

                // West rim
                const rimWest = MeshBuilder.CreateBox("rim_w", { width: rimD, height: rimHeight, depth: craterD * 1.4 }, this.scene);
                rimWest.position = new Vector3(x - craterW / 2 - rimD / 2, rimHeight / 2 + 0.01, z);
                rimWest.material = this.getMat("dirt");
                rimWest.parent = chunkParent;
                rimWest.freezeWorldMatrix();
                // chunk.meshes.push(rimWest);
            } else if (kind === 3) {
                // Lake - РАЗНООБРАЗНЫЕ размеры и формы
                const lakeType = random.int(0, 2);
                if (lakeType === 0) {
                    // Большое озеро
                    const w = random.range(15, 25);
                    const d = random.range(12, 20);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                } else if (lakeType === 1) {
                    // Маленькое озеро
                    const w = random.range(6, 12);
                    const d = random.range(6, 12);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                } else {
                    // Длинное озеро (как река но шире)
                    const w = random.range(8, 14);
                    const d = random.range(20, 35);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.rotation.y = random.pick([0, Math.PI / 2]);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                }
            } else if (kind === 4) {
                // River slice - РАЗНООБРАЗНЫЕ реки
                const riverType = random.int(0, 3);
                if (riverType === 0) {
                    // Горизонтальная река
                    const riverW = random.range(4, 8);
                    const river = MeshBuilder.CreateBox("river", { width: size, height: 0.01, depth: riverW }, this.scene);
                    river.position = new Vector3(size / 2, -0.02, z);
                    river.material = this.getMat("glass");
                    river.parent = chunkParent;
                    river.freezeWorldMatrix();
                    // chunk.meshes.push(river);
                } else if (riverType === 1) {
                    // Вертикальная река
                    const riverW = random.range(4, 8);
                    const river = MeshBuilder.CreateBox("river", { width: riverW, height: 0.01, depth: size }, this.scene);
                    river.position = new Vector3(x, -0.02, size / 2);
                    river.material = this.getMat("glass");
                    river.parent = chunkParent;
                    river.freezeWorldMatrix();
                    // chunk.meshes.push(river);
                } else {
                    // Диагональная река (L-образная)
                    const riverW = random.range(4, 7);
                    const hRiver = MeshBuilder.CreateBox("river", { width: size / 2, height: 0.01, depth: riverW }, this.scene);
                    hRiver.position = new Vector3(size * 0.75, -0.02, z);
                    hRiver.material = this.getMat("glass");
                    hRiver.parent = chunkParent;
                    hRiver.freezeWorldMatrix();
                    // chunk.meshes.push(hRiver);

                    const vRiver = MeshBuilder.CreateBox("river2", { width: riverW, height: 0.01, depth: size / 2 }, this.scene);
                    vRiver.position = new Vector3(x, -0.02, size * 0.75);
                    vRiver.material = this.getMat("glass");
                    vRiver.parent = chunkParent;
                    vRiver.freezeWorldMatrix();
                    // chunk.meshes.push(vRiver);
                }
            } else if (kind === 5) {
                // Elevated platform - РАЗНООБРАЗНЫЕ размеры
                const h = random.range(1, 2);
                const plat = MeshBuilder.CreateBox("platform", { width: 10, height: h, depth: 10 }, this.scene);
                plat.position = new Vector3(x, h / 2 + 0.01, z);
                plat.material = this.getMat("concrete");
                plat.parent = chunkParent;
                plat.freezeWorldMatrix();
                // chunk.meshes.push(plat);
            } else if (kind === 6) {
                // МОСТЫ - РАЗНООБРАЗНЫЕ типы и размеры
                const bridgeType = random.int(0, 3);
                if (bridgeType === 0) {
                    // Маленький мост
                    const br = MeshBuilder.CreateBox("bridge", { width: 8, height: 0.8, depth: 3 }, this.scene);
                    br.position = new Vector3(x, 1.5, z);
                    br.material = this.getMat("concrete");
                    br.parent = chunkParent;
                    br.freezeWorldMatrix();
                    // chunk.meshes.push(br);
                    new PhysicsAggregate(br, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else if (bridgeType === 1) {
                    // Большой мост с опорами
                    const brW = random.range(15, 25);
                    const brH = random.range(3, 6);
                    const brD = random.range(4, 8);
                    const br = MeshBuilder.CreateBox("bridge", { width: brW, height: 0.5, depth: brD }, this.scene);
                    br.position = new Vector3(x, brH + 0.25, z);
                    br.material = this.getMat("asphalt");
                    br.parent = chunkParent;
                    br.freezeWorldMatrix();
                    // chunk.meshes.push(br);
                    new PhysicsAggregate(br, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                    // Опоры моста
                    const supportCount = random.int(2, 4);
                    for (let s = 0; s < supportCount; s++) {
                        const support = MeshBuilder.CreateBox("bsup", { width: 1.5, height: brH, depth: 1.5 }, this.scene);
                        support.position = new Vector3(
                            x + random.range(-brW / 2 + 2, brW / 2 - 2),
                            brH / 2,
                            z + random.range(-brD / 2 + 2, brD / 2 - 2)
                        );
                        support.material = this.getMat("concrete");
                        support.parent = chunkParent;
                        support.freezeWorldMatrix();
                        // chunk.meshes.push(support);
                        new PhysicsAggregate(support, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    }
                } else {
                    // Длинный мост через реку
                    const brW = random.range(20, 35);
                    const brH = random.range(2, 4);
                    const brD = random.range(5, 10);
                    const br = MeshBuilder.CreateBox("bridge", { width: brW, height: 0.4, depth: brD }, this.scene);
                    br.position = new Vector3(x, brH + 0.2, z);
                    br.rotation.y = random.pick([0, Math.PI / 2]);
                    br.material = this.getMat("asphalt");
                    br.parent = chunkParent;
                    br.freezeWorldMatrix();
                    // chunk.meshes.push(br);
                    new PhysicsAggregate(br, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            } else if (kind === 7) {
                // ЗАБОРЫ - РАЗНООБРАЗНЫЕ типы
                const fenceType = random.int(0, 3);
                if (fenceType === 0) {
                    // Деревянный забор
                    const fenceLen = random.range(10, 20);
                    const fence = MeshBuilder.CreateBox("fence", { width: fenceLen, height: 1.8, depth: 0.2 }, this.scene);
                    fence.position = new Vector3(x, 0.9, z);
                    fence.rotation.y = random.pick([0, Math.PI / 2]);
                    fence.material = this.getMat("wood");
                    fence.parent = chunkParent;
                    fence.freezeWorldMatrix();
                    // chunk.meshes.push(fence);
                    new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else if (fenceType === 1) {
                    // Металлический забор
                    const fenceLen = random.range(12, 25);
                    const fence = MeshBuilder.CreateBox("fence", { width: fenceLen, height: 2.5, depth: 0.15 }, this.scene);
                    fence.position = new Vector3(x, 1.25, z);
                    fence.rotation.y = random.pick([0, Math.PI / 2]);
                    fence.material = this.getMat("metal");
                    fence.parent = chunkParent;
                    fence.freezeWorldMatrix();
                    // chunk.meshes.push(fence);
                    new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else {
                    // Бетонный забор/стена
                    const wallLen = random.range(8, 20);
                    const wallH = random.range(2, 4);
                    const wall = MeshBuilder.CreateBox("wall", { width: wallLen, height: wallH, depth: 0.5 }, this.scene);
                    wall.position = new Vector3(x, wallH / 2 + 0.01, z);
                    wall.rotation.y = random.pick([0, Math.PI / 2]);
                    wall.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
                    wall.parent = chunkParent;
                    wall.freezeWorldMatrix();
                    // chunk.meshes.push(wall);
                    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            } else if (kind === 8) {
                // ДОРОГИ - дополнительные типы
                const roadType = random.int(0, 2);
                if (roadType === 0) {
                    // Кривая дорога
                    const roadW = random.range(6, 10);
                    const roadLen = random.range(15, 25);
                    const road = MeshBuilder.CreateBox("road", { width: roadW, height: 0.02, depth: roadLen }, this.scene);
                    road.position = new Vector3(x, 0.02, z);
                    road.rotation.y = random.range(0, Math.PI * 2);
                    road.material = this.getMat("asphalt");
                    road.parent = chunkParent;
                    road.freezeWorldMatrix();
                    // chunk.meshes.push(road);
                } else if (roadType === 1) {
                    // Перекрёсток
                    const roadW = random.range(6, 9);
                    const hRoad = MeshBuilder.CreateBox("road", { width: size, height: 0.02, depth: roadW }, this.scene);
                    hRoad.position = new Vector3(size / 2, 0.02, z);
                    hRoad.material = this.getMat("asphalt");
                    hRoad.parent = chunkParent;
                    hRoad.freezeWorldMatrix();
                    // chunk.meshes.push(hRoad);

                    const vRoad = MeshBuilder.CreateBox("road2", { width: roadW, height: 0.02, depth: size }, this.scene);
                    vRoad.position = new Vector3(x, 0.02, size / 2);
                    vRoad.material = this.getMat("asphalt");
                    vRoad.parent = chunkParent;
                    vRoad.freezeWorldMatrix();
                    // chunk.meshes.push(vRoad);
                }
            } else if (kind === 9) {
                // ПРЕПЯТСТВИЯ - разнообразные
                const obstacleType = random.int(0, 4);
                if (obstacleType === 0) {
                    // Бетонные блоки
                    const blockCount = random.int(2, 5);
                    for (let b = 0; b < blockCount; b++) {
                        const block = MeshBuilder.CreateBox("block", { width: 1.5, height: 1, depth: 1.5 }, this.scene);
                        block.position = new Vector3(
                            x + random.range(-5, 5),
                            0.5 + 0.01,
                            z + random.range(-5, 5)
                        );
                        block.material = this.getMat("concrete");
                        block.parent = chunkParent;
                        block.freezeWorldMatrix();
                        // chunk.meshes.push(block);
                        new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    }
                } else if (obstacleType === 1) {
                    // Баррикады
                    const barrierCount = random.int(3, 6);
                    for (let b = 0; b < barrierCount; b++) {
                        const barrier = MeshBuilder.CreateBox("barrier", { width: 2.5, height: 1.2, depth: 1 }, this.scene);
                        barrier.position = new Vector3(
                            x + random.range(-8, 8),
                            0.6 + 0.01,
                            z + random.range(-8, 8)
                        );
                        barrier.rotation.y = random.range(0, Math.PI);
                        barrier.material = this.getMat("concrete");
                        barrier.parent = chunkParent;
                        barrier.freezeWorldMatrix();
                        // chunk.meshes.push(barrier);
                        new PhysicsAggregate(barrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    }
                } else if (obstacleType === 2) {
                    // Камни/валуны
                    const rockCount = random.int(2, 4);
                    for (let r = 0; r < rockCount; r++) {
                        const rockSize = random.range(1.5, 3);
                        const rock = MeshBuilder.CreateBox("rock", { width: rockSize, height: rockSize * 0.8, depth: rockSize }, this.scene);
                        rock.position = new Vector3(
                            x + random.range(-6, 6),
                            rockSize * 0.4 + 0.01,
                            z + random.range(-6, 6)
                        );
                        rock.rotation.y = random.range(0, Math.PI * 2);
                        rock.material = this.getMat("gravel");
                        rock.parent = chunkParent;
                        rock.freezeWorldMatrix();
                        // chunk.meshes.push(rock);
                        // Убрана физика для декоративных камней (оптимизация)
                    }
                } else if (obstacleType === 3) {
                    // Столбы/столбики
                    const poleCount = random.int(3, 6);
                    for (let p = 0; p < poleCount; p++) {
                        const poleH = random.range(2, 4);
                        const pole = MeshBuilder.CreateBox("pole", { width: 0.5, height: poleH, depth: 0.5 }, this.scene);
                        pole.position = new Vector3(
                            x + random.range(-7, 7),
                            poleH / 2 + 0.01,
                            z + random.range(-7, 7)
                        );
                        pole.material = this.getMat(random.pick(["metal", "concrete", "wood"]));
                        pole.parent = chunkParent;
                        pole.freezeWorldMatrix();
                        // chunk.meshes.push(pole);
                        // Убрана физика для декоративных столбов (оптимизация)
                    }
                } else {
                    // Разрушенные стены
                    const ruinCount = random.int(2, 4);
                    for (let ru = 0; ru < ruinCount; ru++) {
                        const ruinW = random.range(3, 8);
                        const ruinH = random.range(1, 3);
                        const ruin = MeshBuilder.CreateBox("ruin", { width: ruinW, height: ruinH, depth: 0.5 }, this.scene);
                        ruin.position = new Vector3(
                            x + random.range(-8, 8),
                            ruinH / 2 + 0.01,
                            z + random.range(-8, 8)
                        );
                        ruin.rotation.y = random.range(0, Math.PI * 2);
                        ruin.material = this.getMat(random.pick(["brick", "brickDark", "concrete"]));
                        ruin.parent = chunkParent;
                        ruin.freezeWorldMatrix();
                        // chunk.meshes.push(ruin);
                        // Убрана физика для декоративных руин (оптимизация)
                    }
                }
            } else if (kind === 10) {
                // УДАЛЕНО: Леса (оптимизация производительности)
            } else if (kind === 11) {
                // ДОПОЛНИТЕЛЬНЫЕ ЗДАНИЯ - маленькие структуры
                const structType = random.int(0, 3);
                if (structType === 0) {
                    // Маленький сарай
                    const shed = MeshBuilder.CreateBox("shed", { width: 4, height: 3, depth: 5 }, this.scene);
                    shed.position = new Vector3(x, 1.5, z);
                    shed.material = this.getMat("wood");
                    shed.parent = chunkParent;
                    shed.freezeWorldMatrix();
                    // chunk.meshes.push(shed);
                    // Убрана физика для декоративных сараев (оптимизация)
                } else if (structType === 1) {
                    // Башня/вышка
                    const towerH = random.range(8, 15);
                    const tower = MeshBuilder.CreateBox("tower", { width: 3, height: towerH, depth: 3 }, this.scene);
                    tower.position = new Vector3(x, towerH / 2, z);
                    tower.material = this.getMat(random.pick(["metal", "concrete", "brick"]));
                    tower.parent = chunkParent;
                    tower.freezeWorldMatrix();
                    // chunk.meshes.push(tower);
                    // Убрана физика для декоративных башен (оптимизация)
                } else {
                    // Небольшое здание
                    const buildingW = random.range(6, 12);
                    const buildingH = random.range(4, 8);
                    const buildingD = random.range(6, 12);
                    const building = MeshBuilder.CreateBox("building", { width: buildingW, height: buildingH, depth: buildingD }, this.scene);
                    building.position = new Vector3(x, buildingH / 2, z);
                    building.material = this.getMat(random.pick(["plaster", "brick", "concrete"]));
                    building.parent = chunkParent;
                    building.freezeWorldMatrix();
                    // chunk.meshes.push(building);
                    new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            } else if (kind === 12) {
                // РАЗНОУРОВНЕВЫЕ ПЛАТФОРМЫ
                const platformH = random.range(2, 5);
                const platformW = random.range(8, 18);
                const platformD = random.range(8, 18);
                const platform = MeshBuilder.CreateBox("platform", { width: platformW, height: platformH, depth: platformD }, this.scene);
                platform.position = new Vector3(x, platformH / 2 + 0.01, z);
                platform.material = this.getMat(random.pick(["concrete", "asphalt", "metal"]));
                platform.parent = chunkParent;
                platform.freezeWorldMatrix();
                // chunk.meshes.push(platform);
                new PhysicsAggregate(platform, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else if (kind === 13) {
                // РАЗНООБРАЗНЫЕ ОЗЁРА - больше типов
                const lakeSize = random.int(0, 4);
                if (lakeSize === 0) {
                    // Крошечное озеро
                    const w = random.range(4, 8);
                    const d = random.range(4, 8);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                } else if (lakeSize === 1) {
                    // Среднее озеро
                    const w = random.range(10, 18);
                    const d = random.range(10, 18);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                } else if (lakeSize === 2) {
                    // Большое озеро
                    const w = random.range(20, 30);
                    const d = random.range(18, 28);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                } else {
                    // Овальное озеро
                    const w = random.range(15, 25);
                    const d = random.range(8, 15);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.rotation.y = random.range(0, Math.PI);
                    lake.material = this.getMat("glass");
                    lake.parent = chunkParent;
                    lake.freezeWorldMatrix();
                    // chunk.meshes.push(lake);
                }
            } else if (kind === 14) {
                // РАЗНООБРАЗНЫЕ РЕКИ - больше типов
                const riverSize = random.int(0, 3);
                if (riverSize === 0) {
                    // Узкая река
                    const riverW = random.range(3, 6);
                    const river = MeshBuilder.CreateBox("river", { width: size, height: 0.01, depth: riverW }, this.scene);
                    river.position = new Vector3(size / 2, -0.02, z);
                    river.rotation.y = random.pick([0, Math.PI / 2]);
                    river.material = this.getMat("glass");
                    river.parent = chunkParent;
                    river.freezeWorldMatrix();
                    // chunk.meshes.push(river);
                } else if (riverSize === 1) {
                    // Широкая река
                    const riverW = random.range(8, 12);
                    const river = MeshBuilder.CreateBox("river", { width: size, height: 0.01, depth: riverW }, this.scene);
                    river.position = new Vector3(size / 2, -0.02, z);
                    river.rotation.y = random.pick([0, Math.PI / 2]);
                    river.material = this.getMat("glass");
                    river.parent = chunkParent;
                    river.freezeWorldMatrix();
                    // chunk.meshes.push(river);
                } else {
                    // Извилистая река (S-образная)
                    const riverW = random.range(5, 8);
                    const river1 = MeshBuilder.CreateBox("river", { width: size / 2, height: 0.01, depth: riverW }, this.scene);
                    river1.position = new Vector3(size * 0.25, -0.02, z);
                    river1.material = this.getMat("glass");
                    river1.parent = chunkParent;
                    river1.freezeWorldMatrix();
                    // chunk.meshes.push(river1);

                    const river2 = MeshBuilder.CreateBox("river2", { width: riverW, height: 0.01, depth: size / 2 }, this.scene);
                    river2.position = new Vector3(x, -0.02, size * 0.25);
                    river2.material = this.getMat("glass");
                    river2.parent = chunkParent;
                    river2.freezeWorldMatrix();
                    // chunk.meshes.push(river2);
                }
            } else {
                // Дополнительные холмы - разные формы
                const hillShape = random.int(0, 2);
                if (hillShape === 0) {
                    // Круглый холм
                    const h = random.range(2, 5);
                    const r = random.range(8, 15);
                    const hill = MeshBuilder.CreateBox("hill", { width: r, height: h, depth: r }, this.scene);
                    hill.position = new Vector3(x, h / 2 + 0.01, z);
                    hill.material = this.getMat(biome === "residential" || biome === "park" ? "grass" : "dirt");
                    hill.parent = chunkParent;
                    hill.freezeWorldMatrix();
                    // chunk.meshes.push(hill);
                    new PhysicsAggregate(hill, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else {
                    // Продолговатый холм
                    const h = random.range(2, 4);
                    const w = random.range(12, 20);
                    const d = random.range(6, 12);
                    // Natural hill using rectangular block (LOW POLY)
                    const hill = MeshBuilder.CreateBox("hill", {
                        width: w,
                        height: h,
                        depth: d
                    }, this.scene);
                    hill.position = new Vector3(x, h / 2 + 0.01, z);
                    hill.rotation.y = random.range(0, Math.PI);
                    hill.material = this.getMat(biome === "residential" || biome === "park" ? "grass" : "dirt");
                    hill.parent = chunkParent;
                    hill.freezeWorldMatrix();
                    // chunk.meshes.push(hill);
                    new PhysicsAggregate(hill, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            }
        }
    }

    private showChunk(chunk: ChunkData): void {
        chunk.node.setEnabled(true);
        // Принудительно показываем все дочерние меши
        const descendants = chunk.node.getDescendants(false);
        for (const child of descendants) {
            if (child instanceof Mesh && !child.isDisposed()) {
                child.isVisible = true;
            }
        }
        chunk.loaded = true;
    }

    private hideChunk(chunk: ChunkData): void {
        chunk.node.setEnabled(false);
        // ИСПРАВЛЕНИЕ: Принудительно скрываем все дочерние меши
        // setEnabled(false) может не работать для мешей с физикой
        const descendants = chunk.node.getDescendants(false);
        for (const child of descendants) {
            if (child instanceof Mesh && !child.isDisposed()) {
                child.isVisible = false;
            }
        }
        chunk.loaded = false;
    }

    private destroyChunk(key: string): void {
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // ОПТИМИЗАЦИЯ: Очищаем thin instances для этого чанка
        this.cleanupChunkInstances(chunk.x, chunk.z);

        // ИСПРАВЛЕНИЕ: Удаляем ВСЕ дочерние меши рекурсивно
        // chunk.meshes массив всегда пуст (все push закомментированы),
        // поэтому нужно удалять через getDescendants
        const descendants = chunk.node.getDescendants(false);
        for (const child of descendants) {
            if (child instanceof Mesh && !child.isDisposed()) {
                // КРИТИЧНО: Сначала освобождаем физику (PhysicsAggregate/PhysicsBody)
                // В Babylon.js v6 с Havok физическое тело хранится в mesh.physicsBody
                try {
                    const physicsBody = (child as any).physicsBody;
                    if (physicsBody && typeof physicsBody.dispose === 'function') {
                        physicsBody.dispose();
                    }
                } catch (e) {
                    // Игнорируем ошибки при удалении физики
                }
                
                // Удаляем меш, но НЕ удаляем материалы (они переиспользуются)
                child.dispose(false, false);
            }
        }

        // Теперь безопасно удаляем сам узел
        chunk.node.dispose();
        this.chunks.delete(key);
    }

    private updateStats(): void {
        let totalMeshes = 0, loadedChunks = 0;
        this.chunks.forEach(chunk => {
            if (chunk.loaded) { loadedChunks++; totalMeshes += chunk.meshes.length; }
        });
        this.stats.loadedChunks = loadedChunks;
        this.stats.totalMeshes = totalMeshes;
    }
    
    /**
     * ДИАГНОСТИКА: Логирование количества материалов и мешей для отладки утечек памяти
     * Вызывать периодически при отладке проблем с памятью
     */
    public logMemoryStats(): void {
        const materialCount = this.scene.materials.length;
        const meshCount = this.scene.meshes.length;
        const textureCount = this.scene.textures.length;
        const cachedMaterialCount = this.materials.size;
        
        console.log(`[ChunkSystem Memory] Materials: ${materialCount} (cached: ${cachedMaterialCount}), Meshes: ${meshCount}, Textures: ${textureCount}, Chunks: ${this.chunks.size}`);
    }

    /**
     * ОПТИМИЗАЦИЯ: Объединение статичных мешей в чанке для уменьшения draw calls
     * Объединяет меши с одинаковым материалом и без физики
     */
    private mergeStaticMeshesInChunk(chunkParent: TransformNode): void {
        try {
            // Собираем все статичные меши из чанка
            const staticMeshes: Mesh[] = [];
            const children = chunkParent.getChildren();

            for (const child of children) {
                if (child instanceof Mesh) {
                    const mesh = child as Mesh;
                    // Проверяем, что меш статичный (нет физики, не двигается)
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "dynamic" || meta.type === "garageDoor" || meta.type === "physics")) {
                        continue; // Пропускаем динамичные меши
                    }
                    // Пропускаем меши с физикой
                    if ((mesh as any).physicsBody || (mesh as any).physicsImpostor) {
                        continue;
                    }
                    // ИСПРАВЛЕНО: Принимаем любые меши без дочерних элементов
                    // Раньше проверяли isWorldMatrixFrozen, но это исключало ~80 мешей из merge
                    if (mesh.getChildren().length === 0) {
                        // Замораживаем матрицу если еще не заморожена
                        if (!mesh.isWorldMatrixFrozen) {
                            mesh.freezeWorldMatrix();
                        }
                        staticMeshes.push(mesh);
                    }
                }
            }

            if (staticMeshes.length < 2) return; // Нечего объединять

            // Группируем меши по материалу
            const meshesByMaterial = new Map<StandardMaterial | null, Mesh[]>();
            for (const mesh of staticMeshes) {
                const mat = mesh.material as StandardMaterial | null;
                if (!meshesByMaterial.has(mat)) {
                    meshesByMaterial.set(mat, []);
                }
                meshesByMaterial.get(mat)!.push(mesh);
            }

            // ОПТИМИЗАЦИЯ: Объединяем меши с одинаковым материалом
            // Увеличен размер батча с 50 до 200 для более агрессивного merge
            for (const [material, meshes] of meshesByMaterial) {
                if (meshes.length < 2) continue;

                // Разбиваем на батчи по 200 мешей (увеличено с 50)
                for (let i = 0; i < meshes.length; i += 200) {
                    const batch = meshes.slice(i, i + 200);
                    if (batch.length < 2) continue;

                    try {
                        // multiMaterial=false для уменьшения draw calls
                        // keepSubMeshes=true для сохранения структуры
                        const merged = Mesh.MergeMeshes(batch, true, true, undefined, false, true);
                        if (merged) {
                            merged.parent = chunkParent;
                            merged.material = material;
                            merged.freezeWorldMatrix();
                            merged.doNotSyncBoundingInfo = true;
                            merged.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
                            merged.isPickable = false;
                        }
                    } catch (e) {
                        // Если объединение не удалось, оставляем меши как есть
                        logger.debug(`[ChunkSystem] Failed to merge meshes: ${e}`);
                    }
                }
            }
        } catch (e) {
            logger.debug(`[ChunkSystem] Error merging static meshes: ${e}`);
        }
    }

    /**
     * ОПТИМИЗАЦИЯ: Принудительная выгрузка дальних чанков при нехватке памяти
     */
    private forceUnloadIfNeeded(playerCx: number, playerCz: number): void {
        const maxLoadedChunks = 25; // Максимум загруженных чанков
        let loadedCount = 0;
        const chunksByDistance: Array<{ key: string; dist: number }> = [];

        // Подсчитываем загруженные чанки и сортируем по расстоянию
        this.chunks.forEach((chunk, key) => {
            if (chunk.loaded) {
                loadedCount++;
                const dist = Math.max(Math.abs(chunk.x - playerCx), Math.abs(chunk.z - playerCz));
                chunksByDistance.push({ key, dist });
            }
        });

        // Если слишком много загруженных чанков, выгружаем дальние
        if (loadedCount > maxLoadedChunks) {
            chunksByDistance.sort((a, b) => b.dist - a.dist); // Сортируем по убыванию расстояния

            // Выгружаем самые дальние чанки
            const toUnload = loadedCount - maxLoadedChunks;
            for (let i = 0; i < toUnload && i < chunksByDistance.length; i++) {
                const chunk = this.chunks.get(chunksByDistance[i]!.key);
                if (chunk && chunk.loaded) {
                    this.hideChunk(chunk);
                }
            }
        }
    }

    getStats() {
        return { ...this.stats, totalChunksInMemory: this.chunks.size };
    }

    // Генерация гаражей для спавна
    private generateGarages(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Генерируем гаражи только в некоторых чанках (не слишком часто)
        // Вероятность появления гаража в чанке зависит от расстояния от центра
        const centerX = worldX + size / 2;
        const centerZ = worldZ + size / 2;
        const distanceFromCenter = Math.sqrt(centerX * centerX + centerZ * centerZ);

        // УЛУЧШЕНО: Гаражи появляются на расстоянии 10-500 от центра, с увеличенной вероятностью 45%
        // Минимальное расстояние уменьшено для гарантированного гаража рядом со стартом
        // Увеличена максимальная дистанция для большего разнообразия
        if (distanceFromCenter < 10 || distanceFromCenter > 500) return;
        if (!random.chance(0.45)) return; // УВЕЛИЧЕНА вероятность с 35% до 45%

        // Создаём гараж - ПУСТОЕ здание с проёмом (без ворот)
        // Размеры достаточные для танка (танк ~4x6 единиц)
        const garageWidth = random.range(14, 18);
        const garageHeight = random.range(7, 9);
        const garageDepth = random.range(18, 22);
        const wallThickness = 0.4;

        // Позиция гаража в чанке - стратегическое расположение
        // Пытаемся разместить возле POI или на перекрёстках дорог
        let gx: number = random.range(10, size - 10);
        let gz: number = random.range(10, size - 10);
        let worldGarageX: number = worldX + gx;
        let worldGarageZ: number = worldZ + gz;
        let strategicPlacement = false;

        // Проверяем близость к POI
        if (this.poiSystem) {
            const pois = this.poiSystem.getAllPOIs();
            for (const poi of pois) {
                const poiX = poi.worldPosition.x;
                const poiZ = poi.worldPosition.z;
                // Если POI в этом чанке
                if (poiX >= worldX && poiX < worldX + size && poiZ >= worldZ && poiZ < worldZ + size) {
                    if (random.chance(0.4)) { // 40% шанс разместить гараж возле POI
                        gx = poiX - worldX + random.range(-15, 15);
                        gz = poiZ - worldZ + random.range(-15, 15);
                        gx = Math.max(10, Math.min(size - 10, gx));
                        gz = Math.max(10, Math.min(size - 10, gz));
                        worldGarageX = worldX + gx;
                        worldGarageZ = worldZ + gz;
                        strategicPlacement = true;
                        break;
                    }
                }
            }
        }

        // Если не разместили возле POI, проверяем перекрёстки дорог
        if (!strategicPlacement && this.roadNetwork) {
            // Простая проверка: размещаем на краю чанка (где часто бывают дороги)
            if (random.chance(0.3)) {
                const edge = random.int(0, 4); // 0=top, 1=right, 2=bottom, 3=left
                if (edge === 0) { gx = random.range(10, size - 10); gz = size - 15; }
                else if (edge === 1) { gx = size - 15; gz = random.range(10, size - 10); }
                else if (edge === 2) { gx = random.range(10, size - 10); gz = 15; }
                else { gx = 15; gz = random.range(10, size - 10); }
                worldGarageX = worldX + gx;
                worldGarageZ = worldZ + gz;
                strategicPlacement = true;
            }
        }

        // Если не удалось стратегическое размещение, используем случайное
        if (!strategicPlacement) {
            gx = random.range(10, size - 10);
            gz = random.range(10, size - 10);
            worldGarageX = worldX + gx;
            worldGarageZ = worldZ + gz;
        }

        const garageMat = this.getMat(random.pick(["metal", "brick", "concrete", "brickDark"]));
        const roofMat = this.getMat(random.pick(["roof", "roofRed", "metalRust"]));

        // Задняя стена
        const backWall = MeshBuilder.CreateBox("garageBack", {
            width: garageWidth,
            height: garageHeight,
            depth: wallThickness
        }, this.scene);
        backWall.position = new Vector3(worldGarageX, garageHeight / 2, worldGarageZ + garageDepth / 2 - wallThickness / 2);
        backWall.material = garageMat;
        backWall.parent = chunkParent;
        backWall.freezeWorldMatrix();
        // chunk.meshes.push(backWall);
        new PhysicsAggregate(backWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Левая боковая стена
        const leftWall = MeshBuilder.CreateBox("garageLeft", {
            width: wallThickness,
            height: garageHeight,
            depth: garageDepth
        }, this.scene);
        leftWall.position = new Vector3(worldGarageX - garageWidth / 2 + wallThickness / 2, garageHeight / 2, worldGarageZ);
        leftWall.material = garageMat;
        leftWall.parent = chunkParent;
        leftWall.freezeWorldMatrix();
        // chunk.meshes.push(leftWall);
        new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Правая боковая стена
        const rightWall = MeshBuilder.CreateBox("garageRight", {
            width: wallThickness,
            height: garageHeight,
            depth: garageDepth
        }, this.scene);
        rightWall.position = new Vector3(worldGarageX + garageWidth / 2 - wallThickness / 2, garageHeight / 2, worldGarageZ);
        rightWall.material = garageMat;
        rightWall.parent = chunkParent;
        rightWall.freezeWorldMatrix();
        // chunk.meshes.push(rightWall);
        new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Передняя стена с проёмом (две части по бокам)
        const openingWidth = garageWidth * 0.7; // Ширина проёма 70% от ширины гаража
        const openingHeight = garageHeight * 0.85; // Высота проёма 85% от высоты гаража
        const sideWallWidth = (garageWidth - openingWidth) / 2;

        // Левая часть передней стены
        const frontLeft = MeshBuilder.CreateBox("garageFrontLeft", {
            width: sideWallWidth,
            height: garageHeight,
            depth: wallThickness
        }, this.scene);
        frontLeft.position = new Vector3(
            worldGarageX - openingWidth / 2 - sideWallWidth / 2,
            garageHeight / 2,
            worldGarageZ - garageDepth / 2 + wallThickness / 2
        );
        frontLeft.material = garageMat;
        frontLeft.parent = chunkParent;
        frontLeft.freezeWorldMatrix();
        // chunk.meshes.push(frontLeft);
        new PhysicsAggregate(frontLeft, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Правая часть передней стены
        const frontRight = MeshBuilder.CreateBox("garageFrontRight", {
            width: sideWallWidth,
            height: garageHeight,
            depth: wallThickness
        }, this.scene);
        frontRight.position = new Vector3(
            worldGarageX + openingWidth / 2 + sideWallWidth / 2,
            garageHeight / 2,
            worldGarageZ - garageDepth / 2 + wallThickness / 2
        );
        frontRight.material = garageMat;
        frontRight.parent = chunkParent;
        frontRight.freezeWorldMatrix();
        // chunk.meshes.push(frontRight);
        new PhysicsAggregate(frontRight, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Верхняя часть передней стены (над проёмом)
        const frontTop = MeshBuilder.CreateBox("garageFrontTop", {
            width: openingWidth,
            height: garageHeight - openingHeight,
            depth: wallThickness
        }, this.scene);
        frontTop.position = new Vector3(
            worldGarageX,
            garageHeight - (garageHeight - openingHeight) / 2,
            worldGarageZ - garageDepth / 2 + wallThickness / 2
        );
        frontTop.material = garageMat;
        frontTop.parent = chunkParent;
        frontTop.freezeWorldMatrix();
        // chunk.meshes.push(frontTop);
        new PhysicsAggregate(frontTop, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Крыша
        const roof = MeshBuilder.CreateBox("garageRoof", {
            width: garageWidth + 0.5,
            height: 0.3,
            depth: garageDepth + 0.5
        }, this.scene);
        roof.position = new Vector3(worldGarageX, garageHeight + 0.15, worldGarageZ);
        roof.material = roofMat;
        roof.parent = chunkParent;
        roof.freezeWorldMatrix();
        // chunk.meshes.push(roof);
        new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Пол гаража (для визуального эффекта)
        const floor = MeshBuilder.CreateBox("garageFloor", {
            width: garageWidth - wallThickness * 2,
            height: 0.1,
            depth: garageDepth - wallThickness * 2
        }, this.scene);
        floor.position = new Vector3(worldGarageX, 0.05, worldGarageZ);
        floor.material = this.getMat("concrete");
        floor.parent = chunkParent;
        floor.freezeWorldMatrix();
        // chunk.meshes.push(floor);

        // Прозрачный физический пол для предотвращения проваливания танка
        const collisionFloor = MeshBuilder.CreateBox("garageFloorCollision", {
            width: garageWidth - wallThickness * 2,
            height: 0.15,
            depth: garageDepth - wallThickness * 2
        }, this.scene);
        collisionFloor.position = new Vector3(worldGarageX, 0.075, worldGarageZ);
        collisionFloor.isVisible = false;
        collisionFloor.visibility = 0;
        collisionFloor.material = this.getMat("collision");
        collisionFloor.parent = chunkParent;
        collisionFloor.freezeWorldMatrix();
        // chunk.meshes.push(collisionFloor);
        new PhysicsAggregate(collisionFloor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // Сохраняем область гаража для исключения из генерации других объектов
        // КРИТИЧНО: Адаптивный запас - для специальных карт используем меньший запас
        const isSpecialMap = this.config.mapType === "polygon" || this.config.mapType === "frontline";
        const garageExclusionMargin = isSpecialMap ? 15 : 30; // Меньший запас для специальных карт
        const garageArea = {
            x: worldGarageX - garageWidth / 2 - garageExclusionMargin,
            z: worldGarageZ - garageDepth / 2 - garageExclusionMargin,
            width: garageWidth + garageExclusionMargin * 2, // Запас с обеих сторон
            depth: garageDepth + garageExclusionMargin * 2
        };
        this.garageAreas.push(garageArea);

        // Сохраняем позицию гаража для спавна (внутри гаража, по центру, ближе к задней стене)
        // Y = 1.5 чтобы танк спавнился на полу гаража
        const spawnPos = new Vector3(worldGarageX, 1.5, worldGarageZ + garageDepth * 0.2);
        this.garagePositions.push(spawnPos);

        // Garage created
    }

    // Проверить, не попадает ли позиция в область гаража
    isPositionInGarageArea(x: number, z: number, margin: number = 0): boolean {
        // КРИТИЧНО: Проверка позиции в области гаража
        // margin = 0 означает проверку точно внутри области гаража
        // margin > 0 расширяет область проверки на указанное расстояние
        // КРИТИЧНО: Не используем defaultMargin здесь, чтобы можно было точно контролировать проверку

        for (const area of this.garageAreas) {
            // Проверяем, находится ли точка внутри прямоугольной области гаража с учетом margin
            if (x >= area.x - margin && x <= area.x + area.width + margin &&
                z >= area.z - margin && z <= area.z + area.depth + margin) {
                return true;
            }
        }
        return false;
    }

    // Generate cover objects using CoverGenerator
    private generateCoverObjects(chunkX: number, chunkZ: number, _worldX: number, _worldZ: number, size: number, biome: BiomeType, chunkParent: TransformNode): void {
        if (!this.coverGenerator) return;

        const covers = this.coverGenerator.generateCoversForChunk(
            chunkX, chunkZ, size, biome, chunkParent, this.roadNetwork
        );

        for (const cover of covers) {
            // chunk.meshes.push(cover.mesh);
        }
    }

    // Generate POIs using POISystem
    private generatePOIs(chunkX: number, chunkZ: number, _worldX: number, _worldZ: number, size: number, biome: BiomeType, chunkParent: TransformNode): void {
        if (!this.poiSystem) return;

        const pois = this.poiSystem.generatePOIsForChunk(chunkX, chunkZ, size, biome, chunkParent);

        for (const poi of pois) {
            for (const mesh of poi.meshes) {
                // chunk.meshes.push(mesh);
            }
        }
    }

    // Get all POIs for external access
    public getAllPOIs(): POI[] {
        return this.poiSystem?.getAllPOIs() || [];
    }

    // Get POI system for direct access
    public getPOISystem(): POISystem | null {
        return this.poiSystem;
    }

    // === NEW MAP GENERATION METHODS ===

    // Generate Ruins map - half-destroyed war-torn city
    private generateRuinsContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "wasteland", random, chunkParent);
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Create roads first
        this.createRoads(chunkX, chunkZ, size, random, "city", chunkParent);

        // Generate ruined buildings - все типы зданий
        this.generateRuinsBuildings(chunkX, chunkZ, size, random, chunkParent);

        // Add rubble and debris - увеличено количество обломков (5-12 на чанк)
        for (let i = 0; i < random.int(5, 12); i++) {
            const rx = random.range(5, size - 5);
            const rz = random.range(5, size - 5);
            const rWorldX = chunkX * this.config.chunkSize + rx;
            const rWorldZ = chunkZ * this.config.chunkSize + rz;

            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 2)) continue;

            const rubble = MeshBuilder.CreateBox("rubble", { width: random.range(1, 4), height: random.range(0.5, 2), depth: random.range(1, 4) }, this.scene);
            rubble.position = new Vector3(rx, random.range(0.25, 1), rz);
            rubble.rotation.y = random.range(0, Math.PI * 2);
            rubble.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
            rubble.parent = chunkParent;
            rubble.freezeWorldMatrix();
            // chunk.meshes.push(rubble);
        }

        // Add wrecked vehicles - увеличено количество техники (2-5 на чанк)
        for (let i = 0; i < random.int(2, 5); i++) {
            const vx = random.range(10, size - 10);
            const vz = random.range(10, size - 10);
            const vWorldX = chunkX * this.config.chunkSize + vx;
            const vWorldZ = chunkZ * this.config.chunkSize + vz;

            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 3)) continue;
            if (this.isPositionNearRoad(vWorldX, vWorldZ, 2)) {
                this.createMilitaryVehicle(chunkX, chunkZ, vx, vz, random, random.pick(["tank", "truck"]), chunkParent);
            }
        }

        // НЕ добавляем кратеры - дороги должны быть целыми

        // Обгоревшие машины (3-6 штук)
        const burnedCarCount = random.int(3, 6);
        for (let i = 0; i < burnedCarCount; i++) {
            const cx = random.range(8, size - 8);
            const cz = random.range(8, size - 8);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) continue;

            const car = MeshBuilder.CreateBox("burnedCar", { width: 2, height: 1.2, depth: 4 }, this.scene);
            car.position = new Vector3(cx, 0.6, cz);
            car.rotation.y = random.range(0, Math.PI * 2);
            car.material = this.getMat("wreck");
            car.parent = chunkParent;
            car.freezeWorldMatrix();
            new PhysicsAggregate(car, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Разбитая мебель (4-8 штук)
        const furnitureCount = random.int(4, 8);
        for (let i = 0; i < furnitureCount; i++) {
            const fx = random.range(5, size - 5);
            const fz = random.range(5, size - 5);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 1)) continue;

            const furnitureType = random.int(0, 3);
            if (furnitureType === 0) {
                // Стул
                const chair = MeshBuilder.CreateBox("chair", { width: 0.5, height: 0.8, depth: 0.5 }, this.scene);
                chair.position = new Vector3(fx, 0.4, fz);
                chair.rotation.y = random.range(0, Math.PI * 2);
                chair.rotation.x = random.range(-0.3, 0.3);
                chair.material = this.getMat("wood");
                chair.parent = chunkParent;
                chair.freezeWorldMatrix();
            } else if (furnitureType === 1) {
                // Стол
                const table = MeshBuilder.CreateBox("table", { width: 1.2, height: 0.1, depth: 0.8 }, this.scene);
                table.position = new Vector3(fx, 0.5, fz);
                table.rotation.y = random.range(0, Math.PI);
                table.material = this.getMat("wood");
                table.parent = chunkParent;
                table.freezeWorldMatrix();
            } else {
                // Шкаф (опрокинутый)
                const cabinet = MeshBuilder.CreateBox("cabinet", { width: 0.6, height: 1.8, depth: 0.4 }, this.scene);
                cabinet.position = new Vector3(fx, 0.3, fz);
                cabinet.rotation.z = Math.PI / 2;
                cabinet.rotation.y = random.range(0, Math.PI);
                cabinet.material = this.getMat("wood");
                cabinet.parent = chunkParent;
                cabinet.freezeWorldMatrix();
            }
        }

        // Разрушенные стены (5-10 штук)
        const wallCount = random.int(5, 10);
        for (let i = 0; i < wallCount; i++) {
            const wx = random.range(10, size - 10);
            const wz = random.range(10, size - 10);
            const wWorldX = chunkX * this.config.chunkSize + wx;
            const wWorldZ = chunkZ * this.config.chunkSize + wz;
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 3)) continue;

            const wallW = random.range(4, 10);
            const wallH = random.range(2, 5);
            const wall = MeshBuilder.CreateBox("brokenWall", { width: wallW, height: wallH, depth: 0.4 }, this.scene);
            wall.position = new Vector3(wx, wallH / 2, wz);
            wall.rotation.y = random.range(0, Math.PI);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunkParent;
            wall.freezeWorldMatrix();
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Дорожные знаки (покосившиеся)
        const signCount = random.int(2, 5);
        for (let i = 0; i < signCount; i++) {
            const sx = random.range(5, size - 5);
            const sz = random.range(5, size - 5);
            const sWorldX = chunkX * this.config.chunkSize + sx;
            const sWorldZ = chunkZ * this.config.chunkSize + sz;
            if (this.isPositionInGarageArea(sWorldX, sWorldZ, 1)) continue;

            // Столб
            const pole = MeshBuilder.CreateBox("signPole", { width: 0.1, height: 2.5, depth: 0.1 }, this.scene);
            pole.position = new Vector3(sx, 1.25, sz);
            pole.rotation.x = random.range(-0.3, 0.3);
            pole.rotation.z = random.range(-0.3, 0.3);
            pole.material = this.getMat("metal");
            pole.parent = chunkParent;
            pole.freezeWorldMatrix();

            // Знак
            const sign = MeshBuilder.CreateBox("sign", { width: 0.6, height: 0.6, depth: 0.05 }, this.scene);
            sign.position = new Vector3(sx, 2.3, sz);
            sign.rotation.x = pole.rotation.x;
            sign.rotation.z = pole.rotation.z;
            sign.material = random.pick([this.getMat("red"), this.getMat("yellow"), this.getMat("metal")]);
            sign.parent = chunkParent;
            sign.freezeWorldMatrix();
        }

        // Горы мусора (2-4 штуки)
        const trashCount = random.int(2, 4);
        for (let i = 0; i < trashCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunkX * this.config.chunkSize + tx;
            const tWorldZ = chunkZ * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 3)) continue;

            const trashW = random.range(4, 8);
            const trashH = random.range(1, 3);
            const trash = MeshBuilder.CreateBox("trash", { width: trashW, height: trashH, depth: trashW }, this.scene);
            trash.position = new Vector3(tx, trashH / 2, tz);
            trash.material = this.getMat("dirt");
            trash.parent = chunkParent;
            trash.freezeWorldMatrix();
            new PhysicsAggregate(trash, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Generate cover objects
        this.generateCoverObjects(chunkX, chunkZ, worldX, worldZ, size, "wasteland", chunkParent);
        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, "wasteland", chunkParent);
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    private generateRuinsBuildings(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Все типы зданий: жилые, коммерческие, промышленные, военные - увеличено количество
        const buildingCount = random.int(6, 12);
        const buildingPositions = this.generateClusteredPositions(
            buildingCount,
            size,
            10,
            30,
            Math.min(buildingCount, 3),
            random
        );

        for (const pos of buildingPositions) {
            const worldX_pos = chunkX * this.config.chunkSize + pos.x;
            const worldZ_pos = chunkZ * this.config.chunkSize + pos.z;

            if (this.isPositionInGarageArea(worldX_pos, worldZ_pos, 10)) continue;

            // Распределение: 40% жилые, 30% коммерческие, 20% промышленные, 10% военные
            const buildingType = random.next();
            let w: number, h: number, d: number;
            let material: string;

            if (buildingType < 0.4) {
                // Жилые: 6x6x4
                w = random.range(5, 7);
                h = random.range(3, 5);
                d = random.range(5, 7);
                material = random.pick(["brick", "plaster"]);
            } else if (buildingType < 0.7) {
                // Коммерческие: 12x12x8
                w = random.range(10, 14);
                h = random.range(6, 10);
                d = random.range(10, 14);
                material = random.pick(["concrete", "brick"]);
            } else if (buildingType < 0.9) {
                // Промышленные: 15x15x10
                w = random.range(13, 17);
                h = random.range(8, 12);
                d = random.range(13, 17);
                material = random.pick(["metal", "concrete"]);
            } else {
                // Военные: 10x10x6
                w = random.range(8, 12);
                h = random.range(4, 8);
                d = random.range(8, 12);
                material = random.pick(["concrete", "brickDark"]);
            }

            // Создаём частично разрушенное здание (30-70% остаётся)
            this.createRuinedBuilding(chunkX, chunkZ, pos.x, pos.z, w, h, d, random, chunkParent, random.range(0.3, 0.7));
        }
    }

    // Generate Canyon map - mountainous terrain with passes, rivers, lakes, forests
    private generateCanyonContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "park", random, chunkParent);
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Use dramatic terrain for mountains
        if (this.terrainGenerator) {
            const gridSize = 5;
            const cellSize = size / gridSize;
            for (let gx = 0; gx < gridSize; gx++) {
                for (let gz = 0; gz < gridSize; gz++) {
                    const localX = (gx + 0.5) * cellSize;
                    const localZ = (gz + 0.5) * cellSize;
                    const sampleX = worldX + localX;
                    const sampleZ = worldZ + localZ;

                    const height = this.terrainGenerator.getHeight(sampleX, sampleZ, "snow");
                    if (height > 5) {
                        // Create mountain - высокие горы (10-20 единиц)
                        const mountainHeight = Math.min(height, 20);
                        this.createMountain(chunkX, chunkZ, localX, localZ, cellSize * 0.8, mountainHeight, random, chunkParent);
                    }
                }
            }
        }

        // Create rivers (чаще - 50% шанс)
        if (random.chance(0.5)) {
            const startX = random.range(0, size);
            const startZ = random.range(0, size);
            const endX = random.range(0, size);
            const endZ = random.range(0, size);
            this.createRiver(chunkX, chunkZ, startX, startZ, endX, endZ, random.range(3, 6), random, chunkParent);
        }

        // УДАЛЕНО: Леса в долинах каньона (оптимизация производительности)

        // Create small villages - увеличена вероятность и размер деревень (5-10 домов)
        if (random.chance(0.6)) {
            const houseCount = random.int(5, 10);
            const villagePos = this.generateClusteredPositions(houseCount, size, 8, 20, 1, random);
            for (const pos of villagePos) {
                const hWorldX = chunkX * this.config.chunkSize + pos.x;
                const hWorldZ = chunkZ * this.config.chunkSize + pos.z;
                if (this.isPositionInGarageArea(hWorldX, hWorldZ, 4)) continue;

                const house = MeshBuilder.CreateBox("villageHouse", { width: 6, height: 4, depth: 6 }, this.scene);
                house.position = new Vector3(pos.x, 2, pos.z);
                house.material = this.getMat("wood");
                house.parent = chunkParent;
                house.freezeWorldMatrix();
                // chunk.meshes.push(house);
                new PhysicsAggregate(house, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Генерируем реки и озёра
        this.generateCanyonRivers(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.generateCanyonLakes(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Генерируем горные перевалы
        this.generateCanyonPasses(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Смешанные дороги (горные + долинные)
        this.generateCanyonRoads(chunkX, chunkZ, size, random, chunkParent);

        // Водопады (1-2 на чанк)
        this.generateCanyonWaterfalls(chunkX, chunkZ, size, random, chunkParent);

        // Мосты через реки/ущелья
        this.generateCanyonBridges(chunkX, chunkZ, size, random, chunkParent);

        // Скальные образования
        this.generateCanyonRockFormations(chunkX, chunkZ, size, random, chunkParent);

        // Охотничьи хижины
        this.generateCanyonCabins(chunkX, chunkZ, size, random, chunkParent);

        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, "park", chunkParent);
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    private generateCanyonWaterfalls(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        if (random.chance(0.25)) {
            const wx = random.range(15, size - 15);
            const wz = random.range(15, size - 15);
            const wWorldX = chunkX * this.config.chunkSize + wx;
            const wWorldZ = chunkZ * this.config.chunkSize + wz;
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 5)) return;

            const waterfallH = random.range(8, 15);

            // Скала-источник
            const cliff = MeshBuilder.CreateBox("waterfallCliff", { width: 8, height: waterfallH, depth: 4 }, this.scene);
            cliff.position = new Vector3(wx, waterfallH / 2, wz);
            cliff.material = this.getMat("rock");
            cliff.parent = chunkParent;
            cliff.freezeWorldMatrix();
            new PhysicsAggregate(cliff, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Водопад (вода падающая)
            const waterfall = MeshBuilder.CreateBox("waterfall", { width: 3, height: waterfallH - 2, depth: 0.5 }, this.scene);
            waterfall.position = new Vector3(wx, waterfallH / 2, wz + 2.5);
            waterfall.material = this.getMat("water");
            waterfall.parent = chunkParent;
            waterfall.freezeWorldMatrix();

            // Озерцо у основания
            const pool = MeshBuilder.CreateCylinder("waterfallPool", { diameter: 8, height: 0.2 }, this.scene);
            pool.position = new Vector3(wx, 0.05, wz + 5);
            pool.material = this.getMat("water");
            pool.parent = chunkParent;
            pool.freezeWorldMatrix();
        }
    }

    private generateCanyonBridges(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        if (random.chance(0.2)) {
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 8)) return;

            const bridgeLength = random.range(12, 20);
            const bridgeHeight = random.range(4, 8);

            // Опоры моста
            const pillar1 = MeshBuilder.CreateBox("bridgePillar", { width: 2, height: bridgeHeight, depth: 2 }, this.scene);
            pillar1.position = new Vector3(bx - bridgeLength / 2 + 1, bridgeHeight / 2, bz);
            pillar1.material = this.getMat("rock");
            pillar1.parent = chunkParent;
            pillar1.freezeWorldMatrix();
            new PhysicsAggregate(pillar1, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            const pillar2 = MeshBuilder.CreateBox("bridgePillar", { width: 2, height: bridgeHeight, depth: 2 }, this.scene);
            pillar2.position = new Vector3(bx + bridgeLength / 2 - 1, bridgeHeight / 2, bz);
            pillar2.material = this.getMat("rock");
            pillar2.parent = chunkParent;
            pillar2.freezeWorldMatrix();
            new PhysicsAggregate(pillar2, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Полотно моста
            const deck = MeshBuilder.CreateBox("bridgeDeck", { width: bridgeLength, height: 0.5, depth: 4 }, this.scene);
            deck.position = new Vector3(bx, bridgeHeight, bz);
            deck.material = this.getMat("wood");
            deck.parent = chunkParent;
            deck.freezeWorldMatrix();
            new PhysicsAggregate(deck, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Перила
            const rail1 = MeshBuilder.CreateBox("bridgeRail", { width: bridgeLength, height: 1, depth: 0.2 }, this.scene);
            rail1.position = new Vector3(bx, bridgeHeight + 0.75, bz - 1.9);
            rail1.material = this.getMat("wood");
            rail1.parent = chunkParent;
            rail1.freezeWorldMatrix();

            const rail2 = MeshBuilder.CreateBox("bridgeRail", { width: bridgeLength, height: 1, depth: 0.2 }, this.scene);
            rail2.position = new Vector3(bx, bridgeHeight + 0.75, bz + 1.9);
            rail2.material = this.getMat("wood");
            rail2.parent = chunkParent;
            rail2.freezeWorldMatrix();
        }
    }

    private generateCanyonRockFormations(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const rockCount = random.int(4, 10);
        for (let i = 0; i < rockCount; i++) {
            const rx = random.range(5, size - 5);
            const rz = random.range(5, size - 5);
            const rWorldX = chunkX * this.config.chunkSize + rx;
            const rWorldZ = chunkZ * this.config.chunkSize + rz;
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 3)) continue;

            const rockType = random.int(0, 3);
            if (rockType === 0) {
                // Большой валун
                const boulder = MeshBuilder.CreateBox("boulder", {
                    width: random.range(3, 6),
                    height: random.range(2, 5),
                    depth: random.range(3, 6)
                }, this.scene);
                boulder.position = new Vector3(rx, random.range(1, 2.5), rz);
                boulder.rotation.y = random.range(0, Math.PI);
                boulder.material = this.getMat("rock");
                boulder.parent = chunkParent;
                boulder.freezeWorldMatrix();
                new PhysicsAggregate(boulder, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else if (rockType === 1) {
                // Скальный шпиль
                const spire = MeshBuilder.CreateBox("spire", {
                    width: random.range(1.5, 3),
                    height: random.range(5, 12),
                    depth: random.range(1.5, 3)
                }, this.scene);
                spire.position = new Vector3(rx, random.range(2.5, 6), rz);
                spire.material = this.getMat("rock");
                spire.parent = chunkParent;
                spire.freezeWorldMatrix();
                new PhysicsAggregate(spire, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else {
                // Группа камней
                for (let r = 0; r < random.int(3, 6); r++) {
                    const stone = MeshBuilder.CreateBox("stone", {
                        width: random.range(0.5, 2),
                        height: random.range(0.5, 1.5),
                        depth: random.range(0.5, 2)
                    }, this.scene);
                    stone.position = new Vector3(
                        rx + random.range(-2, 2),
                        random.range(0.25, 0.75),
                        rz + random.range(-2, 2)
                    );
                    stone.material = this.getMat("rock");
                    stone.parent = chunkParent;
                    stone.freezeWorldMatrix();
                }
            }
        }
    }

    private generateCanyonCabins(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        if (random.chance(0.15)) {
            const cx = random.range(20, size - 20);
            const cz = random.range(20, size - 20);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 6)) return;

            // Охотничья хижина
            const cabin = MeshBuilder.CreateBox("cabin", { width: 6, height: 4, depth: 5 }, this.scene);
            cabin.position = new Vector3(cx, 2, cz);
            cabin.material = this.getMat("wood");
            cabin.parent = chunkParent;
            cabin.freezeWorldMatrix();
            new PhysicsAggregate(cabin, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Крыша (треугольная через два бокса)
            const roof1 = MeshBuilder.CreateBox("cabinRoof", { width: 7, height: 0.3, depth: 3.5 }, this.scene);
            roof1.position = new Vector3(cx, 4.5, cz - 1);
            roof1.rotation.x = 0.5;
            roof1.material = this.getMat("woodDark");
            roof1.parent = chunkParent;
            roof1.freezeWorldMatrix();

            const roof2 = MeshBuilder.CreateBox("cabinRoof", { width: 7, height: 0.3, depth: 3.5 }, this.scene);
            roof2.position = new Vector3(cx, 4.5, cz + 1);
            roof2.rotation.x = -0.5;
            roof2.material = this.getMat("woodDark");
            roof2.parent = chunkParent;
            roof2.freezeWorldMatrix();

            // Дымоход
            const chimney = MeshBuilder.CreateBox("chimney", { width: 0.8, height: 2, depth: 0.8 }, this.scene);
            chimney.position = new Vector3(cx + 2, 5.5, cz);
            chimney.material = this.getMat("brick");
            chimney.parent = chunkParent;
            chimney.freezeWorldMatrix();
        }
    }

    private generateCanyonRivers(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Несколько рек (4-6 на карту) - увеличена вероятность
        if (random.chance(0.35)) {
            const startX = random.range(0, size);
            const startZ = random.range(0, size);
            const endX = random.range(0, size);
            const endZ = random.range(0, size);
            this.createRiver(chunkX, chunkZ, startX, startZ, endX, endZ, random.range(3, 6), random, chunkParent);
        }
    }

    private createLake(chunkX: number, chunkZ: number, x: number, z: number, radius: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Озеро - плоский цилиндр с материалом "water"
        const lake = MeshBuilder.CreateCylinder("lake", { diameter: radius * 2, height: 0.1 }, this.scene);
        lake.position = new Vector3(x, -0.05, z);
        lake.material = this.getMat("water");
        lake.parent = chunkParent;
        lake.freezeWorldMatrix();
        // chunk.meshes.push(lake);
    }

    private generateCanyonLakes(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Несколько озёр (5-8 на карту) - увеличена вероятность
        if (random.chance(0.3)) {
            const lx = random.range(15, size - 15);
            const lz = random.range(15, size - 15);
            const lWorldX = chunkX * this.config.chunkSize + lx;
            const lWorldZ = chunkZ * this.config.chunkSize + lz;

            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 8)) {
                const radius = random.range(5, 12);
                this.createLake(chunkX, chunkZ, lx, lz, radius, random, chunkParent);
            }
        }
    }

    private generateCanyonPasses(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Горные перевалы - проходы между высокими горами
        if (random.chance(0.2)) {
            const px = random.range(10, size - 10);
            const pz = random.range(10, size - 10);
            const pWorldX = chunkX * this.config.chunkSize + px;
            const pWorldZ = chunkZ * this.config.chunkSize + pz;

            if (!this.isPositionInGarageArea(pWorldX, pWorldZ, 8)) {
                const passWidth = random.range(10, 15);
                const passHeight = random.range(1, 3);

                // Создаём проход как понижение в земле
                const pass = MeshBuilder.CreateBox("canyon_pass", { width: passWidth, height: passHeight, depth: passWidth }, this.scene);
                pass.position = new Vector3(px, -passHeight / 2, pz);
                pass.material = this.getMat("dirt");
                pass.parent = chunkParent;
                pass.freezeWorldMatrix();
                // chunk.meshes.push(pass);
            }
        }
    }

    private generateCanyonRoads(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Смешанные дороги: горные (серпантины) и долинные (прямые)
        // Долинные дороги - прямые дороги
        if (random.chance(0.6)) {
            this.createRoads(chunkX, chunkZ, size, random, "park", chunkParent);
        }

        // Горные дороги - извилистые (создаём несколько сегментов)
        if (random.chance(0.4)) {
            const roadSegments = random.int(2, 4);
            for (let i = 0; i < roadSegments; i++) {
                const sx = random.range(5, size - 5);
                const sz = random.range(5, size - 5);
                const ex = sx + random.range(-10, 10);
                const ez = sz + random.range(-10, 10);

                const road = MeshBuilder.CreateBox("mountain_road", { width: 4, height: 0.2, depth: Math.sqrt((ex - sx) ** 2 + (ez - sz) ** 2) }, this.scene);
                road.position = new Vector3((sx + ex) / 2, 0.1, (sz + ez) / 2);
                road.rotation.y = Math.atan2(ez - sz, ex - sx);
                road.material = this.getMat("asphalt");
                road.parent = chunkParent;
                road.freezeWorldMatrix();
                // chunk.meshes.push(road);
            }
        }
    }

    // Generate Industrial map - large industrial zone with factories, port, railway
    private generateIndustrialMapContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "gravel", random, chunkParent);
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.createRoads(chunkX, chunkZ, size, random, "industrial", chunkParent);

        // Несколько средних заводов (2-4 на чанк) - увеличено количество
        const factoryCount = random.int(2, 4);
        for (let i = 0; i < factoryCount; i++) {
            const fx = random.range(10, size - 10);
            const fz = random.range(10, size - 10);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;

            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 15)) continue;

            const factory = MeshBuilder.CreateBox("factory", { width: random.range(20, 30), height: random.range(8, 15), depth: random.range(25, 35) }, this.scene);
            factory.position = new Vector3(fx, random.range(4, 7.5), fz);
            factory.material = this.getMat(random.pick(["metal", "concrete", "metalRust"]));
            factory.parent = chunkParent;
            factory.freezeWorldMatrix();
            // chunk.meshes.push(factory);
            new PhysicsAggregate(factory, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Add smokestacks
            if (random.chance(0.7)) {
                const stack = MeshBuilder.CreateBox("stack", { width: 2, height: random.range(10, 18), depth: 2 }, this.scene);
                stack.position = new Vector3(fx + random.range(-10, 10), random.range(5, 9), fz + random.range(-10, 10));
                stack.material = this.getMat("brickDark");
                stack.parent = chunkParent;
                stack.freezeWorldMatrix();
                // chunk.meshes.push(stack);
                new PhysicsAggregate(stack, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // Containers (many) - увеличено количество
        const containerCount = random.int(15, 30);
        for (let i = 0; i < containerCount; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;

            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 3)) continue;

            const container = MeshBuilder.CreateBox("container", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
            const stackHeight = random.int(0, 2);
            container.position = new Vector3(cx, 1.26 + stackHeight * 2.5, cz);
            container.rotation.y = random.pick([0, Math.PI / 2]);
            container.material = this.getMat(random.pick(["red", "yellow", "metal", "metalRust", "blue"]));
            container.parent = chunkParent;
            container.freezeWorldMatrix();
            // chunk.meshes.push(container);
            new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Несколько кранов (4-6 на чанк) - увеличено количество
        const craneCount = random.int(4, 6);
        for (let i = 0; i < craneCount; i++) {
            const craneX = random.range(15, size - 15);
            const craneZ = random.range(15, size - 15);
            const cWorldX = chunkX * this.config.chunkSize + craneX;
            const cWorldZ = chunkZ * this.config.chunkSize + craneZ;

            if (!this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
                const tower = MeshBuilder.CreateBox("craneTower", { width: 2, height: 15, depth: 2 }, this.scene);
                tower.position = new Vector3(craneX, 7.5, craneZ);
                tower.material = this.getMat("yellow");
                tower.parent = chunkParent;
                tower.freezeWorldMatrix();
                // chunk.meshes.push(tower);

                const arm = MeshBuilder.CreateBox("craneArm", { width: 1, height: 1, depth: 18 }, this.scene);
                arm.position = new Vector3(craneX, 14, craneZ + 8);
                arm.material = this.getMat("yellow");
                arm.parent = chunkParent;
                arm.freezeWorldMatrix();
                // chunk.meshes.push(arm);
            }
        }

        // Большой порт с причалами
        this.generateLargePort(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Ж/д терминал
        this.generateRailwayTerminal(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Резервуары для топлива
        this.generateStorageTanks(chunkX, chunkZ, size, random, chunkParent);

        // Трубопроводы
        this.generatePipeNetwork(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Погрузчики (3-6 штук)
        this.generateForklifts(chunkX, chunkZ, size, random, chunkParent);

        // Поддоны с грузами (10-20 штук)
        this.generatePallets(chunkX, chunkZ, size, random, chunkParent);

        // Бочки с топливом/химией (8-15 штук)
        this.generateIndustrialBarrels(chunkX, chunkZ, size, random, chunkParent);

        // Ограждения (5-10 секций)
        this.generateIndustrialFencing(chunkX, chunkZ, size, random, chunkParent);

        this.generateCoverObjects(chunkX, chunkZ, worldX, worldZ, size, "industrial", chunkParent);
        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, "industrial", chunkParent);
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    private generateForklifts(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(3, 6);
        for (let i = 0; i < count; i++) {
            const fx = random.range(8, size - 8);
            const fz = random.range(8, size - 8);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 3)) continue;

            // Корпус погрузчика
            const body = MeshBuilder.CreateBox("forkliftBody", { width: 1.5, height: 1.5, depth: 2.5 }, this.scene);
            body.position = new Vector3(fx, 0.75, fz);
            body.rotation.y = random.range(0, Math.PI * 2);
            body.material = this.getMat("yellow");
            body.parent = chunkParent;
            body.freezeWorldMatrix();
            new PhysicsAggregate(body, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Вилы
            const fork1 = MeshBuilder.CreateBox("fork", { width: 0.1, height: 0.1, depth: 1.5 }, this.scene);
            fork1.position = new Vector3(fx - 0.4, 0.3, fz + 1.5);
            fork1.material = this.getMat("metal");
            fork1.parent = chunkParent;
            fork1.freezeWorldMatrix();

            const fork2 = MeshBuilder.CreateBox("fork", { width: 0.1, height: 0.1, depth: 1.5 }, this.scene);
            fork2.position = new Vector3(fx + 0.4, 0.3, fz + 1.5);
            fork2.material = this.getMat("metal");
            fork2.parent = chunkParent;
            fork2.freezeWorldMatrix();
        }
    }

    private generatePallets(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(10, 20);
        for (let i = 0; i < count; i++) {
            const px = random.range(5, size - 5);
            const pz = random.range(5, size - 5);
            const pWorldX = chunkX * this.config.chunkSize + px;
            const pWorldZ = chunkZ * this.config.chunkSize + pz;
            if (this.isPositionInGarageArea(pWorldX, pWorldZ, 2)) continue;

            // Поддон
            const pallet = MeshBuilder.CreateBox("pallet", { width: 1.2, height: 0.15, depth: 1.2 }, this.scene);
            pallet.position = new Vector3(px, 0.075, pz);
            pallet.material = this.getMat("wood");
            pallet.parent = chunkParent;
            pallet.freezeWorldMatrix();

            // Груз на поддоне
            if (random.chance(0.7)) {
                const cargoType = random.int(0, 3);
                if (cargoType === 0) {
                    // Коробки
                    for (let b = 0; b < random.int(2, 4); b++) {
                        const box = MeshBuilder.CreateBox("cargoBox", { width: 0.5, height: 0.5, depth: 0.5 }, this.scene);
                        box.position = new Vector3(
                            px + random.range(-0.3, 0.3),
                            0.15 + 0.5 * (b % 2 + 1),
                            pz + random.range(-0.3, 0.3)
                        );
                        box.material = this.getMat("sand");
                        box.parent = chunkParent;
                        box.freezeWorldMatrix();
                    }
                } else if (cargoType === 1) {
                    // Мешки
                    const sack = MeshBuilder.CreateBox("sack", { width: 0.8, height: 0.6, depth: 0.6 }, this.scene);
                    sack.position = new Vector3(px, 0.45, pz);
                    sack.material = this.getMat("sand");
                    sack.parent = chunkParent;
                    sack.freezeWorldMatrix();
                } else {
                    // Ящик
                    const crate = MeshBuilder.CreateBox("crate", { width: 1, height: 0.8, depth: 1 }, this.scene);
                    crate.position = new Vector3(px, 0.55, pz);
                    crate.material = this.getMat("wood");
                    crate.parent = chunkParent;
                    crate.freezeWorldMatrix();
                }
            }
        }
    }

    private generateIndustrialBarrels(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(8, 15);
        for (let i = 0; i < count; i++) {
            const bx = random.range(5, size - 5);
            const bz = random.range(5, size - 5);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 1)) continue;

            const barrel = MeshBuilder.CreateCylinder("industrialBarrel", { diameter: 0.6, height: 0.9 }, this.scene);
            barrel.position = new Vector3(bx, 0.45, bz);
            barrel.material = random.pick([this.getMat("barrelGreen"), this.getMat("barrelRed"), this.getMat("metal"), this.getMat("yellow")]);
            barrel.parent = chunkParent;
            barrel.freezeWorldMatrix();
        }
    }

    private generateIndustrialFencing(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const sectionCount = random.int(5, 10);
        for (let i = 0; i < sectionCount; i++) {
            const fx = random.range(10, size - 10);
            const fz = random.range(10, size - 10);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 3)) continue;

            const fenceLength = random.range(8, 15);
            const fenceAngle = random.range(0, Math.PI);

            // Сетчатое ограждение
            const fence = MeshBuilder.CreateBox("fence", { width: fenceLength, height: 2.5, depth: 0.1 }, this.scene);
            fence.position = new Vector3(fx, 1.25, fz);
            fence.rotation.y = fenceAngle;
            fence.material = this.getMat("fenceGray");
            fence.parent = chunkParent;
            fence.freezeWorldMatrix();
            new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Столбы
            for (let p = 0; p <= fenceLength / 3; p++) {
                const post = MeshBuilder.CreateBox("fencePost", { width: 0.1, height: 2.7, depth: 0.1 }, this.scene);
                const postOffset = p * 3 - fenceLength / 2;
                post.position = new Vector3(
                    fx + Math.cos(fenceAngle) * postOffset,
                    1.35,
                    fz + Math.sin(fenceAngle) * postOffset
                );
                post.material = this.getMat("metal");
                post.parent = chunkParent;
                post.freezeWorldMatrix();
            }
        }
    }

    private generateLargePort(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Большой порт с причалами - увеличена вероятность (2-3 порта на карту)
        if (random.chance(0.25)) {
            const portX = random.range(20, size - 20);
            const portZ = random.range(20, size - 20);
            const portWorldX = chunkX * this.config.chunkSize + portX;
            const portWorldZ = chunkZ * this.config.chunkSize + portZ;

            if (!this.isPositionInGarageArea(portWorldX, portWorldZ, 15)) {
                // Причалы
                const pierCount = random.int(2, 4);
                for (let i = 0; i < pierCount; i++) {
                    const pier = MeshBuilder.CreateBox("pier", { width: random.range(30, 50), height: 1, depth: 8 }, this.scene);
                    pier.position = new Vector3(portX + (i - pierCount / 2) * 20, 0.5, portZ);
                    pier.material = this.getMat("concrete");
                    pier.parent = chunkParent;
                    pier.freezeWorldMatrix();
                    // chunk.meshes.push(pier);
                }

                // Склады порта
                const warehouseCount = random.int(2, 3);
                for (let i = 0; i < warehouseCount; i++) {
                    const wh = MeshBuilder.CreateBox("port_warehouse", { width: 15, height: 8, depth: 10 }, this.scene);
                    wh.position = new Vector3(portX + random.range(-15, 15), 4, portZ + random.range(-10, 10));
                    wh.material = this.getMat("metalRust");
                    wh.parent = chunkParent;
                    wh.freezeWorldMatrix();
                    // chunk.meshes.push(wh);
                }

                // Краны порта
                const portCraneCount = random.int(3, 5);
                for (let i = 0; i < portCraneCount; i++) {
                    const craneX = portX + random.range(-20, 20);
                    const craneZ = portZ + random.range(-5, 5);
                    const tower = MeshBuilder.CreateBox("port_crane", { width: 2, height: 18, depth: 2 }, this.scene);
                    tower.position = new Vector3(craneX, 9, craneZ);
                    tower.material = this.getMat("yellow");
                    tower.parent = chunkParent;
                    tower.freezeWorldMatrix();
                    // chunk.meshes.push(tower);
                }
            }
        }
    }

    private generateRailwayTerminal(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Ж/д терминал - увеличена вероятность (2-3 терминала на карту)
        if (random.chance(0.2)) {
            const termX = random.range(25, size - 25);
            const termZ = random.range(25, size - 25);
            const termWorldX = chunkX * this.config.chunkSize + termX;
            const termWorldZ = chunkZ * this.config.chunkSize + termZ;

            if (!this.isPositionInGarageArea(termWorldX, termWorldZ, 12)) {
                // Платформа
                const platform = MeshBuilder.CreateBox("railway_platform", { width: 40, height: 2, depth: 5 }, this.scene);
                platform.position = new Vector3(termX, 1, termZ);
                platform.material = this.getMat("concrete");
                platform.parent = chunkParent;
                platform.freezeWorldMatrix();
                // chunk.meshes.push(platform);

                // Пути
                for (let i = 0; i < 3; i++) {
                    const track = MeshBuilder.CreateBox("railway_track", { width: 40, height: 0.2, depth: 0.5 }, this.scene);
                    track.position = new Vector3(termX, 0.1, termZ + (i - 1) * 3);
                    track.material = this.getMat("metal");
                    track.parent = chunkParent;
                    track.freezeWorldMatrix();
                    // chunk.meshes.push(track);
                }

                // Вагоны
                const wagonCount = random.int(2, 4);
                for (let i = 0; i < wagonCount; i++) {
                    const wagon = MeshBuilder.CreateBox("railway_wagon", { width: 8, height: 3, depth: 3 }, this.scene);
                    wagon.position = new Vector3(termX - 15 + i * 8, 1.5, termZ);
                    wagon.material = this.getMat("metalRust");
                    wagon.parent = chunkParent;
                    wagon.freezeWorldMatrix();
                    // chunk.meshes.push(wagon);
                }

                // Здание терминала
                const terminal = MeshBuilder.CreateBox("railway_terminal", { width: 20, height: 10, depth: 15 }, this.scene);
                terminal.position = new Vector3(termX, 5, termZ - 10);
                terminal.material = this.getMat("concrete");
                terminal.parent = chunkParent;
                terminal.freezeWorldMatrix();
                // chunk.meshes.push(terminal);
            }
        }
    }

    private generateStorageTanks(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Резервуары для топлива - увеличено (5-10 на чанк)
        const tankCount = random.int(5, 10);
        for (let i = 0; i < tankCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunkX * this.config.chunkSize + tx;
            const tWorldZ = chunkZ * this.config.chunkSize + tz;

            if (!this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) {
                const radius = random.range(3, 5);
                const height = random.range(8, 12);
                const tank = MeshBuilder.CreateCylinder("storage_tank", { diameter: radius * 2, height }, this.scene);
                tank.position = new Vector3(tx, height / 2, tz);
                tank.material = this.getMat(random.pick(["metal", "metalRust"]));
                tank.parent = chunkParent;
                tank.freezeWorldMatrix();
                // chunk.meshes.push(tank);
                new PhysicsAggregate(tank, PhysicsShapeType.CYLINDER, { mass: 0 }, this.scene);
            }
        }
    }

    private generatePipeNetwork(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Трубопроводы - несколько труб на чанк
        const pipeCount = random.int(2, 4);
        for (let i = 0; i < pipeCount; i++) {
            const px = random.range(10, size - 10);
            const pz = random.range(10, size - 10);
            const pWorldX = chunkX * this.config.chunkSize + px;
            const pWorldZ = chunkZ * this.config.chunkSize + pz;

            if (!this.isPositionInGarageArea(pWorldX, pWorldZ, 3)) {
                const pipeLength = random.range(10, 30);
                const pipeDiameter = random.range(0.5, 1);
                const angle = random.range(0, Math.PI * 2);

                const pipe = MeshBuilder.CreateCylinder("pipe", { diameter: pipeDiameter, height: pipeLength }, this.scene);
                pipe.position = new Vector3(px, pipeDiameter / 2, pz);
                pipe.rotation.z = Math.PI / 2;
                pipe.rotation.y = angle;
                pipe.material = this.getMat("metalRust");
                pipe.parent = chunkParent;
                pipe.freezeWorldMatrix();
                // chunk.meshes.push(pipe);

                // Опоры для труб
                const supportCount = Math.floor(pipeLength / 8);
                for (let j = 0; j < supportCount; j++) {
                    const support = MeshBuilder.CreateBox("pipe_support", { width: 0.3, height: 1, depth: 0.3 }, this.scene);
                    support.position = new Vector3(px + Math.cos(angle) * (j * 8 - pipeLength / 2), 0.5, pz + Math.sin(angle) * (j * 8 - pipeLength / 2));
                    support.material = this.getMat("metal");
                    support.parent = chunkParent;
                    support.freezeWorldMatrix();
                    // chunk.meshes.push(support);
                }
            }
        }
    }

    // Generate Urban Warfare map - dense urban environment with barricades
    private generateUrbanWarfareContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "asphalt", random, chunkParent);
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Сетка улиц (правильная планировка)
        this.generateGridStreets(chunkX, chunkZ, size, random, chunkParent);

        // Высокая плотность застройки (увеличено количество)
        const buildingCount = random.int(10, 18);
        const buildingPositions = this.generateClusteredPositions(
            buildingCount,
            size,
            8,
            20,
            Math.min(buildingCount, 4),
            random
        );

        for (const pos of buildingPositions) {
            const w = random.range(10, 18);
            // Смешанная высота зданий: 30% низкие (4-8), 50% средние (12-20), 20% высокие (25-35)
            let h: number;
            const heightType = random.next();
            if (heightType < 0.3) {
                h = random.range(4, 8); // Низкие
            } else if (heightType < 0.8) {
                h = random.range(12, 20); // Средние
            } else {
                h = random.range(25, 35); // Высокие
            }
            const d = random.range(10, 18);

            const worldX_pos = chunkX * this.config.chunkSize + pos.x;
            const worldZ_pos = chunkZ * this.config.chunkSize + pos.z;

            if (this.isPositionInGarageArea(worldX_pos, worldZ_pos, Math.max(w, d) / 2)) continue;
            if (this.isPositionNearRoad(worldX_pos, worldZ_pos, 4)) continue; // Don't place on roads

            const building = MeshBuilder.CreateBox("urbanBuilding", { width: w, height: h, depth: d }, this.scene);
            building.position = new Vector3(pos.x, h / 2, pos.z);
            building.material = this.getMat(random.pick(["concrete", "brick", "plaster"]));
            building.parent = chunkParent;
            building.freezeWorldMatrix();
            // chunk.meshes.push(building);
            new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

            // Лёгкие разрушения (10-20% зданий)
            if (random.chance(0.15)) {
                this.applyLightDestruction(building, random);
            }
        }

        // Парки и площади
        this.generateUrbanParks(chunkX, chunkZ, size, random, chunkParent);

        // Barricades on roads - увеличено количество
        for (let i = 0; i < random.int(6, 12); i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;

            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 5)) continue;
            if (this.isPositionNearRoad(bWorldX, bWorldZ, 2)) {
                this.createBarricade(chunkX, chunkZ, bx, bz, 10, random, undefined, chunkParent);
            }
        }

        // Parked vehicles as cover - увеличено количество
        for (let i = 0; i < random.int(8, 15); i++) {
            const vx = random.range(5, size - 5);
            const vz = random.range(5, size - 5);
            const vWorldX = chunkX * this.config.chunkSize + vx;
            const vWorldZ = chunkZ * this.config.chunkSize + vz;

            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 2)) continue;
            if (this.isPositionNearRoad(vWorldX, vWorldZ, 3)) {
                const car = MeshBuilder.CreateBox("parkedCar", { width: 2, height: 1.5, depth: 4 }, this.scene);
                car.position = new Vector3(vx, 0.75, vz);
                car.rotation.y = random.range(0, Math.PI * 2);
                car.material = this.getMat(random.pick(["red", "metal", "brickDark"]));
                car.parent = chunkParent;
                car.freezeWorldMatrix();
                // chunk.meshes.push(car);
            }
        }

        // Уличные фонари (8-15 штук)
        this.generateStreetLights(chunkX, chunkZ, size, random, chunkParent);

        // Мусорные баки и контейнеры (5-10 штук)
        this.generateTrashBins(chunkX, chunkZ, size, random, chunkParent);

        // Рекламные щиты (2-4 штуки)
        this.generateBillboards(chunkX, chunkZ, size, random, chunkParent);

        // Телефонные будки и киоски (2-5 штук)
        this.generateUrbanKiosks(chunkX, chunkZ, size, random, chunkParent);

        // Пожарные гидранты (3-6 штук)
        this.generateFireHydrants(chunkX, chunkZ, size, random, chunkParent);

        this.generateCoverObjects(chunkX, chunkZ, worldX, worldZ, size, "city", chunkParent);
        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, "city", chunkParent);
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    private generateStreetLights(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(8, 15);
        for (let i = 0; i < count; i++) {
            const lx = random.range(5, size - 5);
            const lz = random.range(5, size - 5);
            const lWorldX = chunkX * this.config.chunkSize + lx;
            const lWorldZ = chunkZ * this.config.chunkSize + lz;
            if (this.isPositionInGarageArea(lWorldX, lWorldZ, 1)) continue;

            // Столб
            const pole = MeshBuilder.CreateBox("lightPole", { width: 0.2, height: 6, depth: 0.2 }, this.scene);
            pole.position = new Vector3(lx, 3, lz);
            pole.material = this.getMat("metal");
            pole.parent = chunkParent;
            pole.freezeWorldMatrix();

            // Светильник
            const light = MeshBuilder.CreateBox("streetLight", { width: 0.6, height: 0.3, depth: 0.6 }, this.scene);
            light.position = new Vector3(lx, 6, lz);
            light.material = this.getMat("streetLight");
            light.parent = chunkParent;
            light.freezeWorldMatrix();
        }
    }

    private generateTrashBins(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(5, 10);
        for (let i = 0; i < count; i++) {
            const tx = random.range(5, size - 5);
            const tz = random.range(5, size - 5);
            const tWorldX = chunkX * this.config.chunkSize + tx;
            const tWorldZ = chunkZ * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 1)) continue;

            const binType = random.int(0, 2);
            if (binType === 0) {
                // Маленький мусорный бак
                const bin = MeshBuilder.CreateBox("trashBin", { width: 0.6, height: 0.9, depth: 0.6 }, this.scene);
                bin.position = new Vector3(tx, 0.45, tz);
                bin.material = this.getMat("barrelGreen");
                bin.parent = chunkParent;
                bin.freezeWorldMatrix();
            } else if (binType === 1) {
                // Большой мусорный контейнер
                const container = MeshBuilder.CreateBox("trashContainer", { width: 2, height: 1.5, depth: 1.5 }, this.scene);
                container.position = new Vector3(tx, 0.75, tz);
                container.material = this.getMat("gravel");
                container.parent = chunkParent;
                container.freezeWorldMatrix();
                new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else {
                // Урна
                const urn = MeshBuilder.CreateCylinder("urn", { diameter: 0.4, height: 0.6 }, this.scene);
                urn.position = new Vector3(tx, 0.3, tz);
                urn.material = this.getMat("metal");
                urn.parent = chunkParent;
                urn.freezeWorldMatrix();
            }
        }
    }

    private generateBillboards(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(2, 4);
        for (let i = 0; i < count; i++) {
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 4)) continue;

            // Опоры
            const pole1 = MeshBuilder.CreateBox("billboardPole", { width: 0.3, height: 8, depth: 0.3 }, this.scene);
            pole1.position = new Vector3(bx - 2, 4, bz);
            pole1.material = this.getMat("metal");
            pole1.parent = chunkParent;
            pole1.freezeWorldMatrix();

            const pole2 = MeshBuilder.CreateBox("billboardPole", { width: 0.3, height: 8, depth: 0.3 }, this.scene);
            pole2.position = new Vector3(bx + 2, 4, bz);
            pole2.material = this.getMat("metal");
            pole2.parent = chunkParent;
            pole2.freezeWorldMatrix();

            // Щит
            const board = MeshBuilder.CreateBox("billboard", { width: 6, height: 3, depth: 0.2 }, this.scene);
            board.position = new Vector3(bx, 7, bz);
            board.rotation.y = random.range(0, Math.PI);
            board.material = random.pick([this.getMat("red"), this.getMat("metal"), this.getMat("yellow"), this.getMat("white")]);
            board.parent = chunkParent;
            board.freezeWorldMatrix();
        }
    }

    private generateUrbanKiosks(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(2, 5);
        for (let i = 0; i < count; i++) {
            const kx = random.range(10, size - 10);
            const kz = random.range(10, size - 10);
            const kWorldX = chunkX * this.config.chunkSize + kx;
            const kWorldZ = chunkZ * this.config.chunkSize + kz;
            if (this.isPositionInGarageArea(kWorldX, kWorldZ, 2)) continue;

            const kioskType = random.int(0, 2);
            if (kioskType === 0) {
                // Газетный киоск
                const kiosk = MeshBuilder.CreateBox("newsKiosk", { width: 2.5, height: 2.5, depth: 2 }, this.scene);
                kiosk.position = new Vector3(kx, 1.25, kz);
                kiosk.material = this.getMat("metal");
                kiosk.parent = chunkParent;
                kiosk.freezeWorldMatrix();
                new PhysicsAggregate(kiosk, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else if (kioskType === 1) {
                // Телефонная будка
                const booth = MeshBuilder.CreateBox("phoneBooth", { width: 1, height: 2.5, depth: 1 }, this.scene);
                booth.position = new Vector3(kx, 1.25, kz);
                booth.material = this.getMat("red");
                booth.parent = chunkParent;
                booth.freezeWorldMatrix();
                new PhysicsAggregate(booth, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else {
                // Остановка
                const shelter = MeshBuilder.CreateBox("busShelter", { width: 4, height: 2.8, depth: 1.5 }, this.scene);
                shelter.position = new Vector3(kx, 1.4, kz);
                shelter.material = this.getMat("shelterGray");
                shelter.parent = chunkParent;
                shelter.freezeWorldMatrix();
            }
        }
    }

    private generateFireHydrants(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(3, 6);
        for (let i = 0; i < count; i++) {
            const hx = random.range(5, size - 5);
            const hz = random.range(5, size - 5);
            const hWorldX = chunkX * this.config.chunkSize + hx;
            const hWorldZ = chunkZ * this.config.chunkSize + hz;
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 1)) continue;

            const hydrant = MeshBuilder.CreateBox("hydrant", { width: 0.4, height: 0.8, depth: 0.4 }, this.scene);
            hydrant.position = new Vector3(hx, 0.4, hz);
            hydrant.material = this.getMat("red");
            hydrant.parent = chunkParent;
            hydrant.freezeWorldMatrix();
        }
    }

    private generateGridStreets(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Сетка улиц - правильная планировка
        const gridSize = 4;
        const cellSize = size / gridSize;
        const streetWidth = random.range(6, 8);

        // Горизонтальные улицы
        for (let i = 1; i < gridSize; i++) {
            const streetZ = i * cellSize;
            const street = MeshBuilder.CreateBox("grid_street_h", { width: size, height: 0.2, depth: streetWidth }, this.scene);
            street.position = new Vector3(size / 2, 0.1, streetZ);
            street.material = this.getMat("asphalt");
            street.parent = chunkParent;
            street.freezeWorldMatrix();
            // chunk.meshes.push(street);
        }

        // Вертикальные улицы
        for (let i = 1; i < gridSize; i++) {
            const streetX = i * cellSize;
            const street = MeshBuilder.CreateBox("grid_street_v", { width: streetWidth, height: 0.2, depth: size }, this.scene);
            street.position = new Vector3(streetX, 0.1, size / 2);
            street.material = this.getMat("asphalt");
            street.parent = chunkParent;
            street.freezeWorldMatrix();
            // chunk.meshes.push(street);
        }
    }

    private generateUrbanParks(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Парки и площади - увеличено (2-4 на чанк)
        const parkCount = random.int(2, 4);
        for (let i = 0; i < parkCount; i++) {
            const px = random.range(15, size - 15);
            const pz = random.range(15, size - 15);
            const pWorldX = chunkX * this.config.chunkSize + px;
            const pWorldZ = chunkZ * this.config.chunkSize + pz;

            if (!this.isPositionInGarageArea(pWorldX, pWorldZ, 10)) {
                const isPark = random.chance(0.5);
                const parkSize = random.range(15, 25);

                const park = MeshBuilder.CreateBox(isPark ? "park" : "square", { width: parkSize, height: 0.1, depth: parkSize }, this.scene);
                park.position = new Vector3(px, 0.05, pz);
                park.material = this.getMat(isPark ? "grass" : "asphalt");
                park.parent = chunkParent;
                park.freezeWorldMatrix();
                // chunk.meshes.push(park);
            }
        }
    }

    private applyLightDestruction(building: Mesh, random: SeededRandom): void {
        // Лёгкие разрушения: немного уменьшаем размер здания
        building.scaling.x *= random.range(0.9, 1.0);
        building.scaling.z *= random.range(0.9, 1.0);
    }

    // Generate Underground map - cave system, mines, tunnels
    private generateUndergroundContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "gravel", random, chunkParent);
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Природные пещеры + шахты
        this.generateNaturalCaves(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.generateMineSystem(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Подземная вода
        this.generateUndergroundWater(chunkX, chunkZ, size, random, chunkParent);

        // Освещение
        this.generateUndergroundLighting(chunkX, chunkZ, size, random, chunkParent);

        // Выходы на поверхность
        this.generateUndergroundExits(chunkX, chunkZ, size, random, chunkParent);

        // Create cave entrances (large openings) - увеличена вероятность
        if (random.chance(0.6)) {
            const caveX = random.range(15, size - 15);
            const caveZ = random.range(15, size - 15);
            const caveWorldX = chunkX * this.config.chunkSize + caveX;
            const caveWorldZ = chunkZ * this.config.chunkSize + caveZ;

            if (!this.isPositionInGarageArea(caveWorldX, caveWorldZ, 8)) {
                // Cave opening as arch/tunnel entrance
                const archHeight = random.range(6, 10);
                const archWidth = random.range(8, 12);

                // Left pillar
                const leftPillar = MeshBuilder.CreateBox("cavePillar", { width: 1.5, height: archHeight, depth: 1.5 }, this.scene);
                leftPillar.position = new Vector3(caveX - archWidth / 2, archHeight / 2, caveZ);
                leftPillar.material = this.getMat("rock");
                leftPillar.parent = chunkParent;
                leftPillar.freezeWorldMatrix();
                // chunk.meshes.push(leftPillar);

                // Right pillar
                const rightPillar = MeshBuilder.CreateBox("cavePillar", { width: 1.5, height: archHeight, depth: 1.5 }, this.scene);
                rightPillar.position = new Vector3(caveX + archWidth / 2, archHeight / 2, caveZ);
                rightPillar.material = this.getMat("rock");
                rightPillar.parent = chunkParent;
                rightPillar.freezeWorldMatrix();
                // chunk.meshes.push(rightPillar);

                // Top arch
                const arch = MeshBuilder.CreateBox("caveArch", { width: archWidth, height: 2, depth: 2 }, this.scene);
                arch.position = new Vector3(caveX, archHeight, caveZ);
                arch.material = this.getMat("rock");
                arch.parent = chunkParent;
                arch.freezeWorldMatrix();
                // chunk.meshes.push(arch);
            }
        }

        // Mine carts/tracks - увеличена вероятность
        if (random.chance(0.7)) {
            const trackLen = random.range(20, 40);
            const trackX = random.range(5, size - 5);
            const trackZ = random.range(5, size - 5);
            const angle = random.pick([0, Math.PI / 2]);

            const track = MeshBuilder.CreateBox("mineTrack", { width: trackLen, height: 0.3, depth: 0.5 }, this.scene);
            track.position = new Vector3(trackX, 0.15, trackZ);
            track.rotation.y = angle;
            track.material = this.getMat("metal");
            track.parent = chunkParent;
            track.freezeWorldMatrix();
            // chunk.meshes.push(track);
        }

        // Support pillars - ещё больше для больших пространств
        for (let i = 0; i < random.int(10, 18); i++) {
            const px = random.range(8, size - 8);
            const pz = random.range(8, size - 8);
            const pWorldX = chunkX * this.config.chunkSize + px;
            const pWorldZ = chunkZ * this.config.chunkSize + pz;

            if (this.isPositionInGarageArea(pWorldX, pWorldZ, 2)) continue;

            const pillar = MeshBuilder.CreateBox("supportPillar", { width: 1.5, height: random.range(6, 10), depth: 1.5 }, this.scene);
            pillar.position = new Vector3(px, random.range(3, 5), pz);
            pillar.material = this.getMat("concrete");
            pillar.parent = chunkParent;
            pillar.freezeWorldMatrix();
            // chunk.meshes.push(pillar);
            new PhysicsAggregate(pillar, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }

        // Сталактиты и сталагмиты (10-20 штук)
        this.generateCaveFormations(chunkX, chunkZ, size, random, chunkParent);

        // Грибные колонии (3-6 групп)
        this.generateUndergroundMushrooms(chunkX, chunkZ, size, random, chunkParent);

        // Древние артефакты/руины (1-2)
        this.generateUndergroundRuins(chunkX, chunkZ, size, random, chunkParent);

        // Кристаллы (5-10 штук)
        this.generateUndergroundCrystals(chunkX, chunkZ, size, random, chunkParent);

        this.generateCoverObjects(chunkX, chunkZ, worldX, worldZ, size, "military", chunkParent);
        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, "military", chunkParent);
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    private generateCaveFormations(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(10, 20);
        for (let i = 0; i < count; i++) {
            const fx = random.range(5, size - 5);
            const fz = random.range(5, size - 5);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 1)) continue;

            if (random.chance(0.5)) {
                // Сталагмит (снизу)
                const height = random.range(1.5, 4);
                const stalagmite = MeshBuilder.CreateBox("stalagmite", {
                    width: random.range(0.3, 0.8),
                    height: height,
                    depth: random.range(0.3, 0.8)
                }, this.scene);
                stalagmite.position = new Vector3(fx, height / 2, fz);
                stalagmite.material = this.getMat("rock");
                stalagmite.parent = chunkParent;
                stalagmite.freezeWorldMatrix();
            } else {
                // Сталактит (сверху)
                const height = random.range(1, 3);
                const stalactite = MeshBuilder.CreateBox("stalactite", {
                    width: random.range(0.2, 0.5),
                    height: height,
                    depth: random.range(0.2, 0.5)
                }, this.scene);
                stalactite.position = new Vector3(fx, 8 - height / 2, fz);
                stalactite.material = this.getMat("rock");
                stalactite.parent = chunkParent;
                stalactite.freezeWorldMatrix();
            }
        }
    }

    private generateUndergroundMushrooms(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const groupCount = random.int(3, 6);
        for (let g = 0; g < groupCount; g++) {
            const gx = random.range(10, size - 10);
            const gz = random.range(10, size - 10);
            const gWorldX = chunkX * this.config.chunkSize + gx;
            const gWorldZ = chunkZ * this.config.chunkSize + gz;
            if (this.isPositionInGarageArea(gWorldX, gWorldZ, 3)) continue;

            // Группа грибов
            const mushCount = random.int(3, 8);
            for (let m = 0; m < mushCount; m++) {
                const mx = gx + random.range(-3, 3);
                const mz = gz + random.range(-3, 3);

                // Ножка
                const stemH = random.range(0.5, 2);
                const stem = MeshBuilder.CreateBox("mushroomStem", { width: 0.2, height: stemH, depth: 0.2 }, this.scene);
                stem.position = new Vector3(mx, stemH / 2, mz);
                stem.material = this.getMat("white");
                stem.parent = chunkParent;
                stem.freezeWorldMatrix();

                // Шляпка
                const capSize = random.range(0.4, 1);
                const cap = MeshBuilder.CreateBox("mushroomCap", { width: capSize, height: 0.2, depth: capSize }, this.scene);
                cap.position = new Vector3(mx, stemH + 0.1, mz);
                cap.material = random.pick([this.getMat("red"), this.getMat("yellow"), this.getMat("metal"), this.getMat("barrelGreen")]);
                cap.parent = chunkParent;
                cap.freezeWorldMatrix();
            }
        }
    }

    private generateUndergroundRuins(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        if (random.chance(0.15)) {
            const rx = random.range(20, size - 20);
            const rz = random.range(20, size - 20);
            const rWorldX = chunkX * this.config.chunkSize + rx;
            const rWorldZ = chunkZ * this.config.chunkSize + rz;
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 10)) return;

            // Древние колонны
            const columnCount = random.int(4, 8);
            for (let c = 0; c < columnCount; c++) {
                const angle = (c / columnCount) * Math.PI * 2;
                const radius = random.range(5, 10);
                const cx = rx + Math.cos(angle) * radius;
                const cz = rz + Math.sin(angle) * radius;

                const columnH = random.range(4, 8);
                const column = MeshBuilder.CreateBox("ancientColumn", { width: 1.2, height: columnH, depth: 1.2 }, this.scene);
                column.position = new Vector3(cx, columnH / 2, cz);
                column.material = this.getMat("concrete");
                column.parent = chunkParent;
                column.freezeWorldMatrix();
                new PhysicsAggregate(column, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }

            // Центральный алтарь
            const altar = MeshBuilder.CreateBox("altar", { width: 4, height: 1.5, depth: 4 }, this.scene);
            altar.position = new Vector3(rx, 0.75, rz);
            altar.material = this.getMat("rock");
            altar.parent = chunkParent;
            altar.freezeWorldMatrix();
            new PhysicsAggregate(altar, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }

    private generateUndergroundCrystals(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(5, 10);
        for (let i = 0; i < count; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunkX * this.config.chunkSize + cx;
            const cWorldZ = chunkZ * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 1)) continue;

            const crystalH = random.range(1, 3);
            const crystal = MeshBuilder.CreateBox("crystal", {
                width: random.range(0.3, 0.8),
                height: crystalH,
                depth: random.range(0.3, 0.8)
            }, this.scene);
            crystal.position = new Vector3(cx, crystalH / 2, cz);
            crystal.rotation.y = random.range(0, Math.PI);
            crystal.rotation.x = random.range(-0.2, 0.2);

            crystal.material = random.pick([this.getMat("metal"), this.getMat("water"), this.getMat("barrelGreen"), this.getMat("yellow")]);
            crystal.parent = chunkParent;
            crystal.freezeWorldMatrix();
        }
    }

    private generateNaturalCaves(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Природные пещеры - большие залы неправильной формы (увеличена вероятность)
        if (random.chance(0.6)) {
            const caveX = random.range(20, size - 20);
            const caveZ = random.range(20, size - 20);
            const caveWorldX = chunkX * this.config.chunkSize + caveX;
            const caveWorldZ = chunkZ * this.config.chunkSize + caveZ;

            if (!this.isPositionInGarageArea(caveWorldX, caveWorldZ, 10)) {
                const caveSize = random.range(20, 40);
                const caveHeight = random.range(8, 15);

                const cave = MeshBuilder.CreateBox("natural_cave", { width: caveSize, height: caveHeight, depth: caveSize }, this.scene);
                cave.position = new Vector3(caveX, caveHeight / 2, caveZ);
                cave.material = this.getMat("rock");
                cave.parent = chunkParent;
                cave.freezeWorldMatrix();
                // chunk.meshes.push(cave);
            }
        }
    }

    private generateMineSystem(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Система шахт: туннели, рельсы, вагонетки, оборудование (увеличена вероятность)
        if (random.chance(0.7)) {
            const tunnelWidth = random.range(5, 8);
            const tunnelLength = random.range(30, 50);
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunkX * this.config.chunkSize + tx;
            const tWorldZ = chunkZ * this.config.chunkSize + tz;

            if (!this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) {
                const tunnel = MeshBuilder.CreateBox("mine_tunnel", { width: tunnelWidth, height: tunnelWidth, depth: tunnelLength }, this.scene);
                tunnel.position = new Vector3(tx, tunnelWidth / 2, tz);
                tunnel.material = this.getMat("rock");
                tunnel.parent = chunkParent;
                tunnel.freezeWorldMatrix();
                // chunk.meshes.push(tunnel);

                const track = MeshBuilder.CreateBox("mine_track", { width: tunnelLength, height: 0.3, depth: 0.5 }, this.scene);
                track.position = new Vector3(tx, 0.15, tz);
                track.material = this.getMat("metal");
                track.parent = chunkParent;
                track.freezeWorldMatrix();
                // chunk.meshes.push(track);

                if (random.chance(0.6)) {
                    const cart = MeshBuilder.CreateBox("mine_cart", { width: 2, height: 1.5, depth: 3 }, this.scene);
                    cart.position = new Vector3(tx, 0.75, tz);
                    cart.material = this.getMat("metalRust");
                    cart.parent = chunkParent;
                    cart.freezeWorldMatrix();
                    // chunk.meshes.push(cart);
                }
            }
        }
    }

    private generateUndergroundWater(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Подземная вода - немного воды (1-2 объекта на чанк)
        const waterCount = random.int(1, 2);
        for (let i = 0; i < waterCount; i++) {
            const wx = random.range(15, size - 15);
            const wz = random.range(15, size - 15);
            const wWorldX = chunkX * this.config.chunkSize + wx;
            const wWorldZ = chunkZ * this.config.chunkSize + wz;

            if (!this.isPositionInGarageArea(wWorldX, wWorldZ, 5)) {
                const radius = random.range(3, 8);
                const lake = MeshBuilder.CreateCylinder("underground_lake", { diameter: radius * 2, height: 0.1 }, this.scene);
                lake.position = new Vector3(wx, -1, wz);
                lake.material = this.getMat("water");
                lake.parent = chunkParent;
                lake.freezeWorldMatrix();
                // chunk.meshes.push(lake);
            }
        }
    }

    private generateUndergroundLighting(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Современное освещение - 3-5 источников света на чанк
        const lightCount = random.int(3, 5);
        for (let i = 0; i < lightCount; i++) {
            const lx = random.range(10, size - 10);
            const lz = random.range(10, size - 10);
            const lWorldX = chunkX * this.config.chunkSize + lx;
            const lWorldZ = chunkZ * this.config.chunkSize + lz;

            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 3)) {
                const light = new PointLight("underground_light", new Vector3(lx, 5, lz), this.scene);
                light.intensity = 0.8;
                light.range = 15;
                light.diffuse = new Color3(1, 0.95, 0.8);
            }
        }
    }

    private generateUndergroundExits(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Выходы на поверхность - 1-2 выхода на чанк
        const exitCount = random.int(1, 2);
        for (let i = 0; i < exitCount; i++) {
            if (random.chance(0.3)) {
                const ex = random.range(15, size - 15);
                const ez = random.range(15, size - 15);
                const eWorldX = chunkX * this.config.chunkSize + ex;
                const eWorldZ = chunkZ * this.config.chunkSize + ez;

                if (!this.isPositionInGarageArea(eWorldX, eWorldZ, 5)) {
                    const shaft = MeshBuilder.CreateBox("exit_shaft", { width: 3, height: 10, depth: 3 }, this.scene);
                    shaft.position = new Vector3(ex, 5, ez);
                    shaft.material = this.getMat("concrete");
                    shaft.parent = chunkParent;
                    shaft.freezeWorldMatrix();
                    // chunk.meshes.push(shaft);

                    for (let step = 0; step < 5; step++) {
                        const stepMesh = MeshBuilder.CreateBox("exit_step", { width: 2.5, height: 0.2, depth: 0.5 }, this.scene);
                        stepMesh.position = new Vector3(ex, step * 0.2, ez + step * 0.5);
                        stepMesh.material = this.getMat("concrete");
                        stepMesh.parent = chunkParent;
                        stepMesh.freezeWorldMatrix();
                        // chunk.meshes.push(stepMesh);
                    }
                }
            }
        }
    }

    // Generate Coastal map - coastline with port, lighthouses, beaches, cliffs
    private generateCoastalContent(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        this.createGround(chunkX, chunkZ, worldX, worldZ, size, "sand", random, chunkParent);
        this.generateGarages(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);

        // Create water (large flat area) - увеличена вероятность
        if (random.chance(0.75)) {
            const waterX = random.range(0, size);
            const waterZ = random.range(0, size);
            const waterSize = random.range(size * 0.3, size * 0.6);

            const water = MeshBuilder.CreateBox("water", { width: waterSize, height: 0.1, depth: waterSize }, this.scene);
            water.position = new Vector3(waterX, -0.05, waterZ);
            water.material = this.getMat("water");
            water.parent = chunkParent;
            water.freezeWorldMatrix();
            // chunk.meshes.push(water);
        }

        // Несколько маяков, большой порт, смешанный берег, водные объекты, все типы зданий
        this.generateLighthouses(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.generateLargeCoastalPort(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.generateCoastalBeach(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.generateCoastalWaterFeatures(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
        this.generateCoastalBuildings(chunkX, chunkZ, size, random, chunkParent);

        // Утёсы (высокие) - увеличена вероятность
        if (random.chance(0.65)) {
            const cliffX = random.range(10, size - 10);
            const cliffZ = random.range(10, size - 10);
            const cliffWorldX = chunkX * this.config.chunkSize + cliffX;
            const cliffWorldZ = chunkZ * this.config.chunkSize + cliffZ;

            if (!this.isPositionInGarageArea(cliffWorldX, cliffWorldZ, 5)) {
                const cliff = MeshBuilder.CreateBox("cliff", { width: random.range(10, 20), height: random.range(6, 12), depth: random.range(8, 15) }, this.scene);
                cliff.position = new Vector3(cliffX, random.range(3, 6), cliffZ);
                cliff.material = this.getMat("rock");
                cliff.parent = chunkParent;
                cliff.freezeWorldMatrix();
                // chunk.meshes.push(cliff);
                new PhysicsAggregate(cliff, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }

        // УДАЛЕНО: Прибрежная растительность (оптимизация производительности)

        this.createRoads(chunkX, chunkZ, size, random, "park", chunkParent);

        // Лодки (3-6 штук)
        this.generateCoastalBoats(chunkX, chunkZ, size, random, chunkParent);

        // Рыболовные сети и снасти (4-8 штук)
        this.generateFishingEquipment(chunkX, chunkZ, size, random, chunkParent);

        // Пляжные зонтики и шезлонги (5-10 штук)
        this.generateBeachFurniture(chunkX, chunkZ, size, random, chunkParent);

        // Буи и ограждения (3-6 штук)
        this.generateBuoys(chunkX, chunkZ, size, random, chunkParent);

        // Якоря и цепи (2-4 штуки)
        this.generateAnchors(chunkX, chunkZ, size, random, chunkParent);

        this.generateCoverObjects(chunkX, chunkZ, worldX, worldZ, size, "park", chunkParent);
        this.generatePOIs(chunkX, chunkZ, worldX, worldZ, size, "park", chunkParent);
        this.generateConsumables(chunkX, chunkZ, worldX, worldZ, size, random, chunkParent);
    }

    private generateCoastalBoats(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(3, 6);
        for (let i = 0; i < count; i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 4)) continue;

            const boatType = random.int(0, 2);
            if (boatType === 0) {
                // Рыбацкая лодка
                const hull = MeshBuilder.CreateBox("boatHull", { width: 2, height: 0.8, depth: 5 }, this.scene);
                hull.position = new Vector3(bx, 0.4, bz);
                hull.rotation.y = random.range(0, Math.PI * 2);
                hull.material = this.getMat("wood");
                hull.parent = chunkParent;
                hull.freezeWorldMatrix();
                new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else if (boatType === 1) {
                // Каноэ/каяк
                const kayak = MeshBuilder.CreateBox("kayak", { width: 0.8, height: 0.4, depth: 4 }, this.scene);
                kayak.position = new Vector3(bx, 0.2, bz);
                kayak.rotation.y = random.range(0, Math.PI * 2);
                kayak.material = random.pick([this.getMat("red"), this.getMat("metal"), this.getMat("yellow")]);
                kayak.parent = chunkParent;
                kayak.freezeWorldMatrix();
            } else {
                // Парусник
                const sailHull = MeshBuilder.CreateBox("sailboatHull", { width: 2.5, height: 1, depth: 7 }, this.scene);
                sailHull.position = new Vector3(bx, 0.5, bz);
                sailHull.rotation.y = random.range(0, Math.PI * 2);
                sailHull.material = this.getMat("wood");
                sailHull.parent = chunkParent;
                sailHull.freezeWorldMatrix();
                new PhysicsAggregate(sailHull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);

                // Мачта
                const mast = MeshBuilder.CreateBox("mast", { width: 0.15, height: 6, depth: 0.15 }, this.scene);
                mast.position = new Vector3(bx, 3.5, bz);
                mast.material = this.getMat("wood");
                mast.parent = chunkParent;
                mast.freezeWorldMatrix();
            }
        }
    }

    private generateFishingEquipment(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(4, 8);
        for (let i = 0; i < count; i++) {
            const fx = random.range(5, size - 5);
            const fz = random.range(5, size - 5);
            const fWorldX = chunkX * this.config.chunkSize + fx;
            const fWorldZ = chunkZ * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 2)) continue;

            const equipType = random.int(0, 3);
            if (equipType === 0) {
                // Рыболовная сеть на сушке
                const netPole1 = MeshBuilder.CreateBox("netPole", { width: 0.1, height: 3, depth: 0.1 }, this.scene);
                netPole1.position = new Vector3(fx - 2, 1.5, fz);
                netPole1.material = this.getMat("wood");
                netPole1.parent = chunkParent;
                netPole1.freezeWorldMatrix();

                const netPole2 = MeshBuilder.CreateBox("netPole", { width: 0.1, height: 3, depth: 0.1 }, this.scene);
                netPole2.position = new Vector3(fx + 2, 1.5, fz);
                netPole2.material = this.getMat("wood");
                netPole2.parent = chunkParent;
                netPole2.freezeWorldMatrix();

                const net = MeshBuilder.CreateBox("fishingNet", { width: 4, height: 2, depth: 0.1 }, this.scene);
                net.position = new Vector3(fx, 2, fz);
                net.material = this.getMat("fenceGray");
                net.parent = chunkParent;
                net.freezeWorldMatrix();
            } else if (equipType === 1) {
                // Ящик с рыбой
                const fishBox = MeshBuilder.CreateBox("fishBox", { width: 1.5, height: 0.5, depth: 1 }, this.scene);
                fishBox.position = new Vector3(fx, 0.25, fz);
                fishBox.material = this.getMat("wood");
                fishBox.parent = chunkParent;
                fishBox.freezeWorldMatrix();
            } else if (equipType === 2) {
                // Удочки
                for (let r = 0; r < random.int(2, 4); r++) {
                    const rod = MeshBuilder.CreateBox("fishingRod", { width: 0.05, height: 3, depth: 0.05 }, this.scene);
                    rod.position = new Vector3(fx + r * 0.3, 1.5, fz);
                    rod.rotation.x = 0.5;
                    rod.material = this.getMat("wood");
                    rod.parent = chunkParent;
                    rod.freezeWorldMatrix();
                }
            } else {
                // Ловушка для крабов
                const trap = MeshBuilder.CreateBox("crabTrap", { width: 0.8, height: 0.6, depth: 1 }, this.scene);
                trap.position = new Vector3(fx, 0.3, fz);
                trap.material = this.getMat("fenceGray");
                trap.parent = chunkParent;
                trap.freezeWorldMatrix();
            }
        }
    }

    private generateBeachFurniture(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(5, 10);
        for (let i = 0; i < count; i++) {
            const bx = random.range(5, size - 5);
            const bz = random.range(5, size - 5);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 2)) continue;

            if (random.chance(0.5)) {
                // Пляжный зонтик
                const pole = MeshBuilder.CreateBox("umbrellaPole", { width: 0.1, height: 2.5, depth: 0.1 }, this.scene);
                pole.position = new Vector3(bx, 1.25, bz);
                pole.material = this.getMat("wood");
                pole.parent = chunkParent;
                pole.freezeWorldMatrix();

                const canopy = MeshBuilder.CreateBox("umbrellaCanopy", { width: 2.5, height: 0.1, depth: 2.5 }, this.scene);
                canopy.position = new Vector3(bx, 2.5, bz);
                canopy.material = random.pick([this.getMat("red"), this.getMat("metal"), this.getMat("yellow"), this.getMat("barrelGreen")]);
                canopy.parent = chunkParent;
                canopy.freezeWorldMatrix();
            } else {
                // Шезлонг
                const lounger = MeshBuilder.CreateBox("lounger", { width: 0.8, height: 0.4, depth: 2 }, this.scene);
                lounger.position = new Vector3(bx, 0.2, bz);
                lounger.rotation.y = random.range(0, Math.PI);
                lounger.material = this.getMat("wood");
                lounger.parent = chunkParent;
                lounger.freezeWorldMatrix();
            }
        }
    }

    private generateBuoys(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(3, 6);
        for (let i = 0; i < count; i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 1)) continue;

            const buoy = MeshBuilder.CreateCylinder("buoy", { diameter: 0.8, height: 1.2 }, this.scene);
            buoy.position = new Vector3(bx, 0.3, bz);
            buoy.material = random.pick([this.getMat("barrelRed"), this.getMat("yellow"), this.getMat("barrelGreen")]);
            buoy.parent = chunkParent;
            buoy.freezeWorldMatrix();
        }
    }

    private generateAnchors(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        const count = random.int(2, 4);
        for (let i = 0; i < count; i++) {
            const ax = random.range(10, size - 10);
            const az = random.range(10, size - 10);
            const aWorldX = chunkX * this.config.chunkSize + ax;
            const aWorldZ = chunkZ * this.config.chunkSize + az;
            if (this.isPositionInGarageArea(aWorldX, aWorldZ, 2)) continue;

            // Якорь (упрощённый)
            const anchor = MeshBuilder.CreateBox("anchor", { width: 1.5, height: 0.3, depth: 2 }, this.scene);
            anchor.position = new Vector3(ax, 0.15, az);
            anchor.material = this.getMat("metalRust");
            anchor.parent = chunkParent;
            anchor.freezeWorldMatrix();

            // Цепь
            const chain = MeshBuilder.CreateBox("chain", { width: 0.1, height: 0.1, depth: 3 }, this.scene);
            chain.position = new Vector3(ax, 0.2, az + 2);
            chain.material = this.getMat("metalRust");
            chain.parent = chunkParent;
            chain.freezeWorldMatrix();
        }
    }

    private generateLighthouses(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Несколько маяков (4-6 на карту) - увеличена вероятность
        if (random.chance(0.35)) {
            const lx = random.range(15, size - 15);
            const lz = random.range(15, size - 15);
            const lWorldX = chunkX * this.config.chunkSize + lx;
            const lWorldZ = chunkZ * this.config.chunkSize + lz;

            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 5)) {
                const base = MeshBuilder.CreateBox("lighthouseBase", { width: 4, height: 3, depth: 4 }, this.scene);
                base.position = new Vector3(lx, 1.5, lz);
                base.material = this.getMat("concrete");
                base.parent = chunkParent;
                base.freezeWorldMatrix();
                // chunk.meshes.push(base);

                const tower = MeshBuilder.CreateBox("lighthouseTower", { width: 2, height: 12, depth: 2 }, this.scene);
                tower.position = new Vector3(lx, 9, lz);
                tower.material = this.getMat("white");
                tower.parent = chunkParent;
                tower.freezeWorldMatrix();
                // chunk.meshes.push(tower);

                const top = MeshBuilder.CreateBox("lighthouseTop", { width: 3, height: 1, depth: 3 }, this.scene);
                top.position = new Vector3(lx, 16.5, lz);
                top.material = this.getMat("yellow");
                top.parent = chunkParent;
                top.freezeWorldMatrix();
                // chunk.meshes.push(top);
            }
        }
    }

    private generateLargeCoastalPort(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Большой порт - увеличена вероятность (2-3 на карту)
        if (random.chance(0.3)) {
            const portX = random.range(25, size - 25);
            const portZ = random.range(25, size - 25);
            const portWorldX = chunkX * this.config.chunkSize + portX;
            const portWorldZ = chunkZ * this.config.chunkSize + portZ;

            if (!this.isPositionInGarageArea(portWorldX, portWorldZ, 20)) {
                const pierCount = random.int(3, 5);
                for (let i = 0; i < pierCount; i++) {
                    const pier = MeshBuilder.CreateBox("coastal_pier", { width: random.range(30, 50), height: 1, depth: 8 }, this.scene);
                    pier.position = new Vector3(portX + (i - pierCount / 2) * 20, 0.5, portZ);
                    pier.material = this.getMat("concrete");
                    pier.parent = chunkParent;
                    pier.freezeWorldMatrix();
                    // chunk.meshes.push(pier);
                }

                const warehouseCount = random.int(3, 5);
                for (let i = 0; i < warehouseCount; i++) {
                    const wh = MeshBuilder.CreateBox("coastal_warehouse", { width: 15, height: 8, depth: 10 }, this.scene);
                    wh.position = new Vector3(portX + random.range(-20, 20), 4, portZ + random.range(-15, 15));
                    wh.material = this.getMat("metalRust");
                    wh.parent = chunkParent;
                    wh.freezeWorldMatrix();
                    // chunk.meshes.push(wh);
                }

                const portCraneCount = random.int(4, 6);
                for (let i = 0; i < portCraneCount; i++) {
                    const craneX = portX + random.range(-25, 25);
                    const craneZ = portZ + random.range(-10, 10);
                    const tower = MeshBuilder.CreateBox("coastal_crane", { width: 2, height: 18, depth: 2 }, this.scene);
                    tower.position = new Vector3(craneX, 9, craneZ);
                    tower.material = this.getMat("yellow");
                    tower.parent = chunkParent;
                    tower.freezeWorldMatrix();
                    // chunk.meshes.push(tower);
                }
            }
        }
    }

    private generateCoastalBeach(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Смешанный берег: песчаные пляжи + скалистые участки (увеличена вероятность)
        if (random.chance(0.7)) {
            const beachX = random.range(10, size - 10);
            const beachZ = random.range(10, size - 10);
            const beachSize = random.range(15, 25);

            const beach = MeshBuilder.CreateBox("beach", { width: beachSize, height: 0.1, depth: beachSize }, this.scene);
            beach.position = new Vector3(beachX, 0.05, beachZ);
            beach.material = this.getMat("sand");
            beach.parent = chunkParent;
            beach.freezeWorldMatrix();
            // chunk.meshes.push(beach);
        }

        // Скалистые участки (увеличена вероятность)
        if (random.chance(0.6)) {
            const rockX = random.range(10, size - 10);
            const rockZ = random.range(10, size - 10);
            const rockSize = random.range(10, 20);

            const rocks = MeshBuilder.CreateBox("coastal_rocks", { width: rockSize, height: random.range(1, 3), depth: rockSize }, this.scene);
            rocks.position = new Vector3(rockX, random.range(0.5, 1.5), rockZ);
            rocks.material = this.getMat("rock");
            rocks.parent = chunkParent;
            rocks.freezeWorldMatrix();
        }
    }

    private generateCoastalWaterFeatures(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Водные объекты: гавань, бухты, острова (увеличена вероятность)
        if (random.chance(0.3)) {
            const harborX = random.range(20, size - 20);
            const harborZ = random.range(20, size - 20);
            const harborSize = random.range(20, 30);

            const harbor = MeshBuilder.CreateCylinder("harbor", { diameter: harborSize * 2, height: 0.1 }, this.scene);
            harbor.position = new Vector3(harborX, -0.05, harborZ);
            harbor.material = this.getMat("water");
            harbor.parent = chunkParent;
            harbor.freezeWorldMatrix();
            // chunk.meshes.push(harbor);
        }

        // Острова (увеличена вероятность)
        if (random.chance(0.25)) {
            const islandX = random.range(20, size - 20);
            const islandZ = random.range(20, size - 20);
            const islandSize = random.range(8, 15);
            const islandHeight = random.range(2, 5);

            const island = MeshBuilder.CreateBox("island", { width: islandSize, height: islandHeight, depth: islandSize }, this.scene);
            island.position = new Vector3(islandX, islandHeight / 2, islandZ);
            island.material = this.getMat("rock");
            island.parent = chunkParent;
            island.freezeWorldMatrix();
        }
    }

    private generateCoastalBuildings(chunkX: number, chunkZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // Все типы зданий: рыбацкие, военные, курортные (увеличено количество)
        const buildingCount = random.int(5, 10);
        for (let i = 0; i < buildingCount; i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunkX * this.config.chunkSize + bx;
            const bWorldZ = chunkZ * this.config.chunkSize + bz;

            if (!this.isPositionInGarageArea(bWorldX, bWorldZ, 8)) {
                const buildingType = random.next();
                let w: number, h: number, d: number;
                let material: string;

                if (buildingType < 0.4) {
                    // Рыбацкие домики
                    w = random.range(5, 7);
                    h = random.range(3, 5);
                    d = random.range(5, 7);
                    material = "wood";
                } else if (buildingType < 0.7) {
                    // Военные объекты
                    w = random.range(7, 9);
                    h = random.range(4, 8);
                    d = random.range(7, 9);
                    material = "concrete";
                } else {
                    // Курортные здания
                    w = random.range(10, 14);
                    h = random.range(6, 10);
                    d = random.range(10, 14);
                    material = random.pick(["plaster", "white"]);
                }

                const building = MeshBuilder.CreateBox("coastal_building", { width: w, height: h, depth: d }, this.scene);
                building.position = new Vector3(bx, h / 2, bz);
                building.material = this.getMat(material);
                building.parent = chunkParent;
                building.freezeWorldMatrix();
                // chunk.meshes.push(building);
                new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }

    // Генерация припасов на карте
    private generateConsumables(chunkX: number, chunkZ: number, worldX: number, worldZ: number, size: number, random: SeededRandom, chunkParent: TransformNode): void {
        // УЛУЧШЕНО: Генерируем 2-4 припаса на чанк (было 1-3) для большего разнообразия
        const count = random.int(2, 4);

        for (let i = 0; i < count; i++) {
            let attempts = 0;
            let x: number, z: number;

            // Ищем свободное место (не в гараже, не в зданиях)
            // УВЕЛИЧЕННЫЙ MARGIN для гарантированного исключения зоны гаража
            do {
                x = worldX + random.range(5, size - 5);
                z = worldZ + random.range(5, size - 5);
                attempts++;
            } while (this.isPositionInGarageArea(x, z, 5) && attempts < 20); // Увеличен margin и attempts

            if (attempts >= 10) continue; // Пропускаем если не нашли место

            // Выбираем случайный тип припаса
            const consumableTypes = ["health", "speed", "armor", "ammo", "damage"];
            const type = random.pick(consumableTypes);

            const position = new Vector3(x, 1.0, z);

            // Создаём визуализацию припаса
            const consumable = MeshBuilder.CreateBox(`consumable_${type}`, {
                width: 0.8,
                height: 0.8,
                depth: 0.8
            }, this.scene);

            consumable.position.copyFrom(position);

            // Используем кэшированный материал с цветом припаса и свечением
            const consumableMat = this.getMat(`consumable_${type}`);
            consumable.material = consumableMat;
            
            // Получаем цвет из материала для анимации
            const consumableColor = (consumableMat as StandardMaterial).diffuseColor;

            const initialY = consumable.position.y;
            const rotationSpeed = 0.03;
            const bobSpeed = 2.5;
            const bobAmplitude = 0.4;

            consumable.parent = chunkParent;
            // Не замораживаем матрицу для анимации вращения
            // chunk.meshes.push(consumable);

            // Metadata для подбора и анимации
            consumable.metadata = {
                type: "consumable",
                consumableType: type,
                position: position.clone(),
                // Данные для анимации
                animData: {
                    pulseTime: 0,
                    animTime: 0,
                    initialY: initialY,
                    rotationSpeed: rotationSpeed,
                    bobSpeed: bobSpeed,
                    bobAmplitude: bobAmplitude,
                    color: consumableColor,
                    mat: consumableMat
                }
            };

            // Сохраняем в список
            this.consumablePickups.push({
                mesh: consumable,
                type: type,
                position: position
            });
        }
    }

    // Обновление анимации припасов (вызывается из централизованного update)
    updateConsumablesAnimation(deltaTime: number): void {
        for (let i = this.consumablePickups.length - 1; i >= 0; i--) {
            const pickup = this.consumablePickups[i];
            if (!pickup || !pickup.mesh || pickup.mesh.isDisposed()) {
                this.consumablePickups.splice(i, 1);
                continue;
            }

            const mesh = pickup.mesh;
            const animData = mesh.metadata?.animData;
            if (!animData) continue;

            // Обновляем время анимации
            animData.pulseTime += deltaTime;
            animData.animTime += deltaTime;

            // Пульсация свечения
            const pulse = 0.5 + Math.sin(animData.pulseTime * 3) * 0.3;
            animData.mat.emissiveColor = animData.color.scale(pulse);

            // Вращение
            mesh.rotation.y += animData.rotationSpeed * deltaTime * 60;

            // Покачивание вверх-вниз
            mesh.position.y = animData.initialY + Math.sin(animData.animTime * animData.bobSpeed) * animData.bobAmplitude;

            // Легкое покачивание в стороны
            const sideBob = Math.sin(animData.animTime * animData.bobSpeed * 0.7) * 0.1;
            mesh.rotation.z = sideBob;
        }
    }

    dispose(): void {
        // Disposing all chunks and resources

        // Очищаем все чанки
        this.chunks.forEach((_, key) => this.destroyChunk(key));
        this.chunks.clear();

        // Очищаем двери гаражей
        this.garageDoors.forEach(door => {
            if (door.frontDoor && !door.frontDoor.isDisposed()) door.frontDoor.dispose();
            if (door.backDoor && !door.backDoor.isDisposed()) door.backDoor.dispose();
            if (door.frontDoorPhysics) door.frontDoorPhysics.dispose();
            if (door.backDoorPhysics) door.backDoorPhysics.dispose();
        });
        this.garageDoors = [];

        // Очищаем стены гаражей
        this.garageWalls.forEach(garageWall => {
            garageWall.walls.forEach(wall => {
                if (wall && !wall.isDisposed()) wall.dispose();
            });
        });
        this.garageWalls = [];

        // Очищаем точки захвата гаражей
        this.garageCapturePoints.forEach(cp => {
            if (cp.wrench && !cp.wrench.isDisposed()) cp.wrench.dispose();
        });
        this.garageCapturePoints = [];

        // Очищаем припасы
        this.consumablePickups.forEach(pickup => {
            if (pickup.mesh && !pickup.mesh.isDisposed()) pickup.mesh.dispose();
        });
        this.consumablePickups = [];

        // Очищаем массивы
        this.garagePositions = [];
        this.garageAreas = [];
        this.garageOwnership.clear();

        // Очищаем материалы
        this.materials.forEach(mat => mat.dispose());
        this.materials.clear();

        // ChunkSystem disposed
    }
}
