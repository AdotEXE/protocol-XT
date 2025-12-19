/**
 * Network Collector - Сбор сетевых метрик
 */

export interface NetworkMetrics {
    networkIn?: number;
    networkOut?: number;
}

export class NetworkCollector {
    private bytesIn: number = 0;
    private bytesOut: number = 0;
    private lastReset: number = Date.now();
    private resetInterval: number = 1000; // Reset every second
    
    async start(): Promise<void> {
        // Network stats are tracked by ServerCollector
        // This collector just provides a placeholder for future expansion
    }
    
    async stop(): Promise<void> {
        // Cleanup if needed
    }
    
    async collect(): Promise<NetworkMetrics> {
        const now = Date.now();
        
        // Reset counters periodically
        if (now - this.lastReset > this.resetInterval) {
            // Calculate rate (bytes per second)
            const elapsed = (now - this.lastReset) / 1000;
            const inRate = this.bytesIn / elapsed;
            const outRate = this.bytesOut / elapsed;
            
            // Reset
            this.bytesIn = 0;
            this.bytesOut = 0;
            this.lastReset = now;
            
            return {
                networkIn: inRate,
                networkOut: outRate
            };
        }
        
        return {
            networkIn: 0,
            networkOut: 0
        };
    }
    
    recordBytesIn(bytes: number): void {
        this.bytesIn += bytes;
    }
    
    recordBytesOut(bytes: number): void {
        this.bytesOut += bytes;
    }
}







