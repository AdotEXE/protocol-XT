/**
 * Firebase Collector - Сбор метрик Firebase
 */

export interface FirebaseMetrics {
    firebase?: {
        online: boolean;
        lastRequest?: number;
    };
}

export class FirebaseCollector {
    private lastRequestTime: number = 0;
    private isOnline: boolean = false;
    
    async start(): Promise<void> {
        // Firebase status is inferred from server stats
        // This collector provides a placeholder for future expansion
    }
    
    async stop(): Promise<void> {
        // Cleanup if needed
    }
    
    async collect(): Promise<FirebaseMetrics> {
        // Check if Firebase is online based on last request time
        // If last request was within last 5 minutes, consider it online
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const isOnline = this.lastRequestTime > 0 && timeSinceLastRequest < 5 * 60 * 1000;
        
        return {
            firebase: {
                online: isOnline,
                lastRequest: this.lastRequestTime > 0 ? this.lastRequestTime : undefined
            }
        };
    }
    
    recordRequest(): void {
        this.lastRequestTime = Date.now();
        this.isOnline = true;
    }
    
    setOnline(online: boolean): void {
        this.isOnline = online;
    }
}


