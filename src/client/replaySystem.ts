/**
 * Replay System - запись и воспроизведение матчей
 */

import type { PlayerData, GameMode } from "../shared/types";
import { ServerMessageType } from "../shared/messages";

export interface ReplayEvent {
    timestamp: number; // Time in milliseconds since match start
    type: string;
    data: any;
}

export interface ReplayData {
    version: string;
    matchId: string;
    mode: GameMode;
    worldSeed: number;
    startTime: number;
    duration: number;
    players: PlayerData[];
    events: ReplayEvent[];
    metadata: {
        mapName?: string;
        maxPlayers: number;
        serverVersion?: string;
    };
}

export class ReplayRecorder {
    private isRecording: boolean = false;
    private matchStartTime: number = 0;
    private events: ReplayEvent[] = [];
    private matchId: string = "";
    private mode: GameMode = "ffa";
    private worldSeed: number = 0;
    private players: PlayerData[] = [];
    private metadata: ReplayData["metadata"] = { maxPlayers: 10 };

    /**
     * Start recording a match
     */
    startRecording(matchId: string, mode: GameMode, worldSeed: number, players: PlayerData[], metadata?: Partial<ReplayData["metadata"]>): void {
        this.isRecording = true;
        this.matchStartTime = Date.now();
        this.matchId = matchId;
        this.mode = mode;
        this.worldSeed = worldSeed;
        this.players = [...players];
        this.events = [];
        this.metadata = {
            maxPlayers: players.length,
            ...metadata
        };
        
        // Record match start event
        this.recordEvent("match_start", {
            matchId,
            mode,
            worldSeed,
            players: players.map(p => ({
                id: p.id,
                name: p.name,
                team: p.team
            }))
        });
        
        console.log(`[Replay] Started recording match ${matchId}`);
    }

    /**
     * Stop recording
     */
    stopRecording(): ReplayData | null {
        if (!this.isRecording) return null;
        
        const duration = Date.now() - this.matchStartTime;
        
        // Record match end event
        this.recordEvent("match_end", {
            duration
        });
        
        this.isRecording = false;
        
        const replayData: ReplayData = {
            version: "1.0",
            matchId: this.matchId,
            mode: this.mode,
            worldSeed: this.worldSeed,
            startTime: this.matchStartTime,
            duration,
            players: this.players,
            events: this.events,
            metadata: this.metadata
        };
        
        console.log(`[Replay] Stopped recording. Total events: ${this.events.length}, Duration: ${duration}ms`);
        
        return replayData;
    }

    /**
     * Record an event
     */
    recordEvent(type: string, data: any): void {
        if (!this.isRecording) return;
        
        const timestamp = Date.now() - this.matchStartTime;
        this.events.push({
            timestamp,
            type,
            data
        });
    }

    /**
     * Record player states (called at 60 Hz)
     */
    recordPlayerStates(players: PlayerData[]): void {
        if (!this.isRecording) return;
        
        // Only record every 10th update to save space (6 Hz instead of 60 Hz)
        if (this.events.length > 0) {
            const lastEvent = this.events[this.events.length - 1];
            if (lastEvent.type === "player_states" && this.events[this.events.length - 1].timestamp - lastEvent.timestamp < 150) {
                // Update last player states instead of creating new event
                lastEvent.data = players.map(p => ({
                    id: p.id,
                    position: { x: p.position.x, y: p.position.y, z: p.position.z },
                    rotation: p.rotation,
                    turretRotation: p.turretRotation,
                    health: p.health,
                    status: p.status
                }));
                return;
            }
        }
        
        this.recordEvent("player_states", {
            players: players.map(p => ({
                id: p.id,
                position: { x: p.position.x, y: p.position.y, z: p.position.z },
                rotation: p.rotation,
                turretRotation: p.turretRotation,
                health: p.health,
                status: p.status
            }))
        });
    }

    /**
     * Record server message
     */
    recordServerMessage(messageType: ServerMessageType, data: any): void {
        if (!this.isRecording) return;
        
        // Record important events
        const importantEvents = [
            ServerMessageType.PLAYER_KILLED,
            ServerMessageType.PLAYER_DIED,
            ServerMessageType.PLAYER_DAMAGED,
            ServerMessageType.PROJECTILE_SPAWN,
            ServerMessageType.PROJECTILE_HIT,
            ServerMessageType.CTF_FLAG_PICKUP,
            ServerMessageType.CTF_FLAG_CAPTURE,
            ServerMessageType.SAFE_ZONE_UPDATE,
            ServerMessageType.CHAT_MESSAGE
        ];
        
        if (importantEvents.includes(messageType)) {
            this.recordEvent(`server_${messageType}`, data);
        }
    }

    /**
     * Save replay to localStorage or download as file
     */
    saveReplay(replayData: ReplayData, download: boolean = false): string | null {
        try {
            const json = JSON.stringify(replayData, null, 2);
            
            if (download) {
                // Download as file
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `replay_${replayData.matchId}_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log(`[Replay] Downloaded replay: ${a.download}`);
                return null;
            } else {
                // Save to localStorage (with size limit)
                const key = `replay_${replayData.matchId}`;
                const size = new Blob([json]).size;
                const maxSize = 5 * 1024 * 1024; // 5 MB limit
                
                if (size > maxSize) {
                    console.warn(`[Replay] Replay too large (${(size / 1024 / 1024).toFixed(2)}MB), not saving to localStorage`);
                    return null;
                }
                
                localStorage.setItem(key, json);
                console.log(`[Replay] Saved replay to localStorage: ${key} (${(size / 1024).toFixed(2)}KB)`);
                return key;
            }
        } catch (error) {
            console.error("[Replay] Error saving replay:", error);
            return null;
        }
    }

    /**
     * Load replay from localStorage or file
     */
    static loadReplay(keyOrData: string | ReplayData): ReplayData | null {
        try {
            let data: ReplayData;
            
            if (typeof keyOrData === "string") {
                // Load from localStorage
                const json = localStorage.getItem(keyOrData);
                if (!json) {
                    console.error(`[Replay] Replay not found: ${keyOrData}`);
                    return null;
                }
                data = JSON.parse(json);
            } else {
                data = keyOrData;
            }
            
            // Validate replay data
            if (!data.version || !data.matchId || !data.events) {
                console.error("[Replay] Invalid replay data");
                return null;
            }
            
            console.log(`[Replay] Loaded replay: ${data.matchId}, ${data.events.length} events, ${data.duration}ms`);
            return data;
        } catch (error) {
            console.error("[Replay] Error loading replay:", error);
            return null;
        }
    }

    /**
     * Get list of saved replays
     */
    static getSavedReplays(): Array<{ key: string; matchId: string; mode: GameMode; duration: number; timestamp: number }> {
        const replays: Array<{ key: string; matchId: string; mode: GameMode; duration: number; timestamp: number }> = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("replay_")) {
                try {
                    const json = localStorage.getItem(key);
                    if (json) {
                        const data = JSON.parse(json) as ReplayData;
                        replays.push({
                            key,
                            matchId: data.matchId,
                            mode: data.mode,
                            duration: data.duration,
                            timestamp: data.startTime
                        });
                    }
                } catch (e) {
                    // Skip invalid replays
                }
            }
        }
        
        // Sort by timestamp (newest first)
        replays.sort((a, b) => b.timestamp - a.timestamp);
        
        return replays;
    }

    /**
     * Delete a saved replay
     */
    static deleteReplay(key: string): boolean {
        try {
            localStorage.removeItem(key);
            console.log(`[Replay] Deleted replay: ${key}`);
            return true;
        } catch (error) {
            console.error("[Replay] Error deleting replay:", error);
            return false;
        }
    }
}

export class ReplayPlayer {
    private replayData: ReplayData | null = null;
    private currentTime: number = 0;
    private isPlaying: boolean = false;
    private playbackSpeed: number = 1.0;
    private eventIndex: number = 0;
    
    // Callbacks
    private onEventCallback: ((event: ReplayEvent) => void) | null = null;
    private onProgressCallback: ((progress: number) => void) | null = null;
    private onEndCallback: (() => void) | null = null;

    /**
     * Load a replay
     */
    loadReplay(replayData: ReplayData): void {
        this.replayData = replayData;
        this.currentTime = 0;
        this.eventIndex = 0;
        this.isPlaying = false;
        console.log(`[Replay] Loaded replay: ${replayData.matchId}`);
    }

    /**
     * Start playback
     */
    start(): void {
        if (!this.replayData) return;
        this.isPlaying = true;
        this.currentTime = 0;
        this.eventIndex = 0;
        console.log("[Replay] Started playback");
    }

    /**
     * Stop playback
     */
    stop(): void {
        this.isPlaying = false;
        console.log("[Replay] Stopped playback");
    }

    /**
     * Pause/Resume playback
     */
    togglePause(): void {
        this.isPlaying = !this.isPlaying;
        console.log(`[Replay] ${this.isPlaying ? "Resumed" : "Paused"} playback`);
    }

    /**
     * Set playback speed
     */
    setSpeed(speed: number): void {
        this.playbackSpeed = Math.max(0.25, Math.min(4.0, speed));
        console.log(`[Replay] Playback speed: ${this.playbackSpeed}x`);
    }

    /**
     * Seek to specific time
     */
    seekTo(time: number): void {
        if (!this.replayData) return;
        
        this.currentTime = Math.max(0, Math.min(time, this.replayData.duration));
        
        // Find event index for this time
        this.eventIndex = 0;
        for (let i = 0; i < this.replayData.events.length; i++) {
            if (this.replayData.events[i].timestamp <= this.currentTime) {
                this.eventIndex = i;
            } else {
                break;
            }
        }
        
        console.log(`[Replay] Seeked to ${this.currentTime}ms`);
    }

    /**
     * Update playback (call in game loop)
     */
    update(deltaTime: number): void {
        if (!this.isPlaying || !this.replayData) return;
        
        this.currentTime += deltaTime * 1000 * this.playbackSpeed;
        
        // Process events up to current time
        while (this.eventIndex < this.replayData.events.length) {
            const event = this.replayData.events[this.eventIndex];
            if (event.timestamp <= this.currentTime) {
                if (this.onEventCallback) {
                    this.onEventCallback(event);
                }
                this.eventIndex++;
            } else {
                break;
            }
        }
        
        // Update progress
        if (this.onProgressCallback) {
            const progress = this.currentTime / this.replayData.duration;
            this.onProgressCallback(progress);
        }
        
        // Check if ended
        if (this.currentTime >= this.replayData.duration) {
            this.isPlaying = false;
            if (this.onEndCallback) {
                this.onEndCallback();
            }
        }
    }

    /**
     * Get current playback time
     */
    getCurrentTime(): number {
        return this.currentTime;
    }

    /**
     * Get replay duration
     */
    getDuration(): number {
        return this.replayData?.duration || 0;
    }

    /**
     * Get progress (0-1)
     */
    getProgress(): number {
        if (!this.replayData || this.replayData.duration === 0) return 0;
        return this.currentTime / this.replayData.duration;
    }

    /**
     * Callbacks
     */
    onEvent(callback: (event: ReplayEvent) => void): void {
        this.onEventCallback = callback;
    }

    onProgress(callback: (progress: number) => void): void {
        this.onProgressCallback = callback;
    }

    onEnd(callback: () => void): void {
        this.onEndCallback = callback;
    }
}

