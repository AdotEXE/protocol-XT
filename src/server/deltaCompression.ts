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
    
    compressPlayerStates(players: PlayerData[], useQuantization: boolean = true): PlayerStateDelta[] {
        const deltas: PlayerStateDelta[] = [];
        
        for (const player of players) {
            const lastState = this.lastStates.get(player.id);
            const delta: PlayerStateDelta = { id: player.id };
            let changedFields = 0;
            
            if (!lastState) {
                // First time seeing this player - send full state
                if (useQuantization) {
                    const quantizedPos = this.quantizePosition(player.position);
                    delta.position = quantizedPos;
                } else {
                    delta.position = { x: player.position.x, y: player.position.y, z: player.position.z };
                }
                delta.rotation = useQuantization ? this.quantizeRotation(player.rotation) : player.rotation;
                delta.turretRotation = useQuantization ? this.quantizeRotation(player.turretRotation) : player.turretRotation;
                delta.aimPitch = useQuantization ? this.quantizeRotation(player.aimPitch) : player.aimPitch;
                delta.health = useQuantization ? this.quantizeHealth(player.health) : player.health;
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

export class PrioritizedBroadcaster {
    // Prioritize players based on distance and importance
    prioritizePlayers(
        players: PlayerData[],
        localPlayerPos: Vector3,
        maxPlayers: number = 16,
        adaptive: boolean = true
    ): PlayerData[] {
        if (!adaptive || players.length <= maxPlayers) {
            return players; // No need to prioritize if we can send all
        }
        
        // Calculate distance and priority for each player
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
}

