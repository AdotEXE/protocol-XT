/**
 * @module mobile/HapticFeedback
 * @description Вибрация для мобильных устройств
 */

/**
 * Типы вибрации
 */
export enum HapticType {
    FIRE = 'fire',           // Короткая вибрация при выстреле
    HIT = 'hit',             // Двойная вибрация при попадании
    DEATH = 'death',         // Длинная вибрация при смерти
    DAMAGE = 'damage',       // Средняя вибрация при получении урона
    BUTTON = 'button'        // Лёгкая вибрация при нажатии кнопки
}

/**
 * Менеджер вибрации
 */
export class HapticFeedback {
    private enabled: boolean = true;
    private supported: boolean = false;
    
    constructor() {
        this.supported = this.checkSupport();
    }
    
    /**
     * Проверить поддержку вибрации
     */
    private checkSupport(): boolean {
        return 'vibrate' in navigator;
    }
    
    /**
     * Включить/выключить вибрацию
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }
    
    /**
     * Проверить включена ли вибрация
     */
    isEnabled(): boolean {
        return this.enabled && this.supported;
    }
    
    /**
     * Вибрация при выстреле (короткая)
     */
    fire(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate(30);
    }
    
    /**
     * Вибрация при попадании (двойная)
     */
    hit(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate([30, 50, 30]);
    }
    
    /**
     * Вибрация при смерти (длинная)
     */
    death(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate([100, 50, 100, 50, 200]);
    }
    
    /**
     * Вибрация при получении урона
     */
    damage(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate(50);
    }
    
    /**
     * Вибрация при нажатии кнопки
     */
    button(): void {
        if (!this.isEnabled()) return;
        navigator.vibrate(10);
    }
    
    /**
     * Произвольная вибрация
     */
    vibrate(pattern: number | number[]): void {
        if (!this.isEnabled()) return;
        navigator.vibrate(pattern);
    }
    
    /**
     * Остановить вибрацию
     */
    stop(): void {
        if (this.supported) {
            navigator.vibrate(0);
        }
    }
}

// Глобальный экземпляр
let hapticInstance: HapticFeedback | null = null;

/**
 * Получить экземпляр HapticFeedback
 */
export function getHapticFeedback(): HapticFeedback {
    if (!hapticInstance) {
        hapticInstance = new HapticFeedback();
    }
    return hapticInstance;
}

export default HapticFeedback;

