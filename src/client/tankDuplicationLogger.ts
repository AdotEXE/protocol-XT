/**
 * Tank Duplication Logger - Утилита для отладки дублирования танков
 */

class TankDuplicationLoggerClass {
    private enabled = false;

    log(message: string, ...args: unknown[]): void {
        if (this.enabled) {
            console.log(`[TankDuplication] ${message}`, ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.enabled) {
            console.warn(`[TankDuplication] ${message}`, ...args);
        }
    }

    error(message: string, ...args: unknown[]): void {
        console.error(`[TankDuplication] ${message}`, ...args);
    }

    enable(): void {
        this.enabled = true;
    }

    disable(): void {
        this.enabled = false;
    }
}

// LAZY SINGLETON
let _tankDuplicationLoggerInstance: TankDuplicationLoggerClass | null = null;

export function getTankDuplicationLogger(): TankDuplicationLoggerClass {
    if (!_tankDuplicationLoggerInstance) {
        _tankDuplicationLoggerInstance = new TankDuplicationLoggerClass();
    }
    return _tankDuplicationLoggerInstance;
}

export const tankDuplicationLogger: TankDuplicationLoggerClass = new Proxy({} as TankDuplicationLoggerClass, {
    get(_target, prop) {
        const instance = getTankDuplicationLogger();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getTankDuplicationLogger();
        (instance as any)[prop] = value;
        return true;
    }
});
