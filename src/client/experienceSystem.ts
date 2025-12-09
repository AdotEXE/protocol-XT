// ═══════════════════════════════════════════════════════════════════════════
// EXPERIENCE SYSTEM - Система набора опыта для корпусов и пушек
// ═══════════════════════════════════════════════════════════════════════════

import { CHASSIS_TYPES, CANNON_TYPES, type ChassisType, type CannonType } from "./tankTypes";

// ───────────────────────────────────────────────────────────────────────────
// ТИПЫ И ИНТЕРФЕЙСЫ
// ───────────────────────────────────────────────────────────────────────────

export interface PartExperience {
    id: string;
    type: "chassis" | "cannon";
    experience: number;
    level: number;
    kills: number;              // Количество убийств
    damageDealt: number;        // Нанесённый урон
    damageTaken: number;        // Полученный урон (для корпуса)
    shotsFired: number;         // Выстрелов (для пушки)
    shotsHit: number;           // Попаданий (для пушки)
    criticalHits: number;       // Критических попаданий
    timePlayed: number;         // Время игры (в секундах)
    achievements: string[];     // Полученные достижения
}

export interface LevelBonus {
    level: number;
    healthBonus: number;        // Бонус к HP (для корпуса)
    speedBonus: number;         // Бонус к скорости (для корпуса)
    armorBonus: number;         // Бонус к броне (для корпуса)
    turnSpeedBonus: number;     // Бонус к скорости поворота
    damageBonus: number;        // Бонус к урону (для пушки)
    reloadBonus: number;        // Бонус к перезарядке (мс) - уменьшает время
    accuracyBonus: number;      // Бонус к точности (для пушки)
    projectileSpeedBonus: number; // Бонус к скорости снаряда
    title: string;              // Звание для этого уровня
    titleColor: string;         // Цвет звания
}

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    xpReward: number;
    condition: (exp: PartExperience) => boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// КОНСТАНТЫ
// ───────────────────────────────────────────────────────────────────────────

// Опыт, необходимый для каждого уровня
export const LEVEL_EXPERIENCE = [
    0,          // Level 1
    100,        // Level 2
    300,        // Level 3
    600,        // Level 4
    1000,       // Level 5
    1600,       // Level 6
    2400,       // Level 7
    3500,       // Level 8
    5000,       // Level 9
    7000,       // Level 10
    10000,      // Level 11
    14000,      // Level 12
    19000,      // Level 13
    25000,      // Level 14
    33000,      // Level 15 (max)
];

export const MAX_LEVEL = LEVEL_EXPERIENCE.length;

// Бонусы за уровень для корпусов
export const CHASSIS_LEVEL_BONUSES: LevelBonus[] = [
    { level: 1, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Новобранец", titleColor: "#888" },
    { level: 2, healthBonus: 5, speedBonus: 0.2, armorBonus: 0.02, turnSpeedBonus: 0.05, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Рядовой", titleColor: "#aaa" },
    { level: 3, healthBonus: 12, speedBonus: 0.4, armorBonus: 0.04, turnSpeedBonus: 0.1, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Ефрейтор", titleColor: "#0a0" },
    { level: 4, healthBonus: 20, speedBonus: 0.7, armorBonus: 0.07, turnSpeedBonus: 0.15, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Капрал", titleColor: "#0f0" },
    { level: 5, healthBonus: 30, speedBonus: 1.0, armorBonus: 0.10, turnSpeedBonus: 0.2, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Сержант", titleColor: "#0ff" },
    { level: 6, healthBonus: 42, speedBonus: 1.3, armorBonus: 0.14, turnSpeedBonus: 0.25, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Старший Сержант", titleColor: "#08f" },
    { level: 7, healthBonus: 56, speedBonus: 1.7, armorBonus: 0.18, turnSpeedBonus: 0.3, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Прапорщик", titleColor: "#00f" },
    { level: 8, healthBonus: 72, speedBonus: 2.1, armorBonus: 0.22, turnSpeedBonus: 0.35, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Лейтенант", titleColor: "#80f" },
    { level: 9, healthBonus: 90, speedBonus: 2.5, armorBonus: 0.27, turnSpeedBonus: 0.4, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Капитан", titleColor: "#f0f" },
    { level: 10, healthBonus: 110, speedBonus: 3.0, armorBonus: 0.32, turnSpeedBonus: 0.45, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Майор", titleColor: "#f80" },
    { level: 11, healthBonus: 132, speedBonus: 3.5, armorBonus: 0.38, turnSpeedBonus: 0.5, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Подполковник", titleColor: "#fa0" },
    { level: 12, healthBonus: 156, speedBonus: 4.0, armorBonus: 0.44, turnSpeedBonus: 0.55, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Полковник", titleColor: "#ff0" },
    { level: 13, healthBonus: 182, speedBonus: 4.6, armorBonus: 0.50, turnSpeedBonus: 0.6, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Генерал-майор", titleColor: "#f44" },
    { level: 14, healthBonus: 210, speedBonus: 5.2, armorBonus: 0.57, turnSpeedBonus: 0.65, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Генерал", titleColor: "#f00" },
    { level: 15, healthBonus: 250, speedBonus: 6.0, armorBonus: 0.65, turnSpeedBonus: 0.7, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Маршал", titleColor: "#fff" },
];

// Бонусы за уровень для пушек
export const CANNON_LEVEL_BONUSES: LevelBonus[] = [
    { level: 1, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 0, reloadBonus: 0, accuracyBonus: 0, projectileSpeedBonus: 0, title: "Новичок", titleColor: "#888" },
    { level: 2, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 2, reloadBonus: 30, accuracyBonus: 0.01, projectileSpeedBonus: 2, title: "Стрелок", titleColor: "#aaa" },
    { level: 3, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 4, reloadBonus: 60, accuracyBonus: 0.02, projectileSpeedBonus: 4, title: "Меткий", titleColor: "#0a0" },
    { level: 4, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 7, reloadBonus: 100, accuracyBonus: 0.03, projectileSpeedBonus: 6, title: "Снайпер", titleColor: "#0f0" },
    { level: 5, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 10, reloadBonus: 150, accuracyBonus: 0.05, projectileSpeedBonus: 8, title: "Наводчик", titleColor: "#0ff" },
    { level: 6, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 14, reloadBonus: 200, accuracyBonus: 0.07, projectileSpeedBonus: 10, title: "Артиллерист", titleColor: "#08f" },
    { level: 7, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 18, reloadBonus: 260, accuracyBonus: 0.09, projectileSpeedBonus: 13, title: "Канонир", titleColor: "#00f" },
    { level: 8, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 23, reloadBonus: 330, accuracyBonus: 0.11, projectileSpeedBonus: 16, title: "Мастер-наводчик", titleColor: "#80f" },
    { level: 9, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 28, reloadBonus: 400, accuracyBonus: 0.13, projectileSpeedBonus: 19, title: "Ас", titleColor: "#f0f" },
    { level: 10, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 34, reloadBonus: 480, accuracyBonus: 0.15, projectileSpeedBonus: 22, title: "Виртуоз", titleColor: "#f80" },
    { level: 11, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 40, reloadBonus: 560, accuracyBonus: 0.17, projectileSpeedBonus: 26, title: "Истребитель", titleColor: "#fa0" },
    { level: 12, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 47, reloadBonus: 650, accuracyBonus: 0.19, projectileSpeedBonus: 30, title: "Каратель", titleColor: "#ff0" },
    { level: 13, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 55, reloadBonus: 750, accuracyBonus: 0.21, projectileSpeedBonus: 35, title: "Разрушитель", titleColor: "#f44" },
    { level: 14, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 64, reloadBonus: 860, accuracyBonus: 0.23, projectileSpeedBonus: 40, title: "Уничтожитель", titleColor: "#f00" },
    { level: 15, healthBonus: 0, speedBonus: 0, armorBonus: 0, turnSpeedBonus: 0, damageBonus: 75, reloadBonus: 1000, accuracyBonus: 0.25, projectileSpeedBonus: 50, title: "Легенда", titleColor: "#fff" },
];

// Опыт за действия
export const XP_REWARDS = {
    KILL_TANK: 50,              // Убийство вражеского танка
    KILL_TURRET: 30,            // Уничтожение турели
    DAMAGE_DEALT: 0.3,          // За каждую единицу урона
    DAMAGE_TAKEN: 0.15,         // За каждую единицу полученного урона (корпус)
    SHOT_FIRED: 0.5,            // За каждый выстрел
    SHOT_HIT: 3,                // За попадание
    CRITICAL_HIT: 10,           // За критическое попадание
    SURVIVAL_MINUTE: 5,         // За каждую минуту выживания
    PICKUP_COLLECTED: 2,        // За подбор припаса
    ASSIST: 20,                 // За помощь в убийстве
};

// Достижения для корпусов
export const CHASSIS_ACHIEVEMENTS: Achievement[] = [
    { id: "first_blood", name: "Первая кровь", description: "Получите первое убийство", icon: "🩸", xpReward: 50, condition: (exp) => exp.kills >= 1 },
    { id: "survivor_10", name: "Выживший", description: "Проведите 10 минут в бою", icon: "⏱️", xpReward: 100, condition: (exp) => exp.timePlayed >= 600 },
    { id: "kills_10", name: "Истребитель", description: "Уничтожьте 10 врагов", icon: "💀", xpReward: 150, condition: (exp) => exp.kills >= 10 },
    { id: "kills_50", name: "Палач", description: "Уничтожьте 50 врагов", icon: "☠️", xpReward: 300, condition: (exp) => exp.kills >= 50 },
    { id: "kills_100", name: "Жнец", description: "Уничтожьте 100 врагов", icon: "💀", xpReward: 500, condition: (exp) => exp.kills >= 100 },
    { id: "tank_master", name: "Танковый Мастер", description: "Нанесите 10000 урона", icon: "🏆", xpReward: 400, condition: (exp) => exp.damageDealt >= 10000 },
    { id: "iron_wall", name: "Железная стена", description: "Получите 5000 урона и выживите", icon: "🛡️", xpReward: 350, condition: (exp) => exp.damageTaken >= 5000 },
    { id: "veteran", name: "Ветеран", description: "Проведите 1 час в бою", icon: "⭐", xpReward: 500, condition: (exp) => exp.timePlayed >= 3600 },
];

// Достижения для пушек
export const CANNON_ACHIEVEMENTS: Achievement[] = [
    { id: "first_shot", name: "Первый выстрел", description: "Сделайте первый выстрел", icon: "💥", xpReward: 10, condition: (exp) => exp.shotsFired >= 1 },
    { id: "marksman", name: "Меткий стрелок", description: "Попадите 100 раз", icon: "🎯", xpReward: 150, condition: (exp) => exp.shotsHit >= 100 },
    { id: "sniper", name: "Снайпер", description: "Сделайте 10 критических попаданий", icon: "🔫", xpReward: 200, condition: (exp) => exp.criticalHits >= 10 },
    { id: "destroyer", name: "Разрушитель", description: "Нанесите 5000 урона", icon: "💣", xpReward: 250, condition: (exp) => exp.damageDealt >= 5000 },
    { id: "artillery", name: "Артиллерист", description: "Сделайте 500 выстрелов", icon: "🎖️", xpReward: 300, condition: (exp) => exp.shotsFired >= 500 },
    { id: "deadeye", name: "Орлиный глаз", description: "50% точность при 200+ выстрелах", icon: "👁️", xpReward: 400, condition: (exp) => exp.shotsFired >= 200 && exp.shotsHit / exp.shotsFired >= 0.5 },
    { id: "killing_machine", name: "Машина убийств", description: "Уничтожьте 100 врагов", icon: "🤖", xpReward: 500, condition: (exp) => exp.kills >= 100 },
    { id: "legendary_gun", name: "Легендарное орудие", description: "Нанесите 50000 урона", icon: "🌟", xpReward: 1000, condition: (exp) => exp.damageDealt >= 50000 },
];

// ───────────────────────────────────────────────────────────────────────────
// КЛАСС СИСТЕМЫ ОПЫТА
// ───────────────────────────────────────────────────────────────────────────

export class ExperienceSystem {
    private chassisExperience: Map<string, PartExperience> = new Map();
    private cannonExperience: Map<string, PartExperience> = new Map();
    private chatSystem: any = null;
    private hud: any = null; // HUD для визуальных эффектов
    private effectsManager: any = null; // EffectsManager для эффектов повышения уровня
    private soundManager: any = null; // SoundManager для звуков опыта
    private lastUpdateTime: number = Date.now();
    private lastMinuteCheck: number = Date.now();
    private pendingXP: { chassis: number; cannon: number } = { chassis: 0, cannon: 0 };
    private xpAccumulator: number = 0;
    
    constructor() {
        this.loadProgress();
        this.initializeAllParts();
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ИНИЦИАЛИЗАЦИЯ
    // ─────────────────────────────────────────────────────────────────────
    
    private initializeAllParts(): void {
        // Инициализируем корпуса
        CHASSIS_TYPES.forEach(chassis => {
            if (!this.chassisExperience.has(chassis.id)) {
                this.chassisExperience.set(chassis.id, this.createEmptyExperience(chassis.id, "chassis"));
            }
        });
        
        // Инициализируем пушки
        CANNON_TYPES.forEach(cannon => {
            if (!this.cannonExperience.has(cannon.id)) {
                this.cannonExperience.set(cannon.id, this.createEmptyExperience(cannon.id, "cannon"));
            }
        });
    }
    
    private createEmptyExperience(id: string, type: "chassis" | "cannon"): PartExperience {
        return {
            id,
            type,
            experience: 0,
            level: 1,
            kills: 0,
            damageDealt: 0,
            damageTaken: 0,
            shotsFired: 0,
            shotsHit: 0,
            criticalHits: 0,
            timePlayed: 0,
            achievements: []
        };
    }
    
    setChatSystem(chatSystem: any): void {
        this.chatSystem = chatSystem;
    }
    
    setHUD(hud: any): void {
        this.hud = hud;
    }
    
    setEffectsManager(effectsManager: any): void {
        this.effectsManager = effectsManager;
    }
    
    setSoundManager(soundManager: any): void {
        this.soundManager = soundManager;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // СОХРАНЕНИЕ/ЗАГРУЗКА
    // ─────────────────────────────────────────────────────────────────────
    
    private loadProgress(): void {
        try {
            const saved = localStorage.getItem("tx_experience_v2");
            if (saved) {
                const data = JSON.parse(saved);
                
                if (data.chassis) {
                    Object.entries(data.chassis).forEach(([id, exp]) => {
                        this.chassisExperience.set(id, exp as PartExperience);
                    });
                }
                
                if (data.cannon) {
                    Object.entries(data.cannon).forEach(([id, exp]) => {
                        this.cannonExperience.set(id, exp as PartExperience);
                    });
                }
            }
        } catch (e) {
            console.warn("[ExperienceSystem] Failed to load progress:", e);
        }
    }
    
    private saveProgress(): void {
        try {
            const data = {
                chassis: Object.fromEntries(this.chassisExperience),
                cannon: Object.fromEntries(this.cannonExperience),
                savedAt: Date.now()
            };
            localStorage.setItem("tx_experience_v2", JSON.stringify(data));
        } catch (e) {
            console.warn("[ExperienceSystem] Failed to save progress:", e);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ДОБАВЛЕНИЕ ОПЫТА
    // ─────────────────────────────────────────────────────────────────────
    
    private addChassisExperience(chassisId: string, amount: number, reason: string = ""): void {
        const exp = this.chassisExperience.get(chassisId);
        if (!exp) return;
        
        const oldLevel = exp.level;
        const roundedAmount = Math.round(amount);
        exp.experience += roundedAmount;
        
        // Визуальная обратная связь при получении опыта
        if (this.hud && roundedAmount > 0) {
            this.hud.showExperienceGain(roundedAmount, "chassis");
        }
        
        // Звук получения опыта (только для значимых сумм)
        if (this.soundManager && roundedAmount >= 10) {
            this.soundManager.playSuccess();
        }
        
        // Проверяем повышение уровня
        this.checkLevelUp(exp, "chassis");
        
        // Проверяем достижения
        this.checkAchievements(exp, CHASSIS_ACHIEVEMENTS, "chassis");
        
        if (exp.level > oldLevel) {
            const chassis = CHASSIS_TYPES.find(c => c.id === chassisId);
            const levelInfo = CHASSIS_LEVEL_BONUSES[exp.level - 1];
            
            // Эффект повышения уровня
            if (this.hud) {
                this.hud.showLevelUp(exp.level, levelInfo.title, "chassis");
            }
            
            // Визуальный эффект повышения уровня
            if (this.effectsManager && this.soundManager) {
                // Звук повышения уровня будет вызван через soundManager
                this.soundManager.playSuccess();
            }
            
            if (this.chatSystem) {
                this.chatSystem.success(`🎉 УРОВЕНЬ! ${chassis?.name || chassisId} → Ур.${exp.level} "${levelInfo.title}"`, 1);
                this.showLevelUpBonuses(levelInfo, "chassis");
            }
        }
        
        this.saveProgress();
    }
    
    private addCannonExperience(cannonId: string, amount: number, reason: string = ""): void {
        const exp = this.cannonExperience.get(cannonId);
        if (!exp) return;
        
        const oldLevel = exp.level;
        const roundedAmount = Math.round(amount);
        exp.experience += roundedAmount;
        
        // Визуальная обратная связь при получении опыта
        if (this.hud && roundedAmount > 0) {
            this.hud.showExperienceGain(roundedAmount, "cannon");
        }
        
        // Звук получения опыта (только для значимых сумм)
        if (this.soundManager && roundedAmount >= 10) {
            this.soundManager.playSuccess();
        }
        
        // Проверяем повышение уровня
        this.checkLevelUp(exp, "cannon");
        
        // Проверяем достижения
        this.checkAchievements(exp, CANNON_ACHIEVEMENTS, "cannon");
        
        if (exp.level > oldLevel) {
            const cannon = CANNON_TYPES.find(c => c.id === cannonId);
            const levelInfo = CANNON_LEVEL_BONUSES[exp.level - 1];
            
            // Эффект повышения уровня
            if (this.hud) {
                this.hud.showLevelUp(exp.level, levelInfo.title, "cannon");
            }
            
            // Визуальный эффект повышения уровня
            if (this.effectsManager && this.soundManager) {
                // Звук повышения уровня будет вызван через soundManager
                this.soundManager.playSuccess();
            }
            
            if (this.chatSystem) {
                this.chatSystem.success(`🎉 УРОВЕНЬ! ${cannon?.name || cannonId} → Ур.${exp.level} "${levelInfo.title}"`, 1);
                this.showLevelUpBonuses(levelInfo, "cannon");
            }
        }
        
        this.saveProgress();
    }
    
    private showLevelUpBonuses(levelInfo: LevelBonus, type: "chassis" | "cannon"): void {
        if (!this.chatSystem) return;
        
        const bonuses: string[] = [];
        
        if (type === "chassis") {
            if (levelInfo.healthBonus > 0) bonuses.push(`+${levelInfo.healthBonus} HP`);
            if (levelInfo.speedBonus > 0) bonuses.push(`+${levelInfo.speedBonus.toFixed(1)} скорость`);
            if (levelInfo.armorBonus > 0) bonuses.push(`+${(levelInfo.armorBonus * 100).toFixed(0)}% броня`);
            if (levelInfo.turnSpeedBonus > 0) bonuses.push(`+${levelInfo.turnSpeedBonus.toFixed(2)} поворот`);
        } else {
            if (levelInfo.damageBonus > 0) bonuses.push(`+${levelInfo.damageBonus} урон`);
            if (levelInfo.reloadBonus > 0) bonuses.push(`-${levelInfo.reloadBonus}мс перезарядка`);
            if (levelInfo.accuracyBonus > 0) bonuses.push(`+${(levelInfo.accuracyBonus * 100).toFixed(0)}% точность`);
            if (levelInfo.projectileSpeedBonus > 0) bonuses.push(`+${levelInfo.projectileSpeedBonus} скор. снаряда`);
        }
        
        if (bonuses.length > 0) {
            this.chatSystem.info(`Бонусы: ${bonuses.join(", ")}`);
        }
    }
    
    private checkLevelUp(exp: PartExperience, type: "chassis" | "cannon"): void {
        while (exp.level < MAX_LEVEL && exp.experience >= LEVEL_EXPERIENCE[exp.level]) {
            exp.level++;
        }
    }
    
    private checkAchievements(exp: PartExperience, achievements: Achievement[], type: "chassis" | "cannon"): void {
        for (const achievement of achievements) {
            if (!exp.achievements.includes(achievement.id) && achievement.condition(exp)) {
                exp.achievements.push(achievement.id);
                exp.experience += achievement.xpReward;
                
                if (this.chatSystem) {
                    this.chatSystem.success(`🏆 ДОСТИЖЕНИЕ: ${achievement.icon} ${achievement.name}`, 1);
                    this.chatSystem.info(`${achievement.description} (+${achievement.xpReward} XP)`);
                }
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ЗАПИСЬ СОБЫТИЙ
    // ─────────────────────────────────────────────────────────────────────
    
    recordKill(chassisId: string, cannonId: string, isTurret: boolean = false): void {
        const xp = isTurret ? XP_REWARDS.KILL_TURRET : XP_REWARDS.KILL_TANK;
        
        // Обновляем статистику корпуса
        const chassisExp = this.chassisExperience.get(chassisId);
        if (chassisExp) {
            chassisExp.kills++;
            this.addChassisExperience(chassisId, xp, isTurret ? "turret_kill" : "tank_kill");
        }
        
        // Обновляем статистику пушки (получает больше XP за убийство)
        const cannonExp = this.cannonExperience.get(cannonId);
        if (cannonExp) {
            cannonExp.kills++;
            this.addCannonExperience(cannonId, xp * 1.5, isTurret ? "turret_kill" : "tank_kill");
        }
        
        // Показываем накопленный опыт
        if (this.chatSystem) {
            this.chatSystem.combat(`+${Math.round(xp)} XP (${isTurret ? "турель" : "танк"})`, 2);
        }
    }
    
    recordDamageDealt(chassisId: string, cannonId: string, damage: number): void {
        const xp = damage * XP_REWARDS.DAMAGE_DEALT;
        
        // Корпус получает меньше XP за урон
        const chassisExp = this.chassisExperience.get(chassisId);
        if (chassisExp) {
            chassisExp.damageDealt += damage;
        }
        
        // Пушка - основной получатель XP за урон
        const cannonExp = this.cannonExperience.get(cannonId);
        if (cannonExp) {
            cannonExp.damageDealt += damage;
            this.addCannonExperience(cannonId, xp, "damage_dealt");
        }
    }
    
    recordDamageTaken(chassisId: string, damage: number): void {
        const xp = damage * XP_REWARDS.DAMAGE_TAKEN;
        
        const chassisExp = this.chassisExperience.get(chassisId);
        if (chassisExp) {
            chassisExp.damageTaken += damage;
            this.addChassisExperience(chassisId, xp, "damage_taken");
        }
    }
    
    recordShot(cannonId: string): void {
        const cannonExp = this.cannonExperience.get(cannonId);
        if (cannonExp) {
            cannonExp.shotsFired++;
            this.addCannonExperience(cannonId, XP_REWARDS.SHOT_FIRED, "shot_fired");
        }
    }
    
    recordHit(cannonId: string, isCritical: boolean = false): void {
        const cannonExp = this.cannonExperience.get(cannonId);
        if (cannonExp) {
            cannonExp.shotsHit++;
            if (isCritical) {
                cannonExp.criticalHits++;
                this.addCannonExperience(cannonId, XP_REWARDS.CRITICAL_HIT, "critical_hit");
            } else {
                this.addCannonExperience(cannonId, XP_REWARDS.SHOT_HIT, "shot_hit");
            }
        }
    }
    
    recordPickup(chassisId: string): void {
        const chassisExp = this.chassisExperience.get(chassisId);
        if (chassisExp) {
            this.addChassisExperience(chassisId, XP_REWARDS.PICKUP_COLLECTED, "pickup");
        }
    }
    
    // Обновление времени игры (вызывать каждый кадр)
    updatePlayTime(chassisId: string, cannonId: string): void {
        const now = Date.now();
        const deltaMs = now - this.lastUpdateTime;
        this.lastUpdateTime = now;
        
        // Пропускаем если слишком большой интервал (пауза/табы)
        if (deltaMs > 2000) return;
        
        const deltaSeconds = deltaMs / 1000;
        
        // Обновляем время игры
        const chassisExp = this.chassisExperience.get(chassisId);
        if (chassisExp) {
            chassisExp.timePlayed += deltaSeconds;
        }
        
        const cannonExp = this.cannonExperience.get(cannonId);
        if (cannonExp) {
            cannonExp.timePlayed += deltaSeconds;
        }
        
        // Проверяем награду за минуту
        if (now - this.lastMinuteCheck >= 60000) {
            this.lastMinuteCheck = now;
            
            if (chassisExp) {
                this.addChassisExperience(chassisId, XP_REWARDS.SURVIVAL_MINUTE, "survival");
            }
            if (cannonExp) {
                this.addCannonExperience(cannonId, XP_REWARDS.SURVIVAL_MINUTE, "survival");
            }
            
            if (this.chatSystem) {
                this.chatSystem.info(`+${XP_REWARDS.SURVIVAL_MINUTE * 2} XP (время в бою)`);
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ПОЛУЧЕНИЕ ДАННЫХ
    // ─────────────────────────────────────────────────────────────────────
    
    getChassisExperience(chassisId: string): PartExperience | null {
        return this.chassisExperience.get(chassisId) || null;
    }
    
    getCannonExperience(cannonId: string): PartExperience | null {
        return this.cannonExperience.get(cannonId) || null;
    }
    
    getEquipmentInfo(id: string, type: "chassis" | "cannon"): PartExperience | null {
        if (type === "chassis") {
            return this.chassisExperience.get(id) || null;
        } else {
            return this.cannonExperience.get(id) || null;
        }
    }
    
    getChassisLevel(chassisId: string): number {
        return this.chassisExperience.get(chassisId)?.level || 1;
    }
    
    getCannonLevel(cannonId: string): number {
        return this.cannonExperience.get(cannonId)?.level || 1;
    }
    
    // Получить информацию об уровне
    getLevelInfo(id: string, type: "chassis" | "cannon"): LevelBonus | null {
        const exp = type === "chassis" 
            ? this.chassisExperience.get(id) 
            : this.cannonExperience.get(id);
        
        if (!exp) return null;
        
        const bonuses = type === "chassis" ? CHASSIS_LEVEL_BONUSES : CANNON_LEVEL_BONUSES;
        return bonuses[Math.min(exp.level - 1, bonuses.length - 1)];
    }
    
    // Получить бонусы за уровень
    getChassisLevelBonus(chassisId: string): LevelBonus {
        const level = this.getChassisLevel(chassisId);
        return CHASSIS_LEVEL_BONUSES[Math.min(level - 1, CHASSIS_LEVEL_BONUSES.length - 1)];
    }
    
    getCannonLevelBonus(cannonId: string): LevelBonus {
        const level = this.getCannonLevel(cannonId);
        return CANNON_LEVEL_BONUSES[Math.min(level - 1, CANNON_LEVEL_BONUSES.length - 1)];
    }
    
    // Получить прогресс до следующего уровня
    getLevelProgress(id: string, type: "chassis" | "cannon"): number {
        const exp = type === "chassis" 
            ? this.chassisExperience.get(id) 
            : this.cannonExperience.get(id);
        
        if (!exp) return 0;
        
        if (exp.level >= MAX_LEVEL) return 100;
        
        const currentLevelXP = LEVEL_EXPERIENCE[exp.level - 1];
        const nextLevelXP = LEVEL_EXPERIENCE[exp.level];
        const current = exp.experience - currentLevelXP;
        const required = nextLevelXP - currentLevelXP;
        
        return Math.min(100, Math.round((current / required) * 100));
    }
    
    // Получить XP до следующего уровня
    getExpToNextLevel(id: string, type: "chassis" | "cannon"): number {
        const exp = type === "chassis" 
            ? this.chassisExperience.get(id) 
            : this.cannonExperience.get(id);
        
        if (!exp) return 0;
        if (exp.level >= MAX_LEVEL) return 0;
        
        return LEVEL_EXPERIENCE[exp.level] - exp.experience;
    }
    
    getExperienceToNextLevel(exp: PartExperience): { current: number, required: number, progress: number } {
        if (exp.level >= MAX_LEVEL) {
            return { current: exp.experience, required: exp.experience, progress: 1 };
        }
        
        const currentLevelXP = LEVEL_EXPERIENCE[exp.level - 1];
        const nextLevelXP = LEVEL_EXPERIENCE[exp.level];
        const current = exp.experience - currentLevelXP;
        const required = nextLevelXP - currentLevelXP;
        const progress = current / required;
        
        return { current, required, progress };
    }
    
    // Получить всю статистику
    getAllStats(): { chassis: PartExperience[], cannons: PartExperience[] } {
        return {
            chassis: Array.from(this.chassisExperience.values()),
            cannons: Array.from(this.cannonExperience.values())
        };
    }
    
    // Получить отформатированную статистику для отображения
    getFormattedStats(id: string, type: "chassis" | "cannon"): string[] {
        const exp = type === "chassis" 
            ? this.chassisExperience.get(id) 
            : this.cannonExperience.get(id);
        
        if (!exp) return [];
        
        const stats: string[] = [];
        const levelInfo = type === "chassis" 
            ? CHASSIS_LEVEL_BONUSES[exp.level - 1]
            : CANNON_LEVEL_BONUSES[exp.level - 1];
        
        stats.push(`Уровень: ${exp.level} "${levelInfo.title}"`);
        stats.push(`Опыт: ${exp.experience} XP`);
        stats.push(`Убийств: ${exp.kills}`);
        stats.push(`Урон: ${Math.round(exp.damageDealt)}`);
        
        if (type === "chassis") {
            stats.push(`Получено урона: ${Math.round(exp.damageTaken)}`);
        } else {
            stats.push(`Выстрелов: ${exp.shotsFired}`);
            stats.push(`Попаданий: ${exp.shotsHit}`);
            const accuracy = exp.shotsFired > 0 ? ((exp.shotsHit / exp.shotsFired) * 100).toFixed(1) : "0.0";
            stats.push(`Точность: ${accuracy}%`);
        }
        
        const hours = Math.floor(exp.timePlayed / 3600);
        const minutes = Math.floor((exp.timePlayed % 3600) / 60);
        stats.push(`Время: ${hours}ч ${minutes}м`);
        stats.push(`Достижений: ${exp.achievements.length}`);
        
        return stats;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // УТИЛИТЫ
    // ─────────────────────────────────────────────────────────────────────
    
    resetProgress(): void {
        this.chassisExperience.clear();
        this.cannonExperience.clear();
        localStorage.removeItem("tx_experience_v2");
        this.initializeAllParts();
    }
    
    // Для совместимости с garage
    addKillExp(chassisId: string, cannonId: string, enemyType: "tank" | "turret"): void {
        this.recordKill(chassisId, cannonId, enemyType === "turret");
    }
    
    addDamageExp(chassisId: string, cannonId: string, damage: number): void {
        this.recordDamageDealt(chassisId, cannonId, damage);
    }
    
    addPlayTimeExp(chassisId: string, cannonId: string): void {
        this.updatePlayTime(chassisId, cannonId);
    }
    
    getLevelBonuses(id: string, type: "chassis" | "cannon"): { [stat: string]: number } {
        const levelInfo = this.getLevelInfo(id, type);
        if (!levelInfo) return {};
        
        if (type === "chassis") {
            return {
                health: levelInfo.healthBonus,
                speed: levelInfo.speedBonus,
                armor: levelInfo.armorBonus,
                turnSpeed: levelInfo.turnSpeedBonus
            };
        } else {
            return {
                damage: levelInfo.damageBonus,
                cooldown: -levelInfo.reloadBonus,
                projectileSpeed: levelInfo.projectileSpeedBonus,
                accuracy: levelInfo.accuracyBonus
            };
        }
    }
}
