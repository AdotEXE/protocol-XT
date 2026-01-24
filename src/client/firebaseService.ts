import { FirebaseApp, initializeApp } from "firebase/app";
import {
    Auth,
    GoogleAuthProvider,
    User,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    getAuth,
    getIdToken,
    getRedirectResult,
    isSignInWithEmailLink,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    sendSignInLinkToEmail,
    signInAnonymously,
    signInWithEmailAndPassword,
    signInWithEmailLink,
    signInWithPopup,
    signInWithRedirect
} from "firebase/auth";
import {
    Firestore,
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    increment,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "firebase/firestore";

// Firebase configuration (should be in .env or config file)
// Используем реальную конфигурацию из документации, если переменные окружения не заданы
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBvTtaOb9NuWgwJJgQ0lhnyLDkoRpvhAAY",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "protocol-tx.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "protocol-tx",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "protocol-tx.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "513687323344",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:513687323344:web:bdcbda7d8aa142cac8d4d5",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-HP3TNXC04H"
};

/**
 * Validates Firebase API key format
 * Web API keys typically start with "AIza" for Google services
 */
function validateApiKeyFormat(apiKey: string): { valid: boolean; reason?: string } {
    if (!apiKey || apiKey.length < 20) {
        return { valid: false, reason: "API key is too short (minimum 20 characters)" };
    }
    if (apiKey === "demo-key") {
        return { valid: false, reason: "API key is a placeholder value" };
    }
    // Web API keys for Firebase typically start with "AIza"
    // But we allow other formats in case of custom keys
    if (apiKey.length > 200) {
        return { valid: false, reason: "API key is too long (maximum 200 characters)" };
    }
    return { valid: true };
}

/**
 * Validates complete Firebase configuration
 */
function validateFirebaseConfig(config: typeof firebaseConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
        errors.push("apiKey is missing");
    } else {
        const apiKeyValidation = validateApiKeyFormat(config.apiKey);
        if (!apiKeyValidation.valid) {
            errors.push(`apiKey: ${apiKeyValidation.reason}`);
        }
    }

    if (!config.authDomain) {
        errors.push("authDomain is missing");
    }

    if (!config.projectId || config.projectId === "demo-project") {
        errors.push("projectId is missing or invalid");
    }

    if (!config.storageBucket) {
        errors.push("storageBucket is missing");
    }

    if (!config.messagingSenderId) {
        errors.push("messagingSenderId is missing");
    }

    if (!config.appId) {
        errors.push("appId is missing");
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Masks API key for safe logging (shows first 10 and last 4 characters)
 */
function maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 15) {
        return "***";
    }
    return `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * Validates that the current domain is likely authorized in Firebase
 * This is a pre-flight check that provides warnings but doesn't block initialization
 */
function validateDomain(authDomain: string): { valid: boolean; warning?: string } {
    if (typeof window === 'undefined') {
        return { valid: true }; // Server-side, skip validation
    }

    const currentHost = window.location.hostname;
    const authDomainHost = authDomain.replace(/^https?:\/\//, '').split('/')[0] || '';

    // Check if current domain matches auth domain or is localhost
    if (currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost.startsWith('192.168.')) {
        return { valid: true }; // Local development, always valid
    }

    // Check if current domain is a subdomain of auth domain or vice versa
    if (authDomainHost && (currentHost === authDomainHost ||
        currentHost.endsWith('.' + authDomainHost) ||
        authDomainHost.endsWith('.' + currentHost))) {
        return { valid: true };
    }

    // If domains don't match, provide a warning
    return {
        valid: true, // Don't block, but warn
        warning: `Current domain (${currentHost}) may not match Firebase auth domain (${authDomainHost}). Ensure ${currentHost} is added to authorized domains in Firebase Console.`
    };
}

/**
 * Pre-flight check for Identity Toolkit API availability
 * This function provides helpful warnings but doesn't actually test the API
 * (testing would require making a request which could fail)
 */
function checkIdentityToolkitAPIWarnings(projectId: string, apiKey: string): string[] {
    const warnings: string[] = [];

    // Check if API key format suggests it might be restricted
    if (apiKey && apiKey.length > 0) {
        warnings.push(`To use Firebase Authentication, ensure:`);
        warnings.push(`1. Identity Toolkit API is enabled for project: ${projectId}`);
        warnings.push(`   Link: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=${projectId}`);
        warnings.push(`2. API key (${maskApiKey(apiKey)}) has Identity Toolkit API enabled`);
        warnings.push(`   Link: https://console.cloud.google.com/apis/credentials?project=${projectId}`);
    }

    return warnings;
}

// Validate configuration
const configValidation = validateFirebaseConfig(firebaseConfig);
const hasRealConfig = configValidation.valid &&
    firebaseConfig.apiKey !== "demo-key" &&
    firebaseConfig.projectId !== "demo-project";

if (!hasRealConfig) {
    // console.warn("[Firebase] ⚠️ Invalid or missing Firebase configuration!");
    // if (configValidation.errors.length > 0) {
    //     console.warn("[Firebase] Configuration errors:");
    //     configValidation.errors.forEach(error => {
    //         console.warn(`[Firebase]   - ${error}`);
    //     });
    // }
    // console.warn("[Firebase] Please set the following environment variables:");
    // console.warn("[Firebase]   - VITE_FIREBASE_API_KEY");
    // console.warn("[Firebase]   - VITE_FIREBASE_AUTH_DOMAIN");
    // console.warn("[Firebase]   - VITE_FIREBASE_PROJECT_ID");
    // console.warn("[Firebase]   - VITE_FIREBASE_STORAGE_BUCKET");
    // console.warn("[Firebase]   - VITE_FIREBASE_MESSAGING_SENDER_ID");
    // console.warn("[Firebase]   - VITE_FIREBASE_APP_ID");
    // console.warn("[Firebase] See docs/FIREBASE_KEYS_EXPLAINED.md for details");
} else if (import.meta.env.DEV) {
    // console.log("[Firebase] ✅ Configuration loaded", {
    //     apiKey: maskApiKey(firebaseConfig.apiKey),
    //     projectId: firebaseConfig.projectId,
    //     authDomain: firebaseConfig.authDomain
    // });
}

export interface PlayerStats {
    // Basic stats
    kills: number;
    deaths: number;
    assists: number;
    wins: number;
    losses: number;
    draws: number;

    // Combat stats
    damageDealt: number;
    damageTaken: number;
    shotsFired: number;
    shotsHit: number;
    headshots: number;

    // Gameplay stats
    timePlayed: number; // in seconds
    matchesPlayed: number;
    longestKillStreak: number;
    currentKillStreak: number;

    // Mode-specific stats
    ffaWins: number;
    tdmWins: number;
    coopWins: number;
    brWins: number;
    ctfWins: number;

    // Last updated
    lastUpdated: Timestamp;
}

export interface PlayerProgression {
    level: number;
    experience: number;
    experienceToNextLevel: number;
    totalExperience: number;
    skillRating: number; // For matchmaking
    rank: string; // "Bronze", "Silver", "Gold", etc.
}

export interface PlayerInventory {
    chassis: string[];
    cannons: string[];
    modules: string[];
    currency: number;
    premiumCurrency: number;
}

export interface MatchHistory {
    matchId: string;
    mode: string;
    result: "win" | "loss" | "draw";
    kills: number;
    deaths: number;
    assists: number;
    damageDealt: number;
    damageTaken: number;
    duration: number; // in seconds
    timestamp: Timestamp;
    players: number;
    team?: string;
}

// Агрегированные метрики по списку матчей для баланс/телеметрии
export interface MatchHistorySummary {
    matches: number;
    totalTime: number;          // seconds
    avgMatchTime: number;       // seconds
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgDamageDealt: number;
    avgDamageTaken: number;
    avgKDR: number;
    winRate: number;            // 0-1
    byMode: Record<string, {
        matches: number;
        winRate: number;
        avgKills: number;
        avgDamageDealt: number;
        avgDamageTaken: number;
    }>;
}

/**
 * Подсчёт агрегированных метрик по списку матчей.
 * Удобно вызывать из дев-консоли или отладочных панелей.
 */
export function computeMatchHistorySummary(matches: MatchHistory[]): MatchHistorySummary {
    const total = matches.length;
    if (total === 0) {
        return {
            matches: 0,
            totalTime: 0,
            avgMatchTime: 0,
            avgKills: 0,
            avgDeaths: 0,
            avgAssists: 0,
            avgDamageDealt: 0,
            avgDamageTaken: 0,
            avgKDR: 0,
            winRate: 0,
            byMode: {}
        };
    }

    let timeSum = 0;
    let killsSum = 0;
    let deathsSum = 0;
    let assistsSum = 0;
    let dmgDealtSum = 0;
    let dmgTakenSum = 0;
    let wins = 0;

    const modeStats: Record<string, {
        matches: number;
        wins: number;
        kills: number;
        damageDealt: number;
        damageTaken: number;
    }> = {};

    for (const m of matches) {
        timeSum += m.duration;
        killsSum += m.kills;
        deathsSum += m.deaths;
        assistsSum += m.assists;
        dmgDealtSum += m.damageDealt;
        dmgTakenSum += m.damageTaken;
        if (m.result === "win") wins++;

        const modeKey = m.mode || "unknown";
        if (!modeStats[modeKey]) {
            modeStats[modeKey] = { matches: 0, wins: 0, kills: 0, damageDealt: 0, damageTaken: 0 };
        }
        const s = modeStats[modeKey];
        s.matches++;
        if (m.result === "win") s.wins++;
        s.kills += m.kills;
        s.damageDealt += m.damageDealt;
        s.damageTaken += m.damageTaken;
    }

    const avgKills = killsSum / total;
    const avgDeaths = deathsSum / total;
    const avgKDR = deathsSum > 0 ? killsSum / deathsSum : killsSum;
    const avgDamageDealt = dmgDealtSum / total;
    const avgDamageTaken = dmgTakenSum / total;

    const byMode: MatchHistorySummary["byMode"] = {};
    for (const [mode, s] of Object.entries(modeStats)) {
        byMode[mode] = {
            matches: s.matches,
            winRate: s.matches > 0 ? s.wins / s.matches : 0,
            avgKills: s.matches > 0 ? s.kills / s.matches : 0,
            avgDamageDealt: s.matches > 0 ? s.damageDealt / s.matches : 0,
            avgDamageTaken: s.matches > 0 ? s.damageTaken / s.matches : 0
        };
    }

    return {
        matches: total,
        totalTime: timeSum,
        avgMatchTime: timeSum / total,
        avgKills,
        avgDeaths,
        avgAssists: assistsSum / total,
        avgDamageDealt,
        avgDamageTaken,
        avgKDR,
        winRate: wins / total,
        byMode
    };
}

export interface UserData {
    username: string;
    email: string;
    emailVerified: boolean;
    createdAt: Timestamp;
    lastLogin: Timestamp;
}

export class FirebaseService {
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;
    private auth: Auth | null = null;
    private currentUser: User | null = null;
    private initialized: boolean = false;
    private authenticated: boolean = false; // Separate flag for authentication status

    async initialize(): Promise<boolean> {
        // Guard against multiple initialization
        if (this.initialized) {
            // console.log("[Firebase] Already initialized, skipping...");
            return this.authenticated;
        }

        // Pre-flight configuration check
        const configValidation = validateFirebaseConfig(firebaseConfig);
        if (!configValidation.valid) {
            // console.warn("[Firebase] ⚠️ Skipping initialization - invalid configuration");
            // console.warn("[Firebase] Configuration errors:");
            // configValidation.errors.forEach(error => {
            //     console.warn(`[Firebase]   - ${error}`);
            // });
            // console.warn("[Firebase] Firebase features will be disabled. Please configure Firebase to enable cloud features.");
            this.initialized = false;
            this.authenticated = false;
            return false;
        }

        // Validate API key format before attempting connection
        const apiKeyValidation = validateApiKeyFormat(firebaseConfig.apiKey);
        if (!apiKeyValidation.valid) {
            console.error("[Firebase] ❌ Invalid API key format:", apiKeyValidation.reason);
            console.error("[Firebase] API key:", maskApiKey(firebaseConfig.apiKey));
            console.error("[Firebase] Please check your VITE_FIREBASE_API_KEY in .env file");
            this.initialized = false;
            this.authenticated = false;
            return false;
        }

        // Validate domain configuration
        const domainValidation = validateDomain(firebaseConfig.authDomain);
        if (domainValidation.warning) {
            console.warn("[Firebase] ⚠️ Domain validation warning:", domainValidation.warning);
        }

        // Pre-flight warnings for Identity Toolkit API
        if (import.meta.env.DEV) {
            const apiWarnings = checkIdentityToolkitAPIWarnings(firebaseConfig.projectId, firebaseConfig.apiKey);
            if (apiWarnings.length > 0) {
                // console.log("[Firebase] ℹ️ Identity Toolkit API requirements:");
                // apiWarnings.forEach(warning => console.log(`[Firebase]   ${warning}`));
            }
        }

        try {
            // console.log("[Firebase] Initializing...", {
            //     apiKey: maskApiKey(firebaseConfig.apiKey),
            //     projectId: firebaseConfig.projectId,
            //     authDomain: firebaseConfig.authDomain
            // });

            this.app = initializeApp(firebaseConfig);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);

            // console.log("[Firebase] Firebase app initialized, waiting for auth state...");

            // Wait for auth state
            let resolved = false;
            return new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(this.auth!, async (user) => {
                    this.currentUser = user;
                    if (user) {
                        // console.log("[Firebase] Authenticated as:", user.uid, user.isAnonymous ? "(anonymous)" : "");
                        // Update last login (only for non-anonymous users or if user doc exists)
                        if (!user.isAnonymous) {
                            await this.updateLastLogin();
                        }
                        this.initialized = true;
                        this.authenticated = true;
                        if (!resolved) {
                            resolved = true;
                            unsubscribe(); // Stop listening after first resolution
                            resolve(true);
                        }
                    } else {
                        // console.log("[Firebase] No user authenticated, signing in anonymously...");
                        // Auto sign in anonymously for basic functionality
                        try {
                            const result = await this.signInAnonymously();
                            if (result.success) {
                                this.initialized = true;
                                this.authenticated = true;
                                if (!resolved) {
                                    resolved = true;
                                    unsubscribe(); // Stop listening after first resolution
                                    resolve(true);
                                }
                            } else {
                                // console.error("[Firebase] Failed to sign in anonymously:", result.error);
                                // Continue anyway - some features may not work
                                // App can run in offline mode
                                this.initialized = true;
                                this.authenticated = false;
                                // console.warn("[Firebase] ⚠️ Running in offline mode - Firebase features disabled");
                                if (!resolved) {
                                    resolved = true;
                                    unsubscribe();
                                    resolve(true);
                                }
                            }
                        } catch (error: any) {
                            // Enhanced error diagnostics
                            const errorCode = error?.code || 'unknown';
                            const errorMessage = error?.message || 'Unknown error';
                            const errorResponse = error?.response || error?.serverResponse || null;

                            // Log full error details for debugging
                            console.error("[Firebase] ❌ Authentication error details:", {
                                code: errorCode,
                                message: errorMessage,
                                apiKey: maskApiKey(firebaseConfig.apiKey),
                                projectId: firebaseConfig.projectId,
                                origin: window.location.origin,
                                hasResponse: !!errorResponse
                            });

                            if (errorResponse) {
                                console.error("[Firebase] Error response:", errorResponse);
                            }

                            // УЛУЧШЕНО: Обработка ошибки блокировки Identity Toolkit API
                            if (errorCode === 'auth/requests-to-this-api-identitytoolkit-method-google.cloud.identitytoolkit.v1.projectconfigservice.getprojectconfig-are-blocked' ||
                                errorMessage.includes('identitytoolkit') && errorMessage.includes('blocked')) {
                                console.error("[Firebase] ❌ Identity Toolkit API is blocked!");
                                console.error("[Firebase] Error Code:", errorCode);
                                console.error("[Firebase] Project ID:", firebaseConfig.projectId);
                                console.error("[Firebase] API Key:", maskApiKey(firebaseConfig.apiKey));
                                console.error("[Firebase] Current Origin:", window.location.origin);
                                console.error("[Firebase]");
                                console.error("[Firebase] To fix this error:");
                                console.error("[Firebase]   1. Go to: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com");
                                console.error("[Firebase]   2. Select your project:", firebaseConfig.projectId);
                                console.error("[Firebase]   3. Click 'Enable' button");
                                console.error("[Firebase]   4. Check API key restrictions:");
                                console.error("[Firebase]      - Go to: https://console.cloud.google.com/apis/credentials");
                                console.error("[Firebase]      - Find your API key:", maskApiKey(firebaseConfig.apiKey));
                                console.error("[Firebase]      - Ensure 'Identity Toolkit API' is allowed in API restrictions");
                                console.error("[Firebase]   5. Check domain authorization:");
                                console.error("[Firebase]      - Go to: https://console.firebase.google.com/project/" + firebaseConfig.projectId + "/authentication/settings");
                                console.error("[Firebase]      - Verify", window.location.hostname, "is in authorized domains");
                                console.error("[Firebase]");
                                console.error("[Firebase] See docs/FIREBASE_IDENTITY_TOOLKIT_FIX.md for detailed instructions");
                            } else if (errorCode === 'auth/api-key-not-valid' || errorCode.includes('api-key') || errorMessage.includes('API key')) {
                                console.error("[Firebase] ❌ Invalid API key!");
                                console.error("[Firebase] API key used:", maskApiKey(firebaseConfig.apiKey));
                                console.error("[Firebase] Project ID:", firebaseConfig.projectId);
                                console.error("[Firebase] Please check your VITE_FIREBASE_API_KEY in .env file");
                                console.error("[Firebase] Verify API key restrictions in Google Cloud Console:");
                                console.error("[Firebase]   APIs & Services → Credentials → [Your API Key] → API restrictions");
                                console.error("[Firebase] See docs/FIREBASE_KEYS_EXPLAINED.md for setup instructions");
                            } else if (errorCode === 'auth/operation-not-allowed') {
                                console.error("[Firebase] ❌ Anonymous authentication is not enabled!");
                                console.error("[Firebase] Project ID:", firebaseConfig.projectId);
                                console.error("[Firebase] Please enable it in Firebase Console:");
                                console.error("[Firebase]   Authentication → Sign-in method → Anonymous → Enable");
                                console.error("[Firebase]   Direct link: https://console.firebase.google.com/project/" + firebaseConfig.projectId + "/authentication/providers");
                            } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                                // Handle 401 Unauthorized specifically
                                console.error("[Firebase] ❌ 401 Unauthorized - Authentication failed");
                                console.error("[Firebase] Project ID:", firebaseConfig.projectId);
                                console.error("[Firebase] API Key:", maskApiKey(firebaseConfig.apiKey));
                                console.error("[Firebase] Current Origin:", window.location.origin);
                                console.error("[Firebase] Possible causes:");
                                console.error("[Firebase]   1. Invalid API key - Check VITE_FIREBASE_API_KEY");
                                console.error("[Firebase]   2. API key restrictions - Check Google Cloud Console → APIs & Services → Credentials");
                                console.error("[Firebase]   3. Identity Toolkit API not enabled - Enable at https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com");
                                console.error("[Firebase]   4. Anonymous auth disabled - Enable in Firebase Console → Authentication → Sign-in method");
                                console.error("[Firebase]   5. Domain not authorized - Check Firebase Console → Authentication → Settings → Authorized domains");
                            } else {
                                console.error("[Firebase] Failed to sign in anonymously:", errorMessage);
                                console.error("[Firebase] Error Code:", errorCode);
                                console.error("[Firebase] Project ID:", firebaseConfig.projectId);
                            }

                            // Continue anyway - some features may not work
                            // App can run in offline mode
                            this.initialized = true;
                            this.authenticated = false;
                            // console.warn("[Firebase] ⚠️ Running in offline mode - Firebase features disabled");
                            if (!resolved) {
                                resolved = true;
                                unsubscribe();
                                resolve(true);
                            }
                        }
                    }
                });
            });
        } catch (error: any) {
            // Enhanced error diagnostics
            const errorCode = error?.code || 'unknown';
            const errorMessage = error?.message || 'Unknown error';
            const errorResponse = error?.response || error?.serverResponse || null;

            console.error("[Firebase] ❌ Initialization error:", errorMessage);
            console.error("[Firebase] Error details:", {
                code: errorCode,
                message: errorMessage,
                apiKey: maskApiKey(firebaseConfig.apiKey),
                projectId: firebaseConfig.projectId,
                origin: window.location.origin,
                hasResponse: !!errorResponse
            });

            if (errorResponse) {
                console.error("[Firebase] Error response:", errorResponse);
            }

            // Check for Identity Toolkit API error
            if (errorCode === 'auth/requests-to-this-api-identitytoolkit-method-google.cloud.identitytoolkit.v1.projectconfigservice.getprojectconfig-are-blocked' ||
                (errorMessage.includes('identitytoolkit') && errorMessage.includes('blocked'))) {
                console.error("[Firebase] ❌ Identity Toolkit API is blocked!");
                console.error("[Firebase] See docs/FIREBASE_IDENTITY_TOOLKIT_FIX.md for detailed fix instructions");
            }

            if (errorCode.includes('api-key') || errorMessage.includes('api-key')) {
                console.error("[Firebase] Invalid API key. Please check your Firebase configuration.");
                console.error("[Firebase] API key used:", maskApiKey(firebaseConfig.apiKey));
                console.error("[Firebase] See docs/FIREBASE_KEYS_EXPLAINED.md for setup instructions");
            }

            this.initialized = false;
            this.authenticated = false;
            return false;
        }
    }

    /**
     * Анонимный вход в Firebase
     * Используется автоматически при инициализации, если пользователь не авторизован
     */
    async signInAnonymously(): Promise<{ success: boolean; error?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        // Pre-flight configuration check
        const configValidation = validateFirebaseConfig(firebaseConfig);
        if (!configValidation.valid) {
            const errorMsg = `Invalid Firebase configuration: ${configValidation.errors.join(', ')}`;
            // console.error("[Firebase] ❌", errorMsg);
            return { success: false, error: errorMsg };
        }

        // Validate API key format
        const apiKeyValidation = validateApiKeyFormat(firebaseConfig.apiKey);
        if (!apiKeyValidation.valid) {
            const errorMsg = `Invalid API key format: ${apiKeyValidation.reason}`;
            // console.error("[Firebase] ❌", errorMsg);
            // console.error("[Firebase] API key:", maskApiKey(firebaseConfig.apiKey));
            return { success: false, error: errorMsg };
        }

        try {
            const userCredential = await signInAnonymously(this.auth);
            this.currentUser = userCredential.user;
            this.authenticated = true;
            // console.log("[Firebase] ✅ Signed in anonymously:", userCredential.user.uid);
            return { success: true };
        } catch (error: any) {
            // Enhanced error diagnostics - capture full error details
            const errorCode = error?.code || 'unknown';
            const errorMessage = error?.message || 'Unknown error';
            const errorResponse = error?.response || error?.serverResponse || null;

            // Log detailed error information
            console.error("[Firebase] ❌ Anonymous sign in error details:", {
                code: errorCode,
                message: errorMessage,
                apiKey: maskApiKey(firebaseConfig.apiKey),
                projectId: firebaseConfig.projectId,
                origin: window.location.origin,
                hasResponse: !!errorResponse
            });

            if (errorResponse) {
                console.error("[Firebase] Error response:", errorResponse);
            }

            let userFriendlyError = errorMessage;
            let troubleshootingSteps: string[] = [];

            // УЛУЧШЕНО: Обработка ошибки блокировки Identity Toolkit API
            if (errorCode === 'auth/requests-to-this-api-identitytoolkit-method-google.cloud.identitytoolkit.v1.projectconfigservice.getprojectconfig-are-blocked' ||
                errorMessage.includes('identitytoolkit') && errorMessage.includes('blocked')) {
                userFriendlyError = "Identity Toolkit API is blocked. Enable it in Google Cloud Console.";
                troubleshootingSteps = [
                    `Project ID: ${firebaseConfig.projectId}`,
                    `API Key: ${maskApiKey(firebaseConfig.apiKey)}`,
                    `Current Origin: ${window.location.origin}`,
                    "",
                    "To fix:",
                    "1. Go to: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com",
                    `2. Select your project: ${firebaseConfig.projectId}`,
                    "3. Click 'Enable' button",
                    "4. Check API key restrictions:",
                    "   - Go to: https://console.cloud.google.com/apis/credentials",
                    `   - Find your API key: ${maskApiKey(firebaseConfig.apiKey)}`,
                    "   - Ensure 'Identity Toolkit API' is allowed in API restrictions",
                    "5. Check domain authorization:",
                    `   - Go to: https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`,
                    `   - Verify ${window.location.hostname} is in authorized domains`,
                    "",
                    "See docs/FIREBASE_IDENTITY_TOOLKIT_FIX.md for detailed instructions"
                ];
            } else if (errorCode === 'auth/api-key-not-valid' || errorCode.includes('api-key') || errorMessage.includes('API key')) {
                userFriendlyError = "Invalid API key. Please check your VITE_FIREBASE_API_KEY in .env file.";
                troubleshootingSteps = [
                    `API key used: ${maskApiKey(firebaseConfig.apiKey)}`,
                    `Project ID: ${firebaseConfig.projectId}`,
                    "1. Verify API key in Firebase Console → Project Settings → General",
                    "2. Check API key restrictions in Google Cloud Console → APIs & Services → Credentials",
                    "3. Ensure Identity Toolkit API is enabled for this API key",
                    "4. See docs/FIREBASE_KEYS_EXPLAINED.md for setup instructions"
                ];
            } else if (errorCode === 'auth/operation-not-allowed') {
                userFriendlyError = "Anonymous authentication is not enabled.";
                troubleshootingSteps = [
                    `Project ID: ${firebaseConfig.projectId}`,
                    "1. Go to Firebase Console → Authentication → Sign-in method",
                    `   Direct link: https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`,
                    "2. Find 'Anonymous' in the list",
                    "3. Click 'Enable'"
                ];
            } else if (errorCode === 'auth/network-request-failed') {
                userFriendlyError = "Network error. Please check your internet connection.";
            } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                // Handle 401 Unauthorized specifically
                userFriendlyError = "401 Unauthorized - Authentication failed. Check API key and Firebase settings.";
                troubleshootingSteps = [
                    `Project ID: ${firebaseConfig.projectId}`,
                    `API Key: ${maskApiKey(firebaseConfig.apiKey)}`,
                    `Current Origin: ${window.location.origin}`,
                    "",
                    "Possible causes:",
                    "1. Invalid API key - Check VITE_FIREBASE_API_KEY in .env file",
                    "2. API key restrictions - Check Google Cloud Console → APIs & Services → Credentials",
                    "3. Identity Toolkit API not enabled - Enable at https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com",
                    "4. Anonymous auth disabled - Enable in Firebase Console → Authentication → Sign-in method",
                    "5. Domain not authorized - Check Firebase Console → Authentication → Settings → Authorized domains"
                ];
            }

            // Log troubleshooting steps
            if (troubleshootingSteps.length > 0) {
                console.error("[Firebase] Troubleshooting steps:");
                troubleshootingSteps.forEach(step => {
                    console.error(`[Firebase]   ${step}`);
                });
            }

            console.error("[Firebase] ❌ Anonymous sign in error:", userFriendlyError);
            this.authenticated = false;
            return { success: false, error: userFriendlyError };
        }
    }

    async signOut(): Promise<void> {
        if (this.auth) {
            await firebaseSignOut(this.auth);
            this.currentUser = null;
            this.authenticated = false;
        }
    }

    getUserId(): string | null {
        return this.currentUser?.uid || null;
    }

    isInitialized(): boolean {
        return this.initialized && this.auth !== null && this.db !== null;
    }

    /**
     * Check if Firebase authentication was successful (including anonymous)
     * Returns true if user is authenticated (anonymous or full auth)
     * Use isAuthenticated() to check for full (non-anonymous) authentication
     */
    hasAuthenticated(): boolean {
        return this.authenticated && this.currentUser !== null;
    }

    /**
     * Get authentication status details
     */
    getAuthStatus(): { initialized: boolean; authenticated: boolean; hasUser: boolean; isAnonymous: boolean } {
        return {
            initialized: this.initialized,
            authenticated: this.authenticated,
            hasUser: this.currentUser !== null,
            isAnonymous: this.currentUser?.isAnonymous || false
        };
    }

    // === PLAYER STATS ===

    async getPlayerStats(playerId?: string): Promise<PlayerStats | null> {
        if (!this.db) return null;
        const id = playerId || this.getUserId();
        if (!id) return null;

        try {
            const docRef = doc(this.db, "players", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as PlayerStats;
            }

            // Return default stats if not found
            return this.getDefaultStats();
        } catch (error) {
            console.error("[Firebase] Error getting player stats:", error);
            return null;
        }
    }

    async updatePlayerStats(updates: Partial<PlayerStats>): Promise<boolean> {
        if (!this.db) return false;
        const userId = this.getUserId();
        if (!userId) return false;

        try {
            const docRef = doc(this.db, "players", userId);
            const stats = await this.getPlayerStats();

            if (!stats) {
                // Create new stats document
                await setDoc(docRef, {
                    ...this.getDefaultStats(),
                    ...updates,
                    lastUpdated: serverTimestamp()
                });
            } else {
                // Update existing stats
                await updateDoc(docRef, {
                    ...updates,
                    lastUpdated: serverTimestamp()
                });
            }

            return true;
        } catch (error) {
            console.error("[Firebase] Error updating player stats:", error);
            return false;
        }
    }

    async incrementStat(statName: keyof PlayerStats, amount: number = 1): Promise<boolean> {
        if (!this.db) return false;
        const userId = this.getUserId();
        if (!userId) return false;

        try {
            const docRef = doc(this.db, "players", userId);
            await updateDoc(docRef, {
                [statName]: increment(amount),
                lastUpdated: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("[Firebase] Error incrementing stat:", error);
            return false;
        }
    }

    private getDefaultStats(): PlayerStats {
        return {
            kills: 0,
            deaths: 0,
            assists: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            damageDealt: 0,
            damageTaken: 0,
            shotsFired: 0,
            shotsHit: 0,
            headshots: 0,
            timePlayed: 0,
            matchesPlayed: 0,
            longestKillStreak: 0,
            currentKillStreak: 0,
            ffaWins: 0,
            tdmWins: 0,
            coopWins: 0,
            brWins: 0,
            ctfWins: 0,
            lastUpdated: Timestamp.now()
        };
    }

    // === PLAYER PROGRESSION ===

    async getPlayerProgression(playerId?: string): Promise<PlayerProgression | null> {
        if (!this.db) return null;
        const id = playerId || this.getUserId();
        if (!id) return null;

        try {
            const docRef = doc(this.db, "progression", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as PlayerProgression;
            }

            return this.getDefaultProgression();
        } catch (error) {
            console.error("[Firebase] Error getting progression:", error);
            return null;
        }
    }

    async updateProgression(updates: Partial<PlayerProgression>): Promise<boolean> {
        if (!this.db) return false;
        const userId = this.getUserId();
        if (!userId) return false;

        try {
            const docRef = doc(this.db, "progression", userId);
            const progression = await this.getPlayerProgression();

            if (!progression) {
                await setDoc(docRef, {
                    ...this.getDefaultProgression(),
                    ...updates
                });
            } else {
                await updateDoc(docRef, updates);
            }

            return true;
        } catch (error) {
            console.error("[Firebase] Error updating progression:", error);
            return false;
        }
    }

    private getDefaultProgression(): PlayerProgression {
        return {
            level: 1,
            experience: 0,
            experienceToNextLevel: 1000,
            totalExperience: 0,
            skillRating: 1000,
            rank: "Bronze"
        };
    }

    // === PLAYER INVENTORY ===

    async getPlayerInventory(playerId?: string): Promise<PlayerInventory | null> {
        if (!this.db) return null;
        const id = playerId || this.getUserId();
        if (!id) return null;

        try {
            const docRef = doc(this.db, "inventory", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as PlayerInventory;
            }

            return this.getDefaultInventory();
        } catch (error) {
            console.error("[Firebase] Error getting inventory:", error);
            return null;
        }
    }

    async updateInventory(updates: Partial<PlayerInventory>): Promise<boolean> {
        if (!this.db) return false;
        const userId = this.getUserId();
        if (!userId) return false;

        try {
            const docRef = doc(this.db, "inventory", userId);
            const inventory = await this.getPlayerInventory();

            if (!inventory) {
                await setDoc(docRef, {
                    ...this.getDefaultInventory(),
                    ...updates
                });
            } else {
                await updateDoc(docRef, updates);
            }

            return true;
        } catch (error) {
            console.error("[Firebase] Error updating inventory:", error);
            return false;
        }
    }

    private getDefaultInventory(): PlayerInventory {
        return {
            chassis: ["light"],
            cannons: ["standard"],
            modules: [],
            currency: 0,
            premiumCurrency: 0
        };
    }

    // === MATCH HISTORY ===

    async saveMatchHistory(match: MatchHistory): Promise<boolean> {
        if (!this.db) return false;
        const userId = this.getUserId();
        if (!userId) return false;

        try {
            const docRef = doc(this.db, "matches", match.matchId);
            await setDoc(docRef, {
                ...match,
                playerId: userId,
                timestamp: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("[Firebase] Error saving match history:", error);
            return false;
        }
    }

    async getMatchHistory(playerId?: string, limitCount: number = 10): Promise<MatchHistory[]> {
        if (!this.db) return [];
        const id = playerId || this.getUserId();
        if (!id) return [];

        try {
            const matchesRef = collection(this.db, "matches");
            const q = query(
                matchesRef,
                orderBy("timestamp", "desc"),
                limit(limitCount)
            );

            const querySnapshot = await getDocs(q);
            const matches: MatchHistory[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.playerId === id) {
                    matches.push(data as MatchHistory);
                }
            });

            return matches;
        } catch (error) {
            console.error("[Firebase] Error getting match history:", error);
            return [];
        }
    }

    // === LEADERBOARD ===

    async getLeaderboard(statName: keyof PlayerStats = "kills", limitCount: number = 100): Promise<Array<{ playerId: string; value: number; name?: string }>> {
        if (!this.db) return [];

        try {
            const playersRef = collection(this.db, "players");
            const q = query(
                playersRef,
                orderBy(statName, "desc"),
                limit(limitCount)
            );

            const querySnapshot = await getDocs(q);
            const leaderboard: Array<{ playerId: string; value: number; name?: string }> = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data() as PlayerStats;
                leaderboard.push({
                    playerId: doc.id,
                    value: data[statName] as number,
                    name: (data as any).name // If name is stored in stats
                });
            });

            return leaderboard;
        } catch (error) {
            console.error("[Firebase] Error getting leaderboard:", error);
            return [];
        }
    }

    getCurrentUserId(): string | null {
        return this.auth?.currentUser?.uid || null;
    }

    // === AUTHENTICATION METHODS ===

    /**
     * Регистрация с email и паролем
     */
    async signUpWithEmail(email: string, password: string, username: string): Promise<{ success: boolean; error?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            // Проверка доступности username
            const isAvailable = await this.checkUsernameAvailability(username);
            if (!isAvailable) {
                return { success: false, error: "Username already taken" };
            }

            // Создание пользователя
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            this.currentUser = userCredential.user;

            // Сохранение username в Firestore
            await this.setUsername(username);

            // Отправка письма для верификации
            await sendEmailVerification(userCredential.user);

            // Создание записи пользователя в Firestore
            const userData: UserData = {
                username,
                email,
                emailVerified: false,
                createdAt: Timestamp.now(),
                lastLogin: Timestamp.now()
            };

            const userDocRef = doc(this.db!, "users", userCredential.user.uid);
            await setDoc(userDocRef, userData);

            console.log("[Firebase] User registered:", userCredential.user.uid);
            return { success: true };
        } catch (error: any) {
            console.error("[Firebase] Sign up error:", error);
            return { success: false, error: error.message || "Registration failed" };
        }
    }

    /**
     * Вход по email и паролю
     */
    async signInWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            this.currentUser = userCredential.user;

            // Обновление lastLogin
            await this.updateLastLogin();

            console.log("[Firebase] User signed in:", userCredential.user.uid);
            return { success: true };
        } catch (error: any) {
            console.error("[Firebase] Sign in error:", error);
            return { success: false, error: error.message || "Sign in failed" };
        }
    }

    /**
     * Вход через Google (redirect - для обхода COOP policy)
     * После вызова этого метода страница перенаправится на Google, затем обратно
     */
    async signInWithGoogle(): Promise<{ success: boolean; error?: string; username?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            const provider = new GoogleAuthProvider();
            // Используем redirect вместо popup для обхода COOP policy
            await signInWithRedirect(this.auth, provider);
            // После redirect страница перезагрузится, результат обработается в handleGoogleRedirectResult
            return { success: true };
        } catch (error: any) {
            console.error("[Firebase] Google sign in error:", error);
            return { success: false, error: error.message || "Google sign in failed" };
        }
    }

    /**
     * Обработка результата Google redirect (вызывать при загрузке страницы)
     */
    async handleGoogleRedirectResult(): Promise<{ success: boolean; error?: string; username?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            const result = await getRedirectResult(this.auth);

            if (!result) {
                // Не было redirect, это нормально
                return { success: false };
            }

            this.currentUser = result.user;
            this.authenticated = true;

            // Проверяем, есть ли уже username
            const username = await this.getUsername();

            // Если username нет, создаем из email или displayName
            if (!username) {
                const newUsername = result.user.displayName?.replace(/\s+/g, '_').toLowerCase() ||
                    result.user.email?.split('@')[0] ||
                    `user_${result.user.uid.substring(0, 8)}`;

                // Проверяем доступность и добавляем суффикс если нужно
                let finalUsername = newUsername;
                let counter = 1;
                while (!(await this.checkUsernameAvailability(finalUsername))) {
                    finalUsername = `${newUsername}_${counter}`;
                    counter++;
                }

                await this.setUsername(finalUsername);
            }

            // Создаем или обновляем запись пользователя
            if (this.db) {
                const userDocRef = doc(this.db, "users", result.user.uid);
                const userDoc = await getDoc(userDocRef);

                if (!userDoc.exists()) {
                    const userData: UserData = {
                        username: username || result.user.displayName?.replace(/\s+/g, '_').toLowerCase() || "user",
                        email: result.user.email || "",
                        emailVerified: result.user.emailVerified,
                        createdAt: Timestamp.now(),
                        lastLogin: Timestamp.now()
                    };
                    await setDoc(userDocRef, userData);
                } else {
                    await updateDoc(userDocRef, {
                        lastLogin: serverTimestamp(),
                        emailVerified: result.user.emailVerified
                    });
                }
            }

            await this.updateLastLogin();

            console.log("[Firebase] ✅ Google redirect sign-in completed:", result.user.uid);
            return { success: true, username: await this.getUsername() || undefined };
        } catch (error: any) {
            console.error("[Firebase] Google redirect result error:", error);
            return { success: false, error: error.message || "Google sign in failed" };
        }
    }

    /**
     * Отправка письма для верификации email
     */
    async sendEmailVerification(): Promise<{ success: boolean; error?: string }> {
        if (!this.auth?.currentUser) {
            return { success: false, error: "No user signed in" };
        }

        try {
            await sendEmailVerification(this.auth.currentUser);
            console.log("[Firebase] Verification email sent");
            return { success: true };
        } catch (error: any) {
            console.error("[Firebase] Send verification email error:", error);
            return { success: false, error: error.message || "Failed to send verification email" };
        }
    }

    /**
     * Отправка письма для сброса пароля
     */
    async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            await sendPasswordResetEmail(this.auth, email);
            console.log("[Firebase] Password reset email sent");
            return { success: true };
        } catch (error: any) {
            console.error("[Firebase] Send password reset email error:", error);
            return { success: false, error: error.message || "Failed to send password reset email" };
        }
    }

    // === EMAIL LINK (PASSWORDLESS) AUTHENTICATION ===

    /**
     * Отправка ссылки для входа без пароля (passwordless)
     * @param email - Email пользователя
     * @param redirectUrl - URL для перенаправления после входа (по умолчанию текущий URL)
     */
    async sendEmailSignInLink(email: string, redirectUrl?: string): Promise<{ success: boolean; error?: string }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            const actionCodeSettings = {
                // URL для перенаправления после клика по ссылке
                url: redirectUrl || window.location.origin + '/auth/callback',
                // Открывать ссылку в приложении, а не в браузере
                handleCodeInApp: true,
            };

            await sendSignInLinkToEmail(this.auth, email, actionCodeSettings);

            // Сохраняем email в localStorage для завершения входа
            localStorage.setItem('emailForSignIn', email);

            console.log("[Firebase] ✅ Email sign-in link sent to:", email);
            return { success: true };
        } catch (error: any) {
            console.error("[Firebase] ❌ Send email sign-in link error:", error);
            return { success: false, error: error.message || "Failed to send sign-in link" };
        }
    }

    /**
     * Проверяет, является ли текущий URL ссылкой для входа
     * @param url - URL для проверки (по умолчанию текущий URL)
     */
    isEmailSignInLink(url?: string): boolean {
        if (!this.auth) return false;
        return isSignInWithEmailLink(this.auth, url || window.location.href);
    }

    /**
     * Завершение входа по ссылке из email
     * @param email - Email пользователя (если не указан, берется из localStorage)
     * @param url - URL со ссылкой для входа (по умолчанию текущий URL)
     */
    async completeEmailLinkSignIn(email?: string, url?: string): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> {
        if (!this.auth) {
            return { success: false, error: "Auth not initialized" };
        }

        try {
            const signInUrl = url || window.location.href;

            // Проверяем, что это действительно ссылка для входа
            if (!isSignInWithEmailLink(this.auth, signInUrl)) {
                return { success: false, error: "Invalid sign-in link" };
            }

            // Получаем email из параметра или localStorage
            let userEmail = email || localStorage.getItem('emailForSignIn');

            if (!userEmail) {
                // Если email не найден, просим пользователя ввести его
                return { success: false, error: "Please provide your email for confirmation" };
            }

            // Выполняем вход
            const userCredential = await signInWithEmailLink(this.auth, userEmail, signInUrl);
            this.currentUser = userCredential.user;
            this.authenticated = true;

            // Очищаем сохраненный email
            localStorage.removeItem('emailForSignIn');

            // Проверяем, новый ли это пользователь
            const isNewUser = userCredential.user.metadata.creationTime === userCredential.user.metadata.lastSignInTime;

            // Создаем запись пользователя если новый
            if (isNewUser && this.db) {
                const userDocRef = doc(this.db, "users", userCredential.user.uid);
                const userData: UserData = {
                    username: userEmail.split('@')[0] || `user_${userCredential.user.uid.substring(0, 8)}`,
                    email: userEmail,
                    emailVerified: userCredential.user.emailVerified,
                    createdAt: Timestamp.now(),
                    lastLogin: Timestamp.now()
                };
                await setDoc(userDocRef, userData);
            } else {
                await this.updateLastLogin();
            }

            console.log("[Firebase] ✅ Email link sign-in completed:", userCredential.user.uid);
            return { success: true, isNewUser };
        } catch (error: any) {
            console.error("[Firebase] ❌ Complete email link sign-in error:", error);
            return { success: false, error: error.message || "Failed to complete sign-in" };
        }
    }

    /**
     * Проверка верификации email
     */
    checkEmailVerified(): boolean {
        return this.auth?.currentUser?.emailVerified || false;
    }

    /**
     * Установка уникального username
     */
    async setUsername(username: string): Promise<boolean> {
        if (!this.db) return false;
        const userId = this.getUserId();
        if (!userId) return false;

        try {
            // Проверка доступности
            const isAvailable = await this.checkUsernameAvailability(username);
            if (!isAvailable) {
                throw new Error("Username already taken");
            }

            const userDocRef = doc(this.db, "users", userId);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                await updateDoc(userDocRef, { username });
            } else {
                await setDoc(userDocRef, {
                    username,
                    email: this.auth?.currentUser?.email || "",
                    emailVerified: this.auth?.currentUser?.emailVerified || false,
                    createdAt: Timestamp.now(),
                    lastLogin: serverTimestamp()
                });
            }

            return true;
        } catch (error) {
            console.error("[Firebase] Error setting username:", error);
            return false;
        }
    }

    /**
     * Получение username пользователя
     */
    async getUsername(): Promise<string | null> {
        if (!this.db) return null;
        const userId = this.getUserId();
        if (!userId) return null;

        try {
            const userDocRef = doc(this.db, "users", userId);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const data = userDoc.data() as UserData;
                return data.username || null;
            }

            return null;
        } catch (error) {
            console.error("[Firebase] Error getting username:", error);
            return null;
        }
    }

    /**
     * Проверка доступности username
     */
    async checkUsernameAvailability(username: string): Promise<boolean> {
        if (!this.db) return false;

        // Валидация username
        if (!username || username.length < 3 || username.length > 20) {
            return false;
        }

        // Разрешенные символы: буквы, цифры, подчеркивания
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return false;
        }

        try {
            const usersRef = collection(this.db, "users");
            const q = query(usersRef, where("username", "==", username));
            const querySnapshot = await getDocs(q);

            // Если username уже занят другим пользователем
            if (!querySnapshot.empty) {
                const userId = this.getUserId();
                // Проверяем, не занят ли он текущим пользователем
                const docs = querySnapshot.docs;
                if (docs.length === 1 && docs[0] && docs[0].id === userId) {
                    return true; // Это наш username
                }
                return false; // Занят другим пользователем
            }

            return true; // Доступен
        } catch (error) {
            console.error("[Firebase] Error checking username availability:", error);
            return false;
        }
    }

    /**
     * Получение токена для аутентификации на сервере
     */
    async getAuthToken(): Promise<string | null> {
        if (!this.auth?.currentUser) {
            return null;
        }

        try {
            const token = await getIdToken(this.auth.currentUser);
            return token;
        } catch (error) {
            console.error("[Firebase] Error getting auth token:", error);
            return null;
        }
    }

    /**
     * Обновление времени последнего входа
     */
    private async updateLastLogin(): Promise<void> {
        if (!this.db) return;
        const userId = this.getUserId();
        if (!userId) return;

        try {
            const userDocRef = doc(this.db, "users", userId);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                await updateDoc(userDocRef, {
                    lastLogin: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("[Firebase] Error updating last login:", error);
        }
    }

    /**
     * Проверка, авторизован ли пользователь (не анонимно)
     * Возвращает true только для полностью авторизованных пользователей (email/Google)
     */
    isAuthenticated(): boolean {
        if (!this.auth || !this.initialized) {
            return false;
        }
        const user = this.auth.currentUser;
        return user !== null && user !== undefined && !user.isAnonymous;
    }

    /**
     * Проверка, является ли пользователь анонимным
     */
    isAnonymous(): boolean {
        return this.auth?.currentUser?.isAnonymous || false;
    }

    /**
     * Проверка, есть ли какой-либо пользователь (анонимный или нет)
     */
    hasUser(): boolean {
        return this.auth?.currentUser !== null && this.auth?.currentUser !== undefined;
    }

    /**
     * Получение email пользователя
     */
    getEmail(): string | null {
        return this.auth?.currentUser?.email || null;
    }

    /**
     * Проверка, является ли пользователь админом
     * Проверяет custom claims из ID token
     */
    async isAdmin(): Promise<boolean> {
        if (!this.auth?.currentUser) return false;

        try {
            const idToken = await getIdToken(this.auth.currentUser, true);
            const tokenParts = idToken.split('.');
            if (!tokenParts[1]) return false;
            const decodedToken = JSON.parse(atob(tokenParts[1]));
            return decodedToken.admin === true || decodedToken.role === 'admin';
        } catch (error) {
            console.error("[Firebase] Error checking admin status:", error);
            return false;
        }
    }

    /**
     * Получение короткого ID для анонимного пользователя (последние 4 символа UID)
     */
    getShortAnonId(): string | null {
        const userId = this.getUserId();
        if (!userId) return null;
        return userId.slice(-4).padStart(4, '0');
    }
}

// Singleton instance
export const firebaseService = new FirebaseService();

