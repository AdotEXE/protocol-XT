/**
 * @module ai/AIPathfinding
 * @description Система навигации и поиска пути для AI
 */

import { Vector3, Scene, Ray } from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Точка пути
 */
export interface PathNode {
    position: Vector3;
    cost: number;       // Стоимость достижения
    heuristic: number;  // Эвристическая оценка до цели
    parent: PathNode | null;
    isRoad: boolean;    // Находится ли на дороге
    isBlocked: boolean; // Заблокирована ли точка
}

/**
 * Результат поиска пути
 */
export interface PathResult {
    path: Vector3[];
    cost: number;
    found: boolean;
}

/**
 * Конфигурация навигации
 */
export interface PathfindingConfig {
    gridSize: number;       // Размер ячейки сетки
    maxNodes: number;       // Максимум нод для поиска
    roadBonus: number;      // Бонус за движение по дороге (0-1)
    obstacleCheckRadius: number;
    maxPathLength: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_PATHFINDING_CONFIG: PathfindingConfig = {
    gridSize: 10,
    maxNodes: 500,
    roadBonus: 0.3,
    obstacleCheckRadius: 3,
    maxPathLength: 50
};

/**
 * AIPathfinding - Поиск пути для AI
 * 
 * Использует упрощённый A* для нахождения пути с учётом:
 * - Дорог (бонус к скорости)
 * - Препятствий (raycast проверка)
 * - Укрытий (для тактических целей)
 */
export class AIPathfinding {
    private scene: Scene;
    private config: PathfindingConfig;
    
    // Кэш проверок препятствий
    private obstacleCache: Map<string, { blocked: boolean; time: number }> = new Map();
    private readonly CACHE_LIFETIME = 5000; // 5 секунд
    
    // Ссылка на систему дорог (опционально)
    private roadNetwork: { isOnRoad: (x: number, z: number) => boolean } | null = null;
    
    // Референсная позиция для оптимизации (позиция игрока/камеры)
    private referencePosition: Vector3 | null = null;
    
    constructor(scene: Scene, config: Partial<PathfindingConfig> = {}) {
        this.scene = scene;
        this.config = { ...DEFAULT_PATHFINDING_CONFIG, ...config };
    }
    
    /**
     * Установка системы дорог
     */
    setRoadNetwork(roadNetwork: { isOnRoad: (x: number, z: number) => boolean }): void {
        this.roadNetwork = roadNetwork;
    }
    
    /**
     * Установка референсной позиции (для оптимизации)
     */
    setReferencePosition(position: Vector3): void {
        this.referencePosition = position.clone();
    }
    
    /**
     * Найти путь от start до goal
     */
    findPath(start: Vector3, goal: Vector3): PathResult {
        const startTime = Date.now();
        
        // Проверяем прямую видимость
        if (this.hasDirectPath(start, goal)) {
            return {
                path: [start.clone(), goal.clone()],
                cost: Vector3.Distance(start, goal),
                found: true
            };
        }
        
        // Используем A* для поиска пути
        const openSet: PathNode[] = [];
        const closedSet: Set<string> = new Set();
        
        const startNode = this.createNode(start, goal, null);
        openSet.push(startNode);
        
        let iterations = 0;
        
        while (openSet.length > 0 && iterations < this.config.maxNodes) {
            iterations++;
            
            // Находим ноду с минимальной стоимостью
            openSet.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
            const current = openSet.shift()!;
            
            const currentKey = this.positionToKey(current.position);
            if (closedSet.has(currentKey)) continue;
            closedSet.add(currentKey);
            
            // Проверяем достижение цели
            if (Vector3.Distance(current.position, goal) < this.config.gridSize * 1.5) {
                const path = this.reconstructPath(current, goal);
                logger.debug(`[AIPathfinding] Path found in ${iterations} iterations, ${Date.now() - startTime}ms`);
                return {
                    path,
                    cost: current.cost,
                    found: true
                };
            }
            
            // Генерируем соседей
            const neighbors = this.getNeighbors(current, goal);
            for (const neighbor of neighbors) {
                const neighborKey = this.positionToKey(neighbor.position);
                if (closedSet.has(neighborKey)) continue;
                if (neighbor.isBlocked) continue;
                
                // Проверяем есть ли уже в openSet с меньшей стоимостью
                const existingIndex = openSet.findIndex(n => 
                    this.positionToKey(n.position) === neighborKey
                );
                
                if (existingIndex >= 0) {
                    const existing = openSet[existingIndex];
                    if (existing && neighbor.cost < existing.cost) {
                        openSet[existingIndex] = neighbor;
                    }
                } else {
                    openSet.push(neighbor);
                }
            }
        }
        
        // Путь не найден - возвращаем частичный путь к ближайшей достигнутой точке
        logger.debug(`[AIPathfinding] Path not found after ${iterations} iterations`);
        return {
            path: [start.clone()],
            cost: Infinity,
            found: false
        };
    }
    
    /**
     * Найти ближайшее укрытие от угрозы
     */
    findCover(position: Vector3, threatPosition: Vector3, maxDistance: number = 30): Vector3 | null {
        const threatDir = position.subtract(threatPosition);
        threatDir.y = 0;
        threatDir.normalize();
        
        // Ищем точку, которая блокирует линию видимости от угрозы
        const directions = [
            threatDir.clone(),                                           // За спиной
            new Vector3(threatDir.z, 0, -threatDir.x),                   // Справа
            new Vector3(-threatDir.z, 0, threatDir.x),                   // Слева
            threatDir.clone().add(new Vector3(threatDir.z, 0, -threatDir.x).scale(0.5)).normalize(), // Диагональ
            threatDir.clone().add(new Vector3(-threatDir.z, 0, threatDir.x).scale(0.5)).normalize()  // Диагональ
        ];
        
        for (const dir of directions) {
            for (let dist = 10; dist <= maxDistance; dist += 5) {
                const testPos = position.add(dir.scale(dist));
                
                // Проверяем, блокирует ли это место линию видимости
                if (this.isBlocked(threatPosition, testPos) && !this.isBlocked(position, testPos)) {
                    // Проверяем проходимость
                    if (!this.checkObstacle(testPos)) {
                        return testPos;
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Найти точку для фланга
     */
    findFlankPosition(myPosition: Vector3, targetPosition: Vector3, flankSide: number = 1): Vector3 | null {
        const toTarget = targetPosition.subtract(myPosition);
        toTarget.y = 0;
        const distance = toTarget.length();
        toTarget.normalize();
        
        // Перпендикулярное направление
        const perpendicular = new Vector3(toTarget.z * flankSide, 0, -toTarget.x * flankSide);
        
        // Ищем точку на фланге
        const flankDistance = Math.min(30, distance * 0.5);
        const flankPos = myPosition.add(perpendicular.scale(flankDistance));
        
        // Проверяем проходимость
        if (!this.checkObstacle(flankPos) && this.hasDirectPath(myPosition, flankPos)) {
            return flankPos;
        }
        
        // Если прямой путь заблокирован, ищем альтернативу
        for (let angle = 0.2; angle < Math.PI / 2; angle += 0.2) {
            const rotatedDir = this.rotateVector(perpendicular, angle);
            const testPos = myPosition.add(rotatedDir.scale(flankDistance));
            
            if (!this.checkObstacle(testPos) && this.hasDirectPath(myPosition, testPos)) {
                return testPos;
            }
            
            const rotatedDirNeg = this.rotateVector(perpendicular, -angle);
            const testPosNeg = myPosition.add(rotatedDirNeg.scale(flankDistance));
            
            if (!this.checkObstacle(testPosNeg) && this.hasDirectPath(myPosition, testPosNeg)) {
                return testPosNeg;
            }
        }
        
        return null;
    }
    
    /**
     * Проверка прямой видимости между точками
     */
    hasDirectPath(from: Vector3, to: Vector3): boolean {
        const direction = to.subtract(from);
        const distance = direction.length();
        direction.normalize();
        
        const ray = new Ray(from.add(new Vector3(0, 0.5, 0)), direction, distance);
        
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            
            // Игнорируем танки и пули
            if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" || 
                meta.type === "bullet" || meta.type === "enemyBullet" || meta.type === "consumable")) {
                return false;
            }
            
            // Игнорируем UI элементы
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
            
            return mesh.isPickable;
        });
        
        return !hit || !hit.hit || hit.distance >= distance * 0.95;
    }
    
    /**
     * Проверка заблокированности линии видимости
     */
    isBlocked(from: Vector3, to: Vector3): boolean {
        return !this.hasDirectPath(from, to);
    }
    
    /**
     * Создание ноды
     */
    private createNode(position: Vector3, goal: Vector3, parent: PathNode | null): PathNode {
        const cost = parent 
            ? parent.cost + Vector3.Distance(parent.position, position)
            : 0;
        
        const heuristic = Vector3.Distance(position, goal);
        const isRoad = this.roadNetwork?.isOnRoad(position.x, position.z) ?? false;
        const isBlocked = this.checkObstacle(position);
        
        // Бонус за дорогу
        const roadModifier = isRoad ? (1 - this.config.roadBonus) : 1;
        
        return {
            position: position.clone(),
            cost: cost * roadModifier,
            heuristic,
            parent,
            isRoad,
            isBlocked
        };
    }
    
    /**
     * Получение соседних нод
     */
    private getNeighbors(node: PathNode, goal: Vector3): PathNode[] {
        const neighbors: PathNode[] = [];
        const gridSize = this.config.gridSize;
        
        // 8 направлений
        const directions = [
            new Vector3(gridSize, 0, 0),
            new Vector3(-gridSize, 0, 0),
            new Vector3(0, 0, gridSize),
            new Vector3(0, 0, -gridSize),
            new Vector3(gridSize, 0, gridSize),
            new Vector3(-gridSize, 0, gridSize),
            new Vector3(gridSize, 0, -gridSize),
            new Vector3(-gridSize, 0, -gridSize)
        ];
        
        for (const dir of directions) {
            const newPos = node.position.add(dir);
            neighbors.push(this.createNode(newPos, goal, node));
        }
        
        return neighbors;
    }
    
    /**
     * Восстановление пути из ноды
     */
    private reconstructPath(endNode: PathNode, goal: Vector3): Vector3[] {
        const path: Vector3[] = [];
        let current: PathNode | null = endNode;
        
        while (current !== null) {
            path.unshift(current.position.clone());
            current = current.parent;
        }
        
        // Добавляем цель если не совпадает
        const lastPathPoint = path[path.length - 1];
        if (path.length === 0 || !lastPathPoint || Vector3.Distance(lastPathPoint, goal) > 1) {
            path.push(goal.clone());
        }
        
        // Оптимизация: удаляем лишние точки на прямой линии
        return this.smoothPath(path);
    }
    
    /**
     * Сглаживание пути (удаление лишних точек)
     */
    private smoothPath(path: Vector3[]): Vector3[] {
        if (path.length <= 2) return path;
        
        const firstPoint = path[0];
        if (!firstPoint) return path;
        
        const smoothed: Vector3[] = [firstPoint];
        let current = 0;
        
        while (current < path.length - 1) {
            // Ищем самую дальнюю точку с прямой видимостью
            let farthest = current + 1;
            
            const currentPoint = path[current];
            if (!currentPoint) break;
            
            for (let i = path.length - 1; i > current + 1; i--) {
                const checkPoint = path[i];
                if (checkPoint && this.hasDirectPath(currentPoint, checkPoint)) {
                    farthest = i;
                    break;
                }
            }
            
            const farthestPoint = path[farthest];
            if (farthestPoint) {
                smoothed.push(farthestPoint);
            }
            current = farthest;
        }
        
        return smoothed;
    }
    
    /**
     * Проверка препятствия в точке
     */
    private checkObstacle(position: Vector3): boolean {
        const key = this.positionToKey(position);
        const now = Date.now();
        
        // Проверяем кэш
        const cached = this.obstacleCache.get(key);
        if (cached && now - cached.time < this.CACHE_LIFETIME) {
            return cached.blocked;
        }
        
        // Raycast вниз для проверки
        const ray = new Ray(position.add(new Vector3(0, 10, 0)), new Vector3(0, -1, 0), 20);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            
            // Ищем препятствия (здания, стены)
            if (meta && meta.type === "building") return true;
            if (mesh.name.includes("wall") || mesh.name.includes("building")) return true;
            
            return false;
        });
        
        const blocked = hit?.hit ?? false;
        
        // Сохраняем в кэш
        this.obstacleCache.set(key, { blocked, time: now });
        
        // Очистка старого кэша
        if (this.obstacleCache.size > 1000) {
            this.cleanCache();
        }
        
        return blocked;
    }
    
    /**
     * Ключ для позиции
     */
    private positionToKey(position: Vector3): string {
        const x = Math.floor(position.x / this.config.gridSize);
        const z = Math.floor(position.z / this.config.gridSize);
        return `${x},${z}`;
    }
    
    /**
     * Поворот вектора на угол
     */
    private rotateVector(vector: Vector3, angle: number): Vector3 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector3(
            vector.x * cos - vector.z * sin,
            0,
            vector.x * sin + vector.z * cos
        );
    }
    
    /**
     * Очистка старого кэша
     */
    private cleanCache(): void {
        const now = Date.now();
        const toDelete: string[] = [];
        
        for (const [key, value] of this.obstacleCache) {
            if (now - value.time > this.CACHE_LIFETIME) {
                toDelete.push(key);
            }
        }
        
        for (const key of toDelete) {
            this.obstacleCache.delete(key);
        }
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        this.obstacleCache.clear();
        this.roadNetwork = null;
        logger.log("[AIPathfinding] Disposed");
    }
}

