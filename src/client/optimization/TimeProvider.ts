/**
 * @module optimization/TimeProvider
 * @description Централизованный провайдер времени для оптимизации вызовов Date.now()
 * 
 * ПРОБЛЕМА: 599 вызовов Date.now() разбросаны по коду, каждый вызов - это syscall
 * РЕШЕНИЕ: Один вызов Date.now() в начале кадра, остальные используют кэшированное значение
 * 
 * ОЖИДАЕМЫЙ ЭФФЕКТ: +2-3 FPS за счёт уменьшения syscall overhead
 */

class TimeProviderClass {
    private _frameTime = 0;      // Время начала текущего кадра (ms)
    private _deltaTime = 0;      // Время между кадрами (ms)
    private _lastFrameTime = 0;  // Время начала предыдущего кадра
    private _frameCount = 0;     // Счётчик кадров
    
    // Для высокоточных измерений (performance.now())
    private _perfTime = 0;
    private _perfDelta = 0;
    private _lastPerfTime = 0;

    /**
     * КРИТИЧНО: Вызывать ОДИН раз в начале каждого кадра в GameUpdate.update()
     */
    update(): void {
        this._lastFrameTime = this._frameTime;
        this._frameTime = Date.now();
        this._deltaTime = this._frameTime - this._lastFrameTime;
        
        // Высокоточное время
        this._lastPerfTime = this._perfTime;
        this._perfTime = performance.now();
        this._perfDelta = this._perfTime - this._lastPerfTime;
        
        this._frameCount++;
    }

    /**
     * Текущее время кадра (эквивалент Date.now(), но кэшированный)
     * ИСПОЛЬЗОВАТЬ ВМЕСТО Date.now() везде кроме критических измерений
     */
    get now(): number {
        return this._frameTime;
    }

    /**
     * Время между кадрами в миллисекундах
     */
    get delta(): number {
        return this._deltaTime;
    }

    /**
     * Время между кадрами в секундах (для физики)
     */
    get deltaSeconds(): number {
        return this._deltaTime / 1000;
    }

    /**
     * Высокоточное время (performance.now(), кэшированное)
     */
    get perfNow(): number {
        return this._perfTime;
    }

    /**
     * Высокоточная дельта времени
     */
    get perfDelta(): number {
        return this._perfDelta;
    }

    /**
     * Номер текущего кадра
     */
    get frameCount(): number {
        return this._frameCount;
    }

    /**
     * Для обратной совместимости - возвращает текущее реальное время
     * ИСПОЛЬЗОВАТЬ ТОЛЬКО если нужно абсолютно точное время (например, для синхронизации)
     */
    getRealNow(): number {
        return Date.now();
    }
}

/**
 * Глобальный синглтон провайдера времени
 * 
 * Использование:
 * ```typescript
 * import { timeProvider } from '@client/optimization/TimeProvider';
 * 
 * // В GameUpdate.update() (один раз в начале кадра):
 * timeProvider.update();
 * 
 * // Везде в коде вместо Date.now():
 * const now = timeProvider.now;
 * const delta = timeProvider.delta;
 * ```
 */
export const timeProvider = new TimeProviderClass();

// Также экспортируем класс для типизации
export type TimeProvider = TimeProviderClass;

