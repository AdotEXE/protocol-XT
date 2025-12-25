// ═══════════════════════════════════════════════════════════════════════════
// AUTH - Валидация Firebase токенов на сервере
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { UserRecord } from "firebase-admin/auth";
import * as path from "path";
import * as fs from "fs";

let adminApp: App | null = null;

/**
 * Инициализация Firebase Admin SDK
 * 
 * Поддерживает два способа:
 * 1. Загрузка из JSON файла (рекомендуется) - protocol-tx-firebase-adminsdk-*.json
 * 2. Загрузка из переменных окружения - FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
 */
export function initializeFirebaseAdmin(): boolean {
    try {
        // Проверяем, не инициализирован ли уже
        if (adminApp) {
            return true;
        }

        // Проверяем, не инициализирован ли уже (избегаем дублирования)
        const existingApps = getApps();
        if (existingApps.length > 0) {
            adminApp = existingApps[0] || null;
            // Firebase Admin already initialized
            return true;
        }

        // Способ 1: Попытка загрузить из JSON файла
        // Ищем JSON файл с любым private_key_id
        let serviceAccountPath: string | null = null;
        
        // Сначала проверяем конкретные имена файлов
        const jsonFiles = [
            "protocol-tx-firebase-adminsdk-fbsvc-f655d015b0.json", // Текущий файл
            "protocol-tx-firebase-adminsdk-fbsvc-9c20956c7d.json"  // Старый файл
        ];
        
        for (const fileName of jsonFiles) {
            const fullPath = path.join(process.cwd(), fileName);
            if (fs.existsSync(fullPath)) {
                serviceAccountPath = fullPath;
                break;
            }
        }
        
        // Если точное имя не найдено, ищем любой файл с паттерном
        if (!serviceAccountPath) {
            try {
                const files = fs.readdirSync(process.cwd());
                const matchingFile = files.find(f => f.startsWith("protocol-tx-firebase-adminsdk-") && f.endsWith(".json"));
                if (matchingFile) {
                    serviceAccountPath = path.join(process.cwd(), matchingFile);
                }
            } catch (error) {
                // Игнорируем ошибки чтения директории
            }
        }
        
        if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
            try {
                const serviceAccount = require(serviceAccountPath);
                
                adminApp = initializeApp({
                    credential: cert(serviceAccount)
                });

                console.log("[Auth] ✅ Firebase Admin initialized from service account JSON file");
                return true;
            } catch (error: any) {
                console.warn("[Auth] Failed to load from JSON file, trying environment variables:", error.message);
            }
        } else {
            // Service account JSON file not found, trying environment variables
        }

        // Способ 2: Загрузка из переменных окружения
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

        if (projectId && privateKey && clientEmail) {
            adminApp = initializeApp({
                credential: cert({
                    projectId,
                    privateKey,
                    clientEmail
                })
            });

            console.log("[Auth] ✅ Firebase Admin initialized from environment variables");
            return true;
        }

        // Если оба способа не сработали
        console.warn("[Auth] ⚠️ Firebase Admin credentials not found. Auth validation will be disabled.");
        console.warn("[Auth] Please either:");
        console.warn("[Auth]   1. Place service account JSON file at:", serviceAccountPath);
        console.warn("[Auth]   2. Or set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables");
        return false;
    } catch (error: any) {
        console.error("[Auth] ❌ Failed to initialize Firebase Admin:", error.message);
        return false;
    }
}

/**
 * Валидация Firebase ID токена
 * @param idToken - Firebase ID токен от клиента
 * @returns Decoded token или null если невалидный
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
    if (!adminApp) {
        console.warn("[Auth] Firebase Admin not initialized, skipping token verification");
        return null;
    }

    try {
        const auth = getAuth(adminApp);
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken;
    } catch (error: any) {
        console.error("[Auth] Token verification failed:", error.message);
        return null;
    }
}

/**
 * Получение информации о пользователе по UID
 */
export async function getUserById(uid: string): Promise<UserRecord | null> {
    if (!adminApp) {
        return null;
    }

    try {
        const auth = getAuth(adminApp);
        const user = await auth.getUser(uid);
        return user;
    } catch (error: any) {
        console.error("[Auth] Failed to get user:", error.message);
        return null;
    }
}

