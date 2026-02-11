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

    constructor(scene: Scene, getGroundHeight: (x: number, z: number) => number) {
        this.scene = scene;
        this.getGroundHeight = getGroundHeight;
        // this.createMaterials() is called locally when needed or here
    }

    // METHODS

    /**
     * Инициализация системы (для совместимости с Game)
     * @param mapData Данные карты (опционально)
     */
    public initialize(mapData?: any): void {
        this.clear();

        // Если есть данные карты с точками дропа, можно их загрузить
        if (mapData && mapData.supplyDropPoints) {
            // Логика загрузки точек будет добавлена позже при необходимости
            // Сейчас просто логируем факт инициализации
            logger.log(`[SupplyDropSystem] Initialized with map data`);
        } else {
            logger.log(`[SupplyDropSystem] Initialized (no map data)`);
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
        const chute = MeshBuilder.CreateDisc(`drop_chute_${dropId}`, { radius: 3, tessellation: 8 }, this.scene);
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
                // Вычисляем дистанцию падения за этот кадр
                const moveDist = drop.fallSpeed * deltaTime;
                let landed = false;
                let landY = drop.targetY;

                // ОПТИМИЗАЦИЯ: Raycast (CCD) запускаем только если мы близко к земле/цели (ближе 20 метров)
                // Это значительно снижает нагрузку на процессор при множестве дропов
                if (drop.position.y < drop.targetY + 20) {
                    // Continuous Collision Detection (CCD)
                    // Пускаем луч вниз от текущей позиции
                    const rayOrigin = drop.position.clone();
                    rayOrigin.y += 0.5;
                    const cursorRay = new Ray(rayOrigin, Vector3.Down(), moveDist + 1.0); // +1.0 запас

                    // Предикат для столкновения
                    const hit = this.scene.pickWithRay(cursorRay, (mesh) => {
                        return mesh.isVisible &&
                            mesh.isEnabled() &&
                            mesh.name !== "skyBox" &&
                            !mesh.name.startsWith("trigger_") &&
                            !mesh.name.includes("drop_") &&
                            !mesh.name.includes("projectile") &&
                            !mesh.isAnInstance;
                    });

                    // Если есть попадание и дистанция меньше шага движения - приземляемся
                    if (hit && hit.hit && hit.pickedPoint) {
                        const distToGround = hit.distance;
                        const realDistToGround = distToGround - 0.5;

                        if (realDistToGround <= moveDist) {
                            landed = true;
                            // Приземляемся на точку контакта + 1.0
                            landY = hit.pickedPoint.y + 1.0;
                        }
                    }
                }

                // FALLBACK & Basic Movement
                if (!landed) {
                    // Проверяем по targetY (если CCD не сработал или еще высоко)
                    if (drop.position.y - moveDist <= drop.targetY) {
                        landed = true;
                        landY = drop.targetY;
                    }
                }

                if (landed) {
                    drop.state = "landed";
                    drop.landedTime = now;
                    drop.position.y = landY;
                    drop.container.position.y = landY;
                    drop.container.rotation.set(0, 0, 0); // Сброс наклона

                    // Удалить парашют
                    if (drop.parachuteMesh) {
                        drop.parachuteMesh.dispose();
                        drop.parachuteMesh = null;

                        // NOTE: при желании можно вызвать effectsManager для эффекта приземления
                    }

                    logger.log(`[SupplyDrop] ${drop.type.id} landed at Y=${landY.toFixed(2)}`);
                } else {
                    // Продолжаем падать
                    drop.position.y -= moveDist;
                    drop.container.position.y = drop.position.y;

                    // Покачивание (только контейнер)
                    drop.swayPhase += deltaTime * 2;
                    const swayX = Math.sin(drop.swayPhase) * 0.5;
                    const swayZ = Math.cos(drop.swayPhase * 0.7) * 0.3;
                    drop.container.rotation.x = swayX * 0.1;
                    drop.container.rotation.z = swayZ * 0.1;

                    // Вращение парашюта отключено
                }

            } else if (drop.state === "landed") {
                // Анимация на земле (покачивание)
                drop.swayPhase += deltaTime * 3;
                const bobY = Math.sin(drop.swayPhase) * 0.05; // Уменьшена амплитуда бобинга (было 0.1)
                drop.boxMesh.position.y = bobY;

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
