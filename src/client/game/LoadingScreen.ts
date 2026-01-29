/**
 * @module game/LoadingScreen
 * @description Экран загрузки с анимацией и советами
 */

/**
 * Советы для экрана загрузки
 */
const LOADING_TIPS = [
    "💡 Используйте ПКМ для прицеливания - это увеличивает точность!",
    "💡 Клавиша G открывает гараж для смены танка",
    "💡 Колесо мыши позволяет приближать/отдалять камеру в режиме прицеливания",
    "💡 TAB показывает статистику игры",
    "💡 ESC ставит игру на паузу",
    "💡 Разные корпуса и орудия имеют уникальные характеристики",
    "💡 Клавиша M открывает тактическую карту",
    "💡 Захватывайте гаражи для получения тактического преимущества",
    "💡 Расходники 1-5 помогают в сложных ситуациях",
    "💡 Shift включает свободный обзор камеры"
];

/**
 * HTML шаблон экрана загрузки
 */
const LOADING_SCREEN_TEMPLATE = `
<style>
    #loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%);
        background-size: 200% 200%;
        animation: backgroundShift 10s ease infinite;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        font-family: 'Press Start 2P', cursive;
        overflow: hidden;
    }
    
    @keyframes backgroundShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }
    
    #loading-screen::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: 
            radial-gradient(circle at 20% 50%, rgba(0, 255, 0, 0.05) 0%, transparent 50%),
            radial-gradient(circle at 80% 50%, rgba(0, 255, 0, 0.05) 0%, transparent 50%);
        animation: backgroundPulse 4s ease-in-out infinite;
        pointer-events: none;
    }
    
    @keyframes backgroundPulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
    }
    
    .loading-logo {
        font-size: 48px;
        color: #0f0;
        text-shadow: 0 0 20px rgba(0, 255, 0, 0.5),
                     0 0 40px rgba(0, 255, 0, 0.3),
                     0 0 60px rgba(0, 255, 0, 0.2);
        margin-bottom: 60px;
        letter-spacing: 4px;
        animation: logoGlow 2s ease-in-out infinite;
        position: relative;
    }
    
    @keyframes logoGlow {
        0%, 100% { 
            text-shadow: 0 0 20px rgba(0, 255, 0, 0.5),
                         0 0 40px rgba(0, 255, 0, 0.3),
                         0 0 60px rgba(0, 255, 0, 0.2);
        }
        50% { 
            text-shadow: 0 0 30px rgba(0, 255, 0, 0.7),
                         0 0 60px rgba(0, 255, 0, 0.5),
                         0 0 90px rgba(0, 255, 0, 0.3);
        }
    }
    
    .loading-logo .accent {
        color: #fff;
        text-shadow: 0 0 20px rgba(255, 255, 255, 0.8),
                     0 0 40px rgba(255, 255, 255, 0.5);
        animation: accentPulse 1.5s ease-in-out infinite;
    }
    
    @keyframes accentPulse {
        0%, 100% { 
            text-shadow: 0 0 20px rgba(255, 255, 255, 0.8),
                         0 0 40px rgba(255, 255, 255, 0.5);
        }
        50% { 
            text-shadow: 0 0 30px rgba(255, 255, 255, 1),
                         0 0 60px rgba(255, 255, 255, 0.7);
        }
    }
    
    .loading-container {
        width: 400px;
        text-align: center;
        position: relative;
        z-index: 1;
    }
    
    .loading-bar-bg {
        width: 100%;
        height: 24px;
        background: rgba(0, 20, 0, 0.6);
        border: 2px solid #0a0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 0 15px rgba(0, 255, 0, 0.3),
                    inset 0 0 10px rgba(0, 100, 0, 0.5);
        position: relative;
    }
    
    .loading-bar-bg::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg,
            transparent 0%,
            rgba(0, 255, 0, 0.1) 50%,
            transparent 100%);
        animation: pulse 2s ease-in-out infinite;
    }
    
    .loading-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, 
            #0a0 0%, 
            #1f1 25%,
            #0f0 50%, 
            #1f1 75%,
            #0a0 100%);
        background-size: 200% 100%;
        width: 0%;
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.6),
                    inset 0 0 10px rgba(255, 255, 255, 0.2);
        position: relative;
        animation: gradientShift 2s linear infinite;
        transition: width 0.1s linear;
    }
    
    @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
    }
    
    .loading-bar-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, 
            transparent 0%, 
            rgba(255, 255, 255, 0.4) 30%,
            rgba(255, 255, 255, 0.6) 50%,
            rgba(255, 255, 255, 0.4) 70%,
            transparent 100%);
        animation: shimmer 1.2s infinite;
    }
    
    @keyframes shimmer {
        0% { transform: translateX(-150%); }
        100% { transform: translateX(150%); }
    }
    
    .loading-bar-fill::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
        animation: scan 1.5s ease-in-out infinite;
    }
    
    @keyframes scan {
        0% { left: -4px; }
        100% { left: 100%; }
    }
    
    .loading-text {
        color: #0f0;
        font-size: 12px;
        margin-top: 20px;
        text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        min-height: 20px;
        animation: textFade 0.5s ease-in;
    }
    
    @keyframes textFade {
        0% { opacity: 0; transform: translateY(5px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    
    .loading-percent {
        color: #0f0;
        font-size: 28px;
        margin-top: 15px;
        text-shadow: 0 0 15px rgba(0, 255, 0, 0.6),
                     0 0 30px rgba(0, 255, 0, 0.3);
        font-weight: bold;
        letter-spacing: 2px;
        animation: percentGlow 1.5s ease-in-out infinite;
    }
    
    @keyframes percentGlow {
        0%, 100% { 
            text-shadow: 0 0 15px rgba(0, 255, 0, 0.6),
                         0 0 30px rgba(0, 255, 0, 0.3);
        }
        50% { 
            text-shadow: 0 0 25px rgba(0, 255, 0, 0.8),
                         0 0 50px rgba(0, 255, 0, 0.5);
        }
    }
    
    .loading-tip {
        color: #888;
        font-size: 10px;
        margin-top: 40px;
        max-width: 500px;
        line-height: 1.6;
    }
    
    .loading-tank {
        font-size: 50px;
        margin-bottom: 20px;
        animation: tankBounce 1.2s ease-in-out infinite,
                    tankRotate 3s linear infinite;
        filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.5));
    }
    
    @keyframes tankBounce {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-15px) rotate(5deg); }
    }
    
    @keyframes tankRotate {
        0% { filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.5)) hue-rotate(0deg); }
        50% { filter: drop-shadow(0 0 15px rgba(0, 255, 0, 0.7)) hue-rotate(10deg); }
        100% { filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.5)) hue-rotate(0deg); }
    }
</style>
<div class="loading-logo">PROTOCOL <span class="accent">TX</span></div>
<div class="loading-tank">🎖️</div>
<div class="loading-container">
    <div class="loading-bar-bg">
        <div class="loading-bar-fill" id="loading-bar-fill"></div>
    </div>
    <div class="loading-percent" id="loading-percent">0%</div>
    <div class="loading-text" id="loading-text">Инициализация...</div>
</div>
<div class="loading-tip" id="loading-tip"></div>
`;

/**
 * Менеджер экрана загрузки
 */
export class LoadingScreen {
    private element: HTMLDivElement | null = null;
    private currentProgress: number = 0;
    private targetProgress: number = 0;
    private animationFrame: number | null = null;
    
    /**
     * Показать экран загрузки
     */
    show(): void {
        if (this.element) return;
        
        this.element = document.createElement("div");
        this.element.id = "loading-screen";
        this.element.innerHTML = LOADING_SCREEN_TEMPLATE;
        document.body.appendChild(this.element);
        
        this.showRandomTip();
    }
    
    /**
     * Скрыть экран загрузки с анимацией
     */
    hide(): void {
        if (!this.element) return;
        
        this.element.style.transition = "opacity 0.5s ease-out";
        this.element.style.opacity = "0";
        
        const element = this.element;
        setTimeout(() => {
            element.remove();
        }, 500);
        
        this.element = null;
        
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
    
    /**
     * Обновить прогресс загрузки
     * @param progress - Прогресс в процентах (0-100)
     * @param stage - Название текущего этапа
     */
    updateProgress(progress: number, stage: string): void {
        this.targetProgress = Math.min(100, Math.max(0, progress));
        
        if (this.animationFrame === null) {
            this.animateProgress();
        }
        
        const stageText = document.getElementById("loading-text");
        if (stageText) {
            stageText.textContent = stage;
        }
    }
    
    /**
     * Анимировать изменение прогресса
     */
    private animateProgress(): void {
        const barFill = document.getElementById("loading-bar-fill");
        const percentText = document.getElementById("loading-percent");
        
        if (!barFill || !percentText) {
            this.animationFrame = null;
            return;
        }
        
        const diff = this.targetProgress - this.currentProgress;
        if (Math.abs(diff) > 0.1) {
            const speed = Math.min(0.15, Math.abs(diff) * 0.02 + 0.05);
            this.currentProgress += diff * speed;
            
            const rounded = Math.round(this.currentProgress);
            barFill.style.width = `${this.currentProgress}%`;
            percentText.textContent = `${rounded}%`;
            
            this.animationFrame = requestAnimationFrame(() => this.animateProgress());
        } else {
            this.currentProgress = this.targetProgress;
            const rounded = Math.round(this.currentProgress);
            barFill.style.width = `${this.currentProgress}%`;
            percentText.textContent = `${rounded}%`;
            this.animationFrame = null;
        }
    }
    
    /**
     * Показать случайный совет
     */
    private showRandomTip(): void {
        const tipElement = document.getElementById("loading-tip");
        if (tipElement) {
            const index = Math.floor(Math.random() * LOADING_TIPS.length);
            tipElement.textContent = LOADING_TIPS[index] ?? "";
        }
    }
    
    /**
     * Получить текущий прогресс
     */
    getProgress(): number {
        return this.currentProgress;
    }
    
    /**
     * Проверить, показан ли экран загрузки
     */
    isVisible(): boolean {
        return this.element !== null;
    }
}

export default LoadingScreen;

