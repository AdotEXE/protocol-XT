import type { PlayerData } from "../shared/types";
import { Vector3 } from "@babylonjs/core";

export interface PlayerStateDelta {
    id: string;
    position?: { x: number; y: number; z: number };
    rotation?: number;
    turretRotation?: number;
    aimPitch?: number;
    health?: number;
    status?: "alive" | "dead" | "spectating";
    kills?: number;
    deaths?: number;
    score?: number;
}

export class DeltaCompressor {
    private lastStates: Map<string, PlayerData> = new Map();
    
    compressPlayerStates(players: PlayerData[]): PlayerStateDelta[] {
        const deltas: PlayerStateDelta[] = [];
        
        for (const player of players) {
            const lastState = this.lastStates.get(player.id);
            const delta: PlayerStateDelta = { id: player.id };
            
            if (!lastState) {
                // First time seeing this player - send full state
                delta.position = { x: player.position.x, y: player.position.y, z: player.position.z };
                delta.rotation = player.rotation;
                delta.turretRotation = player.turretRotation;
                delta.aimPitch = player.aimPitch;
                delta.health = player.health;
                delta.status = player.status;
                delta.kills = player.kills;
                delta.deaths = player.deaths;
                delta.score = player.score;
            } else {
                // Only send changed values
                const posChanged = !this.vectorsEqual(player.position, lastState.position, 0.1);
                const rotChanged = Math.abs(player.rotation - lastState.rotation) > 0.01;
                const turretChanged = Math.abs(player.turretRotation - lastState.turretRotation) > 0.01;
                const aimChanged = Math.abs(player.aimPitch - lastState.aimPitch) > 0.01;
                
                if (posChanged) {
                    delta.position = { x: player.position.x, y: player.position.y, z: player.position.z };
                }
                if (rotChanged) {
                    delta.rotation = player.rotation;
                }
                if (turretChanged) {
                    delta.turretRotation = player.turretRotation;
                }
                if (aimChanged) {
                    delta.aimPitch = player.aimPitch;
                }
                if (player.health !== lastState.health) {
                    delta.health = player.health;
                }
                if (player.status !== lastState.status) {
                    delta.status = player.status;
                }
                if (player.kills !== lastState.kills) {
                    delta.kills = player.kills;
                }
                if (player.deaths !== lastState.deaths) {
                    delta.deaths = player.deaths;
                }
                if (player.score !== lastState.score) {
                    delta.score = player.score;
                }
            }
            
            // Only add delta if there are changes
            if (Object.keys(delta).length > 1) { // More than just 'id'
                deltas.push(delta);
            }
            
            // Update last state
            this.lastStates.set(player.id, { ...player });
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
        maxPlayers: number = 16
    ): PlayerData[] {
        // Calculate distance for each player
        const playersWithDistance = players.map(player => ({
            player,
            distance: Vector3.Distance(localPlayerPos, player.position),
            priority: this.calculatePriority(player, localPlayerPos)
        }));
        
        // Sort by priority (higher is better)
        playersWithDistance.sort((a, b) => b.priority - a.priority);
        
        // Return top N players
        return playersWithDistance
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
        
        return priority;
    }
}

