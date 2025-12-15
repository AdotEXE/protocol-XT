// ═══════════════════════════════════════════════════════════════════════════
// MISSION SYSTEM - Система ежедневных заданий и миссий
// ═══════════════════════════════════════════════════════════════════════════

export interface Mission {
    id: string;
    name: string;
    nameEn: string;
    description: string;
    descriptionEn: string;
    icon: string;
    type: "daily" | "weekly" | "special";
    requirement: number;
    reward: {
        type: "experience" | "credits";
        amount: number;
    };
    category: "combat" | "exploration" | "poi" | "survival";
}

export interface MissionProgress {
    id: string;
    current: number;
    completed: boolean;
    claimed: boolean;
    expiresAt: number;
}

// Daily missions pool
const DAILY_MISSIONS: Mission[] = [
    // Combat missions
    {
        id: "daily_kills_5",
        name: "Охотник",
        nameEn: "Hunter",
        description: "Уничтожить 5 врагов",
        descriptionEn: "Destroy 5 enemies",
        icon: "💀",
        type: "daily",
        requirement: 5,
        reward: { type: "experience", amount: 100 },
        category: "combat"
    },
    {
        id: "daily_kills_10",
        name: "Истребитель",
        nameEn: "Destroyer",
        description: "Уничтожить 10 врагов",
        descriptionEn: "Destroy 10 enemies",
        icon: "☠️",
        type: "daily",
        requirement: 10,
        reward: { type: "experience", amount: 200 },
        category: "combat"
    },
    {
        id: "daily_damage_1000",
        name: "Наносящий урон",
        nameEn: "Damage Dealer",
        description: "Нанести 1000 урона",
        descriptionEn: "Deal 1000 damage",
        icon: "💥",
        type: "daily",
        requirement: 1000,
        reward: { type: "credits", amount: 50 },
        category: "combat"
    },
    
    // POI missions
    {
        id: "daily_capture_3",
        name: "Завоеватель",
        nameEn: "Conqueror",
        description: "Захватить 3 точки интереса",
        descriptionEn: "Capture 3 POIs",
        icon: "⚑",
        type: "daily",
        requirement: 3,
        reward: { type: "experience", amount: 150 },
        category: "poi"
    },
    {
        id: "daily_ammo_50",
        name: "Снабженец",
        nameEn: "Supplier",
        description: "Собрать 50 снарядов со складов",
        descriptionEn: "Collect 50 ammo from depots",
        icon: "🔫",
        type: "daily",
        requirement: 50,
        reward: { type: "credits", amount: 30 },
        category: "poi"
    },
    {
        id: "daily_repair_100",
        name: "Механик",
        nameEn: "Mechanic",
        description: "Восстановить 100 HP на ремонтных станциях",
        descriptionEn: "Heal 100 HP at repair stations",
        icon: "🔧",
        type: "daily",
        requirement: 100,
        reward: { type: "experience", amount: 75 },
        category: "poi"
    },
    
    // Survival missions
    {
        id: "daily_survive_3min",
        name: "Выживальщик",
        nameEn: "Survivor",
        description: "Выжить 3 минуты без смерти",
        descriptionEn: "Survive 3 minutes",
        icon: "⏱️",
        type: "daily",
        requirement: 180,
        reward: { type: "credits", amount: 40 },
        category: "survival"
    },
    
    // Exploration
    {
        id: "daily_travel_500",
        name: "Путешественник",
        nameEn: "Traveler",
        description: "Проехать 500 метров",
        descriptionEn: "Travel 500 meters",
        icon: "🚗",
        type: "daily",
        requirement: 500,
        reward: { type: "experience", amount: 50 },
        category: "exploration"
    }
];

// Weekly missions
const WEEKLY_MISSIONS: Mission[] = [
    {
        id: "weekly_kills_50",
        name: "Недельный палач",
        nameEn: "Weekly Executioner",
        description: "Уничтожить 50 врагов за неделю",
        descriptionEn: "Destroy 50 enemies this week",
        icon: "🏆",
        type: "weekly",
        requirement: 50,
        reward: { type: "experience", amount: 500 },
        category: "combat"
    },
    {
        id: "weekly_capture_15",
        name: "Властелин территорий",
        nameEn: "Territory Lord",
        description: "Захватить 15 точек интереса за неделю",
        descriptionEn: "Capture 15 POIs this week",
        icon: "👑",
        type: "weekly",
        requirement: 15,
        reward: { type: "credits", amount: 200 },
        category: "poi"
    },
    {
        id: "weekly_damage_10000",
        name: "Машина разрушения",
        nameEn: "Destruction Machine",
        description: "Нанести 10000 урона за неделю",
        descriptionEn: "Deal 10000 damage this week",
        icon: "💣",
        type: "weekly",
        requirement: 10000,
        reward: { type: "experience", amount: 750 },
        category: "combat"
    }
];

export class MissionSystem {
    private activeMissions: Map<string, MissionProgress> = new Map();
    private onMissionComplete: ((mission: Mission) => void) | null = null;
    private onMissionUpdate: ((mission: Mission, progress: MissionProgress) => void) | null = null;
    private language: "ru" | "en" = "ru";
    
    constructor() {
        this.loadProgress();
        this.checkAndRefreshMissions();
    }
    
    setLanguage(lang: "ru" | "en"): void {
        this.language = lang;
    }
    
    setOnMissionComplete(callback: (mission: Mission) => void): void {
        this.onMissionComplete = callback;
    }
    
    setOnMissionUpdate(callback: (mission: Mission, progress: MissionProgress) => void): void {
        this.onMissionUpdate = callback;
    }
    
    getName(mission: Mission): string {
        return this.language === "en" ? mission.nameEn : mission.name;
    }
    
    getDescription(mission: Mission): string {
        return this.language === "en" ? mission.descriptionEn : mission.description;
    }
    
    // Check and refresh daily/weekly missions
    private checkAndRefreshMissions(): void {
        const now = Date.now();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const tomorrowMs = todayMs + 24 * 60 * 60 * 1000;
        
        // Get start of week (Monday)
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        const nextWeekMs = weekStart.getTime() + 7 * 24 * 60 * 60 * 1000;
        
        // Check if daily missions need refresh
        let needsRefresh = false;
        for (const progress of this.activeMissions.values()) {
            if (progress.expiresAt < now) {
                needsRefresh = true;
                break;
            }
        }
        
        if (needsRefresh || this.activeMissions.size === 0) {
            this.generateNewMissions(tomorrowMs, nextWeekMs);
        }
    }
    
    private generateNewMissions(dailyExpires: number, weeklyExpires: number): void {
        // Clear expired missions
        for (const [id, progress] of this.activeMissions) {
            if (progress.expiresAt < Date.now()) {
                this.activeMissions.delete(id);
            }
        }
        
        // Generate 3 random daily missions
        const shuffledDaily = [...DAILY_MISSIONS].sort(() => Math.random() - 0.5);
        for (let i = 0; i < 3 && i < shuffledDaily.length; i++) {
            const mission = shuffledDaily[i];
            if (!this.activeMissions.has(mission.id)) {
                this.activeMissions.set(mission.id, {
                    id: mission.id,
                    current: 0,
                    completed: false,
                    claimed: false,
                    expiresAt: dailyExpires
                });
            }
        }
        
        // Generate 1 weekly mission if none active
        const hasWeekly = Array.from(this.activeMissions.values()).some(p => {
            const mission = this.getMissionById(p.id);
            return mission?.type === "weekly";
        });
        
        if (!hasWeekly) {
            const weeklyMission = WEEKLY_MISSIONS[Math.floor(Math.random() * WEEKLY_MISSIONS.length)];
            this.activeMissions.set(weeklyMission.id, {
                id: weeklyMission.id,
                current: 0,
                completed: false,
                claimed: false,
                expiresAt: weeklyExpires
            });
        }
        
        this.saveProgress();
    }
    
    private getMissionById(id: string): Mission | undefined {
        return [...DAILY_MISSIONS, ...WEEKLY_MISSIONS].find(m => m.id === id);
    }
    
    // Update progress for a mission category
    updateProgress(category: string, amount: number = 1): void {
        for (const [id, progress] of this.activeMissions) {
            if (progress.completed || progress.expiresAt < Date.now()) continue;
            
            const mission = this.getMissionById(id);
            if (!mission) continue;
            
            // Match category patterns
            let matches = false;
            switch (category) {
                case "kill":
                    matches = id.includes("kills");
                    break;
                case "damage":
                    matches = id.includes("damage");
                    break;
                case "capture":
                    matches = id.includes("capture");
                    break;
                case "ammo":
                    matches = id.includes("ammo");
                    break;
                case "repair":
                    matches = id.includes("repair");
                    break;
                case "survive":
                    matches = id.includes("survive");
                    break;
                case "travel":
                    matches = id.includes("travel");
                    break;
            }
            
            if (matches) {
                progress.current += amount;
                
                if (progress.current >= mission.requirement && !progress.completed) {
                    progress.completed = true;
                    console.log(`[Mission] Completed: ${mission.name}`);
                    
                    if (this.onMissionComplete) {
                        this.onMissionComplete(mission);
                    }
                }
                
                if (this.onMissionUpdate) {
                    this.onMissionUpdate(mission, progress);
                }
            }
        }
        
        this.saveProgress();
    }
    
    // Set exact value for missions like survival time
    setProgress(category: string, value: number): void {
        for (const [id, progress] of this.activeMissions) {
            if (progress.completed || progress.expiresAt < Date.now()) continue;
            
            const mission = this.getMissionById(id);
            if (!mission) continue;
            
            let matches = false;
            switch (category) {
                case "survive":
                    matches = id.includes("survive");
                    break;
            }
            
            if (matches) {
                progress.current = value;
                
                if (progress.current >= mission.requirement && !progress.completed) {
                    progress.completed = true;
                    console.log(`[Mission] Completed: ${mission.name}`);
                    
                    if (this.onMissionComplete) {
                        this.onMissionComplete(mission);
                    }
                }
                
                if (this.onMissionUpdate) {
                    this.onMissionUpdate(mission, progress);
                }
            }
        }
        
        this.saveProgress();
    }
    
    // Claim reward for completed mission
    claimReward(missionId: string): { type: string, amount: number } | null {
        const progress = this.activeMissions.get(missionId);
        if (!progress || !progress.completed || progress.claimed) return null;
        
        const mission = this.getMissionById(missionId);
        if (!mission) return null;
        
        progress.claimed = true;
        this.saveProgress();
        
        return mission.reward;
    }
    
    // Get all active missions with progress
    getActiveMissions(): Array<{ mission: Mission, progress: MissionProgress }> {
        const result: Array<{ mission: Mission, progress: MissionProgress }> = [];
        
        for (const [id, progress] of this.activeMissions) {
            if (progress.expiresAt < Date.now()) continue;
            
            const mission = this.getMissionById(id);
            if (mission) {
                result.push({ mission, progress });
            }
        }
        
        return result;
    }
    
    // Get unclaimed completed missions
    getUnclaimedMissions(): Array<{ mission: Mission, progress: MissionProgress }> {
        return this.getActiveMissions().filter(m => m.progress.completed && !m.progress.claimed);
    }
    
    private saveProgress(): void {
        try {
            const data = Array.from(this.activeMissions.entries());
            localStorage.setItem("tx_missions", JSON.stringify(data));
        } catch (e) {
            console.warn("[Mission] Failed to save progress:", e);
        }
    }
    
    private loadProgress(): void {
        try {
            const data = localStorage.getItem("tx_missions");
            if (data) {
                const entries = JSON.parse(data);
                this.activeMissions = new Map(entries);
            }
        } catch (e) {
            console.warn("[Mission] Failed to load progress:", e);
        }
    }
}

