// ═══════════════════════════════════════════════════════════════════════════
// AUTH - Валидация Firebase токенов на сервере
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { UserRecord } from "firebase-admin/auth";
import * as path from "path";
import * as fs from "fs";
import { serverLogger } from "./logger";

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
                serverLogger.log(`[Auth] Attempting to load service account from: ${serviceAccountPath}`);
                
                // Используем fs.readFileSync вместо require() для более надежной загрузки
                const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
                const serviceAccount = JSON.parse(fileContent);
                
                // Валидация структуры JSON
                if (!serviceAccount.type || serviceAccount.type !== 'service_account') {
                    throw new Error('Invalid service account file: missing or invalid "type" field');
                }
                if (!serviceAccount.project_id) {
                    throw new Error('Invalid service account file: missing "project_id" field');
                }
                if (!serviceAccount.private_key) {
                    throw new Error('Invalid service account file: missing "private_key" field');
                }
                if (!serviceAccount.client_email) {
                    throw new Error('Invalid service account file: missing "client_email" field');
                }
                
                serverLogger.log(`[Auth] Service account loaded: project_id=${serviceAccount.project_id}, client_email=${serviceAccount.client_email}`);
                
                adminApp = initializeApp({
                    credential: cert(serviceAccount)
                });

                serverLogger.log("[Auth] ✅ Firebase Admin initialized from service account JSON file");
                return true;
            } catch (error: any) {
                serverLogger.error("[Auth] ❌ Failed to load from JSON file:", error.message);
                if (error instanceof SyntaxError) {
                    serverLogger.error("[Auth] JSON parsing error - file may be corrupted or invalid");
                }
                serverLogger.warn("[Auth] Trying environment variables as fallback...");
            }
        } else {
            serverLogger.log("[Auth] Service account JSON file not found, trying environment variables...");
        }

        // Способ 2: Загрузка из переменных окружения
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

        // Проверяем наличие всех необходимых переменных
        if (!projectId) {
            serverLogger.warn("[Auth] FIREBASE_PROJECT_ID environment variable not set");
        }
        if (!privateKeyRaw) {
            serverLogger.warn("[Auth] FIREBASE_PRIVATE_KEY environment variable not set");
        }
        if (!clientEmail) {
            serverLogger.warn("[Auth] FIREBASE_CLIENT_EMAIL environment variable not set");
        }

        if (projectId && privateKeyRaw && clientEmail) {
            try {
                // Обрабатываем переносы строк в приватном ключе
                const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
                
                // Валидация приватного ключа
                if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
                    throw new Error('Invalid private key format: missing BEGIN/END markers');
                }
                
                serverLogger.log(`[Auth] Attempting to initialize with environment variables: project_id=${projectId}, client_email=${clientEmail}`);
                
                adminApp = initializeApp({
                    credential: cert({
                        projectId,
                        privateKey,
                        clientEmail
                    })
                });

                serverLogger.log("[Auth] ✅ Firebase Admin initialized from environment variables");
                return true;
            } catch (error: any) {
                serverLogger.error("[Auth] ❌ Failed to initialize from environment variables:", error.message);
                if (error.message.includes('private key')) {
                    serverLogger.error("[Auth] Check that FIREBASE_PRIVATE_KEY is properly formatted with \\n for newlines");
                }
            }
        }

        // Если оба способа не сработали
        serverLogger.warn("[Auth] ⚠️ Firebase Admin credentials not found. Auth validation will be disabled.");
        serverLogger.warn("[Auth] Please either:");
        serverLogger.warn("[Auth]   1. Place service account JSON file at:", serviceAccountPath);
        serverLogger.warn("[Auth]   2. Or set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables");
        return false;
    } catch (error: any) {
        serverLogger.error("[Auth] ❌ Failed to initialize Firebase Admin:", error.message);
        return false;
    }
}

/**
 * Валидация Firebase ID токена
 * @param idToken - Firebase ID токен от клиента
 * @returns Decoded token или null если невалидный
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
    // Проверяем инициализацию перед использованием
    if (!adminApp) {
        serverLogger.warn("[Auth] Firebase Admin not initialized, skipping token verification");
        return null;
    }

    // Проверяем, что токен не пустой
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
        serverLogger.warn("[Auth] Empty or invalid token provided");
        return null;
    }

    try {
        const auth = getAuth(adminApp);
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken;
    } catch (error: any) {
        // Более детальная обработка различных типов ошибок
        const errorCode = error?.code || 'unknown';
        const errorMessage = error?.message || 'Unknown error';
        
        if (errorCode === 'auth/argument-error') {
            serverLogger.error("[Auth] Token verification failed: Invalid token format");
        } else if (errorCode === 'auth/id-token-expired') {
            serverLogger.warn("[Auth] Token verification failed: Token expired");
        } else if (errorCode === 'auth/id-token-revoked') {
            serverLogger.warn("[Auth] Token verification failed: Token revoked");
        } else if (errorMessage.includes('api-keys-are-not-supported')) {
            serverLogger.error("[Auth] ❌ CRITICAL: Admin SDK not properly initialized - API keys are not supported");
            serverLogger.error("[Auth] This error indicates that Firebase Admin SDK is trying to use API keys instead of service account credentials");
            serverLogger.error("[Auth] Please check that service account JSON file or environment variables are correctly configured");
        } else {
            serverLogger.error(`[Auth] Token verification failed: ${errorMessage} (code: ${errorCode})`);
        }
        return null;
    }
}

/**
 * Получение информации о пользователе по UID
 */
export async function getUserById(uid: string): Promise<UserRecord | null> {
    // Проверяем инициализацию перед использованием
    if (!adminApp) {
        serverLogger.warn("[Auth] Firebase Admin not initialized, cannot get user");
        return null;
    }

    // Проверяем, что UID не пустой
    if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
        serverLogger.warn("[Auth] Empty or invalid UID provided");
        return null;
    }

    try {
        const auth = getAuth(adminApp);
        const user = await auth.getUser(uid);
        return user;
    } catch (error: any) {
        const errorCode = error?.code || 'unknown';
        const errorMessage = error?.message || 'Unknown error';
        
        if (errorCode === 'auth/user-not-found') {
            serverLogger.warn(`[Auth] User not found: ${uid}`);
        } else if (errorMessage.includes('api-keys-are-not-supported')) {
            serverLogger.error("[Auth] ❌ CRITICAL: Admin SDK not properly initialized - API keys are not supported");
            serverLogger.error("[Auth] Please check that service account JSON file or environment variables are correctly configured");
        } else {
            serverLogger.error(`[Auth] Failed to get user: ${errorMessage} (code: ${errorCode})`);
        }
        return null;
    }
}

