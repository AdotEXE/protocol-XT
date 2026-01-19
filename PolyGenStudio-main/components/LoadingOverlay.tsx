import React, { useEffect, useState } from 'react';
import { useLoader } from '../contexts/LoaderContext';
// Replaced lucide-react with inline SVGs

const Hex_Icon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    </svg>
);

const Cpu_Icon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
        <rect x="9" y="9" width="6" height="6"></rect>
        <line x1="9" y1="1" x2="9" y2="4"></line>
        <line x1="15" y1="1" x2="15" y2="4"></line>
        <line x1="9" y1="20" x2="9" y2="23"></line>
        <line x1="15" y1="20" x2="15" y2="23"></line>
        <line x1="20" y1="9" x2="23" y2="9"></line>
        <line x1="20" y1="14" x2="23" y2="14"></line>
        <line x1="1" y1="9" x2="4" y2="9"></line>
        <line x1="1" y1="14" x2="4" y2="14"></line>
    </svg>
);

const Activity_Icon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
);

export const LoadingOverlay = () => {
    const { isLoading, progress, status } = useLoader();
    const [visible, setVisible] = useState(false);
    const [displayProgress, setDisplayProgress] = useState(0);

    useEffect(() => {
        if (isLoading) {
            setVisible(true);
        } else {
            const t = setTimeout(() => setVisible(false), 500); // Fade out delay
            return () => clearTimeout(t);
        }
    }, [isLoading]);

    // Smooth progress interpolation
    useEffect(() => {
        if (Math.abs(displayProgress - progress) > 0.5) {
            const diff = progress - displayProgress;
            const step = diff * 0.1;
            const t = requestAnimationFrame(() => setDisplayProgress(prev => prev + step));
            return () => cancelAnimationFrame(t);
        } else {
            setDisplayProgress(progress);
        }
    }, [progress, displayProgress]);

    if (!visible) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050508] transition-opacity duration-500 ${isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

            {/* Background Grid Effect */}
            <div className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(rgba(0, 255, 128, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 128, 0.05) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    maskImage: 'radial-gradient(circle at center, black 40%, transparent 90%)'
                }}
            />

            {/* Main Content */}
            <div className="relative z-10 font-mono flex flex-col items-center w-[400px]">

                {/* Icon / Logo Animation */}
                <div className="mb-8 relative">
                    <div className="absolute inset-0 animate-ping opacity-20 bg-green-500 rounded-full blur-xl"></div>
                    <div className="relative bg-[#0a0a0c] border border-green-500/30 p-4 rounded-2xl shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                        <Hex_Icon className="w-12 h-12 text-green-400 animate-spin-slow" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Cpu_Icon className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-white mb-2 tracking-widest uppercase">
                    PolyGen <span className="text-green-500">Studio</span>
                </h1>
                <div className="text-xs text-gray-500 mb-8 uppercase tracking-[0.2em]">System Initialization</div>

                {/* Progress Bar Container */}
                <div className="w-full relative h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-800 shadow-inner">
                    {/* Filling Bar */}
                    <div
                        className="h-full bg-gradient-to-r from-green-600 via-green-400 to-green-300 transition-all duration-100 ease-out shadow-[0_0_10px_rgba(74,222,128,0.5)]"
                        style={{ width: `${displayProgress}%` }}
                    />

                    {/* Scanline Effect on Bar */}
                    <div className="absolute inset-0 opacity-30 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,black_5px,black_10px)]"></div>
                </div>

                {/* Stats */}
                <div className="w-full flex justify-between items-center mt-3 text-xs">
                    <div className="flex items-center text-green-400/80">
                        <Activity_Icon className="w-3 h-3 mr-2 animate-pulse" />
                        <span>{status || 'PROCESSING...'}</span>
                    </div>
                    <span className="text-white font-bold">{Math.round(displayProgress)}%</span>
                </div>

                {/* Decorative Tech Lines */}
                <div className="absolute -left-12 top-1/2 w-1 h-32 bg-gray-800 rounded-full opacity-20"></div>
                <div className="absolute -right-12 top-1/2 w-1 h-32 bg-gray-800 rounded-full opacity-20"></div>

            </div>
        </div>
    );
};
