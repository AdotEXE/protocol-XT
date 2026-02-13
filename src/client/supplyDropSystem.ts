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
    Color4,
    Ray
} from "@babylonjs/core";
import { CONSUMABLE_TYPES, ConsumableType } from "./consumables";
import { nanoid } from "nanoid";
import { MAP_SIZES, isPositionInMapBounds, type MapType } from "./maps/MapConstants";
import { logger } from "./utils/logger";

// Interfaces
export interface DropPoint {
    id: string;
    position: Vector3;
    types: ConsumableType[];
}

export interface ActiveDrop {
    id: string;
    pointId: string;
    type: ConsumableType;
    container: TransformNode;
    boxMesh: Mesh;
    parachuteMesh: Mesh | null;
    state: "falling" | "landed" | "collected";
    position: Vector3;
    startY: number;
    targetY: number;
    fallSpeed: number;
    velocityY: number; // gravity-based fall
    landedTime: number;
    despawnTime: number;
    swayPhase: number;
}

export interface SupplyDropConfig {
    dropHeight: number;
    fallSpeed: number;
    despawnTime: number;
    pickupRadius: number;
}

export class SupplyDropSystem {
    private scene: Scene;
    private getGroundHeight: (x: number, z: number) => number;
    private activeDrops: Map<string, ActiveDrop> = new Map();
    private dropPoints: Map<string, DropPoint> = new Map();
    private materials: Map<string, StandardMaterial> = new Map();
    private parachuteMaterial: StandardMaterial | null = null;
    private onPickupCallback: ((type: ConsumableType) => void) | null = null;

    // Timers
    private spawnCheckInterval: any = null;
    private updateInterval: any = null;

    // Config default
    private config: SupplyDropConfig = {
        dropHeight: 100,
        fallSpeed: 5,
        despawnTime: 60000,
        pickupRadius: 3
    };

    /** Spawn interval in ms */
    private readonly SPAWN_INTERVAL_MS = 45000;
    private readonly GRAVITY = 15;
    private readonly MAX_FALL_SPEED = 28;

    constructor(scene: Scene, getGroundHeight: (x: number, z: number) => number) {
        this.scene = scene;
        this.getGroundHeight = getGroundHeight;
        // this.createMaterials() is called locally when needed or here
    }

    // METHODS

    /**
     * Инициализация системы (для совместимости с Game)
     * Загружает точки дропа из mapData.placedObjects (type === "drop_point").
     * Если точек нет — генерирует дефолтные по границам карты.
     * @param mapData Данные карты (опционально)
     */
    public initialize(mapData?: any): void {
        this.clear();

        const placedObjects = mapData?.placedObjects;
        if (Array.isArray(placedObjects)) {
            for (const obj of placedObjects as { id?: string; type?: string; position?: { x: number; y?: number; z: number }; properties?: { consumableTypes?: string[] } }[]) {
                if (obj.type !== "drop_point") continue;
                const id = obj.id || `drop_point_${nanoid(6)}`;
                if (!obj.position || typeof obj.position.x !== "number" || typeof obj.position.z !== "number") continue;
                const typeIds = obj.properties?.consumableTypes;
                const types = Array.isArray(typeIds) && typeIds.length > 0
                    ? typeIds.map(tid => CONSUMABLE_TYPES.find(ct => ct.id === tid)).filter((t): t is ConsumableType => t != null)
                    : CONSUMABLE_TYPES;
                if (types.length === 0) continue;
                const point: DropPoint = {
                    id,
                    position: new Vector3(obj.position.x, obj.position.y ?? 0, obj.position.z),
                    types
                };
                this.dropPoints.set(id, point);
            }
        }

        if (this.dropPoints.size === 0 && mapData) {
            const mapSize = (mapData.metadata as { mapSize?: number } | undefined)?.mapSize
                ?? (mapData as { mapSize?: number }).mapSize ?? 400;
            const half = mapSize / 2;
            const step = Math.max(80, mapSize / 5);
            for (let i = 0; i < 6; i++) {
                const x = (i % 2 === 0 ? -1 : 1) * (half * 0.4 + (i >> 1) * step * 0.5);
                const z = (i % 3 === 0 ? -1 : i % 3 === 1 ? 0 : 1) * (half * 0.35);
                const point: DropPoint = {
                    id: `default_drop_${i}`,
                    position: new Vector3(x, 0, z),
                    types: CONSUMABLE_TYPES
                };
                this.dropPoints.set(point.id, point);
            }
            logger.log(`[SupplyDropSystem] No drop_point objects on map — created ${this.dropPoints.size} default points`);
        }

        if (this.dropPoints.size > 0) {
            this.spawnCheckInterval = setInterval(() => {
                const points = this.getDropPoints();
                const empty = points.filter(p => !this.hasActiveDropAtPoint(p.id));
                if (empty.length === 0) return;
                const point = empty[Math.floor(Math.random() * empty.length)];
                this.spawnDrop(point);
            }, this.SPAWN_INTERVAL_MS);
            logger.log(`[SupplyDropSystem] Initialized with ${this.dropPoints.size} drop points, spawn every ${this.SPAWN_INTERVAL_MS / 1000}s`);
        } else {
            logger.log(`[SupplyDropSystem] Initialized (no drop points)`);
        }
    }

    /**
     * Получить высоту поверхности (земля или объект)
     */
    private getSurfaceHeight(x: number, z: number): number {
        // Базовая высота земли
        let surfaceY = this.getGroundHeight(x, z);

        // Пускаем луч сверху вниз чтобы найти объекты (здания, мосты)
        const origin = new Vector3(x, 500, z);
        const direction = new Vector3(0, -1, 0);
        const ray = new Ray(origin, direction, 1000);

        const hit = this.scene.pickWithRay(ray, (mesh) => {
            // Игнорируем скайбоксы, триггеры и невидимые меши
            return mesh.isVisible &&
                mesh.isEnabled() &&
                mesh.name !== "skyBox" &&
                !mesh.name.startsWith("trigger_") &&
                !mesh.name.includes("drop_"); // Не попадать в другие дропы
        });

        if (hit && hit.hit && hit.pickedPoint) {
            // Если нашли объект выше земли, используем его высоту
            if (hit.pickedPoint.y > surfaceY) {
                surfaceY = hit.pickedPoint.y;
            }
        }

        return surfaceY;
    }

    // [Opus 4.6] Added missing methods that spawnDrop depends on

    /**
     * Check if there's already an active drop at a given point
     */
    private hasActiveDropAtPoint(pointId: string): boolean {
        for (const drop of this.activeDrops.values()) {
            if (drop.pointId === pointId && drop.state !== "collected") {
                return true;
            }
        }
        return false;
    }

    /**
     * Select a drop type from available types
     */
    private selectDropType(types: ConsumableType[], forceType?: string): ConsumableType | null {
        if (forceType) {
            const forced = types.find(t => t.id === forceType);
            if (forced) return forced;
        }
        if (types.length === 0) return null;
        return types[Math.floor(Math.random() * types.length)] ?? null;
    }

    /**
     * Create a supply drop box mesh
     */
    private createDropBox(dropId: string, type: ConsumableType): Mesh {
        const box = MeshBuilder.CreateBox(`drop_box_${dropId}`, { size: 2 }, this.scene);

        let mat = this.materials.get(type.id);
        if (!mat) {
            mat = new StandardMaterial(`drop_mat_${type.id}`, this.scene);
            mat.diffuseColor = new Color3(0.4, 0.6, 0.2);
            mat.specularColor = new Color3(0.1, 0.1, 0.1);
            this.materials.set(type.id, mat);
        }
        box.material = mat;
        return box;
    }

    /**
     * Create a parachute mesh
     */
    private createParachute(dropId: string): Mesh {
        const chute = MeshBuilder.CreateBox(`drop_chute_${dropId}`, { width: 6, height: 0.01, depth: 6 }, this.scene);
        chute.rotation.x = Math.PI; // Face downward

        if (!this.parachuteMaterial) {
            this.parachuteMaterial = new StandardMaterial("parachute_mat", this.scene);
            this.parachuteMaterial.diffuseColor = new Color3(0.9, 0.9, 0.9);
            this.parachuteMaterial.alpha = 0.8;
            this.parachuteMaterial.backFaceCulling = false;
        }
        chute.material = this.parachuteMaterial;
        return chute;
    }

    spawnDrop(point: DropPoint, forceType?: string): ActiveDrop | null {
        // КРИТИЧНО: Проверяем есть ли уже дроп на этой точке
        if (this.hasActiveDropAtPoint(point.id)) {
            logger.log(`[SupplyDrop] Skipping spawn - point ${point.id} already has active drop`);
            return null;
        }

        // Выбрать тип припаса
        const type = this.selectDropType(point.types, forceType);
        if (!type) return null;

        const dropId = `drop_${nanoid(8)}`;

        // Позиция - используем Raycast для поиска реальной поверхности (крыши, мосты)
        const groundY = this.getSurfaceHeight(point.position.x, point.position.z);

        // SAFETY: Abort if ground height is invalid (void/safety plane)
        if (groundY < -5) {
            // console.warn(`[SupplyDrop] Aborting spawn: invalid ground height ${groundY}`);
            return null;
        }

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
            pointId: point.id,  // Сохраняем ID точки для предотвращения стакания
            type,
            container,
            boxMesh,
            parachuteMesh,
            state: "falling",
            position: new Vector3(point.position.x, startY, point.position.z),
            startY,
            targetY: groundY + 1.0, // FIX: Приземляемся точно на поверхность (центр куба высотой 2 = y+1)
            fallSpeed: this.config.fallSpeed,
            velocityY: 0,
            landedTime: 0,
            despawnTime: this.config.despawnTime,
            swayPhase: Math.random() * Math.PI * 2
        };

        this.activeDrops.set(dropId, activeDrop);

        logger.log(`[SupplyDrop] Spawned ${type.id} drop at (${point.position.x.toFixed(0)}, ${point.position.z.toFixed(0)}), targetY: ${groundY.toFixed(1)}`);

        return activeDrop;
    }

    /**
     * Update drop states
     */
    public update(deltaTime: number): void {
        const now = Date.now();
        const toRemove: string[] = [];

        for (const [id, drop] of this.activeDrops) {

            if (drop.state === "falling") {
                // Гравитация: ускорение вниз, лимит скорости
                drop.velocityY += this.GRAVITY * deltaTime;
                if (drop.velocityY > this.MAX_FALL_SPEED) drop.velocityY = this.MAX_FALL_SPEED;
                const moveDist = drop.velocityY * deltaTime;
                let landed = false;
                let landY = drop.targetY;

                // ОПТИМИЗАЦИЯ: Raycast (CCD) запускаем только если мы близко к земле/цели (ближе 20 метров)
                if (drop.position.y < drop.targetY + 20) {
                    const rayOrigin = drop.position.clone();
                    rayOrigin.y += 0.5;
                    const cursorRay = new Ray(rayOrigin, Vector3.Down(), moveDist + 1.0);

                    const hit = this.scene.pickWithRay(cursorRay, (mesh) => {
                        return mesh.isVisible &&
                            mesh.isEnabled() &&
                            mesh.name !== "skyBox" &&
                            !mesh.name.startsWith("trigger_") &&
                            !mesh.name.includes("drop_") &&
                            !mesh.name.includes("projectile") &&
                            !mesh.isAnInstance;
                    });

                    if (hit && hit.hit && hit.pickedPoint) {
                        const distToGround = hit.distance;
                        const realDistToGround = distToGround - 0.5;
                        if (realDistToGround <= moveDist) {
                            landed = true;
                            landY = hit.pickedPoint.y + 1.0;
                        }
                    }
                }

                if (!landed && drop.position.y - moveDist <= drop.targetY) {
                    landed = true;
                    landY = drop.targetY;
                }

                if (landed) {
                    drop.state = "landed";
                    drop.landedTime = now;
                    drop.velocityY = 0;
                    drop.position.y = landY;
                    drop.container.position.y = landY;
                    drop.container.rotation.set(0, 0, 0);

                    if (drop.parachuteMesh) {
                        drop.parachuteMesh.dispose();
                        drop.parachuteMesh = null;
                    }

                    logger.log(`[SupplyDrop] ${drop.type.id} landed at Y=${landY.toFixed(2)}`);
                } else {
                    drop.position.y -= moveDist;
                    drop.container.position.y = drop.position.y;
                    // Дропы не крутятся — rotation не меняем
                }

            } else if (drop.state === "landed") {
                // Статичный ящик на земле — боб убран
                drop.boxMesh.position.y = 0;

                // Проверка исчезновения
                if (now - drop.landedTime >= drop.despawnTime) {
                    toRemove.push(id);
                }
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
            // Проверяем только приземлённые дропы (не падающие)
            if (drop.state !== "landed") continue;

            const distance = Vector3.Distance(tankPosition, drop.position);
            if (distance <= this.config.pickupRadius) {
                // Помечаем как собранный
                drop.state = "collected";

                logger.log(`[SupplyDrop] Picked up ${drop.type.id}`);

                // Вызываем callback для добавления в инвентарь
                if (this.onPickupCallback) {
                    this.onPickupCallback(drop.type);
                }

                // Сразу удаляем дроп визуально
                this.removeDrop(id);

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
