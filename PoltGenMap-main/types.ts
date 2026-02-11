
export interface WorldConfig {
  seed: string;
  terrainRoughness: number;
  waterLevel: number;
  buildingDensity: number;
  treeDensity: number;
  useThinInstances: boolean;
  // New fields for Real World Data
  mode: 'PROCEDURAL' | 'REAL';
  coordinates: { lat: number; lng: number };
  enableTank: boolean;
  heightScale: number;
  scanRadius: number; // New config for map size
}

export interface MetricStats {
  drawCalls: number;
  activeMeshes: number;
  fps: number;
  physicsBodies: number;
  // New building stats
  totalBuildingsFound: number;
  totalBuildingsRendered: number;
  // Spatial Stats
  mapRadius: number; // meters
  elevationMin: number;
  elevationMax: number;
  totalRoads: number;
  totalVertices: number; // New stat
  dataSizeMB: number; // New stat for data weight
  currentStreet?: string; // New: Street name under tank
  currentLat?: number; // Real-time tank GPS Lat
  currentLng?: number; // Real-time tank GPS Lng
}

export enum GenerationState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface GeoLocationData {
  name: string;
  lat: number;
  lng: number;
  terrainType: 'mountain' | 'plain' | 'urban' | 'coast';
  estimatedBuildingCount?: number; // New: Real world stat from Gemini
}

export interface LocationMetadata {
    estimatedBuildingCount: number;
}