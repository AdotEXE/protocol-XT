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
    TransformNode
} from "@babylonjs/core";
import { MapType } from "./menu";
import { RoadNetwork } from "./roadNetwork";
import { TerrainGenerator } from "./noiseGenerator";
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
    pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
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
    private terrainGenerator: TerrainGenerator | null = null;
    
    // Cover generator for obstacles and cover objects
    private coverGenerator: CoverGenerator | null = null;
    
    // POI system for points of interest
    private poiSystem: POISystem | null = null;
    
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
            unloadDistance: 3,  // Уменьшено для оптимизации производительности
            worldSeed: Date.now(),
            mapType: "normal", // По умолчанию
            ...config
        };
        console.log(`[ChunkSystem] Constructor called with mapType: ${this.config.mapType}`);
        this.createMaterials();
        
        // Initialize road network and terrain generator for normal map
        if (this.config.mapType === "normal") {
            this.roadNetwork = new RoadNetwork(this.scene, {
                worldSeed: this.config.worldSeed,
                chunkSize: this.config.chunkSize,
                highwaySpacing: 200,
                streetSpacing: 40
            });
            
            this.terrainGenerator = new TerrainGenerator(this.config.worldSeed);
            
            this.coverGenerator = new CoverGenerator(this.scene, {
                worldSeed: this.config.worldSeed
            });
            
            this.poiSystem = new POISystem(this.scene, {
                worldSeed: this.config.worldSeed,
                poiSpacing: 150
            });
            
            console.log(`[ChunkSystem] All generators initialized with seed: ${this.config.worldSeed}`);
        }
        
        // СРАЗУ создаём гаражи для спавна!
        this.createAllGarages();
        
        console.log(`[ChunkSystem] Initialized with ${this.garagePositions.length} garages, mapType: ${this.config.mapType}`);
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
        mesh.isPickable = false;
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
    
    private guaranteedGarageCreated = false;
    
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
        this.guaranteedGarageCreated = true;
        
        // В режиме песочницы создаём только один гараж в центре
        if (this.config.mapType === "sandbox") {
            this.createGarageAt(0, 0, 0);
            console.log(`[ChunkSystem] Sandbox mode: Created 1 garage at center`);
            console.log(`[ChunkSystem] Created ${this.garageCapturePoints.length} capture points (workbenches)`);
            console.log(`[ChunkSystem] Initialized ${this.garageOwnership.size} garage ownership records`);
            return;
        }
        
        // В режиме полигона создаём гараж в углу арены
        if (this.config.mapType === "polygon") {
            // Гараж в юго-западном углу арены (арена 200x200)
            this.createGarageAt(-70, -70, 0);
            console.log(`[ChunkSystem] Polygon mode: Created 1 garage at corner`);
            console.log(`[ChunkSystem] Created ${this.garageCapturePoints.length} capture points (workbenches)`);
            console.log(`[ChunkSystem] Initialized ${this.garageOwnership.size} garage ownership records`);
            return;
        }
        
        // В режиме передовой создаём гараж на западной стороне (база игрока)
        if (this.config.mapType === "frontline") {
            // Гараж на западной стороне карты (600x600)
            this.createGarageAt(-250, 0, 0);
            console.log(`[ChunkSystem] Frontline mode: Created 1 garage at player base (west side)`);
            console.log(`[ChunkSystem] Created ${this.garageCapturePoints.length} capture points (workbenches)`);
            console.log(`[ChunkSystem] Initialized ${this.garageOwnership.size} garage ownership records`);
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
        
        console.log(`[ChunkSystem] Created ${this.garagePositions.length} garages`);
        console.log(`[ChunkSystem] Created ${this.garageCapturePoints.length} capture points (workbenches)`);
        console.log(`[ChunkSystem] Initialized ${this.garageOwnership.size} garage ownership records`);
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
        let doorMat = this.materials.get("garageDoor");
        if (!doorMat) {
            doorMat = new StandardMaterial("garageDoorMat", this.scene);
            doorMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
            doorMat.specularColor = Color3.Black();
            doorMat.alpha = 0.5; // 50% прозрачность
            this.materials.set("garageDoor", doorMat);
        }
        
        // ПОЛ ГАРАЖА (бетонный) - делаем с отверстием для ямы
        // Размеры ямы (определяем заранее для создания пола с отверстием)
        const pitWidth = 6;
        const pitDepth = 10;
        
        // Создаём пол из нескольких частей, исключая область ямы
        const floorParts: Mesh[] = [];
        
        // Левая часть пола
        const floorLeft = MeshBuilder.CreateBox(`garageFloorLeft_${index}`, {
            width: (garageWidth - pitWidth) / 2 - 0.25,
            height: 0.15,
            depth: garageDepth - 0.5
        }, this.scene);
        floorLeft.position = new Vector3(garageX - (garageWidth + pitWidth) / 4, 0.075, garageZ);
        floorLeft.material = floorMat;
        floorParts.push(floorLeft);
        
        // Правая часть пола
        const floorRight = MeshBuilder.CreateBox(`garageFloorRight_${index}`, {
            width: (garageWidth - pitWidth) / 2 - 0.25,
            height: 0.15,
            depth: garageDepth - 0.5
        }, this.scene);
        floorRight.position = new Vector3(garageX + (garageWidth + pitWidth) / 4, 0.075, garageZ);
        floorRight.material = floorMat;
        floorParts.push(floorRight);
        
        // Передняя часть пола (перед ямой)
        const floorFront = MeshBuilder.CreateBox(`garageFloorFront_${index}`, {
            width: pitWidth,
            height: 0.15,
            depth: (garageDepth - pitDepth) / 2 - 0.25
        }, this.scene);
        floorFront.position = new Vector3(garageX, 0.075, garageZ - (garageDepth + pitDepth) / 4);
        floorFront.material = floorMat;
        floorParts.push(floorFront);
        
        // Задняя часть пола (за ямой)
        const floorBack = MeshBuilder.CreateBox(`garageFloorBack_${index}`, {
            width: pitWidth,
            height: 0.15,
            depth: (garageDepth - pitDepth) / 2 - 0.25
        }, this.scene);
        floorBack.position = new Vector3(garageX, 0.075, garageZ + (garageDepth + pitDepth) / 4);
        floorBack.material = floorMat;
        floorParts.push(floorBack);
        
        // Объединяем части пола
        const floor = Mesh.MergeMeshes(floorParts, true, false, undefined, false, true);
        if (!floor) {
            // Если объединение не удалось, используем первую часть
            floorParts[0].name = `garageFloor_${index}`;
        } else {
            floor.name = `garageFloor_${index}`;
        }
        
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
        frontDoor.material = doorMat; // Используем материал с прозрачностью 50%
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
        backDoor.material = doorMat; // Используем материал с прозрачностью 50%
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
        
        // Сохраняем все стены гаража для управления прозрачностью (кроме крыши - она должна оставаться видимой)
        const garageWalls: Mesh[] = [
            backLeftWall,
            backRightWall,
            backLintel,
            leftWall,
            rightWall,
            frontLeftWall,
            frontRightWall,
            lintel
            // Крыша не включается - она должна оставаться видимой
        ];
        this.garageWalls.push({
            walls: garageWalls,
            position: new Vector3(garageX, 0, garageZ),
            width: garageWidth,
            depth: garageDepth
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
        
        // ПОЗИЦИЯ СПАВНА - ТОЧНО В ЦЕНТРЕ ГАРАЖА!
        // Гараж: X=0, Z=0, глубина=20 (от Z=-10 до Z=+10), ширина=16 (от X=-8 до X=+8)
        // Танк спавнится в центре гаража, близко к земле
        const spawnPos = new Vector3(garageX, 1.2, garageZ);
        this.garagePositions.push(spawnPos);
        
        // Сохраняем область гаража (с запасом чтобы ничего не спавнилось внутри)
        this.garageAreas.push({
            x: garageX - garageWidth / 2 - 3,
            z: garageZ - garageDepth / 2 - 3,
            width: garageWidth + 6,
            depth: garageDepth + 6
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
            leg.material = workbenchMat;
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
        
        // ГАРАЖНАЯ ЯМА в центре гаража (улучшенная для танка)
        // pitWidth и pitDepth уже определены выше при создании пола
        const pitHeight = 2.0; // Увеличена глубина ямы
        
        // Дно ямы (ниже уровня пола)
        const pitFloor = MeshBuilder.CreateBox(`garagePitFloor_${index}`, {
            width: pitWidth,
            height: 0.1,
            depth: pitDepth
        }, this.scene);
        pitFloor.position = new Vector3(garageX, -pitHeight + 0.05, garageZ);
        pitFloor.material = floorMat;
        pitFloor.isPickable = false;
        
        // Стены ямы
        // Передняя стена ямы
        const pitFrontWall = MeshBuilder.CreateBox(`garagePitFront_${index}`, {
            width: pitWidth,
            height: pitHeight,
            depth: 0.2
        }, this.scene);
        pitFrontWall.position = new Vector3(garageX, -pitHeight / 2, garageZ - pitDepth / 2);
        pitFrontWall.material = garageMat;
        pitFrontWall.isPickable = false;
        
        // Задняя стена ямы
        const pitBackWall = MeshBuilder.CreateBox(`garagePitBack_${index}`, {
            width: pitWidth,
            height: pitHeight,
            depth: 0.2
        }, this.scene);
        pitBackWall.position = new Vector3(garageX, -pitHeight / 2, garageZ + pitDepth / 2);
        pitBackWall.material = garageMat;
        pitBackWall.isPickable = false;
        
        // Левая стена ямы
        const pitLeftWall = MeshBuilder.CreateBox(`garagePitLeft_${index}`, {
            width: 0.2,
            height: pitHeight,
            depth: pitDepth
        }, this.scene);
        pitLeftWall.position = new Vector3(garageX - pitWidth / 2, -pitHeight / 2, garageZ);
        pitLeftWall.material = garageMat;
        pitLeftWall.isPickable = false;
        
        // Правая стена ямы
        const pitRightWall = MeshBuilder.CreateBox(`garagePitRight_${index}`, {
            width: 0.2,
            height: pitHeight,
            depth: pitDepth
        }, this.scene);
        pitRightWall.position = new Vector3(garageX + pitWidth / 2, -pitHeight / 2, garageZ);
        pitRightWall.material = garageMat;
        pitRightWall.isPickable = false;
        
        // ЛЕСТНИЦА в яму (с передней стороны)
        const stepCount = 4;
        const stepWidth = 1.0;
        const stepHeight = pitHeight / stepCount;
        const stepDepth = 0.3;
        
        for (let i = 0; i < stepCount; i++) {
            const step = MeshBuilder.CreateBox(`garagePitStep_${index}_${i}`, {
                width: stepWidth,
                height: stepHeight,
                depth: stepDepth
            }, this.scene);
            step.position = new Vector3(
                garageX - pitWidth / 2 + stepWidth / 2,
                -pitHeight + (i + 0.5) * stepHeight,
                garageZ - pitDepth / 2 - stepDepth / 2
            );
            step.material = garageMat;
            step.isPickable = false;
        }
        
        // Перила лестницы
        const railingLeft = MeshBuilder.CreateBox(`garagePitRailingLeft_${index}`, {
            width: 0.05,
            height: 0.6,
            depth: stepDepth * stepCount
        }, this.scene);
        railingLeft.position = new Vector3(
            garageX - pitWidth / 2 + 0.025,
            -pitHeight / 2 + 0.3,
            garageZ - pitDepth / 2 - stepDepth * stepCount / 2
        );
        railingLeft.material = toolMat;
        railingLeft.isPickable = false;
        
        const railingRight = MeshBuilder.CreateBox(`garagePitRailingRight_${index}`, {
            width: 0.05,
            height: 0.6,
            depth: stepDepth * stepCount
        }, this.scene);
        railingRight.position = new Vector3(
            garageX - pitWidth / 2 + stepWidth - 0.025,
            -pitHeight / 2 + 0.3,
            garageZ - pitDepth / 2 - stepDepth * stepCount / 2
        );
        railingRight.material = toolMat;
        railingRight.isPickable = false;
        
        // Материал для ящиков (дерево) - определяем заранее
        let ammoBoxMat = this.materials.get("wood");
        if (!ammoBoxMat) {
            ammoBoxMat = new StandardMaterial("ammoBoxMat", this.scene);
            ammoBoxMat.diffuseColor = new Color3(0.35, 0.25, 0.15); // Коричневый деревянный
            this.materials.set("wood", ammoBoxMat);
        }
        
        // ЗАЩИТНЫЕ ОГРАЖДЕНИЯ по краям ямы (на уровне пола)
        const guardrailHeight = 0.15;
        const guardrailThickness = 0.1;
        
        // Переднее ограждение
        const frontGuardrail = MeshBuilder.CreateBox(`garagePitFrontGuardrail_${index}`, {
            width: pitWidth + 0.5,
            height: guardrailHeight,
            depth: guardrailThickness
        }, this.scene);
        frontGuardrail.position = new Vector3(garageX, guardrailHeight / 2, garageZ - pitDepth / 2 - 0.2);
        frontGuardrail.material = toolMat;
        frontGuardrail.isPickable = false;
        
        // Заднее ограждение
        const backGuardrail = MeshBuilder.CreateBox(`garagePitBackGuardrail_${index}`, {
            width: pitWidth + 0.5,
            height: guardrailHeight,
            depth: guardrailThickness
        }, this.scene);
        backGuardrail.position = new Vector3(garageX, guardrailHeight / 2, garageZ + pitDepth / 2 + 0.2);
        backGuardrail.material = toolMat;
        backGuardrail.isPickable = false;
        
        // Левое ограждение
        const leftGuardrail = MeshBuilder.CreateBox(`garagePitLeftGuardrail_${index}`, {
            width: guardrailThickness,
            height: guardrailHeight,
            depth: pitDepth
        }, this.scene);
        leftGuardrail.position = new Vector3(garageX - pitWidth / 2 - 0.2, guardrailHeight / 2, garageZ);
        leftGuardrail.material = toolMat;
        leftGuardrail.isPickable = false;
        
        // Правое ограждение
        const rightGuardrail = MeshBuilder.CreateBox(`garagePitRightGuardrail_${index}`, {
            width: guardrailThickness,
            height: guardrailHeight,
            depth: pitDepth
        }, this.scene);
        rightGuardrail.position = new Vector3(garageX + pitWidth / 2 + 0.2, guardrailHeight / 2, garageZ);
        rightGuardrail.material = toolMat;
        rightGuardrail.isPickable = false;
        
        // ДОМКРАТЫ/СТОЙКИ вокруг ямы
        // Домкрат 1 (слева от ямы)
        const jack1 = MeshBuilder.CreateBox(`garagePitJack1_${index}`, {
            width: 0.4,
            height: 0.6,
            depth: 0.4
        }, this.scene);
        jack1.position = new Vector3(garageX - pitWidth / 2 - 1.0, 0.3, garageZ - 2);
        jack1.material = toolMat;
        jack1.isPickable = false;
        
        // Домкрат 2 (справа от ямы)
        const jack2 = MeshBuilder.CreateBox(`garagePitJack2_${index}`, {
            width: 0.4,
            height: 0.6,
            depth: 0.4
        }, this.scene);
        jack2.position = new Vector3(garageX + pitWidth / 2 + 1.0, 0.3, garageZ + 2);
        jack2.material = toolMat;
        jack2.isPickable = false;
        
        // ЯЩИКИ С ИНСТРУМЕНТАМИ вокруг ямы
        // Ящик 1 (слева от ямы)
        const toolBox1 = MeshBuilder.CreateBox(`garagePitToolBox1_${index}`, {
            width: 0.8,
            height: 0.5,
            depth: 0.6
        }, this.scene);
        toolBox1.position = new Vector3(garageX - pitWidth / 2 - 1.5, 0.25, garageZ - 3);
        toolBox1.material = ammoBoxMat;
        toolBox1.isPickable = false;
        
        // Ящик 2 (справа от ямы)
        const toolBox2 = MeshBuilder.CreateBox(`garagePitToolBox2_${index}`, {
            width: 0.8,
            height: 0.5,
            depth: 0.6
        }, this.scene);
        toolBox2.position = new Vector3(garageX + pitWidth / 2 + 1.5, 0.25, garageZ + 3);
        toolBox2.material = ammoBoxMat;
        toolBox2.isPickable = false;
        
        // Ящик 3 (перед ямой)
        const toolBox3 = MeshBuilder.CreateBox(`garagePitToolBox3_${index}`, {
            width: 0.6,
            height: 0.4,
            depth: 0.8
        }, this.scene);
        toolBox3.position = new Vector3(garageX - 2, 0.2, garageZ - pitDepth / 2 - 1.0);
        toolBox3.material = ammoBoxMat;
        toolBox3.isPickable = false;
        
        // ПОЛКИ на стенах ямы (для инструментов)
        // Полка на левой стене ямы
        const shelf1 = MeshBuilder.CreateBox(`garagePitShelf1_${index}`, {
            width: 0.05,
            height: 0.1,
            depth: 2.0
        }, this.scene);
        shelf1.position = new Vector3(garageX - pitWidth / 2 - 0.1, -1.0, garageZ);
        shelf1.material = workbenchMat;
        shelf1.isPickable = false;
        
        // Полка на правой стене ямы
        const shelf2 = MeshBuilder.CreateBox(`garagePitShelf2_${index}`, {
            width: 0.05,
            height: 0.1,
            depth: 2.0
        }, this.scene);
        shelf2.position = new Vector3(garageX + pitWidth / 2 + 0.1, -1.0, garageZ);
        shelf2.material = workbenchMat;
        shelf2.isPickable = false;
        
        // Инструменты на полках
        // Гаечный ключ на полке 1
        const shelfWrench = MeshBuilder.CreateBox(`garagePitShelfWrench_${index}`, {
            width: 0.3,
            height: 0.05,
            depth: 0.05
        }, this.scene);
        shelfWrench.position = new Vector3(garageX - pitWidth / 2 - 0.1, -0.95, garageZ - 0.5);
        shelfWrench.rotation.y = Math.PI / 2;
        shelfWrench.material = toolMat;
        shelfWrench.isPickable = false;
        
        // Отвёртка на полке 2
        const shelfScrewdriver = MeshBuilder.CreateBox(`garagePitShelfScrewdriver_${index}`, {
            width: 0.2,
            height: 0.04,
            depth: 0.04
        }, this.scene);
        shelfScrewdriver.position = new Vector3(garageX + pitWidth / 2 + 0.1, -0.95, garageZ + 0.5);
        shelfScrewdriver.rotation.y = Math.PI / 2;
        shelfScrewdriver.material = toolMat;
        shelfScrewdriver.isPickable = false;
        
        // СМАЗОЧНЫЕ МАТЕРИАЛЫ (канистры)
        let oilMat = this.materials.get("oil");
        if (!oilMat) {
            oilMat = new StandardMaterial("oilMat", this.scene);
            oilMat.diffuseColor = new Color3(0.1, 0.1, 0.15); // Темно-синий/черный
            this.materials.set("oil", oilMat);
        }
        
        // Канистра с маслом 1
        const oilCan1 = MeshBuilder.CreateBox(`garagePitOilCan1_${index}`, {
            width: 0.25,
            height: 0.35,
            depth: 0.2
        }, this.scene);
        oilCan1.position = new Vector3(garageX - pitWidth / 2 - 0.8, -1.5, garageZ - 1.5);
        oilCan1.material = oilMat;
        oilCan1.isPickable = false;
        
        // Канистра с маслом 2
        const oilCan2 = MeshBuilder.CreateBox(`garagePitOilCan2_${index}`, {
            width: 0.25,
            height: 0.35,
            depth: 0.2
        }, this.scene);
        oilCan2.position = new Vector3(garageX + pitWidth / 2 + 0.8, -1.5, garageZ + 1.5);
        oilCan2.material = oilMat;
        oilCan2.isPickable = false;
        
        // СЛИВ для масла (в углу ямы)
        const drain = MeshBuilder.CreateCylinder(`garagePitDrain_${index}`, {
            height: 0.1,
            diameter: 0.15
        }, this.scene);
        drain.position = new Vector3(garageX - pitWidth / 2 + 0.5, -pitHeight + 0.05, garageZ - pitDepth / 2 + 0.5);
        drain.material = toolMat;
        drain.isPickable = false;
        
        // ДОПОЛНИТЕЛЬНОЕ ОБОРУДОВАНИЕ
        // Компрессор (воздушный)
        const compressor = MeshBuilder.CreateBox(`garagePitCompressor_${index}`, {
            width: 0.6,
            height: 0.5,
            depth: 0.5
        }, this.scene);
        compressor.position = new Vector3(garageX - pitWidth / 2 - 2.0, 0.25, garageZ + pitDepth / 2 + 1.0);
        compressor.material = toolMat;
        compressor.isPickable = false;
        
        // Шланг от компрессора
        const compressorHose = MeshBuilder.CreateCylinder(`garagePitCompressorHose_${index}`, {
            height: 2.0,
            diameter: 0.05
        }, this.scene);
        compressorHose.position = new Vector3(garageX - pitWidth / 2 - 1.5, 0.5, garageZ + pitDepth / 2 + 0.5);
        compressorHose.rotation.z = Math.PI / 4;
        compressorHose.material = hoseMat;
        compressorHose.isPickable = false;
        
        // СТОЙКИ для поддержки (в яме)
        const supportStand1 = MeshBuilder.CreateBox(`garagePitSupport1_${index}`, {
            width: 0.3,
            height: 1.2,
            depth: 0.3
        }, this.scene);
        supportStand1.position = new Vector3(garageX - 1.5, -pitHeight + 0.6, garageZ);
        supportStand1.material = toolMat;
        supportStand1.isPickable = false;
        
        const supportStand2 = MeshBuilder.CreateBox(`garagePitSupport2_${index}`, {
            width: 0.3,
            height: 1.2,
            depth: 0.3
        }, this.scene);
        supportStand2.position = new Vector3(garageX + 1.5, -pitHeight + 0.6, garageZ);
        supportStand2.material = toolMat;
        supportStand2.isPickable = false;
        
        // ПОДСТАВКА для инструментов (в яме)
        const toolStand = MeshBuilder.CreateBox(`garagePitToolStand_${index}`, {
            width: 0.4,
            height: 0.6,
            depth: 0.4
        }, this.scene);
        toolStand.position = new Vector3(garageX, -pitHeight + 0.3, garageZ + pitDepth / 2 - 1.0);
        toolStand.material = workbenchMat;
        toolStand.isPickable = false;
        
        // Инструменты на подставке
        const standWrench = MeshBuilder.CreateBox(`garagePitStandWrench_${index}`, {
            width: 0.25,
            height: 0.05,
            depth: 0.05
        }, this.scene);
        standWrench.position = new Vector3(garageX, -pitHeight + 0.65, garageZ + pitDepth / 2 - 1.0);
        standWrench.rotation.y = Math.PI / 4;
        standWrench.material = toolMat;
        standWrench.isPickable = false;
        
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
            cornerBox.material = ammoBoxMat;
            cornerBox.isPickable = false;
        }
        
        // Инициализируем владение гаража (нейтральный)
        const garageKey = `${garageX.toFixed(1)}_${garageZ.toFixed(1)}`;
        this.garageOwnership.set(garageKey, { ownerId: null });
        
        // Логирование создания верстака
        console.log(`[ChunkSystem] Created workbench for garage ${index} at (${workbenchX.toFixed(1)}, ${workbenchZ.toFixed(1)})`);
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
        this.chunks.set(key, chunk);
    }
    
    private getBiome(worldX: number, worldZ: number, random: SeededRandom): BiomeType {
        const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
        
        // УЛУЧШЕННАЯ процедурная генерация - более реалистичное распределение биомов
        // Центр - всегда город
        if (dist < 100) {
            // В центре - плотный город с редкими парками
            const noiseVal = random.next();
            if (noiseVal < 0.85) return "city";
            if (noiseVal < 0.95) return "industrial";
            return "park";
        }
        
        // Средняя зона - смешанная застройка
        if (dist < 200) {
        const noiseVal = random.next();
            // Более реалистичное распределение
            if (noiseVal < 0.35) return "city";        // Город продолжается
            if (noiseVal < 0.55) return "residential"; // Жилые районы
            if (noiseVal < 0.75) return "industrial";  // Промзона
            if (noiseVal < 0.90) return "park";        // Парки
            return "military";                          // Редкие военные объекты
        }
        
        // Дальняя зона - пригород и природа
        if (dist < 350) {
            const noiseVal = random.next();
            if (noiseVal < 0.25) return "residential"; // Пригород
            if (noiseVal < 0.45) return "park";         // Больше парков
            if (noiseVal < 0.65) return "industrial";  // Промзона на окраине
            if (noiseVal < 0.80) return "wasteland";    // Заброшенные территории
            return "military";                          // Военные объекты
        }
        
        // Очень дальняя зона - природа и военные объекты
        const noiseVal = random.next();
        if (noiseVal < 0.30) return "wasteland";   // Пустоши
        if (noiseVal < 0.55) return "park";        // Природные парки
        if (noiseVal < 0.75) return "military";    // Военные базы
        if (noiseVal < 0.90) return "residential"; // Редкие поселения
        return "industrial";                         // Редкая промышленность
    }
    
    private generateChunkContent(chunk: ChunkData, worldX: number, worldZ: number): void {
        const size = this.config.chunkSize;
        const seed = this.config.worldSeed + chunk.x * 10000 + chunk.z;
        const random = new SeededRandom(seed);
        
        // В режиме песочницы генерируем только землю
        if (this.config.mapType === "sandbox") {
            // Простая плоская земля для песочницы
            this.createGround(chunk, size, "wasteland", random);
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
        
        const biome = this.getBiome(worldX + size/2, worldZ + size/2, random);
        
        // Ground based on biome
        this.createGround(chunk, size, biome, random);
        
        // КРИТИЧЕСКИ ВАЖНО: Гаражи генерируем ПЕРВЫМИ, чтобы исключить их области из генерации других объектов
        this.generateGarages(chunk, worldX, worldZ, size, random);
        
        // Roads - use RoadNetwork for better procedural roads
        this.createRoads(chunk, size, random, biome);
        
        // Terrain hills and valleys based on noise
        this.createTerrainFromNoise(chunk, worldX, worldZ, size, biome, random);
        
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
        
        // Generate cover objects (containers, cars, barriers, etc.)
        this.generateCoverObjects(chunk, worldX, worldZ, size, biome);
        
        // Generate POIs (capture points, ammo depots, etc.)
        this.generatePOIs(chunk, worldX, worldZ, size, biome);

        // Scatter generic props for uniqueness (уменьшено количество)
        // this.addScatteredProps(chunk, size, random); // Временно отключено для оптимизации
        
        // Генерируем припасы
        this.generateConsumables(chunk, worldX, worldZ, size, random);
    }
    
    private createGround(chunk: ChunkData, size: number, biome: BiomeType, _random: SeededRandom): void {
        // Ground with biome-specific color
        let groundMat: string;
        switch (biome) {
            case "city": groundMat = "asphalt"; break;
            case "industrial": groundMat = "gravel"; break;
            case "residential": groundMat = "grassDark"; break;
            case "park": groundMat = "grass"; break;
            case "wasteland": groundMat = "dirt"; break;
            case "military": groundMat = "sand"; break;
            default: groundMat = "dirt";
        }
        
        // Ground at Y=0.005 (very slightly above physics ground)
        const ground = MeshBuilder.CreateBox("g", { width: size - 0.5, height: 0.01, depth: size - 0.5 }, this.scene);
        ground.position = new Vector3(size/2, 0.005, size/2);
        ground.material = this.getMat(groundMat);
        ground.parent = chunk.node;
        ground.freezeWorldMatrix();
        chunk.meshes.push(ground);
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
    
    private generateCity(chunk: ChunkData, size: number, random: SeededRandom): void {
        // UNIQUE buildings - each chunk different! ЕЩЁ БОЛЬШЕ РАЗНООБРАЗИЯ!
        const buildingTypes = [
            { w: 12, h: 25, d: 12, mat: "concrete" },   // Office
            { w: 15, h: 35, d: 15, mat: "glass" },      // Skyscraper
            { w: 20, h: 20, d: 20, mat: "plaster" },    // Mall
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
        
        // Main building
        const type = random.pick(buildingTypes);
        const bx = size / 2 + random.range(-15, 15);
        const bz = size / 2 + random.range(-15, 15);
        
        // Проверяем, не находится ли здание внутри гаража
        const worldX = chunk.x * this.config.chunkSize + bx;
        const worldZ = chunk.z * this.config.chunkSize + bz;
        if (this.isPositionInGarageArea(worldX, worldZ, Math.max(type.w, type.d) / 2)) {
            return; // Пропускаем генерацию этого чанка, если здание попадает в гараж
        }
        
        const building = MeshBuilder.CreateBox("b", { width: type.w, height: type.h, depth: type.d }, this.scene);
        building.position = new Vector3(bx, type.h / 2, bz);
        building.material = this.getMat(type.mat);
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
        // UNIQUE residential area!
        const houseTypes = [
            { w: 7, h: 4, d: 7, mat: "plaster" },
            { w: 8, h: 5, d: 6, mat: "brick" },
            { w: 6, h: 3, d: 8, mat: "plasterYellow" },
            { w: 9, h: 6, d: 9, mat: "wood" },
            { w: 10, h: 4, d: 8, mat: "plaster" },      // Bungalow
            { w: 6, h: 8, d: 6, mat: "brick" },         // Tall house
        ];
        
        // 1-2 houses
        const houseCount = random.int(1, 2);
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
        
        // TREES
        const treeCount = random.int(1, 3);
        for (let i = 0; i < treeCount; i++) {
            const tx = random.range(5, size - 5);
            const tz = random.range(5, size - 5);
            
            // Проверяем, не находится ли дерево внутри гаража
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 1)) {
                continue; // Пропускаем это дерево
            }
            
            const th = random.range(4, 7);
            const tree = MeshBuilder.CreateBox("t", { width: 2, height: th, depth: 2 }, this.scene);
            tree.position = new Vector3(tx, th / 2 + 0.01, tz);
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
        // 2-4 trees with variety
        const treeCount = random.int(2, 4);
        for (let i = 0; i < treeCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            
            // Проверяем, не находится ли дерево внутри гаража
            const tWorldX = chunk.x * this.config.chunkSize + tx;
            const tWorldZ = chunk.z * this.config.chunkSize + tz;
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 2)) {
                continue; // Пропускаем это дерево
            }
            
            const h = random.range(4, 7);
            const w = random.range(2, 4);
            
            const tree = MeshBuilder.CreateBox("t", { width: w, height: h, depth: w }, this.scene);
            tree.position = new Vector3(tx, h / 2, tz);
            tree.material = this.getMat("leaves");
            tree.parent = chunk.node;
            tree.freezeWorldMatrix();
            chunk.meshes.push(tree);
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
    
    // === POLYGON (Training Ground) GENERATION ===
    
    // Размер арены полигона
    private readonly POLYGON_ARENA_SIZE = 200;
    private readonly POLYGON_WALL_HEIGHT = 6;
    private polygonInitialized = false;
    
    private generatePolygonContent(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        // Земля военного типа (песок/грязь)
        this.createGround(chunk, size, "military", random);
        
        // Определяем границы арены
        const arenaHalf = this.POLYGON_ARENA_SIZE / 2;
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
    
    private getPolygonZone(x: number, z: number): "shooting" | "obstacles" | "combat" | "base" | "empty" {
        const arenaHalf = this.POLYGON_ARENA_SIZE / 2;
        
        // За пределами арены
        if (Math.abs(x) > arenaHalf || Math.abs(z) > arenaHalf) {
            return "empty";
        }
        
        // Квадранты арены:
        // Северо-восток (x > 0, z > 0) - стрельбище
        // Северо-запад (x < 0, z > 0) - полоса препятствий
        // Юго-восток (x > 0, z < 0) - зона боя
        // Юго-запад (x < 0, z < 0) - военная база (рядом с гаражом)
        
        if (x > 20 && z > 20) return "shooting";
        if (x < -20 && z > 20) return "obstacles";
        if (x > 20 && z < -20) return "combat";
        if (x < -20 && z < -20) return "base";
        
        return "empty"; // Центральная область - пустое пространство
    }
    
    private generatePolygonPerimeter(chunk: ChunkData, worldX: number, worldZ: number, size: number, _random: SeededRandom): void {
        const arenaHalf = this.POLYGON_ARENA_SIZE / 2;
        const wallHeight = this.POLYGON_WALL_HEIGHT;
        const wallThickness = 2;
        
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
                const wall = MeshBuilder.CreateBox("pwall_n", { width: wallLength, height: wallHeight, depth: wallThickness }, this.scene);
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
            
            // Круглые кольца на мишени
            for (let ring = 1; ring <= 3; ring++) {
                const ringSize = ring * 0.4;
                const ringMesh = MeshBuilder.CreateTorus("ring", { diameter: ringSize, thickness: 0.05 }, this.scene);
                ringMesh.position = new Vector3(x, 2 + targetHeight / 2, z + 0.35);
                ringMesh.rotation.x = Math.PI / 2;
                const ringMat = new StandardMaterial("ringMat", this.scene);
                ringMat.diffuseColor = ring % 2 === 0 ? new Color3(1, 1, 1) : new Color3(0, 0, 0);
                ringMesh.material = ringMat;
                ringMesh.parent = chunk.node;
                ringMesh.freezeWorldMatrix();
                chunk.meshes.push(ringMesh);
            }
        }
        
        // Добавляем рельсы для движущихся мишеней (декоративные)
        if (random.chance(0.5)) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const rail = MeshBuilder.CreateBox("rail", { width: size - 20, height: 0.1, depth: 0.5 }, this.scene);
            rail.position = new Vector3(size / 2, 0.05, railZ);
            rail.material = this.getMat("metalRust");
            rail.parent = chunk.node;
            rail.freezeWorldMatrix();
            chunk.meshes.push(rail);
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
            
            // Физика для ежа (упрощённая - сфера)
            const hedgehogPhysics = MeshBuilder.CreateSphere("hedgehog_phys", { diameter: 2 }, this.scene);
            hedgehogPhysics.position = new Vector3(x, 1, z);
            hedgehogPhysics.isVisible = false;
            hedgehogPhysics.parent = chunk.node;
            new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.SPHERE, { mass: 0 }, this.scene);
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
        // Военная база - бункеры, башни, казармы
        
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
        this.createGround(chunk, size, "wasteland", random);
        
        // Определяем границы карты
        const arenaHalf = this.FRONTLINE_ARENA_SIZE / 2;
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;
        
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
                // Нейтральная полоса - опасная зона
                this.generateFrontlineCraters(chunk, size, random);
                this.generateFrontlineRuins(chunk, size, random);
                this.generateFrontlineWire(chunk, size, random);
                this.generateFrontlineWrecks(chunk, size, random);
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
        
        // Западная сторона (x < -100) - союзники
        if (x < -100) return "allied";
        // Восточная сторона (x > 100) - враги
        if (x > 100) return "enemy";
        // Нейтральная полоса (-100 <= x <= 100)
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
    
    private generateFrontlineTrenches(chunk: ChunkData, size: number, random: SeededRandom, side: "allied" | "enemy"): void {
        // Окопы - длинные траншеи с земляными валами
        const trenchCount = random.int(1, 2);
        
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
        // Воронки от взрывов в нейтральной полосе
        const craterCount = random.int(3, 7);
        
        for (let i = 0; i < craterCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunk.x * this.config.chunkSize + x;
            const worldZ = chunk.z * this.config.chunkSize + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) continue;
            
            const craterRadius = random.range(3, 8);
            const craterDepth = random.range(0.5, 1.5);
            
            // Воронка представлена как кольцо вокруг центра
            const rimHeight = craterDepth * 0.5;
            const rim = MeshBuilder.CreateTorus("crater_rim", { 
                diameter: craterRadius * 2, 
                thickness: craterRadius * 0.3,
                tessellation: 16
            }, this.scene);
            rim.position = new Vector3(x, rimHeight / 2, z);
            rim.rotation.x = Math.PI / 2;
            rim.material = this.getMat("dirt");
            rim.parent = chunk.node;
            rim.freezeWorldMatrix();
            chunk.meshes.push(rim);
            
            // Физика для обода воронки
            const rimPhysics = MeshBuilder.CreateCylinder("crater_phys", { diameter: craterRadius * 2.2, height: rimHeight }, this.scene);
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
                
                // Физика
                const hedgehogPhysics = MeshBuilder.CreateSphere("hh_phys", { diameter: 2.5 }, this.scene);
                hedgehogPhysics.position = new Vector3(x, 1.2, z);
                hedgehogPhysics.isVisible = false;
                hedgehogPhysics.parent = chunk.node;
                new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.SPHERE, { mass: 0 }, this.scene);
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
    
    private generateFrontlineBunkers(chunk: ChunkData, size: number, random: SeededRandom, side: "allied" | "enemy"): void {
        // Бункеры на позициях
        if (!random.chance(0.35)) return;
        
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
        // Подбитая техника (декорации)
        if (!random.chance(0.25)) return; // Не в каждом чанке
        
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
            const smoke = MeshBuilder.CreateCylinder("smoke", { diameter: 1.5, height: 4 }, this.scene);
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
    
    // === BUILDING CREATORS ===
    
    
    
    
    
    // removed unused helpers (tree/bench/streetlight/house/apartment)
    
    // Generic scattered props with varied forms/sizes (avoid z-fighting via Y offsets)
    private addScatteredProps(chunk: ChunkData, size: number, random: SeededRandom): void {
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

    // Create terrain features based on noise heightmap
    private createTerrainFromNoise(chunk: ChunkData, worldX: number, worldZ: number, size: number, biome: BiomeType, random: SeededRandom): void {
        if (!this.terrainGenerator) return;
        
        // Skip flat biomes (cities have minimal terrain)
        if (biome === "city" || biome === "industrial") {
            // Only add occasional small bumps
            if (random.chance(0.3)) {
                const bumpX = random.range(10, size - 10);
                const bumpZ = random.range(10, size - 10);
                const bump = MeshBuilder.CreateBox("bump", { width: 4, height: 0.3, depth: 4 }, this.scene);
                bump.position = new Vector3(bumpX, 0.15, bumpZ);
                bump.material = this.getMat("concrete");
                bump.parent = chunk.node;
                bump.freezeWorldMatrix();
                chunk.meshes.push(bump);
            }
            return;
        }
        
        // Sample terrain at several points and create hills
        const gridSize = 3; // 3x3 grid of potential terrain features
        const cellSize = size / gridSize;
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gz = 0; gz < gridSize; gz++) {
                const localX = (gx + 0.5) * cellSize;
                const localZ = (gz + 0.5) * cellSize;
                const sampleX = worldX + localX;
                const sampleZ = worldZ + localZ;
                
                // Get height from terrain generator
                const height = this.terrainGenerator.getHeight(sampleX, sampleZ, biome);
                
                // Only create terrain mesh if height is significant
                if (Math.abs(height) > 0.5) {
                    if (height > 0) {
                        // Create a hill
                        const hillWidth = cellSize * 0.6 + random.range(-2, 2);
                        const hillDepth = cellSize * 0.6 + random.range(-2, 2);
                        const hillHeight = Math.min(height, 8); // Cap height
                        
                        const hill = MeshBuilder.CreateBox(`terrainHill_${gx}_${gz}`, {
                            width: hillWidth,
                            height: hillHeight,
                            depth: hillDepth
                        }, this.scene);
                        
                        hill.position = new Vector3(localX, hillHeight / 2, localZ);
                        
                        // Material based on biome
                        let matName = "dirt";
                        if (biome === "park" || biome === "residential") matName = "grass";
                        else if (biome === "military") matName = "sand";
                        else if (biome === "wasteland") matName = "gravel";
                        
                        hill.material = this.getMat(matName);
                        hill.parent = chunk.node;
                        hill.freezeWorldMatrix();
                        chunk.meshes.push(hill);
                        
                        // Add physics for significant hills
                        if (hillHeight > 1.5) {
                            new PhysicsAggregate(hill, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                        }
                    } else {
                        // Create a depression/crater
                        const craterWidth = cellSize * 0.5 + random.range(-1, 1);
                        const craterDepth = cellSize * 0.5 + random.range(-1, 1);
                        
                        // Visual crater floor
                        const crater = MeshBuilder.CreateBox(`terrainCrater_${gx}_${gz}`, {
                            width: craterWidth,
                            height: 0.1,
                            depth: craterDepth
                        }, this.scene);
                        
                        crater.position = new Vector3(localX, -0.05, localZ);
                        crater.material = this.getMat("dirt");
                        crater.parent = chunk.node;
                        crater.freezeWorldMatrix();
                        chunk.meshes.push(crater);
                        
                        // Crater rim
                        const rimHeight = Math.min(Math.abs(height) * 0.3, 1.5);
                        if (rimHeight > 0.3) {
                            const rim1 = MeshBuilder.CreateBox(`rim1_${gx}_${gz}`, {
                                width: craterWidth + 2,
                                height: rimHeight,
                                depth: 0.8
                            }, this.scene);
                            rim1.position = new Vector3(localX, rimHeight / 2, localZ + craterDepth / 2 + 0.5);
                            rim1.material = this.getMat("dirt");
                            rim1.parent = chunk.node;
                            rim1.freezeWorldMatrix();
                            chunk.meshes.push(rim1);
                            
                            const rim2 = rim1.clone(`rim2_${gx}_${gz}`);
                            rim2.position = new Vector3(localX, rimHeight / 2, localZ - craterDepth / 2 - 0.5);
                            rim2.parent = chunk.node;
                            chunk.meshes.push(rim2);
                        }
                    }
                }
            }
        }
    }
    
    // Extra terrain features for uniqueness (lightweight) - УЛУЧШЕННАЯ ГЕНЕРАЦИЯ!
    private addTerrainFeatures(chunk: ChunkData, size: number, random: SeededRandom, biome: BiomeType): void {
        const features = random.int(2, 5); // Уменьшено с 3-7 до 2-5 для оптимизации
        for (let i = 0; i < features; i++) {
            const kind = random.int(0, 15); // МНОГО больше типов фич!
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            if (kind === 0) {
                // Small hill - РАЗНООБРАЗНЫЕ размеры
                const h = random.range(1, 3);
                const w = random.range(6, 15);
                const d = random.range(6, 15);
                const hill = MeshBuilder.CreateBox("hill", { width: w, height: h, depth: d }, this.scene);
                hill.position = new Vector3(x, h / 2 + 0.01, z);
                hill.material = this.getMat(biome === "residential" || biome === "park" ? "grass" : "dirt");
                hill.parent = chunk.node;
                hill.freezeWorldMatrix();
                chunk.meshes.push(hill);
                // Убрана физика для декоративных холмов (оптимизация)
            } else if (kind === 1) {
                // БОЛЬШАЯ ГОРА - высокий холм
                const h = random.range(4, 8);
                const w = random.range(12, 25);
                const d = random.range(12, 25);
                const mountain = MeshBuilder.CreateBox("mountain", { width: w, height: h, depth: d }, this.scene);
                mountain.position = new Vector3(x, h / 2 + 0.01, z);
                mountain.material = this.getMat("dirt");
                mountain.parent = chunk.node;
                mountain.freezeWorldMatrix();
                chunk.meshes.push(mountain);
                // Убрана физика для декоративных гор (оптимизация)
            } else if (kind === 2) {
                // Crater (depression + rim)
                const crater = MeshBuilder.CreateBox("crater", { width: 10, height: 0.01, depth: 10 }, this.scene);
                crater.position = new Vector3(x, -0.02, z);
                crater.material = this.getMat("dirt");
                crater.parent = chunk.node;
                crater.freezeWorldMatrix();
                chunk.meshes.push(crater);
                const rimH = 0.8;
                const rim = MeshBuilder.CreateBox("rim", { width: 12, height: rimH, depth: 1 }, this.scene);
                rim.position = new Vector3(x, rimH / 2 + 0.01, z + 6);
                rim.material = this.getMat("dirt");
                rim.parent = chunk.node;
                rim.freezeWorldMatrix();
                chunk.meshes.push(rim);
                const rim2 = rim.clone("rim2");
                rim2.position = new Vector3(x, rimH / 2 + 0.01, z - 6);
                const rim3 = MeshBuilder.CreateBox("rim3", { width: 1, height: rimH, depth: 12 }, this.scene);
                rim3.position = new Vector3(x + 6, rimH / 2 + 0.01, z);
                rim3.material = this.getMat("dirt");
                rim3.parent = chunk.node;
                rim3.freezeWorldMatrix();
                chunk.meshes.push(rim3);
                const rim4 = rim3.clone("rim4");
                rim4.position = new Vector3(x - 6, rimH / 2 + 0.01, z);
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
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else if (lakeType === 1) {
                    // Маленькое озеро
                    const w = random.range(6, 12);
                    const d = random.range(6, 12);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else {
                    // Длинное озеро (как река но шире)
                    const w = random.range(8, 14);
                    const d = random.range(20, 35);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
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
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else if (lakeSize === 1) {
                    // Среднее озеро
                    const w = random.range(10, 18);
                    const d = random.range(10, 18);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else if (lakeSize === 2) {
                    // Большое озеро
                    const w = random.range(20, 30);
                    const d = random.range(18, 28);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
                    lake.material = this.getMat("glass");
                    lake.parent = chunk.node;
                    lake.freezeWorldMatrix();
                    chunk.meshes.push(lake);
                } else {
                    // Овальное озеро
                    const w = random.range(15, 25);
                    const d = random.range(8, 15);
                    const lake = MeshBuilder.CreateBox("lake", { width: w, height: 0.01, depth: d }, this.scene);
                    lake.position = new Vector3(x, -0.02, z);
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
                    const hill = MeshBuilder.CreateBox("hill", { width: w, height: h, depth: d }, this.scene);
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
        
        // Гаражи появляются на расстоянии 15-400 от центра, с вероятностью 35%
        // Минимальное расстояние уменьшено для гарантированного гаража рядом со стартом
        if (distanceFromCenter < 15 || distanceFromCenter > 400) return;
        if (!random.chance(0.35)) return;
        
        // Создаём гараж - ПУСТОЕ здание с проёмом (без ворот)
        // Размеры достаточные для танка (танк ~4x6 единиц)
        const garageWidth = random.range(14, 18);
        const garageHeight = random.range(7, 9);
        const garageDepth = random.range(18, 22);
        const wallThickness = 0.4;
        
        // Позиция гаража в чанке
        const gx = random.range(10, size - 10);
        const gz = random.range(10, size - 10);
        const worldGarageX = worldX + gx;
        const worldGarageZ = worldZ + gz;
        
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
        
        // Сохраняем область гаража для исключения из генерации других объектов
        const garageArea = {
            x: worldGarageX - garageWidth / 2 - 2, // Добавляем запас 2 единицы
            z: worldGarageZ - garageDepth / 2 - 2,
            width: garageWidth + 4,
            depth: garageDepth + 4
        };
        this.garageAreas.push(garageArea);
        
        // Сохраняем позицию гаража для спавна (внутри гаража, по центру, ближе к задней стене)
        // Y = 1.5 чтобы танк спавнился на полу гаража
        const spawnPos = new Vector3(worldGarageX, 1.5, worldGarageZ + garageDepth * 0.2);
        this.garagePositions.push(spawnPos);
        
        console.log(`[ChunkSystem] Garage created at ${worldGarageX.toFixed(1)}, ${worldGarageZ.toFixed(1)} (spawn: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
    }
    
    // Проверить, не попадает ли позиция в область гаража
    isPositionInGarageArea(x: number, z: number, margin: number = 0): boolean {
        for (const area of this.garageAreas) {
            if (x >= area.x - margin && x <= area.x + area.width + margin &&
                z >= area.z - margin && z <= area.z + area.depth + margin) {
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
    
    // Генерация припасов на карте
    private generateConsumables(chunk: ChunkData, worldX: number, worldZ: number, size: number, random: SeededRandom): void {
        // Генерируем 1-3 припаса на чанк
        const count = random.int(1, 3);
        
        for (let i = 0; i < count; i++) {
            let attempts = 0;
            let x: number, z: number;
            
            // Ищем свободное место (не в гараже, не в зданиях)
            do {
                x = worldX + random.range(5, size - 5);
                z = worldZ + random.range(5, size - 5);
                attempts++;
            } while (this.isPositionInGarageArea(x, z, 3) && attempts < 10);
            
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
        console.log("[ChunkSystem] Disposing all chunks and resources...");
        
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
        
        console.log("[ChunkSystem] Disposed successfully");
    }
}
