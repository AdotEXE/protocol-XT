import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType,
    Mesh,
    TransformNode,
    VertexBuffer,
    Animation as _Animation,
    PointLight
} from "@babylonjs/core";
import { MapType } from "./menu";
import { RoadNetwork } from "./roadNetwork";
import { TerrainGenerator, NoiseGenerator } from "./noiseGenerator";
import { CoverGenerator } from "./coverGenerator";
import { POISystem, POI } from "./poiSystem";

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
    renderDistance: number;
    unloadDistance: number;
    worldSeed: number;
    mapType?: MapType;
}

// Biome types for variety
type BiomeType = "city" | "industrial" | "residential" | "park" | "wasteland" | "military";

export class ChunkSystem {
    private scene: Scene;
    private config: ChunkConfig;
    private chunks: Map<string, ChunkData> = new Map();
    private materials: Map<string, StandardMaterial> = new Map();
    private lastPlayerChunk = { x: 0, z: 0 };
    
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
    
    // Terrain generator for heightmap
    public terrainGenerator: TerrainGenerator | null = null; // Изменено на public для доступа из game.ts
    
    // Cover generator for obstacles and cover objects
    private coverGenerator: CoverGenerator | null = null;
    
    // POI system for points of interest
    private poiSystem: POISystem | null = null;
    
    // Noise generator for biome transitions
    private biomeNoise: NoiseGenerator | null = null;
    
    // Biome cache for optimization
    private biomeCache: Map<string, BiomeType> = new Map();
    
    public stats = {
        loadedChunks: 0,
        totalMeshes: 0,
        lastUpdateTime: 0
    };
    
    constructor(scene: Scene, config?: Partial<ChunkConfig>) {
        this.scene = scene;
        this.config = {
            chunkSize: 50,
            renderDistance: 1.5,  // Уменьшено для оптимизации производительности
            unloadDistance: 2.5,  // УЛУЧШЕНО: Уменьшено с 3 до 2.5 для более агрессивной очистки памяти
            worldSeed: Date.now(),
            mapType: "normal", // По умолчанию
            ...config
        };
        // ChunkSystem constructor called
        this.createMaterials();
        
        // Initialize road network and terrain generator for normal map
        if (this.config.mapType === "normal") {
            // Create terrain generator FIRST, so it can be passed to road network
            // Передаем callback для проверки гаража
            this.terrainGenerator = new TerrainGenerator(
                this.config.worldSeed,
                (x: number, z: number, margin: number) => this.isPositionInGarageArea(x, z, margin)
            );
            
            // Create separate noise generator for biome transitions (different seed offset)
            this.biomeNoise = new NoiseGenerator(this.config.worldSeed + 12345);
            
            this.roadNetwork = new RoadNetwork(this.scene, {
                worldSeed: this.config.worldSeed,
                chunkSize: this.config.chunkSize,
                highwaySpacing: 200,
                streetSpacing: 40,
                terrainGenerator: this.terrainGenerator
            });
            
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
        
        // ChunkSystem initialized
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
        ];
        
        mats.forEach(([name, r, g, b]) => {
            const mat = new StandardMaterial(name, this.scene);
            mat.diffuseColor = new Color3(r, g, b);
            mat.specularColor = Color3.Black();
            mat.specularPower = 0;
            mat.freeze();
            this.materials.set(name, mat);
        });
    }
    
    // Оптимизация меша (freeze + отключение ненужных вычислений)
    private optimizeMesh(mesh: Mesh): void {
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        mesh.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
        
        // ВАЖНО: земля и дороги остаются pickable для raycast'ов (танк, редактор карт и т.п.)
        // чтобы hover‑физика и инструменты могли определять реальную высоту поверхности.
        const name = mesh.name || "";
        const isGround = name.startsWith("ground_");
        const isRoad = name.startsWith("road_");
        const isRoadMarking = name.startsWith("marking_");
        if (!isGround && !isRoad && !isRoadMarking) {
            mesh.isPickable = false;
        }
        
        // Дополнительные оптимизации для производительности
        if (mesh.material) {
            const mat = mesh.material as StandardMaterial;
            if (!mat.isFrozen) {
                mat.freeze();
            }
        }
        
        // Отключаем ненужные вычисления для статических объектов
        (mesh as unknown as { computeBoundingInfo: boolean }).computeBoundingInfo = false;
    }
    
    /**
     * Устанавливает правильные фильтры коллизий для статических объектов окружения
     * Environment group (mask 2) может сталкиваться с Player (1), Enemy Tanks (8), Enemy Bullets (16)
     */
    private setEnvironmentCollisionFilters(aggregate: PhysicsAggregate): void {
        if (aggregate.shape) {
            aggregate.shape.filterMembershipMask = 2; // Environment group
            aggregate.shape.filterCollideMask = 1 | 8 | 16; // Player (1), enemies (8), enemy bullets (16)
        }
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
    private getMat(name: string): StandardMaterial {
        const mat = this.materials.get(name);
        if (mat) return mat;
        // Fallback to first available material
        const fallback = this.materials.get("concrete");
        if (fallback) return fallback;
        // Create default if nothing exists
        const def = new StandardMaterial("default", this.scene);
        def.diffuseColor = new Color3(0.5, 0.5, 0.5);
        def.specularColor = Color3.Black();
        def.freeze();
        this.materials.set("default", def);
        return def;
    }
    
    private getChunkKey(cx: number, cz: number): string {
        return `${cx},${cz}`;
    }
    
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
        
        if (cx !== this.lastPlayerChunk.x || cz !== this.lastPlayerChunk.z) {
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
        
        // В режиме полигона создаём гараж в углу арены
        if (this.config.mapType === "polygon") {
            // Гараж в юго-западном углу арены (арена 200x200)
            this.createGarageAt(-70, -70, 0);
            // Polygon mode: Created garage and capture points
            return;
        }
        
        // В режиме передовой создаём гараж на западной стороне (база игрока)
        if (this.config.mapType === "frontline") {
            // Гараж на западной стороне карты (600x600)
            this.createGarageAt(-250, 0, 0);
            // Frontline mode: Created garage and capture points
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
            // Очень дальнее кольцо (400 единиц) - 4 гаража
            { x: 150, z: 400 },    // Дальний север-восток
            { x: -150, z: 400 },   // Дальний север-запад
            { x: 150, z: -400 },   // Дальний юг-восток
            { x: -150, z: -400 },  // Дальний юг-запад
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
        
        // Используем существующие материалы или создаём новые
        let garageMat = this.materials.get("building");
        if (!garageMat) {
            garageMat = new StandardMaterial("garageMat", this.scene);
            garageMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
            garageMat.specularColor = Color3.Black();
        }
        
        let floorMat = this.materials.get("concrete");
        if (!floorMat) {
            floorMat = new StandardMaterial("garageFloorMat", this.scene);
            floorMat.diffuseColor = new Color3(0.25, 0.25, 0.28);
            floorMat.specularColor = Color3.Black();
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
        const collisionMat = new StandardMaterial(`garageFloorCollisionMat_${index}`, this.scene);
        collisionMat.alpha = 0;
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
        new PhysicsAggregate(backLeftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
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
        new PhysicsAggregate(backRightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
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
        new PhysicsAggregate(backLintel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // ЛЕВАЯ СТЕНА (сплошная)
        const leftWall = MeshBuilder.CreateBox(`garageLeft_${index}`, {
            width: wallThickness,
            height: wallHeight,
            depth: garageDepth
        }, this.scene);
        leftWall.position = new Vector3(garageX - garageWidth / 2 + wallThickness / 2, wallHeight / 2, garageZ);
        leftWall.material = garageMat;
        new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // ПРАВАЯ СТЕНА (сплошная)
        const rightWall = MeshBuilder.CreateBox(`garageRight_${index}`, {
            width: wallThickness,
            height: wallHeight,
            depth: garageDepth
        }, this.scene);
        rightWall.position = new Vector3(garageX + garageWidth / 2 - wallThickness / 2, wallHeight / 2, garageZ);
        rightWall.material = garageMat;
        new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
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
        new PhysicsAggregate(frontLeftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
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
        new PhysicsAggregate(frontRightWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
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
        new PhysicsAggregate(lintel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // ПЕРЕДНИЕ ВОРОТА (поднимающиеся вверх)
        const frontDoor = MeshBuilder.CreateBox(`garageFrontDoor_${index}`, {
            width: doorWidth - 0.2,
            height: wallHeight * 0.7,
            depth: wallThickness * 0.8
        }, this.scene);
        const frontDoorClosedY = wallHeight * 0.35;
        const frontDoorOpenY = wallHeight + 1.0;
        frontDoor.position = new Vector3(
            garageX,
            frontDoorClosedY,
            garageZ + garageDepth / 2 - wallThickness / 2
        );
        frontDoor.material = doorMat;
        frontDoor.visibility = 0.5; // 50% прозрачность через visibility (не вызывает мерцания)
        frontDoor.isPickable = true; // Включаем возможность raycast для определения, на какую ворота смотрит игрок
        // Физика для непробиваемых ворот (как стены) - анимированный тип для движения
        const frontDoorPhysics = new PhysicsAggregate(frontDoor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        frontDoorPhysics.body.setMotionType(PhysicsMotionType.ANIMATED);
        
        // ЗАДНИЕ ВОРОТА (поднимающиеся вверх)
        const backDoor = MeshBuilder.CreateBox(`garageBackDoor_${index}`, {
            width: doorWidth - 0.2,
            height: wallHeight * 0.7,
            depth: wallThickness * 0.8
        }, this.scene);
        const backDoorClosedY = wallHeight * 0.35;
        const backDoorOpenY = wallHeight + 1.0;
        backDoor.position = new Vector3(
            garageX,
            backDoorClosedY,
            garageZ - garageDepth / 2 + wallThickness / 2
        );
        backDoor.material = doorMat;
        backDoor.visibility = 0.5; // 50% прозрачность через visibility (не вызывает мерцания)
        backDoor.isPickable = true; // Включаем возможность raycast для определения, на какую ворота смотрит игрок
        // Физика для непробиваемых ворот (как стены) - анимированный тип для движения
        const backDoorPhysics = new PhysicsAggregate(backDoor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        backDoorPhysics.body.setMotionType(PhysicsMotionType.ANIMATED);
        
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
        new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
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
        // Танк спавнится в центре гаража, близко к земле
        const spawnPos = new Vector3(garageX, 1.2, garageZ);
        this.garagePositions.push(spawnPos);
        
        // Сохраняем область гаража (с запасом чтобы ничего не спавнилось внутри)
        // УВЕЛИЧЕННЫЙ ЗАПАС для 100% гарантированного исключения зоны гаража
        // ИСПРАВЛЕНИЕ: Увеличен запас для предотвращения рельефа вокруг гаража
        const garageMargin = 15; // Увеличен запас до 15 единиц для полной гарантии отсутствия препятствий
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
        
        // Материал для верстака (дерево - коричневый)
        let workbenchMat = this.materials.get("workbench");
        if (!workbenchMat) {
            workbenchMat = new StandardMaterial("workbenchMat", this.scene);
            workbenchMat.diffuseColor = new Color3(0.4, 0.25, 0.15); // Коричневый цвет дерева
            workbenchMat.specularColor = new Color3(0.1, 0.1, 0.1); // Немного блеска
            workbenchMat.emissiveColor = new Color3(0.05, 0.05, 0.05); // Легкое свечение
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
        
        // Зубчатое колесо (шестерня) - блестящий металл (replaced cylinder with box)
        const gear = MeshBuilder.CreateBox(`workbenchGear_${index}`, {
            width: 0.25,
            height: 0.1,
            depth: 0.25
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
        
        // Болт/гайка (большая) - хромированный/светлый металл (replaced cylinder with box)
        const bolt = MeshBuilder.CreateBox(`workbenchBolt_${index}`, {
            width: 0.15,
            height: 0.12,
            depth: 0.15
        }, this.scene);
        bolt.position = new Vector3(workbenchX - 0.7, topTopY + topThickness / 2 + 0.06, workbenchZ - 0.8);
        bolt.rotation.x = Math.PI / 2;
        bolt.material = boltMat; // Светло-серый блестящий
        bolt.isPickable = false;
        bolt.visibility = 1.0;
        bolt.renderingGroupId = 0;
        topTools.push(bolt);
        
        // ДЕТАЛИ ОТ ТАНКА на нижней столешнице
        // Опорный каток (колесо) - металл с резиной (replaced cylinder with box)
        const roadWheel = MeshBuilder.CreateBox(`workbenchRoadWheel_${index}`, {
            width: 0.4,
            height: 0.2,
            depth: 0.4
        }, this.scene);
        roadWheel.position = new Vector3(workbenchX - 0.4, bottomTopY + topThickness / 2 + 0.1, workbenchZ - 0.5);
        roadWheel.rotation.z = Math.PI / 2;
        roadWheel.material = wheelMat; // Средне-серый металл
        roadWheel.isPickable = false;
        roadWheel.visibility = 1.0;
        roadWheel.renderingGroupId = 0;
        bottomTools.push(roadWheel);
        
        // Пружина подвески - металлический (replaced cylinder with box)
        const spring = MeshBuilder.CreateBox(`workbenchSpring_${index}`, {
            width: 0.12,
            height: 0.3,
            depth: 0.12
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
        
        // Трубка/шланг - черная резина (replaced cylinder with box)
        const hose = MeshBuilder.CreateBox(`workbenchHose_${index}`, {
            width: 0.06,
            height: 0.4,
            depth: 0.06
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
        
        // Патрон (box) - увеличен в 2 раза (replaced cylinder with box)
        const latheChuck = MeshBuilder.CreateBox(`latheChuck_${index}`, {
            width: 0.25 * latheScale,
            height: 0.15 * latheScale,
            depth: 0.25 * latheScale
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
        
        // Шпиндель (вращающийся вал в передней бабке) (replaced cylinder with box)
        const latheSpindle = MeshBuilder.CreateBox(`latheSpindle_${index}`, {
            width: 0.12 * latheScale,
            height: 0.3 * latheScale,
            depth: 0.12 * latheScale
        }, this.scene);
        latheSpindle.position = new Vector3(latheX, baseHeight + latheHeight + 0.35 * latheScale, latheZ - 1.2 * latheScale);
        latheSpindle.rotation.z = Math.PI / 2;
        latheSpindle.rotation.y = Math.PI;
        latheSpindle.material = gearMat; // Блестящий металл
        latheSpindle.isPickable = false;
        latheSpindle.visibility = 1.0;
        latheSpindle.renderingGroupId = 0;
        
        // Центр задней бабки (replaced cylinder with box)
        const latheCenter = MeshBuilder.CreateBox(`latheCenter_${index}`, {
            width: 0.1 * latheScale,
            height: 0.2 * latheScale,
            depth: 0.1 * latheScale
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
        
        // Рукоятки управления (на передней бабке) (replaced cylinder with box)
        const latheHandle1 = MeshBuilder.CreateBox(`latheHandle1_${index}`, {
            width: 0.05 * latheScale,
            height: 0.15 * latheScale,
            depth: 0.05 * latheScale
        }, this.scene);
        latheHandle1.position = new Vector3(latheX - 0.2 * latheScale, baseHeight + latheHeight + 0.4 * latheScale, latheZ - 1.2 * latheScale);
        latheHandle1.rotation.x = Math.PI / 2;
        latheHandle1.material = toolMat;
        latheHandle1.isPickable = false;
        latheHandle1.visibility = 1.0;
        latheHandle1.renderingGroupId = 0;
        
        const latheHandle2 = MeshBuilder.CreateBox(`latheHandle2_${index}`, {
            width: 0.05 * latheScale,
            height: 0.15 * latheScale,
            depth: 0.05 * latheScale
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
        
        // Маховик на задней бабке (replaced cylinder with box)
        const latheWheel = MeshBuilder.CreateBox(`latheWheel_${index}`, {
            width: 0.2 * latheScale,
            height: 0.05 * latheScale,
            depth: 0.2 * latheScale
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
        
        // Ствол пушки (replaced cylinder with box)
        const cannonBarrel = MeshBuilder.CreateBox(`garageCannonBarrel_${index}`, {
            width: cannonDiameter,
            height: cannonLength,
            depth: cannonDiameter
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
                const shell = MeshBuilder.CreateBox(`garageShell_${index}_${i}_${j}`, {
                    width: 0.08,
                    height: 0.3,
                    depth: 0.08
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
        
        this.chunks.forEach((chunk, key) => {
            const dist = Math.max(Math.abs(chunk.x - playerCx), Math.abs(chunk.z - playerCz));
            if (dist > unloadDistance && chunk.loaded) this.hideChunk(chunk);
            if (dist > unloadDistance * 2) this.destroyChunk(key);
        });
        
        this.updateStats();
    }
    
    private loadChunk(cx: number, cz: number): void {
        const key = this.getChunkKey(cx, cz);
        const worldX = cx * this.config.chunkSize;
        const worldZ = cz * this.config.chunkSize;
        
        const node = new TransformNode(`chunk_${key}`, this.scene);
        node.position = new Vector3(worldX, 0, worldZ);
        
        const chunk: ChunkData = {
            x: cx, z: cz, node, meshes: [], loaded: true, lastAccess: Date.now()
        };
        
        this.generateChunkContent(chunk, worldX, worldZ);
        
        // Финальная оптимизация всех мешей чанка для производительности
        this.batchSimilarMeshes(chunk.meshes);
        this.chunks.set(key, chunk);
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
        
        let selectedBiome = allBiomes[0] as BiomeType;
        for (let i = 0; i < cumulative.length - 1; i++) {
            if (normalizedNoise >= (cumulative[i] ?? 0) && normalizedNoise < (cumulative[i + 1] ?? 0)) {
                selectedBiome = allBiomes[i] as BiomeType;
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
                
                let sampleBiome = allBiomes[0] as BiomeType;
                for (let i = 0; i < cumulative.length - 1; i++) {
                    if (sampleNormalized >= (cumulative[i] ?? 0) && sampleNormalized < (cumulative[i + 1] ?? 0)) {
                        sampleBiome = allBiomes[i] as BiomeType;
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
                if (normalizedNoise >= (cumulative[i] ?? 0) && normalizedNoise < (cumulative[i + 1] ?? 0)) {
                    selectedBiome = biomeOptions[i] as BiomeType;
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
    
    private generateChunkContent(chunk: ChunkData, worldX: number, worldZ: number): void {
        const size = this.config.chunkSize;
        const seed = this.config.worldSeed + chunk.x * 10000 + chunk.z;
        const random = new SeededRandom(seed);
        
        // В режиме песочницы генерируем только землю
        if (this.config.mapType === "sandbox") {
            // Простая плоская земля для песочницы
            this.createGround(chunk, worldX, worldZ, size, "wasteland", random);
            // Гаражи уже созданы в createAllGarages(), пропускаем generateGarages
            return;
        }
        
        // В режиме полигона генерируем арену с тренировочными элементами
        if (this.config.mapType === "polygon") {
            this.generatePolygonContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        // В режиме передовой генерируем военную карту с тремя зонами
        if (this.config.mapType === "frontline") {
            this.generateFrontlineContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        // Новые карты
        if (this.config.mapType === "ruins") {
            this.generateRuinsContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        if (this.config.mapType === "canyon") {
            this.generateCanyonContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        if (this.config.mapType === "industrial") {
            this.generateIndustrialMapContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        if (this.config.mapType === "urban_warfare") {
            this.generateUrbanWarfareContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        if (this.config.mapType === "underground") {
            this.generateUndergroundContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        if (this.config.mapType === "coastal") {
            this.generateCoastalContent(chunk, worldX, worldZ, size, random);
            return;
        }
        
        // For normal map, use completely random biomes (no distance dependency)
        let biome: BiomeType;
        if (this.config.mapType === "normal") {
            biome = this.getRandomBiome(worldX + size/2, worldZ + size/2, random);
        } else {
            biome = this.getBiome(worldX + size/2, worldZ + size/2, random);
        }
        
        // Ground based on biome (heightmap)
        this.createGround(chunk, worldX, worldZ, size, biome, random);
        
        // КРИТИЧЕСКИ ВАЖНО: Гаражи генерируем ПЕРВЫМИ, чтобы исключить их области из генерации других объектов
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
        // Roads - use RoadNetwork for better procedural roads
        this.createRoads(chunk, size, random, biome);
        
        // Content based on biome
        switch (biome) {
            case "city": this.generateCity(chunk, size, random); break;
            case "industrial": this.generateIndustrial(chunk, size, random); break;
            case "residential": this.generateResidential(chunk, size, random); break;
            case "park": this.generatePark(chunk, size, random); break;
            case "wasteland": this.generateWasteland(chunk, size, random); break;
            case "military": this.generateMilitary(chunk, size, random); break;
        }

        // Terrain features (hills, water, craters, platforms)
        this.addTerrainFeatures(chunk, size, random, biome);
        
        // Add terrain details (rocks, boulders) for natural biomes
        if (biome === "park" || biome === "wasteland" || biome === "military") {
            this.addTerrainDetails(chunk, size, random, biome);
        }
        
        // Generate cover objects (containers, cars, barriers, etc.)
        this.generateCoverObjects(chunk, worldX, worldZ, size, biome);
        
        // Generate POIs (capture points, ammo depots, etc.)
        this.generatePOIs(chunk, worldX, worldZ, size, biome);

        // Scatter generic props for uniqueness (уменьшено количество)
        // this.addScatteredProps(chunk, size, random); // Временно отключено для оптимизации
        
        // Генерируем припасы
        this.generateConsumables(chunk, worldX, worldZ, size, random);
        
        // ИСПРАВЛЕНИЕ: Постобработка чанка для заполнения дыр между соседними чанками
        this.postProcessChunk(chunk, worldX, worldZ, size, biome);
    }
    
    // Постобработка чанка для заполнения дыр между соседними чанками
    private postProcessChunk(chunk: ChunkData, worldX: number, worldZ: number, size: number, biome: BiomeType | string): void {
        if (!this.terrainGenerator) return;
        
        // Находим ground mesh для этого чанка
        const ground = chunk.meshes.find(m => m.name.includes("ground"));
        if (!ground || !ground.getVerticesData(VertexBuffer.PositionKind)) return;
        
        const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
        const subdivisions = Math.sqrt(positions.length / 3) - 1;
        
        // УЛУЧШЕНО: Проверяем границы чанка и сглаживаем их с соседними чанками
        const edgeSmoothingRadius = 3; // УВЕЛИЧЕНО с 2 до 3 для более агрессивного сглаживания
        
        for (let gz = 0; gz <= subdivisions; gz++) {
            for (let gx = 0; gx <= subdivisions; gx++) {
                const isOnEdge = (gx <= edgeSmoothingRadius || gx >= subdivisions - edgeSmoothingRadius ||
                                 gz <= edgeSmoothingRadius || gz >= subdivisions - edgeSmoothingRadius);
                
                if (isOnEdge) {
                    const idx = (gz * (subdivisions + 1) + gx) * 3;
                    const currentHeight = positions[idx + 1] ?? 0;
                    
                    // Получаем координаты в мировом пространстве
                    const sampleX = worldX + (gx / subdivisions) * size;
                    const sampleZ = worldZ + (gz / subdivisions) * size;
                    
                    // Проверяем соседние чанки
                    const neighborCheckDist = size / subdivisions;
                    const neighborHeights: number[] = [];
                    
                    // Проверяем 8 направлений (включая диагонали)
                    const directions = [
                        { dx: neighborCheckDist, dz: 0 },
                        { dx: -neighborCheckDist, dz: 0 },
                        { dx: 0, dz: neighborCheckDist },
                        { dx: 0, dz: -neighborCheckDist },
                        { dx: neighborCheckDist * 0.707, dz: neighborCheckDist * 0.707 },
                        { dx: -neighborCheckDist * 0.707, dz: -neighborCheckDist * 0.707 },
                        { dx: neighborCheckDist * 0.707, dz: -neighborCheckDist * 0.707 },
                        { dx: -neighborCheckDist * 0.707, dz: neighborCheckDist * 0.707 }
                    ];
                    
                    for (const dir of directions) {
                        const neighborX = sampleX + dir.dx;
                        const neighborZ = sampleZ + dir.dz;
                        
                        // Проверяем что соседняя точка не в гараже
                        let inGarage = false;
                        for (const garagePos of this.garagePositions) {
                            const garageRadius = 25; // Увеличено с 15 до 25
                            const dx = Math.abs(neighborX - garagePos.x);
                            const dz = Math.abs(neighborZ - garagePos.z);
                            if (dx < garageRadius && dz < garageRadius) {
                                inGarage = true;
                                break;
                            }
                        }
                        
                        if (!inGarage) {
                            const neighborHeight = this.terrainGenerator.getHeight(neighborX, neighborZ, typeof biome === "string" ? biome : "dirt");
                            if (isFinite(neighborHeight)) {
                                neighborHeights.push(neighborHeight);
                            }
                        }
                    }
                    
                    // Если есть соседние высоты, сглаживаем текущую высоту
                    if (neighborHeights.length > 0 && currentHeight !== undefined) {
                        const avgNeighborHeight = neighborHeights.reduce((a, b) => a + b, 0) / neighborHeights.length;
                        const heightDiff = Math.abs(currentHeight - avgNeighborHeight);
                        
                        // УЛУЧШЕНО: Если разница большая (более 1.5 единиц), сглаживаем более агрессивно
                        if (heightDiff > 1.5) {
                            // Используем плавное сглаживание в зависимости от расстояния до края
                            const edgeDist = Math.min(
                                Math.min(gx, subdivisions - gx),
                                Math.min(gz, subdivisions - gz)
                            );
                            // Более агрессивное сглаживание на границах
                            // Используем smoothstep для более плавного перехода
                            const normalizedDist = edgeDist / edgeSmoothingRadius;
                            const smoothFactor = normalizedDist * normalizedDist * (3 - 2 * normalizedDist);
                            const finalSmoothing = Math.max(0.4, Math.min(0.8, smoothFactor));
                            
                            const smoothedHeight = currentHeight * (1 - finalSmoothing) + avgNeighborHeight * finalSmoothing;
                            positions[idx + 1] = smoothedHeight;
                        }
                    }
                }
            }
        }
        
        // Обновляем вершины ground mesh
        ground.updateVerticesData(VertexBuffer.PositionKind, positions, true);
        ground.refreshBoundingInfo(true);
    }
    
    private createGround(chunk: ChunkData, worldX: number, worldZ: number, size: number, biome: BiomeType | string, _random: SeededRandom): void {
        // Проверяем, не создан ли уже ground для этого чанка
        const existingGround = chunk.meshes.find(m => m.name.includes("ground"));
        if (existingGround) {
            // Ground already exists for chunk, skipping creation
            return;
        }
        
        // ВАЖНО: Всегда создаём ground для чанка, даже если в нём есть гараж
        // Пол гаража будет создан поверх ground, но ground нужен для остальной части чанка
        // Это предотвращает появление огромных дыр размером с чанк
        
        // Ground with biome-specific color
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
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем, не находится ли весь чанк в области гаража
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;
        
        if (this.isPositionInGarageArea(chunkCenterX, chunkCenterZ, 25)) {
            // Весь чанк в гараже, пропускаем создание ground
            return;
        }
        
        // If terrain generator is available, build a single heightmap ground mesh instead of many blocky boxes
        if (this.terrainGenerator) {
            const subdivisions = 24; // Оптимизировано с 32 до 24 для производительности
            // Уникальное имя для каждого чанка, чтобы избежать конфликтов
            const ground = MeshBuilder.CreateGround(`ground_${chunk.x}_${chunk.z}`, {
                width: size,
                height: size,
                subdivisions,
                updatable: true
            }, this.scene);
            
            // Sample heights from terrain generator
            const positions = ground.getVerticesData(VertexBuffer.PositionKind);
            if (positions) {
                const vertsPerSide = subdivisions + 1;
                const garageRadius = 25; // Увеличено с 15 до 25 для лучшей защиты
                
                for (let gz = 0; gz < vertsPerSide; gz++) {
                    for (let gx = 0; gx < vertsPerSide; gx++) {
                        const idx = (gz * vertsPerSide + gx) * 3;
                        const sampleX = worldX + (gx / subdivisions) * size;
                        const sampleZ = worldZ + (gz / subdivisions) * size;
                        
                        // Проверяем, не находится ли эта точка в области гаража
                        let inGarage = false;
                        for (const garagePos of this.garagePositions) {
                            const dx = Math.abs(sampleX - garagePos.x);
                            const dz = Math.abs(sampleZ - garagePos.z);
                            if (dx < garageRadius && dz < garageRadius) {
                                inGarage = true;
                                break;
                            }
                        }
                        
                        // Если точка в гараже, устанавливаем высоту на уровень пола гаража (0)
                        // ИСПРАВЛЕНИЕ: Также сглаживаем область вокруг гаража для плавного выезда
                        if (inGarage) {
                            positions[idx + 1] = 0; // Пол гаража на уровне 0
                        } else {
                            // ИСПРАВЛЕНИЕ: Проверяем расстояние до гаража для плавного перехода
                            let minGarageDist = Infinity;
                            for (const garagePos of this.garagePositions) {
                                const dx = Math.abs(sampleX - garagePos.x);
                                const dz = Math.abs(sampleZ - garagePos.z);
                                const dist = Math.sqrt(dx * dx + dz * dz);
                                minGarageDist = Math.min(minGarageDist, dist);
                            }
                            
                            // Если точка близко к гаражу (в пределах 30 единиц), сглаживаем высоту
                            const garageSmoothingRadius = 30; // Увеличено с 20 до 30
                            let height = this.terrainGenerator.getHeight(sampleX, sampleZ, typeof biome === "string" ? biome : "dirt");
                            
                            if (minGarageDist < garageSmoothingRadius) {
                                // Плавный переход от гаража (высота 0) к нормальной высоте
                                const smoothingFactor = 1.0 - (minGarageDist / garageSmoothingRadius);
                                // Используем smoothstep для более плавного перехода
                                const smoothFactor = smoothingFactor * smoothingFactor * (3 - 2 * smoothingFactor);
                                // Смешиваем высоту с нулём (уровень гаража) для плавного выезда
                                height = height * (1 - smoothFactor * 0.8) + 0 * (smoothFactor * 0.8);
                                // Ограничиваем максимальную высоту вблизи гаража
                                if (minGarageDist < 15) {
                                    height = Math.min(height, 1.0); // Максимум 1 единица высоты вблизи гаража
                                }
                            }
                            
                            // ИСПРАВЛЕНИЕ: Сглаживание границ чанков для предотвращения дыр
                            // Проверяем точки на границах чанка и сглаживаем их с соседними чанками
                            const isOnEdge = (gx === 0 || gx === subdivisions || gz === 0 || gz === subdivisions);
                            if (isOnEdge && this.terrainGenerator) {
                                // Получаем высоты соседних точек из соседних чанков
                                const neighborDist = 0.5;
                                const neighborHeights: number[] = [];
                                
                                // Проверяем 4 соседние точки (север, юг, восток, запад)
                                const neighbors = [
                                    { x: sampleX, z: sampleZ + neighborDist },
                                    { x: sampleX, z: sampleZ - neighborDist },
                                    { x: sampleX + neighborDist, z: sampleZ },
                                    { x: sampleX - neighborDist, z: sampleZ }
                                ];
                                
                                for (const neighbor of neighbors) {
                                    // Проверяем что соседняя точка не в гараже
                                    let neighborInGarage = false;
                                    for (const garagePos of this.garagePositions) {
                                        const dx = Math.abs(neighbor.x - garagePos.x);
                                        const dz = Math.abs(neighbor.z - garagePos.z);
                                        if (dx < 25 && dz < 25) { // Увеличено до 25
                                            neighborInGarage = true;
                                            break;
                                        }
                                    }
                                    
                                    if (!neighborInGarage) {
                                        const neighborHeight = this.terrainGenerator.getHeight(neighbor.x, neighbor.z, typeof biome === "string" ? biome : "dirt");
                                        if (isFinite(neighborHeight)) {
                                            neighborHeights.push(neighborHeight);
                                        }
                                    }
                                }
                                
                                // Если есть соседние высоты, сглаживаем текущую высоту
                                if (neighborHeights.length > 0) {
                                    const avgNeighborHeight = neighborHeights.reduce((a, b) => a + b, 0) / neighborHeights.length;
                                    const heightDiff = Math.abs(height - avgNeighborHeight);
                                    
                                    // Если разница большая (более 3 единиц), сглаживаем
                                    if (heightDiff > 3.0) {
                                        height = height * 0.7 + avgNeighborHeight * 0.3; // 70% текущая, 30% соседняя
                                    }
                                }
                            }
                            
                            // ИСПРАВЛЕНИЕ: Минимальная высота для предотвращения глубоких дыр
                            if (height < -2.0) {
                                height = -2.0;
                            }
                            
                            positions[idx + 1] = height;
                        }
                    }
                }
                
                // ЗАПОЛНЕНИЕ ПРОБЕЛОВ: Проверка сетки высот и заполнение дыр
                const maxHeightDiff = 5.0;
                const fillIterations = 2;
                
                for (let iter = 0; iter < fillIterations; iter++) {
                    for (let gz = 1; gz < vertsPerSide - 1; gz++) {
                        for (let gx = 1; gx < vertsPerSide - 1; gx++) {
                            const idx = (gz * vertsPerSide + gx) * 3;
                            const currentHeight = positions[idx + 1] ?? 0;
                            
                            // Проверяем 4 соседа
                            const neighbors = [
                                positions[((gz - 1) * vertsPerSide + gx) * 3 + 1] ?? 0, // North
                                positions[((gz + 1) * vertsPerSide + gx) * 3 + 1] ?? 0, // South
                                positions[(gz * vertsPerSide + (gx - 1)) * 3 + 1] ?? 0, // West
                                positions[(gz * vertsPerSide + (gx + 1)) * 3 + 1] ?? 0  // East
                            ];
                            
                            // Находим среднюю высоту соседей
                            const avgNeighborHeight = neighbors.reduce((sum, h) => sum + (h ?? 0), 0) / neighbors.length;
                            const diff = Math.abs(currentHeight - avgNeighborHeight);
                            
                            // Если разница слишком большая, заполняем пробел
                            if (diff > maxHeightDiff) {
                                // Плавно сглаживаем к средней высоте соседей
                                positions[idx + 1] = currentHeight * 0.7 + avgNeighborHeight * 0.3;
                            }
                        }
                    }
                }
                
                ground.updateVerticesData(VertexBuffer.PositionKind, positions, true);
                ground.refreshBoundingInfo(true);
            }
            
            // Позиция относительно chunk.node (который уже позиционирован в worldX, worldZ)
            // Ground должен начинаться с (0, 0, 0) относительно chunk.node
            ground.position = new Vector3(0, 0, 0);
            ground.material = this.getMat(groundMat);
            ground.parent = chunk.node;
            
            // Устанавливаем renderOrder для правильного рендеринга (ground должен рендериться первым)
            ground.renderingGroupId = 0;
            
            // Отключаем тени для ground, чтобы избежать артефактов
            ground.receiveShadows = false;
            (ground as unknown as { castShadows: boolean }).castShadows = false;
            
            this.optimizeMesh(ground);
            chunk.meshes.push(ground);
            const groundPhysics = new PhysicsAggregate(ground, PhysicsShapeType.MESH, { mass: 0 }, this.scene);
            this.setEnvironmentCollisionFilters(groundPhysics);
            return;
        }
        
        // Fallback: flat ground if no terrain generator
        const ground = MeshBuilder.CreateBox(`ground_${chunk.x}_${chunk.z}`, { width: size, height: 0.1, depth: size }, this.scene);
        // Позиция относительно chunk.node (который уже позиционирован в worldX, worldZ)
        // Ground должен начинаться с (0, 0, 0) относительно chunk.node, чтобы избежать дублирования
        // Исправлено: y = 0 вместо -0.05 для правильной коллизии с танком
        ground.position = new Vector3(0, 0, 0);
        
        // Устанавливаем renderOrder для правильного рендеринга (ground должен рендериться первым)
        ground.renderingGroupId = 0;
        
        // Отключаем тени для ground, чтобы избежать артефактов
        ground.receiveShadows = false;
        (ground as unknown as { castShadows: boolean }).castShadows = false;
        
        ground.material = this.getMat(groundMat);
        ground.parent = chunk.node;
        this.optimizeMesh(ground);
        chunk.meshes.push(ground);
        const groundPhysics = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        this.setEnvironmentCollisionFilters(groundPhysics);
    }
    
    private createRoads(chunk: ChunkData, size: number, random: SeededRandom, biome?: BiomeType): void {
        // Use RoadNetwork if available
        if (this.roadNetwork && biome) {
            const worldX = chunk.x * size;
            const worldZ = chunk.z * size;
            const roadMeshes = this.roadNetwork.createRoadMeshes(chunk.x, chunk.z, biome, chunk.node);
            for (const mesh of roadMeshes) {
                // Adjust position relative to chunk
                mesh.position.x -= worldX;
                mesh.position.z -= worldZ;
                mesh.freezeWorldMatrix();
                chunk.meshes.push(mesh);
            }
            return;
        }
        
        // Fallback: Road variety - different patterns
        const pattern = random.int(0, 3);
        const asphalt = this.getMat("asphalt");
        
        if (pattern === 0) {
            // Horizontal road
            const road = MeshBuilder.CreateBox("rd", { width: size, height: 0.01, depth: 8 }, this.scene);
            road.position = new Vector3(size/2, 0.02, size - 4);
            road.material = asphalt;
            road.parent = chunk.node;
            road.freezeWorldMatrix();
            chunk.meshes.push(road);
        } else if (pattern === 1) {
            // Vertical road
            const road = MeshBuilder.CreateBox("rd", { width: 8, height: 0.01, depth: size }, this.scene);
            road.position = new Vector3(size - 4, 0.02, size/2);
            road.material = asphalt;
            road.parent = chunk.node;
            road.freezeWorldMatrix();
            chunk.meshes.push(road);
        } else if (pattern === 2) {
            // Cross roads
            const hRoad = MeshBuilder.CreateBox("rd", { width: size, height: 0.01, depth: 6 }, this.scene);
            hRoad.position = new Vector3(size/2, 0.02, size/2);
            hRoad.material = asphalt;
            hRoad.parent = chunk.node;
            hRoad.freezeWorldMatrix();
            chunk.meshes.push(hRoad);
            
            const vRoad = MeshBuilder.CreateBox("rd", { width: 6, height: 0.01, depth: size }, this.scene);
            vRoad.position = new Vector3(size/2, 0.02, size/2);
            vRoad.material = asphalt;
            vRoad.parent = chunk.node;
            vRoad.freezeWorldMatrix();
            chunk.meshes.push(vRoad);
        } else {
            // L-shaped road
            const hRoad = MeshBuilder.CreateBox("rd", { width: size/2, height: 0.01, depth: 6 }, this.scene);
            hRoad.position = new Vector3(size * 0.75, 0.02, size - 3);
            hRoad.material = asphalt;
            hRoad.parent = chunk.node;
            hRoad.freezeWorldMatrix();
            chunk.meshes.push(hRoad);
            
            const vRoad = MeshBuilder.CreateBox("rd", { width: 6, height: 0.01, depth: size/2 }, this.scene);
            vRoad.position = new Vector3(size - 3, 0.02, size * 0.75);
            vRoad.material = asphalt;
            vRoad.parent = chunk.node;
            vRoad.freezeWorldMatrix();
            chunk.meshes.push(vRoad);
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
    private addTerrainDetails(chunk: ChunkData, size: number, random: SeededRandom, biome: BiomeType): void {
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
            const dWorldX = chunk.x * this.config.chunkSize + dx;
            const dWorldZ = chunk.z * this.config.chunkSize + dz;
            
            if (this.isPositionInGarageArea(dWorldX, dWorldZ, 2)) continue;
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
                        rubblePiece.parent = chunk.node;
                        this.optimizeMesh(rubblePiece);
                        chunk.meshes.push(rubblePiece);
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
            
            detail.parent = chunk.node;
            this.optimizeMesh(detail); // Use optimized mesh function for better performance
            chunk.meshes.push(detail);
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
    private addBuildingDetails(building: Mesh, width: number, height: number, depth: number, random: SeededRandom, chunk: ChunkData): void {
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
                    const windowMat = new StandardMaterial("windowMat", this.scene);
                    windowMat.diffuseColor = random.chance(0.3) ? new Color3(0.8, 0.9, 1) : new Color3(0.1, 0.1, 0.15); // Some lit, some dark
                    window.material = windowMat;
                    window.parent = building;
                    chunk.meshes.push(window);
                }
            }
        }
        
        // Add door at ground level (if building is tall enough)
        if (height > 5 && random.chance(0.8)) {
            const door = MeshBuilder.CreateBox("door", { width: 2, height: 3, depth: 0.1 }, this.scene);
            door.position = new Vector3(0, -height / 2 + 1.5, depth / 2 + 0.05);
            const doorMat = new StandardMaterial("doorMat", this.scene);
            doorMat.diffuseColor = new Color3(0.2, 0.15, 0.1); // Brown door
            door.material = doorMat;
            door.parent = building;
            chunk.meshes.push(door);
        }
    }
    
    private generateCity(chunk: ChunkData, size: number, random: SeededRandom): void {
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
        
        // Generate clustered buildings - cities have building clusters
        const buildingCount = random.int(1, 3);
        const clusterCount = Math.min(buildingCount, 2); // 1-2 clusters
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
            
            // Проверяем, не находится ли здание внутри гаража
            const worldX = chunk.x * this.config.chunkSize + bx;
            const worldZ = chunk.z * this.config.chunkSize + bz;
            if (this.isPositionInGarageArea(worldX, worldZ, Math.max(type.w, type.d) / 2)) {
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
            building.parent = chunk.node;
            building.freezeWorldMatrix();
            chunk.meshes.push(building);
            new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Add building details (windows, doors) for taller buildings
            if (type.h > 10 && random.chance(0.6)) {
                this.addBuildingDetails(building, type.w * scale, type.h * scale, type.d * scale, random, chunk);
            }
            
            existingObjects.push({ pos: new Vector3(bx, 0, bz), radius: buildingRadius });
        }
        
        // If no buildings were placed, try placing one at center (fallback)
        if (existingObjects.length === 0) {
            const type = random.pick(buildingTypes);
            const bx = size / 2 + random.range(-15, 15);
            const bz = size / 2 + random.range(-15, 15);
            
            const worldX = chunk.x * this.config.chunkSize + bx;
            const worldZ = chunk.z * this.config.chunkSize + bz;
            if (!this.isPositionInGarageArea(worldX, worldZ, Math.max(type.w, type.d) / 2)) {
                const terrainHeight = this.getTerrainHeight(worldX, worldZ, "city");
                const building = MeshBuilder.CreateBox("b", { width: type.w, height: type.h, depth: type.d }, this.scene);
                building.position = new Vector3(bx, type.h / 2 + terrainHeight, bz);
                building.material = this.getMat(type.mat);
                building.parent = chunk.node;
                building.freezeWorldMatrix();
                chunk.meshes.push(building);
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
        building.parent = chunk.node;
        building.freezeWorldMatrix();
        chunk.meshes.push(building);
        new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // GARAGE/TUNNEL you can drive into!
        if (random.chance(0.3)) {
            const gw = 8, gh = 4, gd = 12;
            const gx = bx + random.range(-20, 20);
            const gz = bz + random.range(-20, 20);
            
            // Проверяем, не находится ли гараж/туннель внутри гаража игрока
            const gWorldX = chunk.x * this.config.chunkSize + gx;
            const gWorldZ = chunk.z * this.config.chunkSize + gz;
            if (this.isPositionInGarageArea(gWorldX, gWorldZ, Math.max(gw, gd) / 2)) {
                // Пропускаем создание гаража/туннеля
            } else {
            // Roof
            const roof = MeshBuilder.CreateBox("gr", { width: gw, height: 0.5, depth: gd }, this.scene);
            roof.position = new Vector3(gx, gh, gz);
            roof.material = this.getMat("concrete");
            roof.parent = chunk.node;
            roof.freezeWorldMatrix();
            chunk.meshes.push(roof);
            // Left wall
            const lw = MeshBuilder.CreateBox("gw", { width: 0.5, height: gh, depth: gd }, this.scene);
            lw.position = new Vector3(gx - gw/2, gh/2, gz);
            lw.material = this.getMat("brick");
            lw.parent = chunk.node;
            lw.freezeWorldMatrix();
            chunk.meshes.push(lw);
            // Right wall
            const rw = MeshBuilder.CreateBox("gw", { width: 0.5, height: gh, depth: gd }, this.scene);
            rw.position = new Vector3(gx + gw/2, gh/2, gz);
            rw.material = this.getMat("brick");
            rw.parent = chunk.node;
            rw.freezeWorldMatrix();
            chunk.meshes.push(rw);
        }
        
        // PARKED CAR
        if (random.chance(0.4)) {
            const cx = bx + random.range(-25, 25);
            const cz = bz + random.range(-25, 25);
            const car = MeshBuilder.CreateBox("car", { width: 2, height: 1.5, depth: 4 }, this.scene);
            car.position = new Vector3(cx, 0.75, cz);
            car.rotation.y = random.range(0, Math.PI * 2);
            car.material = this.getMat(random.pick(["red", "yellow", "metal", "brickDark"]));
            car.parent = chunk.node;
            car.freezeWorldMatrix();
            chunk.meshes.push(car);
            // Убрана физика для декоративных машин (оптимизация)
            }
        }
        
        // FENCE / WALL
        if (random.chance(0.5)) {
            const fenceLen = random.range(8, 20);
            const fx = bx + random.range(-30, 30);
            const fz = bz + random.range(-30, 30);
            
            // Проверяем, не находится ли забор внутри гаража
            const fWorldX = chunk.x * this.config.chunkSize + fx;
            const fWorldZ = chunk.z * this.config.chunkSize + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, fenceLen / 2)) {
                // Пропускаем создание забора
            } else {
            const fence = MeshBuilder.CreateBox("f", { width: fenceLen, height: 2, depth: 0.3 }, this.scene);
            fence.position = new Vector3(fx, 1.01, fz); // Y offset to avoid z-fighting
            fence.rotation.y = random.pick([0, Math.PI / 2]);
            fence.material = this.getMat(random.pick(["wood", "metal", "concrete"]));
            fence.parent = chunk.node;
            fence.freezeWorldMatrix();
            chunk.meshes.push(fence);
            // Убрана физика для декоративных заборов (оптимизация)
            }
        }
        
        // CONCRETE BARRIERS (multiple)
        const barrierCount = random.int(0, 3);
        for (let i = 0; i < barrierCount; i++) {
            const barrierX = random.range(5, size - 5);
            const barrierZ = random.range(5, size - 5);
            
            // Проверяем, не находится ли барьер внутри гаража
            const bWorldX = chunk.x * this.config.chunkSize + barrierX;
            const bWorldZ = chunk.z * this.config.chunkSize + barrierZ;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 2)) {
                continue; // Пропускаем этот барьер
            }
            
            const barrier = MeshBuilder.CreateBox("br", { width: 3, height: 1, depth: 1.5 }, this.scene);
            barrier.position = new Vector3(
                barrierX,
                0.51, // Y offset!
                barrierZ
            );
            barrier.rotation.y = random.range(0, Math.PI);
            barrier.material = this.getMat("concrete");
            barrier.parent = chunk.node;
            barrier.freezeWorldMatrix();
            chunk.meshes.push(barrier);
            // Убрана физика для декоративных барьеров (оптимизация) - оставляем только для важных
        }
        
        // DUMPSTER
        if (random.chance(0.3)) {
            const dumpX = bx + random.range(-20, 20);
            const dumpZ = bz + random.range(-20, 20);
            
            // Проверяем, не находится ли мусорный бак внутри гаража
            const dWorldX = chunk.x * this.config.chunkSize + dumpX;
            const dWorldZ = chunk.z * this.config.chunkSize + dumpZ;
            if (this.isPositionInGarageArea(dWorldX, dWorldZ, 2)) {
                // Пропускаем создание мусорного бака
            } else {
            const dumpster = MeshBuilder.CreateBox("dump", { width: 2, height: 1.5, depth: 3 }, this.scene);
            dumpster.position = new Vector3(dumpX, 0.76, dumpZ);
            dumpster.material = this.getMat("metalRust");
            dumpster.parent = chunk.node;
            dumpster.freezeWorldMatrix();
            chunk.meshes.push(dumpster);
            }
        }
        
        // ДОПОЛНИТЕЛЬНЫЕ СТЕНЫ И ЗАБОРЫ
        const wallCount = random.int(1, 4);
        for (let i = 0; i < wallCount; i++) {
            const wallLen = random.range(6, 18);
            const wx = random.range(5, size - 5);
            const wz = random.range(5, size - 5);
            
            // Проверяем, не находится ли стена внутри гаража
            const wWorldX = chunk.x * this.config.chunkSize + wx;
            const wWorldZ = chunk.z * this.config.chunkSize + wz;
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, wallLen / 2)) {
                continue; // Пропускаем эту стену
            }
            const wall = MeshBuilder.CreateBox("wall", { width: wallLen, height: random.range(2, 4), depth: 0.4 }, this.scene);
            wall.position = new Vector3(wx, random.range(1, 2) + 0.01, wz);
            wall.rotation.y = random.pick([0, Math.PI / 2, Math.PI, Math.PI * 1.5]);
            wall.material = this.getMat(random.pick(["concrete", "brick", "brickDark", "metal"]));
            wall.parent = chunk.node;
            wall.freezeWorldMatrix();
            chunk.meshes.push(wall);
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
            const brWorldX = chunk.x * this.config.chunkSize + bridgeX;
            const brWorldZ = chunk.z * this.config.chunkSize + bridgeZ;
            if (this.isPositionInGarageArea(brWorldX, brWorldZ, Math.max(bridgeW, bridgeD) / 2)) {
                // Пропускаем создание моста
            } else {
            
            // Bridge deck
            const deck = MeshBuilder.CreateBox("bridge", { width: bridgeW, height: 0.3, depth: bridgeD }, this.scene);
            deck.position = new Vector3(bridgeX, bridgeH + 0.15, bridgeZ);
            deck.material = this.getMat("asphalt");
            deck.parent = chunk.node;
            deck.freezeWorldMatrix();
            chunk.meshes.push(deck);
            new PhysicsAggregate(deck, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Bridge supports (columns)
            const supportCount = random.int(2, 4);
            for (let j = 0; j < supportCount; j++) {
                const support = MeshBuilder.CreateBox("bsup", { width: 1.5, height: bridgeH, depth: 1.5 }, this.scene);
                support.position = new Vector3(
                    bridgeX + random.range(-bridgeW/2 + 2, bridgeW/2 - 2),
                    bridgeH / 2,
                    bridgeZ + random.range(-bridgeD/2 + 2, bridgeD/2 - 2)
                );
                support.material = this.getMat("concrete");
                support.parent = chunk.node;
                support.freezeWorldMatrix();
                chunk.meshes.push(support);
                new PhysicsAggregate(support, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
            }
        }
    }
    
    private generateIndustrial(chunk: ChunkData, size: number, random: SeededRandom): void {
        // UNIQUE industrial buildings
        const types = [
            { w: 15, h: 8, d: 12, mat: "metal" },       // Warehouse
            { w: 20, h: 6, d: 30, mat: "metalRust" },   // Factory
            { w: 8, h: 12, d: 8, mat: "brick" },        // Silo
            { w: 25, h: 5, d: 15, mat: "concrete" },    // Hangar
            { w: 10, h: 15, d: 10, mat: "brickDark" },  // Smokestack
            { w: 30, h: 4, d: 20, mat: "metal" },       // Depot
        ];
        
        const type = random.pick(types);
        const bx = size / 2 + random.range(-15, 15);
        const bz = size / 2 + random.range(-15, 15);
        
        // Проверяем, не находится ли здание внутри гаража
        const worldX = chunk.x * this.config.chunkSize + bx;
        const worldZ = chunk.z * this.config.chunkSize + bz;
        if (this.isPositionInGarageArea(worldX, worldZ, Math.max(type.w, type.d) / 2)) {
            return; // Пропускаем генерацию этого чанка, если здание попадает в гараж
        }
        
        const building = MeshBuilder.CreateBox("w", { width: type.w, height: type.h, depth: type.d }, this.scene);
        building.position = new Vector3(bx, type.h / 2, bz);
        building.material = this.getMat(type.mat);
        building.parent = chunk.node;
        building.freezeWorldMatrix();
        chunk.meshes.push(building);
        new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // MULTIPLE CONTAINERS
        const containerCount = random.int(1, 4);
        for (let i = 0; i < containerCount; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            
            // Проверяем, не находится ли контейнер внутри гаража
            const cWorldX = chunk.x * this.config.chunkSize + cx;
            const cWorldZ = chunk.z * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 3)) {
                continue; // Пропускаем этот контейнер
            }
            
            const container = MeshBuilder.CreateBox("c", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
            const stackHeight = random.int(0, 1); // Can be stacked!
            container.position = new Vector3(cx, 1.26 + stackHeight * 2.5, cz);
            container.rotation.y = random.range(0, Math.PI);
            container.material = this.getMat(random.pick(["red", "yellow", "metal", "metalRust"]));
            container.parent = chunk.node;
            container.freezeWorldMatrix();
            chunk.meshes.push(container);
            new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // TRUCK
        if (random.chance(0.3)) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            
            // Проверяем, не находится ли грузовик внутри гаража
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) {
                // Пропускаем создание грузовика
            } else {
            // Cab
            const cab = MeshBuilder.CreateBox("tcab", { width: 2.5, height: 2, depth: 3 }, this.scene);
            cab.position = new Vector3(tx, 1.01, tz);
            cab.material = this.getMat("metal");
            cab.parent = chunk.node;
            cab.freezeWorldMatrix();
            chunk.meshes.push(cab);
            // Trailer
            const trailer = MeshBuilder.CreateBox("ttr", { width: 2.5, height: 3, depth: 8 }, this.scene);
            trailer.position = new Vector3(tx, 1.51, tz - 5.5);
            trailer.material = this.getMat(random.pick(["yellow", "red", "metal"]));
            trailer.parent = chunk.node;
            trailer.freezeWorldMatrix();
            chunk.meshes.push(trailer);
            }
        }
        
        // CRANE
        if (random.chance(0.3)) {
            const cx = bx + random.range(-20, 20);
            const cz = bz + random.range(-20, 20);
            
            // Проверяем, не находится ли кран внутри гаража
            const cWorldX = chunk.x * this.config.chunkSize + cx;
            const cWorldZ = chunk.z * this.config.chunkSize + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
                // Пропускаем создание крана
            } else {
            const tower = MeshBuilder.CreateBox("ct", { width: 2, height: 15, depth: 2 }, this.scene);
            tower.position = new Vector3(cx, 7.5, cz);
            tower.material = this.getMat("yellow");
            tower.parent = chunk.node;
            tower.freezeWorldMatrix();
            chunk.meshes.push(tower);
            const arm = MeshBuilder.CreateBox("ca", { width: 1, height: 1, depth: 18 }, this.scene);
            arm.position = new Vector3(cx, 14, cz + 8);
            arm.material = this.getMat("yellow");
            arm.parent = chunk.node;
            arm.freezeWorldMatrix();
            chunk.meshes.push(arm);
            }
        }
        
        // PIPES / RAILS
        if (random.chance(0.4)) {
            const pipeLen = random.range(10, 25);
            const pipeX = random.range(5, size - 5);
            const pipeZ = random.range(5, size - 5);
            
            // Проверяем, не находится ли труба внутри гаража
            const pWorldX = chunk.x * this.config.chunkSize + pipeX;
            const pWorldZ = chunk.z * this.config.chunkSize + pipeZ;
            if (this.isPositionInGarageArea(pWorldX, pWorldZ, pipeLen / 2)) {
                // Пропускаем создание трубы
            } else {
            const pipe = MeshBuilder.CreateBox("pp", { width: 0.8, height: 0.8, depth: pipeLen }, this.scene);
            pipe.position = new Vector3(pipeX, 0.41, pipeZ);
            pipe.rotation.y = random.range(0, Math.PI);
            pipe.material = this.getMat("metalRust");
            pipe.parent = chunk.node;
            pipe.freezeWorldMatrix();
            chunk.meshes.push(pipe);
            }
        }
        
        // CHAIN LINK FENCE
        if (random.chance(0.4)) {
            const fenceLen = random.range(15, 30);
            const fenceX = random.range(10, size - 10);
            const fenceZ = random.range(10, size - 10);
            
            // Проверяем, не находится ли забор внутри гаража
            const fWorldX = chunk.x * this.config.chunkSize + fenceX;
            const fWorldZ = chunk.z * this.config.chunkSize + fenceZ;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, fenceLen / 2)) {
                // Пропускаем создание забора
            } else {
            const fence = MeshBuilder.CreateBox("clf", { width: fenceLen, height: 3, depth: 0.1 }, this.scene);
            fence.position = new Vector3(fenceX, 1.51, fenceZ);
            fence.rotation.y = random.pick([0, Math.PI / 2]);
            fence.material = this.getMat("metal");
            fence.parent = chunk.node;
            fence.freezeWorldMatrix();
            chunk.meshes.push(fence);
            }
        }
    }
    
    private generateResidential(chunk: ChunkData, size: number, random: SeededRandom): void {
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
        const _clusterCount = Math.min(houseCount, 2); void _clusterCount;
        // House positions and existing objects not currently used but kept for future village generation
        for (let i = 0; i < houseCount; i++) {
            const type = random.pick(houseTypes);
            const hx = size / 3 + i * (size / 3) + random.range(-10, 10);
            const hz = size / 2 + random.range(-15, 15);
            
            // Проверяем, не находится ли дом внутри гаража
            const hWorldX = chunk.x * this.config.chunkSize + hx;
            const hWorldZ = chunk.z * this.config.chunkSize + hz;
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, Math.max(type.w, type.d) / 2)) {
                continue; // Пропускаем этот дом
            }
            
            const house = MeshBuilder.CreateBox("h", { width: type.w, height: type.h, depth: type.d }, this.scene);
            house.position = new Vector3(hx, type.h / 2, hz);
            house.material = this.getMat(type.mat);
            house.parent = chunk.node;
            house.freezeWorldMatrix();
            chunk.meshes.push(house);
            new PhysicsAggregate(house, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // GARAGE attached to house
            if (random.chance(0.4)) {
                const garX = hx + type.w/2 + 2;
                const garZ = hz;
                
                // Проверяем, не находится ли гараж дома внутри гаража игрока
                const gWorldX = chunk.x * this.config.chunkSize + garX;
                const gWorldZ = chunk.z * this.config.chunkSize + garZ;
                if (this.isPositionInGarageArea(gWorldX, gWorldZ, 3)) {
                    // Пропускаем создание гаража дома
                } else {
                const garage = MeshBuilder.CreateBox("gar", { width: 4, height: 3, depth: 5 }, this.scene);
                garage.position = new Vector3(garX, 1.5, garZ);
                garage.material = this.getMat("plaster");
                garage.parent = chunk.node;
                garage.freezeWorldMatrix();
                chunk.meshes.push(garage);
                new PhysicsAggregate(garage, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            }
        }
        
        // PARKED CARS in driveways
        const carCount = random.int(0, 2);
        for (let i = 0; i < carCount; i++) {
            const carX = random.range(10, size - 10);
            const carZ = random.range(10, size - 10);
            
            // Проверяем, не находится ли машина внутри гаража
            const cWorldX = chunk.x * this.config.chunkSize + carX;
            const cWorldZ = chunk.z * this.config.chunkSize + carZ;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) {
                continue; // Пропускаем эту машину
            }
            
            const car = MeshBuilder.CreateBox("car", { width: 2, height: 1.3, depth: 4.5 }, this.scene);
            car.position = new Vector3(carX, 0.66, carZ);
            car.rotation.y = random.range(0, Math.PI * 2);
            car.material = this.getMat(random.pick(["red", "metal", "brickDark", "yellow"]));
            car.parent = chunk.node;
            car.freezeWorldMatrix();
            chunk.meshes.push(car);
        }
        
        // TREES with clustering (groves) and more variety
        const treeCount = random.int(2, 5);
        const treeClusterCount = Math.min(treeCount, 3);
        const treePositions = this.generateClusteredPositions(
            treeCount,
            size,
            3, // min distance between trees
            15, // max distance from cluster center (groves)
            treeClusterCount,
            random
        );
        
        for (const treePos of treePositions) {
            const tx = treePos.x;
            const tz = treePos.z;
            
            // Проверяем, не находится ли дерево внутри гаража
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 1)) {
                continue; // Пропускаем это дерево
            }
            
            // Avoid placing trees on roads
            if (this.isPositionNearRoad(tWorldX, tWorldZ, 3)) {
                continue;
            }
            
            // More variety in tree sizes and shapes
            const treeType = random.pick(["tall", "medium", "short", "wide"]);
            let th: number, tw: number, td: number;
            
            switch (treeType) {
                case "tall":
                    th = random.range(8, 12);
                    tw = random.range(2, 3.5);
                    td = random.range(2, 3.5);
                    break;
                case "medium":
                    th = random.range(5, 8);
                    tw = random.range(2.5, 4);
                    td = random.range(2.5, 4);
                    break;
                case "short":
                    th = random.range(3, 6);
                    tw = random.range(3, 5);
                    td = random.range(3, 5);
                    break;
                case "wide":
                    th = random.range(4, 7);
                    tw = random.range(4, 6);
                    td = random.range(4, 6);
                    break;
                default:
                    th = random.range(5, 8);
                    tw = random.range(2, 4);
                    td = random.range(2, 4);
            }
            
            // Adjust height based on terrain
            const terrainHeight = this.getTerrainHeight(tWorldX, tWorldZ, "residential");
            
            const tree = MeshBuilder.CreateBox("t", { width: tw, height: th, depth: td }, this.scene);
            tree.position = new Vector3(tx, th / 2 + terrainHeight, tz);
            tree.material = this.getMat("leaves");
            tree.parent = chunk.node;
            tree.freezeWorldMatrix();
            chunk.meshes.push(tree);
        }
        
        // MAILBOX
        if (random.chance(0.3)) {
            const mbX = random.range(10, size - 10);
            const mbZ = random.range(10, size - 10);
            
            // Проверяем, не находится ли почтовый ящик внутри гаража
            const mbWorldX = chunk.x * this.config.chunkSize + mbX;
            const mbWorldZ = chunk.z * this.config.chunkSize + mbZ;
            if (this.isPositionInGarageArea(mbWorldX, mbWorldZ, 1)) {
                // Пропускаем создание почтового ящика
            } else {
            const mailbox = MeshBuilder.CreateBox("mb", { width: 0.3, height: 1.2, depth: 0.3 }, this.scene);
            mailbox.position = new Vector3(mbX, 0.61, mbZ);
            mailbox.material = this.getMat("metal");
            mailbox.parent = chunk.node;
            mailbox.freezeWorldMatrix();
            chunk.meshes.push(mailbox);
            }
        }
        
        // WOODEN FENCE around property
        if (random.chance(0.5)) {
            const fenceLen = random.range(10, 20);
            const fenceX = random.range(10, size - 10);
            const fenceZ = random.range(10, size - 10);
            
            // Проверяем, не находится ли забор внутри гаража
            const fWorldX = chunk.x * this.config.chunkSize + fenceX;
            const fWorldZ = chunk.z * this.config.chunkSize + fenceZ;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, fenceLen / 2)) {
                // Пропускаем создание забора
            } else {
            const fence = MeshBuilder.CreateBox("wf", { width: fenceLen, height: 1.5, depth: 0.2 }, this.scene);
            fence.position = new Vector3(fenceX, 0.76, fenceZ);
            fence.rotation.y = random.pick([0, Math.PI / 2]);
            fence.material = this.getMat("wood");
            fence.parent = chunk.node;
            fence.freezeWorldMatrix();
            chunk.meshes.push(fence);
            }
        }
        
        // PLAYGROUND equipment
        if (random.chance(0.2)) {
            const swingX = random.range(15, size - 15);
            const swingZ = random.range(15, size - 15);
            
            // Проверяем, не находится ли качели внутри гаража
            const sWorldX = chunk.x * this.config.chunkSize + swingX;
            const sWorldZ = chunk.z * this.config.chunkSize + swingZ;
            if (this.isPositionInGarageArea(sWorldX, sWorldZ, 2)) {
                // Пропускаем создание качелей
            } else {
            const swing = MeshBuilder.CreateBox("sw", { width: 3, height: 2.5, depth: 0.3 }, this.scene);
            swing.position = new Vector3(swingX, 1.26, swingZ);
            swing.material = this.getMat("metal");
            swing.parent = chunk.node;
            swing.freezeWorldMatrix();
            chunk.meshes.push(swing);
            }
        }
    }
    
    private generatePark(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Trees in groves with more variety
        const treeCount = random.int(4, 8);
        const groveCount = random.int(2, 4);
        const treePositions = this.generateClusteredPositions(
            treeCount,
            size,
            2, // min distance between trees (can be closer in groves)
            12, // max distance from cluster center (grove radius)
            groveCount,
            random
        );
        
        const existingObjects: Array<{ pos: Vector3, radius: number }> = [];
        
        for (const treePos of treePositions) {
            const tx = treePos.x;
            const tz = treePos.z;
            
            // Проверяем, не находится ли дерево внутри гаража
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 2)) {
                continue; // Пропускаем это дерево
            }
            
            // Avoid roads
            if (this.isPositionNearRoad(tWorldX, tWorldZ, 3)) {
                continue;
            }
            
            // Check collision
            if (this.checkObjectCollision(new Vector3(tx, 0, tz), 2, existingObjects)) {
                continue;
            }
            
            // More variety in tree sizes and shapes
            const h = random.range(5, 9);
            const w = random.range(2, 5);
            const d = random.range(2, 5);
            
            // Adjust height based on terrain
            const terrainHeight = this.getTerrainHeight(tWorldX, tWorldZ, "park");
            
            const tree = MeshBuilder.CreateBox("t", { width: w, height: h, depth: d }, this.scene);
            tree.position = new Vector3(tx, h / 2 + terrainHeight, tz);
            tree.material = this.getMat("leaves");
            tree.parent = chunk.node;
            tree.freezeWorldMatrix();
            chunk.meshes.push(tree);
            
            existingObjects.push({ pos: new Vector3(tx, 0, tz), radius: Math.max(w, d) / 2 });
        }
        
        // Bench
        if (random.chance(0.3)) {
            const benchX = size / 2;
            const benchZ = size / 2;
            
            // Проверяем, не находится ли скамейка внутри гаража
            const bWorldX = chunk.x * this.config.chunkSize + benchX;
            const bWorldZ = chunk.z * this.config.chunkSize + benchZ;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 1)) {
                // Пропускаем создание скамейки
            } else {
            const bench = MeshBuilder.CreateBox("bench", { width: 2, height: 0.5, depth: 0.5 }, this.scene);
            bench.position = new Vector3(benchX, 0.25, benchZ);
            bench.material = this.getMat("wood");
            bench.parent = chunk.node;
            bench.freezeWorldMatrix();
            chunk.meshes.push(bench);
            }
        }
    }
    
    private generateWasteland(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Ruins variety
        const ruinCount = random.int(1, 3);
        for (let i = 0; i < ruinCount; i++) {
            const rx = random.range(10, size - 10);
            const rz = random.range(10, size - 10);
            
            // Проверяем, не находится ли руины внутри гаража
            const rWorldX = chunk.x * this.config.chunkSize + rx;
            const rWorldZ = chunk.z * this.config.chunkSize + rz;
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 3)) {
                continue; // Пропускаем эти руины
            }
            
            const w = random.range(2, 6);
            const h = random.range(1, 4);
            
            const ruin = MeshBuilder.CreateBox("r", { width: w, height: h, depth: 0.5 }, this.scene);
            ruin.position = new Vector3(rx, h / 2, rz);
            ruin.rotation.y = random.range(0, Math.PI);
            ruin.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
            ruin.parent = chunk.node;
            ruin.freezeWorldMatrix();
            chunk.meshes.push(ruin);
        }
    }
    
    private generateMilitary(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Military variety
        const structTypes = [
            { w: 6, h: 2.5, d: 8, mat: "concrete" },    // Bunker
            { w: 4, h: 6, d: 4, mat: "metal" },         // Tower
            { w: 10, h: 3, d: 6, mat: "metalRust" },    // Barracks
        ];
        
        const type = random.pick(structTypes);
        const bx = size / 2 + random.range(-10, 10);
        const bz = size / 2 + random.range(-10, 10);
        
        // Проверяем, не находится ли бункер внутри гаража
        const bWorldX = chunk.x * this.config.chunkSize + bx;
        const bWorldZ = chunk.z * this.config.chunkSize + bz;
        if (this.isPositionInGarageArea(bWorldX, bWorldZ, Math.max(type.w, type.d) / 2)) {
            return; // Пропускаем генерацию этого чанка, если бункер попадает в гараж
        }
        
        const bunker = MeshBuilder.CreateBox("bk", { width: type.w, height: type.h, depth: type.d }, this.scene);
        bunker.position = new Vector3(bx, type.h / 2, bz);
        bunker.material = this.getMat(type.mat);
        bunker.parent = chunk.node;
        bunker.freezeWorldMatrix();
        chunk.meshes.push(bunker);
        new PhysicsAggregate(bunker, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Barriers
        if (random.chance(0.4)) {
            for (let i = 0; i < 2; i++) {
                const barrierX = bx + random.range(-15, 15);
                const barrierZ = bz + random.range(-15, 15);
                
                // Проверяем, не находится ли барьер внутри гаража
                const brWorldX = chunk.x * this.config.chunkSize + barrierX;
                const brWorldZ = chunk.z * this.config.chunkSize + barrierZ;
                if (this.isPositionInGarageArea(brWorldX, brWorldZ, 1)) {
                    continue; // Пропускаем этот барьер
                }
                
                const barrier = MeshBuilder.CreateBox("br", { width: 1.5, height: 1, depth: 1 }, this.scene);
                barrier.position = new Vector3(barrierX, 0.5, barrierZ);
                barrier.material = this.getMat("concrete");
                barrier.parent = chunk.node;
                barrier.freezeWorldMatrix();
                chunk.meshes.push(barrier);
            }
        }
    }
    
    // === HELPER METHODS FOR MAP GENERATION ===
    
    // Create craters for frontline/ruins maps
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createCraters(chunk: ChunkData, size: number, random: SeededRandom, _worldX: number, _worldZ: number, count: number = 3): void {
        for (let i = 0; i < count; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunk.x * this.config.chunkSize + cx;
            const cWorldZ = chunk.z * this.config.chunkSize + cz;
            
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
            crater.parent = chunk.node;
            crater.freezeWorldMatrix();
            chunk.meshes.push(crater);
        }
    }
    
    // Create trenches (linear depressions)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private __createTrenches(chunk: ChunkData, size: number, random: SeededRandom, _worldX: number, _worldZ: number): void {
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
            trench.parent = chunk.node;
            trench.freezeWorldMatrix();
            chunk.meshes.push(trench);
        }
    }
    
    // Create ruined building (partially destroyed) - 30-70% здания остаётся
    private createRuinedBuilding(chunk: ChunkData, x: number, z: number, w: number, h: number, d: number, random: SeededRandom, destructionLevel?: number): void {
        // Уровень разрушения: 0.3-0.7 (30-70% здания остаётся)
        const destruction = destructionLevel !== undefined ? destructionLevel : random.range(0.3, 0.7);
        
        // Передняя стена
        if (random.chance(destruction)) {
            const wallW = w * random.range(0.6, 1.0);
            const wallH = h * random.range(0.7, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_front", { width: wallW, height: wallH, depth: 0.3 }, this.scene);
            wall.position = new Vector3(x, wallH / 2, z - d / 2);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunk.node;
            wall.freezeWorldMatrix();
            chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Задняя стена
        if (random.chance(destruction)) {
            const wallW = w * random.range(0.6, 1.0);
            const wallH = h * random.range(0.7, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_back", { width: wallW, height: wallH, depth: 0.3 }, this.scene);
            wall.position = new Vector3(x, wallH / 2, z + d / 2);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunk.node;
            wall.freezeWorldMatrix();
            chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Левая стена
        if (random.chance(destruction)) {
            const wallH = h * random.range(0.7, 1.0);
            const wallD = d * random.range(0.6, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_left", { width: 0.3, height: wallH, depth: wallD }, this.scene);
            wall.position = new Vector3(x - w / 2, wallH / 2, z);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunk.node;
            wall.freezeWorldMatrix();
            chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Правая стена
        if (random.chance(destruction)) {
            const wallH = h * random.range(0.7, 1.0);
            const wallD = d * random.range(0.6, 1.0);
            const wall = MeshBuilder.CreateBox("ruinWall_right", { width: 0.3, height: wallH, depth: wallD }, this.scene);
            wall.position = new Vector3(x + w / 2, wallH / 2, z);
            wall.material = this.getMat(random.pick(["brick", "concrete", "brickDark"]));
            wall.parent = chunk.node;
            wall.freezeWorldMatrix();
            chunk.meshes.push(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Крыша (частично)
        if (random.chance(destruction * 0.8)) {
            const roofW = w * random.range(0.5, 0.9);
            const roofD = d * random.range(0.5, 0.9);
            const roof = MeshBuilder.CreateBox("ruinRoof", { width: roofW, height: 0.2, depth: roofD }, this.scene);
            roof.position = new Vector3(x, h, z);
            roof.material = this.getMat("roof");
            roof.parent = chunk.node;
            roof.freezeWorldMatrix();
            chunk.meshes.push(roof);
        }
    }
    
    // Create mountain/rock formation using rectangular blocks (LOW POLY)
    private createMountain(chunk: ChunkData, x: number, z: number, baseSize: number, height: number, random: SeededRandom): void {
        // Create irregular mountain using overlapping rectangular blocks
        const segments = random.int(2, 4);
        for (let i = 0; i < segments; i++) {
            const segmentW = baseSize * random.range(0.4, 0.8);
            const segmentD = baseSize * random.range(0.4, 0.8);
            const segmentHeight = height * random.range(0.5, 1.0);
            const offsetX = random.range(-baseSize/3, baseSize/3);
            const offsetZ = random.range(-baseSize/3, baseSize/3);
            
            // Use rectangular block for mountain (LOW POLY)
            const segment = MeshBuilder.CreateBox("mountain", {
                width: segmentW,
                height: segmentHeight,
                depth: segmentD
            }, this.scene);
            
            segment.position = new Vector3(x + offsetX, segmentHeight / 2, z + offsetZ);
            segment.material = this.getMat("rock") || this.getMat("gravel");
            segment.parent = chunk.node;
            segment.freezeWorldMatrix();
            chunk.meshes.push(segment);
            new PhysicsAggregate(segment, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }
    
    // Create river (flat depression with water-like appearance)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createRiver(chunk: ChunkData, startX: number, startZ: number, endX: number, endZ: number, width: number, _random: SeededRandom): void {
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
        river.parent = chunk.node;
        river.freezeWorldMatrix();
        chunk.meshes.push(river);
    }
    
    // Create watchtower
    private createWatchtower(chunk: ChunkData, x: number, z: number, random: SeededRandom): void {
        const towerHeight = random.range(8, 12);
        const baseSize = 2;
        
        // Base
        const base = MeshBuilder.CreateBox("towerBase", { width: baseSize, height: 3, depth: baseSize }, this.scene);
        base.position = new Vector3(x, 1.5, z);
        base.material = this.getMat("concrete");
        base.parent = chunk.node;
        base.freezeWorldMatrix();
        chunk.meshes.push(base);
        new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Tower
        const tower = MeshBuilder.CreateBox("tower", { width: 1.5, height: towerHeight - 3, depth: 1.5 }, this.scene);
        tower.position = new Vector3(x, 3 + (towerHeight - 3) / 2, z);
        tower.material = this.getMat("metal");
        tower.parent = chunk.node;
        tower.freezeWorldMatrix();
        chunk.meshes.push(tower);
        new PhysicsAggregate(tower, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Top platform
        const platform = MeshBuilder.CreateBox("towerPlatform", { width: 2.5, height: 0.3, depth: 2.5 }, this.scene);
        platform.position = new Vector3(x, towerHeight, z);
        platform.material = this.getMat("concrete");
        platform.parent = chunk.node;
        platform.freezeWorldMatrix();
        chunk.meshes.push(platform);
    }
    
    // Create military vehicle (tank wreck, truck, etc.)
    private createMilitaryVehicle(chunk: ChunkData, x: number, z: number, random: SeededRandom, type: "tank" | "truck" | "apc" = "tank"): void {
        if (type === "tank") {
            // Tank wreck
            const body = MeshBuilder.CreateBox("tankWreck", { width: 4, height: 2, depth: 6 }, this.scene);
            body.position = new Vector3(x, 1, z);
            body.rotation.y = random.range(0, Math.PI * 2);
            body.material = this.getMat("metalRust");
            body.parent = chunk.node;
            body.freezeWorldMatrix();
            chunk.meshes.push(body);
            new PhysicsAggregate(body, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Turret (fallen off)
            if (random.chance(0.5)) {
                const turret = MeshBuilder.CreateBox("tankTurret", { width: 2.5, height: 1.5, depth: 2.5 }, this.scene);
                turret.position = new Vector3(x + random.range(-2, 2), 0.75, z + random.range(-2, 2));
                turret.rotation.y = random.range(0, Math.PI * 2);
                turret.material = this.getMat("metalRust");
                turret.parent = chunk.node;
                turret.freezeWorldMatrix();
                chunk.meshes.push(turret);
            }
        } else if (type === "truck") {
            const cab = MeshBuilder.CreateBox("truckCab", { width: 2.5, height: 2, depth: 3 }, this.scene);
            cab.position = new Vector3(x, 1, z);
            cab.rotation.y = random.range(0, Math.PI * 2);
            cab.material = this.getMat("metalRust");
            cab.parent = chunk.node;
            cab.freezeWorldMatrix();
            chunk.meshes.push(cab);
            
            const trailer = MeshBuilder.CreateBox("truckTrailer", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
            trailer.position = new Vector3(x, 1.25, z - 4.5);
            trailer.rotation.y = random.range(0, Math.PI * 2);
            trailer.material = this.getMat("metalRust");
            trailer.parent = chunk.node;
            trailer.freezeWorldMatrix();
            chunk.meshes.push(trailer);
        }
    }
    
    // Create barricade - все типы: бетонные блоки, мешки с песком, заблокированные машины
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createBarricade(chunk: ChunkData, x: number, z: number, _length: number, random: SeededRandom, type?: "concrete" | "sandbags" | "vehicles"): void {
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
                block.parent = chunk.node;
                block.freezeWorldMatrix();
                chunk.meshes.push(block);
                new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        } else if (barricadeType === "sandbags") {
            // Мешки с песком
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 4; col++) {
                    const bag = MeshBuilder.CreateBox("sandbag", { width: 1.2, height: 0.4, depth: 0.6 }, this.scene);
                    bag.position = new Vector3(x + col * 1.3 - 2, row * 0.4 + 0.2, z);
                    bag.material = this.getMat("sand");
                    bag.parent = chunk.node;
                    bag.freezeWorldMatrix();
                    chunk.meshes.push(bag);
                }
            }
            const sbPhysics = MeshBuilder.CreateBox("sb_phys", { width: 5, height: 0.8, depth: 1 }, this.scene);
            sbPhysics.position = new Vector3(x, 0.4, z);
            sbPhysics.isVisible = false;
            sbPhysics.parent = chunk.node;
            new PhysicsAggregate(sbPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            chunk.meshes.push(sbPhysics);
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
            vehicle.parent = chunk.node;
            vehicle.freezeWorldMatrix();
            chunk.meshes.push(vehicle);
            new PhysicsAggregate(vehicle, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    // === POLYGON (Training Ground) GENERATION ===
    
    // Размер арены полигона
    private readonly POLYGON_ARENA_SIZE = 600;
    private readonly POLYGON_WALL_HEIGHT = 6;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private __polygonInitialized = false;
    
    private generatePolygonContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        // Земля военного типа (песок/грязь)
        this.createGround(chunk, worldX, worldZ, size, "military", random);
        
        // Генерируем смешанную местность (холмы + равнины)
        this.generatePolygonTerrain(chunk, worldX, worldZ, size, random);
        
        // Определяем границы арены
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const __arenaHalf = this.POLYGON_ARENA_SIZE / 2; void __arenaHalf;
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;
        
        // Генерируем периметр только один раз для чанков на границе
        this.generatePolygonPerimeter(chunk, worldX, worldZ, size, random);
        
        // Определяем зону на основе позиции чанка
        const zoneType = this.getPolygonZone(chunkCenterX, chunkCenterZ);
        
        switch (zoneType) {
            case "shooting":
                this.generatePolygonTargets(chunk, size, random);
                break;
            case "obstacles":
                this.generatePolygonObstacles(chunk, size, random);
                break;
            case "combat":
                // Зона боя - открытое пространство с укрытиями
                this.generatePolygonCombatZone(chunk, size, random);
                break;
            case "base":
                this.generatePolygonBuildings(chunk, size, random);
                break;
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generatePolygonTerrain(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Смешанная местность: 30-40% холмы, 60-70% равнины
        // Создаём несколько холмов на чанке
        const hillCount = random.int(2, 4);
        for (let i = 0; i < hillCount; i++) {
            if (random.chance(0.35)) { // 35% шанс = примерно 30-40% площади
                const hx = random.range(10, size - 10);
                const hz = random.range(10, size - 10);
                const hWorldX = chunk.x * this.config.chunkSize + hx;
                const hWorldZ = chunk.z * this.config.chunkSize + hz;
                
                if (this.isPositionInGarageArea(hWorldX, hWorldZ, 5)) continue;
                
                const hillSize = random.range(8, 15);
                const hillHeight = random.range(2, 5);
                
                const hill = MeshBuilder.CreateBox("polygon_hill", { width: hillSize, height: hillHeight, depth: hillSize }, this.scene);
                hill.position = new Vector3(hx, hillHeight / 2, hz);
                hill.material = this.getMat("dirt");
                hill.parent = chunk.node;
                hill.freezeWorldMatrix();
                chunk.meshes.push(hill);
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
        
        // Квадранты арены для 600x600:
        // Северо-восток (x > 50, z > 50) - стрельбище
        // Северо-запад (x < -50, z > 50) - полоса препятствий
        // Юго-восток (x > 50, z < -50) - зона боя
        // Юго-запад (x < -50, z < -50) - военная база (рядом с гаражом)
        // Центр (-50 до 50): пустое пространство
        
        if (x > 50 && z > 50) return "shooting";
        if (x < -50 && z > 50) return "obstacles";
        if (x > 50 && z < -50) return "combat";
        if (x < -50 && z < -50) return "base";
        
        return "empty"; // Центральная область - пустое пространство
    }
    
    private generatePolygonPerimeter(chunk: ChunkData, worldX: number, worldZ: number, size: number, _random: SeededRandom): void {
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
                    post.parent = chunk.node;
                    post.freezeWorldMatrix();
                    chunk.meshes.push(post);
                }
                
                // Fence mesh between posts
                const fence = MeshBuilder.CreateBox("pfence_n", { width: wallLength, height: fenceHeight * 0.7, depth: fenceThickness }, this.scene);
                fence.position = new Vector3(wallX, fenceHeight * 0.5, arenaHalf - worldZ);
                fence.material = this.getMat("metal");
                fence.parent = chunk.node;
                fence.freezeWorldMatrix();
                chunk.meshes.push(fence);
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    private generatePolygonTargets(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Стрельбище - мишени-силуэты танков
        const targetCount = random.int(3, 6);
        
        for (let i = 0; i < targetCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            
            // Проверяем, не в гараже ли
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Основа мишени - вертикальный столб
            const pole = MeshBuilder.CreateBox("target_pole", { width: 0.3, height: 3, depth: 0.3 }, this.scene);
            pole.position = new Vector3(x, 1.5, z);
            pole.material = this.getMat("metal");
            pole.parent = chunk.node;
            pole.freezeWorldMatrix();
            chunk.meshes.push(pole);
            
            // Силуэт танка (упрощённый - прямоугольник)
            const targetWidth = random.range(3, 5);
            const targetHeight = random.range(2, 3);
            const target = MeshBuilder.CreateBox("target", { width: targetWidth, height: targetHeight, depth: 0.2 }, this.scene);
            target.position = new Vector3(x, targetHeight / 2 + 1, z + 0.3);
            
            // Красная мишень
            const targetMat = new StandardMaterial("targetMat", this.scene);
            targetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
            targetMat.emissiveColor = new Color3(0.3, 0, 0);
            target.material = targetMat;
            target.parent = chunk.node;
            target.freezeWorldMatrix();
            chunk.meshes.push(target);
            
            // Квадратные рамки на мишени (LOW POLY)
            for (let ring = 1; ring <= 3; ring++) {
                const ringSize = ring * 0.4;
                const ringThickness = 0.1;
                // Создаём квадратную рамку из 4 прямоугольных блоков
                // Верх
                const top = MeshBuilder.CreateBox("ring_top", { width: ringSize * 2, height: ringThickness, depth: ringThickness }, this.scene);
                top.position = new Vector3(x, 2 + targetHeight / 2, z + 0.35 - ringSize);
                const topMat = new StandardMaterial("ringMat", this.scene);
                topMat.diffuseColor = ring % 2 === 0 ? new Color3(1, 1, 1) : new Color3(0, 0, 0);
                top.material = topMat;
                top.parent = chunk.node;
                top.freezeWorldMatrix();
                chunk.meshes.push(top);
                // Низ
                const bottom = MeshBuilder.CreateBox("ring_bottom", { width: ringSize * 2, height: ringThickness, depth: ringThickness }, this.scene);
                bottom.position = new Vector3(x, 2 + targetHeight / 2, z + 0.35 + ringSize);
                bottom.material = topMat;
                bottom.parent = chunk.node;
                bottom.freezeWorldMatrix();
                chunk.meshes.push(bottom);
                // Лево
                const left = MeshBuilder.CreateBox("ring_left", { width: ringThickness, height: ringThickness, depth: ringSize * 2 }, this.scene);
                left.position = new Vector3(x - ringSize, 2 + targetHeight / 2, z + 0.35);
                left.material = topMat;
                left.parent = chunk.node;
                left.freezeWorldMatrix();
                chunk.meshes.push(left);
                // Право
                const right = MeshBuilder.CreateBox("ring_right", { width: ringThickness, height: ringThickness, depth: ringSize * 2 }, this.scene);
                right.position = new Vector3(x + ringSize, 2 + targetHeight / 2, z + 0.35);
                right.material = topMat;
                right.parent = chunk.node;
                right.freezeWorldMatrix();
                chunk.meshes.push(right);
            }
        }
        
        // Добавляем рельсы для движущихся мишеней
        if (random.chance(0.5)) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const rail = MeshBuilder.CreateBox("rail", { width: size - 20, height: 0.1, depth: 0.5 }, this.scene);
            rail.position = new Vector3(size / 2, 0.05, railZ);
            rail.material = this.getMat("metalRust");
            rail.parent = chunk.node;
            rail.freezeWorldMatrix();
            chunk.meshes.push(rail);
        }
        
        // Генерируем движущиеся мишени
        this.generateMovingTargets(chunk, size, random);
    }
    
    private generateMovingTargets(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Создаём 2-3 движущиеся мишени на стрельбище
        const movingTargetCount = random.int(2, 3);
        
        for (let i = 0; i < movingTargetCount; i++) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const startX = random.range(15, size - 15);
            const endX = random.range(15, size - 15);
            
            const worldX = chunk.x * this.config.chunkSize + startX;
            const worldZ = chunk.z * this.config.chunkSize + railZ;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Рельсы для движущейся мишени
            const railLength = Math.abs(endX - startX);
            const rail = MeshBuilder.CreateBox("moving_rail", { width: railLength, height: 0.1, depth: 0.5 }, this.scene);
            rail.position = new Vector3((startX + endX) / 2, 0.05, railZ);
            rail.material = this.getMat("metalRust");
            rail.parent = chunk.node;
            rail.freezeWorldMatrix();
            chunk.meshes.push(rail);
            
            // Мишень на рельсах
            const targetWidth = random.range(3, 5);
            const targetHeight = random.range(2, 3);
            const target = MeshBuilder.CreateBox("moving_target", { width: targetWidth, height: targetHeight, depth: 0.2 }, this.scene);
            target.position = new Vector3(startX, targetHeight / 2 + 1, railZ + 0.3);
            
            const targetMat = new StandardMaterial("movingTargetMat", this.scene);
            targetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
            targetMat.emissiveColor = new Color3(0.3, 0, 0);
            target.material = targetMat;
            target.parent = chunk.node;
            chunk.meshes.push(target);
            
            // Анимация движения мишени вдоль рельсов - циклическое движение туда-обратно
            let animDirection = 1;
            const animSpeed = 0.15;
            const animObserver = this.scene.onBeforeRenderObservable.add(() => {
                if (target && !target.isDisposed() && target.parent === chunk.node) {
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
    
    private generatePolygonObstacles(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Полоса препятствий - танкодром
        
        // Рампы
        const rampCount = random.int(2, 4);
        for (let i = 0; i < rampCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 4)) continue;
            
            const rampWidth = random.range(4, 8);
            const rampHeight = random.range(1, 2.5);
            const rampDepth = random.range(6, 10);
            
            const ramp = MeshBuilder.CreateBox("ramp", { width: rampWidth, height: rampHeight, depth: rampDepth }, this.scene);
            ramp.position = new Vector3(x, rampHeight / 2, z);
            ramp.rotation.x = -Math.PI * 0.1; // Небольшой наклон
            ramp.material = this.getMat("concrete");
            ramp.parent = chunk.node;
            ramp.freezeWorldMatrix();
            chunk.meshes.push(ramp);
            new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Бетонные блоки (укрытия)
        const blockCount = random.int(4, 8);
        for (let i = 0; i < blockCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            const blockW = random.range(2, 4);
            const blockH = random.range(1, 2);
            const blockD = random.range(2, 4);
            
            const block = MeshBuilder.CreateBox("block", { width: blockW, height: blockH, depth: blockD }, this.scene);
            block.position = new Vector3(x, blockH / 2, z);
            block.rotation.y = random.range(0, Math.PI);
            block.material = this.getMat("concrete");
            block.parent = chunk.node;
            block.freezeWorldMatrix();
            chunk.meshes.push(block);
            new PhysicsAggregate(block, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Противотанковые ежи
        const hedgehogCount = random.int(3, 6);
        for (let i = 0; i < hedgehogCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
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
                beam.parent = chunk.node;
                beam.freezeWorldMatrix();
                chunk.meshes.push(beam);
            }
            
            // Физика для ежа (LOW POLY - box)
            const hedgehogPhysics = MeshBuilder.CreateBox("hedgehog_phys", { width: 2, height: 2, depth: 2 }, this.scene);
            hedgehogPhysics.position = new Vector3(x, 1, z);
            hedgehogPhysics.isVisible = false;
            hedgehogPhysics.parent = chunk.node;
            new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            chunk.meshes.push(hedgehogPhysics);
        }
    }
    
    private generatePolygonCombatZone(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Зона боя - открытое пространство с укрытиями для тренировки с ботами
        
        // Низкие укрытия
        const coverCount = random.int(3, 6);
        for (let i = 0; i < coverCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Низкая стена-укрытие
            const coverWidth = random.range(4, 8);
            const coverHeight = random.range(1.5, 2.5);
            
            const cover = MeshBuilder.CreateBox("cover", { width: coverWidth, height: coverHeight, depth: 1 }, this.scene);
            cover.position = new Vector3(x, coverHeight / 2, z);
            cover.rotation.y = random.range(0, Math.PI);
            cover.material = this.getMat("concrete");
            cover.parent = chunk.node;
            cover.freezeWorldMatrix();
            chunk.meshes.push(cover);
            new PhysicsAggregate(cover, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Песчаные мешки (декоративные кучи)
        const sandbagCount = random.int(2, 4);
        for (let i = 0; i < sandbagCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
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
                    bag.parent = chunk.node;
                    bag.freezeWorldMatrix();
                    chunk.meshes.push(bag);
                }
            }
            
            // Физика для кучи (один бокс)
            const sandbagPhysics = MeshBuilder.CreateBox("sandbag_phys", { width: 4, height: 1.2, depth: 1 }, this.scene);
            sandbagPhysics.position = new Vector3(x, 0.6, z);
            sandbagPhysics.isVisible = false;
            sandbagPhysics.parent = chunk.node;
            new PhysicsAggregate(sandbagPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            chunk.meshes.push(sandbagPhysics);
        }
    }
    
    private generatePolygonBuildings(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Военная база - бункеры, башни, казармы, ангары, склады, техника
        
        // Hangars (large enclosed buildings for vehicles)
        const hangarCount = random.int(1, 3);
        for (let i = 0; i < hangarCount; i++) {
            const hx = random.range(15, size - 15);
            const hz = random.range(15, size - 15);
            const hWorldX = chunk.x * this.config.chunkSize + hx;
            const hWorldZ = chunk.z * this.config.chunkSize + hz;
            
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 15)) continue;
            
            const hangarW = random.range(20, 30);
            const hangarH = random.range(6, 10);
            const hangarD = random.range(25, 35);
            
            // Main hangar building
            const hangar = MeshBuilder.CreateBox("hangar", { width: hangarW, height: hangarH, depth: hangarD }, this.scene);
            hangar.position = new Vector3(hx, hangarH / 2, hz);
            hangar.material = this.getMat("metal");
            hangar.parent = chunk.node;
            hangar.freezeWorldMatrix();
            chunk.meshes.push(hangar);
            new PhysicsAggregate(hangar, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Large door opening (front missing wall)
            // Door frame
            const doorHeight = hangarH * 0.7;
            const leftFrame = MeshBuilder.CreateBox("doorFrame", { width: 1, height: doorHeight, depth: 1 }, this.scene);
            leftFrame.position = new Vector3(hx - hangarW / 2 + 1, doorHeight / 2, hz - hangarD / 2);
            leftFrame.material = this.getMat("metal");
            leftFrame.parent = chunk.node;
            leftFrame.freezeWorldMatrix();
            chunk.meshes.push(leftFrame);
            
            const rightFrame = MeshBuilder.CreateBox("doorFrame", { width: 1, height: doorHeight, depth: 1 }, this.scene);
            rightFrame.position = new Vector3(hx + hangarW / 2 - 1, doorHeight / 2, hz - hangarD / 2);
            rightFrame.material = this.getMat("metal");
            rightFrame.parent = chunk.node;
            rightFrame.freezeWorldMatrix();
            chunk.meshes.push(rightFrame);
            
            // Top frame
            const topFrame = MeshBuilder.CreateBox("doorFrame", { width: hangarW - 2, height: 1, depth: 1 }, this.scene);
            topFrame.position = new Vector3(hx, doorHeight, hz - hangarD / 2);
            topFrame.material = this.getMat("metal");
            topFrame.parent = chunk.node;
            topFrame.freezeWorldMatrix();
            chunk.meshes.push(topFrame);
            
            // Vehicles inside hangar (occasionally)
            if (random.chance(0.5)) {
                this.createMilitaryVehicle(chunk, hx, hz, random, random.pick(["tank", "truck", "apc"]));
            }
        }
        
        // Warehouses (storage buildings) - 1-2 склада
        const warehouseCount = random.int(1, 2);
        for (let i = 0; i < warehouseCount; i++) {
            const wx = random.range(10, size - 10);
            const wz = random.range(10, size - 10);
            const wWorldX = chunk.x * this.config.chunkSize + wx;
            const wWorldZ = chunk.z * this.config.chunkSize + wz;
            
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 12)) continue;
            
            const warehouse = MeshBuilder.CreateBox("warehouse", { width: random.range(15, 25), height: random.range(5, 8), depth: random.range(20, 30) }, this.scene);
            warehouse.position = new Vector3(wx, random.range(2.5, 4), wz);
            warehouse.material = this.getMat("metalRust");
            warehouse.parent = chunk.node;
            warehouse.freezeWorldMatrix();
            chunk.meshes.push(warehouse);
            new PhysicsAggregate(warehouse, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Containers near warehouse
            for (let j = 0; j < random.int(2, 5); j++) {
                const cx = wx + random.range(-12, 12);
                const cz = wz + random.range(-12, 12);
                const cWorldX = chunk.x * this.config.chunkSize + cx;
                const cWorldZ = chunk.z * this.config.chunkSize + cz;
                
                if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) continue;
                
                const container = MeshBuilder.CreateBox("warehouseContainer", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
                container.position = new Vector3(cx, 1.26, cz);
                container.rotation.y = random.pick([0, Math.PI / 2]);
                container.material = this.getMat(random.pick(["red", "yellow", "blue", "metal"]));
                container.parent = chunk.node;
                container.freezeWorldMatrix();
                chunk.meshes.push(container);
                new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // Watchtowers - 2-3 вышки
        const towerCount = random.int(2, 3);
        for (let i = 0; i < towerCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) continue;
            
            this.createWatchtower(chunk, tx, tz, random);
        }
        
        // Cranes (for loading/unloading) - 1-2 крана
        const craneCount = random.int(1, 2);
        for (let i = 0; i < craneCount; i++) {
            const cx = random.range(15, size - 15);
            const cz = random.range(15, size - 15);
            const cWorldX = chunk.x * this.config.chunkSize + cx;
            const cWorldZ = chunk.z * this.config.chunkSize + cz;
            
            if (!this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
                const tower = MeshBuilder.CreateBox("craneTower", { width: 2, height: 15, depth: 2 }, this.scene);
                tower.position = new Vector3(cx, 7.5, cz);
                tower.material = this.getMat("yellow");
                tower.parent = chunk.node;
                tower.freezeWorldMatrix();
                chunk.meshes.push(tower);
                
                const arm = MeshBuilder.CreateBox("craneArm", { width: 1, height: 1, depth: 20 }, this.scene);
                arm.position = new Vector3(cx, 14, cz + 10);
                arm.material = this.getMat("yellow");
                arm.parent = chunk.node;
                arm.freezeWorldMatrix();
                chunk.meshes.push(arm);
            }
        }
        
        // Military vehicles (parked/driving range)
        const vehicleCount = random.int(2, 5);
        for (let i = 0; i < vehicleCount; i++) {
            const vx = random.range(10, size - 10);
            const vz = random.range(10, size - 10);
            const vWorldX = chunk.x * this.config.chunkSize + vx;
            const vWorldZ = chunk.z * this.config.chunkSize + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 4)) continue;
            
            this.createMilitaryVehicle(chunk, vx, vz, random, random.pick(["tank", "truck", "apc"]));
        }
        
        // Barracks/Administrative buildings
        if (random.chance(0.7)) {
            const kx = random.range(15, size - 15);
            const kz = random.range(15, size - 15);
            
            const worldX = chunk.x * this.config.chunkSize + kx;
            const worldZ = chunk.z * this.config.chunkSize + kz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 10)) {
                const barrackW = random.range(12, 20);
                const barrackH = 4;
                const barrackD = 8;
                
                const barrack = MeshBuilder.CreateBox("barrack", { width: barrackW, height: barrackH, depth: barrackD }, this.scene);
                barrack.position = new Vector3(kx, barrackH / 2, kz);
                barrack.material = this.getMat("metalRust");
                barrack.parent = chunk.node;
                barrack.freezeWorldMatrix();
                chunk.meshes.push(barrack);
                new PhysicsAggregate(barrack, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // Бункер
        if (random.chance(0.6)) {
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);
            
            const worldX = chunk.x * this.config.chunkSize + bx;
            const worldZ = chunk.z * this.config.chunkSize + bz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 8)) {
                const bunkerW = random.range(8, 12);
                const bunkerH = random.range(3, 4);
                const bunkerD = random.range(6, 10);
                
                const bunker = MeshBuilder.CreateBox("bunker", { width: bunkerW, height: bunkerH, depth: bunkerD }, this.scene);
                bunker.position = new Vector3(bx, bunkerH / 2, bz);
                bunker.material = this.getMat("concrete");
                bunker.parent = chunk.node;
                bunker.freezeWorldMatrix();
                chunk.meshes.push(bunker);
                new PhysicsAggregate(bunker, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                
                // Амбразура на бункере
                const slit = MeshBuilder.CreateBox("slit", { width: bunkerW * 0.6, height: 0.5, depth: 0.5 }, this.scene);
                slit.position = new Vector3(bx, bunkerH - 0.5, bz + bunkerD / 2);
                const slitMat = new StandardMaterial("slitMat", this.scene);
                slitMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                slit.material = slitMat;
                slit.parent = chunk.node;
                slit.freezeWorldMatrix();
                chunk.meshes.push(slit);
            }
        }
        
        // Смотровая башня
        if (random.chance(0.4)) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            
            const worldX = chunk.x * this.config.chunkSize + tx;
            const worldZ = chunk.z * this.config.chunkSize + tz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 5)) {
                const towerH = random.range(8, 12);
                
                // Основание башни
                const base = MeshBuilder.CreateBox("tower_base", { width: 4, height: towerH, depth: 4 }, this.scene);
                base.position = new Vector3(tx, towerH / 2, tz);
                base.material = this.getMat("metal");
                base.parent = chunk.node;
                base.freezeWorldMatrix();
                chunk.meshes.push(base);
                new PhysicsAggregate(base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                
                // Платформа наверху
                const platform = MeshBuilder.CreateBox("tower_platform", { width: 6, height: 0.5, depth: 6 }, this.scene);
                platform.position = new Vector3(tx, towerH + 0.25, tz);
                platform.material = this.getMat("metal");
                platform.parent = chunk.node;
                platform.freezeWorldMatrix();
                chunk.meshes.push(platform);
                
                // Ограждение
                const railH = 1.2;
                for (let side = 0; side < 4; side++) {
                    const rail = MeshBuilder.CreateBox("rail", { width: side % 2 === 0 ? 6 : 0.1, height: railH, depth: side % 2 === 0 ? 0.1 : 6 }, this.scene);
                    const offsetX = side === 1 ? 3 : (side === 3 ? -3 : 0);
                    const offsetZ = side === 0 ? 3 : (side === 2 ? -3 : 0);
                    rail.position = new Vector3(tx + offsetX, towerH + 0.5 + railH / 2, tz + offsetZ);
                    rail.material = this.getMat("metalRust");
                    rail.parent = chunk.node;
                    rail.freezeWorldMatrix();
                    chunk.meshes.push(rail);
                }
            }
        }
        
        // Казарма (длинное здание)
        if (random.chance(0.3)) {
            const kx = random.range(15, size - 15);
            const kz = random.range(15, size - 15);
            
            const worldX = chunk.x * this.config.chunkSize + kx;
            const worldZ = chunk.z * this.config.chunkSize + kz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 10)) {
                const barrackW = random.range(12, 18);
                const barrackH = 4;
                const barrackD = 8;
                
                const barrack = MeshBuilder.CreateBox("barrack", { width: barrackW, height: barrackH, depth: barrackD }, this.scene);
                barrack.position = new Vector3(kx, barrackH / 2, kz);
                barrack.material = this.getMat("metalRust");
                barrack.parent = chunk.node;
                barrack.freezeWorldMatrix();
                chunk.meshes.push(barrack);
                new PhysicsAggregate(barrack, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                
                // Крыша
                const roof = MeshBuilder.CreateBox("roof", { width: barrackW + 1, height: 0.3, depth: barrackD + 1 }, this.scene);
                roof.position = new Vector3(kx, barrackH + 0.15, kz);
                roof.material = this.getMat("metal");
                roof.parent = chunk.node;
                roof.freezeWorldMatrix();
                chunk.meshes.push(roof);
            }
        }
    }
    
    // === FRONTLINE (Передовая) MAP GENERATION ===
    
    // Размер арены передовой
    private readonly FRONTLINE_ARENA_SIZE = 600;
    private readonly FRONTLINE_WALL_HEIGHT = 8;
    
    private generateFrontlineContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        // Земля военного типа (грязь)
        this.createGround(chunk, worldX, worldZ, size, "wasteland", random);
        
        // Определяем границы карты
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const __arenaHalfFrontline = this.FRONTLINE_ARENA_SIZE / 2; void __arenaHalfFrontline;
        const chunkCenterX = worldX + size / 2;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const __chunkCenterZ = worldZ + size / 2; void __chunkCenterZ;
        
        // Генерируем периметр
        this.generateFrontlinePerimeter(chunk, worldX, worldZ, size, random);
        
        // Определяем зону на основе позиции чанка
        const zoneType = this.getFrontlineZone(chunkCenterX);
        
        switch (zoneType) {
            case "allied":
                // Западная сторона - база игрока
                this.generateFrontlineTrenches(chunk, size, random, "allied");
                this.generateFrontlineBunkers(chunk, size, random, "allied");
                break;
            case "nomansland":
                // Нейтральная полоса - опасная зона с множеством кратеров, окопов, укреплений
                this.generateFrontlineCraters(chunk, size, random);
                this.generateFrontlineTrenches(chunk, size, random, "neutral");
                this.generateFrontlineRuins(chunk, size, random);
                this.generateFrontlineWire(chunk, size, random);
                this.generateFrontlineWrecks(chunk, size, random);
                // Все типы баррикад
                this.generateAllBarriers(chunk, size, random);
                break;
            case "enemy":
                // Восточная сторона - вражеская база
                this.generateFrontlineTrenches(chunk, size, random, "enemy");
                this.generateFrontlineBunkers(chunk, size, random, "enemy");
                this.generateFrontlineBarricades(chunk, size, random);
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
        
        // Западная сторона (x < -150) - союзники (улучшены границы для 600x600)
        if (x < -150) return "allied";
        // Восточная сторона (x > 150) - враги
        if (x > 150) return "enemy";
        // Нейтральная полоса (-150 <= x <= 150) - более широкая зона
        return "nomansland";
    }
    
    private generateFrontlinePerimeter(chunk: ChunkData, worldX: number, worldZ: number, size: number, _random: SeededRandom): void {
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
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
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
                new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    private generateFrontlineTrenches(chunk: ChunkData, size: number, random: SeededRandom, side: "allied" | "enemy" | "neutral"): void {
        // Окопы - длинные траншеи с земляными валами
        // Средняя плотность: 2-3 в allied/enemy, 3-4 в neutral
        const trenchCount = side === "neutral" ? random.int(3, 4) : random.int(2, 3);
        
        for (let i = 0; i < trenchCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) continue;
            
            const trenchLength = random.range(15, 30);
            const trenchWidth = 3;
            const trenchDepth = 1.5;
            
            // Сам окоп (углубление в земле - представлено низкими стенами по бокам)
            // Левый вал
            const leftWall = MeshBuilder.CreateBox("trench_l", { width: trenchLength, height: trenchDepth, depth: 0.8 }, this.scene);
            leftWall.position = new Vector3(x, trenchDepth / 2, z - trenchWidth / 2);
            leftWall.material = this.getMat("dirt");
            leftWall.parent = chunk.node;
            leftWall.freezeWorldMatrix();
            chunk.meshes.push(leftWall);
            new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Правый вал
            const rightWall = MeshBuilder.CreateBox("trench_r", { width: trenchLength, height: trenchDepth, depth: 0.8 }, this.scene);
            rightWall.position = new Vector3(x, trenchDepth / 2, z + trenchWidth / 2);
            rightWall.material = this.getMat("dirt");
            rightWall.parent = chunk.node;
            rightWall.freezeWorldMatrix();
            chunk.meshes.push(rightWall);
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
                    sandbag.parent = chunk.node;
                    sandbag.freezeWorldMatrix();
                    chunk.meshes.push(sandbag);
                }
            }
        }
    }
    
    private generateFrontlineCraters(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Воронки от взрывов в нейтральной полосе - умеренное количество кратеров
        const craterCount = random.int(5, 8);
        
        for (let i = 0; i < craterCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
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
            rimN.parent = chunk.node;
            rimN.freezeWorldMatrix();
            chunk.meshes.push(rimN);
            // Юг
            const rimS = MeshBuilder.CreateBox("crater_rim_s", { width: craterRadius * 2.2, height: rimHeight, depth: rimW }, this.scene);
            rimS.position = new Vector3(x, rimHeight / 2, z + craterRadius + rimW / 2);
            rimS.material = this.getMat("dirt");
            rimS.parent = chunk.node;
            rimS.freezeWorldMatrix();
            chunk.meshes.push(rimS);
            // Восток
            const rimE = MeshBuilder.CreateBox("crater_rim_e", { width: rimW, height: rimHeight, depth: craterRadius * 2.2 }, this.scene);
            rimE.position = new Vector3(x + craterRadius + rimW / 2, rimHeight / 2, z);
            rimE.material = this.getMat("dirt");
            rimE.parent = chunk.node;
            rimE.freezeWorldMatrix();
            chunk.meshes.push(rimE);
            // Запад
            const rimWest = MeshBuilder.CreateBox("crater_rim_w", { width: rimW, height: rimHeight, depth: craterRadius * 2.2 }, this.scene);
            rimWest.position = new Vector3(x - craterRadius - rimW / 2, rimHeight / 2, z);
            rimWest.material = this.getMat("dirt");
            rimWest.parent = chunk.node;
            rimWest.freezeWorldMatrix();
            chunk.meshes.push(rimWest);
            
            // Физика для обода воронки (box вместо cylinder)
            const rimPhysics = MeshBuilder.CreateBox("crater_phys", { width: craterRadius * 2.2, height: rimHeight, depth: craterRadius * 2.2 }, this.scene);
            rimPhysics.position = new Vector3(x, rimHeight / 2, z);
            rimPhysics.isVisible = false;
            rimPhysics.parent = chunk.node;
            // Не добавляем физику, чтобы танк мог проехать через воронку
            chunk.meshes.push(rimPhysics);
        }
    }
    
    private generateFrontlineRuins(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Разрушенные здания
        if (!random.chance(0.4)) return; // Не в каждом чанке
        
        const x = random.range(15, size - 15);
        const z = random.range(15, size - 15);
        
        const worldX = chunk.x * this.config.chunkSize + x;
        const worldZ = chunk.z * this.config.chunkSize + z;
        if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
        
        const ruinW = random.range(8, 15);
        const ruinH = random.range(2, 5);
        const ruinD = random.range(8, 12);
        
        // Остатки стен (неполный прямоугольник)
        // Задняя стена
        const backWall = MeshBuilder.CreateBox("ruin_back", { width: ruinW, height: ruinH, depth: 0.5 }, this.scene);
        backWall.position = new Vector3(x, ruinH / 2, z - ruinD / 2);
        backWall.material = this.getMat("brick");
        backWall.parent = chunk.node;
        backWall.freezeWorldMatrix();
        chunk.meshes.push(backWall);
        new PhysicsAggregate(backWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Левая стена (частичная)
        if (random.chance(0.7)) {
            const leftH = ruinH * random.range(0.4, 0.8);
            const leftWall = MeshBuilder.CreateBox("ruin_left", { width: 0.5, height: leftH, depth: ruinD * 0.7 }, this.scene);
            leftWall.position = new Vector3(x - ruinW / 2, leftH / 2, z);
            leftWall.material = this.getMat("brick");
            leftWall.parent = chunk.node;
            leftWall.freezeWorldMatrix();
            chunk.meshes.push(leftWall);
            new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Правая стена (частичная)
        if (random.chance(0.5)) {
            const rightH = ruinH * random.range(0.3, 0.6);
            const rightWall = MeshBuilder.CreateBox("ruin_right", { width: 0.5, height: rightH, depth: ruinD * 0.5 }, this.scene);
            rightWall.position = new Vector3(x + ruinW / 2, rightH / 2, z + ruinD * 0.2);
            rightWall.material = this.getMat("brickDark");
            rightWall.parent = chunk.node;
            rightWall.freezeWorldMatrix();
            chunk.meshes.push(rightWall);
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
            debris.parent = chunk.node;
            debris.freezeWorldMatrix();
            chunk.meshes.push(debris);
            new PhysicsAggregate(debris, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }
    
    private generateFrontlineBarricades(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Баррикады на вражеской стороне
        const barricadeCount = random.int(2, 5);
        
        for (let i = 0; i < barricadeCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
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
                block.parent = chunk.node;
                block.freezeWorldMatrix();
                chunk.meshes.push(block);
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
                    beam.parent = chunk.node;
                    beam.freezeWorldMatrix();
                    chunk.meshes.push(beam);
                }
                
                // Физика (LOW POLY - box)
                const hedgehogPhysics = MeshBuilder.CreateBox("hh_phys", { width: 2.5, height: 2.5, depth: 2.5 }, this.scene);
                hedgehogPhysics.position = new Vector3(x, 1.2, z);
                hedgehogPhysics.isVisible = false;
                hedgehogPhysics.parent = chunk.node;
                new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                chunk.meshes.push(hedgehogPhysics);
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
                        bag.parent = chunk.node;
                        bag.freezeWorldMatrix();
                        chunk.meshes.push(bag);
                    }
                }
                
                // Физика для мешков
                const sbPhysics = MeshBuilder.CreateBox("sb_phys", { width: 5, height: 0.8, depth: 1 }, this.scene);
                sbPhysics.position = new Vector3(x, 0.4, z);
                sbPhysics.isVisible = false;
                sbPhysics.parent = chunk.node;
                new PhysicsAggregate(sbPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                chunk.meshes.push(sbPhysics);
            }
        }
    }
    
    // Generate sandbag fortifications
    private generateFrontlineSandbags(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Sandbag piles and barriers in no man's land
        const sandbagCount = random.int(3, 7);
        
        for (let i = 0; i < sandbagCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            
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
                    bag.parent = chunk.node;
                    bag.freezeWorldMatrix();
                    chunk.meshes.push(bag);
                }
            }
        }
    }
    
    private generateFrontlineBunkers(chunk: ChunkData, size: number, random: SeededRandom, side: "allied" | "enemy"): void {
        // Бункеры на позициях - несколько бункеров (1-2 на зону)
        const bunkerCount = random.int(1, 2);
        
        for (let i = 0; i < bunkerCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
            
            const bunkerW = random.range(8, 14);
            const bunkerH = random.range(3, 5);
            const bunkerD = random.range(6, 10);
            
            const bunker = MeshBuilder.CreateBox("bunker", { width: bunkerW, height: bunkerH, depth: bunkerD }, this.scene);
            bunker.position = new Vector3(x, bunkerH / 2, z);
            bunker.material = this.getMat("concrete");
            bunker.parent = chunk.node;
            bunker.freezeWorldMatrix();
            chunk.meshes.push(bunker);
            new PhysicsAggregate(bunker, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Амбразура
            const slitW = bunkerW * 0.5;
            const slit = MeshBuilder.CreateBox("slit", { width: slitW, height: 0.6, depth: 0.5 }, this.scene);
            // Амбразура направлена к центру карты (в сторону врага для союзников, в сторону союзников для врага)
            const slitZ = side === "allied" ? z + bunkerD / 2 : z - bunkerD / 2;
            slit.position = new Vector3(x, bunkerH - 0.6, slitZ);
            const slitMat = new StandardMaterial("slitMat", this.scene);
            slitMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            slit.material = slitMat;
            slit.parent = chunk.node;
            slit.freezeWorldMatrix();
            chunk.meshes.push(slit);
        }
    }
    
    private generateFrontlineWire(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Колючая проволока в нейтральной полосе
        const wireCount = random.int(2, 5);
        
        for (let i = 0; i < wireCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            const wireLength = random.range(8, 20);
            const wireHeight = 1.2;
            
            // Столбы
            for (let post = 0; post < 3; post++) {
                const postX = x - wireLength / 2 + post * wireLength / 2;
                const postMesh = MeshBuilder.CreateBox("wire_post", { width: 0.15, height: wireHeight + 0.3, depth: 0.15 }, this.scene);
                postMesh.position = new Vector3(postX, (wireHeight + 0.3) / 2, z);
                postMesh.material = this.getMat("metalRust");
                postMesh.parent = chunk.node;
                postMesh.freezeWorldMatrix();
                chunk.meshes.push(postMesh);
            }
            
            // Проволока (несколько горизонтальных линий)
            for (let line = 0; line < 3; line++) {
                const lineY = 0.3 + line * 0.4;
                const wireMesh = MeshBuilder.CreateBox("wire", { width: wireLength, height: 0.05, depth: 0.05 }, this.scene);
                wireMesh.position = new Vector3(x, lineY, z);
                
                const wireMat = new StandardMaterial("wireMat", this.scene);
                wireMat.diffuseColor = new Color3(0.3, 0.25, 0.2);
                wireMat.specularColor = new Color3(0.5, 0.5, 0.5);
                wireMesh.material = wireMat;
                wireMesh.parent = chunk.node;
                wireMesh.freezeWorldMatrix();
                chunk.meshes.push(wireMesh);
            }
            
            // Физика - невидимый барьер (замедляет танк)
            const wirePhysics = MeshBuilder.CreateBox("wire_phys", { width: wireLength, height: wireHeight, depth: 0.5 }, this.scene);
            wirePhysics.position = new Vector3(x, wireHeight / 2, z);
            wirePhysics.isVisible = false;
            wirePhysics.parent = chunk.node;
            new PhysicsAggregate(wirePhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            chunk.meshes.push(wirePhysics);
        }
    }
    
    private generateFrontlineWrecks(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Подбитая техника (декорации) - немного обломков (1-2 на чанк)
        const wreckCount = random.int(1, 2);
        
        for (let i = 0; i < wreckCount; i++) {
        const x = random.range(15, size - 15);
        const z = random.range(15, size - 15);
        
        const worldX = chunk.x * this.config.chunkSize + x;
        const worldZ = chunk.z * this.config.chunkSize + z;
        if (this.isPositionInGarageArea(worldX, worldZ, 8)) return;
        
        // Подбитый танк (силуэт)
        // Корпус
        const hullW = random.range(4, 6);
        const hullH = random.range(1.5, 2.5);
        const hullD = random.range(6, 9);
        
        const hull = MeshBuilder.CreateBox("wreck_hull", { width: hullW, height: hullH, depth: hullD }, this.scene);
        hull.position = new Vector3(x, hullH / 2, z);
        hull.rotation.y = random.range(0, Math.PI * 2);
        
        // Тёмный обгоревший материал
        const wreckMat = new StandardMaterial("wreckMat", this.scene);
        wreckMat.diffuseColor = new Color3(0.15, 0.12, 0.1);
        wreckMat.specularColor = new Color3(0, 0, 0);
        hull.material = wreckMat;
        hull.parent = chunk.node;
        hull.freezeWorldMatrix();
        chunk.meshes.push(hull);
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
            turret.parent = chunk.node;
            turret.freezeWorldMatrix();
            chunk.meshes.push(turret);
        }
        
        // Дым / огонь (простой визуальный эффект - вертикальный столб)
        if (random.chance(0.3)) {
            const smoke = MeshBuilder.CreateBox("smoke", { width: 1.5, height: 4, depth: 1.5 }, this.scene);
            smoke.position = new Vector3(x, hullH + 2, z);
            const smokeMat = new StandardMaterial("smokeMat", this.scene);
            smokeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            smokeMat.alpha = 0.4;
            smoke.material = smokeMat;
            smoke.parent = chunk.node;
            smoke.freezeWorldMatrix();
            chunk.meshes.push(smoke);
            }
        }
    }
    
    private generateAllBarriers(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Все типы баррикад: мешки с песком, проволока, баррикады
        // Мешки с песком
        this.generateFrontlineSandbags(chunk, size, random);
        
        // Проволока
        this.generateFrontlineWire(chunk, size, random);
        
        // Баррикады
        this.generateFrontlineBarricades(chunk, size, random);
    }
    
    // === BUILDING CREATORS ===
    
    
    
    
    
    // removed unused helpers (tree/bench/streetlight/house/apartment)
    
    // Generic scattered props with varied forms/sizes (avoid z-fighting via Y offsets)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private __addScatteredProps(chunk: ChunkData, size: number, random: SeededRandom): void {
        const count = random.int(2, 5); // больше пропсов
        for (let i = 0; i < count; i++) {
            const kind = random.int(0, 4);
            let x = random.range(6, size - 6);
            let z = random.range(6, size - 6);
            
            // КРИТИЧЕСКИ ВАЖНО: Пропускаем позиции внутри гаражей
            // Получаем мировые координаты
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
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
                box.parent = chunk.node;
                box.freezeWorldMatrix();
                chunk.meshes.push(box);
            } else if (kind === 1) {
                // Ramp (flattened box)
                const ramp = MeshBuilder.CreateBox("ramp", { width: 4, height: 0.5, depth: 3 }, this.scene);
                ramp.position = new Vector3(x, 0.26, z);
                ramp.rotation.y = random.range(0, Math.PI * 2);
                ramp.material = this.getMat(random.pick(["asphalt", "concrete", "metal"]));
                ramp.parent = chunk.node;
                ramp.freezeWorldMatrix();
                chunk.meshes.push(ramp);
            } else if (kind === 2) {
                // Pole / pillar
                const h = random.range(2, 5);
                const pole = MeshBuilder.CreateBox("pole", { width: 0.4, height: h, depth: 0.4 }, this.scene);
                pole.position = new Vector3(x, h / 2 + 0.01, z);
                pole.material = this.getMat(random.pick(["metal", "yellow", "brick"]));
                pole.parent = chunk.node;
                pole.freezeWorldMatrix();
                chunk.meshes.push(pole);
            } else {
                // Fence segment
                const fenceLen = random.range(6, 14);
                const fence = MeshBuilder.CreateBox("fence", { width: fenceLen, height: 1.4, depth: 0.2 }, this.scene);
                fence.position = new Vector3(x, 0.7, z);
                fence.rotation.y = random.pick([0, Math.PI / 2]);
                fence.material = this.getMat(random.pick(["wood", "metal", "concrete"]));
                fence.parent = chunk.node;
                fence.freezeWorldMatrix();
                chunk.meshes.push(fence);
            }
        }
    }

    // Legacy BLOCKY terrain generator (kept for reference; not used after heightmap switch)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private __createTerrainFromNoise(chunk: ChunkData, worldX: number, worldZ: number, size: number, biome: BiomeType, random: SeededRandom): void {
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
                const row = heights[gx];
                if (row) row[gz] = this.terrainGenerator.getHeight(sampleX, sampleZ, biome);
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
                        
                        hillBlock.material = this.getMat(matName);
                        hillBlock.parent = chunk.node;
                        this.optimizeMesh(hillBlock);
                        chunk.meshes.push(hillBlock);
                        
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
                        
                        depBlock.material = this.getMat(matName);
                        depBlock.parent = chunk.node;
                        this.optimizeMesh(depBlock);
                        chunk.meshes.push(depBlock);
                    }
                }
            }
        }
    }
    
    // Extra terrain features for uniqueness (lightweight) - УЛУЧШЕННАЯ ГЕНЕРАЦИЯ!
    private addTerrainFeatures(chunk: ChunkData, size: number, random: SeededRandom, biome: BiomeType): void {
        const features = random.int(2, 5); // Уменьшено с 3-7 до 2-5 для оптимизации
        const worldX = chunk.x * size;
        const worldZ = chunk.z * size;
        
        for (let i = 0; i < features; i++) {
            const kind = random.int(0, 15); // МНОГО больше типов фич!
            let x = random.range(8, size - 8);
            let z = random.range(8, size - 8);
            
            // ИСПРАВЛЕНИЕ: Проверка на важные объекты перед генерацией terrain features
            const worldX_pos = worldX + x;
            const worldZ_pos = worldZ + z;
            
            // Расширенный радиус исключения для гаражей (15 единиц вместо стандартных 12)
            if (this.isPositionInGarageArea(worldX_pos, worldZ_pos, 15)) {
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
                hill.parent = chunk.node;
                hill.freezeWorldMatrix();
                chunk.meshes.push(hill);
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
                mountain.parent = chunk.node;
                mountain.freezeWorldMatrix();
                chunk.meshes.push(mountain);
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
                crater.parent = chunk.node;
                crater.freezeWorldMatrix();
                chunk.meshes.push(crater);
                
                // Rectangular rim blocks around crater
                const rimHeight = random.range(0.6, 1.2);
                const rimW = craterW * 0.3;
                const rimD = craterD * 0.3;
                
                // North rim
                const rimN = MeshBuilder.CreateBox("rim_n", { width: craterW * 1.4, height: rimHeight, depth: rimW }, this.scene);
                rimN.position = new Vector3(x, rimHeight / 2 + 0.01, z - craterD / 2 - rimW / 2);
                rimN.material = this.getMat("dirt");
                rimN.parent = chunk.node;
                rimN.freezeWorldMatrix();
                chunk.meshes.push(rimN);
                
                // South rim
                const rimS = MeshBuilder.CreateBox("rim_s", { width: craterW * 1.4, height: rimHeight, depth: rimW }, this.scene);
                rimS.position = new Vector3(x, rimHeight / 2 + 0.01, z + craterD / 2 + rimW / 2);
                rimS.material = this.getMat("dirt");
                rimS.parent = chunk.node;
                rimS.freezeWorldMatrix();
                chunk.meshes.push(rimS);
                
                // East rim
                const rimE = MeshBuilder.CreateBox("rim_e", { width: rimD, height: rimHeight, depth: craterD * 1.4 }, this.scene);
                rimE.position = new Vector3(x + craterW / 2 + rimD / 2, rimHeight / 2 + 0.01, z);
                rimE.material = this.getMat("dirt");
                rimE.parent = chunk.node;
                rimE.freezeWorldMatrix();
                chunk.meshes.push(rimE);
                
                // West rim
                const rimWest = MeshBuilder.CreateBox("rim_w", { width: rimD, height: rimHeight, depth: craterD * 1.4 }, this.scene);
                rimWest.position = new Vector3(x - craterW / 2 - rimD / 2, rimHeight / 2 + 0.01, z);
                rimWest.material = this.getMat("dirt");
                rimWest.parent = chunk.node;
                rimWest.freezeWorldMatrix();
                chunk.meshes.push(rimWest);
            } else if (kind === 3) {
                // Lake - РАЗНООБРАЗНЫЕ размеры и формы
                const lakeType = random.int(0, 2);
                if (lakeType === 0) {
                    // Большое озеро
                    const w = random.range(15, 25);
                    const d = random.range(12, 20);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else if (lakeType === 1) {
                    // Маленькое озеро
                    const w = random.range(6, 12);
                    const d = random.range(6, 12);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else {
                    // Длинное озеро (как река но шире)
                    const w = random.range(8, 14);
                    const d = random.range(20, 35);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.rotation.y = random.pick([0, Math.PI / 2]);
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
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
                    river.parent = chunk.node;
                    river.freezeWorldMatrix();
                    chunk.meshes.push(river);
                } else if (riverType === 1) {
                    // Вертикальная река
                    const riverW = random.range(4, 8);
                    const river = MeshBuilder.CreateBox("river", { width: riverW, height: 0.01, depth: size }, this.scene);
                    river.position = new Vector3(x, -0.02, size / 2);
                    river.material = this.getMat("glass");
                    river.parent = chunk.node;
                    river.freezeWorldMatrix();
                    chunk.meshes.push(river);
                } else {
                    // Диагональная река (L-образная)
                    const riverW = random.range(4, 7);
                    const hRiver = MeshBuilder.CreateBox("river", { width: size/2, height: 0.01, depth: riverW }, this.scene);
                    hRiver.position = new Vector3(size * 0.75, -0.02, z);
                    hRiver.material = this.getMat("glass");
                    hRiver.parent = chunk.node;
                    hRiver.freezeWorldMatrix();
                    chunk.meshes.push(hRiver);
                    
                    const vRiver = MeshBuilder.CreateBox("river2", { width: riverW, height: 0.01, depth: size/2 }, this.scene);
                    vRiver.position = new Vector3(x, -0.02, size * 0.75);
                    vRiver.material = this.getMat("glass");
                    vRiver.parent = chunk.node;
                    vRiver.freezeWorldMatrix();
                    chunk.meshes.push(vRiver);
                }
            } else if (kind === 5) {
                // Elevated platform - РАЗНООБРАЗНЫЕ размеры
                const h = random.range(1, 2);
                const plat = MeshBuilder.CreateBox("platform", { width: 10, height: h, depth: 10 }, this.scene);
                plat.position = new Vector3(x, h / 2 + 0.01, z);
                plat.material = this.getMat("concrete");
                plat.parent = chunk.node;
                plat.freezeWorldMatrix();
                chunk.meshes.push(plat);
            } else if (kind === 6) {
                // МОСТЫ - РАЗНООБРАЗНЫЕ типы и размеры
                const bridgeType = random.int(0, 3);
                if (bridgeType === 0) {
                    // Маленький мост
                    const br = MeshBuilder.CreateBox("bridge", { width: 8, height: 0.8, depth: 3 }, this.scene);
                    br.position = new Vector3(x, 1.5, z);
                br.material = this.getMat("concrete");
                br.parent = chunk.node;
                br.freezeWorldMatrix();
                chunk.meshes.push(br);
                    new PhysicsAggregate(br, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else if (bridgeType === 1) {
                    // Большой мост с опорами
                    const brW = random.range(15, 25);
                    const brH = random.range(3, 6);
                    const brD = random.range(4, 8);
                    const br = MeshBuilder.CreateBox("bridge", { width: brW, height: 0.5, depth: brD }, this.scene);
                    br.position = new Vector3(x, brH + 0.25, z);
                    br.material = this.getMat("asphalt");
                    br.parent = chunk.node;
                    br.freezeWorldMatrix();
                    chunk.meshes.push(br);
                    new PhysicsAggregate(br, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    
                    // Опоры моста
                    const supportCount = random.int(2, 4);
                    for (let s = 0; s < supportCount; s++) {
                        const support = MeshBuilder.CreateBox("bsup", { width: 1.5, height: brH, depth: 1.5 }, this.scene);
                        support.position = new Vector3(
                            x + random.range(-brW/2 + 2, brW/2 - 2),
                            brH / 2,
                            z + random.range(-brD/2 + 2, brD/2 - 2)
                        );
                        support.material = this.getMat("concrete");
                        support.parent = chunk.node;
                        support.freezeWorldMatrix();
                        chunk.meshes.push(support);
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
                    br.parent = chunk.node;
                    br.freezeWorldMatrix();
                    chunk.meshes.push(br);
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
                    fence.parent = chunk.node;
                    fence.freezeWorldMatrix();
                    chunk.meshes.push(fence);
                    new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else if (fenceType === 1) {
                    // Металлический забор
                    const fenceLen = random.range(12, 25);
                    const fence = MeshBuilder.CreateBox("fence", { width: fenceLen, height: 2.5, depth: 0.15 }, this.scene);
                    fence.position = new Vector3(x, 1.25, z);
                    fence.rotation.y = random.pick([0, Math.PI / 2]);
                    fence.material = this.getMat("metal");
                    fence.parent = chunk.node;
                    fence.freezeWorldMatrix();
                    chunk.meshes.push(fence);
                    new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else {
                    // Бетонный забор/стена
                    const wallLen = random.range(8, 20);
                    const wallH = random.range(2, 4);
                    const wall = MeshBuilder.CreateBox("wall", { width: wallLen, height: wallH, depth: 0.5 }, this.scene);
                    wall.position = new Vector3(x, wallH / 2 + 0.01, z);
                wall.rotation.y = random.pick([0, Math.PI / 2]);
                    wall.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
                wall.parent = chunk.node;
                wall.freezeWorldMatrix();
                chunk.meshes.push(wall);
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
                    road.parent = chunk.node;
                    road.freezeWorldMatrix();
                    chunk.meshes.push(road);
                } else if (roadType === 1) {
                    // Перекрёсток
                    const roadW = random.range(6, 9);
                    const hRoad = MeshBuilder.CreateBox("road", { width: size, height: 0.02, depth: roadW }, this.scene);
                    hRoad.position = new Vector3(size/2, 0.02, z);
                    hRoad.material = this.getMat("asphalt");
                    hRoad.parent = chunk.node;
                    hRoad.freezeWorldMatrix();
                    chunk.meshes.push(hRoad);
                    
                    const vRoad = MeshBuilder.CreateBox("road2", { width: roadW, height: 0.02, depth: size }, this.scene);
                    vRoad.position = new Vector3(x, 0.02, size/2);
                    vRoad.material = this.getMat("asphalt");
                    vRoad.parent = chunk.node;
                    vRoad.freezeWorldMatrix();
                    chunk.meshes.push(vRoad);
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
                        block.parent = chunk.node;
                        block.freezeWorldMatrix();
                        chunk.meshes.push(block);
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
                        barrier.parent = chunk.node;
                        barrier.freezeWorldMatrix();
                        chunk.meshes.push(barrier);
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
                        rock.parent = chunk.node;
                        rock.freezeWorldMatrix();
                        chunk.meshes.push(rock);
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
                        pole.parent = chunk.node;
                        pole.freezeWorldMatrix();
                        chunk.meshes.push(pole);
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
                        ruin.parent = chunk.node;
                        ruin.freezeWorldMatrix();
                        chunk.meshes.push(ruin);
                        // Убрана физика для декоративных руин (оптимизация)
                    }
                }
            } else if (kind === 10) {
                // Лес - РАЗНООБРАЗНЫЕ размеры
                const forestSize = random.int(0, 2);
                if (forestSize === 0) {
                    // Маленькая роща
                    const treeCount = random.int(3, 6);
                for (let t = 0; t < treeCount; t++) {
                        const tx = x + random.range(-5, 5);
                        const tz = z + random.range(-5, 5);
                    const th = random.range(3, 6);
                        const tw = random.range(1.5, 2.5);
                        const tree = MeshBuilder.CreateBox("t", { width: tw, height: th, depth: tw }, this.scene);
                    tree.position = new Vector3(tx, th / 2 + 0.01, tz);
                    tree.material = this.getMat("leaves");
                    tree.parent = chunk.node;
                    tree.freezeWorldMatrix();
                    chunk.meshes.push(tree);
                        // Убрана физика для декоративных деревьев (оптимизация)
                    }
                } else if (forestSize === 1) {
                    // Средний лес
                    const treeCount = random.int(5, 10);
                    for (let t = 0; t < treeCount; t++) {
                        const tx = x + random.range(-8, 8);
                        const tz = z + random.range(-8, 8);
                        const th = random.range(4, 7);
                        const tw = random.range(2, 3);
                        const tree = MeshBuilder.CreateBox("t", { width: tw, height: th, depth: tw }, this.scene);
                        tree.position = new Vector3(tx, th / 2 + 0.01, tz);
                        tree.material = this.getMat("leaves");
                        tree.parent = chunk.node;
                        tree.freezeWorldMatrix();
                        chunk.meshes.push(tree);
                        new PhysicsAggregate(tree, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    }
                } else {
                    // Большой лес
                    const treeCount = random.int(8, 15);
                    for (let t = 0; t < treeCount; t++) {
                        const tx = x + random.range(-12, 12);
                        const tz = z + random.range(-12, 12);
                        const th = random.range(5, 8);
                        const tw = random.range(2.5, 4);
                        const tree = MeshBuilder.CreateBox("t", { width: tw, height: th, depth: tw }, this.scene);
                        tree.position = new Vector3(tx, th / 2 + 0.01, tz);
                        tree.material = this.getMat("leaves");
                        tree.parent = chunk.node;
                        tree.freezeWorldMatrix();
                        chunk.meshes.push(tree);
                        new PhysicsAggregate(tree, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                    }
                }
            } else if (kind === 11) {
                // ДОПОЛНИТЕЛЬНЫЕ ЗДАНИЯ - маленькие структуры
                const structType = random.int(0, 3);
                if (structType === 0) {
                    // Маленький сарай
                    const shed = MeshBuilder.CreateBox("shed", { width: 4, height: 3, depth: 5 }, this.scene);
                    shed.position = new Vector3(x, 1.5, z);
                    shed.material = this.getMat("wood");
                    shed.parent = chunk.node;
                    shed.freezeWorldMatrix();
                    chunk.meshes.push(shed);
                    // Убрана физика для декоративных сараев (оптимизация)
                } else if (structType === 1) {
                    // Башня/вышка
                    const towerH = random.range(8, 15);
                    const tower = MeshBuilder.CreateBox("tower", { width: 3, height: towerH, depth: 3 }, this.scene);
                    tower.position = new Vector3(x, towerH / 2, z);
                    tower.material = this.getMat(random.pick(["metal", "concrete", "brick"]));
                    tower.parent = chunk.node;
                    tower.freezeWorldMatrix();
                    chunk.meshes.push(tower);
                    // Убрана физика для декоративных башен (оптимизация)
                } else {
                    // Небольшое здание
                    const buildingW = random.range(6, 12);
                    const buildingH = random.range(4, 8);
                    const buildingD = random.range(6, 12);
                    const building = MeshBuilder.CreateBox("building", { width: buildingW, height: buildingH, depth: buildingD }, this.scene);
                    building.position = new Vector3(x, buildingH / 2, z);
                    building.material = this.getMat(random.pick(["plaster", "brick", "concrete"]));
                    building.parent = chunk.node;
                    building.freezeWorldMatrix();
                    chunk.meshes.push(building);
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
                platform.parent = chunk.node;
                platform.freezeWorldMatrix();
                chunk.meshes.push(platform);
                new PhysicsAggregate(platform, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else if (kind === 13) {
                // РАЗНООБРАЗНЫЕ ОЗЁРА - больше типов
                const lakeSize = random.int(0, 4);
                if (lakeSize === 0) {
                    // Крошечное озеро
                    const w = random.range(4, 8);
                    const d = random.range(4, 8);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else if (lakeSize === 1) {
                    // Среднее озеро
                    const w = random.range(10, 18);
                    const d = random.range(10, 18);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else if (lakeSize === 2) {
                    // Большое озеро
                    const w = random.range(20, 30);
                    const d = random.range(18, 28);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else {
                    // Овальное озеро
                    const w = random.range(15, 25);
                    const d = random.range(8, 15);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, 0.25, z); // Поднято на +0.27 (было -0.02)
                    lake.rotation.y = random.range(0, Math.PI);
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
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
                    river.parent = chunk.node;
                    river.freezeWorldMatrix();
                    chunk.meshes.push(river);
                } else if (riverSize === 1) {
                    // Широкая река
                    const riverW = random.range(8, 12);
                    const river = MeshBuilder.CreateBox("river", { width: size, height: 0.01, depth: riverW }, this.scene);
                    river.position = new Vector3(size / 2, -0.02, z);
                    river.rotation.y = random.pick([0, Math.PI / 2]);
                    river.material = this.getMat("glass");
                    river.parent = chunk.node;
                    river.freezeWorldMatrix();
                    chunk.meshes.push(river);
                } else {
                    // Извилистая река (S-образная)
                    const riverW = random.range(5, 8);
                    const river1 = MeshBuilder.CreateBox("river", { width: size/2, height: 0.01, depth: riverW }, this.scene);
                    river1.position = new Vector3(size * 0.25, -0.02, z);
                    river1.material = this.getMat("glass");
                    river1.parent = chunk.node;
                    river1.freezeWorldMatrix();
                    chunk.meshes.push(river1);
                    
                    const river2 = MeshBuilder.CreateBox("river2", { width: riverW, height: 0.01, depth: size/2 }, this.scene);
                    river2.position = new Vector3(x, -0.02, size * 0.25);
                    river2.material = this.getMat("glass");
                    river2.parent = chunk.node;
                    river2.freezeWorldMatrix();
                    chunk.meshes.push(river2);
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
                    hill.parent = chunk.node;
                    hill.freezeWorldMatrix();
                    chunk.meshes.push(hill);
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
                    hill.parent = chunk.node;
                    hill.freezeWorldMatrix();
                    chunk.meshes.push(hill);
                    new PhysicsAggregate(hill, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                }
            }
        }
    }
    
    private showChunk(chunk: ChunkData): void {
        chunk.node.setEnabled(true);
        chunk.loaded = true;
    }
    
    private hideChunk(chunk: ChunkData): void {
        chunk.node.setEnabled(false);
        chunk.loaded = false;
    }
    
    private destroyChunk(key: string): void {
        const chunk = this.chunks.get(key);
        if (!chunk) return;
        chunk.meshes.forEach(mesh => mesh.dispose());
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
    
    getStats() {
        return { ...this.stats, totalChunksInMemory: this.chunks.size };
    }
    
    // Генерация гаражей для спавна
    private generateGarages(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
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
        let gx: number = size / 2, gz: number = size / 2;
        let worldGarageX: number = worldX + gx, worldGarageZ: number = worldZ + gz;
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
        backWall.parent = chunk.node;
        backWall.freezeWorldMatrix();
        chunk.meshes.push(backWall);
        new PhysicsAggregate(backWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Левая боковая стена
        const leftWall = MeshBuilder.CreateBox("garageLeft", { 
            width: wallThickness, 
            height: garageHeight, 
            depth: garageDepth 
        }, this.scene);
        leftWall.position = new Vector3(worldGarageX - garageWidth / 2 + wallThickness / 2, garageHeight / 2, worldGarageZ);
        leftWall.material = garageMat;
        leftWall.parent = chunk.node;
        leftWall.freezeWorldMatrix();
        chunk.meshes.push(leftWall);
        new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Правая боковая стена
        const rightWall = MeshBuilder.CreateBox("garageRight", { 
            width: wallThickness, 
            height: garageHeight, 
            depth: garageDepth 
        }, this.scene);
        rightWall.position = new Vector3(worldGarageX + garageWidth / 2 - wallThickness / 2, garageHeight / 2, worldGarageZ);
        rightWall.material = garageMat;
        rightWall.parent = chunk.node;
        rightWall.freezeWorldMatrix();
        chunk.meshes.push(rightWall);
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
        frontLeft.parent = chunk.node;
        frontLeft.freezeWorldMatrix();
        chunk.meshes.push(frontLeft);
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
        frontRight.parent = chunk.node;
        frontRight.freezeWorldMatrix();
        chunk.meshes.push(frontRight);
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
        frontTop.parent = chunk.node;
        frontTop.freezeWorldMatrix();
        chunk.meshes.push(frontTop);
        new PhysicsAggregate(frontTop, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Крыша
        const roof = MeshBuilder.CreateBox("garageRoof", { 
            width: garageWidth + 0.5, 
            height: 0.3, 
            depth: garageDepth + 0.5 
        }, this.scene);
        roof.position = new Vector3(worldGarageX, garageHeight + 0.15, worldGarageZ);
        roof.material = roofMat;
        roof.parent = chunk.node;
        roof.freezeWorldMatrix();
        chunk.meshes.push(roof);
        new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        // Пол гаража (для визуального эффекта)
        const floor = MeshBuilder.CreateBox("garageFloor", { 
            width: garageWidth - wallThickness * 2, 
            height: 0.1, 
            depth: garageDepth - wallThickness * 2 
        }, this.scene);
        floor.position = new Vector3(worldGarageX, 0.05, worldGarageZ);
        floor.material = this.getMat("concrete");
        floor.parent = chunk.node;
        floor.freezeWorldMatrix();
        chunk.meshes.push(floor);
        
        // Прозрачный физический пол для предотвращения проваливания танка
        const collisionFloor = MeshBuilder.CreateBox("garageFloorCollision", {
            width: garageWidth - wallThickness * 2,
            height: 0.15,
            depth: garageDepth - wallThickness * 2
        }, this.scene);
        collisionFloor.position = new Vector3(worldGarageX, 0.075, worldGarageZ);
        collisionFloor.isVisible = false;
        collisionFloor.visibility = 0;
        const collisionMat = new StandardMaterial("garageFloorCollisionMat", this.scene);
        collisionMat.alpha = 0;
        collisionFloor.material = collisionMat;
        collisionFloor.parent = chunk.node;
        collisionFloor.freezeWorldMatrix();
        chunk.meshes.push(collisionFloor);
        const floorPhysics = new PhysicsAggregate(collisionFloor, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        this.setEnvironmentCollisionFilters(floorPhysics);
        
        // Сохраняем область гаража для исключения из генерации других объектов
        // УВЕЛИЧЕННЫЙ ЗАПАС чтобы ничего не спавнилось внутри или рядом с гаражом
        const garageArea = {
            x: worldGarageX - garageWidth / 2 - 5, // Увеличен запас до 5 единиц
            z: worldGarageZ - garageDepth / 2 - 5,
            width: garageWidth + 10, // Увеличен запас до 10 единиц
            depth: garageDepth + 10
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
        // ИСПРАВЛЕНИЕ: Увеличенный радиус по умолчанию для лучшей защиты важных объектов
        const defaultMargin = 25; // Увеличено с 12 до 25 для лучшей защиты
        const effectiveMargin = margin > 0 ? margin : defaultMargin;
        
        for (const area of this.garageAreas) {
            if (x >= area.x - effectiveMargin && x <= area.x + area.width + effectiveMargin &&
                z >= area.z - effectiveMargin && z <= area.z + area.depth + effectiveMargin) {
                return true;
            }
        }
        return false;
    }
    
    // Generate cover objects using CoverGenerator
    private generateCoverObjects(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, biome: BiomeType): void {
        if (!this.coverGenerator) return;
        
        const covers = this.coverGenerator.generateCoversForChunk(
            chunk.x, chunk.z, size, biome, chunk.node, this.roadNetwork
        );
        
        for (const cover of covers) {
            chunk.meshes.push(cover.mesh);
        }
    }
    
    // Generate POIs using POISystem
    private generatePOIs(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, biome: BiomeType): void {
        if (!this.poiSystem) return;
        
        const pois = this.poiSystem.generatePOIsForChunk(chunk.x, chunk.z, size, biome, chunk.node);
        
        for (const poi of pois) {
            for (const mesh of poi.meshes) {
                chunk.meshes.push(mesh);
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
    private generateRuinsContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        this.createGround(chunk, worldX, worldZ, size, "wasteland", random);
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
        // Create roads first
        this.createRoads(chunk, size, random, "city");
        
        // Generate ruined buildings - все типы зданий
        this.generateRuinsBuildings(chunk, size, random);
        
        // Add rubble and debris - минимум обломков (1-3 на чанк)
        for (let i = 0; i < random.int(1, 3); i++) {
            const rx = random.range(5, size - 5);
            const rz = random.range(5, size - 5);
            const rWorldX = chunk.x * this.config.chunkSize + rx;
            const rWorldZ = chunk.z * this.config.chunkSize + rz;
            
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 2)) continue;
            
            const rubble = MeshBuilder.CreateBox("rubble", { width: random.range(1, 4), height: random.range(0.5, 2), depth: random.range(1, 4) }, this.scene);
            rubble.position = new Vector3(rx, random.range(0.25, 1), rz);
            rubble.rotation.y = random.range(0, Math.PI * 2);
            rubble.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
            rubble.parent = chunk.node;
            rubble.freezeWorldMatrix();
            chunk.meshes.push(rubble);
        }
        
        // Add wrecked vehicles - немного техники (1-2 на чанк)
        for (let i = 0; i < random.int(1, 2); i++) {
            const vx = random.range(10, size - 10);
            const vz = random.range(10, size - 10);
            const vWorldX = chunk.x * this.config.chunkSize + vx;
            const vWorldZ = chunk.z * this.config.chunkSize + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 3)) continue;
            if (this.isPositionNearRoad(vWorldX, vWorldZ, 2)) {
                this.createMilitaryVehicle(chunk, vx, vz, random, random.pick(["tank", "truck"]));
            }
        }
        
        // НЕ добавляем кратеры - дороги должны быть целыми
        
        // Generate cover objects
        this.generateCoverObjects(chunk, worldX, worldZ, size, "wasteland");
        this.generatePOIs(chunk, worldX, worldZ, size, "wasteland");
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    private generateRuinsBuildings(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Все типы зданий: жилые, коммерческие, промышленные, военные
        const buildingCount = random.int(3, 6);
        const buildingPositions = this.generateClusteredPositions(
            buildingCount,
            size,
            10,
            30,
            Math.min(buildingCount, 3),
            random
        );
        
        for (const pos of buildingPositions) {
            const worldX_pos = chunk.x * this.config.chunkSize + pos.x;
            const worldZ_pos = chunk.z * this.config.chunkSize + pos.z;
            
            if (this.isPositionInGarageArea(worldX_pos, worldZ_pos, 10)) continue;
            
            // Распределение: 40% жилые, 30% коммерческие, 20% промышленные, 10% военные
            const buildingType = random.next();
            let w: number, h: number, d: number;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            let _material: string;
            
            if (buildingType < 0.4) {
                // Жилые: 6x6x4
                w = random.range(5, 7);
                h = random.range(3, 5);
                d = random.range(5, 7);
                _material = random.pick(["brick", "plaster"]);
            } else if (buildingType < 0.7) {
                // Коммерческие: 12x12x8
                w = random.range(10, 14);
                h = random.range(6, 10);
                d = random.range(10, 14);
                _material = random.pick(["concrete", "brick"]);
            } else if (buildingType < 0.9) {
                // Промышленные: 15x15x10
                w = random.range(13, 17);
                h = random.range(8, 12);
                d = random.range(13, 17);
                _material = random.pick(["metal", "concrete"]);
            } else {
                // Военные: 10x10x6
                w = random.range(8, 12);
                h = random.range(4, 8);
                d = random.range(8, 12);
                _material = random.pick(["concrete", "brickDark"]);
            }
            
            // Создаём частично разрушенное здание (30-70% остаётся)
            this.createRuinedBuilding(chunk, pos.x, pos.z, w, h, d, random, random.range(0.3, 0.7));
        }
    }
    
    // Generate Canyon map - mountainous terrain with passes, rivers, lakes, forests
    private generateCanyonContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        this.createGround(chunk, worldX, worldZ, size, "park", random);
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
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
                        this.createMountain(chunk, localX, localZ, cellSize * 0.8, mountainHeight, random);
                    }
                }
            }
        }
        
        // Create rivers (occasionally)
        if (random.chance(0.3)) {
            const startX = random.range(0, size);
            const startZ = random.range(0, size);
            const endX = random.range(0, size);
            const endZ = random.range(0, size);
            this.createRiver(chunk, startX, startZ, endX, endZ, random.range(3, 6), random);
        }
        
        // Create forests in valleys - средняя плотность (4-8 деревьев на чанк)
        const treeCount = random.int(4, 8);
        const treePositions = this.generateClusteredPositions(treeCount, size, 2, 15, random.int(2, 4), random);
        
        for (const pos of treePositions) {
            const tWorldX = chunk.x * this.config.chunkSize + pos.x;
            const tWorldZ = chunk.z * this.config.chunkSize + pos.z;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 2)) continue;
            
            const th = random.range(5, 10);
            const tw = random.range(2, 4);
            const terrainHeight = this.getTerrainHeight(tWorldX, tWorldZ, "park");
            
            const tree = MeshBuilder.CreateBox("tree", { width: tw, height: th, depth: tw }, this.scene);
            tree.position = new Vector3(pos.x, th / 2 + terrainHeight, pos.z);
            tree.material = this.getMat("leaves");
            tree.parent = chunk.node;
            tree.freezeWorldMatrix();
            chunk.meshes.push(tree);
        }
        
        // Create small villages - несколько деревень (3-5 домов)
        if (random.chance(0.35)) {
            const houseCount = random.int(3, 5);
            const villagePos = this.generateClusteredPositions(houseCount, size, 8, 20, 1, random);
            for (const pos of villagePos) {
                const hWorldX = chunk.x * this.config.chunkSize + pos.x;
                const hWorldZ = chunk.z * this.config.chunkSize + pos.z;
                if (this.isPositionInGarageArea(hWorldX, hWorldZ, 4)) continue;
                
                const house = MeshBuilder.CreateBox("villageHouse", { width: 6, height: 4, depth: 6 }, this.scene);
                house.position = new Vector3(pos.x, 2, pos.z);
                house.material = this.getMat("wood");
                house.parent = chunk.node;
                house.freezeWorldMatrix();
                chunk.meshes.push(house);
                new PhysicsAggregate(house, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // Генерируем реки и озёра
        this.generateCanyonRivers(chunk, worldX, worldZ, size, random);
        this.generateCanyonLakes(chunk, worldX, worldZ, size, random);
        
        // Генерируем горные перевалы
        this.generateCanyonPasses(chunk, worldX, worldZ, size, random);
        
        // Смешанные дороги (горные + долинные)
        this.generateCanyonRoads(chunk, size, random);
        
        this.generatePOIs(chunk, worldX, worldZ, size, "park");
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateCanyonRivers(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Несколько рек (2-3 на карту) - генерируем с низкой вероятностью на чанк
        if (random.chance(0.15)) {
            const startX = random.range(0, size);
            const startZ = random.range(0, size);
            const endX = random.range(0, size);
            const endZ = random.range(0, size);
            this.createRiver(chunk, startX, startZ, endX, endZ, random.range(3, 6), random);
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createLake(chunk: ChunkData, x: number, z: number, radius: number, _random: SeededRandom): void {
        // Озеро - плоский куб с материалом "water" (replaced cylinder with box)
        const lake = MeshBuilder.CreateBox("lake", { width: radius * 2, height: 0.1, depth: radius * 2 }, this.scene);
        lake.position = new Vector3(x, 0.1, z); // Поднято на +0.15 (было -0.05)
        lake.material = this.getMat("water");
        lake.parent = chunk.node;
        lake.freezeWorldMatrix();
        chunk.meshes.push(lake);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateCanyonLakes(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Несколько озёр (2-3 на карту) - генерируем с низкой вероятностью на чанк
        if (random.chance(0.12)) {
            const lx = random.range(15, size - 15);
            const lz = random.range(15, size - 15);
            const lWorldX = chunk.x * this.config.chunkSize + lx;
            const lWorldZ = chunk.z * this.config.chunkSize + lz;
            
            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 8)) {
                const radius = random.range(5, 12);
                this.createLake(chunk, lx, lz, radius, random);
            }
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateCanyonPasses(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Горные перевалы - проходы между высокими горами
        if (random.chance(0.2)) {
            const px = random.range(10, size - 10);
            const pz = random.range(10, size - 10);
            const pWorldX = chunk.x * this.config.chunkSize + px;
            const pWorldZ = chunk.z * this.config.chunkSize + pz;
            
            if (!this.isPositionInGarageArea(pWorldX, pWorldZ, 8)) {
                const passWidth = random.range(10, 15);
                const passHeight = random.range(1, 3);
                
                // Создаём проход как понижение в земле
                const pass = MeshBuilder.CreateBox("canyon_pass", { width: passWidth, height: passHeight, depth: passWidth }, this.scene);
                pass.position = new Vector3(px, -passHeight / 2, pz);
                pass.material = this.getMat("dirt");
                pass.parent = chunk.node;
                pass.freezeWorldMatrix();
                chunk.meshes.push(pass);
            }
        }
    }
    
    private generateCanyonRoads(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Смешанные дороги: горные (серпантины) и долинные (прямые)
        // Долинные дороги - прямые дороги
        if (random.chance(0.6)) {
            this.createRoads(chunk, size, random, "park");
        }
        
        // Горные дороги - извилистые (создаём несколько сегментов)
        if (random.chance(0.4)) {
            const roadSegments = random.int(2, 4);
            for (let i = 0; i < roadSegments; i++) {
                const sx = random.range(5, size - 5);
                const sz = random.range(5, size - 5);
                const ex = sx + random.range(-10, 10);
                const ez = sz + random.range(-10, 10);
                
                const road = MeshBuilder.CreateBox("mountain_road", { width: 4, height: 0.2, depth: Math.sqrt((ex-sx)**2 + (ez-sz)**2) }, this.scene);
                road.position = new Vector3((sx + ex) / 2, 0.1, (sz + ez) / 2);
                road.rotation.y = Math.atan2(ez - sz, ex - sx);
                road.material = this.getMat("asphalt");
                road.parent = chunk.node;
                road.freezeWorldMatrix();
                chunk.meshes.push(road);
            }
        }
    }
    
    // Generate Industrial map - large industrial zone with factories, port, railway
    private generateIndustrialMapContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        this.createGround(chunk, worldX, worldZ, size, "gravel", random);
        this.generateGarages(chunk, worldX, worldZ, size, random);
        this.createRoads(chunk, size, random, "industrial");
        
        // Несколько средних заводов (1-2 на чанк)
        const factoryCount = random.int(1, 2);
        for (let i = 0; i < factoryCount; i++) {
            const fx = random.range(10, size - 10);
            const fz = random.range(10, size - 10);
            const fWorldX = chunk.x * this.config.chunkSize + fx;
            const fWorldZ = chunk.z * this.config.chunkSize + fz;
            
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 15)) continue;
            
            const factory = MeshBuilder.CreateBox("factory", { width: random.range(20, 30), height: random.range(8, 15), depth: random.range(25, 35) }, this.scene);
            factory.position = new Vector3(fx, random.range(4, 7.5), fz);
            factory.material = this.getMat(random.pick(["metal", "concrete", "metalRust"]));
            factory.parent = chunk.node;
            factory.freezeWorldMatrix();
            chunk.meshes.push(factory);
            new PhysicsAggregate(factory, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Add smokestacks
            if (random.chance(0.7)) {
                const stack = MeshBuilder.CreateBox("stack", { width: 2, height: random.range(10, 18), depth: 2 }, this.scene);
                stack.position = new Vector3(fx + random.range(-10, 10), random.range(5, 9), fz + random.range(-10, 10));
                stack.material = this.getMat("brickDark");
                stack.parent = chunk.node;
                stack.freezeWorldMatrix();
                chunk.meshes.push(stack);
                new PhysicsAggregate(stack, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // Containers (many)
        const containerCount = random.int(5, 12);
        for (let i = 0; i < containerCount; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunk.x * this.config.chunkSize + cx;
            const cWorldZ = chunk.z * this.config.chunkSize + cz;
            
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 3)) continue;
            
            const container = MeshBuilder.CreateBox("container", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
            const stackHeight = random.int(0, 2);
            container.position = new Vector3(cx, 1.26 + stackHeight * 2.5, cz);
            container.rotation.y = random.pick([0, Math.PI / 2]);
            container.material = this.getMat(random.pick(["red", "yellow", "metal", "metalRust", "blue"]));
            container.parent = chunk.node;
            container.freezeWorldMatrix();
            chunk.meshes.push(container);
            new PhysicsAggregate(container, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Несколько кранов (2-3 на чанк)
        const craneCount = random.int(2, 3);
        for (let i = 0; i < craneCount; i++) {
            const craneX = random.range(15, size - 15);
            const craneZ = random.range(15, size - 15);
            const cWorldX = chunk.x * this.config.chunkSize + craneX;
            const cWorldZ = chunk.z * this.config.chunkSize + craneZ;
            
            if (!this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
                const tower = MeshBuilder.CreateBox("craneTower", { width: 2, height: 15, depth: 2 }, this.scene);
                tower.position = new Vector3(craneX, 7.5, craneZ);
                tower.material = this.getMat("yellow");
                tower.parent = chunk.node;
                tower.freezeWorldMatrix();
                chunk.meshes.push(tower);
                
                const arm = MeshBuilder.CreateBox("craneArm", { width: 1, height: 1, depth: 18 }, this.scene);
                arm.position = new Vector3(craneX, 14, craneZ + 8);
                arm.material = this.getMat("yellow");
                arm.parent = chunk.node;
                arm.freezeWorldMatrix();
                chunk.meshes.push(arm);
            }
        }
        
        // Большой порт с причалами
        this.generateLargePort(chunk, worldX, worldZ, size, random);
        
        // Ж/д терминал
        this.generateRailwayTerminal(chunk, worldX, worldZ, size, random);
        
        // Резервуары для топлива
        this.generateStorageTanks(chunk, size, random);
        
        // Трубопроводы
        this.generatePipeNetwork(chunk, worldX, worldZ, size, random);
        
        this.generateCoverObjects(chunk, worldX, worldZ, size, "industrial");
        this.generatePOIs(chunk, worldX, worldZ, size, "industrial");
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateLargePort(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Большой порт с причалами - генерируем 1 на карту (низкая вероятность на чанк)
        if (random.chance(0.1)) {
            const portX = random.range(20, size - 20);
            const portZ = random.range(20, size - 20);
            const portWorldX = chunk.x * this.config.chunkSize + portX;
            const portWorldZ = chunk.z * this.config.chunkSize + portZ;
            
            if (!this.isPositionInGarageArea(portWorldX, portWorldZ, 15)) {
                // Причалы
                const pierCount = random.int(2, 4);
                for (let i = 0; i < pierCount; i++) {
                    const pier = MeshBuilder.CreateBox("pier", { width: random.range(30, 50), height: 1, depth: 8 }, this.scene);
                    pier.position = new Vector3(portX + (i - pierCount/2) * 20, 0.5, portZ);
                    pier.material = this.getMat("concrete");
                    pier.parent = chunk.node;
                    pier.freezeWorldMatrix();
                    chunk.meshes.push(pier);
                }
                
                // Склады порта
                const warehouseCount = random.int(2, 3);
                for (let i = 0; i < warehouseCount; i++) {
                    const wh = MeshBuilder.CreateBox("port_warehouse", { width: 15, height: 8, depth: 10 }, this.scene);
                    wh.position = new Vector3(portX + random.range(-15, 15), 4, portZ + random.range(-10, 10));
                    wh.material = this.getMat("metalRust");
                    wh.parent = chunk.node;
                    wh.freezeWorldMatrix();
                    chunk.meshes.push(wh);
                }
                
                // Краны порта
                const portCraneCount = random.int(3, 5);
                for (let i = 0; i < portCraneCount; i++) {
                    const craneX = portX + random.range(-20, 20);
                    const craneZ = portZ + random.range(-5, 5);
                    const tower = MeshBuilder.CreateBox("port_crane", { width: 2, height: 18, depth: 2 }, this.scene);
                    tower.position = new Vector3(craneX, 9, craneZ);
                    tower.material = this.getMat("yellow");
                    tower.parent = chunk.node;
                    tower.freezeWorldMatrix();
                    chunk.meshes.push(tower);
                }
            }
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateRailwayTerminal(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Ж/д терминал - генерируем 1 на карту
        if (random.chance(0.08)) {
            const termX = random.range(25, size - 25);
            const termZ = random.range(25, size - 25);
            const termWorldX = chunk.x * this.config.chunkSize + termX;
            const termWorldZ = chunk.z * this.config.chunkSize + termZ;
            
            if (!this.isPositionInGarageArea(termWorldX, termWorldZ, 12)) {
                // Платформа
                const platform = MeshBuilder.CreateBox("railway_platform", { width: 40, height: 2, depth: 5 }, this.scene);
                platform.position = new Vector3(termX, 1, termZ);
                platform.material = this.getMat("concrete");
                platform.parent = chunk.node;
                platform.freezeWorldMatrix();
                chunk.meshes.push(platform);
                
                // Пути
                for (let i = 0; i < 3; i++) {
                    const track = MeshBuilder.CreateBox("railway_track", { width: 40, height: 0.2, depth: 0.5 }, this.scene);
                    track.position = new Vector3(termX, 0.1, termZ + (i - 1) * 3);
            track.material = this.getMat("metal");
            track.parent = chunk.node;
            track.freezeWorldMatrix();
            chunk.meshes.push(track);
        }
        
                // Вагоны
                const wagonCount = random.int(2, 4);
                for (let i = 0; i < wagonCount; i++) {
                    const wagon = MeshBuilder.CreateBox("railway_wagon", { width: 8, height: 3, depth: 3 }, this.scene);
                    wagon.position = new Vector3(termX - 15 + i * 8, 1.5, termZ);
                    wagon.material = this.getMat("metalRust");
                    wagon.parent = chunk.node;
                    wagon.freezeWorldMatrix();
                    chunk.meshes.push(wagon);
                }
                
                // Здание терминала
                const terminal = MeshBuilder.CreateBox("railway_terminal", { width: 20, height: 10, depth: 15 }, this.scene);
                terminal.position = new Vector3(termX, 5, termZ - 10);
                terminal.material = this.getMat("concrete");
                terminal.parent = chunk.node;
                terminal.freezeWorldMatrix();
                chunk.meshes.push(terminal);
            }
        }
    }
    
    private generateStorageTanks(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Резервуары для топлива - 2-4 на чанк
        const tankCount = random.int(2, 4);
        for (let i = 0; i < tankCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            
            if (!this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) {
                const radius = random.range(3, 5);
                const height = random.range(8, 12);
                const tank = MeshBuilder.CreateBox("storage_tank", { width: radius * 2, height, depth: radius * 2 }, this.scene);
                tank.position = new Vector3(tx, height / 2, tz);
                tank.material = this.getMat(random.pick(["metal", "metalRust"]));
                tank.parent = chunk.node;
                tank.freezeWorldMatrix();
                chunk.meshes.push(tank);
                new PhysicsAggregate(tank, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generatePipeNetwork(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Трубопроводы - несколько труб на чанк
        const pipeCount = random.int(2, 4);
        for (let i = 0; i < pipeCount; i++) {
            const px = random.range(10, size - 10);
            const pz = random.range(10, size - 10);
            const pWorldX = chunk.x * this.config.chunkSize + px;
            const pWorldZ = chunk.z * this.config.chunkSize + pz;
            
            if (!this.isPositionInGarageArea(pWorldX, pWorldZ, 3)) {
                const pipeLength = random.range(10, 30);
                const pipeDiameter = random.range(0.5, 1);
                const angle = random.range(0, Math.PI * 2);
                
                const pipe = MeshBuilder.CreateBox("pipe", { width: pipeDiameter, height: pipeLength, depth: pipeDiameter }, this.scene);
                pipe.position = new Vector3(px, pipeDiameter / 2, pz);
                pipe.rotation.z = Math.PI / 2;
                pipe.rotation.y = angle;
                pipe.material = this.getMat("metalRust");
                pipe.parent = chunk.node;
                pipe.freezeWorldMatrix();
                chunk.meshes.push(pipe);
                
                // Опоры для труб
                const supportCount = Math.floor(pipeLength / 8);
                for (let j = 0; j < supportCount; j++) {
                    const support = MeshBuilder.CreateBox("pipe_support", { width: 0.3, height: 1, depth: 0.3 }, this.scene);
                    support.position = new Vector3(px + Math.cos(angle) * (j * 8 - pipeLength/2), 0.5, pz + Math.sin(angle) * (j * 8 - pipeLength/2));
                    support.material = this.getMat("metal");
                    support.parent = chunk.node;
                    support.freezeWorldMatrix();
                    chunk.meshes.push(support);
                }
            }
        }
    }
    
    // Generate Urban Warfare map - dense urban environment with barricades
    private generateUrbanWarfareContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        this.createGround(chunk, worldX, worldZ, size, "asphalt", random);
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
        // Сетка улиц (правильная планировка)
        this.generateGridStreets(chunk, size, random);
        
        // Средняя плотность застройки
        const buildingCount = random.int(5, 7);
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
            
            const worldX_pos = chunk.x * this.config.chunkSize + pos.x;
            const worldZ_pos = chunk.z * this.config.chunkSize + pos.z;
            
            if (this.isPositionInGarageArea(worldX_pos, worldZ_pos, Math.max(w, d) / 2)) continue;
            if (this.isPositionNearRoad(worldX_pos, worldZ_pos, 4)) continue; // Don't place on roads
            
            const building = MeshBuilder.CreateBox("urbanBuilding", { width: w, height: h, depth: d }, this.scene);
            building.position = new Vector3(pos.x, h / 2, pos.z);
            building.material = this.getMat(random.pick(["concrete", "brick", "plaster"]));
            building.parent = chunk.node;
            building.freezeWorldMatrix();
            chunk.meshes.push(building);
            new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Лёгкие разрушения (10-20% зданий)
            if (random.chance(0.15)) {
                this.applyLightDestruction(building, random);
            }
        }
        
        // Парки и площади
        this.generateUrbanParks(chunk, size, random);
        
        // Barricades on roads
        for (let i = 0; i < random.int(2, 4); i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunk.x * this.config.chunkSize + bx;
            const bWorldZ = chunk.z * this.config.chunkSize + bz;
            
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 5)) continue;
            if (this.isPositionNearRoad(bWorldX, bWorldZ, 2)) {
                this.createBarricade(chunk, bx, bz, 10, random);
            }
        }
        
        // Parked vehicles as cover
        for (let i = 0; i < random.int(3, 6); i++) {
            const vx = random.range(5, size - 5);
            const vz = random.range(5, size - 5);
            const vWorldX = chunk.x * this.config.chunkSize + vx;
            const vWorldZ = chunk.z * this.config.chunkSize + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 2)) continue;
            if (this.isPositionNearRoad(vWorldX, vWorldZ, 3)) {
                const car = MeshBuilder.CreateBox("parkedCar", { width: 2, height: 1.5, depth: 4 }, this.scene);
                car.position = new Vector3(vx, 0.75, vz);
                car.rotation.y = random.range(0, Math.PI * 2);
                car.material = this.getMat(random.pick(["red", "metal", "brickDark"]));
                car.parent = chunk.node;
                car.freezeWorldMatrix();
                chunk.meshes.push(car);
            }
        }
        
        this.generateCoverObjects(chunk, worldX, worldZ, size, "city");
        this.generatePOIs(chunk, worldX, worldZ, size, "city");
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    private generateGridStreets(chunk: ChunkData, size: number, random: SeededRandom): void {
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
            street.parent = chunk.node;
            street.freezeWorldMatrix();
            chunk.meshes.push(street);
        }
        
        // Вертикальные улицы
        for (let i = 1; i < gridSize; i++) {
            const streetX = i * cellSize;
            const street = MeshBuilder.CreateBox("grid_street_v", { width: streetWidth, height: 0.2, depth: size }, this.scene);
            street.position = new Vector3(streetX, 0.1, size / 2);
            street.material = this.getMat("asphalt");
            street.parent = chunk.node;
            street.freezeWorldMatrix();
            chunk.meshes.push(street);
        }
    }
    
    private generateUrbanParks(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Парки и площади - 1-2 на чанк
        const parkCount = random.int(1, 2);
        for (let i = 0; i < parkCount; i++) {
            const px = random.range(15, size - 15);
            const pz = random.range(15, size - 15);
            const pWorldX = chunk.x * this.config.chunkSize + px;
            const pWorldZ = chunk.z * this.config.chunkSize + pz;
            
            if (!this.isPositionInGarageArea(pWorldX, pWorldZ, 10)) {
                const isPark = random.chance(0.5);
                const parkSize = random.range(15, 25);
                
                const park = MeshBuilder.CreateBox(isPark ? "park" : "square", { width: parkSize, height: 0.1, depth: parkSize }, this.scene);
                park.position = new Vector3(px, 0.05, pz);
                park.material = this.getMat(isPark ? "grass" : "asphalt");
                park.parent = chunk.node;
                park.freezeWorldMatrix();
                chunk.meshes.push(park);
            }
        }
    }
    
    private applyLightDestruction(building: Mesh, random: SeededRandom): void {
        // Лёгкие разрушения: немного уменьшаем размер здания
        building.scaling.x *= random.range(0.9, 1.0);
        building.scaling.z *= random.range(0.9, 1.0);
    }
    
    // Generate Underground map - cave system, mines, tunnels
    private generateUndergroundContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        this.createGround(chunk, worldX, worldZ, size, "gravel", random);
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
        // Природные пещеры + шахты
        this.generateNaturalCaves(chunk, worldX, worldZ, size, random);
        this.generateMineSystem(chunk, worldX, worldZ, size, random);
        
        // Подземная вода
        this.generateUndergroundWater(chunk, size, random);
        
        // Освещение
        this.generateUndergroundLighting(chunk, size, random);
        
        // Выходы на поверхность
        this.generateUndergroundExits(chunk, size, random);
        
        // Create cave entrances (large openings)
        if (random.chance(0.3)) {
            const caveX = random.range(15, size - 15);
            const caveZ = random.range(15, size - 15);
            const caveWorldX = chunk.x * this.config.chunkSize + caveX;
            const caveWorldZ = chunk.z * this.config.chunkSize + caveZ;
            
            if (!this.isPositionInGarageArea(caveWorldX, caveWorldZ, 8)) {
                // Cave opening as arch/tunnel entrance
                const archHeight = random.range(6, 10);
                const archWidth = random.range(8, 12);
                
                // Left pillar
                const leftPillar = MeshBuilder.CreateBox("cavePillar", { width: 1.5, height: archHeight, depth: 1.5 }, this.scene);
                leftPillar.position = new Vector3(caveX - archWidth / 2, archHeight / 2, caveZ);
                leftPillar.material = this.getMat("rock");
                leftPillar.parent = chunk.node;
                leftPillar.freezeWorldMatrix();
                chunk.meshes.push(leftPillar);
                
                // Right pillar
                const rightPillar = MeshBuilder.CreateBox("cavePillar", { width: 1.5, height: archHeight, depth: 1.5 }, this.scene);
                rightPillar.position = new Vector3(caveX + archWidth / 2, archHeight / 2, caveZ);
                rightPillar.material = this.getMat("rock");
                rightPillar.parent = chunk.node;
                rightPillar.freezeWorldMatrix();
                chunk.meshes.push(rightPillar);
                
                // Top arch
                const arch = MeshBuilder.CreateBox("caveArch", { width: archWidth, height: 2, depth: 2 }, this.scene);
                arch.position = new Vector3(caveX, archHeight, caveZ);
                arch.material = this.getMat("rock");
                arch.parent = chunk.node;
                arch.freezeWorldMatrix();
                chunk.meshes.push(arch);
            }
        }
        
        // Mine carts/tracks
        if (random.chance(0.4)) {
            const trackLen = random.range(20, 40);
            const trackX = random.range(5, size - 5);
            const trackZ = random.range(5, size - 5);
            const angle = random.pick([0, Math.PI / 2]);
            
            const track = MeshBuilder.CreateBox("mineTrack", { width: trackLen, height: 0.3, depth: 0.5 }, this.scene);
            track.position = new Vector3(trackX, 0.15, trackZ);
            track.rotation.y = angle;
            track.material = this.getMat("metal");
            track.parent = chunk.node;
            track.freezeWorldMatrix();
            chunk.meshes.push(track);
        }
        
        // Support pillars - увеличиваем количество для больших пространств
        for (let i = 0; i < random.int(4, 8); i++) {
            const px = random.range(8, size - 8);
            const pz = random.range(8, size - 8);
            const pWorldX = chunk.x * this.config.chunkSize + px;
            const pWorldZ = chunk.z * this.config.chunkSize + pz;
            
            if (this.isPositionInGarageArea(pWorldX, pWorldZ, 2)) continue;
            
            const pillar = MeshBuilder.CreateBox("supportPillar", { width: 1.5, height: random.range(6, 10), depth: 1.5 }, this.scene);
            pillar.position = new Vector3(px, random.range(3, 5), pz);
            pillar.material = this.getMat("concrete");
            pillar.parent = chunk.node;
            pillar.freezeWorldMatrix();
            chunk.meshes.push(pillar);
            new PhysicsAggregate(pillar, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        this.generateCoverObjects(chunk, worldX, worldZ, size, "military");
        this.generatePOIs(chunk, worldX, worldZ, size, "military");
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateNaturalCaves(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Природные пещеры - большие залы неправильной формы
        if (random.chance(0.3)) {
            const caveX = random.range(20, size - 20);
            const caveZ = random.range(20, size - 20);
            const caveWorldX = chunk.x * this.config.chunkSize + caveX;
            const caveWorldZ = chunk.z * this.config.chunkSize + caveZ;
            
            if (!this.isPositionInGarageArea(caveWorldX, caveWorldZ, 10)) {
                const caveSize = random.range(20, 40);
                const caveHeight = random.range(8, 15);
                
                const cave = MeshBuilder.CreateBox("natural_cave", { width: caveSize, height: caveHeight, depth: caveSize }, this.scene);
                cave.position = new Vector3(caveX, caveHeight / 2, caveZ);
                cave.material = this.getMat("rock");
                cave.parent = chunk.node;
                cave.freezeWorldMatrix();
                chunk.meshes.push(cave);
            }
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateMineSystem(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Система шахт: туннели, рельсы, вагонетки, оборудование
        if (random.chance(0.4)) {
            const tunnelWidth = random.range(5, 8);
            const tunnelLength = random.range(30, 50);
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            
            if (!this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) {
                const tunnel = MeshBuilder.CreateBox("mine_tunnel", { width: tunnelWidth, height: tunnelWidth, depth: tunnelLength }, this.scene);
                tunnel.position = new Vector3(tx, tunnelWidth / 2, tz);
                tunnel.material = this.getMat("rock");
                tunnel.parent = chunk.node;
                tunnel.freezeWorldMatrix();
                chunk.meshes.push(tunnel);
                
                const track = MeshBuilder.CreateBox("mine_track", { width: tunnelLength, height: 0.3, depth: 0.5 }, this.scene);
                track.position = new Vector3(tx, 0.15, tz);
                track.material = this.getMat("metal");
                track.parent = chunk.node;
                track.freezeWorldMatrix();
                chunk.meshes.push(track);
                
                if (random.chance(0.6)) {
                    const cart = MeshBuilder.CreateBox("mine_cart", { width: 2, height: 1.5, depth: 3 }, this.scene);
                    cart.position = new Vector3(tx, 0.75, tz);
                    cart.material = this.getMat("metalRust");
                    cart.parent = chunk.node;
                    cart.freezeWorldMatrix();
                    chunk.meshes.push(cart);
                }
            }
        }
    }
    
    private generateUndergroundWater(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Подземная вода - немного воды (1-2 объекта на чанк)
        const waterCount = random.int(1, 2);
        for (let i = 0; i < waterCount; i++) {
            const wx = random.range(15, size - 15);
            const wz = random.range(15, size - 15);
            const wWorldX = chunk.x * this.config.chunkSize + wx;
            const wWorldZ = chunk.z * this.config.chunkSize + wz;
            
            if (!this.isPositionInGarageArea(wWorldX, wWorldZ, 5)) {
                const radius = random.range(3, 8);
                const lake = MeshBuilder.CreateBox("underground_lake", { width: radius * 2, height: 0.1, depth: radius * 2 }, this.scene);
                lake.position = new Vector3(wx, -0.85, wz); // Поднято на +0.15 (было -1)
                lake.material = this.getMat("water");
                lake.parent = chunk.node;
                lake.freezeWorldMatrix();
                chunk.meshes.push(lake);
            }
        }
    }
    
    private generateUndergroundLighting(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Современное освещение - 3-5 источников света на чанк
        const lightCount = random.int(3, 5);
        for (let i = 0; i < lightCount; i++) {
            const lx = random.range(10, size - 10);
            const lz = random.range(10, size - 10);
            const lWorldX = chunk.x * this.config.chunkSize + lx;
            const lWorldZ = chunk.z * this.config.chunkSize + lz;
            
            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 3)) {
                const light = new PointLight("underground_light", new Vector3(lx, 5, lz), this.scene);
                light.intensity = 0.8;
                light.range = 15;
                light.diffuse = new Color3(1, 0.95, 0.8);
            }
        }
    }
    
    private generateUndergroundExits(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Выходы на поверхность - 1-2 выхода на чанк
        const exitCount = random.int(1, 2);
        for (let i = 0; i < exitCount; i++) {
            if (random.chance(0.3)) {
                const ex = random.range(15, size - 15);
                const ez = random.range(15, size - 15);
                const eWorldX = chunk.x * this.config.chunkSize + ex;
                const eWorldZ = chunk.z * this.config.chunkSize + ez;
                
                if (!this.isPositionInGarageArea(eWorldX, eWorldZ, 5)) {
                    const shaft = MeshBuilder.CreateBox("exit_shaft", { width: 3, height: 10, depth: 3 }, this.scene);
                    shaft.position = new Vector3(ex, 5, ez);
                    shaft.material = this.getMat("concrete");
                    shaft.parent = chunk.node;
                    shaft.freezeWorldMatrix();
                    chunk.meshes.push(shaft);
                    
                    for (let step = 0; step < 5; step++) {
                        const stepMesh = MeshBuilder.CreateBox("exit_step", { width: 2.5, height: 0.2, depth: 0.5 }, this.scene);
                        stepMesh.position = new Vector3(ex, step * 0.2, ez + step * 0.5);
                        stepMesh.material = this.getMat("concrete");
                        stepMesh.parent = chunk.node;
                        stepMesh.freezeWorldMatrix();
                        chunk.meshes.push(stepMesh);
                    }
                }
            }
        }
    }
    
    // Generate Coastal map - coastline with port, lighthouses, beaches, cliffs
    private generateCoastalContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        this.createGround(chunk, worldX, worldZ, size, "sand", random);
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
        // Create water (large flat area)
        if (random.chance(0.5)) {
            const waterX = random.range(0, size);
            const waterZ = random.range(0, size);
            const waterSize = random.range(size * 0.3, size * 0.6);
            
            const water = MeshBuilder.CreateBox("water", { width: waterSize, height: 0.1, depth: waterSize }, this.scene);
            water.position = new Vector3(waterX, 0.1, waterZ); // Поднято на +0.15 (было -0.05)
            water.material = this.getMat("water");
            water.parent = chunk.node;
            water.freezeWorldMatrix();
            chunk.meshes.push(water);
        }
        
        // Несколько маяков, большой порт, смешанный берег, водные объекты, все типы зданий
        this.generateLighthouses(chunk, worldX, worldZ, size, random);
        this.generateLargeCoastalPort(chunk, worldX, worldZ, size, random);
        this.generateCoastalBeach(chunk, worldX, worldZ, size, random);
        this.generateCoastalWaterFeatures(chunk, worldX, worldZ, size, random);
        this.generateCoastalBuildings(chunk, size, random);
        
        // Утёсы (высокие)
        if (random.chance(0.4)) {
            const cliffX = random.range(10, size - 10);
            const cliffZ = random.range(10, size - 10);
            const cliffWorldX = chunk.x * this.config.chunkSize + cliffX;
            const cliffWorldZ = chunk.z * this.config.chunkSize + cliffZ;
            
            if (!this.isPositionInGarageArea(cliffWorldX, cliffWorldZ, 5)) {
                const cliff = MeshBuilder.CreateBox("cliff", { width: random.range(10, 20), height: random.range(6, 12), depth: random.range(8, 15) }, this.scene);
                cliff.position = new Vector3(cliffX, random.range(3, 6), cliffZ);
                cliff.material = this.getMat("rock");
                cliff.parent = chunk.node;
                cliff.freezeWorldMatrix();
                chunk.meshes.push(cliff);
                new PhysicsAggregate(cliff, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // Coastal vegetation
        for (let i = 0; i < random.int(2, 5); i++) {
            const vx = random.range(5, size - 5);
            const vz = random.range(5, size - 5);
            const vWorldX = chunk.x * this.config.chunkSize + vx;
            const vWorldZ = chunk.z * this.config.chunkSize + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 1)) continue;
            
            const bush = MeshBuilder.CreateBox("coastalBush", { width: 2, height: 1.5, depth: 2 }, this.scene);
            bush.position = new Vector3(vx, 0.75, vz);
            bush.material = this.getMat("leaves");
            bush.parent = chunk.node;
            bush.freezeWorldMatrix();
            chunk.meshes.push(bush);
        }
        
        this.createRoads(chunk, size, random, "park");
        this.generateCoverObjects(chunk, worldX, worldZ, size, "park");
        this.generatePOIs(chunk, worldX, worldZ, size, "park");
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateLighthouses(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Несколько маяков (2-3 на карту) - низкая вероятность на чанк
        if (random.chance(0.15)) {
            const lx = random.range(15, size - 15);
            const lz = random.range(15, size - 15);
            const lWorldX = chunk.x * this.config.chunkSize + lx;
            const lWorldZ = chunk.z * this.config.chunkSize + lz;
            
            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 5)) {
                const base = MeshBuilder.CreateBox("lighthouseBase", { width: 4, height: 3, depth: 4 }, this.scene);
                base.position = new Vector3(lx, 1.5, lz);
                base.material = this.getMat("concrete");
                base.parent = chunk.node;
                base.freezeWorldMatrix();
                chunk.meshes.push(base);
                
                const tower = MeshBuilder.CreateBox("lighthouseTower", { width: 2, height: 12, depth: 2 }, this.scene);
                tower.position = new Vector3(lx, 9, lz);
                tower.material = this.getMat("white");
                tower.parent = chunk.node;
                tower.freezeWorldMatrix();
                chunk.meshes.push(tower);
                
                const top = MeshBuilder.CreateBox("lighthouseTop", { width: 3, height: 1, depth: 3 }, this.scene);
                top.position = new Vector3(lx, 16.5, lz);
                top.material = this.getMat("yellow");
                top.parent = chunk.node;
                top.freezeWorldMatrix();
                chunk.meshes.push(top);
            }
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateLargeCoastalPort(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Большой порт - генерируем 1 на карту
        if (random.chance(0.1)) {
            const portX = random.range(25, size - 25);
            const portZ = random.range(25, size - 25);
            const portWorldX = chunk.x * this.config.chunkSize + portX;
            const portWorldZ = chunk.z * this.config.chunkSize + portZ;
            
            if (!this.isPositionInGarageArea(portWorldX, portWorldZ, 20)) {
                const pierCount = random.int(3, 5);
                for (let i = 0; i < pierCount; i++) {
                    const pier = MeshBuilder.CreateBox("coastal_pier", { width: random.range(30, 50), height: 1, depth: 8 }, this.scene);
                    pier.position = new Vector3(portX + (i - pierCount/2) * 20, 0.5, portZ);
                    pier.material = this.getMat("concrete");
                    pier.parent = chunk.node;
                    pier.freezeWorldMatrix();
                    chunk.meshes.push(pier);
                }
                
                const warehouseCount = random.int(3, 5);
                for (let i = 0; i < warehouseCount; i++) {
                    const wh = MeshBuilder.CreateBox("coastal_warehouse", { width: 15, height: 8, depth: 10 }, this.scene);
                    wh.position = new Vector3(portX + random.range(-20, 20), 4, portZ + random.range(-15, 15));
                    wh.material = this.getMat("metalRust");
                    wh.parent = chunk.node;
                    wh.freezeWorldMatrix();
                    chunk.meshes.push(wh);
                }
                
                const portCraneCount = random.int(4, 6);
                for (let i = 0; i < portCraneCount; i++) {
                    const craneX = portX + random.range(-25, 25);
                    const craneZ = portZ + random.range(-10, 10);
                    const tower = MeshBuilder.CreateBox("coastal_crane", { width: 2, height: 18, depth: 2 }, this.scene);
                    tower.position = new Vector3(craneX, 9, craneZ);
                    tower.material = this.getMat("yellow");
                    tower.parent = chunk.node;
                    tower.freezeWorldMatrix();
                    chunk.meshes.push(tower);
                }
            }
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateCoastalBeach(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Смешанный берег: песчаные пляжи + скалистые участки
        if (random.chance(0.4)) {
            const beachX = random.range(10, size - 10);
            const beachZ = random.range(10, size - 10);
            const beachSize = random.range(15, 25);
            
            const beach = MeshBuilder.CreateBox("beach", { width: beachSize, height: 0.1, depth: beachSize }, this.scene);
            beach.position = new Vector3(beachX, 0.05, beachZ);
            beach.material = this.getMat("sand");
            beach.parent = chunk.node;
            beach.freezeWorldMatrix();
            chunk.meshes.push(beach);
        }
        
        if (random.chance(0.3)) {
            const rockX = random.range(10, size - 10);
            const rockZ = random.range(10, size - 10);
            const rockSize = random.range(10, 20);
            
            const rocks = MeshBuilder.CreateBox("coastal_rocks", { width: rockSize, height: random.range(1, 3), depth: rockSize }, this.scene);
            rocks.position = new Vector3(rockX, random.range(0.5, 1.5), rockZ);
            rocks.material = this.getMat("rock");
            rocks.parent = chunk.node;
            rocks.freezeWorldMatrix();
            chunk.meshes.push(rocks);
        }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private generateCoastalWaterFeatures(chunk: ChunkData, _worldX: number, _worldZ: number, size: number, random: SeededRandom): void {
        // Водные объекты: гавань, бухты, острова
        if (random.chance(0.12)) {
            const harborX = random.range(20, size - 20);
            const harborZ = random.range(20, size - 20);
            const harborSize = random.range(20, 30);
            
            const harbor = MeshBuilder.CreateBox("harbor", { width: harborSize * 2, height: 0.1, depth: harborSize * 2 }, this.scene);
            harbor.position = new Vector3(harborX, 0.2, harborZ); // Поднято на +0.15 (было -0.05)
            harbor.material = this.getMat("water");
            harbor.parent = chunk.node;
            harbor.freezeWorldMatrix();
            chunk.meshes.push(harbor);
        }
        
        if (random.chance(0.1)) {
            const islandX = random.range(20, size - 20);
            const islandZ = random.range(20, size - 20);
            const islandSize = random.range(8, 15);
            const islandHeight = random.range(2, 5);
            
            const island = MeshBuilder.CreateBox("island", { width: islandSize, height: islandHeight, depth: islandSize }, this.scene);
            island.position = new Vector3(islandX, islandHeight / 2, islandZ);
            island.material = this.getMat("rock");
            island.parent = chunk.node;
            island.freezeWorldMatrix();
            chunk.meshes.push(island);
        }
    }
    
    private generateCoastalBuildings(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Все типы зданий: рыбацкие, военные, курортные
        const buildingCount = random.int(2, 4);
        for (let i = 0; i < buildingCount; i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunk.x * this.config.chunkSize + bx;
            const bWorldZ = chunk.z * this.config.chunkSize + bz;
            
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
                building.parent = chunk.node;
                building.freezeWorldMatrix();
                chunk.meshes.push(building);
                new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    // Генерация припасов на карте
    private generateConsumables(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
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
            
            // Материал с цветом припаса и свечением
            const colors: { [key: string]: Color3 } = {
                "health": new Color3(1, 0, 0),
                "speed": new Color3(1, 1, 0),
                "armor": new Color3(0, 1, 1),
                "ammo": new Color3(1, 0.5, 0),
                "damage": new Color3(1, 0, 0)
            };
            
            const mat = new StandardMaterial(`consumableMat_${type}`, this.scene);
            const color = colors[type] || Color3.White();
            mat.diffuseColor = color;
            mat.emissiveColor = color.scale(0.8); // Яркое свечение
            mat.specularColor = Color3.Black();
            mat.disableLighting = true; // Всегда светится
            consumable.material = mat;
            
            const initialY = consumable.position.y;
            const rotationSpeed = 0.03;
            const bobSpeed = 2.5;
            const bobAmplitude = 0.4;
            
            consumable.parent = chunk.node;
            // Не замораживаем матрицу для анимации вращения
            chunk.meshes.push(consumable);
            
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
                    color: color,
                    mat: mat
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
