import React, { useState } from 'react';
import { PaletteItem, MaterialProperties } from '../types';
import { generateId } from '../utils/helpers';
import * as Icons from './Icons';

interface ObjectCreatorProps {
    onSave: (item: PaletteItem) => void;
    onCancel: () => void;
}

const PRESET_MATERIALS: Record<string, Partial<MaterialProperties>> = {
    'Plastic': { roughness: 0.5, metalness: 0, opacity: 1, transparent: false, emissive: 0 },
    'Metal': { roughness: 0.2, metalness: 1, opacity: 1, transparent: false, emissive: 0 },
    'Glass': { roughness: 0, metalness: 0.1, opacity: 0.3, transparent: true, emissive: 0 },
    'Glowing': { roughness: 1, metalness: 0, opacity: 1, transparent: false, emissive: 1 }
};

export const ObjectCreator: React.FC<ObjectCreatorProps> = ({ onSave, onCancel }) => {
    const [mode, setMode] = useState<'design' | 'generate'>('design');
    const [name, setName] = useState('New Object');
    const [color, setColor] = useState('#3b82f6');
    const [materialType, setMaterialType] = useState('Plastic');
    const [isGenerating, setIsGenerating] = useState(false);
    const [prompt, setPrompt] = useState('');

    const handleSave = () => {
        const newItem: PaletteItem = {
            id: generateId(),
            name,
            type: 'cube',
            icon: <Icons.Cube />,
            color,
            properties: {
                material: PRESET_MATERIALS[materialType]
            }
        };
        onSave(newItem);
    };

    const handleGenerate = () => {
        if (!prompt) return;
        setIsGenerating(true);
        // Simulate AI generation delay
        setTimeout(() => {
            setIsGenerating(false);
            // Mock AI logic: pick random color/mat based on prompt length (hashing)
            const hash = prompt.length;
            const colors = ['#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            setColor(colors[hash % colors.length]);

            if (prompt.toLowerCase().includes('glass')) setMaterialType('Glass');
            else if (prompt.toLowerCase().includes('metal')) setMaterialType('Metal');
            else if (prompt.toLowerCase().includes('glow')) setMaterialType('Glowing');
            else setMaterialType('Plastic');

            setName(prompt.split(' ').slice(0, 2).join(' ')); // Use first 2 words
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-96 p-6 flex flex-col gap-5 border-accent-500/20">
                <div className="flex justify-between items-center">
                    <h2 className="text-sm font-black uppercase tracking-widest text-accent-400">Create Object</h2>
                    <button onClick={onCancel} className="text-gray-500 hover:text-white"><Icons.Close /></button>
                </div>

                {/* Tabs */}
                <div className="flex bg-gray-950 p-1 rounded-lg">
                    <button onClick={() => setMode('design')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors ${mode === 'design' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Design</button>
                    <button onClick={() => setMode('generate')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors ${mode === 'generate' ? 'bg-accent-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Generate (AI)</button>
                </div>

                {mode === 'design' ? (
                    <div className="flex flex-col gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-xs text-white outline-none focus:border-accent-500" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Color</label>
                            <div className="flex gap-2">
                                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-14 bg-transparent cursor-pointer rounded overflow-hidden" />
                                <input value={color} onChange={e => setColor(e.target.value)} className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-2 text-xs text-white uppercase font-mono" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Material</label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.keys(PRESET_MATERIALS).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMaterialType(m)}
                                        className={`p-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${materialType === m ? 'bg-gray-800 border-accent-500 text-accent-400' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-600'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Describe Object</label>
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="e.g. Glowing red lava block, or transparent glass window"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-white outline-none focus:border-accent-500 h-24 resize-none"
                            />
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !prompt}
                            className="w-full py-3 bg-accent-600 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isGenerating ? <Icons.Spinner /> : <Icons.Magic />}
                            {isGenerating ? 'Synthesizing...' : 'Generate Properties'}
                        </button>
                    </div>
                )}

                {/* Preview Box */}
                <div className="bg-gray-950 rounded-xl p-4 border border-gray-800 flex items-center justify-center">
                    <div
                        className="w-16 h-16 rounded shadow-lg transition-all duration-300"
                        style={{
                            backgroundColor: color,
                            opacity: PRESET_MATERIALS[materialType].opacity,
                            boxShadow: PRESET_MATERIALS[materialType].emissive ? `0 0 20px ${color}` : 'none',
                            border: materialType === 'Metal' ? '2px solid rgba(255,255,255,0.2)' : 'none'
                        }}
                    />
                </div>

                <button onClick={handleSave} className="w-full py-3 bg-gray-100 text-gray-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white hover:scale-[1.02] transition-all">Save to Palette</button>
            </div>
        </div>
    );
};
