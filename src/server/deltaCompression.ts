import type { PlayerData } from "../shared/types";
import { Vector3 } from "@babylonjs/core";

export interface PlayerStateDelta {
    id: string;
    // Quantized position (int16, precision 0.1 units)
    position?: { x: number; y: number; z: number };
    // Quantized rotation (int16, precision 0.001 rad)
    rotation?: number;
    turretRotation?: number;
    aimPitch?: number;
    // Quantized health (uint8, 0-255)
    health?: number;
    status?: "alive" | "dead" | "spectating";
    kills?: number;
    deaths?: number;
    score?: number;
    // Bit flags for changed fields (optimization)
    changedFields?: number;
}

// Quantization constants
const POSITION_QUANTIZATION = 0.1; // 0.1 unit precision
const ROTATION_QUANTIZATION = 0.001; // 0.001 rad precision (~0.057 degrees)
const POSITION_THRESHOLD = 0.05; // Dead zone for position changes
const ROTATION_THRESHOLD = 0.005; // Dead zone for rotation changes

export class DeltaCompressor {
    private lastStates: Map<string, PlayerData> = new Map();
    // КРИТИЧНО: Счетчик пакетов для периодической отправки полных состояний
    // Каждые 60 пакетов (1 раз в секунду при 60Hz) отправляем полное состояние
    private packetCount: number = 0;
    private readonly FULL_STATE_INTERVAL = 60; // Отправлять полное состояние каждые 60 пакетов
    
    /**
     * Quantize position to reduce size (float32 -> int16 with 0.1 precision)
     */
    private quantizePosition(pos: Vector3): { x: number; y: number; z: number } {
        return {
            x: Math.round(pos.x / POSITION_QUANTIZATION) * POSITION_QUANTIZATION,
            y: Math.round(pos.y / POSITION_QUANTIZATION) * POSITION_QUANTIZATION,
            z: Math.round(pos.z / POSITION_QUANTIZATION) * POSITION_QUANTIZATION
        };
    }
    
    /**
     * Quantize rotation (float32 -> int16 with 0.001 rad precision)
     */
    private quantizeRotation(rot: number): number {
        return Math.round(rot / ROTATION_QUANTIZATION) * ROTATION_QUANTIZATION;
    }
    
    /**
     * Quantize health (float32 -> uint8, 0-255 range)
     */
    private quantizeHealth(health: number): number {
        return Math.round(Math.max(0, Math.min(255, health * 255 / 100)));
    }
    
    compressPlayerStates(players: PlayerData[], useQuantization: boolean = true): { deltas: PlayerStateDelta[]; isFullState: boolean } {
        // КРИТИЧНО: Увеличиваем счетчик пакетов
        this.packetCount++;
        
        // Определяем, нужно ли отправить полное состояние (каждые 60 пакетов)
        const isFullState = this.packetCount >= this.FULL_STATE_INTERVAL;
        
        // Если это полное состояние, сбрасываем счетчик
        if (isFullState) {
            this.packetCount = 0;
        }
        
        const deltas: PlayerStateDelta[] = [];
        
        for (const player of players) {
            const lastState = this.lastStates.get(player.id);
            const delta: PlayerStateDelta = { id: player.id };
            let changedFields = 0;
            
            // КРИТИЧНО: Если это полное состояние, отправляем все поля без квантования
            // Это предотвращает накопление ошибок квантования
            if (!lastState || isFullState) {
                // First time seeing this player OR full state sync - send full state
                // При полном состоянии НЕ используем квантование для точности
                const shouldQuantize = !isFullState && useQuantization;
                
                if (shouldQuantize) {
                    const quantizedPos = this.quantizePosition(player.position);
                    delta.position = quantizedPos;
                } else {
                    // Полное состояние - без квантования для точности
                    delta.position = { x: player.position.x, y: player.position.y, z: player.position.z };
                }
                delta.rotation = shouldQuantize ? this.quantizeRotation(player.rotation) : player.rotation;
                delta.turretRotation = shouldQuantize ? this.quantizeRotation(player.turretRotation) : player.turretRotation;
                delta.aimPitch = shouldQuantize ? this.quantizeRotation(player.aimPitch) : player.aimPitch;
                delta.health = shouldQuantize ? this.quantizeHealth(player.health) : player.health;
                delta.status = player.status;
                delta.kills = player.kills;
                delta.deaths = player.deaths;
                delta.score = player.score;
                changedFields = 0xFF; // All fields changed
            } else {
                // Only send changed values with improved thresholds
                const posChanged = !this.vectorsEqual(player.position, lastState.position, POSITION_THRESHOLD);
                const rotChanged = Math.abs(player.rotation - lastState.rotation) > ROTATION_THRESHOLD;
                const turretChanged = Math.abs(player.turretRotation - lastState.turretRotation) > ROTATION_THRESHOLD;
                const aimChanged = Math.abs(player.aimPitch - lastState.aimPitch) > ROTATION_THRESHOLD;
                
                if (posChanged) {
                    changedFields |= 0x01;
                    if (useQuantization) {
                        delta.position = this.quantizePosition(player.position);
                    } else {
                        delta.position = { x: player.position.x, y: player.position.y, z: player.position.z };
                    }
                }
                if (rotChanged) {
                    changedFields |= 0x02;
                    delta.rotation = useQuantization ? this.quantizeRotation(player.rotation) : player.rotation;
                }
                if (turretChanged) {
                    changedFields |= 0x04;
                    delta.turretRotation = useQuantization ? this.quantizeRotation(player.turretRotation) : player.turretRotation;
                }
                if (aimChanged) {
                    changedFields |= 0x08;
                    delta.aimPitch = useQuantization ? this.quantizeRotation(player.aimPitch) : player.aimPitch;
                }
                if (player.health !== lastState.health) {
                    changedFields |= 0x10;
                    delta.health = useQuantization ? this.quantizeHealth(player.health) : player.health;
                }
                if (player.status !== lastState.status) {
                    changedFields |= 0x20;
                    delta.status = player.status;
                }
                if (player.kills !== lastState.kills) {
                    changedFields |= 0x40;
                    delta.kills = player.kills;
                }
                if (player.deaths !== lastState.deaths || player.score !== lastState.score) {
                    changedFields |= 0x80;
                    delta.deaths = player.deaths;
                    delta.score = player.score;
                }
                
                // Store changed fields for potential optimization
                if (changedFields > 0) {
                    delta.changedFields = changedFields;
                }
            }
            
            // Only add delta if there are changes
            if (Object.keys(delta).length > 1) { // More than just 'id'
                deltas.push(delta);
                
                // Update last state (store quantized values for comparison)
                const lastStateCopy = { ...player };
                if (useQuantization && delta.position) {
                    lastStateCopy.position = new Vector3(delta.position.x, delta.position.y, delta.position.z);
                }
                if (useQuantization && delta.rotation !== undefined) {
                    lastStateCopy.rotation = delta.rotation;
                }
                this.lastStates.set(player.id, lastStateCopy);
            }
        }
        
        // КРИТИЧНО: Возвращаем deltas и флаг isFullState
        return { deltas, isFullState };
        
        // Remove players that are no longer in the game
        const currentPlayerIds = new Set(players.map(p => p.id));
        for (const [id] of this.lastStates) {
            if (!currentPlayerIds.has(id)) {
                this.lastStates.delete(id);
            }
        }
        
        return deltas;
    }
    
    private vectorsEqual(v1: Vector3, v2: Vector3, threshold: number): boolean {
        return Math.abs(v1.x - v2.x) < threshold &&
               Math.abs(v1.y - v2.y) < threshold &&
               Math.abs(v1.z - v2.z) < threshold;
    }
    
    reset(): void {
        this.lastStates.clear();
    }
}

/**
 * Spatial Hash Grid for efficient spatial queries
 */
export class SpatialHashGrid {
    private cellSize: number;
    private grid: Map<string, Set<string>> = new Map(); // cellKey -> Set<playerId>
    
    constructor(cellSize: number = 100) {
        this.cellSize = cellSize;
    }
    
    private getCellKey(x: number, z: number): string {
        const cellX = Math.floor(x / this.cellSize);
        const cellZ = Math.floor(z / this.cellSize);
        return `${cellX},${cellZ}`;
    }
    
    /**
     * Get players in cells near the given position
     */
    getNearbyPlayers(players: PlayerData[], centerPos: Vector3, radius: number): PlayerData[] {
        const nearbyPlayers: PlayerData[] = [];
        const radiusCells = Math.ceil(radius / this.cellSize);
        const centerCellX = Math.floor(centerPos.x / this.cellSize);
        const centerCellZ = Math.floor(centerPos.z / this.cellSize);
        
        // Check cells in radius
        for (let dx = -radiusCells; dx <= radiusCells; dx++) {
            for (let dz = -radiusCells; dz <= radiusCells; dz++) {
                const cellKey = `${centerCellX + dx},${centerCellZ + dz}`;
                const cellPlayers = this.grid.get(cellKey);
                if (cellPlayers) {
                    for (const playerId of cellPlayers) {
                        const player = players.find(p => p.id === playerId);
                        if (player && Vector3.Distance(centerPos, player.position) <= radius) {
                            nearbyPlayers.push(player);
                        }
                    }
                }
            }
        }
        
        return nearbyPlayers;
    }
    
    /**
     * Update grid with current player positions
     */
    updateGrid(players: PlayerData[]): void {
        this.grid.clear();
        
        for (const player of players) {
            const cellKey = this.getCellKey(player.position.x, player.position.z);
            if (!this.grid.has(cellKey)) {
                this.grid.set(cellKey, new Set());
            }
            this.grid.get(cellKey)!.add(player.id);
        }
    }
}

export class PrioritizedBroadcaster {
    private spatialGrid: SpatialHashGrid;
    
    constructor() {
        this.spatialGrid = new SpatialHashGrid(100); // 100 unit cells
    }
    
    // Prioritize players based on distance and importance
    prioritizePlayers(
        players: PlayerData[],
        localPlayerPos: Vector3,
        maxPlayers: number = 16,
        adaptive: boolean = true
    ): PlayerData[] {
        // КРИТИЧНО: Если игроков мало (<= 5), ВСЕГДА возвращаем всех
        // Это гарантирует, что в малых комнатах все игроки видят друг друга
        if (players.length <= 5) {
            return players;
        }
        
        if (!adaptive || players.length <= maxPlayers) {
            return players; // No need to prioritize if we can send all
        }
        
        // Update spatial grid for efficient queries
        this.spatialGrid.updateGrid(players);
        
        // Get nearby players using spatial grid (within 500 units)
        const nearbyPlayers = this.spatialGrid.getNearbyPlayers(players, localPlayerPos, 500);
        
        // If we have enough nearby players, use them
        if (nearbyPlayers.length >= maxPlayers) {
            // Calculate priority for nearby players
            const playersWithPriority = nearbyPlayers.map(player => ({
                player,
                distance: Vector3.Distance(localPlayerPos, player.position),
                priority: this.calculatePriority(player, localPlayerPos)
            }));
            
            // Sort by priority (higher is better)
            playersWithPriority.sort((a, b) => b.priority - a.priority);
            
            // Return top N players
            return playersWithPriority
                .slice(0, maxPlayers)
                .map(p => p.player);
        }
        
        // Fallback to distance-based prioritization for all players
        const playersWithPriority = players.map(player => ({
            player,
            distance: Vector3.Distance(localPlayerPos, player.position),
            priority: this.calculatePriority(player, localPlayerPos)
        }));
        
        // Sort by priority (higher is better)
        playersWithPriority.sort((a, b) => b.priority - a.priority);
        
        // Return top N players
        return playersWithPriority
            .slice(0, maxPlayers)
            .map(p => p.player);
    }
    
    private calculatePriority(player: PlayerData, localPlayerPos: Vector3): number {
        const distance = Vector3.Distance(localPlayerPos, player.position);
        
        // Base priority (closer = higher)
        let priority = 1000 / (distance + 1);
        
        // Boost priority for alive players
        if (player.status === "alive") {
            priority *= 1.5;
        }
        
        // Boost priority for players with high score (important targets)
        priority += player.score * 0.1;
        
        // Reduce priority for dead players
        if (player.status === "dead") {
            priority *= 0.3;
        }
        
        // Boost priority for team members in team-based modes
        // (This would need to be passed as parameter if needed)
        
        return priority;
    }
    
    /**
     * Get simplified update for distant players (only position)
     */
    getSimplifiedUpdate(player: PlayerData, distance: number): Partial<PlayerData> {
        if (distance > 300) {
            // Very far - only position
            return {
                id: player.id,
                position: player.position,
                status: player.status
            };
        } else if (distance > 150) {
            // Far - position + rotation
            return {
                id: player.id,
                position: player.position,
                rotation: player.rotation,
                status: player.status,
                health: player.health
            };
        }
        // Close - full update (handled normally)
        return player;
    }
    
    /**
     * Calculate adaptive update rate based on distance and network conditions
     * Returns update frequency multiplier (1.0 = full rate, 0.5 = half rate, etc.)
     */
    getAdaptiveUpdateRate(distance: number, playerCount: number, networkLoad: number = 0): number {
        // Base rate based on distance
        let rate = 1.0;
        
        if (distance > 500) {
            rate = 0.2; // Very far: 20% update rate (5x less frequent)
        } else if (distance > 300) {
            rate = 0.4; // Far: 40% update rate
        } else if (distance > 150) {
            rate = 0.7; // Medium: 70% update rate
        } else {
            rate = 1.0; // Close: 100% update rate
        }
        
        // Adjust based on player count (more players = lower rate for distant ones)
        if (playerCount > 20) {
            rate *= 0.8; // Reduce by 20% if many players
        }
        
        // Adjust based on network load (0.0 = no load, 1.0 = high load)
        if (networkLoad > 0.7) {
            rate *= 0.7; // Reduce by 30% if high network load
        } else if (networkLoad > 0.5) {
            rate *= 0.85; // Reduce by 15% if medium network load
        }
        
        return Math.max(0.1, Math.min(1.0, rate)); // Clamp between 0.1 and 1.0
    }
}

