/**
 * Screenshot Gallery - Галерея скриншотов с миниатюрами и экспортом
 */

import { ScreenshotMetadata } from "./screenshotManager";
import { logger } from "./utils/logger";

export class ScreenshotGallery {
    private container: HTMLDivElement | null = null;
    private screenshots: ScreenshotMetadata[] = [];
    private isVisible: boolean = false;
    
    /**
     * Создание UI галереи
     */
    createUI(): void {
        if (this.container) {
            this.container.remove();
        }
        
        this.container = document.createElement('div');
        this.container.id = 'screenshot-gallery';
        this.container.className = 'panel-overlay';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10002;
            display: none;
            overflow-y: auto;
        `;
        
        this.container.innerHTML = `
            <div class="gallery-header" style="
                padding: 20px;
                background: rgba(0, 20, 0, 0.95);
                border-bottom: 2px solid rgba(0, 255, 4, 0.6);
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 1;
            ">
                <h2 style="color: #0ff; margin: 0; font-family: Consolas, monospace;">Галерея скриншотов</h2>
                <div style="display: flex; gap: 10px;">
                    <button id="gallery-export-all" class="gallery-btn" style="
                        padding: 8px 16px;
                        background: rgba(0, 255, 4, 0.2);
                        border: 1px solid rgba(0, 255, 4, 0.6);
                        color: #0f0;
                        cursor: pointer;
                        font-family: Consolas, monospace;
                    ">Экспорт всех</button>
                    <button id="gallery-clear-all" class="gallery-btn" style="
                        padding: 8px 16px;
                        background: rgba(255, 0, 0, 0.2);
                        border: 1px solid rgba(255, 0, 0, 0.6);
                        color: #f00;
                        cursor: pointer;
                        font-family: Consolas, monospace;
                    ">Очистить</button>
                    <button id="gallery-close" class="gallery-btn" style="
                        padding: 8px 16px;
                        background: rgba(0, 255, 4, 0.2);
                        border: 1px solid rgba(0, 255, 4, 0.6);
                        color: #0f0;
                        cursor: pointer;
                        font-family: Consolas, monospace;
                    ">Закрыть</button>
                </div>
            </div>
            <div class="gallery-grid" id="gallery-grid" style="
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 20px;
                padding: 20px;
            "></div>
        `;
        
        document.body.appendChild(this.container);
        this.setupEventListeners();
    }
    
    /**
     * Настройка обработчиков событий
     */
    private setupEventListeners(): void {
        document.getElementById('gallery-export-all')?.addEventListener('click', () => this.exportAll());
        document.getElementById('gallery-clear-all')?.addEventListener('click', () => this.clearAll());
        document.getElementById('gallery-close')?.addEventListener('click', () => this.hide());
    }
    
    /**
     * Загрузка скриншотов из localStorage
     */
    async loadScreenshots(): Promise<void> {
        try {
            const meta = JSON.parse(localStorage.getItem('ptx_screenshots_meta') || '[]');
            this.screenshots = meta.sort((a: ScreenshotMetadata, b: ScreenshotMetadata) => b.timestamp - a.timestamp);
            this.renderGallery();
        } catch (error) {
            logger.error("[ScreenshotGallery] Failed to load screenshots:", error);
        }
    }
    
    /**
     * Отрисовка галереи
     */
    private renderGallery(): void {
        const grid = document.getElementById('gallery-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (this.screenshots.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #aaa; padding: 40px;">Нет сохранённых скриншотов</div>';
            return;
        }
        
        this.screenshots.forEach(meta => {
            const thumbnail = this.createThumbnail(meta);
            grid.appendChild(thumbnail);
        });
    }
    
    /**
     * Создание миниатюры скриншота
     */
    private createThumbnail(meta: ScreenshotMetadata): HTMLDivElement {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.style.cssText = `
            background: rgba(0, 10, 0, 0.5);
            border: 1px solid rgba(0, 255, 4, 0.3);
            border-radius: 4px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 0.2s, border-color 0.2s;
        `;
        
        item.onmouseenter = () => {
            item.style.transform = 'scale(1.05)';
            item.style.borderColor = 'rgba(0, 255, 4, 0.8)';
        };
        item.onmouseleave = () => {
            item.style.transform = 'scale(1)';
            item.style.borderColor = 'rgba(0, 255, 4, 0.3)';
        };
        
        const img = document.createElement('img');
        img.style.cssText = `
            width: 100%;
            height: 150px;
            object-fit: cover;
            display: block;
        `;
        
        const screenshot = localStorage.getItem(`ptx_screenshot_${meta.timestamp}`);
        if (screenshot) {
            img.src = screenshot;
            img.onclick = () => this.showFullscreen(screenshot, meta);
            img.onerror = () => {
                img.style.display = 'none';
                item.innerHTML = '<div style="padding: 20px; text-align: center; color: #f00;">Ошибка загрузки</div>';
            };
        } else {
            img.style.display = 'none';
            item.innerHTML = '<div style="padding: 20px; text-align: center; color: #f00;">Скриншот не найден</div>';
        }
        
        const info = document.createElement('div');
        info.className = 'gallery-info';
        info.style.cssText = `
            padding: 10px;
            font-size: 11px;
            color: #aaa;
            font-family: Consolas, monospace;
        `;
        info.innerHTML = `
            <div>${new Date(meta.timestamp).toLocaleString()}</div>
            <div>${(meta.size / 1024).toFixed(2)} KB</div>
            <button onclick="event.stopPropagation(); gallery.deleteScreenshot(${meta.timestamp})" style="
                margin-top: 5px;
                padding: 4px 8px;
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.6);
                color: #f00;
                cursor: pointer;
                font-size: 10px;
            ">Удалить</button>
        `;
        
        item.appendChild(img);
        item.appendChild(info);
        return item;
    }
    
    /**
     * Показать скриншот в полноэкранном режиме
     */
    private showFullscreen(dataUrl: string, meta: ScreenshotMetadata): void {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 10003;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;
        
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
        `;
        
        const info = document.createElement('div');
        info.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: #0f0;
            font-family: Consolas, monospace;
            background: rgba(0, 10, 0, 0.8);
            padding: 10px 20px;
            border-radius: 4px;
        `;
        info.textContent = `${new Date(meta.timestamp).toLocaleString()} - ${(meta.size / 1024).toFixed(2)} KB`;
        
        overlay.appendChild(img);
        overlay.appendChild(info);
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }
    
    /**
     * Удаление скриншота
     */
    deleteScreenshot(timestamp: number): void {
        if (!confirm('Удалить этот скриншот?')) return;
        
        localStorage.removeItem(`ptx_screenshot_${timestamp}`);
        this.screenshots = this.screenshots.filter(m => m.timestamp !== timestamp);
        
        const metaKey = "ptx_screenshots_meta";
        localStorage.setItem(metaKey, JSON.stringify(this.screenshots));
        
        this.renderGallery();
    }
    
    /**
     * Экспорт всех скриншотов в ZIP
     */
    async exportAll(): Promise<void> {
        try {
            // Динамический импорт JSZip (опционально)
            // Используем полностью динамический импорт для обхода статического анализа
            let JSZip: any;
            try {
                // Используем Function constructor чтобы Rollup не видел этот импорт
                const dynamicImport = new Function('spec', 'return import(spec)');
                const jszipModule = await dynamicImport('jszip');
                JSZip = jszipModule.default || jszipModule;
            } catch (error) {
                logger.warn('[ScreenshotGallery] JSZip not available, skipping ZIP export');
                alert('Экспорт в ZIP недоступен. Установите пакет jszip для этой функции.');
                return;
            }
            if (!JSZip) {
                alert('JSZip не загружен');
                return;
            }
            const zip = new JSZip();
            
            let count = 0;
            for (const meta of this.screenshots) {
                const screenshot = localStorage.getItem(`ptx_screenshot_${meta.timestamp}`);
                if (screenshot) {
                    try {
                        const blob = await fetch(screenshot).then(r => r.blob());
                        const ext = meta.format === 'image/jpeg' ? 'jpg' : meta.format === 'image/webp' ? 'webp' : 'png';
                        zip.file(`screenshot_${meta.timestamp}.${ext}`, blob);
                        count++;
                    } catch (error) {
                        logger.warn(`[ScreenshotGallery] Failed to add screenshot ${meta.timestamp}:`, error);
                    }
                }
            }
            
            if (count === 0) {
                alert('Нет скриншотов для экспорта');
                return;
            }
            
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `screenshots_${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            
            logger.log(`[ScreenshotGallery] Exported ${count} screenshots`);
        } catch (error) {
            logger.error("[ScreenshotGallery] Export failed:", error);
            alert('Ошибка экспорта. Убедитесь, что библиотека JSZip установлена.');
        }
    }
    
    /**
     * Очистка всех скриншотов
     */
    clearAll(): void {
        if (!confirm('Удалить ВСЕ скриншоты? Это действие нельзя отменить.')) return;
        
        this.screenshots.forEach(meta => {
            localStorage.removeItem(`ptx_screenshot_${meta.timestamp}`);
        });
        
        localStorage.removeItem('ptx_screenshots_meta');
        this.screenshots = [];
        this.renderGallery();
    }
    
    /**
     * Показать галерею
     */
    show(): void {
        if (!this.container) {
            this.createUI();
        }
        this.isVisible = true;
        if (this.container) {
            this.container.style.display = 'block';
            this.loadScreenshots();
        }
    }
    
    /**
     * Скрыть галерею
     */
    hide(): void {
        this.isVisible = false;
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
    
    /**
     * Переключить видимость
     */
    toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

// Глобальный экземпляр для доступа из HTML
declare global {
    interface Window {
        gallery: ScreenshotGallery;
    }
}

