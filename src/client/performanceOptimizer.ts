export class PerformanceOptimizer {
    private debounceTimers: Map<string, number> = new Map();
    private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
    private maxCacheSize = 100;
    
    /**
     * Дебаунсинг функции
     */
    debounce<T extends (...args: any[]) => any>(
        key: string,
        func: T,
        delay: number
    ): (...args: Parameters<T>) => void {
        return (...args: Parameters<T>) => {
            const existingTimer = this.debounceTimers.get(key);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
            
            const timer = window.setTimeout(() => {
                func(...args);
                this.debounceTimers.delete(key);
            }, delay);
            
            this.debounceTimers.set(key, timer);
        };
    }
    
    /**
     * Троттлинг функции
     */
    throttle<T extends (...args: any[]) => any>(
        _key: string,
        func: T,
        limit: number
    ): (...args: Parameters<T>) => void {
        let lastRun = 0;
        let timeout: number | null = null;
        
        return (...args: Parameters<T>) => {
            const now = Date.now();
            
            if (now - lastRun >= limit) {
                func(...args);
                lastRun = now;
            } else {
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = window.setTimeout(() => {
                    func(...args);
                    lastRun = Date.now();
                    timeout = null;
                }, limit - (now - lastRun));
            }
        };
    }
    
    /**
     * Кэширование с TTL
     */
    cacheGet<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > cached.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data as T;
    }
    
    /**
     * Сохранение в кэш
     */
    cacheSet<T>(key: string, data: T, ttl: number = 60000): void {
        // Ограничение размера кэша
        if (this.cache.size >= this.maxCacheSize) {
            // Удаляем самый старый элемент
            const oldestKey = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }
    
    /**
     * Очистка кэша
     */
    cacheClear(pattern?: string): void {
        if (pattern) {
            const regex = new RegExp(pattern);
            this.cache.forEach((_, key) => {
                if (regex.test(key)) {
                    this.cache.delete(key);
                }
            });
        } else {
            this.cache.clear();
        }
    }
    
    /**
     * Очистка устаревших элементов кэша
     */
    cleanupCache(): void {
        const now = Date.now();
        this.cache.forEach((value, key) => {
            if (now - value.timestamp > value.ttl) {
                this.cache.delete(key);
            }
        });
    }
    
    /**
     * Виртуализация списка (для больших списков)
     */
    createVirtualList<T>(
        items: T[],
        container: HTMLElement,
        renderItem: (item: T, index: number) => HTMLElement,
        itemHeight: number = 50,
        visibleCount: number = 10
    ): () => void {
        let scrollTop = 0;
        // const containerHeight = container.clientHeight; // reserved for future optimizations
        
        const update = () => {
            const start = Math.floor(scrollTop / itemHeight);
            const end = Math.min(start + visibleCount + 2, items.length);
            
            container.innerHTML = '';
            
            // Верхний спейсер
            const topSpacer = document.createElement('div');
            topSpacer.style.height = `${start * itemHeight}px`;
            container.appendChild(topSpacer);
            
            // Видимые элементы
            for (let i = start; i < end; i++) {
                const item = renderItem(items[i]!, i);
                container.appendChild(item);
            }
            
            // Нижний спейсер
            const bottomSpacer = document.createElement('div');
            bottomSpacer.style.height = `${(items.length - end) * itemHeight}px`;
            container.appendChild(bottomSpacer);
        };
        
        const onScroll = this.throttle('virtual-list-scroll', () => {
            scrollTop = container.scrollTop;
            update();
        }, 16); // ~60fps
        
        container.addEventListener('scroll', onScroll);
        update();
        
        // Возвращаем функцию очистки
        return () => {
            container.removeEventListener('scroll', onScroll);
        };
    }
    
    /**
     * Оптимизация обновлений UI
     */
    createUpdateBatcher<T>(
        _key: string,
        updateFn: (items: T[]) => void,
        batchSize: number = 10,
        delay: number = 100
    ): (item: T) => void {
        const batch: T[] = [];
        let timer: number | null = null;
        
        const flush = () => {
            if (batch.length > 0) {
                updateFn([...batch]);
                batch.length = 0;
            }
            timer = null;
        };
        
        return (item: T) => {
            batch.push(item);
            
            if (batch.length >= batchSize) {
                if (timer) clearTimeout(timer);
                flush();
            } else if (!timer) {
                timer = window.setTimeout(flush, delay);
            }
        };
    }
    
    /**
     * Очистка всех таймеров
     */
    cleanup(): void {
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
        this.cleanupCache();
    }
}

// ============================================
// СИНГЛТОН (LAZY INITIALIZATION)
// ============================================

let _performanceOptimizerInstance: PerformanceOptimizer | null = null;

export function getPerformanceOptimizer(): PerformanceOptimizer {
    if (!_performanceOptimizerInstance) {
        _performanceOptimizerInstance = new PerformanceOptimizer();
    }
    return _performanceOptimizerInstance;
}

/** Глобальный экземпляр (lazy proxy) */
export const performanceOptimizer: PerformanceOptimizer = new Proxy({} as PerformanceOptimizer, {
    get(_target, prop) {
        const instance = getPerformanceOptimizer();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getPerformanceOptimizer();
        (instance as any)[prop] = value;
        return true;
    }
});

