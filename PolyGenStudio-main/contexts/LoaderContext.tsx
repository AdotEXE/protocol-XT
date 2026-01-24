import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface LoaderContextType {
    isLoading: boolean;
    progress: number;
    status: string;
    setLoading: (active: boolean, status?: string) => void;
    setProgress: React.Dispatch<React.SetStateAction<number>>;
}

const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

export const LoaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');

    const setLoading = (active: boolean, newStatus: string = '') => {
        setIsLoading(active);
        setStatus(newStatus || (active ? 'Loading...' : ''));
        if (!active) setProgress(0);
    };

    // Memoize context value to prevent unnecessary re-renders
    const value = useMemo(() => ({
        isLoading,
        progress,
        status,
        setLoading,
        setProgress
    }), [isLoading, progress, status]);

    return (
        <LoaderContext.Provider value={value}>
            {children}
        </LoaderContext.Provider>
    );
};

export const useLoader = () => {
    const context = useContext(LoaderContext);
    if (!context) throw new Error('useLoader must be used within a LoaderProvider');
    return context;
};
