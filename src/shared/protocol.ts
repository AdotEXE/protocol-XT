import type { ClientMessage, ServerMessage } from "./messages";
// Dynamic import for MessagePack (only loaded when USE_BINARY_SERIALIZATION is true)
// import { encode, decode } from "@msgpack/msgpack";

/**
 * Protocol utilities for message serialization/deserialization
 * Supports both JSON (backward compatibility) and MessagePack (binary) formats
 */

// Configuration flag - set to true to enable binary serialization
// Uses custom binary format with quantization (no external dependencies)
const USE_BINARY_SERIALIZATION = true;

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
 * Custom binary serializer with quantization
 * Optimizes numbers: positions (int16 with 0.1 precision), rotations (int16 with 0.001 precision)
 */
function serializeToBinary(obj: any): ArrayBuffer {
    const parts: Uint8Array[] = [];
    
    function writeString(str: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        // Write length as uint16, then bytes
        const lengthBytes = new Uint8Array(2);
        new DataView(lengthBytes.buffer).setUint16(0, bytes.length, true);
        parts.push(lengthBytes);
        parts.push(bytes);
    }
    
    function writeNumber(num: number, quantize: boolean = false, precision: number = 1): void {
        if (quantize) {
            // Quantize: round to precision and convert to int16
            const quantized = Math.round(num / precision);
            const clamped = Math.max(-32768, Math.min(32767, quantized));
            const bytes = new Uint8Array(2);
            new DataView(bytes.buffer).setInt16(0, clamped, true);
            parts.push(bytes);
        } else {
            // Full float32
            const bytes = new Uint8Array(4);
            new DataView(bytes.buffer).setFloat32(0, num, true);
            parts.push(bytes);
        }
    }
    
    function serializeValue(value: any, path: string = ""): void {
        if (value === null || value === undefined) {
            parts.push(new Uint8Array([0])); // null marker
            return;
        }
        
        const type = typeof value;
        
        if (type === "boolean") {
            parts.push(new Uint8Array([value ? 2 : 1])); // true: 2, false: 1
        } else if (type === "number") {
            // Check if this is a position/rotation field for quantization
            const isPosition = path.includes("position") || path.includes("x") || path.includes("y") || path.includes("z");
            const isRotation = path.includes("rotation") || path.includes("aimPitch");
            
            if (isPosition) {
                writeNumber(value, true, 0.1); // Quantize positions to 0.1 units
            } else if (isRotation) {
                writeNumber(value, true, 0.001); // Quantize rotations to 0.001 rad
            } else if (Number.isInteger(value) && value >= 0 && value <= 255) {
                // Small integers as uint8
                parts.push(new Uint8Array([3, value])); // uint8 marker
            } else {
                writeNumber(value, false); // Full float32
            }
        } else if (type === "string") {
            parts.push(new Uint8Array([4])); // string marker
            writeString(value);
        } else if (Array.isArray(value)) {
            parts.push(new Uint8Array([5])); // array marker
            writeNumber(value.length, false);
            value.forEach((item, i) => serializeValue(item, `${path}[${i}]`));
        } else if (type === "object") {
            parts.push(new Uint8Array([6])); // object marker
            const keys = Object.keys(value);
            writeNumber(keys.length, false);
            keys.forEach(key => {
                writeString(key);
                serializeValue(value[key], path ? `${path}.${key}` : key);
            });
        }
    }
    
    serializeValue(obj);
    
    // Combine all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    
    return result.buffer;
}

/**
 * Custom binary deserializer
 */
function deserializeFromBinary(buffer: ArrayBuffer): any {
    const view = new DataView(buffer);
    let offset = 0;
    
    function readString(): string {
        const length = view.getUint16(offset, true);
        offset += 2;
        const bytes = new Uint8Array(buffer, offset, length);
        offset += length;
        return new TextDecoder().decode(bytes);
    }
    
    function readNumber(quantized: boolean = false, precision: number = 1): number {
        if (quantized) {
            const value = view.getInt16(offset, true);
            offset += 2;
            return value * precision;
        } else {
            const value = view.getFloat32(offset, true);
            offset += 4;
            return value;
        }
    }
    
    function deserializeValue(path: string = ""): any {
        const marker = view.getUint8(offset);
        offset++;
        
        if (marker === 0) return null;
        if (marker === 1) return false;
        if (marker === 2) return true;
        if (marker === 3) {
            const value = view.getUint8(offset);
            offset++;
            return value;
        }
        if (marker === 4) return readString();
        if (marker === 5) {
            const length = readNumber(false);
            const arr: any[] = [];
            for (let i = 0; i < length; i++) {
                arr.push(deserializeValue(`${path}[${i}]`));
            }
            return arr;
        }
        if (marker === 6) {
            const length = readNumber(false);
            const obj: any = {};
            for (let i = 0; i < length; i++) {
                const key = readString();
                const isPosition = path.includes("position") || key === "x" || key === "y" || key === "z";
                const isRotation = path.includes("rotation") || key === "aimPitch" || key === "rotation";
                
                if (isPosition) {
                    obj[key] = readNumber(true, 0.1);
                } else if (isRotation) {
                    obj[key] = readNumber(true, 0.001);
                } else {
                    obj[key] = deserializeValue(path ? `${path}.${key}` : key);
                }
            }
            return obj;
        }
        
        // Fallback: try to read as float32
        offset--; // Rewind
        return readNumber(false);
    }
    
    return deserializeValue();
}

/**
 * Serialize message to string (JSON) or ArrayBuffer (Binary)
 */
export function serializeMessage(message: ClientMessage | ServerMessage): string | ArrayBuffer {
    const plainObj = messageToPlainObject(message);
    
    if (USE_BINARY_SERIALIZATION) {
        // Use custom binary format with quantization
        return serializeToBinary(plainObj);
    } else {
        // Use JSON for backward compatibility
        return JSON.stringify(plainObj);
    }
}

/**
 * Deserialize message from string (JSON) or ArrayBuffer/Uint8Array (Binary)
 */
export function deserializeMessage<T extends ClientMessage | ServerMessage>(data: string | ArrayBuffer | Uint8Array): T {
    if (USE_BINARY_SERIALIZATION) {
        // Handle binary data
        let buffer: ArrayBuffer;
        if (data instanceof Uint8Array) {
            buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        } else if (data instanceof ArrayBuffer) {
            buffer = data;
        } else {
            // Fallback to JSON if string received
            const parsed = JSON.parse(data as string);
            return plainObjectToMessage<T>(parsed);
        }
        
        const decoded = deserializeFromBinary(buffer);
        return plainObjectToMessage<T>(decoded);
    } else {
        // Handle JSON string
        if (typeof data === "string") {
            const parsed = JSON.parse(data);
            return plainObjectToMessage<T>(parsed);
        } else {
            // Binary data received but binary serialization disabled - try to parse as JSON string
            const decoder = new TextDecoder();
            const str = decoder.decode(data);
            const parsed = JSON.parse(str);
            return plainObjectToMessage<T>(parsed);
        }
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

