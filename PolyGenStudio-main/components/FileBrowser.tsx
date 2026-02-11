
import React, { useState, useMemo } from 'react';
import { FileSystem, FileNode } from '../types';

interface FileBrowserProps {
  fileSystem: FileSystem;
  currentFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onRenameNode: (id: string, newName: string) => void;
  onDuplicateNode: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCreateFolder: (parentId: string) => void;
  onCreateFile: (parentId: string) => void;
  onToggleFolder: (id: string) => void;
  onMoveNode: (nodeId: string, targetFolderId: string) => void;
  onCloseSidebar: () => void;
}

const FileIcon = ({ type, isOpen, isFavorite }: { type: 'file' | 'folder', isOpen?: boolean, isFavorite?: boolean }) => {
  if (isFavorite) return <i className="fas fa-star text-yellow-400 mr-2" />;
  if (type === 'folder') return <i className={`fas fa-folder${isOpen ? '-open' : ''} text-yellow-500 mr-2`} />;
  return <i className="fas fa-cube text-accent-400 mr-2" />;
};

export const FileBrowser: React.FC<FileBrowserProps> = ({
  fileSystem, currentFileId, onSelectFile, onDeleteNode, onRenameNode,
  onDuplicateNode, onToggleFavorite, onCreateFolder, onCreateFile,
  onToggleFolder, onMoveNode, onCloseSidebar
}) => {
  const [search, setSearch] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string | null } | null>(null);

  const stats = useMemo(() => {
    let folders = 0, files = 0;
    // Fix: Explicitly type 'n' as FileNode to resolve "Property 'type' does not exist on type 'unknown'"
    Object.values(fileSystem.nodes).forEach((n: FileNode) => n.type === 'folder' ? folders++ : files++);
    return { folders, files: Math.max(0, files - 1) };
  }, [fileSystem]);

  const breadcrumbs = useMemo(() => {
    if (!currentFileId) return [];
    const path: FileNode[] = [];
    let curr = fileSystem.nodes[currentFileId];
    while (curr) { path.unshift(curr); if (!curr.parentId) break; curr = fileSystem.nodes[curr.parentId]; }
    return path;
  }, [currentFileId, fileSystem]);

  const renderNode = (id: string, depth = 0) => {
    const node = fileSystem.nodes[id];
    if (!node) return null;
    if (search && node.type === 'file' && !node.name.toLowerCase().includes(search.toLowerCase())) return null;

    const isSelected = currentFileId === id;
    const isTarget = dropTargetId === id;
    const objCount = node.content?.cubes?.length || 0;

    return (
      <div key={id} className={`flex flex-col ${draggedId === id ? 'opacity-30' : ''}`}>
        <div
          draggable={id !== fileSystem.rootId}
          onDragStart={(e) => { e.dataTransfer.setData('text', id); setDraggedId(id); }}
          onDragOver={(e) => { e.preventDefault(); if (node.type === 'folder' && draggedId !== id) setDropTargetId(id); }}
          onDragLeave={() => setDropTargetId(null)}
          onDrop={(e) => { e.preventDefault(); const dragged = e.dataTransfer.getData('text'); if (dragged) onMoveNode(dragged, id); setDraggedId(null); setDropTargetId(null); }}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id }); }}
          onClick={() => node.type === 'folder' ? onToggleFolder(id) : onSelectFile(id)}
          className={`flex items-center px-3 py-1.5 cursor-pointer transition-all border-l-2 group relative ${isSelected ? 'bg-accent-600/20 border-accent-500 text-white shadow-inner' : 'border-transparent text-gray-400 hover:bg-gray-800'} ${isTarget ? 'bg-accent-500/30' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          <div className="flex-1 flex items-center overflow-hidden">
            {node.type === 'folder' && <i className={`fas fa-chevron-right text-[7px] mr-2 transition-transform duration-200 ${node.isExpanded ? 'rotate-90' : ''}`} />}
            <FileIcon type={node.type} isOpen={node.isExpanded} isFavorite={node.isFavorite} />
            {isRenaming === id ? (
              <input autoFocus className="bg-gray-950 border border-accent-500 rounded px-1 text-xs text-white outline-none w-full" value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => { if (renameValue.trim()) onRenameNode(id, renameValue); setIsRenaming(null); }} onKeyDown={e => { if (e.key === 'Enter') { if (renameValue.trim()) onRenameNode(id, renameValue); setIsRenaming(null); } if (e.key === 'Escape') setIsRenaming(null); }} />
            ) : (
              <div className="flex justify-between w-full items-center min-w-0">
                <span className="truncate text-[10px] font-bold">{node.name}</span>
                {node.type === 'file' && objCount > 0 && <span className="text-[8px] text-gray-500 font-mono ml-2 shrink-0">{objCount} objs</span>}
              </div>
            )}
          </div>
        </div>
        {node.type === 'folder' && node.isExpanded && (
          <div className="flex flex-col">{node.children.map(cid => renderNode(cid, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800 shadow-2xl overflow-hidden relative">
      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2"><i className="fas fa-search text-[9px]" /> Explorer</span>
        <div className="flex gap-1">
          <button onClick={() => onCreateFile(fileSystem.rootId)} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors" title="New File"><i className="fas fa-file-plus text-[10px]" /></button>
          <button onClick={() => onCreateFolder(fileSystem.rootId)} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors" title="New Group"><i className="fas fa-folder-plus text-[10px]" /></button>
          <button onClick={onCloseSidebar} className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"><i className="fas fa-chevron-left text-[10px]" /></button>
        </div>
      </div>
      <div className="px-3 py-1 bg-gray-950/30 border-b border-gray-800 flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap shrink-0">
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={b.id}>
            <span onClick={() => onSelectFile(b.id)} className="text-[9px] text-gray-600 hover:text-accent-400 cursor-pointer font-bold transition-colors uppercase">{b.name}</span>
            {i < breadcrumbs.length - 1 && <i className="fas fa-chevron-right text-[6px] text-gray-800 mx-0.5" />}
          </React.Fragment>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar select-none py-1">{renderNode(fileSystem.rootId)}</div>
      <div className="p-2 border-t border-gray-800 bg-gray-950/40 text-[9px] text-gray-700 flex justify-between font-bold uppercase tracking-widest">
        <span>Folders: {stats.folders}</span><span>Files: {stats.files}</span>
      </div>
      {contextMenu && (
        <div className="fixed z-[100] bg-gray-850 border border-gray-700 rounded shadow-2xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 backdrop-blur-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseLeave={() => setContextMenu(null)}>
          <button onClick={() => { setIsRenaming(contextMenu.id!); setRenameValue(fileSystem.nodes[contextMenu.id!].name); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-accent-600 flex items-center gap-2 uppercase font-bold"><i className="fas fa-pen text-[9px] w-4" /> Rename</button>
          <button onClick={() => { onToggleFavorite(contextMenu.id!); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-accent-600 flex items-center gap-2 uppercase font-bold"><i className="fas fa-star text-[9px] w-4" /> Favorite</button>
          <div className="h-px bg-gray-800 my-1" />
          <button onClick={() => { onDeleteNode(contextMenu.id!); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40 flex items-center gap-2 uppercase font-bold"><i className="fas fa-trash text-[9px] w-4" /> Delete</button>
        </div>
      )}
    </div>
  );
};
