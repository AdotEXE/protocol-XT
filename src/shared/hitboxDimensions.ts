/**
 * SHARED HITBOX DIMENSIONS
 * Used by both client (physics) and server (OBB hit detection)
 * Ensures SP/MP hitbox parity
 * 
 * Format: { halfWidth, halfDepth, halfHeight } - half-sizes for OBB collision
 */

export interface HitboxDimensions {
    halfWidth: number;
    halfDepth: number;
    halfHeight: number;
}

/**
 * Chassis hitbox dimensions - half sizes for OBB collision detection
 * These values are derived from client CHASSIS_TYPES (width/2, depth/2, height/2)
 * IMPORTANT: Keep in sync with client/tankTypes.ts CHASSIS_TYPES dimensions!
 */
export const CHASSIS_HITBOX_DIMENSIONS: Record<string, HitboxDimensions> = {
    // Fast tanks (small hitboxes)
    racer: { halfWidth: 0.75, halfDepth: 1.3, halfHeight: 0.275 },      // 1.5/2, 2.6/2, 0.55/2
    scout: { halfWidth: 0.8, halfDepth: 1.4, halfHeight: 0.3 },         // 1.6/2, 2.8/2, 0.6/2
    stealth: { halfWidth: 0.95, halfDepth: 1.6, halfHeight: 0.325 },    // 1.9/2, 3.2/2, 0.65/2
    light: { halfWidth: 0.9, halfDepth: 1.5, halfHeight: 0.35 },        // 1.8/2, 3.0/2, 0.7/2

    // Medium tanks
    hover: { halfWidth: 1.0, halfDepth: 1.65, halfHeight: 0.375 },      // 2.0/2, 3.3/2, 0.75/2
    amphibious: { halfWidth: 1.05, halfDepth: 1.8, halfHeight: 0.4 },   // 2.1/2, 3.6/2, 0.8/2
    medium: { halfWidth: 1.1, halfDepth: 1.75, halfHeight: 0.4 },       // 2.2/2, 3.5/2, 0.8/2
    drone: { halfWidth: 1.1, halfDepth: 1.75, halfHeight: 0.425 },      // 2.2/2, 3.5/2, 0.85/2
    shield: { halfWidth: 1.15, halfDepth: 1.85, halfHeight: 0.45 },     // 2.3/2, 3.7/2, 0.9/2

    // Assault tanks
    command: { halfWidth: 1.2, halfDepth: 1.95, halfHeight: 0.44 },     // 2.4/2, 3.9/2, 0.88/2
    assault: { halfWidth: 1.2, halfDepth: 1.9, halfHeight: 0.425 },     // 2.4/2, 3.8/2, 0.85/2
    destroyer: { halfWidth: 1.25, halfDepth: 2.0, halfHeight: 0.475 },  // 2.5/2, 4.0/2, 0.95/2

    // Heavy tanks (large hitboxes)
    heavy: { halfWidth: 1.3, halfDepth: 2.0, halfHeight: 0.45 },        // 2.6/2, 4.0/2, 0.9/2
    artillery: { halfWidth: 1.4, halfDepth: 2.1, halfHeight: 0.5 },     // 2.8/2, 4.2/2, 1.0/2
    siege: { halfWidth: 1.5, halfDepth: 2.25, halfHeight: 0.55 },       // 3.0/2, 4.5/2, 1.1/2
};

/**
 * Get hitbox dimensions for a chassis type, with fallback to medium
 */
export function getChassisHitbox(chassisId: string): HitboxDimensions {
    return CHASSIS_HITBOX_DIMENSIONS[chassisId] ?? CHASSIS_HITBOX_DIMENSIONS.medium!;
}

/**
 * Turret hitbox multipliers relative to chassis
 */
export const TURRET_HITBOX_MULTIPLIERS = {
    height: 0.75,  // 75% of chassis height
    width: 0.65,   // 65% of chassis width
    depth: 0.60    // 60% of chassis depth
};
