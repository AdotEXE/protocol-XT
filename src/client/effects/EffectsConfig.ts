/**
 * @module effects/EffectsConfig
 * @description Конфигурация эффектов
 */

import { easing } from "../utils/easing";

/**
 * Конфигурация прозрачности эффектов
 */
export interface AlphaConfig {
    start: number;      // Начальная alpha
    max: number;        // Максимальная alpha
    end: number;        // Конечная alpha
    curve: (t: number) => number; // Кривая анимации
}

/**
 * Конфигурация эффектов
 */
export const EFFECTS_CONFIG = {
    // Взрывы
    explosion: {
        alpha: {
            start: 0,
            max: 0.9,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig,
        duration: 320, // 8 кадров * 40ms
        ringAlpha: {
            start: 0.7,
            max: 0.7,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig,
        debrisAlpha: {
            start: 1,
            max: 1,
            end: 0.3,
            curve: easing.linear
        } as AlphaConfig,
        flashAlpha: {
            start: 0,
            max: 1,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig
    },
    
    // Вспышки ствола
    muzzleFlash: {
        alpha: {
            start: 0,
            max: 1,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig,
        duration: 90, // 3 кадра * 30ms
        appearFrames: 1, // Появление за 1 кадр
        fadeFrames: 2   // Затухание за 2 кадра
    },
    
    // Кольца эффектов (расходники)
    consumableRing: {
        alpha: {
            start: 0.8,
            max: 0.8,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig,
        particleAlpha: {
            start: 1,
            max: 0.8,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig,
        flashAlpha: {
            start: 0,
            max: 1,
            end: 0,
            curve: easing.easeOut
        } as AlphaConfig
    },
    
    // Частицы
    particle: {
        fadeCurve: easing.easeOut,
        fadePower: 1.5 // Степень для Math.pow(lifeRatio, fadePower)
    },
    
    // Экранная вспышка (УМЕНЬШЕНА для менее тревожного эффекта)
    screenFlash: {
        duration: 200,        // УМЕНЬШЕНО с 400 - более короткая вспышка
        appearDuration: 50,   // УМЕНЬШЕНО с 100 - быстрое появление
        fadeDuration: 150,    // УМЕНЬШЕНО с 300 - быстрое затухание
        maxAlpha: 0.15,       // ЗНАЧИТЕЛЬНО УМЕНЬШЕНО с 0.6 - почти незаметная вспышка
        color: "#ff4444",     // Немного светлее красный
        gradientSteps: 2,     // УМЕНЬШЕНО с 3 - меньше шагов градиента
        appearCurve: easing.easeOut,
        fadeCurve: easing.easeIn,
        // Интенсивность урона -> alpha (ЗНАЧИТЕЛЬНО УМЕНЬШЕНО)
        intensityMapping: {
            critical: 0.25,   // УМЕНЬШЕНО с 0.8 - критический урон всё ещё заметен
            medium: 0.12,     // УМЕНЬШЕНО с 0.5 - средний урон едва заметен
            low: 0.06         // УМЕНЬШЕНО с 0.3 - малый урон почти незаметен
        }
    },
    
    // Эффект критического здоровья (биение сердца + затемнение)
    criticalHealth: {
        threshold: 0.25,      // Порог HP для эффекта (25%)
        heartbeatSpeed: 1.5,  // Скорость биения (герц)
        maxDarkenAlpha: 0.3,  // Максимальное затемнение
        pulseIntensity: 0.15, // Интенсивность пульсации
        vignetteAlpha: 0.2    // Прозрачность виньетки
    }
};

