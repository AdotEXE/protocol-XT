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
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.8) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100002 !important;
                animation: fadeIn 0.2s ease;
                pointer-events: auto !important;
            }
            
            /* Скрытие панели через класс hidden */
            .panel-overlay.hidden {
                display: none !important;
                visibility: hidden !important;
            }
            
            /* Видимая панель */
            .panel-overlay.visible {
                display: flex !important;
                visibility: visible !important;
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
                font-family: 'Press Start 2P', monospace;
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
                font-family: 'Press Start 2P', monospace;
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

            /* Admin Panel Specifics */
            .admin-panel-window {
                background: linear-gradient(135deg, rgba(20, 20, 30, 0.95), rgba(10, 10, 20, 0.98));
                width: 800px;
                max-width: 95vw;
                height: 600px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                border: 1px solid rgba(80, 200, 255, 0.3);
                border-radius: 8px;
                box-shadow: 0 0 30px rgba(0, 0, 0, 0.8), 0 0 10px rgba(80, 200, 255, 0.2);
                color: #e0e0e0;
                font-family: 'Segoe UI', Roboto, sans-serif;
            }

            .admin-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                background: rgba(0, 0, 0, 0.3);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .admin-header h2 {
                margin: 0;
                font-size: 1.2rem;
                color: #fff;
                font-weight: 500;
                letter-spacing: 0.5px;
            }

            .close-btn {
                background: none;
                border: none;
                color: #888;
                font-size: 1.5rem;
                cursor: pointer;
                transition: color 0.2s;
            }
            .close-btn:hover { color: #fff; }

            .admin-tabs {
                display: flex;
                background: rgba(0, 0, 0, 0.2);
                padding: 0 20px;
            }

            .admin-tab {
                background: none;
                border: none;
                padding: 15px 20px;
                color: #888;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: all 0.2s;
                font-size: 0.9rem;
            }

            .admin-tab:hover { color: #ccc; }
            .admin-tab.active {
                color: #50c8ff;
                border-bottom-color: #50c8ff;
            }

            .admin-content {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                position: relative;
            }

            .tab-content {
                display: none;
                animation: fadeIn 0.3s;
            }
            .tab-content.active { display: block; }

            /* Tables */
            .admin-table {
                width: 100%;
                border-collapse: collapse;
                background: rgba(0, 0, 0, 0.2);
            }

            .admin-table th, .admin-table td {
                padding: 12px 15px;
                text-align: left;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .admin-table th {
                color: #888;
                font-weight: 500;
                font-size: 0.85rem;
                text-transform: uppercase;
            }

            .admin-table td { color: #ccc; }
            .admin-table.mono { font-family: monospace; color: #888; font-size: 0.9em; }

            /* Buttons */
            .kick-btn {
                background: rgba(255, 50, 50, 0.1);
                color: #ff5050;
                border: 1px solid rgba(255, 50, 50, 0.3);
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .kick-btn:hover {
                background: rgba(255, 50, 50, 0.2);
                border-color: #ff5050;
            }

            .action-btn {
                background: rgba(80, 200, 255, 0.1);
                color: #50c8ff;
                border: 1px solid rgba(80, 200, 255, 0.3);
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
            }
            .action-btn:hover {
                background: rgba(80, 200, 255, 0.2);
                border-color: #50c8ff;
            }
            .action-btn.danger {
                background: rgba(255, 50, 50, 0.1);
                color: #ff5050;
                border-color: rgba(255, 50, 50, 0.3);
            }
            .action-btn.danger:hover {
                background: rgba(255, 50, 50, 0.2);
                border-color: #ff5050;
            }

            .setting-group {
                margin-bottom: 20px;
                padding: 20px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
            }
            .setting-group label {
                display: block;
                margin-bottom: 10px;
                color: #aaa;
            }
            .setting-group select {
                background: #1a1a20;
                border: 1px solid #444;
                color: #e0e0e0;
                padding: 10px;
                border-radius: 4px;
                min-width: 200px;
                margin-right: 15px;
            }

            #admin-debug-info {
                font-family: monospace;
                white-space: pre-wrap;
                color: #8f8;
                font-size: 0.9rem;
            }
        `;

        document.head.appendChild(style);
        this.initialized = true;
    }
}
