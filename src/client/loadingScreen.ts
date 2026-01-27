/**
 * @module LoadingScreen
 * @description Экран загрузки с прогрессом и статусами
 * 
 * Показывает:
 * - Анимированный прогресс-бар
 * - Текущий этап загрузки
 * - Подсказки для игрока
 */

// Подсказки для игрока
const LOADING_TIPS = [
    "💡 Используй WASD для движения танка",
    "💡 Правая кнопка мыши — прицеливание",
    "💡 Shift — ускорение (расходует топливо)",
    "💡 R — перезарядка орудия",
    "💡 E — использовать расходник",
    "💡 Tab — открыть таблицу лидеров",
    "💡 Нажми ~ для терминала команд",
    "💡 /iddqd — режим бога (для тестирования)",
    "💡 Укрытия защищают от взрывов",
    "💡 Стена (Q) блокирует снаряды",
    "💡 Модули усиливают танк",
    "💡 F — подобрать предмет рядом",
];

export interface LoadingStage {
    name: string;
    weight: number; // Вес этапа в общем прогрессе
}

export const DEFAULT_STAGES: LoadingStage[] = [
    { name: "Инициализация движка", weight: 5 },
    { name: "Загрузка ассетов", weight: 30 },
    { name: "Создание мира", weight: 25 },
    { name: "Настройка физики", weight: 15 },
    { name: "Загрузка танков", weight: 10 },
    { name: "Подключение к серверу", weight: 10 },
    { name: "Готово!", weight: 5 },
];

export class LoadingScreen {
    private container: HTMLDivElement | null = null;
    private progressBar: HTMLDivElement | null = null;
    private progressFill: HTMLDivElement | null = null;
    private statusText: HTMLDivElement | null = null;
    private tipText: HTMLDivElement | null = null;
    private percentText: HTMLDivElement | null = null;

    private stages: LoadingStage[];
    private currentStageIndex: number = 0;
    private stageProgress: number = 0; // 0-100 внутри текущего этапа
    private tipInterval: NodeJS.Timeout | null = null;
    private isVisible: boolean = false;

    constructor(stages: LoadingStage[] = DEFAULT_STAGES) {
        this.stages = stages;
    }

    /**
     * Показать экран загрузки
     */
    show(): void {
        if (this.isVisible) return;
        this.isVisible = true;

        this.createDOM();
        this.startTipRotation();
    }

    /**
     * Скрыть экран загрузки с анимацией
     */
    hide(fadeOut: boolean = true): void {
        if (!this.isVisible || !this.container) return;

        this.stopTipRotation();

        if (fadeOut) {
            this.container.style.transition = 'opacity 0.5s ease-out';
            this.container.style.opacity = '0';

            setTimeout(() => {
                this.removeDOM();
            }, 500);
        } else {
            this.removeDOM();
        }

        this.isVisible = false;
    }

    /**
     * Установить текущий этап загрузки
     */
    setStage(stageIndex: number, stageProgress: number = 0): void {
        this.currentStageIndex = Math.min(stageIndex, this.stages.length - 1);
        this.stageProgress = Math.min(100, Math.max(0, stageProgress));
        this.updateProgress();
    }

    /**
     * Установить прогресс внутри текущего этапа (0-100)
     */
    setStageProgress(progress: number): void {
        this.stageProgress = Math.min(100, Math.max(0, progress));
        this.updateProgress();
    }

    /**
     * Перейти к следующему этапу
     */
    nextStage(): void {
        if (this.currentStageIndex < this.stages.length - 1) {
            this.currentStageIndex++;
            this.stageProgress = 0;
            this.updateProgress();
        }
    }

    /**
     * Установить произвольный статус
     */
    setStatus(status: string): void {
        if (this.statusText) {
            this.statusText.textContent = status;
        }
    }

    /**
     * Вычислить общий прогресс
     */
    private calculateTotalProgress(): number {
        let totalWeight = 0;
        let completedWeight = 0;

        for (let i = 0; i < this.stages.length; i++) {
            const weight = this.stages[i].weight;
            totalWeight += weight;

            if (i < this.currentStageIndex) {
                completedWeight += weight;
            } else if (i === this.currentStageIndex) {
                completedWeight += (weight * this.stageProgress) / 100;
            }
        }

        return totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;
    }

    /**
     * Обновить отображение прогресса
     */
    private updateProgress(): void {
        const totalProgress = this.calculateTotalProgress();
        const currentStage = this.stages[this.currentStageIndex];

        if (this.progressFill) {
            this.progressFill.style.width = `${totalProgress}%`;
        }

        if (this.percentText) {
            this.percentText.textContent = `${Math.round(totalProgress)}%`;
        }

        if (this.statusText && currentStage) {
            this.statusText.textContent = currentStage.name;
        }
    }

    /**
     * Создать DOM элементы
     */
    private createDOM(): void {
        // Контейнер
        this.container = document.createElement('div');
        this.container.id = 'tx-loading-screen';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a1a 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 99999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #ffffff;
        `;

        // Логотип/Заголовок
        const title = document.createElement('div');
        title.innerHTML = `
            <div style="
                font-size: 72px;
                font-weight: bold;
                background: linear-gradient(90deg, #00ff88, #00aaff, #ff00aa);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 0 30px rgba(0,255,136,0.5);
                margin-bottom: 20px;
                animation: pulse 2s ease-in-out infinite;
            ">TX</div>
            <style>
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            </style>
        `;
        this.container.appendChild(title);

        // Прогресс-бар контейнер
        this.progressBar = document.createElement('div');
        this.progressBar.style.cssText = `
            width: 400px;
            max-width: 80%;
            height: 12px;
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
            overflow: hidden;
            margin: 30px 0 15px 0;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
        `;

        // Заполнение прогресс-бара
        this.progressFill = document.createElement('div');
        this.progressFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #00ff88, #00aaff);
            background-size: 200% 100%;
            animation: shimmer 1.5s linear infinite;
            border-radius: 6px;
            transition: width 0.3s ease-out;
            box-shadow: 0 0 10px rgba(0,255,136,0.5);
        `;
        this.progressBar.appendChild(this.progressFill);
        this.container.appendChild(this.progressBar);

        // Процент
        this.percentText = document.createElement('div');
        this.percentText.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            color: #00ff88;
            margin-bottom: 10px;
        `;
        this.percentText.textContent = '0%';
        this.container.appendChild(this.percentText);

        // Статус текст
        this.statusText = document.createElement('div');
        this.statusText.style.cssText = `
            font-size: 18px;
            color: rgba(255,255,255,0.8);
            margin-bottom: 40px;
        `;
        this.statusText.textContent = this.stages[0]?.name || 'Загрузка...';
        this.container.appendChild(this.statusText);

        // Подсказка
        this.tipText = document.createElement('div');
        this.tipText.style.cssText = `
            font-size: 14px;
            color: rgba(255,255,255,0.5);
            position: absolute;
            bottom: 40px;
            text-align: center;
            max-width: 80%;
            transition: opacity 0.3s ease;
        `;
        this.tipText.textContent = LOADING_TIPS[0];
        this.container.appendChild(this.tipText);

        document.body.appendChild(this.container);
    }

    /**
     * Удалить DOM элементы
     */
    private removeDOM(): void {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.progressBar = null;
        this.progressFill = null;
        this.statusText = null;
        this.tipText = null;
        this.percentText = null;
    }

    /**
     * Запустить ротацию подсказок
     */
    private startTipRotation(): void {
        let tipIndex = 0;

        this.tipInterval = setInterval(() => {
            tipIndex = (tipIndex + 1) % LOADING_TIPS.length;

            if (this.tipText) {
                this.tipText.style.opacity = '0';

                setTimeout(() => {
                    if (this.tipText) {
                        this.tipText.textContent = LOADING_TIPS[tipIndex];
                        this.tipText.style.opacity = '1';
                    }
                }, 300);
            }
        }, 4000);
    }

    /**
     * Остановить ротацию подсказок
     */
    private stopTipRotation(): void {
        if (this.tipInterval) {
            clearInterval(this.tipInterval);
            this.tipInterval = null;
        }
    }
}

// Singleton instance
let _loadingScreenInstance: LoadingScreen | null = null;

/**
 * Получить или создать экземпляр LoadingScreen
 */
export function getLoadingScreen(): LoadingScreen {
    if (!_loadingScreenInstance) {
        _loadingScreenInstance = new LoadingScreen();
    }
    return _loadingScreenInstance;
}

/**
 * Удобные функции для быстрого использования
 */
export function showLoading(): void {
    getLoadingScreen().show();
}

export function hideLoading(fadeOut: boolean = true): void {
    getLoadingScreen().hide(fadeOut);
}

export function setLoadingStage(stageIndex: number, progress: number = 0): void {
    getLoadingScreen().setStage(stageIndex, progress);
}

export function setLoadingProgress(progress: number): void {
    getLoadingScreen().setStageProgress(progress);
}

export function setLoadingStatus(status: string): void {
    getLoadingScreen().setStatus(status);
}

export function nextLoadingStage(): void {
    getLoadingScreen().nextStage();
}
