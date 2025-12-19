import type { ClientMessage, ServerMessage } from "./messages";
// Dynamic import for MessagePack (only loaded when USE_BINARY_SERIALIZATION is true)
// import { encode, decode } from "@msgpack/msgpack";

/**
 * Protocol utilities for message serialization/deserialization
 * Supports both JSON (backward compatibility) and MessagePack (binary) formats
 */

// Configuration flag - set to true to enable binary serialization
const USE_BINARY_SERIALIZATION = false; // TODO: Enable after testing

/**
 * Convert message to plain object with Vector3 handling
 */
function messageToPlainObject(message: ClientMessage | ServerMessage): any {
    return JSON.parse(JSON.stringify(message, (_key, value) => {
        // Handle Vector3-like objects coming from Babylon Vector3
        if (
            value &&
            typeof value === "object" &&
            "x" in value &&
            "y" in value &&
            "z" in value &&
            !(value as { _type?: string })._type
        ) {
            return { x: value.x, y: value.y, z: value.z, _type: "Vector3" };
        }
        return value;
    }));
}

/**
 * Reconstruct object from plain object with Vector3 handling
 */
function plainObjectToMessage<T>(obj: any): T {
    const reconstructed = JSON.parse(JSON.stringify(obj, (_key, value) => {
        // Reconstruct Vector3
        if (value && typeof value === "object" && (value as { _type?: string })._type === "Vector3") {
            return { x: value.x, y: value.y, z: value.z };
        }
        return value;
    }));
    return reconstructed as T;
}

/**
 * Serialize message to string (JSON) or ArrayBuffer (MessagePack)
 */
export function serializeMessage(message: ClientMessage | ServerMessage): string | ArrayBuffer {
    const plainObj = messageToPlainObject(message);
    
    if (USE_BINARY_SERIALIZATION) {
        // Use MessagePack for binary serialization (dynamic import when needed)
        // const { encode } = await import("@msgpack/msgpack");
        // return encode(plainObj);
        throw new Error("MessagePack serialization is not enabled. Set USE_BINARY_SERIALIZATION to true and uncomment the import.");
    } else {
        // Use JSON for backward compatibility
        return JSON.stringify(plainObj);
    }
}

/**
 * Deserialize message from string (JSON) or ArrayBuffer/Uint8Array (MessagePack)
 */
export function deserializeMessage<T extends ClientMessage | ServerMessage>(data: string | ArrayBuffer | Uint8Array): T {
    if (USE_BINARY_SERIALIZATION) {
        // Handle MessagePack binary data (dynamic import when needed)
        // const { decode } = await import("@msgpack/msgpack");
        // const decoded = decode(data as ArrayBuffer | Uint8Array);
        // return plainObjectToMessage<T>(decoded);
        throw new Error("MessagePack deserialization is not enabled. Set USE_BINARY_SERIALIZATION to true and uncomment the import.");
    } else {
        // Handle JSON string
        const parsed = JSON.parse(data as string);
        return plainObjectToMessage<T>(parsed);
    }
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

