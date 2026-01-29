/**
 * TX Object Palette Component
 * UI for selecting and placing TX map objects
 */

import React, { useState, useMemo } from 'react';
import {
    TX_OBJECTS_BY_CATEGORY,
    TX_CATEGORY_NAMES,
    TXObjectCategory,
    TXObjectDefinition,
    txObjectToCubes
} from '../services/txObjects';
import { CubeElement } from '../types';

interface TXObjectPaletteProps {
    onPlaceObject?: (cubes: CubeElement[]) => void;
    isMapMode?: boolean; // Сделаем опциональным с дефолтным значением
    onDragStart?: (itemType: string) => void;
}

export const TXObjectPalette: React.FC<TXObjectPaletteProps> = ({ 
    onPlaceObject, 
    isMapMode = false, // Дефолтное значение
    onDragStart 
}) => {
    const [selectedCategory, setSelectedCategory] = useState<TXObjectCategory>('buildings');
    const [hoveredObject, setHoveredObject] = useState<TXObjectDefinition | null>(null);
    const [error, setError] = useState<string | null>(null);

    // КРИТИЧНО: Ранний возврат если не в режиме карты
    if (!isMapMode) {
        return null;
    }

    const handleObjectClick = (def: TXObjectDefinition) => {
        // Place object at origin, user will move it
        if (!onPlaceObject) {
            console.warn('[TXObjectPalette] onPlaceObject is not defined');
            return;
        }
        try {
            if (!def || !def.id) {
                console.warn('[TXObjectPalette] Invalid object definition:', def);
                return;
            }
            const cubes = txObjectToCubes(def, { x: 0, y: 0, z: 0 });
            if (cubes && Array.isArray(cubes) && cubes.length > 0) {
                onPlaceObject(cubes);
            }
        } catch (error) {
            console.error('[TXObjectPalette] Error placing object:', error);
            setError(error instanceof Error ? error.message : 'Unknown error');
        }
    };

    // Защитная проверка - если данные не загружены, показываем заглушку
    if (!TX_OBJECTS_BY_CATEGORY || !TX_CATEGORY_NAMES) {
        return (
            <div className="tx-object-palette">
                <div style={{ color: '#f00', padding: '20px', textAlign: 'center' }}>
                    ⚠️ Ошибка загрузки объектов
                </div>
            </div>
        );
    }

    // Обработка ошибок
    if (error) {
        return (
            <div className="tx-object-palette">
                <div style={{ color: '#f00', padding: '20px', textAlign: 'center' }}>
                    ⚠️ Ошибка: {error}
                </div>
            </div>
        );
    }

    // КРИТИЧНО: Используем useMemo для безопасного вычисления категорий
    const categories = useMemo(() => {
        try {
            if (!TX_OBJECTS_BY_CATEGORY || !TX_CATEGORY_NAMES) {
                console.warn('[TXObjectPalette] TX_OBJECTS_BY_CATEGORY or TX_CATEGORY_NAMES is undefined');
                return [];
            }
            const validCategories = Object.keys(TX_OBJECTS_BY_CATEGORY).filter(
                cat => {
                    try {
                        const category = cat as TXObjectCategory;
                        const objects = TX_OBJECTS_BY_CATEGORY[category];
                        const names = TX_CATEGORY_NAMES[category];
                        return !!(objects && Array.isArray(objects) && objects.length > 0 && names && names.icon);
                    } catch (e) {
                        console.warn('[TXObjectPalette] Error filtering category:', cat, e);
                        return false;
                    }
                }
            ) as TXObjectCategory[];
            return validCategories.length > 0 ? validCategories : ['buildings']; // Fallback
        } catch (error) {
            console.error('[TXObjectPalette] Error computing categories:', error);
            return ['buildings']; // Fallback к первой категории
        }
    }, []);
    
    // КРИТИЧНО: Проверяем что selectedCategory валидный, иначе используем первую доступную
    const validSelectedCategory = useMemo(() => {
        if (categories.length === 0) return 'buildings';
        return categories.includes(selectedCategory) ? selectedCategory : categories[0];
    }, [categories, selectedCategory]);
    
    const currentCategoryObjects = useMemo(() => {
        try {
            return TX_OBJECTS_BY_CATEGORY[validSelectedCategory] || [];
        } catch (error) {
            console.error('[TXObjectPalette] Error getting category objects:', error);
            return [];
        }
    }, [validSelectedCategory]);
    
    // Фильтруем объекты без id (защита от undefined)
    const validObjects = useMemo(() => {
        try {
            return currentCategoryObjects.filter((obj): obj is TXObjectDefinition => {
                return !!(obj && obj.id && typeof obj.id === 'string');
            });
        } catch (error) {
            console.error('[TXObjectPalette] Error filtering objects:', error);
            return [];
        }
    }, [currentCategoryObjects]);

    return (
        <div className="tx-object-palette">
            {/* Category Tabs */}
            <div className="palette-header">
                <span className="palette-title">🗺 TX ОБЪЕКТЫ</span>
            </div>

            <div className="category-tabs">
                {categories && Array.isArray(categories) && categories.length > 0 ? (
                    categories
                        .filter(cat => {
                            try {
                                // КРИТИЧНО: Фильтруем только валидные категории с полной информацией
                                if (!cat || !TX_CATEGORY_NAMES) return false;
                                const catInfo = TX_CATEGORY_NAMES[cat];
                                return !!(catInfo && catInfo.icon && typeof catInfo.icon === 'string');
                            } catch (e) {
                                console.warn('[TXObjectPalette] Error filtering category:', cat, e);
                                return false;
                            }
                        })
                        .map(cat => {
                            try {
                                if (!cat || !TX_CATEGORY_NAMES) return null;
                                const catInfo = TX_CATEGORY_NAMES[cat];
                                if (!catInfo || !catInfo.icon) {
                                    console.warn('[TXObjectPalette] Invalid category info:', cat);
                                    return null;
                                }
                                // КРИТИЧНО: Проверяем что icon это строка, не React элемент
                                const iconDisplay = typeof catInfo.icon === 'string' ? catInfo.icon : String(catInfo.icon || '📁');
                                const titleText = (catInfo.ru || catInfo.en || cat || '').toString();
                                return (
                                    <button
                                        key={cat}
                                        className={`category-tab ${validSelectedCategory === cat ? 'active' : ''}`}
                                        onClick={() => setSelectedCategory(cat)}
                                        title={titleText}
                                    >
                                        {iconDisplay}
                                    </button>
                                );
                            } catch (e) {
                                console.error('[TXObjectPalette] Error rendering category button:', cat, e);
                                return null;
                            }
                        })
                        .filter((item): item is JSX.Element => item !== null && item !== undefined)
                ) : (
                    <div style={{ color: '#888', padding: '10px', textAlign: 'center' }}>
                        Нет доступных категорий
                    </div>
                )}
            </div>
            
            {categories.length === 0 && (
                <div style={{ color: '#f00', padding: '10px', textAlign: 'center' }}>
                    ⚠️ Категории не загружены
                </div>
            )}

            {/* Category Label */}
            <div className="category-label">
                {TX_CATEGORY_NAMES[validSelectedCategory]?.ru || TX_CATEGORY_NAMES[validSelectedCategory]?.en || validSelectedCategory || 'Unknown'}
            </div>

            {/* Objects Grid */}
            <div className="objects-grid">
                {validObjects.length === 0 ? (
                    <div style={{ color: '#888', padding: '10px', textAlign: 'center', gridColumn: 'span 2' }}>
                        Нет объектов в категории
                    </div>
                ) : validObjects
                    .filter((obj): obj is TXObjectDefinition => {
                        // КРИТИЧНО: Строгая проверка что объект валидный
                        return !!(obj && obj.id && typeof obj.id === 'string');
                    })
                    .map(obj => {
                        // КРИТИЧНО: Проверяем что icon это строка, не React элемент
                        const iconDisplay = typeof obj.icon === 'string' ? obj.icon : String(obj.icon || '📦');
                        const nameDisplay = (obj.nameRu || obj.name || 'Object').toString();
                        const descDisplay = (obj.description || '').toString();
                        
                        return (
                            <div
                                key={obj.id}
                                className="object-item"
                                draggable={true}
                                onDragStart={(e) => {
                                    try {
                                        if (onDragStart && obj && obj.id) {
                                            onDragStart(obj.id);
                                        }
                                        e.dataTransfer.effectAllowed = 'copy';
                                        // Use empty image to prevent default drag ghost (we render our own in 3D)
                                        const img = new Image();
                                        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                        e.dataTransfer.setDragImage(img, 0, 0);
                                    } catch (error) {
                                        console.error('[TXObjectPalette] Error in onDragStart:', error);
                                    }
                                }}
                                onClick={() => handleObjectClick(obj)}
                                onDoubleClick={() => handleObjectClick(obj)}
                                onMouseEnter={() => setHoveredObject(obj)}
                                onMouseLeave={() => setHoveredObject(null)}
                                title={`${descDisplay} - Двойной клик для быстрого спавна`}
                            >
                                <span className="object-icon">{iconDisplay}</span>
                                <span className="object-name">{nameDisplay}</span>
                            </div>
                        );
                    })
                    .filter((item): item is JSX.Element => item !== null && item !== undefined)}
            </div>

            {/* Hover Preview */}
            {hoveredObject && (
                <div className="object-preview">
                    <div className="preview-header">
                        <span className="preview-icon">{typeof hoveredObject.icon === 'string' ? hoveredObject.icon : String(hoveredObject.icon || '📦')}</span>
                        <span className="preview-name">{hoveredObject.nameRu || hoveredObject.name || 'Object'}</span>
                    </div>
                    <div className="preview-desc">{hoveredObject.description || ''}</div>
                    <div className="preview-stats">
                        {hoveredObject.size && (
                            <div>📏 {hoveredObject.size.x}x{hoveredObject.size.y}x{hoveredObject.size.z}</div>
                        )}
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
