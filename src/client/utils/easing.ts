/**
 * @module utils/easing
 * @description Функции плавных кривых анимации
 */

/**
 * Функции плавных кривых для анимаций
 */
export const easing = {
    /**
     * Ease-out: быстрое начало, плавное окончание
     */
    easeOut: (t: number): number => {
        return 1 - Math.pow(1 - t, 3);
    },
    
    /**
     * Ease-in: плавное начало, быстрое окончание
     */
    easeIn: (t: number): number => {
        return Math.pow(t, 3);
    },
    
    /**
     * Ease-in-out: плавное начало и окончание
     */
    easeInOut: (t: number): number => {
        return t < 0.5 
            ? 4 * t * t * t 
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    
    /**
     * Linear: линейная интерполяция
     */
    linear: (t: number): number => {
        return t;
    },
    
    /**
     * Ease-out квадратичная (более мягкая)
     */
    easeOutQuad: (t: number): number => {
        return 1 - Math.pow(1 - t, 2);
    },
    
    /**
     * Ease-out экспоненциальная (очень плавное окончание)
     */
    easeOutExpo: (t: number): number => {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }
};

