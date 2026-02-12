// ═══════════════════════════════════════════════════════════════════════════
// PLAYER PROGRESSION SYSTEM - Глобальная система прокачки игрока
// ═══════════════════════════════════════════════════════════════════════════

import { Observable } from "@babylonjs/core";
import { logger } from "./utils/logger";

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

    // Навыки (очки вложенные) - ПОЛНОЕ ДРЕВО НАВЫКОВ
    skills: {
        // Корневые хабы
        tankMastery: number;
        survivalInstinct: number;
        resourcefulness: number;
        tacticalGenius: number;
        
        // Ветка боя
        combatExpert: number;
        damageBoost: number;
        accuracy: number;
        criticalStrike: number;
        fireRate: number;
        armorPenetration: number;
        destroyer: number;
        
        // Ветка выживания
        armor: number;
        health: number;
        regeneration: number;
        shield: number;
        vitality: number;
        invulnerability: number;
        
        // Ветка утилит
        economy: number;
        experience: number;
        scavenger: number;
        trader: number;
        student: number;
        sage: number;
        
        // Ветка мастерства
        turretSpeed: number;
        reloadSpeed: number;
        lightningTurn: number;
        preciseAiming: number;
        fastReload: number;
        autoReload: number;
        
        // Мета-навыки
        legend: number;
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

// Опыт для каждого уровня игрока (расширено до 50 уровней)
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
    103500,  // 21
    118500,  // 22
    135000,  // 23
    153000,  // 24
    172500,  // 25
    193500,  // 26
    216000,  // 27
    240000,  // 28
    265500,  // 29
    292500,  // 30
    321000,  // 31
    351000,  // 32
    382500,  // 33
    415500,  // 34
    450000,  // 35
    486000,  // 36
    523500,  // 37
    562500,  // 38
    603000,  // 39
    645000,  // 40
    688500,  // 41
    733500,  // 42
    780000,  // 43
    828000,  // 44
    877500,  // 45
    928500,  // 46
    981000,  // 47
    1035000, // 48
    1090500, // 49
    1147500, // 50 MAX
];

const MAX_PLAYER_LEVEL = PLAYER_LEVEL_EXP.length;
const MAX_SKILL_LEVEL = 15; // Увеличено с 10 до 15
const PRESTIGE_BONUS = 0.1; // 10% бонус за каждый престиж

// Титулы/ранги за уровни
const PLAYER_TITLES: Record<number, { title: string; icon: string; color: string }> = {
    1: { title: "Новобранец", icon: "🪖", color: "#888888" },
    5: { title: "Солдат", icon: "🎖️", color: "#cccccc" },
    10: { title: "Сержант", icon: "⭐", color: "#ffd700" },
    15: { title: "Лейтенант", icon: "🎖️", color: "#00ff00" },
    20: { title: "Капитан", icon: "🏅", color: "#00aaff" },
    25: { title: "Майор", icon: "🎖️", color: "#ff8800" },
    30: { title: "Полковник", icon: "👑", color: "#ff00ff" },
    35: { title: "Генерал", icon: "🌟", color: "#ff0000" },
    40: { title: "Маршал", icon: "💎", color: "#00ffff" },
    45: { title: "Легенда", icon: "⚡", color: "#ffff00" },
    50: { title: "Миф", icon: "🔥", color: "#ff00ff" }
};

// Пассивные бонусы за уровни игрока
function getLevelBonuses(level: number): {
    healthBonus: number;
    damageBonus: number;
    speedBonus: number;
    creditBonus: number;
} {
    // Линейное увеличение бонусов
    return {
        healthBonus: Math.floor(level * 2),        // +2 HP за уровень
        damageBonus: Math.floor(level * 0.5),     // +0.5 урона за уровень
        speedBonus: level * 0.1,                   // +0.1 скорости за уровень
        creditBonus: 1 + (level * 0.01)           // +1% кредитов за уровень
    };
}

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
        // Корневые хабы
        tankMastery: 0,
        survivalInstinct: 0,
        resourcefulness: 0,
        tacticalGenius: 0,
        
        // Ветка боя
        combatExpert: 0,
        damageBoost: 0,
        accuracy: 0,
        criticalStrike: 0,
        fireRate: 0,
        armorPenetration: 0,
        destroyer: 0,
        
        // Ветка выживания
        armor: 0,
        health: 0,
        regeneration: 0,
        shield: 0,
        vitality: 0,
        invulnerability: 0,
        
        // Ветка утилит
        economy: 0,
        experience: 0,
        scavenger: 0,
        trader: 0,
        student: 0,
        sage: 0,
        
        // Ветка мастерства
        turretSpeed: 0,
        reloadSpeed: 0,
        lightningTurn: 0,
        preciseAiming: 0,
        fastReload: 0,
        autoReload: 0,
        
        // Мета-навыки
        legend: 0
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
    private hud: any = null;
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

    setHUD(hud: any): void {
        this.hud = hud;
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
            logger.warn("[PlayerProgression] Failed to load stats:", e);
        }
        return { ...DEFAULT_PLAYER_STATS };
    }

    private saveStats(): void {
        try {
            localStorage.setItem("tx_player_stats", JSON.stringify(this.stats));
            this.lastSaveTime = Date.now();
        } catch (e) {
            logger.warn("[PlayerProgression] Failed to save stats:", e);
        }
    }

    // Публичный метод для принудительного сохранения
    public forceSave(): void {
        this.saveStats();
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
            // XP добавлен
        }

        this.stats.experience += finalAmount;
        this.stats.totalExperience += finalAmount;

        // Проверка повышения уровня
        // ВАЖНО: this.stats.experience содержит остаток опыта после повышения уровня
        // Чтобы проверить повышение, нужно вычислить общий накопленный опыт
        while (this.stats.level < MAX_PLAYER_LEVEL) {
            // Вычисляем общий накопленный опыт
            const currentLevelXP = PLAYER_LEVEL_EXP[this.stats.level - 1] || 0;
            const totalXP = currentLevelXP + this.stats.experience;
            const nextLevelXP = PLAYER_LEVEL_EXP[this.stats.level];

            // Проверяем, достигли ли мы порога для следующего уровня
            if (nextLevelXP !== undefined && totalXP >= nextLevelXP) {
                // Вычитаем опыт, необходимый для достижения следующего уровня
                this.stats.experience = totalXP - nextLevelXP;
                this.stats.level++;
                this.stats.skillPoints += 1;

                logger.log(`[PlayerProgression] Level up! New level: ${this.stats.level}, Remaining XP: ${this.stats.experience}`);

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
        this.onExperienceChanged.notifyObservers(data);
    }

    private onLevelUp(): void {
        const level = this.stats.level;
        const title = this.getTitle();

        // Проверяем веху уровня
        const isMilestone = level === 10 || level === 20 || level === 30 || level === 40 || level === 50;

        // Бонусные кредиты за уровень (увеличено)
        const levelBonus = level * 75; // Было 50
        this.stats.credits += levelBonus;

        // Особые награды за ключевые уровни
        let milestoneBonus = 0;
        let milestoneSkillPoints = 0;
        if (isMilestone) {
            milestoneBonus = level * 100;
            milestoneSkillPoints = 1; // Дополнительное очко навыков
            this.stats.credits += milestoneBonus;
            this.stats.skillPoints += milestoneSkillPoints;
        }

        // Пассивные бонусы за уровень
        const bonuses = getLevelBonuses(level);

        // Показываем красивый визуальный эффект
        if (this.hud && this.hud.showPlayerLevelUp) {
            this.hud.showPlayerLevelUp(
                level,
                title,
                bonuses,
                levelBonus + milestoneBonus,
                1 + milestoneSkillPoints, // Базовое очко + дополнительное за веху
                isMilestone
            );
        }

        // Сообщение в чат
        let message = `🎉 УРОВЕНЬ ${level}! +1 очко навыков`;
        if (title && PLAYER_TITLES[level]) {
            message += ` | ${title.icon} ${title.title}`;
        }

        if (this.chatSystem) {
            this.chatSystem.success(message, 1);
        }
        if (this.soundManager) {
            this.soundManager.playUpgrade?.();
        }

        if (this.chatSystem) {
            this.chatSystem.economy(`+${levelBonus + milestoneBonus} кредитов за уровень`);
        }

        if (this.chatSystem && level > 1) {
            this.chatSystem.info(
                `📈 Пассивные бонусы: +${bonuses.healthBonus} HP, +${bonuses.damageBonus.toFixed(1)} урона, +${bonuses.speedBonus.toFixed(1)} скорости`
            );
        }

        if (isMilestone && this.chatSystem) {
            this.chatSystem.success(`🌟 Веха уровня ${level}! +${milestoneBonus} кредитов, +${milestoneSkillPoints} очко навыков`, 1);
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
            // Полный список названий навыков для уведомлений
            const skillNames: Record<string, string> = {
                tankMastery: "Мастер танка",
                survivalInstinct: "Инстинкт выживания",
                resourcefulness: "Находчивость",
                tacticalGenius: "Тактический гений",
                combatExpert: "Боевой эксперт",
                damageBoost: "Урон",
                accuracy: "Точность",
                criticalStrike: "Критический удар",
                fireRate: "Скорострельность",
                armorPenetration: "Усиление бронебойности",
                destroyer: "Разрушитель",
                armor: "Броня",
                health: "Здоровье",
                regeneration: "Регенерация",
                shield: "Щит",
                vitality: "Живучесть",
                invulnerability: "Неуязвимость",
                economy: "Экономика",
                experience: "Опыт",
                scavenger: "Добытчик",
                trader: "Торговец",
                student: "Ученик",
                sage: "Мудрец",
                turretSpeed: "Скорость башни",
                reloadSpeed: "Перезарядка",
                lightningTurn: "Молниеносный поворот",
                preciseAiming: "Точное наведение",
                fastReload: "Быстрая перезарядка",
                autoReload: "Автоматическая перезарядка",
                legend: "Легенда"
            };
            const displayName = skillNames[skillName] || skillName;
            this.chatSystem.success(`⬆️ ${displayName} улучшен до ${this.stats.skills[skillName]}`);
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
        armorBonus: number;
        accuracyBonus: number;
        critChanceBonus: number;
        armorPenetrationBonus: number;
        structureDamageBonus: number;
        regenerationBonus: number;
        damageResistanceBonus: number;
    } {
        const s = this.stats.skills;
        
        // Базовые бонусы от корневых навыков
        const baseDamage = (s.combatExpert || 0) * 4 + (s.damageBoost || 0) * 6;
        const baseHealth = (s.survivalInstinct || 0) * 15 + (s.health || 0) * 20 + (s.vitality || 0) * 25;
        const baseSpeed = (s.tankMastery || 0) * 0.5;
        const baseReload = (s.tacticalGenius || 0) * 75 + (s.fireRate || 0) * 50 + (s.reloadSpeed || 0) * 100 + (s.fastReload || 0) * 120 + (s.autoReload || 0) * 150;
        const baseExp = (s.resourcefulness || 0) * 0.08 + (s.experience || 0) * 0.10 + (s.student || 0) * 0.12 + (s.sage || 0) * 0.15;
        const baseCredits = (s.resourcefulness || 0) * 0.08 + (s.economy || 0) * 0.10 + (s.scavenger || 0) * 0.15;
        const baseTurretSpeed = (s.tacticalGenius || 0) * 0.15 + (s.turretSpeed || 0) * 0.20 + (s.lightningTurn || 0) * 0.25 + (s.preciseAiming || 0) * 0.15;
        const baseArmor = (s.survivalInstinct || 0) * 0.02 + (s.armor || 0) * 0.03;
        
        // Дополнительные бонусы
        const accuracyBonus = (s.accuracy || 0) * 0.05 + (s.preciseAiming || 0) * 0.10;
        const critChanceBonus = (s.criticalStrike || 0) * 0.03;
        const armorPenetrationBonus = (s.armorPenetration || 0) * 0.02;
        const structureDamageBonus = (s.destroyer || 0) * 0.10;
        const regenerationBonus = (s.regeneration || 0) * 1.0; // HP/сек
        const damageResistanceBonus = (s.shield || 0) * 0.05 + (s.invulnerability || 0) * 0.02;
        
        // Мета-навык "Легенда" даёт +5% ко всему
        const legendMultiplier = 1 + (s.legend || 0) * 0.05;
        
        return {
            damageBonus: (baseDamage + (s.autoReload || 0) * 5) * legendMultiplier,
            healthBonus: baseHealth * legendMultiplier,
            speedBonus: baseSpeed * legendMultiplier,
            reloadBonus: baseReload * legendMultiplier,
            expBonus: baseExp * legendMultiplier,
            creditBonus: baseCredits * legendMultiplier,
            turretSpeedBonus: baseTurretSpeed * legendMultiplier,
            armorBonus: baseArmor * legendMultiplier,
            accuracyBonus: accuracyBonus * legendMultiplier,
            critChanceBonus: critChanceBonus * legendMultiplier,
            armorPenetrationBonus: armorPenetrationBonus * legendMultiplier,
            structureDamageBonus: structureDamageBonus * legendMultiplier,
            regenerationBonus: regenerationBonus * legendMultiplier,
            damageResistanceBonus: damageResistanceBonus * legendMultiplier
        };
    }

    // Получить пассивные бонусы за уровень игрока
    getLevelBonuses(): {
        healthBonus: number;
        damageBonus: number;
        speedBonus: number;
        creditBonus: number;
    } {
        return getLevelBonuses(this.stats.level);
    }

    // Получить титул игрока
    getTitle(): { title: string; icon: string; color: string } | null {
        // Находим самый высокий титул для текущего уровня
        let bestTitle: { title: string; icon: string; color: string } | null = null;
        let bestLevel = 0;

        for (const [level, title] of Object.entries(PLAYER_TITLES)) {
            const levelNum = parseInt(level);
            if (this.stats.level >= levelNum && levelNum > bestLevel) {
                bestTitle = title;
                bestLevel = levelNum;
            }
        }

        return bestTitle;
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

        // ИСПРАВЛЕНИЕ: НЕ добавляем опыт здесь - он уже добавляется через ExperienceSystem.flushXpBatch()
        // Это предотвращает дублирование опыта между ExperienceSystem и PlayerProgression
        // Опыт за убийство обрабатывается в ExperienceSystem.recordKill(), который затем
        // передает часть опыта в PlayerProgression через flushXpBatch()

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
        const required = (nextLevelXP ?? currentLevelXP) - currentLevelXP;

        // Ограничиваем current чтобы не превышал required
        current = Math.min(current, required);

        // Процент заполнения (округлён до 1 знака после запятой для упрощения)
        const rawPercent = required > 0 ? Math.min(100, Math.max(0, (current / required) * 100)) : 0;
        const percent = Math.round(rawPercent * 10) / 10; // Округляем до 1 знака после запятой

        // Логирование для отладки (только при значительных изменениях)
        if (Math.abs(this._lastXpLog - current) >= 10) {
            this._lastXpLog = current;
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
            if (oldest && newest) {
                const timeDiff = (newest.time - oldest.time) / 1000 / 60; // В минутах
                const xpDiff = newest.xp - oldest.xp;
                if (timeDiff > 0) {
                    experiencePerMinute = xpDiff / timeDiff;
                }
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

    /**
     * Установить уровень игрока (для восстановления прогресса)
     * @param level - Уровень для установки (1-50)
     */
    setLevel(level: number): void {
        if (level < 1) level = 1;
        if (level > MAX_PLAYER_LEVEL) level = MAX_PLAYER_LEVEL;

        // Устанавливаем уровень
        this.stats.level = level;

        // Устанавливаем опыт - минимум для этого уровня
        const expForLevel = PLAYER_LEVEL_EXP[level - 1] || 0;
        this.stats.experience = expForLevel;
        this.stats.totalExperience = expForLevel;

        // Даём skill points за уровень (по 1 за каждый уровень начиная со 2-го)
        this.stats.skillPoints = Math.max(0, level - 1);

        // Сохраняем
        this.saveStats();

        // Уведомляем систему об изменении
        this.notifyExperienceChanged();

    }

    /**
     * Получить текущий уровень
     */
    getCurrentLevel(): number {
        return this.stats.level;
    }
}

export { PLAYER_ACHIEVEMENTS, MAX_PLAYER_LEVEL, PLAYER_LEVEL_EXP, PLAYER_TITLES, getLevelBonuses };

