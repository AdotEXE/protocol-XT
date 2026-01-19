/**
 * Social Menu - UI для системы друзей и кланов
 * Открывается через горячую клавишу или из главного меню
 */

import { socialSystem, Friend, FriendRequest, Clan } from "./socialSystem";
import { CommonStyles } from "./commonStyles";
import { escapeHTML } from "./utils/stringUtils";

export class SocialMenu {
    private container: HTMLDivElement | null = null;
    private _isOpen: boolean = false;
    private currentTab: "friends" | "clans" = "friends";
    private friendsList: Friend[] = [];
    private friendRequests: FriendRequest[] = [];
    private currentClan: Clan | null = null;

    constructor() {
        // Инициализация будет вызвана при первом открытии
    }

    /**
     * Открыть меню социальных функций
     */
    async open(): Promise<void> {
        if (this._isOpen) return;

        // Инициализируем систему, если еще не инициализирована
        await socialSystem.initialize();

        this._isOpen = true;
        this.createUI();

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';

        // Добавляем класс "in-battle" если игра запущена (для полупрозрачного фона)
        if (this.container) {
            const game = (window as any).gameInstance;
            if (game && game.gameStarted) {
                this.container.classList.add("in-battle");
            } else {
                this.container.classList.remove("in-battle");
            }
        }

        await this.refreshData();
    }

    /**
     * Закрыть меню
     */
    close(): void {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        // Восстанавливаем курсор только если игра активна
        const game = (window as any).gameInstance;
        if (game?.gameStarted && !game.gamePaused) {
            document.body.style.cursor = 'none';
        }
    }

    /**
     * Переключить меню (открыть/закрыть)
     */
    async toggle(): Promise<void> {

        if (this._isOpen) {
            this.close();
        } else {
            await this.open();
        }
    }

    /**
     * Создать UI
     */
    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();


        this.container = document.createElement("div");
        this.container.className = "panel-overlay";

        this.container.innerHTML = `
            <div class="panel" style="width: min(90vw, 800px); max-height: min(85vh, 700px);">
                <div class="panel-header">
                    <div class="panel-title">СОЦИАЛЬНЫЕ ФУНКЦИИ [Ctrl+0]</div>
                    <button class="panel-close" id="social-close">×</button>
                </div>
                <div class="social-menu-tabs">
                    <div class="social-tab ${this.currentTab === 'friends' ? 'active' : ''}" data-tab="friends">
                        [1] ДРУЗЬЯ
                    </div>
                    <div class="social-tab ${this.currentTab === 'clans' ? 'active' : ''}" data-tab="clans">
                        [2] КЛАНЫ
                    </div>
                </div>
                <div class="panel-content" id="social-content">
                    <!-- Контент будет загружен динамически -->
                </div>
                <div class="social-menu-footer">
                    [1-2] Вкладки | [Enter] Действие | [ESC] Закрыть
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
        this.injectStyles();
        this.setupEventListeners();
    }

    /**
     * Инъектировать стили
     */
    private injectStyles(): void {
        if (document.getElementById("social-menu-styles")) return;

        const style = document.createElement("style");
        style.id = "social-menu-styles";
        style.textContent = `
            .social-menu-tabs {
                height: 40px;
                background: rgba(0, 20, 0, 0.8);
                display: flex;
                border-bottom: 1px solid #080;
            }
            .social-tab {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #080;
                cursor: pointer;
                border-right: 1px solid #080;
            }
            .social-tab.active {
                background: rgba(0, 50, 0, 0.9);
                color: #0f0;
            }
            .social-tab:hover {
                background: rgba(0, 40, 0, 0.8);
                color: #0f0;
            }
            .social-menu-footer {
                height: 30px;
                background: rgba(0, 20, 0, 0.8);
                border-top: 1px solid #080;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #080;
                font-size: 12px;
            }
            .friend-item, .clan-item {
                background: rgba(0, 30, 0, 0.5);
                border: 1px solid #080;
                padding: 15px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .friend-info, .clan-info {
                flex: 1;
            }
            .friend-name, .clan-name {
                color: #0f0;
                font-weight: bold;
                font-size: 16px;
                margin-bottom: 5px;
            }
            .friend-status {
                color: #080;
                font-size: 12px;
            }
            .friend-status.online {
                color: #0f0;
            }
            .friend-status.in_game {
                color: #ff0;
            }
            .friend-actions, .clan-actions {
                display: flex;
                gap: 10px;
            }
            .social-btn {
                padding: 8px 15px;
                background: rgba(0, 50, 0, 0.8);
                border: 1px solid #0f0;
                color: #0f0;
                cursor: pointer;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .social-btn:hover {
                background: rgba(0, 70, 0, 0.9);
            }
            .social-btn.danger {
                border-color: #f00;
                color: #f00;
            }
            .social-btn.danger:hover {
                background: rgba(50, 0, 0, 0.8);
            }
            .request-item {
                background: rgba(30, 30, 0, 0.5);
                border: 1px solid #ff0;
                padding: 15px;
                margin-bottom: 10px;
            }
            .request-from {
                color: #ff0;
                font-weight: bold;
                margin-bottom: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Настроить обработчики событий
     */
    private setupEventListeners(): void {
        if (!this.container) return;

        // Кнопка закрытия
        this.container.querySelector("#social-close")?.addEventListener("click", () => {
            this.close();
        });

        // Переключение вкладок
        this.container.querySelectorAll(".social-tab").forEach(tab => {
            tab.addEventListener("click", (e) => {
                const tabName = (e.target as HTMLElement).getAttribute("data-tab");
                if (tabName === "friends" || tabName === "clans") {
                    this.currentTab = tabName;
                    this.refreshData();
                }
            });
        });

        // ESC для закрытия
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.code === "Escape" && this._isOpen) {
                e.preventDefault();
                this.close();
                window.removeEventListener("keydown", escapeHandler);
            }
        };
        window.addEventListener("keydown", escapeHandler);

        // 1-2 для переключения вкладок
        const tabHandler = (e: KeyboardEvent) => {
            if (!this._isOpen) return;
            if (e.code === "Digit1" || e.code === "Numpad1") {
                e.preventDefault();
                this.currentTab = "friends";
                this.refreshData();
            } else if (e.code === "Digit2" || e.code === "Numpad2") {
                e.preventDefault();
                this.currentTab = "clans";
                this.refreshData();
            }
        };
        window.addEventListener("keydown", tabHandler);
    }

    /**
     * Обновить данные и отобразить контент
     */
    private async refreshData(): Promise<void> {
        if (!this.container) return;

        const contentEl = this.container.querySelector("#social-content");
        if (!contentEl) return;

        if (this.currentTab === "friends") {
            await this.loadFriendsContent(contentEl as HTMLElement);
        } else {
            await this.loadClansContent(contentEl as HTMLElement);
        }

        // Обновить активную вкладку
        this.container.querySelectorAll(".social-tab").forEach(tab => {
            const tabName = tab.getAttribute("data-tab");
            if (tabName === this.currentTab) {
                tab.classList.add("active");
            } else {
                tab.classList.remove("active");
            }
        });
    }

    /**
     * Загрузить контент вкладки "Друзья"
     */
    private async loadFriendsContent(container: HTMLElement): Promise<void> {
        this.friendsList = await socialSystem.getFriends();
        this.friendRequests = await socialSystem.getFriendRequests();

        // Обновить счетчик онлайн друзей
        this.updateOnlineCount();

        let html = `<div style="margin-bottom: 20px;">
            <h3 style="color: #0f0; margin-bottom: 10px;">Заявки в друзья (${this.friendRequests.length})</h3>`;

        if (this.friendRequests.length === 0) {
            html += `<div style="color: #080; padding: 10px;">Нет новых заявок</div>`;
        } else {
            this.friendRequests.forEach((request, index) => {
                html += `
                    <div class="request-item">
                        <div class="request-from">${escapeHTML(request.fromPlayerName)}</div>
                        <div class="friend-actions">
                            <button class="social-btn" data-action="accept-request" data-index="${index}">Принять</button>
                            <button class="social-btn danger" data-action="reject-request" data-index="${index}">Отклонить</button>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>
            <div>
                <h3 style="color: #0f0; margin-bottom: 10px;">Друзья (${this.friendsList.length})</h3>`;

        if (this.friendsList.length === 0) {
            html += `<div style="color: #080; padding: 10px;">У вас пока нет друзей</div>`;
        } else {
            this.friendsList.forEach(friend => {
                const statusClass = friend.status === "online" ? "online" : friend.status === "in_game" ? "in_game" : "";
                const lastSeen = friend.lastSeen ? this.formatLastSeen(friend.lastSeen) : "Неизвестно";
                html += `
                    <div class="friend-item">
                        <div class="friend-info">
                            <div class="friend-name">${escapeHTML(friend.playerName)}</div>
                            <div class="friend-status ${statusClass}">${this.getStatusText(friend.status)}</div>
                            <div class="friend-stats">Последний раз: ${lastSeen}</div>
                        </div>
                        <div class="friend-actions">
                            <button class="social-btn" data-action="message-friend" data-id="${escapeHTML(friend.playerId)}" data-name="${escapeHTML(friend.playerName)}" ${friend.status === 'offline' ? 'disabled' : ''}>💬 Сообщение</button>
                            <button class="social-btn" data-action="invite-friend" data-id="${escapeHTML(friend.playerId)}" data-name="${escapeHTML(friend.playerName)}" ${friend.status === 'offline' ? 'disabled' : ''}>🎮 Пригласить</button>
                            <button class="social-btn danger" data-action="remove-friend" data-id="${escapeHTML(friend.playerId)}">Удалить</button>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;

        container.innerHTML = html;

        // Добавить обработчики для кнопок
        container.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const action = (e.target as HTMLElement).getAttribute("data-action");
                if (action === "accept-request") {
                    const index = parseInt((e.target as HTMLElement).getAttribute("data-index") || "0");
                    await this.acceptFriendRequest(index);
                } else if (action === "reject-request") {
                    const index = parseInt((e.target as HTMLElement).getAttribute("data-index") || "0");
                    await this.rejectFriendRequest(index);
                } else if (action === "remove-friend") {
                    const friendId = (e.target as HTMLElement).getAttribute("data-id") || "";
                    await this.removeFriend(friendId);
                } else if (action === "message-friend") {
                    const friendId = (e.target as HTMLElement).getAttribute("data-id") || "";
                    const friendName = (e.target as HTMLElement).getAttribute("data-name") || "";
                    this.showMessageDialog(friendId, friendName);
                } else if (action === "invite-friend") {
                    const friendId = (e.target as HTMLElement).getAttribute("data-id") || "";
                    const friendName = (e.target as HTMLElement).getAttribute("data-name") || "";
                    await this.inviteFriendToGame(friendId, friendName);
                }
            });
        });

        // Кнопка добавления друга
        container.querySelector("#add-friend-btn")?.addEventListener("click", () => {
            this.showAddFriendDialog();
        });
    }

    /**
     * Загрузить контент вкладки "Кланы"
     */
    private async loadClansContent(container: HTMLElement): Promise<void> {
        this.currentClan = await socialSystem.getPlayerClan();

        let html = "";

        if (this.currentClan) {
            // Показываем информацию о текущем клане
            html += `
                <div class="clan-item">
                    <div class="clan-info">
                        <div class="clan-name">${escapeHTML(this.currentClan.name)} [${escapeHTML(this.currentClan.tag)}]</div>
                        <div style="color: #080; font-size: 12px; margin-top: 5px;">
                            Участников: ${this.currentClan.memberCount}/${this.currentClan.maxMembers}<br>
                            Лидер: ${escapeHTML(this.currentClan.leaderName)}
                        </div>
                    </div>
                    <div class="clan-actions">
                        <button class="social-btn danger" data-action="leave-clan">Покинуть клан</button>
                    </div>
                </div>
                <h3 style="color: #0f0; margin-top: 20px; margin-bottom: 10px;">Участники</h3>
                <div style="max-height: 300px; overflow-y: auto;">
            `;

            this.currentClan.members.forEach(member => {
                html += `
                    <div class="friend-item">
                        <div class="friend-info">
                            <div class="friend-name">${escapeHTML(member.playerName)} <span style="color: #080;">(${escapeHTML(member.role)})</span></div>
                            <div style="color: #080; font-size: 12px;">Вклад: ${member.contribution}</div>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        } else {
            // Показываем поиск и создание клана
            html += `
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #0f0; margin-bottom: 10px;">Вы не состоите в клане</h3>
                    <div class="friend-actions" style="margin-top: 15px;">
                        <button class="social-btn" id="create-clan-btn">Создать клан</button>
                        <button class="social-btn" id="search-clan-btn">Поиск кланов</button>
                    </div>
                </div>
                <div id="clan-search-results" style="display: none;">
                    <!-- Результаты поиска будут здесь -->
                </div>
            `;
        }

        container.innerHTML = html;

        // Обработчики для кнопок
        container.querySelector("[data-action='leave-clan']")?.addEventListener("click", async () => {
            await this.leaveClan();
        });

        container.querySelector("#create-clan-btn")?.addEventListener("click", () => {
            this.showCreateClanDialog();
        });

        container.querySelector("#search-clan-btn")?.addEventListener("click", async () => {
            await this.showClanSearch();
        });
    }

    /**
     * Проверить, открыто ли меню
     */
    isOpen(): boolean {
        return this._isOpen;
    }

    /**
     * Получить текстовое описание статуса
     */
    private getStatusText(status: string): string {
        switch (status) {
            case "online": return "В сети";
            case "in_game": return "В игре";
            case "offline": return "Не в сети";
            default: return "Неизвестно";
        }
    }

    /**
     * Обновить счетчик онлайн друзей
     */
    private updateOnlineCount(): void {
        if (!this.container) return;

        const onlineCount = this.friendsList.filter(f => f.status === "online" || f.status === "in_game").length;
        const countEl = this.container.querySelector("#online-count");
        if (countEl) {
            countEl.textContent = onlineCount.toString();
        }
    }

    /**
     * Форматировать время последнего визита
     */
    private formatLastSeen(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days} дн. назад`;
        } else if (hours > 0) {
            return `${hours} ч. назад`;
        } else if (minutes > 0) {
            return `${minutes} мин. назад`;
        } else {
            return "Только что";
        }
    }

    /**
     * Принять заявку в друзья
     */
    private async acceptFriendRequest(index: number): Promise<void> {
        const request = this.friendRequests[index];
        if (!request) return;

        const requestId = `${request.fromPlayerId}_${request.toPlayerId}`;
        const success = await socialSystem.acceptFriendRequest(requestId);
        if (success) {
            await this.refreshData();
        }
    }

    /**
     * Отклонить заявку в друзья
     */
    private async rejectFriendRequest(index: number): Promise<void> {
        const request = this.friendRequests[index];
        if (!request) return;

        const requestId = `${request.fromPlayerId}_${request.toPlayerId}`;
        const success = await socialSystem.rejectFriendRequest(requestId);
        if (success) {
            await this.refreshData();
        }
    }

    /**
     * Удалить друга
     */
    private async removeFriend(friendId: string): Promise<void> {
        if (!confirm("Вы уверены, что хотите удалить этого друга?")) return;

        const success = await socialSystem.removeFriend(friendId);
        if (success) {
            await this.refreshData();
        }
    }

    /**
     * Покинуть клан
     */
    private async leaveClan(): Promise<void> {
        if (!confirm("Вы уверены, что хотите покинуть клан?")) return;

        const success = await socialSystem.leaveClan();
        if (success) {
            await this.refreshData();
        }
    }

    /**
     * Показать диалог создания клана
     */
    private showCreateClanDialog(): void {
        const name = prompt("Название клана:");
        if (!name) return;

        const tag = prompt("Тег клана (3-4 символа):");
        if (!tag) return;

        const description = prompt("Описание клана:") || "";

        socialSystem.createClan(name, tag, description).then(clanId => {
            if (clanId) {
                alert(`Клан "${name}" успешно создан!`);
                this.refreshData();
            } else {
                alert("Ошибка при создании клана");
            }
        });
    }

    /**
     * Показать диалог отправки сообщения другу (без prompt - используем встроенный UI)
     */
    private showMessageDialog(friendId: string, friendName: string): void {
        // Используем тот же метод из MainMenu для единообразия
        const game = (window as any).gameInstance;
        if (game?.mainMenu) {
            game.mainMenu.showMessageDialog(friendId, friendName);
            return;
        }

        // Fallback: создаем простое модальное окно
        const modal = document.createElement("div");
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(0, 30, 0, 0.95) 0%, rgba(0, 20, 0, 0.95) 100%);
            border: 2px solid #0f0;
            border-radius: 8px;
            padding: 20px;
            z-index: 100010;
            min-width: 400px;
            max-width: 600px;
            font-family: 'Consolas', 'Monaco', monospace;
            box-shadow: 0 0 30px rgba(0, 255, 0, 0.5);
        `;

        modal.innerHTML = `
            <div style="margin-bottom: 15px;">
                <div style="font-size: 18px; color: #0f0; margin-bottom: 10px;">💬 Отправить сообщение ${escapeHTML(friendName)}</div>
                <textarea id="chat-message-input" placeholder="Введите сообщение..." style="
                    width: 100%;
                    min-height: 100px;
                    padding: 10px;
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid #0f0;
                    border-radius: 4px;
                    color: #0f0;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    resize: vertical;
                    outline: none;
                "></textarea>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="chat-send-btn" style="
                    padding: 10px 20px;
                    background: rgba(0, 255, 0, 0.2);
                    border: 1px solid #0f0;
                    color: #0f0;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 4px;
                ">Отправить</button>
                <button id="chat-cancel-btn" style="
                    padding: 10px 20px;
                    background: rgba(255, 0, 0, 0.2);
                    border: 1px solid #f00;
                    color: #f00;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 4px;
                ">Отмена</button>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector("#chat-message-input") as HTMLTextAreaElement;
        const sendBtn = modal.querySelector("#chat-send-btn") as HTMLButtonElement;
        const cancelBtn = modal.querySelector("#chat-cancel-btn") as HTMLButtonElement;

        if (input) input.focus();

        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    sendBtn?.click();
                }
            });
        }

        if (sendBtn) {
            sendBtn.onclick = () => {
                const message = input?.value.trim() || "";
                if (message === "") {
                    modal.remove();
                    return;
                }

                // Интеграция с ChatSystem через gameInstance
                if (game?.chatSystem) {
                    game.chatSystem.addMessage(`📤 → ${friendName}: ${message}`, "info", 1);

                    // Если есть multiplayerManager, отправляем через сервер
                    if (game.multiplayerManager?.isConnected()) {
                        game.multiplayerManager.sendChatMessage(`[DM to ${friendName}] ${message}`);
                    }
                }

                this.showNotification(`Сообщение отправлено ${friendName}: "${message}"`);
                console.log(`[Social] Message to ${friendName} (${friendId}): ${message}`);
                modal.remove();
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.remove();
            };
        }

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                modal.remove();
                document.removeEventListener("keydown", escapeHandler);
            }
        };
        document.addEventListener("keydown", escapeHandler);
    }

    /**
     * Пригласить друга в игру
     */
    private async inviteFriendToGame(friendId: string, friendName: string): Promise<void> {
        const game = (window as any).gameInstance;
        const multiplayerManager = game?.multiplayerManager;

        if (multiplayerManager?.isConnected()) {
            // Отправляем приглашение через MultiplayerManager
            multiplayerManager.sendGameInvite(friendId);

            // Добавляем сообщение в чат
            if (game.chatSystem) {
                game.chatSystem.addMessage(`🎮 Приглашение отправлено ${friendName}`, "success", 1);
            }

            this.showNotification(`Приглашение отправлено ${friendName}`);
        } else {
            // Офлайн режим - показываем уведомление что нужно подключиться
            this.showNotification(`Для приглашения необходимо подключиться к серверу`);
        }

        console.log(`[Social] Game invite sent to ${friendName} (${friendId})`);
    }

    /**
     * Показать уведомление
     */
    private showNotification(message: string): void {
        if (!this.container) return;

        const notification = document.createElement("div");
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 50, 0, 0.95);
            border: 2px solid #0f0;
            color: #0f0;
            padding: 20px 40px;
            z-index: 10002;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 16px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    /**
     * Показать диалог добавления друга
     */
    private async showAddFriendDialog(): Promise<void> {
        const playerNameOrId = prompt("Введите имя или ID игрока:");
        if (!playerNameOrId) return;

        // В реальной системе здесь нужно найти игрока по имени/ID
        // Пока что используем введенное значение как ID
        const success = await socialSystem.sendFriendRequest(playerNameOrId, playerNameOrId);
        if (success) {
            alert("Заявка в друзья отправлена!");
        } else {
            alert("Ошибка при отправке заявки. Проверьте имя/ID игрока.");
        }
    }

    /**
     * Показать поиск кланов
     */
    private async showClanSearch(): Promise<void> {
        const searchQuery = prompt("Введите название или тег клана для поиска:") || "";
        if (!searchQuery) return;

        const results = await socialSystem.searchClans(searchQuery, 10);
        const resultsEl = document.getElementById("clan-search-results");
        if (!resultsEl) return;

        resultsEl.style.display = "block";

        if (results.length === 0) {
            resultsEl.innerHTML = `<div style="color: #080; padding: 10px;">Кланы не найдены</div>`;
            return;
        }

        let html = `<h3 style="color: #0f0; margin-bottom: 10px;">Результаты поиска</h3>`;
        results.forEach(clan => {
            html += `
                <div class="clan-item">
                    <div class="clan-info">
                        <div class="clan-name">${clan.name} [${clan.tag}]</div>
                        <div style="color: #080; font-size: 12px; margin-top: 5px;">
                            ${clan.description}<br>
                            Участников: ${clan.memberCount}/${clan.maxMembers}
                        </div>
                    </div>
                    <div class="clan-actions">
                        <button class="social-btn" data-action="join-clan" data-id="${clan.id}">Вступить</button>
                    </div>
                </div>
            `;
        });

        resultsEl.innerHTML = html;

        // Обработчики для кнопок вступления
        resultsEl.querySelectorAll("[data-action='join-clan']").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const clanId = (e.target as HTMLElement).getAttribute("data-id") || "";
                const success = await socialSystem.joinClan(clanId);
                if (success) {
                    alert("Вы успешно вступили в клан!");
                    await this.refreshData();
                } else {
                    alert("Ошибка при вступлении в клан");
                }
            });
        });
    }
}

// Создаем единственный экземпляр
export const socialMenu = new SocialMenu();

