/**
 * Garage UI Module
 * HTML/CSS UI логика гаража из garage.ts
 */

export type CategoryType = "chassis" | "cannons" | "tracks" | "modules" | "supplies" | "shop" | "skins" | "presets";

export interface GarageUIState {
    currentCategory: CategoryType;
    selectedItemIndex: number;
    searchText: string;
    sortBy: "name" | "stats" | "custom" | "unique";
    filterMode: "all" | "owned" | "locked";
}

/**
 * Инъектирует CSS стили для гаража
 */
export function injectGarageStyles(): void {
    if (document.getElementById('garage-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'garage-styles';
    style.textContent = `
        .garage-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 10, 0, 0.95);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: 'Consolas', 'Monaco', monospace;
            animation: fadeIn 0.3s ease-out;
            cursor: default;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .garage-container {
            width: min(85vw, 900px);
            height: min(80vh, 580px);
            max-width: min(900px, 90vw);
            max-height: min(580px, 85vh);
            background: rgba(5, 15, 5, 0.98);
            cursor: default;
            border: clamp(1px, 0.15vw, 2px) solid #0f0;
            display: flex;
            flex-direction: column;
            animation: slideUp 0.3s ease-out;
            box-shadow: 0 0 clamp(20px, 2vw, 30px) rgba(0, 255, 0, 0.3);
        }
        .garage-header {
            height: clamp(35px, 4vh, 45px);
            background: rgba(0, 30, 0, 0.9);
            border-bottom: clamp(1px, 0.15vw, 2px) solid #0f0;
            display: flex;
            align-items: center;
            padding: 0 clamp(10px, 1.5vw, 15px);
            justify-content: space-between;
            flex-shrink: 0;
        }
        .garage-title {
            color: #0f0;
            font-size: clamp(16px, 2vw, 20px);
            font-weight: bold;
        }
        .garage-currency {
            color: #ff0;
            font-size: clamp(12px, 1.5vw, 15px);
            background: rgba(0,0,0,0.5);
            padding: clamp(3px, 0.4vh, 4px) clamp(8px, 1.2vw, 12px);
            border: clamp(1px, 0.1vw, 1px) solid #ff0;
        }
        .garage-close {
            color: #f00;
            font-size: clamp(16px, 2vw, 20px);
            cursor: pointer;
            padding: clamp(3px, 0.4vh, 4px) clamp(6px, 0.8vw, 8px);
            border: clamp(1px, 0.1vw, 1px) solid #f00;
            background: transparent;
        }
        .garage-close:hover { background: rgba(255,0,0,0.3); }
        .garage-tabs {
            height: clamp(30px, 3.5vh, 35px);
            background: rgba(0, 20, 0, 0.8);
            display: flex;
            border-bottom: clamp(1px, 0.1vw, 1px) solid #080;
            flex-shrink: 0;
        }
        .garage-tab {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #080;
            font-size: clamp(9px, 1.1vw, 11px);
            cursor: pointer;
            border-right: clamp(1px, 0.1vw, 1px) solid #040;
            transition: all 0.2s ease;
            position: relative;
        }
        .garage-tab:hover { 
            background: rgba(0,255,0,0.1); 
            color: #0f0;
            transform: translateY(-1px);
        }
        .garage-tab.active { 
            background: rgba(0,255,0,0.2); 
            color: #0f0; 
            font-weight: bold;
            box-shadow: inset 0 -2px 0 #0f0;
        }
        .garage-tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: #0f0;
        }
        .garage-content {
            flex: 1;
            display: flex;
            overflow: hidden;
            min-height: 0;
        }
        .garage-left {
            width: 45%;
            border-right: 1px solid #080;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .garage-search {
            padding: 8px;
            border-bottom: 1px solid #040;
            flex-shrink: 0;
        }
        .garage-search input {
            width: 100%;
            background: rgba(0,0,0,0.5);
            border: 1px solid #0aa;
            color: #0f0;
            padding: 6px;
            font-family: inherit;
            font-size: 11px;
        }
        .garage-filters {
            padding: 4px 8px;
            display: flex;
            gap: 4px;
            border-bottom: 1px solid #040;
            flex-shrink: 0;
        }
        .garage-filter-btn {
            padding: 3px 10px;
            background: rgba(0,0,0,0.5);
            border: 1px solid #080;
            color: #080;
            cursor: pointer;
            font-size: 9px;
        }
        .garage-filter-btn.active { border-color: #0f0; color: #0f0; background: rgba(0,255,0,0.2); }
        .garage-sort-btn {
            padding: 3px 8px;
            background: rgba(0,255,255,0.1);
            border: 1px solid #0aa;
            color: #0aa;
            cursor: pointer;
            font-size: 9px;
        }
        .garage-sort-btn:hover { border-color: #0ff; color: #0ff; background: rgba(0,255,255,0.2); }
        .garage-items {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            min-height: 0;
        }
        .garage-item {
            padding: 8px;
            margin-bottom: 6px;
            background: rgba(0,0,0,0.4);
            border: 1px solid #040;
            cursor: pointer;
            transition: all 0.2s ease;
            min-height: 60px;
            position: relative;
        }
        .garage-item:hover { 
            border-color: #0a0; 
            background: rgba(0,255,0,0.08);
            transform: translateX(2px);
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
        }
        .garage-item.selected { 
            border-color: #0f0; 
            background: rgba(0,255,0,0.15);
            box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
        }
        .garage-item.equipped { 
            border-color: #0ff;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }
        .garage-item.pending {
            border-color: #ff0;
            box-shadow: 0 0 12px rgba(255, 255, 0, 0.4);
            background: rgba(50, 50, 0, 0.3);
            animation: pendingGlow 1.5s ease-in-out infinite;
        }
        @keyframes pendingGlow {
            0%, 100% { box-shadow: 0 0 10px rgba(255, 255, 0, 0.3); }
            50% { box-shadow: 0 0 20px rgba(255, 255, 0, 0.6); }
        }
        @keyframes pendingPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .garage-item-name { color: #0f0; font-size: clamp(10px, 1.2vw, 12px); font-weight: bold; }
        .garage-item-desc { color: #080; font-size: clamp(8px, 1vw, 10px); margin-top: clamp(2px, 0.3vh, 3px); }
        .garage-item-stats { color: #0aa; font-size: clamp(8px, 0.9vw, 9px); margin-top: clamp(3px, 0.4vh, 4px); }
        .garage-item-price { color: #ff0; font-size: clamp(9px, 1.1vw, 11px); float: right; }
        .garage-item.owned .garage-item-price { color: #0f0; }
        .garage-right {
            width: 55%;
            display: flex;
            flex-direction: column;
            padding: 8px;
            min-width: 0;
        }
        .garage-preview {
            height: 40%;
            background: rgba(0,20,0,0.5);
            border: 1px solid #080;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
        }
        .garage-preview::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(0,255,0,0.1), transparent);
            animation: scan 3s infinite;
        }
        @keyframes scan {
            0% { left: -100%; }
            100% { left: 100%; }
        }
        .garage-preview-title { 
            color: #080; 
            font-size: 9px; 
            z-index: 1;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .garage-preview-info { 
            color: #0f0; 
            font-size: 13px; 
            margin: 8px 0;
            z-index: 1;
            text-align: center;
            line-height: 1.6;
        }
        .garage-preview-canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 1.0;
            pointer-events: auto;
            z-index: 10;
        }
        .garage-details {
            flex: 1;
            background: rgba(0,0,0,0.3);
            border: 1px solid #080;
            padding: 10px;
            overflow-y: auto;
            min-height: 0;
        }
        .garage-details-title { color: #0f0; font-size: clamp(12px, 1.4vw, 14px); font-weight: bold; margin-bottom: clamp(6px, 0.8vh, 8px); }
        .garage-details-desc { color: #0a0; font-size: clamp(9px, 1.1vw, 11px); margin-bottom: clamp(8px, 1vh, 10px); }
        .garage-stats-row { display: flex; justify-content: space-between; padding: clamp(3px, 0.4vh, 4px) 0; border-bottom: clamp(1px, 0.1vw, 1px) solid #030; }
        .garage-stat-name { color: #0aa; font-size: clamp(8px, 1vw, 10px); }
        .garage-stat-value { color: #0f0; font-size: clamp(8px, 1vw, 10px); }
        .garage-stat-change.positive { color: #0f0; }
        .garage-stat-change.negative { color: #f00; }
        .garage-action-btn {
            width: 100%;
            padding: clamp(8px, 1vh, 10px);
            margin-top: clamp(8px, 1vh, 10px);
            background: rgba(0,255,0,0.2);
            border: clamp(1px, 0.15vw, 2px) solid #0f0;
            color: #0f0;
            font-size: clamp(10px, 1.2vw, 12px);
            font-weight: bold;
            cursor: pointer;
            font-family: inherit;
        }
        .garage-action-btn:hover { background: rgba(0,255,0,0.3); }
        .garage-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .garage-footer {
            height: clamp(25px, 3vh, 30px);
            background: rgba(0, 20, 0, 0.8);
            border-top: clamp(1px, 0.1vw, 1px) solid #080;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #060;
            font-size: clamp(8px, 0.9vw, 9px);
            flex-shrink: 0;
        }
        
        @media (max-width: 768px) {
            .garage-container {
                width: 95vw;
                height: 90vh;
            }
            .garage-left, .garage-right {
                width: 100% !important;
            }
            .garage-content {
                flex-direction: column;
            }
        }
    `;
    document.head.appendChild(style);
}

export interface TankPart {
    id: string;
    name: string;
    description: string;
    cost: number;
    unlocked: boolean;
    type: "chassis" | "turret" | "barrel" | "engine" | "module" | "supply";
    stats: {
        health?: number;
        speed?: number;
        armor?: number;
        firepower?: number;
        reload?: number;
        damage?: number;
    };
}

export interface TankUpgrade {
    id: string;
    name: string;
    description: string;
    cost: number;
    level: number;
    maxLevel: number;
    stat: "health" | "speed" | "armor" | "firepower" | "reload" | "damage";
    value: number;
}

export interface GarageUICallbacks {
    onClose: () => void;
    onCategoryChange: (category: CategoryType) => void;
    onFilterChange: (filter: "all" | "owned" | "locked") => void;
    onSortChange: () => void;
    onSearchChange: (text: string) => void;
    onItemSelect: (index: number) => void;
    onItemDoubleClick: (index: number) => void;
    onAction: (item: TankPart | TankUpgrade) => void;
}

export interface GarageUIState {
    currentCategory: CategoryType;
    selectedItemIndex: number;
    searchText: string;
    sortBy: "name" | "stats" | "custom" | "unique";
    filterMode: "all" | "owned" | "locked";
    currency: number;
    currentChassisId: string;
    currentCannonId: string;
    currentTrackId: string;
}

export interface ChassisType {
    id: string;
    name: string;
    maxHealth: number;
    moveSpeed: number;
}

export interface CannonType {
    id: string;
    name: string;
    damage: number;
    cooldown: number;
    projectileSpeed: number;
}

export interface TrackType {
    id: string;
    name: string;
}

/**
 * Создает HTML overlay для гаража
 */
export function createGarageOverlay(
    state: GarageUIState,
    callbacks: GarageUICallbacks,
    getChassisName: (id: string) => string,
    getCannonName: (id: string) => string,
    getTrackName: (id: string) => string
): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.className = "garage-overlay";
    overlay.innerHTML = `
        <div class="garage-container">
            <div class="garage-header">
                <div class="garage-title">[ GARAGE ]</div>
                <div class="garage-currency">CR: ${state.currency}</div>
                <button class="garage-close">X</button>
            </div>
            <div class="garage-tabs">
                <div class="garage-tab ${state.currentCategory === 'chassis' ? 'active' : ''}" data-cat="chassis">[1] CHASSIS</div>
                <div class="garage-tab ${state.currentCategory === 'cannons' ? 'active' : ''}" data-cat="cannons">[2] CANNONS</div>
                <div class="garage-tab ${state.currentCategory === 'tracks' ? 'active' : ''}" data-cat="tracks">[3] TRACKS</div>
                <div class="garage-tab ${state.currentCategory === 'modules' ? 'active' : ''}" data-cat="modules">[4] MODULES</div>
                <div class="garage-tab ${state.currentCategory === 'supplies' ? 'active' : ''}" data-cat="supplies">[5] SUPPLIES</div>
                <div class="garage-tab ${state.currentCategory === 'shop' ? 'active' : ''}" data-cat="shop">[6] SHOP</div>
            </div>
            <div class="garage-content">
                <div class="garage-left">
                    <div class="garage-search">
                        <input type="text" placeholder="Search..." id="garage-search-input" value="${state.searchText}">
                    </div>
                    <div class="garage-filters">
                        <button class="garage-filter-btn ${state.filterMode === 'all' ? 'active' : ''}" data-filter="all">ALL</button>
                        <button class="garage-filter-btn ${state.filterMode === 'owned' ? 'active' : ''}" data-filter="owned">OWNED</button>
                        <button class="garage-filter-btn ${state.filterMode === 'locked' ? 'active' : ''}" data-filter="locked">LOCKED</button>
                        <div style="margin-left: auto; display: flex; gap: 4px; align-items: center;">
                            <button class="garage-sort-btn" id="garage-sort-btn">SORT: ${state.sortBy.toUpperCase()}</button>
                        </div>
                    </div>
                    <div class="garage-items" id="garage-items-list"></div>
                </div>
                <div class="garage-right">
                    <div class="garage-preview">
                        <div class="garage-preview-title">[ CURRENT LOADOUT ]</div>
                        <div class="garage-preview-info">
                            CHASSIS: ${getChassisName(state.currentChassisId)}<br>
                            CANNON: ${getCannonName(state.currentCannonId)}<br>
                            TRACKS: ${getTrackName(state.currentTrackId)}
                        </div>
                    </div>
                    <div class="garage-details" id="garage-details">
                        <div class="garage-details-title">[ SELECT AN ITEM ]</div>
                    </div>
                </div>
            </div>
            <div class="garage-footer">
                [↑↓] Navigate | [Enter] Select | [1-6] Categories | [ESC] Close
            </div>
        </div>
    `;
    
    setupGarageEventListeners(overlay, callbacks, state);
    
    return overlay;
}

/**
 * Настраивает обработчики событий для UI гаража
 */
function setupGarageEventListeners(
    overlay: HTMLDivElement,
    callbacks: GarageUICallbacks,
    state: GarageUIState
): void {
    // Close button
    overlay.querySelector('.garage-close')?.addEventListener('click', callbacks.onClose);
    
    // Tabs
    overlay.querySelectorAll('.garage-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const cat = (e.target as HTMLElement).dataset.cat as CategoryType;
            if (cat) callbacks.onCategoryChange(cat);
        });
    });
    
    // Filters
    overlay.querySelectorAll('.garage-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = (e.target as HTMLElement).dataset.filter as "all" | "owned" | "locked";
            if (filter) {
                overlay.querySelectorAll('.garage-filter-btn').forEach(b => b.classList.remove('active'));
                (e.target as HTMLElement).classList.add('active');
                callbacks.onFilterChange(filter);
            }
        });
    });
    
    // Sort button
    const sortBtn = overlay.querySelector('#garage-sort-btn');
    sortBtn?.addEventListener('click', () => {
        callbacks.onSortChange();
        (sortBtn as HTMLElement).textContent = `SORT: ${state.sortBy.toUpperCase()}`;
    });
    
    // Search
    const searchInput = overlay.querySelector('#garage-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
        callbacks.onSearchChange(searchInput.value);
    });
    
    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) callbacks.onClose();
    });
}

/**
 * Форматирует статистику элемента
 */
export function formatStats(item: TankPart | TankUpgrade): string {
    if ('level' in item) {
        return `Lv.${item.level}/${item.maxLevel} | ${item.stat.toUpperCase()}: ${item.value > 0 ? '+' : ''}${item.value}`;
    }
    const p = item as TankPart;
    const s: string[] = [];
    if (p.stats.health) s.push(`HP:${p.stats.health}`);
    if (p.stats.speed) s.push(`SPD:${p.stats.speed}`);
    if (p.stats.damage) s.push(`DMG:${p.stats.damage}`);
    if (p.stats.reload) s.push(`RLD:${p.stats.reload}ms`);
    return s.join(' | ');
}

/**
 * Вычисляет общую статистику элемента
 */
export function getTotalStats(item: TankPart | TankUpgrade): number {
    if ('level' in item) {
        return item.value * item.level;
    }
    const part = item as TankPart;
    let total = 0;
    if (part.stats.health) total += part.stats.health;
    if (part.stats.speed) total += part.stats.speed * 10;
    if (part.stats.damage) total += part.stats.damage * 5;
    if (part.stats.armor) total += part.stats.armor * 20;
    if (part.stats.reload) total += Math.abs(part.stats.reload) * 0.1;
    return total;
}

/**
 * Обновляет список элементов гаража
 */
export function refreshGarageItemList(
    container: HTMLElement,
    items: (TankPart | TankUpgrade)[],
    state: GarageUIState,
    callbacks: GarageUICallbacks,
    formatStatsFn: (item: TankPart | TankUpgrade) => string
): void {
    container.innerHTML = items.map((item, i) => {
        const isUpgrade = 'level' in item;
        const owned = isUpgrade ? true : (item as TankPart).unlocked;
        const equipped = !isUpgrade && (
            ((item as TankPart).type === 'chassis' && item.id === state.currentChassisId) ||
            ((item as TankPart).type === 'barrel' && item.id === state.currentCannonId) ||
            ((item as TankPart).type === 'module' && item.id === state.currentTrackId)
        );
        const selected = i === state.selectedItemIndex;
        
        const statsStr = formatStatsFn(item);
        const priceStr = owned && !isUpgrade ? 'OWNED' : `${item.cost} CR`;
        
        return `
            <div class="garage-item ${selected ? 'selected' : ''} ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-index="${i}">
                <div class="garage-item-name">${item.name} ${equipped ? '[EQUIPPED]' : ''}</div>
                <div class="garage-item-desc">${item.description}</div>
                <div class="garage-item-stats">${statsStr}</div>
                <div class="garage-item-price">${priceStr}</div>
            </div>
        `;
    }).join('');
    
    // Add click listeners
    container.querySelectorAll('.garage-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.getAttribute('data-index') || '0');
            callbacks.onItemSelect(idx);
        });
        el.addEventListener('dblclick', () => {
            const idx = parseInt(el.getAttribute('data-index') || '0');
            callbacks.onItemDoubleClick(idx);
        });
    });
}

/**
 * Генерирует HTML для сравнения статистики
 */
export function getComparisonHTML(
    item: TankPart | TankUpgrade,
    currentChassisId: string,
    currentCannonId: string,
    getChassisById: (id: string) => ChassisType,
    getCannonById: (id: string) => CannonType
): string {
    if ('level' in item) {
        const upgrade = item as TankUpgrade;
        const nextLevel = upgrade.level + 1;
        if (nextLevel > upgrade.maxLevel) return '<div style="color: #0aa; margin-top: 10px;">MAX LEVEL REACHED</div>';
        return `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                <div class="garage-stats-row"><span class="garage-stat-name">Current Level</span><span class="garage-stat-value">${upgrade.level}/${upgrade.maxLevel}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Current ${upgrade.stat.toUpperCase()}</span><span class="garage-stat-value">${upgrade.value * upgrade.level > 0 ? '+' : ''}${upgrade.value * upgrade.level}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Next Level</span><span class="garage-stat-value">${nextLevel}/${upgrade.maxLevel} <span class="garage-stat-change positive">(+${upgrade.value})</span></span></div>
            </div>
        `;
    }
    
    const part = item as TankPart;
    let rows = '';
    
    if (part.type === 'chassis') {
        const current = getChassisById(currentChassisId);
        const next = getChassisById(part.id);
        const hpDiff = next.maxHealth - current.maxHealth;
        const spdDiff = next.moveSpeed - current.moveSpeed;
        const armorDiff = (next.maxHealth / 50) - (current.maxHealth / 50);
        rows = `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                <div style="color: #0aa; font-size: 10px; margin-bottom: 8px; font-weight: bold;">COMPARISON</div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">HP</span>
                    <span class="garage-stat-value">
                        <span style="color: #080;">${current.maxHealth}</span> → 
                        <span style="color: #0f0;">${next.maxHealth}</span>
                        <span class="garage-stat-change ${hpDiff >= 0 ? 'positive' : 'negative'}">(${hpDiff >= 0 ? '+' : ''}${hpDiff})</span>
                    </span>
                </div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Speed</span>
                    <span class="garage-stat-value">
                        <span style="color: #080;">${current.moveSpeed}</span> → 
                        <span style="color: #0f0;">${next.moveSpeed}</span>
                        <span class="garage-stat-change ${spdDiff >= 0 ? 'positive' : 'negative'}">(${spdDiff >= 0 ? '+' : ''}${spdDiff.toFixed(1)})</span>
                    </span>
                </div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Armor</span>
                    <span class="garage-stat-value">
                        <span style="color: #080;">${(current.maxHealth / 50).toFixed(1)}</span> → 
                        <span style="color: #0f0;">${(next.maxHealth / 50).toFixed(1)}</span>
                        <span class="garage-stat-change ${armorDiff >= 0 ? 'positive' : 'negative'}">(${armorDiff >= 0 ? '+' : ''}${armorDiff.toFixed(1)})</span>
                    </span>
                </div>
            </div>
        `;
    } else if (part.type === 'barrel') {
        const current = getCannonById(currentCannonId);
        const next = getCannonById(part.id);
        const dmgDiff = next.damage - current.damage;
        const rldDiff = next.cooldown - current.cooldown;
        const projSpeedDiff = next.projectileSpeed - current.projectileSpeed;
        rows = `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                <div style="color: #0aa; font-size: 10px; margin-bottom: 8px; font-weight: bold;">COMPARISON</div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Damage</span>
                    <span class="garage-stat-value">
                        <span style="color: #080;">${current.damage}</span> → 
                        <span style="color: #0f0;">${next.damage}</span>
                        <span class="garage-stat-change ${dmgDiff >= 0 ? 'positive' : 'negative'}">(${dmgDiff >= 0 ? '+' : ''}${dmgDiff})</span>
                    </span>
                </div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Reload</span>
                    <span class="garage-stat-value">
                        <span style="color: #080;">${current.cooldown}ms</span> → 
                        <span style="color: #0f0;">${next.cooldown}ms</span>
                        <span class="garage-stat-change ${rldDiff <= 0 ? 'positive' : 'negative'}">(${rldDiff >= 0 ? '+' : ''}${rldDiff}ms)</span>
                    </span>
                </div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Proj. Speed</span>
                    <span class="garage-stat-value">
                        <span style="color: #080;">${current.projectileSpeed}</span> → 
                        <span style="color: #0f0;">${next.projectileSpeed}</span>
                        <span class="garage-stat-change ${projSpeedDiff >= 0 ? 'positive' : 'negative'}">(${projSpeedDiff >= 0 ? '+' : ''}${projSpeedDiff})</span>
                    </span>
                </div>
            </div>
        `;
    }
    
    return rows;
}

/**
 * Показывает детали элемента
 */
export function showGarageItemDetails(
    container: HTMLElement,
    item: TankPart | TankUpgrade,
    state: GarageUIState,
    callbacks: GarageUICallbacks,
    getChassisById: (id: string) => ChassisType,
    getCannonById: (id: string) => CannonType,
    trackParts: TankPart[]
): void {
    const isUpgrade = 'level' in item;
    const canAfford = state.currency >= item.cost;
    const equipped = !isUpgrade && (
        ((item as TankPart).type === 'chassis' && item.id === state.currentChassisId) ||
        ((item as TankPart).type === 'barrel' && item.id === state.currentCannonId) ||
        ((item as TankPart).type === 'module' && trackParts.find(t => t.id === item.id) && item.id === state.currentTrackId)
    );
    
    let btnText = '';
    let btnDisabled = false;
    
    if (isUpgrade) {
        if ((item as TankUpgrade).level >= (item as TankUpgrade).maxLevel) { btnText = 'MAX LEVEL'; btnDisabled = true; }
        else if (!canAfford) { btnText = `NEED ${item.cost} CR`; btnDisabled = true; }
        else btnText = `UPGRADE (${item.cost} CR)`;
    } else {
        if ((item as TankPart).unlocked) {
            if (equipped) { btnText = 'EQUIPPED'; btnDisabled = true; }
            else btnText = 'EQUIP';
        } else if (!canAfford) { btnText = `NEED ${item.cost} CR`; btnDisabled = true; }
        else btnText = `BUY (${item.cost} CR)`;
    }
    
    container.innerHTML = `
        <div class="garage-details-title">[ ${item.name.toUpperCase()} ]</div>
        <div class="garage-details-desc">${item.description}</div>
        ${getComparisonHTML(item, state.currentChassisId, state.currentCannonId, getChassisById, getCannonById)}
        <button class="garage-action-btn" ${btnDisabled ? 'disabled' : ''} id="garage-action">${btnText}</button>
    `;
    
    container.querySelector('#garage-action')?.addEventListener('click', () => {
        if (!btnDisabled) callbacks.onAction(item);
    });
}

/**
 * Обновляет отображение элементов гаража
 */
/**
 * @deprecated Use refreshGarageItemList instead
 * Kept for backward compatibility
 */
export function updateGarageItemsDisplay(
    _items: any[], // Используется только для совместимости API
    _selectedIndex: number, // Используется только для совместимости API
    _currentCategory: string // Используется только для совместимости API
): void {
    // This function signature is kept for compatibility but implementation moved to refreshGarageItemList
}

/**
 * Обрабатывает выбор элемента
 */
export function handleGarageItemSelect(
    itemId: string,
    category: string,
    onSelect: (itemId: string, category: string) => void
): void {
    onSelect(itemId, category);
}

/**
 * Обрабатывает навигацию по клавиатуре
 */
export interface GarageKeyboardCallbacks {
    onEscape: () => void;
    onCategorySelect: (category: CategoryType) => void;
    onNavigateUp: () => void;
    onNavigateDown: () => void;
    onSelect: () => void;
}

export function setupGarageKeyboardNavigation(
    isOpen: () => boolean,
    callbacks: GarageKeyboardCallbacks
): () => void {
    const handler = (e: KeyboardEvent) => {
        if (!isOpen()) return;
        
        // ИГНОРИРУЕМ Ctrl+комбинации - они используются для меню настроек
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }
        
        // Закрытие гаража: Escape, G или B
        if (e.code === 'Escape' || e.code === 'KeyG' || e.code === 'KeyB') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            callbacks.onEscape();
            return;
        }
        
        const cats: CategoryType[] = ['chassis', 'cannons', 'tracks', 'modules', 'supplies', 'shop'];
        for (let i = 1; i <= 6; i++) {
            if (e.code === `Digit${i}` || e.code === `Numpad${i}`) {
                e.preventDefault();
                const cat = cats[i - 1];
                if (cat) callbacks.onCategorySelect(cat);
                return;
            }
        }
        
        if (e.code === 'ArrowUp') {
            e.preventDefault();
            callbacks.onNavigateUp();
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            callbacks.onNavigateDown();
        }
        
        if ((e.code === 'Enter' || e.code === 'Space')) {
            e.preventDefault();
            callbacks.onSelect();
        }
    };
    
    window.addEventListener('keydown', handler);
    
    // Возвращаем функцию для очистки
    return () => {
        window.removeEventListener('keydown', handler);
    };
}


