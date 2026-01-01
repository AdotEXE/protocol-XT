/**
 * Daily Quests System
 * Provides daily challenges for players to complete
 */

export interface DailyQuest {
    id: string;
    name: string;
    description: string;
    icon: string;
    requirement: number;
    current: number;
    reward: {
        type: "experience" | "currency";
        amount: number;
    };
    category: "combat" | "survival" | "exploration" | "multiplayer";
    expiresAt: number; // Timestamp when quest expires
    completed: boolean;
    claimed: boolean;
}

export interface BattlePass {
    level: number;
    experience: number;
    experienceToNext: number;
    rewards: BattlePassReward[];
    seasonId: string;
    seasonName: string;
    seasonEnd: number; // Timestamp
}

export interface BattlePassReward {
    level: number;
    freeReward?: {
        type: "experience" | "currency" | "unlock";
        amount?: number;
        unlockId?: string;
    };
    premiumReward?: {
        type: "experience" | "currency" | "unlock" | "cosmetic";
        amount?: number;
        unlockId?: string;
        cosmeticId?: string;
    };
    claimed: boolean;
}

export class DailyQuestsSystem {
    private quests: DailyQuest[] = [];
    private lastResetDate: string = this.getCurrentDate();
    
    /**
     * Get current date string (YYYY-MM-DD)
     */
    private getCurrentDate(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    
    /**
     * Check if quests need to be reset (new day)
     */
    private shouldReset(): boolean {
        const currentDate = this.getCurrentDate();
        if (currentDate !== this.lastResetDate) {
            this.lastResetDate = currentDate;
            return true;
        }
        return false;
    }
    
    /**
     * Generate daily quests
     */
    private generateDailyQuests(): DailyQuest[] {
        const now = Date.now();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const expiresAt = tomorrow.getTime();
        
        const questTemplates = [
            {
                id: "daily_kills",
                name: "Ежедневные убийства",
                description: "Уничтожить 10 врагов",
                icon: "💀",
                requirement: 10,
                reward: { type: "experience" as const, amount: 100 },
                category: "combat" as const
            },
            {
                id: "daily_damage",
                name: "Урон дня",
                description: "Нанести 5000 урона",
                icon: "💥",
                requirement: 5000,
                reward: { type: "experience" as const, amount: 150 },
                category: "combat" as const
            },
            {
                id: "daily_survival",
                name: "Выживание",
                description: "Выжить 10 минут",
                icon: "⏱️",
                requirement: 600, // seconds
                reward: { type: "experience" as const, amount: 200 },
                category: "survival" as const
            },
            {
                id: "daily_exploration",
                name: "Исследователь",
                description: "Посетить 3 разных карты",
                icon: "🗺️",
                requirement: 3,
                reward: { type: "currency" as const, amount: 100 },
                category: "exploration" as const
            },
            {
                id: "daily_multiplayer",
                name: "Мультиплеер",
                description: "Сыграть 3 матча в мультиплеере",
                icon: "🎮",
                requirement: 3,
                reward: { type: "experience" as const, amount: 250 },
                category: "multiplayer" as const
            }
        ];
        
        // Select 3 random quests
        const selected = questTemplates
            .sort(() => Math.random() - 0.5)
            .slice(0, 3)
            .map(template => ({
                ...template,
                current: 0,
                expiresAt,
                completed: false,
                claimed: false
            }));
        
        return selected;
    }
    
    /**
     * Get current daily quests
     */
    getQuests(): DailyQuest[] {
        if (this.shouldReset() || this.quests.length === 0) {
            this.quests = this.generateDailyQuests();
        }
        return this.quests;
    }
    
    /**
     * Update quest progress
     */
    updateProgress(questId: string, amount: number): void {
        const quest = this.quests.find(q => q.id === questId);
        if (quest && !quest.completed) {
            quest.current = Math.min(quest.current + amount, quest.requirement);
            if (quest.current >= quest.requirement) {
                quest.completed = true;
            }
        }
    }
    
    /**
     * Claim quest reward
     */
    claimReward(questId: string): { type: string; amount?: number } | null {
        const quest = this.quests.find(q => q.id === questId);
        if (quest && quest.completed && !quest.claimed) {
            quest.claimed = true;
            return quest.reward;
        }
        return null;
    }
    
    /**
     * Check if any quests are expired
     */
    checkExpired(): void {
        const now = Date.now();
        this.quests = this.quests.filter(q => q.expiresAt > now);
    }
}

/**
 * Battle Pass System
 */
export class BattlePassSystem {
    private battlePass: BattlePass | null = null;
    private readonly XP_PER_LEVEL = 1000;
    
    /**
     * Initialize battle pass for current season
     */
    initializeSeason(seasonId: string, seasonName: string, durationDays: number = 90): void {
        const now = Date.now();
        const seasonEnd = now + (durationDays * 24 * 60 * 60 * 1000);
        
        // Generate rewards for 100 levels
        const rewards: BattlePassReward[] = [];
        for (let level = 1; level <= 100; level++) {
            const reward: BattlePassReward = {
                level,
                claimed: false
            };
            
            // Free rewards every level
            if (level % 5 === 0) {
                reward.freeReward = {
                    type: "currency",
                    amount: 50 * level
                };
            } else {
                reward.freeReward = {
                    type: "experience",
                    amount: 100
                };
            }
            
            // Premium rewards every 10 levels
            if (level % 10 === 0) {
                reward.premiumReward = {
                    type: "cosmetic",
                    cosmeticId: `season_${seasonId}_level_${level}`
                };
            }
            
            rewards.push(reward);
        }
        
        this.battlePass = {
            level: 1,
            experience: 0,
            experienceToNext: this.XP_PER_LEVEL,
            rewards,
            seasonId,
            seasonName,
            seasonEnd
        };
    }
    
    /**
     * Get current battle pass
     */
    getBattlePass(): BattlePass | null {
        if (this.battlePass && Date.now() > this.battlePass.seasonEnd) {
            // Season ended
            this.battlePass = null;
        }
        return this.battlePass;
    }
    
    /**
     * Add experience to battle pass
     */
    addExperience(amount: number): void {
        if (!this.battlePass) return;
        
        this.battlePass.experience += amount;
        
        // Level up if enough experience
        while (this.battlePass.experience >= this.battlePass.experienceToNext) {
            this.battlePass.experience -= this.battlePass.experienceToNext;
            this.battlePass.level++;
            this.battlePass.experienceToNext = this.XP_PER_LEVEL;
            
            // Check if level reward can be claimed
            const reward = this.battlePass.rewards.find(r => r.level === this.battlePass!.level);
            if (reward && !reward.claimed) {
                // Reward available
            }
        }
    }
    
    /**
     * Claim battle pass reward
     */
    claimReward(level: number, isPremium: boolean = false): { type: string; amount?: number; unlockId?: string; cosmeticId?: string } | null {
        if (!this.battlePass) return null;
        
        const reward = this.battlePass.rewards.find(r => r.level === level);
        if (!reward || reward.claimed) return null;
        
        const selectedReward = isPremium ? reward.premiumReward : reward.freeReward;
        if (!selectedReward) return null;
        
        reward.claimed = true;
        return selectedReward;
    }
}



