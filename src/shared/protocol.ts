import { ClientMessageType, ServerMessageType } from "./messages";
import type { ClientMessage, ServerMessage } from "./messages";
import { binaryWriterPool } from "./protocolPool";
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
 * Packet Types for the new hybrid protocol
 * 0 = Legacy (Generic Binary with metadata)
 * 1 = Optimized PLAYER_INPUT (Schema-based)
 * 2 = Optimized PLAYER_STATES (Schema-based)
 */
enum PacketType {
    LEGACY = 0,
    PLAYER_INPUT = 1,
    PLAYER_STATES = 2,
    PROJECTILE_SPAWN = 3
}

/**
 * Binary Writer Helper
 * Little Endian by default
 */
export class BinaryWriter {
    private parts: Uint8Array[] = [];
    private totalLength = 0;

    writeUint8(value: number): void {
        const bytes = new Uint8Array(1);
        bytes[0] = value;
        this.parts.push(bytes);
        this.totalLength += 1;
    }

    writeInt8(value: number): void {
        const bytes = new Uint8Array(1);
        new Int8Array(bytes.buffer)[0] = value;
        this.parts.push(bytes);
        this.totalLength += 1;
    }

    writeUint16(value: number): void {
        const bytes = new Uint8Array(2);
        new DataView(bytes.buffer).setUint16(0, value, true);
        this.parts.push(bytes);
        this.totalLength += 2;
    }

    writeInt16(value: number): void {
        const bytes = new Uint8Array(2);
        new DataView(bytes.buffer).setInt16(0, value, true);
        this.parts.push(bytes);
        this.totalLength += 2;
    }

    writeUint32(value: number): void {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setUint32(0, value, true);
        this.parts.push(bytes);
        this.totalLength += 4;
    }

    writeInt32(value: number): void {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setInt32(0, value, true);
        this.parts.push(bytes);
        this.totalLength += 4;
    }

    writeFloat32(value: number): void {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setFloat32(0, value, true);
        this.parts.push(bytes);
        this.totalLength += 4;
    }

    writeString(str: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        // Length prefixed (uint16)
        this.writeUint16(bytes.length);
        this.parts.push(bytes);
        this.totalLength += bytes.length;
    }

    writeBoolean(value: boolean): void {
        this.writeUint8(value ? 1 : 0);
    }

    // Alias for explicit clarity
    writeBytes(bytes: Uint8Array): void {
        this.parts.push(bytes);
        this.totalLength += bytes.length;
    }

    getBuffer(): ArrayBuffer {
        const result = new Uint8Array(this.totalLength);
        let offset = 0;
        for (const part of this.parts) {
            result.set(part, offset);
            offset += part.length;
        }
        return result.buffer;
    }
}

/**
 * Binary Reader Helper
 */
export class BinaryReader {
    private view: DataView;
    private offset = 0;
    private decoder = new TextDecoder();

    constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
    }

    get isEOF(): boolean {
        return this.offset >= this.view.byteLength;
    }

    readUint8(): number {
        const val = this.view.getUint8(this.offset);
        this.offset += 1;
        return val;
    }

    readInt8(): number {
        const val = this.view.getInt8(this.offset);
        this.offset += 1;
        return val;
    }

    readUint16(): number {
        const val = this.view.getUint16(this.offset, true);
        this.offset += 2;
        return val;
    }

    readInt16(): number {
        const val = this.view.getInt16(this.offset, true);
        this.offset += 2;
        return val;
    }

    readUint32(): number {
        const val = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readInt32(): number {
        const val = this.view.getInt32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readFloat32(): number {
        const val = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readString(): string {
        const len = this.readUint16();
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
        this.offset += len;
        return this.decoder.decode(bytes);
    }

    readBoolean(): boolean {
        return this.readUint8() !== 0;
    }
}

/**
 * Quantization Helpers
 */
const Q_POS_SCALE = 0.1; // 123.4 -> 1234
const Q_ROT_SCALE = 0.001; // 3.14159 -> 3142

function quantizePos(val: number): number {
    return Math.max(-32768, Math.min(32767, Math.round(val / Q_POS_SCALE)));
}

function dequantizePos(val: number): number {
    return val * Q_POS_SCALE;
}

function quantizeRot(val: number): number {
    return Math.max(-32768, Math.min(32767, Math.round(val / Q_ROT_SCALE)));
}

function dequantizeRot(val: number): number {
    return val * Q_ROT_SCALE;
}


// ==========================================
// SCHEMA SERIALIZERS
// ==========================================

function serializePlayerInput(writer: BinaryWriter, data: any): void {
    // Schema: 
    // [Throttle(i8)][Steer(i8)][IsShooting(bool)]
    // [TurretRot(i16)][AimPitch(i16)]
    // [Timestamp(u32)]
    // [PosX(i16)][PosY(i16)][PosZ(i16)][Rot(i16)]
    // [ChassisPitch(i16)][ChassisRoll(i16)]

    writer.writeInt8(Math.max(-127, Math.min(127, Math.round((data.throttle || 0) * 100)))); // -1.0 to 1.0 -> -100 to 100
    writer.writeInt8(Math.max(-127, Math.min(127, Math.round((data.steer || 0) * 100))));
    writer.writeBoolean(!!data.isShooting);

    writer.writeInt16(quantizeRot(data.turretRotation || 0));
    writer.writeInt16(quantizeRot(data.aimPitch || 0));

    writer.writeUint32(data.timestamp || 0);

    // Position/Rotation from physics
    const pos = data.position || { x: 0, y: 0, z: 0 };
    writer.writeInt16(quantizePos(pos.x));
    writer.writeInt16(quantizePos(pos.y));
    writer.writeInt16(quantizePos(pos.z));
    writer.writeInt16(quantizeRot(data.rotation || 0));

    // Tilt
    writer.writeInt16(quantizeRot(data.chassisPitch || 0));
    writer.writeInt16(quantizeRot(data.chassisRoll || 0));
}

function deserializePlayerInput(reader: BinaryReader): any {
    const throttle = reader.readInt8() / 100;
    const steer = reader.readInt8() / 100;
    const isShooting = reader.readBoolean();

    const turretRotation = dequantizeRot(reader.readInt16());
    const aimPitch = dequantizeRot(reader.readInt16());

    const timestamp = reader.readUint32();

    const px = dequantizePos(reader.readInt16());
    const py = dequantizePos(reader.readInt16());
    const pz = dequantizePos(reader.readInt16());
    const position = { x: px, y: py, z: pz, _type: "Vector3" };

    const rotation = dequantizeRot(reader.readInt16());

    const chassisPitch = dequantizeRot(reader.readInt16());
    const chassisRoll = dequantizeRot(reader.readInt16());

    return {
        throttle,
        steer,
        isShooting,
        turretRotation,
        aimPitch,
        timestamp,
        position,
        rotation,
        chassisPitch,
        chassisRoll
    };
}

function serializePlayerStates(writer: BinaryWriter, data: any): void {
    // Schema:
    // [ServerSeq(u32)][GameTime(u32)][IsFullState(bool)][PlayerCount(u8)]
    // [Player Data...]

    writer.writeUint32(data.serverSequence || 0);
    writer.writeUint32(data.gameTime || 0);
    writer.writeBoolean(!!data.isFullState);

    const players = Array.isArray(data.players) ? data.players : [];
    writer.writeUint8(players.length);

    for (const p of players) {
        // Player Schema:
        // [IDLen(u8)][IDStr] (Optimized string write - maybe later use ID mapping)
        // [PosX(i16)][PosY(i16)][PosZ(i16)]
        // [Rot(i16)][TurretRot(i16)][AimPitch(i16)]
        // [Pitch(i16)][Roll(i16)]
        // [Health(u8)][MaxHealth(u8)][Status(u8 enum)][Team(i8)]
        // [Color(u8 flags for existence) + strings if exist] ?? Keep it simple for now strings

        // For ID, we use standard writeString (u16 len) for safety, 
        // but could optimize to u8 len if IDs are short
        writer.writeString(p.id || "");

        const pos = p.position || { x: 0, y: 0, z: 0 };
        writer.writeInt16(quantizePos(pos.x));
        writer.writeInt16(quantizePos(pos.y));
        writer.writeInt16(quantizePos(pos.z));

        writer.writeInt16(quantizeRot(p.rotation || 0));
        writer.writeInt16(quantizeRot(p.turretRotation || 0));
        writer.writeInt16(quantizeRot(p.aimPitch || 0));

        writer.writeInt16(quantizeRot(p.chassisPitch || 0));
        writer.writeInt16(quantizeRot(p.chassisRoll || 0));

        // Velocities for prediction
        const vel = p.velocity || { x: 0, y: 0, z: 0 };
        writer.writeInt16(quantizePos(vel.x)); // Velocity reuse pos scale? usually velocities are small. 0.1 is 10cm/s precision. 
        writer.writeInt16(quantizePos(vel.y));
        writer.writeInt16(quantizePos(vel.z));
        writer.writeFloat32(p.angularVelocity || 0); // Keep float for smooth rotation pred
        writer.writeFloat32(p.turretAngularVelocity || 0);

        writer.writeUint8(Math.max(0, Math.min(255, p.health || 0)));
        writer.writeUint8(Math.max(0, Math.min(255, p.maxHealth || 100)));

        // Status mapping (alive=0, dead=1, spectating=2)
        let statusByte = 0;
        if (p.status === "dead") statusByte = 1;
        else if (p.status === "spectating") statusByte = 2;
        writer.writeUint8(statusByte);

        writer.writeInt8(p.team !== undefined ? p.team : -1);

        // Dynamic/Rare fields (Name, Colors) - send only if Full State or Changed?
        // For simpler protocol, let's include Name only if isFullState=true or just always for now
        // to avoid complexity of delta-tracking in serializer.
        // Actually, let's just write strings. Bandwidth saving comes from omitted field names primarily.
        writer.writeString(p.name || "");
        writer.writeString(p.chassisType || "");
        writer.writeString(p.cannonType || "");

        // КРИТИЧНО: Добавлены цвета танка и башни для мультиплеера
        writer.writeString(p.tankColor || "");
        writer.writeString(p.turretColor || "");

        // Modules serialization
        const modules = p.modules || [];
        writer.writeUint8(modules.length);
        for (const module of modules) {
            writer.writeString(module);
        }
    }
}

function deserializePlayerStates(reader: BinaryReader): any {
    const serverSequence = reader.readUint32();
    const gameTime = reader.readUint32();
    const isFullState = reader.readBoolean();
    const playerCount = reader.readUint8();

    const players = [];

    for (let i = 0; i < playerCount; i++) {
        const id = reader.readString();

        const px = dequantizePos(reader.readInt16());
        const py = dequantizePos(reader.readInt16());
        const pz = dequantizePos(reader.readInt16());
        const position = { x: px, y: py, z: pz, _type: "Vector3" };

        const rotation = dequantizeRot(reader.readInt16());
        const turretRotation = dequantizeRot(reader.readInt16());
        const aimPitch = dequantizeRot(reader.readInt16());

        const chassisPitch = dequantizeRot(reader.readInt16());
        const chassisRoll = dequantizeRot(reader.readInt16());

        const vx = dequantizePos(reader.readInt16());
        const vy = dequantizePos(reader.readInt16());
        const vz = dequantizePos(reader.readInt16());
        const velocity = { x: vx, y: vy, z: vz, _type: "Vector3" };

        const angularVelocity = reader.readFloat32();
        const turretAngularVelocity = reader.readFloat32();

        const health = reader.readUint8();
        const maxHealth = reader.readUint8();

        const statusByte = reader.readUint8();
        let status = "alive";
        if (statusByte === 1) status = "dead";
        else if (statusByte === 2) status = "spectating";

        const teamByte = reader.readInt8();
        const team = teamByte === -1 ? undefined : teamByte;

        const name = reader.readString();
        const chassisType = reader.readString();
        const cannonType = reader.readString();

        // КРИТИЧНО: Читаем цвета танка и башни для мультиплеера
        const tankColor = reader.readString();
        const turretColor = reader.readString();

        // Modules deserialization
        const modulesCount = reader.readUint8();
        const modules: string[] = [];
        for (let m = 0; m < modulesCount; m++) {
            modules.push(reader.readString());
        }

        players.push({
            id,
            position,
            rotation,
            turretRotation,
            aimPitch,
            chassisPitch,
            chassisRoll,
            velocity,
            angularVelocity,
            turretAngularVelocity,
            health,
            maxHealth,
            status,
            team,
            name,
            chassisType,
            cannonType,
            tankColor,     // Добавлен цвет танка
            turretColor,   // Добавлен цвет башни
            modules // Add modules to player data
        });
    }

    return {
        serverSequence,
        gameTime,
        isFullState,
        players
    };
}


// ==========================================
// LEGACY SERIALIZERS
// ==========================================

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
 */
const TYPE_MARKERS = {
    NULL: 0,
    FALSE: 1,
    TRUE: 2,
    UINT8: 3,
    STRING: 4,
    ARRAY: 5,
    OBJECT: 6,
    FLOAT32: 7,
    INT16_POS: 8,
    INT16_ROT: 9,
    INT32: 10,
} as const;

function serializeToBinary(obj: any): ArrayBuffer {
    const parts: Uint8Array[] = [];

    function writeString(str: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
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
            const isPositionKey = path.includes("position") || path.endsWith(".x") || path.endsWith(".y") || path.endsWith(".z");
            const isRotation = path.includes("rotation") || path.includes("aimPitch") || path.includes("turretRotation");

            if (isPositionKey && !path.includes("rotation")) {
                const quantized = Math.round(value / 0.1);
                const clamped = Math.max(-32768, Math.min(32767, quantized));
                parts.push(new Uint8Array([TYPE_MARKERS.INT16_POS]));
                writeInt16(clamped);
            } else if (isRotation) {
                const quantized = Math.round(value / 0.001);
                const clamped = Math.max(-32768, Math.min(32767, quantized));
                parts.push(new Uint8Array([TYPE_MARKERS.INT16_ROT]));
                writeInt16(clamped);
            } else if (Number.isInteger(value) && value >= 0 && value <= 255) {
                parts.push(new Uint8Array([TYPE_MARKERS.UINT8, value]));
            } else if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
                parts.push(new Uint8Array([TYPE_MARKERS.INT32]));
                writeInt32(value);
            } else {
                parts.push(new Uint8Array([TYPE_MARKERS.FLOAT32]));
                writeFloat32(value);
            }
        } else if (type === "string") {
            parts.push(new Uint8Array([TYPE_MARKERS.STRING]));
            writeString(value);
        } else if (Array.isArray(value)) {
            parts.push(new Uint8Array([TYPE_MARKERS.ARRAY]));
            const lengthBytes = new Uint8Array(2);
            new DataView(lengthBytes.buffer).setUint16(0, value.length, true);
            parts.push(lengthBytes);
            value.forEach((item, i) => serializeValue(item, `${path}[${i}]`));
        } else if (type === "object") {
            parts.push(new Uint8Array([TYPE_MARKERS.OBJECT]));
            const keys = Object.keys(value);
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

    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }

    return result.buffer;
}

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
        if (offset >= buffer.byteLength) return null;

        const marker = view.getUint8(offset);
        offset++;

        switch (marker) {
            case TYPE_MARKERS.NULL: return null;
            case TYPE_MARKERS.FALSE: return false;
            case TYPE_MARKERS.TRUE: return true;
            case TYPE_MARKERS.UINT8: {
                const value = view.getUint8(offset);
                offset++;
                return value;
            }
            case TYPE_MARKERS.STRING: return readString();
            case TYPE_MARKERS.FLOAT32: return readFloat32();
            case TYPE_MARKERS.INT16_POS: return readInt16() * 0.1;
            case TYPE_MARKERS.INT16_ROT: return readInt16() * 0.001;
            case TYPE_MARKERS.INT32: return readInt32();
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
                console.warn(`[Protocol] Unknown type marker: ${marker} at offset ${offset - 1}`);
                return null;
        }
    }

    return deserializeValue();
}


// ==========================================
// PUBLIC API
// ==========================================

export function serializeMessage(message: ClientMessage | ServerMessage): string | ArrayBuffer {
    if (USE_BINARY_SERIALIZATION) {
        // ОПТИМИЗАЦИЯ: Используем object pool для BinaryWriter для снижения GC нагрузки
        const writer = binaryWriterPool.acquire();

        try {
            // CRITICAL FIX: Force JSON for CREATE_ROOM to avoid binary serialization issues with complex map data
            if (message.type === ClientMessageType.CREATE_ROOM) {
                 const plainObj = messageToPlainObject(message);
                 return JSON.stringify(plainObj);
            }

            if (message.type === ClientMessageType.PLAYER_INPUT) {
                writer.writeUint8(PacketType.PLAYER_INPUT);
                serializePlayerInput(writer, message.data);
                return writer.getBuffer();
            }
            else if (message.type === ServerMessageType.PLAYER_STATES) {
                writer.writeUint8(PacketType.PLAYER_STATES);
                serializePlayerStates(writer, message.data);
                return writer.getBuffer();
            }
            else {
                // Legacy/Generic Fallback
                // Wrap the whole message object like before
                const plainObj = messageToPlainObject(message);
                const legacyBuffer = serializeToBinary(plainObj);

                // Write LEAGCY type marker + legacy buffer
                // We need to concat [0] + legacyBuffer
                const result = new Uint8Array(1 + legacyBuffer.byteLength);
                result[0] = PacketType.LEGACY;
                result.set(new Uint8Array(legacyBuffer), 1);
                return result.buffer;
            }
        } finally {
            // Освобождаем writer обратно в pool
            binaryWriterPool.release(writer);
        }
    } else {
        const plainObj = messageToPlainObject(message);
        return JSON.stringify(plainObj);
    }
}

function isBinaryData(data: any): data is Uint8Array | ArrayBuffer {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return true;
    if (data instanceof ArrayBuffer) return true;
    if (data instanceof Uint8Array) return true;
    if (data && typeof data === 'object' && typeof data.byteLength === 'number' &&
        (data.buffer instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        return true;
    }
    return false;
}

export function deserializeMessage<T extends ClientMessage | ServerMessage>(data: string | ArrayBuffer | Uint8Array): T {
    if (USE_BINARY_SERIALIZATION) {
        let buffer: ArrayBuffer;

        if (isBinaryData(data)) {
            if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
                buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            } else if (data instanceof Uint8Array) {
                buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
            } else if (data instanceof ArrayBuffer) {
                buffer = data;
            } else {
                const view = data as Uint8Array;
                buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
            }
        } else if (typeof data === 'string') {
            // Fallback
            const parsed = JSON.parse(data);
            return plainObjectToMessage<T>(parsed);
        } else {
            throw new Error(`Unsupported data type for deserialization: ${typeof data}`);
        }

        // Read Packet Type
        const reader = new BinaryReader(buffer);
        const packetType = reader.readUint8();

        if (packetType === PacketType.PLAYER_INPUT) {
            const decodedData = deserializePlayerInput(reader);
            return {
                type: ClientMessageType.PLAYER_INPUT,
                data: decodedData,
                timestamp: decodedData.timestamp // Provide top-level timestamp too
            } as T;
        }
        else if (packetType === PacketType.PLAYER_STATES) {
            const decodedData = deserializePlayerStates(reader);
            return {
                type: ServerMessageType.PLAYER_STATES,
                data: decodedData,
                timestamp: Date.now() // Synthesize timestamp
            } as T;
        }
        else if (packetType === PacketType.LEGACY) {
            // Decouple the legacy buffer (skip first byte)
            const legacyBuffer = buffer.slice(1);
            const decoded = deserializeFromBinary(legacyBuffer);
            return plainObjectToMessage<T>(decoded);
        }
        else {
            // Handle case where we might receive old-format packets (without prefix) during migration
            // If the first byte doesn't match known PacketTypes, it might be a legacy packet directly?
            // Existing legacy packets started with TYPE_MARKERS (0..10)
            // My PacketTypes are 0..3.
            // PacketType.LEGACY IS 0.
            // If we receive an OLD packet (pure legacy), it starts with TYPE_MARKERS.OBJECT = 6?
            // If first byte is 6, does it match PacketType.PLAYER_INPUT (1)? No.
            // So if packetType is NOT 0, 1, 2... treat as pure legacy?
            // Actually, best to strictly enforce new format if we control both ends.
            // But if we want safety:

            // Quick heuristic: If packetType is > 5 (likely a legacy TYPE_MARKER), treat whole buffer as legacy
            if (packetType > 5) {
                // HANDLE JSON FALLBACK: If marker is 123 ('{'), it's likely a JSON string sent as buffer
                if (packetType === 123) {
                    try {
                        const decoder = new TextDecoder();
                        const jsonStr = decoder.decode(buffer);
                        const parsed = JSON.parse(jsonStr);
                        return plainObjectToMessage<T>(parsed);
                    } catch (e) {
                        // Not JSON, continue to legacy binary
                    }
                }

                // Rewind and read whole buffer as legacy
                const decoded = deserializeFromBinary(buffer);
                return plainObjectToMessage<T>(decoded);
            }

            console.warn(`[Protocol] Unknown packet type: ${packetType}`);
            return {} as T;
        }
    } else {
        if (typeof data === "string") {
            const parsed = JSON.parse(data);
            return plainObjectToMessage<T>(parsed);
        } else {
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

