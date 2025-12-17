/**
 * Map Editor - Редактор карт с терраформингом, объектами и триггерами
 * Позволяет игроку создавать и редактировать карты
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, GroundMesh, Ray, PickingInfo, AbstractMesh, PointerEventTypes, VertexBuffer } from "@babylonjs/core";
import { PhysicsBody, PhysicsShapeType, PhysicsAggregate } from "@babylonjs/core";

/**
 * Данные редактируемой карты
 */
export interface MapData {
    name: string;
    seed?: number;
    mapType?: string;
    terrainEdits: TerrainEdit[];
    placedObjects: PlacedObject[];
    triggers: MapTrigger[];
    metadata: {
        createdAt: number;
        modifiedAt: number;
        author?: string;
        description?: string;
    };
}

/**
 * Редактирование террейна (изменение высоты)
 */
export interface TerrainEdit {
    x: number;
    z: number;
    height: number;
    radius: number;
    operation: "raise" | "lower" | "flatten" | "smooth";
}

/**
 * Размещенные объекты на карте
 */
export interface PlacedObject {
    id: string;
    type: "building" | "tree" | "rock" | "spawn" | "garage" | "custom";
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
    properties?: Record<string, any>;
}

/**
 * Триггеры на карте
 */
export interface MapTrigger {
    id: string;
    type: "spawn" | "teleport" | "damage" | "heal" | "custom";
    position: { x: number; y: number; z: number };
    size: { width: number; height: number; depth: number };
    properties?: Record<string, any>;
}

/**
 * Инструменты редактора
 */
type EditorTool = "terrain" | "objects" | "triggers" | "paint";

/**
 * Операции терраформинга
 */
type TerrainOperation = "raise" | "lower" | "flatten" | "smooth";

/**
 * Редактор карт
 */
export class MapEditor {
    private scene: Scene;
    private isActive: boolean = false;
    private currentTool: EditorTool = "terrain";
    private currentOperation: TerrainOperation = "raise";
    private brushSize: number = 5;
    private brushStrength: number = 1;
    private container: HTMLDivElement | null = null;
    private mapData: MapData;
    private terrainMeshes: Map<string, GroundMesh> = new Map(); // Меши террейна по ключам чанков
    private isEditing: boolean = false;
    private pointerObserver: any = null;
    
    // Для терраформинга
    private heightData: Map<string, number> = new Map(); // Хранит изменения высоты (ключ: "x_z")
    private originalHeights: Map<string, number> = new Map(); // Оригинальные высоты
    private terrainEdits: TerrainEdit[] = [];
    private isMouseDown: boolean = false;
    private wasEditingBefore: boolean = false; // Флаг для отслеживания начала нового редактирования
    
    // Визуализация области кисти
    private brushIndicator: Mesh | null = null;
    
    // Система отмены/повтора
    private undoStack: Array<{ positions: Float32Array, meshKey: string }> = [];
    private redoStack: Array<{ positions: Float32Array, meshKey: string }> = [];
    private maxUndoSteps: number = 50;
    
    // Размещенные объекты
    private placedObjectMeshes: Map<string, Mesh> = new Map(); // ID объекта -> Mesh
    private selectedObjectType: string = "building"; // Тип объекта для размещения
    
    // Триггеры
    private triggerMeshes: Map<string, Mesh> = new Map(); // ID триггера -> Mesh (визуализация)
    private selectedTriggerType: string = "spawn"; // Тип триггера
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.mapData = {
            name: `Map_${Date.now()}`,
            terrainEdits: [],
            placedObjects: [],
            triggers: [],
            metadata: {
                createdAt: Date.now(),
                modifiedAt: Date.now()
            }
        };
    }
    
    /**
     * Открыть редактор карт
     */
    open(): void {
        if (this.isActive) return;
        this.isActive = true;
        this.createUI();
        this.setupInputHandlers();
        this.collectTerrainMeshes();
        this.createBrushIndicator();
        this.setupUpdateLoop();
    }
    
    /**
     * Закрыть редактор карт
     */
    close(): void {
        if (!this.isActive) return;
        this.isActive = false;
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.cleanup();
    }
    
    /**
     * Создать UI
     */
    private createUI(): void {
        this.container = document.createElement("div");
        this.container.className = "map-editor-overlay";
        this.container.innerHTML = `
            <div class="map-editor-container">
                <div class="map-editor-header">
                    <div class="map-editor-title">РЕДАКТОР КАРТ</div>
                    <button class="map-editor-close" id="map-editor-close">×</button>
                </div>
                <div class="map-editor-toolbar">
                    <div class="toolbar-section">
                        <button class="toolbar-btn ${this.currentTool === 'terrain' ? 'active' : ''}" data-tool="terrain">
                            🌍 Террейн
                        </button>
                        <button class="toolbar-btn ${this.currentTool === 'objects' ? 'active' : ''}" data-tool="objects">
                            📦 Объекты
                        </button>
                        <button class="toolbar-btn ${this.currentTool === 'triggers' ? 'active' : ''}" data-tool="triggers">
                            ⚡ Триггеры
                        </button>
                    </div>
                    ${this.currentTool === 'terrain' ? `
                        <div class="toolbar-section">
                            <label>Операция:</label>
                            <select id="terrain-operation">
                                <option value="raise" ${this.currentOperation === 'raise' ? 'selected' : ''}>Поднять</option>
                                <option value="lower" ${this.currentOperation === 'lower' ? 'selected' : ''}>Опустить</option>
                                <option value="flatten" ${this.currentOperation === 'flatten' ? 'selected' : ''}>Выровнять</option>
                                <option value="smooth" ${this.currentOperation === 'smooth' ? 'selected' : ''}>Сгладить</option>
                            </select>
                        </div>
                        <div class="toolbar-section">
                            <label>Размер кисти: <span id="brush-size-value">${this.brushSize}</span></label>
                            <input type="range" id="brush-size" min="1" max="20" value="${this.brushSize}">
                        </div>
                        <div class="toolbar-section">
                            <label>Сила: <span id="brush-strength-value">${this.brushStrength}</span></label>
                            <input type="range" id="brush-strength" min="0.1" max="5" step="0.1" value="${this.brushStrength}">
                        </div>
                    ` : ''}
                    ${this.currentTool === 'objects' ? `
                        <div class="toolbar-section">
                            <label>Тип объекта:</label>
                            <select id="object-type">
                                <option value="building">Здание</option>
                                <option value="tree">Дерево</option>
                                <option value="rock">Камень</option>
                                <option value="spawn">Точка спавна</option>
                            </select>
                        </div>
                        <div class="toolbar-section">
                            <button class="toolbar-btn" id="delete-object-btn">🗑 Удалить объект</button>
                        </div>
                    ` : ''}
                    ${this.currentTool === 'triggers' ? `
                        <div class="toolbar-section">
                            <label>Тип триггера:</label>
                            <select id="trigger-type">
                                <option value="spawn">Точка спавна</option>
                                <option value="teleport">Телепорт</option>
                                <option value="damage">Урон</option>
                                <option value="heal">Лечение</option>
                                <option value="custom">Кастомный</option>
                            </select>
                        </div>
                        <div class="toolbar-section">
                            <label>Размер: <span id="trigger-size-value">5</span></label>
                            <input type="range" id="trigger-size" min="1" max="20" value="5">
                        </div>
                        <div class="toolbar-section">
                            <button class="toolbar-btn" id="delete-trigger-btn">🗑 Удалить триггер</button>
                        </div>
                    ` : ''}
                    <div class="toolbar-section">
                        <button class="toolbar-btn" id="undo-btn" title="Отменить (Ctrl+Z)">↶ Отменить</button>
                        <button class="toolbar-btn" id="redo-btn" title="Повторить (Ctrl+Y)">↷ Повторить</button>
                        <button class="toolbar-btn" id="save-map">💾 Сохранить</button>
                        <button class="toolbar-btn" id="load-map">📂 Загрузить</button>
                        <button class="toolbar-btn" id="export-map">📤 Экспорт</button>
                        <button class="toolbar-btn" id="import-map">📥 Импорт</button>
                        <button class="toolbar-btn" id="new-map">🆕 Новая карта</button>
                    </div>
                </div>
                <div class="map-editor-info">
                    <div>Инструмент: <span id="current-tool">${this.getToolName(this.currentTool)}</span></div>
                    <div>Объектов: <span>${this.mapData.placedObjects.length}</span></div>
                    <div>Триггеров: <span>${this.mapData.triggers.length}</span></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        this.injectStyles();
        this.setupUIEventListeners();
    }
    
    /**
     * Инъектировать стили
     */
    private injectStyles(): void {
        if (document.getElementById("map-editor-styles")) return;
        
        const style = document.createElement("style");
        style.id = "map-editor-styles";
        style.textContent = `
            .map-editor-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 10, 0, 0.95);
                z-index: 10001;
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding-top: 20px;
            }
            .map-editor-container {
                width: min(95vw, 1200px);
                background: rgba(5, 15, 5, 0.98);
                border: 2px solid #0f0;
                box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
            }
            .map-editor-header {
                height: 50px;
                background: rgba(0, 30, 0, 0.9);
                border-bottom: 2px solid #0f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 20px;
            }
            .map-editor-title {
                color: #0f0;
                font-size: 20px;
                font-weight: bold;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .map-editor-close {
                color: #f00;
                font-size: 24px;
                background: transparent;
                border: 1px solid #f00;
                padding: 5px 10px;
                cursor: pointer;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .map-editor-close:hover {
                background: rgba(255, 0, 0, 0.3);
            }
            .map-editor-toolbar {
                padding: 15px;
                background: rgba(0, 20, 0, 0.8);
                border-bottom: 1px solid #080;
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
                align-items: center;
            }
            .toolbar-section {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .toolbar-btn {
                padding: 8px 15px;
                background: rgba(0, 50, 0, 0.8);
                border: 1px solid #0f0;
                color: #0f0;
                cursor: pointer;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .toolbar-btn:hover {
                background: rgba(0, 70, 0, 0.9);
            }
            .toolbar-btn.active {
                background: rgba(0, 80, 0, 0.9);
                border-color: #0ff;
                color: #0ff;
            }
            .toolbar-btn.disabled {
                opacity: 0.5;
                cursor: not-allowed;
                border-color: #080;
                color: #080;
            }
            .toolbar-btn.disabled:hover {
                background: rgba(0, 50, 0, 0.8);
            }
            .toolbar-section label {
                color: #0f0;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .toolbar-section select, .toolbar-section input[type="range"] {
                background: rgba(0, 30, 0, 0.9);
                border: 1px solid #0f0;
                color: #0f0;
                padding: 5px;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .map-editor-info {
                padding: 10px 20px;
                background: rgba(0, 20, 0, 0.8);
                display: flex;
                gap: 30px;
                color: #080;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 12px;
            }
            .map-editor-info span {
                color: #0f0;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Настроить обработчики UI
     */
    private setupUIEventListeners(): void {
        if (!this.container) return;
        
        // Закрытие
        this.container.querySelector("#map-editor-close")?.addEventListener("click", () => {
            this.close();
        });
        
        // Переключение инструментов
        this.container.querySelectorAll("[data-tool]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const tool = (e.target as HTMLElement).getAttribute("data-tool") as EditorTool;
                if (tool) {
                    this.currentTool = tool;
                    this.updateUI();
                }
            });
        });
        
        // Операции террейна
        this.container.querySelector("#terrain-operation")?.addEventListener("change", (e) => {
            this.currentOperation = (e.target as HTMLSelectElement).value as TerrainOperation;
        });
        
        // Тип объекта
        this.container.querySelector("#object-type")?.addEventListener("change", (e) => {
            this.selectedObjectType = (e.target as HTMLSelectElement).value;
        });
        
        // Удаление объекта
        this.container.querySelector("#delete-object-btn")?.addEventListener("click", () => {
            // При клике на объект удаляем его
            const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                return mesh.metadata && mesh.metadata.mapEditorObject === true;
            });
            
            if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata) {
                const objectId = pickInfo.pickedMesh.metadata.objectId;
                if (objectId) {
                    this.deleteObject(objectId);
                }
            }
        });
        
        // Тип триггера
        this.container.querySelector("#trigger-type")?.addEventListener("change", (e) => {
            this.selectedTriggerType = (e.target as HTMLSelectElement).value;
        });
        
        // Размер триггера
        const triggerSizeInput = this.container.querySelector("#trigger-size") as HTMLInputElement;
        if (triggerSizeInput) {
            triggerSizeInput.addEventListener("input", (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value);
                const valueEl = this.container?.querySelector("#trigger-size-value");
                if (valueEl) valueEl.textContent = value.toString();
            });
        }
        
        // Удаление триггера
        this.container.querySelector("#delete-trigger-btn")?.addEventListener("click", () => {
            const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                return mesh.metadata && mesh.metadata.mapEditorTrigger === true;
            });
            
            if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata) {
                const triggerId = pickInfo.pickedMesh.metadata.triggerId;
                if (triggerId) {
                    this.deleteTrigger(triggerId);
                }
            }
        });
        
        // Размер кисти
        const brushSizeInput = this.container.querySelector("#brush-size") as HTMLInputElement;
        if (brushSizeInput) {
            brushSizeInput.addEventListener("input", (e) => {
                this.brushSize = parseFloat((e.target as HTMLInputElement).value);
                const valueEl = this.container?.querySelector("#brush-size-value");
                if (valueEl) valueEl.textContent = this.brushSize.toString();
            });
        }
        
        // Сила кисти
        const brushStrengthInput = this.container.querySelector("#brush-strength") as HTMLInputElement;
        if (brushStrengthInput) {
            brushStrengthInput.addEventListener("input", (e) => {
                this.brushStrength = parseFloat((e.target as HTMLInputElement).value);
                const valueEl = this.container?.querySelector("#brush-strength-value");
                if (valueEl) valueEl.textContent = this.brushStrength.toString();
            });
        }
        
        // Кнопки сохранения/загрузки
        this.container.querySelector("#save-map")?.addEventListener("click", () => {
            this.saveMap();
        });
        
        this.container.querySelector("#load-map")?.addEventListener("click", () => {
            this.loadMap();
        });
        
        this.container.querySelector("#export-map")?.addEventListener("click", () => {
            this.exportMapToFile();
        });
        
        this.container.querySelector("#import-map")?.addEventListener("click", () => {
            this.importMapFromFile();
        });
        
        this.container.querySelector("#new-map")?.addEventListener("click", () => {
            if (confirm("Создать новую карту? Все несохраненные изменения будут потеряны.")) {
                this.newMap();
            }
        });
        
        // Кнопки отмены/повтора
        this.container.querySelector("#undo-btn")?.addEventListener("click", () => {
            this.undo();
        });
        
        this.container.querySelector("#redo-btn")?.addEventListener("click", () => {
            this.redo();
        });
        
        // Горячие клавиши для отмены/повтора
        const keyHandler = (e: KeyboardEvent) => {
            if (!this.isActive) return;
            if (e.ctrlKey || e.metaKey) {
                if (e.code === "KeyZ" && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                } else if (e.code === "KeyZ" && e.shiftKey || e.code === "KeyY") {
                    e.preventDefault();
                    this.redo();
                }
            }
        };
        window.addEventListener("keydown", keyHandler);
    }
    
    /**
     * Настроить обработчики ввода для редактирования
     */
    private setupInputHandlers(): void {
        // Обработка мыши для терраформинга
        this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
            if (!this.isActive || this.currentTool !== "terrain") return;
            
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                this.isMouseDown = true;
                
                if (this.currentTool === "terrain") {
                    this.wasEditingBefore = false; // Начинаем новое редактирование
                    this.handleTerrainEdit();
                } else if (this.currentTool === "objects") {
                    this.handleObjectPlacement(pointerInfo);
                } else if (this.currentTool === "triggers") {
                    this.handleTriggerPlacement(pointerInfo);
                }
            } else if (pointerInfo.type === PointerEventTypes.POINTERMOVE && this.isMouseDown) {
                if (this.currentTool === "terrain") {
                    this.handleTerrainEdit();
                }
            } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
                this.isMouseDown = false;
                this.wasEditingBefore = false; // Заканчиваем редактирование
            }
        });
    }
    
    /**
     * Собрать все меши террейна из chunkSystem
     */
    private collectTerrainMeshes(): void {
        this.terrainMeshes.clear();
        
        // Найти все меши террейна в сцене
        this.scene.meshes.forEach(mesh => {
            if (mesh instanceof GroundMesh && mesh.name.startsWith("ground_")) {
                // Извлекаем координаты чанка из имени (ground_x_z)
                const parts = mesh.name.split("_");
                if (parts.length >= 3) {
                    const chunkKey = `${parts[1]}_${parts[2]}`;
                    this.terrainMeshes.set(chunkKey, mesh);
                }
            }
        });
        
        console.log(`[MapEditor] Found ${this.terrainMeshes.size} terrain meshes`);
    }
    
    /**
     * Обработать редактирование террейна
     */
    private handleTerrainEdit(): void {
        if (!this.isActive || this.currentTool !== "terrain") return;
        
        // Raycast для определения точки клика на террейне
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
            // Ищем только меши террейна
            return mesh instanceof GroundMesh && mesh.name.startsWith("ground_");
        });
        
        if (!pickInfo || !pickInfo.hit || !pickInfo.pickedPoint) return;
        
        const hitPoint = pickInfo.pickedPoint;
        const hitMesh = pickInfo.pickedMesh as GroundMesh;
        
        if (!hitMesh) return;
        
        // Редактируем террейн в радиусе кисти
        this.editTerrainAt(hitMesh, hitPoint, this.brushSize, this.brushStrength);
    }
    
    /**
     * Сохранить состояние меша для отмены
     */
    private saveMeshStateForUndo(mesh: GroundMesh): void {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions) return;
        
        // Определяем ключ меша
        const meshKey = mesh.name;
        
        // Сохраняем копию позиций
        const positionsCopy = new Float32Array(positions);
        
        // Добавляем в стек отмены
        this.undoStack.push({ positions: positionsCopy, meshKey });
        
        // Ограничиваем размер стека
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
        
        // Очищаем стек повтора при новом редактировании
        this.redoStack = [];
    }
    
    /**
     * Отменить последнее редактирование
     */
    undo(): void {
        if (this.undoStack.length === 0) return;
        
        const lastState = this.undoStack.pop()!;
        
        // Найти меш по ключу
        const mesh = this.scene.getMeshByName(lastState.meshKey) as GroundMesh;
        if (!mesh) return;
        
        // Сохранить текущее состояние в стек повтора
        const currentPositions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (currentPositions) {
            this.redoStack.push({ positions: new Float32Array(currentPositions), meshKey: lastState.meshKey });
            // Ограничиваем размер стека повтора
            if (this.redoStack.length > this.maxUndoSteps) {
                this.redoStack.shift();
            }
        }
        
        // Восстановить предыдущее состояние
        mesh.updateVerticesData(VertexBuffer.PositionKind, lastState.positions, true);
        mesh.refreshBoundingInfo();
        mesh.createNormals(true);
        
        // Обновить UI
        this.updateUndoRedoButtons();
    }
    
    /**
     * Повторить последнее отмененное редактирование
     */
    redo(): void {
        if (this.redoStack.length === 0) return;
        
        const nextState = this.redoStack.pop()!;
        
        // Найти меш по ключу
        const mesh = this.scene.getMeshByName(nextState.meshKey) as GroundMesh;
        if (!mesh) return;
        
        // Сохранить текущее состояние в стек отмены
        const currentPositions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (currentPositions) {
            this.undoStack.push({ positions: new Float32Array(currentPositions), meshKey: nextState.meshKey });
            // Ограничиваем размер стека отмены
            if (this.undoStack.length > this.maxUndoSteps) {
                this.undoStack.shift();
            }
        }
        
        // Восстановить состояние
        mesh.updateVerticesData(VertexBuffer.PositionKind, nextState.positions, true);
        mesh.refreshBoundingInfo();
        mesh.createNormals(true);
        
        // Обновить UI
        this.updateUndoRedoButtons();
    }
    
    /**
     * Обновить состояние кнопок отмены/повтора
     */
    private updateUndoRedoButtons(): void {
        if (!this.container) return;
        
        const undoBtn = this.container.querySelector("#undo-btn");
        const redoBtn = this.container.querySelector("#redo-btn");
        
        if (undoBtn) {
            if (this.undoStack.length === 0) {
                undoBtn.classList.add("disabled");
            } else {
                undoBtn.classList.remove("disabled");
            }
        }
        
        if (redoBtn) {
            if (this.redoStack.length === 0) {
                redoBtn.classList.add("disabled");
            } else {
                redoBtn.classList.remove("disabled");
            }
        }
    }
    
    /**
     * Редактировать террейн в указанной точке
     */
    private editTerrainAt(mesh: GroundMesh, center: Vector3, radius: number, strength: number): void {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions) return;
        
        // Сохраняем состояние для отмены только при начале нового редактирования (когда кнопка мыши только нажата)
        if (!this.wasEditingBefore) {
            this.saveMeshStateForUndo(mesh);
            this.wasEditingBefore = true;
        }
        
        const indices = mesh.getIndices();
        if (!indices) return;
        
        // Получаем размер меша и количество подразделений
        // Предполагаем, что меш создан через CreateGround с subdivisions=24
        const subdivisions = 24;
        const vertsPerSide = subdivisions + 1;
        
        // Вычисляем размер чанка (предполагаем стандартный размер)
        const chunkSize = 80; // Стандартный размер чанка
        
        let modified = false;
        
        // Перебираем все вершины меша
        for (let i = 0; i < positions.length; i += 3) {
            const vx = positions[i];
            const vy = positions[i + 1];
            const vz = positions[i + 2];
            
            // Вычисляем расстояние от вершины до центра кисти (только по X и Z)
            const dx = vx - center.x;
            const dz = vz - center.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            // Если вершина в радиусе кисти
            if (dist <= radius) {
                // Вычисляем влияние кисти (1.0 в центре, 0.0 на краю)
                const influence = 1.0 - (dist / radius);
                const smoothInfluence = influence * influence * (3 - 2 * influence); // smoothstep
                
                // Вычисляем индекс вершины для сохранения оригинальной высоты
                const vertX = Math.round((vx - mesh.position.x + chunkSize / 2) / (chunkSize / subdivisions));
                const vertZ = Math.round((vz - mesh.position.z + chunkSize / 2) / (chunkSize / subdivisions));
                const heightKey = `${Math.floor(mesh.position.x)}_${Math.floor(mesh.position.z)}_${vertX}_${vertZ}`;
                
                // Сохраняем оригинальную высоту при первом редактировании
                if (!this.originalHeights.has(heightKey)) {
                    this.originalHeights.set(heightKey, vy);
                }
                
                const originalHeight = this.originalHeights.get(heightKey) || vy;
                let newHeight = vy;
                
                // Применяем операцию
                switch (this.currentOperation) {
                    case "raise":
                        newHeight = vy + strength * smoothInfluence * 0.5;
                        break;
                    case "lower":
                        newHeight = vy - strength * smoothInfluence * 0.5;
                        break;
                    case "flatten":
                        // Выравниваем к высоте центра
                        const targetHeight = center.y;
                        newHeight = vy + (targetHeight - vy) * smoothInfluence * strength * 0.1;
                        break;
                    case "smooth":
                        // Сглаживание: усредняем высоту с соседними вершинами
                        // Упрощенная версия - просто слегка сглаживаем
                        newHeight = vy * (1 - smoothInfluence * 0.3) + originalHeight * (smoothInfluence * 0.3);
                        break;
                }
                
                positions[i + 1] = newHeight;
                modified = true;
                
                // Сохраняем изменение в heightData
                const worldKey = `${Math.floor(vx)}_${Math.floor(vz)}`;
                this.heightData.set(worldKey, newHeight);
            }
        }
        
        // Обновляем меш если были изменения
        if (modified) {
            mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true);
            mesh.refreshBoundingInfo();
            
            // Обновляем нормали для правильного освещения
            mesh.createNormals(true);
            
            // Сохраняем редактирование в mapData
            const terrainEdit: TerrainEdit = {
                x: center.x,
                z: center.z,
                height: center.y,
                radius: radius,
                operation: this.currentOperation
            };
            
            // Добавляем редактирование в список (или обновляем существующее близкое)
            this.mapData.terrainEdits.push(terrainEdit);
            this.mapData.metadata.modifiedAt = Date.now();
            
            // Обновляем кнопки отмены/повтора
            this.updateUndoRedoButtons();
        }
    }
    
    /**
     * Обновить UI
     */
    private updateUI(): void {
        if (!this.container) return;
        
        // Обновить активные кнопки инструментов
        this.container.querySelectorAll("[data-tool]").forEach(btn => {
            const tool = btn.getAttribute("data-tool");
            if (tool === this.currentTool) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
        
        // Обновить название инструмента
        const toolNameEl = this.container.querySelector("#current-tool");
        if (toolNameEl) {
            toolNameEl.textContent = this.getToolName(this.currentTool);
        }
        
        // Обновить информацию о редактированиях
        const infoEl = this.container.querySelector(".map-editor-info");
        if (infoEl) {
            const editsCountEl = infoEl.querySelector("div:last-child span");
            if (editsCountEl) {
                editsCountEl.textContent = this.mapData.terrainEdits.length.toString();
            }
        }
    }
    
    /**
     * Получить название инструмента
     */
    private getToolName(tool: EditorTool): string {
        switch (tool) {
            case "terrain": return "Террейн";
            case "objects": return "Объекты";
            case "triggers": return "Триггеры";
            case "paint": return "Покраска";
            default: return "Неизвестно";
        }
    }
    
    /**
     * Получить название операции
     */
    private getOperationName(operation: TerrainOperation): string {
        switch (operation) {
            case "raise": return "Поднять";
            case "lower": return "Опустить";
            case "flatten": return "Выровнять";
            case "smooth": return "Сгладить";
            default: return "Неизвестно";
        }
    }
    
    /**
     * Экспортировать карту в JSON
     */
    exportMap(): string {
        return JSON.stringify(this.mapData, null, 2);
    }
    
    /**
     * Импортировать карту из JSON
     */
    importMap(jsonData: string): boolean {
        try {
            const importedData = JSON.parse(jsonData) as MapData;
            this.mapData = importedData;
            this.applyMapData();
            return true;
        } catch (error) {
            console.error("[MapEditor] Failed to import map:", error);
            return false;
        }
    }
    
    /**
     * Сохранить карту
     */
    saveMap(): void {
        const name = prompt("Имя карты:", this.mapData.name);
        if (!name) return;
        
        this.mapData.name = name;
        this.mapData.metadata.modifiedAt = Date.now();
        
        // Сохраняем все изменения высоты в terrainEdits
        // Конвертируем heightData в TerrainEdit[] для компактности
        // (это упрощенная версия - в реальности можно оптимизировать)
        
        try {
            const savedMaps = this.loadSavedMaps();
            const mapIndex = savedMaps.findIndex(m => m.name === name);
            
            // Создаем копию mapData для сохранения (убираем дубликаты редактирований)
            const saveData: MapData = {
                ...this.mapData,
                terrainEdits: this.mapData.terrainEdits.slice(-1000) // Ограничиваем последними 1000 редактированиями
            };
            
            if (mapIndex >= 0) {
                savedMaps[mapIndex] = saveData;
            } else {
                savedMaps.push(saveData);
            }
            
            localStorage.setItem("savedMaps", JSON.stringify(savedMaps));
            
            // Показываем уведомление в UI вместо alert
            if (this.container) {
                const notification = document.createElement("div");
                notification.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 50, 0, 0.95);
                    border: 2px solid #0f0;
                    color: #0f0;
                    padding: 20px 40px;
                    z-index: 10002;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 16px;
                `;
                notification.textContent = `Карта "${name}" сохранена!`;
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.remove();
                }, 2000);
            }
        } catch (error) {
            console.error("[MapEditor] Failed to save map:", error);
            alert("Ошибка при сохранении карты: " + (error as Error).message);
        }
    }
    
    /**
     * Загрузить карту
     */
    loadMap(): void {
        const savedMaps = this.loadSavedMaps();
        if (savedMaps.length === 0) {
            alert("Нет сохраненных карт");
            return;
        }
        
        const mapNames = savedMaps.map(m => m.name);
        const selectedName = prompt(`Выберите карту (${mapNames.join(", ")}):`);
        if (!selectedName) return;
        
        const map = savedMaps.find(m => m.name === selectedName);
        if (map) {
            this.mapData = map;
            this.applyMapData();
            alert(`Карта "${selectedName}" загружена!`);
        } else {
            alert("Карта не найдена");
        }
    }
    
    /**
     * Создать новую карту
     */
    newMap(): void {
        // Удаляем все размещенные объекты
        this.placedObjectMeshes.forEach(mesh => mesh.dispose());
        this.placedObjectMeshes.clear();
        
        // Удаляем все триггеры
        this.triggerMeshes.forEach(mesh => mesh.dispose());
        this.triggerMeshes.clear();
        
        this.mapData = {
            name: `Map_${Date.now()}`,
            terrainEdits: [],
            placedObjects: [],
            triggers: [],
            metadata: {
                createdAt: Date.now(),
                modifiedAt: Date.now()
            }
        };
        this.heightData.clear();
        this.originalHeights.clear();
        this.terrainEdits = [];
        this.undoStack = [];
        this.redoStack = [];
    }
    
    /**
     * Экспортировать карту в файл
     */
    private exportMapToFile(): void {
        const jsonData = this.exportMap();
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${this.mapData.name || "map"}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Показываем уведомление
        this.showNotification(`Карта экспортирована: ${a.download}`);
    }
    
    /**
     * Импортировать карту из файла
     */
    private importMapFromFile(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const jsonData = event.target?.result as string;
                if (this.importMap(jsonData)) {
                    this.showNotification("Карта успешно импортирована!");
                    this.updateUI();
                } else {
                    alert("Ошибка при импорте карты");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    
    /**
     * Показать уведомление
     */
    private showNotification(message: string): void {
        if (!this.container) return;
        
        const notification = document.createElement("div");
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 50, 0, 0.95);
            border: 2px solid #0f0;
            color: #0f0;
            padding: 20px 40px;
            z-index: 10002;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 16px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }
    
    /**
     * Загрузить сохраненные карты
     */
    private loadSavedMaps(): MapData[] {
        try {
            const saved = localStorage.getItem("savedMaps");
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error("[MapEditor] Failed to load saved maps:", error);
        }
        return [];
    }
    
    /**
     * Применить данные карты
     */
    private applyMapData(): void {
        // Удаляем существующие размещенные объекты
        this.placedObjectMeshes.forEach(mesh => mesh.dispose());
        this.placedObjectMeshes.clear();
        
        // Применить изменения террейна
        this.mapData.terrainEdits.forEach(edit => {
            this.applyTerrainEdit(edit);
        });
        
        // Разместить объекты
        this.mapData.placedObjects.forEach(obj => {
            this.placeObject(obj);
        });
        
        // Разместить триггеры
        this.mapData.triggers.forEach(trigger => {
            this.createTriggerMesh(trigger);
        });
    }
    
    /**
     * Применить редактирование террейна
     */
    private applyTerrainEdit(edit: TerrainEdit): void {
        const key = `${edit.x}_${edit.z}`;
        this.heightData.set(key, edit.height);
        
        // Найти соответствующий меш и применить изменение
        // Это упрощенная версия - в реальности нужно найти правильный чанк
        this.terrainMeshes.forEach((mesh, chunkKey) => {
            const meshBounds = mesh.getBoundingInfo();
            const meshMin = meshBounds.minimum;
            const meshMax = meshBounds.maximum;
            
            // Проверяем, попадает ли точка редактирования в этот чанк
            if (edit.x >= meshMin.x && edit.x <= meshMax.x &&
                edit.z >= meshMin.z && edit.z <= meshMax.z) {
                // Применяем изменение к вершинам в радиусе
                const editPoint = new Vector3(edit.x, edit.height, edit.z);
                this.editTerrainAt(mesh, editPoint, edit.radius, 1.0);
            }
        });
    }
    
    /**
     * Обработать размещение объекта
     */
    private handleObjectPlacement(pointerInfo: any): void {
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
            return mesh instanceof GroundMesh && mesh.name.startsWith("ground_");
        });
        
        if (!pickInfo || !pickInfo.hit || !pickInfo.pickedPoint) return;
        
        const hitPoint = pickInfo.pickedPoint;
        
        // Создаем объект
        const objectId = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const placedObject: PlacedObject = {
            id: objectId,
            type: this.selectedObjectType as any,
            position: {
                x: hitPoint.x,
                y: hitPoint.y,
                z: hitPoint.z
            },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
        };
        
        this.mapData.placedObjects.push(placedObject);
        this.createObjectMesh(placedObject);
        this.mapData.metadata.modifiedAt = Date.now();
        
        console.log("[MapEditor] Object placed:", placedObject);
    }
    
    /**
     * Создать меш для объекта
     */
    private createObjectMesh(obj: PlacedObject): Mesh {
        let mesh: Mesh;
        const position = new Vector3(obj.position.x, obj.position.y, obj.position.z);
        
        switch (obj.type) {
            case "building":
                mesh = MeshBuilder.CreateBox(`object_${obj.id}`, {
                    width: 5,
                    height: 8,
                    depth: 5
                }, this.scene);
                const buildingMat = new StandardMaterial(`buildingMat_${obj.id}`, this.scene);
                buildingMat.diffuseColor = new Color3(0.6, 0.5, 0.4);
                mesh.material = buildingMat;
                break;
                
            case "tree":
                // Ствол (используем CreateBox для совместимости, можно заменить на цилиндр если доступен)
                const trunk = MeshBuilder.CreateBox(`trunk_${obj.id}`, {
                    width: 0.5,
                    height: 4,
                    depth: 0.5
                }, this.scene);
                trunk.position = position;
                const trunkMat = new StandardMaterial(`trunkMat_${obj.id}`, this.scene);
                trunkMat.diffuseColor = new Color3(0.4, 0.25, 0.1);
                trunk.material = trunkMat;
                
                // Крона
                const crown = MeshBuilder.CreateBox(`crown_${obj.id}`, {
                    width: 3,
                    height: 3,
                    depth: 3
                }, this.scene);
                crown.position = position.clone();
                crown.position.y += 3;
                const crownMat = new StandardMaterial(`crownMat_${obj.id}`, this.scene);
                crownMat.diffuseColor = new Color3(0.2, 0.6, 0.2);
                crown.material = crownMat;
                
                // Связываем как один объект
                crown.parent = trunk;
                mesh = trunk;
                break;
                
            case "rock":
                mesh = MeshBuilder.CreateBox(`rock_${obj.id}`, {
                    width: 2,
                    height: 1.5,
                    depth: 2
                }, this.scene);
                const rockMat = new StandardMaterial(`rockMat_${obj.id}`, this.scene);
                rockMat.diffuseColor = new Color3(0.4, 0.4, 0.4);
                mesh.material = rockMat;
                break;
                
            case "spawn":
                mesh = MeshBuilder.CreateBox(`spawn_${obj.id}`, {
                    width: 2,
                    height: 0.2,
                    depth: 2
                }, this.scene);
                const spawnMat = new StandardMaterial(`spawnMat_${obj.id}`, this.scene);
                spawnMat.emissiveColor = new Color3(0, 1, 0);
                spawnMat.alpha = 0.7;
                mesh.material = spawnMat;
                break;
                
            default:
                mesh = MeshBuilder.CreateBox(`object_${obj.id}`, {
                    width: 1,
                    height: 1,
                    depth: 1
                }, this.scene);
                const defaultMat = new StandardMaterial(`defaultMat_${obj.id}`, this.scene);
                defaultMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
                mesh.material = defaultMat;
        }
        
        mesh.position = position;
        mesh.metadata = { mapEditorObject: true, objectId: obj.id };
        
        this.placedObjectMeshes.set(obj.id, mesh);
        return mesh;
    }
    
    /**
     * Разместить объект (при загрузке карты)
     */
    private placeObject(obj: PlacedObject): void {
        this.createObjectMesh(obj);
    }
    
    /**
     * Удалить объект
     */
    private deleteObject(objectId: string): void {
        const mesh = this.placedObjectMeshes.get(objectId);
        if (mesh) {
            mesh.dispose();
            this.placedObjectMeshes.delete(objectId);
        }
        
        const index = this.mapData.placedObjects.findIndex(o => o.id === objectId);
        if (index >= 0) {
            this.mapData.placedObjects.splice(index, 1);
            this.mapData.metadata.modifiedAt = Date.now();
        }
    }
    
    /**
     * Обработать размещение триггера
     */
    private handleTriggerPlacement(pointerInfo: any): void {
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
            return mesh instanceof GroundMesh && mesh.name.startsWith("ground_");
        });
        
        if (!pickInfo || !pickInfo.hit || !pickInfo.pickedPoint) return;
        
        const hitPoint = pickInfo.pickedPoint;
        const triggerSize = parseFloat((this.container?.querySelector("#trigger-size") as HTMLInputElement)?.value || "5");
        
        // Создаем триггер
        const triggerId = `trigger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const trigger: MapTrigger = {
            id: triggerId,
            type: this.selectedTriggerType as any,
            position: {
                x: hitPoint.x,
                y: hitPoint.y,
                z: hitPoint.z
            },
            size: {
                width: triggerSize,
                height: 2,
                depth: triggerSize
            },
            properties: {}
        };
        
        this.mapData.triggers.push(trigger);
        this.createTriggerMesh(trigger);
        this.mapData.metadata.modifiedAt = Date.now();
        
        console.log("[MapEditor] Trigger placed:", trigger);
    }
    
    /**
     * Создать визуализацию триггера
     */
    private createTriggerMesh(trigger: MapTrigger): Mesh {
        const position = new Vector3(trigger.position.x, trigger.position.y + 0.1, trigger.position.z);
        
        // Создаем прозрачный бокс для визуализации области триггера
        const mesh = MeshBuilder.CreateBox(`trigger_${trigger.id}`, {
            width: trigger.size.width,
            height: trigger.size.height,
            depth: trigger.size.depth
        }, this.scene);
        
        mesh.position = position;
        
        // Материал зависит от типа триггера
        const material = new StandardMaterial(`triggerMat_${trigger.id}`, this.scene);
        material.alpha = 0.3;
        material.disableLighting = true;
        
        switch (trigger.type) {
            case "spawn":
                material.emissiveColor = new Color3(0, 1, 0); // Зеленый
                break;
            case "teleport":
                material.emissiveColor = new Color3(0, 1, 1); // Голубой
                break;
            case "damage":
                material.emissiveColor = new Color3(1, 0, 0); // Красный
                break;
            case "heal":
                material.emissiveColor = new Color3(1, 1, 0); // Желтый
                break;
            default:
                material.emissiveColor = new Color3(1, 1, 1); // Белый
        }
        
        mesh.material = material;
        mesh.metadata = { mapEditorTrigger: true, triggerId: trigger.id };
        
        this.triggerMeshes.set(trigger.id, mesh);
        return mesh;
    }
    
    /**
     * Удалить триггер
     */
    private deleteTrigger(triggerId: string): void {
        const mesh = this.triggerMeshes.get(triggerId);
        if (mesh) {
            mesh.dispose();
            this.triggerMeshes.delete(triggerId);
        }
        
        const index = this.mapData.triggers.findIndex(t => t.id === triggerId);
        if (index >= 0) {
            this.mapData.triggers.splice(index, 1);
            this.mapData.metadata.modifiedAt = Date.now();
        }
    }
    
    /**
     * Создать индикатор области кисти
     */
    private createBrushIndicator(): void {
        if (this.brushIndicator) {
            this.brushIndicator.dispose();
        }
        
        // Создаем диск для отображения области кисти
        const disc = MeshBuilder.CreateDisc("brushIndicator", {
            radius: this.brushSize,
            tessellation: 32
        }, this.scene);
        
        disc.rotation.x = Math.PI / 2; // Поворачиваем горизонтально
        disc.isVisible = false;
        disc.renderingGroupId = 2; // Поверх других объектов
        
        const material = new StandardMaterial("brushIndicatorMat", this.scene);
        material.emissiveColor = new Color3(0, 1, 0);
        material.alpha = 0.3;
        material.disableLighting = true;
        disc.material = material;
        
        this.brushIndicator = disc;
    }
    
    /**
     * Настроить цикл обновления для визуализации кисти
     */
    private setupUpdateLoop(): void {
        this.scene.registerBeforeRender(() => {
            if (!this.isActive || this.currentTool !== "terrain") {
                if (this.brushIndicator) {
                    this.brushIndicator.isVisible = false;
                }
                return;
            }
            
            // Обновляем размер индикатора
            if (this.brushIndicator) {
                const newRadius = this.brushSize;
                // Пересоздаем диск с новым размером (Babylon.js не поддерживает изменение радиуса напрямую)
                if (Math.abs((this.brushIndicator as any).geometry?.boundingInfo?.boundingBox?.maximumWorld?.y - newRadius) > 0.1) {
                    this.brushIndicator.dispose();
                    this.createBrushIndicator();
                }
            }
            
            // Raycast для позиционирования индикатора
            const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                return mesh instanceof GroundMesh && mesh.name.startsWith("ground_");
            });
            
            if (pickInfo && pickInfo.hit && pickInfo.pickedPoint && this.brushIndicator) {
                this.brushIndicator.position = pickInfo.pickedPoint.clone();
                this.brushIndicator.position.y += 0.1; // Немного выше поверхности
                this.brushIndicator.isVisible = true;
            } else if (this.brushIndicator) {
                this.brushIndicator.isVisible = false;
            }
        });
    }
    
    /**
     * Очистка
     */
    private cleanup(): void {
        // Отключить обработчик мыши
        if (this.pointerObserver) {
            this.scene.onPointerObservable.remove(this.pointerObserver);
            this.pointerObserver = null;
        }
        this.isMouseDown = false;
        this.terrainMeshes.clear();
        
        // Удалить индикатор кисти
        if (this.brushIndicator) {
            this.brushIndicator.dispose();
            this.brushIndicator = null;
        }
        
        // Очистить стеки отмены/повтора
        this.undoStack = [];
        this.redoStack = [];
    }
    
    /**
     * Проверить, активен ли редактор
     */
    isEditorActive(): boolean {
        return this.isActive;
    }
    
    /**
     * Начать редактирование (вызывается при удержании кнопки мыши)
     */
    startEditing(): void {
        this.isEditing = true;
    }
    
    /**
     * Остановить редактирование
     */
    stopEditing(): void {
        this.isEditing = false;
    }
}

