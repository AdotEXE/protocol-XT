import { WorldConfig } from "./types";

export const DEFAULT_CONFIG: WorldConfig = {
  seed: "Tartu, Estonia",
  terrainRoughness: 0.5,
  waterLevel: -1,
  buildingDensity: 5,
  treeDensity: 5,
  useThinInstances: true,
  mode: 'REAL',
  coordinates: { lat: 58.3780, lng: 26.7290 }, // Tartu, Estonia
  enableTank: false,
  heightScale: 1.0, // STRICTLY REAL SCALE (1:1)
  scanRadius: 500 // Default 500m radius
};