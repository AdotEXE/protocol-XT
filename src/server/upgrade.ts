/**
 * @module server/upgrade
 * @description API для системы прокачки
 * 
 * Endpoints:
 * - POST /api/upgrade/sync - Синхронизация прокачки с сервером
 * - GET /api/upgrade/load - Загрузка прокачки с сервера
 * - POST /api/upgrade/reward - Начисление наград (XP, кредиты)
 */

import * as http from "http";
import { serverLogger } from "./logger";

// ============================================
// ТИПЫ
// ============================================

interface ElementUpgrade {
    elementId: string;
    level: number;
    currentXp: number;
}

interface PlayerUpgrades {
    cannons: Record<string, ElementUpgrade>;
    chassis: Record<string, ElementUpgrade>;
    tracks: Record<string, ElementUpgrade>;
    modules: Record<string, ElementUpgrade>;
    totalXp: number;
    credits: number;
    playerLevel: number;
    lastSyncTime?: number;
}

interface PlayerUpgradeData {
    playerId: string;
    upgrades: PlayerUpgrades;
    createdAt: number;
    updatedAt: number;
}

// ============================================
// ХРАНИЛИЩЕ (In-Memory для разработки)
// В продакшене заменить на MongoDB
// ============================================

class UpgradeStorage {
    private data: Map<string, PlayerUpgradeData> = new Map();

    /**
     * Получить данные игрока
     */
    get(playerId: string): PlayerUpgradeData | null {
        return this.data.get(playerId) || null;
    }

    /**
     * Сохранить данные игрока
     */
    set(playerId: string, upgrades: PlayerUpgrades): PlayerUpgradeData {
        const existing = this.data.get(playerId);
        const now = Date.now();
        
        const data: PlayerUpgradeData = {
            playerId,
            upgrades: {
                ...upgrades,
                lastSyncTime: now
            },
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        
        this.data.set(playerId, data);
        serverLogger.log(`[Upgrade] Saved data for player ${playerId}`);
        return data;
    }

    /**
     * Удалить данные игрока
     */
    delete(playerId: string): boolean {
        return this.data.delete(playerId);
    }

    /**
     * Получить все данные (для отладки)
     */
    getAll(): PlayerUpgradeData[] {
        return Array.from(this.data.values());
    }

    /**
     * Получить статистику
     */
    getStats(): { totalPlayers: number; totalXp: number; totalCredits: number } {
        let totalXp = 0;
        let totalCredits = 0;
        
        for (const data of this.data.values()) {
            totalXp += data.upgrades.totalXp;
            totalCredits += data.upgrades.credits;
        }
        
        return {
            totalPlayers: this.data.size,
            totalXp,
            totalCredits
        };
    }
}

// Глобальное хранилище
const upgradeStorage = new UpgradeStorage();

// ============================================
// ОБРАБОТЧИКИ ЗАПРОСОВ
// ============================================

/**
 * Парсинг тела JSON запроса
 */
async function parseJsonBody<T>(req: http.IncomingMessage): Promise<T | null> {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            // Лимит размера тела (1MB)
            if (body.length > 1024 * 1024) {
                resolve(null);
            }
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

/**
 * Отправить JSON ответ
 */
function sendJson(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

/**
 * Обработать /api/upgrade/sync (POST)
 */
async function handleSync(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await parseJsonBody<{ playerId: string; upgrades: PlayerUpgrades }>(req);
    
    if (!body || !body.playerId || !body.upgrades) {
        sendJson(res, 400, { error: 'Invalid request body' });
        return;
    }
    
    try {
        const data = upgradeStorage.set(body.playerId, body.upgrades);
        sendJson(res, 200, { 
            success: true, 
            lastSyncTime: data.updatedAt 
        });
    } catch (error) {
        serverLogger.error('[Upgrade] Sync error:', error);
        sendJson(res, 500, { error: 'Internal server error' });
    }
}

/**
 * Обработать /api/upgrade/load (GET)
 */
function handleLoad(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const playerId = url.searchParams.get('playerId');
    
    if (!playerId) {
        sendJson(res, 400, { error: 'Missing playerId parameter' });
        return;
    }
    
    const data = upgradeStorage.get(playerId);
    
    if (!data) {
        sendJson(res, 404, { error: 'Player not found' });
        return;
    }
    
    sendJson(res, 200, {
        success: true,
        upgrades: data.upgrades
    });
}

/**
 * Обработать /api/upgrade/reward (POST)
 */
async function handleReward(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await parseJsonBody<{ 
        playerId: string; 
        xp?: number; 
        credits?: number;
        source?: string;
    }>(req);
    
    if (!body || !body.playerId) {
        sendJson(res, 400, { error: 'Invalid request body' });
        return;
    }
    
    try {
        let data = upgradeStorage.get(body.playerId);
        
        // Создаем запись если не существует
        if (!data) {
            data = upgradeStorage.set(body.playerId, {
                cannons: {},
                chassis: {},
                tracks: {},
                modules: {},
                totalXp: 0,
                credits: 1000,
                playerLevel: 1
            });
        }
        
        // Добавляем награды
        const upgrades = { ...data.upgrades };
        
        if (body.xp && body.xp > 0) {
            upgrades.totalXp += body.xp;
            upgrades.playerLevel = calculatePlayerLevel(upgrades.totalXp);
        }
        
        if (body.credits && body.credits > 0) {
            upgrades.credits += body.credits;
        }
        
        const updated = upgradeStorage.set(body.playerId, upgrades);
        
        sendJson(res, 200, {
            success: true,
            totalXp: updated.upgrades.totalXp,
            credits: updated.upgrades.credits,
            playerLevel: updated.upgrades.playerLevel
        });
    } catch (error) {
        serverLogger.error('[Upgrade] Reward error:', error);
        sendJson(res, 500, { error: 'Internal server error' });
    }
}

/**
 * Обработать /api/upgrade/stats (GET)
 */
function handleStats(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const stats = upgradeStorage.getStats();
    sendJson(res, 200, stats);
}

/**
 * Рассчитать уровень игрока по XP
 */
function calculatePlayerLevel(totalXp: number): number {
    let level = 1;
    let xpNeeded = 0;
    
    while (xpNeeded + level * 1000 <= totalXp) {
        xpNeeded += level * 1000;
        level++;
    }
    
    return level;
}

// ============================================
// ОСНОВНОЙ ОБРАБОТЧИК
// ============================================

/**
 * Обработать запрос к /api/upgrade/*
 */
export async function handleUpgradeRequest(
    req: http.IncomingMessage, 
    res: http.ServerResponse
): Promise<boolean> {
    const url = req.url || '';
    
    // Проверяем, что это наш endpoint
    if (!url.startsWith('/api/upgrade')) {
        return false;
    }
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return true;
    }
    
    // Роутинг
    try {
        if (url.startsWith('/api/upgrade/sync') && req.method === 'POST') {
            await handleSync(req, res);
            return true;
        }
        
        if (url.startsWith('/api/upgrade/load') && req.method === 'GET') {
            handleLoad(req, res);
            return true;
        }
        
        if (url.startsWith('/api/upgrade/reward') && req.method === 'POST') {
            await handleReward(req, res);
            return true;
        }
        
        if (url.startsWith('/api/upgrade/stats') && req.method === 'GET') {
            handleStats(req, res);
            return true;
        }
        
        // 404
        sendJson(res, 404, { error: 'Endpoint not found' });
        return true;
    } catch (error) {
        serverLogger.error('[Upgrade] Request error:', error);
        sendJson(res, 500, { error: 'Internal server error' });
        return true;
    }
}

// ============================================
// ЭКСПОРТ ДЛЯ ИНТЕГРАЦИИ
// ============================================

export { upgradeStorage };

