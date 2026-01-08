import type { ClientMessage, ServerMessage } from "./messages";
// Dynamic import for MessagePack (only loaded when USE_BINARY_SERIALIZATION is true)
// import { encode, decode } from "@msgpack/msgpack";

/**
 * Protocol utilities for message serialization/deserialization
 * Supports both JSON (backward compatibility) and MessagePack (binary) formats
 */

// Configuration flag - set to true to enable binary serialization
// Uses custom binary format with quantization (no external dependencies)
// ENABLED: Fixed custom binary format with proper type markers
export const USE_BINARY_SERIALIZATION = true;

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
 * Type markers for binary serialization
 * Each value type has a unique marker byte
 */
const TYPE_MARKERS = {
    NULL: 0,
    FALSE: 1,
    TRUE: 2,
    UINT8: 3,
    STRING: 4,
    ARRAY: 5,
    OBJECT: 6,
    FLOAT32: 7,    // Full precision float
    INT16_POS: 8,  // Quantized position (0.1 precision)
    INT16_ROT: 9,  // Quantized rotation (0.001 precision)
    INT32: 10,     // 32-bit integer
} as const;

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
    
    function writeInt16(num: number): void {
        const bytes = new Uint8Array(2);
        new DataView(bytes.buffer).setInt16(0, num, true);
        parts.push(bytes);
    }
    
    function writeFloat32(num: number): void {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setFloat32(0, num, true);
        parts.push(bytes);
    }
    
    function writeInt32(num: number): void {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setInt32(0, num, true);
        parts.push(bytes);
    }
    
    function serializeValue(value: any, path: string = ""): void {
        if (value === null || value === undefined) {
            parts.push(new Uint8Array([TYPE_MARKERS.NULL]));
            return;
        }
        
        const type = typeof value;
        
        if (type === "boolean") {
            parts.push(new Uint8Array([value ? TYPE_MARKERS.TRUE : TYPE_MARKERS.FALSE]));
        } else if (type === "number") {
            // Check if this is a position/rotation field for quantization
            const isPositionKey = path.includes("position") || path.endsWith(".x") || path.endsWith(".y") || path.endsWith(".z");
            const isRotation = path.includes("rotation") || path.includes("aimPitch") || path.includes("turretRotation");
            
            if (isPositionKey && !path.includes("rotation")) {
                // Quantize positions to 0.1 units
                const quantized = Math.round(value / 0.1);
                const clamped = Math.max(-32768, Math.min(32767, quantized));
                parts.push(new Uint8Array([TYPE_MARKERS.INT16_POS]));
                writeInt16(clamped);
            } else if (isRotation) {
                // Quantize rotations to 0.001 rad
                const quantized = Math.round(value / 0.001);
                const clamped = Math.max(-32768, Math.min(32767, quantized));
                parts.push(new Uint8Array([TYPE_MARKERS.INT16_ROT]));
                writeInt16(clamped);
            } else if (Number.isInteger(value) && value >= 0 && value <= 255) {
                // Small integers as uint8
                parts.push(new Uint8Array([TYPE_MARKERS.UINT8, value]));
            } else if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
                // 32-bit integers (for timestamps, IDs)
                parts.push(new Uint8Array([TYPE_MARKERS.INT32]));
                writeInt32(value);
            } else {
                // Full float32 for other numbers
                parts.push(new Uint8Array([TYPE_MARKERS.FLOAT32]));
                writeFloat32(value);
            }
        } else if (type === "string") {
            parts.push(new Uint8Array([TYPE_MARKERS.STRING]));
            writeString(value);
        } else if (Array.isArray(value)) {
            parts.push(new Uint8Array([TYPE_MARKERS.ARRAY]));
            // Write array length as uint16
            const lengthBytes = new Uint8Array(2);
            new DataView(lengthBytes.buffer).setUint16(0, value.length, true);
            parts.push(lengthBytes);
            value.forEach((item, i) => serializeValue(item, `${path}[${i}]`));
        } else if (type === "object") {
            parts.push(new Uint8Array([TYPE_MARKERS.OBJECT]));
            const keys = Object.keys(value);
            // Write object key count as uint16
            const countBytes = new Uint8Array(2);
            new DataView(countBytes.buffer).setUint16(0, keys.length, true);
            parts.push(countBytes);
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
    
    function readInt16(): number {
        const value = view.getInt16(offset, true);
        offset += 2;
        return value;
    }
    
    function readFloat32(): number {
        const value = view.getFloat32(offset, true);
        offset += 4;
        return value;
    }
    
    function readInt32(): number {
        const value = view.getInt32(offset, true);
        offset += 4;
        return value;
    }
    
    function readUint16(): number {
        const value = view.getUint16(offset, true);
        offset += 2;
        return value;
    }
    
    function deserializeValue(path: string = ""): any {
        if (offset >= buffer.byteLength) {
            return null;
        }
        
        const marker = view.getUint8(offset);
        offset++;
        
        switch (marker) {
            case TYPE_MARKERS.NULL:
                return null;
            case TYPE_MARKERS.FALSE:
                return false;
            case TYPE_MARKERS.TRUE:
                return true;
            case TYPE_MARKERS.UINT8: {
                const value = view.getUint8(offset);
                offset++;
                return value;
            }
            case TYPE_MARKERS.STRING:
                return readString();
            case TYPE_MARKERS.FLOAT32:
                return readFloat32();
            case TYPE_MARKERS.INT16_POS:
                // Dequantize position (0.1 precision)
                return readInt16() * 0.1;
            case TYPE_MARKERS.INT16_ROT:
                // Dequantize rotation (0.001 precision)
                return readInt16() * 0.001;
            case TYPE_MARKERS.INT32:
                return readInt32();
            case TYPE_MARKERS.ARRAY: {
                const length = readUint16();
                const arr: any[] = [];
                for (let i = 0; i < length; i++) {
                    arr.push(deserializeValue(`${path}[${i}]`));
                }
                return arr;
            }
            case TYPE_MARKERS.OBJECT: {
                const keyCount = readUint16();
                const obj: any = {};
                for (let i = 0; i < keyCount; i++) {
                    const key = readString();
                    obj[key] = deserializeValue(path ? `${path}.${key}` : key);
                }
                return obj;
            }
            default:
                // Unknown marker - skip and return null
                console.warn(`[Protocol] Unknown type marker: ${marker} at offset ${offset - 1}`);
                return null;
        }
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
 * Check if data is binary (Buffer, Uint8Array, or ArrayBuffer)
 */
function isBinaryData(data: any): data is Uint8Array | ArrayBuffer {
    // Check for Node.js Buffer first (it extends Uint8Array but instanceof may fail across realms)
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        return true;
    }
    // Check for ArrayBuffer
    if (data instanceof ArrayBuffer) {
        return true;
    }
    // Check for Uint8Array (and other typed arrays)
    if (data instanceof Uint8Array) {
        return true;
    }
    // Duck typing fallback: check for buffer-like properties
    if (data && typeof data === 'object' && typeof data.byteLength === 'number' && 
        (data.buffer instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        return true;
    }
    return false;
}

/**
 * Deserialize message from string (JSON) or ArrayBuffer/Uint8Array (Binary)
 */
export function deserializeMessage<T extends ClientMessage | ServerMessage>(data: string | ArrayBuffer | Uint8Array): T {
    if (USE_BINARY_SERIALIZATION) {
        // Handle binary data
        let buffer: ArrayBuffer;
        
        // Use our robust binary detection
        if (isBinaryData(data)) {
            // Handle Node.js Buffer and Uint8Array
            if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
                // Node.js Buffer - convert to ArrayBuffer
                buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            } else if (data instanceof Uint8Array) {
                buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            } else if (data instanceof ArrayBuffer) {
                buffer = data;
            } else {
                // Duck typed buffer-like object
                const view = data as Uint8Array;
                buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
            }
        } else if (typeof data === 'string') {
            // Fallback to JSON if string received
            const parsed = JSON.parse(data);
            return plainObjectToMessage<T>(parsed);
        } else {
            throw new Error(`Unsupported data type for deserialization: ${typeof data}`);
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

