import { Rectangle, AdvancedDynamicTexture, Control } from "@babylonjs/gui";

export interface LowHealthVignetteConfig {
    visible: boolean;
}

export const DEFAULT_LOW_HEALTH_CONFIG: LowHealthVignetteConfig = {
    visible: true
};

/**
 * LowHealthVignette - эффект затемнения по краям экрана при низком HP
 * ИСПРАВЛЕНО: Использует несколько перекрывающихся прямоугольников с разной прозрачностью
 * для создания эффекта градиента (CSS градиенты не поддерживаются в Babylon.js GUI)
 */
export class LowHealthVignette {
    private topEdges: Rectangle[] = [];
    private bottomEdges: Rectangle[] = [];
    private leftEdges: Rectangle[] = [];
    private rightEdges: Rectangle[] = [];
    private _isVisible: boolean = false;
    private pulseTime: number = 0;
    private readonly gradientSteps: number = 20; // Увеличено для максимально плавного градиента

    constructor(guiTexture: AdvancedDynamicTexture) {
        // Создаём несколько прямоугольников для каждого края для эффекта градиента
        // Каждый прямоугольник имеет разную прозрачность (alpha), создавая плавный переход
        
        const edgeSize = 25; // 25% экрана от края
        const stepSize = edgeSize / this.gradientSteps; // Размер каждого шага градиента

        // Верхний край: несколько прямоугольников от верха к центру
        for (let i = 0; i < this.gradientSteps; i++) {
            const rect = new Rectangle(`lowHpTop_${i}`);
            rect.width = "100%";
            rect.height = `${stepSize}%`;
            rect.thickness = 0;
            rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            rect.top = `${i * stepSize}%`;
            rect.background = "#000000"; // Чёрный цвет
            rect.isHitTestVisible = false;
            rect.isVisible = false;
            rect.zIndex = -1;
            guiTexture.addControl(rect);
            this.topEdges.push(rect);
        }

        // Нижний край: несколько прямоугольников от низа к центру
        for (let i = 0; i < this.gradientSteps; i++) {
            const rect = new Rectangle(`lowHpBottom_${i}`);
            rect.width = "100%";
            rect.height = `${stepSize}%`;
            rect.thickness = 0;
            rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            rect.top = `${-i * stepSize}%`; // Отрицательное смещение от низа
            rect.background = "#000000";
            rect.isHitTestVisible = false;
            rect.isVisible = false;
            rect.zIndex = -1;
            guiTexture.addControl(rect);
            this.bottomEdges.push(rect);
        }

        // Левый край: несколько прямоугольников от левого края к центру
        for (let i = 0; i < this.gradientSteps; i++) {
            const rect = new Rectangle(`lowHpLeft_${i}`);
            rect.width = `${stepSize}%`;
            rect.height = "100%";
            rect.thickness = 0;
            rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            rect.left = `${i * stepSize}%`;
            rect.background = "#000000";
            rect.isHitTestVisible = false;
            rect.isVisible = false;
            rect.zIndex = -1;
            guiTexture.addControl(rect);
            this.leftEdges.push(rect);
        }

        // Правый край: несколько прямоугольников от правого края к центру
        for (let i = 0; i < this.gradientSteps; i++) {
            const rect = new Rectangle(`lowHpRight_${i}`);
            rect.width = `${stepSize}%`;
            rect.height = "100%";
            rect.thickness = 0;
            rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
            rect.left = `${-i * stepSize}%`; // Отрицательное смещение от правого края
            rect.background = "#000000";
            rect.isHitTestVisible = false;
            rect.isVisible = false;
            rect.zIndex = -1;
            guiTexture.addControl(rect);
            this.rightEdges.push(rect);
        }
    }

    /**
     * Update vignette intensity based on health percentage
     * ИСПРАВЛЕНО: Использует несколько прямоугольников с разной прозрачностью для градиента
     * @param currentHealth 
     * @param maxHealth 
     * @param deltaTime - время с последнего обновления (для пульсации)
     */
    public update(currentHealth: number, maxHealth: number, deltaTime: number = 0.016): void {
        const healthPercent = currentHealth / maxHealth;
        this.pulseTime += deltaTime;

        // Показываем только когда здоровье ниже 40%
        if (healthPercent < 0.4 && healthPercent > 0) {
            // Более резкая кривая интенсивности: экспоненциальная для более выразительного эффекта
            // При 40% HP -> intensity = 0, при 0% HP -> intensity = 1
            const normalizedHealth = healthPercent / 0.4; // 0.0 (критично) до 1.0 (40% HP)
            
            // Используем квадратичную кривую для более резкого увеличения при низком ХП
            // При 40% HP: intensity = 0, при 0% HP: intensity = 1
            const intensity = Math.pow(1 - normalizedHealth, 2.2);
            
            // Базовое затемнение: максимум 0.85 для более выразительного эффекта
            const baseDarkness = intensity * 0.85;

            // Эффект биения сердца (пульсация) - более выраженный при низком здоровье
            // Реалистичное сердцебиение: два быстрых удара (thump-thump), затем пауза
            let pulse = 0;
            
            // Частота пульса увеличивается при снижении здоровья: 60-160 BPM
            const heartbeatBPM = 60 + (1 - healthPercent) * 100;
            const heartbeatPeriod = 60 / heartbeatBPM;
            const cycleTime = this.pulseTime % heartbeatPeriod;
            
            // Интенсивность пульсации увеличивается при снижении здоровья
            const pulseIntensity = 0.2 + (1 - healthPercent) * 0.25; // 0.2-0.45
            
            // Первый удар (thump) - более резкий
            if (cycleTime < heartbeatPeriod * 0.12) {
                const t = cycleTime / (heartbeatPeriod * 0.12);
                // Используем более резкую кривую для удара
                pulse = Math.pow(Math.sin(t * Math.PI), 0.7) * pulseIntensity;
            }
            // Второй удар (thump) - через короткую паузу после первого
            else if (cycleTime >= heartbeatPeriod * 0.18 && cycleTime < heartbeatPeriod * 0.30) {
                const t = (cycleTime - heartbeatPeriod * 0.18) / (heartbeatPeriod * 0.12);
                pulse = Math.pow(Math.sin(t * Math.PI), 0.7) * pulseIntensity * 0.85;
            }
            // Пауза между циклами (остальное время)

            const currentDarkness = Math.min(0.95, baseDarkness + pulse);

            // Применяем максимально плавный градиент через несколько прямоугольников
            // Используем экспоненциальную функцию для более плавного перехода
            for (let i = 0; i < this.gradientSteps; i++) {
                // Нормализованная позиция от 0 (край) до 1 (центр)
                const normalizedPos = i / (this.gradientSteps - 1);
                
                // Экспоненциальная функция для максимально плавного градиента
                // Более плавный переход от края к центру
                const gradientFactor = Math.pow(1 - normalizedPos, 3.0);
                
                // Прозрачность: темнее у края, прозрачнее к центру
                const alpha = currentDarkness * gradientFactor;
                
                // Верхний край
                const topEdge = this.topEdges[i];
                if (topEdge) {
                    topEdge.alpha = alpha;
                    topEdge.isVisible = alpha > 0.01; // Показываем только если видимо
                }
                
                // Нижний край
                const bottomEdge = this.bottomEdges[i];
                if (bottomEdge) {
                    bottomEdge.alpha = alpha;
                    bottomEdge.isVisible = alpha > 0.01;
                }
                
                // Левый край
                const leftEdge = this.leftEdges[i];
                if (leftEdge) {
                    leftEdge.alpha = alpha;
                    leftEdge.isVisible = alpha > 0.01;
                }
                
                // Правый край
                const rightEdge = this.rightEdges[i];
                if (rightEdge) {
                    rightEdge.alpha = alpha;
                    rightEdge.isVisible = alpha > 0.01;
                }
            }

            this._isVisible = true;
        } else {
            // Полностью скрываем эффект
            for (let i = 0; i < this.gradientSteps; i++) {
                const topEdge = this.topEdges[i];
                if (topEdge) {
                    topEdge.isVisible = false;
                    topEdge.alpha = 0;
                }
                const bottomEdge = this.bottomEdges[i];
                if (bottomEdge) {
                    bottomEdge.isVisible = false;
                    bottomEdge.alpha = 0;
                }
                const leftEdge = this.leftEdges[i];
                if (leftEdge) {
                    leftEdge.isVisible = false;
                    leftEdge.alpha = 0;
                }
                const rightEdge = this.rightEdges[i];
                if (rightEdge) {
                    rightEdge.isVisible = false;
                    rightEdge.alpha = 0;
                }
            }
            this._isVisible = false;
        }
    }

    public dispose(): void {
        // Удаляем все прямоугольники градиента
        for (const rect of this.topEdges) {
            rect.dispose();
        }
        for (const rect of this.bottomEdges) {
            rect.dispose();
        }
        for (const rect of this.leftEdges) {
            rect.dispose();
        }
        for (const rect of this.rightEdges) {
            rect.dispose();
        }
        this.topEdges = [];
        this.bottomEdges = [];
        this.leftEdges = [];
        this.rightEdges = [];
    }
}
