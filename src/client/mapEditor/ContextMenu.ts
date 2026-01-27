/**
 * @module mapEditor/ContextMenu
 * @description Контекстное меню для объектов в MapEditor
 * 
 * Правый клик на танк → меню с опциями редактирования
 */

export interface ContextMenuOption {
    id: string;
    label: string;
    icon?: string;
    action: () => void;
    disabled?: boolean;
}

export class ContextMenu {
    private menu: HTMLDivElement | null = null;
    private options: ContextMenuOption[] = [];
    private isVisible: boolean = false;
    
    constructor() {
        this.createMenu();
    }
    
    private createMenu(): void {
        this.menu = document.createElement('div');
        this.menu.id = 'mapeditor-context-menu';
        this.menu.style.cssText = `
            position: fixed;
            background: rgba(0, 20, 0, 0.95);
            border: 2px solid rgba(0, 255, 0, 0.6);
            border-radius: 4px;
            padding: 5px 0;
            min-width: 200px;
            z-index: 100010;
            display: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            pointer-events: auto;
        `;
        
        document.body.appendChild(this.menu);
        
        // Закрытие при клике вне меню
        document.addEventListener('click', (e) => {
            if (this.menu && this.isVisible && !this.menu.contains(e.target as Node)) {
                this.hide();
            }
        });
        
        // Закрытие при нажатии Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }
    
    /**
     * Показать меню в указанной позиции
     */
    show(x: number, y: number, options: ContextMenuOption[]): void {
        if (!this.menu) return;
        
        this.options = options;
        this.render();
        
        // Позиционируем меню
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        
        // Проверяем, не выходит ли за границы экрана
        const rect = this.menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
        
        this.menu.style.display = 'block';
        this.isVisible = true;
    }
    
    /**
     * Скрыть меню
     */
    hide(): void {
        if (this.menu) {
            this.menu.style.display = 'none';
            this.isVisible = false;
        }
    }
    
    private render(): void {
        if (!this.menu) return;
        
        const html = this.options.map(option => `
            <div class="context-menu-item ${option.disabled ? 'disabled' : ''}" 
                 data-action="${option.id}"
                 style="
                     padding: 8px 15px;
                     color: ${option.disabled ? '#666' : '#0f0'};
                     cursor: ${option.disabled ? 'not-allowed' : 'pointer'};
                     font-size: 12px;
                     display: flex;
                     align-items: center;
                     gap: 10px;
                     transition: background 0.2s;
                 "
                 onmouseover="if (!this.classList.contains('disabled')) this.style.background='rgba(0, 255, 0, 0.2)'"
                 onmouseout="this.style.background='transparent'">
                ${option.icon ? `<span style="font-size: 14px;">${option.icon}</span>` : ''}
                <span>${option.label}</span>
            </div>
        `).join('');
        
        this.menu.innerHTML = html;
        
        // Обработчики кликов
        this.menu.querySelectorAll('.context-menu-item').forEach(item => {
            const actionId = (item as HTMLElement).dataset.action;
            const option = this.options.find(o => o.id === actionId);
            
            if (option && !option.disabled) {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    option.action();
                    this.hide();
                });
            }
        });
    }
    
    /**
     * Проверить, видимо ли меню
     */
    getVisible(): boolean {
        return this.isVisible;
    }
    
    dispose(): void {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
    }
}

export default ContextMenu;

