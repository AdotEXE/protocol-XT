// Achievements System for TX Tank Game

export interface Achievement {
    id: string;
    name: string;
    nameEn: string;
    description: string;
    descriptionEn: string;
    icon: string;
    requirement: number;
    reward?: {
        type: "experience" | "currency" | "unlock";
        amount?: number;
        unlockId?: string;
    };
    category: "combat" | "exploration" | "survival" | "special";
    hidden?: boolean;
}

export interface AchievementProgress {
    id: string;
    current: number;
    completed: boolean;
    completedAt?: number;
    claimed?: boolean;
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
    // Combat achievements
    {
        id: "first_blood",
        name: "Первая кровь",
        nameEn: "First Blood",
        description: "Уничтожить первого врага",
        descriptionEn: "Destroy your first enemy",
        icon: "💀",
        requirement: 1,
        reward: { type: "experience", amount: 50 },
        category: "combat"
    },
    {
        id: "tank_hunter",
        name: "Охотник на танки",
        nameEn: "Tank Hunter",
        description: "Уничтожить 10 вражеских танков",
        descriptionEn: "Destroy 10 enemy tanks",
        icon: "🎯",
        requirement: 10,
        reward: { type: "experience", amount: 200 },
        category: "combat"
    },
    {
        id: "tank_ace",
        name: "Танковый ас",
        nameEn: "Tank Ace",
        description: "Уничтожить 50 вражеских танков",
        descriptionEn: "Destroy 50 enemy tanks",
        icon: "🏆",
        requirement: 50,
        reward: { type: "experience", amount: 500 },
        category: "combat"
    },
    {
        id: "sharpshooter",
        name: "Снайпер",
        nameEn: "Sharpshooter",
        description: "Нанести 10 критических попаданий",
        descriptionEn: "Land 10 critical hits",
        icon: "🎯",
        requirement: 10,
        reward: { type: "experience", amount: 150 },
        category: "combat"
    },
    {
        id: "damage_dealer",
        name: "Машина смерти",
        nameEn: "Damage Dealer",
        description: "Нанести 10000 урона",
        descriptionEn: "Deal 10,000 damage",
        icon: "💥",
        requirement: 10000,
        reward: { type: "experience", amount: 300 },
        category: "combat"
    },
    
    // Survival achievements
    {
        id: "survivor",
        name: "Выживший",
        nameEn: "Survivor",
        description: "Выжить 5 минут без смерти",
        descriptionEn: "Survive for 5 minutes",
        icon: "⏱️",
        requirement: 300, // seconds
        reward: { type: "experience", amount: 100 },
        category: "survival"
    },
    {
        id: "iron_will",
        name: "Железная воля",
        nameEn: "Iron Will",
        description: "Выжить с HP ниже 10%",
        descriptionEn: "Survive with HP below 10%",
        icon: "❤️",
        requirement: 1,
        reward: { type: "experience", amount: 75 },
        category: "survival"
    },
    {
        id: "comeback",
        name: "Камбэк",
        nameEn: "Comeback",
        description: "Убить врага имея менее 20% HP",
        descriptionEn: "Kill an enemy with less than 20% HP",
        icon: "🔥",
        requirement: 1,
        reward: { type: "experience", amount: 100 },
        category: "survival"
    },
    
    // Exploration achievements
    {
        id: "explorer",
        name: "Исследователь",
        nameEn: "Explorer",
        description: "Посетить все типы карт",
        descriptionEn: "Visit all map types",
        icon: "🗺️",
        requirement: 4,
        reward: { type: "experience", amount: 200 },
        category: "exploration"
    },
    {
        id: "garage_master",
        name: "Мастер гаражей",
        nameEn: "Garage Master",
        description: "Захватить 5 гаражей",
        descriptionEn: "Capture 5 garages",
        icon: "🔧",
        requirement: 5,
        reward: { type: "experience", amount: 150 },
        category: "exploration"
    },
    
    // POI achievements
    {
        id: "poi_first_capture",
        name: "Первый захват",
        nameEn: "First Capture",
        description: "Захватить первую точку интереса",
        descriptionEn: "Capture your first POI",
        icon: "⚑",
        requirement: 1,
        reward: { type: "experience", amount: 50 },
        category: "exploration"
    },
    {
        id: "poi_conqueror",
        name: "Завоеватель",
        nameEn: "Conqueror",
        description: "Захватить 10 точек интереса",
        descriptionEn: "Capture 10 POIs",
        icon: "🏴",
        requirement: 10,
        reward: { type: "experience", amount: 200 },
        category: "exploration"
    },
    {
        id: "poi_warlord",
        name: "Полководец",
        nameEn: "Warlord",
        description: "Захватить 50 точек интереса",
        descriptionEn: "Capture 50 POIs",
        icon: "👑",
        requirement: 50,
        reward: { type: "experience", amount: 500 },
        category: "exploration"
    },
    {
        id: "ammo_collector",
        name: "Сборщик припасов",
        nameEn: "Ammo Collector",
        description: "Получить 100 снарядов со складов",
        descriptionEn: "Collect 100 ammo from depots",
        icon: "🔫",
        requirement: 100,
        reward: { type: "experience", amount: 100 },
        category: "exploration"
    },
    {
        id: "repair_addict",
        name: "Ремонтник",
        nameEn: "Repair Addict",
        description: "Восстановить 500 HP на ремонтных станциях",
        descriptionEn: "Heal 500 HP at repair stations",
        icon: "🔧",
        requirement: 500,
        reward: { type: "experience", amount: 100 },
        category: "exploration"
    },
    {
        id: "fuel_tanker",
        name: "Заправщик",
        nameEn: "Fuel Tanker",
        description: "Заправить 1000 литров топлива",
        descriptionEn: "Refuel 1000 liters",
        icon: "⛽",
        requirement: 1000,
        reward: { type: "experience", amount: 100 },
        category: "exploration"
    },
    {
        id: "explosives_expert",
        name: "Сапёр",
        nameEn: "Explosives Expert",
        description: "Взорвать 5 топливных складов",
        descriptionEn: "Blow up 5 fuel depots",
        icon: "💥",
        requirement: 5,
        reward: { type: "experience", amount: 150 },
        category: "combat"
    },
    {
        id: "radar_operator",
        name: "Оператор радара",
        nameEn: "Radar Operator",
        description: "Обнаружить 50 врагов с помощью радара",
        descriptionEn: "Detect 50 enemies with radar",
        icon: "📡",
        requirement: 50,
        reward: { type: "experience", amount: 150 },
        category: "exploration"
    },
    {
        id: "contested_victory",
        name: "Спорная победа",
        nameEn: "Contested Victory",
        description: "Выиграть контест на точке захвата",
        descriptionEn: "Win a contested capture point",
        icon: "⚔️",
        requirement: 1,
        reward: { type: "experience", amount: 75 },
        category: "combat"
    },
    {
        id: "domination",
        name: "Доминация",
        nameEn: "Domination",
        description: "Владеть 5 точками одновременно",
        descriptionEn: "Own 5 POIs at the same time",
        icon: "🌟",
        requirement: 1,
        reward: { type: "experience", amount: 300 },
        category: "special",
        hidden: true
    },
    
    // Special achievements
    {
        id: "tutorial_complete",
        name: "Новобранец",
        nameEn: "Recruit",
        description: "Пройти обучение",
        descriptionEn: "Complete the tutorial",
        icon: "📚",
        requirement: 1,
        reward: { type: "experience", amount: 25 },
        category: "special"
    },
    {
        id: "dedication",
        name: "Преданность",
        nameEn: "Dedication",
        description: "Играть 10 сессий",
        descriptionEn: "Play 10 sessions",
        icon: "⭐",
        requirement: 10,
        reward: { type: "experience", amount: 250 },
        category: "special"
    }
];

export class AchievementsSystem {
    private progress: Map<string, AchievementProgress> = new Map();
    private onAchievementUnlocked: ((achievement: Achievement) => void) | null = null;
    private language: "ru" | "en" = "ru";
    
    constructor() {
        this.loadProgress();
    }
    
    setLanguage(lang: "ru" | "en"): void {
        this.language = lang;
    }
    
    setOnAchievementUnlocked(callback: (achievement: Achievement) => void): void {
        this.onAchievementUnlocked = callback;
    }
    
    // Get achievement name based on language
    getAchievementName(achievement: Achievement): string {
        return this.language === "en" ? achievement.nameEn : achievement.name;
    }
    
    getAchievementDescription(achievement: Achievement): string {
        return this.language === "en" ? achievement.descriptionEn : achievement.description;
    }
    
    // Update progress for an achievement
    updateProgress(achievementId: string, amount: number = 1): void {
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement) return;
        
        let progress = this.progress.get(achievementId);
        if (!progress) {
            progress = { id: achievementId, current: 0, completed: false };
            this.progress.set(achievementId, progress);
        }
        
        if (progress.completed) return; // Already completed
        
        progress.current += amount;
        
        // Check if completed
        if (progress.current >= achievement.requirement) {
            progress.completed = true;
            progress.completedAt = Date.now();
            console.log(`[Achievements] Unlocked: ${achievement.name}!`);
            
            if (this.onAchievementUnlocked) {
                this.onAchievementUnlocked(achievement);
            }
        }
        
        this.saveProgress();
    }
    
    // Set exact value (for tracking things like survival time)
    setProgress(achievementId: string, value: number): void {
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement) return;
        
        let progress = this.progress.get(achievementId);
        if (!progress) {
            progress = { id: achievementId, current: 0, completed: false };
            this.progress.set(achievementId, progress);
        }
        
        if (progress.completed) return;
        
        progress.current = value;
        
        if (progress.current >= achievement.requirement) {
            progress.completed = true;
            progress.completedAt = Date.now();
            console.log(`[Achievements] Unlocked: ${achievement.name}!`);
            
            if (this.onAchievementUnlocked) {
                this.onAchievementUnlocked(achievement);
            }
        }
        
        this.saveProgress();
    }
    
    // Get progress for an achievement
    getProgress(achievementId: string): AchievementProgress | undefined {
        return this.progress.get(achievementId);
    }
    
    // Get all achievements with progress
    getAllAchievements(): Array<{ achievement: Achievement, progress: AchievementProgress }> {
        return ACHIEVEMENTS.map(achievement => ({
            achievement,
            progress: this.progress.get(achievement.id) || { id: achievement.id, current: 0, completed: false }
        }));
    }
    
    // Get completed achievements count
    getCompletedCount(): number {
        let count = 0;
        this.progress.forEach(p => { if (p.completed) count++; });
        return count;
    }
    
    // Get total achievements count
    getTotalCount(): number {
        return ACHIEVEMENTS.length;
    }
    
    // Check if achievement is completed
    isCompleted(achievementId: string): boolean {
        const progress = this.progress.get(achievementId);
        return progress?.completed || false;
    }
    
    // Claim reward for completed achievement
    claimReward(achievementId: string): Achievement["reward"] | null {
        const progress = this.progress.get(achievementId);
        if (!progress || !progress.completed || progress.claimed) return null;
        
        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (!achievement || !achievement.reward) return null;
        
        progress.claimed = true;
        this.saveProgress();
        
        return achievement.reward;
    }
    
    // Save progress to localStorage
    private saveProgress(): void {
        try {
            const data: Record<string, AchievementProgress> = {};
            this.progress.forEach((value, key) => {
                data[key] = value;
            });
            localStorage.setItem('achievements', JSON.stringify(data));
        } catch (e) {
            console.warn("[Achievements] Failed to save progress:", e);
        }
    }
    
    // Load progress from localStorage
    private loadProgress(): void {
        try {
            const saved = localStorage.getItem('achievements');
            if (saved) {
                const data = JSON.parse(saved) as Record<string, AchievementProgress>;
                Object.entries(data).forEach(([key, value]) => {
                    this.progress.set(key, value);
                });
                console.log(`[Achievements] Loaded ${this.progress.size} achievement records`);
            }
        } catch (e) {
            console.warn("[Achievements] Failed to load progress:", e);
        }
    }
    
    // Reset all progress (for debugging)
    resetProgress(): void {
        this.progress.clear();
        localStorage.removeItem('achievements');
        console.log("[Achievements] Progress reset");
    }
}

