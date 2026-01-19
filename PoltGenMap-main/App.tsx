import React, { useState, useCallback } from 'react';
import SceneViewer from './components/SceneViewer';
import ControlPanel from './components/ControlPanel';
import AIChat from './components/AIChat';
import { DEFAULT_CONFIG } from './constants';
import { WorldConfig, MetricStats, GenerationState, LocationMetadata } from './types';

const App: React.FC = () => {
  const [config, setConfig] = useState<WorldConfig>(DEFAULT_CONFIG);
  const [stats, setStats] = useState<MetricStats>({
    drawCalls: 0,
    activeMeshes: 0,
    fps: 0,
    physicsBodies: 0,
    totalBuildingsFound: 0,
    totalBuildingsRendered: 0,
    mapRadius: 0,
    elevationMin: 0,
    elevationMax: 0,
    totalRoads: 0,
    totalVertices: 0,
    dataSizeMB: 0
  });
  const [genState, setGenState] = useState<GenerationState>(GenerationState.IDLE);
  
  // Initialize with Tartu defaults (Approx 30k buildings in real Tartu)
  const [cityMetadata, setCityMetadata] = useState<LocationMetadata | null>({
      estimatedBuildingCount: 32000 
  });

  const handleSeedUpdate = useCallback((seed: string, type: 'mountain' | 'plain' | 'urban' | 'coast', coords?: {lat: number, lng: number}, meta?: LocationMetadata) => {
    
    if (meta) {
        setCityMetadata(meta);
    }

    setConfig(prev => {
      let roughness = 1.0;
      let buildDensity = 5;
      let treeDensity = 5;
      let water = 0;
      
      // Strict 1:1 Scale for Realism
      const heightScale = 1.0; 

      // Adjust presets based on Gemini analysis
      switch(type) {
        case 'mountain': 
          roughness = 1.8; buildDensity = 1; treeDensity = 10; water = -2;
          break;
        case 'urban':
          roughness = 0.3; buildDensity = 9; treeDensity = 2; water = -5;
          break;
        case 'coast':
          roughness = 0.8; buildDensity = 4; treeDensity = 6; water = 2.5;
          break;
        case 'plain':
        default:
          roughness = 0.5; buildDensity = 3; treeDensity = 4; water = -1;
          break;
      }

      // If coordinates are provided, switch to REAL mode, otherwise PROCEDURAL
      const mode = coords ? 'REAL' : 'PROCEDURAL';

      return {
        ...prev,
        seed,
        terrainRoughness: roughness,
        buildingDensity: buildDensity,
        treeDensity: treeDensity,
        waterLevel: water,
        heightScale: heightScale,
        mode,
        coordinates: coords || prev.coordinates
      };
    });
  }, []);

  return (
    <div className="flex w-screen h-screen bg-black overflow-hidden">
      {/* 3D Viewport Area */}
      <div className="flex-1 h-full relative">
        <SceneViewer 
          config={config} 
          onStatsUpdate={setStats} 
          onStateChange={setGenState}
        />
        
        {/* Overlay Title */}
        <div className="absolute top-0 right-0 p-6 pointer-events-none text-right">
           <h1 className="text-4xl font-black text-white/10 tracking-tighter">HAVOK ENGINE</h1>
           <p className="text-white/20 font-mono text-sm">
             {config.mode === 'REAL' ? `REAL DATA (1:1 SCALE): ${config.seed.toUpperCase()}` : 'LOW-POLY GEOSPATIAL SIMULATION'}
           </p>
        </div>
      </div>

      {/* Sidebar Controls */}
      <div className="w-80 h-full flex flex-col border-l border-slate-800 bg-slate-900 z-10 shadow-xl">
        <div className="flex-1 overflow-hidden">
           <ControlPanel 
             config={config} 
             setConfig={setConfig} 
             stats={stats} 
             status={genState}
             onLocationSelect={handleSeedUpdate}
             cityMetadata={cityMetadata}
           />
        </div>
        <AIChat currentConfig={config} onUpdateSeed={handleSeedUpdate} />
      </div>
    </div>
  );
};

export default App;