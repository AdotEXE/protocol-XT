import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useLoader } from './contexts/LoaderContext';
import { Scene } from './components/Scene';
import { FileBrowser } from './components/FileBrowser';
import { ContextMenu } from './components/ContextMenu';
import { TXObjectPalette } from './components/TXObjectPalette';
import { TX_CATEGORY_NAMES, TXObjectCategory } from './services/txObjects';
import { generateProceduralBuilding, BuildingConfig } from './services/procedural';
import { generateCity, CityConfig } from './services/cityGenerator';
import { multiplayer, RemoteCursor } from './services/multiplayer';
import { applyTerrainBrush, TerrainToolMode } from './services/terrain';
import { createRoadPath, scatterObjects } from './services/tools';
import { getElevationAt } from './services/elevationService';
import { generateModel, repairModelWithAI, refineSelectionWithAI } from './services/gemini';
import { exportToJSON, exportToOBJ, exportToBlockbench, exportToPLY, exportToPoly, importFromBlockbench, exportToTXMap, exportForTest, importFromTXMap, sendMapToTX, isInTXIframe, requestGameMap, clearRespawnEffect, setLowHealthEffect, clearLowHealthEffect } from './services/exporter';
import { CubeElement, ToolMode, FileSystem, FileNode, GenerationOptions, Theme, LogEntry, Vector3, MaterialProperties, GenerationHistoryEntry, PaletteItem } from './types';
import { MAP_PRESETS, MapPreset } from './constants/presets';

import { generateId, getUniqueFileName } from './utils/helpers';
import * as Icons from './components/Icons';
import { ObjectCreator } from './components/ObjectCreator';
import RealWorldGenerator, { TerrainData } from './components/RealWorldGenerator';
import SettingsModal, { loadSettings, isFirstLaunch, EditorSettings, DEFAULT_SETTINGS } from './components/SettingsModal';
import { useHMRNotifications } from './hooks/useHMRNotifications';


const DraggableNumberInput = ({ label, value, onChange, step = 0.1, className = "" }: any) => {
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const startVal = useRef(0);
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const delta = e.clientX - startX.current;
            onChange(parseFloat((startVal.current + delta * step).toFixed(3)));
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, step, onChange]);

    return (
        <div className={`flex items-center bg-gray-950 border border-gray-700 rounded overflow-hidden ${className}`}>
            <div className="px-2 py-1 text-[9px] font-bold text-gray-500 bg-gray-900 border-r border-gray-700 w-7 text-center cursor-ew-resize select-none"
                onMouseDown={(e) => { setIsDragging(true); startX.current = e.clientX; startVal.current = value; }}>
                {label}
            </div>
            <input type="number" step={step} className="w-full bg-transparent px-2 py-1 text-[10px] text-white outline-none" value={value || 0} onChange={(e) => onChange(parseFloat(e.target.value))} />
        </div>
    );
};

const INITIAL_FS: FileSystem = {
    rootId: 'root',
    nodes: {
        'root': { id: 'root', parentId: null, name: 'Project Workspace', type: 'folder', children: ['default'], isExpanded: true, createdAt: Date.now() },
        'default': { id: 'default', parentId: 'root', name: 'New Entity', type: 'file', children: [], createdAt: Date.now(), content: { cubes: [], prompt: '', timestamp: Date.now() } }
    }
};

export const App = () => {
    const { setLoading, setProgress } = useLoader();

    // --- Initialization Simulation ---
    useEffect(() => {
        const initializeApp = async () => {
            setLoading(true, 'SYSTEM BOOT SEQUENCE...');
            setProgress(5);
            await new Promise(r => setTimeout(r, 400));

            setProgress(25);
            setLoading(true, 'LOADING PREFERENCES...');
            await new Promise(r => setTimeout(r, 300));

            // Allow persistence effect to run (it runs on mount too)
            // We just add visual delay

            setProgress(65);
            setLoading(true, 'INITIALIZING 3D ENGINE...');
            await new Promise(r => setTimeout(r, 600));

            setProgress(100);
            await new Promise(r => setTimeout(r, 200));
            setLoading(false);
        };
        initializeApp();
    }, []);

    // Detect editor mode from URL parameter (?mode=tank or ?mode=map)
    const editorMode = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        const mode = params.get('mode');
        return mode === 'tank' ? 'tank' : mode === 'map' ? 'map' : 'default';
    }, []);

    // Mode-specific configurations
    const modeConfig = useMemo(() => {
        if (editorMode === 'tank') {
            return {
                title: '🛡 МАСТЕРСКАЯ ТАНКОВ',
                placeholder: 'Опиши модель танка для синтеза...',
                defaultPrompts: [
                    'Тяжёлый боевой танк с мощной бронёй',
                    'Лёгкий разведывательный танк',
                    'Танковая башня с двойным орудием',
                    'Футуристический танк с лазерным оружием'
                ],
                gridSize: 'small',
                voxelSize: 0.25,
                exportFormat: 'poly'
            };
        } else if (editorMode === 'map') {
            return {
                title: '🗺 РЕДАКТОР КАРТ',
                placeholder: 'Опиши карту для генерации...',
                defaultPrompts: [
                    'Военная база с бункерами и стенами',
                    'Индустриальная зона с заводами',
                    'Городской квартал с улицами и зданиями',
                    'Пустынная арена с укрытиями',
                    'Лесная местность с деревьями и камнями'
                ],
                gridSize: 'large',
                voxelSize: 1.0,
                exportFormat: 'txmap'
            };
        }
        return {
            title: '🎨 POLYGEN ULTIMATE',
            placeholder: 'Describe entity to synthesize...',
            defaultPrompts: [],
            gridSize: 'medium',
            voxelSize: 0.5,
            exportFormat: 'poly'
        };
    }, [editorMode]);

    // UI Panel Visibility
    const [isAppLoaded, setIsAppLoaded] = useState(false);

    // Unified Loading Screen State
    const [loadingPhase, setLoadingPhase] = useState<'init' | 'react' | 'threejs' | 'resources' | 'done'>('init');
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState('Инициализация...');

    const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
    const [rightTab, setRightTab] = useState<'props' | 'palette' | 'refine' | 'history' | 'console' | 'gen' | 'terrain' | 'tools' | 'layers' | 'objects'>('props');
    const [showGenSettings, setShowGenSettings] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);

    const [showExportMenu, setShowExportMenu] = useState(false);

    // Camera State
    const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic'>('perspective');

    // Settings State
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);

    // Load settings on mount
    useEffect(() => {
        const settings = loadSettings();
        setEditorSettings(settings);

        // Check first launch
        if (isFirstLaunch()) {
            setShowSettingsModal(true);
        }
    }, []);
    // Generator State
    const [buildConfig, setBuildConfig] = useState<BuildingConfig>({ width: 6, depth: 6, floors: 3, floorHeight: 3, style: 'modern' });
    const [cityConfig, setCityConfig] = useState<CityConfig>({ gridSize: 4, blockSize: 15, density: 0.7, organicness: 0 });
    const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({
        buildings: true, covers: true, nature: true, infrastructure: true, gameplay: true, npcs: true
    });
    // Multiplayer State
    const [isConnected, setIsConnected] = useState(false);
    const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
    const [roomId, setRoomId] = useState('default');
    const [viewportContextMenu, setViewportContextMenu] = useState<{ x: number, y: number, id: string | null } | null>(null);
    // Terrain State
    const [terrainConfig, setTerrainConfig] = useState<{ mode: TerrainToolMode, radius: number, strength: number }>({ mode: 'raise', radius: 3, strength: 1 });
    // Terrain Mesh Data for Real World Generator
    const [terrainMeshData, setTerrainMeshData] = useState<TerrainData | null>(null);
    // Advanced Tools State
    const [roadStart, setRoadStart] = useState<Vector3 | null>(null);
    const [roadConfig, setRoadConfig] = useState({ width: 4, color: '#2a2a2a' });
    const [scatterConfig, setScatterConfig] = useState({ density: 0.2, radius: 4 });
    const [scatterTemplate, setScatterTemplate] = useState<Partial<CubeElement>>({
        name: 'ScatterTree', size: { x: 1, y: 4, z: 1 }, color: '#2d5c1e', type: 'cube'
    });

    // Persistence & State
    const [showImportMenu, setShowImportMenu] = useState(false);
    const [theme, setTheme] = useState<Theme>('tx');
    const [showGrid, setShowGrid] = useState(true);
    const [showAxes, setShowAxes] = useState(true);
    const [showWireframe, setShowWireframe] = useState(false);
    const [showStats, setShowStats] = useState(true);
    const [viewportColor, setViewportColor] = useState('#0a0a0c');
    const [isIsolated, setIsIsolated] = useState(false);
    const [outlinerSearch, setOutlinerSearch] = useState('');
    const [snapEnabled, setSnapEnabled] = useState(true);

    // AI & Batch Configuration
    const [prompt, setPrompt] = useState('');
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number, total: number, isPaused: boolean, isMinimized: boolean } | null>(null);
    const cancelBatchRef = useRef(false);
    const [genSeed, setGenSeed] = useState(0);
    const [genSymmetry, setGenSymmetry] = useState<'none' | 'x' | 'y' | 'z'>('none');
    const [genOrganicness, setGenOrganicness] = useState(1); // Updated: was 0.5
    const [genDetailDensity, setGenDetailDensity] = useState(10); // Updated: was 5
    const [genComplexity, setGenComplexity] = useState<'simple' | 'medium' | 'detailed'>('detailed'); // Updated: was 'medium'
    const [genVoxelSize, setGenVoxelSize] = useState(0.25);
    const [genMapSize, setGenMapSize] = useState(200); // NEW: Map size selector (100-1000)
    const [genCreativity, setGenCreativity] = useState(0.7); // NEW: Creativity/randomness level (0-1)
    const [avoidGlitch, setAvoidGlitch] = useState(true);
    const [genInternal, setGenInternal] = useState(false);
    const [genForceGround, setGenForceGround] = useState(true);

    // Data State
    const [cubes, setCubes] = useState<CubeElement[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.SELECT);
    const [paintColor, setPaintColor] = useState('#3b82f6');
    const [logs, setLogs] = useState<LogEntry[]>([{ id: 'init', message: 'PolyGen Engine v5.0 Final Build active.', type: 'info', timestamp: Date.now() }]);
    const [genHistory, setGenHistory] = useState<GenerationHistoryEntry[]>([]);
    const [fileSystem, setFileSystem] = useState<FileSystem>(INITIAL_FS);
    const [currentFileId, setCurrentFileId] = useState<string | null>('default');

    // History & Clipboard
    const [historyStack, setHistoryStack] = useState<CubeElement[][]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [clipboard, setClipboard] = useState<CubeElement[]>([]);

    // UI State
    const [sidebarTab, setSidebarTab] = useState<'files' | 'palette' | 'props'>('files');
    const [draggedItem, setDraggedItem] = useState<string | null>(null);

    // Toast Notifications with Progress Support
    const [toasts, setToasts] = useState<{
        id: string,
        message: string,
        type: 'info' | 'success' | 'warning' | 'error',
        progress?: number,  // 0-100 for progress bar
        isLoading?: boolean // Show spinner
    }[]>([]);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean, targetId: string | null }>({ x: 0, y: 0, visible: false, targetId: null });

    // Help Modal State
    const [showHelpModal, setShowHelpModal] = useState(false);

    // Pause Menu State (for game mode)
    const [showPauseMenu, setShowPauseMenu] = useState(false);

    // Session/Multiplayer Modal State
    const [showSessionModal, setShowSessionModal] = useState(false);

    // Custom Object Creator State
    const [showObjCreator, setShowObjCreator] = useState(false);
    const [paletteItems, setPaletteItems] = useState<PaletteItem[]>([
        { id: 'cube', name: 'Cube', icon: <Icons.Cube />, color: '#B0BEC5', type: 'cube' },
        { id: 'spawn', name: 'Spawn', icon: <Icons.Cube />, color: '#EF4444', type: 'spawn' },
        { id: 'window', name: 'Window', icon: <Icons.Cube />, color: '#607D8B', type: 'window' },
        { id: 'ramp', name: 'Ramp', icon: <Icons.Cube />, color: '#FFB74D', type: 'ramp' }
    ]);

    const importInputRef = useRef<HTMLInputElement>(null);
    const consoleEndRef = useRef<HTMLDivElement>(null);
    const uploadGenRef = useRef<HTMLInputElement>(null);
    const uploadRefineRef = useRef<HTMLInputElement>(null);
    const dragPointerRef = useRef(new THREE.Vector2());

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setTarget: (val: string) => void) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) setTarget(ev.target.result as string);
        };
        reader.readAsText(file);
        // Reset value to allow re-uploading the same file
        e.target.value = '';
    };

    // --- Persistence with Loading Progress ---
    useEffect(() => {
        // Phase 1: React initialization (0-20%)
        setLoadingPhase('react');
        setLoadingProgress(10);
        setLoadingMessage('Загрузка React...');

        const saved = localStorage.getItem('polygen_ultimate_v5_pro_final');
        if (saved) {
            try {
                setLoadingProgress(20);
                setLoadingMessage('Восстановление настроек...');

                const data = JSON.parse(saved);
                if (data.fileSystem) setFileSystem(data.fileSystem);
                if (data.genHistory) setGenHistory(data.genHistory);
                if (data.logs) setLogs(data.logs);
                if (data.theme) setTheme(data.theme);
                if (data.viewportColor) setViewportColor(data.viewportColor);
                if (data.leftSidebarOpen !== undefined) setLeftSidebarOpen(data.leftSidebarOpen);
                if (data.rightSidebarOpen !== undefined) setRightSidebarOpen(data.rightSidebarOpen);
                if (data.showStats !== undefined) setShowStats(data.showStats);
                if (data.genSettings) {
                    setGenSeed(data.genSettings.seed || 0);
                    setGenSymmetry(data.genSettings.symmetry || 'none');
                    setGenComplexity(data.genSettings.complexity || 'detailed');
                    setGenOrganicness(data.genSettings.organicness ?? 1);
                    setGenDetailDensity(data.genSettings.detailDensity ?? 10);
                    setGenMapSize(data.genSettings.mapSize ?? 200);
                    setGenVoxelSize(data.genSettings.voxelSize ?? 0.25);
                }
                if (data.snapEnabled !== undefined) setSnapEnabled(data.snapEnabled);
            } catch (e) { console.error("Persistence Restore Error", e); }
        }

        // Phase 2: Three.js loading (20-60%)
        setLoadingPhase('threejs');
        setLoadingProgress(40);
        setLoadingMessage('Загрузка 3D движка...');

        // Simulate async loading - Three.js loads with Canvas
        setTimeout(() => {
            setLoadingProgress(60);
            setLoadingMessage('Инициализация WebGL...');
        }, 100);

        setTimeout(() => {
            // Phase 3: Resources (60-90%)
            setLoadingPhase('resources');
            setLoadingProgress(80);
            setLoadingMessage('Загрузка ресурсов редактора...');
        }, 200);

        setTimeout(() => {
            // Phase 4: Done (100%)
            setLoadingPhase('done');
            setLoadingProgress(100);
            setLoadingMessage('Готово!');
            setIsAppLoaded(true);
        }, 400);
    }, []);

    useEffect(() => {
        if (!isAppLoaded) return;
        // Skip auto-save for very large maps to prevent quota exceeded
        const cubesToSave = cubes.length > 500 ? [] : cubes;
        if (cubes.length > 500) {
            console.log(`[AutoSave] Skipping - too many objects (${cubes.length})`);
        }
        const state = {
            fileSystem, genHistory, logs, theme, currentFileId, viewportColor, showStats,
            leftSidebarOpen, rightSidebarOpen, snapEnabled, cubes: cubesToSave,
            genSettings: {
                seed: genSeed, symmetry: genSymmetry, complexity: genComplexity,
                organicness: genOrganicness, detailDensity: genDetailDensity,
                mapSize: genMapSize, voxelSize: genVoxelSize
            }
        };
        try {
            localStorage.setItem('polygen_ultimate_v5_pro_final', JSON.stringify(state));
        } catch (e) {
            console.error("Storage Quota Exceeded", e);
        }
    }, [fileSystem, genHistory, logs, theme, currentFileId, viewportColor, leftSidebarOpen, rightSidebarOpen,
        genSymmetry, genComplexity, genOrganicness, genDetailDensity, genMapSize, genVoxelSize, genSeed,
        showStats, isAppLoaded, snapEnabled, cubes]);

    // Update body class and potentially viewport color when theme changes
    useEffect(() => {
        document.body.className = theme;
        if (theme === 'tx' && viewportColor !== '#000500' && viewportColor === '#0a0a0c') {
            setViewportColor('#000500');
        }
    }, [theme]);
    useEffect(() => { if (rightTab === 'console') consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs, rightTab]);

    useEffect(() => {
        if (currentFileId && fileSystem.nodes[currentFileId]?.content) {
            const content = fileSystem.nodes[currentFileId].content!;
            const newCubes = JSON.parse(JSON.stringify(content.cubes));
            setCubes(newCubes);
            setPrompt(content.prompt);
            setHistoryStack([newCubes]);
            setHistoryIndex(0);
        }
    }, [currentFileId]);

    const addLog = (message: string, type: 'info' | 'warning' | 'error' | 'success') => {
        setLogs(prev => [...prev, { id: generateId(), message, type, timestamp: Date.now() }].slice(-100));
    };

    // Task 5: Visual toast notification (auto-dismisses after 3s)
    const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        const id = generateId();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
        return id;
    };

    // Update existing toast (for live progress)
    const updateToast = (id: string, updates: { message?: string, progress?: number, type?: 'info' | 'success' | 'warning' | 'error', isLoading?: boolean }) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    // Remove toast manually
    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // Show progress toast (doesn't auto-dismiss until complete)
    const showProgressToast = (message: string): string => {
        const id = generateId();
        setToasts(prev => [...prev, { id, message, type: 'info', progress: 0, isLoading: true }]);
        return id;
    };

    const pushHistory = (newCubes: CubeElement[]) => {
        const nextStack = historyStack.slice(0, historyIndex + 1);
        nextStack.push(JSON.parse(JSON.stringify(newCubes)));
        if (nextStack.length > 50) nextStack.shift();
        setHistoryStack(nextStack);
        setHistoryIndex(nextStack.length - 1);
        if (currentFileId) {
            setFileSystem(prev => {
                const node = prev.nodes[currentFileId];
                if (!node) return prev;

                const existingContent = node.content || { cubes: [], prompt: '', timestamp: Date.now() };

                return {
                    ...prev,
                    nodes: {
                        ...prev.nodes,
                        [currentFileId]: {
                            ...node,
                            content: { ...existingContent, cubes: newCubes }
                        }
                    }
                };
            });
        }
    };

    // Listen for Game Map Imports
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === 'IMPORT_GAME_MAP') {
                const mapData = e.data.mapData;
                try {
                    // Convert TXMapData to cubes
                    const json = JSON.stringify(mapData);
                    const imported = importFromTXMap(json);
                    if (imported.length > 0) {
                        setCubes(imported);
                        pushHistory(imported);
                        addLog(`Imported game map: ${mapData.name}`, 'success');

                        // Optionally update mode to 'map'
                        if (editorMode !== 'map') {
                            const url = new URL(window.location.href);
                            url.searchParams.set('mode', 'map');
                            window.history.pushState({}, '', url.toString());
                            // Force reload or state update depending on implementation
                            // Just let user know? Or ignore.
                            // setEditorMode('map') would be better but it's derived from URL.
                        }
                    } else {
                        addLog('Imported map has no objects', 'warning');
                    }
                } catch (err) {
                    addLog('Failed to import map data', 'error');
                    console.error(err);
                }
            } else if (e.data?.type === 'PLAYER_RESPAWNED' || e.data?.type === 'RESPAWN_COMPLETE' || e.data?.type === 'RESPAWN' || e.data?.type === 'SPAWN') {
                // Clear respawn effect when player respawns - aggressive clearing
                clearRespawnEffect();
                setTimeout(() => clearRespawnEffect(), 50);
                setTimeout(() => clearRespawnEffect(), 100);
                setTimeout(() => clearRespawnEffect(), 200);
                setTimeout(() => clearRespawnEffect(), 500);
                setTimeout(() => clearRespawnEffect(), 1000);
                setTimeout(() => clearRespawnEffect(), 2000);
                console.log('[App] Player respawned - cleared respawn effect (aggressive clearing)');
            } else if (e.data?.type === 'PLAYER_HEALTH_CHANGED' || e.data?.type === 'HEALTH_UPDATE') {
                // Update low health effect based on health percentage
                const healthPercent = e.data.healthPercent ?? e.data.health ?? 1;
                if (healthPercent < 0.3) {
                    // Low health - show heartbeat effect with gradient from perimeter to center
                    // Max 25% darkness at edges, fading to 0% at center
                    setLowHealthEffect(healthPercent, 0.25);
                } else {
                    // Health is good - clear effect
                    clearLowHealthEffect();
                }
            } else if (e.data?.type === 'PLAYER_DIED' || e.data?.type === 'DEATH') {
                // Player died - clear low health effect (will be replaced by death effect)
                clearLowHealthEffect();
            } else if (e.data?.type === 'MAP_LOADED' || e.data?.type === 'GAME_READY') {
                // Game is ready - clear any lingering effects
                clearRespawnEffect();
                clearLowHealthEffect();
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [editorMode, addLog, pushHistory]);

    // Periodic check to clear dark screen effect (in case game doesn't send respawn event)
    useEffect(() => {
        if (!isInTXIframe() && editorMode !== 'tank') return;

        // Check every 2 seconds if we need to clear effects (fallback mechanism)
        const interval = setInterval(() => {
            // Only clear occasionally to reduce spam (10% chance)
            if (Math.random() < 0.1) {
                clearRespawnEffect();
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [editorMode]);

    // HMR Notifications - show hot reload updates
    useHMRNotifications(showToast, {
        enabled: true,
        showInProduction: false,
        minUpdateCount: 1,
        autoHideDelay: 5000,
        showFileList: true,
        groupByCategory: true,
    });

    // --- Multiplayer Setup ---
    useEffect(() => {
        if (!isConnected) return;

        multiplayer.onRemoteUpdate = (newCubes) => {
            setCubes(newCubes);
            // Don't push to history on remote update to avoid massive stacks? Or maybe yes.
            // pushHistory(newCubes); 
            addLog('Remote update received.', 'info');
        };

        multiplayer.onRemoteCursors = (cursors) => {
            setRemoteCursors(cursors);
        };

    }, [isConnected, addLog]);

    // Sync changes with debouncing to avoid excessive network calls
    const multiplayerSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (!isConnected) return;

        // Clear previous timeout
        if (multiplayerSyncTimeoutRef.current) {
            clearTimeout(multiplayerSyncTimeoutRef.current);
        }

        // Debounce multiplayer sync by 400ms
        multiplayerSyncTimeoutRef.current = setTimeout(() => {
            multiplayer.sendUpdate(cubes);
        }, 400);

        return () => {
            if (multiplayerSyncTimeoutRef.current) {
                clearTimeout(multiplayerSyncTimeoutRef.current);
            }
        };
    }, [cubes, isConnected]);



    const handleContextMenu = (x: number, y: number, id: string) => {
        setContextMenu({ x, y, visible: true, targetId: id });
    };

    const handleConnect = () => {
        multiplayer.connect(roomId, 'User-' + Math.floor(Math.random() * 1000));
        setIsConnected(true);
        addLog(`Connected to Room: ${roomId}`, 'success');
    };

    // --- Core Logic ---
    const handleUndo = () => { if (historyIndex > 0) { const nextIdx = historyIndex - 1; setCubes(historyStack[nextIdx]); setHistoryIndex(nextIdx); addLog('Undo action.', 'info'); } };
    const handleRedo = () => { if (historyIndex < historyStack.length - 1) { const nextIdx = historyIndex + 1; setCubes(historyStack[nextIdx]); setHistoryIndex(nextIdx); addLog('Redo action.', 'info'); } };

    const getGenOptions = (): GenerationOptions => ({
        prompt, useThinking: false, complexity: genComplexity, style: 'voxel',
        palette: 'standard', materialType: 'plastic', theme: 'none', creativity: genCreativity,
        scale: 'medium', avoidZFighting: avoidGlitch, symmetry: genSymmetry, organicness: genOrganicness,
        detailDensity: genDetailDensity, optimizationLevel: 'basic', internalStructure: genInternal,
        forceGround: genForceGround, voxelSize: genVoxelSize, hollow: false, lightingMode: 'soft',
        seed: genSeed, mapSize: genMapSize
    });

    const handleGenerate = async () => {
        if (!prompt || isGenerating) return;
        setIsGenerating(true);
        // Using non-blocking toast instead of full loading screen
        const toastId = showProgressToast('SYNTHESIZING NEURAL GEOMETRY...');
        // setLoading(true, 'SYNTHESIZING NEURAL GEOMETRY...');
        setProgress(10);
        updateToast(toastId, { progress: 10 });

        addLog(`Synthesis: "${prompt}"...`, 'info');
        try {
            // Fake progress for "thinking" feel
            const interval = setInterval(() => {
                setProgress(p => {
                    const next = Math.min(p + 5, 90);
                    updateToast(toastId, { progress: next });
                    return next;
                });
            }, 300);

            const { cubes: result, time } = await generateModel(getGenOptions());
            clearInterval(interval);
            setProgress(100);
            updateToast(toastId, { progress: 100, message: 'Synthesis Complete!', type: 'success', isLoading: false });

            // Auto dismiss success toast after delay
            setTimeout(() => removeToast(toastId), 3000);

            setCubes(result); pushHistory(result);
            setGenHistory(prev => [{ id: generateId(), prompt, timestamp: Date.now(), options: getGenOptions(), cubes: result }, ...prev].slice(0, 50));
            addLog(`Synthesis Complete: ${time.toFixed(0)}ms.`, 'success');
            setShowGenSettings(false);
        } catch (e) {
            addLog('Synthesis Error.', 'error');
            updateToast(toastId, { message: 'Synthesis Failed', type: 'error', isLoading: false });
            setTimeout(() => removeToast(toastId), 3000);
        }
        finally { setIsGenerating(false); setLoading(false); }
    };

    const handleBatch = async () => {
        if (!prompt || isGenerating) return;
        setIsGenerating(true);
        cancelBatchRef.current = false;

        // Non-blocking toast for batch
        const toastId = showProgressToast('INITIALIZING BATCH MATRIX...');
        // setLoading(true, 'INITIALIZING BATCH MATRIX...');
        setProgress(0);
        updateToast(toastId, { progress: 0 });

        setBatchProgress({ current: 0, total: 10, isPaused: false, isMinimized: false });

        let batchFolderId = Object.keys(fileSystem.nodes).find(k => fileSystem.nodes[k].name === 'Generations' && fileSystem.nodes[k].type === 'folder');
        if (!batchFolderId) {
            batchFolderId = generateId();
            const folder: FileNode = { id: batchFolderId, parentId: 'root', name: 'Generations', type: 'folder', children: [], createdAt: Date.now(), isExpanded: true };
            setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [batchFolderId!]: folder, 'root': { ...prev.nodes['root'], children: [...prev.nodes['root'].children, batchFolderId!] } } }));
        }

        try {
            for (let i = 0; i < 10; i++) {
                if (cancelBatchRef.current) break;
                while (batchProgress?.isPaused) { await new Promise(r => setTimeout(r, 500)); if (cancelBatchRef.current) break; }

                const percent = ((i) / 10) * 100;
                // setLoading(true, `GENERATING VARIATION ${i + 1}/10...`);
                updateToast(toastId, { message: `GENERATING VARIATION ${i + 1}/10...`, progress: percent });

                setProgress(percent);
                setBatchProgress(prev => prev ? { ...prev, current: i + 1 } : null);

                const { cubes: result, time } = await generateModel({ ...getGenOptions(), seed: genSeed !== 0 ? genSeed + i : Math.floor(Math.random() * 99999) });
                const fileId = generateId();
                const node: FileNode = { id: fileId, parentId: batchFolderId, name: getUniqueFileName(), type: 'file', children: [], createdAt: Date.now(), content: { cubes: result, prompt, timestamp: Date.now() } };
                setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [fileId]: node, [batchFolderId!]: { ...prev.nodes[batchFolderId!], children: [...prev.nodes[batchFolderId!].children, fileId] } } }));
                addLog(`Matrix Cycle ${i + 1} saved.`, 'info');
            }
            addLog(`Matrix Process Finalized.`, 'success');
            updateToast(toastId, { message: 'Matrix Process Finalized', type: 'success', isLoading: false, progress: 100 });
            setTimeout(() => removeToast(toastId), 3000);
        } catch (e) {
            addLog('Batch synthesis aborted.', 'error');
            updateToast(toastId, { message: 'Batch Aborted', type: 'error', isLoading: false });
            setTimeout(() => removeToast(toastId), 3000);
        }
        finally { setIsGenerating(false); setBatchProgress(null); setLoading(false); }
    };

    const handleGroup = () => {
        if (selectedIds.length < 2) return;
        const selected = cubes.filter(c => selectedIds.includes(c.id));
        const center = { x: 0, y: 0, z: 0 };
        selected.forEach(c => { center.x += c.position.x; center.y += c.position.y; center.z += c.position.z; });
        center.x /= selected.length; center.y /= selected.length; center.z /= selected.length;

        const groupId = generateId();
        const group: CubeElement = {
            id: groupId, name: 'Group', type: 'group',
            position: center, size: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 },
            visible: true, isLocked: false, properties: {}, color: '#ffffff'
        };

        const updatedCubes = cubes.map(c => {
            if (selectedIds.includes(c.id)) {
                return {
                    ...c,
                    parentId: groupId,
                    // Adjust position to be relative to group center if we were doing true hierarchy, 
                    // but for now SceneNode handles position relative to parent? 
                    // Wait, SceneNode.tsx implementation roughly: <group position={cube.position}>
                    // If we add parentId, we need to adjust positions to be relative OR ensure Scene handles it.
                    // Checking SceneNode: children = cubes.filter(c => c.parentId === id); 
                    // It renders children inside the group. So yes, positions MUST be relative. 
                    // CURRENTLY: positions are world. If we put them in a group at 'center', 
                    // their effective world pos becomes center + pos.
                    // So we must subtract center from their position.
                    position: {
                        x: c.position.x - center.x,
                        y: c.position.y - center.y,
                        z: c.position.z - center.z
                    }
                };
            }
            return c;
        });

        const nextCubes = [...updatedCubes, group];
        setCubes(nextCubes);
        setSelectedIds([groupId]);
        pushHistory(nextCubes);
        addLog('Group created.', 'info');
    };

    const handleUngroup = () => {
        const groups = cubes.filter(c => selectedIds.includes(c.id) && c.type === 'group');
        if (groups.length === 0) return;

        let nextCubes = [...cubes];
        let newSelected: string[] = [];

        groups.forEach(group => {
            const children = nextCubes.filter(c => c.parentId === group.id);
            // Convert relative back to world
            const updatedChildren = children.map(child => ({
                ...child,
                parentId: undefined,
                position: {
                    x: child.position.x + group.position.x,
                    y: child.position.y + group.position.y,
                    z: child.position.z + group.position.z
                }
            }));

            // Updates cubes array: remove group, update children
            nextCubes = nextCubes.filter(c => c.id !== group.id && c.parentId !== group.id);
            nextCubes.push(...updatedChildren);
            newSelected.push(...updatedChildren.map(c => c.id));
        });

        setCubes(nextCubes);
        setSelectedIds(newSelected);
        pushHistory(nextCubes);
        addLog('Objects ungrouped.', 'info');
    };

    const handleRepair = async () => {
        if (cubes.length === 0 || isGenerating) return;
        setIsGenerating(true);
        // Non-blocking toast
        const toastId = showProgressToast('ANALYZING GEOMETRY...');
        // setLoading(true, 'ANALYZING GEOMETRY...');
        setProgress(20);
        updateToast(toastId, { progress: 20 });

        addLog('AI Geometry Repair active...', 'warning');
        try {
            // Fake progress
            const interval = setInterval(() => {
                setProgress(p => {
                    const next = Math.min(p + 10, 90);
                    updateToast(toastId, { progress: next });
                    return next;
                });
            }, 200);

            const { cubes: repaired, time } = await repairModelWithAI(cubes);
            clearInterval(interval);
            setProgress(100);
            updateToast(toastId, { progress: 100, message: 'Geometry Repaired!', type: 'success', isLoading: false });
            setTimeout(() => removeToast(toastId), 3000);

            setCubes(repaired); pushHistory(repaired);
            addLog(`Geometry fixed: ${time.toFixed(0)}ms.`, 'success');
        } catch (e) {
            addLog('Repair error.', 'error');
            updateToast(toastId, { message: 'Repair Failed', type: 'error', isLoading: false });
            setTimeout(() => removeToast(toastId), 3000);
        }
        finally { setIsGenerating(false); setLoading(false); }
    };

    // --- Keyboard Shortcuts & Clipboard (Moved) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo(); else handleUndo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); return; }
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                if (e.shiftKey) handleUngroup(); else handleGroup();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                if (selectedIds.length > 0) {
                    const toCopy = cubes.filter(c => selectedIds.includes(c.id));
                    setClipboard(toCopy); addLog(`Copied ${toCopy.length} objects.`, 'info');
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                if (clipboard.length > 0) {
                    const newIds: string[] = [];
                    const pasted = clipboard.map(c => {
                        const newId = generateId(); newIds.push(newId);
                        return { ...c, id: newId, position: { x: c.position.x + 2, y: c.position.y, z: c.position.z + 2 }, name: c.name + ' (Copy)' };
                    });
                    const nextCubes = [...cubes, ...pasted];
                    setCubes(nextCubes); setSelectedIds(newIds); pushHistory(nextCubes);
                    addLog(`Pasted ${pasted.length} objects.`, 'success');
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (selectedIds.length > 0) {
                    const toClone = cubes.filter(c => selectedIds.includes(c.id));
                    const cloned = toClone.map(c => ({
                        ...c,
                        id: generateId(),
                        position: { x: c.position.x + 1, y: c.position.y, z: c.position.z + 1 },
                        name: c.name + ' (Clone)'
                    }));
                    const nextCubes = [...cubes, ...cloned];
                    setCubes(nextCubes); setSelectedIds(cloned.map(c => c.id)); pushHistory(nextCubes);
                    addLog(`Cloned ${cloned.length} objects.`, 'success');
                }
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIds.length > 0) {
                    const nextCubes = cubes.filter(c => !selectedIds.includes(c.id));
                    setCubes(nextCubes); setSelectedIds([]); pushHistory(nextCubes);
                    addLog('Deleted selected objects.', 'info');
                }
            }
            if (e.key === 'Escape') {
                setSelectedIds([]); setToolMode(ToolMode.SELECT); setContextMenu({ ...contextMenu, visible: false });
            }
            if (selectedIds.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const step = e.shiftKey ? 0.05 : (snapEnabled ? 0.25 : 0.1);
                const updates = cubes.filter(c => selectedIds.includes(c.id)).map(c => {
                    const pos = { ...c.position };
                    if (e.key === 'ArrowUp') pos.z -= step;
                    if (e.key === 'ArrowDown') pos.z += step;
                    if (e.key === 'ArrowLeft') pos.x -= step;
                    if (e.key === 'ArrowRight') pos.x += step;
                    return { ...c, position: pos };
                });
                setCubes(prev => prev.map(c => { const up = updates.find(u => u.id === c.id); return up ? up : c; }));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds, cubes, clipboard, handleUndo, handleRedo, pushHistory, snapEnabled, contextMenu]);

    // --- Keyboard Shortcuts & Clipboard (Moved here to fix hoisting) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                handleRedo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                handleRedo();
                return;
            }

            // Grouping
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                if (e.shiftKey) handleUngroup();
                else handleGroup();
                return;
            }

            // Copy
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                if (selectedIds.length > 0) {
                    const toCopy = cubes.filter(c => selectedIds.includes(c.id));
                    setClipboard(toCopy); addLog(`Copied ${toCopy.length} objects.`, 'info');
                }
                return;
            }

            const activeElement = document.activeElement;
            const isInputActive = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

            if (isInputActive) return;

            // Paste
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                if (clipboard.length > 0) {
                    // Paste with offset
                    const newIds: string[] = [];
                    const pasted = clipboard.map(c => {
                        const newId = generateId();
                        newIds.push(newId);
                        return {
                            ...c,
                            id: newId,
                            position: { x: c.position.x + 2, y: c.position.y, z: c.position.z + 2 },
                            name: c.name + ' (Copy)'
                        };
                    });
                    const nextCubes = [...cubes, ...pasted];
                    setCubes(nextCubes);
                    setSelectedIds(newIds);
                    pushHistory(nextCubes);
                    addLog(`Pasted ${pasted.length} objects.`, 'info');
                }
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIds.length > 0) {
                    const nextCubes = cubes.filter(c => !selectedIds.includes(c.id));
                    setCubes(nextCubes);
                    setSelectedIds([]);
                    pushHistory(nextCubes);
                    addLog('Deleted selection.', 'info');
                }
            }

            if (e.key === 'Escape') {
                setSelectedIds([]);
                setToolMode(ToolMode.SELECT);
                setContextMenu({ ...contextMenu, visible: false });
            }

            // Nudging
            if (selectedIds.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const step = e.shiftKey ? 0.05 : (snapEnabled ? 0.25 : 0.1);
                const updates = cubes.filter(c => selectedIds.includes(c.id)).map(c => {
                    const pos = { ...c.position };
                    if (e.key === 'ArrowUp') pos.z -= step;
                    if (e.key === 'ArrowDown') pos.z += step;
                    if (e.key === 'ArrowLeft') pos.x -= step;
                    if (e.key === 'ArrowRight') pos.x += step;
                    // Note: Y axis nudging via PageUp/PageDown? 
                    return { ...c, position: pos };
                });

                // We need to apply updates to cubes array
                setCubes(prev => prev.map(c => {
                    const up = updates.find(u => u.id === c.id);
                    return up ? up : c;
                }));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds, cubes, clipboard, handleUndo, handleRedo, pushHistory, snapEnabled, contextMenu]);

    const handleRefineSelection = async () => {
        if (selectedIds.length === 0 || isGenerating || !refinePrompt) return;
        setIsGenerating(true);
        // Non-blocking toast
        const toastId = showProgressToast('REFINING SELECTION...');
        // setLoading(true, 'REFINING SELECTION...');
        setProgress(20);
        updateToast(toastId, { progress: 20 });

        addLog(`AI Refinement starting...`, 'info');
        try {
            const interval = setInterval(() => {
                setProgress(p => {
                    const next = Math.min(p + 5, 90);
                    updateToast(toastId, { progress: next });
                    return next;
                });
            }, 300);

            const selectedCubes = cubes.filter(c => selectedIds.includes(c.id));
            const { cubes: refinedCubes, time } = await refineSelectionWithAI(selectedCubes, refinePrompt);
            const nextCubes = cubes.filter(c => !selectedIds.includes(c.id)).concat(refinedCubes);

            clearInterval(interval);
            setProgress(100);
            updateToast(toastId, { progress: 100, message: 'Refinement Complete!', type: 'success', isLoading: false });
            setTimeout(() => removeToast(toastId), 3000);

            setCubes(nextCubes); pushHistory(nextCubes);
            setSelectedIds(refinedCubes.map(c => c.id));
            addLog(`Refinement complete: ${time.toFixed(0)}ms.`, 'success');
            setRefinePrompt('');
        } catch (e) {
            addLog('Refinement failed.', 'error');
            updateToast(toastId, { message: 'Refinement Failed', type: 'error', isLoading: false });
            setTimeout(() => removeToast(toastId), 3000);
        }
        finally { setIsGenerating(false); setLoading(false); }
    };

    // Select all visible objects
    const handleSelectAll = () => {
        const visibleIds = cubes.filter(c => c.visible !== false).map(c => c.id);
        setSelectedIds(visibleIds);
        addLog(`Selected ${visibleIds.length} objects`, 'info');
    };

    const handleExport = (format: string) => {
        const name = currentFileId ? fileSystem.nodes[currentFileId].name : 'PolyGen_Export';
        addLog(`Initiating ${format.toUpperCase()} export...`, 'info');

        try {
            switch (format) {
                case 'json': exportToJSON(cubes, name); break;
                case 'poly': exportToPoly(cubes, name); break;
                case 'obj': exportToOBJ(cubes, name); break;
                case 'bbmodel': exportToBlockbench(cubes, name); break;
                case 'ply': exportToPLY(cubes, name); break;
                case 'txmap': exportToTXMap(cubes, name); break;
                case 'send_to_game':
                case 'test_in_game': {
                    // Validate map has spawn points
                    const hasSpawns = cubes.some(c =>
                        c.properties?.txType === 'spawn' ||
                        c.name?.toLowerCase().includes('spawn')
                    );
                    if (!hasSpawns) {
                        const proceed = window.confirm(
                            '⚠️ Карта не имеет точек спавна!\n\n' +
                            'Игроки не смогут появиться на карте.\n' +
                            'Добавьте объект типа "spawn" или триггер спавна.\n\n' +
                            'Продолжить экспорт без спавнов?'
                        );
                        if (!proceed) {
                            addLog('Export cancelled - no spawn points', 'warning');
                            break;
                        }
                    }
                    const isTest = format === 'test_in_game';
                    addLog(`${isTest ? 'Testing' : 'Sending'} map '${name}'...`, 'info');
                    sendMapToTX(cubes, name, isTest).then(success => {
                        if (success) {
                            addLog(`${isTest ? 'Test started!' : 'Map sent successfully!'}`, 'success');
                            // Clear respawn effect when map is loaded - aggressive clearing
                            [100, 200, 500, 1000, 1500, 2000, 3000, 5000].forEach(delay => {
                                setTimeout(() => clearRespawnEffect(), delay);
                            });
                        } else {
                            addLog(`Failed to ${isTest ? 'start test' : 'send map'}.`, 'warning');
                        }
                    }).catch(e => {
                        addLog(`${isTest ? 'Test' : 'Send'} failed: ${e.message || e}`, 'error');
                    });
                    break;
                }
                default: throw new Error(`Unsupported format: ${format}`);
            }
            if (format !== 'send_to_game') addLog(`Successfully exported to ${name}.${format}`, 'success');
        } catch (e) {
            addLog(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
        }
        setShowExportMenu(false);
    };

    const handleProceduralBuild = () => {
        const building = generateProceduralBuilding(buildConfig, { x: 0, y: 0, z: 0 });
        const next = [...cubes, ...building];
        setCubes(next);
        pushHistory(next);
        addLog(`Generated building: ${building.length} blocks`, 'success');
    };

    const handleCityBuild = () => {
        setLoading(true, 'GENERATING CITY LAYOUT...');
        setProgress(30);
        addLog('Generating city layout...', 'info');
        // Run async to not freeze UI
        setTimeout(() => {
            const city = generateCity(cityConfig);
            setProgress(100);
            setCubes(city);
            pushHistory(city);
            addLog(`generated city with ${city.length} blocks`, 'success');
            setLoading(false);
        }, 50);
    };

    // --- Interaction ---
    const handleSelect = useCallback((ids: string | string[] | null, additive = false) => {
        if (ids === null) { setSelectedIds([]); return; }
        const list = Array.isArray(ids) ? ids : [ids];
        setSelectedIds(prev => additive ? Array.from(new Set([...prev, ...list])) : list);
    }, []);

    const handleUpdateSelected = (up: Partial<CubeElement> | ((c: CubeElement) => Partial<CubeElement>)) => {
        const next = cubes.map(c => selectedIds.includes(c.id) ? { ...c, ...(typeof up === 'function' ? up(c) : up) } : c);
        setCubes(next);
    };

    const handleCopy = () => {
        const sel = cubes.filter(c => selectedIds.includes(c.id));
        setClipboard(JSON.parse(JSON.stringify(sel))); addLog('Copied elements.', 'info');
    };

    const handlePaste = () => {
        const pasted = clipboard.map(c => ({ ...c, id: generateId(), position: { ...c.position, x: c.position.x + 1 } }));
        const next = [...cubes, ...pasted]; setCubes(next); pushHistory(next); setSelectedIds(pasted.map(c => c.id));
        addLog('Pasted elements.', 'success');
    };

    const handleDeleteCubes = () => {
        const next = cubes.filter(c => !selectedIds.includes(c.id));
        setCubes(next); pushHistory(next); setSelectedIds([]); addLog('Deleted selection.', 'warning');
    };

    const handleCloneSelected = () => {
        if (selectedIds.length === 0) return;
        const toClone = cubes.filter(c => selectedIds.includes(c.id));
        const cloned = toClone.map(c => ({
            ...c,
            id: generateId(),
            position: { x: c.position.x + 1, y: c.position.y, z: c.position.z + 1 },
            name: c.name + ' (Clone)'
        }));
        const next = [...cubes, ...cloned];
        setCubes(next);
        pushHistory(next);
        setSelectedIds(cloned.map(c => c.id));
        addLog(`Cloned ${cloned.length} objects.`, 'success');
    };

    // --- Explorer & Outliner ---
    const handleRenameNode = (id: string, name: string) => setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [id]: { ...prev.nodes[id], name } } }));
    const handleDeleteNode = (id: string) => {
        if (id === 'root') return;
        const pid = fileSystem.nodes[id]?.parentId;
        if (pid) {
            setFileSystem(prev => {
                const next = { ...prev.nodes };

                // Recursive delete helper
                const deleteRecursive = (nodeId: string) => {
                    const node = next[nodeId];
                    if (node && node.children) {
                        [...node.children].forEach(deleteRecursive);
                    }
                    delete next[nodeId];
                };

                deleteRecursive(id);

                // Update parent
                if (next[pid]) {
                    next[pid] = { ...next[pid], children: next[pid].children.filter(c => c !== id) };
                }

                return { ...prev, nodes: next };
            });

            // If we deleted the current file, switch to something else
            if (currentFileId === id) {
                // Try parent's first child that isn't us, or parent itself (if it was a file? no, parent is folder)
                // Just switch to null or root's default if available
                setCurrentFileId(null);
            }
        }
    };
    const handleCreateFile = (pid: string) => {
        const id = generateId();
        // Count existing files in parent to generate sequential name
        const parent = fileSystem.nodes[pid];
        const existingFiles = parent.children.filter(cid => fileSystem.nodes[cid]?.type === 'file').length;
        const fileName = `file_${existingFiles + 1}`;
        const node: FileNode = { id, parentId: pid, name: fileName, type: 'file', children: [], createdAt: Date.now(), content: { cubes: [], prompt: '', timestamp: Date.now() } };
        setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [id]: node, [pid]: { ...prev.nodes[pid], children: [...prev.nodes[pid].children, id], isExpanded: true } } }));
        setCurrentFileId(id);
    };
    const handleCreateFolder = (pid: string) => {
        const id = generateId();
        const node: FileNode = { id, parentId: pid, name: 'New Folder', type: 'folder', children: [], createdAt: Date.now(), isExpanded: true };
        setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [id]: node, [pid]: { ...prev.nodes[pid], children: [...prev.nodes[pid].children, id], isExpanded: true } } }));
    };
    const handleMoveNode = (nid: string, tid: string) => {
        const node = fileSystem.nodes[nid];
        const oid = node.parentId;
        if (!oid || nid === tid) return;
        setFileSystem(prev => ({
            ...prev,
            nodes: {
                ...prev.nodes,
                [nid]: { ...prev.nodes[nid], parentId: tid },
                [oid]: { ...prev.nodes[oid], children: prev.nodes[oid].children.filter(c => c !== nid) },
                [tid]: { ...prev.nodes[tid], children: [...prev.nodes[tid].children, nid] }
            }
        }));
    };

    const usedColors = useMemo(() => Array.from(new Set(cubes.filter(c => c.color).map(c => c.color!.toLowerCase()))), [cubes]);
    const filteredOutliner = useMemo(() => {
        return cubes.filter(c => c.name.toLowerCase().includes(outlinerSearch.toLowerCase()));
    }, [cubes, outlinerSearch]);
    const sel = useMemo(() => selectedIds.length > 0 ? cubes.find(c => c.id === selectedIds[0]) : null, [cubes, selectedIds]);

    const handleDragStart = (type: string) => {
        setDraggedItem(type);
    };

    const applyPreset = (preset: MapPreset) => {
        setPrompt(preset.prompt);
        if (preset.settings) {
            if (preset.settings.organicness !== undefined) setGenOrganicness(preset.settings.organicness);
            if (preset.settings.complexity) setGenComplexity(preset.settings.complexity);
            if (preset.settings.voxelSize) setGenVoxelSize(preset.settings.voxelSize);
            if (preset.settings.forceGround !== undefined) setGenForceGround(preset.settings.forceGround);
        }
        addLog(`Preset '${preset.name}' applied.`, 'info');
    };

    // Memoize filtered cubes for Scene component
    const filteredCubes = useMemo(() => {
        if (isIsolated) {
            return cubes.filter(c => selectedIds.includes(c.id));
        }
        return cubes.filter(c => {
            if (!c.visible) return false;
            const cat = c.properties?.txCategory as TXObjectCategory;
            return cat ? layerVisibility[cat] !== false : true;
        });
    }, [isIsolated, cubes, selectedIds, layerVisibility]);

    // Memoize Scene callbacks
    const handleSceneSelect = useCallback((ids: string | string[] | null, add?: boolean) => {
        handleSelect(ids, add);
        setContextMenu(prev => ({ ...prev, visible: false }));
    }, [handleSelect]);

    const handleSceneTransform = useCallback(() => {
        // Empty transform handler
    }, []);

    const handleSceneBatchTransform = useCallback((ups: { id: string, position?: any, rotation?: any, size?: any }[]) => {
        setCubes(prev => prev.map(c => {
            const u = ups.find(x => x.id === c.id);
            return u ? { ...c, ...u } : c;
        }));
    }, []);

    const handleSceneTransformEnd = useCallback(() => {
        pushHistory(cubes);
    }, [cubes, pushHistory]);

    // Function to find the highest point above surface at given X, Z position
    const getSurfaceHeight = useCallback((x: number, z: number, objectSize: { x: number, y: number, z: number }): number => {
        let maxHeight = 0;

        // 1. Check terrain elevation if available
        if (terrainMeshData) {
            const terrainHeight = getElevationAt(
                x,
                z,
                terrainMeshData.elevationGrid,
                terrainMeshData.gridSize,
                terrainMeshData.width
            );
            maxHeight = Math.max(maxHeight, terrainHeight);
        }

        // 2. Check all cubes that might be under or near this position
        // Check cubes that overlap with the object's footprint (considering object size)
        const halfSizeX = objectSize.x / 2;
        const halfSizeZ = objectSize.z / 2;

        for (const cube of cubes) {
            if (!cube.visible) continue;

            // Calculate cube bounds
            const cubeHalfX = cube.size.x / 2;
            const cubeHalfZ = cube.size.z / 2;
            const cubeMinX = cube.position.x - cubeHalfX;
            const cubeMaxX = cube.position.x + cubeHalfX;
            const cubeMinZ = cube.position.z - cubeHalfZ;
            const cubeMaxZ = cube.position.z + cubeHalfZ;

            // Check if object footprint overlaps with cube footprint
            const objMinX = x - halfSizeX;
            const objMaxX = x + halfSizeX;
            const objMinZ = z - halfSizeZ;
            const objMaxZ = z + halfSizeZ;

            if (objMaxX >= cubeMinX && objMinX <= cubeMaxX &&
                objMaxZ >= cubeMinZ && objMinZ <= cubeMaxZ) {
                // Overlap detected - get top of this cube
                const cubeTop = cube.position.y + (cube.size.y / 2);
                maxHeight = Math.max(maxHeight, cubeTop);
            }
        }

        // 3. Ensure minimum height above ground (0.1 units minimum)
        return Math.max(maxHeight, 0.1);
    }, [cubes, terrainMeshData]);

    // Memoize onDropItem callback
    const handleDropItem = useCallback((itemId: string, position: { x: number, y: number, z: number }) => {
        const paletteItem = paletteItems.find(p => p.id === itemId);
        const size = { x: 1, y: 1, z: 1 };

        let type = 'cube';
        let color = '#cccccc';
        let name = 'Cube';
        let props: any = {};
        let material = undefined;

        if (paletteItem) {
            name = paletteItem.name;
            color = paletteItem.color;
            type = paletteItem.type;

            // Get size from palette item properties if available
            if (paletteItem.properties?.size) {
                size.x = paletteItem.properties.size.x || size.x;
                size.y = paletteItem.properties.size.y || size.y;
                size.z = paletteItem.properties.size.z || size.z;
            }

            // Special handling for specific types
            if (type === 'spawn') props = { txType: 'spawn' };

            if (paletteItem.properties) {
                props = { ...props, ...paletteItem.properties };
                if (paletteItem.properties.material) {
                    material = paletteItem.properties.material;
                }
            }
        } else {
            // Fallback/Legacy
            if (itemId === 'window') { color = '#607d8b'; props = { transparent: true, opacity: 0.5 }; }
            if (itemId === 'ramp') { color = '#ffb74d'; type = 'ramp'; }
        }

        // Calculate correct Y position above surface
        const surfaceHeight = getSurfaceHeight(position.x, position.z, size);
        // Position object so its bottom is on the surface, center is at surfaceHeight + size.y/2
        const correctedY = surfaceHeight + (size.y / 2);

        const newCube: CubeElement = {
            id: generateId(),
            name,
            type: type as any,
            position: {
                x: position.x,
                y: correctedY,
                z: position.z
            },
            size,
            rotation: { x: 0, y: 0, z: 0 },
            color,
            visible: true,
            isLocked: false,
            properties: props,
            material
        };
        const nextCubes = [...cubes, newCube];
        setCubes(nextCubes);
        setSelectedIds([newCube.id]);
        pushHistory(nextCubes);
        setDraggedItem(null);
    }, [paletteItems, cubes, pushHistory, getSurfaceHeight]);

    if (!isAppLoaded) return <div className="h-screen w-screen bg-gray-950 flex items-center justify-center text-accent-500 font-mono animate-pulse uppercase tracking-[0.5em]">PolyGen Engine v5.0 Finalizing...</div>;

    return (
        <div className="flex h-screen w-screen bg-gray-900 text-gray-200 overflow-hidden font-sans select-none flex-col relative"
            onDragOver={(e) => {
                e.preventDefault();
                const width = window.innerWidth;
                const height = window.innerHeight;
                dragPointerRef.current.x = (e.clientX / width) * 2 - 1;
                dragPointerRef.current.y = -(e.clientY / height) * 2 + 1;
            }}
            onKeyDown={e => {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

                // === ESSENTIAL SHORTCUTS ===

                // Clipboard & History
                if (e.ctrlKey && e.key === 'c') { handleCopy(); e.preventDefault(); }
                if (e.ctrlKey && e.key === 'v') { handlePaste(); e.preventDefault(); }
                if (e.ctrlKey && e.key === 'x') { handleCopy(); handleDeleteCubes(); e.preventDefault(); } // Cut
                if (e.ctrlKey && e.key === 'z') { handleUndo(); e.preventDefault(); }
                if (e.ctrlKey && e.key === 'y') { handleRedo(); e.preventDefault(); }
                if (e.ctrlKey && e.shiftKey && e.key === 'Z') { handleRedo(); e.preventDefault(); } // Ctrl+Shift+Z = Redo

                // Selection
                if (e.ctrlKey && e.key === 'a') {
                    setSelectedIds(cubes.filter(c => c.visible && !c.isLocked).map(c => c.id));
                    e.preventDefault();
                } // Select All
                if (e.key === 'Escape') {
                    // In game mode (tank mode or in iframe), show pause menu
                    if (editorMode === 'tank' || isInTXIframe()) {
                        setShowPauseMenu(prev => !prev);
                        e.preventDefault();
                    } else {
                        // In editor mode, deselect all
                        setSelectedIds([]);
                    }
                }
                if (e.ctrlKey && e.key === 'd') { handleCopy(); handlePaste(); e.preventDefault(); } // Duplicate

                // Delete
                if (e.key === 'Delete' || e.key === 'Backspace') { handleDeleteCubes(); e.preventDefault(); }

                // Tool modes (single keys - no modifier)
                if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                    if (e.key === 'v' || e.key === 'q') setToolMode(ToolMode.SELECT);
                    if (e.key === 'g' || e.key === 'w') setToolMode(ToolMode.MOVE);
                    if (e.key === 'r' || e.key === 'e') setToolMode(ToolMode.ROTATE);
                    if (e.key === 's') setToolMode(ToolMode.SCALE);
                    if (e.key === 'p') setToolMode(ToolMode.PAINT);
                    if (e.key === 'b') setToolMode(ToolMode.BUILD);
                    if (e.key === 't') setToolMode(ToolMode.TERRAIN);
                    if (e.key === 'l') setToolMode(ToolMode.ROAD);
                }

                // View controls
                if (e.key === 'h') {
                    // Hide selected objects
                    if (selectedIds.length > 0) {
                        setCubes(prev => prev.map(c => selectedIds.includes(c.id) ? { ...c, visible: false } : c));
                        setSelectedIds([]);
                    }
                }
                if (e.altKey && e.key === 'h') {
                    // Unhide all
                    setCubes(prev => prev.map(c => ({ ...c, visible: true })));
                }
                if (e.key === 'f') {
                    // Focus on selected (placeholder - camera focus)
                    if (selectedIds.length > 0) {
                        addLog('📍 Focus on selection', 'info');
                    }
                }

                // Grid & Snap toggle
                if (e.key === 'x') { setSnapEnabled(prev => !prev); }
                if (e.key === '1') { setShowGrid(prev => !prev); }
                if (e.key === '2') { setShowAxes(prev => !prev); }
                if (e.key === '3') { setShowWireframe(prev => !prev); }

                // Help
                if (e.key === 'F1') { setShowHelpModal(true); e.preventDefault(); }

            }} tabIndex={0}>

            {/* Unified Loading Screen */}
            {!isAppLoaded && (
                <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center justify-center">
                    <div className="text-3xl font-black text-white mb-2 tracking-tight">
                        <span className="text-accent-500">PolyGen</span> Studio
                    </div>
                    <div className="text-xs text-gray-500 mb-8 uppercase tracking-widest">
                        {loadingPhase === 'react' && '🔧 Инициализация'}
                        {loadingPhase === 'threejs' && '🎮 3D Движок'}
                        {loadingPhase === 'resources' && '📦 Ресурсы'}
                        {loadingPhase === 'done' && '✅ Готово'}
                    </div>
                    <div className="w-80 h-2 bg-gray-800 rounded-full overflow-hidden shadow-inner">
                        <div
                            className="h-full bg-gradient-to-r from-accent-600 to-accent-400 transition-all duration-300 ease-out"
                            style={{ width: `${loadingProgress}%` }}
                        />
                    </div>
                    <div className="flex justify-between w-80 mt-2 text-[10px] text-gray-500">
                        <span>{loadingMessage}</span>
                        <span className="font-mono">{loadingProgress}%</span>
                    </div>
                </div>
            )}
            <div className="h-12 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-3 z-50 shrink-0 shadow-2xl gap-2 relative pointer-events-auto">
                {/* Left: Title + History */}
                <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-black tracking-tighter text-sm ${editorMode === 'tank' ? 'text-orange-500' : editorMode === 'map' ? 'text-green-500' : 'text-accent-500'}`}>
                        {modeConfig.title}
                    </span>

                    {/* MODE SWITCHER */}
                    <div className="flex items-center bg-gray-900 rounded-lg p-0.5 border border-gray-800">
                        <button
                            onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.set('mode', 'map');
                                window.history.pushState({}, '', url.toString());
                                window.location.reload();
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${editorMode === 'map' ? 'bg-green-900/50 text-green-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            title="Map Editor Mode"
                        >
                            🗺 MAP
                        </button>
                        <button
                            onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.set('mode', 'tank');
                                window.history.pushState({}, '', url.toString());
                                window.location.reload();
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${editorMode === 'tank' ? 'bg-orange-900/50 text-orange-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            title="Tank Workshop Mode"
                        >
                            🛡 TANK
                        </button>
                    </div>

                    <div className="flex gap-0.5">
                        <button onClick={handleUndo} disabled={historyIndex <= 0} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white disabled:opacity-20 transition-all hover:bg-gray-800"><Icons.Undo /></button>
                        <button onClick={handleRedo} disabled={historyIndex >= historyStack.length - 1} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white disabled:opacity-20 transition-all hover:bg-gray-800"><Icons.Redo /></button>
                    </div>
                </div>

                {/* Center: All Tool Buttons */}
                <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800 gap-0.5 shadow-inner">
                    {[
                        { m: ToolMode.SELECT, i: <Icons.MousePointer />, t: 'Select (V)' },
                        { m: ToolMode.MOVE, i: <Icons.Move />, t: 'Move (G)' },
                        { m: ToolMode.ROTATE, i: <Icons.Rotate />, t: 'Rotate (R)' },
                        { m: ToolMode.SCALE, i: <Icons.Scale />, t: 'Scale (S)' },
                    ].map(t => (
                        <button key={t.m} onClick={() => { console.log('[Toolbar] Clicked:', t.t); setToolMode(t.m); }} className={`w-8 h-8 flex items-center justify-center rounded transition-all ${toolMode === t.m ? 'bg-accent-600 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`} title={t.t}>{t.i}</button>
                    ))}
                    <div className="w-px h-6 bg-gray-700 mx-0.5" />
                    {[
                        { m: ToolMode.BUILD, i: <Icons.Cube />, t: 'Build (B)' },
                        { m: ToolMode.PAINT, i: <Icons.PaintBrush />, t: 'Paint (P)' },
                    ].map(t => (
                        <button key={t.m} onClick={() => setToolMode(t.m)} className={`w-8 h-8 flex items-center justify-center rounded transition-all ${toolMode === t.m ? 'bg-accent-600 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`} title={t.t}>{t.i}</button>
                    ))}
                    <div className="w-px h-6 bg-gray-700 mx-0.5" />
                    {[
                        { m: ToolMode.TERRAIN, i: <Icons.LayerGroup />, t: 'Terrain (T)' },
                        { m: ToolMode.ROAD, i: <Icons.Layout />, t: 'Road Tool (L)' },
                        { m: ToolMode.SCATTER, i: <Icons.Sparkles />, t: 'Scatter Brush' },
                    ].map(t => (
                        <button key={t.m} onClick={() => setToolMode(t.m)} className={`w-8 h-8 flex items-center justify-center rounded transition-all ${toolMode === t.m ? 'bg-accent-600 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`} title={t.t}>{t.i}</button>
                    ))}
                </div>

                {/* Right: File Ops + Settings + Exit */}
                <div className="flex items-center gap-1 shrink-0">
                    {/* WORKSHOP SHORTCUT BUTTON - Visible in Map Mode */}
                    {editorMode === 'map' && (
                        <button
                            onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.set('mode', 'tank');
                                window.history.pushState({}, '', url.toString());
                                window.location.reload();
                            }}
                            className="h-8 px-2 mr-1 rounded bg-orange-900/40 text-orange-400 hover:text-white hover:bg-orange-600 border border-orange-900/60 text-[10px] uppercase font-bold flex gap-1 items-center transition-all shadow-sm"
                            title="Open Tank Workshop"
                        >
                            🛡 WORKSHOP
                        </button>
                    )}

                    {/* Import Menu */}
                    <div className="relative">
                        <button onClick={() => setShowImportMenu(!showImportMenu)} className="h-8 px-2 rounded text-gray-400 hover:text-white text-[10px] uppercase font-bold hover:bg-gray-800 flex gap-1 items-center"><Icons.Import /> Import</button>
                        {showImportMenu && (
                            <div className="absolute top-full right-0 mt-1 w-40 bg-gray-850 border border-gray-700 rounded shadow-2xl z-50 py-1 max-h-80 overflow-y-auto">
                                <button onClick={() => { importInputRef.current?.click(); setShowImportMenu(false); }} className="w-full text-left px-3 py-1.5 text-[10px] text-gray-300 hover:bg-accent-600 hover:text-white uppercase font-mono border-b border-gray-800">📁 FROM FILE</button>
                                {isInTXIframe() && (
                                    <>
                                        <div className="px-3 py-1 text-[9px] text-gray-500 font-bold uppercase">Game Maps</div>
                                        {[
                                            { id: 'sand', name: 'Песок (Sand)' }
                                        ].map(map => (
                                            <button key={map.id} onClick={() => {
                                                requestGameMap(map.id);
                                                addLog(`Requesting map: ${map.name}...`, 'info');
                                                setShowImportMenu(false);
                                            }} className="w-full text-left px-3 py-1.5 text-[10px] text-green-400 hover:bg-green-600 hover:text-white uppercase font-mono flex items-center gap-2 transition-colors">
                                                <span>🎮</span> {map.name}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <input type="file" ref={importInputRef} onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                const content = event.target?.result as string;
                                const ext = file.name.split('.').pop()?.toLowerCase();
                                let imported: CubeElement[] = [];

                                try {
                                    if (ext === 'bbmodel') {
                                        // Blockbench format
                                        imported = importFromBlockbench(content);
                                    } else if (ext === 'txmap') {
                                        // TX Map format
                                        imported = importFromTXMap(content);
                                    } else if (ext === 'json' || ext === 'poly') {
                                        // Try raw JSON array first (PolyGen native format)
                                        const parsed = JSON.parse(content);
                                        if (Array.isArray(parsed)) {
                                            // Direct cube array
                                            imported = parsed.map((c: any) => ({
                                                id: c.id || generateId(),
                                                name: c.name || 'Imported',
                                                type: c.type || 'cube',
                                                parentId: c.parentId || null,
                                                position: c.position || { x: 0, y: 0, z: 0 },
                                                size: c.size || { x: 1, y: 1, z: 1 },
                                                rotation: c.rotation || { x: 0, y: 0, z: 0 },
                                                color: c.color || '#808080',
                                                visible: c.visible !== false,
                                                isLocked: c.isLocked || false,
                                                material: c.material
                                            }));
                                        } else if (parsed.placedObjects) {
                                            // TX Map format hidden in .json
                                            imported = importFromTXMap(content);
                                        } else if (parsed.elements) {
                                            // Blockbench hidden in .json
                                            imported = importFromBlockbench(content);
                                        }
                                    }

                                    if (imported.length > 0) {
                                        setCubes(prev => [...prev, ...imported]);
                                        pushHistory([...cubes, ...imported]);
                                        addLog(`Imported ${imported.length} objects from ${file.name}`, 'success');
                                    } else {
                                        addLog(`No objects found in ${file.name}`, 'warning');
                                    }
                                } catch (err) {
                                    console.error('Import error:', err);
                                    addLog(`Failed to import ${file.name}: ${err}`, 'error');
                                }
                            };
                            reader.readAsText(file);
                        }
                        // Reset input value to allow re-importing same file
                        e.target.value = '';
                    }} className="hidden" accept=".json,.bbmodel,.txmap,.poly" />
                    {/* Export Menu */}
                    <div className="relative">
                        <button onClick={() => setShowExportMenu(!showExportMenu)} className="h-8 px-2 rounded text-gray-400 hover:text-white text-[10px] uppercase font-bold hover:bg-gray-800 flex gap-1 items-center">Export <Icons.ChevronDown /></button>
                        {showExportMenu && (
                            <div className="absolute top-full right-0 mt-1 w-40 bg-gray-850 border border-gray-700 rounded shadow-2xl z-50 py-1 overflow-hidden">
                                {['json', 'poly', 'obj', 'bbmodel', 'ply'].map(f => <button key={f} onClick={() => handleExport(f)} className="w-full text-left px-3 py-1 text-[10px] text-gray-300 hover:bg-accent-600 hover:text-white uppercase font-mono">{f}</button>)}
                                <div className="border-t border-gray-700 my-1" />
                                <button onClick={() => handleExport('txmap')} className="w-full text-left px-3 py-1 text-[10px] text-green-400 hover:bg-green-600 hover:text-white uppercase font-mono font-bold">🗺 TX MAP</button>
                                {isInTXIframe() && (
                                    <>
                                        <button onClick={() => handleExport('send_to_game')} className="w-full text-left px-3 py-1 text-[10px] text-yellow-400 hover:bg-yellow-600 hover:text-white uppercase font-mono font-bold border-t border-gray-700 mt-1 pt-1">🎮 SEND TO GAME</button>
                                        <button onClick={() => handleExport('test_in_game')} className="w-full text-left px-3 py-1 text-[10px] text-orange-400 hover:bg-orange-600 hover:text-white uppercase font-mono font-bold">⚡ TEST</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="w-px h-6 bg-gray-800 mx-1" />
                    <button onClick={() => setShowSettingsMenu(!showSettingsMenu)} className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${showSettingsMenu ? 'text-white bg-gray-800' : 'text-gray-500 hover:bg-gray-800'}`}><Icons.Settings /></button>
                    {/* Help Button */}
                    <button
                        onClick={() => setShowHelpModal(true)}
                        className="h-8 px-2 rounded text-gray-400 hover:text-white text-[10px] uppercase font-bold hover:bg-gray-800 flex gap-1 items-center"
                        title="Справка (F1)"
                    >
                        ❓ Help
                    </button>

                    {isInTXIframe() && (
                        <button onClick={() => window.parent.postMessage({ type: 'CLOSE_EDITOR' }, '*')} className="h-8 px-2 rounded text-red-500 hover:text-white text-[10px] uppercase font-bold hover:bg-red-900/50 flex gap-1 items-center border border-red-900/30">
                            <Icons.Close /> Exit
                        </button>
                    )}
                </div>
            </div>

            {/* Global Settings Dropdown */}
            {/* Object Creator Modal */}
            {showObjCreator && (
                <ObjectCreator
                    onSave={(newItem) => {
                        setPaletteItems(prev => [...prev, newItem]);
                        setShowObjCreator(false);
                    }}
                    onCancel={() => setShowObjCreator(false)}
                />
            )}

            {showSettingsMenu && (
                <div className="absolute top-11 right-4 w-72 bg-gray-900/98 border border-gray-700 rounded-xl shadow-2xl p-4 z-[60] backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-150">
                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 mb-4">Master Config</div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            {['tx', 'dark', 'light', 'cyberpunk', 'fui', 'industrial', 'mix'].map(t => (
                                <button key={t} onClick={() => setTheme(t as Theme)} className={`px-2 py-1.5 rounded-lg text-[9px] uppercase font-bold text-left capitalize ${theme === t ? 'bg-accent-600 text-white shadow-lg' : 'bg-gray-950 text-gray-500 hover:bg-gray-800'}`}>{t === 'tx' ? 'TX Protocol' : t}</button>
                            ))}
                        </div>
                        <div className="space-y-2 border-t border-gray-800 pt-4">
                            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase"><label htmlFor="setting-grid">Grid</label><input id="setting-grid" name="setting-grid" type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="accent-accent-500" /></div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase"><label htmlFor="setting-snap">Snap</label><input id="setting-snap" name="setting-snap" type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} className="accent-accent-500" /></div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase"><label htmlFor="setting-axes">Axes</label><input id="setting-axes" name="setting-axes" type="checkbox" checked={showAxes} onChange={e => setShowAxes(e.target.checked)} className="accent-accent-500" /></div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase"><label htmlFor="setting-wireframe">Wireframe</label><input id="setting-wireframe" name="setting-wireframe" type="checkbox" checked={showWireframe} onChange={e => setShowWireframe(e.target.checked)} className="accent-accent-500" /></div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase"><label htmlFor="setting-stats">Stats Overlay</label><input id="setting-stats" name="setting-stats" type="checkbox" checked={showStats} onChange={e => setShowStats(e.target.checked)} className="accent-accent-500" /></div>
                        </div>
                        <div className="border-t border-gray-800 pt-4">
                            <button
                                onClick={() => {
                                    setShowSettingsMenu(false);
                                    setShowSessionModal(true);
                                }}
                                className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-2"
                            >
                                <span>🔗</span> Сессия
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {/* Context Menu */}
            <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                visible={contextMenu.visible}
                onClose={() => setContextMenu({ ...contextMenu, visible: false })}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onCopy={handleCopy}
                onPaste={handlePaste}
                onDelete={handleDeleteCubes}
                onGroup={handleGroup}
                onUngroup={handleUngroup}
                onClone={handleCloneSelected}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < historyStack.length - 1}
                hasSelection={selectedIds.length > 0}
            />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Fixed: Side Panel Collapse Handles (Chevron bars) */}
                {!leftSidebarOpen && (
                    <div onClick={() => setLeftSidebarOpen(true)} className="absolute left-0 top-0 bottom-0 w-8 bg-gray-950 border-r border-gray-800 z-50 flex flex-col items-center py-6 cursor-pointer hover:bg-gray-900 transition-colors shadow-2xl">
                        <div className="text-accent-500 -rotate-90 whitespace-nowrap text-[10px] font-black uppercase tracking-widest mt-12 mb-auto">Project Explorer</div>
                        <Icons.ChevronRight />
                    </div>
                )}
                {/* Left Sidebar (Explorer & Outliner) with Tabs */}
                <div className={`bg-gray-900 border-r border-gray-800 transition-all duration-300 flex flex-col relative ${leftSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
                    {/* Sidebar Tabs */}
                    <div className="flex border-b border-gray-800 shrink-0">
                        <button onClick={() => setSidebarTab('files')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider transition-colors ${sidebarTab === 'files' ? 'text-accent-400 bg-gray-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'}`}>Explorer</button>
                        <button onClick={() => setSidebarTab('palette')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider transition-colors ${sidebarTab === 'palette' ? 'text-accent-400 bg-gray-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'}`}>Palette</button>
                        <button onClick={() => setSidebarTab('props')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider transition-colors ${sidebarTab === 'props' ? 'text-accent-400 bg-gray-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'}`}>Props</button>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        {sidebarTab === 'files' ? (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <FileBrowser
                                    fileSystem={fileSystem} currentFileId={currentFileId}
                                    onSelectFile={setCurrentFileId}
                                    onDeleteNode={handleDeleteNode} onRenameNode={handleRenameNode}
                                    onCreateFile={handleCreateFile} onCreateFolder={handleCreateFolder}
                                    onToggleFolder={(id) => setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [id]: { ...prev.nodes[id], isExpanded: !prev.nodes[id].isExpanded } } }))}
                                    onMoveNode={handleMoveNode} onDuplicateNode={() => { }} onToggleFavorite={(id) => setFileSystem(prev => ({ ...prev, nodes: { ...prev.nodes, [id]: { ...prev.nodes[id], isFavorite: !prev.nodes[id].isFavorite } } }))}
                                    onCloseSidebar={() => setLeftSidebarOpen(false)}
                                />
                                <div className="h-1/2 border-t border-gray-800 flex flex-col p-2 overflow-hidden bg-gray-950/30">
                                    <div className="text-[10px] font-black text-gray-500 uppercase mb-2 flex justify-between px-2 items-center">Outliner <Icons.LayerGroup /></div>
                                    <div className="px-2 mb-2 relative">
                                        <input className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-accent-500 shadow-inner" placeholder="Search objects..." value={outlinerSearch} onChange={e => setOutlinerSearch(e.target.value)} />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] text-gray-600"><Icons.Search /></div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar px-1">
                                        {filteredOutliner.map(c => (
                                            <div key={c.id} onClick={() => handleSelect(c.id)} className={`px-2 py-1.5 text-[10px] rounded cursor-pointer flex justify-between items-center transition-all ${selectedIds.includes(c.id) ? 'bg-accent-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800'}`}>
                                                <div className="flex items-center gap-2 truncate"><Icons.Cube /> {c.name}</div>
                                                <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateSelected(prev => (c.id === prev.id ? { visible: !c.visible } : {})); }} className="hover:text-white">{c.visible ? <Icons.Eye /> : <Icons.EyeSlash />}</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateSelected(prev => (c.id === prev.id ? { isLocked: !c.isLocked } : {})); }} className="hover:text-white">{c.isLocked ? <Icons.Lock /> : <Icons.Unlock />}</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : sidebarTab === 'palette' ? (
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2 mt-2">Building Blocks</div>
                                <div className="grid grid-cols-3 gap-2 px-1">
                                    {paletteItems.map(item => (
                                        <div
                                            key={item.id}
                                            draggable
                                            onDragStart={() => setDraggedItem(item.id)}
                                            onDragEnd={() => setDraggedItem(null)}
                                            onDoubleClick={() => {
                                                // Spawn object at origin on double-click
                                                const newCube: CubeElement = {
                                                    id: generateId(),
                                                    name: item.name,
                                                    type: 'cube',
                                                    position: { x: 0, y: 0.5, z: 0 },
                                                    rotation: { x: 0, y: 0, z: 0 },
                                                    size: { x: 1, y: 1, z: 1 },
                                                    color: item.color,
                                                    visible: true,
                                                    isLocked: false,
                                                    isFavorite: false
                                                };
                                                const next = [...cubes, newCube];
                                                setCubes(next);
                                                pushHistory(next);
                                                setSelectedIds([newCube.id]);
                                                addLog(`Добавлен: ${item.name}`, 'success');
                                            }}
                                            className="aspect-square bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:bg-gray-700 hover:text-accent-400 text-gray-400 transition-colors border border-transparent hover:border-gray-600 shadow-md"
                                            title="Двойной клик для спавна"
                                        >
                                            <div className="scale-75">{item.icon}</div>
                                            <span className="text-[8px] font-bold uppercase truncate max-w-full px-1">{item.name}</span>
                                        </div>
                                    ))}
                                    {/* Add Object Button */}
                                    <button
                                        onClick={() => setShowObjCreator(true)}
                                        className="aspect-square bg-gray-900 border border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-accent-500 hover:text-accent-400 text-gray-600 transition-all"
                                    >
                                        <Icons.Plus />
                                        <span className="text-[8px] font-bold uppercase">Add</span>
                                    </button>
                                </div>
                                <div className="px-2 text-[10px] text-gray-600 text-center italic mt-4 opacity-50">Drag objects to scene</div>

                                {/* Real World Generator - MAP MODE ONLY */}
                                {(editorMode === 'map' || editorMode === 'default') && (
                                    <div className="mt-4 px-2">
                                        <RealWorldGenerator
                                            generateId={generateId}
                                            onGenerate={(newCubes, mapName, terrainData) => {
                                                setCubes(prev => [...prev, ...newCubes]);
                                                pushHistory([...cubes, ...newCubes]);
                                                // Store terrain data for mesh visualization
                                                if (terrainData) {
                                                    setTerrainMeshData(terrainData);
                                                }
                                                addLog(`🌍 Imported ${newCubes.length} objects from ${mapName}`, 'info');
                                            }}
                                            onAddCubes={(newCubes, animate) => {
                                                // Streaming mode: add cubes incrementally
                                                setCubes(prev => [...prev, ...newCubes]);
                                                // Note: We don't push to history for each batch to avoid spam
                                                // History will be pushed after streaming completes
                                                if (animate) {
                                                    addLog(`🏢 Streamed ${newCubes.length} buildings`, 'info');
                                                }
                                            }}
                                        />

                                        {/* TEST BUTTON - Live Testing in Game */}
                                        <button
                                            onClick={() => {
                                                console.log('[PolyGen] ===== TEST BUTTON CLICKED =====');
                                                console.log('[PolyGen] Current cubes count:', cubes.length);

                                                // ПРОВЕРКА ТОЧКИ СПАВНА
                                                const hasSpawn = cubes.some(c =>
                                                    c.name.toLowerCase().includes('spawn') ||
                                                    c.type === 'spawn' ||
                                                    c.name.toLowerCase().includes('respawn')
                                                );

                                                if (!hasSpawn) {
                                                    addLog('⚠️ ВНИМАНИЕ: На карте нет точки спавна! Добавьте объект "spawn" для тестирования.', 'warning');
                                                    alert('⚠️ ТОЧКА СПАВНА НЕ НАЙДЕНА!\n\nДобавьте на карту объект с именем "spawn" или типом "spawn" для указания места появления танка.');
                                                    return;
                                                }

                                                // Clear ALL old map data first
                                                localStorage.removeItem('tx_test_map');
                                                localStorage.removeItem('selectedCustomMapData');
                                                console.log('[PolyGen] Cleared old localStorage data');

                                                // Use exportForTest (no file download!)
                                                const mapData = exportForTest(cubes, 'test_map');
                                                console.log('[PolyGen] Map data created:', mapData.placedObjects?.length || 0, 'objects');
                                                console.log('[PolyGen] Map data sample:', mapData.placedObjects?.[0]);

                                                try {
                                                    const jsonData = JSON.stringify(mapData);
                                                    const dataSizeMB = (jsonData.length / 1024 / 1024).toFixed(2);
                                                    console.log(`[PolyGen] Data size: ${dataSizeMB} MB (${jsonData.length} bytes)`);

                                                    // Предупреждение для больших карт
                                                    if (jsonData.length > 4 * 1024 * 1024) {
                                                        console.warn(`[PolyGen] ⚠️ Map data is ${dataSizeMB}MB - may exceed localStorage limit!`);
                                                        addLog(`⚠️ Карта очень большая (${dataSizeMB}MB) - возможны проблемы с сохранением`, 'warning');
                                                    }

                                                    try {
                                                        localStorage.setItem('tx_test_map', jsonData);
                                                        localStorage.setItem('selectedCustomMapData', jsonData);
                                                        console.log('[PolyGen] ✅ Map saved to BOTH localStorage keys');
                                                    } catch (storageError: any) {
                                                        // Ошибка квоты localStorage
                                                        console.error('[PolyGen] ❌ localStorage QUOTA EXCEEDED:', storageError);
                                                        addLog(`❌ Карта слишком большая для localStorage! (${dataSizeMB}MB). Попробуйте уменьшить количество объектов.`, 'error');
                                                        alert(`❌ КАРТА СЛИШКОМ БОЛЬШАЯ!\n\nРазмер: ${dataSizeMB}MB\nОбъектов: ${mapData.placedObjects?.length}\n\nlocalStorage не может сохранить такой объём данных.\nПопробуйте удалить часть объектов или использовать Export to File.`);
                                                        return;
                                                    }

                                                    // Check if we're in an iframe (embedded in TX game)
                                                    const isInIframe = window.parent !== window;
                                                    console.log('[PolyGen] isInIframe:', isInIframe);

                                                    if (isInIframe) {
                                                        // Send message to parent window to start test mode
                                                        console.log('[PolyGen] Sending postMessage to parent...');
                                                        window.parent.postMessage({
                                                            type: 'POLYGEN_TEST_MAP',
                                                            mapData: mapData
                                                        }, '*');
                                                        console.log('[PolyGen] postMessage sent!');

                                                        // Collapse editor after sending test
                                                        window.parent.postMessage({
                                                            type: 'POLYGEN_COLLAPSE_EDITOR'
                                                        }, '*');
                                                        console.log('[PolyGen] Editor collapse requested');

                                                        addLog(`🎮 Sent ${mapData.placedObjects?.length} objects to game!`, 'info');
                                                    } else {
                                                        // Standalone mode - open game in new window
                                                        console.log('[PolyGen] Standalone mode - opening new window');
                                                        const gameUrl = `http://localhost:5000?testMap=current`;
                                                        window.open(gameUrl, 'tx_game_test', 'width=1280,height=720');
                                                        addLog('🎮 Opened game for live testing', 'info');
                                                    }
                                                } catch (e) {
                                                    console.error('[PolyGen] TEST error:', e);
                                                    addLog('❌ Failed to save map for testing: ' + (e as Error).message, 'error');
                                                }
                                            }}
                                            className="w-full mt-3 py-2 px-4 rounded font-bold text-sm uppercase bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
                                        >
                                            🎮 TEST IN GAME
                                        </button>

                                        {/* HOT RELOAD BUTTON - Apply changes and return to game */}
                                        {window.parent !== window && localStorage.getItem('polygen_test_mode_active') === 'true' && (
                                            <button
                                                onClick={() => {
                                                    console.log('[PolyGen] ===== HOT RELOAD BUTTON CLICKED =====');

                                                    const mapData = exportForTest(cubes);
                                                    const jsonData = JSON.stringify(mapData);

                                                    try {
                                                        localStorage.setItem('tx_test_map', jsonData);
                                                        localStorage.setItem('selectedCustomMapData', jsonData);

                                                        // Send HOT RELOAD message to parent
                                                        window.parent.postMessage({
                                                            type: 'POLYGEN_HOT_RELOAD',
                                                            mapData: mapData
                                                        }, '*');

                                                        showToast('🔥 Изменения применены!', 'success');
                                                        addLog(`🔥 Hot-reload: ${mapData.placedObjects?.length} objects sent`, 'success');
                                                    } catch (e) {
                                                        console.error('[PolyGen] Hot-reload error:', e);
                                                        showToast('❌ Ошибка hot-reload', 'error');
                                                    }
                                                }}
                                                className="w-full mt-2 py-2 px-4 rounded font-bold text-sm uppercase bg-orange-600 text-white hover:bg-orange-500 transition-colors flex items-center justify-center gap-2"
                                            >
                                                🔥 ПРИМЕНИТЬ И ВЕРНУТЬСЯ
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : sidebarTab === 'props' ? (
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Object Properties</div>
                                {sel ? (
                                    <div className="space-y-4">
                                        {/* Name */}
                                        <div className="space-y-1">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Name</label>
                                            <input className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-accent-500 outline-none" value={sel.name} onChange={e => handleUpdateSelected({ name: e.target.value })} />
                                        </div>

                                        {/* Object Type */}
                                        <div className="space-y-1">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Type</label>
                                            <select className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-accent-500 outline-none" value={sel.objectType || 'building'} onChange={e => handleUpdateSelected({ objectType: e.target.value })}>
                                                <option value="building">🏢 Building</option>
                                                <option value="road">🛣️ Road</option>
                                                <option value="water">🌊 Water</option>
                                                <option value="vegetation">🌲 Vegetation</option>
                                                <option value="prop">📦 Prop</option>
                                                <option value="spawn">🎯 Spawn</option>
                                                <option value="trigger">⚡ Trigger</option>
                                            </select>
                                        </div>

                                        {/* Position */}
                                        <div className="space-y-1">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Position</label>
                                            <div className="grid grid-cols-3 gap-1">
                                                {['x', 'y', 'z'].map(a => <DraggableNumberInput key={a} label={a.toUpperCase()} value={sel.position[a as keyof Vector3]} onChange={(v: any) => handleUpdateSelected({ position: { ...sel.position, [a]: v } })} />)}
                                            </div>
                                        </div>

                                        {/* Rotation */}
                                        <div className="space-y-1">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Rotation</label>
                                            <div className="grid grid-cols-3 gap-1">
                                                {['x', 'y', 'z'].map(a => <DraggableNumberInput key={a} label={a.toUpperCase()} value={sel.rotation[a as keyof Vector3]} onChange={(v: any) => handleUpdateSelected({ rotation: { ...sel.rotation, [a]: v } })} />)}
                                            </div>
                                        </div>

                                        {/* Scale */}
                                        <div className="space-y-1">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Scale</label>
                                            <div className="grid grid-cols-3 gap-1">
                                                {['x', 'y', 'z'].map(a => <DraggableNumberInput key={a} label={a.toUpperCase()} value={sel.size[a as keyof Vector3]} onChange={(v: any) => handleUpdateSelected({ size: { ...sel.size, [a]: v } })} />)}
                                            </div>
                                        </div>

                                        {/* Color */}
                                        <div className="space-y-1">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Color</label>
                                            <div className="flex gap-2 items-center bg-gray-950 p-2 rounded-lg border border-gray-800">
                                                <input id="prop-color" name="prop-color" type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={sel.color} onChange={e => { setPaintColor(e.target.value); handleUpdateSelected({ color: e.target.value }) }} />
                                                <label htmlFor="prop-color" className="text-xs font-mono uppercase">{sel.color}</label>
                                            </div>
                                        </div>

                                        {/* Flags */}
                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800">
                                            <label htmlFor="prop-collidable" className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer">
                                                <input id="prop-collidable" name="prop-collidable" type="checkbox" checked={sel.collidable !== false} onChange={e => handleUpdateSelected({ collidable: e.target.checked })} className="accent-green-500 w-3 h-3" />
                                                Collidable
                                            </label>
                                            <label htmlFor="prop-visible" className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer">
                                                <input id="prop-visible" name="prop-visible" type="checkbox" checked={sel.visible !== false} onChange={e => handleUpdateSelected({ visible: e.target.checked })} className="accent-green-500 w-3 h-3" />
                                                Visible
                                            </label>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-6 border border-dashed border-gray-800 rounded-xl text-[10px] text-gray-600 uppercase font-bold">
                                        Select an object to edit
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Main Viewport */}
                <div
                    className="flex-1 relative bg-gray-950 flex flex-col"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        // Optional: Could handle drop here if R3F fails, but R3F DragPreview should handle it.
                        // However, we need to ensure the drag operation is valid.
                    }}
                >
                    <Scene
                        cubes={filteredCubes}
                        selectedIds={selectedIds}
                        onSelect={handleSceneSelect}
                        onTransform={handleSceneTransform}
                        onBatchTransform={handleSceneBatchTransform}
                        onTransformEnd={handleSceneTransformEnd}
                        toolMode={toolMode}
                        snapGrid={snapEnabled ? 0.25 : null}
                        snapAngle={snapEnabled ? 15 : null}
                        backgroundColor={viewportColor} gridColor="#1a1a20" sectionColor="#2a2a35" showGrid={showGrid} showWireframe={showWireframe} showAxes={showAxes}
                        cameraMode={cameraMode}

                        performanceMode={!showStats}
                        terrainData={terrainMeshData || undefined}
                        draggedItem={draggedItem}
                        onDropItem={handleDropItem}
                        onPaintCube={(id) => {
                            if (toolMode === ToolMode.PAINT) {
                                const nc = cubes.map(c => c.id === id ? { ...c, color: paintColor } : c);
                                setCubes(nc); pushHistory(nc);
                            }
                            if (toolMode === ToolMode.TERRAIN) {
                                const target = cubes.find(c => c.id === id);
                                if (target) {
                                    const next = applyTerrainBrush(cubes, target.position, terrainConfig.radius, terrainConfig.mode);
                                    setCubes(next);
                                    pushHistory(next); // Might want to debounce this for drag
                                }
                            }
                            if (toolMode === ToolMode.ROAD) {
                                const target = cubes.find(c => c.id === id);
                                if (target) {
                                    if (!roadStart) {
                                        setRoadStart(target.position);
                                        addLog('Road Start Set. Click End point...', 'info');
                                    } else {
                                        const newRoad = createRoadPath(roadStart, target.position, roadConfig.width, roadConfig.color);
                                        const next = [...cubes, ...newRoad];
                                        setCubes(next);
                                        pushHistory(next);
                                        setRoadStart(null);
                                        addLog('Road Created', 'success');
                                    }
                                }
                            }
                            if (toolMode === ToolMode.SCATTER) {
                                const target = cubes.find(c => c.id === id);
                                if (target) {
                                    // Use scatter template (defaulting to simple tree part for now if no sophisticated selection)
                                    // Let's actually use a simple tree logic:
                                    const template = {
                                        ...scatterTemplate,
                                        position: { x: 0, y: 1, z: 0 }, // Relative
                                        visible: true,
                                        properties: { txCategory: 'nature' }
                                    };
                                    const scattered = scatterObjects(target.position, scatterConfig.radius, scatterConfig.density, template);
                                    const next = [...cubes, ...scattered];
                                    setCubes(next);
                                    pushHistory(next);
                                }
                            }
                        }}
                        onContextMenu={(x, y, id) => setViewportContextMenu({ x, y, id })}
                    />

                    {/* Remote Cursors Overlay (Simplified 2D or integration in Scene is better) */}
                    {/* Since Scene is 3D, we can't easily overlay DOM elements without projecting 3D to 2D. 
                        Ideally, RemoteCursors should be passed to Scene to render as 3D markers. 
                        For now, we will skip visual cursors or assume Scene renders them if passed.
                        Let's skipping changing Scene props for now and just rely on state sync.
                    */}

                    {/* AI Input Area */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40">
                        {showGenSettings && (
                            <div className="mb-3 bg-gray-900/98 backdrop-blur-3xl border border-gray-700 rounded-2xl p-5 shadow-2xl flex flex-col gap-5 animate-in slide-in-from-bottom-5 duration-300 border-accent-500/20">
                                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                                    <span className="text-[11px] font-black uppercase text-accent-500 tracking-[0.2em] flex items-center gap-2"><Icons.Sliders /> Core Synthesis Engine</span>
                                    <button onClick={() => setShowGenSettings(false)} className="text-gray-500 hover:text-white transition-colors"><Icons.Close /></button>
                                </div>
                                <div className="grid grid-cols-2 gap-x-10 gap-y-5 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                                    {/* Presets Grid */}
                                    <div className="col-span-2 mb-2 border-b border-gray-800 pb-4">
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2"><Icons.Sparkles /> AI Scenarios</div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {MAP_PRESETS.map(preset => (
                                                <button key={preset.name} onClick={() => applyPreset(preset)} className="flex flex-col items-center justify-center p-3 bg-gray-950/50 border border-gray-800 rounded-xl hover:border-accent-500 hover:bg-gray-800 transition-all group relative overflow-hidden">
                                                    <div className="absolute inset-0 bg-accent-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    <span className="text-2xl mb-2 group-hover:scale-110 transition-transform filter drop-shadow-md">{preset.icon}</span>
                                                    <span className="text-[9px] font-black text-gray-500 uppercase text-center group-hover:text-accent-400 leading-tight">{preset.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-2.5 bg-gray-950 rounded-xl border border-gray-800"><span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Avoid Z-Fight</span><input type="checkbox" checked={avoidGlitch} onChange={e => setAvoidGlitch(e.target.checked)} className="accent-accent-500" /></div>
                                        <div className="space-y-1.5"><div className="flex justify-between text-[10px] uppercase font-black text-gray-500"><span>Organic Level</span><span className="text-accent-400 font-mono">{genOrganicness}</span></div><input type="range" min="0" max="1" step="0.1" value={genOrganicness} onChange={e => setGenOrganicness(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-accent-500" /></div>
                                        <div className="space-y-1.5"><div className="flex justify-between text-[10px] uppercase font-black text-gray-500"><span>Detail Density</span><span className="text-accent-400 font-mono">{genDetailDensity}</span></div><input type="range" min="1" max="10" step="1" value={genDetailDensity} onChange={e => setGenDetailDensity(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-accent-500" /></div>
                                        {/* Seed restored here */}
                                        <div className="space-y-1.5"><label className="text-[10px] font-black text-gray-500 uppercase block tracking-widest">Seed Engine (0 = Random)</label><input type="number" value={genSeed} onChange={e => setGenSeed(parseInt(e.target.value))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-[10px] text-white outline-none focus:border-accent-500 font-mono shadow-inner" placeholder="0" /></div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-2.5 bg-gray-950 rounded-xl border border-gray-800"><span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Force Ground</span><input type="checkbox" checked={genForceGround} onChange={e => setGenForceGround(e.target.checked)} className="accent-accent-500" /></div>
                                        <div className="flex items-center justify-between p-2.5 bg-gray-950 rounded-xl border border-gray-800"><span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Symmetry Axis</span><select value={genSymmetry} onChange={e => setGenSymmetry(e.target.value as any)} className="bg-transparent text-[10px] text-accent-400 outline-none uppercase font-bold"><option value="none">None</option><option value="x">X-Axis</option><option value="y">Y-Axis</option><option value="z">Z-Axis</option></select></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1.5"><label className="text-[10px] font-black text-gray-500 uppercase block tracking-widest">Complexity</label><select value={genComplexity} onChange={e => setGenComplexity(e.target.value as any)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-[10px] text-white outline-none"><option value="simple">Simple</option><option value="medium">Standard</option><option value="detailed">Ultra</option></select></div>
                                            <div className="space-y-1.5"><label className="text-[10px] font-black text-gray-500 uppercase block tracking-widest">Map Size</label><select value={genMapSize} onChange={e => setGenMapSize(Number(e.target.value))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-[10px] text-white outline-none"><option value={100}>100×100</option><option value={200}>200×200</option><option value={300}>300×300</option><option value={500}>500×500</option><option value={1000}>1000×1000</option></select></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div className="space-y-1.5"><label className="text-[10px] font-black text-gray-500 uppercase block tracking-widest">Detail Density</label><DraggableNumberInput label="D" value={genDetailDensity} onChange={setGenDetailDensity} step={1} /></div>
                                            <div className="space-y-1.5"><label className="text-[10px] font-black text-gray-500 uppercase block tracking-widest">Voxel Scale</label><DraggableNumberInput label="V" value={genVoxelSize} onChange={setGenVoxelSize} step={0.05} /></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="bg-gray-950/90 border border-gray-700 rounded-xl p-2 flex items-center gap-2 shadow-2xl backdrop-blur-3xl border-accent-500/20">
                            <button onClick={() => setShowGenSettings(!showGenSettings)} className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all hover:scale-105 ${showGenSettings ? 'bg-accent-600 text-white shadow-lg shadow-accent-500/50' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}><Icons.Sliders /></button>
                            <input className="flex-1 bg-transparent px-3 py-2 text-xs outline-none text-white placeholder-gray-600 tracking-wide" placeholder={modeConfig.placeholder} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
                            <div className="flex gap-1.5">
                                <button onClick={handleGenerate} disabled={isGenerating || !prompt} className="h-10 px-5 rounded-lg bg-accent-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-accent-500 disabled:opacity-50 transition-all shadow-lg flex items-center gap-2">
                                    {isGenerating && !batchProgress ? <Icons.Spinner /> : <Icons.Magic />} <span>Synthesize</span>
                                </button>
                                <button onClick={handleBatch} disabled={isGenerating || !prompt} className="h-10 w-12 rounded-lg bg-gray-900 border border-accent-500/30 text-accent-400 text-[10px] font-black uppercase hover:bg-gray-800 hover:border-accent-500 transition-all">x10</button>
                            </div>
                        </div>
                    </div>

                    {/* Matrix HUD */}
                    {
                        batchProgress && !batchProgress.isMinimized && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-950 border border-gray-700 p-8 rounded-3xl shadow-2xl w-80 backdrop-blur-3xl animate-in zoom-in-95 border-accent-500/40">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="text-[11px] font-black text-accent-400 uppercase tracking-[0.3em]">Matrix Synthesis</div>
                                    <div className="flex gap-2"><button onClick={() => setBatchProgress(p => p ? { ...p, isMinimized: true } : null)} className="hover:text-white"><Icons.Minus /></button><button onClick={() => cancelBatchRef.current = true} className="hover:text-red-500"><Icons.Close /></button></div>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest"><span>Compiling...</span><span>{batchProgress.current}/10</span></div>
                                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-6 shadow-inner"><div className="h-full bg-gradient-to-r from-accent-600 to-fuchsia-600 transition-all duration-500" style={{ width: `${(batchProgress.current / 10) * 100}%` }} /></div>
                                <div className="flex gap-2"><button onClick={() => setBatchProgress(p => p ? { ...p, isPaused: !p.isPaused } : null)} className="flex-1 py-2 bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700">{batchProgress.isPaused ? 'Resume' : 'Pause'}</button><button onClick={() => cancelBatchRef.current = true} className="flex-1 py-2 bg-red-900/20 text-red-500 rounded-xl text-[10px] font-black uppercase border border-red-900/40">Abort</button></div>
                            </div>
                        )
                    }
                </div>

                {/* Right Panel (Merged duplicate console/logs) */}
                {
                    !rightSidebarOpen && (
                        <div onClick={() => setRightSidebarOpen(true)} className="absolute right-0 top-0 bottom-0 w-8 bg-gray-950 border-l border-gray-800 z-50 flex flex-col items-center py-6 cursor-pointer hover:bg-gray-900 transition-colors shadow-2xl">
                            <div className="text-accent-500 rotate-90 whitespace-nowrap text-[10px] font-black uppercase tracking-widest mt-12 mb-auto">Properties</div>
                            <Icons.ChevronLeft />
                        </div>
                    )
                }
                <div className={`bg-gray-900 border-l border-gray-800 flex flex-col transition-all duration-300 relative ${rightSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
                    <div className="flex border-b border-gray-800 bg-gray-950 h-11 shrink-0 items-center px-2 gap-1 overflow-x-auto no-scrollbar">
                        {[
                            ...(editorMode === 'map' ? [{ id: 'objects', i: <Icons.Cube />, t: 'TX Objects' }] : []),
                            { id: 'layers', i: <Icons.LayerGroup />, t: 'Layers' },
                            { id: 'gen', i: <Icons.Magic />, t: 'Generator' },
                            { id: 'terrain', i: <Icons.Mountain />, t: 'Terrain' },
                            { id: 'tools', i: <Icons.Wrench />, t: 'Tools' },
                            { id: 'props', i: <Icons.Sliders />, t: 'Entity' },
                            { id: 'palette', i: <Icons.Palette />, t: 'Color' },
                            { id: 'refine', i: <Icons.Sparkles />, t: 'AI Refine' },
                            { id: 'history', i: <Icons.History />, t: 'History' },
                            { id: 'console', i: <Icons.Terminal />, t: 'System Logs' }
                        ].map(t => (
                            <button key={t.id} onClick={() => setRightTab(t.id as any)} className={`w-8 h-8 shrink-0 flex justify-center items-center rounded transition-colors border ${rightTab === t.id ? 'bg-accent-600 text-white border-accent-500 shadow-lg' : 'text-gray-500 border-transparent hover:text-white hover:bg-gray-800'}`} title={t.t}>{t.i}</button>
                        ))}
                        <button onClick={() => setRightSidebarOpen(false)} className="px-3 text-gray-600 hover:text-white transition-colors"><Icons.ChevronRight /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 bg-gray-950/20">
                        {rightTab === 'objects' && editorMode === 'map' ? (
                            <TXObjectPalette
                                isMapMode={true}
                                onDragStart={handleDragStart}
                                onPlaceObject={(newCubes) => {
                                    // Calculate surface height for the first cube (main object position)
                                    if (newCubes.length > 0) {
                                        const firstCube = newCubes[0];
                                        // Find the minimum Y offset among all cubes to get the bottom of the object
                                        const minY = Math.min(...newCubes.map(c => c.position.y - c.size.y / 2));

                                        // Calculate surface height at the object's X, Z position
                                        // Use the largest footprint dimension for better collision detection
                                        const maxSizeX = Math.max(...newCubes.map(c => c.size.x));
                                        const maxSizeZ = Math.max(...newCubes.map(c => c.size.z));
                                        const surfaceHeight = getSurfaceHeight(
                                            firstCube.position.x,
                                            firstCube.position.z,
                                            { x: maxSizeX, y: 0, z: maxSizeZ }
                                        );

                                        // Calculate offset to place object bottom on surface
                                        // minY is the bottom of the lowest cube, surfaceHeight is where we want the bottom
                                        const yOffset = surfaceHeight - minY;

                                        // Adjust Y position for all cubes in the object
                                        const adjustedCubes = newCubes.map(cube => ({
                                            ...cube,
                                            position: {
                                                ...cube.position,
                                                y: cube.position.y + yOffset
                                            }
                                        }));

                                        const next = [...cubes, ...adjustedCubes];
                                        setCubes(next);
                                        pushHistory(next);
                                        setSelectedIds(adjustedCubes.map(c => c.id));
                                        addLog(`Добавлен объект: ${adjustedCubes[0]?.name || 'TX Object'}`, 'success');
                                    } else {
                                        const next = [...cubes, ...newCubes];
                                        setCubes(next);
                                        pushHistory(next);
                                        setSelectedIds(newCubes.map(c => c.id));
                                        addLog(`Добавлен объект: ${newCubes[0]?.name || 'TX Object'}`, 'success');
                                    }
                                }}
                            />
                        ) : rightTab === 'layers' ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Layer Visibility</div>
                                <div className="space-y-1">
                                    {(Object.keys(TX_CATEGORY_NAMES) as TXObjectCategory[]).map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setLayerVisibility(prev => ({ ...prev, [cat]: !prev[cat] }))}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${layerVisibility[cat] ? 'bg-gray-950 border-gray-800 text-gray-300' : 'bg-gray-900 border-gray-800 opacity-50 text-gray-600'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{TX_CATEGORY_NAMES[cat].icon}</span>
                                                <span className="text-[10px] uppercase font-bold">{TX_CATEGORY_NAMES[cat].en}</span>
                                            </div>
                                            {layerVisibility[cat] ? <Icons.Eye /> : <Icons.EyeSlash />}
                                        </button>
                                    ))}
                                </div>
                                <div className="p-4 bg-gray-950/50 rounded-xl border border-gray-800 text-[9px] text-gray-500 italic">
                                    Hiding a layer only affects the editor viewport. Export will still include all objects unless deleted.
                                </div>
                            </div>

                        ) : rightTab === 'gen' ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Procedural Generator</div>
                                <div className="space-y-4">
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Floors</label><input type="range" min="1" max="20" value={buildConfig.floors} onChange={e => setBuildConfig({ ...buildConfig, floors: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{buildConfig.floors}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Width</label><input type="range" min="4" max="20" value={buildConfig.width} onChange={e => setBuildConfig({ ...buildConfig, width: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{buildConfig.width}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Depth</label><input type="range" min="4" max="20" value={buildConfig.depth} onChange={e => setBuildConfig({ ...buildConfig, depth: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{buildConfig.depth}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Style</label><select value={buildConfig.style} onChange={e => setBuildConfig({ ...buildConfig, style: e.target.value as any })} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-xs text-white"><option value="modern">Modern</option><option value="industrial">Industrial</option><option value="brick">Brick</option></select></div>

                                    <div className="space-y-1.5 pt-2 border-t border-gray-800">
                                        <label className="text-[9px] text-gray-500 uppercase font-bold">Import Description</label>
                                        <button onClick={() => uploadGenRef.current?.click()} className="w-full py-2 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-lg text-[9px] font-bold uppercase flex justify-center items-center gap-2 transition-colors">
                                            <Icons.Import /> Load Text File
                                        </button>
                                        <input type="file" ref={uploadGenRef} className="hidden" accept=".txt,.md,.json" onChange={(e) => handleFileUpload(e, setPrompt)} />
                                    </div>

                                    <button onClick={handleProceduralBuild} className="w-full py-3 bg-accent-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent-500 transition-all shadow-lg mt-2">Generate Building</button>
                                </div>
                                <div className="border-t border-gray-800 pt-4 space-y-4">
                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">City Planner</div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Grid Size (Blocks)</label><input type="range" min="2" max="10" value={cityConfig.gridSize} onChange={e => setCityConfig({ ...cityConfig, gridSize: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{cityConfig.gridSize}x{cityConfig.gridSize}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Density</label><input type="range" min="0" max="1" step="0.1" value={cityConfig.density} onChange={e => setCityConfig({ ...cityConfig, density: parseFloat(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{Math.round(cityConfig.density * 100)}%</div></div>
                                    <button onClick={handleCityBuild} className="w-full py-3 bg-green-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg">Generate City</button>
                                </div>
                            </div>

                        ) : rightTab === 'terrain' ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Terrain Tools</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {['raise', 'lower', 'flatten', 'paint'].map(m => (
                                        <button key={m} onClick={() => { setTerrainConfig({ ...terrainConfig, mode: m as any }); setToolMode(ToolMode.TERRAIN); }} className={`p-3 rounded-xl border capitalize text-xs font-bold ${terrainConfig.mode === m ? 'bg-accent-600 border-accent-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-500'}`}>{m}</button>
                                    ))}
                                </div>
                                <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Brush Radius</label><input type="range" min="1" max="10" value={terrainConfig.radius} onChange={e => setTerrainConfig({ ...terrainConfig, radius: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{terrainConfig.radius}</div></div>
                                <div className="p-4 bg-gray-950/50 rounded-xl border border-gray-800 text-[9px] text-gray-500 italic">
                                    Select 'Terrain' tool (T) and click on the map to apply.
                                </div>
                            </div>

                        ) : rightTab === 'tools' ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Advanced Tools</div>

                                <div className="space-y-3 pb-4 border-b border-gray-800">
                                    <div className="text-[9px] font-black text-gray-500 uppercase flex items-center gap-2"><Icons.Wrench /> Road Constructor</div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Width</label><input type="range" min="1" max="8" value={roadConfig.width} onChange={e => setRoadConfig({ ...roadConfig, width: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{roadConfig.width}</div></div>
                                    <button onClick={() => setToolMode(ToolMode.ROAD)} className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${toolMode === ToolMode.ROAD ? 'bg-accent-600 border-accent-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}>Select Road Tool</button>
                                    <div className="text-[8px] text-gray-500 italic px-2">Click Start point, then Click End point.</div>
                                </div>

                                <div className="space-y-3">
                                    <div className="text-[9px] font-black text-gray-500 uppercase flex items-center gap-2"><Icons.Sparkles /> Object Scatter</div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Density</label><input type="range" min="0" max="1" step="0.05" value={scatterConfig.density} onChange={e => setScatterConfig({ ...scatterConfig, density: parseFloat(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{Math.round(scatterConfig.density * 100)}%</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Radius</label><input type="range" min="1" max="10" value={scatterConfig.radius} onChange={e => setScatterConfig({ ...scatterConfig, radius: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-lg accent-accent-500" /><div className="text-right text-xs font-mono">{scatterConfig.radius}</div></div>
                                    <button onClick={() => setToolMode(ToolMode.SCATTER)} className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${toolMode === ToolMode.SCATTER ? 'bg-accent-600 border-accent-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}>Select Scatter Brush</button>
                                </div>
                            </div>
                        ) : rightTab === 'props' && sel ? (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Spatial Configuration</div>
                                <div className="space-y-5">
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Designation</label><input className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:border-accent-500 outline-none shadow-inner" value={sel.name} onChange={e => handleUpdateSelected({ name: e.target.value })} /></div>

                                    {/* Object Type Selector */}
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] text-gray-500 uppercase font-bold">Object Type</label>
                                        <select
                                            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:border-accent-500 outline-none"
                                            value={sel.objectType || 'building'}
                                            onChange={e => handleUpdateSelected({ objectType: e.target.value })}
                                        >
                                            <option value="building">🏢 Building</option>
                                            <option value="road">🛣️ Road</option>
                                            <option value="water">🌊 Water</option>
                                            <option value="vegetation">🌲 Vegetation</option>
                                            <option value="prop">📦 Prop</option>
                                            <option value="spawn">🎯 Spawn Point</option>
                                            <option value="trigger">⚡ Trigger Zone</option>
                                            <option value="light">💡 Light Source</option>
                                            <option value="custom">🔧 Custom</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Position</label><div className="grid grid-cols-3 gap-1.5">{['x', 'y', 'z'].map(a => <DraggableNumberInput key={a} label={a.toUpperCase()} value={sel.position[a as keyof Vector3]} onChange={(v: any) => handleUpdateSelected({ position: { ...sel.position, [a]: v } })} />)}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Rotation</label><div className="grid grid-cols-3 gap-1.5">{['x', 'y', 'z'].map(a => <DraggableNumberInput key={a} label={a.toUpperCase()} value={sel.rotation[a as keyof Vector3]} onChange={(v: any) => handleUpdateSelected({ rotation: { ...sel.rotation, [a]: v } })} />)}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Scale</label><div className="grid grid-cols-3 gap-1.5">{['x', 'y', 'z'].map(a => <DraggableNumberInput key={a} label={a.toUpperCase()} value={sel.size[a as keyof Vector3]} onChange={(v: any) => handleUpdateSelected({ size: { ...sel.size, [a]: v } })} />)}</div></div>
                                    <div className="space-y-1.5"><label className="text-[9px] text-gray-500 uppercase font-bold">Pigment</label><div className="flex gap-3 items-center bg-gray-950 p-2 rounded-lg border border-gray-800"><input type="color" className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer" value={sel.color} onChange={e => { setPaintColor(e.target.value); handleUpdateSelected({ color: e.target.value }) }} /><span className="text-xs font-mono uppercase tracking-tighter">{sel.color}</span></div></div>

                                    {/* Collision & Visibility */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={sel.collidable !== false}
                                                onChange={e => handleUpdateSelected({ collidable: e.target.checked })}
                                                className="accent-green-500 w-3 h-3"
                                            />
                                            Collidable
                                        </label>
                                        <label className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={sel.visible !== false}
                                                onChange={e => handleUpdateSelected({ visible: e.target.checked })}
                                                className="accent-green-500 w-3 h-3"
                                            />
                                            Visible
                                        </label>
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-gray-800 space-y-4">
                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PBR Material Properties</div>
                                    {['roughness', 'metalness', 'emissive', 'opacity'].map(p => (
                                        <div key={p}><div className="flex justify-between text-[9px] text-gray-500 uppercase font-bold mb-1"><span>{p}</span><span>{sel.material?.[p as keyof MaterialProperties]}</span></div><input type="range" min="0" max="1" step="0.01" value={(sel.material?.[p as keyof MaterialProperties] as number) || 0} onChange={e => handleUpdateSelected({ material: { ...sel.material!, [p]: parseFloat(e.target.value) } })} className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-accent-500" /></div>
                                    ))}
                                </div>
                            </div>
                        ) : rightTab === 'palette' ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Active Scene Palette</div>
                                <div className="grid grid-cols-6 gap-2">
                                    {usedColors.map(c => <button key={c} onClick={() => { setPaintColor(c); setToolMode(ToolMode.PAINT) }} className="aspect-square rounded-lg shadow-xl border border-white/10 transition-transform hover:scale-110 active:scale-95 shadow-inner" style={{ backgroundColor: c }} title={c} />)}
                                </div>
                                <div className="pt-6 space-y-3">
                                    <label className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Brush Select</label>
                                    <div className="flex gap-3 items-center bg-gray-950 p-3 rounded-xl border border-gray-800">
                                        <input type="color" value={paintColor} onChange={e => setPaintColor(e.target.value)} className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer shadow-lg" />
                                        <span className="text-sm uppercase font-mono text-white tracking-[0.2em]">{paintColor}</span>
                                    </div>
                                </div>
                            </div>
                        ) : rightTab === 'refine' ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 flex justify-between items-center">
                                    <span className="flex items-center gap-2"><Icons.Sparkles /> AI Refinement Hub</span>
                                </div>
                                <div className="p-4 bg-gray-950 rounded-2xl border border-gray-800 shadow-inner flex flex-col gap-4 border-accent-500/10">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase leading-relaxed tracking-tight">Modify only the selected {selectedIds.length} objects using specific instructions.</p>
                                    <textarea
                                        placeholder="Enter transformation instruction..."
                                        value={refinePrompt} onChange={e => setRefinePrompt(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-[11px] text-white outline-none placeholder-gray-600 min-h-[80px] resize-none focus:border-accent-500 transition-colors"
                                    />
                                    <div className="flex justify-between items-center">
                                        <button onClick={() => uploadRefineRef.current?.click()} className="text-[9px] text-accent-400 hover:text-white flex items-center gap-1 font-bold uppercase transition-colors">
                                            <Icons.Import /> Import Text
                                        </button>
                                        <input type="file" ref={uploadRefineRef} className="hidden" accept=".txt,.md,.json" onChange={(e) => handleFileUpload(e, setRefinePrompt)} />
                                        <button
                                            className={`text-[9px] flex items-center gap-1 font-bold uppercase transition-colors text-gray-500 cursor-default`}
                                        >
                                            <Icons.Sliders /> AI Edit
                                        </button>
                                    </div>
                                    {/* Generation Settings for Refine - Collapsible */}
                                    {showGenSettings && (
                                        <>
                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800">
                                                <div className="space-y-1 col-span-2"><label className="text-[9px] font-bold text-gray-500 uppercase">Complexity</label><select value={genComplexity} onChange={e => setGenComplexity(e.target.value as any)} className="w-full bg-gray-900 border border-gray-700 rounded p-1.5 text-[9px] text-white outline-none"><option value="simple">Simple</option><option value="medium">Standard</option><option value="detailed">Ultra</option></select></div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Detail</label><DraggableNumberInput label="D" value={genDetailDensity} onChange={setGenDetailDensity} step={1} /></div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Organic</label><DraggableNumberInput label="O" value={genOrganicness} onChange={setGenOrganicness} step={0.1} /></div>
                                                <div className="space-y-1"><label className="text-[9px] font-bold text-accent-500 uppercase">Creativity</label><DraggableNumberInput label="C" value={genCreativity} onChange={setGenCreativity} step={0.1} /></div>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSelectAll}
                                            className="flex-1 py-3 bg-gray-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all shadow-lg flex justify-center items-center gap-2 border border-gray-700"
                                        >
                                            <Icons.Cube /> Выбрать все
                                        </button>
                                        <button
                                            onClick={handleRefineSelection}
                                            disabled={selectedIds.length === 0 || !refinePrompt || isGenerating}
                                            className="flex-1 py-3 bg-accent-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-accent-500 disabled:opacity-30 transition-all shadow-xl flex justify-center items-center gap-2 border border-accent-400/30"
                                        >
                                            {isGenerating ? <Icons.Spinner /> : <><Icons.Sparkles /> Обновить</>}
                                        </button>
                                    </div>
                                </div>
                                {selectedIds.length === 0 && <div className="text-center p-10 border border-dashed border-gray-800 rounded-2xl text-[10px] text-gray-600 uppercase font-black tracking-widest">Select target objects to edit via AI</div>}
                            </div>
                        ) : rightTab === 'history' ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Generation Archive</div>
                                {genHistory.map(h => (
                                    <div key={h.id} className="p-4 bg-gray-950 border border-gray-800 rounded-2xl hover:border-accent-500 transition-all cursor-pointer group shadow-lg" onClick={() => { setCubes(h.cubes); setPrompt(h.prompt); if (h.options.seed) setGenSeed(h.options.seed); }}>
                                        <div className="text-[8px] text-gray-600 mb-2 font-mono uppercase flex justify-between"><span>{new Date(h.timestamp).toLocaleString()}</span><span>SEED: {h.options.seed || '0'}</span></div>
                                        <div className="text-[11px] text-gray-300 line-clamp-2 italic mb-3 group-hover:text-white transition-colors tracking-tight">"{h.prompt}"</div>
                                        <div className="flex gap-2"><span className="text-[7px] bg-gray-900 px-2 py-0.5 rounded-full text-gray-500 uppercase font-black border border-gray-800">{h.cubes.length} units</span></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col animate-in fade-in duration-300">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 mb-4 flex justify-between items-center">Performance Logs <button onClick={() => setLogs([])} className="text-[8px] hover:text-red-500 uppercase font-black transition-colors">Clear</button></div>
                                <div className="flex-1 bg-gray-950 border border-gray-800 rounded-xl p-5 text-[10px] font-mono overflow-y-auto custom-scrollbar shadow-inner text-gray-500">
                                    {logs.map(l => <div key={l.id} className={`mb-3 flex gap-4 ${l.type === 'error' ? 'text-red-500' : l.type === 'success' ? 'text-accent-500' : 'text-gray-600'}`}><span className="text-gray-800 font-bold shrink-0">[{new Date(l.timestamp).toLocaleTimeString()}]</span><span className="break-words leading-relaxed">{l.message}</span></div>)}
                                    <div ref={consoleEndRef} />
                                </div>
                            </div>
                        )
                        }
                    </div>
                </div>
            </div >

            {/* Context Menu */}
            {
                viewportContextMenu && (
                    <div className="fixed z-[100] bg-gray-900/98 border border-gray-700 rounded-2xl shadow-2xl py-2 min-w-[200px] backdrop-blur-3xl animate-in fade-in zoom-in-95" style={{ left: viewportContextMenu.x, top: viewportContextMenu.y }} onMouseLeave={() => setViewportContextMenu(null)}>
                        <div className="px-4 py-1.5 mb-1 border-b border-gray-800 text-[8px] font-black text-gray-500 uppercase tracking-widest text-accent-500">Object Operations</div>
                        <button onClick={() => { handleSelect(viewportContextMenu.id!); setViewportContextMenu(null); }} className="w-full text-left px-4 py-3 text-[10px] text-gray-300 hover:bg-accent-600 hover:text-white flex items-center gap-3 uppercase font-bold transition-colors"><Icons.MousePointer /> Focus Selection</button>
                        <button onClick={() => { handleCopy(); handlePaste(); setViewportContextMenu(null); }} className="w-full text-left px-4 py-3 text-[10px] text-gray-300 hover:bg-accent-600 hover:text-white flex items-center gap-3 uppercase font-bold transition-colors"><Icons.Copy /> Duplicate Selection</button>
                        <button onClick={() => { handleDeleteCubes(); setViewportContextMenu(null); }} className="w-full text-left px-4 py-3 text-[10px] text-red-500 hover:bg-red-900/30 flex items-center gap-3 uppercase font-bold transition-colors"><Icons.Trash /> Delete Elements</button>
                        <div className="h-px bg-gray-800 my-2" />
                        <button onClick={() => { setRightTab('refine'); setViewportContextMenu(null); }} className="w-full text-left px-4 py-3 text-[10px] text-accent-500 hover:bg-accent-600/20 flex items-center gap-3 uppercase font-bold transition-colors"><Icons.Sparkles /> AI Refinement</button>
                        <button onClick={() => { handleRepair(); setViewportContextMenu(null); }} className="w-full text-left px-4 py-3 text-[10px] text-accent-500 hover:bg-accent-600/20 flex items-center gap-3 uppercase font-bold transition-colors"><Icons.Wrench /> Structural Repair</button>
                    </div>
                )
            }

            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                onSave={(newSettings) => {
                    setEditorSettings(newSettings);
                }}
                initialSettings={editorSettings}
            />

            {/* Help Modal */}
            {showHelpModal && (
                <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowHelpModal(false)}>
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-4 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">📖 Справка по управлению</h2>
                            <button onClick={() => setShowHelpModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="p-4 space-y-6">
                            {/* Camera Controls */}
                            <div>
                                <h3 className="text-sm font-bold text-accent-400 mb-2">🎥 Камера</h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">ЛКМ + drag</span> — Вращение</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">ПКМ + drag</span> — Панорама</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Колёсико</span> — Zoom</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">СКМ + drag</span> — Панорама</div>
                                </div>
                            </div>

                            {/* Selection */}
                            <div>
                                <h3 className="text-sm font-bold text-accent-400 mb-2">🎯 Выделение</h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Клик</span> — Выбрать объект</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Ctrl + клик</span> — Добавить к выделению</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Shift + drag</span> — Выделение областью</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Escape</span> — Снять выделение</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Ctrl + A</span> — Выбрать всё</div>
                                </div>
                            </div>

                            {/* Tools */}
                            <div>
                                <h3 className="text-sm font-bold text-accent-400 mb-2">🔧 Инструменты</h3>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">V / Q</span> — Select</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">G / W</span> — Move</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">R / E</span> — Rotate</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">S</span> — Scale</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">P</span> — Paint</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">B</span> — Build</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">T</span> — Terrain</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">L</span> — Road</div>
                                </div>
                            </div>

                            {/* Edit */}
                            <div>
                                <h3 className="text-sm font-bold text-accent-400 mb-2">✏️ Редактирование</h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Ctrl + C</span> — Копировать</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Ctrl + V</span> — Вставить</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Ctrl + X</span> — Вырезать</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Ctrl + D</span> — Дублировать</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Ctrl + Z</span> — Отменить</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Ctrl + Y</span> — Повторить</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Delete</span> — Удалить</div>
                                </div>
                            </div>

                            {/* View */}
                            <div>
                                <h3 className="text-sm font-bold text-accent-400 mb-2">👁️ Отображение</h3>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">H</span> — Скрыть выделенное</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">Alt + H</span> — Показать всё</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">X</span> — Toggle snap</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">1</span> — Toggle grid</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">2</span> — Toggle axes</div>
                                    <div className="bg-gray-800 rounded p-2"><span className="text-yellow-400 font-mono">3</span> — Toggle wireframe</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pause Menu (Game Mode) */}
            {showPauseMenu && (editorMode === 'tank' || isInTXIframe()) && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-auto">
                    {/* Transparent backdrop - only visible where there are menu elements */}
                    <div
                        className="absolute inset-0 bg-transparent"
                        onClick={() => setShowPauseMenu(false)}
                    />

                    {/* Menu Content - visible with solid background */}
                    <div
                        className="relative bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl p-8 min-w-[320px] max-w-[500px] animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                                <h2 className="text-xl font-black text-white uppercase tracking-wider">Game Menu</h2>
                                <button
                                    onClick={() => setShowPauseMenu(false)}
                                    className="text-gray-500 hover:text-white transition-colors"
                                >
                                    <Icons.Close />
                                </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        setShowPauseMenu(false);
                                        // Clear any lingering effects when resuming
                                        clearRespawnEffect();
                                        clearLowHealthEffect();
                                    }}
                                    className="px-6 py-3 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all shadow-lg"
                                >
                                    Resume
                                </button>

                                <button
                                    onClick={() => {
                                        // Force clear dark screen effect
                                        clearRespawnEffect();
                                        clearLowHealthEffect();
                                        addLog('Dark screen effect cleared', 'info');
                                    }}
                                    className="px-6 py-3 bg-yellow-900/50 hover:bg-yellow-900/70 text-yellow-400 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-yellow-900/50"
                                >
                                    Clear Dark Screen
                                </button>

                                <button
                                    onClick={() => {
                                        setShowSettingsModal(true);
                                        setShowPauseMenu(false);
                                    }}
                                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-gray-700"
                                >
                                    Settings
                                </button>

                                <button
                                    onClick={() => {
                                        setShowHelpModal(true);
                                        setShowPauseMenu(false);
                                    }}
                                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-gray-700"
                                >
                                    Help
                                </button>

                                {isInTXIframe() && (
                                    <button
                                        onClick={() => {
                                            window.parent.postMessage({ type: 'CLOSE_EDITOR' }, '*');
                                        }}
                                        className="px-6 py-3 bg-red-900/50 hover:bg-red-900/70 text-red-400 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border border-red-900/50"
                                    >
                                        Exit Game
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Session/Multiplayer Modal */}
            {showSessionModal && (
                <div
                    className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowSessionModal(false)}
                >
                    <div
                        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                🔗 Управление сессией
                            </h2>
                            <button
                                onClick={() => setShowSessionModal(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <Icons.Close />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-2 uppercase">
                                    ID Комнаты
                                </label>
                                <input
                                    type="text"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 outline-none"
                                    placeholder="Введите ID комнаты"
                                />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-gray-950 rounded-lg border border-gray-800">
                                <div>
                                    <div className="text-sm font-bold text-gray-300">Статус подключения</div>
                                    <div className={`text-xs mt-1 ${isConnected ? 'text-green-400' : 'text-gray-500'}`}>
                                        {isConnected ? '✓ Подключено' : '✗ Не подключено'}
                                    </div>
                                </div>
                                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-600'}`} />
                            </div>

                            <div className="flex gap-2">
                                {!isConnected ? (
                                    <button
                                        onClick={() => {
                                            handleConnect();
                                            setShowSessionModal(false);
                                        }}
                                        className="flex-1 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-bold uppercase transition-colors"
                                    >
                                        Подключиться
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            multiplayer.disconnect();
                                            setIsConnected(false);
                                            setShowSessionModal(false);
                                            addLog('Отключено от сессии', 'info');
                                        }}
                                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold uppercase transition-colors"
                                    >
                                        Отключиться
                                    </button>
                                )}
                            </div>

                            {isConnected && (
                                <div className="p-3 bg-gray-950 rounded-lg border border-gray-800">
                                    <div className="text-xs text-gray-400 mb-2">Информация о сессии:</div>
                                    <div className="text-xs text-gray-300 space-y-1">
                                        <div>Комната: <span className="text-accent-400 font-mono">{roomId}</span></div>
                                        <div>Удалённых курсоров: <span className="text-accent-400">{Object.keys(remoteCursors).length}</span></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notifications with Progress */}
            <div className="fixed bottom-4 right-4 z-[9999] space-y-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-in slide-in-from-right duration-300 min-w-[200px] max-w-[400px] pointer-events-auto ${toast.type === 'success' ? 'bg-green-600 text-white' :
                            toast.type === 'error' ? 'bg-red-600 text-white' :
                                toast.type === 'warning' ? 'bg-yellow-600 text-white' :
                                    'bg-gray-800 text-white border border-gray-700'
                            }`}
                        style={{ whiteSpace: 'pre-line' }}
                    >
                        <div className="flex items-center gap-2">
                            {toast.isLoading && (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            <span>{toast.message}</span>
                            {toast.progress !== undefined && (
                                <span className="ml-auto text-xs opacity-70">{toast.progress}%</span>
                            )}
                        </div>
                        {toast.progress !== undefined && (
                            <div className="w-full h-1 bg-white/20 rounded-full mt-2 overflow-hidden">
                                <div
                                    className="h-full bg-white/80 transition-all duration-200"
                                    style={{ width: `${toast.progress}%` }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div >
    );
};
