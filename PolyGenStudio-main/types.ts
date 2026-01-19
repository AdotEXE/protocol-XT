
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface MaterialProperties {
  roughness: number;
  metalness: number;
  emissive: number;
  opacity: number;
  transparent: boolean;
}

export interface CubeElement {
  id: string;
  name: string;
  type: 'cube' | 'group';
  parentId?: string | null;
  position: Vector3;
  size: Vector3;
  rotation?: Vector3;
  color: string;
  material?: MaterialProperties;
  visible: boolean;
  isFavorite?: boolean;
  isLocked?: boolean;
  physics?: {
    mass: number;
    friction: number;
  };
  properties?: Record<string, any>;
}

export enum ToolMode {
  SELECT = 'SELECT',
  MOVE = 'MOVE',
  ROTATE = 'ROTATE',
  SCALE = 'SCALE',
  BUILD = 'BUILD',
  PAINT = 'PAINT',
  TERRAIN = 'TERRAIN',
  ROAD = 'ROAD',
  SCATTER = 'SCATTER'
}

export type FileType = 'file' | 'folder';

export interface FileNode {
  id: string;
  parentId: string | null;
  name: string;
  type: FileType;
  children: string[];
  isFavorite?: boolean;
  createdAt: number;
  content?: {
    cubes: CubeElement[];
    prompt: string;
    timestamp: number;
    thumbnail?: string;
  };
  isExpanded?: boolean;
}

export interface FileSystem {
  nodes: Record<string, FileNode>;
  rootId: string;
}

export interface GenerationHistoryEntry {
  id: string;
  prompt: string;
  timestamp: number;
  options: GenerationOptions;
  cubes: CubeElement[];
}

export type Theme = 'dark' | 'light' | 'cyberpunk' | 'fui' | 'industrial' | 'mix' | 'tx';

export interface GenerationOptions {
  prompt: string;
  useThinking: boolean;
  complexity: 'simple' | 'medium' | 'detailed';
  style: 'voxel' | 'minimalist' | 'detailed-voxel' | 'low-poly';
  palette: 'standard' | 'vibrant' | 'pastel' | 'dark' | 'metallic' | 'earthy' | 'neon';
  materialType: 'plastic' | 'metal' | 'stone' | 'wood' | 'glowing';
  theme: 'none' | 'sci-fi' | 'fantasy' | 'modern' | 'nature';
  creativity: number;
  referenceImage?: string;
  seed?: number;
  scale?: 'small' | 'medium' | 'large';

  // ADVANCED SETTINGS
  avoidZFighting: boolean;
  symmetry: 'none' | 'x' | 'y' | 'z';
  organicness: number;
  detailDensity: number;
  optimizationLevel: 'none' | 'basic' | 'aggressive';
  internalStructure: boolean;
  forceGround: boolean;
  voxelSize: number;
  hollow: boolean;
  lightingMode: 'flat' | 'soft' | 'dynamic';
}

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: number;
}

export interface PaletteItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  type: 'cube' | 'spawn' | 'window' | 'ramp' | 'group';
  properties?: Record<string, any>; // Material props, etc.
}
