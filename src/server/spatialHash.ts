import { Vector3 } from "@babylonjs/core";

/**
 * Spatial Hash Grid для оптимизации отправки обновлений
 * Разделяет мир на ячейки и отслеживает, какие игроки находятся в каких ячейках
 * 
 * Реализовано 12.01.2026 - оптимизирует отправку обновлений только видимым игрокам
 */
export class SpatialHashGrid {
    private cellSize: number;
    private grid: Map<string, Set<string>>; // cellKey -> playerIds
    private playerCells: Map<string, string>; // playerId -> cellKey
    private playerPositions: Map<string, Vector3>; // playerId -> position
    
    constructor(cellSize: number = 100) {
        this.cellSize = cellSize;
        this.grid = new Map();
        this.playerCells = new Map();
        this.playerPositions = new Map();
    }
    
    /**
     * Получить ключ ячейки для позиции
     */
    private getCellKey(position: Vector3): string {
        const cellX = Math.floor(position.x / this.cellSize);
        const cellZ = Math.floor(position.z / this.cellSize);
        return `${cellX},${cellZ}`;
    }
    
    /**
     * Добавить игрока в сетку
     */
    addPlayer(playerId: string, position: Vector3): void {
        const cellKey = this.getCellKey(position);
        
        // Добавляем в ячейку
        if (!this.grid.has(cellKey)) {
            this.grid.set(cellKey, new Set());
        }
        this.grid.get(cellKey)!.add(playerId);
        
        // Сохраняем ячейку игрока
        this.playerCells.set(playerId, cellKey);
        this.playerPositions.set(playerId, position.clone());
    }
    
    /**
     * Удалить игрока из сетки
     */
    removePlayer(playerId: string): void {
        const cellKey = this.playerCells.get(playerId);
        if (cellKey) {
            const cell = this.grid.get(cellKey);
            if (cell) {
                cell.delete(playerId);
                if (cell.size === 0) {
                    this.grid.delete(cellKey);
                }
            }
        }
        this.playerCells.delete(playerId);
        this.playerPositions.delete(playerId);
    }
    
    /**
     * Обновить позицию игрока
     * Возвращает true, если игрок сменил ячейку
     */
    updatePlayer(playerId: string, newPosition: Vector3): boolean {
        const oldCellKey = this.playerCells.get(playerId);
        const newCellKey = this.getCellKey(newPosition);
        
        // Обновляем сохранённую позицию
        this.playerPositions.set(playerId, newPosition.clone());
        
        // Если ячейка не изменилась, ничего не делаем
        if (oldCellKey === newCellKey) {
            return false;
        }
        
        // Удаляем из старой ячейки
        if (oldCellKey) {
            const oldCell = this.grid.get(oldCellKey);
            if (oldCell) {
                oldCell.delete(playerId);
                if (oldCell.size === 0) {
                    this.grid.delete(oldCellKey);
                }
            }
        }
        
        // Добавляем в новую ячейку
        if (!this.grid.has(newCellKey)) {
            this.grid.set(newCellKey, new Set());
        }
        this.grid.get(newCellKey)!.add(playerId);
        this.playerCells.set(playerId, newCellKey);
        
        return true;
    }
    
    /**
     * Получить соседние ячейки (включая текущую)
     */
    private getNeighborCellKeys(cellKey: string): string[] {
        const parts = cellKey.split(',').map(Number);
        const cellX = parts[0] ?? 0;
        const cellZ = parts[1] ?? 0;
        const neighbors: string[] = [];
        
        // 3x3 окрестность
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                neighbors.push(`${cellX + dx},${cellZ + dz}`);
            }
        }
        
        return neighbors;
    }
    
    /**
     * Получить игроков в радиусе видимости
     * Использует ячейки для оптимизации поиска
     */
    getNearbyPlayers(playerId: string, maxDistance: number = 200): Set<string> {
        const position = this.playerPositions.get(playerId);
        if (!position) {
            return new Set();
        }
        
        const cellKey = this.playerCells.get(playerId);
        if (!cellKey) {
            return new Set();
        }
        
        const nearbyPlayers = new Set<string>();
        
        // Определяем сколько ячеек нужно проверить
        const cellRange = Math.ceil(maxDistance / this.cellSize);
        const parts = cellKey.split(',').map(Number);
        const cellX = parts[0] ?? 0;
        const cellZ = parts[1] ?? 0;
        
        // Проверяем все ячейки в радиусе
        for (let dx = -cellRange; dx <= cellRange; dx++) {
            for (let dz = -cellRange; dz <= cellRange; dz++) {
                const neighborKey = `${cellX + dx},${cellZ + dz}`;
                const cell = this.grid.get(neighborKey);
                if (cell) {
                    for (const otherId of cell) {
                        if (otherId === playerId) continue;
                        
                        // Проверяем реальное расстояние
                        const otherPos = this.playerPositions.get(otherId);
                        if (otherPos) {
                            const dist = Vector3.Distance(position, otherPos);
                            if (dist <= maxDistance) {
                                nearbyPlayers.add(otherId);
                            }
                        }
                    }
                }
            }
        }
        
        return nearbyPlayers;
    }
    
    /**
     * Получить игроков по зонам видимости
     * @returns Map с ключами: "near" (< 50), "medium" (50-150), "far" (150-300), "veryFar" (> 300)
     */
    getPlayersByDistance(playerId: string): Map<string, Set<string>> {
        const result = new Map<string, Set<string>>();
        result.set("near", new Set());
        result.set("medium", new Set());
        result.set("far", new Set());
        result.set("veryFar", new Set());
        
        const position = this.playerPositions.get(playerId);
        if (!position) {
            return result;
        }
        
        const allNearby = this.getNearbyPlayers(playerId, 500); // Максимум 500 единиц
        
        for (const otherId of allNearby) {
            const otherPos = this.playerPositions.get(otherId);
            if (!otherPos) continue;
            
            const dist = Vector3.Distance(position, otherPos);
            
            if (dist < 50) {
                result.get("near")!.add(otherId);
            } else if (dist < 150) {
                result.get("medium")!.add(otherId);
            } else if (dist < 300) {
                result.get("far")!.add(otherId);
            } else {
                result.get("veryFar")!.add(otherId);
            }
        }
        
        return result;
    }
    
    /**
     * Получить количество игроков в сетке
     */
    getPlayerCount(): number {
        return this.playerCells.size;
    }
    
    /**
     * Получить количество активных ячеек
     */
    getCellCount(): number {
        return this.grid.size;
    }
    
    /**
     * Очистить сетку
     */
    clear(): void {
        this.grid.clear();
        this.playerCells.clear();
        this.playerPositions.clear();
    }
}

