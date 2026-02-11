/**
 * @module optimization/DOMCache
 * @description Утилита для кэширования DOM элементов
 * 
 * ПРОБЛЕМА: 1254 вызова querySelector/getElementById разбросаны по коду
 * РЕШЕНИЕ: Кэшировать элементы при первом обращении
 * 
 * ОЖИДАЕМЫЙ ЭФФЕКТ: +3-5 FPS за счёт уменьшения DOM queries
 */

/**
 * DOMCache - глобальный кэш для DOM элементов
 * 
 * Использование:
 * ```typescript
 * import { domCache } from '@client/optimization/DOMCache';
 * 
 * // Вместо document.getElementById('my-element')
 * const element = domCache.getById('my-element');
 * 
 * // Вместо document.querySelector('.my-class')
 * const element = domCache.query('.my-class');
 * 
 * // Инвалидировать кэш при динамическом изменении DOM
 * domCache.invalidate('my-element');
 * domCache.invalidateAll();
 * ```
 */
class DOMCacheClass {
    private byIdCache: Map<string, HTMLElement | null> = new Map();
    private queryCache: Map<string, Element | null> = new Map();
    private queryAllCache: Map<string, NodeListOf<Element> | null> = new Map();

    /**
     * Получить элемент по ID (с кэшированием)
     */
    getById<T extends HTMLElement = HTMLElement>(id: string): T | null {
        if (!this.byIdCache.has(id)) {
            this.byIdCache.set(id, document.getElementById(id));
        }
        return this.byIdCache.get(id) as T | null;
    }

    /**
     * Получить элемент по CSS селектору (с кэшированием)
     */
    query<T extends Element = Element>(selector: string): T | null {
        if (!this.queryCache.has(selector)) {
            this.queryCache.set(selector, document.querySelector(selector));
        }
        return this.queryCache.get(selector) as T | null;
    }

    /**
     * Получить все элементы по CSS селектору (с кэшированием)
     * ВНИМАНИЕ: NodeList не обновляется при изменении DOM!
     */
    queryAll<T extends Element = Element>(selector: string): NodeListOf<T> | null {
        if (!this.queryAllCache.has(selector)) {
            this.queryAllCache.set(selector, document.querySelectorAll(selector));
        }
        return this.queryAllCache.get(selector) as NodeListOf<T> | null;
    }

    /**
     * Получить элемент без кэширования (для динамических элементов)
     */
    getByIdDirect<T extends HTMLElement = HTMLElement>(id: string): T | null {
        return document.getElementById(id) as T | null;
    }

    /**
     * Получить элемент без кэширования (для динамических элементов)
     */
    queryDirect<T extends Element = Element>(selector: string): T | null {
        return document.querySelector(selector) as T | null;
    }

    /**
     * Инвалидировать кэш для конкретного ID
     */
    invalidateById(id: string): void {
        this.byIdCache.delete(id);
    }

    /**
     * Инвалидировать кэш для конкретного селектора
     */
    invalidateQuery(selector: string): void {
        this.queryCache.delete(selector);
        this.queryAllCache.delete(selector);
    }

    /**
     * Инвалидировать весь кэш
     * Вызывайте при глобальных изменениях DOM (смена страницы, пересоздание UI)
     */
    invalidateAll(): void {
        this.byIdCache.clear();
        this.queryCache.clear();
        this.queryAllCache.clear();
    }

    /**
     * Получить статистику кэша
     */
    getStats(): { byId: number; query: number; queryAll: number } {
        return {
            byId: this.byIdCache.size,
            query: this.queryCache.size,
            queryAll: this.queryAllCache.size
        };
    }
}

/**
 * Глобальный экземпляр кэша
 */
export const domCache = new DOMCacheClass();

/**
 * Хелпер для создания локального кэша элементов в компоненте
 * 
 * Использование:
 * ```typescript
 * class MyComponent {
 *     private elements = createElementCache({
 *         container: '#my-container',
 *         button: '#my-button',
 *         input: 'input.my-input'
 *     });
 * 
 *     init() {
 *         this.elements.cache();
 *         this.elements.container?.addEventListener('click', ...);
 *     }
 * 
 *     destroy() {
 *         this.elements.clear();
 *     }
 * }
 * ```
 */
export function createElementCache<T extends Record<string, string>>(
    selectors: T
): { 
    cache(): void; 
    clear(): void; 
} & { [K in keyof T]: HTMLElement | null } {
    const result: any = {
        cache() {
            for (const [key, selector] of Object.entries(selectors)) {
                if (selector.startsWith('#')) {
                    result[key] = document.getElementById(selector.slice(1));
                } else {
                    result[key] = document.querySelector(selector);
                }
            }
        },
        clear() {
            for (const key of Object.keys(selectors)) {
                result[key] = null;
            }
        }
    };

    // Инициализируем ключи как null
    for (const key of Object.keys(selectors)) {
        result[key] = null;
    }

    return result;
}

