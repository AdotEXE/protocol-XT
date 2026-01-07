// ═══════════════════════════════════════════════════════════════════════════
// NOISE GENERATOR - Simplex/Perlin noise for terrain generation
// ═══════════════════════════════════════════════════════════════════════════

// Импортируем модуль высот Тарту для прямого использования
import * as tartuHeightmapModule from "./tartuHeightmap";

// Simplex noise implementation based on Stefan Gustavson's work
// Optimized for 2D terrain generation

// Простой SeededRandom для внутреннего использования
class SeededRandom {
    private seed: number;
    constructor(seed: number) { 
        this.seed = seed; 
    }
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

export class NoiseGenerator {
    private perm: number[] = [];
    private permMod12: number[] = [];
    
    // Gradient vectors for 2D
    private grad3 = [
        [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
        [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];
    
    constructor(seed: number = 0) {
        this.initPermutation(seed);
    }
    
    private initPermutation(seed: number): void {
        // Create permutation table with seed
        const p: number[] = [];
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        
        // Fisher-Yates shuffle with seed
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const j = s % (i + 1);
            const pi = p[i]!;
            const pj = p[j]!;
            p[i] = pj;
            p[j] = pi;
        }
        
        // Duplicate for wrapping
        for (let i = 0; i < 512; i++) {
            const v = p[i & 255] ?? 0;
            this.perm[i] = v;
            this.permMod12[i] = v % 12;
        }
    }
    
    // Smoothstep function for smooth interpolation
    smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }
    
    // Clamp function to limit values within range
    clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
    
    // 2D Simplex noise
    noise2D(x: number, y: number): number {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        
        // Skew input space
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        
        // Determine which simplex we're in
        let i1: number, j1: number;
        if (x0 > y0) {
            i1 = 1; j1 = 0;
        } else {
            i1 = 0; j1 = 1;
        }
        
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        
        // Hash coordinates
        const ii = i & 255;
        const jj = j & 255;
        const permJJ = this.perm[jj] ?? 0;
        const permJJ1 = this.perm[jj + j1] ?? 0;
        const permJJPlus1 = this.perm[jj + 1] ?? 0;
        const gi0 = this.permMod12[ii + permJJ] ?? 0;
        const gi1 = this.permMod12[ii + i1 + permJJ1] ?? 0;
        const gi2 = this.permMod12[ii + 1 + permJJPlus1] ?? 0;
        
        // Calculate contributions
        let n0 = 0, n1 = 0, n2 = 0;
        
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * this.dot2(this.grad3[gi0], x0, y0);
        }
        
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * this.dot2(this.grad3[gi1], x1, y1);
        }
        
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * this.dot2(this.grad3[gi2], x2, y2);
        }
        
        // Scale to [-1, 1]
        return 70.0 * (n0 + n1 + n2);
    }
    
    private dot2(g: number[] | undefined, x: number, y: number): number {
        if (!g) return 0;
        const gx = g[0] ?? 0;
        const gy = g[1] ?? 0;
        return gx * x + gy * y;
    }
    
    // Fractal Brownian Motion (fBm) - combines multiple octaves of noise
    // УЛУЧШЕНО: Добавлена поддержка до 8 октав, улучшена точность вычислений
    fbm(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, persistence: number = 0.5): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        // Ограничиваем октавы для производительности
        const maxOctaves = Math.min(octaves, 8);
        
        for (let i = 0; i < maxOctaves; i++) {
            const noiseValue = this.noise2D(x * frequency, y * frequency);
            value += amplitude * noiseValue;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        // Нормализуем результат
        return maxValue > 0 ? value / maxValue : 0;
    }
    
    // УЛУЧШЕНО: Добавлен метод для генерации более плавного шума с лучшим качеством
    smoothFbm(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, persistence: number = 0.5): number {
        // Используем smoothstep для более плавных переходов
        const baseNoise = this.fbm(x, y, octaves, lacunarity, persistence);
        const smoothNoise = this.fbm(x * 0.5, y * 0.5, Math.max(2, Math.floor(octaves * 0.5)), lacunarity, persistence);
        return this.smoothstep(-1, 1, baseNoise * 0.7 + smoothNoise * 0.3);
    }
    
    // Ridged multifractal - creates sharp ridges like mountains
    // УЛУЧШЕНО: Добавлена поддержка до 8 октав, улучшена точность
    ridged(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, gain: number = 0.5): number {
        let sum = 0;
        let amplitude = 0.5;
        let frequency = 1;
        let prev = 1.0;
        
        // Ограничиваем октавы для производительности
        const maxOctaves = Math.min(octaves, 8);
        
        for (let i = 0; i < maxOctaves; i++) {
            const n = Math.abs(this.noise2D(x * frequency, y * frequency));
            const signal = 1.0 - n;
            sum += signal * signal * amplitude * prev;
            prev = signal;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        
        return sum;
    }
    
    // УЛУЧШЕНО: Добавлен метод для генерации более детализированных гребней
    enhancedRidged(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, gain: number = 0.5): number {
        const baseRidged = this.ridged(x, y, octaves, lacunarity, gain);
        // Добавляем детализацию с более высокими частотами
        const detail = this.ridged(x * 2, y * 2, Math.max(2, Math.floor(octaves * 0.5)), lacunarity, gain * 0.7);
        return baseRidged * 0.8 + detail * 0.2;
    }
    
    // Turbulence - absolute value of noise
    // УЛУЧШЕНО: Добавлена поддержка до 8 октав, улучшена точность
    turbulence(x: number, y: number, octaves: number = 4): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        // Ограничиваем октавы для производительности
        const maxOctaves = Math.min(octaves, 8);
        
        for (let i = 0; i < maxOctaves; i++) {
            value += amplitude * Math.abs(this.noise2D(x * frequency, y * frequency));
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        
        return maxValue > 0 ? value / maxValue : 0;
    }
    
    // УЛУЧШЕНО: Добавлен метод для генерации более сложных паттернов турбулентности
    enhancedTurbulence(x: number, y: number, octaves: number = 4): number {
        const baseTurb = this.turbulence(x, y, octaves);
        // Добавляем вращение для более органичных паттернов
        const rotatedX = x * 0.707 - y * 0.707;
        const rotatedY = x * 0.707 + y * 0.707;
        const rotatedTurb = this.turbulence(rotatedX, rotatedY, Math.max(2, Math.floor(octaves * 0.5)));
        return baseTurb * 0.7 + rotatedTurb * 0.3;
    }
    
    // НОВОЕ: Domain warping для создания более сложных паттернов
    domainWarp(x: number, y: number, strength: number = 1.0): { x: number; y: number } {
        const warpX = this.fbm(x * 0.1, y * 0.1, 3, 2, 0.5) * strength;
        const warpY = this.fbm(x * 0.1 + 100, y * 0.1 + 100, 3, 2, 0.5) * strength;
        return {
            x: x + warpX,
            y: y + warpY
        };
    }
    
    // НОВОЕ: Voronoi-like noise для создания ячеистых структур
    voronoi(x: number, y: number, cellSize: number = 10): number {
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        
        let minDist = Infinity;
        
        // Проверяем соседние ячейки
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const neighborX = cellX + dx;
                const neighborY = cellY + dy;
                
                // Генерируем случайную точку в ячейке
                const seed = (neighborX * 73856093) ^ (neighborY * 19349663);
                const rng = new SeededRandom(seed);
                const pointX = neighborX * cellSize + rng.next() * cellSize;
                const pointY = neighborY * cellSize + rng.next() * cellSize;
                
                const dist = Math.sqrt((x - pointX) ** 2 + (y - pointY) ** 2);
                minDist = Math.min(minDist, dist);
            }
        }
        
        return minDist / cellSize;
    }
}

// Terrain generator using noise
export class TerrainGenerator {
    private noise: NoiseGenerator;
    private heightCache: Map<string, number> = new Map();
    private static readonly MAX_CACHE_SIZE = 200000;
    private isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean;
    private mapType?: string;
    private seed: number;
    
    constructor(seed: number, isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean, mapType?: string) {
        this.noise = new NoiseGenerator(seed);
        this.isPositionInGarageArea = isPositionInGarageArea;
        this.mapType = mapType;
        this.seed = seed;
        
        // Инициализируем систему высот для Тарту, если это карта Тартария
        // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
        if (mapType !== undefined && mapType === "tartaria") {
            // Динамический импорт для избежания циклических зависимостей
            import("./tartuHeightmap").then(module => {
                module.initTartuHeightmap(seed);
            }).catch(() => {
                // Игнорируем ошибки загрузки модуля
            });
        }
    }
    
    // Apply advanced thermal erosion simulation for more natural terrain
    private applyErosion(baseHeight: number, worldX: number, worldZ: number, biome: string): number {
        // Multi-sample erosion for more realistic results
        const sampleDist1 = 2.0;
        const sampleDist2 = 4.0;
        
        const h0 = baseHeight;
        
        // Sample neighbors at two distances for better erosion simulation
        const neighbors1 = [
            this.getBaseHeight(worldX + sampleDist1, worldZ, biome),
            this.getBaseHeight(worldX - sampleDist1, worldZ, biome),
            this.getBaseHeight(worldX, worldZ + sampleDist1, biome),
            this.getBaseHeight(worldX, worldZ - sampleDist1, biome)
        ];
        
        const neighbors2 = [
            this.getBaseHeight(worldX + sampleDist2, worldZ, biome),
            this.getBaseHeight(worldX - sampleDist2, worldZ, biome),
            this.getBaseHeight(worldX, worldZ + sampleDist2, biome),
            this.getBaseHeight(worldX, worldZ - sampleDist2, biome)
        ];
        
        const avgNeighbor1 = neighbors1.reduce((a, b) => a + b, 0) / neighbors1.length;
        const avgNeighbor2 = neighbors2.reduce((a, b) => a + b, 0) / neighbors2.length;
        
        // Calculate gradients at both scales
        const gradient1 = Math.abs(h0 - avgNeighbor1) / sampleDist1;
        const gradient2 = Math.abs(h0 - avgNeighbor2) / sampleDist2;
        
        // Adaptive erosion based on slope steepness and biome type
        // Different biomes erode differently
        let erosionThreshold = 3.0;
        let maxErosion = 0.15;
        
        if (biome === "park" || biome === "residential") {
            // Natural biomes erode more smoothly
            erosionThreshold = 2.5;
            maxErosion = 0.2;
        } else if (biome === "wasteland") {
            // Wasteland has sharp, eroded features
            erosionThreshold = 3.5;
            maxErosion = 0.12;
        } else if (biome === "military" || biome === "city") {
            // Urban areas have more angular features
            erosionThreshold = 4.0;
            maxErosion = 0.1;
        }
        
        // Combine gradients for more realistic erosion
        const combinedGradient = (gradient1 * 0.6 + gradient2 * 0.4);
        const erosionFactor = combinedGradient > erosionThreshold 
            ? Math.min((combinedGradient - erosionThreshold) * 0.04, maxErosion) 
            : 0;
        
        // Weighted average of both neighbor sets
        const avgNeighbor = avgNeighbor1 * 0.7 + avgNeighbor2 * 0.3;
        
        // Apply erosion while preserving dramatic terrain
        let eroded = h0 * (1 - erosionFactor) + avgNeighbor * erosionFactor;
        
        // Add subtle noise-based variation for natural micro-details
        const microDetail = this.noise.noise2D(worldX * 0.1, worldZ * 0.1) * 0.3;
        eroded += microDetail * (1 - Math.abs(erosionFactor));
        
        return eroded;
    }
    
    // Get base height without erosion (used for erosion calculations)
    private getBaseHeight(worldX: number, worldZ: number, biome: string): number {
        const scale = 0.008;
        
        switch (biome) {
            case "city":
            case "industrial":
                return this.noise.fbm(worldX * scale * 0.5, worldZ * scale * 0.5, 2, 2, 0.3) * 1;
                
            case "residential":
                return this.noise.fbm(worldX * scale, worldZ * scale, 3, 2, 0.4) * 4;
                
            case "park":
                return this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 8;
                
            case "wasteland":
                const base = this.noise.fbm(worldX * scale, worldZ * scale, 3, 2, 0.5) * 6;
                const craters = this.noise.turbulence(worldX * scale * 2, worldZ * scale * 2, 3) * 3;
                return base - craters;
                
            case "military":
                const hills = this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 10;
                const ridges = this.noise.ridged(worldX * scale * 0.5, worldZ * scale * 0.5, 3, 2, 0.5) * 6;
                return (hills + ridges) * 0.5;
                
            case "desert":
                return this.noise.fbm(worldX * scale * 0.7, worldZ * scale * 0.7, 3, 2.5, 0.6) * 12;
                
            case "snow":
                return this.noise.ridged(worldX * scale, worldZ * scale, 4, 2, 0.6) * 15;
                
            default:
                return this.noise.fbm(worldX * scale, worldZ * scale, 3, 2, 0.5) * 4;
        }
    }
    
    // Генерация высот в стиле Тарту (упрощённая версия, используется пока модуль загружается)
    private generateTartuLikeHeight(worldX: number, worldZ: number): number {
        // Параметры Тарту: мин 27м, макс 82м, среднее 53м
        const minElevation = 27;
        const maxElevation = 82;
        const elevationRange = maxElevation - minElevation;
        
        // Используем шум для создания холмистой местности
        const scale = 0.003;
        const largeScale = this.noise.fbm(worldX * scale * 0.5, worldZ * scale * 0.5, 4, 2, 0.5);
        const midScale = this.noise.fbm(worldX * scale * 1.5, worldZ * scale * 1.5, 3, 2, 0.5);
        const fineScale = this.noise.fbm(worldX * scale * 4, worldZ * scale * 4, 2, 2, 0.5);
        
        const combinedNoise = largeScale * 0.6 + midScale * 0.3 + fineScale * 0.1;
        const normalizedNoise = (combinedNoise + 1) / 2; // 0..1
        
        // Добавляем долину реки (река Эмайыги)
        const centerX = 1000; // Центр карты
        const centerZ = 1000;
        const riverInfluence = Math.exp(-((worldX - centerX) ** 2 + (worldZ - centerZ) ** 2) / (2 * 500 ** 2));
        const riverDepth = riverInfluence * 8;
        
        let height = minElevation + normalizedNoise * elevationRange - riverDepth;
        height = Math.max(minElevation - 5, Math.min(maxElevation, height));
        height = Math.round(height);
        
        // Масштабируем для игрового баланса
        return height * 0.3;
    }
    
    // Get terrain height at world coordinates with dramatic variations and erosion
    // ВАЖНО: Логика гаража (плоская область) обрабатывается в ChunkSystem.getWorldHeight()
    // Этот метод возвращает только "чистую" высоту террейна без учёта гаражей
    getHeight(worldX: number, worldZ: number, biome: string): number {
        // Специальная обработка для карты Тартария (реальные данные высот Тарту)
        // ТОЛЬКО для Тартарии используем специальную систему высот
        if (this.mapType === "tartaria") {
            // Используем прямой импорт модуля высот Тарту
            try {
                // Инициализируем модуль, если ещё не инициализирован
                if (!tartuHeightmapModule.isTartuHeightmapInitialized()) {
                    tartuHeightmapModule.initTartuHeightmap(this.seed);
                }
                
                const height = tartuHeightmapModule.getTartuHeight(worldX, worldZ);
                
                const cacheKey = `${Math.floor(worldX)}_${Math.floor(worldZ)}_${biome}`;
                this.heightCache.set(cacheKey, height);
                if (this.heightCache.size > TerrainGenerator.MAX_CACHE_SIZE) {
                    this.heightCache.clear();
                }
                return height;
            } catch (e) {
                // Если модуль не загружен, используем упрощённую генерацию
                const tartuLikeHeight = this.generateTartuLikeHeight(worldX, worldZ);
                const cacheKey = `${Math.floor(worldX)}_${Math.floor(worldZ)}_${biome}`;
                this.heightCache.set(cacheKey, tartuLikeHeight);
                if (this.heightCache.size > TerrainGenerator.MAX_CACHE_SIZE) {
                    this.heightCache.clear();
                }
                return tartuLikeHeight;
            }
        }
        
        // Специальные карты Frontline и Polygon - уменьшенные перепады высот
        // Вычисляем стандартную высоту и делим на 3 для более пологого рельефа
        if (this.mapType === "frontline" || this.mapType === "polygon") {
            const cacheKey = `${Math.floor(worldX)}_${Math.floor(worldZ)}_${biome}`;
            if (this.heightCache.has(cacheKey)) {
                return this.heightCache.get(cacheKey)!;
            }
            
            // Используем wasteland биом для этих карт с уменьшенной амплитудой
            const scale = 0.008;
            const wasteBase = this.noise.fbm(worldX * scale, worldZ * scale, 5, 2, 0.5) * 18;
            const craters = this.noise.enhancedTurbulence(worldX * scale * 2, worldZ * scale * 2, 4) * 12;
            const canyons = this.noise.enhancedRidged(worldX * scale * 1.2, worldZ * scale * 1.2, 3, 2, 0.6) * 10;
            const wasteHills = this.noise.fbm(worldX * scale * 0.8, worldZ * scale * 0.8, 4, 2, 0.5) * 5;
            const detailLayer = this.noise.enhancedTurbulence(worldX * scale * 4, worldZ * scale * 4, 3) * 3;
            const fineDetailLayer = this.noise.fbm(worldX * scale * 12, worldZ * scale * 12, 2, 2, 0.5) * 1.5;
            
            let height = wasteBase + craters - Math.abs(canyons) * 0.8 + wasteHills + detailLayer + fineDetailLayer;
            
            // Делим на 3 для уменьшения перепадов высот
            height = height / 3;
            
            // Валидация
            if (!isFinite(height) || isNaN(height)) {
                height = 0;
            }
            
            this.heightCache.set(cacheKey, height);
            if (this.heightCache.size > TerrainGenerator.MAX_CACHE_SIZE) {
                this.heightCache.clear();
            }
            return height;
        }
        
        // Check cache
        const cacheKey = `${Math.floor(worldX)}_${Math.floor(worldZ)}_${biome}`;
        if (this.heightCache.has(cacheKey)) {
            return this.heightCache.get(cacheKey)!;
        }
        
        // Base terrain scale
        const scale = 0.008;
        
        // Multi-layered approach: base + detail + fine detail
        let height = 0;
        let detailLayer = 0;
        let fineDetailLayer = 0;
        
        // Different terrain for different biomes with DRAMATIC height variations and MULTI-LAYERING
        switch (biome) {
            case "city":
            case "industrial":
                // City with significant hills and valleys - MULTI-LAYERED
                const cityBase = this.noise.fbm(worldX * scale * 0.5, worldZ * scale * 0.5, 3, 2, 0.4) * 8;
                // Add dramatic features (hills, depressions)
                const cityFeatures = this.noise.fbm(worldX * scale * 0.15, worldZ * scale * 0.15, 4, 2, 0.5);
                const featureAmplitude = Math.abs(cityFeatures) > 0.6 ? (cityFeatures > 0 ? 1 : -1) * (Math.abs(cityFeatures) - 0.6) * 15 : 0;
                // Detail layer for organic variation
                detailLayer = this.noise.fbm(worldX * scale * 2, worldZ * scale * 2, 3, 2, 0.5) * 2;
                // Fine detail for surface texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 6, worldZ * scale * 6, 2, 2, 0.5) * 0.5;
                height = cityBase + featureAmplitude + detailLayer + fineDetailLayer;
                break;
                
            case "residential":
                // Rolling hills with dramatic variation - MULTI-LAYERED
                const resBase = this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 15;
                // Add valleys and streams
                const valleys = this.noise.ridged(worldX * scale * 0.8, worldZ * scale * 0.8, 3, 2, 0.5) * 8;
                const resHills = this.noise.fbm(worldX * scale * 1.5, worldZ * scale * 1.5, 3, 2, 0.6) * 5;
                // Detail layer for rolling appearance
                detailLayer = this.noise.fbm(worldX * scale * 2.5, worldZ * scale * 2.5, 3, 2, 0.5) * 3;
                // Fine detail for natural texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 8, worldZ * scale * 8, 2, 2, 0.5) * 0.8;
                height = resBase + resHills - Math.abs(valleys) * 0.6 + detailLayer + fineDetailLayer;
                break;
                
            case "park":
                // УЛУЧШЕНО: Dramatic rolling hills with valleys - MULTI-LAYERED с улучшенными методами
                const parkBase = this.noise.smoothFbm(worldX * scale, worldZ * scale, 5, 2, 0.5) * 20;
                // Add organic hills and valleys с улучшенным шумом
                const parkOrganic = this.noise.smoothFbm(worldX * scale * 1.5, worldZ * scale * 1.5, 4, 2, 0.6) * 8;
                const parkRidges = this.noise.enhancedRidged(worldX * scale * 0.6, worldZ * scale * 0.6, 3, 2, 0.5) * 6;
                const parkValleys = this.noise.ridged(worldX * scale * 1.2, worldZ * scale * 1.2, 2, 2, 0.6) * 4;
                // Detail layer for organic variation
                detailLayer = this.noise.fbm(worldX * scale * 3, worldZ * scale * 3, 3, 2, 0.5) * 4;
                // Fine detail for natural grass texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 10, worldZ * scale * 10, 2, 2, 0.5) * 1;
                height = parkBase + parkOrganic + parkRidges - Math.abs(parkValleys) * 0.7 + detailLayer + fineDetailLayer;
                break;
                
            case "wasteland":
                // УЛУЧШЕНО: VERY dramatic craters, canyons, and rough terrain - MULTI-LAYERED с новыми методами
                const wasteBase = this.noise.fbm(worldX * scale, worldZ * scale, 5, 2, 0.5) * 18;
                // Используем enhancedTurbulence для более детализированных кратеров
                const craters = this.noise.enhancedTurbulence(worldX * scale * 2, worldZ * scale * 2, 4) * 12;
                // Используем enhancedRidged для более детализированных каньонов
                const canyons = this.noise.enhancedRidged(worldX * scale * 1.2, worldZ * scale * 1.2, 3, 2, 0.6) * 10;
                const wasteHills = this.noise.fbm(worldX * scale * 0.8, worldZ * scale * 0.8, 4, 2, 0.5) * 5;
                // Добавляем voronoi для ячеистых структур (как от взрывов)
                const voronoiPattern = this.noise.voronoi(worldX * scale * 0.5, worldZ * scale * 0.5, 20) * 2;
                // Detail layer for rough texture
                detailLayer = this.noise.enhancedTurbulence(worldX * scale * 4, worldZ * scale * 4, 3) * 3;
                // Fine detail for surface roughness
                fineDetailLayer = this.noise.turbulence(worldX * scale * 12, worldZ * scale * 12, 2) * 1;
                height = wasteBase + wasteHills - craters - Math.abs(canyons) * 0.8 + voronoiPattern + detailLayer + fineDetailLayer;
                break;
                
            case "military":
                // VERY dramatic strategic hills, valleys, and ridges - MULTI-LAYERED
                const milHills = this.noise.fbm(worldX * scale, worldZ * scale, 5, 2, 0.5) * 25;
                const milRidges = this.noise.ridged(worldX * scale * 0.5, worldZ * scale * 0.5, 4, 2, 0.5) * 15;
                // Add plateaus and depressions
                const plateaus = this.noise.fbm(worldX * scale * 0.3, worldZ * scale * 0.3, 3, 2, 0.4) * 8;
                const milValleys = this.noise.ridged(worldX * scale * 0.9, worldZ * scale * 0.9, 3, 2, 0.5) * 5;
                // Detail layer for strategic variations
                detailLayer = this.noise.fbm(worldX * scale * 2, worldZ * scale * 2, 3, 2, 0.5) * 4;
                // Fine detail for natural texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 8, worldZ * scale * 8, 2, 2, 0.5) * 1;
                height = (milHills + milRidges) * 0.6 + plateaus - Math.abs(milValleys) * 0.5 + detailLayer + fineDetailLayer;
                break;
                
            case "desert":
                // Dramatic dunes with wind patterns - MULTI-LAYERED
                const dunes = this.noise.fbm(worldX * scale * 0.7, worldZ * scale * 0.7, 4, 2.5, 0.6) * 25;
                // Add wind-swept patterns
                const windPattern = this.noise.fbm(worldX * scale * 1.2, worldZ * scale * 1.2, 3, 2, 0.5) * 6;
                // Detail layer for dune texture
                detailLayer = this.noise.fbm(worldX * scale * 3, worldZ * scale * 3, 3, 2, 0.5) * 4;
                // Fine detail for sand texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 10, worldZ * scale * 10, 2, 2, 0.5) * 1;
                height = dunes + windPattern + detailLayer + fineDetailLayer;
                break;
                
            case "snow":
                // УЛУЧШЕНО: VERY dramatic mountain-like terrain with peaks - MULTI-LAYERED с улучшенными методами
                const mountains = this.noise.enhancedRidged(worldX * scale, worldZ * scale, 6, 2, 0.6) * 35;
                // Add peaks and valleys с улучшенным шумом
                const peaks = this.noise.fbm(worldX * scale * 0.5, worldZ * scale * 0.5, 5, 2, 0.5) * 12;
                const valleys2 = this.noise.ridged(worldX * scale * 1.5, worldZ * scale * 1.5, 4, 2, 0.6) * 8;
                // Detail layer for rocky texture
                detailLayer = this.noise.fbm(worldX * scale * 2, worldZ * scale * 2, 4, 2, 0.5) * 5;
                // Fine detail for surface texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 8, worldZ * scale * 8, 2, 2, 0.5) * 1.5;
                height = mountains + peaks - Math.abs(valleys2) * 0.5 + detailLayer + fineDetailLayer;
                break;
                
            default:
                // Generic dramatic terrain - MULTI-LAYERED
                const generic = this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 15;
                const genericFeatures = this.noise.fbm(worldX * scale * 1.5, worldZ * scale * 1.5, 3, 2, 0.5) * 6;
                // Detail layer for variation
                detailLayer = this.noise.fbm(worldX * scale * 2.5, worldZ * scale * 2.5, 3, 2, 0.5) * 3;
                // Fine detail for texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 8, worldZ * scale * 8, 2, 2, 0.5) * 1;
                height = generic + genericFeatures + detailLayer + fineDetailLayer;
        }
        
        // NO EROSION - keep sharp edges for blocky/low-poly style
        // Если когда-нибудь понадобится включить эрозию, можно переключить этот флаг
        const APPLY_EROSION = false;
        if (APPLY_EROSION) {
            height = this.applyErosion(height, worldX, worldZ, biome);
        }
        
        // Add dramatic river/valley patterns (negative height features) - BLOCKY
        const riverNoise = this.noise.ridged(worldX * scale * 0.4, worldZ * scale * 0.4, 3, 2, 0.5);
        if (riverNoise > 0.55 && biome !== "city" && biome !== "industrial") {
            // Create stepped river valleys (blocky style)
            const riverDepth = (riverNoise - 0.55) * 15; // Up to 15 units deep
            // Add width variation
            const widthVariation = this.noise.fbm(worldX * scale * 0.8, worldZ * scale * 0.8, 2, 2, 0.5);
            const adjustedDepth = riverDepth * (0.7 + widthVariation * 0.3);
            height -= adjustedDepth;
        }
        
        // Add smaller streams (blocky)
        const streamNoise = this.noise.ridged(worldX * scale * 1.2, worldZ * scale * 1.2, 2, 2, 0.5);
        if (streamNoise > 0.65 && biome !== "city" && biome !== "industrial") {
            const streamDepth = (streamNoise - 0.65) * 4;
            height -= streamDepth;
        }
        
        // КРИТИЧНО: ПЕРЕДЕЛАННАЯ ЛОГИКА - ПРЕВЕНТИВНАЯ ПРОВЕРКА НА ДЫРЫ ДО КВАНТОВАНИЯ
        // Сначала проверяем соседей и исправляем потенциальные дыры, ПОТОМ квантуем
        
        // QUANTIZE HEIGHT for blocky/voxel style (LOW POLY)
        // Different step sizes for different biomes
        let stepSize = 1.0; // Default step size
        if (biome === "city" || biome === "industrial") {
            stepSize = 0.5; // Smaller steps for urban areas
        } else if (biome === "park" || biome === "residential") {
            stepSize = 1.0; // Medium steps for natural areas
        } else if (biome === "wasteland" || biome === "military") {
            stepSize = 1.5; // Larger steps for dramatic terrain
        } else if (biome === "snow") {
            stepSize = 2.0; // Large steps for mountains
        }
        
        // ИСПРАВЛЕНИЕ: Clamp для предотвращения экстремальных значений ПЕРЕД проверкой соседей
        height = this.noise.clamp(height, -25, 35); // Ограничиваем диапазон высот
        
        // КРИТИЧНО: ПРОВЕРКА ГРАНИЧНЫХ ВЕРШИН (на границах чанков)
        // Чанки могут быть размером 50 или 80, проверяем оба варианта
        const chunkSizes = [50, 80];
        let isOnChunkBoundary = false;
        for (const chunkSize of chunkSizes) {
            const modX = Math.abs(worldX % chunkSize);
            const modZ = Math.abs(worldZ % chunkSize);
            // Проверяем близость к границам чанка (в пределах 2 единиц)
            if (modX < 2 || modX > chunkSize - 2 || modZ < 2 || modZ > chunkSize - 2) {
                isOnChunkBoundary = true;
                break;
            }
        }
        
        // КРИТИЧНО: МНОГОУРОВНЕВАЯ ПРОВЕРКА СОСЕДЕЙ С ИСПОЛЬЗОВАНИЕМ КЭША
        // Используем кэш для получения уже вычисленных высот соседей (если они есть)
        // Для граничных вершин используем больше соседей для лучшей проверки
        const neighborCheckDist1 = isOnChunkBoundary ? 0.5 : 1.0;  // Близкие соседи (ближе для границ)
        const neighborCheckDist2 = isOnChunkBoundary ? 1.0 : 2.0;  // Средние соседи
        const neighborCheckDist3 = isOnChunkBoundary ? 2.0 : 4.0;  // Дальние соседи (ближе для границ)
        
        const neighborHeights: number[] = [];
        const neighborKeys: string[] = [];
        
        // Получаем высоты соседей на трёх уровнях (используем кэш если доступен)
        const neighbors = [
            // Близкие соседи (4 направления + 4 диагональных = 8)
            { x: worldX + neighborCheckDist1, z: worldZ },
            { x: worldX - neighborCheckDist1, z: worldZ },
            { x: worldX, z: worldZ + neighborCheckDist1 },
            { x: worldX, z: worldZ - neighborCheckDist1 },
            { x: worldX + neighborCheckDist1 * 0.707, z: worldZ + neighborCheckDist1 * 0.707 },
            { x: worldX - neighborCheckDist1 * 0.707, z: worldZ - neighborCheckDist1 * 0.707 },
            { x: worldX + neighborCheckDist1 * 0.707, z: worldZ - neighborCheckDist1 * 0.707 },
            { x: worldX - neighborCheckDist1 * 0.707, z: worldZ + neighborCheckDist1 * 0.707 },
            // Средние соседи (4 направления)
            { x: worldX + neighborCheckDist2, z: worldZ },
            { x: worldX - neighborCheckDist2, z: worldZ },
            { x: worldX, z: worldZ + neighborCheckDist2 },
            { x: worldX, z: worldZ - neighborCheckDist2 },
            // Дальние соседи для контекста (4 направления)
            { x: worldX + neighborCheckDist3, z: worldZ },
            { x: worldX - neighborCheckDist3, z: worldZ },
            { x: worldX, z: worldZ + neighborCheckDist3 },
            { x: worldX, z: worldZ - neighborCheckDist3 }
        ];
        
        // Собираем высоты соседей (используем кэш или базовую высоту)
        for (const neighbor of neighbors) {
            const neighborKey = `${Math.floor(neighbor.x)}_${Math.floor(neighbor.z)}_${biome}`;
            neighborKeys.push(neighborKey);
            
            // Сначала проверяем кэш
            let neighborHeight: number | undefined = this.heightCache.get(neighborKey);
            
            // Если нет в кэше, используем базовую высоту (без эрозии и проверок)
            if (neighborHeight === undefined) {
                neighborHeight = this.getBaseHeight(neighbor.x, neighbor.z, biome);
                // Применяем те же преобразования, что и к основной высоте
                neighborHeight = this.noise.clamp(neighborHeight, -25, 35);
            }
            
            if (isFinite(neighborHeight) && !isNaN(neighborHeight)) {
                neighborHeights.push(neighborHeight);
            }
        }
        
        // КРИТИЧНО: АГРЕССИВНАЯ ПРОВЕРКА И ИСПРАВЛЕНИЕ ДЫР ДО КВАНТОВАНИЯ
        if (neighborHeights.length > 0) {
            // Разделяем на группы по расстоянию
            const closeNeighbors = neighborHeights.slice(0, 8);
            const midNeighbors = neighborHeights.slice(8, 12);
            const farNeighbors = neighborHeights.slice(12, 16);
            
            const avgClose = closeNeighbors.length > 0 ? closeNeighbors.reduce((a, b) => a + b, 0) / closeNeighbors.length : height;
            const avgMid = midNeighbors.length > 0 ? midNeighbors.reduce((a, b) => a + b, 0) / midNeighbors.length : height;
            const avgFar = farNeighbors.length > 0 ? farNeighbors.reduce((a, b) => a + b, 0) / farNeighbors.length : height;
            
            // Взвешенное среднее (близкие соседи важнее)
            const avgNeighborHeight = avgClose * 0.6 + avgMid * 0.3 + avgFar * 0.1;
            
            // КРИТИЧНО: ПРЕВЕНТИВНАЯ ПРОВЕРКА НА ДЫРЫ - ДО КВАНТОВАНИЯ
            // Если текущая высота значительно ниже соседей, это потенциальная дыра
            const heightDiff = avgNeighborHeight - height;
            
            // АГРЕССИВНОЕ ИСПРАВЛЕНИЕ: Если разница больше 0.5 единиц, это дыра
            if (heightDiff > 0.5) {
                // Максимально допустимая глубина дыры - 0.3 единицы (ОЧЕНЬ СТРОГО)
                const maxAllowedDepth = 0.3;
                
                if (heightDiff > maxAllowedDepth) {
                    // НЕМЕДЛЕННО поднимаем до безопасного уровня
                    height = avgNeighborHeight - maxAllowedDepth;
                } else {
                    // Плавное поднятие для небольших дыр
                    const smoothingFactor = 0.98; // ОЧЕНЬ агрессивное сглаживание
                    height = height * (1 - smoothingFactor) + (avgNeighborHeight - maxAllowedDepth) * smoothingFactor;
                }
            }
            
            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Сглаживание больших перепадов
            const absDiff = Math.abs(height - avgNeighborHeight);
            if (absDiff > 5.0) {
                // Сглаживаем слишком большие перепады
                const smoothingStrength = 0.5;
                height = height * (1 - smoothingStrength) + avgNeighborHeight * smoothingStrength;
            }
        }
        
        // КРИТИЧНО: ГЛОБАЛЬНАЯ МИНИМАЛЬНАЯ ВЫСОТА - ПЕРЕД КВАНТОВАНИЕМ
        // УВЕЛИЧЕНО с 2.0 до 2.5 для большей безопасности, особенно на границах чанков
        const minHeight = isOnChunkBoundary ? 2.5 : 2.5; // Единая минимальная высота 2.5
        if (height < minHeight) {
            height = minHeight;
        }
        
        // ТЕПЕРЬ квантуем после всех проверок
        height = Math.round(height / stepSize) * stepSize;
        
        // ФИНАЛЬНАЯ ПРОВЕРКА: После квантования снова проверяем минимальную высоту
        if (height < minHeight) {
            height = Math.ceil(minHeight / stepSize) * stepSize; // Округляем вверх до ближайшего шага
        }
        
        // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ДЛЯ ГРАНИЧНЫХ ВЕРШИН: дополнительный проход сглаживания
        if (isOnChunkBoundary && neighborHeights.length > 0) {
            const avgClose = neighborHeights.slice(0, 8).reduce((a, b) => a + b, 0) / Math.min(8, neighborHeights.length);
            const minNeighbor = Math.min(...neighborHeights);
            
            // Для граничных вершин более агрессивная проверка
            if (height < minNeighbor - 0.3) {
                height = Math.max(minNeighbor - 0.2, minHeight);
                height = Math.round(height / stepSize) * stepSize;
            }
            
            // Дополнительное сглаживание для граничных вершин
            const boundarySmoothing = 0.3;
            height = height * (1 - boundarySmoothing) + avgClose * boundarySmoothing;
            height = Math.round(height / stepSize) * stepSize;
        }
        
        // КРИТИЧНО: ФИНАЛЬНАЯ МНОГОУРОВНЕВАЯ ПРОВЕРКА НА ДЫРЫ ПОСЛЕ ВСЕХ ВЫЧИСЛЕНИЙ
        // Проверяем ещё раз соседей, используя уже кэшированные значения
        if (neighborHeights.length > 0) {
            const avgClose = neighborHeights.slice(0, 8).reduce((a, b) => a + b, 0) / Math.min(8, neighborHeights.length);
            const minNeighbor = Math.min(...neighborHeights);
            
            // КРИТИЧНО: Если наша высота ниже минимальной высоты соседей более чем на 0.5, это дыра
            if (height < minNeighbor - 0.5) {
                // НЕМЕДЛЕННО поднимаем до безопасного уровня
                height = Math.max(minNeighbor - 0.3, minHeight);
                height = Math.round(height / stepSize) * stepSize;
            }
            
            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Если высота ниже средней более чем на 1.0, это дыра
            if (height < avgClose - 1.0) {
                height = Math.max(avgClose - 0.3, minHeight);
                height = Math.round(height / stepSize) * stepSize;
            }
        }
        
        // КРИТИЧНО: АБСОЛЮТНАЯ МИНИМАЛЬНАЯ ВЫСОТА - ПОСЛЕДНЯЯ ПРОВЕРКА
        // УВЕЛИЧЕНО с 2.0 до 2.5 для полного предотвращения дыр
        const absoluteMinHeight = 2.5;
        if (height < absoluteMinHeight) {
            height = absoluteMinHeight;
        }
        
        // КРИТИЧНО: Финальная проверка на валидность - НЕ ДОПУСКАЕМ NaN, undefined, Infinity
        if (!isFinite(height) || isNaN(height) || height < absoluteMinHeight) {
            height = absoluteMinHeight; // Безопасное значение по умолчанию
        }
        
        // Cache result with cap to avoid unbounded growth
        this.heightCache.set(cacheKey, height);
        if (this.heightCache.size > TerrainGenerator.MAX_CACHE_SIZE) {
            // Simple reset strategy keeps memory bounded without heavy bookkeeping
            this.heightCache.clear();
        }
        
        return height;
    }
    
    // Check if position should have a crater
    hasCrater(worldX: number, worldZ: number): { has: boolean, depth: number, radius: number } {
        const craterScale = 0.02;
        const craterNoise = this.noise.noise2D(worldX * craterScale, worldZ * craterScale);
        
        if (craterNoise > 0.7) {
            return {
                has: true,
                depth: (craterNoise - 0.7) * 10,
                radius: 5 + (craterNoise - 0.7) * 15
            };
        }
        
        return { has: false, depth: 0, radius: 0 };
    }
    
    // Get slope at position (for physics)
    getSlope(worldX: number, worldZ: number, biome: string): { x: number, z: number } {
        const delta = 0.5;
        const h0 = this.getHeight(worldX, worldZ, biome);
        const hX = this.getHeight(worldX + delta, worldZ, biome);
        const hZ = this.getHeight(worldX, worldZ + delta, biome);
        
        return {
            x: (hX - h0) / delta,
            z: (hZ - h0) / delta
        };
    }
}

