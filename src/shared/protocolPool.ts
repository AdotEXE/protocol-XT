/**
 * @module shared/protocolPool
 * @description Object Pool для BinaryWriter и BinaryReader - переиспользование объектов для снижения GC нагрузки
 */

import { BinaryWriter, BinaryReader } from "./protocol";

/**
 * ObjectPool - универсальный пул объектов для переиспользования
 */
class ObjectPool<T> {
    private pool: T[] = [];
    private factory: () => T;
    private resetFn?: (obj: T) => void;
    private maxSize: number;

    constructor(factory: () => T, resetFn?: (obj: T) => void, maxSize: number = 10) {
        this.factory = factory;
        this.resetFn = resetFn;
        this.maxSize = maxSize;
    }

    acquire(): T {
        const obj = this.pool.pop();
        if (obj) {
            if (this.resetFn) {
                this.resetFn(obj);
            }
            return obj;
        }
        return this.factory();
    }

    release(obj: T): void {
        if (!obj) return;
        
        if (this.resetFn) {
            this.resetFn(obj);
        }
        
        if (this.pool.length < this.maxSize) {
            this.pool.push(obj);
        }
    }

    clear(): void {
        this.pool.length = 0;
    }
}

/**
 * Пул для BinaryWriter
 */
function resetBinaryWriter(writer: BinaryWriter): void {
    // BinaryWriter использует parts массив - очищаем его
    (writer as any).parts = [];
    (writer as any).totalLength = 0;
}

/**
 * Пул для BinaryReader
 * BinaryReader не требует сброса - создается новый для каждого буфера
 */

// Глобальные пулы для переиспользования
export const binaryWriterPool = new ObjectPool<BinaryWriter>(
    () => new BinaryWriter(),
    resetBinaryWriter,
    10
);
