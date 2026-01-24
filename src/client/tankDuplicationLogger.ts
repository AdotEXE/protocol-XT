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

export const tankDuplicationLogger = new TankDuplicationLoggerClass();
