# Protocol TX - API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Client-Server Communication](#client-server-communication)
3. [Message Types](#message-types)
4. [Game Modes](#game-modes)
5. [Player Data](#player-data)
6. [Server API](#server-api)
7. [Client API](#client-api)
8. [Firebase Integration](#firebase-integration)
9. [WebSocket Protocol](#websocket-protocol)
10. [Examples](#examples)

## Overview

Protocol TX uses a WebSocket-based client-server architecture for real-time multiplayer gameplay. The server is authoritative for all game state, while clients use prediction and interpolation for smooth gameplay.

### Architecture
- **Server**: Node.js + TypeScript, WebSocket (ws library)
- **Client**: Babylon.js, TypeScript, Vite
- **Database**: Firebase Firestore
- **Communication**: WebSocket (binary JSON messages)
- **Sync Rate**: 60 Hz for player states, event-driven for other updates

## Client-Server Communication

### Connection Flow

1. **Client connects** to WebSocket server
2. **Server sends** `CONNECTED` message with `playerId`
3. **Client sends** `QUICK_PLAY` or `CREATE_ROOM` / `JOIN_ROOM`
4. **Server sends** `ROOM_JOINED` with room info and world seed
5. **Server sends** `GAME_START` when match begins
6. **Client sends** `PLAYER_INPUT` at 60 Hz
7. **Server sends** `PLAYER_STATES` at 60 Hz
8. **Server sends** `GAME_END` when match ends

### Message Format

All messages follow this structure:

```typescript
interface Message {
    type: MessageType;
    data: any;
    timestamp: number;
}
```

Messages are serialized as JSON and sent over WebSocket.

## Message Types

### Client → Server Messages

#### `CONNECT`
Initial connection message.

```typescript
{
    type: "connect",
    data: {
        playerName?: string;
        version?: string;
    },
    timestamp: number
}
```

#### `QUICK_PLAY`
Request quick matchmaking.

```typescript
{
    type: "quick_play",
    data: {
        mode: GameMode;
        skillRating?: number;
    },
    timestamp: number
}
```

#### `CREATE_ROOM`
Create a new game room.

```typescript
{
    type: "create_room",
    data: {
        mode: GameMode;
        maxPlayers?: number;
        isPrivate?: boolean;
        password?: string;
    },
    timestamp: number
}
```

#### `JOIN_ROOM`
Join an existing room.

```typescript
{
    type: "join_room",
    data: {
        roomId: string;
        password?: string;
    },
    timestamp: number
}
```

#### `PLAYER_INPUT`
Player movement and actions (sent at 60 Hz).

```typescript
{
    type: "player_input",
    data: {
        throttle: number; // -1 to 1
        steer: number; // -1 to 1
        turretRotation: number;
        aimPitch: number;
        isShooting: boolean;
        timestamp: number;
    },
    timestamp: number
}
```

#### `PLAYER_SHOOT`
Player fires weapon.

```typescript
{
    type: "player_shoot",
    data: {
        position: { x: number; y: number; z: number };
        direction: { x: number; y: number; z: number };
        cannonType: string;
    },
    timestamp: number
}
```

#### `CHAT_MESSAGE`
Send chat message.

```typescript
{
    type: "chat_message",
    data: {
        message: string; // Max 200 characters
    },
    timestamp: number
}
```

### Server → Client Messages

#### `CONNECTED`
Connection established.

```typescript
{
    type: "connected",
    data: {
        playerId: string;
        serverVersion: string;
    },
    timestamp: number
}
```

#### `ROOM_JOINED`
Successfully joined a room.

```typescript
{
    type: "room_joined",
    data: {
        roomId: string;
        mode: GameMode;
        worldSeed: number;
        players: PlayerData[];
        maxPlayers: number;
    },
    timestamp: number
}
```

#### `GAME_START`
Match has started.

```typescript
{
    type: "game_start",
    data: {
        roomId: string;
        mode: GameMode;
        worldSeed: number;
        players: PlayerData[];
        startTime: number;
    },
    timestamp: number
}
```

#### `PLAYER_STATES`
All players' current states (sent at 60 Hz).

```typescript
{
    type: "player_states",
    data: {
        players: PlayerData[];
        gameTime: number;
    },
    timestamp: number
}
```

#### `PLAYER_KILLED`
Player eliminated another player.

```typescript
{
    type: "player_killed",
    data: {
        killerId: string;
        killerName: string;
        victimId: string;
        victimName: string;
        weapon: string;
    },
    timestamp: number
}
```

#### `GAME_END`
Match has ended.

```typescript
{
    type: "game_end",
    data: {
        roomId: string;
        winner: string | null;
        reason: string;
        players: PlayerMatchResult[];
        duration: number;
    },
    timestamp: number
}
```

## Game Modes

### Free-for-All (FFA)
- **Max Players**: 32
- **Objective**: Eliminate other players
- **Win Condition**: First to reach score limit or most kills at time limit

### Team Deathmatch (TDM)
- **Max Players**: 32 (16 per team)
- **Objective**: Eliminate enemy team
- **Win Condition**: First team to reach score limit

### Co-op PvE
- **Max Players**: 32
- **Objective**: Survive waves of AI enemies
- **Win Condition**: Complete all waves

### Battle Royale
- **Max Players**: 32
- **Objective**: Be the last player standing
- **Win Condition**: Last player alive
- **Special**: Safe zone shrinks over time, damage outside zone

### Capture the Flag (CTF)
- **Max Players**: 32 (16 per team)
- **Objective**: Capture enemy flag and return to base
- **Win Condition**: First team to 3 captures

## Player Data

```typescript
interface PlayerData {
    id: string;
    name: string;
    position: Vector3;
    rotation: number; // Y rotation (yaw)
    turretRotation: number;
    aimPitch: number;
    health: number;
    maxHealth: number;
    status: "alive" | "dead" | "spectating";
    team?: number;
    kills: number;
    deaths: number;
    score: number;
    // Tank customization
    chassisType?: string;
    cannonType?: string;
    tankColor?: string;
    turretColor?: string;
}
```

## Server API

### GameServer Class

Main server class that manages WebSocket connections and game rooms.

```typescript
class GameServer {
    constructor(port: number);
    start(): void;
    shutdown(): void;
}
```

### GameRoom Class

Represents a single game instance.

```typescript
class GameRoom {
    id: string;
    mode: GameMode;
    maxPlayers: number;
    isActive: boolean;
    worldSeed: number;
    
    addPlayer(player: ServerPlayer): void;
    removePlayer(playerId: string): void;
    update(deltaTime: number): void;
    broadcastToRoom(message: ServerMessage, excludePlayerId?: string): void;
}
```

### ServerPlayer Class

Represents a connected player on the server.

```typescript
class ServerPlayer {
    id: string;
    name: string;
    position: Vector3;
    rotation: number;
    health: number;
    status: PlayerStatus;
    kills: number;
    deaths: number;
    
    updateFromInput(input: PlayerInput): void;
    takeDamage(damage: number): boolean;
    respawn(position: Vector3, health?: number): void;
}
```

## Client API

### MultiplayerManager Class

Main client-side class for multiplayer communication.

```typescript
class MultiplayerManager {
    constructor(serverUrl?: string);
    
    // Connection
    connect(serverUrl: string): void;
    disconnect(): void;
    isConnected(): boolean;
    
    // Room management
    quickPlay(mode: GameMode): void;
    createRoom(mode: GameMode, maxPlayers?: number, isPrivate?: boolean): void;
    joinRoom(roomId: string, password?: string): void;
    leaveRoom(): void;
    
    // Gameplay
    sendPlayerInput(input: PlayerInput): void;
    sendPlayerShoot(data: ShootData): void;
    sendChatMessage(message: string): void;
    
    // Callbacks
    onConnected(callback: () => void): void;
    onGameStart(callback: (data: GameStartData) => void): void;
    onGameEnd(callback: (data: GameEndData) => void): void;
    onPlayerStates(callback: (players: PlayerData[]) => void): void;
    onPlayerKilled(callback: (data: KillData) => void): void;
}
```

### NetworkPlayerTank Class

Visual representation of a network player's tank.

```typescript
class NetworkPlayerTank {
    playerId: string;
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    
    update(deltaTime: number): void;
    dispose(): void;
}
```

## Firebase Integration

### Authentication

```typescript
// Initialize Firebase
await firebaseService.initialize();

// Get current user ID
const userId = firebaseService.getCurrentUserId();
```

### Player Stats

```typescript
// Get player stats
const stats = await firebaseService.getPlayerStats(playerId);

// Update player stats
await firebaseService.updatePlayerStats({
    kills: 10,
    deaths: 5,
    wins: 1
});

// Increment stat
await firebaseService.incrementStat("kills", 1);
```

### Match History

```typescript
// Save match history
const matchHistory: MatchHistory = {
    matchId: "match_123",
    mode: "ffa",
    result: "win",
    kills: 10,
    deaths: 5,
    duration: 300,
    timestamp: Timestamp.now()
};
await firebaseService.saveMatchHistory(matchHistory);

// Get match history
const history = await firebaseService.getMatchHistory(limit);
```

### Leaderboard

```typescript
// Get leaderboard
const leaderboard = await firebaseService.getLeaderboard("kills", 10);
```

## WebSocket Protocol

### Connection

```
ws://localhost:8080
```

### Message Serialization

Messages are serialized as JSON strings:

```typescript
const message = {
    type: "player_input",
    data: { throttle: 1, steer: 0, ... },
    timestamp: Date.now()
};
const serialized = JSON.stringify(message);
ws.send(serialized);
```

### Message Deserialization

```typescript
const message = JSON.parse(data);
switch (message.type) {
    case "player_states":
        handlePlayerStates(message.data);
        break;
    // ...
}
```

## Examples

### Basic Client Connection

```typescript
import { MultiplayerManager } from "./multiplayer";

const multiplayer = new MultiplayerManager("ws://localhost:8080");

multiplayer.onConnected(() => {
    console.log("Connected to server");
    multiplayer.quickPlay("ffa");
});

multiplayer.onGameStart((data) => {
    console.log("Game started:", data.mode);
});

multiplayer.onPlayerStates((players) => {
    players.forEach(player => {
        updatePlayerVisuals(player);
    });
});
```

### Server-Side Room Management

```typescript
import { GameServer } from "./gameServer";

const server = new GameServer(8080);
server.start();

// Server automatically handles:
// - Client connections
// - Room creation/joining
// - Matchmaking
// - Game loop updates
```

### Custom Game Mode

```typescript
import { GameModeRules } from "./gameModes";

class CustomMode implements GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Custom spawn logic
        return new Vector3(0, 5, 0);
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Custom win condition
        return null;
    }
    
    getMaxScore(): number {
        return 100;
    }
    
    getRespawnDelay(): number {
        return 5000;
    }
}
```

## Error Handling

### Client Errors

```typescript
multiplayer.onError((error) => {
    console.error("Multiplayer error:", error);
    // Attempt reconnection
    setTimeout(() => multiplayer.connect(serverUrl), 5000);
});
```

### Server Validation

The server validates all inputs:

- **Position**: Must be within bounds, no teleporting
- **Speed**: Must be physically possible
- **Input Rate**: Max 60 inputs/second
- **Shoot Rate**: Max 10 shots/second

Invalid inputs are rejected and logged.

## Rate Limiting

### Client Limits
- **Input**: 60 Hz (16.67ms between inputs)
- **Shoot**: 10 shots/second max
- **Chat**: 5 messages/second max

### Server Limits
- **Input Processing**: 60 Hz
- **State Broadcast**: 60 Hz
- **Validation**: Every input

## Security

### Anti-Cheat

The server implements basic anti-cheat:

1. **Speed Validation**: Checks if movement speed is physically possible
2. **Teleport Detection**: Detects impossible position changes
3. **Input Validation**: Validates all input ranges and types
4. **Rate Limiting**: Prevents input spam
5. **Suspicious Movement Detection**: Detects bot-like patterns

### Violation Handling

- **Warning**: First violation logged
- **Revert**: Invalid position/input reverted
- **Kick**: After 10+ violations, player is disconnected

## Performance

### Optimization

- **Delta Compression**: Only changed data sent
- **Priority System**: Important events sent immediately
- **Interpolation**: Client-side smoothing for 60 Hz updates
- **Lag Compensation**: Server-side rewind for hit validation

### Network Bandwidth

- **Player States**: ~500 bytes per update (60 Hz) = ~30 KB/s per player
- **Events**: ~100-500 bytes per event (variable)
- **Total**: ~1-2 MB/s for full 32-player match

## Versioning

API version is included in connection messages:

```typescript
{
    type: "connected",
    data: {
        playerId: "...",
        serverVersion: "1.0.0"
    }
}
```

Clients should check version compatibility before connecting.

---

**Last Updated**: 2025
**API Version**: 1.0.0
