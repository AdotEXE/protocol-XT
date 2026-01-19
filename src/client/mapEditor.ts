/**
 * Map Editor - Редактор карт с терраформингом, объектами и триггерами
 * Позволяет игроку создавать и редактировать карты
 */

import { Scene, Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, GroundMesh, Ray, PickingInfo, AbstractMesh, PointerEventTypes, VertexBuffer } from "@babylonjs/core";
import { PhysicsBody, PhysicsShapeType, PhysicsAggregate } from "@babylonjs/core";

// ============================================
// КОНСТАНТЫ
// ============================================

/** Максимальное количество сохраняемых редактирований террейна */
const MAX_TERRAIN_EDITS = 5000;

/** Максимальное время ожидания готовности мешей (мс) */
const MESH_READY_TIMEOUT = 5000;

/** Интервал проверки готовности мешей (мс) */
const MESH_CHECK_INTERVAL = 100;

/** Размер чанка по умолчанию */
const DEFAULT_CHUNK_SIZE = 80;

/** Количество подразделений меша террейна */
const TERRAIN_SUBDIVISIONS = 12;

/**
 * Единый формат данных карты
 * Используется для всех карт: предустановленных, сохраненных, отредактированных
 */
export interface MapData {
    /** Версия формата карты (для совместимости при обновлениях) */
    version?: number;
    /** Имя карты */
    name: string;
    /** Семя для генерации (если применимо) */
    seed?: number;
    /** Базовый тип карты (normal, sand, polygon и т.д.) - ОБЯЗАТЕЛЬНО */
    mapType: string;
    /** Редактирования террейна (изменения высоты) */
    terrainEdits: TerrainEdit[];
    /** Размещенные объекты на карте */
    placedObjects: PlacedObject[];
    /** Триггеры на карте */
    triggers: MapTrigger[];
    /** AI/OSM Generated World Entities */
    worldEntities?: any[];
    /** Метаданные карты */
    metadata: {
        createdAt: number;
        modifiedAt: number;
        author?: string;
        description?: string;
        /** Является ли карта предустановленной */
        isPreset?: boolean;
        /** Размер карты в единицах (если указан) */
        mapSize?: number;
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
type EditorTool = "terrain" | "objects" | "triggers" | "paint" | "select";

/**
 * Режим редактирования объектов
 */
type ObjectEditMode = "place" | "select" | "move" | "rotate" | "scale";

/**
 * Операции терраформинга
 */
type TerrainOperation = "raise" | "lower" | "flatten" | "smooth";

/**
 * Редактор карт
 */
export class MapEditor {
    private scene: Scene;
    public chunkSystem: any = null; // ChunkSystem для доступа к террейну
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
    private selectedObjectId: string | null = null; // Выбранный объект для редактирования
    private objectEditMode: ObjectEditMode = "place"; // Режим редактирования объектов
    private objectOutline: Mesh | null = null; // Визуализация выбранного объекта
    private isDragging: boolean = false; // Флаг перетаскивания объекта
    private dragStartPos: Vector3 | null = null; // Начальная позиция при перетаскивании
    private dragStartMouse: { x: number; y: number } | null = null; // Начальная позиция мыши

    // Триггеры
    private triggerMeshes: Map<string, Mesh> = new Map(); // ID триггера -> Mesh (визуализация)
    private selectedTriggerType: string = "spawn"; // Тип триггера
    private selectedTriggerId: string | null = null; // Выбранный триггер для редактирования
    private triggerOutline: Mesh | null = null; // Визуализация выбранного триггера

    // Для rotate и scale объектов
    private isRotating: boolean = false; // Флаг поворота объекта
    private isScaling: boolean = false; // Флаг масштабирования объекта
    private rotateStartAngle: number = 0; // Начальный угол при повороте
    private scaleStartValue: number = 1; // Начальное значение масштаба
    private scaleStartMouse: { x: number; y: number } | null = null; // Начальная позиция мыши при масштабировании

    constructor(scene: Scene) {
        this.scene = scene;
        // Инициализируем mapData в едином формате
        this.mapData = {
            version: 1, // Версия формата
            name: `Map_${Date.now()}`,
            mapType: "normal", // ОБЯЗАТЕЛЬНО: базовый тип карты по умолчанию
            terrainEdits: [],
            placedObjects: [],
            triggers: [],
            metadata: {
                createdAt: Date.now(),
                modifiedAt: Date.now(),
                isPreset: false // Новая карта не является предустановленной
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
        this.updateUndoRedoButtons(); // Обновляем состояние кнопок отмены/повтора
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
                        <button class="toolbar-btn ${this.currentTool === 'terrain' ? 'active' : ''}" data-tool="terrain" title="Редактирование террейна (T)">
                            🌍 Террейн
                        </button>
                        <button class="toolbar-btn ${this.currentTool === 'objects' ? 'active' : ''}" data-tool="objects" title="Работа с объектами (O)">
                            📦 Объекты
                        </button>
                        <button class="toolbar-btn ${this.currentTool === 'select' ? 'active' : ''}" data-tool="select" title="Выбор объектов (S)">
                            👆 Выбор
                        </button>
                        <button class="toolbar-btn ${this.currentTool === 'triggers' ? 'active' : ''}" data-tool="triggers" title="Триггеры (R)">
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
                            <label>Режим:</label>
                            <select id="object-edit-mode">
                                <option value="place" ${this.objectEditMode === 'place' ? 'selected' : ''}>Размещение</option>
                                <option value="select" ${this.objectEditMode === 'select' ? 'selected' : ''}>Выбор</option>
                                <option value="move" ${this.objectEditMode === 'move' ? 'selected' : ''}>Перемещение</option>
                                <option value="rotate" ${this.objectEditMode === 'rotate' ? 'selected' : ''}>Поворот</option>
                                <option value="scale" ${this.objectEditMode === 'scale' ? 'selected' : ''}>Масштаб</option>
                            </select>
                        </div>
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
                            <button class="toolbar-btn" id="delete-object-btn" title="Удалить выбранный объект (Del)">🗑 Удалить</button>
                            <button class="toolbar-btn" id="duplicate-object-btn" title="Дублировать объект (Ctrl+D)">📋 Дублировать</button>
                        </div>
                    ` : ''}
                    ${this.currentTool === 'select' ? `
                        <div class="toolbar-section">
                            <span class="toolbar-hint">Кликните на объект для выбора</span>
                        </div>
                        <div class="toolbar-section">
                            <button class="toolbar-btn" id="deselect-object-btn" title="Снять выбор (Esc)">❌ Снять выбор</button>
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
                <div class="map-editor-content">
                    <div class="map-editor-main">
                        <div class="map-editor-info">
                            <div>Инструмент: <span id="current-tool">${this.getToolName(this.currentTool)}</span></div>
                            <div>Объектов: <span id="objects-count">${this.mapData.placedObjects.length}</span></div>
                            <div>Триггеров: <span id="triggers-count">${this.mapData.triggers.length}</span></div>
                            ${this.selectedObjectId ? `<div>Выбран: <span id="selected-object-name">${this.getSelectedObjectName()}</span></div>` : ''}
                        </div>
                    </div>
                    <div class="map-editor-properties" id="properties-panel" style="display: ${this.selectedObjectId ? 'block' : 'none'}">
                        <div class="properties-header">Свойства объекта</div>
                        <div class="properties-content" id="properties-content">
                            ${this.selectedObjectId ? this.generatePropertiesPanel() : ''}
                        </div>
                    </div>
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
                background: transparent;
                z-index: 10001;
                display: flex;
                justify-content: flex-start;
                align-items: flex-start;
                pointer-events: none;
            }
            .map-editor-container {
                width: min(400px, 30vw);
                max-height: 100vh;
                overflow-y: auto;
                background: rgba(5, 15, 5, 0.95);
                border: 2px solid #0f0;
                border-left: none;
                border-top: none;
                border-bottom: none;
                box-shadow: 4px 0 20px rgba(0, 255, 0, 0.3);
                pointer-events: auto;
                margin: 0;
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
            .map-editor-content {
                display: flex;
                min-height: 200px;
            }
            .map-editor-main {
                flex: 1;
            }
            .map-editor-info {
                padding: 10px 20px;
                background: rgba(0, 20, 0, 0.8);
                display: flex;
                gap: 30px;
                flex-wrap: wrap;
                color: #080;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 12px;
            }
            .map-editor-info span {
                color: #0f0;
            }
            .map-editor-properties {
                width: 280px;
                background: rgba(0, 25, 0, 0.9);
                border-left: 1px solid #080;
                padding: 15px;
                overflow-y: auto;
                max-height: 400px;
            }
            .properties-header {
                color: #0f0;
                font-weight: bold;
                font-size: 14px;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #080;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .properties-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .property-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            .property-group label {
                color: #0a0;
                font-size: 11px;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .property-group input[type="number"],
            .property-group select {
                background: rgba(0, 30, 0, 0.9);
                border: 1px solid #0f0;
                color: #0f0;
                padding: 5px 8px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 12px;
            }
            .property-group input[type="number"]:focus,
            .property-group select:focus {
                outline: none;
                border-color: #0ff;
                background: rgba(0, 40, 0, 0.9);
            }
            .toolbar-hint {
                color: #0a0;
                font-size: 11px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-style: italic;
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
                    // При переключении на другой инструмент снимаем выбор если нужно
                    if (tool !== "select" && tool !== "objects") {
                        this.deselectObject();
                    }
                    if (tool !== "triggers") {
                        this.deselectTrigger();
                    }
                    // Сбрасываем флаги операций
                    if (this.isDragging) this.endObjectDrag();
                    if (this.isRotating) this.endObjectRotate();
                    if (this.isScaling) this.endObjectScale();
                    this.updateUI();
                }
            });
        });

        // Операции террейна
        this.container.querySelector("#terrain-operation")?.addEventListener("change", (e) => {
            this.currentOperation = (e.target as HTMLSelectElement).value as TerrainOperation;
        });

        // Режим редактирования объектов
        this.container.querySelector("#object-edit-mode")?.addEventListener("change", (e) => {
            this.objectEditMode = (e.target as HTMLSelectElement).value as ObjectEditMode;
            this.updateObjectEditMode();
        });

        // Тип объекта
        this.container.querySelector("#object-type")?.addEventListener("change", (e) => {
            this.selectedObjectType = (e.target as HTMLSelectElement).value;
        });

        // Удаление объекта
        this.container.querySelector("#delete-object-btn")?.addEventListener("click", () => {
            if (this.selectedObjectId) {
                this.deleteObject(this.selectedObjectId);
                this.deselectObject();
            } else {
                // Старое поведение - удаление по клику
                const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                    return mesh.metadata && mesh.metadata.mapEditorObject === true;
                });

                if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata) {
                    const objectId = pickInfo.pickedMesh.metadata.objectId;
                    if (objectId) {
                        this.deleteObject(objectId);
                    }
                }
            }
        });

        // Дублирование объекта
        this.container.querySelector("#duplicate-object-btn")?.addEventListener("click", () => {
            if (this.selectedObjectId) {
                this.duplicateObject(this.selectedObjectId);
            }
        });

        // Снять выбор
        this.container.querySelector("#deselect-object-btn")?.addEventListener("click", () => {
            this.deselectObject();
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
            if (this.selectedTriggerId) {
                // Удаляем выбранный триггер
                this.deleteTrigger(this.selectedTriggerId);
                this.deselectTrigger();
            } else {
                // Старое поведение - удаление по клику
                const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                    return mesh.metadata && mesh.metadata.mapEditorTrigger === true;
                });

                if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata) {
                    const triggerId = pickInfo.pickedMesh.metadata.triggerId;
                    if (triggerId) {
                        this.deleteTrigger(triggerId);
                    }
                } else {
                    this.showNotification("Выберите триггер для удаления");
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

        // Горячие клавиши
        const keyHandler = (e: KeyboardEvent) => {
            if (!this.isActive) return;

            // Переключение инструментов
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.code === "KeyT") {
                    e.preventDefault();
                    this.currentTool = "terrain";
                    this.updateUI();
                } else if (e.code === "KeyO") {
                    e.preventDefault();
                    this.currentTool = "objects";
                    this.updateUI();
                } else if (e.code === "KeyS") {
                    e.preventDefault();
                    this.currentTool = "select";
                    this.updateUI();
                } else if (e.code === "KeyR") {
                    e.preventDefault();
                    this.currentTool = "triggers";
                    this.updateUI();
                } else if (e.code === "Escape") {
                    e.preventDefault();
                    this.deselectObject();
                } else if (e.code === "Delete" || e.code === "Backspace") {
                    if (this.selectedObjectId) {
                        e.preventDefault();
                        this.deleteObject(this.selectedObjectId);
                        this.deselectObject();
                    }
                }
            }

            // Отмена/повтор
            if (e.ctrlKey || e.metaKey) {
                if (e.code === "KeyZ" && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                } else if (e.code === "KeyZ" && e.shiftKey || e.code === "KeyY") {
                    e.preventDefault();
                    this.redo();
                } else if (e.code === "KeyD") {
                    e.preventDefault();
                    if (this.selectedObjectId) {
                        this.duplicateObject(this.selectedObjectId);
                    }
                }
            }
        };
        window.addEventListener("keydown", keyHandler);
    }

    /**
     * Настроить обработчики ввода для редактирования
     */
    private setupInputHandlers(): void {
        // Обработка мыши для всех инструментов
        this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
            if (!this.isActive) return;

            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                this.isMouseDown = true;

                if (this.currentTool === "terrain") {
                    this.wasEditingBefore = false;
                    this.handleTerrainEdit();
                } else if (this.currentTool === "objects") {
                    if (this.objectEditMode === "place") {
                        this.handleObjectPlacement(pointerInfo);
                    } else if (this.objectEditMode === "select") {
                        this.handleObjectSelection(pointerInfo);
                    } else if (this.objectEditMode === "move") {
                        this.startObjectDrag(pointerInfo);
                    } else if (this.objectEditMode === "rotate") {
                        this.startObjectRotate(pointerInfo);
                    } else if (this.objectEditMode === "scale") {
                        this.startObjectScale(pointerInfo);
                    }
                } else if (this.currentTool === "select") {
                    this.handleObjectSelection(pointerInfo);
                } else if (this.currentTool === "triggers") {
                    // Проверяем, кликнули ли на существующий триггер для выбора
                    const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                        return mesh.metadata && mesh.metadata.mapEditorTrigger === true;
                    });
                    if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata) {
                        const triggerId = pickInfo.pickedMesh.metadata.triggerId;
                        if (triggerId) {
                            this.selectTrigger(triggerId);
                        }
                    } else {
                        // Если не кликнули на триггер, размещаем новый
                        // Снимаем выбор перед размещением нового
                        if (this.selectedTriggerId) {
                            this.deselectTrigger();
                        }
                        this.handleTriggerPlacement(pointerInfo);
                    }
                }
            } else if (pointerInfo.type === PointerEventTypes.POINTERMOVE && this.isMouseDown) {
                if (this.currentTool === "terrain") {
                    this.handleTerrainEdit();
                } else if (this.currentTool === "objects") {
                    if (this.objectEditMode === "move" && this.isDragging) {
                        this.handleObjectDrag(pointerInfo);
                    } else if (this.objectEditMode === "rotate" && this.isRotating) {
                        this.handleObjectRotate(pointerInfo);
                    } else if (this.objectEditMode === "scale" && this.isScaling) {
                        this.handleObjectScale(pointerInfo);
                    }
                }
            } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
                this.isMouseDown = false;
                this.wasEditingBefore = false;
                if (this.isDragging) {
                    this.endObjectDrag();
                }
                if (this.isRotating) {
                    this.endObjectRotate();
                }
                if (this.isScaling) {
                    this.endObjectScale();
                }
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

        // Убрано для уменьшения спама - логируем только если мешей > 0
        if (this.terrainMeshes.size > 0) {
            console.log(`[MapEditor] Found ${this.terrainMeshes.size} terrain meshes`);
        }
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
        if (this.undoStack.length === 0) {
            this.showNotification("Нечего отменять");
            return;
        }

        const lastState = this.undoStack.pop()!;

        // Найти меш по ключу
        const mesh = this.scene.getMeshByName(lastState.meshKey) as GroundMesh;
        if (!mesh) {
            console.warn(`[MapEditor] Mesh not found for undo: ${lastState.meshKey}`);
            return;
        }

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

        // Обновляем метаданные
        this.mapData.metadata.modifiedAt = Date.now();
    }

    /**
     * Повторить последнее отмененное редактирование
     */
    redo(): void {
        if (this.redoStack.length === 0) {
            this.showNotification("Нечего повторить");
            return;
        }

        const nextState = this.redoStack.pop()!;

        // Найти меш по ключу
        const mesh = this.scene.getMeshByName(nextState.meshKey) as GroundMesh;
        if (!mesh) {
            console.warn(`[MapEditor] Mesh not found for redo: ${nextState.meshKey}`);
            return;
        }

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

        // Обновляем метаданные
        this.mapData.metadata.modifiedAt = Date.now();
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
    private editTerrainAt(mesh: GroundMesh, center: Vector3, radius: number, strength: number, skipUndo: boolean = false): void {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions) return;

        // Сохраняем состояние для отмены только при начале нового редактирования (когда кнопка мыши только нажата)
        // И только если это не применение сохраненных данных (skipUndo = true)
        if (!skipUndo && !this.wasEditingBefore) {
            this.saveMeshStateForUndo(mesh);
            this.wasEditingBefore = true;
        }

        const indices = mesh.getIndices();
        if (!indices) return;

        // Получаем размер меша и количество подразделений
        // Предполагаем, что меш создан через CreateGround с subdivisions=TERRAIN_SUBDIVISIONS (оптимизировано)
        const subdivisions = TERRAIN_SUBDIVISIONS;
        const vertsPerSide = subdivisions + 1;

        // Вычисляем размер чанка (предполагаем стандартный размер)
        const chunkSize = DEFAULT_CHUNK_SIZE; // Стандартный размер чанка

        let modified = false;

        // Перебираем все вершины меша
        for (let i = 0; i < positions.length; i += 3) {
            const vx = positions[i] ?? 0;
            const vy = positions[i + 1] ?? 0;
            const vz = positions[i + 2] ?? 0;

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
     * Обновить UI (только обновляет значения, не пересоздает структуру)
     */
    private updateUI(): void {
        if (!this.container) return;

        try {
            // Обновить активные кнопки инструментов
            this.container.querySelectorAll("[data-tool]").forEach(btn => {
                const tool = btn.getAttribute("data-tool");
                if (tool === this.currentTool) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });

            // Обновить режим редактирования объектов если нужно
            if (this.currentTool === "objects") {
                const modeSelect = this.container.querySelector("#object-edit-mode") as HTMLSelectElement;
                if (modeSelect && modeSelect.value !== this.objectEditMode) {
                    modeSelect.value = this.objectEditMode;
                }
            }

            // Обновить название инструмента
            const toolNameEl = this.container.querySelector("#current-tool");
            if (toolNameEl) {
                toolNameEl.textContent = this.getToolName(this.currentTool);
            }

            // Обновить счетчики
            const objectsCountEl = this.container.querySelector("#objects-count");
            if (objectsCountEl) {
                objectsCountEl.textContent = this.mapData.placedObjects.length.toString();
            }

            const triggersCountEl = this.container.querySelector("#triggers-count");
            if (triggersCountEl) {
                triggersCountEl.textContent = this.mapData.triggers.length.toString();
            }

            // Обновить информацию о выбранном объекте
            const infoEl = this.container.querySelector(".map-editor-info");
            if (infoEl) {
                // Удаляем старую информацию о выборе
                const oldSelectedDivs = infoEl.querySelectorAll("div:has(span[id*='selected'])");
                oldSelectedDivs.forEach(div => div.remove());

                if (this.selectedObjectId) {
                    const selectedDiv = document.createElement("div");
                    selectedDiv.innerHTML = `Выбран объект: <span id="selected-object-name">${this.getSelectedObjectName()}</span>`;
                    infoEl.appendChild(selectedDiv);
                } else if (this.selectedTriggerId) {
                    const selectedDiv = document.createElement("div");
                    const trigger = this.mapData.triggers.find(t => t.id === this.selectedTriggerId);
                    const triggerName = trigger ? `${trigger.type} (${this.selectedTriggerId.substring(0, 8)}...)` : "Триггер";
                    selectedDiv.innerHTML = `Выбран триггер: <span id="selected-trigger-name">${triggerName}</span>`;
                    infoEl.appendChild(selectedDiv);
                }
            }

            // Обновить индикаторы размеров
            const brushSizeValueEl = this.container.querySelector("#brush-size-value");
            if (brushSizeValueEl) {
                brushSizeValueEl.textContent = this.brushSize.toString();
            }

            const brushStrengthValueEl = this.container.querySelector("#brush-strength-value");
            if (brushStrengthValueEl) {
                brushStrengthValueEl.textContent = this.brushStrength.toString();
            }

            const triggerSizeValueEl = this.container.querySelector("#trigger-size-value");
            if (triggerSizeValueEl) {
                const triggerSizeInput = this.container.querySelector("#trigger-size") as HTMLInputElement;
                if (triggerSizeInput) {
                    triggerSizeValueEl.textContent = triggerSizeInput.value || "5";
                }
            }

            // Обновить панель свойств
            this.updatePropertiesPanel();

            // Обновить состояние кнопок
            this.updateUndoRedoButtons();
        } catch (error) {
            console.error("[MapEditor] Failed to update UI:", error);
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
            case "select": return "Выбор";
            default: return "Неизвестно";
        }
    }

    /**
     * Получить название выбранного объекта
     */
    private getSelectedObjectName(): string {
        if (!this.selectedObjectId) return "";
        const obj = this.mapData.placedObjects.find(o => o.id === this.selectedObjectId);
        if (!obj) return "";
        return `${obj.type} (${this.selectedObjectId.substring(0, 8)}...)`;
    }

    /**
     * Сгенерировать панель свойств
     */
    private generatePropertiesPanel(): string {
        if (!this.selectedObjectId) return "";

        const obj = this.mapData.placedObjects.find(o => o.id === this.selectedObjectId);
        if (!obj) return "";

        return `
            <div class="property-group">
                <label>Позиция X:</label>
                <input type="number" id="prop-pos-x" value="${obj.position.x.toFixed(2)}" step="0.1">
            </div>
            <div class="property-group">
                <label>Позиция Y:</label>
                <input type="number" id="prop-pos-y" value="${obj.position.y.toFixed(2)}" step="0.1">
            </div>
            <div class="property-group">
                <label>Позиция Z:</label>
                <input type="number" id="prop-pos-z" value="${obj.position.z.toFixed(2)}" step="0.1">
            </div>
            <div class="property-group">
                <label>Поворот Y:</label>
                <input type="number" id="prop-rot-y" value="${((obj.rotation?.y || 0) * 180 / Math.PI).toFixed(1)}" step="1" min="0" max="360">
            </div>
            <div class="property-group">
                <label>Масштаб X:</label>
                <input type="number" id="prop-scale-x" value="${(obj.scale?.x || 1).toFixed(2)}" step="0.1" min="0.1" max="10">
            </div>
            <div class="property-group">
                <label>Масштаб Y:</label>
                <input type="number" id="prop-scale-y" value="${(obj.scale?.y || 1).toFixed(2)}" step="0.1" min="0.1" max="10">
            </div>
            <div class="property-group">
                <label>Масштаб Z:</label>
                <input type="number" id="prop-scale-z" value="${(obj.scale?.z || 1).toFixed(2)}" step="0.1" min="0.1" max="10">
            </div>
            <div class="property-group">
                <label>Тип:</label>
                <select id="prop-type">
                    <option value="building" ${obj.type === 'building' ? 'selected' : ''}>Здание</option>
                    <option value="tree" ${obj.type === 'tree' ? 'selected' : ''}>Дерево</option>
                    <option value="rock" ${obj.type === 'rock' ? 'selected' : ''}>Камень</option>
                    <option value="spawn" ${obj.type === 'spawn' ? 'selected' : ''}>Точка спавна</option>
                </select>
            </div>
        `;
    }

    /**
     * Обновить панель свойств
     */
    private updatePropertiesPanel(): void {
        if (!this.container) return;

        const panel = this.container.querySelector("#properties-panel") as HTMLElement;
        const content = this.container.querySelector("#properties-content") as HTMLElement;

        if (this.selectedObjectId) {
            if (panel) panel.style.display = "block";
            if (content) {
                content.innerHTML = this.generatePropertiesPanel();
                this.setupPropertiesListeners();
            }
        } else {
            if (panel) panel.style.display = "none";
        }
    }

    /**
     * Настроить обработчики панели свойств
     */
    private setupPropertiesListeners(): void {
        if (!this.container || !this.selectedObjectId) return;

        const obj = this.mapData.placedObjects.find(o => o.id === this.selectedObjectId);
        if (!obj) return;

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        // Позиция
        ["x", "y", "z"].forEach(axis => {
            const input = this.container?.querySelector(`#prop-pos-${axis}`) as HTMLInputElement;
            if (input) {
                input.addEventListener("change", () => {
                    const value = parseFloat(input.value);
                    obj.position[axis as "x" | "y" | "z"] = value;
                    mesh.position[axis as "x" | "y" | "z"] = value;
                    if (this.objectOutline) {
                        this.objectOutline.position[axis as "x" | "y" | "z"] = value;
                    }
                    this.mapData.metadata.modifiedAt = Date.now();
                });
            }
        });

        // Поворот
        const rotYInput = this.container?.querySelector("#prop-rot-y") as HTMLInputElement;
        if (rotYInput) {
            rotYInput.addEventListener("change", () => {
                const value = parseFloat(rotYInput.value) * Math.PI / 180;
                if (!obj.rotation) obj.rotation = { x: 0, y: 0, z: 0 };
                obj.rotation.y = value;
                mesh.rotation.y = value;
                if (this.objectOutline) {
                    this.objectOutline.rotation.y = value;
                }
                this.mapData.metadata.modifiedAt = Date.now();
            });
        }

        // Масштаб
        ["x", "y", "z"].forEach(axis => {
            const input = this.container?.querySelector(`#prop-scale-${axis}`) as HTMLInputElement;
            if (input) {
                input.addEventListener("change", () => {
                    const value = parseFloat(input.value);
                    if (!obj.scale) obj.scale = { x: 1, y: 1, z: 1 };
                    obj.scale[axis as "x" | "y" | "z"] = value;
                    mesh.scaling[axis as "x" | "y" | "z"] = value;
                    this.updateObjectOutline();
                    this.mapData.metadata.modifiedAt = Date.now();
                });
            }
        });

        // Тип
        const typeSelect = this.container?.querySelector("#prop-type") as HTMLSelectElement;
        if (typeSelect) {
            typeSelect.addEventListener("change", () => {
                obj.type = typeSelect.value as any;
                // Пересоздаем меш с новым типом
                mesh.dispose();
                this.placedObjectMeshes.delete(this.selectedObjectId!);
                this.createObjectMesh(obj);
                this.updateObjectOutline();
                this.mapData.metadata.modifiedAt = Date.now();
            });
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
        // Нормализуем данные перед экспортом для единого формата
        const normalized = this.normalizeMapData(this.mapData);
        if (!normalized) {
            console.error("[MapEditor] Failed to normalize map data for export");
            return JSON.stringify(this.mapData, null, 2); // Fallback на исходные данные
        }

        // Убеждаемся, что mapType всегда присутствует
        if (!normalized.mapType) {
            normalized.mapType = "normal";
            console.warn("[MapEditor] exportMap: Map data missing mapType, defaulting to 'normal'");
        }

        return JSON.stringify(normalized, null, 2);
    }

    /**
     * Импортировать карту из JSON
     */
    importMap(jsonData: string): boolean {
        try {
            const rawData = JSON.parse(jsonData);

            // Нормализуем данные к единому формату
            const importedData = this.normalizeMapData(rawData);
            if (!importedData) {
                console.error("[MapEditor] Invalid map data: failed to normalize");
                return false;
            }

            // Валидация данных
            if (!importedData.name || typeof importedData.name !== "string") {
                console.error("[MapEditor] Invalid map data: missing name");
                return false;
            }

            // Убеждаемся, что mapType всегда присутствует
            if (!importedData.mapType) {
                importedData.mapType = "normal";
                console.warn("[MapEditor] Map data missing mapType, defaulting to 'normal'");
            }

            // Очищаем текущие данные перед импортом
            this.placedObjectMeshes.forEach(mesh => mesh.dispose());
            this.placedObjectMeshes.clear();
            this.triggerMeshes.forEach(mesh => mesh.dispose());
            this.triggerMeshes.clear();
            this.heightData.clear();
            this.originalHeights.clear();
            this.undoStack = [];
            this.redoStack = [];
            this.deselectObject();
            this.deselectTrigger();

            // Применяем импортированные данные
            this.mapData = importedData;

            // Используем Promise-based загрузку
            this.importMapAsync(importedData).catch(error => {
                console.error("[MapEditor] Failed to import map async:", error);
            });

            return true;
        } catch (error) {
            console.error("[MapEditor] Failed to import map:", error);
            return false;
        }
    }

    /**
     * Load map data from external source
     */
    public loadMapData(data: MapData): void {
        this.mapData = data;
        this.updateUI();
    }

    /**
     * Асинхронный импорт карты с ожиданием готовности мешей
     */
    private async importMapAsync(importedData: MapData): Promise<void> {
        try {
            // Ожидаем готовности мешей террейна
            await this.waitForTerrainMeshes();

            // Применяем данные карты
            this.applyMapData();

            console.log(`[MapEditor] Map imported: ${importedData.name}`, {
                terrainEdits: importedData.terrainEdits.length,
                objects: importedData.placedObjects.length,
                triggers: importedData.triggers.length
            });
        } catch (error) {
            console.error("[MapEditor] Failed in importMapAsync:", error);
        }
    }

    /**
     * Асинхронная загрузка карты с ожиданием готовности мешей
     */
    private async loadMapAsync(mapName: string): Promise<void> {
        try {
            // Ожидаем готовности мешей террейна
            await this.waitForTerrainMeshes();

            // Применяем данные карты
            this.applyMapData();
            this.updateUI();
            this.showNotification(`Карта "${mapName}" загружена!`);

            console.log(`[MapEditor] Map loaded: ${mapName}`, {
                terrainEdits: this.mapData.terrainEdits.length,
                objects: this.mapData.placedObjects.length,
                triggers: this.mapData.triggers.length
            });
        } catch (error) {
            console.error("[MapEditor] Failed in loadMapAsync:", error);
            throw error;
        }
    }

    /**
     * Сохранить карту
     */
    saveMap(): void {
        // Создаем диалог для ввода имени карты
        const dialog = document.createElement("div");
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(5, 15, 5, 0.98);
            border: 2px solid #0f0;
            padding: 20px;
            z-index: 10003;
            min-width: 400px;
            max-width: 600px;
            font-family: 'Consolas', 'Monaco', monospace;
        `;

        dialog.innerHTML = `
            <div style="color: #0f0; font-size: 18px; margin-bottom: 15px; font-weight: bold;">
                Сохранить карту
            </div>
            <div style="margin-bottom: 15px;">
                <label style="color: #0f0; display: block; margin-bottom: 5px;">Имя карты:</label>
                <input type="text" id="save-map-name" value="${this.mapData.name}" style="
                    width: 100%;
                    padding: 8px;
                    background: rgba(0, 30, 0, 0.9);
                    border: 1px solid #0f0;
                    color: #0f0;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="save-map-cancel" style="
                    padding: 8px 20px;
                    background: rgba(50, 0, 0, 0.8);
                    border: 1px solid #f00;
                    color: #f00;
                    cursor: pointer;
                    font-family: 'Consolas', 'Monaco', monospace;
                ">Отмена</button>
                <button id="save-map-confirm" style="
                    padding: 8px 20px;
                    background: rgba(0, 50, 0, 0.8);
                    border: 1px solid #0f0;
                    color: #0f0;
                    cursor: pointer;
                    font-family: 'Consolas', 'Monaco', monospace;
                ">Сохранить</button>
            </div>
        `;

        document.body.appendChild(dialog);

        // Фокус на поле ввода
        const nameInput = dialog.querySelector("#save-map-name") as HTMLInputElement;
        if (nameInput) {
            nameInput.focus();
            nameInput.select();

            // Обработка Enter для сохранения
            nameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const confirmBtn = dialog.querySelector("#save-map-confirm") as HTMLButtonElement;
                    if (confirmBtn) confirmBtn.click();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    dialog.remove();
                }
            });
        }

        // Обработчик сохранения
        dialog.querySelector("#save-map-confirm")?.addEventListener("click", () => {
            const name = nameInput?.value?.trim() || "";
            if (!name) {
                this.showNotification("Имя карты не может быть пустым");
                return;
            }

            dialog.remove();
            this.performSave(name);
        });

        // Обработчик отмены
        dialog.querySelector("#save-map-cancel")?.addEventListener("click", () => {
            dialog.remove();
        });

        // Закрытие по клику вне диалога
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }

    /**
     * Выполнить сохранение карты
     */
    private performSave(name: string): void {
        try {
            // Очищаем имя от префикса "[Предустановленная]" если есть
            const cleanName = name.trim().replace(/^\[Предустановленная\]\s*/, "");
            this.mapData.name = cleanName;
            this.mapData.metadata.modifiedAt = Date.now();

            // Собираем все изменения террейна из текущих мешей
            this.collectTerrainModifications();

            // Удаляем дубликаты terrainEdits (слишком близкие по позиции)
            const uniqueTerrainEdits: TerrainEdit[] = [];
            const editThreshold = 0.5; // Минимальное расстояние между редактированиями

            for (const edit of this.mapData.terrainEdits) {
                const isDuplicate = uniqueTerrainEdits.some(existing => {
                    const dist = Math.sqrt(
                        Math.pow(existing.x - edit.x, 2) +
                        Math.pow(existing.z - edit.z, 2)
                    );
                    return dist < editThreshold && existing.operation === edit.operation;
                });

                if (!isDuplicate) {
                    uniqueTerrainEdits.push(edit);
                }
            }

            const savedMaps = this.loadSavedMaps();
            const mapIndex = savedMaps.findIndex(m => m.name === cleanName);

            const existingMap = mapIndex >= 0 ? savedMaps[mapIndex] : null;

            // Создаем копию mapData для сохранения в едином формате
            // КРИТИЧНО: При сохранении отредактированной предустановленной карты она становится пользовательской
            const saveData: MapData = {
                version: 1, // Версия формата
                name: cleanName, // Очищенное имя без префикса
                mapType: this.mapData.mapType || "normal", // ОБЯЗАТЕЛЬНО: всегда должен быть mapType (берем из текущей карты)
                terrainEdits: uniqueTerrainEdits.slice(-MAX_TERRAIN_EDITS), // Ограничиваем последними MAX_TERRAIN_EDITS редактированиями
                placedObjects: this.mapData.placedObjects || [],
                triggers: this.mapData.triggers || [],
                metadata: {
                    // При сохранении отредактированной предустановленной карты создаем новую дату создания
                    createdAt: existingMap?.metadata?.createdAt ?? Date.now(),
                    modifiedAt: Date.now(),
                    author: this.mapData.metadata?.author,
                    description: this.mapData.metadata?.description || `Карта типа ${this.mapData.mapType || "normal"}`,
                    isPreset: false // КРИТИЧНО: Сохраненные карты никогда не являются предустановленными, даже если были отредактированы из предустановленной
                }
            };

            // Сохраняем seed если есть
            if (this.mapData.seed !== undefined) {
                saveData.seed = this.mapData.seed;
            }

            // Сохраняем mapSize если есть в текущей карте
            if (this.mapData.metadata?.mapSize !== undefined) {
                saveData.metadata.mapSize = this.mapData.metadata.mapSize;
            }

            if (mapIndex >= 0) {
                // Обновляем существующую карту
                savedMaps[mapIndex] = saveData;
            } else {
                // Добавляем новую карту
                savedMaps.push(saveData);
            }

            localStorage.setItem("savedMaps", JSON.stringify(savedMaps));

            // Показываем уведомление в UI
            this.showNotification(`Карта "${name}" успешно сохранена!`);

            console.log(`[MapEditor] Map saved: ${name}`, {
                terrainEdits: saveData.terrainEdits.length,
                objects: saveData.placedObjects.length,
                triggers: saveData.triggers.length
            });
        } catch (error) {
            console.error("[MapEditor] Failed to save map:", error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.showNotification(`Ошибка при сохранении карты: ${errorMsg}`);
        }
    }

    /**
     * Собрать все модификации террейна из текущих мешей
     */
    private collectTerrainModifications(): void {
        // Собираем все изменения из heightData
        const collectedEdits: TerrainEdit[] = [];

        // Группируем изменения по областям для оптимизации
        const editGroups = new Map<string, { x: number, z: number, heights: number[], operations: TerrainOperation[] }>();

        this.heightData.forEach((height, key) => {
            const parts = key.split("_").map(Number);
            const x = parts[0];
            const z = parts[1];
            if (x === undefined || z === undefined || isNaN(x) || isNaN(z)) return;

            // Группируем по сетке 5x5 для уменьшения количества записей
            const gridX = Math.floor(x / 5) * 5;
            const gridZ = Math.floor(z / 5) * 5;
            const groupKey = `${gridX}_${gridZ}`;

            if (!editGroups.has(groupKey)) {
                editGroups.set(groupKey, { x: gridX, z: gridZ, heights: [], operations: [] });
            }

            const group = editGroups.get(groupKey)!;
            group.heights.push(height);

            // Находим соответствующую операцию из terrainEdits
            const relatedEdit = this.mapData.terrainEdits.find(e =>
                Math.abs(e.x - x) < 1 && Math.abs(e.z - z) < 1
            );
            if (relatedEdit) {
                if (!group.operations.includes(relatedEdit.operation)) {
                    group.operations.push(relatedEdit.operation);
                }
            }
        });

        // Создаем TerrainEdit для каждой группы
        editGroups.forEach((group, key) => {
            const avgHeight = group.heights.reduce((a, b) => a + b, 0) / group.heights.length;
            const operation = group.operations[0] || "raise";

            collectedEdits.push({
                x: group.x,
                z: group.z,
                height: avgHeight,
                radius: 5,
                operation: operation
            });
        });

        // Объединяем с существующими редактированиями
        this.mapData.terrainEdits = [...this.mapData.terrainEdits, ...collectedEdits];
    }

    /**
     * Загрузить карту
     */
    loadMap(): void {
        const savedMaps = this.loadSavedMaps();
        if (savedMaps.length === 0) {
            this.showNotification("Нет сохраненных карт");
            return;
        }

        // Создаем диалог выбора карты
        const dialog = document.createElement("div");
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(5, 15, 5, 0.98);
            border: 2px solid #0f0;
            padding: 20px;
            z-index: 10003;
            min-width: 400px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            font-family: 'Consolas', 'Monaco', monospace;
        `;

        dialog.innerHTML = `
            <div style="color: #0f0; font-size: 18px; margin-bottom: 15px; font-weight: bold;">
                Выберите карту для загрузки
            </div>
            <div id="map-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;">
                ${savedMaps.map((map, index) => `
                    <div style="
                        background: rgba(0, 30, 0, 0.8);
                        border: 1px solid #0f0;
                        padding: 10px;
                        cursor: pointer;
                        color: #0f0;
                        transition: background 0.2s;
                    " 
                    onmouseover="this.style.background='rgba(0, 50, 0, 0.9)'"
                    onmouseout="this.style.background='rgba(0, 30, 0, 0.8)'"
                    data-map-index="${index}">
                        <div style="font-weight: bold; margin-bottom: 5px;">${map.name}</div>
                        <div style="font-size: 11px; color: #0a0;">
                            Объектов: ${map.placedObjects.length} | 
                            Триггеров: ${map.triggers.length} | 
                            Редактирований: ${map.terrainEdits.length}
                        </div>
                        <div style="font-size: 10px; color: #080; margin-top: 5px;">
                            Изменено: ${new Date(map.metadata.modifiedAt).toLocaleString('ru-RU')}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="load-cancel" style="
                    padding: 8px 20px;
                    background: rgba(50, 0, 0, 0.8);
                    border: 1px solid #f00;
                    color: #f00;
                    cursor: pointer;
                    font-family: 'Consolas', 'Monaco', monospace;
                ">Отмена</button>
            </div>
        `;

        document.body.appendChild(dialog);

        // Обработчики событий
        const mapItems = dialog.querySelectorAll('[data-map-index]');
        mapItems.forEach(item => {
            item.addEventListener("click", () => {
                const index = parseInt(item.getAttribute("data-map-index") || "0");
                const map = savedMaps[index];
                if (map) {
                    // Подтверждение если есть несохраненные изменения
                    if (this.mapData.terrainEdits.length > 0 ||
                        this.mapData.placedObjects.length > 0 ||
                        this.mapData.triggers.length > 0) {
                        if (!confirm("Загрузить карту? Все несохраненные изменения будут потеряны.")) {
                            return;
                        }
                    }

                    this.mapData = JSON.parse(JSON.stringify(map)); // Глубокая копия
                    dialog.remove();

                    // Используем Promise-based загрузку
                    this.loadMapAsync(map.name).catch(error => {
                        console.error("[MapEditor] Failed to load map async:", error);
                        this.showNotification(`Ошибка загрузки карты`);
                    });
                }
            });
        });

        dialog.querySelector("#load-cancel")?.addEventListener("click", () => {
            dialog.remove();
        });

        // Закрытие по клику вне диалога
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
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

        // Восстанавливаем террейн к оригинальному состоянию
        // Это требует перезагрузки чанков, но для упрощения просто очищаем данные
        this.heightData.clear();
        this.originalHeights.clear();
        this.terrainEdits = [];

        // Сбрасываем стеки отмены/повтора
        this.undoStack = [];
        this.redoStack = [];

        // Снимаем выбор объекта
        this.deselectObject();

        // Создаем новую карту в едином формате
        this.mapData = {
            version: 1, // Версия формата
            name: `Map_${Date.now()}`,
            mapType: "normal", // ОБЯЗАТЕЛЬНО: базовый тип карты по умолчанию
            terrainEdits: [],
            placedObjects: [],
            triggers: [],
            metadata: {
                createdAt: Date.now(),
                modifiedAt: Date.now(),
                isPreset: false // Новая карта не является предустановленной
            }
        };

        // Обновляем UI
        this.updateUI();
        this.updateUndoRedoButtons();

        this.showNotification("Новая карта создана");
    }

    /**
     * Экспортировать карту в файл
     */
    private exportMapToFile(): void {
        try {
            // Собираем все изменения террейна перед экспортом
            this.collectTerrainModifications();

            const jsonData = this.exportMap();
            const blob = new Blob([jsonData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const fileName = `${this.mapData.name || "map"}_${Date.now()}.json`;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Показываем уведомление
            this.showNotification(`Карта экспортирована: ${fileName}`);

            console.log(`[MapEditor] Map exported: ${fileName}`, {
                size: jsonData.length,
                terrainEdits: this.mapData.terrainEdits.length,
                objects: this.mapData.placedObjects.length,
                triggers: this.mapData.triggers.length
            });
        } catch (error) {
            console.error("[MapEditor] Failed to export map:", error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            alert(`Ошибка при экспорте карты: ${errorMsg}`);
        }
    }

    /**
     * Импортировать карту из файла
     */
    private importMapFromFile(): void {
        // Предупреждение о потере несохраненных изменений
        if (this.mapData.terrainEdits.length > 0 ||
            this.mapData.placedObjects.length > 0 ||
            this.mapData.triggers.length > 0) {
            if (!confirm("Импортировать карту? Все несохраненные изменения будут потеряны.")) {
                return;
            }
        }

        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onerror = () => {
                alert("Ошибка при чтении файла");
            };
            reader.onload = (event) => {
                try {
                    const jsonData = event.target?.result as string;
                    if (!jsonData || jsonData.trim() === "") {
                        alert("Файл пуст или поврежден");
                        return;
                    }

                    if (this.importMap(jsonData)) {
                        this.showNotification(`Карта "${this.mapData.name}" успешно импортирована!`);
                        this.updateUI();
                        this.updateUndoRedoButtons();
                    } else {
                        alert("Ошибка при импорте карты: неверный формат данных");
                    }
                } catch (error) {
                    console.error("[MapEditor] Import error:", error);
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    alert(`Ошибка при импорте карты: ${errorMsg}`);
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
    /**
     * Нормализовать MapData к единому формату
     * Обеспечивает совместимость старых и новых форматов карт
     */
    private normalizeMapData(data: any): MapData | null {
        if (!data || typeof data !== "object" || !data.name) {
            return null;
        }

        // Текущая версия формата
        const CURRENT_VERSION = 1;

        // Создаем нормализованный объект
        const normalized: MapData = {
            version: CURRENT_VERSION,
            name: String(data.name),
            mapType: data.mapType || "normal", // ОБЯЗАТЕЛЬНО: всегда должен быть mapType
            terrainEdits: Array.isArray(data.terrainEdits) ? data.terrainEdits : [],
            placedObjects: Array.isArray(data.placedObjects) ? data.placedObjects : [],
            triggers: Array.isArray(data.triggers) ? data.triggers : [],
            metadata: {
                createdAt: data.metadata?.createdAt || Date.now(),
                modifiedAt: data.metadata?.modifiedAt || Date.now(),
                author: data.metadata?.author,
                description: data.metadata?.description,
                isPreset: data.metadata?.isPreset !== undefined ? data.metadata.isPreset : data.name.startsWith("[Предустановленная]"),
                mapSize: data.metadata?.mapSize
            }
        };

        // Сохраняем seed если есть
        if (data.seed !== undefined) {
            normalized.seed = data.seed;
        }

        return normalized;
    }

    private loadSavedMaps(): MapData[] {
        try {
            const saved = localStorage.getItem("savedMaps");
            if (saved) {
                const maps = JSON.parse(saved);
                if (Array.isArray(maps)) {
                    // Нормализуем все карты к единому формату
                    return maps.map(map => this.normalizeMapData(map)).filter((map): map is MapData => map !== null);
                }
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
        try {
            // Сначала собираем меши террейна, если они еще не собраны
            this.collectTerrainMeshes();

            // Удаляем существующие размещенные объекты
            this.placedObjectMeshes.forEach(mesh => mesh.dispose());
            this.placedObjectMeshes.clear();

            // Удаляем существующие триггеры
            this.triggerMeshes.forEach(mesh => mesh.dispose());
            this.triggerMeshes.clear();
            this.deselectTrigger();

            // Очищаем данные о высотах перед применением
            this.heightData.clear();
            this.originalHeights.clear();

            console.log(`[MapEditor] Applying map data: ${this.mapData.terrainEdits.length} terrain edits, ${this.mapData.placedObjects.length} objects, ${this.mapData.triggers.length} triggers`);
            // Убрано для уменьшения спама - логируем только если мешей > 0
            if (this.terrainMeshes.size > 0) {
                // Убрано для уменьшения спама - логируем только если мешей > 0
                if (this.terrainMeshes.size > 0) {
                    console.log(`[MapEditor] Found ${this.terrainMeshes.size} terrain meshes`);
                }
            }

            // Применить изменения террейна
            if (this.mapData.terrainEdits.length > 0) {
                // Применяем с небольшой задержкой, чтобы меши точно были готовы
                setTimeout(() => {
                    this.mapData.terrainEdits.forEach(edit => {
                        this.applyTerrainEdit(edit);
                    });
                    console.log(`[MapEditor] Applied ${this.mapData.terrainEdits.length} terrain edits`);
                }, 100);
            }

            // Разместить объекты
            this.mapData.placedObjects.forEach(obj => {
                try {
                    this.placeObject(obj);
                } catch (error) {
                    console.error(`[MapEditor] Failed to place object ${obj.id}:`, error);
                }
            });

            // Разместить триггеры
            this.mapData.triggers.forEach(trigger => {
                try {
                    this.createTriggerMesh(trigger);
                } catch (error) {
                    console.error(`[MapEditor] Failed to create trigger ${trigger.id}:`, error);
                }
            });

            // Обновляем UI
            this.updateUI();
        } catch (error) {
            console.error("[MapEditor] Failed to apply map data:", error);
        }
    }

    /**
     * Применить редактирование террейна
     */
    private applyTerrainEdit(edit: TerrainEdit): void {
        try {
            if (!edit || !isFinite(edit.x) || !isFinite(edit.z) || !isFinite(edit.height)) {
                console.warn("[MapEditor] Invalid terrain edit data:", edit);
                return;
            }

            const key = `${Math.floor(edit.x)}_${Math.floor(edit.z)}`;
            this.heightData.set(key, edit.height);

            // Если меши террейна еще не собраны, собираем их
            if (this.terrainMeshes.size === 0) {
                this.collectTerrainMeshes();
            }

            // Найти соответствующий меш и применить изменение
            let applied = false;
            this.terrainMeshes.forEach((mesh, chunkKey) => {
                try {
                    if (!mesh || !mesh.getBoundingInfo) return;

                    const meshBounds = mesh.getBoundingInfo();
                    const meshMin = meshBounds.minimum;
                    const meshMax = meshBounds.maximum;

                    // Проверяем, попадает ли точка редактирования в этот чанк
                    // Используем более широкий диапазон для учета радиуса
                    const radius = edit.radius || 5;
                    if (edit.x >= meshMin.x - radius && edit.x <= meshMax.x + radius &&
                        edit.z >= meshMin.z - radius && edit.z <= meshMax.z + radius) {
                        // Применяем изменение к вершинам в радиусе
                        // skipUndo = true, так как это применение сохраненных данных, а не новое редактирование
                        const editPoint = new Vector3(edit.x, edit.height, edit.z);
                        this.editTerrainAt(mesh, editPoint, radius, 1.0, true);
                        applied = true;
                    }
                } catch (error) {
                    console.error(`[MapEditor] Failed to apply terrain edit to mesh ${chunkKey}:`, error);
                }
            });

            if (!applied && this.terrainMeshes.size > 0) {
                console.warn(`[MapEditor] Terrain edit at (${edit.x}, ${edit.z}) was not applied to any mesh`);
            }
        } catch (error) {
            console.error("[MapEditor] Failed to apply terrain edit:", error);
        }
    }

    /**
     * Обработать выбор объекта
     */
    private handleObjectSelection(pointerInfo: any): void {
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
            return mesh.metadata && mesh.metadata.mapEditorObject === true;
        });

        if (pickInfo && pickInfo.pickedMesh && pickInfo.pickedMesh.metadata) {
            const objectId = pickInfo.pickedMesh.metadata.objectId;
            if (objectId) {
                this.selectObject(objectId);
            }
        } else {
            // Клик по пустому месту - снимаем выбор
            this.deselectObject();
        }
    }

    /**
     * Выбрать объект
     */
    private selectObject(objectId: string): void {
        if (this.selectedObjectId === objectId) return;

        this.selectedObjectId = objectId;
        this.updateObjectOutline();
        this.updatePropertiesPanel();
        this.updateUI();
    }

    /**
     * Снять выбор объекта
     */
    private deselectObject(): void {
        this.selectedObjectId = null;
        if (this.objectOutline) {
            this.objectOutline.dispose();
            this.objectOutline = null;
        }
        this.updatePropertiesPanel();
        this.updateUI();
    }

    /**
     * Обновить визуализацию выбранного объекта
     */
    private updateObjectOutline(): void {
        if (!this.selectedObjectId) {
            if (this.objectOutline) {
                this.objectOutline.dispose();
                this.objectOutline = null;
            }
            return;
        }

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        // Удаляем старый outline
        if (this.objectOutline) {
            this.objectOutline.dispose();
        }

        // Создаем новый outline - увеличиваем меш и делаем его прозрачным
        const bounds = mesh.getBoundingInfo();
        const size = bounds.boundingBox.maximumWorld.subtract(bounds.boundingBox.minimumWorld);

        this.objectOutline = MeshBuilder.CreateBox(`outline_${this.selectedObjectId}`, {
            width: size.x + 0.2,
            height: size.y + 0.2,
            depth: size.z + 0.2
        }, this.scene);

        this.objectOutline.position = mesh.position.clone();
        this.objectOutline.rotation = mesh.rotation.clone();

        const outlineMat = new StandardMaterial(`outlineMat_${this.selectedObjectId}`, this.scene);
        outlineMat.emissiveColor = new Color3(0, 1, 1);
        outlineMat.alpha = 0.3;
        outlineMat.wireframe = true;
        outlineMat.disableLighting = true;
        this.objectOutline.material = outlineMat;
        this.objectOutline.renderingGroupId = 3;
    }

    /**
     * Начать перетаскивание объекта
     */
    private startObjectDrag(pointerInfo: any): void {
        if (!this.selectedObjectId) {
            // Если объект не выбран, пытаемся выбрать
            this.handleObjectSelection(pointerInfo);
            if (!this.selectedObjectId) return;
        }

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        this.isDragging = true;
        this.dragStartPos = mesh.position.clone();
        this.dragStartMouse = { x: this.scene.pointerX, y: this.scene.pointerY };
    }

    /**
     * Обработать перетаскивание объекта
     */
    private handleObjectDrag(pointerInfo: any): void {
        if (!this.selectedObjectId || !this.dragStartPos || !this.dragStartMouse) return;

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        // Raycast для определения новой позиции на террейне
        const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => {
            return m instanceof GroundMesh && m.name.startsWith("ground_");
        });

        if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
            mesh.position = pickInfo.pickedPoint.clone();

            // Обновляем данные объекта
            const obj = this.mapData.placedObjects.find(o => o.id === this.selectedObjectId);
            if (obj) {
                obj.position = {
                    x: mesh.position.x,
                    y: mesh.position.y,
                    z: mesh.position.z
                };
            }

            // Обновляем outline
            if (this.objectOutline) {
                this.objectOutline.position = mesh.position.clone();
            }
        }
    }

    /**
     * Завершить перетаскивание объекта
     */
    private endObjectDrag(): void {
        this.isDragging = false;
        this.dragStartPos = null;
        this.dragStartMouse = null;
        this.mapData.metadata.modifiedAt = Date.now();
    }

    /**
     * Начать поворот объекта
     */
    private startObjectRotate(pointerInfo: any): void {
        if (!this.selectedObjectId) {
            // Если объект не выбран, пытаемся выбрать
            this.handleObjectSelection(pointerInfo);
            if (!this.selectedObjectId) return;
        }

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        this.isRotating = true;
        this.rotateStartAngle = mesh.rotation.y;
        this.dragStartMouse = { x: this.scene.pointerX, y: this.scene.pointerY };
    }

    /**
     * Обработать поворот объекта
     */
    private handleObjectRotate(pointerInfo: any): void {
        if (!this.selectedObjectId || !this.dragStartMouse) return;

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        // Вычисляем изменение угла на основе движения мыши по X
        const deltaX = this.scene.pointerX - this.dragStartMouse.x;
        const rotationSpeed = 0.01; // Скорость поворота
        const newAngle = this.rotateStartAngle + deltaX * rotationSpeed;

        mesh.rotation.y = newAngle;

        // Обновляем данные объекта
        const obj = this.mapData.placedObjects.find(o => o.id === this.selectedObjectId);
        if (obj) {
            if (!obj.rotation) obj.rotation = { x: 0, y: 0, z: 0 };
            obj.rotation.y = newAngle;
        }

        // Обновляем outline
        if (this.objectOutline) {
            this.objectOutline.rotation.y = newAngle;
        }
    }

    /**
     * Завершить поворот объекта
     */
    private endObjectRotate(): void {
        this.isRotating = false;
        this.rotateStartAngle = 0;
        this.dragStartMouse = null;
        this.mapData.metadata.modifiedAt = Date.now();
    }

    /**
     * Начать масштабирование объекта
     */
    private startObjectScale(pointerInfo: any): void {
        if (!this.selectedObjectId) {
            // Если объект не выбран, пытаемся выбрать
            this.handleObjectSelection(pointerInfo);
            if (!this.selectedObjectId) return;
        }

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        this.isScaling = true;
        // Используем среднее значение масштаба как начальное
        this.scaleStartValue = (mesh.scaling.x + mesh.scaling.y + mesh.scaling.z) / 3;
        this.scaleStartMouse = { x: this.scene.pointerX, y: this.scene.pointerY };
    }

    /**
     * Обработать масштабирование объекта
     */
    private handleObjectScale(pointerInfo: any): void {
        if (!this.selectedObjectId || !this.scaleStartMouse) return;

        const mesh = this.placedObjectMeshes.get(this.selectedObjectId);
        if (!mesh) return;

        // Вычисляем изменение масштаба на основе движения мыши по Y
        const deltaY = this.scene.pointerY - this.scaleStartMouse.y;
        const scaleSpeed = 0.01; // Скорость масштабирования
        const scaleFactor = 1 - deltaY * scaleSpeed; // Инвертируем для интуитивности
        const newScale = Math.max(0.1, Math.min(10, this.scaleStartValue * scaleFactor));

        // Применяем равномерное масштабирование
        mesh.scaling.x = newScale;
        mesh.scaling.y = newScale;
        mesh.scaling.z = newScale;

        // Обновляем данные объекта
        const obj = this.mapData.placedObjects.find(o => o.id === this.selectedObjectId);
        if (obj) {
            if (!obj.scale) obj.scale = { x: 1, y: 1, z: 1 };
            obj.scale.x = newScale;
            obj.scale.y = newScale;
            obj.scale.z = newScale;
        }

        // Обновляем outline
        this.updateObjectOutline();
    }

    /**
     * Завершить масштабирование объекта
     */
    private endObjectScale(): void {
        this.isScaling = false;
        this.scaleStartValue = 1;
        this.scaleStartMouse = null;
        this.mapData.metadata.modifiedAt = Date.now();
    }

    /**
     * Дублировать объект
     */
    private duplicateObject(objectId: string): void {
        try {
            if (!objectId) {
                console.warn("[MapEditor] Attempted to duplicate object with invalid ID");
                return;
            }

            const obj = this.mapData.placedObjects.find(o => o.id === objectId);
            if (!obj) {
                this.showNotification("Объект не найден");
                return;
            }

            const newId = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const duplicated: PlacedObject = {
                ...obj,
                id: newId,
                position: {
                    x: obj.position.x + 2,
                    y: obj.position.y,
                    z: obj.position.z + 2
                }
            };

            this.mapData.placedObjects.push(duplicated);
            this.createObjectMesh(duplicated);
            this.selectObject(newId);
            this.mapData.metadata.modifiedAt = Date.now();
            this.updateUI();
        } catch (error) {
            console.error("[MapEditor] Failed to duplicate object:", error);
            this.showNotification("Ошибка при дублировании объекта");
        }
    }

    /**
     * Обновить режим редактирования объектов
     */
    private updateObjectEditMode(): void {
        try {
            // При переключении режима снимаем выбор если нужно
            if (this.objectEditMode !== "select" && this.objectEditMode !== "move" &&
                this.objectEditMode !== "rotate" && this.objectEditMode !== "scale") {
                // Для режима place тоже снимаем выбор
                if (this.objectEditMode === "place") {
                    this.deselectObject();
                }
            }

            // Сбрасываем флаги операций при переключении режима
            if (this.isDragging) {
                this.endObjectDrag();
            }
            if (this.isRotating) {
                this.endObjectRotate();
            }
            if (this.isScaling) {
                this.endObjectScale();
            }
        } catch (error) {
            console.error("[MapEditor] Failed to update object edit mode:", error);
        }
    }

    /**
     * Обработать размещение объекта
     */
    private handleObjectPlacement(pointerInfo: any): void {
        try {
            const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                return mesh instanceof GroundMesh && mesh.name.startsWith("ground_");
            });

            if (!pickInfo || !pickInfo.hit || !pickInfo.pickedPoint) {
                this.showNotification("Не удалось определить позицию для размещения объекта");
                return;
            }

            const hitPoint = pickInfo.pickedPoint;

            // Валидация позиции
            if (!isFinite(hitPoint.x) || !isFinite(hitPoint.y) || !isFinite(hitPoint.z)) {
                console.warn("[MapEditor] Invalid position for object placement");
                return;
            }

            // Валидация типа объекта
            const validTypes = ["building", "tree", "rock", "spawn", "garage", "custom"];
            if (!validTypes.includes(this.selectedObjectType)) {
                console.warn(`[MapEditor] Invalid object type: ${this.selectedObjectType}`);
                this.selectedObjectType = "building"; // Используем значение по умолчанию
            }

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
            this.selectObject(objectId);
            this.mapData.metadata.modifiedAt = Date.now();
            this.updateUI();

            console.log("[MapEditor] Object placed:", placedObject);
        } catch (error) {
            console.error("[MapEditor] Failed to place object:", error);
            this.showNotification("Ошибка при размещении объекта");
        }
    }

    /**
     * Создать меш для объекта
     */
    private createObjectMesh(obj: PlacedObject): Mesh {
        try {
            if (!obj || !obj.id) {
                throw new Error("Invalid object data");
            }

            let mesh: Mesh;
            // Валидация позиции
            const posX = isFinite(obj.position.x) ? obj.position.x : 0;
            const posY = isFinite(obj.position.y) ? obj.position.y : 0;
            const posZ = isFinite(obj.position.z) ? obj.position.z : 0;
            const position = new Vector3(posX, posY, posZ);

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

            // Применяем поворот и масштаб если они есть
            if (obj.rotation) {
                mesh.rotation = new Vector3(obj.rotation.x, obj.rotation.y, obj.rotation.z);
            }
            if (obj.scale) {
                mesh.scaling = new Vector3(obj.scale.x, obj.scale.y, obj.scale.z);
            }

            mesh.metadata = { mapEditorObject: true, objectId: obj.id };

            this.placedObjectMeshes.set(obj.id, mesh);
            return mesh;
        } catch (error) {
            console.error("[MapEditor] Failed to create object mesh:", error);
            // Создаем простой меш по умолчанию в случае ошибки
            const defaultMesh = MeshBuilder.CreateBox(`error_${obj.id}`, { size: 1 }, this.scene);
            defaultMesh.position = new Vector3(obj.position.x || 0, obj.position.y || 0, obj.position.z || 0);
            defaultMesh.metadata = { mapEditorObject: true, objectId: obj.id };
            this.placedObjectMeshes.set(obj.id, defaultMesh);
            return defaultMesh;
        }
    }

    /**
     * Разместить объект (при загрузке карты)
     */
    private placeObject(obj: PlacedObject): void {
        const mesh = this.createObjectMesh(obj);

        // Применяем поворот и масштаб если они есть
        if (obj.rotation) {
            mesh.rotation = new Vector3(obj.rotation.x, obj.rotation.y, obj.rotation.z);
        }
        if (obj.scale) {
            mesh.scaling = new Vector3(obj.scale.x, obj.scale.y, obj.scale.z);
        }
    }

    /**
     * Удалить объект
     */
    private deleteObject(objectId: string): void {
        try {
            if (!objectId) {
                console.warn("[MapEditor] Attempted to delete object with invalid ID");
                return;
            }

            // Если удаляем выбранный объект, снимаем выбор
            if (this.selectedObjectId === objectId) {
                this.deselectObject();
            }

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

            this.updateUI();
        } catch (error) {
            console.error("[MapEditor] Failed to delete object:", error);
            this.showNotification("Ошибка при удалении объекта");
        }
    }

    /**
     * Обработать размещение триггера
     */
    private handleTriggerPlacement(pointerInfo: any): void {
        try {
            const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                return mesh instanceof GroundMesh && mesh.name.startsWith("ground_");
            });

            if (!pickInfo || !pickInfo.hit || !pickInfo.pickedPoint) {
                this.showNotification("Не удалось определить позицию для размещения триггера");
                return;
            }

            const hitPoint = pickInfo.pickedPoint;

            // Валидация позиции
            if (!isFinite(hitPoint.x) || !isFinite(hitPoint.y) || !isFinite(hitPoint.z)) {
                console.warn("[MapEditor] Invalid position for trigger placement");
                return;
            }

            // Валидация размера триггера
            const triggerSizeInput = this.container?.querySelector("#trigger-size") as HTMLInputElement;
            let triggerSize = parseFloat(triggerSizeInput?.value || "5");
            if (isNaN(triggerSize) || triggerSize < 1) {
                triggerSize = 5; // Значение по умолчанию
            }
            if (triggerSize > 20) {
                triggerSize = 20; // Максимальное значение
            }

            // Валидация типа триггера
            const validTypes = ["spawn", "teleport", "damage", "heal", "custom"];
            if (!validTypes.includes(this.selectedTriggerType)) {
                console.warn(`[MapEditor] Invalid trigger type: ${this.selectedTriggerType}`);
                this.selectedTriggerType = "spawn"; // Используем значение по умолчанию
            }

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
            this.updateUI();

            console.log("[MapEditor] Trigger placed:", trigger);
        } catch (error) {
            console.error("[MapEditor] Failed to place trigger:", error);
            this.showNotification("Ошибка при размещении триггера");
        }
    }

    /**
     * Создать визуализацию триггера
     */
    private createTriggerMesh(trigger: MapTrigger): Mesh {
        try {
            if (!trigger || !trigger.id) {
                throw new Error("Invalid trigger data");
            }

            // Валидация размера триггера
            const width = Math.max(0.1, Math.min(50, trigger.size.width || 5));
            const height = Math.max(0.1, Math.min(50, trigger.size.height || 2));
            const depth = Math.max(0.1, Math.min(50, trigger.size.depth || 5));

            // Валидация позиции
            const posX = isFinite(trigger.position.x) ? trigger.position.x : 0;
            const posY = isFinite(trigger.position.y) ? trigger.position.y : 0;
            const posZ = isFinite(trigger.position.z) ? trigger.position.z : 0;

            const position = new Vector3(posX, posY + 0.1, posZ);

            // Создаем прозрачный бокс для визуализации области триггера
            const mesh = MeshBuilder.CreateBox(`trigger_${trigger.id}`, {
                width: width,
                height: height,
                depth: depth
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
        } catch (error) {
            console.error("[MapEditor] Failed to create trigger mesh:", error);
            // Создаем простой меш по умолчанию в случае ошибки
            const defaultMesh = MeshBuilder.CreateBox(`error_trigger_${trigger.id}`, { size: 5 }, this.scene);
            defaultMesh.position = new Vector3(trigger.position.x || 0, trigger.position.y || 0, trigger.position.z || 0);
            defaultMesh.metadata = { mapEditorTrigger: true, triggerId: trigger.id };
            this.triggerMeshes.set(trigger.id, defaultMesh);
            return defaultMesh;
        }
    }

    /**
     * Удалить триггер
     */
    private deleteTrigger(triggerId: string): void {
        try {
            // Если удаляем выбранный триггер, снимаем выбор
            if (this.selectedTriggerId === triggerId) {
                this.deselectTrigger();
            }

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

            this.updateUI();
        } catch (error) {
            console.error("[MapEditor] Failed to delete trigger:", error);
            this.showNotification("Ошибка при удалении триггера");
        }
    }

    /**
     * Выбрать триггер
     */
    private selectTrigger(triggerId: string): void {
        if (this.selectedTriggerId === triggerId) return;

        // Снимаем выбор с объекта если был выбран
        if (this.selectedObjectId) {
            this.deselectObject();
        }

        this.selectedTriggerId = triggerId;
        this.updateTriggerOutline();
        this.updateUI();
    }

    /**
     * Снять выбор триггера
     */
    private deselectTrigger(): void {
        this.selectedTriggerId = null;
        if (this.triggerOutline) {
            this.triggerOutline.dispose();
            this.triggerOutline = null;
        }
        this.updateUI();
    }

    /**
     * Обновить визуализацию выбранного триггера
     */
    private updateTriggerOutline(): void {
        if (!this.selectedTriggerId) {
            if (this.triggerOutline) {
                this.triggerOutline.dispose();
                this.triggerOutline = null;
            }
            return;
        }

        const trigger = this.mapData.triggers.find(t => t.id === this.selectedTriggerId);
        if (!trigger) return;

        const mesh = this.triggerMeshes.get(this.selectedTriggerId);
        if (!mesh) return;

        // Удаляем старый outline
        if (this.triggerOutline) {
            this.triggerOutline.dispose();
        }

        // Создаем новый outline
        this.triggerOutline = MeshBuilder.CreateBox(`triggerOutline_${this.selectedTriggerId}`, {
            width: trigger.size.width + 0.2,
            height: trigger.size.height + 0.2,
            depth: trigger.size.depth + 0.2
        }, this.scene);

        this.triggerOutline.position = new Vector3(
            trigger.position.x,
            trigger.position.y + 0.1,
            trigger.position.z
        );

        const outlineMat = new StandardMaterial(`triggerOutlineMat_${this.selectedTriggerId}`, this.scene);
        outlineMat.emissiveColor = new Color3(1, 1, 0); // Желтый цвет для триггеров
        outlineMat.alpha = 0.3;
        outlineMat.wireframe = true;
        outlineMat.disableLighting = true;
        this.triggerOutline.material = outlineMat;
        this.triggerOutline.renderingGroupId = 3;
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
        try {
            // Отключить обработчик мыши
            if (this.pointerObserver) {
                this.scene.onPointerObservable.remove(this.pointerObserver);
                this.pointerObserver = null;
            }
            this.isMouseDown = false;
            this.isDragging = false;
            this.isRotating = false;
            this.isScaling = false;
            this.terrainMeshes.clear();

            // Удалить индикатор кисти
            if (this.brushIndicator) {
                this.brushIndicator.dispose();
                this.brushIndicator = null;
            }

            // Удалить outline выбранного объекта
            if (this.objectOutline) {
                this.objectOutline.dispose();
                this.objectOutline = null;
            }

            // Удалить outline выбранного триггера
            if (this.triggerOutline) {
                this.triggerOutline.dispose();
                this.triggerOutline = null;
            }

            this.selectedObjectId = null;
            this.selectedTriggerId = null;
            this.dragStartPos = null;
            this.dragStartMouse = null;
            this.scaleStartMouse = null;
            this.rotateStartAngle = 0;
            this.scaleStartValue = 1;

            // Очистить стеки отмены/повтора
            this.undoStack = [];
            this.redoStack = [];
        } catch (error) {
            console.error("[MapEditor] Error during cleanup:", error);
        }
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

    // ============================================
    // ПУБЛИЧНЫЕ МЕТОДЫ ДЛЯ РАБОТЫ БЕЗ UI
    // ============================================

    /**
     * Получить текущие данные карты
     */
    public getMapData(): MapData {
        return JSON.parse(JSON.stringify(this.mapData)); // Глубокая копия
    }

    /**
     * Установить данные карты без UI
     */
    public setMapData(data: MapData | any): void {
        // Валидация данных
        if (!data || typeof data !== 'object') {
            console.error("[MapEditor] setMapData: Invalid data provided");
            return;
        }

        // Нормализуем данные к единому формату
        const normalized = this.normalizeMapData(data);
        if (!normalized) {
            console.error("[MapEditor] setMapData: Failed to normalize data");
            return;
        }

        // Убеждаемся, что mapType всегда присутствует
        if (!normalized.mapType) {
            normalized.mapType = "normal";
            console.warn("[MapEditor] setMapData: Map data missing mapType, defaulting to 'normal'");
        }

        // КРИТИЧНО: В мультиплеере используем mapType с сервера, а не из сохраненной карты
        const gameInstance = (window as any).gameInstance;
        if (gameInstance) {
            const hasRoomId = gameInstance.multiplayerManager?.getRoomId();
            const hasPendingMapType = gameInstance.multiplayerManager?.getMapType();
            const isInMultiplayerRoom = gameInstance.isMultiplayer ||
                (gameInstance.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;
            if (isInMultiplayerRoom) {
                // Используем currentMapType или pendingMapType с сервера
                const serverMapType = gameInstance.currentMapType || hasPendingMapType;
                if (serverMapType && normalized.mapType !== serverMapType) {
                    console.log(`[MapEditor] 🗺️ Мультиплеер: заменяем mapType '${normalized.mapType}' на '${serverMapType}' с сервера`);
                    normalized.mapType = serverMapType;
                }
            }
        }

        this.mapData = JSON.parse(JSON.stringify(normalized)); // Глубокая копия нормализованных данных
        console.log(`[MapEditor] Map data set: ${this.mapData.name}`, {
            version: this.mapData.version,
            mapType: this.mapData.mapType,
            terrainEdits: this.mapData.terrainEdits.length,
            objects: this.mapData.placedObjects.length,
            triggers: this.mapData.triggers.length
        });
    }

    /**
     * Применить данные карты без открытия UI редактора
     * Используется для загрузки custom карт в игре
     */
    public async applyMapDataWithoutUI(): Promise<void> {
        // КРИТИЧНО: В мультиплеере не применяем сохраненную карту - все игроки должны видеть одинаковую карту с сервера
        const gameInstance = (window as any).gameInstance;
        if (gameInstance) {
            const hasRoomId = gameInstance.multiplayerManager?.getRoomId();
            const hasPendingMapType = gameInstance.multiplayerManager?.getMapType();
            const isInMultiplayerRoom = gameInstance.isMultiplayer ||
                (gameInstance.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;
            if (isInMultiplayerRoom) {
                console.log(`[MapEditor] 🗺️ Мультиплеер: применение сохраненной карты запрещено, используем карту с сервера (roomId=${hasRoomId || 'N/A'}, pendingMapType=${hasPendingMapType || 'N/A'})`);
                return;
            }
        }

        try {
            console.log(`[MapEditor] ===== Applying map data without UI =====`);
            console.log(`[MapEditor] Map name: ${this.mapData.name}`);
            console.log(`[MapEditor] Map type: ${this.mapData.mapType}`);

            // КРИТИЧНО: Сначала собираем меши террейна
            this.collectTerrainMeshes();

            // Ожидаем готовности мешей террейна (если их еще нет, ждем их появления)
            await this.waitForTerrainMeshes();

            // Повторно собираем меши после ожидания (они могли появиться)
            this.collectTerrainMeshes();

            // Логируем только финальный результат
            if (this.terrainMeshes.size > 0) {
                console.log(`[MapEditor] Terrain meshes ready: ${this.terrainMeshes.size} meshes`);
            }

            // Очищаем предыдущие данные
            this.placedObjectMeshes.forEach(mesh => mesh.dispose());
            this.placedObjectMeshes.clear();
            this.triggerMeshes.forEach(mesh => mesh.dispose());
            this.triggerMeshes.clear();
            this.heightData.clear();
            this.originalHeights.clear();

            console.log(`[MapEditor] Applying: ${this.mapData.terrainEdits.length} terrain edits, ${this.mapData.placedObjects.length} objects, ${this.mapData.triggers.length} triggers`);

            // Применяем изменения террейна
            for (const edit of this.mapData.terrainEdits) {
                this.applyTerrainEditAbsolute(edit);
            }

            // Размещаем объекты
            for (const obj of this.mapData.placedObjects) {
                try {
                    this.placeObject(obj);
                } catch (error) {
                    console.error(`[MapEditor] Failed to place object ${obj.id}:`, error);
                }
            }

            // Размещаем триггеры
            for (const trigger of this.mapData.triggers) {
                try {
                    this.createTriggerMesh(trigger);
                } catch (error) {
                    console.error(`[MapEditor] Failed to create trigger ${trigger.id}:`, error);
                }
            }

            console.log(`[MapEditor] Map data applied successfully without UI`);
        } catch (error) {
            console.error("[MapEditor] Failed to apply map data without UI:", error);
            throw error;
        }
    }

    /**
     * Ожидание готовности мешей террейна
     */
    private waitForTerrainMeshes(maxWaitMs: number = MESH_READY_TIMEOUT): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = MESH_CHECK_INTERVAL;

            const check = () => {
                this.collectTerrainMeshes();

                if (this.terrainMeshes.size > 0) {
                    console.log(`[MapEditor] Terrain meshes ready: ${this.terrainMeshes.size} meshes found`);
                    resolve();
                    return;
                }

                if (Date.now() - startTime > maxWaitMs) {
                    console.warn(`[MapEditor] Timeout waiting for terrain meshes after ${maxWaitMs}ms`);
                    resolve(); // Resolve anyway to not block, but log warning
                    return;
                }

                setTimeout(check, checkInterval);
            };

            check();
        });
    }

    /**
     * Применить редактирование террейна с абсолютной высотой
     * В отличие от editTerrainAt, устанавливает высоту напрямую, а не модифицирует
     */
    private applyTerrainEditAbsolute(edit: TerrainEdit): void {
        try {
            if (!edit || !isFinite(edit.x) || !isFinite(edit.z) || !isFinite(edit.height)) {
                console.warn("[MapEditor] Invalid terrain edit data:", edit);
                return;
            }

            const key = `${Math.floor(edit.x)}_${Math.floor(edit.z)}`;
            this.heightData.set(key, edit.height);

            // Находим соответствующий меш и устанавливаем высоту
            let applied = false;
            this.terrainMeshes.forEach((mesh, chunkKey) => {
                try {
                    if (!mesh || !mesh.getBoundingInfo) return;

                    const meshBounds = mesh.getBoundingInfo();
                    const meshMin = meshBounds.minimum;
                    const meshMax = meshBounds.maximum;

                    const radius = edit.radius || 5;
                    if (edit.x >= meshMin.x - radius && edit.x <= meshMax.x + radius &&
                        edit.z >= meshMin.z - radius && edit.z <= meshMax.z + radius) {

                        // Устанавливаем абсолютную высоту для вершин в радиусе
                        this.setTerrainHeightAt(mesh, edit.x, edit.z, edit.height, radius);
                        applied = true;
                    }
                } catch (error) {
                    console.error(`[MapEditor] Failed to apply terrain edit to mesh ${chunkKey}:`, error);
                }
            });

            if (!applied && this.terrainMeshes.size > 0) {
                // Не логируем каждый раз - слишком много сообщений
            }
        } catch (error) {
            console.error("[MapEditor] Failed to apply terrain edit:", error);
        }
    }

    /**
     * Установить абсолютную высоту террейна в указанной точке
     */
    private setTerrainHeightAt(mesh: GroundMesh, centerX: number, centerZ: number, targetHeight: number, radius: number): void {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions) return;

        let modified = false;

        for (let i = 0; i < positions.length; i += 3) {
            const vx = positions[i] ?? 0;
            const vy = positions[i + 1] ?? 0;
            const vz = positions[i + 2] ?? 0;

            const dx = vx - centerX;
            const dz = vz - centerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist <= radius) {
                const influence = 1.0 - (dist / radius);
                const smoothInfluence = influence * influence * (3 - 2 * influence);

                // Интерполируем к целевой высоте
                const newHeight = vy + (targetHeight - vy) * smoothInfluence;
                positions[i + 1] = newHeight;
                modified = true;
            }
        }

        if (modified) {
            mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true);
            mesh.refreshBoundingInfo();
            mesh.createNormals(true);
        }
    }
}

