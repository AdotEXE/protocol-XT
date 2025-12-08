import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsAggregate,
    PhysicsShapeType,
    Mesh,
    TransformNode
} from "@babylonjs/core";

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
}

// Biome types for variety
type BiomeType = "city" | "industrial" | "residential" | "park" | "wasteland" | "military";

export class ChunkSystem {
    private scene: Scene;
    private config: ChunkConfig;
    private chunks: Map<string, ChunkData> = new Map();
    private materials: Map<string, StandardMaterial> = new Map();
    private lastPlayerChunk = { x: 0, z: 0 };
    
    public stats = {
        loadedChunks: 0,
        totalMeshes: 0,
        lastUpdateTime: 0
    };
    
    constructor(scene: Scene, config?: Partial<ChunkConfig>) {
        this.scene = scene;
        this.config = {
            chunkSize: 50,
            renderDistance: 3,
            unloadDistance: 5,
            worldSeed: Date.now(),
            ...config
        };
        this.createMaterials();
        console.log("[ChunkSystem] Initialized");
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
    
    update(playerPos: Vector3): void {
        const startTime = performance.now();
        const { cx, cz } = this.worldToChunk(playerPos.x, playerPos.z);
        
        if (cx !== this.lastPlayerChunk.x || cz !== this.lastPlayerChunk.z) {
            this.lastPlayerChunk = { x: cx, z: cz };
            this.updateChunks(cx, cz);
        }
        
        this.stats.lastUpdateTime = performance.now() - startTime;
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
        
        const biome = this.getBiome(worldX + size/2, worldZ + size/2, random);
        
        // Ground based on biome
        this.createGround(chunk, size, biome, random);
        
        // Roads
        this.createRoads(chunk, size, random);
        
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

        // Scatter generic props for uniqueness
        this.addScatteredProps(chunk, size, random);
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
    
    private createRoads(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Road variety - different patterns
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
            new PhysicsAggregate(car, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // FENCE / WALL
        if (random.chance(0.5)) {
            const fenceLen = random.range(8, 20);
            const fx = bx + random.range(-30, 30);
            const fz = bz + random.range(-30, 30);
            const fence = MeshBuilder.CreateBox("f", { width: fenceLen, height: 2, depth: 0.3 }, this.scene);
            fence.position = new Vector3(fx, 1.01, fz); // Y offset to avoid z-fighting
            fence.rotation.y = random.pick([0, Math.PI / 2]);
            fence.material = this.getMat(random.pick(["wood", "metal", "concrete"]));
            fence.parent = chunk.node;
            fence.freezeWorldMatrix();
            chunk.meshes.push(fence);
            new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // CONCRETE BARRIERS (multiple)
        const barrierCount = random.int(0, 3);
        for (let i = 0; i < barrierCount; i++) {
            const barrier = MeshBuilder.CreateBox("br", { width: 3, height: 1, depth: 1.5 }, this.scene);
            barrier.position = new Vector3(
                random.range(5, size - 5),
                0.51, // Y offset!
                random.range(5, size - 5)
            );
            barrier.rotation.y = random.range(0, Math.PI);
            barrier.material = this.getMat("concrete");
            barrier.parent = chunk.node;
            barrier.freezeWorldMatrix();
            chunk.meshes.push(barrier);
            new PhysicsAggregate(barrier, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // DUMPSTER
        if (random.chance(0.3)) {
            const dumpster = MeshBuilder.CreateBox("dump", { width: 2, height: 1.5, depth: 3 }, this.scene);
            dumpster.position = new Vector3(bx + random.range(-20, 20), 0.76, bz + random.range(-20, 20));
            dumpster.material = this.getMat("metalRust");
            dumpster.parent = chunk.node;
            dumpster.freezeWorldMatrix();
            chunk.meshes.push(dumpster);
        }
        
        // ДОПОЛНИТЕЛЬНЫЕ СТЕНЫ И ЗАБОРЫ
        const wallCount = random.int(1, 4);
        for (let i = 0; i < wallCount; i++) {
            const wallLen = random.range(6, 18);
            const wx = random.range(5, size - 5);
            const wz = random.range(5, size - 5);
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
            const container = MeshBuilder.CreateBox("c", { width: 2.5, height: 2.5, depth: 6 }, this.scene);
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
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
            // Cab
            const cab = MeshBuilder.CreateBox("tcab", { width: 2.5, height: 2, depth: 3 }, this.scene);
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
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
        
        // CRANE
        if (random.chance(0.3)) {
            const cx = bx + random.range(-20, 20);
            const cz = bz + random.range(-20, 20);
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
        
        // PIPES / RAILS
        if (random.chance(0.4)) {
            const pipeLen = random.range(10, 25);
            const pipe = MeshBuilder.CreateBox("pp", { width: 0.8, height: 0.8, depth: pipeLen }, this.scene);
            pipe.position = new Vector3(random.range(5, size - 5), 0.41, random.range(5, size - 5));
            pipe.rotation.y = random.range(0, Math.PI);
            pipe.material = this.getMat("metalRust");
            pipe.parent = chunk.node;
            pipe.freezeWorldMatrix();
            chunk.meshes.push(pipe);
        }
        
        // CHAIN LINK FENCE
        if (random.chance(0.4)) {
            const fenceLen = random.range(15, 30);
            const fence = MeshBuilder.CreateBox("clf", { width: fenceLen, height: 3, depth: 0.1 }, this.scene);
            fence.position = new Vector3(random.range(10, size - 10), 1.51, random.range(10, size - 10));
            fence.rotation.y = random.pick([0, Math.PI / 2]);
            fence.material = this.getMat("metal");
            fence.parent = chunk.node;
            fence.freezeWorldMatrix();
            chunk.meshes.push(fence);
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
            
            const house = MeshBuilder.CreateBox("h", { width: type.w, height: type.h, depth: type.d }, this.scene);
            house.position = new Vector3(hx, type.h / 2, hz);
            house.material = this.getMat(type.mat);
            house.parent = chunk.node;
            house.freezeWorldMatrix();
            chunk.meshes.push(house);
            new PhysicsAggregate(house, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // GARAGE attached to house
            if (random.chance(0.4)) {
                const garage = MeshBuilder.CreateBox("gar", { width: 4, height: 3, depth: 5 }, this.scene);
                garage.position = new Vector3(hx + type.w/2 + 2, 1.5, hz);
                garage.material = this.getMat("plaster");
                garage.parent = chunk.node;
                garage.freezeWorldMatrix();
                chunk.meshes.push(garage);
                new PhysicsAggregate(garage, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // PARKED CARS in driveways
        const carCount = random.int(0, 2);
        for (let i = 0; i < carCount; i++) {
            const car = MeshBuilder.CreateBox("car", { width: 2, height: 1.3, depth: 4.5 }, this.scene);
            car.position = new Vector3(random.range(10, size - 10), 0.66, random.range(10, size - 10));
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
            const mailbox = MeshBuilder.CreateBox("mb", { width: 0.3, height: 1.2, depth: 0.3 }, this.scene);
            mailbox.position = new Vector3(random.range(10, size - 10), 0.61, random.range(10, size - 10));
            mailbox.material = this.getMat("metal");
            mailbox.parent = chunk.node;
            mailbox.freezeWorldMatrix();
            chunk.meshes.push(mailbox);
        }
        
        // WOODEN FENCE around property
        if (random.chance(0.5)) {
            const fenceLen = random.range(10, 20);
            const fence = MeshBuilder.CreateBox("wf", { width: fenceLen, height: 1.5, depth: 0.2 }, this.scene);
            fence.position = new Vector3(random.range(10, size - 10), 0.76, random.range(10, size - 10));
            fence.rotation.y = random.pick([0, Math.PI / 2]);
            fence.material = this.getMat("wood");
            fence.parent = chunk.node;
            fence.freezeWorldMatrix();
            chunk.meshes.push(fence);
        }
        
        // PLAYGROUND equipment
        if (random.chance(0.2)) {
            const swing = MeshBuilder.CreateBox("sw", { width: 3, height: 2.5, depth: 0.3 }, this.scene);
            swing.position = new Vector3(random.range(15, size - 15), 1.26, random.range(15, size - 15));
            swing.material = this.getMat("metal");
            swing.parent = chunk.node;
            swing.freezeWorldMatrix();
            chunk.meshes.push(swing);
        }
    }
    
    private generatePark(chunk: ChunkData, size: number, random: SeededRandom): void {
        // 2-4 trees with variety
        const treeCount = random.int(2, 4);
        for (let i = 0; i < treeCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
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
            const bench = MeshBuilder.CreateBox("bench", { width: 2, height: 0.5, depth: 0.5 }, this.scene);
            bench.position = new Vector3(size / 2, 0.25, size / 2);
            bench.material = this.getMat("wood");
            bench.parent = chunk.node;
            bench.freezeWorldMatrix();
            chunk.meshes.push(bench);
        }
    }
    
    private generateWasteland(chunk: ChunkData, size: number, random: SeededRandom): void {
        // Ruins variety
        const ruinCount = random.int(1, 3);
        for (let i = 0; i < ruinCount; i++) {
            const rx = random.range(10, size - 10);
            const rz = random.range(10, size - 10);
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
                const barrier = MeshBuilder.CreateBox("br", { width: 1.5, height: 1, depth: 1 }, this.scene);
                barrier.position = new Vector3(bx + random.range(-15, 15), 0.5, bz + random.range(-15, 15));
                barrier.material = this.getMat("concrete");
                barrier.parent = chunk.node;
                barrier.freezeWorldMatrix();
                chunk.meshes.push(barrier);
            }
        }
    }
    
    // === BUILDING CREATORS ===
    
    
    
    
    
    // removed unused helpers (tree/bench/streetlight/house/apartment)
    
    // Generic scattered props with varied forms/sizes (avoid z-fighting via Y offsets)
    private addScatteredProps(chunk: ChunkData, size: number, random: SeededRandom): void {
        const count = random.int(2, 5); // больше пропсов
        for (let i = 0; i < count; i++) {
            const kind = random.int(0, 4);
            const x = random.range(6, size - 6);
            const z = random.range(6, size - 6);
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

    // Extra terrain features for uniqueness (lightweight) - УЛУЧШЕННАЯ ГЕНЕРАЦИЯ!
    private addTerrainFeatures(chunk: ChunkData, size: number, random: SeededRandom, biome: BiomeType): void {
        const features = random.int(3, 7); // ЕЩЁ БОЛЬШЕ фич за чанк
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
                new PhysicsAggregate(hill, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
                new PhysicsAggregate(mountain, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
                        new PhysicsAggregate(rock, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
                        new PhysicsAggregate(pole, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
                        new PhysicsAggregate(ruin, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
                        new PhysicsAggregate(tree, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
                    new PhysicsAggregate(shed, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                } else if (structType === 1) {
                    // Башня/вышка
                    const towerH = random.range(8, 15);
                    const tower = MeshBuilder.CreateBox("tower", { width: 3, height: towerH, depth: 3 }, this.scene);
                    tower.position = new Vector3(x, towerH / 2, z);
                    tower.material = this.getMat(random.pick(["metal", "concrete", "brick"]));
                    tower.parent = chunk.node;
                    tower.freezeWorldMatrix();
                    chunk.meshes.push(tower);
                    new PhysicsAggregate(tower, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
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
    
    dispose(): void {
        this.chunks.forEach((_, key) => this.destroyChunk(key));
        this.materials.forEach(mat => mat.dispose());
    }
}
