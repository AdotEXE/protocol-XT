/**
 * @module mobile/DynamicOpacityManager
 * @description Централизованное управление прозрачностью UI элементов на основе контекста игры
 * 
 * Реализует концепцию "Ghost HUD" - интерфейс, который существует только в момент намерения.
 * Элементы автоматически становятся почти невидимыми в покое и появляются при взаимодействии.
 */

import { Control } from "@babylonjs/gui";

/**
 * Состояния прозрачности
 */
export type OpacityState = 'idle' | 'active' | 'sniper';

/**
 * Категории элементов UI
 */
export type UIElementCategory = 'critical' | 'secondary' | 'tertiary';

/**
 * Конфигурация состояний прозрачности
 */
export interface OpacityStateConfig {
    idle: number;           // Прозрачность в покое (0.25 = 25%)
    active: number;         // Прозрачность при активном касании (0.9 = 90%)
    sniper: number;         // Прозрачность в режиме снайпера (0.1 = 10%)
    transitionSpeed: number; // Скорость перехода (0.15 за кадр)
}

/**
 * Элемент UI для управления прозрачностью
 */
export interface UIElement {
    id: string;
    control: Control;
    baseOpacity: number;    // Базовая прозрачность элемента
    currentOpacity: number; // Текущая прозрачность
    targetOpacity: number;  // Целевая прозрачность
    category: UIElementCategory;
    isTouched: boolean;     // Активно ли касание элемента
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_OPACITY_CONFIG: OpacityStateConfig = {
    idle: 0.25,
    active: 0.9,
    sniper: 0.1,
    transitionSpeed: 0.15
};

/**
 * Менеджер динамической прозрачности
 */
export class DynamicOpacityManager {
    private elements: Map<string, UIElement> = new Map();
    private config: OpacityStateConfig;
    private currentState: OpacityState = 'idle';
    private currentZoom: number = 1.0;
    private isAiming: boolean = false;

    constructor(config: Partial<OpacityStateConfig> = {}) {
        this.config = { ...DEFAULT_OPACITY_CONFIG, ...config };
    }

    /**
     * Зарегистрировать элемент UI
     */
    registerElement(
        id: string,
        control: Control,
        category: UIElementCategory = 'secondary',
        baseOpacity: number = 1.0
    ): void {
        const element: UIElement = {
            id,
            control,
            baseOpacity,
            currentOpacity: baseOpacity * this.config.idle,
            targetOpacity: baseOpacity * this.config.idle,
            category,
            isTouched: false
        };

        // Установить начальную прозрачность
        control.alpha = element.currentOpacity;
        this.elements.set(id, element);
    }

    /**
     * Отменить регистрацию элемента
     */
    unregisterElement(id: string): void {
        const element = this.elements.get(id);
        if (element) {
            element.control.alpha = element.baseOpacity;
            this.elements.delete(id);
        }
    }

    /**
     * Установить состояние прозрачности
     */
    setState(state: OpacityState): void {
        if (this.currentState === state) return;
        this.currentState = state;
        this.updateTargetOpacities();
    }

    /**
     * Установить уровень зума (для определения режима снайпера)
     */
    setZoom(zoom: number): void {
        this.currentZoom = zoom;
        // Автоматически переключаемся в режим снайпера при зуме >= 3.5x
        if (zoom >= 3.5 && this.currentState !== 'sniper') {
            this.setState('sniper');
        } else if (zoom < 3.5 && this.currentState === 'sniper') {
            this.setState('idle');
        }
    }

    /**
     * Установить состояние прицеливания
     */
    setAiming(aiming: boolean): void {
        this.isAiming = aiming;
        // В режиме прицеливания увеличиваем прозрачность критических элементов
        if (aiming && this.currentState === 'idle') {
            // Не меняем состояние, но обновляем целевые значения
            this.updateTargetOpacities();
        }
    }

    /**
     * Отметить элемент как активный (касание)
     */
    setElementTouched(id: string, touched: boolean): void {
        const element = this.elements.get(id);
        if (!element) return;

        element.isTouched = touched;
        this.updateTargetOpacity(element);
    }

    /**
     * Обновить прозрачность всех элементов (вызывать каждый кадр)
     */
    update(deltaTime: number = 0.016): void {
        // Используем фиксированный шаг для консистентности
        const step = this.config.transitionSpeed;

        for (const element of this.elements.values()) {
            // Плавная интерполяция к целевой прозрачности
            const diff = element.targetOpacity - element.currentOpacity;
            if (Math.abs(diff) > 0.001) {
                element.currentOpacity += diff * step;
                element.control.alpha = element.currentOpacity;
            } else {
                // Достигли цели, устанавливаем точно
                element.currentOpacity = element.targetOpacity;
                element.control.alpha = element.currentOpacity;
            }
        }
    }

    /**
     * Получить текущую прозрачность элемента
     */
    getOpacity(id: string): number {
        const element = this.elements.get(id);
        return element ? element.currentOpacity : 1.0;
    }

    /**
     * Обновить целевые прозрачности для всех элементов
     */
    private updateTargetOpacities(): void {
        for (const element of this.elements.values()) {
            this.updateTargetOpacity(element);
        }
    }

    /**
     * Обновить целевую прозрачность элемента
     */
    private updateTargetOpacity(element: UIElement): void {
        let targetMultiplier: number;

        // Если элемент активно касается, всегда показываем его ярко
        if (element.isTouched) {
            targetMultiplier = this.config.active;
        } else {
            // Иначе используем состояние системы
            switch (this.currentState) {
                case 'sniper':
                    // В режиме снайпера критичные элементы более видимы
                    if (element.category === 'critical') {
                        targetMultiplier = this.config.sniper * 3; // 30% для критичных
                    } else {
                        targetMultiplier = this.config.sniper; // 10% для остальных
                    }
                    break;

                case 'active':
                    targetMultiplier = this.config.active;
                    break;

                case 'idle':
                default:
                    // В режиме прицеливания немного увеличиваем видимость
                    if (this.isAiming && element.category === 'critical') {
                        targetMultiplier = this.config.idle * 2; // 50% для критичных при прицеливании
                    } else {
                        targetMultiplier = this.config.idle; // 25% по умолчанию
                    }
                    break;
            }
        }

        element.targetOpacity = element.baseOpacity * targetMultiplier;
    }

    /**
     * Получить все зарегистрированные элементы
     */
    getElements(): UIElement[] {
        return Array.from(this.elements.values());
    }

    /**
     * Очистить все элементы
     */
    clear(): void {
        // Восстанавливаем исходную прозрачность
        for (const element of this.elements.values()) {
            element.control.alpha = element.baseOpacity;
        }
        this.elements.clear();
    }

    /**
     * Уничтожить менеджер
     */
    dispose(): void {
        this.clear();
    }
}

export default DynamicOpacityManager;

