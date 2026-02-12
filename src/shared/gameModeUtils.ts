import type { GameMode } from "./types";

/**
 * Конвертация режима игры из клиентского формата в серверный
 * Клиент использует: "multiplayer_ffa", "multiplayer_tdm", "multiplayer_ctf", "multiplayer_br", "multiplayer_control", "multiplayer_escort", "singleplayer", "training"
 * Сервер использует: "ffa", "tdm", "coop", "battle_royale", "ctf", "control_point", "escort", "survival", "raid"
 */
export function convertClientModeToServerMode(clientMode: string): GameMode {
    const modeMap: Record<string, GameMode> = {
        // Multiplayer modes
        "multiplayer_ffa": "ffa",
        "multiplayer_tdm": "tdm",
        "multiplayer_ctf": "ctf",
        "multiplayer_br": "battle_royale",
        "multiplayer_control": "control_point",
        "multiplayer_escort": "escort",
        
        // Singleplayer/Coop modes
        "singleplayer": "coop", // Singleplayer uses coop mode on server (PvE)
        "coop": "coop",
        "training": "coop", // Training uses coop mode on server
        
        // Special modes
        "survival": "survival",
        "raid": "raid",
        
        // Legacy/fallback - если режим уже в серверном формате
        "ffa": "ffa",
        "tdm": "tdm",
        "ctf": "ctf",
        "battle_royale": "battle_royale",
        "control_point": "control_point",
        "escort": "escort"
    };
    
    const serverMode = modeMap[clientMode];
    if (!serverMode) {
        console.warn(`[GameModeUtils] Unknown client mode: ${clientMode}, defaulting to 'ffa'`);
        return "ffa";
    }
    
    return serverMode;
}

/**
 * Конвертация режима игры из серверного формата в клиентский
 */
export function convertServerModeToClientMode(serverMode: GameMode): string {
    const modeMap: Record<GameMode, string> = {
        "ffa": "multiplayer_ffa",
        "tdm": "multiplayer_tdm",
        "coop": "coop",
        "battle_royale": "multiplayer_br",
        "ctf": "multiplayer_ctf",
        "control_point": "multiplayer_control",
        "escort": "multiplayer_escort",
        "survival": "survival",
        "raid": "raid"
    };
    
    return modeMap[serverMode] || serverMode;
}

/**
 * Проверка, является ли режим мультиплеерным
 */
export function isMultiplayerMode(mode: string | GameMode): boolean {
    const multiplayerModes: string[] = [
        "multiplayer_ffa", "multiplayer_tdm", "multiplayer_ctf", "multiplayer_br",
        "multiplayer_control", "multiplayer_escort",
        "ffa", "tdm", "ctf", "battle_royale", "control_point", "escort"
    ];
    return multiplayerModes.includes(mode);
}

/**
 * Проверка, является ли режим командным
 */
export function isTeamBasedMode(mode: string | GameMode): boolean {
    const teamModes: string[] = [
        "multiplayer_tdm", "multiplayer_ctf", "multiplayer_control", "multiplayer_escort",
        "tdm", "ctf", "control_point", "escort",
        "coop", "survival", "raid"
    ];
    return teamModes.includes(mode);
}

/**
 * Получить читаемое название режима для отображения в UI
 */
export function getModeDisplayName(mode: string | GameMode): string {
    const displayNames: Record<string, string> = {
        // Server modes
        "ffa": "Все против всех",
        "tdm": "Командный бой",
        "coop": "Кооператив",
        "battle_royale": "Королевская битва",
        "ctf": "Захват флага",
        "control_point": "Контрольные точки",
        "escort": "Сопровождение",
        "survival": "Выживание",
        "raid": "Рейд",
        
        // Client modes
        "multiplayer_ffa": "Все против всех",
        "multiplayer_tdm": "Командный бой",
        "multiplayer_ctf": "Захват флага",
        "multiplayer_br": "Королевская битва",
        "multiplayer_control": "Контрольные точки",
        "multiplayer_escort": "Сопровождение",
        "singleplayer": "Одиночная игра",
        "training": "Тренировка"
    };
    
    return displayNames[mode] || String(mode).toUpperCase();
}
