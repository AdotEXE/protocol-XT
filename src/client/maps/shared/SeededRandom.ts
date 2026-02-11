/**
 * SeededRandom - Псевдослучайный генератор с seed для воспроизводимой генерации
 */
export class SeededRandom {
    private seed: number;
    
    constructor(seed: number) { 
        this.seed = seed; 
    }
    
    next(): number { 
        this.seed = (this.seed * 16807) % 2147483647; 
        return this.seed / 2147483647; 
    }
    
    range(min: number, max: number): number { 
        return min + this.next() * (max - min); 
    }
    
    int(min: number, max: number): number { 
        return Math.floor(this.range(min, max + 1)); 
    }
    
    chance(p: number): boolean { 
        return this.next() < p; 
    }
    
    pick<T>(arr: T[]): T { 
        if (arr.length === 0) throw new Error("Cannot pick from empty array");
        return arr[Math.floor(this.next() * arr.length)]!; 
    }
    
    shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [result[i], result[j]] = [result[j]!, result[i]!];
        }
        return result;
    }
}

