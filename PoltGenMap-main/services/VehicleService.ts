import { Mesh, Scene, Vector3, MeshBuilder, StandardMaterial, Color3, PhysicsAggregate, PhysicsShapeType, TransformNode } from "@babylonjs/core";

export interface TankObject {
    mesh: Mesh;
    turret: Mesh; // Expose turret for rotation
    barrel: Mesh; // Expose barrel for shooting origin
    aggregate: PhysicsAggregate;
}

export const createTank = (scene: Scene, position: Vector3): TankObject => {
    // 1. Materials
    const camoMat = new StandardMaterial("camoMat", scene);
    camoMat.diffuseColor = new Color3(0.25, 0.35, 0.2); // Slightly lighter green
    camoMat.specularColor = new Color3(0.1, 0.1, 0.1); // Low specular

    const trackMat = new StandardMaterial("trackMat", scene);
    trackMat.diffuseColor = new Color3(0.05, 0.05, 0.05); 

    // 2. Meshes
    // Main Hull
    const body = MeshBuilder.CreateBox("tankBody", { width: 2.4, height: 1.0, depth: 4.5 }, scene);
    body.position = position.add(new Vector3(0, 1.0, 0));
    body.material = camoMat;

    // Tracks (Visual only, child of body)
    const leftTrack = MeshBuilder.CreateBox("leftTrack", { width: 0.6, height: 1.0, depth: 4.6 }, scene);
    leftTrack.position.x = -1.5;
    leftTrack.position.y = -0.2;
    leftTrack.parent = body;
    leftTrack.material = trackMat;

    const rightTrack = MeshBuilder.CreateBox("rightTrack", { width: 0.6, height: 1.0, depth: 4.6 }, scene);
    rightTrack.position.x = 1.5;
    rightTrack.position.y = -0.2;
    rightTrack.parent = body;
    rightTrack.material = trackMat;

    // Turret
    const turret = MeshBuilder.CreateBox("tankTurret", { width: 1.8, height: 0.8, depth: 2.2 }, scene);
    turret.position.y = 0.9;
    turret.parent = body;
    turret.material = camoMat;
    
    // FIX 1: Rotate Turret 180 degrees to face "Forward" away from default camera
    turret.rotation.y = Math.PI; 

    // Barrel
    const barrel = MeshBuilder.CreateCylinder("tankBarrel", { diameter: 0.2, height: 4.0 }, scene);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 2.0; // Offset forward relative to turret center
    barrel.position.y = 0.1;
    barrel.parent = turret;
    barrel.material = camoMat;

    // 3. Physics
    // Mass 8000kg (8 Tons)
    const aggregate = new PhysicsAggregate(body, PhysicsShapeType.BOX, { 
        mass: 8000, 
        restitution: 0.0, // No bounce
        friction: 0.8 // HIGH FRICTION (Grip)
    }, scene);

    // Physics Tuning for ARCADE FEEL
    
    // Linear Damping: 2.0 (High) -> Stops quickly when W is released
    aggregate.body.setLinearDamping(2.0); 
    
    // Angular Damping: 4.0 (Moderately High) -> Stops spinning fast, but allows turning with enough torque
    // Reduced from 10.0 to 4.0 to make turning snappier
    aggregate.body.setAngularDamping(4.0); 

    // Inertia Tuning
    // Keep Y relatively low to allow turning
    aggregate.body.setMassProperties({
        inertia: new Vector3(8000, 1000, 8000) 
    });

    return { mesh: body, turret, barrel, aggregate };
};