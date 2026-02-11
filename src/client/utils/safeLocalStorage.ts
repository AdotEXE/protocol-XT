/**
 * Safe localStorage wrapper with try/catch and JSON validation
 * Prevents crashes when localStorage is unavailable or contains corrupted data
 */

import { logger } from "./logger";

export const safeLocalStorage = {
    /**
     * Get raw string value from localStorage
     */
    get(key: string, defaultValue: string = ''): string {
        try {
            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (e) {
            logger.warn(`[safeLocalStorage] Failed to get '${key}':`, e);
            return defaultValue;
        }
    },

    /**
     * Set raw string value to localStorage
     */
    set(key: string, value: string): boolean {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            logger.warn(`[safeLocalStorage] Failed to set '${key}':`, e);
            return false;
        }
    },

    /**
     * Get and parse JSON value from localStorage
     */
    getJSON<T>(key: string, defaultValue: T): T {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return defaultValue;

            const parsed = JSON.parse(raw);
            // Basic type validation - if defaultValue is object, parsed should be object
            if (typeof defaultValue === 'object' && defaultValue !== null) {
                if (typeof parsed !== 'object' || parsed === null) {
                    logger.warn(`[safeLocalStorage] Invalid JSON type for '${key}', using default`);
                    return defaultValue;
                }
            }
            return parsed as T;
        } catch (e) {
            logger.warn(`[safeLocalStorage] Failed to parse JSON for '${key}':`, e);
            return defaultValue;
        }
    },

    /**
     * Stringify and set JSON value to localStorage
     */
    setJSON<T>(key: string, value: T): boolean {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            logger.warn(`[safeLocalStorage] Failed to set JSON for '${key}':`, e);
            return false;
        }
    },

    /**
     * Remove a key from localStorage
     */
    remove(key: string): boolean {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            logger.warn(`[safeLocalStorage] Failed to remove '${key}':`, e);
            return false;
        }
    },

    /**
     * Check if localStorage is available
     */
    isAvailable(): boolean {
        try {
            const testKey = '__safeLocalStorage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Get number value with validation
     */
    getNumber(key: string, defaultValue: number): number {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return defaultValue;
            const num = parseFloat(raw);
            return isNaN(num) ? defaultValue : num;
        } catch (e) {
            return defaultValue;
        }
    },

    /**
     * Get boolean value
     */
    getBoolean(key: string, defaultValue: boolean): boolean {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return defaultValue;
            return raw === 'true';
        } catch (e) {
            return defaultValue;
        }
    }
};
