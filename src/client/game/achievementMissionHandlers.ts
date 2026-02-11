/**
 * Обработчики разблокировки достижений и завершения миссий.
 * Вызываются из Game при установке колбэков в achievementsSystem/missionSystem.
 */

import { logger } from "../utils/logger";
import type { Achievement } from "../achievements";
import type { Mission } from "../missionSystem";

export interface AchievementUnlockedDeps {
    hud?: { showAchievementNotification?: (name: string, desc: string, icon?: string, reward?: unknown) => void; showNotification?: (text: string, type: string) => void };
    soundManager?: { playReloadComplete?: () => void };
    playerProgression?: { addExperience: (amount: number, source: string) => void };
    achievementsSystem?: {
        getAchievementName: (a: Achievement) => string;
        getAchievementDescription: (a: Achievement) => string;
        claimReward: (id: string) => { type: string; amount?: number } | null;
    };
    getDifficultyRewardMultiplier: () => number;
}

export function handleAchievementUnlocked(achievement: Achievement, deps: AchievementUnlockedDeps): void {
    logger.log(`[Game] Achievement unlocked: ${achievement.name}`);

    if (deps.hud?.showAchievementNotification) {
        const name = deps.achievementsSystem?.getAchievementName(achievement) ?? achievement.name;
        const description = deps.achievementsSystem?.getAchievementDescription(achievement) ?? achievement.description;
        deps.hud.showAchievementNotification(name, description, achievement.icon, achievement.reward);
    } else if (deps.hud?.showNotification) {
        const name = deps.achievementsSystem?.getAchievementName(achievement) ?? achievement.name;
        deps.hud.showNotification(`🏆 ${name}`, "success");
    }

    if (deps.soundManager?.playReloadComplete) {
        deps.soundManager.playReloadComplete();
    }

    if (achievement.reward && deps.playerProgression && deps.achievementsSystem) {
        const reward = deps.achievementsSystem.claimReward(achievement.id);
        if (reward?.type === "experience" && reward.amount != null) {
            const diffMul = deps.getDifficultyRewardMultiplier();
            const xp = Math.round(reward.amount * diffMul);
            deps.playerProgression.addExperience(xp, "achievement");
            logger.debug(`[Game] Awarded ${xp} XP for achievement (base: ${reward.amount}, diffMul: ${diffMul})`);
        }
    }
}

export interface MissionCompleteDeps {
    hud?: { showNotification?: (text: string, type: string) => void };
    soundManager?: { playReloadComplete?: () => void };
    missionSystem?: {
        getName: (m: Mission) => string;
        claimReward: (id: string) => { type: string; amount?: number } | null;
    };
    playerProgression?: { addExperience: (amount: number, source: string) => void };
    currencyManager?: { addCurrency: (amount: number) => void };
    getDifficultyRewardMultiplier: () => number;
}

export function handleMissionComplete(mission: Mission, deps: MissionCompleteDeps): void {
    logger.log(`[Game] Mission completed: ${mission.name}`);

    if (deps.hud?.showNotification) {
        const name = deps.missionSystem?.getName(mission) ?? mission.name;
        deps.hud.showNotification(`📋 Миссия выполнена: ${name}`, "success");
    }

    if (deps.soundManager?.playReloadComplete) {
        deps.soundManager.playReloadComplete();
    }

    if (mission.reward && deps.missionSystem) {
        const reward = deps.missionSystem.claimReward(mission.id);
        if (reward?.type === "experience" && deps.playerProgression) {
            const diffMul = deps.getDifficultyRewardMultiplier();
            const xp = Math.round((reward.amount ?? 0) * diffMul);
            deps.playerProgression.addExperience(xp, "mission");
            logger.debug(`[Game] Awarded ${xp} XP for mission`);
        } else if (reward?.type === "credits" && deps.currencyManager && reward.amount != null) {
            deps.currencyManager.addCurrency(reward.amount);
            logger.log(`[Game] Awarded ${reward.amount} credits for mission`);
        }
    }
}
