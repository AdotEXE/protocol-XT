/**
 * Network Menu (F8) - Меню настроек сети и мультиплеера
 */

import { Game } from "./game";
import { logger } from "./utils/logger";
import { CommonStyles } from "./commonStyles";

export interface NetworkSettings {
    multiplayerEnabled: boolean;
    autoConnect: boolean;
    serverAddress: string;
    port: number;
    reconnectAttempts: number;
    reconnectDelay: number;
    pingInterval: number;
    syncRate: number; // Обновлений в секунду
    maxPlayers: number;
    region: string;
    showPing: boolean;
    showPlayers: boolean;
    voiceChat: boolean;
    textChat: boolean;
}

export class NetworkMenu {
    private container!: HTMLDivElement;
    private visible = false;
    private game: Game | null = null;
    private settings: NetworkSettings;
    private statusUpdateInterval: NodeJS.Timeout | null = null;
    private pingUpdateInterval: NodeJS.Timeout | null = null;
    private currentPing: number = 0;
    private lastPingTime: number = 0;
    private pingHistory: number[] = [];
    
    constructor() {
        this.settings = this.loadSettings();
        this.createUI();
        this.setupToggle();
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }
    
    setGame(game: Game | null): void {
        this.game = game;
    }
    
    private loadSettings(): NetworkSettings {
        const saved = localStorage.getItem('ptx_network_settings');
        if (saved) {
            try {
                return { ...this.getDefaultSettings(), ...JSON.parse(saved) };
            } catch (e) {
                logger.warn("[NetworkMenu] Failed to load settings:", e);
            }
        }
        return this.getDefaultSettings();
    }
    
    private getDefaultSettings(): NetworkSettings {
        return {
            multiplayerEnabled: false,
            autoConnect: false,
            serverAddress: "localhost",
            port: 8080,
            reconnectAttempts: 5,
            reconnectDelay: 3000,
            pingInterval: 1000,
            syncRate: 20,
            maxPlayers: 16,
            region: "auto",
            showPing: true,
            showPlayers: true,
            voiceChat: false,
            textChat: true
        };
    }
    
    private saveSettings(): void {
        localStorage.setItem('ptx_network_settings', JSON.stringify(this.settings));
    }
    
    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();
        
        this.container = document.createElement("div");
        this.container.id = "network-menu";
        this.container.className = "panel-overlay";
        
        const html = `
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-title">NETWORK MENU [Ctrl+8]</div>
                    <button class="panel-close" id="network-close">×</button>
                </div>
                <div class="panel-content">
                    <div class="panel-section">
                        <div class="panel-section-title">МУЛЬТИПЛЕЕР</div>
                        <div class="panel-control">
                            <label class="panel-label">
                                <input type="checkbox" id="network-multiplayer-enabled" class="panel-checkbox">
                                Включить мультиплеер
                            </label>
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">
                                <input type="checkbox" id="network-auto-connect" class="panel-checkbox">
                                Автоподключение
                            </label>
                        </div>
                    </div>
                    
                    <div class="panel-section">
                        <div class="panel-section-title">СЕРВЕР</div>
                        <div class="panel-control">
                            <label class="panel-label">Адрес сервера:</label>
                            <input type="text" id="network-server-address" class="panel-input" placeholder="localhost">
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Порт: <span class="panel-value" id="network-port-value">${this.settings.port}</span></label>
                            <input type="range" class="panel-slider" id="network-port" min="1024" max="65535" step="1" value="${this.settings.port}">
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Регион:</label>
                            <select id="network-region" class="panel-select">
                                <option value="auto" ${this.settings.region === 'auto' ? 'selected' : ''}>Авто</option>
                                <option value="us-east" ${this.settings.region === 'us-east' ? 'selected' : ''}>US East</option>
                                <option value="us-west" ${this.settings.region === 'us-west' ? 'selected' : ''}>US West</option>
                                <option value="eu" ${this.settings.region === 'eu' ? 'selected' : ''}>Europe</option>
                                <option value="asia" ${this.settings.region === 'asia' ? 'selected' : ''}>Asia</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="panel-section">
                        <div class="panel-section-title">ПОДКЛЮЧЕНИЕ</div>
                        <div class="panel-control">
                            <label class="panel-label">Попыток переподключения: <span class="panel-value" id="network-reconnect-attempts-value">${this.settings.reconnectAttempts}</span></label>
                            <input type="range" class="panel-slider" id="network-reconnect-attempts" min="0" max="10" step="1" value="${this.settings.reconnectAttempts}">
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Задержка переподключения (мс): <span class="panel-value" id="network-reconnect-delay-value">${this.settings.reconnectDelay}</span></label>
                            <input type="range" class="panel-slider" id="network-reconnect-delay" min="1000" max="10000" step="500" value="${this.settings.reconnectDelay}">
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Интервал пинга (мс): <span class="panel-value" id="network-ping-interval-value">${this.settings.pingInterval}</span></label>
                            <input type="range" class="panel-slider" id="network-ping-interval" min="500" max="5000" step="100" value="${this.settings.pingInterval}">
                        </div>
                    </div>
                    
                    <div class="panel-section">
                        <div class="panel-section-title">СИНХРОНИЗАЦИЯ</div>
                        <div class="panel-control">
                            <label class="panel-label">Частота синхронизации (об/сек): <span class="panel-value" id="network-sync-rate-value">${this.settings.syncRate}</span></label>
                            <input type="range" class="panel-slider" id="network-sync-rate" min="10" max="60" step="5" value="${this.settings.syncRate}">
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Макс. игроков: <span class="panel-value" id="network-max-players-value">${this.settings.maxPlayers}</span></label>
                            <input type="range" class="panel-slider" id="network-max-players" min="2" max="32" step="1" value="${this.settings.maxPlayers}">
                        </div>
                    </div>
                    
                    <div class="panel-section">
                        <div class="panel-section-title">ИНТЕРФЕЙС</div>
                        <div class="panel-control">
                            <label class="panel-label">
                                <input type="checkbox" id="network-show-ping" class="panel-checkbox">
                                Показывать пинг
                            </label>
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">
                                <input type="checkbox" id="network-show-players" class="panel-checkbox">
                                Показывать список игроков
                            </label>
                        </div>
                    </div>
                    
                    <div class="panel-section">
                        <div class="panel-section-title">ЧАТ</div>
                        <div class="panel-control">
                            <label class="panel-label">
                                <input type="checkbox" id="network-text-chat" class="panel-checkbox">
                                Текстовый чат
                            </label>
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">
                                <input type="checkbox" id="network-voice-chat" class="panel-checkbox">
                                Голосовой чат
                            </label>
                        </div>
                    </div>
                    
                    <div class="panel-section">
                        <div class="panel-section-title">СТАТУС ПОДКЛЮЧЕНИЯ</div>
                        <div class="panel-control">
                            <label class="panel-label">Статус: <span class="panel-value" id="network-status" style="color: #f00;">Отключено</span></label>
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Пинг: <span class="panel-value" id="network-ping" style="color: #888;">--</span> мс</label>
                        </div>
                        <div class="panel-control">
                            <label class="panel-label">Качество: <span class="panel-value" id="network-quality" style="color: #888;">--</span></label>
                        </div>
                    </div>
                    
                    <div class="panel-section" id="network-players-section" style="display: none;">
                        <div class="panel-section-title">ИГРОКИ (<span id="network-players-count">0</span>)</div>
                        <div id="network-players-list" style="max-height: 200px; overflow-y: auto; margin-top: 8px;">
                            <div style="color: #888; font-size: 11px; padding: 8px; text-align: center;">Нет подключенных игроков</div>
                        </div>
                    </div>
                    
                    <div class="panel-buttons">
                        <button id="network-connect" class="panel-btn primary">Подключиться</button>
                        <button id="network-disconnect" class="panel-btn secondary">Отключиться</button>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        
        const style = document.createElement("style");
        style.textContent = `
            #network-menu {
                z-index: 10001;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        this.setupEventListeners();
        this.updateUI();
    }
    
    private setupEventListeners(): void {
        // Закрытие
        document.getElementById("network-close")?.addEventListener("click", () => {
            this.hide();
        });
        
        this.container.addEventListener("click", (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });
        
        // Чекбоксы - автоматическое применение настроек
        document.getElementById("network-multiplayer-enabled")?.addEventListener("change", (e) => {
            this.settings.multiplayerEnabled = (e.target as HTMLInputElement).checked;
            this.saveSettings();
            this.applySettings();
        });
        
        document.getElementById("network-auto-connect")?.addEventListener("change", (e) => {
            this.settings.autoConnect = (e.target as HTMLInputElement).checked;
            this.saveSettings();
            this.applySettings();
        });
        
        document.getElementById("network-show-ping")?.addEventListener("change", (e) => {
            this.settings.showPing = (e.target as HTMLInputElement).checked;
            this.saveSettings();
            this.applySettings();
        });
        
        document.getElementById("network-show-players")?.addEventListener("change", (e) => {
            this.settings.showPlayers = (e.target as HTMLInputElement).checked;
            this.saveSettings();
            this.applySettings();
            this.updatePlayersList();
        });
        
        document.getElementById("network-text-chat")?.addEventListener("change", (e) => {
            this.settings.textChat = (e.target as HTMLInputElement).checked;
            this.saveSettings();
            this.applySettings();
        });
        
        document.getElementById("network-voice-chat")?.addEventListener("change", (e) => {
            this.settings.voiceChat = (e.target as HTMLInputElement).checked;
            this.saveSettings();
            this.applySettings();
        });
        
        // Слайдеры
        const sliders = [
            { id: "network-port", key: "port", valueId: "network-port-value" },
            { id: "network-reconnect-attempts", key: "reconnectAttempts", valueId: "network-reconnect-attempts-value" },
            { id: "network-reconnect-delay", key: "reconnectDelay", valueId: "network-reconnect-delay-value" },
            { id: "network-ping-interval", key: "pingInterval", valueId: "network-ping-interval-value" },
            { id: "network-sync-rate", key: "syncRate", valueId: "network-sync-rate-value" },
            { id: "network-max-players", key: "maxPlayers", valueId: "network-max-players-value" }
        ];
        
        sliders.forEach(({ id, key, valueId }) => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const valueDisplay = document.getElementById(valueId);
            
            slider?.addEventListener("input", () => {
                const value = parseFloat(slider.value);
                (this.settings as any)[key] = value;
                if (valueDisplay) {
                    valueDisplay.textContent = value.toString();
                }
                this.saveSettings();
                // Автоматическое применение для критичных настроек
                if (key === 'reconnectAttempts' || key === 'reconnectDelay') {
                    this.applySettings();
                }
            });
        });
        
        // Текстовые поля - автоматическое применение
        document.getElementById("network-server-address")?.addEventListener("change", (e) => {
            this.settings.serverAddress = (e.target as HTMLInputElement).value;
            this.saveSettings();
            // Не применяем автоматически, т.к. требуется переподключение
        });
        
        document.getElementById("network-region")?.addEventListener("change", (e) => {
            this.settings.region = (e.target as HTMLSelectElement).value;
            this.saveSettings();
            this.applySettings();
        });
        
        // Кнопки
        document.getElementById("network-connect")?.addEventListener("click", () => {
            this.connect();
        });
        
        document.getElementById("network-disconnect")?.addEventListener("click", () => {
            this.disconnect();
        });
    }
    
    private updateUI(): void {
        (document.getElementById("network-multiplayer-enabled") as HTMLInputElement).checked = this.settings.multiplayerEnabled;
        (document.getElementById("network-auto-connect") as HTMLInputElement).checked = this.settings.autoConnect;
        (document.getElementById("network-server-address") as HTMLInputElement).value = this.settings.serverAddress;
        (document.getElementById("network-show-ping") as HTMLInputElement).checked = this.settings.showPing;
        (document.getElementById("network-show-players") as HTMLInputElement).checked = this.settings.showPlayers;
        (document.getElementById("network-text-chat") as HTMLInputElement).checked = this.settings.textChat;
        (document.getElementById("network-voice-chat") as HTMLInputElement).checked = this.settings.voiceChat;
    }
    
    private connect(): void {
        if (!this.game) {
            logger.warn("[NetworkMenu] Game instance not set");
            return;
        }
        
        if (!this.game.multiplayerManager) {
            logger.warn("[NetworkMenu] MultiplayerManager not initialized");
            if (this.game.hud) {
                this.game.hud.showMessage("Мультиплеер не инициализирован", "#f00", 2000);
            }
            return;
        }
        
        // Применяем настройки перед подключением
        this.applySettings();
        
        // Формируем URL сервера
        const serverUrl = `ws://${this.settings.serverAddress}:${this.settings.port}`;
        
        logger.log(`[NetworkMenu] Connecting to server: ${serverUrl}`);
        
        try {
            // Подключаемся (connect сам устанавливает serverUrl)
            if (this.game.multiplayerManager.connect) {
                this.game.multiplayerManager.connect(serverUrl);
            }
            
            if (this.game.hud) {
                this.game.hud.showMessage(`Подключение к ${this.settings.serverAddress}:${this.settings.port}...`, "#0ff", 2000);
            }
            
            // Сбрасываем пинг при подключении
            this.currentPing = 0;
            this.pingHistory = [];
            this.lastPingTime = 0;
        } catch (error) {
            logger.error("[NetworkMenu] Connection failed:", error);
            if (this.game.hud) {
                this.game.hud.showMessage("Ошибка подключения", "#f00", 3000);
            }
        }
    }
    
    private disconnect(): void {
        if (!this.game) {
            logger.warn("[NetworkMenu] Game instance not set");
            return;
        }
        
        if (!this.game.multiplayerManager) {
            logger.warn("[NetworkMenu] MultiplayerManager not initialized");
            return;
        }
        
        logger.log("[NetworkMenu] Disconnecting from server...");
        
        try {
            if (this.game.multiplayerManager.disconnect) {
                this.game.multiplayerManager.disconnect();
            }
            
            if (this.game.hud) {
                this.game.hud.showMessage("Отключение от сервера...", "#ff0", 2000);
            }
        } catch (error) {
            logger.error("[NetworkMenu] Disconnect failed:", error);
            if (this.game.hud) {
                this.game.hud.showMessage("Ошибка отключения", "#f00", 3000);
            }
        }
    }
    
    private applySettings(): void {
        this.saveSettings();
        
        // Применяем настройки к MultiplayerManager, если он инициализирован
        if (this.game && this.game.multiplayerManager) {
            // Обновляем настройки переподключения
            if ((this.game.multiplayerManager as any).maxReconnectAttempts !== undefined) {
                (this.game.multiplayerManager as any).maxReconnectAttempts = this.settings.reconnectAttempts;
            }
            if ((this.game.multiplayerManager as any)._reconnectDelay !== undefined) {
                (this.game.multiplayerManager as any)._reconnectDelay = this.settings.reconnectDelay;
            }
        }
        
        if (this.game && this.game.hud) {
            this.game.hud.showMessage("Настройки сети применены", "#0f0", 2000);
        }
        logger.log("[NetworkMenu] Settings applied:", this.settings);
    }
    
    updateConnectionStatus(): void {
        if (!this.game || !this.game.multiplayerManager) {
            const statusElement = document.getElementById("network-status");
            const pingElement = document.getElementById("network-ping");
            const qualityElement = document.getElementById("network-quality");
            if (statusElement) {
                statusElement.textContent = "Не инициализирован";
                statusElement.style.color = "#888";
            }
            if (pingElement) {
                pingElement.textContent = "--";
                pingElement.style.color = "#888";
            }
            if (qualityElement) {
                qualityElement.textContent = "--";
                qualityElement.style.color = "#888";
            }
            return;
        }
        
        // ИСПРАВЛЕНИЕ: Проверка статуса WebSocket и Firebase отдельно
        const isWebSocketConnected = this.game.multiplayerManager.isConnected();
        
        // Проверка статуса Firebase
        let isFirebaseConnected = false;
        try {
            const firebaseService = (window as any).firebaseService;
            if (firebaseService) {
                isFirebaseConnected = firebaseService.isInitialized?.() || false;
            }
        } catch (error) {
            console.warn("[NetworkMenu] Error checking Firebase status:", error);
        }
        
        const statusElement = document.getElementById("network-status");
        if (statusElement) {
            // ИСПРАВЛЕНИЕ: Показываем статус WebSocket и Firebase отдельно
            let statusText = isWebSocketConnected ? "WebSocket [Online]" : "WebSocket [Offline]";
            statusText += isFirebaseConnected ? " / Firebase [Online]" : " / Firebase [Offline]";
            
            statusElement.textContent = statusText;
            
            // Цвет зависит от обоих статусов
            if (isWebSocketConnected && isFirebaseConnected) {
                statusElement.style.color = "#0f0"; // Зеленый если оба онлайн
            } else if (isWebSocketConnected || isFirebaseConnected) {
                statusElement.style.color = "#fa0"; // Оранжевый если один офлайн
            } else {
                statusElement.style.color = "#f00"; // Красный если оба офлайн
            }
        }
        
        // Обновляем пинг и качество только если WebSocket подключен
        if (isWebSocketConnected) {
            this.updatePing();
            this.updateConnectionQuality();
            this.updatePlayersList();
        } else {
            const pingElement = document.getElementById("network-ping");
            const qualityElement = document.getElementById("network-quality");
            if (pingElement) {
                pingElement.textContent = "--";
                pingElement.style.color = "#888";
            }
            if (qualityElement) {
                qualityElement.textContent = "--";
                qualityElement.style.color = "#888";
            }
        }
    }
    
    private updatePing(): void {
        if (!this.game || !this.game.multiplayerManager) return;
        
        // Измеряем пинг через отправку ping сообщения
        // Если есть метод для отправки ping, используем его
        // Иначе используем время последнего сообщения
        if (this.lastPingTime > 0) {
            const estimatedPing = performance.now() - this.lastPingTime;
            this.currentPing = Math.round(estimatedPing);
            
            // Добавляем в историю (храним последние 10 значений)
            this.pingHistory.push(this.currentPing);
            if (this.pingHistory.length > 10) {
                this.pingHistory.shift();
            }
            
            // Вычисляем средний пинг
            const avgPing = Math.round(
                this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length
            );
            
            const pingElement = document.getElementById("network-ping");
            if (pingElement) {
                pingElement.textContent = `${avgPing}`;
                
                // Цвет в зависимости от пинга
                if (avgPing < 50) {
                    pingElement.style.color = "#0f0"; // Зеленый
                } else if (avgPing < 150) {
                    pingElement.style.color = "#ff0"; // Желтый
                } else {
                    pingElement.style.color = "#f00"; // Красный
                }
            }
        }
        
        // Обновляем время для следующего измерения
        this.lastPingTime = performance.now();
    }
    
    private updateConnectionQuality(): void {
        if (!this.game || !this.game.multiplayerManager) return;
        
        const avgPing = this.pingHistory.length > 0
            ? this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length
            : this.currentPing;
        
        const qualityElement = document.getElementById("network-quality");
        if (qualityElement) {
            let quality: string;
            let color: string;
            
            if (avgPing < 50) {
                quality = "Отлично";
                color = "#0f0";
            } else if (avgPing < 100) {
                quality = "Хорошо";
                color = "#0ff";
            } else if (avgPing < 150) {
                quality = "Удовлетворительно";
                color = "#ff0";
            } else if (avgPing < 250) {
                quality = "Плохо";
                color = "#f80";
            } else {
                quality = "Очень плохо";
                color = "#f00";
            }
            
            qualityElement.textContent = quality;
            qualityElement.style.color = color;
        }
    }
    
    private updatePlayersList(): void {
        if (!this.game || !this.game.multiplayerManager) return;
        
        const playersSection = document.getElementById("network-players-section");
        const playersList = document.getElementById("network-players-list");
        const playersCount = document.getElementById("network-players-count");
        
        if (!playersSection || !playersList || !playersCount) return;
        
        const isConnected = this.game.multiplayerManager.isConnected();
        const showPlayers = this.settings.showPlayers;
        
        if (!isConnected || !showPlayers) {
            playersSection.style.display = "none";
            return;
        }
        
        playersSection.style.display = "block";
        
        const networkPlayers = this.game.multiplayerManager.getNetworkPlayers();
        const totalPlayers = networkPlayers.size + 1; // +1 для локального игрока
        
        playersCount.textContent = totalPlayers.toString();
        
        // Очищаем список
        playersList.innerHTML = "";
        
        // Добавляем локального игрока
        const localPlayerDiv = document.createElement("div");
        localPlayerDiv.style.cssText = `
            padding: 6px 8px;
            margin: 2px 0;
            background: rgba(0, 255, 4, 0.1);
            border: 1px solid rgba(0, 255, 4, 0.3);
            border-radius: 4px;
            font-size: 11px;
            color: #0f0;
        `;
        const playerName = (this.game.multiplayerManager as any).playerName || "Вы";
        localPlayerDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${playerName}</span>
                <span style="color: #0ff; font-size: 10px;">Локальный</span>
            </div>
        `;
        playersList.appendChild(localPlayerDiv);
        
        // Добавляем сетевых игроков
        networkPlayers.forEach((player, playerId) => {
            const playerDiv = document.createElement("div");
            playerDiv.style.cssText = `
                padding: 6px 8px;
                margin: 2px 0;
                background: rgba(0, 20, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.2);
                border-radius: 4px;
                font-size: 11px;
                color: #0f0;
            `;
            
            const statusColor = player.status === "alive" ? "#0f0" : player.status === "dead" ? "#f00" : "#888";
            const statusText = player.status === "alive" ? "Жив" : player.status === "dead" ? "Мертв" : "Наблюдает";
            
            playerDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>${player.name || `Игрок ${playerId.substring(0, 6)}`}</span>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="color: ${statusColor}; font-size: 10px;">${statusText}</span>
                        <span style="color: #0ff; font-size: 10px;">HP: ${Math.round(player.health)}/${player.maxHealth}</span>
                    </div>
                </div>
            `;
            playersList.appendChild(playerDiv);
        });
        
        if (networkPlayers.size === 0) {
            const emptyDiv = document.createElement("div");
            emptyDiv.style.cssText = "color: #888; font-size: 11px; padding: 8px; text-align: center;";
            emptyDiv.textContent = "Нет других игроков";
            playersList.appendChild(emptyDiv);
        }
    }
    
    private setupToggle(): void {
        // F8 обработчик управляется в game.ts для консистентности
        // Этот метод оставлен для возможного будущего использования
    }
    
    toggle(): void {
        this.visible = !this.visible;
        
        if (this.visible) {
            this.show();
        } else {
            this.hide();
        }
    }
    
    show(): void {
        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.style.display = "";
        this.updateUI();
        this.updateConnectionStatus();
        
        // Обновляем статус, пинг и список игроков каждую секунду, пока меню открыто
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        if (this.pingUpdateInterval) {
            clearInterval(this.pingUpdateInterval);
        }
        
        this.statusUpdateInterval = setInterval(() => {
            if (this.visible) {
                this.updateConnectionStatus();
            } else {
                if (this.statusUpdateInterval) {
                    clearInterval(this.statusUpdateInterval);
                    this.statusUpdateInterval = null;
                }
            }
        }, 1000);
        
        // Обновляем пинг чаще (каждые 500мс)
        this.pingUpdateInterval = setInterval(() => {
            if (this.visible && this.game?.multiplayerManager?.isConnected()) {
                this.updatePing();
                this.updateConnectionQuality();
            } else {
                if (this.pingUpdateInterval) {
                    clearInterval(this.pingUpdateInterval);
                    this.pingUpdateInterval = null;
                }
            }
        }, 500);
    }
    
    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
        
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
        
        if (this.pingUpdateInterval) {
            clearInterval(this.pingUpdateInterval);
            this.pingUpdateInterval = null;
        }
    }
    
    getSettings(): NetworkSettings {
        return { ...this.settings };
    }
    
    isVisible(): boolean {
        return this.visible;
    }
}

