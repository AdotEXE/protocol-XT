/**
 * Создание элемента уведомления о достижении (Rectangle с иконкой, названием, описанием, наградой).
 * Используется в hud.ts showAchievementNotification().
 */

import { Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { calculateTextBlockHeight } from "./textBlockHeight";

export interface AchievementReward {
    type: "experience" | "currency" | "unlock";
    amount?: number;
    unlockId?: string;
}

function formatRewardText(reward: AchievementReward): string {
    if (reward.type === "experience" && reward.amount != null) return `+${reward.amount} XP`;
    if (reward.type === "currency" && reward.amount != null) return `+${reward.amount} 💰`;
    if (reward.type === "unlock" && reward.unlockId) return `🔓 Разблокировано: ${reward.unlockId}`;
    return "";
}

/**
 * Создаёт Rectangle с содержимым уведомления о достижении.
 * Caller добавляет element в контейнер и настраивает анимацию появления/удаления.
 */
export function createAchievementNotificationElement(
    achievementName: string,
    description: string,
    icon: string,
    reward?: AchievementReward,
    name: string = "achievement_" + Date.now()
): Rectangle {
    const notification = new Rectangle(name);
    notification.width = "500px";
    notification.height = "100px";
    notification.cornerRadius = 8;
    notification.thickness = 3;
    notification.color = "#ffd700";
    notification.background = "rgba(20, 20, 0, 0.95)";
    notification.paddingTop = "8px";
    notification.paddingLeft = "10px";
    notification.paddingRight = "10px";
    notification.paddingBottom = "8px";

    const iconText = new TextBlock();
    iconText.text = icon;
    iconText.fontSize = "32px";
    iconText.width = "50px";
    iconText.height = "50px";
    iconText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    iconText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    iconText.left = "5px";
    iconText.top = "5px";
    notification.addControl(iconText);

    const nameText = new TextBlock();
    nameText.text = `🏆 ${achievementName}`;
    nameText.color = "#ffd700";
    nameText.fontSize = "14px";
    nameText.fontWeight = "bold";
    nameText.fontFamily = "monospace";
    nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    nameText.left = "60px";
    nameText.top = "5px";
    nameText.width = "420px";
    nameText.textWrapping = true;
    notification.addControl(nameText);

    const descText = new TextBlock();
    descText.text = description;
    descText.color = "#fff";
    descText.fontSize = "11px";
    descText.fontFamily = "monospace";
    descText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    descText.left = "60px";
    descText.top = "25px";
    descText.width = "420px";
    descText.textWrapping = true;
    notification.addControl(descText);

    const nameLines = Math.ceil((achievementName.length + 2) / 50);
    const descLines = Math.ceil(description.length / 60);
    const totalLines = nameLines + descLines;
    const calculatedHeight = calculateTextBlockHeight({
        lineCount: totalLines,
        lineHeight: 18,
        minHeight: 80,
        padding: 30
    });
    notification.height = `${calculatedHeight}px`;

    if (reward) {
        const rewardStr = formatRewardText(reward);
        if (rewardStr) {
            const rewardText = new TextBlock();
            rewardText.text = rewardStr;
            rewardText.color = "#0f0";
            rewardText.fontSize = "12px";
            rewardText.fontWeight = "bold";
            rewardText.fontFamily = "monospace";
            rewardText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            rewardText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            rewardText.left = "60px";
            rewardText.top = "50px";
            rewardText.width = "280px";
            notification.addControl(rewardText);
        }
    }

    notification.top = "20px";
    notification.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    notification.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    notification.left = "-20px";

    return notification;
}
