/**
 * Social System - система друзей и кланов
 */

import { firebaseService } from "./firebaseService";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion, serverTimestamp, orderBy, limit } from "firebase/firestore";
import { logger, LogLevel, loggingSettings, LogCategory } from "./utils/logger";

export interface Friend {
    playerId: string;
    playerName: string;
    status: "online" | "offline" | "in_game";
    lastSeen: number;
    isOnline: boolean;
    friendshipDate: number;
}

export interface FriendRequest {
    fromPlayerId: string;
    fromPlayerName: string;
    toPlayerId: string;
    timestamp: number;
    status: "pending" | "accepted" | "rejected";
}

export interface Clan {
    id: string;
    name: string;
    tag: string; // Short tag like "ABC"
    description: string;
    leaderId: string;
    leaderName: string;
    members: ClanMember[];
    memberCount: number;
    maxMembers: number;
    createdAt: number;
    stats: {
        totalWins: number;
        totalKills: number;
        totalMatches: number;
    };
    settings: {
        isPublic: boolean;
        requiresApproval: boolean;
        minLevel: number;
    };
}

export interface ClanMember {
    playerId: string;
    playerName: string;
    role: "leader" | "officer" | "member";
    joinedAt: number;
    contribution: number; // Points for clan activities
}

export class SocialSystem {
    private db: any = null;
    private currentUserId: string | null = null;
    private friendsCache: Map<string, Friend> = new Map();
    private clanCache: Clan | null = null;
    private _friendRequestsCache: FriendRequest[] = [];

    async initialize(): Promise<boolean> {
        try {
            this.db = getFirestore();
            this.currentUserId = firebaseService.getCurrentUserId();
            return true;
        } catch (error) {
            console.error("[Social] Initialization failed:", error);
            return false;
        }
    }

    // ========== FRIENDS SYSTEM ==========

    /**
     * Send friend request
     */
    async sendFriendRequest(targetPlayerId: string, targetPlayerName: string): Promise<boolean> {
        if (!this.db || !this.currentUserId) return false;
        if (targetPlayerId === this.currentUserId) return false;

        try {
            const requestId = `${this.currentUserId}_${targetPlayerId}`;
            const requestRef = doc(this.db, "friendRequests", requestId);
            
            await setDoc(requestRef, {
                fromPlayerId: this.currentUserId,
                fromPlayerName: await this.getPlayerName(this.currentUserId) || "Unknown",
                toPlayerId: targetPlayerId,
                toPlayerName: targetPlayerName,
                timestamp: serverTimestamp(),
                status: "pending"
            });

            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[Social] Friend request sent to ${targetPlayerId}`);
            }
            return true;
        } catch (error) {
            console.error("[Social] Error sending friend request:", error);
            return false;
        }
    }

    /**
     * Accept friend request
     */
    async acceptFriendRequest(requestId: string): Promise<boolean> {
        if (!this.db || !this.currentUserId) return false;

        try {
            const requestRef = doc(this.db, "friendRequests", requestId);
            const requestSnap = await getDoc(requestRef);
            
            if (!requestSnap.exists()) return false;
            const request = requestSnap.data() as FriendRequest;
            
            if (request.toPlayerId !== this.currentUserId) return false;

            // Update request status
            await updateDoc(requestRef, { status: "accepted" });

            // Add to both players' friend lists
            const currentUserRef = doc(this.db, "friends", this.currentUserId);
            const targetUserRef = doc(this.db, "friends", request.fromPlayerId);

            const friendData: Friend = {
                playerId: request.fromPlayerId,
                playerName: request.fromPlayerName,
                status: "offline",
                lastSeen: Date.now(),
                isOnline: false,
                friendshipDate: Date.now()
            };

            await setDoc(currentUserRef, {
                friends: arrayUnion(friendData)
            }, { merge: true });

            const currentUserFriendData: Friend = {
                playerId: this.currentUserId,
                playerName: await this.getPlayerName(this.currentUserId) || "Unknown",
                status: "offline",
                lastSeen: Date.now(),
                isOnline: false,
                friendshipDate: Date.now()
            };

            await setDoc(targetUserRef, {
                friends: arrayUnion(currentUserFriendData)
            }, { merge: true });

            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[Social] Friend request accepted: ${requestId}`);
            }
            return true;
        } catch (error) {
            console.error("[Social] Error accepting friend request:", error);
            return false;
        }
    }

    /**
     * Reject friend request
     */
    async rejectFriendRequest(requestId: string): Promise<boolean> {
        if (!this.db || !this.currentUserId) return false;

        try {
            const requestRef = doc(this.db, "friendRequests", requestId);
            await updateDoc(requestRef, { status: "rejected" });
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[Social] Friend request rejected: ${requestId}`);
            }
            return true;
        } catch (error) {
            console.error("[Social] Error rejecting friend request:", error);
            return false;
        }
    }

    /**
     * Remove friend
     */
    async removeFriend(friendId: string): Promise<boolean> {
        if (!this.db || !this.currentUserId) return false;

        try {
            const currentUserRef = doc(this.db, "friends", this.currentUserId);
            const friendDoc = await getDoc(currentUserRef);
            
            if (friendDoc.exists()) {
                const data = friendDoc.data();
                const friends = (data.friends || []) as Friend[];
                const updatedFriends = friends.filter(f => f.playerId !== friendId);
                
                await setDoc(currentUserRef, { friends: updatedFriends });
            }

            // Also remove from friend's list
            const friendUserRef = doc(this.db, "friends", friendId);
            const friendUserDoc = await getDoc(friendUserRef);
            
            if (friendUserDoc.exists()) {
                const data = friendUserDoc.data();
                const friends = (data.friends || []) as Friend[];
                const updatedFriends = friends.filter(f => f.playerId !== this.currentUserId);
                
                await setDoc(friendUserRef, { friends: updatedFriends });
            }

            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[Social] Friend removed: ${friendId}`);
            }
            return true;
        } catch (error) {
            console.error("[Social] Error removing friend:", error);
            return false;
        }
    }

    /**
     * Get friend list
     */
    async getFriends(): Promise<Friend[]> {
        if (!this.db || !this.currentUserId) return [];

        try {
            const friendsRef = doc(this.db, "friends", this.currentUserId);
            const friendsDoc = await getDoc(friendsRef);
            
            if (friendsDoc.exists()) {
                const data = friendsDoc.data();
                const friends = (data.friends || []) as Friend[];
                this.friendsCache.clear();
                friends.forEach(f => this.friendsCache.set(f.playerId, f));
                return friends;
            }
            
            return [];
        } catch (error) {
            console.error("[Social] Error getting friends:", error);
            return [];
        }
    }

    /**
     * Get pending friend requests
     */
    async getFriendRequests(): Promise<FriendRequest[]> {
        if (!this.db || !this.currentUserId) return [];

        try {
            const requestsQuery = query(
                collection(this.db, "friendRequests"),
                where("toPlayerId", "==", this.currentUserId),
                where("status", "==", "pending")
            );
            
            const snapshot = await getDocs(requestsQuery);
            const requests: FriendRequest[] = [];
            
            snapshot.forEach(doc => {
                requests.push(doc.data() as FriendRequest);
            });
            
            this._friendRequestsCache = requests;
            return requests;
        } catch (error) {
            console.error("[Social] Error getting friend requests:", error);
            return [];
        }
    }

    /**
     * Update friend online status
     */
    async updateFriendStatus(friendId: string, status: "online" | "offline" | "in_game"): Promise<void> {
        if (!this.db || !this.currentUserId) return;

        try {
            const friendsRef = doc(this.db, "friends", this.currentUserId);
            const friendsDoc = await getDoc(friendsRef);
            
            if (friendsDoc.exists()) {
                const data = friendsDoc.data();
                const friends = (data.friends || []) as Friend[];
                const friend = friends.find(f => f.playerId === friendId);
                
                if (friend) {
                    friend.status = status;
                    friend.isOnline = status !== "offline";
                    friend.lastSeen = Date.now();
                    
                    await setDoc(friendsRef, { friends });
                }
            }
        } catch (error) {
            console.error("[Social] Error updating friend status:", error);
        }
    }

    // ========== CLAN SYSTEM ==========

    /**
     * Create a clan
     */
    async createClan(name: string, tag: string, description: string, settings?: Partial<Clan["settings"]>): Promise<string | null> {
        if (!this.db || !this.currentUserId) return null;

        try {
            const playerName = await this.getPlayerName(this.currentUserId) || "Unknown";
            const clanId = `clan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const clan: Clan = {
                id: clanId,
                name,
                tag: tag.toUpperCase().substring(0, 4),
                description,
                leaderId: this.currentUserId,
                leaderName: playerName,
                members: [{
                    playerId: this.currentUserId,
                    playerName,
                    role: "leader",
                    joinedAt: Date.now(),
                    contribution: 0
                }],
                memberCount: 1,
                maxMembers: 50,
                createdAt: Date.now(),
                stats: {
                    totalWins: 0,
                    totalKills: 0,
                    totalMatches: 0
                },
                settings: {
                    isPublic: true,
                    requiresApproval: false,
                    minLevel: 1,
                    ...settings
                }
            };

            const clanRef = doc(this.db, "clans", clanId);
            await setDoc(clanRef, clan);

            // Add clan reference to player
            const playerRef = doc(this.db, "players", this.currentUserId);
            await updateDoc(playerRef, {
                clanId: clanId,
                clanRole: "leader"
            });

            this.clanCache = clan;
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[Social] Clan created: ${clan.name} (${clan.tag})`);
            }
            return clanId;
        } catch (error) {
            console.error("[Social] Error creating clan:", error);
            return null;
        }
    }

    /**
     * Join a clan
     */
    async joinClan(clanId: string): Promise<boolean> {
        if (!this.db || !this.currentUserId) return false;

        try {
            const clanRef = doc(this.db, "clans", clanId);
            const clanDoc = await getDoc(clanRef);
            
            if (!clanDoc.exists()) return false;
            
            const clan = clanDoc.data() as Clan;
            
            // Check if already a member
            if (clan.members.some(m => m.playerId === this.currentUserId)) {
                return false;
            }
            
            // Check if full
            if (clan.memberCount >= clan.maxMembers) {
                return false;
            }

            const playerName = await this.getPlayerName(this.currentUserId) || "Unknown";
            const newMember: ClanMember = {
                playerId: this.currentUserId!,
                playerName,
                role: "member",
                joinedAt: Date.now(),
                contribution: 0
            };

            const currentMemberCount = clan.memberCount || 0;
            await updateDoc(clanRef, {
                members: arrayUnion(newMember),
                memberCount: currentMemberCount + 1
            });

            // Add clan reference to player
            const playerRef = doc(this.db, "players", this.currentUserId);
            await updateDoc(playerRef, {
                clanId: clanId,
                clanRole: "member"
            });

            console.log(`[Social] Joined clan: ${clan.name}`);
            return true;
        } catch (error) {
            console.error("[Social] Error joining clan:", error);
            return false;
        }
    }

    /**
     * Leave clan
     */
    async leaveClan(): Promise<boolean> {
        if (!this.db || !this.currentUserId) return false;

        try {
            const playerRef = doc(this.db, "players", this.currentUserId);
            const playerDoc = await getDoc(playerRef);
            
            if (!playerDoc.exists()) return false;
            
            const playerData = playerDoc.data();
            const clanId = playerData.clanId;
            
            if (!clanId) return false;

            const clanRef = doc(this.db, "clans", clanId);
            const clanDoc = await getDoc(clanRef);
            
            if (clanDoc.exists()) {
                const clan = clanDoc.data() as Clan;
                const updatedMembers = clan.members.filter(m => m.playerId !== this.currentUserId);
                
                const currentMemberCount = clan.memberCount || 0;
                await updateDoc(clanRef, {
                    members: updatedMembers,
                    memberCount: Math.max(0, currentMemberCount - 1)
                });
            }

            await updateDoc(playerRef, {
                clanId: null,
                clanRole: null
            });

            this.clanCache = null;
            console.log("[Social] Left clan");
            return true;
        } catch (error) {
            console.error("[Social] Error leaving clan:", error);
            return false;
        }
    }

    /**
     * Get player's clan
     */
    async getPlayerClan(playerId?: string): Promise<Clan | null> {
        if (!this.db) return null;
        
        const targetPlayerId = playerId || this.currentUserId;
        if (!targetPlayerId) return null;

        try {
            const playerRef = doc(this.db, "players", targetPlayerId);
            const playerDoc = await getDoc(playerRef);
            
            if (!playerDoc.exists()) return null;
            
            const playerData = playerDoc.data();
            const clanId = playerData.clanId;
            
            if (!clanId) return null;

            const clanRef = doc(this.db, "clans", clanId);
            const clanDoc = await getDoc(clanRef);
            
            if (clanDoc.exists()) {
                const clan = clanDoc.data() as Clan;
                if (targetPlayerId === this.currentUserId) {
                    this.clanCache = clan;
                }
                return clan;
            }
            
            return null;
        } catch (error) {
            console.error("[Social] Error getting player clan:", error);
            return null;
        }
    }

    /**
     * Search clans
     */
    async searchClans(queryText: string, limitCount: number = 20): Promise<Clan[]> {
        if (!this.db) return [];

        try {
            // Note: Firestore doesn't support full-text search natively
            // This is a simplified version - in production, use Algolia or similar
            const clansQuery = query(collection(this.db, "clans"), limit(limitCount));
            const snapshot = await getDocs(clansQuery);
            const clans: Clan[] = [];
            
            snapshot.forEach(doc => {
                const clan = doc.data() as Clan;
                const searchLower = queryText.toLowerCase();
                if (
                    clan.name.toLowerCase().includes(searchLower) ||
                    clan.tag.toLowerCase().includes(searchLower) ||
                    clan.description.toLowerCase().includes(searchLower)
                ) {
                    clans.push(clan);
                }
            });
            
            return clans;
        } catch (error) {
            console.error("[Social] Error searching clans:", error);
            return [];
        }
    }

    /**
     * Get clan leaderboard
     */
    async getClanLeaderboard(category: "totalWins" | "totalKills" | "totalMatches", limitCount: number = 10): Promise<Clan[]> {
        if (!this.db) return [];

        try {
            const clansQuery = query(
                collection(this.db, "clans"),
                orderBy(`stats.${category}`, "desc"),
                limit(limitCount)
            );
            
            const snapshot = await getDocs(clansQuery);
            const clans: Clan[] = [];
            
            snapshot.forEach(doc => {
                clans.push(doc.data() as Clan);
            });
            
            return clans;
        } catch (error) {
            console.error("[Social] Error getting clan leaderboard:", error);
            return [];
        }
    }

    // ========== HELPER METHODS ==========

    private async getPlayerName(playerId: string): Promise<string | null> {
        if (!this.db) return null;

        try {
            const playerRef = doc(this.db, "players", playerId);
            const playerDoc = await getDoc(playerRef);
            
            if (playerDoc.exists()) {
                const data = playerDoc.data();
                return data.name || data.playerName || null;
            }
            
            return null;
        } catch (error) {
            console.error("[Social] Error getting player name:", error);
            return null;
        }
    }

    getCurrentUserId(): string | null {
        return this.currentUserId;
    }

    getCachedFriends(): Friend[] {
        return Array.from(this.friendsCache.values());
    }

    getCachedClan(): Clan | null {
        return this.clanCache;
    }
}

export const socialSystem = new SocialSystem();

