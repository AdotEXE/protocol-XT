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
        z-index: 999999;
        font-family: 'Press Start 2P', cursive;
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
        font-family: 'Press Start 2P', cursive;
        text-shadow: none;
        /* Синхронизировано с вращением квадратика - та же длительность 1.2s */
        animation: blink 1.2s infinite cubic-bezier(0.4, 0.0, 0.6, 1.0);
    }

    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.2; }
    }
</style>
<div class="loader-content">
    <div class="spinner-square"></div>
    <div class="loading-text" id="simple-loading-text">LOADING...</div>
</div>
`;

export class LoadingScreen {
    private container: HTMLDivElement | null = null;
    private isVisible: boolean = false;

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

        // Создаем новый экран загрузки
        this.container = document.createElement('div');
        this.container.id = 'simple-loading-screen';
        this.container.innerHTML = LOADING_SCREEN_TEMPLATE;
        document.body.appendChild(this.container);
        this.isVisible = true;
    }

    hide(fadeOut: boolean = true): void {
        if (!this.container) return;

        if (fadeOut) {
            this.container.style.transition = 'opacity 0.5s ease-out';
            this.container.style.opacity = '0';
            setTimeout(() => this.removeDOM(), 500);
        } else {
            this.removeDOM();
        }
    }

    setStatus(status: string): void {
        const text = document.getElementById('simple-loading-text');
        if (text) text.textContent = status.toUpperCase();
    }

    // Legacy methods stubbed to keep API compatible
    setStage(i: number, p: number = 0): void { }
    setStageProgress(p: number): void { }
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
export function setLoadingProgress(p: number): void { getLoadingScreen().setStageProgress(p); }
export function setLoadingStatus(s: string): void { getLoadingScreen().setStatus(s); }
export function nextLoadingStage(): void { getLoadingScreen().nextStage(); }
