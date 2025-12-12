import { initializeApp, FirebaseApp } from "firebase/app";
import { 
    getFirestore, 
    Firestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    collection, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    Timestamp,
    increment,
    serverTimestamp
} from "firebase/firestore";
import { 
    getAuth, 
    Auth, 
    signInAnonymously, 
    onAuthStateChanged, 
    User,
    signOut as firebaseSignOut
} from "firebase/auth";

// Firebase configuration (should be in .env or config file)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-key",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-project",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demo.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "demo-app-id"
};

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

export class FirebaseService {
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;
    private auth: Auth | null = null;
    private currentUser: User | null = null;
    private initialized: boolean = false;

    async initialize(): Promise<boolean> {
        try {
            this.app = initializeApp(firebaseConfig);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);

            // Wait for auth state
            return new Promise((resolve) => {
                onAuthStateChanged(this.auth!, (user) => {
                    this.currentUser = user;
                    if (user) {
                        console.log("[Firebase] Authenticated as:", user.uid);
                        this.initialized = true;
                        resolve(true);
                    } else {
                        // Try anonymous sign in
                        this.signInAnonymously().then(() => {
                            this.initialized = true;
                            resolve(true);
                        }).catch((error) => {
                            console.error("[Firebase] Failed to sign in:", error);
                            resolve(false);
                        });
                    }
                });
            });
        } catch (error) {
            console.error("[Firebase] Initialization error:", error);
            return false;
        }
    }

    private async signInAnonymously(): Promise<void> {
        if (!this.auth) throw new Error("Auth not initialized");
        const userCredential = await signInAnonymously(this.auth);
        this.currentUser = userCredential.user;
        console.log("[Firebase] Signed in anonymously:", userCredential.user.uid);
    }

    async signOut(): Promise<void> {
        if (this.auth) {
            await firebaseSignOut(this.auth);
            this.currentUser = null;
        }
    }

    getUserId(): string | null {
        return this.currentUser?.uid || null;
    }

    isInitialized(): boolean {
        return this.initialized && this.db !== null && this.currentUser !== null;
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
}

// Singleton instance
export const firebaseService = new FirebaseService();

