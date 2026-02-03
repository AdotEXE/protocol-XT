/**
 * Генератор пиксельных аватарок 32x32 в танковой тематике
 */

export interface PixelAvatarOptions {
    seed?: number;
    variant?: 'tank' | 'soldier' | 'commander' | 'pilot' | 'sniper' | 'engineer' | 'medic' | 'spy' | 'cyborg' | 'ninja' | 'viking' | 'knight';
}

/**
 * Генерирует пиксельный аватар 32x32
 */
export function generatePixelAvatar(options: PixelAvatarOptions = {}): HTMLCanvasElement {
    const { seed = Math.random(), variant = 'tank' } = options;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    
    // Используем seed для детерминированной генерации
    const rng = seededRandom(seed);
    
    // Очищаем canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 32, 32);
    
    // Генерируем аватар в зависимости от варианта
    switch (variant) {
        case 'tank':
            drawTankAvatar(ctx, rng);
            break;
        case 'soldier':
            drawSoldierAvatar(ctx, rng);
            break;
        case 'commander':
            drawCommanderAvatar(ctx, rng);
            break;
        case 'pilot':
            drawPilotAvatar(ctx, rng);
            break;
        case 'sniper':
            drawSniperAvatar(ctx, rng);
            break;
        case 'engineer':
            drawEngineerAvatar(ctx, rng);
            break;
        case 'medic':
            drawMedicAvatar(ctx, rng);
            break;
        case 'spy':
            drawSpyAvatar(ctx, rng);
            break;
        case 'cyborg':
            drawCyborgAvatar(ctx, rng);
            break;
        case 'ninja':
            drawNinjaAvatar(ctx, rng);
            break;
        case 'viking':
            drawVikingAvatar(ctx, rng);
            break;
        case 'knight':
            drawKnightAvatar(ctx, rng);
            break;
    }
    
    return canvas;
}

/**
 * Простой генератор случайных чисел с seed
 */
function seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
}

/**
 * Рисует пиксель (упрощенная функция для пиксель-арта)
 */
function drawPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}

/**
 * Рисует прямоугольник из пикселей
 */
function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

/** Базовое лицо (овал, глаза, рот) — только для портретов. */
function drawFaceBase(ctx: CanvasRenderingContext2D): void {
    drawRect(ctx, 10, 8, 12, 14, '#ffdbac');
    drawRect(ctx, 9, 10, 14, 10, '#ffdbac');
    drawRect(ctx, 12, 12, 2, 2, '#000');
    drawRect(ctx, 18, 12, 2, 2, '#000');
    drawRect(ctx, 14, 18, 4, 1, '#c66');
}

/** Танк — «лицо»: башня спереди (глаза-оптики, люк, пушка). */
function drawTankAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    const c = rng() > 0.5 ? '#0f0' : '#0a0';
    drawRect(ctx, 8, 6, 16, 18, '#080');
    drawRect(ctx, 10, 8, 12, 14, c);
    drawRect(ctx, 12, 11, 2, 2, '#ff0');
    drawRect(ctx, 18, 11, 2, 2, '#ff0');
    drawRect(ctx, 14, 14, 4, 4, '#060');
    drawRect(ctx, 22, 12, 4, 4, '#222');
}

/** Солдат — лицо + каска. */
function drawSoldierAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 9, 6, 14, 5, '#333');
    drawRect(ctx, 10, 7, 12, 3, '#333');
}

/** Командир — лицо + фуражка с кокардой. */
function drawCommanderAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 9, 5, 14, 4, '#0a0');
    drawRect(ctx, 14, 6, 4, 2, '#ff0');
}

/** Пилот — лицо + шлем + очки. */
function drawPilotAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 8, 5, 16, 6, '#0a0');
    drawRect(ctx, 11, 8, 10, 2, '#000');
    drawRect(ctx, 12, 9, 8, 1, '#0ff');
}

/** Снайпер — лицо + камуфляжная шапка. */
function drawSniperAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 9, 6, 14, 5, '#0a0');
    drawRect(ctx, 10, 7, 12, 3, '#060');
}

/** Инженер — лицо + жёлтая каска. */
function drawEngineerAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 9, 6, 14, 5, '#ff0');
    drawRect(ctx, 10, 7, 12, 3, '#dd0');
}

/** Медик — лицо + белая шапка с крестом. */
function drawMedicAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 9, 6, 14, 5, '#fff');
    drawRect(ctx, 14, 7, 4, 3, '#f00');
}

/** Шпион — лицо + тёмная шляпа. */
function drawSpyAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 9, 5, 14, 4, '#222');
    drawRect(ctx, 10, 6, 12, 2, '#111');
}

/** Киборг — «лицо»: маска + визор + антенна. */
function drawCyborgAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawRect(ctx, 10, 8, 12, 14, '#666');
    drawRect(ctx, 9, 10, 14, 10, '#555');
    drawRect(ctx, 11, 11, 10, 5, '#0ff');
    drawRect(ctx, 13, 13, 3, 2, '#000');
    drawRect(ctx, 18, 13, 3, 2, '#000');
    drawPixel(ctx, 15, 6, '#0ff');
    drawPixel(ctx, 16, 5, '#0ff');
}

/** Ниндзя — только маска + прорезь для глаз. */
function drawNinjaAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawRect(ctx, 9, 8, 14, 14, '#111');
    drawRect(ctx, 10, 9, 12, 12, '#000');
    drawRect(ctx, 12, 12, 3, 2, '#fff');
    drawRect(ctx, 17, 12, 3, 2, '#fff');
}

/** Викинг — лицо + борода + шлем с рогами. */
function drawVikingAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawFaceBase(ctx);
    drawRect(ctx, 12, 16, 8, 6, '#c96');
    drawRect(ctx, 9, 6, 14, 5, '#888');
    drawRect(ctx, 8, 7, 2, 3, '#777');
    drawRect(ctx, 22, 7, 2, 3, '#777');
}

/** Рыцарь — только шлем (закрытое лицо) + прорезь. */
function drawKnightAvatar(ctx: CanvasRenderingContext2D, _rng: () => number): void {
    drawRect(ctx, 9, 6, 14, 16, '#aaa');
    drawRect(ctx, 10, 7, 12, 14, '#bbb');
    drawRect(ctx, 12, 12, 8, 3, '#000');
    drawRect(ctx, 13, 13, 6, 1, '#333');
}

