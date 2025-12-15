import type { ClientMessage, ServerMessage } from "./messages";

/**
 * Protocol utilities for message serialization/deserialization
 * WebSocket sends JSON, but we need to handle Vector3 and other complex types
 */

export function serializeMessage(message: ClientMessage | ServerMessage): string {
    // Convert Vector3 and other complex types to plain objects
    const serialized = JSON.stringify(message, (key, value) => {
        // Handle Vector3
        if (value && typeof value === 'object' && 'x' !== undefined && 'y' !== undefined && 'z' !== undefined) {
            return { x: value.x, y: value.y, z: value.z, _type: 'Vector3' };
        }
        return value;
    });
    return serialized;
}

export function deserializeMessage<T extends ClientMessage | ServerMessage>(data: string): T {
    const parsed = JSON.parse(data, (key, value) => {
        // Reconstruct Vector3
        if (value && typeof value === 'object' && value._type === 'Vector3') {
            return { x: value.x, y: value.y, z: value.z };
        }
        return value;
    });
    return parsed as T;
}

export function createClientMessage(type: ClientMessage['type'], data: any): ClientMessage {
    return {
        type,
        data,
        timestamp: Date.now()
    };
}

export function createServerMessage(type: ServerMessage['type'], data: any): ServerMessage {
    return {
        type,
        data,
        timestamp: Date.now()
    };
}

