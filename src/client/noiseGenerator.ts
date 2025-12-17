// ═══════════════════════════════════════════════════════════════════════════
// NOISE GENERATOR - Simplex/Perlin noise for terrain generation
// ═══════════════════════════════════════════════════════════════════════════

// Simplex noise implementation based on Stefan Gustavson's work
// Optimized for 2D terrain generation

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
            [p[i], p[j]] = [p[j], p[i]];
        }
        
        // Duplicate for wrapping
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
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
        const gi0 = this.permMod12[ii + this.perm[jj]];
        const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
        const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
        
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
    
    private dot2(g: number[], x: number, y: number): number {
        return g[0] * x + g[1] * y;
    }
    
    // Fractal Brownian Motion (fBm) - combines multiple octaves of noise
    fbm(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, persistence: number = 0.5): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.noise2D(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return value / maxValue;
    }
    
    // Ridged multifractal - creates sharp ridges like mountains
    ridged(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, gain: number = 0.5): number {
        let sum = 0;
        let amplitude = 0.5;
        let frequency = 1;
        let prev = 1.0;
        
        for (let i = 0; i < octaves; i++) {
            const n = Math.abs(this.noise2D(x * frequency, y * frequency));
            const signal = 1.0 - n;
            sum += signal * signal * amplitude * prev;
            prev = signal;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        
        return sum;
    }
    
    // Turbulence - absolute value of noise
    turbulence(x: number, y: number, octaves: number = 4): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += amplitude * Math.abs(this.noise2D(x * frequency, y * frequency));
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        
        return value / maxValue;
    }
}

// Terrain generator using noise
export class TerrainGenerator {
    private noise: NoiseGenerator;
    private seed: number;
    private heightCache: Map<string, number> = new Map();
    private static readonly MAX_CACHE_SIZE = 200000;
    private isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean;
    
    constructor(seed: number, isPositionInGarageArea?: (x: number, z: number, margin: number) => boolean) {
        this.seed = seed;
        this.noise = new NoiseGenerator(seed);
        this.isPositionInGarageArea = isPositionInGarageArea;
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
    
    // Get terrain height at world coordinates with dramatic variations and erosion
    getHeight(worldX: number, worldZ: number, biome: string): number {
        // ИСПРАВЛЕНИЕ: Проверка гаража ПЕРЕД вычислением высоты
        // Если точка в гараже, возвращаем высоту 0 (уровень пола гаража)
        if (this.isPositionInGarageArea && this.isPositionInGarageArea(worldX, worldZ, 15)) {
            return 0; // Уровень пола гаража
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
                // Dramatic rolling hills with valleys - MULTI-LAYERED
                const parkBase = this.noise.fbm(worldX * scale, worldZ * scale, 5, 2, 0.5) * 20;
                // Add organic hills and valleys
                const parkOrganic = this.noise.fbm(worldX * scale * 1.5, worldZ * scale * 1.5, 4, 2, 0.6) * 8;
                const parkRidges = this.noise.ridged(worldX * scale * 0.6, worldZ * scale * 0.6, 3, 2, 0.5) * 6;
                const parkValleys = this.noise.ridged(worldX * scale * 1.2, worldZ * scale * 1.2, 2, 2, 0.6) * 4;
                // Detail layer for organic variation
                detailLayer = this.noise.fbm(worldX * scale * 3, worldZ * scale * 3, 3, 2, 0.5) * 4;
                // Fine detail for natural grass texture
                fineDetailLayer = this.noise.fbm(worldX * scale * 10, worldZ * scale * 10, 2, 2, 0.5) * 1;
                height = parkBase + parkOrganic + parkRidges - Math.abs(parkValleys) * 0.7 + detailLayer + fineDetailLayer;
                break;
                
            case "wasteland":
                // VERY dramatic craters, canyons, and rough terrain - MULTI-LAYERED
                const wasteBase = this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 18;
                const craters = this.noise.turbulence(worldX * scale * 2, worldZ * scale * 2, 4) * 12;
                // Add canyons and ravines
                const canyons = this.noise.ridged(worldX * scale * 1.2, worldZ * scale * 1.2, 3, 2, 0.6) * 10;
                const wasteHills = this.noise.fbm(worldX * scale * 0.8, worldZ * scale * 0.8, 3, 2, 0.5) * 5;
                // Detail layer for rough texture
                detailLayer = this.noise.turbulence(worldX * scale * 4, worldZ * scale * 4, 3) * 3;
                // Fine detail for surface roughness
                fineDetailLayer = this.noise.turbulence(worldX * scale * 12, worldZ * scale * 12, 2) * 1;
                height = wasteBase + wasteHills - craters - Math.abs(canyons) * 0.8 + detailLayer + fineDetailLayer;
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
                // VERY dramatic mountain-like terrain with peaks - MULTI-LAYERED
                const mountains = this.noise.ridged(worldX * scale, worldZ * scale, 5, 2, 0.6) * 35;
                // Add peaks and valleys
                const peaks = this.noise.fbm(worldX * scale * 0.5, worldZ * scale * 0.5, 4, 2, 0.5) * 12;
                const valleys2 = this.noise.ridged(worldX * scale * 1.5, worldZ * scale * 1.5, 3, 2, 0.6) * 8;
                // Detail layer for rocky texture
                detailLayer = this.noise.fbm(worldX * scale * 2, worldZ * scale * 2, 3, 2, 0.5) * 5;
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
        // height = this.applyErosion(height, worldX, worldZ, biome); // DISABLED
        
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
        
        // ИСПРАВЛЕНИЕ: Clamp для предотвращения экстремальных значений ПЕРЕД квантованием
        height = this.noise.clamp(height, -25, 35); // Ограничиваем диапазон высот
        
        // Quantize to create stepped/blocky terrain
        height = Math.round(height / stepSize) * stepSize;
        
        // УЛУЧШЕННАЯ ПРОВЕРКА: Многоуровневое сглаживание для предотвращения дыр
        // Используем getBaseHeight вместо getHeight для избежания рекурсии
        const neighborCheckDist1 = 1.0;  // Близкие соседи
        const neighborCheckDist2 = 2.0;  // Средние соседи
        const neighborCheckDist3 = 3.0;  // Дальние соседи для контекста
        
        const neighborHeights: number[] = [];
        
        // Получаем базовые высоты соседей на трёх уровнях (без рекурсии)
        const neighbors = [
            // Близкие соседи (4 направления)
            { x: worldX + neighborCheckDist1, z: worldZ },
            { x: worldX - neighborCheckDist1, z: worldZ },
            { x: worldX, z: worldZ + neighborCheckDist1 },
            { x: worldX, z: worldZ - neighborCheckDist1 },
            // Диагональные близкие соседи
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
        
        for (const neighbor of neighbors) {
            // Используем getBaseHeight напрямую для избежания рекурсии
            const baseHeight = this.getBaseHeight(neighbor.x, neighbor.z, biome);
            if (isFinite(baseHeight)) {
                neighborHeights.push(baseHeight);
            }
        }
        
        // Вычисляем среднюю высоту соседей с весами (близкие важнее)
        if (neighborHeights.length > 0) {
            // Разделяем на группы по расстоянию
            const closeNeighbors = neighborHeights.slice(0, 8);
            const midNeighbors = neighborHeights.slice(8, 12);
            const farNeighbors = neighborHeights.slice(12, 16);
            
            const avgClose = closeNeighbors.length > 0 ? closeNeighbors.reduce((a, b) => a + b, 0) / closeNeighbors.length : height;
            const avgMid = midNeighbors.length > 0 ? midNeighbors.reduce((a, b) => a + b, 0) / midNeighbors.length : height;
            const avgFar = farNeighbors.length > 0 ? farNeighbors.reduce((a, b) => a + b, 0) / farNeighbors.length : height;
            
            // Взвешенное среднее (близкие соседи важнее)
            const avgNeighborHeight = avgClose * 0.5 + avgMid * 0.3 + avgFar * 0.2;
            const heightDiff = Math.abs(height - avgNeighborHeight);
            
            // Если разница слишком большая (более 3 единиц), сглаживаем более агрессивно
            if (heightDiff > 3.0) {
                // Используем smoothstep для плавного сглаживания
                const normalizedDiff = (heightDiff - 3.0) / 5.0; // Нормализуем в [0, 1] для разницы от 3 до 8
                const smoothingFactor = this.noise.smoothstep(0, 1, normalizedDiff);
                // Более агрессивное сглаживание для больших разниц
                const smoothingStrength = Math.min(0.7, smoothingFactor * 0.6);
                height = height * (1 - smoothingStrength) + avgNeighborHeight * smoothingStrength;
                // Повторно квантуем после сглаживания
                height = Math.round(height / stepSize) * stepSize;
            }
            
            // УЛУЧШЕННАЯ ПРОВЕРКА: Дополнительная проверка на аномально низкие значения (дыры)
            // Если высота слишком низкая относительно соседей, поднимаем её
            if (height < avgNeighborHeight - 5.0) {
                const holeDepth = avgNeighborHeight - height;
                const maxAllowedDepth = 5.0; // Уменьшено с 6 до 5 для более строгого контроля
                if (holeDepth > maxAllowedDepth) {
                    height = avgNeighborHeight - maxAllowedDepth;
                    height = Math.round(height / stepSize) * stepSize;
                }
            }
            
            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Если высота слишком высокая относительно соседей, понижаем её
            if (height > avgNeighborHeight + 8.0) {
                const peakHeight = height - avgNeighborHeight;
                const maxAllowedPeak = 8.0;
                if (peakHeight > maxAllowedPeak) {
                    height = avgNeighborHeight + maxAllowedPeak;
                    height = Math.round(height / stepSize) * stepSize;
                }
            }
        }
        
        // ИСПРАВЛЕНИЕ: Минимальная высота для предотвращения глубоких дыр
        const minHeight = -2.0;
        if (height < minHeight) {
            height = minHeight;
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

