// ═══════════════════════════════════════════════════════════════════════════
// PLAYER PROGRESSION SYSTEM - Глобальная система прокачки игрока
// ═══════════════════════════════════════════════════════════════════════════

import { Observable } from "@babylonjs/core";

export interface PlayerStats {
    // Основные характеристики
    level: number;
    experience: number;
    totalExperience: number;
    skillPoints: number;
    
    // Статистика боёв
    totalKills: number;
    totalDeaths: number;
    totalDamageDealt: number;
    totalDamageTaken: number;
    totalShotsFired: number;
    totalShotsHit: number;
    totalPlayTime: number; // В секундах
    sessionsPlayed: number;
    
    // Валюта и награды
    credits: number;
    premiumCredits: number;
    
    // Престиж
    prestigeLevel: number;
    prestigeMultiplier: number;
    
    // Навыки (очки вложенные)
    skills: {
        tankMastery: number;      // Бонус ко всем характеристикам танка
        combatExpert: number;     // Бонус к урону и точности
        survivalInstinct: number; // Бонус к здоровью и регенерации
        resourcefulness: number;  // Бонус к опыту и кредитам
        tacticalGenius: number;   // Бонус к скорости башни и перезарядке
    };
    
    // Достижения
    achievements: string[];
    
    // Ежедневные задания
    dailyQuests: DailyQuest[];
    lastDailyReset: number;
    
    // Серии
    currentWinStreak: number;
    bestWinStreak: number;
    currentKillStreak: number;
    bestKillStreak: number;
}

export interface DailyQuest {
    id: string;
    name: string;
    description: string;
    target: number;
    progress: number;
    reward: { credits: number; exp: number };
    completed: boolean;
}

export interface PlayerAchievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: "combat" | "survival" | "progression" | "special";
    tier: "bronze" | "silver" | "gold" | "platinum";
    reward: { credits: number; exp: number; skillPoints?: number };
    condition: (stats: PlayerStats) => boolean;
}

// Опыт для каждого уровня игрока
const PLAYER_LEVEL_EXP = [
    0,       // 1
    500,     // 2
    1200,    // 3
    2100,    // 4
    3300,    // 5
    4800,    // 6
    6600,    // 7
    8800,    // 8
    11500,   // 9
    14700,   // 10
    18500,   // 11
    23000,   // 12
    28200,   // 13
    34200,   // 14
    41000,   // 15
    48700,   // 16
    57300,   // 17
    67000,   // 18
    77800,   // 19
    90000,   // 20
    105000,  // 21
    122000,  // 22
    141000,  // 23
    163000,  // 24
    188000,  // 25
    216000,  // 26
    248000,  // 27
    284000,  // 28
    325000,  // 29
    370000,  // 30 MAX
];

const MAX_PLAYER_LEVEL = PLAYER_LEVEL_EXP.length;
const MAX_SKILL_LEVEL = 10;
const PRESTIGE_BONUS = 0.1; // 10% бонус за каждый престиж

// Достижения игрока
const PLAYER_ACHIEVEMENTS: PlayerAchievement[] = [
    // Combat
    { id: "first_kill", name: "Первая кровь", description: "Уничтожьте первого врага", icon: "🩸", category: "combat", tier: "bronze", reward: { credits: 100, exp: 50 }, condition: (s) => s.totalKills >= 1 },
    { id: "kills_10", name: "Охотник", description: "Уничтожьте 10 врагов", icon: "💀", category: "combat", tier: "bronze", reward: { credits: 200, exp: 100 }, condition: (s) => s.totalKills >= 10 },
    { id: "kills_50", name: "Истребитель", description: "Уничтожьте 50 врагов", icon: "☠️", category: "combat", tier: "silver", reward: { credits: 500, exp: 300 }, condition: (s) => s.totalKills >= 50 },
    { id: "kills_100", name: "Палач", description: "Уничтожьте 100 врагов", icon: "⚰️", category: "combat", tier: "gold", reward: { credits: 1000, exp: 600 }, condition: (s) => s.totalKills >= 100 },
    { id: "kills_500", name: "Жнец", description: "Уничтожьте 500 врагов", icon: "💀", category: "combat", tier: "platinum", reward: { credits: 5000, exp: 3000, skillPoints: 2 }, condition: (s) => s.totalKills >= 500 },
    { id: "damage_1k", name: "Разрушитель", description: "Нанесите 1000 урона", icon: "💥", category: "combat", tier: "bronze", reward: { credits: 150, exp: 80 }, condition: (s) => s.totalDamageDealt >= 1000 },
    { id: "damage_10k", name: "Демолишер", description: "Нанесите 10000 урона", icon: "💣", category: "combat", tier: "silver", reward: { credits: 600, exp: 400 }, condition: (s) => s.totalDamageDealt >= 10000 },
    { id: "damage_100k", name: "Уничтожитель", description: "Нанесите 100000 урона", icon: "🔥", category: "combat", tier: "gold", reward: { credits: 2000, exp: 1200 }, condition: (s) => s.totalDamageDealt >= 100000 },
    { id: "accuracy_50", name: "Меткий глаз", description: "Достигните точности 50%", icon: "🎯", category: "combat", tier: "silver", reward: { credits: 400, exp: 250 }, condition: (s) => s.totalShotsFired > 100 && s.totalShotsHit / s.totalShotsFired >= 0.5 },
    { id: "streak_5", name: "На волне", description: "Убейте 5 врагов подряд", icon: "🔥", category: "combat", tier: "silver", reward: { credits: 300, exp: 200 }, condition: (s) => s.bestKillStreak >= 5 },
    { id: "streak_10", name: "Неудержимый", description: "Убейте 10 врагов подряд", icon: "⚡", category: "combat", tier: "gold", reward: { credits: 800, exp: 500 }, condition: (s) => s.bestKillStreak >= 10 },
    
    // Survival
    { id: "survive_10min", name: "Выживший", description: "Проведите 10 минут в бою", icon: "⏱️", category: "survival", tier: "bronze", reward: { credits: 100, exp: 50 }, condition: (s) => s.totalPlayTime >= 600 },
    { id: "survive_1hour", name: "Стойкий", description: "Проведите 1 час в бою", icon: "🛡️", category: "survival", tier: "silver", reward: { credits: 500, exp: 300 }, condition: (s) => s.totalPlayTime >= 3600 },
    { id: "survive_10hours", name: "Ветеран", description: "Проведите 10 часов в бою", icon: "⭐", category: "survival", tier: "gold", reward: { credits: 2000, exp: 1000, skillPoints: 1 }, condition: (s) => s.totalPlayTime >= 36000 },
    { id: "tank_damage_1k", name: "Железная воля", description: "Получите 1000 урона и выживите", icon: "🔩", category: "survival", tier: "bronze", reward: { credits: 200, exp: 100 }, condition: (s) => s.totalDamageTaken >= 1000 },
    { id: "tank_damage_10k", name: "Несокрушимый", description: "Получите 10000 урона и выживите", icon: "🛡️", category: "survival", tier: "silver", reward: { credits: 700, exp: 400 }, condition: (s) => s.totalDamageTaken >= 10000 },
    
    // Progression
    { id: "level_5", name: "Новобранец", description: "Достигните 5 уровня", icon: "📈", category: "progression", tier: "bronze", reward: { credits: 200, exp: 0 }, condition: (s) => s.level >= 5 },
    { id: "level_10", name: "Солдат", description: "Достигните 10 уровня", icon: "🎖️", category: "progression", tier: "silver", reward: { credits: 500, exp: 0, skillPoints: 1 }, condition: (s) => s.level >= 10 },
    { id: "level_20", name: "Офицер", description: "Достигните 20 уровня", icon: "🏅", category: "progression", tier: "gold", reward: { credits: 1500, exp: 0, skillPoints: 2 }, condition: (s) => s.level >= 20 },
    { id: "level_30", name: "Генерал", description: "Достигните 30 уровня", icon: "🎖️", category: "progression", tier: "platinum", reward: { credits: 5000, exp: 0, skillPoints: 5 }, condition: (s) => s.level >= 30 },
    { id: "prestige_1", name: "Престиж I", description: "Достигните престижа", icon: "⭐", category: "progression", tier: "gold", reward: { credits: 3000, exp: 0, skillPoints: 3 }, condition: (s) => s.prestigeLevel >= 1 },
    { id: "prestige_5", name: "Престиж V", description: "Достигните 5 престижа", icon: "🌟", category: "progression", tier: "platinum", reward: { credits: 10000, exp: 0, skillPoints: 10 }, condition: (s) => s.prestigeLevel >= 5 },
    
    // Special
    { id: "sessions_10", name: "Постоянный игрок", description: "Сыграйте 10 сессий", icon: "🎮", category: "special", tier: "bronze", reward: { credits: 300, exp: 150 }, condition: (s) => s.sessionsPlayed >= 10 },
    { id: "sessions_100", name: "Фанат", description: "Сыграйте 100 сессий", icon: "🏆", category: "special", tier: "gold", reward: { credits: 2000, exp: 1000, skillPoints: 2 }, condition: (s) => s.sessionsPlayed >= 100 },
    { id: "rich_1k", name: "Богач", description: "Накопите 1000 кредитов", icon: "💰", category: "special", tier: "bronze", reward: { credits: 100, exp: 50 }, condition: (s) => s.credits >= 1000 },
    { id: "rich_10k", name: "Миллионер", description: "Накопите 10000 кредитов", icon: "💎", category: "special", tier: "silver", reward: { credits: 500, exp: 250 }, condition: (s) => s.credits >= 10000 },
];

// Ежедневные задания
const DAILY_QUEST_POOL: Omit<DailyQuest, "progress" | "completed">[] = [
    { id: "daily_kills_5", name: "Охотник дня", description: "Уничтожьте 5 врагов", target: 5, reward: { credits: 100, exp: 50 } },
    { id: "daily_kills_10", name: "Истребитель дня", description: "Уничтожьте 10 врагов", target: 10, reward: { credits: 200, exp: 100 } },
    { id: "daily_damage_500", name: "Разрушитель дня", description: "Нанесите 500 урона", target: 500, reward: { credits: 150, exp: 75 } },
    { id: "daily_damage_1000", name: "Демолишер дня", description: "Нанесите 1000 урона", target: 1000, reward: { credits: 250, exp: 125 } },
    { id: "daily_survive_5min", name: "Выживание", description: "Проведите 5 минут в бою", target: 300, reward: { credits: 100, exp: 50 } },
    { id: "daily_shots_50", name: "Стрелок", description: "Сделайте 50 выстрелов", target: 50, reward: { credits: 80, exp: 40 } },
    { id: "daily_hits_20", name: "Меткий стрелок", description: "Попадите 20 раз", target: 20, reward: { credits: 120, exp: 60 } },
    { id: "daily_play_10min", name: "Активный игрок", description: "Играйте 10 минут", target: 600, reward: { credits: 150, exp: 75 } },
];

const DEFAULT_PLAYER_STATS: PlayerStats = {
    level: 1,
    experience: 0,
    totalExperience: 0,
    skillPoints: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    totalShotsFired: 0,
    totalShotsHit: 0,
    totalPlayTime: 0,
    sessionsPlayed: 0,
    credits: 500,
    premiumCredits: 0,
    prestigeLevel: 0,
    prestigeMultiplier: 1,
    skills: {
        tankMastery: 0,
        combatExpert: 0,
        survivalInstinct: 0,
        resourcefulness: 0,
        tacticalGenius: 0
    },
    achievements: [],
    dailyQuests: [],
    lastDailyReset: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    currentKillStreak: 0,
    bestKillStreak: 0
};

export class PlayerProgressionSystem {
    private stats: PlayerStats;
    private chatSystem: any = null;
    private soundManager: any = null;
    private menu: any = null;
    private lastSaveTime: number = 0;
    
    // Observable для уведомления об изменениях опыта
    public onExperienceChanged = new Observable<{
        current: number;
        required: number;
        percent: number;
        level: number;
    }>();
    
    constructor() {
        this.stats = this.loadStats();
        this.stats.sessionsPlayed++;
        this.checkDailyReset();
        this.saveStats();
    }
    
    setChatSystem(chat: any): void {
        this.chatSystem = chat;
    }
    
    setSoundManager(sound: any): void {
        this.soundManager = sound;
    }
    
    setMenu(menu: any): void {
        this.menu = menu;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ЗАГРУЗКА/СОХРАНЕНИЕ
    // ─────────────────────────────────────────────────────────────────────
    
    private loadStats(): PlayerStats {
        try {
            const saved = localStorage.getItem("tx_player_stats");
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...DEFAULT_PLAYER_STATS, ...parsed };
            }
        } catch (e) {
            console.warn("[PlayerProgression] Failed to load stats:", e);
        }
        return { ...DEFAULT_PLAYER_STATS };
    }
    
    private saveStats(): void {
        try {
            localStorage.setItem("tx_player_stats", JSON.stringify(this.stats));
            this.lastSaveTime = Date.now();
        } catch (e) {
            console.warn("[PlayerProgression] Failed to save stats:", e);
        }
    }
    
    // Автосохранение каждые 30 секунд
    autoSave(): void {
        if (Date.now() - this.lastSaveTime > 30000) {
            this.saveStats();
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ОПЫТ И УРОВНИ
    // ─────────────────────────────────────────────────────────────────────
    
    addExperience(amount: number, reason: string = ""): void {
        // Применяем бонусы
        const resourceBonus = 1 + this.stats.skills.resourcefulness * 0.05;
        const prestigeBonus = this.stats.prestigeMultiplier;
        const finalAmount = Math.round(amount * resourceBonus * prestigeBonus);
        
        // Логирование только для значимых сумм опыта (>= 1)
        if (finalAmount >= 1) {
            console.log(`[PlayerProgression] Adding ${finalAmount} XP (base: ${amount}, reason: ${reason}), Total: ${this.stats.experience + finalAmount}`);
        }
        
        this.stats.experience += finalAmount;
        this.stats.totalExperience += finalAmount;
        
        // Проверка повышения уровня
        // ВАЖНО: this.stats.experience содержит остаток опыта после повышения уровня
        // Чтобы проверить повышение, нужно вычислить общий накопленный опыт
        const oldLevel = this.stats.level;
        while (this.stats.level < MAX_PLAYER_LEVEL) {
            // Вычисляем общий накопленный опыт
            const currentLevelXP = PLAYER_LEVEL_EXP[this.stats.level - 1] || 0;
            const totalXP = currentLevelXP + this.stats.experience;
            const nextLevelXP = PLAYER_LEVEL_EXP[this.stats.level];
            
            // Проверяем, достигли ли мы порога для следующего уровня
            if (totalXP >= nextLevelXP) {
                // Вычитаем опыт, необходимый для достижения следующего уровня
                this.stats.experience = totalXP - nextLevelXP;
                this.stats.level++;
                this.stats.skillPoints += 1;
                
                console.log(`[PlayerProgression] Level up! New level: ${this.stats.level}, Remaining XP: ${this.stats.experience}`);
                
                this.onLevelUp();
            } else {
                // Не достигли порога, выходим из цикла
                break;
            }
        }
        
        this.checkAchievements();
        this.saveStats();
        
        // Уведомляем подписчиков об изменении опыта (всегда, даже если уровень не изменился)
        // Это обеспечивает обновление UI даже при малых изменениях опыта
        this.notifyExperienceChanged();
    }
    
    private notifyExperienceChanged(): void {
        const xpProgress = this.getExperienceProgress();
        const data = {
            current: xpProgress.current,
            required: xpProgress.required,
            percent: xpProgress.percent,
            level: this.stats.level
        };
        // Логирование для отладки
        console.log(`[PlayerProgression] Notifying experience change:`, data);
        this.onExperienceChanged.notifyObservers(data);
    }
    
    private onLevelUp(): void {
        if (this.chatSystem) {
            this.chatSystem.success(`🎉 УРОВЕНЬ ${this.stats.level}! +1 очко навыков`, 1);
        }
        if (this.soundManager) {
            this.soundManager.playUpgrade?.();
        }
        
        // Бонусные кредиты за уровень
        const levelBonus = this.stats.level * 50;
        this.stats.credits += levelBonus;
        if (this.chatSystem) {
            this.chatSystem.economy(`+${levelBonus} кредитов за уровень`);
        }
        
        // Обновляем меню при повышении уровня
        if (this.menu && typeof this.menu.updatePlayerInfo === 'function') {
            this.menu.updatePlayerInfo();
        }
        
        // Уведомляем подписчиков об изменении опыта (после повышения уровня)
        this.notifyExperienceChanged();
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // НАВЫКИ
    // ─────────────────────────────────────────────────────────────────────
    
    upgradeSkill(skillName: keyof PlayerStats["skills"]): boolean {
        if (this.stats.skillPoints <= 0) return false;
        if (this.stats.skills[skillName] >= MAX_SKILL_LEVEL) return false;
        
        this.stats.skills[skillName]++;
        this.stats.skillPoints--;
        this.saveStats();
        
        if (this.chatSystem) {
            const skillNames: Record<string, string> = {
                tankMastery: "Мастерство танка",
                combatExpert: "Боевой эксперт",
                survivalInstinct: "Инстинкт выживания",
                resourcefulness: "Находчивость",
                tacticalGenius: "Тактический гений"
            };
            this.chatSystem.success(`⬆️ ${skillNames[skillName]} улучшен до ${this.stats.skills[skillName]}`);
        }
        
        return true;
    }
    
    getSkillBonuses(): {
        damageBonus: number;
        healthBonus: number;
        speedBonus: number;
        reloadBonus: number;
        expBonus: number;
        creditBonus: number;
        turretSpeedBonus: number;
    } {
        return {
            damageBonus: this.stats.skills.combatExpert * 3,
            healthBonus: this.stats.skills.survivalInstinct * 10,
            speedBonus: this.stats.skills.tankMastery * 0.3,
            reloadBonus: this.stats.skills.tacticalGenius * 50,
            expBonus: this.stats.skills.resourcefulness * 0.05,
            creditBonus: this.stats.skills.resourcefulness * 0.05,
            turretSpeedBonus: this.stats.skills.tacticalGenius * 0.1
        };
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ПРЕСТИЖ
    // ─────────────────────────────────────────────────────────────────────
    
    canPrestige(): boolean {
        return this.stats.level >= MAX_PLAYER_LEVEL;
    }
    
    prestige(): boolean {
        if (!this.canPrestige()) return false;
        
        this.stats.prestigeLevel++;
        this.stats.prestigeMultiplier = 1 + this.stats.prestigeLevel * PRESTIGE_BONUS;
        
        // Сбрасываем уровень и опыт, но сохраняем навыки и достижения
        this.stats.level = 1;
        this.stats.experience = 0;
        this.stats.skillPoints += 5; // Бонусные очки за престиж
        
        if (this.chatSystem) {
            this.chatSystem.success(`🌟 ПРЕСТИЖ ${this.stats.prestigeLevel}! Бонус опыта: +${(this.stats.prestigeMultiplier - 1) * 100}%`, 1);
        }
        
        this.checkAchievements();
        this.saveStats();
        return true;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ЗАПИСЬ СТАТИСТИКИ
    // ─────────────────────────────────────────────────────────────────────
    
    recordKill(): void {
        this.stats.totalKills++;
        this.stats.currentKillStreak++;
        if (this.stats.currentKillStreak > this.stats.bestKillStreak) {
            this.stats.bestKillStreak = this.stats.currentKillStreak;
        }
        
        // Опыт за убийство
        const baseExp = 25;
        const streakBonus = Math.min(this.stats.currentKillStreak * 5, 50);
        this.addExperience(baseExp + streakBonus, "kill");
        
        // Обновляем ежедневные квесты
        this.updateDailyQuest("kills", 1);
        
        this.checkAchievements();
    }
    
    recordDeath(): void {
        this.stats.totalDeaths++;
        this.stats.currentKillStreak = 0;
        this.stats.currentWinStreak = 0;
        this.saveStats();
    }
    
    recordDamageDealt(amount: number): void {
        this.stats.totalDamageDealt += amount;
        this.addExperience(Math.round(amount * 0.1), "damage");
        this.updateDailyQuest("damage", amount);
    }
    
    recordDamageTaken(amount: number): void {
        this.stats.totalDamageTaken += amount;
        // Небольшой опыт за получение урона
        this.addExperience(Math.round(amount * 0.02), "tanking");
    }
    
    recordShot(hit: boolean): void {
        this.stats.totalShotsFired++;
        if (hit) {
            this.stats.totalShotsHit++;
            this.updateDailyQuest("hits", 1);
        }
        this.updateDailyQuest("shots", 1);
    }
    
    recordPlayTime(seconds: number): void {
        this.stats.totalPlayTime += seconds;
        this.updateDailyQuest("playtime", seconds);
    }
    
    addCredits(amount: number): void {
        const resourceBonus = 1 + this.stats.skills.resourcefulness * 0.05;
        const prestigeBonus = this.stats.prestigeMultiplier;
        const finalAmount = Math.round(amount * resourceBonus * prestigeBonus);
        
        this.stats.credits += finalAmount;
        this.checkAchievements();
        this.saveStats();
    }
    
    spendCredits(amount: number): boolean {
        if (this.stats.credits < amount) return false;
        this.stats.credits -= amount;
        this.saveStats();
        return true;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ДОСТИЖЕНИЯ
    // ─────────────────────────────────────────────────────────────────────
    
    private checkAchievements(): void {
        for (const achievement of PLAYER_ACHIEVEMENTS) {
            if (!this.stats.achievements.includes(achievement.id) && achievement.condition(this.stats)) {
                this.unlockAchievement(achievement);
            }
        }
    }
    
    private unlockAchievement(achievement: PlayerAchievement): void {
        this.stats.achievements.push(achievement.id);
        
        // Награды
        this.stats.credits += achievement.reward.credits;
        if (achievement.reward.skillPoints) {
            this.stats.skillPoints += achievement.reward.skillPoints;
        }
        // Опыт добавляем напрямую чтобы избежать рекурсии
        this.stats.experience += achievement.reward.exp;
        this.stats.totalExperience += achievement.reward.exp;
        
        if (this.chatSystem) {
            this.chatSystem.success(`🏆 ДОСТИЖЕНИЕ: ${achievement.icon} ${achievement.name}`, 1);
            this.chatSystem.info(`${achievement.description} | +${achievement.reward.credits} кредитов, +${achievement.reward.exp} XP`);
        }
        
        this.saveStats();
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ЕЖЕДНЕВНЫЕ ЗАДАНИЯ
    // ─────────────────────────────────────────────────────────────────────
    
    private checkDailyReset(): void {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        
        if (now - this.stats.lastDailyReset > dayMs || this.stats.dailyQuests.length === 0) {
            this.generateDailyQuests();
            this.stats.lastDailyReset = now;
        }
    }
    
    private generateDailyQuests(): void {
        // Выбираем 3 случайных квеста
        const shuffled = [...DAILY_QUEST_POOL].sort(() => Math.random() - 0.5);
        this.stats.dailyQuests = shuffled.slice(0, 3).map(q => ({
            ...q,
            progress: 0,
            completed: false
        }));
    }
    
    private updateDailyQuest(type: string, amount: number): void {
        for (const quest of this.stats.dailyQuests) {
            if (quest.completed) continue;
            
            let matches = false;
            if (type === "kills" && quest.id.includes("kills")) matches = true;
            if (type === "damage" && quest.id.includes("damage")) matches = true;
            if (type === "shots" && quest.id.includes("shots")) matches = true;
            if (type === "hits" && quest.id.includes("hits")) matches = true;
            if (type === "playtime" && (quest.id.includes("survive") || quest.id.includes("play"))) matches = true;
            
            if (matches) {
                quest.progress = Math.min(quest.target, quest.progress + amount);
                
                if (quest.progress >= quest.target && !quest.completed) {
                    quest.completed = true;
                    this.stats.credits += quest.reward.credits;
                    this.stats.experience += quest.reward.exp;
                    this.stats.totalExperience += quest.reward.exp;
                    
                    if (this.chatSystem) {
                        this.chatSystem.success(`✅ Задание выполнено: ${quest.name}`, 1);
                        this.chatSystem.economy(`+${quest.reward.credits} кредитов, +${quest.reward.exp} XP`);
                    }
                }
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ГЕТТЕРЫ
    // ─────────────────────────────────────────────────────────────────────
    
    getStats(): PlayerStats {
        return { ...this.stats };
    }
    
    getLevel(): number {
        return this.stats.level;
    }
    
    getExperienceProgress(): { current: number; required: number; percent: number } {
        if (this.stats.level >= MAX_PLAYER_LEVEL) {
            return { current: 0, required: 0, percent: 100 };
        }
        
        // ВАЖНО: this.stats.experience содержит остаток опыта ПОСЛЕ повышения уровня
        // При повышении уровня вычитается PLAYER_LEVEL_EXP[oldLevel]
        // Например: если level = 4, значит уже вычли PLAYER_LEVEL_EXP[3] = 2100
        // this.stats.experience = остаток опыта для уровня 4
        
        // Опыт для текущего уровня (порог для повышения)
        // PLAYER_LEVEL_EXP[level - 1] - это порог для достижения level
        // PLAYER_LEVEL_EXP[level] - это порог для достижения level + 1
        const currentLevelXP = PLAYER_LEVEL_EXP[this.stats.level - 1] || 0;
        const nextLevelXP = PLAYER_LEVEL_EXP[this.stats.level] || PLAYER_LEVEL_EXP[PLAYER_LEVEL_EXP.length - 1];
        
        // Текущий опыт - это просто остаток опыта после повышения уровня
        // Он уже находится в диапазоне [0, required)
        let current = this.stats.experience;
        
        // Убеждаемся, что current не отрицательный
        current = Math.max(0, current);
        
        // Требуемый опыт для следующего уровня (разница между уровнями)
        const required = nextLevelXP - currentLevelXP;
        
        // Ограничиваем current чтобы не превышал required
        current = Math.min(current, required);
        
        // Процент заполнения (округлён до 1 знака после запятой для упрощения)
        const rawPercent = required > 0 ? Math.min(100, Math.max(0, (current / required) * 100)) : 0;
        const percent = Math.round(rawPercent * 10) / 10; // Округляем до 1 знака после запятой
        
        // Логирование для отладки (только при значительных изменениях)
        if (Math.abs(this._lastXpLog - current) >= 10) {
            this._lastXpLog = current;
            console.log(`[PlayerProgression] XP Progress: Level ${this.stats.level}, Current: ${current}/${required} (${percent.toFixed(1)}%)`);
        }
        
        return { current, required, percent };
    }
    
    private _lastXpLog: number = -1; // Для отслеживания изменений
    
    // Получить статистику опыта в реальном времени
    getRealTimeXpStats(): {
        level: number;
        current: number;
        required: number;
        percent: number;
        totalExperience: number;
        experiencePerMinute: number;
    } {
        const xpProgress = this.getExperienceProgress();
        const now = Date.now();
        
        // Вычисляем опыт в минуту (за последнюю минуту)
        if (!this._xpHistory) {
            this._xpHistory = [];
        }
        
        // Добавляем текущий опыт в историю
        this._xpHistory.push({ time: now, xp: this.stats.totalExperience });
        
        // Удаляем записи старше минуты
        const oneMinuteAgo = now - 60000;
        this._xpHistory = this._xpHistory.filter(entry => entry.time > oneMinuteAgo);
        
        // Вычисляем опыт в минуту
        let experiencePerMinute = 0;
        if (this._xpHistory.length >= 2) {
            const oldest = this._xpHistory[0];
            const newest = this._xpHistory[this._xpHistory.length - 1];
            const timeDiff = (newest.time - oldest.time) / 1000 / 60; // В минутах
            const xpDiff = newest.xp - oldest.xp;
            if (timeDiff > 0) {
                experiencePerMinute = xpDiff / timeDiff;
            }
        }
        
        return {
            level: this.stats.level,
            current: xpProgress.current,
            required: xpProgress.required,
            percent: xpProgress.percent,
            totalExperience: this.stats.totalExperience,
            experiencePerMinute: Math.round(experiencePerMinute)
        };
    }
    
    private _xpHistory: Array<{ time: number; xp: number }> = [];
    
    getCredits(): number {
        return this.stats.credits;
    }
    
    getSkillPoints(): number {
        return this.stats.skillPoints;
    }
    
    getDailyQuests(): DailyQuest[] {
        return this.stats.dailyQuests;
    }
    
    getAchievements(): { unlocked: PlayerAchievement[]; locked: PlayerAchievement[] } {
        const unlocked = PLAYER_ACHIEVEMENTS.filter(a => this.stats.achievements.includes(a.id));
        const locked = PLAYER_ACHIEVEMENTS.filter(a => !this.stats.achievements.includes(a.id));
        return { unlocked, locked };
    }
    
    getKDRatio(): string {
        if (this.stats.totalDeaths === 0) return this.stats.totalKills.toFixed(1);
        return (this.stats.totalKills / this.stats.totalDeaths).toFixed(2);
    }
    
    getAccuracy(): string {
        if (this.stats.totalShotsFired === 0) return "0%";
        return ((this.stats.totalShotsHit / this.stats.totalShotsFired) * 100).toFixed(1) + "%";
    }
    
    getPlayTimeFormatted(): string {
        const hours = Math.floor(this.stats.totalPlayTime / 3600);
        const minutes = Math.floor((this.stats.totalPlayTime % 3600) / 60);
        return `${hours}ч ${minutes}м`;
    }
    
    // Сброс прогресса (для тестирования)
    resetProgress(): void {
        this.stats = { ...DEFAULT_PLAYER_STATS };
        localStorage.removeItem("tx_player_stats");
    }
}

export { PLAYER_ACHIEVEMENTS, MAX_PLAYER_LEVEL, PLAYER_LEVEL_EXP };

