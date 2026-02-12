/** Minimal mock for tests that load shared code depending on @babylonjs/core */
export class Vector3 {
    constructor(
        public x = 0,
        public y = 0,
        public z = 0
    ) {}

    static Distance(a: Vector3, b: Vector3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    static Zero(): Vector3 {
        return new Vector3(0, 0, 0);
    }

    static Forward(): Vector3 {
        return new Vector3(0, 0, 1);
    }

    static Up(): Vector3 {
        return new Vector3(0, 1, 0);
    }

    static Right(): Vector3 {
        return new Vector3(1, 0, 0);
    }
}
