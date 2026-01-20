
import React, { useRef, useEffect, useState, useMemo, useLayoutEffect } from 'react';
import { Canvas, useThree, useFrame, invalidate } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Environment, ContactShadows, GizmoHelper, GizmoViewcube, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { SelectionBox } from 'three-stdlib';
import { CubeElement, ToolMode } from '../types';
import TerrainMesh from './TerrainMesh';
import { InstancedBuildings } from './InstancedBuildings';
import { PolygonBuildings } from './PolygonBuildings';
import { SmoothRoads } from './SmoothRoads';
import { SmoothRivers } from './SmoothRivers';


interface SceneProps {
    cubes: CubeElement[];
    selectedIds: string[];
    onSelect: (ids: string | string[], additive?: boolean) => void;
    onTransform: (ids: string[], updates: Partial<CubeElement> | ((prev: CubeElement) => Partial<CubeElement>)) => void;
    onBatchTransform: (updates: { id: string, position?: any, rotation?: any, size?: any }[]) => void;
    onTransformEnd: () => void;
    toolMode: ToolMode;
    snapGrid: number | null;
    snapAngle: number | null;
    transformSpace?: 'world' | 'local';

    backgroundColor: string;
    gridColor: string;
    sectionColor: string;

    // Custom Grid Settings
    gridCellSize?: number;
    gridSectionSize?: number;
    gridCellThickness?: number;
    gridSectionThickness?: number;

    showGrid: boolean;
    showWireframe: boolean;
    showAxes: boolean;
    performanceMode?: boolean;

    onAddCube?: (position: { x: number, y: number, z: number }, size: { x: number, y: number, z: number }, color: string) => void;
    onPaintCube?: (id: string) => void;
    onContextMenu?: (x: number, y: number, id: string) => void;

    onCanvasReady?: (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
    draggedItem?: string | null;
    onDropItem?: (itemType: string, position: { x: number, y: number, z: number }) => void;
    dragPointerRef?: React.MutableRefObject<THREE.Vector2>;
    cameraMode: 'perspective' | 'orthographic';

    // Terrain mesh data (optional)
    terrainData?: {
        elevationGrid: number[];
        gridSize: number;
        width: number;
        baseElevation: number;
    };
}

// Drag Preview Component (Moved to top to avoid hoisting issues)
const DragPreview = ({ itemType, onDrop, snapGrid, dragPointerRef }: { itemType: string, onDrop: (pos: any) => void, snapGrid: number | null, dragPointerRef?: React.MutableRefObject<THREE.Vector2> }) => {
    const { camera, scene } = useThree();
    const [pos, setPos] = useState<THREE.Vector3 | null>(null);

    useFrame(({ raycaster, mouse }) => {
        // Use native drag pointer if available (during native DnD, R3F mouse might be stale)
        const pointer = (dragPointerRef && (dragPointerRef.current.x !== 0 || dragPointerRef.current.y !== 0))
            ? dragPointerRef.current
            : mouse;

        raycaster.setFromCamera(pointer, camera);

        // 1. Try intersecting with existing objects first
        const candidates: THREE.Object3D[] = [];
        scene.traverse((obj) => {
            // Filter: Meshes that are not the ghost itself and are part of the main scene (userData.type='cube')
            if (obj instanceof THREE.Mesh && obj.userData?.type === 'cube' && obj.visible) {
                candidates.push(obj);
            }
        });

        const intersects = raycaster.intersectObjects(candidates, false);

        if (intersects.length > 0) {
            // Snapping to object surface
            const hit = intersects[0];
            const p = hit.point.clone();
            const n = hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld).normalize() || new THREE.Vector3(0, 1, 0);

            // "Stick" to surface: Position center 0.5 units away from surface along normal
            // Assuming 1x1x1 cube (radius 0.5)
            const offset = 0.5;
            p.add(n.multiplyScalar(offset));

            // Apply grid snap if enabled (local to the surface? or global?)
            // Usually, global snap might fight with surface snapping. 
            // Let's snap the *result* to grid if on ground, but maybe just rounded if on object?
            // For now, let's strictly follow surface.

            if (snapGrid) {
                // If snapping is on, maybe we snap the calculated center?
                p.x = Math.round(p.x / snapGrid) * snapGrid;
                p.y = Math.round(p.y / snapGrid) * snapGrid;
                p.z = Math.round(p.z / snapGrid) * snapGrid;
            }

            setPos(p);
        } else {
            // 2. Fallback to Ground Plane
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            const hit = raycaster.ray.intersectPlane(plane, target);

            if (hit) {
                if (snapGrid) {
                    target.x = Math.round(target.x / snapGrid) * snapGrid;
                    target.z = Math.round(target.z / snapGrid) * snapGrid;
                }
                target.y = Math.max(0, target.y + 0.5); // Center is 0.5 up
                setPos(target);
            } else {
                setPos(null);
            }
        }
    });

    return (
        <>
            {/* Invisible plane not needed for raycasting, but kept for click events if necessary. 
                Using a math plane in useFrame is more reliable for updates. */}

            {/* Ghost Object */}
            {pos && (
                <group position={[pos.x, 0.5, pos.z]}>
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshBasicMaterial color="#4ade80" transparent opacity={0.5} wireframe />
                    </mesh>
                </group>
            )}

            {/* Capture mouse up anywhere */}
            <mesh visible={false} onPointerUp={(e) => {
                if (pos) onDrop({ x: pos.x, y: Math.max(0, pos.y + 0.5), z: pos.z });
            }}>
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial visible={false} />
            </mesh>
        </>
    );
};

const sharedBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

const StatsTracker = ({ onUpdate }: { onUpdate: (stats: any) => void }) => {
    const { gl } = useThree();
    const lastTime = useRef(performance.now());
    const frames = useRef(0);

    useFrame(() => {
        const time = performance.now();
        frames.current++;
        if (time >= lastTime.current + 1000) {
            const fps = Math.round((frames.current * 1000) / (time - lastTime.current));
            const ms = Math.round(1000 / fps);

            const calls = gl.info.render.calls;
            const tris = gl.info.render.triangles;
            const geos = gl.info.memory.geometries;

            onUpdate({ fps, ms, calls, tris, geos });
            lastTime.current = time;
            frames.current = 0;
        }
    });
    return null;
};

const PerformanceUI = ({ stats }: { stats: { fps: number, ms: number, calls: number, tris: number, geos: number } }) => {
    const [expanded, setExpanded] = useState(false);

    const getFpsColor = (fps: number) => {
        if (fps >= 55) return '#4ade80';
        if (fps >= 30) return '#facc15';
        return '#f87171';
    };

    const color = getFpsColor(stats.fps);

    return (
        <div
            onClick={() => setExpanded(!expanded)}
            style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(8px)',
                padding: '8px 12px',
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#e2e8f0',
                zIndex: 40,
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                userSelect: 'none',
                minWidth: expanded ? '140px' : 'auto',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: 'auto'
            }}
            className="group hover:border-gray-600"
        >
            <div className="flex items-center gap-2">
                <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}`
                }} />
                <span className="font-bold tabular-nums text-xs">{stats.fps} FPS</span>
                <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-[9px] text-gray-500 ml-auto transition-transform ${expanded ? '' : 'group-hover:translate-y-0.5'}`} />
            </div>

            {expanded && (
                <div className="mt-3 pt-2 border-t border-gray-700/50 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[10px] text-gray-400 animate-in fade-in slide-in-from-top-1 duration-200">
                    <span>Frame Time</span> <span className="text-gray-200 tabular-nums">{stats.ms}ms</span>
                    <span>Draw Calls</span> <span className="text-gray-200 tabular-nums">{stats.calls}</span>
                    <span>Triangles</span> <span className="text-gray-200 tabular-nums">{stats.tris.toLocaleString()}</span>
                    <span>Geometries</span> <span className="text-gray-200 tabular-nums">{stats.geos}</span>
                </div>
            )}
        </div>
    );
};

const BuildTool = ({
    active,
    cubes,
    snapGrid,
    onAddCube
}: {
    active: boolean,
    cubes: CubeElement[],
    snapGrid: number | null,
    onAddCube?: (pos: any, size: any, color: string) => void
}) => {
    const { camera, scene, pointer, gl } = useThree();
    const ghostRef = useRef<THREE.Mesh>(null);
    const raycaster = useRef(new THREE.Raycaster());
    const [previewPos, setPreviewPos] = useState<THREE.Vector3 | null>(null);
    const [targetColor, setTargetColor] = useState('#ffffff');
    const [targetSize, setTargetSize] = useState(new THREE.Vector3(1, 1, 1));

    useFrame(() => {
        if (!active || !ghostRef.current) return;

        raycaster.current.setFromCamera(pointer, camera);

        const objects: THREE.Object3D[] = [];
        scene.traverse(obj => {
            if (obj.userData && obj.userData.id && obj.userData.type !== 'group') objects.push(obj);
        });

        const intersects = raycaster.current.intersectObjects(objects, false);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const normal = intersect.face?.normal;
            if (normal) {
                const targetObj = intersect.object;
                const size = new THREE.Vector3(targetObj.scale.x, targetObj.scale.y, targetObj.scale.z);
                const worldNormal = normal.clone().transformDirection(targetObj.matrixWorld).round();

                const hitPos = new THREE.Vector3();
                targetObj.getWorldPosition(hitPos);

                setTargetSize(size);

                if (targetObj instanceof THREE.Mesh && !Array.isArray(targetObj.material)) {
                    const mat = targetObj.material as THREE.MeshStandardMaterial;
                    setTargetColor(mat.color.getHexString());
                }

                const offset = new THREE.Vector3(
                    worldNormal.x * size.x,
                    worldNormal.y * size.y,
                    worldNormal.z * size.z
                );

                const newPos = hitPos.clone().add(offset);

                ghostRef.current.position.copy(newPos);
                ghostRef.current.rotation.copy(targetObj.rotation);
                ghostRef.current.scale.copy(size);
                ghostRef.current.visible = true;
                setPreviewPos(newPos);
                return;
            }
        }

        ghostRef.current.visible = false;
        setPreviewPos(null);
    });

    useEffect(() => {
        const handleClick = (e: PointerEvent) => {
            if (!active || !previewPos || e.button !== 0) return;
            if (onAddCube) {
                onAddCube(
                    { x: previewPos.x, y: previewPos.y, z: previewPos.z },
                    { x: targetSize.x, y: targetSize.y, z: targetSize.z },
                    '#' + targetColor
                );
            }
        };
        gl.domElement.addEventListener('pointerdown', handleClick);
        return () => gl.domElement.removeEventListener('pointerdown', handleClick);
    }, [active, previewPos, targetColor, targetSize, onAddCube, gl]);

    if (!active) return null;

    return (
        <mesh ref={ghostRef} geometry={sharedBoxGeometry}>
            <meshBasicMaterial color="#00ff00" transparent opacity={0.5} wireframe />
        </mesh>
    );
};

const SceneNode = React.memo(({
    id,
    cubes,
    selectedIds,
    onSelect,
    showWireframe,
    nodesRef,
    onContextMenu,
    toolMode,
    onPaintCube,
    isDraggingRef
}: {
    id: string;
    cubes: CubeElement[];
    selectedIds: string[];
    onSelect: (ids: string | string[], additive?: boolean) => void;
    showWireframe: boolean;
    nodesRef: React.MutableRefObject<Record<string, THREE.Object3D>>;
    onContextMenu?: (x: number, y: number, id: string) => void;
    toolMode: ToolMode;
    onPaintCube?: (id: string) => void;
    isDraggingRef?: React.MutableRefObject<boolean>;
}) => {
    const cube = cubes.find(c => c.id === id);
    const children = cubes.filter(c => c.parentId === id);
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);

    // Skip syncing mesh position from React state during drag to prevent position reset
    const isSelectedAndDragging = isDraggingRef?.current && selectedIds.includes(id);

    useLayoutEffect(() => {
        if (groupRef.current) {
            nodesRef.current[id] = groupRef.current;
            // Only update position from React state when NOT dragging
            if (!isSelectedAndDragging) {
                groupRef.current.position.set(cube.position.x, cube.position.y, cube.position.z);
                groupRef.current.rotation.set(
                    THREE.MathUtils.degToRad(cube.rotation?.x || 0),
                    THREE.MathUtils.degToRad(cube.rotation?.y || 0),
                    THREE.MathUtils.degToRad(cube.rotation?.z || 0)
                );
            }
        }
        return () => { delete nodesRef.current[id]; };
    }, [id, nodesRef, cube.position, cube.rotation, isSelectedAndDragging]);

    if (!cube || !cube.visible) return null;

    const rotation: [number, number, number] = [
        THREE.MathUtils.degToRad(cube.rotation.x),
        THREE.MathUtils.degToRad(cube.rotation.y),
        THREE.MathUtils.degToRad(cube.rotation.z)
    ];

    const isSelected = selectedIds.includes(cube.id);

    const handleNodeClick = (e: any) => {
        e.stopPropagation();
        if (cube.isLocked) return;

        if (toolMode === ToolMode.PAINT) {
            if (onPaintCube) onPaintCube(cube.id);
            return;
        }

        onSelect(cube.id, e.shiftKey || e.ctrlKey || e.metaKey);
    };

    const handleContextMenu = (e: any) => {
        e.stopPropagation();
        if (onContextMenu) {
            onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY, cube.id);
        }
    };

    const scale: [number, number, number] = cube.type === 'group'
        ? [cube.size.x, cube.size.y, cube.size.z]
        : [1, 1, 1];

    const isTransparent = (cube.material?.transparent || (cube.material?.opacity ?? 1) < 1);

    return (
        <group
            ref={groupRef}
            name={`node_${cube.id}`}
            userData={{ id: cube.id, isLocked: cube.isLocked, isGroup: cube.type === 'group' }}
            scale={scale}
        >
            {cube.type === 'cube' && (
                <mesh
                    ref={meshRef}
                    name={`mesh_${cube.id}`}
                    userData={{ id: cube.id, isLocked: cube.isLocked, type: 'cube' }}
                    onClick={handleNodeClick}
                    onContextMenu={handleContextMenu}
                    onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
                    onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
                    geometry={sharedBoxGeometry}
                    scale={[cube.size.x, cube.size.y, cube.size.z]}
                    castShadow={!cube.isLocked}
                    receiveShadow={!cube.isLocked}
                >
                    <meshStandardMaterial
                        color={cube.color}
                        roughness={cube.material?.roughness ?? 0.7}
                        metalness={cube.material?.metalness ?? 0.1}
                        emissive={cube.color}
                        emissiveIntensity={cube.material?.emissive ?? 0}
                        opacity={cube.material?.opacity ?? 1}
                        transparent={isTransparent}
                        depthWrite={!isTransparent}
                        alphaTest={isTransparent ? 0.1 : 0}
                        wireframe={showWireframe}
                    />
                    {isSelected && (
                        <lineSegments scale={[1.02, 1.02, 1.02]}>
                            <edgesGeometry args={[sharedBoxGeometry]} />
                            <lineBasicMaterial color="#ffff00" linewidth={2} depthTest={false} toneMapped={false} />
                        </lineSegments>
                    )}
                    {toolMode === ToolMode.PAINT && hovered && (
                        <lineSegments scale={[1.05, 1.05, 1.05]}>
                            <edgesGeometry args={[sharedBoxGeometry]} />
                            <lineBasicMaterial color="#ffffff" linewidth={2} depthTest={false} toneMapped={false} transparent opacity={0.5} />
                        </lineSegments>
                    )}
                </mesh>
            )}

            {children.map(child => (
                <SceneNode
                    key={child.id}
                    id={child.id}
                    cubes={cubes}
                    selectedIds={selectedIds}
                    onSelect={onSelect}
                    showWireframe={showWireframe}
                    nodesRef={nodesRef}
                    onContextMenu={onContextMenu}
                    toolMode={toolMode}
                    onPaintCube={onPaintCube}
                    isDraggingRef={isDraggingRef}
                />
            ))}
        </group>
    );
}, (prev, next) => {
    if (prev.selectedIds.includes(prev.id) !== next.selectedIds.includes(next.id)) return false;
    if (prev.showWireframe !== next.showWireframe) return false;
    if (prev.toolMode !== next.toolMode) return false;

    const pC = prev.cubes.find(c => c.id === prev.id);
    const nC = next.cubes.find(c => c.id === next.id);

    if (pC === nC) {
        const pKids = prev.cubes.filter(c => c.parentId === prev.id);
        const nKids = next.cubes.filter(c => c.parentId === next.id);
        if (pKids.length !== nKids.length) return false;
        for (let i = 0; i < pKids.length; i++) if (pKids[i] !== nKids[i]) return false;
        return true;
    }

    if (!pC || !nC) return false;
    if (pC.name !== nC.name) return false;
    if (pC.color !== nC.color) return false;
    if (pC.visible !== nC.visible) return false;
    if (pC.isLocked !== nC.isLocked) return false;
    if (pC.isFavorite !== nC.isFavorite) return false;

    if (pC.position.x !== nC.position.x || pC.position.y !== nC.position.y || pC.position.z !== nC.position.z) return false;
    if (pC.rotation.x !== nC.rotation.x || pC.position.y !== nC.position.y || pC.position.z !== nC.position.z) return false;
    if (pC.size.x !== nC.size.x || pC.size.y !== nC.size.y || pC.size.z !== nC.size.z) return false;

    const pM = pC.material;
    const nM = nC.material;
    if (pM?.roughness !== nM?.roughness) return false;
    if (pM?.metalness !== nM?.metalness) return false;
    if (pM?.emissive !== nM?.emissive) return false;
    if (pM?.opacity !== nM?.opacity) return false;

    return true;
});

const SelectionManager: React.FC<{
    cubes: CubeElement[];
    toolMode: ToolMode;
    onSelect: (ids: string[], additive?: boolean) => void;
}> = React.memo(({ cubes, toolMode, onSelect }) => {
    const { camera, scene, gl } = useThree();
    const selectionBox = useRef<SelectionBox | null>(null);
    const isDragging = useRef(false);
    const startPoint = useRef({ x: 0, y: 0 });
    const helperDiv = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        selectionBox.current = new SelectionBox(camera, scene);
    }, [camera, scene]);

    const findRootId = (id: string): string => {
        let currentId = id;
        let attempts = 0;
        while (attempts < 50) {
            const node = cubes.find(c => c.id === currentId);
            if (!node || !node.parentId) return currentId;
            currentId = node.parentId;
            attempts++;
        }
        return currentId;
    };

    useEffect(() => {
        if (!helperDiv.current) {
            const div = document.createElement('div');
            Object.assign(div.style, {
                position: 'fixed', border: '1px solid #55aaff', backgroundColor: 'rgba(85, 170, 255, 0.25)',
                pointerEvents: 'none', display: 'none', zIndex: '1000'
            });
            document.body.appendChild(div);
            helperDiv.current = div;
        }
        return () => { if (helperDiv.current && helperDiv.current.parentNode) helperDiv.current.parentNode.removeChild(helperDiv.current); };
    }, []);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (toolMode !== ToolMode.SELECT || event.button !== 0 || (!event.shiftKey && !event.ctrlKey && !event.metaKey)) return;
            isDragging.current = true;
            startPoint.current = { x: event.clientX, y: event.clientY };
            if (helperDiv.current) {
                Object.assign(helperDiv.current.style, {
                    left: event.clientX + 'px', top: event.clientY + 'px', width: '0px', height: '0px', display: 'block'
                });
            }
            const rect = gl.domElement.getBoundingClientRect();
            if (selectionBox.current) {
                selectionBox.current.startPoint.set(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1,
                    0.5
                );
            }
        };

        const onPointerMove = (event: PointerEvent) => {
            if (!isDragging.current) return;
            invalidate();
            if (helperDiv.current) {
                const minX = Math.min(startPoint.current.x, event.clientX);
                const maxX = Math.max(startPoint.current.x, event.clientX);
                const minY = Math.min(startPoint.current.y, event.clientY);
                const maxY = Math.max(startPoint.current.y, event.clientY);
                Object.assign(helperDiv.current.style, {
                    left: minX + 'px', top: minY + 'px', width: (maxX - minX) + 'px', height: (maxY - minY) + 'px'
                });
            }
            const rect = gl.domElement.getBoundingClientRect();
            if (selectionBox.current) {
                selectionBox.current.endPoint.set(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1,
                    0.5
                );
            }
        };

        const onPointerUp = (event: PointerEvent) => {
            if (!isDragging.current) return;
            isDragging.current = false;
            if (helperDiv.current) helperDiv.current.style.display = 'none';
            const dist = Math.sqrt(Math.pow(event.clientX - startPoint.current.x, 2) + Math.pow(event.clientY - startPoint.current.y, 2));
            if (dist < 5) return;
            if (selectionBox.current) {
                const rect = gl.domElement.getBoundingClientRect();
                selectionBox.current.endPoint.set(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1,
                    0.5
                );
                const allSelected = selectionBox.current.select();
                const rawIds = allSelected.filter((mesh: any) => mesh.userData?.id && !mesh.userData.isLocked).map((mesh: any) => mesh.userData.id);
                const rootIds = Array.from(new Set(rawIds.map((id: string) => findRootId(id))));
                if (rootIds.length > 0) onSelect(rootIds as string[], true);
            }
        };
        gl.domElement.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        return () => {
            gl.domElement.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        }
    }, [gl, toolMode, onSelect, cubes]);
    return null;
});

const MultiTransformControls: React.FC<{
    cubes: CubeElement[];
    selectedIds: string[];
    toolMode: ToolMode;
    onBatchTransform: (updates: { id: string, position?: any, rotation?: any, size?: any }[]) => void;
    onTransformEnd: () => void;
    snapGrid: number | null;
    snapAngle: number | null;
    nodesRef: React.MutableRefObject<Record<string, THREE.Object3D>>;
    space: 'world' | 'local';
    isDraggingRef: React.MutableRefObject<boolean>;
}> = ({ cubes, selectedIds, toolMode, onBatchTransform, onTransformEnd, snapGrid, snapAngle, nodesRef, space, isDraggingRef }) => {

    const selectedCubes = useMemo(() => cubes.filter(c => selectedIds.includes(c.id) && !c.isLocked), [cubes, selectedIds]);

    const pivot = useRef<THREE.Group>(null);
    const transformRef = useRef<any>(null);
    // Added originalSize to track cube.size for proper scaling
    const initialTransforms = useRef<Map<string, {
        pos: THREE.Vector3,
        rot: THREE.Euler,
        scale: THREE.Vector3,
        originalSize: { x: number, y: number, z: number }  // Store original cube size
    }>>(new Map());
    const initialPivotInverse = useRef<THREE.Matrix4>(new THREE.Matrix4());

    const centroid = useMemo(() => {
        if (selectedCubes.length === 0) return new THREE.Vector3();
        const center = new THREE.Vector3();
        selectedCubes.forEach(c => center.add(new THREE.Vector3(c.position.x, c.position.y, c.position.z)));
        center.divideScalar(selectedCubes.length);
        return center;
    }, [selectedCubes]);

    useEffect(() => { invalidate(); }, [centroid]);

    useEffect(() => {
        if (pivot.current && selectedCubes.length > 1) {
            pivot.current.position.copy(centroid);
            pivot.current.rotation.set(0, 0, 0);
            pivot.current.scale.set(1, 1, 1);
            invalidate();
        }
    }, [centroid, selectedCubes.length]);

    const modeMap: Record<string, "translate" | "rotate" | "scale"> = {
        [ToolMode.MOVE]: "translate", [ToolMode.ROTATE]: "rotate", [ToolMode.SCALE]: "scale",
    };

    const dragStartCache = useRef<{ id: string, size: { x: number, y: number, z: number }, rotation: THREE.Euler, position: THREE.Vector3 } | null>(null);

    if (selectedCubes.length === 0 || !modeMap[toolMode]) return null;

    if (selectedCubes.length === 1) {
        const targetObj = nodesRef.current[selectedCubes[0].id];
        if (!targetObj) return null;

        return (
            <TransformControls
                object={targetObj}
                mode={modeMap[toolMode]}
                space={space}
                translationSnap={snapGrid}
                rotationSnap={snapAngle}
                scaleSnap={snapGrid}
                onMouseDown={() => {
                    isDraggingRef.current = true;
                    // Capture initial state
                    const c = selectedCubes[0];
                    dragStartCache.current = {
                        id: c.id,
                        size: { ...c.size },
                        rotation: new THREE.Euler(
                            THREE.MathUtils.degToRad(c.rotation.x),
                            THREE.MathUtils.degToRad(c.rotation.y),
                            THREE.MathUtils.degToRad(c.rotation.z)
                        ),
                        position: new THREE.Vector3(c.position.x, c.position.y, c.position.z)
                    };
                }}
                onMouseUp={() => {
                    isDraggingRef.current = false;
                    dragStartCache.current = null;
                    onTransformEnd();
                }}
                onObjectChange={() => {
                    const obj = nodesRef.current[selectedCubes[0].id];
                    if (obj && dragStartCache.current && dragStartCache.current.id === selectedCubes[0].id) {
                        const start = dragStartCache.current;

                        const update: any = {
                            id: start.id,
                            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                            rotation: {
                                x: THREE.MathUtils.radToDeg(obj.rotation.x),
                                y: THREE.MathUtils.radToDeg(obj.rotation.y),
                                z: THREE.MathUtils.radToDeg(obj.rotation.z)
                            },
                        };

                        // Only update size if scaling (relative to start size)
                        if (modeMap[toolMode] === "scale") {
                            update.size = {
                                x: start.size.x * obj.scale.x,
                                y: start.size.y * obj.scale.y,
                                z: start.size.z * obj.scale.z
                            };
                        }

                        onBatchTransform([update]);
                    }
                    invalidate();
                }}
            />
        );
    }

    return (
        <>
            <group ref={pivot} position={centroid} />
            <TransformControls
                ref={transformRef}
                object={pivot.current || undefined}
                mode={modeMap[toolMode]}
                space={space}
                translationSnap={snapGrid}
                rotationSnap={snapAngle}
                scaleSnap={snapGrid}
                onMouseDown={() => {
                    isDraggingRef.current = true;
                    initialTransforms.current.clear();
                    selectedCubes.forEach(cube => {
                        const obj = nodesRef.current[cube.id];
                        if (obj) {
                            initialTransforms.current.set(cube.id, {
                                pos: obj.position.clone(),
                                rot: obj.rotation.clone(),
                                scale: obj.scale.clone(),
                                originalSize: { x: cube.size.x, y: cube.size.y, z: cube.size.z }  // Save original cube size!
                            });
                        }
                    });
                    if (pivot.current) { pivot.current.updateMatrixWorld(); initialPivotInverse.current.copy(pivot.current.matrixWorld).invert(); }
                }}
                onObjectChange={() => {
                    if (!pivot.current) return; invalidate();
                    const pivotMatrix = pivot.current.matrixWorld;
                    selectedCubes.forEach(cube => {
                        const obj = nodesRef.current[cube.id];
                        const init = initialTransforms.current.get(cube.id);
                        if (obj && init) {
                            const initMatrix = new THREE.Matrix4().compose(init.pos, new THREE.Quaternion().setFromEuler(init.rot), init.scale);
                            const localToPivot = new THREE.Matrix4().multiplyMatrices(initialPivotInverse.current, initMatrix);
                            const newWorldMatrix = new THREE.Matrix4().multiplyMatrices(pivotMatrix, localToPivot);
                            newWorldMatrix.decompose(obj.position, obj.quaternion, obj.scale);
                        }
                    });
                }}
                onMouseUp={() => {
                    isDraggingRef.current = false;
                    const updates = selectedCubes.map(cube => {
                        const obj = nodesRef.current[cube.id];
                        const init = initialTransforms.current.get(cube.id);
                        if (obj && init) {
                            // Calculate scale ratio (how much the scale changed from initial)
                            const scaleRatioX = init.scale.x !== 0 ? obj.scale.x / init.scale.x : 1;
                            const scaleRatioY = init.scale.y !== 0 ? obj.scale.y / init.scale.y : 1;
                            const scaleRatioZ = init.scale.z !== 0 ? obj.scale.z / init.scale.z : 1;

                            return {
                                id: cube.id,
                                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                                rotation: {
                                    x: THREE.MathUtils.radToDeg(obj.rotation.x),
                                    y: THREE.MathUtils.radToDeg(obj.rotation.y),
                                    z: THREE.MathUtils.radToDeg(obj.rotation.z)
                                },
                                // Multiply original size by scale ratio to preserve proportions
                                size: {
                                    x: init.originalSize.x * scaleRatioX,
                                    y: init.originalSize.y * scaleRatioY,
                                    z: init.originalSize.z * scaleRatioZ
                                }
                            };
                        }
                        return { id: cube.id };
                    });
                    onBatchTransform(updates);
                    onTransformEnd();
                }}
            />
        </>
    );
};

const CameraRig: React.FC<{ selectedPos?: { x: number, y: number, z: number } | null }> = ({ selectedPos }) => {
    const { camera, controls } = useThree();
    const PAN_SPEED = 0.5;
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key.toLowerCase() === 'f' && selectedPos && controls) {
                const orb = controls as any;
                const target = new THREE.Vector3(selectedPos.x, selectedPos.y, selectedPos.z);
                orb.target.copy(target); invalidate();
            }
            if (e.shiftKey && controls) {
                const orb = controls as any;
                const xDir = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(PAN_SPEED);
                const yDir = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(PAN_SPEED);
                let moved = false;
                if (e.key === 'ArrowLeft') { camera.position.sub(xDir); orb.target.sub(xDir); moved = true; }
                if (e.key === 'ArrowRight') { camera.position.add(xDir); orb.target.add(xDir); moved = true; }
                if (e.key === 'ArrowUp') { camera.position.add(yDir); orb.target.add(yDir); moved = true; }
                if (e.key === 'ArrowDown') { camera.position.sub(yDir); orb.target.sub(yDir); moved = true; }
                if (moved) { e.preventDefault(); orb.update(); invalidate(); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [camera, controls, selectedPos]);
    return null;
};

const CanvasCapture = ({ onReady }: { onReady: (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void }) => {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        onReady(gl, scene, camera);
    }, [gl, scene, camera, onReady]);
    return null;
};

// Quick Zoom Controls - preset camera positions for different work scales
const QuickZoomControls: React.FC = () => {
    const { camera, controls } = useThree();

    const setZoomLevel = (level: 'close' | 'medium' | 'far') => {
        const orb = controls as any;
        if (!orb) return;

        let position: [number, number, number];
        let target: [number, number, number] = [0, 0, 0];

        switch (level) {
            case 'close':  // For models - close view
                position = [5, 4, 5];
                break;
            case 'medium':  // For small maps
                position = [50, 40, 50];
                break;
            case 'far':  // For large maps (300m+)
                position = [300, 250, 300];
                break;
        }

        camera.position.set(...position);
        orb.target.set(...target);
        orb.update();
        invalidate();
    };

    // Listen for custom events from UI buttons AND keyboard shortcuts
    useEffect(() => {
        const handleCustomEvent = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setZoomLevel(detail as 'close' | 'medium' | 'far');
        };

        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.altKey) {
                if (e.key === '1') { e.preventDefault(); setZoomLevel('close'); }
                if (e.key === '2') { e.preventDefault(); setZoomLevel('medium'); }
                if (e.key === '3') { e.preventDefault(); setZoomLevel('far'); }
            }
        };

        window.addEventListener('quickzoom', handleCustomEvent);
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('quickzoom', handleCustomEvent);
            window.removeEventListener('keydown', handleKey);
        };
    }, [camera, controls]);

    return null;  // This component only handles logic, UI is in HTML overlay
};

// Quick Zoom UI Buttons (HTML overlay)
const QuickZoomUI: React.FC<{ onZoom: (level: 'close' | 'medium' | 'far') => void }> = ({ onZoom }) => {
    return (
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
            <button
                onClick={() => onZoom('close')}
                className="px-2 py-1 text-xs bg-gray-800/80 hover:bg-gray-700 text-white rounded border border-gray-600 font-mono"
                title="Близко - для моделей (Alt+1)"
            >
                🔍 БЛИЗКО
            </button>
            <button
                onClick={() => onZoom('medium')}
                className="px-2 py-1 text-xs bg-gray-800/80 hover:bg-gray-700 text-white rounded border border-gray-600 font-mono"
                title="Средне - для маленьких карт (Alt+2)"
            >
                📐 СРЕДНЕ
            </button>
            <button
                onClick={() => onZoom('far')}
                className="px-2 py-1 text-xs bg-gray-800/80 hover:bg-gray-700 text-white rounded border border-gray-600 font-mono"
                title="Далеко - для больших карт 300м+ (Alt+3)"
            >
                🗺️ ДАЛЕКО
            </button>
        </div>
    );
};


export const Scene: React.FC<SceneProps> = ({
    cubes, selectedIds, onSelect, onTransform, onBatchTransform, onTransformEnd, toolMode, snapGrid, snapAngle,
    backgroundColor, gridColor, sectionColor, showGrid, showWireframe, showAxes, performanceMode = false,
    onAddCube, onContextMenu, transformSpace = 'world', onPaintCube, onCanvasReady,
    draggedItem, onDropItem, dragPointerRef, cameraMode, terrainData,
    gridCellSize = 1, gridSectionSize = 5, gridCellThickness = 0.7, gridSectionThickness = 1.2
}) => {

    // ... (rest of Scene implementation, but we need to match the lines)
    // Wait, replacing the whole block is risky if lines don't match exactly.
    // I will replace the props destructuring block and the DragPreview block separately?
    // replace_file_content doesn't support multiple chunks.
    // I will use multi_replace.
    // Ah, I don't have multi_replace available?
    // I DO have multi_replace_file_content!
    // But replace_file_content is safer for single contiguous block.
    // Wait, use replace_file_content one by one or encompass both?
    // Lines 824 and 924 correspond to props and JSX. They are far apart.
    // I will use multi_replace_file_content.

    // Actually, I'll start with the props update.

    const [isShiftDown, setIsShiftDown] = useState(false);
    // ...

    // Let's use multi_replace_file_content.
    const nodesRef = useRef<Record<string, THREE.Object3D>>({});
    const isDraggingRef = useRef<boolean>(false); // Track when transform is in progress
    const [perfStats, setPerfStats] = useState({ fps: 0, ms: 0, calls: 0, tris: 0, geos: 0 });

    useEffect(() => {
        const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftDown(true); };
        const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftDown(false); };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);

    const selectedCentroid = useMemo(() => {
        if (selectedIds.length === 0) return null;
        const selected = cubes.filter(c => selectedIds.includes(c.id));
        if (selected.length === 0) return null;
        const center = new THREE.Vector3();
        selected.forEach(c => center.add(new THREE.Vector3(c.position.x, c.position.y, c.position.z)));
        center.divideScalar(selected.length);
        return { x: center.x, y: center.y, z: center.z };
    }, [cubes, selectedIds]);

    // Memoize AxesHelper to prevent recreation on every render (was causing 1 FPS!)
    const axesHelper = useMemo(() => new THREE.AxesHelper(5), []);

    useEffect(() => { invalidate(); }, [cubes, selectedIds, toolMode, showGrid, showWireframe, showAxes]);

    return (
        <div className="w-full h-full relative group">
            <PerformanceUI stats={perfStats} />

            <Canvas
                frameloop="demand"
                shadows={!performanceMode}
                gl={{ antialias: !performanceMode, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
                dpr={performanceMode ? 1 : [1, 2]}
                // camera={{ position: [8, 6, 8], fov: 45 }}  <-- Moved to Drei cameras
                onPointerMissed={(e) => {
                    if (!e.shiftKey && toolMode === ToolMode.SELECT) onSelect(null);
                }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <StatsTracker onUpdate={setPerfStats} />
                {/* Fix: use onCanvasReady prop instead of non-existent onReady */}
                {onCanvasReady && <CanvasCapture onReady={onCanvasReady} />}

                <color attach="background" args={[backgroundColor]} />

                <ambientLight intensity={0.6} />
                <pointLight position={[10, 20, 10]} intensity={1} castShadow={!performanceMode} shadow-mapSize={[1024, 1024]} />
                {!performanceMode && <pointLight position={[-10, -10, -5]} intensity={0.5} color="#aaaaff" />}
                <Environment preset="city" />



                {/* Camera Switching */}
                <PerspectiveCamera makeDefault={cameraMode === 'perspective'} position={[10, 8, 10]} fov={45} />
                <OrthographicCamera makeDefault={cameraMode === 'orthographic'} position={[10, 8, 10]} zoom={20} near={-100} far={1000} />

                <CameraRig selectedPos={selectedCentroid} />

                {toolMode === ToolMode.SELECT ? (
                    <SelectionManager cubes={cubes} toolMode={toolMode} onSelect={onSelect} />
                ) : toolMode === ToolMode.BUILD ? (
                    <BuildTool active={true} cubes={cubes} snapGrid={snapGrid} onAddCube={onAddCube} />
                ) : null}

                {showGrid && (
                    <group position={[0, -0.01, 0]}>
                        <Grid
                            infiniteGrid
                            fadeDistance={40}
                            fadeStrength={1.5}
                            cellColor={gridColor}
                            sectionColor={sectionColor}
                            sectionSize={gridSectionSize}
                            cellSize={gridCellSize}
                            cellThickness={gridCellThickness}
                            sectionThickness={gridSectionThickness}
                        />
                    </group>
                )}
                {showAxes && <primitive object={axesHelper} position={[0, 0.01, 0]} />}

                {/* Terrain Mesh */}
                {terrainData && terrainData.elevationGrid.length > 0 && (
                    <TerrainMesh
                        elevationGrid={terrainData.elevationGrid}
                        gridSize={terrainData.gridSize}
                        width={terrainData.width}
                        baseElevation={terrainData.baseElevation}
                        verticalScale={0.5}
                        color="#3a5a40"
                    />
                )}

                {!performanceMode && <ContactShadows resolution={512} scale={30} blur={2} opacity={0.35} far={4} color="#000000" frames={1} />}

                {/* GPU INSTANCED RENDERING for non-selected cubes (simple boxes, excluding roads) */}
                <InstancedBuildings
                    cubes={cubes.filter(c => !c.parentId && c.type === 'cube' && !c.name?.startsWith('Road_') && !c.name?.startsWith('River_'))}
                    excludeIds={new Set(selectedIds)}
                    onClick={(id, e) => onSelect(id, e.shiftKey || e.ctrlKey || e.metaKey)}
                />

                {/* REAL POLYGON BUILDINGS AND WATER from OSM data */}
                <PolygonBuildings
                    cubes={cubes.filter(c => !c.parentId && (c.type === 'polygon' || c.type === 'water'))}
                    excludeIds={new Set(selectedIds)}
                    onClick={(id, e) => onSelect(id, e.shiftKey || e.ctrlKey || e.metaKey)}
                />

                {/* SMOOTH ROADS - ribbon geometry with CatmullRom interpolation */}
                <SmoothRoads cubes={cubes} roadWidth={8} smoothness={3} />

                {/* SMOOTH RIVERS - ribbon geometry with water material */}
                <SmoothRivers cubes={cubes} riverWidth={18} smoothness={4} />


                {/* Individual mesh ONLY for selected/editable objects and groups */}
                <group>
                    {cubes.filter(c => !c.parentId && (selectedIds.includes(c.id) || c.type === 'group')).map((cube) => (
                        <SceneNode
                            key={cube.id}
                            id={cube.id}
                            cubes={cubes}
                            selectedIds={selectedIds}
                            onSelect={onSelect}
                            showWireframe={showWireframe}
                            nodesRef={nodesRef}
                            onContextMenu={onContextMenu}
                            toolMode={toolMode}
                            onPaintCube={onPaintCube}
                            isDraggingRef={isDraggingRef}
                        />
                    ))}
                </group>

                {/* Drag & Drop Preview */}
                {draggedItem && onDropItem && (
                    <DragPreview itemType={draggedItem} onDrop={(p) => onDropItem(draggedItem, p)} snapGrid={snapGrid} dragPointerRef={dragPointerRef} />
                )}

                {selectedIds.length > 0 && (
                    <MultiTransformControls
                        cubes={cubes}
                        selectedIds={selectedIds}
                        toolMode={toolMode}
                        onBatchTransform={onBatchTransform}
                        onTransformEnd={onTransformEnd}
                        snapGrid={snapGrid}
                        snapAngle={snapAngle}
                        nodesRef={nodesRef}
                        space={transformSpace || 'world'}
                        isDraggingRef={isDraggingRef}
                    />
                )}

                <OrbitControls
                    makeDefault
                    dampingFactor={0.1}
                    enabled={!(toolMode === ToolMode.SELECT && isShiftDown)}
                    onChange={() => invalidate()}

                />

                {/* Performance Stats Overlay - Fixed missing usage */}
                {/* (Already rendered via StatsTracker prop if we want, but let's leave as is for now as StatsTracker handles valid HTML overlay via setPerfStats) */}

                {/* Quick Zoom keyboard shortcuts handler */}
                <QuickZoomControls />

                <GizmoHelper alignment="top-right" margin={[80, 80]} onUpdate={() => invalidate()}>
                    <GizmoViewcube color="gray" strokeColor="white" textColor="black" hoverColor="#3b82f6" opacity={0.9} />
                </GizmoHelper>
            </Canvas>

            {/* Quick Zoom Buttons UI */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10 pointer-events-auto">
                <button
                    onClick={() => {
                        // Dispatch custom event to set zoom level
                        window.dispatchEvent(new CustomEvent('quickzoom', { detail: 'close' }));
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-900/90 hover:bg-gray-700 text-green-400 rounded border border-green-500/50 font-mono shadow-lg backdrop-blur-sm"
                    title="Близко - для моделей (Alt+1)"
                >
                    🔍 БЛИЗКО
                </button>
                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('quickzoom', { detail: 'medium' }));
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-900/90 hover:bg-gray-700 text-yellow-400 rounded border border-yellow-500/50 font-mono shadow-lg backdrop-blur-sm"
                    title="Средне - для маленьких карт (Alt+2)"
                >
                    📐 СРЕДНЕ
                </button>
                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('quickzoom', { detail: 'far' }));
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-900/90 hover:bg-gray-700 text-blue-400 rounded border border-blue-500/50 font-mono shadow-lg backdrop-blur-sm"
                    title="Далеко - для больших карт 300м+ (Alt+3)"
                >
                    🗺️ ДАЛЕКО
                </button>
            </div>
        </div>
    );
};








export default React.memo(Scene);
