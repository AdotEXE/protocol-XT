import React, { useState } from 'react';
import { getArchitecturalInsights, parseLocationSeed } from '../services/geminiService';
import { WorldConfig, LocationMetadata } from '../types';
import { Send, MapPin, Bot, Loader2 } from 'lucide-react';

interface AIChatProps {
  currentConfig: WorldConfig;
  onUpdateSeed: (seed: string, type: 'mountain' | 'plain' | 'urban' | 'coast', coords?: {lat: number, lng: number}, meta?: LocationMetadata) => void;
}

const AIChat: React.FC<AIChatProps> = ({ currentConfig, onUpdateSeed }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    {role: 'ai', text: 'Ask me about the Low-Poly/Havok architecture or enter a city name (e.g., "Tartu") to generate real map data.'}
  ]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      // Heuristic to check if user wants to change location
      const isLocationRequest = userMsg.toLowerCase().includes('seed') || 
                                userMsg.toLowerCase().includes('location') ||
                                userMsg.toLowerCase().includes('go to') ||
                                userMsg.toLowerCase().includes('make') ||
                                userMsg.toLowerCase().includes('tartu'); 

      if (isLocationRequest) {
        const cleanName = userMsg.replace(/seed|location|go to|make|real city/gi, '').trim();
        const locData = await parseLocationSeed(cleanName);
        const meta = { estimatedBuildingCount: locData.estimatedBuildingCount || 0 };
        
        onUpdateSeed(cleanName, locData.terrainType, { lat: locData.lat, lng: locData.lng }, meta);
        
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: `Fetching Real-World Data for **${locData.name}**...\nCoordinates: ${locData.lat.toFixed(4)}, ${locData.lng.toFixed(4)}.\nEst. Buildings: ${meta.estimatedBuildingCount}\nSwitching to Real Mode (OSM Layer).` 
        }]);
      } else {
        // Technical Question
        const context = `Current Stats: Buildings=${currentConfig.buildingDensity}, Trees=${currentConfig.treeDensity}, Roughness=${currentConfig.terrainRoughness}. Tech Stack: Babylon.js, Havok, React.`;
        const insight = await getArchitecturalInsights(userMsg, context);
        setMessages(prev => [...prev, { role: 'ai', text: insight }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Error connecting to Gemini.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[300px] border-t border-slate-700 bg-slate-900">
      <div className="p-2 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
         <span className="text-xs text-gray-300 font-bold flex items-center gap-2">
            <Bot className="w-3 h-3 text-emerald-400" /> Engineer AI
         </span>
         <span className="text-[10px] text-gray-500">Gemini 3 Flash Preview</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded p-2 text-xs ${
              m.role === 'user' ? 'bg-indigo-700 text-white' : 'bg-slate-700 text-gray-200'
            }`}>
              {m.text.split('\n').map((line, k) => <p key={k} className="mb-1">{line}</p>)}
            </div>
          </div>
        ))}
        {loading && <div className="text-gray-500 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}
      </div>

      <form onSubmit={handleSubmit} className="p-2 border-t border-slate-700 flex gap-2">
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask docs or 'Tartu'..."
          className="flex-1 bg-slate-950 text-white text-xs border border-slate-600 rounded px-2 py-1 focus:border-indigo-500 outline-none"
        />
        <button type="button" className="text-slate-400 hover:text-white" onClick={() => {
            setInput(prev => "Seed " + prev);
        }}>
            <MapPin className="w-4 h-4" />
        </button>
        <button type="submit" disabled={loading} className="bg-indigo-600 text-white rounded p-1 hover:bg-indigo-500 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default AIChat;