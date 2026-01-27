/**
 * @module optimization/TimerManager
 * @description Централизованный менеджер таймеров для замены множественных setInterval/setTimeout
 * 
 * Критично для производительности: 327 таймеров создают огромную нагрузку на event loop.
 * Этот менеджер объединяет все таймеры в один обновляемый через game loop.
 */

export interface Timer {
    id: string;
    callback: () => void;
    interval: number; // в миллисекундах
    lastRun: number;
    repeat: boolean; // true для setInterval, false для setTimeout
    paused: boolean;
}

/**
 * TimerManager - централизованное управление таймерами
 * 
 * Преимущества:
 * - Все таймеры обновляются в одном месте (game loop)
 * - Меньше нагрузки на event loop
 * - Легче отслеживать и отлаживать
 * - Можно приостанавливать/возобновлять все таймеры
 */
export class TimerManager {
    private timers: Map<string, Timer> = new Map();
    private nextId = 0;
    private isPaused = false;

    /**
     * Зарегистрировать таймер (аналог setInterval)
     */
    setInterval(callback: () => void, interval: number): string {
        const id = `timer_${this.nextId++}`;
        this.timers.set(id, {
            id,
            callback,
            interval,
            lastRun: Date.now(),
            repeat: true,
            paused: false
        });
        return id;
    }

    /**
     * Зарегистрировать одноразовый таймер (аналог setTimeout)
     */
    setTimeout(callback: () => void, delay: number): string {
        const id = `timer_${this.nextId++}`;
        this.timers.set(id, {
            id,
            callback,
            interval: delay,
            lastRun: Date.now(),
            repeat: false,
            paused: false
        });
        return id;
    }

    /**
     * Очистить таймер (аналог clearInterval/clearTimeout)
     */
    clear(id: string): void {
        this.timers.delete(id);
    }

    /**
     * Приостановить таймер
     */
    pause(id: string): void {
        const timer = this.timers.get(id);
        if (timer) {
            timer.paused = true;
        }
    }

    /**
     * Возобновить таймер
     */
    resume(id: string): void {
        const timer = this.timers.get(id);
        if (timer) {
            timer.paused = false;
            timer.lastRun = Date.now(); // Сброс времени для избежания мгновенного срабатывания
        }
    }

    /**
     * Приостановить все таймеры
     */
    pauseAll(): void {
        this.isPaused = true;
    }

    /**
     * Возобновить все таймеры
     */
    resumeAll(): void {
        this.isPaused = false;
        const now = Date.now();
        // Сброс времени для всех таймеров
        this.timers.forEach(timer => {
            timer.lastRun = now;
        });
    }

    /**
     * Обновить все таймеры (вызывать каждый кадр в game loop)
     */
    update(): void {
        if (this.isPaused) return;

        const now = Date.now();
        const timersToRemove: string[] = [];

        this.timers.forEach((timer, id) => {
            if (timer.paused) return;

            const elapsed = now - timer.lastRun;
            if (elapsed >= timer.interval) {
                try {
                    timer.callback();
                } catch (error) {
                    console.error(`[TimerManager] Error in timer ${id}:`, error);
                }

                if (timer.repeat) {
                    // setInterval - обновляем время последнего запуска
                    timer.lastRun = now;
                } else {
                    // setTimeout - удаляем после выполнения
                    timersToRemove.push(id);
                }
            }
        });

        // Удаляем одноразовые таймеры
        timersToRemove.forEach(id => this.timers.delete(id));
    }

    /**
     * Получить количество активных таймеров
     */
    getActiveTimerCount(): number {
        return this.timers.size;
    }

    /**
     * Очистить все таймеры
     */
    clearAll(): void {
        this.timers.clear();
    }

    /**
     * Получить статистику
     */
    getStats(): { activeTimers: number; pausedTimers: number } {
        let pausedCount = 0;
        this.timers.forEach(timer => {
            if (timer.paused) pausedCount++;
        });
        return {
            activeTimers: this.timers.size - pausedCount,
            pausedTimers: pausedCount
        };
    }
}

/**
 * Глобальный экземпляр TimerManager
 * Используется во всем приложении для управления таймерами
 */
export const timerManager = new TimerManager();
