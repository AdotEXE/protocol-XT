import React, { useState, useEffect } from 'react';
import { WorldConfig, MetricStats, GenerationState, LocationMetadata } from '../types';
import { RefreshCcw, Activity, Layers, Box, TreeDeciduous, Map, Gamepad2, Mountain, Search, History, Info, Building2, Ruler, MoveVertical, Route, Database, Navigation, Cpu, MapPin } from 'lucide-react';
import { parseLocationSeed } from '../services/geminiService';

interface ControlPanelProps {
  config: WorldConfig;
  setConfig: React.Dispatch<React.SetStateAction<WorldConfig>>;
  stats: MetricStats;
  status: GenerationState;
  onLocationSelect?: (seed: string, type: 'mountain' | 'plain' | 'urban' | 'coast', coords?: {lat: number, lng: number}, meta?: LocationMetadata) => void;
  cityMetadata?: LocationMetadata | null;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ config, setConfig, stats, status, onLocationSelect, cityMetadata }) => {
  const [inputLoc, setInputLoc] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try {
        const saved = localStorage.getItem('geo_history');
        // FIX: Start with empty history instead of fake defaults
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('geo_history', JSON.stringify(history));
  }, [history]);

  const performSearch = async (locName: string) => {
    if (!locName.trim() || !onLocationSelect) return;

    setIsSearching(true);
    try {
      const locData = await parseLocationSeed(locName);
      const meta = { estimatedBuildingCount: locData.estimatedBuildingCount || 0 };
      onLocationSelect(locName, locData.terrainType, { lat: locData.lat, lng: locData.lng }, meta);
      
      // Update history
      setHistory(prev => {
        const newHist = [locName, ...prev.filter(h => h !== locName)].slice(5);
        return newHist;
      });
      setInputLoc("");
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(inputLoc);
  };
  
  const handleMetric = (label: string, value: number | string, color: string = 'text-cyan-400') => (
    <div className="flex justify-between items-center text-xs mb-1 border-b border-slate-800/50 pb-1 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );

  return (
    <div className="w-full bg-slate-900 border-l border-slate-700 flex flex-col h-full">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <Map className="w-5 h-5 text-indigo-400" />
          GeoPoly Architect
        </h2>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-2 h-2 rounded-full ${status === GenerationState.GENERATING ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></span>
          <span className="text-xs text-gray-400 font-mono uppercase">{status}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        
        {/* --- LOCATION MANAGER --- */}
        <div>
           <label className="text-xs font-bold text-gray-300 uppercase mb-2 flex items-center gap-2">
              <Search className="w-3 h-3" /> Location Target
           </label>
           
           <form onSubmit={handleSearch} className="flex gap-2 mb-2">
              <input 
                value={inputLoc}
                onChange={(e) => setInputLoc(e.target.value)}
                placeholder="Enter City, Country..."
                className="flex-1 bg-slate-950 text-white text-xs border border-slate-700 rounded px-3 py-2 focus:border-indigo-500 outline-none placeholder:text-gray-600"
              />
              <button 
                type="submit" 
                disabled={isSearching}
                className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {isSearching ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
           </form>

            <div className="mb-4">
                 <label className="text-[10px] text-gray-400 flex justify-between mb-1">
                     <span>Search Radius</span>
                     <span className="text-indigo-400 font-mono">{config.scanRadius}m</span>
                 </label>
                 <input 
                    type="range" min="200" max="1000" step="50"
                    value={config.scanRadius}
                    onChange={(e) => setConfig({...config, scanRadius: parseInt(e.target.value)})}
                    className="w-full accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
            </div>

           {/* History Tags */}
           {history.length > 0 && (
             <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[10px] text-gray-500 flex items-center gap-1"><History className="w-3 h-3"/> Recent:</span>
                {history.map(item => (
                  <button 
                    key={item}
                    onClick={() => performSearch(item)}
                    className="text-[10px] bg-slate-800 text-gray-300 px-2 py-0.5 rounded-full hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
                  >
                    {item}
                  </button>
                ))}
             </div>
           )}

           {/* --- GPS HUD DISPLAY --- */}
           <div className="bg-slate-900 border border-indigo-500/50 p-3 mb-3 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.15)] relative overflow-hidden group">
               {/* Animated Scan Line */}
               <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse opacity-50" />
               
               <div className="flex items-center gap-3">
                   <div className="bg-indigo-900/50 p-2 rounded-full border border-indigo-500/30">
                       <MapPin className="text-indigo-400 w-6 h-6" />
                   </div>
                   <div className="flex-1 min-w-0">
                       <div className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold mb-0.5">Current Location</div>
                       
                       <div className="text-base font-black text-white font-mono leading-none tracking-tight truncate" title={stats.currentStreet}>
                           {stats.currentStreet || "UNKNOWN TERRITORY"}
                       </div>
                       
                       {(stats.currentLat !== 0 && stats.currentLng !== 0) ? (
                           <div className="text-[10px] text-emerald-400 font-mono mt-1 flex gap-2">
                               <span>LAT: {stats.currentLat?.toFixed(5)}</span>
                               <span>LON: {stats.currentLng?.toFixed(5)}</span>
                           </div>
                       ) : (
                           <div className="text-[10px] text-gray-500 font-mono mt-1">NO GPS SIGNAL</div>
                       )}
                   </div>
               </div>
           </div>

           {/* --- DETAILED INFO CARD --- */}
           <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 shadow-inner">
              <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                 <h3 className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                    <Info className="w-3 h-3" /> Area Analytics
                 </h3>
                 <span className="text-[10px] text-gray-500 font-mono truncate max-w-[100px]">{config.seed}</span>
              </div>
              
              <div className="grid grid-cols-1 gap-1">
                 
                 {/* Map Dimensions */}
                 <div className="flex justify-between items-center text-xs mb-2 text-gray-400">
                    <span className="flex items-center gap-1"><Ruler className="w-3 h-3" /> Scan Radius</span>
                    <span className="text-white font-mono">{stats.mapRadius}m</span>
                 </div>

                 {/* Elevation */}
                 <div className="flex justify-between items-center text-xs mb-2 text-gray-400">
                    <span className="flex items-center gap-1"><MoveVertical className="w-3 h-3" /> Elevation</span>
                    <span className="text-white font-mono">{stats.elevationMin.toFixed(0)}m — {stats.elevationMax.toFixed(0)}m</span>
                 </div>

                 {/* Roads */}
                 <div className="flex justify-between items-center text-xs mb-2 text-gray-400">
                    <span className="flex items-center gap-1"><Route className="w-3 h-3" /> Road Segments</span>
                    <span className="text-white font-mono">{stats.totalRoads}</span>
                 </div>

                 {/* Data Size */}
                 <div className="flex justify-between items-center text-xs mb-2 text-gray-400">
                    <span className="flex items-center gap-1"><Database className="w-3 h-3" /> Map Data Size</span>
                    <span className="text-white font-mono">{stats.dataSizeMB.toFixed(2)} MB</span>
                 </div>
                 
                 {/* Coverage Stats */}
                 <div className="flex justify-between items-center text-xs mb-2 border-t border-slate-700/50 pt-2">
                    <span className="text-gray-400 flex items-center gap-1"><Building2 className="w-3 h-3" /> Buildings (In View)</span>
                    <div className="text-right">
                       <span className="text-white font-mono">{stats.totalBuildingsRendered}</span>
                       <span className="text-gray-600 mx-1">/</span>
                       <span className="text-gray-500 font-mono">{stats.totalBuildingsFound}</span>
                    </div>
                 </div>

                 {/* Gemini Estimated Count (The requested feature) */}
                 {cityMetadata && cityMetadata.estimatedBuildingCount > 0 && (
                     <div className="flex justify-between items-center text-xs mb-2 text-orange-200 bg-orange-900/30 p-1 rounded border border-orange-800/50">
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Official Est. (City)</span>
                        <span className="font-mono font-bold">{cityMetadata.estimatedBuildingCount.toLocaleString()}</span>
                     </div>
                 )}

                 {/* Progress Bar for Coverage */}
                 <div className="w-full h-1 bg-slate-700 rounded-full mb-3 overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-1000" 
                      style={{width: `${stats.totalBuildingsFound > 0 ? (stats.totalBuildingsRendered / stats.totalBuildingsFound) * 100 : 0}%`}}
                    />
                 </div>

                 <div className="mt-2 pt-2 border-t border-slate-700/50">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2 uppercase font-bold">
                        <Cpu className="w-3 h-3" /> Engine Performance
                    </div>
                    {handleMetric('FPS', stats.fps.toFixed(0), 'text-green-400')}
                    {handleMetric('Draw Calls', stats.drawCalls)}
                    {handleMetric('Physics Bodies', stats.physicsBodies, 'text-orange-400')}
                    {handleMetric('Active Meshes', stats.activeMeshes)}
                    {handleMetric('Total Vertices', stats.totalVertices.toLocaleString())}
                 </div>
              </div>
           </div>
        </div>

        {/* --- WORLD CONTROLS --- */}
        <div>
          <h3 className="text-xs font-bold text-gray-300 uppercase flex items-center gap-2 mb-3">
            <Layers className="w-3 h-3" /> Config
          </h3>

          <div className="grid grid-cols-1 gap-2 mb-4">
              <button 
                  onClick={() => setConfig({...config, enableTank: !config.enableTank})}
                  className={`w-full py-2 px-4 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
                      config.enableTank 
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                      : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                  }`}
              >
                  <Gamepad2 className="w-4 h-4" />
                  {config.enableTank ? "EXIT TANK MODE" : "DRIVE TANK"}
              </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Terrain Roughness</label>
              <input 
                type="range" min="0.1" max="2.0" step="0.1" 
                value={config.terrainRoughness}
                onChange={(e) => setConfig({...config, terrainRoughness: parseFloat(e.target.value)})}
                className="w-full accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
         <div className="bg-blue-900/20 border border-blue-800 p-2 rounded text-[10px] text-blue-200 leading-tight">
          <strong className="block mb-1 text-blue-400">Controls:</strong>
          {config.enableTank ? "WASD to Drive. Mouse to Aim. LMB to Fire." : "LMB Rotate. RMB Pan. Scroll Zoom."}
        </div>
      </div>

    </div>
  );
};

export default ControlPanel;