/**
 * @module LoadingScreen
 * @description Экран загрузки: Просто вращающийся зеленый квадрат
 */

const LOADING_SCREEN_TEMPLATE = `
<style>
    #simple-loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999999; /* КРИТИЧНО: Выше чем iframe редактора (z-index: 10000) */
        font-family: 'Press Start 2P', monospace;
        color: #0f0;
    }

    .loader-content {
        display: flex;
        align-items: center;
        gap: 20px;
    }

    .spinner-square {
        width: 30px;
        height: 30px;
        background-color: transparent;
        border: 4px solid #0f0;
        /* Pixelated look: No shadows/glows, strictly sharp */
        image-rendering: pixelated; 
        /* Jerky animation: One axis (Z), One direction (+360deg), with overshoot (back-bow) */
        animation: spin-jerky 1.2s infinite cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes spin-jerky {
        0% { transform: rotate(0deg); }
        /* The overshoot is handled by the cubic-bezier */
        100% { transform: rotate(90deg); }
    }
    
    /* Wait, rotating 90deg effectively resets it for a square. Perfect loop. 
       "Jerky" means it snaps to the next 90deg.
       User said: "КРУТИТЬСЯ РЫВКАМИ" (Jerky) "ПО ОДНОЙ ОСИ" (One axis).
       I will basically do: 0 -> 90 with a slam.
    */

    .loading-text {
        font-size: 24px;
        font-weight: bold;
        letter-spacing: 2px;
        font-family: 'Press Start 2P', monospace;
        text-shadow: none;
        /* Синхронизировано с вращением квадратика - та же длительность 1.2s */
        /* steps(1, end) делает РЕЗКОЕ переключение в один шаг, синхронизированное с поворотом */
        animation: loading-blink 1.2s infinite cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes loading-blink {
        /* Мигание в НАЧАЛЕ поворота квадратика - плавно-резкое */
        0% { opacity: 1; }
        5% { opacity: 0.15; }
        15% { opacity: 1; }
        100% { opacity: 1; }
    }

    .loading-description {
        display: none; /* ОТКЛЮЧЕНО - описание скрыто для предотвращения смещения */
        margin-top: 30px;
        max-width: 600px;
        text-align: center;
        font-size: 10px;
        line-height: 1.6;
        color: #0a0;
        font-family: 'Consolas', 'Courier New', monospace;
        padding: 0 20px;
        opacity: 0.8;
        /* Убираем начальную анимацию - элемент виден сразу */
    }

    .loading-tip {
        display: none; /* ОТКЛЮЧЕНО - подсказки скрыты */
        margin-top: 40px;
        max-width: 700px;
        text-align: center;
        font-size: 11px;
        line-height: 1.8;
        color: #0f0;
        font-family: 'Consolas', 'Courier New', monospace;
        padding: 0 30px;
        opacity: 0.9;
        /* Убираем начальную анимацию - элемент виден сразу */
        min-height: 50px;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 0.8; transform: translateY(0); }
    }

    .loading-progress {
        display: none; /* ОТКЛЮЧЕНО - процент загрузки скрыт */
        margin-top: 15px;
        font-size: 12px;
        color: #0f0;
        font-family: 'Press Start 2P', monospace;
        opacity: 0.9;
    }
</style>
<div class="loader-content">
    <div class="spinner-square"></div>
    <div class="loading-text" id="simple-loading-text">LOADING...</div>
</div>
<div class="loading-progress" id="simple-loading-progress">0%</div>
<div class="loading-description" id="simple-loading-description"></div>
<div class="loading-tip" id="simple-loading-tip"></div>
`;

/**
 * Советы и подсказки для экрана загрузки
 */
const LOADING_TIPS = [
    "💡 Используйте ПКМ для прицеливания - это увеличивает точность!",
    "💡 Клавиша G открывает гараж для смены танка",
    "💡 Колесо мыши позволяет приближать/отдалять камеру в режиме прицеливания",
    "💡 Удерживайте TAB — статистика и таблица лидеров",
    "💡 ESC ставит игру на паузу",
    "💡 Клавиша M открывает тактическую карту",
    "💡 Shift включает свободный обзор камеры",
    "💡 Самолёт: W/S — тяга, A/D — крен, Q/E — тангаж, мышь — прицел, Shift — свободный обзор",
    "💡 F3 открывает отладочную информацию",
    "💡 F4 включает визуализацию физики",
    "💡 Разные корпуса и орудия имеют уникальные характеристики",
    "💡 Захватывайте гаражи для получения тактического преимущества",
    "💡 Расходники 1-5 помогают в сложных ситуациях",
    "💡 Используйте укрытия для защиты от вражеского огня",
    "💡 Двигайтесь зигзагом под огнем - это снижает шанс попадания",
    "💡 Атакуйте с флангов для максимального урона",
    "💡 Работайте в команде - координация решает исход боя",
    "💡 Изучайте карту - знание местности дает преимущество",
    "💡 Экономьте боеприпасы - перезарядка занимает время",
    "💡 Используйте рельеф местности для маскировки",
    "🎯 Каждый танк имеет уникальную физику движения",
    "🎯 Процедурная генерация создает бесконечное разнообразие карт",
    "🎯 Havok Physics обеспечивает реалистичные столкновения",
    "🎯 WebGPU позволяет достичь 60+ FPS даже на средних ПК",
    "🎯 Система прогрессии награждает за активную игру",
    "🎯 Кастомные карты можно создавать в редакторе",
    "🎯 Мультиплеер поддерживает до 32 игроков одновременно",
    "🎯 AI боты адаптируются к вашему стилю игры",
    "🎯 Система достижений отслеживает ваши рекорды",
    "🎯 Физика снарядов учитывает гравитацию и сопротивление",
    "⚡ Готовьтесь к эпическим сражениям!",
    "⚡ Каждый бой - это новый вызов",
    "⚡ Станьте легендой танковых сражений",
    "⚡ Мастерство приходит с практикой",
];

export class LoadingScreen {
    private container: HTMLDivElement | null = null;
    private isVisible: boolean = false;
    private currentProgress: number = 0;
    private currentDescription: string = "";
    private currentTipIndex: number = 0;
    private tipInterval: number | null = null;

    show(): void {
        // КРИТИЧНО: Удаляем ВСЕ существующие экраны загрузки перед созданием нового
        // Это гарантирует что будет только один экран загрузки
        const allLoadingScreens = document.querySelectorAll(
            '#simple-loading-screen, #loading-screen, .loading-screen, #tx-loading-screen, #loading-indicator'
        );
        allLoadingScreens.forEach(screen => {
            screen.remove();
        });

        // Сбрасываем состояние
        this.isVisible = false;
        this.container = null;
        this.currentProgress = 0;
        this.currentDescription = "";

        // Создаем новый экран загрузки
        this.container = document.createElement('div');
        this.container.id = 'simple-loading-screen';
        this.container.innerHTML = LOADING_SCREEN_TEMPLATE;
        document.body.appendChild(this.container);
        this.isVisible = true;

        // МОМЕНТАЛЬНО показываем все элементы без задержек
        // Процент уже в шаблоне (0%), но убеждаемся что он виден
        const progressEl = document.getElementById('simple-loading-progress');
        if (progressEl) {
            progressEl.textContent = '0%';
            progressEl.style.opacity = '1'; // Убираем любые анимации задержки
        }

        // ОТКЛЮЧЕНО - подсказки скрыты
        // Показываем первую подсказку МОМЕНТАЛЬНО без анимации
        // this.showRandomTip(true);

        // ОТКЛЮЧЕНО - меняем подсказки каждые 4 секунды
        // this.tipInterval = window.setInterval(() => {
        //     if (this.isVisible) {
        //         this.showRandomTip(false); // С анимацией при смене
        //     }
        // }, 4000);
    }

    hide(fadeOut: boolean = true): void {
        if (!this.container) return;

        // Останавливаем смену подсказок
        if (this.tipInterval !== null) {
            clearInterval(this.tipInterval);
            this.tipInterval = null;
        }

        if (fadeOut) {
            this.container.style.transition = 'opacity 0.5s ease-out';
            this.container.style.opacity = '0';
            setTimeout(() => this.removeDOM(), 500);
        } else {
            this.removeDOM();
        }
    }

    private showRandomTip(instant: boolean = false): void {
        if (LOADING_TIPS.length === 0) return;

        // Выбираем случайную подсказку
        this.currentTipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
        const tip = LOADING_TIPS[this.currentTipIndex] ?? ""; // [Opus 4.6] Default for possibly undefined index

        const tipEl = document.getElementById('simple-loading-tip');
        if (tipEl) {
            tipEl.textContent = tip;
            if (instant) {
                // МОМЕНТАЛЬНОЕ появление без анимации
                tipEl.style.opacity = '0.9';
                tipEl.style.animation = 'none';
                tipEl.style.transform = 'translateY(0)';
            } else {
                // Анимация появления новой подсказки при смене
                tipEl.style.animation = 'none';
                setTimeout(() => {
                    tipEl.style.animation = 'fadeIn 0.8s ease-in';
                }, 10);
            }
        }
    }

    setStatus(status: string): void {
        const text = document.getElementById('simple-loading-text');
        if (text) text.textContent = status.toUpperCase();
    }

    setDescription(description: string): void {
        this.currentDescription = description;
        const descEl = document.getElementById('simple-loading-description');
        if (descEl) {
            descEl.textContent = description;
            // Анимация появления нового описания
            descEl.style.animation = 'none';
            setTimeout(() => {
                descEl.style.animation = 'fadeIn 0.5s ease-in';
            }, 10);
        }
    }

    setProgress(progress: number): void {
        this.currentProgress = Math.max(0, Math.min(100, progress));
        const progressEl = document.getElementById('simple-loading-progress');
        if (progressEl) {
            progressEl.textContent = `${Math.round(this.currentProgress)}%`;
        }
    }

    // Legacy methods stubbed to keep API compatible
    setStage(i: number, p: number = 0): void {
        this.setProgress(p);
    }
    setStageProgress(p: number): void {
        this.setProgress(p);
    }
    nextStage(): void { }

    private removeDOM(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.isVisible = false;
    }
}

// Singleton
let _instance: LoadingScreen | null = null;
export function getLoadingScreen(): LoadingScreen {
    if (!_instance) _instance = new LoadingScreen();
    return _instance;
}

export function showLoading(): void { getLoadingScreen().show(); }
export function hideLoading(fadeOut: boolean = true): void { getLoadingScreen().hide(fadeOut); }
export function setLoadingStage(i: number, p: number = 0): void { getLoadingScreen().setStage(i, p); }
export function setLoadingProgress(p: number): void { getLoadingScreen().setProgress(p); }
export function setLoadingStatus(s: string): void { getLoadingScreen().setStatus(s); }
export function setLoadingDescription(d: string): void { getLoadingScreen().setDescription(d); }
export function nextLoadingStage(): void { getLoadingScreen().nextStage(); }
