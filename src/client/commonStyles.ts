/**
 * Common Styles - Единые стили для всех панелей
 */

export class CommonStyles {
    private static initialized = false;
    
    /**
     * Инициализация общих стилей
     */
    static initialize(): void {
        if (this.initialized) return;
        
        const style = document.createElement("style");
        style.id = "common-panel-styles";
        style.textContent = `
            /* Общие стили для всех панелей */
            .panel-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            }
            
            /* Полупрозрачный фон для панелей во время боя */
            .panel-overlay.in-battle {
                background: rgba(0, 0, 0, 0.5) !important;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .panel {
                background: rgba(0, 10, 0, 0.95);
                border: 2px solid rgba(0, 255, 4, 0.6);
                border-radius: 8px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.4);
                animation: slideIn 0.3s ease;
                max-width: 90vw;
                max-height: 90vh;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateY(-20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            .panel-header {
                background: linear-gradient(180deg, rgba(0, 20, 0, 0.9) 0%, rgba(0, 10, 0, 0.95) 100%);
                padding: 12px 16px;
                border-bottom: 2px solid rgba(0, 255, 4, 0.4);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .panel-title {
                color: #0ff;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 0 0 4px rgba(0, 255, 255, 0.6);
            }
            
            .panel-close {
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                color: #0ff;
                width: 28px;
                height: 28px;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .panel-close:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.1);
            }
            
            .panel-content {
                padding: 16px;
                overflow-y: auto;
                max-height: calc(90vh - 60px);
            }
            
            .panel-btn {
                padding: 8px 16px;
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                border-radius: 4px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .panel-btn:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.05);
            }
            
            .panel-btn.primary {
                background: rgba(0, 255, 4, 0.3);
            }
            
            .panel-btn.secondary {
                background: rgba(0, 255, 4, 0.1);
            }
            
            /* Адаптивность */
            @media (max-width: 768px) {
                .panel {
                    width: 95vw !important;
                    max-height: 95vh !important;
                }
                
                .panel-title {
                    font-size: 14px;
                }
            }
            
            /* Скроллбары */
            .panel-content::-webkit-scrollbar {
                width: 8px;
            }
            
            .panel-content::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.2);
            }
            
            .panel-content::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: 4px;
            }
            
            .panel-content::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 255, 4, 0.6);
            }
        `;
        
        document.head.appendChild(style);
        this.initialized = true;
    }
}

