/**
 * Расширенный редактор пиксельных аватарок с Gemini AI интеграцией
 */

import { generatePixelAvatar, type PixelAvatarOptions } from "./pixelAvatarGenerator";

export interface AvatarEditorOptions {
    variant?: PixelAvatarOptions['variant'];
    colors?: {
        primary?: string;
        secondary?: string;
        accent?: string;
        background?: string;
    };
    customSeed?: number;
}

export interface GeminiAvatarRequest {
    description: string;
    style?: 'pixel' | 'retro' | 'military' | 'sci-fi' | 'cyberpunk' | 'steampunk' | 'post-apocalyptic';
    colors?: string[];
    complexity?: 'simple' | 'medium' | 'detailed' | 'very-detailed';
    pose?: 'front' | 'side' | 'three-quarter' | 'action';
    accessories?: string[];
    mood?: 'aggressive' | 'neutral' | 'friendly' | 'mysterious';
    lighting?: 'bright' | 'normal' | 'dark' | 'dramatic';
    pixelSize?: '1x1' | '2x2' | 'mixed';
    symmetry?: boolean;
    theme?: 'tank' | 'soldier' | 'vehicle' | 'character' | 'emblem';
}

type PixelVariant = PixelAvatarOptions['variant'];

/** Вариант аватара и seed из текста описания (для fallback без API). */
export function getVariantAndSeedFromDescription(description: string): { variant: PixelVariant; seed: number } {
    const s = description.toLowerCase().trim();
    const variants: PixelVariant[] = ['tank', 'soldier', 'commander', 'pilot', 'sniper', 'engineer', 'medic', 'spy', 'cyborg', 'ninja', 'viking', 'knight'];
    const keywords: Record<NonNullable<PixelVariant>, string[]> = { // [Opus 4.6] NonNullable - PixelVariant can be undefined
        tank: ['танк', 'tank', 'броня', 'пушка'],
        soldier: ['солдат', 'soldier', 'пехота', 'пехотинец'],
        commander: ['командир', 'commander'],
        pilot: ['пилот', 'pilot', 'лётчик'],
        sniper: ['снайпер', 'sniper'],
        engineer: ['инженер', 'engineer'],
        medic: ['медик', 'medic', 'санитар'],
        spy: ['шпион', 'spy', 'разведчик'],
        cyborg: ['киборг', 'cyborg'],
        ninja: ['ниндзя', 'ninja'],
        viking: ['викинг', 'viking'],
        knight: ['рыцарь', 'knight']
    };
    for (const [variant, words] of Object.entries(keywords)) {
        if (words.some(w => s.includes(w))) return { variant: variant as PixelVariant, seed: hashString(s) };
    }
    let hash = hashString(s);
    return { variant: variants[Math.abs(hash) % variants.length], seed: hash };
}

function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
    return Math.abs(h) || 1;
}

/** Результат генерации: canvas и флаг, что использован fallback по описанию (без API). */
export type GenerateAvatarResult = { canvas: HTMLCanvasElement; isFallback: boolean };

/**
 * Генерирует аватар через Gemini API по описанию. При отсутствии ключа или ошибке API
 * возвращает пиксельный аватар по описанию (вариант и seed из текста).
 */
export async function generateAvatarWithGemini(request: GeminiAvatarRequest): Promise<HTMLCanvasElement | null> {
    const fallback = (): HTMLCanvasElement => {
        const { variant, seed } = getVariantAndSeedFromDescription(request.description || 'танк');
        return generatePixelAvatar({ variant, seed });
    };

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';
    if (!apiKey || apiKey.trim() === '') {
        console.warn("[AvatarEditor] Gemini API key not set (VITE_GEMINI_API_KEY). Using description-based fallback.");
        return fallback();
    }

    try {
        const { GoogleGenAI, Type } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });

        const complexityMap = {
            'simple': 'Use simple shapes, minimal details, 3-5 colors maximum',
            'medium': 'Moderate detail level, recognizable features, 5-8 colors',
            'detailed': 'High detail, fine features, 8-12 colors',
            'very-detailed': 'Maximum detail, intricate patterns, 12-16 colors'
        };
        
        const poseMap = {
            'front': 'Front view, facing camera directly',
            'side': 'Side profile view',
            'three-quarter': 'Three-quarter angle view',
            'action': 'Dynamic action pose, movement implied'
        };
        
        const prompt = `Generate a 32x32 pixel art avatar in ${request.theme || 'tank/military'} theme based on this description: "${request.description}".

CRITICAL REQUIREMENTS:
- Output must be a JSON array of pixels: [{"x": number, "y": number, "color": "#hex"}]
- Only 32x32 pixels (coordinates 0-31, integer values only)
- Use pixel art style (no anti-aliasing, solid colors only, no gradients)
- Pixel size: ${request.pixelSize || '1x1'} (each pixel is 1x1 unless specified)
- Style: ${request.style || 'pixel'} art
- Complexity: ${complexityMap[request.complexity || 'medium']}
- Pose: ${poseMap[request.pose || 'front']}
- Colors: ${request.colors?.join(', ') || 'military green (#0a0), dark green (#060), black (#000), gray (#666), accent colors'}
- Mood: ${request.mood || 'neutral'} - reflect this in colors and expression
- Lighting: ${request.lighting || 'normal'} - adjust brightness and contrast accordingly
- Symmetry: ${request.symmetry !== false ? 'Apply vertical symmetry for balanced look' : 'Asymmetric design allowed'}
- Accessories: ${request.accessories?.join(', ') || 'Include relevant military/tank accessories'}
- Theme: ${request.theme || 'tank/military'} with details like: ${request.theme === 'tank' ? 'tank tracks, turret, cannon' : request.theme === 'soldier' ? 'helmet, uniform, weapon' : 'relevant theme elements'}

TECHNICAL CONSTRAINTS:
- Each pixel must have integer x,y coordinates (0-31)
- Colors must be hex format (#rrggbb)
- No transparency (use solid colors)
- Maximum ${request.complexity === 'very-detailed' ? '16' : request.complexity === 'detailed' ? '12' : request.complexity === 'simple' ? '5' : '8'} unique colors
- Fill entire 32x32 canvas (background color for empty areas)

Return ONLY valid JSON array, no markdown, no explanations, no code blocks.`;

        const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
        let lastError: unknown = null;
        let response: { text?: string } | null = null;

        for (const model of modelsToTry) {
            try {
                response = await ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    x: { type: Type.INTEGER },
                                    y: { type: Type.INTEGER },
                                    color: { type: Type.STRING }
                                }
                            }
                        }
                    }
                });
                break;
            } catch (err) {
                lastError = err;
                continue;
            }
        }

        if (!response) {
            throw lastError ?? new Error('Gemini API failed');
        }

        let text = response.text || "[]";
        text = text.replace(/```json|```/g, '').trim();
        
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            text = text.substring(firstBracket, lastBracket + 1);
        }

        let pixels: Array<{ x: number; y: number; color: string }>;
        try {
            pixels = JSON.parse(text);
        } catch {
            throw new Error('Invalid JSON from API');
        }
        if (!Array.isArray(pixels) || pixels.length === 0) {
            throw new Error('Empty or invalid pixel array');
        }

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 32, 32);

        pixels.forEach(pixel => {
            const x = Number(pixel?.x);
            const y = Number(pixel?.y);
            const color = pixel?.color && /^#[0-9a-fA-F]{3,8}$/.test(String(pixel.color)) ? String(pixel.color) : '#0a0';
            if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 32 && y >= 0 && y < 32) {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });

        return canvas;
    } catch (error) {
        console.error("[AvatarEditor] Gemini generation failed:", error);
        return fallback();
    }
}

/**
 * Применяет кастомные цвета к аватару
 */
export function applyCustomColors(canvas: HTMLCanvasElement, colors: AvatarEditorOptions['colors']): HTMLCanvasElement {
    if (!colors) return canvas;
    
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, 32, 32);
    const data = imageData.data;
    
    // Простая замена цветов (можно улучшить)
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0; // [Opus 4.6] Default for possibly undefined index
        const g = data[i + 1] ?? 0; // [Opus 4.6]
        const b = data[i + 2] ?? 0; // [Opus 4.6]
        
        // Заменяем зеленые оттенки на primary цвет
        if (colors.primary && g > r && g > b) {
            const primaryRgb = hexToRgb(colors.primary);
            if (primaryRgb) {
                data[i] = primaryRgb.r;
                data[i + 1] = primaryRgb.g;
                data[i + 2] = primaryRgb.b;
            }
        }
        
        // Заменяем темные оттенки на secondary цвет
        if (colors.secondary && r < 50 && g < 50 && b < 50) {
            const secondaryRgb = hexToRgb(colors.secondary);
            if (secondaryRgb) {
                data[i] = secondaryRgb.r;
                data[i + 1] = secondaryRgb.g;
                data[i + 2] = secondaryRgb.b;
            }
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/**
 * Редактирует пиксель в аватаре
 */
export function editPixel(canvas: HTMLCanvasElement, x: number, y: number, color: string): void {
    if (x < 0 || x >= 32 || y < 0 || y >= 32) return;
    
    const ctx = canvas.getContext('2d')!;
    const rgb = hexToRgb(color);
    if (!rgb) return;
    
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}

/**
 * Получает цвет пикселя
 */
export function getPixelColor(canvas: HTMLCanvasElement, x: number, y: number): string | null {
    if (x < 0 || x >= 32 || y < 0 || y >= 32) return null;
    
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(x, y, 1, 1);
    const r = imageData.data[0];
    const g = imageData.data[1];
    const b = imageData.data[2];
    
    // [Opus 4.6] Guard against undefined array values
    return `#${[r, g, b].map(c => (c ?? 0).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Экспортирует аватар как JSON (массив пикселей)
 */
export function exportAvatarAsJSON(canvas: HTMLCanvasElement): string {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, 32, 32);
    const pixels: Array<{ x: number; y: number; color: string }> = [];
    
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const idx = (y * 32 + x) * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];
            const a = imageData.data[idx + 3];
            
            // Пропускаем полностью прозрачные пиксели
            if (a === 0) continue;
            
            // [Opus 4.6] Guard against undefined
            const color = `#${[r, g, b].map(c => (c ?? 0).toString(16).padStart(2, '0')).join('')}`;
            pixels.push({ x, y, color });
        }
    }
    
    return JSON.stringify(pixels, null, 2);
}

/**
 * Импортирует аватар из JSON
 */
export function importAvatarFromJSON(json: string): HTMLCanvasElement | null {
    try {
        const pixels = JSON.parse(json) as Array<{ x: number; y: number; color: string }>;
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        
        // Очищаем canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 32, 32);
        
        // Рисуем пиксели
        pixels.forEach(pixel => {
            if (pixel.x >= 0 && pixel.x < 32 && pixel.y >= 0 && pixel.y < 32) {
                ctx.fillStyle = pixel.color;
                ctx.fillRect(pixel.x, pixel.y, 1, 1);
            }
        });
        
        return canvas;
    } catch (error) {
        console.error("[AvatarEditor] Failed to import from JSON:", error);
        return null;
    }
}

/**
 * Генерирует несколько вариантов одновременно
 */
export async function generateMultipleVariants(
    request: GeminiAvatarRequest, 
    count: number = 3
): Promise<Array<HTMLCanvasElement | null>> {
    const promises = Array.from({ length: count }, () => generateAvatarWithGemini(request));
    return Promise.all(promises);
}

/**
 * Конвертирует hex в RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1] ?? "0", 16),
        g: parseInt(result[2] ?? "0", 16),
        b: parseInt(result[3] ?? "0", 16)
    } : null;
}

/**
 * Экспортирует аватар как base64
 */
export function exportAvatarAsBase64(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL('image/png');
}

/**
 * Импортирует аватар из base64
 */
export function importAvatarFromBase64(base64: string): Promise<HTMLCanvasElement | null> {
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 32;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, 32, 32);
                resolve(canvas);
            };
            img.onerror = () => {
                console.error("[AvatarEditor] Failed to load image from base64");
                resolve(null);
            };
            img.src = base64;
        } catch (error) {
            console.error("[AvatarEditor] Failed to import avatar:", error);
            resolve(null);
        }
    });
}

/**
 * Сохраняет аватар в localStorage
 */
export function saveCustomAvatar(avatarId: string, canvas: HTMLCanvasElement): void {
    const base64 = exportAvatarAsBase64(canvas);
    localStorage.setItem(`customAvatar_${avatarId}`, base64);
    
    // Добавляем в историю генераций
    addToGenerationHistory(avatarId, base64);
}

/**
 * История генераций (последние 20)
 */
const MAX_HISTORY = 20;

function addToGenerationHistory(avatarId: string, base64: string): void {
    const history = getGenerationHistory();
    // Удаляем дубликаты
    const filtered = history.filter(h => h.id !== avatarId);
    // Добавляем в начало
    filtered.unshift({ id: avatarId, base64, timestamp: Date.now() });
    // Ограничиваем размер
    const limited = filtered.slice(0, MAX_HISTORY);
    localStorage.setItem('avatarGenerationHistory', JSON.stringify(limited));
}

export function getGenerationHistory(): Array<{ id: string; base64: string; timestamp: number }> {
    try {
        const stored = localStorage.getItem('avatarGenerationHistory');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function clearGenerationHistory(): void {
    localStorage.removeItem('avatarGenerationHistory');
}

/**
 * Загружает кастомный аватар из localStorage
 */
export function loadCustomAvatar(avatarId: string): HTMLCanvasElement | null {
    const base64 = localStorage.getItem(`customAvatar_${avatarId}`);
    if (!base64) return null;
    
    try {
        // Создаем canvas и загружаем изображение
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, 32, 32);
            ctx.drawImage(img, 0, 0, 32, 32);
        };
        img.src = base64;
        
        // Возвращаем canvas сразу (изображение загрузится асинхронно)
        // Для синхронного использования нужно использовать уже загруженные изображения
        return canvas;
    } catch (error) {
        console.error("[AvatarEditor] Failed to load custom avatar:", error);
        return null;
    }
}

/**
 * Загружает кастомный аватар асинхронно
 */
export async function loadCustomAvatarAsync(avatarId: string): Promise<HTMLCanvasElement | null> {
    const base64 = localStorage.getItem(`customAvatar_${avatarId}`);
    if (!base64) return null;
    
    return importAvatarFromBase64(base64);
}

