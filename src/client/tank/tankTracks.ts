import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";

/**
 * Creates visual track meshes for a tank.
 * 
 * @param scene The BabylonJS scene
 * @param chassis The chassis mesh to attach tracks to
 * @param width Track width
 * @param height Track height
 * @param depth Track depth
 * @param color Track color (hex string or Color3)
 * @param chassisWidth Width of the chassis (for positioning)
 * @param chassisHeight Height of the chassis (for positioning)
 * @param prefix Optional prefix for mesh names to ensure uniqueness/prevent collisions
 * @returns Object containing left and right track meshes
 */
export function createVisualTracks(
    scene: Scene,
    chassis: Mesh,
    width: number,
    height: number,
    depth: number,
    color: string | Color3 | Color3,
    chassisWidth: number,
    chassisHeight: number,
    prefix: string = ""
): { left: Mesh, right: Mesh } {

    // Create material
    // Unique material name to avoid conflicts if needed, or shared if generic
    const matName = `${prefix}trackMat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const trackMat = new StandardMaterial(matName, scene);

    if (typeof color === 'string') {
        trackMat.diffuseColor = Color3.FromHexString(color);
    } else {
        trackMat.diffuseColor = color;
    }

    trackMat.specularColor = Color3.Black();
    trackMat.freeze();

    // Left track
    const leftTrack = MeshBuilder.CreateBox(`${prefix}leftTrack`, {
        width: width,
        height: height,
        depth: depth
    }, scene);

    // Position: wider than chassis center, lower than chassis center
    // Using values similar to original TankController logic
    // (-w * 0.55, -h * 0.25, 0)
    leftTrack.position = new Vector3(-chassisWidth * 0.55, -chassisHeight * 0.25, 0);
    leftTrack.parent = chassis;
    leftTrack.material = trackMat;

    // Right track
    const rightTrack = MeshBuilder.CreateBox(`${prefix}rightTrack`, {
        width: width,
        height: height,
        depth: depth
    }, scene);

    rightTrack.position = new Vector3(chassisWidth * 0.55, -chassisHeight * 0.25, 0);
    rightTrack.parent = chassis;
    rightTrack.material = trackMat;

    return { left: leftTrack, right: rightTrack };
}
