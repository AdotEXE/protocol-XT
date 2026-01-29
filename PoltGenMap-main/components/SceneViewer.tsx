import React, { useEffect, useRef, useState } from 'react';
import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    HavokPlugin,
    PhysicsAggregate,
    PhysicsShapeType,
    DirectionalLight,
    VertexData,
    Vector2,
    Color4,
    Ray,
    VertexBuffer,
    KeyboardEventTypes,
    Matrix,
    Quaternion,
    PointerEventTypes,
    Scalar,
    TransformNode,
    Curve3,
    Path3D,
    Animation,
    CubicEase,
    EasingFunction
} from '@babylonjs/core';
import Earcut from 'earcut';
import { WorldConfig, MetricStats, GenerationState } from '../types';
import { fetchOSMData, OSMData } from '../services/osmService';
import { fetchElevationGrid } from '../services/elevationService';
import { createTank, TankObject } from '../services/VehicleService';
import { loadMapFromCache, saveMapToCache } from '../services/cacheService';
import { Loader2, AlertTriangle, CheckCircle2, Save, LocateFixed } from 'lucide-react';

// Declare Havok global from CDN
declare const HavokPhysics: any;

// Register Earcut globally for Babylon PolygonMeshBuilder
(window as any).earcut = Earcut;

interface SceneViewerProps {
    config: WorldConfig;
    onStatsUpdate: (stats: MetricStats) => void;
    onStatsUpdate: (stats: MetricStats) => void;
    onStateChange: (state: GenerationState) => void;
    isEditorVisible?: boolean;
    onToggleUI?: () => void;
}

// Helper to store terrain data for fast O(1) height lookups
interface HeightMap {
    data: Float32Array;
    subdivisions: number;
    width: number;
    minHeight: number;
    maxHeight: number;
}

// Structure for fast road lookups
interface RoadSegment {
    name: string;
    points: Vector3[];
}

// Structure for address lookups
interface AddressPoint {
    point: Vector3;
    street: string;
    number: string;
}

const SceneViewer: React.FC<SceneViewerProps> = ({ config, onStatsUpdate, onStateChange, isEditorVisible = true, onToggleUI }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [uiState, setUiState] = useState<{ status: GenerationState, message: string }>({
        status: GenerationState.IDLE,
        message: "Ready"
    });

    // Refs to track meshes for regeneration
    const terrainRef = useRef<Mesh | null>(null);
    const buildingsRef = useRef<Mesh | null>(null);
    const waterRef = useRef<Mesh | null>(null);
    const roadsRef = useRef<Mesh | null>(null);
    const vegetationRef = useRef<Mesh | null>(null);

    // Dedicated container for physics-only meshes (invisible)
    const physicsMeshesRef = useRef<Mesh[]>([]);

    // Store processed roads for street name detection AND SPAWNING
    const roadNetworkRef = useRef<RoadSegment[]>([]);

    // Store address points for precise GPS
    const addressRegistryRef = useRef<AddressPoint[]>([]);

    // Track previous generation config to avoid unnecessary reloads
    const prevGenConfigRef = useRef<string>("");

    // Fix: Use ref to access latest config inside closure-bound render loop
    const configRef = useRef<WorldConfig>(config);
    useEffect(() => {
        configRef.current = config;
    }, [config]);

    // Stats tracking Refs
    const statsRef = useRef<Partial<MetricStats>>({
        totalBuildingsFound: 0,
        totalBuildingsRendered: 0,
        mapRadius: 0,
        elevationMin: 0,
        elevationMax: 0,
        totalRoads: 0,
        dataSizeMB: 0,
        currentStreet: "Unknown",
        currentLat: 0,
        currentLng: 0
    });

    // Performance throttling for React State updates
    const lastStatsUpdateRef = useRef<number>(0);

    // Height Map Cache for performance
    const heightMapRef = useRef<HeightMap | null>(null);

    // Tank Refs
    const tankRef = useRef<TankObject | null>(null);
    const inputMapRef = useRef<Record<string, boolean>>({});

    // Internal wrapper to update parent and local UI
    const setGenerationStatus = (status: GenerationState, msg: string) => {
        onStateChange(status);
        setUiState({ status, message: msg });
    };

    const getHeightFromCache = (x: number, z: number): number => {
        const map = heightMapRef.current;
        if (!map) return 0;

        const halfWidth = map.width / 2;
        // Bounds check
        if (x < -halfWidth || x > halfWidth || z < -halfWidth || z > halfWidth) return 0;

        // Map world coords to grid coords (0 to subdivisions)
        // Babylon Ground mesh X corresponds to width, Z to height (depth)
        const normalizedX = (x + halfWidth) / map.width;
        const normalizedZ = (z + halfWidth) / map.width; // Assuming square map

        const col = Math.floor(normalizedX * map.subdivisions);
        const row = Math.floor(normalizedZ * map.subdivisions);

        // Safety clamp
        if (col < 0 || col >= map.subdivisions || row < 0 || row >= map.subdivisions) return 0;

        const index = row * (map.subdivisions + 1) + col;
        return map.data[index] || 0;
    };

    const clearScene = () => {
        terrainRef.current?.dispose(); terrainRef.current = null;
        buildingsRef.current?.dispose(); buildingsRef.current = null;
        waterRef.current?.dispose(); waterRef.current = null;
        roadsRef.current?.dispose(); roadsRef.current = null;
        vegetationRef.current?.dispose(); vegetationRef.current = null;

        physicsMeshesRef.current.forEach(m => m.dispose());
        physicsMeshesRef.current = [];
        roadNetworkRef.current = [];
        addressRegistryRef.current = [];
        heightMapRef.current = null;
    };

    const generateProceduralWorld = async (scene: Scene, cfg: WorldConfig) => {
        setGenerationStatus(GenerationState.GENERATING, "Generating Procedural World...");
        clearScene();

        const size = 1000;
        const subdivs = 100;

        const ground = new Mesh("ground", scene);
        const vertexData = VertexData.CreateGround({
            width: size,
            height: size,
            subdivisions: subdivs
        });
        vertexData.applyToMesh(ground, true);

        const positions = ground.getVerticesData("position");
        if (!positions) {
            setGenerationStatus(GenerationState.ERROR, "Mesh Error");
            return;
        }

        const heights = new Float32Array(positions.length / 3);

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            const y = Math.sin(x * 0.01) * Math.cos(z * 0.01) * 10 + Math.random() * 2;
            positions[i + 1] = y;
            heights[i / 3] = y;
        }
        ground.updateVerticesData("position", positions);
        VertexData.ComputeNormals(positions, ground.getIndices(), ground.getVerticesData("normal"));
        ground.convertToFlatShadedMesh();

        heightMapRef.current = {
            data: heights,
            subdivisions: subdivs,
            width: size,
            minHeight: -10,
            maxHeight: 10
        };

        const groundMat = new StandardMaterial("groundMat", scene);
        groundMat.diffuseColor = new Color3(0.3, 0.4, 0.3); // Earthy Green
        groundMat.specularColor = Color3.Black(); // Strictly Matte
        groundMat.specularPower = 1000; // Reduce gloss spread
        ground.material = groundMat;
        // ground.receiveShadows = false; // Shadows disabled
        terrainRef.current = ground;

        const groundAgg = new PhysicsAggregate(ground, PhysicsShapeType.MESH, { mass: 0, restitution: 0.1 }, scene);
        physicsMeshesRef.current.push(ground);

        // Buildings
        const count = cfg.buildingDensity * 20;
        const meshes: Mesh[] = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 800;
            const z = (Math.random() - 0.5) * 800;
            const y = getHeightFromCache(x, z);
            const h = 5 + Math.random() * 20;
            const b = MeshBuilder.CreateBox("b", { height: h, width: 5 + Math.random() * 5, depth: 5 + Math.random() * 5 }, scene);
            b.position.set(x, y + h / 2, z);
            meshes.push(b);
        }

        if (meshes.length > 0) {
            const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (merged) {
                merged.name = "proc_buildings";
                const mat = new StandardMaterial("bMat", scene);
                mat.diffuseColor = new Color3(0.7, 0.7, 0.7);
                mat.specularColor = Color3.Black(); // Matte buildings
                merged.material = mat;
                new PhysicsAggregate(merged, PhysicsShapeType.MESH, { mass: 0 }, scene);
                buildingsRef.current = merged;
            }
        }

        setGenerationStatus(GenerationState.READY, "Procedural World Ready");
    };

    const generateRealWorld = async (scene: Scene, cfg: WorldConfig) => {
        setGenerationStatus(GenerationState.GENERATING, `Fetching Data for ${cfg.seed}...`);
        clearScene();

        try {
            const { lat, lng } = cfg.coordinates;
            const radius = cfg.scanRadius || 500;
            const width = radius * 2.2;
            const subdivs = 100;

            let mapData = await loadMapFromCache(`${cfg.seed}-${radius}`);
            let osmData: OSMData;
            let elevationData: number[];

            if (mapData) {
                osmData = mapData.osm;
                elevationData = mapData.elevation;
            } else {
                setGenerationStatus(GenerationState.GENERATING, "Downloading OSM & Elevation...");

                const metersPerLat = 111132.92;
                const metersPerLon = 111412.84 * Math.cos(lat * (Math.PI / 180));

                const latsToFetch: number[] = [];
                const lngsToFetch: number[] = [];

                for (let row = 0; row <= subdivs; row++) {
                    for (let col = 0; col <= subdivs; col++) {
                        const x = (col / subdivs - 0.5) * width;
                        const z = (row / subdivs - 0.5) * width;
                        const nLon = (x / metersPerLon) + lng;
                        const nLat = (z / metersPerLat) + lat;
                        latsToFetch.push(nLat);
                        lngsToFetch.push(nLon);
                    }
                }

                const [osm, elev] = await Promise.all([
                    fetchOSMData(lat, lng, radius),
                    fetchElevationGrid(latsToFetch, lngsToFetch)
                ]);

                osmData = osm;
                elevationData = elev;
                await saveMapToCache(`${cfg.seed}-${radius}`, osmData, elevationData);
            }

            setGenerationStatus(GenerationState.GENERATING, "Building Geometry...");

            // 1. Terrain Construction
            const ground = new Mesh("ground", scene);
            const vertexData = VertexData.CreateGround({
                width: width,
                height: width,
                subdivisions: subdivs
            });
            vertexData.applyToMesh(ground, true);

            const positions = ground.getVerticesData("position");
            if (!positions) throw new Error("Could not retrieve vertex data");

            let minH = Number.MAX_VALUE;
            let maxH = -Number.MAX_VALUE;
            if (elevationData.length > 0) {
                for (const h of elevationData) {
                    if (h < minH) minH = h;
                    if (h > maxH) maxH = h;
                }
            } else {
                minH = 0;
                maxH = 0;
            }

            const heightValues = new Float32Array(positions.length / 3);

            for (let i = 0; i < positions.length / 3; i++) {
                const h = (elevationData[i] !== undefined ? elevationData[i] : minH) - minH;
                positions[i * 3 + 1] = h;
                heightValues[i] = h;
            }
            ground.updateVerticesData("position", positions);
            const normals = ground.getVerticesData("normal");
            const indices = ground.getIndices();
            if (normals && indices) {
                VertexData.ComputeNormals(positions, indices, normals);
                ground.updateVerticesData("normal", normals);
            }
            ground.convertToFlatShadedMesh();

            heightMapRef.current = {
                data: heightValues,
                subdivisions: subdivs,
                width: width,
                minHeight: 0,
                maxHeight: maxH - minH
            };

            const groundMat = new StandardMaterial("groundMat", scene);
            // Matte Urban Ground Color (Dark Grey/Brown)
            groundMat.diffuseColor = new Color3(0.15, 0.16, 0.14);
            groundMat.specularColor = Color3.Black(); // STRICTLY MATTE
            groundMat.specularPower = 1000;
            ground.material = groundMat;
            // ground.receiveShadows = false; // Disabled Shadows
            terrainRef.current = ground;

            new PhysicsAggregate(ground, PhysicsShapeType.MESH, { mass: 0, restitution: 0.1, friction: 0.8 }, scene);
            physicsMeshesRef.current.push(ground);

            // 2. Buildings
            const project = (nLat: number, nLon: number) => {
                const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
                const metersPerLon = 111132.954 * Math.cos(lat * (Math.PI / 180));
                const x = (nLon - lng) * metersPerLon;
                const z = (nLat - lat) * metersPerLat;
                return new Vector3(x, 0, z);
            };

            const buildingMeshes: Mesh[] = [];
            const wallMat = new StandardMaterial("wallMat", scene);
            wallMat.diffuseColor = new Color3(0.85, 0.85, 0.9); // Off-white/Concrete
            wallMat.specularColor = new Color3(0.1, 0.1, 0.1); // Low Specular
            wallMat.backFaceCulling = false;

            osmData.buildings.forEach(way => {
                const points: Vector3[] = [];
                let centerX = 0, centerZ = 0;

                way.nodes.forEach(nid => {
                    const n = osmData.nodes.get(nid);
                    if (n) {
                        const p = project(n.lat, n.lon);
                        points.push(p);
                        centerX += p.x;
                        centerZ += p.z;
                    }
                });

                if (points.length > 2) {
                    try {
                        centerX /= points.length;
                        centerZ /= points.length;

                        const terrainH = getHeightFromCache(centerX, centerZ);

                        // Capture Address Data for GPS
                        const tHousenumber = way.tags['addr:housenumber'];
                        const tStreet = way.tags['addr:street'] || way.tags['street'];

                        if (tHousenumber && tStreet) {
                            addressRegistryRef.current.push({
                                point: new Vector3(centerX, terrainH, centerZ),
                                street: tStreet,
                                number: tHousenumber
                            });
                        }

                        // --- INTELLIGENT HEIGHT LOGIC ---
                        let buildingHeight = 8 + Math.random() * 8; // Default base: 8-16m

                        // 1. Try explicit tags from OSM
                        const tHeight = way.tags['height'];
                        const tLevels = way.tags['building:levels'] || way.tags['levels'];

                        if (tHeight) {
                            const parsed = parseFloat(tHeight);
                            if (!isNaN(parsed)) buildingHeight = parsed;
                        } else if (tLevels) {
                            const parsed = parseFloat(tLevels);
                            if (!isNaN(parsed)) buildingHeight = parsed * 3.6; // ~3.6m per floor
                        } else {
                            // 2. Heuristics based on building type
                            const type = way.tags['building'];
                            if (type === 'apartments' || type === 'office' || type === 'hotel' || type === 'public') {
                                buildingHeight = 16 + Math.random() * 24; // 5-12 floors
                            } else if (type === 'church' || type === 'cathedral' || type === 'train_station') {
                                buildingHeight = 25 + Math.random() * 20;
                            } else if (type === 'industrial' || type === 'retail' || type === 'school') {
                                buildingHeight = 10 + Math.random() * 8;
                            }
                        }

                        const poly = MeshBuilder.ExtrudePolygon("b_" + way.id, {
                            shape: points,
                            depth: buildingHeight,
                            sideOrientation: Mesh.DOUBLESIDE,
                            wrap: true
                        }, scene);

                        poly.position.y = terrainH + buildingHeight;
                        buildingMeshes.push(poly);
                    } catch (e) { }
                }
            });

            if (buildingMeshes.length > 0) {
                const merged = Mesh.MergeMeshes(buildingMeshes, true, true, undefined, false, true);
                if (merged) {
                    merged.name = "real_buildings";
                    merged.material = wallMat;
                    new PhysicsAggregate(merged, PhysicsShapeType.MESH, { mass: 0, restitution: 0.1 }, scene);
                    buildingsRef.current = merged;

                    statsRef.current.totalBuildingsFound = osmData.buildings.length;
                    statsRef.current.totalBuildingsRendered = buildingMeshes.length;
                }
            }

            // 3. Roads (Asphalt Style)
            const roadSegments: RoadSegment[] = [];
            const roadNode = new TransformNode("roads", scene);
            const roadPointsList: Vector3[][] = [];

            osmData.highways.forEach(way => {
                const points: Vector3[] = [];
                way.nodes.forEach(nid => {
                    const n = osmData.nodes.get(nid);
                    if (n) {
                        const p = project(n.lat, n.lon);
                        const h = getHeightFromCache(p.x, p.z);
                        // Roads hug terrain closely
                        points.push(new Vector3(p.x, h + 0.1, p.z));
                    }
                });
                if (points.length > 1) {
                    roadSegments.push({ name: way.tags['name'] || "Unknown", points });
                    roadPointsList.push(points);
                }
            });

            if (roadPointsList.length > 0) {
                const roadSystem = MeshBuilder.CreateLineSystem("roadSystem", { lines: roadPointsList }, scene);
                roadSystem.color = new Color3(0.4, 0.4, 0.45); // Asphalt Grey
                roadSystem.parent = roadNode;
                roadsRef.current = roadSystem;
            }

            roadNetworkRef.current = roadSegments;
            statsRef.current.totalRoads = roadSegments.length;

            // 4. Water Bodies (Fixed Logic for Rivers)
            const waterMeshes: Mesh[] = [];
            const waterMat = new StandardMaterial("waterMat", scene);
            waterMat.diffuseColor = new Color3(0.05, 0.25, 0.6); // Deep Blue
            waterMat.specularColor = new Color3(0.1, 0.1, 0.1); // Matte/Slight gloss
            waterMat.alpha = 0.9;
            waterMat.backFaceCulling = false;

            osmData.water.forEach(way => {
                const points: Vector3[] = [];

                way.nodes.forEach(nid => {
                    const n = osmData.nodes.get(nid);
                    if (n) {
                        const p = project(n.lat, n.lon);
                        points.push(p);
                    }
                });

                if (points.length > 1) {
                    try {
                        // Check if closed loop (Polygon vs Line)
                        const isClosed = points.length > 2 && points[0].equalsWithEpsilon(points[points.length - 1], 0.01);

                        // Determine width for linear water features
                        let width = 12; // Increased default width
                        const tWidth = way.tags['width'];
                        const tWaterway = way.tags['waterway'];

                        if (tWidth) {
                            const parsed = parseFloat(tWidth);
                            if (!isNaN(parsed)) width = parsed;
                        } else if (tWaterway === 'river') {
                            width = 30; // Increased from 25
                        } else if (tWaterway === 'canal') {
                            width = 20; // Increased from 15
                        } else if (tWaterway === 'stream' || tWaterway === 'ditch') {
                            width = 8; // Increased from 4
                        }

                        const halfWidth = width / 2;

                        if (isClosed) {
                            // LAKES - Use ExtrudePolygon (unchanged)
                            let avgH = 0;
                            points.forEach(p => avgH += getHeightFromCache(p.x, p.z));
                            avgH /= points.length;

                            // Lift lake slightly above shore average to avoid clipping
                            const waterLevel = avgH + 0.2;

                            const poly = MeshBuilder.ExtrudePolygon("w_poly_" + way.id, {
                                shape: points,
                                depth: 0.1,
                                sideOrientation: Mesh.DOUBLESIDE
                            }, scene);

                            poly.position.y = waterLevel;
                            waterMeshes.push(poly);

                        } else {
                            // LINEAR RIVERS / STREAMS - Use CreateRibbon for FLAT water
                            const pathLeft: Vector3[] = [];
                            const pathRight: Vector3[] = [];

                            for (let i = 0; i < points.length; i++) {
                                const current = points[i];

                                // Calculate direction for normal
                                let dir: Vector3;
                                if (i < points.length - 1) {
                                    dir = points[i + 1].subtract(current).normalize();
                                } else if (i > 0) {
                                    dir = current.subtract(points[i - 1]).normalize();
                                } else {
                                    dir = new Vector3(1, 0, 0);
                                }

                                // Perpendicular vector (Normal on XZ plane)
                                const normal = new Vector3(-dir.z, 0, dir.x);

                                // Determine water height at this point (follows terrain flow)
                                const terrainH = getHeightFromCache(current.x, current.z);

                                // Explicitly raise river water above terrain (Customer Request)
                                const waterY = terrainH + 0.5;

                                // Create left and right bank points
                                const pL = current.add(normal.scale(halfWidth));
                                pL.y = waterY;

                                const pR = current.add(normal.scale(-halfWidth));
                                pR.y = waterY;

                                pathLeft.push(pL);
                                pathRight.push(pR);
                            }

                            const ribbon = MeshBuilder.CreateRibbon("river_" + way.id, {
                                pathArray: [pathLeft, pathRight],
                                sideOrientation: Mesh.DOUBLESIDE,
                            }, scene);

                            waterMeshes.push(ribbon);
                        }
                    } catch (e) {
                        console.warn("Water gen failed", e);
                    }
                }
            });

            if (waterMeshes.length > 0) {
                const mergedWater = Mesh.MergeMeshes(waterMeshes, true, true, undefined, false, true);
                if (mergedWater) {
                    mergedWater.name = "real_water";
                    mergedWater.material = waterMat;
                    waterRef.current = mergedWater;
                }
            }

            setGenerationStatus(GenerationState.READY, `Loaded ${cfg.seed}`);

        } catch (e) {
            console.error("Gen Error", e);
            setGenerationStatus(GenerationState.ERROR, e instanceof Error ? e.message : "Failed to load map.");
        }
    };

    const fireProjectile = (scene: Scene, tank: TankObject) => {
        // Calculate spawn position at the end of the barrel
        // Barrel is 4 units long, default cylinder is centered.
        // We assume barrel was rotated and parented such that its local Y points forward (or world direction).

        const origin = tank.barrel.getAbsolutePosition();
        const direction = tank.barrel.getDirection(new Vector3(0, 1, 0)); // Local Y axis of cylinder is its height

        // Tip is at 2 units from center along the Y axis
        const spawnPos = origin.add(direction.scale(2.5));

        const sphere = MeshBuilder.CreateSphere("projectile", { diameter: 0.3, segments: 8 }, scene);
        sphere.position = spawnPos;

        const mat = new StandardMaterial("projMat", scene);
        mat.diffuseColor = new Color3(1, 0.8, 0.2);
        mat.emissiveColor = new Color3(0.8, 0.1, 0);
        sphere.material = mat;

        const agg = new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, { mass: 20, restitution: 0.2 }, scene);

        // High impulse for fast shot
        agg.body.applyImpulse(direction.scale(20000), spawnPos);

        // Despawn after 3s
        setTimeout(() => {
            sphere.dispose();
        }, 3000);
    };

    const resetCamera = () => {
        if (!sceneRef.current) return;
        const cam = sceneRef.current.activeCamera as ArcRotateCamera;
        if (cam) {
            cam.lockedTarget = null; // Detach from tank if attached

            const ease = new CubicEase();
            ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

            // Animate Target to 0,0,0
            Animation.CreateAndStartAnimation("resetTarget", cam, "target", 60, 45, cam.target, Vector3.Zero(), Animation.ANIMATIONLOOPMODE_CONSTANT, ease);

            // Animate Radius to 300 (default view)
            Animation.CreateAndStartAnimation("resetRadius", cam, "radius", 60, 45, cam.radius, 300, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);

            // Animate Beta (Height angle) to ~45 degrees (approx 0.8 rad)
            Animation.CreateAndStartAnimation("resetBeta", cam, "beta", 60, 45, cam.beta, 1.0, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
        }
    };

    useEffect(() => {
        if (!canvasRef.current) return;

        let isMounted = true;
        const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
        engineRef.current = engine;

        const scene = new Scene(engine);
        sceneRef.current = scene;
        scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
        scene.ambientColor = new Color3(0.6, 0.6, 0.6); // Slightly brighter ambient since shadows are gone

        // Input Handling
        scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.code;
            if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
                inputMapRef.current[key] = true;
            } else {
                inputMapRef.current[key] = false;
            }
        });

        // Handle Interaction (Double Click Fly-To and Shooting)
        scene.onPointerObservable.add((pointerInfo) => {
            // SHOOTING
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN &&
                pointerInfo.event.button === 0 && // Left Click
                config.enableTank &&
                tankRef.current) {

                fireProjectile(scene, tankRef.current);
            }

            // DOUBLE CLICK FLY-TO
            if (pointerInfo.type === PointerEventTypes.POINTERDOUBLETAP &&
                pointerInfo.pickInfo?.hit &&
                pointerInfo.pickInfo?.pickedPoint) {

                const targetPoint = pointerInfo.pickInfo.pickedPoint;
                const cam = scene.activeCamera as ArcRotateCamera;

                if (cam) {
                    // If camera was locked to tank, unlock it temporarily to allow fly-to
                    cam.lockedTarget = null;

                    // --- Easing Setup ---
                    const ease = new CubicEase();
                    // EASEOUT: Fast start, slow end (Deceleration)
                    ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);

                    // --- 1. Animate Target (Pan) ---
                    Animation.CreateAndStartAnimation(
                        "flyToTarget",
                        cam,
                        "target",
                        60, // FPS
                        45, // Total Frames (0.75 sec for fast movement)
                        cam.target,
                        targetPoint,
                        Animation.ANIMATIONLOOPMODE_CONSTANT,
                        ease
                    );

                    // --- 2. Animate Radius (Zoom In) ---
                    // Only zoom in if we are far away. If we are already close (< 30), stay close.
                    const endRadius = Math.min(cam.radius, 30);

                    Animation.CreateAndStartAnimation(
                        "flyToRadius",
                        cam,
                        "radius",
                        60,
                        45,
                        cam.radius,
                        endRadius,
                        Animation.ANIMATIONLOOPMODE_CONSTANT,
                        ease
                    );
                }
            }
        });

        // Handle Resize
        const handleResize = () => engine.resize();
        window.addEventListener('resize', handleResize);

        const initScene = async () => {
            // Setup Physics
            try {
                const havokInstance = await HavokPhysics({
                    locateFile: (file: string) => {
                        if (file.endsWith('.wasm')) {
                            return "https://cdn.babylonjs.com/havok/HavokPhysics.wasm";
                        }
                        return file;
                    }
                });

                if (!isMounted) return;

                const havokPlugin = new HavokPlugin(true, havokInstance);
                scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
            } catch (e) {
                console.warn("Havok Physics failed to init. Physics disabled.", e);
            }

            // Camera
            const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 300, Vector3.Zero(), scene);
            camera.attachControl(canvasRef.current, true);
            camera.wheelDeltaPercentage = 0.01;
            camera.minZ = 0.1;
            camera.maxZ = 2000;

            // Limit camera to above ground to prevent clipping
            camera.upperBetaLimit = Math.PI / 2 - 0.1;

            // --- FREE CAM CONTROLS ---
            // Disable default key bindings (Rotation) to use them for Panning in render loop
            camera.keysUp = [];
            camera.keysDown = [];
            camera.keysLeft = [];
            camera.keysRight = [];

            // Increased Sensitivity for Mouse Panning (Lower is Faster)
            camera.panningSensibility = 50;

            // Lighting
            const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
            hemiLight.intensity = 0.8;
            hemiLight.groundColor = new Color3(0.2, 0.2, 0.2);

            // Directional Light (Sun) - No Shadows
            const dirLight = new DirectionalLight("dir", new Vector3(-0.4, -0.8, -0.4), scene);
            dirLight.position = new Vector3(100, 500, 100);
            dirLight.intensity = 1.2;

            // SHADOWS DISABLED FOR PERFORMANCE
            /*
            const shadowGenerator = new ShadowGenerator(1024, dirLight);
            shadowGenerator.useBlurCloseExponentialShadowMap = true;
            shadowGenerator.blurBoxOffset = 2; 
            shadowGenerator.depthScale = 60.0;
            shadowGenerator.forceBackFacesOnly = false;
            shadowGenerator.normalBias = 0.02; 
            shadowGenerator.bias = 0.001; 
            shadowGenerator.transparencyShadow = false; 
            shadowGenerator.darkness = 0.3; 
            */

            // Game Loop
            scene.onBeforeRenderObservable.add(() => {
                const dt = scene.getEngine().getDeltaTime() / 1000;

                if (tankRef.current && tankRef.current.aggregate.body) {
                    const tank = tankRef.current;

                    // --- ARCADE PHYSICS LOGIC ---
                    const velocity = tank.aggregate.body.getLinearVelocity();
                    const transform = tank.mesh.computeWorldMatrix(true);
                    const rightDir = Vector3.TransformNormal(new Vector3(1, 0, 0), transform).normalize();
                    const sidewaysSpeed = Vector3.Dot(velocity, rightDir);
                    const driftCorrection = rightDir.scale(-sidewaysSpeed * 8000 * 20 * dt);
                    tank.aggregate.body.applyImpulse(driftCorrection, tank.mesh.getAbsolutePosition());

                    const forwardImpulse = 2500000;
                    const turnTorque = 60000000;

                    let isMoving = false;
                    if (inputMapRef.current["KeyW"]) {
                        const forward = tank.mesh.forward;
                        tank.aggregate.body.applyImpulse(forward.scale(forwardImpulse * dt), tank.mesh.getAbsolutePosition());
                        isMoving = true;
                    }
                    if (inputMapRef.current["KeyS"]) {
                        const forward = tank.mesh.forward;
                        tank.aggregate.body.applyImpulse(forward.scale(-forwardImpulse * 0.7 * dt), tank.mesh.getAbsolutePosition());
                        isMoving = true;
                    }

                    if (inputMapRef.current["KeyA"]) {
                        tank.aggregate.body.applyAngularImpulse(new Vector3(0, -turnTorque * dt, 0));
                        if (!isMoving) {
                            const forward = tank.mesh.forward;
                            tank.aggregate.body.applyImpulse(forward.scale(150000 * dt), tank.mesh.getAbsolutePosition());
                        }
                    } else if (inputMapRef.current["KeyD"]) {
                        tank.aggregate.body.applyAngularImpulse(new Vector3(0, turnTorque * dt, 0));
                        if (!isMoving) {
                            const forward = tank.mesh.forward;
                            tank.aggregate.body.applyImpulse(forward.scale(150000 * dt), tank.mesh.getAbsolutePosition());
                        }
                    }

                    const pickResult = scene.pick(scene.getEngine().getRenderWidth() / 2, scene.getEngine().getRenderHeight() / 2);
                    if (pickResult && pickResult.hit && pickResult.pickedPoint) {
                        const targetPoint = pickResult.pickedPoint;
                        const worldMatrix = tank.mesh.computeWorldMatrix(true);
                        const invertedMatrix = new Matrix();
                        worldMatrix.invertToRef(invertedMatrix);
                        const localTarget = Vector3.TransformCoordinates(targetPoint, invertedMatrix);
                        const angle = Math.atan2(localTarget.x, localTarget.z) + Math.PI;
                        const currentRotation = tank.turret.rotation.y;
                        let diff = angle - currentRotation;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        tank.turret.rotation.y = Scalar.Lerp(currentRotation, currentRotation + diff, 0.4);
                    }
                } else if (scene.activeCamera instanceof ArcRotateCamera) {
                    // --- FREE CAMERA MANUAL PANNING (WASD/ARROWS) ---
                    const cam = scene.activeCamera;

                    // Speed factor scales with camera radius (zoom level) so you move faster when zoomed out
                    const panSpeed = 100 * dt * (cam.radius / 50);

                    const forward = cam.getDirection(Vector3.Forward());
                    forward.y = 0; // Constrain to ground plane
                    forward.normalize();

                    const right = cam.getDirection(Vector3.Right());
                    right.y = 0;
                    right.normalize();

                    if (inputMapRef.current["KeyW"] || inputMapRef.current["ArrowUp"]) {
                        cam.target.addInPlace(forward.scale(panSpeed));
                    }
                    if (inputMapRef.current["KeyS"] || inputMapRef.current["ArrowDown"]) {
                        cam.target.addInPlace(forward.scale(-panSpeed));
                    }
                    if (inputMapRef.current["KeyA"] || inputMapRef.current["ArrowLeft"]) {
                        cam.target.addInPlace(right.scale(-panSpeed));
                    }
                    if (inputMapRef.current["KeyD"] || inputMapRef.current["ArrowRight"]) {
                        cam.target.addInPlace(right.scale(panSpeed));
                    }
                }
            });

            // Render Loop
            engine.runRenderLoop(() => {
                if (scene && scene.activeCamera) {
                    scene.render();

                    const now = Date.now();
                    if (onStatsUpdate && (now - lastStatsUpdateRef.current > 200)) { // Faster updates for GPS (200ms)

                        // IMPORTANT: Use the ref here to avoid stale closures if config changes
                        const cfg = configRef.current;

                        let nearestStreet = "Off-road";
                        let currentLat = 0;
                        let currentLng = 0;
                        let targetPos: Vector3 | null = null;

                        // --- REAL TIME GPS CALCULATION ---
                        // Support both Tank Mode AND Free Camera Mode (projecting to ground)

                        if (cfg.enableTank && tankRef.current) {
                            targetPos = tankRef.current.mesh.getAbsolutePosition();
                        } else {
                            // Raycast from camera center to ground
                            const ray = scene.createPickingRay(
                                scene.getEngine().getRenderWidth() / 2,
                                scene.getEngine().getRenderHeight() / 2,
                                Matrix.Identity(),
                                scene.activeCamera
                            );

                            const hit = scene.pickWithRay(ray, (mesh) => mesh.name === "ground" || mesh.name === "real_buildings" || mesh.name.startsWith("proc_buildings"));
                            if (hit && hit.pickedPoint) {
                                targetPos = hit.pickedPoint;
                            }
                        }

                        if (targetPos && cfg.mode === 'REAL') {
                            // REVERSE PROJECTION to get Lat/Lng
                            // x = (nLon - lng) * metersPerLon
                            // z = (nLat - lat) * metersPerLat
                            const centerLat = cfg.coordinates.lat;
                            const centerLng = cfg.coordinates.lng;
                            const latRad = centerLat * (Math.PI / 180);

                            // Constants must match projection logic in generateRealWorld
                            const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * latRad); // Simplified for speed
                            const metersPerLon = 111132.954 * Math.cos(latRad);

                            currentLat = centerLat + (targetPos.z / metersPerLat);
                            currentLng = centerLng + (targetPos.x / metersPerLon);

                            // --- STREET FINDER ---
                            if (roadNetworkRef.current.length > 0) {
                                let minDist = 30; // 30m detection radius

                                for (const road of roadNetworkRef.current) {
                                    for (let i = 0; i < road.points.length; i += 2) {
                                        const p = road.points[i];
                                        const dx = targetPos.x - p.x;
                                        const dz = targetPos.z - p.z;
                                        const dist = Math.sqrt(dx * dx + dz * dz);

                                        if (dist < minDist) {
                                            minDist = dist;
                                            nearestStreet = road.name;
                                        }
                                    }
                                }
                            }

                            // --- PRECISE ADDRESS FINDER (OVERRIDES STREET) ---
                            if (addressRegistryRef.current.length > 0) {
                                let minAddrDist = 35; // Search radius for building address (slightly larger than house size)
                                let bestAddrStr: string | null = null;

                                for (const addr of addressRegistryRef.current) {
                                    const dx = targetPos.x - addr.point.x;
                                    const dz = targetPos.z - addr.point.z;
                                    // Check squared distance to avoid Sqrt for every building (perf)
                                    const distSq = dx * dx + dz * dz;

                                    if (distSq < minAddrDist * minAddrDist) {
                                        minAddrDist = Math.sqrt(distSq);
                                        bestAddrStr = `${addr.street} ${addr.number}`;
                                    }
                                }

                                if (bestAddrStr) {
                                    nearestStreet = bestAddrStr;
                                }
                            }
                        }

                        onStatsUpdate({
                            drawCalls: scene.instrumentation?.renderTimeCounter?.lastSecAverage || 0,
                            activeMeshes: scene.getActiveMeshes().length,
                            fps: engine.getFps(),
                            physicsBodies: scene.getPhysicsEngine()?.getBodies().length || 0,
                            totalBuildingsFound: statsRef.current.totalBuildingsFound || 0,
                            totalBuildingsRendered: statsRef.current.totalBuildingsRendered || 0,
                            mapRadius: statsRef.current.mapRadius || 0,
                            elevationMin: statsRef.current.elevationMin || 0,
                            elevationMax: statsRef.current.elevationMax || 0,
                            totalRoads: statsRef.current.totalRoads || 0,
                            totalVertices: scene.getTotalVertices(),
                            dataSizeMB: statsRef.current.dataSizeMB || 0,
                            currentStreet: nearestStreet,
                            currentLat: currentLat,
                            currentLng: currentLng
                        });
                        lastStatsUpdateRef.current = now;
                    }
                }
            });

            if (isMounted) setIsSceneReady(true);
        };

        initScene();

        return () => {
            isMounted = false;
            window.removeEventListener('resize', handleResize);
            engine.dispose();
            engineRef.current = null;
            sceneRef.current = null;
            setIsSceneReady(false);
        };
    }, []);

    // Effect to handle Generation triggers and Tank toggle
    useEffect(() => {
        if (!sceneRef.current || !isSceneReady) return;

        // Trigger Generation when config changes (and scene is ready)
        // Use a composite key to avoid over-triggering
        const genKey = `${config.seed}-${config.mode}-${config.scanRadius}`;

        if (prevGenConfigRef.current !== genKey) {
            if (config.mode === 'REAL') {
                generateRealWorld(sceneRef.current, config);
            } else {
                generateProceduralWorld(sceneRef.current, config);
            }
            prevGenConfigRef.current = genKey;
        }

        // Handle Tank Spawn/Despawn
        if (config.enableTank && !tankRef.current) {
            // Find safe spawn y
            const y = getHeightFromCache(0, 0);
            const tank = createTank(sceneRef.current, new Vector3(0, y + 2, 0));
            tankRef.current = tank;

            // Lock Camera
            const cam = sceneRef.current.getCameraByName("camera") as ArcRotateCamera;
            if (cam) {
                cam.lockedTarget = tank.mesh;
                cam.radius = 15;
                cam.beta = 1.3;
            }
        } else if (!config.enableTank && tankRef.current) {
            // Cleanup Tank
            tankRef.current.mesh.dispose(); // Physics aggregate usually auto-disposes attached mesh's physics
            tankRef.current = null;

            // Reset Camera
            const cam = sceneRef.current.getCameraByName("camera") as ArcRotateCamera;
            if (cam) {
                cam.lockedTarget = null;
                cam.setTarget(Vector3.Zero());
                cam.radius = 300;
            }
        }
    }, [config, isSceneReady]);

    return (
        <div className="w-full h-full relative">
            <canvas ref={canvasRef} className="w-full h-full outline-none block" />

            {/* Loading Overlay */}
            {/* Loading Overlay - Green Spinning Square Style */}
            {uiState.status !== GenerationState.READY && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50">
                    {/* Custom CSS for Green Spinner defined in global CSS or index.html, using inline style to ensure fallback */}
                    <style>{`
                 .spinner-square {
                    width: 30px;
                    height: 30px;
                    background-color: transparent;
                    border: 4px solid #0f0;
                    /* Pixelated look: No shadows/glows, strictly sharp */
                    image-rendering: pixelated; 
                    /* Jerky animation: One axis (Z), One direction (+360deg), with overshoot (back-bow) */
                    animation: spin-jerky 1.2s infinite cubic-bezier(0.34, 1.56, 0.64, 1);
                 }
                 @keyframes spin-jerky {
                    0% { transform: rotate(0deg); }
                    /* The overshoot is handled by the cubic-bezier */
                    100% { transform: rotate(90deg); }
                 }
                 .loading-text {
                    /* Main font from commonStyles.ts */
                    font-family: 'Press Start 2P', cursive;
                    font-size: 20px;
                    font-weight: bold;
                    letter-spacing: 2px;
                    color: #0f0;
                    text-shadow: none; /* Removed blur for pixel look */
                    animation: blink 0.8s infinite steps(2, start); /* Pixelated blinking */
                 }
                 @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                 }
               `}</style>
                    <div className="flex items-center gap-5">
                        <div className="spinner-square"></div>
                        <div className="loading-text">{uiState.message.toUpperCase()}</div>
                    </div>

                    {uiState.status === GenerationState.ERROR && (
                        <div className="flex items-center gap-2 mt-4 text-red-400 font-mono text-sm border border-red-900/50 bg-red-900/20 px-3 py-2 rounded">
                            <AlertTriangle className="w-4 h-4" />
                            <span>CHECK CONSOLE FOR ERROR DETAILS</span>
                        </div>
                    )}
                </div>
            )}

            {/* Restore Editor Button (When UI is hidden and ready) */}
            {uiState.status === GenerationState.READY && !isEditorVisible && onToggleUI && (
                <button
                    onClick={onToggleUI}
                    className="absolute top-6 left-6 z-50 bg-slate-900/90 hover:bg-indigo-600 text-indigo-400 hover:text-white px-4 py-2 rounded border border-indigo-500/30 shadow-lg transition-all backdrop-blur-sm group flex items-center gap-2 font-mono text-xs font-bold"
                >
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    RESTORE EDITOR UI
                </button>
            )}

            {/* Camera Controls Overlay */}
            {uiState.status === GenerationState.READY && (
                <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
                    <button
                        onClick={resetCamera}
                        className="bg-slate-900/90 hover:bg-indigo-600 text-indigo-400 hover:text-white p-3 rounded-full border border-indigo-500/30 shadow-lg transition-all backdrop-blur-sm group"
                        title="Reset Camera to Center"
                    >
                        <LocateFixed className="w-6 h-6" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default SceneViewer;