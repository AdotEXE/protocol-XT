// Settings Modal Component - Shows on first launch
import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (settings: EditorSettings) => void;
    initialSettings: EditorSettings;
}

export interface EditorSettings {
    gridSize: number;
    snapEnabled: boolean;
    showAxes: boolean;
    showGrid: boolean;
    autoSave: boolean;
    autoSaveInterval: number; // seconds
    theme: 'dark' | 'light';
    defaultCameraDistance: number;
    geminiApiKey: string;
}

export const DEFAULT_SETTINGS: EditorSettings = {
    gridSize: 50,
    snapEnabled: true,
    showAxes: true,
    showGrid: true,
    autoSave: true,
    autoSaveInterval: 60,
    theme: 'dark',
    defaultCameraDistance: 20,
    geminiApiKey: ''
};

const SETTINGS_STORAGE_KEY = 'polygen_editor_settings';
const FIRST_LAUNCH_KEY = 'polygen_first_launch_done';

export const loadSettings = (): EditorSettings => {
    try {
        const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn('[Settings] Failed to load settings:', e);
    }
    return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: EditorSettings): void => {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('[Settings] Failed to save settings:', e);
    }
};

export const isFirstLaunch = (): boolean => {
    return !localStorage.getItem(FIRST_LAUNCH_KEY);
};

export const markFirstLaunchDone = (): void => {
    localStorage.setItem(FIRST_LAUNCH_KEY, 'true');
};

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, initialSettings }) => {
    const [settings, setSettings] = useState<EditorSettings>(initialSettings);

    useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings]);

    if (!isOpen) return null;

    const handleSave = () => {
        saveSettings(settings);
        onSave(settings);
        markFirstLaunchDone();
        onClose();
    };

    const handleChange = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-800 bg-gradient-to-r from-accent-600/20 to-transparent">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        ⚙️ Настройки редактора
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">Настройте редактор под себя</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Grid Section */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Сетка и привязка</h3>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-400">Размер сетки</label>
                            <input
                                type="number"
                                min={10}
                                max={200}
                                step={10}
                                value={settings.gridSize}
                                onChange={(e) => handleChange('gridSize', Number(e.target.value))}
                                className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-400">Привязка к сетке</label>
                            <input
                                type="checkbox"
                                checked={settings.snapEnabled}
                                onChange={(e) => handleChange('snapEnabled', e.target.checked)}
                                className="w-5 h-5 accent-accent-500"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-400">Показывать оси</label>
                            <input
                                type="checkbox"
                                checked={settings.showAxes}
                                onChange={(e) => handleChange('showAxes', e.target.checked)}
                                className="w-5 h-5 accent-accent-500"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-400">Показывать сетку</label>
                            <input
                                type="checkbox"
                                checked={settings.showGrid}
                                onChange={(e) => handleChange('showGrid', e.target.checked)}
                                className="w-5 h-5 accent-accent-500"
                            />
                        </div>
                    </div>

                    {/* Auto-save Section */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Сохранение</h3>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-400">Автосохранение</label>
                            <input
                                type="checkbox"
                                checked={settings.autoSave}
                                onChange={(e) => handleChange('autoSave', e.target.checked)}
                                className="w-5 h-5 accent-accent-500"
                            />
                        </div>

                        {settings.autoSave && (
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-gray-400">Интервал (секунды)</label>
                                <input
                                    type="number"
                                    min={10}
                                    max={300}
                                    step={10}
                                    value={settings.autoSaveInterval}
                                    onChange={(e) => handleChange('autoSaveInterval', Number(e.target.value))}
                                    className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
                                />
                            </div>
                        )}
                    </div>

                    {/* API Section */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">API интеграции</h3>

                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Gemini API Key (для AI генерации)</label>
                            <input
                                type="password"
                                value={settings.geminiApiKey}
                                onChange={(e) => handleChange('geminiApiKey', e.target.value)}
                                placeholder="AIza..."
                                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600"
                            />
                            <p className="text-[10px] text-gray-500">Используется для поиска координат городов в Real World Generator</p>
                        </div>
                    </div>

                    {/* Camera Section */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Камера</h3>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-400">Начальная дистанция</label>
                            <input
                                type="number"
                                min={5}
                                max={100}
                                step={5}
                                value={settings.defaultCameraDistance}
                                onChange={(e) => handleChange('defaultCameraDistance', Number(e.target.value))}
                                className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-800 flex justify-between items-center bg-gray-950/50">
                    <button
                        onClick={() => {
                            setSettings(DEFAULT_SETTINGS);
                        }}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Сбросить
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 text-sm font-bold text-white bg-accent-600 hover:bg-accent-500 rounded transition-colors"
                        >
                            Сохранить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
