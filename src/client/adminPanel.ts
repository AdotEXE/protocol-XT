import { Game } from "./game";
import { MultiplayerManager } from "./multiplayer";
import { logger } from "./utils/logger";

/**
 * AdminPanel
 * Provides UI for Room Hosts and Debugging
 * - Kick Players
 * - Change Settings (Map)
 * - Debug Info
 */
export class AdminPanel {
    private game: Game;
    private multiplayerManager?: MultiplayerManager;

    private container: HTMLElement;
    private isVisible: boolean = false;

    constructor(game: Game) {
        this.game = game;
        // this.multiplayerManager ref is optional, using game.multiplayerManager in methods instead

        // Initialize container before using it
        this.container = document.createElement('div');
        this.createUI();
        this.setupInput();

        // Update UI loop
        setInterval(() => {
            if (this.isVisible) {
                this.updateContent();
            }
        }, 1000);
    }

    private createUI(): void {
        // Container already created in constructor, just configure it
        this.container.id = 'admin-panel';
        this.container.style.display = 'none';
        this.container.className = 'admin-panel-overlay';

        this.container.innerHTML = `
            <div class="admin-panel-window">
                <div class="admin-header">
                    <h2>Admin Control Panel</h2>
                    <button id="admin-close-btn" class="close-btn">×</button>
                </div>
                <div class="admin-tabs">
                    <button class="admin-tab active" data-tab="players">Players</button>
                    <button class="admin-tab" data-tab="settings">Room Settings</button>
                    <button class="admin-tab" data-tab="debug">Debug</button>
                </div>
                <div class="admin-content">
                    <div id="admin-tab-players" class="tab-content active">
                        <table class="admin-table" id="admin-players-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>ID</th>
                                    <th>Ping</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Players list here -->
                            </tbody>
                        </table>
                    </div>
                    <div id="admin-tab-settings" class="tab-content">
                        <div class="setting-group">
                            <label>Map Type:</label>
                            <select id="admin-map-select">
                                <option value="normal">Normal</option>
                                <option value="desert">Desert</option>
                                <option value="snow">Snow</option>
                                <option value="city">City</option>
                                <option value="forest">Forest</option>
                                <option value="swamp">Swamp</option>
                                <option value="volcanic">Volcanic</option>
                                <option value="arctic">Arctic</option>
                                <option value="tropical">Tropical</option>
                                <option value="sandbox">Sandbox</option>
                            </select>
                            <button id="admin-apply-map-btn" class="action-btn">Change Map</button>
                        </div>
                        <div class="setting-group">
                             <button id="admin-restart-btn" class="action-btn danger">Restart Match</button>
                        </div>
                    </div>
                    <div id="admin-tab-debug" class="tab-content">
                        <div id="admin-debug-info">Loading stats...</div>
                        <div class="setting-group" style="margin-top: 15px; border-top: 1px solid #333; padding-top: 15px;">
                            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                                <input type="checkbox" id="admin-projectile-trajectory" style="width: 18px; height: 18px; cursor: pointer;">
                                <span>🎯 Показывать траекторию снарядов (красным)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        // Bind events
        document.getElementById('admin-close-btn')?.addEventListener('click', () => this.toggle());

        // Tabs
        const tabs = this.container.querySelectorAll('.admin-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const tabId = target.dataset.tab;

                // Switch tabs logic
                this.container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                this.container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                target.classList.add('active');
                document.getElementById(`admin-tab-${tabId}`)?.classList.add('active');
            });
        });

        // Actions
        document.getElementById('admin-apply-map-btn')?.addEventListener('click', () => this.changeMap());
        document.getElementById('admin-restart-btn')?.addEventListener('click', () => this.restartGame());

        // Debug: Траектория снарядов
        const trajectoryCheckbox = document.getElementById('admin-projectile-trajectory') as HTMLInputElement;
        if (trajectoryCheckbox) {
            // Инициализация: синхронизируем с текущим состоянием танка
            trajectoryCheckbox.checked = this.game.tankController?.showProjectileTrajectory ?? true;
            
            trajectoryCheckbox.addEventListener('change', () => {
                if (this.game.tankController) {
                    this.game.tankController.showProjectileTrajectory = trajectoryCheckbox.checked;
                    if (!trajectoryCheckbox.checked) {
                        this.game.tankController.clearTrajectoryLines();
                    }
                    logger.log(`[AdminPanel] Projectile trajectory: ${trajectoryCheckbox.checked ? 'ON' : 'OFF'}`);
                }
            });
        }
    }

    private setupInput(): void {
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'p' && !this.game.chatSystem?.isChatActive()) {
                this.toggle();
            }
        });
    }

    public toggle(): void {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'flex' : 'none';

        if (this.isVisible) {
            this.updateContent();
        }
    }

    private updateContent(): void {
        this.updatePlayersList();
        this.updateDebugInfo();
    }

    private updatePlayersList(): void {
        const tbody = document.getElementById('admin-players-table')?.querySelector('tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!this.game.multiplayerManager) return; // Safety check

        // Local player
        const local = { id: this.game.multiplayerManager.localPlayerId, name: this.game.multiplayerManager.localPlayerName, ping: 0, isLocal: true };

        // Network players
        const playersMap = this.game.multiplayerManager.players;
        const players = Array.from(playersMap ? playersMap.values() : []).map(p => ({
            id: p.id,
            name: p.name,
            ping: 0, // Ping logic is separate
            isLocal: false
        }));

        const allPlayers = [local, ...players];

        allPlayers.forEach(p => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${p.name} ${p.isLocal ? '(You)' : ''}</td>
                <td class="mono">${p.id}</td>
                <td>${p.ping || '-'}</td>
                <td>
                    ${!p.isLocal ? `<button class="kick-btn" data-id="${p.id}">Kick</button>` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });

        // Bind kick buttons
        tbody.querySelectorAll('.kick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.target as HTMLElement).dataset.id;
                if (id && this.game.multiplayerManager) this.kickPlayer(id);
            });
        });
    }

    private updateDebugInfo(): void {
        const debugDiv = document.getElementById('admin-debug-info');
        if (!debugDiv) return;

        const mpManager = this.game.multiplayerManager;
        const roomId = mpManager ? mpManager.getRoomId() : 'N/A';

        debugDiv.innerHTML = `
            <p><strong>FPS:</strong> ${this.game.engine.getFps().toFixed(0)}</p>
            <p><strong>Room ID:</strong> ${roomId}</p>
            <p><strong>Map Type:</strong> ${this.game.currentMapType}</p>
        `;

        // Синхронизируем checkbox траектории с текущим состоянием танка
        const trajectoryCheckbox = document.getElementById('admin-projectile-trajectory') as HTMLInputElement;
        if (trajectoryCheckbox && this.game.tankController) {
            trajectoryCheckbox.checked = this.game.tankController.showProjectileTrajectory;
        }
    }

    private kickPlayer(id: string): void {
        if (confirm(`Kick player ${id}?`) && this.game.multiplayerManager) {
            this.game.multiplayerManager.kickPlayer(id);
        }
    }

    private changeMap(): void {
        const select = document.getElementById('admin-map-select') as HTMLSelectElement;
        const mapType = select.value;
        if (confirm(`Change map to ${mapType}?`) && this.game.multiplayerManager) {
            this.game.multiplayerManager.changeRoomSettings({ mapType });
        }
    }

    private restartGame(): void {
        if (confirm("Restart match?")) {
            // Implementation depends on server logic support for restart
            // For now, we can just reload map as a "soft" restart
            if (this.game.multiplayerManager) {
                this.game.multiplayerManager.changeRoomSettings({ mapType: this.game.currentMapType });
            }
        }
    }
}
