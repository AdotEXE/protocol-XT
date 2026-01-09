/**
 * Standalone Map Editor - Независимый редактор карт
 * Работает без игровой сессии, имеет собственную сцену Babylon.js
 */

import { 
    Engine, 
    Scene, 
    Vector3, 
    ArcRotateCamera,
    HemisphericLight,
    DirectionalLight,
    Color3,
    Color4,
    MeshBuilder,
    StandardMaterial,
    GroundMesh,
    Mesh,
    LinesMesh,
    TransformNode,
    HavokPlugin
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { MapEditor, MapData } from "./mapEditor";
import { logger } from "./utils/logger";

/**
 * Конфигурация редактора
 */
export interface StandaloneMapEditorConfig {
    mapSize?: number;
    mapType?: string;
    mapData?: MapData;
}

/**
 * Независимый редактор карт
 */
export class StandaloneMapEditor {
    private engine!: Engine;
    private scene!: Scene;
    private canvas!: HTMLCanvasElement;
    private camera!: ArcRotateCamera;
    private mapEditor!: MapEditor;
    private isActive: boolean = false;
    private renderLoopId: number | null = null;
    private mainMenu: any | null = null;
    private closeObserver: MutationObserver | null = null;
    
    constructor(mainMenu?: any) {
        this.mainMenu = mainMenu || null;
    }
    
    /**
     * Открыть редактор карт
     */
    async open(config?: StandaloneMapEditorConfig): Promise<void> {
        console.log("[StandaloneMapEditor] ====== open() CALLED ======");
        console.log("[StandaloneMapEditor] isActive:", this.isActive);
        console.log("[StandaloneMapEditor] config:", config);
        
        if (this.isActive) {
            const msg = "[StandaloneMapEditor] Editor is already open";
            logger.warn(msg);
            console.warn(msg);
            return;
        }
        
        try {
            logger.log("[StandaloneMapEditor] Opening standalone map editor...");
            console.log("[StandaloneMapEditor] Opening standalone map editor...");
            
            // Скрываем главное меню если оно есть
            if (this.mainMenu && typeof this.mainMenu.hide === "function") {
                this.mainMenu.hide();
            }
            
            // Создаем canvas для редактора
            console.log("[StandaloneMapEditor] Creating canvas...");
            this.createCanvas();
            console.log("[StandaloneMapEditor] ✅ Canvas created");
            
            // Инициализируем Engine и Scene
            console.log("[StandaloneMapEditor] Initializing scene...");
            await this.initializeScene();
            console.log("[StandaloneMapEditor] ✅ Scene initialized");
            
            // Создаем камеру и освещение
            console.log("[StandaloneMapEditor] Setting up camera and lighting...");
            this.setupCamera();
            this.setupLighting();
            console.log("[StandaloneMapEditor] ✅ Camera and lighting setup");
            
            // Создаем базовый террейн
            // Для предустановленных карт используем их стандартный размер
            let mapSize = config?.mapSize || 500;
            const mapType = config?.mapType || config?.mapData?.mapType;
            
            // Если это предустановленная карта, используем её стандартный размер
            if (config?.mapData?.name?.startsWith("[Предустановленная]") && mapType) {
                const standardSizes: Record<string, number> = {
                    "sand": 150,
                    "madness": 150,
                    "expo": 200,
                    "brest": 200,
                    "arena": 200,
                    "polygon": 500,
                    "frontline": 500,
                    "ruins": 500,
                    "canyon": 500,
                    "industrial": 500,
                    "urban_warfare": 500,
                    "underground": 500,
                    "coastal": 500,
                    "normal": 500,
                    "sandbox": 500,
                    "tartaria": 500
                };
                mapSize = standardSizes[mapType] || 500;
                logger.log(`[StandaloneMapEditor] Using standard size ${mapSize} for map type ${mapType}`);
            }
            
            this.createBaseTerrain(mapSize, mapType);
            
            // Создаем MapEditor для функциональности редактирования
            this.mapEditor = new MapEditor(this.scene);
            if (config?.mapData) {
                // Если это предустановленная карта (виртуальная), генерируем её контент
                if (config.mapData.name.startsWith("[Предустановленная]")) {
                    const mapTypeForGen = config.mapData.mapType;
                    logger.log(`[StandaloneMapEditor] Preset map detected: name="${config.mapData.name}", mapType="${mapTypeForGen}"`);
                    if (mapTypeForGen) {
                        // Генерируем контент карты через генераторы
                        // Используем mapSize, который уже установлен с учетом стандартного размера карты
                        logger.log(`[StandaloneMapEditor] Generating content for preset map: ${mapTypeForGen}, size: ${mapSize}`);
                        await this.generateMapContent(mapTypeForGen, mapSize);
                        
                        const cleanName = config.mapData.name.replace("[Предустановленная] ", "");
                        // Импортируем базовую структуру карты с правильным именем и типом в едином формате
                        const baseMapData: MapData = {
                            version: 1, // Версия формата
                            name: cleanName,
                            mapType: mapType || config.mapData.mapType || "normal", // ОБЯЗАТЕЛЬНО: всегда должен быть mapType
                            terrainEdits: [],
                            placedObjects: [],
                            triggers: [],
                            metadata: {
                                createdAt: Date.now(),
                                modifiedAt: Date.now(),
                                description: config.mapData.metadata?.description || `Карта типа ${mapType || config.mapData.mapType || "normal"}`,
                                isPreset: config.mapData.name.startsWith("[Предустановленная]")
                            }
                        };
                        this.mapEditor.importMap(JSON.stringify(baseMapData));
                    }
                } else {
                    // Загружаем данные сохраненной карты
                    this.mapEditor.importMap(JSON.stringify(config.mapData));
                }
            }
            
            // Открываем MapEditor UI
            this.mapEditor.open();
            
            // Добавляем обработчик закрытия MapEditor для закрытия StandaloneMapEditor
            // Используем setTimeout чтобы убедиться, что MapEditor уже создал UI
            setTimeout(() => {
                const setupCloseHandler = () => {
                    const closeBtn = document.getElementById("map-editor-close");
                    if (closeBtn) {
                        // Добавляем обработчик для закрытия StandaloneMapEditor
                        const handler = () => {
                            // Закрываем StandaloneMapEditor при закрытии MapEditor
                            this.close();
                        };
                        closeBtn.addEventListener("click", handler);
                    }
                };
                
                setupCloseHandler();
                
                // Наблюдаем за появлением кнопки закрытия в DOM
                this.closeObserver = new MutationObserver(() => {
                    setupCloseHandler();
                });
                
                this.closeObserver.observe(document.body, { childList: true, subtree: true });
            }, 100);
            
            // Запускаем render loop
            this.startRenderLoop();
            
            this.isActive = true;
            logger.log("[StandaloneMapEditor] Editor opened successfully");
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            logger.error("[StandaloneMapEditor] Failed to open editor:", error);
            console.error("[StandaloneMapEditor] ❌ Failed to open editor:", error);
            console.error("[StandaloneMapEditor] Error message:", errorMsg);
            if (errorStack) {
                console.error("[StandaloneMapEditor] Error stack:", errorStack);
            }
            this.cleanup();
            throw error;
        }
    }
    
    /**
     * Закрыть редактор карт
     */
    close(): void {
        if (!this.isActive) return;
        
        logger.log("[StandaloneMapEditor] Closing editor...");
        
        // Закрываем MapEditor
        if (this.mapEditor) {
            this.mapEditor.close();
        }
        
        // Останавливаем render loop
        this.stopRenderLoop();
        
        // Очищаем сцену
        this.cleanup();
        
        // Показываем главное меню если оно есть
        if (this.mainMenu && typeof this.mainMenu.show === "function") {
            this.mainMenu.show();
        }
        
        this.isActive = false;
        logger.log("[StandaloneMapEditor] Editor closed");
    }
    
    /**
     * Создать canvas для редактора
     */
    private createCanvas(): void {
        // Удаляем старый canvas если есть
        const oldCanvas = document.getElementById("mapEditorCanvas");
        if (oldCanvas) {
            oldCanvas.remove();
        }
        
        // Создаем новый canvas
        this.canvas = document.createElement("canvas");
        this.canvas.id = "mapEditorCanvas";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.position = "fixed";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.zIndex = "10000";
        this.canvas.style.display = "block";
        this.canvas.style.background = "#0a0a0f";
        this.canvas.style.cursor = "default";
        
        document.body.appendChild(this.canvas);
    }
    
    /**
     * Инициализировать сцену
     */
    private async initializeScene(): Promise<void> {
        // Создаем Engine
        this.engine = new Engine(this.canvas, true, {
            antialias: true,
            preserveDrawingBuffer: false,
            stencil: false,
            adaptToDeviceRatio: true,
            powerPreference: "high-performance"
        });
        
        // Обработка изменения размера окна
        window.addEventListener("resize", () => {
            if (this.engine) {
                this.engine.resize();
            }
        });
        
        // Создаем Scene
        this.scene = new Scene(this.engine, {
            useGeometryUniqueIdsMap: true,
            useMaterialMeshMap: true,
            useClonedMeshMap: true
        });
        
        this.scene.clearColor = new Color4(0.1, 0.1, 0.15, 1.0);
        this.scene.skipPointerMovePicking = false; // Нужно для редактирования
        this.scene.autoClear = true;
        this.scene.autoClearDepthAndStencil = true;
        
        // Инициализируем физический движок (нужен для генераторов карт)
        // Сохраняем флаг наличия физики для использования в генераторах
        let physicsAvailable = false;
        try {
            logger.log("[StandaloneMapEditor] Initializing Havok physics...");
            const havokInstance = await HavokPhysics();
            const havokPlugin = new HavokPlugin(true, havokInstance);
            this.scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
            physicsAvailable = true;
            logger.log("[StandaloneMapEditor] ✅ Physics engine initialized successfully");
        } catch (physicsError) {
            logger.warn("[StandaloneMapEditor] ⚠️ Could not initialize physics:", physicsError);
            logger.warn("[StandaloneMapEditor] Map generation will continue without physics (objects will be static)");
            physicsAvailable = false;
        }
        
        // Сохраняем флаг доступности физики в сцене для доступа из генераторов
        (this.scene as any).__physicsAvailable = physicsAvailable;
        
        logger.log("[StandaloneMapEditor] Scene initialized (physics: " + (physicsAvailable ? "enabled" : "disabled") + ")");
    }
    
    /**
     * Проверить, доступна ли физика в сцене
     */
    public static hasPhysics(scene: Scene): boolean {
        return scene.physicsEnabled && !!(scene as any).__physicsAvailable;
    }
    
    /**
     * Настроить камеру
     */
    private setupCamera(): void {
        // ArcRotateCamera для удобного обзора карты
        // Начальная позиция: сбоку и сверху для лучшего обзора
        this.camera = new ArcRotateCamera(
            "editorCamera",
            -Math.PI / 4, // alpha (горизонтальный угол) - 45 градусов
            Math.PI / 3,  // beta (вертикальный угол) - 60 градусов
            150,          // radius (расстояние от центра) - увеличиваем для лучшего обзора
            Vector3.Zero(), // target (центр карты)
            this.scene
        );
        
        // Настройки камеры
        this.camera.lowerRadiusLimit = 20;
        this.camera.upperRadiusLimit = 1000;
        this.camera.lowerBetaLimit = 0.1;
        this.camera.upperBetaLimit = Math.PI / 2.1;
        this.camera.minZ = 0.1;
        this.camera.wheelDeltaPercentage = 0.01;
        
        // Улучшенное управление камерой
        this.camera.panningSensibility = 50;
        this.camera.angularSensibilityX = 2000;
        this.camera.angularSensibilityY = 2000;
        
        // Прикрепляем управление мышью
        this.camera.attachControl(this.canvas, true);
        
        // Устанавливаем как активную камеру
        this.scene.activeCamera = this.camera;
        
        logger.log("[StandaloneMapEditor] Camera setup complete");
    }
    
    /**
     * Настроить освещение
     */
    private setupLighting(): void {
        // Основное освещение
        const mainLight = new HemisphericLight(
            "mainLight",
            new Vector3(0, 1, 0),
            this.scene
        );
        mainLight.intensity = 0.8;
        mainLight.diffuse = new Color3(1, 1, 1);
        mainLight.groundColor = new Color3(0.3, 0.3, 0.4);
        
        // Направленный свет для лучшей видимости
        const directionalLight = new DirectionalLight(
            "directionalLight",
            new Vector3(-1, -1, -1),
            this.scene
        );
        directionalLight.intensity = 0.6;
        directionalLight.diffuse = new Color3(1, 1, 0.95);
        
        // Дополнительный свет для лучшей видимости деталей
        const fillLight = new DirectionalLight(
            "fillLight",
            new Vector3(1, -0.5, 1),
            this.scene
        );
        fillLight.intensity = 0.3;
        fillLight.diffuse = new Color3(0.9, 0.9, 1);
        
        logger.log("[StandaloneMapEditor] Lighting setup complete");
    }
    
    /**
     * Создать базовый террейн
     */
    private createBaseTerrain(size: number, mapType?: string): void {
        // Определяем количество подразделений в зависимости от размера
        const subdivisions = Math.max(25, Math.min(100, Math.floor(size / 10)));
        
        // Создаем ground mesh
        const ground = MeshBuilder.CreateGround(
            "editorGround",
            {
                width: size,
                height: size,
                subdivisions: subdivisions
            },
            this.scene
        );
        
        // Позиционируем в центре
        ground.position = Vector3.Zero();
        
        // Создаем материал в зависимости от типа карты
        const groundMat = new StandardMaterial("editorGroundMat", this.scene);
        
        // Выбираем цвет материала в зависимости от типа карты
        let terrainColor: Color3;
        switch (mapType) {
            case "frontline":
                terrainColor = new Color3(0.4, 0.35, 0.25); // Грязно-коричневый
                break;
            case "ruins":
                terrainColor = new Color3(0.3, 0.3, 0.3); // Серый
                break;
            case "canyon":
                terrainColor = new Color3(0.5, 0.4, 0.3); // Коричневый
                break;
            case "industrial":
                terrainColor = new Color3(0.25, 0.25, 0.25); // Темно-серый
                break;
            case "urban_warfare":
                terrainColor = new Color3(0.35, 0.35, 0.35); // Серый бетон
                break;
            case "underground":
                terrainColor = new Color3(0.2, 0.2, 0.2); // Очень темный
                break;
            case "coastal":
                terrainColor = new Color3(0.4, 0.45, 0.35); // Прибрежный
                break;
            case "sand":
            case "sandbox":
                terrainColor = new Color3(0.65, 0.55, 0.40); // Песочный
                break;
            default:
                terrainColor = new Color3(0.3, 0.4, 0.2); // Зеленоватый (по умолчанию)
        }
        
        groundMat.diffuseColor = terrainColor;
        groundMat.specularColor = Color3.Black();
        ground.material = groundMat;
        
        // Делаем pickable для редактирования
        ground.isPickable = true;
        
        // Устанавливаем имя для поиска в MapEditor
        ground.name = "ground_0_0";
        
        logger.log(`[StandaloneMapEditor] Base terrain created: ${size}x${size}, type: ${mapType || "empty"}`);
        
        // Создаем визуальную сетку для ориентации
        this.createGrid(size);
    }
    
    /**
     * Создать визуальную сетку для ориентации в 3D пространстве
     */
    private createGrid(size: number): void {
        const gridSize = size;
        const gridStep = Math.max(10, Math.floor(size / 20)); // Шаг сетки
        const halfSize = gridSize / 2;
        
        // Собираем все точки для сетки
        const gridPoints: Vector3[] = [];
        
        // Вертикальные линии (параллельно Z)
        for (let x = -halfSize; x <= halfSize; x += gridStep) {
            gridPoints.push(new Vector3(x, 0.1, -halfSize));
            gridPoints.push(new Vector3(x, 0.1, halfSize));
        }
        
        // Горизонтальные линии (параллельно X)
        for (let z = -halfSize; z <= halfSize; z += gridStep) {
            gridPoints.push(new Vector3(-halfSize, 0.1, z));
            gridPoints.push(new Vector3(halfSize, 0.1, z));
        }
        
        // Создаем меш линий для сетки
        if (gridPoints.length > 0) {
            const gridLines = MeshBuilder.CreateLines("editorGrid", { points: gridPoints }, this.scene);
            gridLines.color = new Color3(0.2, 0.4, 0.2);
            gridLines.alpha = 0.4;
        }
        
        // Создаем оси координат в центре
        const axisSize = Math.min(50, size / 4);
        const axisPoints: Vector3[] = [
            Vector3.Zero(),
            new Vector3(axisSize, 0, 0), // X ось
            Vector3.Zero(),
            new Vector3(0, axisSize, 0), // Y ось
            Vector3.Zero(),
            new Vector3(0, 0, axisSize)  // Z ось
        ];
        
        const axes = MeshBuilder.CreateLines("editorAxes", { points: axisPoints }, this.scene);
        axes.color = new Color3(0.8, 0.8, 0.8);
        axes.alpha = 0.8;
        
        logger.log("[StandaloneMapEditor] Grid and axes created");
    }
    
    /**
     * Генерировать контент карты для предустановленных карт
     */
    private async generateMapContent(mapType: string, mapSize: number): Promise<void> {
        try {
            // Импортируем генераторы и все необходимые классы
            const mapsModule = await import("./maps");
            const { 
                MapGeneratorFactory, 
                ChunkGenerationContext, 
                SeededRandom
            } = mapsModule;
            const MapsSeededRandom = SeededRandom;
            
            // Импортируем все генераторы и регистрируем их
            await this.registerMapGenerators(mapsModule);
            
            // Для sandbox не используем генератор - это просто плоский террейн
            if (mapType === "sandbox") {
                logger.log(`[StandaloneMapEditor] Map type "sandbox" - using flat terrain only (no generator)`);
                return;
            }
            
            const generator = MapGeneratorFactory.get(mapType);
            if (!generator) {
                logger.warn(`[StandaloneMapEditor] Generator for map type "${mapType}" not found. Available: ${MapGeneratorFactory.getAvailableMapTypes().join(", ")}`);
                return;
            }
            
            // Генераторы требуют инициализации с GenerationContext
            // Создаем упрощенный контекст для редактора
            const materials = this.createBasicMaterials();
            const simplifiedContext: any = {
                scene: this.scene,
                config: {
                    chunkSize: mapSize,
                    renderDistance: mapSize,
                    unloadDistance: mapSize * 2,
                    worldSeed: 12345,
                    mapType: mapType
                },
                materials: materials,
                garagePositions: [],
                isPositionInGarageArea: () => false,
                isPositionNearRoad: () => false,
                getTerrainHeight: () => 0,
                getMat: (name: string) => materials.get(name) || this.createDefaultMaterial(name)
            };
            
            // Инициализируем генератор
            generator.initialize(simplifiedContext);
            
            logger.log(`[StandaloneMapEditor] Generating content for map type: ${mapType}, mapSize: ${mapSize}`);
            
            // Создаем родительский узел для всех объектов карты
            const mapParent = new TransformNode("mapContent", this.scene);
            
            // Для редактора генерируем карту как один большой чанк
            const chunkSize = mapSize;
            
            // ВАЖНО: Для редактора используем worldX=0, worldZ=0
            // Это означает, что объекты будут создаваться с абсолютными координатами
            // Родитель находится в центре мира (0,0,0)
            const worldX = 0;
            const worldZ = 0;
            const seed = 12345;
            
            // Родитель в центре мира - объекты создаются с абсолютными координатами
            mapParent.position = new Vector3(0, 0, 0);
            
            logger.log(`[StandaloneMapEditor] Editor mode: worldX=0, worldZ=0, parent at (0,0,0), chunkSize=${chunkSize}`);
            
            // Создаем контекст генерации чанка
            // worldX=0, worldZ=0 означает что генераторы будут использовать абсолютные координаты
            const chunkContext: ChunkGenerationContext = {
                scene: this.scene,
                chunkX: 0,
                chunkZ: 0,
                worldX: 0,  // Центр карты
                worldZ: 0,  // Центр карты
                size: chunkSize,  // Размер = вся карта
                random: new MapsSeededRandom(seed),
                chunkParent: mapParent,
                biome: this.getBiomeForMapType(mapType)
            };
            
            // Генерируем контент
            logger.log(`[StandaloneMapEditor] Calling generator.generateContent() for ${mapType}...`);
            logger.log(`[StandaloneMapEditor] Generator type: ${generator.constructor.name}`);
            try {
                const meshesBefore = this.scene.meshes.length;
                generator.generateContent(chunkContext);
                const meshesAfter = this.scene.meshes.length;
                logger.log(`[StandaloneMapEditor] generator.generateContent() completed successfully. Meshes: ${meshesBefore} -> ${meshesAfter} (+${meshesAfter - meshesBefore})`);
            } catch (genError) {
                logger.error(`[StandaloneMapEditor] Error in generator.generateContent():`, genError);
                console.error("Full error details:", genError);
                throw genError;
            }
            
            // Проверяем, что объекты были созданы
            const meshesCount = this.scene.meshes.length;
            logger.log(`[StandaloneMapEditor] Map content generated successfully for ${mapType}. Total meshes in scene: ${meshesCount}`);
            
            // Принудительно обновляем сцену
            this.scene.render();
            
        } catch (error) {
            logger.error(`[StandaloneMapEditor] Failed to generate map content for ${mapType}:`, error);
            console.error("Full error:", error);
        }
    }
    
    /**
     * Создать базовые материалы для генераторов
     */
    private createBasicMaterials(): Map<string, StandardMaterial> {
        const materials = new Map<string, StandardMaterial>();
        
        const materialNames = [
            "asphalt", "concrete", "dirt", "sand", "grass", "stone", 
            "brick", "metal", "wood", "glass", "rock", "red", "blue"
        ];
        
        materialNames.forEach(name => {
            const mat = new StandardMaterial(name, this.scene);
            // Базовые цвета для материалов
            const colors: Record<string, Color3> = {
                asphalt: new Color3(0.12, 0.12, 0.12),
                concrete: new Color3(0.45, 0.43, 0.40),
                dirt: new Color3(0.35, 0.28, 0.20),
                sand: new Color3(0.65, 0.55, 0.40),
                grass: new Color3(0.3, 0.4, 0.2),
                stone: new Color3(0.4, 0.4, 0.4),
                brick: new Color3(0.5, 0.3, 0.2),
                metal: new Color3(0.5, 0.5, 0.5),
                wood: new Color3(0.4, 0.3, 0.2),
                glass: new Color3(0.7, 0.8, 0.9),
                rock: new Color3(0.3, 0.3, 0.3),
                red: new Color3(0.55, 0.18, 0.12),
                blue: new Color3(0.1, 0.2, 0.5)
            };
            mat.diffuseColor = colors[name] || new Color3(0.5, 0.5, 0.5);
            mat.specularColor = Color3.Black();
            materials.set(name, mat);
        });
        
        return materials;
    }
    
    /**
     * Создать материал по умолчанию
     */
    private createDefaultMaterial(name: string): StandardMaterial {
        const mat = new StandardMaterial(name, this.scene);
        mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
        mat.specularColor = Color3.Black();
        return mat;
    }
    
    /**
     * Получить биом для типа карты
     */
    private getBiomeForMapType(mapType: string): string {
        const biomeMap: Record<string, string> = {
            "polygon": "military",
            "frontline": "wasteland",
            "ruins": "wasteland",
            "canyon": "park",
            "industrial": "industrial",
            "urban_warfare": "city",
            "underground": "wasteland",
            "coastal": "park",
            "sand": "wasteland",
            "madness": "wasteland",
            "expo": "military",
            "brest": "military",
            "arena": "military",
            "normal": "city",
            "sandbox": "wasteland",
            "tartaria": "wasteland"
        };
        return biomeMap[mapType] || "wasteland";
    }
    
    /**
     * Зарегистрировать все генераторы карт
     */
    private async registerMapGenerators(mapsModule: any): Promise<void> {
        const { MapGeneratorFactory } = mapsModule;
        
        // Проверяем, не зарегистрированы ли уже генераторы
        if (MapGeneratorFactory.getAvailableMapTypes().length > 0) {
            logger.log(`[StandaloneMapEditor] Generators already registered: ${MapGeneratorFactory.getAvailableMapTypes().join(", ")}`);
            return;
        }
        
        try {
            // Импортируем и регистрируем все генераторы
            const [
                { PolygonGenerator },
                { FrontlineGenerator },
                { RuinsGenerator },
                { CanyonGenerator },
                { IndustrialGenerator },
                { UrbanWarfareGenerator },
                { UndergroundGenerator },
                { CoastalGenerator },
                { SandGenerator },
                { MadnessGenerator },
                { ExpoGenerator },
                { BrestGenerator },
                { ArenaGenerator }
            ] = await Promise.all([
                import("./maps/polygon/PolygonGenerator"),
                import("./maps/frontline/FrontlineGenerator"),
                import("./maps/ruins/RuinsGenerator"),
                import("./maps/canyon/CanyonGenerator"),
                import("./maps/industrial/IndustrialGenerator"),
                import("./maps/urban_warfare/UrbanWarfareGenerator"),
                import("./maps/underground/UndergroundGenerator"),
                import("./maps/coastal/CoastalGenerator"),
                import("./maps/sand/SandGenerator"),
                import("./maps/madness/MadnessGenerator"),
                import("./maps/expo/ExpoGenerator"),
                import("./maps/brest/BrestGenerator"),
                import("./maps/arena/ArenaGenerator")
            ]);
            
            // Создаем упрощенный контекст для инициализации
            const materials = this.createBasicMaterials();
            const initContext: any = {
                scene: this.scene,
                config: {
                    chunkSize: 500,
                    renderDistance: 500,
                    unloadDistance: 1000,
                    worldSeed: 12345,
                    mapType: "polygon"
                },
                materials: materials,
                garagePositions: [],
                isPositionInGarageArea: () => false,
                isPositionNearRoad: () => false,
                getTerrainHeight: () => 0,
                getMat: (name: string) => materials.get(name) || this.createDefaultMaterial(name)
            };
            
            // Регистрируем генераторы
            const generators = [
                new PolygonGenerator(),
                new FrontlineGenerator(),
                new RuinsGenerator(),
                new CanyonGenerator(),
                new IndustrialGenerator(),
                new UrbanWarfareGenerator(),
                new UndergroundGenerator(),
                new CoastalGenerator(),
                new SandGenerator(),
                new MadnessGenerator(),
                new ExpoGenerator(),
                new BrestGenerator(),
                new ArenaGenerator()
            ];
            
            generators.forEach(gen => {
                gen.initialize(initContext);
                MapGeneratorFactory.register(gen);
            });
            
            logger.log(`[StandaloneMapEditor] Registered ${generators.length} map generators`);
            
        } catch (error) {
            logger.error("[StandaloneMapEditor] Failed to register map generators:", error);
        }
    }
    
    /**
     * Запустить render loop
     */
    private startRenderLoop(): void {
        if (this.renderLoopId !== null) return;
        
        const renderLoop = () => {
            if (!this.isActive || !this.scene || !this.engine || this.engine.isDisposed) {
                return;
            }
            
            this.scene.render();
            this.renderLoopId = requestAnimationFrame(renderLoop);
        };
        
        this.renderLoopId = requestAnimationFrame(renderLoop);
        logger.log("[StandaloneMapEditor] Render loop started");
    }
    
    /**
     * Остановить render loop
     */
    private stopRenderLoop(): void {
        if (this.renderLoopId !== null) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }
    
    /**
     * Очистка ресурсов
     */
    private cleanup(): void {
        // Останавливаем наблюдение за DOM
        if (this.closeObserver) {
            this.closeObserver.disconnect();
            this.closeObserver = null;
        }
        
        // Останавливаем render loop
        this.stopRenderLoop();
        
        // Очищаем сцену
        if (this.scene) {
            this.scene.dispose();
        }
        
        // Очищаем engine
        if (this.engine) {
            this.engine.dispose();
        }
        
        // Удаляем canvas
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        logger.log("[StandaloneMapEditor] Cleanup complete");
    }
    
    /**
     * Проверить, активен ли редактор
     */
    isEditorActive(): boolean {
        return this.isActive;
    }
    
    /**
     * Получить данные текущей карты
     */
    getMapData(): MapData | null {
        if (!this.mapEditor) return null;
        return JSON.parse(this.mapEditor.exportMap());
    }
}

