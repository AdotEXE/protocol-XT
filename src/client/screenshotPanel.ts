/**
 * Screenshot Panel - Расширенная панель настроек скриншотов
 */

import { ScreenshotManager, ScreenshotFormat, ScreenshotMode, ScreenshotOptions, ImageFilters, WatermarkOptions } from "./screenshotManager";
import { AutoScreenshotManager, AutoScreenshotTrigger } from "./autoScreenshot";
import { ScreenshotGallery } from "./screenshotGallery";
import { logger } from "./utils/logger";
import { CommonStyles } from "./commonStyles";

export class ScreenshotPanel {
    private container: HTMLDivElement | null = null;
    private isVisible: boolean = false;
    private screenshotManager: ScreenshotManager;
    private autoScreenshotManager: AutoScreenshotManager | null = null;
    private gallery: ScreenshotGallery;
    private game: any;
    
    constructor(screenshotManager: ScreenshotManager, game: any) {
        this.screenshotManager = screenshotManager;
        this.game = game;
        this.gallery = new ScreenshotGallery();
        this.createUI();
        this.setupEventListeners();
    }
    
    /**
     * Создание UI панели
     */
    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();
        
        this.container = document.createElement('div');
        this.container.id = 'screenshot-panel';
        this.container.className = 'panel-overlay';
        
        this.container.innerHTML = `
            <div class="panel" style="width: min(600px, 90vw); max-height: min(800px, 90vh);">
                <div class="panel-header">
                    <div class="panel-title">НАСТРОЙКИ СКРИНШОТА [F2]</div>
                    <button class="panel-close" id="screenshot-panel-close">×</button>
                </div>
                <div class="panel-content">
                <!-- Формат -->
                <div class="setting-group" style="margin-bottom: 20px;">
                    <label style="color: #ff0; font-size: 14px; font-weight: bold; display: block; margin-bottom: 8px;">Формат:</label>
                    <select id="screenshot-format" style="
                        width: 100%;
                        padding: 6px 8px;
                        background: rgba(0, 5, 0, 0.5);
                        border: 1px solid rgba(0, 255, 4, 0.4);
                        border-radius: 4px;
                        color: #0f0;
                        font-family: Consolas, monospace;
                    ">
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                    </select>
                    <div id="quality-control" style="display: none; margin-top: 10px;">
                        <label style="color: #aaa; font-size: 12px; display: block; margin-bottom: 5px;">
                            Качество: <span id="quality-value">92%</span>
                        </label>
                        <input type="range" id="screenshot-quality" min="0" max="100" value="92" style="
                            width: 100%;
                            height: 6px;
                            background: rgba(0, 10, 0, 0.5);
                            border-radius: 3px;
                            outline: none;
                        ">
                    </div>
                </div>
                
                <!-- Режим -->
                <div class="setting-group" style="margin-bottom: 20px;">
                    <label style="color: #ff0; font-size: 14px; font-weight: bold; display: block; margin-bottom: 8px;">Режим:</label>
                    <select id="screenshot-mode" style="
                        width: 100%;
                        padding: 6px 8px;
                        background: rgba(0, 5, 0, 0.5);
                        border: 1px solid rgba(0, 255, 4, 0.4);
                        border-radius: 4px;
                        color: #0f0;
                        font-family: Consolas, monospace;
                    ">
                        <option value="full">Полный экран</option>
                        <option value="game">Только игра</option>
                        <option value="ui">Только UI</option>
                        <option value="region">Область</option>
                    </select>
                </div>
                
                <!-- Фильтры -->
                <div class="setting-group" style="margin-bottom: 20px;">
                    <label style="color: #ff0; font-size: 14px; font-weight: bold; display: block; margin-bottom: 8px;">Фильтры:</label>
                    <div class="filter-controls" style="display: flex; flex-direction: column; gap: 10px;">
                        <label style="color: #aaa; font-size: 12px;">
                            Яркость: <span id="brightness-value">0</span>
                            <input type="range" id="filter-brightness" min="-100" max="100" value="0" style="width: 100%;">
                        </label>
                        <label style="color: #aaa; font-size: 12px;">
                            Контраст: <span id="contrast-value">0</span>
                            <input type="range" id="filter-contrast" min="-100" max="100" value="0" style="width: 100%;">
                        </label>
                        <label style="color: #aaa; font-size: 12px;">
                            Насыщенность: <span id="saturation-value">0</span>
                            <input type="range" id="filter-saturation" min="-100" max="100" value="0" style="width: 100%;">
                        </label>
                    </div>
                </div>
                
                <!-- Водяной знак -->
                <div class="setting-group" style="margin-bottom: 20px;">
                    <label style="color: #ff0; font-size: 14px; font-weight: bold; display: block; margin-bottom: 8px;">
                        <input type="checkbox" id="watermark-enabled" style="margin-right: 8px;"> Водяной знак
                    </label>
                    <div id="watermark-controls" style="display: none; margin-top: 10px;">
                        <input type="text" id="watermark-text" placeholder="Текст водяного знака" style="
                            width: 100%;
                            padding: 6px 8px;
                            background: rgba(0, 5, 0, 0.5);
                            border: 1px solid rgba(0, 255, 4, 0.4);
                            border-radius: 4px;
                            color: #0f0;
                            margin-bottom: 10px;
                        ">
                        <select id="watermark-position" style="
                            width: 100%;
                            padding: 6px 8px;
                            background: rgba(0, 5, 0, 0.5);
                            border: 1px solid rgba(0, 255, 4, 0.4);
                            border-radius: 4px;
                            color: #0f0;
                        ">
                            <option value="bottom-right">Справа внизу</option>
                            <option value="bottom-left">Слева внизу</option>
                            <option value="top-right">Справа вверху</option>
                            <option value="top-left">Слева вверху</option>
                            <option value="center">По центру</option>
                        </select>
                    </div>
                </div>
                
                <!-- Автоматические скриншоты -->
                <div class="setting-group" style="margin-bottom: 20px;">
                    <h3 style="color: #ff0; font-size: 14px; font-weight: bold; margin-bottom: 10px;">Автоматические скриншоты</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <label style="color: #aaa; font-size: 12px;">
                            <input type="checkbox" id="auto-kill" style="margin-right: 8px;"> При убийстве врага
                        </label>
                        <label style="color: #aaa; font-size: 12px;">
                            <input type="checkbox" id="auto-death" style="margin-right: 8px;"> При смерти
                        </label>
                        <label style="color: #aaa; font-size: 12px;">
                            <input type="checkbox" id="auto-achievement" style="margin-right: 8px;"> При достижении
                        </label>
                        <label style="color: #aaa; font-size: 12px;">
                            <input type="checkbox" id="auto-interval" style="margin-right: 8px;"> Интервальные
                        </label>
                        <div id="interval-controls" style="display: none; margin-top: 10px;">
                            <label style="color: #aaa; font-size: 12px;">
                                Интервал (сек): <input type="number" id="interval-seconds" min="1" value="60" style="
                                    width: 80px;
                                    padding: 4px;
                                    background: rgba(0, 5, 0, 0.5);
                                    border: 1px solid rgba(0, 255, 4, 0.4);
                                    border-radius: 4px;
                                    color: #0f0;
                                ">
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="panel-buttons" style="
                padding: 16px;
                border-top: 2px solid rgba(0, 255, 4, 0.4);
                display: flex;
                gap: 10px;
            ">
                <button id="take-screenshot" class="btn-primary" style="
                    flex: 1;
                    padding: 10px;
                    background: rgba(0, 255, 4, 0.3);
                    border: 1px solid rgba(0, 255, 4, 0.6);
                    border-radius: 4px;
                    color: #0f0;
                    font-family: Consolas, monospace;
                    font-weight: bold;
                    cursor: pointer;
                ">Сделать скриншот</button>
                <button id="open-gallery" class="btn-secondary" style="
                    flex: 1;
                    padding: 10px;
                    background: rgba(0, 255, 4, 0.2);
                    border: 1px solid rgba(0, 255, 4, 0.6);
                    border-radius: 4px;
                    color: #0f0;
                    font-family: Consolas, monospace;
                    cursor: pointer;
                ">Галерея</button>
            </div>
        `;
        
        document.body.appendChild(this.container);
    }
    
    /**
     * Настройка обработчиков событий
     */
    private setupEventListeners(): void {
        // Закрытие панели
        document.getElementById('screenshot-panel-close')?.addEventListener('click', () => this.hide());
        
        // Формат - показывать/скрывать качество для JPEG/WebP
        document.getElementById('screenshot-format')?.addEventListener('change', (e) => {
            const format = (e.target as HTMLSelectElement).value;
            const qualityControl = document.getElementById('quality-control');
            if (qualityControl) {
                qualityControl.style.display = (format === 'jpeg' || format === 'webp') ? 'block' : 'none';
            }
            this.saveSettings();
        });
        
        // Качество
        document.getElementById('screenshot-quality')?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            const display = document.getElementById('quality-value');
            if (display) display.textContent = `${value}%`;
            this.saveSettings();
        });
        
        // Режим
        document.getElementById('screenshot-mode')?.addEventListener('change', () => this.saveSettings());
        
        // Фильтры
        ['brightness', 'contrast', 'saturation'].forEach(filter => {
            const slider = document.getElementById(`filter-${filter}`);
            const valueDisplay = document.getElementById(`${filter}-value`);
            slider?.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                if (valueDisplay) valueDisplay.textContent = value;
                this.saveSettings();
            });
        });
        
        // Водяной знак
        document.getElementById('watermark-enabled')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const controls = document.getElementById('watermark-controls');
            if (controls) controls.style.display = enabled ? 'block' : 'none';
            this.saveSettings();
        });
        
        document.getElementById('watermark-text')?.addEventListener('input', () => this.saveSettings());
        document.getElementById('watermark-position')?.addEventListener('change', () => this.saveSettings());
        
        // Автоматические скриншоты
        document.getElementById('auto-interval')?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            const controls = document.getElementById('interval-controls');
            if (controls) controls.style.display = enabled ? 'block' : 'none';
            this.saveSettings();
        });
        
        ['auto-kill', 'auto-death', 'auto-achievement', 'auto-interval'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.saveSettings());
        });
        
        document.getElementById('interval-seconds')?.addEventListener('change', () => this.saveSettings());
        
        // Кнопки
        document.getElementById('take-screenshot')?.addEventListener('click', () => this.takeScreenshot());
        document.getElementById('open-gallery')?.addEventListener('click', () => {
            this.hide();
            this.gallery.show();
        });
        
        // Загрузка сохранённых настроек
        this.loadSettings();
    }
    
    /**
     * Сохранение настроек в localStorage
     */
    private saveSettings(): void {
        const format = (document.getElementById('screenshot-format') as HTMLSelectElement)?.value || 'png';
        const mode = (document.getElementById('screenshot-mode') as HTMLSelectElement)?.value || 'full';
        const quality = (document.getElementById('screenshot-quality') as HTMLInputElement)?.value || '92';
        const brightness = (document.getElementById('filter-brightness') as HTMLInputElement)?.value || '0';
        const contrast = (document.getElementById('filter-contrast') as HTMLInputElement)?.value || '0';
        const saturation = (document.getElementById('filter-saturation') as HTMLInputElement)?.value || '0';
        const watermarkEnabled = (document.getElementById('watermark-enabled') as HTMLInputElement)?.checked || false;
        const watermarkText = (document.getElementById('watermark-text') as HTMLInputElement)?.value || '';
        const watermarkPosition = (document.getElementById('watermark-position') as HTMLSelectElement)?.value || 'bottom-right';
        
        localStorage.setItem('ptx_screenshot_format', format);
        localStorage.setItem('ptx_screenshot_mode', mode);
        localStorage.setItem('ptx_screenshot_quality', quality);
        localStorage.setItem('ptx_screenshot_filters', JSON.stringify({ brightness: parseInt(brightness), contrast: parseInt(contrast), saturation: parseInt(saturation) }));
        localStorage.setItem('ptx_screenshot_watermark', JSON.stringify({ enabled: watermarkEnabled, text: watermarkText, position: watermarkPosition }));
    }
    
    /**
     * Загрузка настроек из localStorage
     */
    private loadSettings(): void {
        const format = localStorage.getItem('ptx_screenshot_format') || 'png';
        const mode = localStorage.getItem('ptx_screenshot_mode') || 'full';
        const quality = localStorage.getItem('ptx_screenshot_quality') || '92';
        const filters = JSON.parse(localStorage.getItem('ptx_screenshot_filters') || '{"brightness":0,"contrast":0,"saturation":0}');
        const watermark = JSON.parse(localStorage.getItem('ptx_screenshot_watermark') || '{"enabled":false,"text":"","position":"bottom-right"}');
        
        (document.getElementById('screenshot-format') as HTMLSelectElement).value = format;
        (document.getElementById('screenshot-mode') as HTMLSelectElement).value = mode;
        (document.getElementById('screenshot-quality') as HTMLInputElement).value = quality;
        (document.getElementById('quality-value') as HTMLElement).textContent = `${quality}%`;
        (document.getElementById('filter-brightness') as HTMLInputElement).value = filters.brightness || '0';
        (document.getElementById('brightness-value') as HTMLElement).textContent = filters.brightness || '0';
        (document.getElementById('filter-contrast') as HTMLInputElement).value = filters.contrast || '0';
        (document.getElementById('contrast-value') as HTMLElement).textContent = filters.contrast || '0';
        (document.getElementById('filter-saturation') as HTMLInputElement).value = filters.saturation || '0';
        (document.getElementById('saturation-value') as HTMLElement).textContent = filters.saturation || '0';
        (document.getElementById('watermark-enabled') as HTMLInputElement).checked = watermark.enabled || false;
        (document.getElementById('watermark-text') as HTMLInputElement).value = watermark.text || '';
        (document.getElementById('watermark-position') as HTMLSelectElement).value = watermark.position || 'bottom-right';
        
        // Показать/скрыть контролы
        const qualityControl = document.getElementById('quality-control');
        if (qualityControl) {
            qualityControl.style.display = (format === 'jpeg' || format === 'webp') ? 'block' : 'none';
        }
        const watermarkControls = document.getElementById('watermark-controls');
        if (watermarkControls) {
            watermarkControls.style.display = watermark.enabled ? 'block' : 'none';
        }
    }
    
    /**
     * Создание скриншота с текущими настройками
     */
    private async takeScreenshot(): Promise<void> {
        try {
            const format = (document.getElementById('screenshot-format') as HTMLSelectElement)?.value || 'png';
            const mode = (document.getElementById('screenshot-mode') as HTMLSelectElement)?.value || 'full';
            const quality = parseFloat((document.getElementById('screenshot-quality') as HTMLInputElement)?.value || '92') / 100;
            const brightness = parseInt((document.getElementById('filter-brightness') as HTMLInputElement)?.value || '0');
            const contrast = parseInt((document.getElementById('filter-contrast') as HTMLInputElement)?.value || '0');
            const saturation = parseInt((document.getElementById('filter-saturation') as HTMLInputElement)?.value || '0');
            const watermarkEnabled = (document.getElementById('watermark-enabled') as HTMLInputElement)?.checked || false;
            const watermarkText = (document.getElementById('watermark-text') as HTMLInputElement)?.value || '';
            const watermarkPosition = (document.getElementById('watermark-position') as HTMLSelectElement)?.value || 'bottom-right';
            
            const formatMap: { [key: string]: ScreenshotFormat } = {
                'png': ScreenshotFormat.PNG,
                'jpeg': ScreenshotFormat.JPEG,
                'webp': ScreenshotFormat.WEBP
            };
            const modeMap: { [key: string]: ScreenshotMode } = {
                'full': ScreenshotMode.FULL_SCREEN,
                'game': ScreenshotMode.GAME_ONLY,
                'ui': ScreenshotMode.UI_ONLY,
                'region': ScreenshotMode.REGION
            };
            
            const options: ScreenshotOptions = {
                format: formatMap[format] || ScreenshotFormat.PNG,
                quality: quality,
                mode: modeMap[mode] || ScreenshotMode.FULL_SCREEN,
                filters: (brightness !== 0 || contrast !== 0 || saturation !== 0) ? {
                    brightness,
                    contrast,
                    saturation
                } : undefined,
                watermark: watermarkEnabled && watermarkText ? {
                    text: watermarkText,
                    position: watermarkPosition as any,
                    opacity: 0.7,
                    fontSize: 24
                } : undefined
            };
            
            const blob = await this.screenshotManager.capture(options);
            await this.screenshotManager.copyToClipboard(blob);
            await this.screenshotManager.saveToLocalStorage(blob, options);
            
            if (this.game?.hud) {
                this.game.hud.showMessage("📸 Screenshot saved! (F2)", "#0f0", 3000);
            }
            
            logger.log("[ScreenshotPanel] Screenshot taken with options:", options);
        } catch (error) {
            logger.error("[ScreenshotPanel] Screenshot failed:", error);
            if (this.game?.hud) {
                this.game.hud.showMessage("Screenshot failed", "#f00", 2000);
            }
        }
    }
    
    /**
     * Показать панель
     */
    show(): void {
        this.isVisible = true;
        if (this.container) {
            this.container.style.display = 'flex';
            this.loadSettings();
        }
    }
    
    /**
     * Скрыть панель
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
    
    isVisible(): boolean {
        return this.isVisible;
    }
}

