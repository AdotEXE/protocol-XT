import {
    serializeMessage,
    deserializeMessage,
    USE_BINARY_SERIALIZATION
} from "./protocol";
import { ClientMessageType, ServerMessageType, ClientMessage, ServerMessage } from "./messages";

console.log("Binary Serialization Enabled:", USE_BINARY_SERIALIZATION);

function testPlayerInput() {
    console.log("--- Testing PLAYER_INPUT ---");
    const inputMsg: ClientMessage = {
        type: ClientMessageType.PLAYER_INPUT,
        timestamp: 123456,
        data: {
            throttle: 0.85,  // Should be ~85/100
            steer: -0.5,     // Should be -50/100
            isShooting: true,
            turretRotation: 1.57, // PI/2
            aimPitch: 0.5,
            timestamp: 99999,
            position: { x: 100.5, y: 10.2, z: -50.1 },
            rotation: 3.14,
            chassisPitch: 0.1,
            chassisRoll: -0.1
        }
    };

    const serialized = serializeMessage(inputMsg);
    console.log(`Serialized Size: ${(serialized as ArrayBuffer).byteLength} bytes`);

    // Compare with JSON size
    const jsonStr = JSON.stringify(inputMsg);
    console.log(`JSON Size (Reference): ${jsonStr.length} bytes`);

    // Deserialize
    const deserialized = deserializeMessage(serialized as ArrayBuffer) as ClientMessage;

    console.log("Original Input:", JSON.stringify(inputMsg.data));
    console.log("Deserialized:", JSON.stringify(deserialized.data));

    // Validations
    if (Math.abs(deserialized.data.throttle - inputMsg.data.throttle) > 0.02) console.error("FAIL: Throttle mismatch");
    if (deserialized.data.isShooting !== inputMsg.data.isShooting) console.error("FAIL: isShooting mismatch");
    if (Math.abs(deserialized.data.position.x - inputMsg.data.position.x) > 0.2) console.error("FAIL: Pos X mismatch");
}

function testPlayerStates() {
    console.log("\n--- Testing PLAYER_STATES ---");

    const players = [];
    for (let i = 0; i < 10; i++) {
        players.push({
            id: `player_${i}`,
            position: { x: i * 10.5, y: 0, z: i * -5.1 },
            rotation: 1.1,
            turretRotation: 2.2,
            aimPitch: 0.5,
            health: 95,
            maxHealth: 100,
            status: "alive",
            team: 1,
            name: `Player ${i}`,
            chassisPitch: 0.05,
            chassisRoll: -0.05,
            velocity: { x: 0.1, y: 0, z: 0 },
            angularVelocity: 0.01,
            turretAngularVelocity: 0.1
        });
    }

    const stateMsg: ServerMessage = {
        type: ServerMessageType.PLAYER_STATES,
        timestamp: Date.now(),
        data: {
            serverSequence: 1001,
            gameTime: 50000,
            isFullState: true,
            players: players
        }
    };

    const serialized = serializeMessage(stateMsg);
    console.log(`Serialized Size (10 players): ${(serialized as ArrayBuffer).byteLength} bytes`);

    const jsonStr = JSON.stringify(stateMsg);
    console.log(`JSON Size (Reference): ${jsonStr.length} bytes`);
    console.log(`Compression Ratio: ${(jsonStr.length / (serialized as ArrayBuffer).byteLength).toFixed(2)}x`);

    const deserialized = deserializeMessage(serialized as ArrayBuffer) as ServerMessage;

    if (deserialized.data.players.length !== 10) console.error("FAIL: Player count mismatch");
    console.log("First Player ID:", deserialized.data.players[0].id);
    console.log("First Player Pos:", deserialized.data.players[0].position);
}

testPlayerInput();
testPlayerStates();
