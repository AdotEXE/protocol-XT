/**
 * TX Object Palette Component
 * UI for selecting and placing TX map objects
 */

import React, { useState } from 'react';
import {
    TX_OBJECTS_BY_CATEGORY,
    TX_CATEGORY_NAMES,
    TXObjectCategory,
    TXObjectDefinition,
    txObjectToCubes
} from '../services/txObjects';
import { CubeElement } from '../types';

interface TXObjectPaletteProps {
    onPlaceObject: (cubes: CubeElement[]) => void;
    isMapMode: boolean;
    onDragStart?: (itemType: string) => void;
}

export const TXObjectPalette: React.FC<TXObjectPaletteProps> = ({ onPlaceObject, isMapMode, onDragStart }) => {
    const [selectedCategory, setSelectedCategory] = useState<TXObjectCategory>('buildings');
    const [hoveredObject, setHoveredObject] = useState<TXObjectDefinition | null>(null);

    if (!isMapMode) {
        return null;
    }

    const handleObjectClick = (def: TXObjectDefinition) => {
        // Place object at origin, user will move it
        const cubes = txObjectToCubes(def, { x: 0, y: 0, z: 0 });
        onPlaceObject(cubes);
    };

    const categories = Object.keys(TX_OBJECTS_BY_CATEGORY) as TXObjectCategory[];

    return (
        <div className="tx-object-palette">
            {/* Category Tabs */}
            <div className="palette-header">
                <span className="palette-title">🗺 TX ОБЪЕКТЫ</span>
            </div>

            <div className="category-tabs">
                {categories.map(cat => (
                    <button
                        key={cat}
                        className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat)}
                        title={TX_CATEGORY_NAMES[cat].ru}
                    >
                        {TX_CATEGORY_NAMES[cat].icon}
                    </button>
                ))}
            </div>

            {/* Category Label */}
            <div className="category-label">
                {TX_CATEGORY_NAMES[selectedCategory].ru}
            </div>

            {/* Objects Grid */}
            <div className="objects-grid">
                {TX_OBJECTS_BY_CATEGORY[selectedCategory].map(obj => (
                    <div
                        key={obj.id}
                        className="object-item"
                        draggable={true}
                        onDragStart={(e) => {
                            if (onDragStart) onDragStart(obj.id);
                            e.dataTransfer.effectAllowed = 'copy';
                            // Use empty image to prevent default drag ghost (we render our own in 3D)
                            const img = new Image();
                            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                            e.dataTransfer.setDragImage(img, 0, 0);
                        }}
                        onClick={() => handleObjectClick(obj)}
                        onDoubleClick={() => handleObjectClick(obj)}
                        onMouseEnter={() => setHoveredObject(obj)}
                        onMouseLeave={() => setHoveredObject(null)}
                        title={`${obj.description} - Двойной клик для быстрого спавна`}
                    >
                        <span className="object-icon">{obj.icon}</span>
                        <span className="object-name">{obj.nameRu}</span>
                    </div>
                ))}
            </div>

            {/* Hover Preview */}
            {hoveredObject && (
                <div className="object-preview">
                    <div className="preview-header">
                        <span className="preview-icon">{hoveredObject.icon}</span>
                        <span className="preview-name">{hoveredObject.nameRu}</span>
                    </div>
                    <div className="preview-desc">{hoveredObject.description}</div>
                    <div className="preview-stats">
                        <div>📏 {hoveredObject.size.x}x{hoveredObject.size.y}x{hoveredObject.size.z}</div>
                        <div>
                            {hoveredObject.hasCollision ? '🛡️ Коллизия' : '👻 Без коллизии'}
                        </div>
                        <div>
                            {hoveredObject.isDestructible ? '💥 Разрушаемый' : '🏛️ Прочный'}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .tx-object-palette {
                    background: rgba(0, 30, 0, 0.95);
                    border: 1px solid #0a0;
                    border-radius: 8px;
                    padding: 8px;
                    margin-bottom: 8px;
                    font-family: 'Consolas', monospace;
                }
                
                .palette-header {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 8px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #0a0;
                }
                
                .palette-title {
                    color: #0f0;
                    font-size: 12px;
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                
                .category-tabs {
                    display: flex;
                    gap: 4px;
                    margin-bottom: 8px;
                    justify-content: center;
                }
                
                .category-tab {
                    width: 36px;
                    height: 36px;
                    background: rgba(0, 50, 0, 0.8);
                    border: 1px solid #080;
                    border-radius: 6px;
                    font-size: 18px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .category-tab:hover {
                    background: rgba(0, 80, 0, 0.8);
                    border-color: #0f0;
                }
                
                .category-tab.active {
                    background: rgba(0, 100, 0, 0.9);
                    border-color: #0f0;
                    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
                }
                
                .category-label {
                    color: #0a0;
                    font-size: 10px;
                    text-transform: uppercase;
                    text-align: center;
                    margin-bottom: 8px;
                    letter-spacing: 1px;
                }
                
                .objects-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 4px;
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .object-item {
                    background: rgba(0, 40, 0, 0.8);
                    border: 1px solid #080;
                    border-radius: 4px;
                    padding: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }
                
                .object-item:hover {
                    background: rgba(0, 80, 0, 0.9);
                    border-color: #0f0;
                    transform: scale(1.02);
                }
                
                .object-icon {
                    font-size: 24px;
                }
                
                .object-name {
                    color: #0f0;
                    font-size: 9px;
                    text-align: center;
                    text-transform: uppercase;
                }
                
                .object-preview {
                    margin-top: 8px;
                    padding: 8px;
                    background: rgba(0, 50, 0, 0.9);
                    border: 1px solid #0f0;
                    border-radius: 6px;
                }
                
                .preview-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 4px;
                }
                
                .preview-icon {
                    font-size: 20px;
                }
                
                .preview-name {
                    color: #0f0;
                    font-size: 12px;
                    font-weight: bold;
                }
                
                .preview-desc {
                    color: #0a0;
                    font-size: 10px;
                    margin-bottom: 8px;
                }
                
                .preview-stats {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    color: #080;
                    font-size: 9px;
                }
            `}</style>
        </div>
    );
};

export default TXObjectPalette;
