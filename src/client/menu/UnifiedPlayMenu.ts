// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED PLAY MENU - Lobby-style tabbed interface
// ═══════════════════════════════════════════════════════════════════════════

import { CHASSIS_TYPES, CANNON_TYPES } from "../tankTypes";
import type { MapType } from "../menu";
import { getCustomMapsList, loadCustomMap, getCustomMapData } from "../maps/custom";

// CSS Styles for the unified play panel
const UNIFIED_PLAY_STYLES = `
.unified-play-panel {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: 90% !important;
    max-width: 900px !important;
    max-height: 85vh !important;
    background: rgba(5, 15, 5, 0.98) !important;
    border: 2px solid #0f0 !important;
    box-shadow: 0 0 40px rgba(0, 255, 0, 0.4), inset 0 0 60px rgba(0, 255, 0, 0.05) !important;
    z-index: 100000 !important;
    display: flex;
    flex-direction: column;
    font-family: 'Press Start 2P', monospace;
    overflow: hidden;
}

.unified-play-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: linear-gradient(180deg, rgba(0, 255, 0, 0.15) 0%, transparent 100%);
    border-bottom: 2px solid rgba(0, 255, 0, 0.3);
}

.unified-play-title {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #0f0;
    font-size: 16px;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
}

.unified-play-title .icon {
    font-size: 24px;
}

.unified-play-close {
    background: transparent;
    border: 2px solid rgba(255, 0, 0, 0.5);
    color: #f00;
    width: 32px;
    height: 32px;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
}

.unified-play-close:hover {
    background: rgba(255, 0, 0, 0.2);
    border-color: #f00;
    box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
}

.unified-play-tabs {
    display: flex;
    border-bottom: 2px solid rgba(0, 255, 0, 0.3);
    background: rgba(0, 20, 0, 0.5);
}

.unified-play-tab {
    flex: 1;
    padding: 12px 20px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: rgba(0, 255, 0, 0.5);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
}

.unified-play-tab:hover {
    background: rgba(0, 255, 0, 0.1);
    color: rgba(0, 255, 0, 0.8);
}

.unified-play-tab.active {
    background: rgba(0, 255, 0, 0.15);
    color: #0f0;
    border-bottom-color: #0f0;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
}

.unified-play-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    min-height: 300px;
}

.unified-play-content::-webkit-scrollbar {
    width: 6px;
}

.unified-play-content::-webkit-scrollbar-track {
    background: rgba(0, 20, 0, 0.3);
}

.unified-play-content::-webkit-scrollbar-thumb {
    background: rgba(0, 255, 0, 0.4);
    border-radius: 3px;
}

.unified-play-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: rgba(0, 20, 0, 0.5);
    border-top: 2px solid rgba(0, 255, 0, 0.3);
    gap: 15px;
}

.unified-play-footer .btn-garage {
    padding: 12px 25px;
    background: rgba(0, 100, 0, 0.3);
    border: 2px solid #0a0;
    color: #0a0;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}

.unified-play-footer .btn-garage:hover {
    background: rgba(0, 255, 0, 0.2);
    border-color: #0f0;
    color: #0f0;
}

.unified-play-footer .btn-start {
    flex: 1;
    max-width: 300px;
    padding: 15px 30px;
    background: linear-gradient(180deg, #0f0 0%, #0a0 100%);
    border: 2px solid #0f0;
    color: #000;
    font-family: inherit;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    text-shadow: none;
}

.unified-play-footer .btn-start:hover {
    background: linear-gradient(180deg, #4f4 0%, #0f0 100%);
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.6);
}

/* Mode Grid */
.upm-mode-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
}

.upm-mode-item {
    padding: 15px;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(0, 255, 0, 0.3);
    color: #0f0;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 12px;
}

.upm-mode-item:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.6);
}

.upm-mode-item.selected {
    background: rgba(0, 255, 0, 0.2);
    border-color: #0f0;
    box-shadow: 0 0 15px rgba(0, 255, 0, 0.4);
}

.upm-mode-item .icon {
    font-size: 28px;
    min-width: 40px;
    text-align: center;
}

.upm-mode-item .info {
    flex: 1;
}

.upm-mode-item .name {
    font-size: 11px;
    margin-bottom: 4px;
}

.upm-mode-item .desc {
    font-size: 8px;
    color: rgba(0, 255, 0, 0.6);
}

/* Map Grid */
.upm-map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
}

.upm-map-item {
    aspect-ratio: 1;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(0, 255, 0, 0.3);
    color: #0f0;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px;
    text-align: center;
}

.upm-map-item:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.6);
    transform: scale(1.02);
}

.upm-map-item.selected {
    background: rgba(0, 255, 0, 0.2);
    border-color: #0f0;
    box-shadow: 0 0 15px rgba(0, 255, 0, 0.4);
}

.upm-map-item .icon {
    font-size: 36px;
    margin-bottom: 8px;
}

.upm-map-item .name {
    font-size: 9px;
}

/* Tank Selection */
.upm-tank-section {
    margin-bottom: 20px;
}

.upm-tank-section-title {
    font-size: 11px;
    color: #0f0;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 255, 0, 0.3);
}

.upm-preset-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
}

.upm-preset-item {
    padding: 12px;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(0, 255, 0, 0.3);
    color: #0f0;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    font-family: inherit;
    font-size: 10px;
}

.upm-preset-item:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.6);
}

.upm-preset-item.selected {
    background: rgba(0, 255, 0, 0.2);
    border-color: #0f0;
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.4);
}

.upm-tank-parts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.upm-part-select {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.upm-part-option {
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(0, 255, 0, 0.3);
    color: #0f0;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
    font-size: 9px;
    text-align: left;
}

.upm-part-option:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.6);
}

.upm-part-option.selected {
    background: rgba(0, 255, 0, 0.2);
    border-color: #0f0;
}

.upm-part-option .stats {
    font-size: 7px;
    color: rgba(0, 255, 0, 0.6);
    margin-top: 4px;
}
`;

export interface UnifiedPlayMenuCallbacks {
    onClose: () => void;
    onGarage: () => void;
    onStartGame: (mode: string, mapType: MapType, chassisId: string, cannonId: string) => void;
    getOwnedChassisIds: () => Set<string>;
    getOwnedCannonIds: () => Set<string>;
    selectPreset: (preset: string) => void;
}

export class UnifiedPlayMenu {
    private panel: HTMLDivElement;
    private callbacks: UnifiedPlayMenuCallbacks;
    private selectedMode: string;
    private selectedMap: string;
    private selectedChassis: string;
    private selectedCannon: string;
    private activeTab: string = "mode";
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(callbacks: UnifiedPlayMenuCallbacks) {
        this.callbacks = callbacks;

        // Load saved selections
        this.selectedMode = localStorage.getItem("selectedGameMode") || "ffa";
        this.selectedMap = localStorage.getItem("selectedMapType") || "desert";
        this.selectedChassis = localStorage.getItem("selectedChassis") || "medium";
        this.selectedCannon = localStorage.getItem("selectedCannon") || "standard";

        this.panel = this.createPanel();
        this.injectStyles();
        this.setupEventListeners();
    }

    private injectStyles(): void {
        const existingStyle = document.getElementById("unified-play-menu-styles");
        if (!existingStyle) {
            const style = document.createElement("style");
            style.id = "unified-play-menu-styles";
            style.textContent = UNIFIED_PLAY_STYLES;
            document.head.appendChild(style);
        }
    }

    private createPanel(): HTMLDivElement {
        const panel = document.createElement("div");
        panel.className = "panel unified-play-panel";
        panel.id = "play-menu-panel";

        panel.innerHTML = `
            <div class="unified-play-header">
                <div class="unified-play-title">
                    <span class="icon">🎮</span>
                    <span>ИГРАТЬ</span>
                </div>
                <button class="unified-play-close" id="upm-close">×</button>
            </div>

            <div class="unified-play-tabs">
                <button class="unified-play-tab active" data-tab="mode">[РЕЖИМ]</button>
                <button class="unified-play-tab" data-tab="map">[КАРТА]</button>
                <button class="unified-play-tab" data-tab="tank">[ТАНК]</button>
            </div>

            <div class="unified-play-content" id="upm-content">
            </div>

            <div class="unified-play-footer">
                <button class="btn-garage" id="upm-garage">⚙ ГАРАЖ</button>
                <button class="btn-start" id="upm-start">▶ В БОЙ</button>
            </div>
        `;

        document.body.appendChild(panel);
        panel.style.display = "none";

        return panel;
    }

    private setupEventListeners(): void {
        // Tab switching
        const tabs = this.panel.querySelectorAll(".unified-play-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const tabId = (tab as HTMLElement).dataset.tab || "mode";
                this.switchTab(tabId);
            });
        });

        // Close button
        this.panel.querySelector("#upm-close")?.addEventListener("click", () => {
            this.callbacks.onClose();
        });

        // Garage button
        this.panel.querySelector("#upm-garage")?.addEventListener("click", () => {
            this.callbacks.onGarage();
        });

        // Start button
        this.panel.querySelector("#upm-start")?.addEventListener("click", () => {
            this.startGame();
        });

        // Keyboard navigation
        this.keyHandler = (e: KeyboardEvent) => {
            if (this.panel.style.display === "none") return;

            if (e.code === "Escape") {
                e.preventDefault();
                this.callbacks.onClose();
                return;
            }

            const tabOrder = ["mode", "map", "tank"];
            const currentIdx = tabOrder.indexOf(this.activeTab);

            if (e.code === "ArrowLeft") {
                e.preventDefault();
                const newIdx = (currentIdx - 1 + tabOrder.length) % tabOrder.length;
                this.switchTab(tabOrder[newIdx]);
            } else if (e.code === "ArrowRight") {
                e.preventDefault();
                const newIdx = (currentIdx + 1) % tabOrder.length;
                this.switchTab(tabOrder[newIdx]);
            } else if (e.code === "Enter") {
                e.preventDefault();
                this.startGame();
            }
        };

        window.addEventListener("keydown", this.keyHandler);
    }

    private switchTab(tabId: string): void {
        this.activeTab = tabId;

        const tabs = this.panel.querySelectorAll(".unified-play-tab");
        tabs.forEach(t => {
            t.classList.toggle("active", (t as HTMLElement).dataset.tab === tabId);
        });

        if (tabId === "mode") this.renderModeTab();
        else if (tabId === "map") this.renderMapTab();
        else if (tabId === "tank") this.renderTankTab();
    }

    private renderModeTab(): void {
        const content = this.panel.querySelector("#upm-content")!;
        const modes = [
            { id: "ffa", icon: "⚔️", name: "Free-for-All", desc: "Каждый сам за себя" },
            { id: "tdm", icon: "👥", name: "Team Deathmatch", desc: "Команда против команды" },
            { id: "battle_royale", icon: "👑", name: "Battle Royale", desc: "Последний выживший" },
            { id: "ctf", icon: "🚩", name: "Capture the Flag", desc: "Захват флага противника" },
            { id: "control_point", icon: "📍", name: "Control Point", desc: "Захват точек" },
            { id: "escort", icon: "🚛", name: "Escort", desc: "Сопровождение конвоя" },
            { id: "survival", icon: "💀", name: "Survival", desc: "Выживание против волн" },
            { id: "coop", icon: "🤝", name: "Co-op PvE", desc: "Командная игра против AI" },
            { id: "raid", icon: "👹", name: "Raid", desc: "Рейды с боссами" },
            { id: "multiplayer", icon: "🌐", name: "МУЛЬТИПЛЕЕР", desc: "Онлайн игра с другими!", isMultiplayer: true },
        ];

        let html = '<div class="upm-mode-grid">';
        for (const m of modes) {
            const selected = this.selectedMode === m.id ? "selected" : "";
            const isMP = (m as any).isMultiplayer;
            const mpStyle = isMP ? 'style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-color: #9b59b6;"' : '';
            html += `
                <div class="upm-mode-item ${selected}" data-mode="${m.id}" ${mpStyle}>
                    <div class="icon">${m.icon}</div>
                    <div class="info">
                        <div class="name">${m.name}</div>
                        <div class="desc">${m.desc}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        content.innerHTML = html;

        content.querySelectorAll(".upm-mode-item").forEach(item => {
            item.addEventListener("click", () => {
                this.selectedMode = (item as HTMLElement).dataset.mode || "ffa";
                localStorage.setItem("selectedGameMode", this.selectedMode);
                content.querySelectorAll(".upm-mode-item").forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
            });
        });
    }

    private renderMapTab(): void {
        const content = this.panel.querySelector("#upm-content")!;
        const defaults = [
            { id: "random", icon: "🎲", name: "Случайная" },
            { id: "normal", icon: "🏔️", name: "Обычная" },
            { id: "sand", icon: "🏜️", name: "Песок" },
            { id: "forest", icon: "🌲", name: "Лес" },
            { id: "snow", icon: "❄️", name: "Снег" },
            { id: "city", icon: "🏙️", name: "Город" },
            { id: "volcano", icon: "🌋", name: "Вулкан" },
            { id: "swamp", icon: "🐊", name: "Болото" },
            { id: "arena", icon: "🏟️", name: "Арена" },
            { id: "ruins", icon: "🏛️", name: "Руины" },
            { id: "canyon", icon: "🏜️", name: "Каньон" },
            { id: "islands", icon: "🏝️", name: "Острова" },
        ];

        // Get custom maps
        const customMaps = getCustomMapsList().map(name => ({
            id: `custom:${name}`, // Prefix to distinguish
            icon: "🗺️",
            name: name,
            isCustom: true
        }));

        const allMaps = [...defaults, ...customMaps];

        let html = '<div class="upm-map-grid">';
        for (const m of allMaps) {
            const isSelected = this.selectedMap === m.id || ((m as any).isCustom && this.selectedMap === "custom");
            // Note: simplistic selection logic, might need refinement for specific custom map selection visual
            const selectedClass = isSelected ? "selected" : "";

            html += `
                <div class="upm-map-item ${selectedClass}" data-map="${m.id}" data-custom="${(m as any).isCustom ? 'true' : 'false'}">
                    <div class="icon">${m.icon}</div>
                    <div class="name">${m.name}</div>
                    ${(m as any).isCustom ? '<div class="desc" style="font-size: 8px; color: #aaa;">Custom</div>' : ''}
                </div>
            `;
        }
        html += '</div>';

        // Add "Refresh" button for custom maps?
        html += `<div style="text-align: center; margin-top: 10px; font-size: 10px; color: #666;">
            Found ${customMaps.length} custom maps. 
            <button id="refresh-custom-maps" style="background:none; border:none; color:#0f0; cursor:pointer;">↻ Refresh</button>
        </div>`;

        content.innerHTML = html;

        content.querySelector("#refresh-custom-maps")?.addEventListener("click", () => this.renderMapTab());

        content.querySelectorAll(".upm-map-item").forEach(item => {
            item.addEventListener("click", () => {
                const mapId = (item as HTMLElement).dataset.map || "sand";
                const isCustom = (item as HTMLElement).dataset.custom === "true";

                if (isCustom) {
                    const mapName = mapId.replace("custom:", "");
                    if (loadCustomMap(mapName)) {
                        this.selectedMap = "custom"; // Store 'custom' as type for Game
                        // We need to store specific map name somewhere? 
                        // loadCustomMap stores it in localStorage maybe?
                        localStorage.setItem("selectedMapType", "custom");
                        // Also Save current custom map name if needed by Game?
                        // Game.ts probably reads it from wherever loadCustomMap puts it.
                    }
                } else {
                    this.selectedMap = mapId;
                    localStorage.setItem("selectedMapType", this.selectedMap);
                }

                content.querySelectorAll(".upm-map-item").forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
            });
        });
    }


    private renderTankTab(): void {
        const content = this.panel.querySelector("#upm-content")!;
        const ownedChassis = this.callbacks.getOwnedChassisIds();
        const ownedCannons = this.callbacks.getOwnedCannonIds();

        let html = `
            <div class="upm-tank-section">
                <div class="upm-tank-section-title">Пресет танка:</div>
                <div class="upm-preset-grid">
                    <button class="upm-preset-item" data-preset="balanced">⚖️ Баланс</button>
                    <button class="upm-preset-item" data-preset="speed">⚡ Скорость</button>
                    <button class="upm-preset-item" data-preset="defense">🛡️ Защита</button>
                    <button class="upm-preset-item" data-preset="damage">💥 Урон</button>
                </div>
            </div>

            <div class="upm-tank-parts">
                <div class="upm-part-select">
                    <div class="upm-tank-section-title">Корпус:</div>
                    <div id="upm-chassis-list"></div>
                </div>
                <div class="upm-part-select">
                    <div class="upm-tank-section-title">Пушка:</div>
                    <div id="upm-cannon-list"></div>
                </div>
            </div>
        `;
        content.innerHTML = html;

        // Populate chassis
        const chassisList = content.querySelector("#upm-chassis-list")!;
        CHASSIS_TYPES.filter(c => ownedChassis.has(c.id)).forEach(chassis => {
            const btn = document.createElement("button");
            btn.className = `upm-part-option ${this.selectedChassis === chassis.id ? 'selected' : ''}`;
            btn.innerHTML = `
                <div>${chassis.name}</div>
                <div class="stats">${Math.round(chassis.maxHealth)} HP • ${Math.round(chassis.moveSpeed)} SPD</div>
            `;
            btn.addEventListener("click", () => {
                this.selectedChassis = chassis.id;
                localStorage.setItem("selectedChassis", chassis.id);
                chassisList.querySelectorAll(".upm-part-option").forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
            });
            chassisList.appendChild(btn);
        });

        // Populate cannons
        const cannonList = content.querySelector("#upm-cannon-list")!;
        CANNON_TYPES.filter(c => ownedCannons.has(c.id)).forEach(cannon => {
            const btn = document.createElement("button");
            btn.className = `upm-part-option ${this.selectedCannon === cannon.id ? 'selected' : ''}`;
            btn.innerHTML = `
                <div>${cannon.name}</div>
                <div class="stats">${Math.round(cannon.damage)} DMG • ${cannon.reloadTime}s</div>
            `;
            btn.addEventListener("click", () => {
                this.selectedCannon = cannon.id;
                localStorage.setItem("selectedCannon", cannon.id);
                cannonList.querySelectorAll(".upm-part-option").forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
            });
            cannonList.appendChild(btn);
        });

        // Presets
        content.querySelectorAll(".upm-preset-item").forEach(btn => {
            btn.addEventListener("click", () => {
                this.callbacks.selectPreset((btn as HTMLElement).dataset.preset || "balanced");
                // Reload saved values
                this.selectedChassis = localStorage.getItem("selectedChassis") || "medium";
                this.selectedCannon = localStorage.getItem("selectedCannon") || "standard";
                this.renderTankTab(); // Re-render to update selections
            });
        });
    }

    private startGame(): void {
        let mapType: MapType;
        if (this.selectedMap === "random") {
            const mapTypes: MapType[] = ["normal", "desert", "forest", "snow"];
            mapType = mapTypes[Math.floor(Math.random() * mapTypes.length)];
        } else {
            mapType = this.selectedMap as MapType;
        }

        this.callbacks.onStartGame(
            this.selectedMode,
            mapType,
            this.selectedChassis,
            this.selectedCannon
        );
    }

    public show(): void {
        this.panel.style.display = "flex";
        this.renderModeTab(); // Initial tab
    }

    public hide(): void {
        this.panel.style.display = "none";
    }

    public getPanel(): HTMLDivElement {
        return this.panel;
    }

    public destroy(): void {
        if (this.keyHandler) {
            window.removeEventListener("keydown", this.keyHandler);
            this.keyHandler = null;
        }
        this.panel.remove();
        const styles = document.getElementById("unified-play-menu-styles");
        if (styles) styles.remove();
    }
}
