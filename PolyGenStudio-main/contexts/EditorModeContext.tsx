/**
 * EditorModeContext - Context for switching between Map Editor and Tank Workshop modes
 * 
 * URL params: ?mode=map | ?mode=tank
 */
import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';

export type EditorMode = 'map' | 'tank';

interface EditorModeContextType {
    mode: EditorMode;
    setMode: (mode: EditorMode) => void;
    isMapMode: boolean;
    isTankMode: boolean;
}

const EditorModeContext = createContext<EditorModeContextType | null>(null);

export const EditorModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Read initial mode from URL params
    const getInitialMode = (): EditorMode => {
        const params = new URLSearchParams(window.location.search);
        const modeParam = params.get('mode');
        if (modeParam === 'tank') return 'tank';
        return 'map'; // Default to map mode
    };

    const [mode, setMode] = useState<EditorMode>(getInitialMode);

    // Update URL when mode changes
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        window.history.replaceState({}, '', url.toString());
    }, [mode]);

    // Memoize context value to prevent unnecessary re-renders
    const value: EditorModeContextType = useMemo(() => ({
        mode,
        setMode,
        isMapMode: mode === 'map',
        isTankMode: mode === 'tank',
    }), [mode]);

    return (
        <EditorModeContext.Provider value={value}>
            {children}
        </EditorModeContext.Provider>
    );
};

export const useEditorMode = (): EditorModeContextType => {
    const context = useContext(EditorModeContext);
    if (!context) {
        throw new Error('useEditorMode must be used within EditorModeProvider');
    }
    return context;
};

export default EditorModeContext;
