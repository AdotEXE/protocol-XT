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
    
    // Экранная вспышка
    screenFlash: {
        duration: 400,        // Общая длительность (мс)
        appearDuration: 100,  // Фаза появления (мс)
        fadeDuration: 300,    // Фаза затухания (мс)
        maxAlpha: 0.6,        // Максимальная alpha
        color: "#ff3333",     // Цвет вспышки
        gradientSteps: 3,     // Количество шагов градиента
        appearCurve: easing.easeOut,
        fadeCurve: easing.easeIn,
        // Интенсивность урона -> alpha
        intensityMapping: {
            critical: 0.8,    // >30 урона
            medium: 0.5,      // 15-30 урона
            low: 0.3          // <15 урона
        }
    }
};

