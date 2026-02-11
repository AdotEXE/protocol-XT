import { Vector3 } from "@babylonjs/core";
import { WallSpawnData } from "../shared/messages";

export class ServerWall {
    position: Vector3;
    rotation: number;
    duration: number; // ms
    ownerId: string;
    spawnTime: number;

    // Dimensions (half-sizes)
    width: number = 6;
    height: number = 4;
    depth: number = 0.5;

    // Derived collision data
    private _cosRotation: number;
    private _sinRotation: number;

    constructor(data: WallSpawnData) {
        this.position = typeof data.position.clone === 'function' ? data.position.clone() : new Vector3(data.position.x, data.position.y, data.position.z);
        this.rotation = data.rotation;
        this.duration = data.duration;
        this.ownerId = data.ownerId;
        this.spawnTime = Date.now();

        this._cosRotation = Math.cos(-this.rotation);
        this._sinRotation = Math.sin(-this.rotation);
    }

    isExpired(currentTime: number): boolean {
        return (currentTime - this.spawnTime) > this.duration;
    }

    /**
     * Check if a point is inside the wall
     */
    checkCollision(point: Vector3): boolean {
        const localPos = point.subtract(this.position);

        // Rotate into local space
        const localX = localPos.x * this._cosRotation - localPos.z * this._sinRotation;
        const localY = localPos.y;
        const localZ = localPos.x * this._sinRotation + localPos.z * this._cosRotation;

        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        const halfDepth = this.depth / 2;

        return Math.abs(localX) < halfWidth &&
            Math.abs(localY) < halfHeight &&
            Math.abs(localZ) < halfDepth;
    }

    /**
     * Check if a line segment intersects the wall
     * Used for raycasting (projectiles, explosions)
     */
    checkIntersection(start: Vector3, end: Vector3): boolean {
        // Transform start and end to local space
        const toLocal = (p: Vector3) => {
            const rel = p.subtract(this.position);
            return new Vector3(
                rel.x * this._cosRotation - rel.z * this._sinRotation,
                rel.y,
                rel.x * this._sinRotation + rel.z * this._cosRotation
            );
        };

        const localStart = toLocal(start);
        const localEnd = toLocal(end);

        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        const halfDepth = this.depth / 2;

        // AABB intersection check in local space
        // Cohen-Sutherland algorithm or similar for line-AABB intersection could be used
        // Here we use a simplified slab method for line segment vs AABB

        const min = new Vector3(-halfWidth, -halfHeight, -halfDepth);
        const max = new Vector3(halfWidth, halfHeight, halfDepth);

        let tMin = 0;
        let tMax = 1;

        const checkAxis = (startVal: number, endVal: number, minVal: number, maxVal: number): boolean => {
            const dir = endVal - startVal;
            if (Math.abs(dir) < 1e-6) {
                // Line is parallel to slab
                return startVal >= minVal && startVal <= maxVal;
            }

            let t1 = (minVal - startVal) / dir;
            let t2 = (maxVal - startVal) / dir;

            if (t1 > t2) {
                const temp = t1;
                t1 = t2;
                t2 = temp;
            }

            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);

            return tMin <= tMax;
        };

        if (!checkAxis(localStart.x, localEnd.x, min.x, max.x)) return false;
        if (!checkAxis(localStart.y, localEnd.y, min.y, max.y)) return false;
        if (!checkAxis(localStart.z, localEnd.z, min.z, max.z)) return false;

        return true;
    }
}
