/**
 * Screenshot Manager - Расширенная система скриншотов
 * Поддерживает форматы PNG, JPEG, WebP, режимы, фильтры, водяные знаки
 */

import { Engine, Scene } from "@babylonjs/core";
import { HUD } from "./hud";
import { logger } from "./utils/logger";

export enum ScreenshotFormat {
    PNG = "image/png",
    JPEG = "image/jpeg",
    WEBP = "image/webp"
}

export enum ScreenshotMode {
    FULL_SCREEN = "full",
    REGION = "region",
    GAME_ONLY = "game",
    UI_ONLY = "ui"
}

export interface ImageFilters {
    brightness?: number; // -100 to 100
    contrast?: number;   // -100 to 100
    saturation?: number; // -100 to 100
    blur?: number;      // 0 to 10
    sharpen?: number;   // 0 to 100
}

export interface WatermarkOptions {
    text?: string;
    image?: string; // Data URL
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
    opacity: number;
    fontSize?: number;
}

export interface TextOverlayOptions {
    text: string;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
}

export interface ScreenshotOptions {
    format: ScreenshotFormat;
    quality?: number; // 0-1 для JPEG/WebP
    mode: ScreenshotMode;
    filters?: ImageFilters;
    watermark?: WatermarkOptions;
    textOverlay?: TextOverlayOptions;
    region?: { x: number; y: number; width: number; height: number };
}

export interface ScreenshotMetadata {
    timestamp: number;
    size: number;
    format: ScreenshotFormat;
    mode: ScreenshotMode;
}

export class ScreenshotManager {
    private engine: Engine;
    private scene: Scene;
    private hud: HUD | null;
    
    constructor(engine: Engine, scene: Scene, hud: HUD | null = null) {
        this.engine = engine;
        this.scene = scene;
        this.hud = hud;
    }
    
    setHUD(hud: HUD | null): void {
        this.hud = hud;
    }
    
    /**
     * Создать скриншот с указанными опциями
     */
    async capture(options: ScreenshotOptions): Promise<Blob> {
        try {
            let canvas: HTMLCanvasElement;
            
            switch (options.mode) {
                case ScreenshotMode.FULL_SCREEN:
                    canvas = await this.engine.createScreenshot();
                    break;
                    
                case ScreenshotMode.GAME_ONLY:
                    // Скрыть UI временно
                    const uiVisible = this.hud?.isVisible?.() ?? true;
                    if (this.hud && typeof this.hud.hide === 'function') {
                        this.hud.hide();
                    }
                    canvas = await this.engine.createScreenshot();
                    if (uiVisible && this.hud && typeof this.hud.show === 'function') {
                        this.hud.show();
                    }
                    break;
                    
                case ScreenshotMode.UI_ONLY:
                    canvas = await this.captureUIOnly();
                    break;
                    
                case ScreenshotMode.REGION:
                    if (options.region) {
                        canvas = await this.captureRegion(options.region);
                    } else {
                        throw new Error("Region coordinates required for REGION mode");
                    }
                    break;
                    
                default:
                    canvas = await this.engine.createScreenshot();
            }
            
            // Применение фильтров и обработки
            const processedCanvas = await this.processScreenshot(canvas, options);
            
            // Конвертация в нужный формат
            const blob = await this.convertFormat(processedCanvas, options.format, options.quality);
            
            return blob;
        } catch (error) {
            logger.error("[ScreenshotManager] Capture failed:", error);
            throw error;
        }
    }
    
    /**
     * Конвертация формата через Canvas API
     */
    private async convertFormat(canvas: HTMLCanvasElement, format: ScreenshotFormat, quality: number = 0.92): Promise<Blob> {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error('Conversion failed')),
                format,
                quality
            );
        });
    }
    
    /**
     * Применение фильтров к изображению
     */
    private async applyFilters(canvas: HTMLCanvasElement, filters: ImageFilters): Promise<HTMLCanvasElement> {
        if (!filters || Object.keys(filters).length === 0) {
            return canvas;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            
            // Brightness
            if (filters.brightness !== undefined) {
                r = Math.max(0, Math.min(255, r + filters.brightness));
                g = Math.max(0, Math.min(255, g + filters.brightness));
                b = Math.max(0, Math.min(255, b + filters.brightness));
            }
            
            // Contrast
            if (filters.contrast !== undefined) {
                const factor = (259 * (filters.contrast + 255)) / (255 * (259 - filters.contrast));
                r = Math.max(0, Math.min(255, factor * (r - 128) + 128));
                g = Math.max(0, Math.min(255, factor * (g - 128) + 128));
                b = Math.max(0, Math.min(255, factor * (b - 128) + 128));
            }
            
            // Saturation
            if (filters.saturation !== undefined) {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                const factor = filters.saturation / 100;
                r = Math.max(0, Math.min(255, gray + (r - gray) * (1 + factor)));
                g = Math.max(0, Math.min(255, gray + (g - gray) * (1 + factor)));
                b = Math.max(0, Math.min(255, gray + (b - gray) * (1 + factor)));
            }
            
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
    
    /**
     * Добавление водяного знака
     */
    private async addWatermark(canvas: HTMLCanvasElement, options: WatermarkOptions): Promise<HTMLCanvasElement> {
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        
        ctx.globalAlpha = options.opacity;
        
        if (options.text) {
            ctx.font = `${options.fontSize || 24}px Arial`;
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            
            const position = this.calculateWatermarkPosition(canvas, options.position, ctx.measureText(options.text).width, options.fontSize || 24);
            ctx.strokeText(options.text, position.x, position.y);
            ctx.fillText(options.text, position.x, position.y);
        } else if (options.image) {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Watermark image load failed'));
                img.src = options.image!;
            });
            const position = this.calculateWatermarkPosition(canvas, options.position, img.width, img.height);
            ctx.drawImage(img, position.x, position.y);
        }
        
        ctx.globalAlpha = 1.0;
        return canvas;
    }
    
    /**
     * Добавление текстового оверлея
     */
    private addTextOverlay(canvas: HTMLCanvasElement, options: TextOverlayOptions): HTMLCanvasElement {
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        
        ctx.font = `${options.fontSize || 16}px Arial`;
        const metrics = ctx.measureText(options.text);
        const textWidth = metrics.width;
        const textHeight = options.fontSize || 16;
        
        const position = this.calculateWatermarkPosition(canvas, options.position, textWidth, textHeight);
        
        // Фон (если указан)
        if (options.backgroundColor) {
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(position.x - 5, position.y - textHeight - 5, textWidth + 10, textHeight + 10);
        }
        
        // Текст
        ctx.fillStyle = options.color || 'white';
        ctx.fillText(options.text, position.x, position.y);
        
        return canvas;
    }
    
    /**
     * Вычисление позиции водяного знака
     */
    private calculateWatermarkPosition(
        canvas: HTMLCanvasElement,
        position: string,
        width: number,
        height: number
    ): { x: number; y: number } {
        const padding = 10;
        
        switch (position) {
            case "top-left":
                return { x: padding, y: height + padding };
            case "top-right":
                return { x: canvas.width - width - padding, y: height + padding };
            case "bottom-left":
                return { x: padding, y: canvas.height - padding };
            case "bottom-right":
                return { x: canvas.width - width - padding, y: canvas.height - padding };
            case "center":
                return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2 };
            default:
                return { x: padding, y: canvas.height - padding };
        }
    }
    
    /**
     * Обработка скриншота (фильтры, водяной знак, текст)
     */
    private async processScreenshot(canvas: HTMLCanvasElement, options: ScreenshotOptions): Promise<HTMLCanvasElement> {
        // Применение фильтров
        if (options.filters) {
            canvas = await this.applyFilters(canvas, options.filters);
        }
        
        // Добавление водяного знака
        if (options.watermark) {
            canvas = await this.addWatermark(canvas, options.watermark);
        }
        
        // Добавление текстового оверлея
        if (options.textOverlay) {
            canvas = this.addTextOverlay(canvas, options.textOverlay);
        }
        
        return canvas;
    }
    
    /**
     * Захват только UI элементов
     */
    private async captureUIOnly(): Promise<HTMLCanvasElement> {
        // Создаём canvas для UI
        const canvas = document.createElement('canvas');
        canvas.width = this.engine.getRenderWidth();
        canvas.height = this.engine.getRenderHeight();
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');
        
        // Рисуем только UI элементы (через html2canvas или аналогичную библиотеку)
        // Пока используем простую реализацию - захватываем весь экран
        // В будущем можно интегрировать html2canvas для более точного захвата UI
        const fullCanvas = await this.engine.createScreenshot();
        ctx.drawImage(fullCanvas, 0, 0);
        
        return canvas;
    }
    
    /**
     * Захват области экрана
     */
    private async captureRegion(region: { x: number; y: number; width: number; height: number }): Promise<HTMLCanvasElement> {
        const fullCanvas = await this.engine.createScreenshot();
        const canvas = document.createElement('canvas');
        canvas.width = region.width;
        canvas.height = region.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');
        
        ctx.drawImage(fullCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
        return canvas;
    }
    
    /**
     * Сохранение скриншота в localStorage
     */
    saveToLocalStorage(blob: Blob, options: ScreenshotOptions): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const timestamp = Date.now();
                const key = `ptx_screenshot_${timestamp}`;
                
                // Сохраняем data URL
                localStorage.setItem(key, dataUrl);
                
                // Обновление метаданных
                const metaKey = "ptx_screenshots_meta";
                const meta: ScreenshotMetadata[] = JSON.parse(localStorage.getItem(metaKey) || "[]");
                meta.push({
                    timestamp,
                    size: blob.size,
                    format: options.format,
                    mode: options.mode
                });
                
                // Ограничиваем количество сохраненных скриншотов (последние 50)
                if (meta.length > 50) {
                    const oldest = meta.shift();
                    if (oldest) {
                        localStorage.removeItem(`ptx_screenshot_${oldest.timestamp}`);
                    }
                }
                localStorage.setItem(metaKey, JSON.stringify(meta));
                
                resolve(key);
            };
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
        });
    }
    
    /**
     * Копирование в буфер обмена
     */
    async copyToClipboard(blob: Blob): Promise<boolean> {
        try {
            if (navigator.clipboard && navigator.clipboard.write) {
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                return true;
            }
            return false;
        } catch (error) {
            logger.warn("[ScreenshotManager] Clipboard write failed:", error);
            return false;
        }
    }
}

