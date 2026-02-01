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

/**
 * Танк - основной аватар
 */
function drawTankAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    const tankColor = rng() > 0.5 ? '#0f0' : '#0a0';
    const turretColor = '#080';
    
    // Корпус танка (нижняя часть)
    drawRect(ctx, 8, 20, 16, 8, tankColor);
    // Гусеницы
    drawRect(ctx, 6, 22, 20, 4, '#333');
    // Башня
    drawRect(ctx, 12, 12, 8, 8, turretColor);
    // Пушка
    drawRect(ctx, 20, 14, 4, 2, '#222');
    // Люк
    drawRect(ctx, 14, 14, 4, 3, '#0f0');
    // Оптический прицел
    drawPixel(ctx, 15, 13, '#ff0');
}

/**
 * Солдат
 */
function drawSoldierAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    const uniformColor = rng() > 0.5 ? '#0a0' : '#060';
    
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Каска
    drawRect(ctx, 11, 4, 10, 4, '#333');
    // Тело
    drawRect(ctx, 13, 12, 6, 10, uniformColor);
    // Руки
    drawRect(ctx, 10, 12, 3, 8, uniformColor);
    drawRect(ctx, 19, 12, 3, 8, uniformColor);
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Оружие
    drawRect(ctx, 8, 14, 4, 2, '#444');
}

/**
 * Командир
 */
function drawCommanderAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Фуражка с кокардой
    drawRect(ctx, 11, 4, 10, 3, '#0a0');
    drawPixel(ctx, 15, 5, '#ff0');
    // Тело (форма с погонами)
    drawRect(ctx, 13, 12, 6, 10, '#0f0');
    drawRect(ctx, 12, 12, 1, 4, '#ff0');
    drawRect(ctx, 19, 12, 1, 4, '#ff0');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#0a0');
    drawRect(ctx, 19, 12, 3, 8, '#0a0');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Бинокль
    drawRect(ctx, 20, 10, 3, 2, '#444');
}

/**
 * Пилот
 */
function drawPilotAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Шлем пилота
    drawRect(ctx, 11, 4, 10, 6, '#0a0');
    drawRect(ctx, 13, 6, 6, 2, '#000');
    // Тело (комбинезон)
    drawRect(ctx, 13, 12, 6, 10, '#0f0');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#0a0');
    drawRect(ctx, 19, 12, 3, 8, '#0a0');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Очки
    drawRect(ctx, 13, 8, 6, 2, '#0ff');
}

/**
 * Снайпер
 */
function drawSniperAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Камуфляжная шапка
    drawRect(ctx, 11, 4, 10, 4, '#0a0');
    // Тело (камуфляж)
    drawRect(ctx, 13, 12, 6, 10, '#0a0');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#060');
    drawRect(ctx, 19, 12, 3, 8, '#060');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Снайперская винтовка
    drawRect(ctx, 6, 14, 6, 2, '#444');
    drawRect(ctx, 5, 15, 1, 1, '#ff0'); // Прицел
}

/**
 * Инженер
 */
function drawEngineerAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Каска
    drawRect(ctx, 11, 4, 10, 4, '#ff0');
    // Тело (комбинезон)
    drawRect(ctx, 13, 12, 6, 10, '#0a0');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#0f0');
    drawRect(ctx, 19, 12, 3, 8, '#0f0');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Гаечный ключ
    drawRect(ctx, 20, 14, 2, 4, '#888');
}

/**
 * Медик
 */
function drawMedicAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Белая шапка с крестом
    drawRect(ctx, 11, 4, 10, 4, '#fff');
    drawRect(ctx, 15, 5, 2, 2, '#f00');
    // Тело (белый халат)
    drawRect(ctx, 13, 12, 6, 10, '#fff');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#fff');
    drawRect(ctx, 19, 12, 3, 8, '#fff');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Аптечка
    drawRect(ctx, 20, 14, 3, 4, '#f00');
    drawPixel(ctx, 21, 15, '#fff');
}

/**
 * Шпион
 */
function drawSpyAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Шляпа
    drawRect(ctx, 11, 4, 10, 3, '#222');
    // Тело (темный плащ)
    drawRect(ctx, 13, 12, 6, 10, '#111');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#000');
    drawRect(ctx, 19, 12, 3, 8, '#000');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Бинокль
    drawRect(ctx, 20, 10, 3, 2, '#444');
}

/**
 * Киборг
 */
function drawCyborgAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова (металлическая)
    drawRect(ctx, 12, 4, 8, 8, '#888');
    drawRect(ctx, 13, 6, 6, 4, '#0ff');
    // Тело (робот)
    drawRect(ctx, 13, 12, 6, 10, '#666');
    // Руки (механические)
    drawRect(ctx, 10, 12, 3, 8, '#555');
    drawRect(ctx, 19, 12, 3, 8, '#555');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#444');
    drawRect(ctx, 16, 22, 3, 6, '#444');
    // Антенна
    drawPixel(ctx, 16, 3, '#0ff');
}

/**
 * Ниндзя
 */
function drawNinjaAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова (маска)
    drawRect(ctx, 12, 4, 8, 8, '#000');
    drawRect(ctx, 14, 6, 4, 2, '#fff');
    // Тело (кимоно)
    drawRect(ctx, 13, 12, 6, 10, '#111');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#000');
    drawRect(ctx, 19, 12, 3, 8, '#000');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Катана
    drawRect(ctx, 20, 10, 2, 8, '#ccc');
}

/**
 * Викинг
 */
function drawVikingAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова
    drawRect(ctx, 12, 4, 8, 8, '#ffdbac');
    // Шлем с рогами
    drawRect(ctx, 11, 4, 10, 4, '#888');
    drawPixel(ctx, 10, 5, '#888');
    drawPixel(ctx, 21, 5, '#888');
    // Борода
    drawRect(ctx, 13, 10, 6, 4, '#ff0');
    // Тело (кольчуга)
    drawRect(ctx, 13, 12, 6, 10, '#555');
    // Руки
    drawRect(ctx, 10, 12, 3, 8, '#666');
    drawRect(ctx, 19, 12, 3, 8, '#666');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#222');
    drawRect(ctx, 16, 22, 3, 6, '#222');
    // Топор
    drawRect(ctx, 20, 14, 3, 2, '#888');
}

/**
 * Рыцарь
 */
function drawKnightAvatar(ctx: CanvasRenderingContext2D, rng: () => number): void {
    // Голова (шлем)
    drawRect(ctx, 12, 4, 8, 8, '#ccc');
    drawRect(ctx, 13, 6, 6, 2, '#000');
    // Тело (доспехи)
    drawRect(ctx, 13, 12, 6, 10, '#aaa');
    // Руки (латы)
    drawRect(ctx, 10, 12, 3, 8, '#bbb');
    drawRect(ctx, 19, 12, 3, 8, '#bbb');
    // Ноги
    drawRect(ctx, 13, 22, 3, 6, '#888');
    drawRect(ctx, 16, 22, 3, 6, '#888');
    // Щит
    drawRect(ctx, 6, 12, 4, 6, '#0f0');
    drawPixel(ctx, 7, 14, '#ff0');
    // Меч
    drawRect(ctx, 20, 10, 2, 8, '#ddd');
}

