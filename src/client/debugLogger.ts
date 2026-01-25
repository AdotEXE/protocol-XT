// Debug logger with batching to prevent ERR_INSUFFICIENT_RESOURCES
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/7699192a-02e9-4db6-a827-ba7abbb7e466';
const BATCH_SIZE = 100; // Batch logs before sending
const BATCH_DELAY_MS = 200; // Send batch every 200ms
const MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent requests

interface LogEntry {
    location: string;
    message: string;
    data: any;
    timestamp: number;
    sessionId: string;
    runId?: string;
    hypothesisId?: string;
}

class DebugLogger {
    private queue: LogEntry[] = [];
    private batchTimer: number | null = null;
    private requestCount = 0;
    private errorCount = 0;
    private isEnabled = false; // Disabled by default to prevent ERR_INSUFFICIENT_RESOURCES
    private pendingRequests = 0;
    private requestQueue: Array<() => void> = [];

    log(entry: LogEntry): void {
        if (!this.isEnabled) return;
        
        this.queue.push(entry);
        this.requestCount++;
        
        // Send immediately if queue is full
        if (this.queue.length >= BATCH_SIZE) {
            this.flush();
        } else if (this.batchTimer === null) {
            // Schedule batch send
            this.batchTimer = window.setTimeout(() => {
                this.flush();
            }, BATCH_DELAY_MS);
        }
    }

    private flush(): void {
        if (this.queue.length === 0) return;
        if (this.pendingRequests >= MAX_CONCURRENT_REQUESTS) {
            // Queue the flush for later
            this.requestQueue.push(() => this.flush());
            return;
        }
        
        const batch = this.queue.splice(0, BATCH_SIZE);
        this.batchTimer = null;
        this.pendingRequests++;
        
        // Send batch as single request
        fetch(LOG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch.length === 1 ? batch[0] : { logs: batch })
        }).then(() => {
            this.pendingRequests--;
            // Process next queued request
            if (this.requestQueue.length > 0) {
                const next = this.requestQueue.shift();
                if (next) next();
            }
        }).catch(() => {
            this.errorCount++;
            this.pendingRequests--;
            // Disable logging if too many errors
            if (this.errorCount > 10) {
                this.isEnabled = false;
                console.warn('[DebugLogger] Too many errors, logging disabled');
            }
            // Process next queued request
            if (this.requestQueue.length > 0) {
                const next = this.requestQueue.shift();
                if (next) next();
            }
        });
    }

    // Force flush remaining logs
    forceFlush(): void {
        if (this.batchTimer !== null) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        while (this.queue.length > 0) {
            this.flush();
        }
    }

    getStats() {
        return {
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            queueLength: this.queue.length,
            pendingRequests: this.pendingRequests,
            isEnabled: this.isEnabled
        };
    }
}

// ============================================
// СИНГЛТОН (LAZY INITIALIZATION)
// ============================================

let _debugLoggerInstance: DebugLogger | null = null;
let _beforeUnloadRegistered = false;

export function getDebugLogger(): DebugLogger {
    if (!_debugLoggerInstance) {
        _debugLoggerInstance = new DebugLogger();
        // Register beforeunload handler once
        if (typeof window !== 'undefined' && !_beforeUnloadRegistered) {
            _beforeUnloadRegistered = true;
            window.addEventListener('beforeunload', () => {
                _debugLoggerInstance?.forceFlush();
            });
        }
    }
    return _debugLoggerInstance;
}

/** Глобальный экземпляр (lazy proxy) */
export const debugLogger: DebugLogger = new Proxy({} as DebugLogger, {
    get(_target, prop) {
        const instance = getDebugLogger();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getDebugLogger();
        (instance as any)[prop] = value;
        return true;
    }
});

// Enable logging via console if needed: getDebugLogger()['isEnabled'] = true
// Expose stats via console: console.log(getDebugLogger().getStats())

