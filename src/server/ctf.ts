import { Vector3 } from "@babylonjs/core";
import { nanoid } from "nanoid";
import type { ServerPlayer } from "./player";
import type { GameRoom } from "./room";
import { logger, LogLevel, loggingSettings } from "../client/utils/logger";

export interface FlagData {
    id: string;
    team: number;
    position: Vector3;
    isCarried: boolean;
    carrierId: string | null;
    basePosition: Vector3;
}

export class CTFSystem {
    private flags: Map<number, FlagData> = new Map(); // team -> flag
    private room: GameRoom;
    
    constructor(room: GameRoom) {
        this.room = room;
        this.initializeFlags();
    }
    
    private initializeFlags(): void {
        // Create flags for each team
        const team0Flag: FlagData = {
            id: nanoid(),
            team: 0,
            position: new Vector3(-50, 2, 0),
            isCarried: false,
            carrierId: null,
            basePosition: new Vector3(-50, 2, 0)
        };
        
        const team1Flag: FlagData = {
            id: nanoid(),
            team: 1,
            position: new Vector3(50, 2, 0),
            isCarried: false,
            carrierId: null,
            basePosition: new Vector3(50, 2, 0)
        };
        
        this.flags.set(0, team0Flag);
        this.flags.set(1, team1Flag);
    }
    
    update(_deltaTime: number): void {
        // Update flag positions if carried
        for (const flag of this.flags.values()) {
            if (flag.isCarried && flag.carrierId) {
                const carrier = this.room.getPlayer(flag.carrierId);
                if (carrier && carrier.status === "alive") {
                    flag.position = carrier.position.clone();
                    flag.position.y = 2; // Flag height
                } else {
                    // Carrier died, return flag to base
                    this.returnFlagToBase(flag.team);
                }
            }
        }
        
        // Check for flag captures
        this.checkFlagCaptures();
    }
    
    checkFlagPickup(player: ServerPlayer): boolean {
        if (player.team === undefined) return false;
        
        // Check if player is near enemy flag
        const enemyTeam = player.team === 0 ? 1 : 0;
        const enemyFlag = this.flags.get(enemyTeam);
        
        if (!enemyFlag || enemyFlag.isCarried) return false;
        
        const distance = Vector3.Distance(player.position, enemyFlag.position);
        if (distance < 5) {
            // Pick up flag
            enemyFlag.isCarried = true;
            enemyFlag.carrierId = player.id;
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[CTF] Flag picked up by ${player.name} (team ${player.team})`);
            }
            return true;
        }
        
        return false;
    }
    
    checkFlagCaptures(): void {
        for (const player of this.room.getAllPlayers()) {
            if (player.status !== "alive" || player.team === undefined) continue;
            
            // Check if player is at their base with enemy flag
            const enemyTeam = player.team === 0 ? 1 : 0;
            const enemyFlag = this.flags.get(enemyTeam);
            
            if (!enemyFlag || !enemyFlag.isCarried || enemyFlag.carrierId !== player.id) continue;
            
            // Check if player is at their base
            const ownFlag = this.flags.get(player.team);
            if (!ownFlag) continue;
            
            const distanceToBase = Vector3.Distance(player.position, ownFlag.basePosition);
            if (distanceToBase < 10) {
                // Capture!
                this.captureFlag(player.team, enemyTeam, player.id);
            }
        }
    }
    
    private captureFlag(capturingTeam: number, capturedTeam: number, playerId: string): void {
        const flag = this.flags.get(capturedTeam);
        if (!flag) return;
        
        // Return flag to base
        this.returnFlagToBase(capturedTeam);
        
        // Award score
        const player = this.room.getPlayer(playerId);
        if (player) {
            player.score += 1;
        }
        
        // Store capture event for broadcasting
        (this.room as any).lastCTFCaptureEvent = {
            capturingTeam,
            capturedTeam,
            playerId,
            playerName: player?.name || "Unknown"
        };
        
        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            logger.debug(`[CTF] Flag captured by team ${capturingTeam} (player: ${player?.name || playerId})`);
        }
    }
    
    returnFlagToBase(team: number): void {
        const flag = this.flags.get(team);
        if (!flag) return;
        
        flag.isCarried = false;
        flag.carrierId = null;
        flag.position = flag.basePosition.clone();
        
        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            logger.debug(`[CTF] Flag returned to base (team ${team})`);
        }
    }
    
    getFlags(): FlagData[] {
        return Array.from(this.flags.values());
    }
    
    getFlag(team: number): FlagData | undefined {
        return this.flags.get(team);
    }
}

