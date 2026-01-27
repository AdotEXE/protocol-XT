/**
 * @module SupplyDropSystem
 * @description Система дропа припасов с парашютной анимацией
 * 
 * Функционал:
 * - Создание дропов с парашютной анимацией
 * - Загрузка точек дропа из редактора карт
 * - Автоматический спавн на картах без точек
 * - Подбор припасов игроком
 */

import {
    Scene,
    Mesh,
    MeshBuilder,
    Vector3,
    StandardMaterial,
    Color3,
    TransformNode,
    Animation,
    CubicEase,
    EasingFunction,
    ParticleSystem,
    Texture,
    Color4
} from "@babylonjs/core";
import { CONSUMABLE_TYPES, ConsumableType } from "./consumables";
import { nanoid } from "nanoid";

/**
 * Точка дропа (из редактора или случайная)
 */
export interface DropPoint {
    id: string;
    position: Vector3;
    types: string[];       // Какие типы могут упасть (пустой = все)
    respawnTime: number;   // Время до следующего дропа (ms)
    lastSpawnTime: number; // Когда последний раз упал дроп
    isActive: boolean;
}

/**
 * Активный дроп на карте
 */
export interface ActiveDrop {
    id: string;
    type: ConsumableType;
    container: TransformNode;  // Родительский узел
    boxMesh: Mesh;             // Коробка
    parachuteMesh: Mesh | null; // Парашют (null после приземления)
    state: "falling" | "landed" | "collected";
    position: Vector3;
    startY: number;            // Начальная высота падения
    targetY: number;           // Высота земли
    fallSpeed: number;         // Скорость падения
    landedTime: number;        // Когда приземлился
    despawnTime: number;       // Когда исчезнет если не подобрали (30 сек)
    swayPhase: number;         // Фаза покачивания
}

/**
 * Конфигурация системы дропов
 */
export interface DropSystemConfig {
    minSpawnInterval: number;  // Минимальный интервал между дропами (ms)
    maxSpawnInterval: number;  // Максимальный интервал
    despawnTime: number;       // Время до исчезновения (ms)
    fallSpeed: number;         // Скорость падения (units/sec)
    dropHeight: number;        // Высота падения над землей
    pickupRadius: number;      // Радиус подбора
    maxActiveDrops: number;    // Максимум активных дропов
    autoSpawnCount: number;    // Количество случайных точек если нет редакторных
}

const DEFAULT_CONFIG: DropSystemConfig = {
    minSpawnInterval: 20000,   // 20 сек
    maxSpawnInterval: 45000,   // 45 сек
    despawnTime: 30000,        // 30 сек
    fallSpeed: 8,              // 8 units/sec
    dropHeight: 80,            // 80 units над землей
    pickupRadius: 5,           // 5 units
    maxActiveDrops: 10,
    autoSpawnCount: 6          // 6 случайных точек
};

/**
 * SupplyDropSystem - Менеджер дропа припасов
 */
export class SupplyDropSystem {
    private scene: Scene;
    private config: DropSystemConfig;

    // Точки дропа
    private dropPoints: Map<string, DropPoint> = new Map();

    // Активные дропы
    private activeDrops: Map<string, ActiveDrop> = new Map();

    // Callback для получения высоты земли
    private getGroundHeight: (x: number, z: number) => number;

    // Callback для подбора
    private onPickupCallback: ((type: ConsumableType) => void) | null = null;

    // Таймеры
    private spawnCheckInterval: NodeJS.Timeout | null = null;
    private updateInterval: NodeJS.Timeout | null = null;

    // Материалы (кэш)
    private materials: Map<string, StandardMaterial> = new Map();
    private parachuteMaterial: StandardMaterial | null = null;

    constructor(
        scene: Scene,
        getGroundHeight: (x: number, z: number) => number,
        config: Partial<DropSystemConfig> = {}
    ) {
        this.scene = scene;
        this.getGroundHeight = getGroundHeight;
        this.config = { ...DEFAULT_CONFIG, ...config };

        this.createMaterials();
    }

    /**
     * Инициализировать систему с данными карты
     */
    initialize(mapData?: any, mapSize: number = 500): void {
        // Очистить предыдущее состояние
        this.clear();

        // Загрузить точки из редактора
        const editorPoints = mapData?.objects?.filter((o: any) => o.type === "drop_point") || [];

        if (editorPoints.length > 0) {
            console.log(`[SupplyDrop] Loading ${editorPoints.length} drop points from map editor`);
            this.loadDropPointsFromEditor(editorPoints);
        } else {
            console.log(`[SupplyDrop] No editor points, generating ${this.config.autoSpawnCount} random points`);
            this.generateRandomDropPoints(mapSize);
        }

        // Запустить проверку спавна
        this.startSpawnCheck();

        // Запустить обновление анимаций
        this.startUpdateLoop();
    }

    /**
     * Загрузить точки из редактора карт
     */
    private loadDropPointsFromEditor(editorPoints: any[]): void {
        for (const point of editorPoints) {
            const dropPoint: DropPoint = {
                id: point.id || nanoid(),
                position: new Vector3(
                    point.position?.x || point.x || 0,
                    point.position?.y || point.y || 0,
                    point.position?.z || point.z || 0
                ),
                types: point.dropTypes || [],
                respawnTime: point.dropRespawnTime || 30000,
                lastSpawnTime: 0,
                isActive: true
            };
            this.dropPoints.set(dropPoint.id, dropPoint);
        }
    }

    /**
     * Генерировать случайные точки дропа
     */
    private generateRandomDropPoints(mapSize: number): void {
        const count = this.config.autoSpawnCount;
        const margin = mapSize * 0.1; // 10% отступ от края

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * (mapSize - margin * 2);
            const z = (Math.random() - 0.5) * (mapSize - margin * 2);
            const y = this.getGroundHeight(x, z);

            const dropPoint: DropPoint = {
                id: `random_${i}_${nanoid(6)}`,
                position: new Vector3(x, y, z),
                types: [], // Любой тип
                respawnTime: this.config.minSpawnInterval +
                    Math.random() * (this.config.maxSpawnInterval - this.config.minSpawnInterval),
                lastSpawnTime: 0,
                isActive: true
            };
            this.dropPoints.set(dropPoint.id, dropPoint);
        }

        console.log(`[SupplyDrop] Generated ${count} random drop points`);
    }

    /**
     * Запустить проверку спавна
     */
    private startSpawnCheck(): void {
        this.spawnCheckInterval = setInterval(() => {
            this.checkAndSpawnDrops();
        }, 5000); // Проверять каждые 5 сек
    }

    /**
     * Проверить и заспавнить дропы
     */
    private checkAndSpawnDrops(): void {
        if (this.activeDrops.size >= this.config.maxActiveDrops) return;

        const now = Date.now();

        for (const [, point] of this.dropPoints) {
            if (!point.isActive) continue;

            // Проверить прошло ли достаточно времени
            if (now - point.lastSpawnTime >= point.respawnTime) {
                // Спавнить дроп
                this.spawnDrop(point);
                point.lastSpawnTime = now;

                // Проверить лимит
                if (this.activeDrops.size >= this.config.maxActiveDrops) break;
            }
        }
    }

    /**
     * Создать дроп в точке
     */
    spawnDrop(point: DropPoint, forceType?: string): ActiveDrop | null {
        // Выбрать тип припаса
        const type = this.selectDropType(point.types, forceType);
        if (!type) return null;

        const dropId = `drop_${nanoid(8)}`;

        // Позиция
        const groundY = point.position.y > 0 ? point.position.y :
            this.getGroundHeight(point.position.x, point.position.z);
        const startY = groundY + this.config.dropHeight;

        // Создать контейнер
        const container = new TransformNode(`drop_container_${dropId}`, this.scene);
        container.position.set(point.position.x, startY, point.position.z);

        // Создать коробку
        const boxMesh = this.createDropBox(dropId, type);
        boxMesh.parent = container;

        // Создать парашют
        const parachuteMesh = this.createParachute(dropId);
        parachuteMesh.parent = container;
        parachuteMesh.position.y = 3; // Над коробкой

        // Создать активный дроп
        const activeDrop: ActiveDrop = {
            id: dropId,
            type,
            container,
            boxMesh,
            parachuteMesh,
            state: "falling",
            position: new Vector3(point.position.x, startY, point.position.z),
            startY,
            targetY: groundY + 1.5, // Немного над землей
            fallSpeed: this.config.fallSpeed,
            landedTime: 0,
            despawnTime: this.config.despawnTime,
            swayPhase: Math.random() * Math.PI * 2
        };

        this.activeDrops.set(dropId, activeDrop);

        console.log(`[SupplyDrop] Spawned ${type.id} drop at (${point.position.x.toFixed(0)}, ${point.position.z.toFixed(0)})`);

        return activeDrop;
    }

    /**
     * Выбрать тип припаса
     */
    private selectDropType(allowedTypes: string[], forceType?: string): ConsumableType | null {
        if (forceType) {
            return CONSUMABLE_TYPES.find(t => t.id === forceType) || null;
        }

        const available = allowedTypes.length > 0
            ? CONSUMABLE_TYPES.filter(t => allowedTypes.includes(t.id))
            : CONSUMABLE_TYPES;

        if (available.length === 0) return null;

        return available[Math.floor(Math.random() * available.length)];
    }

    /**
     * Создать меш коробки
     */
    private createDropBox(id: string, type: ConsumableType): Mesh {
        const box = MeshBuilder.CreateBox(`drop_box_${id}`, {
            width: 2,
            height: 2,
            depth: 2
        }, this.scene);

        // Получить или создать материал
        let mat = this.materials.get(type.id);
        if (!mat) {
            mat = new StandardMaterial(`drop_mat_${type.id}`, this.scene);
            mat.diffuseColor = Color3.FromHexString(type.color);
            mat.emissiveColor = Color3.FromHexString(type.color).scale(0.3);
            mat.specularPower = 64;
            this.materials.set(type.id, mat);
        }
        box.material = mat;

        // Metadata для подбора
        box.metadata = {
            type: "supply_drop",
            dropId: id,
            consumableType: type.id
        };

        return box;
    }

    /**
     * Создать меш парашюта
     */
    private createParachute(id: string): Mesh {
        // Полусфера парашюта
        const parachute = MeshBuilder.CreateSphere(`parachute_${id}`, {
            diameter: 6,
            slice: 0.5,
            sideOrientation: Mesh.DOUBLESIDE
        }, this.scene);

        // Материал парашюта
        if (!this.parachuteMaterial) {
            this.parachuteMaterial = new StandardMaterial("parachute_mat", this.scene);
            this.parachuteMaterial.diffuseColor = new Color3(1, 0.3, 0.1); // Оранжевый
            this.parachuteMaterial.emissiveColor = new Color3(0.3, 0.1, 0);
            this.parachuteMaterial.backFaceCulling = false;
            this.parachuteMaterial.alpha = 0.9;
        }
        parachute.material = this.parachuteMaterial;

        // Стропы (4 линии)
        // В реальном проекте можно добавить LinesMesh для строп

        return parachute;
    }

    /**
     * Запустить обновление анимаций
     */
    private startUpdateLoop(): void {
        let lastTime = Date.now();

        this.updateInterval = setInterval(() => {
            const now = Date.now();
            const deltaTime = (now - lastTime) / 1000; // в секундах
            lastTime = now;

            this.updateDrops(deltaTime);
        }, 16); // ~60 FPS
    }

    /**
     * Обновить все дропы
     */
    private updateDrops(deltaTime: number): void {
        const now = Date.now();
        const toRemove: string[] = [];

        for (const [id, drop] of this.activeDrops) {
            if (drop.state === "falling") {
                // Анимация падения
                drop.position.y -= drop.fallSpeed * deltaTime;
                drop.container.position.y = drop.position.y;

                // Покачивание
                drop.swayPhase += deltaTime * 2;
                const swayX = Math.sin(drop.swayPhase) * 0.5;
                const swayZ = Math.cos(drop.swayPhase * 0.7) * 0.3;
                drop.container.rotation.x = swayX * 0.1;
                drop.container.rotation.z = swayZ * 0.1;

                // Вращение коробки
                drop.boxMesh.rotation.y += deltaTime * 2;

                // Вращение парашюта (в противоположную сторону)
                if (drop.parachuteMesh) {
                    drop.parachuteMesh.rotation.y -= deltaTime;
                }

                // Проверка приземления
                if (drop.position.y <= drop.targetY) {
                    drop.state = "landed";
                    drop.landedTime = now;
                    drop.position.y = drop.targetY;
                    drop.container.position.y = drop.targetY;
                    drop.container.rotation.set(0, 0, 0);

                    // Удалить парашют
                    if (drop.parachuteMesh) {
                        drop.parachuteMesh.dispose();
                        drop.parachuteMesh = null;
                    }

                    console.log(`[SupplyDrop] ${drop.type.id} landed`);
                }
            } else if (drop.state === "landed") {
                // Анимация на земле (покачивание)
                drop.swayPhase += deltaTime * 3;
                const bobY = Math.sin(drop.swayPhase) * 0.2;
                drop.boxMesh.position.y = bobY;
                drop.boxMesh.rotation.y += deltaTime;

                // Проверка исчезновения
                if (now - drop.landedTime >= drop.despawnTime) {
                    toRemove.push(id);
                }
            } else if (drop.state === "collected") {
                toRemove.push(id);
            }
        }

        // Удалить завершённые дропы
        for (const id of toRemove) {
            this.removeDrop(id);
        }
    }

    /**
     * Удалить дроп
     */
    private removeDrop(id: string): void {
        const drop = this.activeDrops.get(id);
        if (drop) {
            drop.boxMesh.dispose();
            drop.parachuteMesh?.dispose();
            drop.container.dispose();
            this.activeDrops.delete(id);
        }
    }

    /**
     * Проверить подбор припаса
     */
    checkPickup(tankPosition: Vector3): ConsumableType | null {
        for (const [id, drop] of this.activeDrops) {
            if (drop.state !== "landed") continue;

            const distance = Vector3.Distance(tankPosition, drop.position);
            if (distance <= this.config.pickupRadius) {
                drop.state = "collected";

                console.log(`[SupplyDrop] Picked up ${drop.type.id}`);

                // Callback
                if (this.onPickupCallback) {
                    this.onPickupCallback(drop.type);
                }

                return drop.type;
            }
        }

        return null;
    }

    /**
     * Установить callback подбора
     */
    setOnPickup(callback: (type: ConsumableType) => void): void {
        this.onPickupCallback = callback;
    }

    /**
     * Получить активные дропы
     */
    getActiveDrops(): ActiveDrop[] {
        return Array.from(this.activeDrops.values());
    }

    /**
     * Получить точки дропа
     */
    getDropPoints(): DropPoint[] {
        return Array.from(this.dropPoints.values());
    }

    /**
     * Создать материалы
     */
    private createMaterials(): void {
        // Материалы создаются лениво в createDropBox
    }

    /**
     * Очистить все дропы и точки
     */
    clear(): void {
        // Остановить таймеры
        if (this.spawnCheckInterval) {
            clearInterval(this.spawnCheckInterval);
            this.spawnCheckInterval = null;
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Удалить все активные дропы
        for (const [id] of this.activeDrops) {
            this.removeDrop(id);
        }
        this.activeDrops.clear();

        // Очистить точки
        this.dropPoints.clear();
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.clear();

        // Удалить материалы
        for (const [, mat] of this.materials) {
            mat.dispose();
        }
        this.materials.clear();

        this.parachuteMaterial?.dispose();
        this.parachuteMaterial = null;
    }
}

// Singleton instance
let _supplyDropInstance: SupplyDropSystem | null = null;

/**
 * Получить или создать экземпляр SupplyDropSystem
 */
export function getSupplyDropSystem(
    scene?: Scene,
    getGroundHeight?: (x: number, z: number) => number
): SupplyDropSystem | null {
    if (!_supplyDropInstance && scene && getGroundHeight) {
        _supplyDropInstance = new SupplyDropSystem(scene, getGroundHeight);
    }
    return _supplyDropInstance;
}

/**
 * Уничтожить экземпляр
 */
export function disposeSupplyDropSystem(): void {
    if (_supplyDropInstance) {
        _supplyDropInstance.dispose();
        _supplyDropInstance = null;
    }
}
