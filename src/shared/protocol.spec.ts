import { describe, it, expect } from "vitest";
import { serializeMessage, deserializeMessage, USE_BINARY_SERIALIZATION } from "./protocol";
import { ClientMessageType, ServerMessageType } from "./messages";
import type { ClientMessage, ServerMessage } from "./messages";

describe("protocol", () => {
    it("uses binary serialization", () => {
        expect(USE_BINARY_SERIALIZATION).toBe(true);
    });

    it("roundtrips PLAYER_INPUT", () => {
        const inputMsg: ClientMessage = {
            type: ClientMessageType.PLAYER_INPUT,
            timestamp: 123456,
            data: {
                throttle: 0.85,
                steer: -0.5,
                isShooting: true,
                turretRotation: 1.57,
                aimPitch: 0.5,
                timestamp: 99999,
                position: { x: 100.5, y: 10.2, z: -50.1 },
                rotation: 3.14,
                chassisPitch: 0.1,
                chassisRoll: -0.1,
            },
        };

        const serialized = serializeMessage(inputMsg) as ArrayBuffer;
        expect(serialized.byteLength).toBeGreaterThan(0);

        const deserialized = deserializeMessage(serialized) as ClientMessage;
        expect(deserialized.type).toBe(ClientMessageType.PLAYER_INPUT);
        expect(deserialized.data.isShooting).toBe(inputMsg.data.isShooting);
        expect(Math.abs(deserialized.data.throttle - inputMsg.data.throttle)).toBeLessThanOrEqual(0.02);
        expect(Math.abs(deserialized.data.position.x - inputMsg.data.position.x)).toBeLessThanOrEqual(0.2);
    });

    it("roundtrips PLAYER_STATES", () => {
        const players = Array.from({ length: 10 }, (_, i) => ({
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
            turretAngularVelocity: 0.1,
        }));

        const stateMsg: ServerMessage = {
            type: ServerMessageType.PLAYER_STATES,
            timestamp: Date.now(),
            data: {
                serverSequence: 1001,
                gameTime: 50000,
                isFullState: true,
                players,
            },
        };

        const serialized = serializeMessage(stateMsg) as ArrayBuffer;
        expect(serialized.byteLength).toBeGreaterThan(0);

        const deserialized = deserializeMessage(serialized) as ServerMessage;
        expect(deserialized.data.players.length).toBe(10);
        expect(deserialized.data.players[0].id).toBe("player_0");
        expect(deserialized.data.players[0].position.x).toBe(0);
    });
});
