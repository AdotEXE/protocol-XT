import React, { useEffect, useRef } from 'react';
import * as Icons from './Icons';

interface ContextMenuProps {
    x: number;
    y: number;
    visible: boolean;
    onClose: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
    onDelete?: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    onClone?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    hasSelection?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    x, y, visible, onClose,
    onUndo, onRedo, onCopy, onPaste, onDelete, onGroup, onUngroup, onClone,
    canUndo = true, canRedo = true, hasSelection = true
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (visible) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [visible, onClose]);

    if (!visible) return null;

    // Adjust position to keep within viewport
    const style: React.CSSProperties = {
        top: Math.min(y, window.innerHeight - 300),
        left: Math.min(x, window.innerWidth - 200),
    };

    return (
        <div ref={ref} className="fixed z-[100] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 text-xs w-48 animate-in fade-in zoom-in-95 duration-100" style={style} onContextMenu={(e) => e.preventDefault()}>
            <div className="px-3 py-1.5 text-gray-500 font-bold uppercase text-[9px] border-b border-gray-800 mb-1 tracking-widest">
                Actions
            </div>

            {onUndo && (
                <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group disabled:opacity-50"
                    onClick={() => { onUndo(); onClose(); }}
                    disabled={!canUndo}
                >
                    <span className="flex items-center gap-2"><Icons.Undo /> Undo</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">Ctrl+Z</span>
                </button>
            )}

            {onRedo && (
                <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group disabled:opacity-50"
                    onClick={() => { onRedo(); onClose(); }}
                    disabled={!canRedo}
                >
                    <span className="flex items-center gap-2"><Icons.Redo /> Redo</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">Ctrl+Y</span>
                </button>
            )}

            <div className="border-t border-gray-800 my-1 mx-2"></div>

            {onCopy && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group" onClick={() => { onCopy(); onClose(); }}>
                    <span className="flex items-center gap-2"><Icons.Copy /> Copy</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">Ctrl+C</span>
                </button>
            )}

            {onPaste && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group" onClick={() => { onPaste(); onClose(); }}>
                    <span className="flex items-center gap-2"><Icons.Clipboard /> Paste</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">Ctrl+V</span>
                </button>
            )}

            {onClone && (
                <button
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group disabled:opacity-50"
                    onClick={() => { onClone(); onClose(); }}
                    disabled={!hasSelection}
                >
                    <span className="flex items-center gap-2"><Icons.Copy /> Clone</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">Ctrl+D</span>
                </button>
            )}

            <div className="border-t border-gray-800 my-1 mx-2"></div>

            {/* Simulated Group/Ungroup for now as I need to verify handles */}
            {onGroup && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group" onClick={() => { onGroup(); onClose(); }}>
                    <span className="flex items-center gap-2"><Icons.ObjectGroup /> Group</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">Ctrl+G</span>
                </button>
            )}

            {onUngroup && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-gray-800 text-gray-300 flex justify-between items-center group" onClick={() => { onUngroup(); onClose(); }}>
                    <span className="flex items-center gap-2"><Icons.ObjectUngroup /> Ungroup</span>
                    <span className="text-gray-600 text-[9px] font-mono group-hover:text-gray-500">⇧+G</span>
                </button>
            )}

            {(onGroup || onUngroup) && <div className="border-t border-gray-800 my-1 mx-2"></div>}

            {onDelete && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-red-900/20 text-red-400 hover:text-red-300 flex justify-between items-center group transition-colors" onClick={() => { onDelete(); onClose(); }}>
                    <span className="flex items-center gap-2"><Icons.Trash /> Delete</span>
                    <span className="text-red-900/50 text-[9px] font-mono group-hover:text-red-400/50">Del</span>
                </button>
            )}
        </div>
    );
};
