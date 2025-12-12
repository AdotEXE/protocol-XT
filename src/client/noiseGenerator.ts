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
    
    constructor(seed: number) {
        this.seed = seed;
        this.noise = new NoiseGenerator(seed);
    }
    
    // Get terrain height at world coordinates
    getHeight(worldX: number, worldZ: number, biome: string): number {
        // Base terrain scale
        const scale = 0.008;
        
        // Different terrain for different biomes
        switch (biome) {
            case "city":
            case "industrial":
                // Flat with occasional small variations
                return this.noise.fbm(worldX * scale * 0.5, worldZ * scale * 0.5, 2, 2, 0.3) * 0.5;
                
            case "residential":
                // Gentle hills
                return this.noise.fbm(worldX * scale, worldZ * scale, 3, 2, 0.4) * 2;
                
            case "park":
                // Rolling hills
                return this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 4;
                
            case "wasteland":
                // Craters and rough terrain
                const base = this.noise.fbm(worldX * scale, worldZ * scale, 3, 2, 0.5) * 3;
                const craters = this.noise.turbulence(worldX * scale * 2, worldZ * scale * 2, 3) * 2;
                return base - craters;
                
            case "military":
                // Strategic hills and valleys
                const hills = this.noise.fbm(worldX * scale, worldZ * scale, 4, 2, 0.5) * 5;
                const ridges = this.noise.ridged(worldX * scale * 0.5, worldZ * scale * 0.5, 3, 2, 0.5) * 3;
                return (hills + ridges) * 0.5;
                
            case "desert":
                // Dunes
                return this.noise.fbm(worldX * scale * 0.7, worldZ * scale * 0.7, 3, 2.5, 0.6) * 6;
                
            case "snow":
                // Mountain-like terrain
                return this.noise.ridged(worldX * scale, worldZ * scale, 4, 2, 0.6) * 8;
                
            default:
                return this.noise.fbm(worldX * scale, worldZ * scale, 3, 2, 0.5) * 2;
        }
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

