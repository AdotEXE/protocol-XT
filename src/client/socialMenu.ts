/**
 * Social Menu - UI для системы друзей и кланов
 * Открывается через горячую клавишу или из главного меню
 */

import { socialSystem, Friend, FriendRequest, Clan } from "./socialSystem";

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
        this.container = document.createElement("div");
        this.container.className = "social-menu-overlay";
        this.container.innerHTML = `
            <div class="social-menu-container">
                <div class="social-menu-header">
                    <div class="social-menu-title">СОЦИАЛЬНЫЕ ФУНКЦИИ</div>
                    <button class="social-menu-close" id="social-close">×</button>
                </div>
                <div class="social-menu-tabs">
                    <div class="social-tab ${this.currentTab === 'friends' ? 'active' : ''}" data-tab="friends">
                        [1] ДРУЗЬЯ
                    </div>
                    <div class="social-tab ${this.currentTab === 'clans' ? 'active' : ''}" data-tab="clans">
                        [2] КЛАНЫ
                    </div>
                </div>
                <div class="social-menu-content" id="social-content">
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
            .social-menu-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 10, 0, 0.95);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .social-menu-container {
                width: min(90vw, 800px);
                height: min(85vh, 700px);
                background: rgba(5, 15, 5, 0.98);
                border: 2px solid #0f0;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
            }
            .social-menu-header {
                height: 50px;
                background: rgba(0, 30, 0, 0.9);
                border-bottom: 2px solid #0f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 20px;
            }
            .social-menu-title {
                color: #0f0;
                font-size: 20px;
                font-weight: bold;
            }
            .social-menu-close {
                color: #f00;
                font-size: 24px;
                background: transparent;
                border: 1px solid #f00;
                padding: 5px 10px;
                cursor: pointer;
            }
            .social-menu-close:hover {
                background: rgba(255, 0, 0, 0.3);
            }
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
            .social-menu-content {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
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
                        <div class="request-from">${request.fromPlayerName}</div>
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
                            <div class="friend-name">${friend.playerName}</div>
                            <div class="friend-status ${statusClass}">${this.getStatusText(friend.status)}</div>
                            <div class="friend-stats">Последний раз: ${lastSeen}</div>
                        </div>
                        <div class="friend-actions">
                            <button class="social-btn" data-action="message-friend" data-id="${friend.playerId}" data-name="${friend.playerName}" ${friend.status === 'offline' ? 'disabled' : ''}>💬 Сообщение</button>
                            <button class="social-btn" data-action="invite-friend" data-id="${friend.playerId}" data-name="${friend.playerName}" ${friend.status === 'offline' ? 'disabled' : ''}>🎮 Пригласить</button>
                            <button class="social-btn danger" data-action="remove-friend" data-id="${friend.playerId}">Удалить</button>
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
                        <div class="clan-name">${this.currentClan.name} [${this.currentClan.tag}]</div>
                        <div style="color: #080; font-size: 12px; margin-top: 5px;">
                            Участников: ${this.currentClan.memberCount}/${this.currentClan.maxMembers}<br>
                            Лидер: ${this.currentClan.leaderName}
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
                            <div class="friend-name">${member.playerName} <span style="color: #080;">(${member.role})</span></div>
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
     * Показать диалог отправки сообщения другу
     */
    private showMessageDialog(friendId: string, friendName: string): void {
        const message = prompt(`Отправить сообщение ${friendName}:`);
        if (!message || message.trim() === "") return;
        
        // TODO: Интеграция с системой сообщений/чата
        // Пока что просто показываем уведомление
        this.showNotification(`Сообщение отправлено ${friendName}: "${message}"`);
        console.log(`[Social] Message to ${friendName} (${friendId}): ${message}`);
    }
    
    /**
     * Пригласить друга в игру
     */
    private async inviteFriendToGame(friendId: string, friendName: string): Promise<void> {
        // TODO: Интеграция с системой мультиплеера
        // Можно использовать multiplayerManager для отправки приглашения
        this.showNotification(`Приглашение отправлено ${friendName}`);
        console.log(`[Social] Game invite sent to ${friendName} (${friendId})`);
        
        // В реальной реализации здесь должна быть интеграция с multiplayerManager
        // Например: multiplayerManager.sendInvite(friendId, gameMode, roomId)
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

