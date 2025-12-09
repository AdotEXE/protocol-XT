// Enhanced Chat System - система логов и оповещений в стиле терминала
import { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, ScrollViewer } from "@babylonjs/gui";

export type MessageType = "system" | "info" | "warning" | "error" | "success" | "log" | "combat" | "economy";

export interface ChatMessage {
    text: string;
    type: MessageType;
    color: string;
    timestamp: number;
    icon: string;
    priority: number; // 0 = normal, 1 = important, 2 = critical
}

export class ChatSystem {
    private scene: Scene;
    private guiTexture: AdvancedDynamicTexture;
    private chatContainer: Rectangle | null = null;
    private messages: ChatMessage[] = [];
    private maxMessages = 50; // Увеличено количество сообщений
    private messageElements: Map<number, TextBlock> = new Map();
    private scrollViewer: ScrollViewer | null = null;
    private messagesArea: Rectangle | null = null;
    private lastMessageId = 0;
    
    // Настройки
    private autoScroll = true;
    private showTimestamps = true;
    private messageLifetime = 30000; // 30 секунд для обычных сообщений
    private importantMessageLifetime = 60000; // 60 секунд для важных
    
    // Звуковые уведомления
    private soundManager: any = null;
    
    // Фильтры сообщений
    private activeFilters: Set<MessageType> = new Set(["system", "info", "warning", "error", "success", "log", "combat", "economy"]);
    private filterButtons: Map<MessageType, Rectangle> = new Map();
    
    // Группировка сообщений
    private messageGroups: Map<string, { count: number, lastTime: number }> = new Map();
    private groupTimeout = 2000; // 2 секунды для группировки
    
    // Анимации
    private animationTime = 0;
    
    // Поиск
    private searchText: string = "";
    private searchActive = false;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ChatUI", false, scene);
        this.guiTexture.isForeground = true;
        this.createChatUI();
        this.startCleanupTimer();
    }
    
    setSoundManager(soundManager: any) {
        this.soundManager = soundManager;
    }
    
    private createChatUI(): void {
        // Контейнер чата (левый нижний угол)
        this.chatContainer = new Rectangle("chatContainer");
        this.chatContainer.width = "450px";
        this.chatContainer.height = "280px";
        this.chatContainer.cornerRadius = 0;
        this.chatContainer.thickness = 2;
        this.chatContainer.color = "#0f0";
        this.chatContainer.background = "#000000dd"; // Более непрозрачный
        this.chatContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.chatContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.chatContainer.left = "20px";
        this.chatContainer.top = "-20px";
        this.guiTexture.addControl(this.chatContainer);
        
        // Заголовок чата с индикатором
        const header = new Rectangle("chatHeader");
        header.width = 1;
        header.height = "30px";
        header.cornerRadius = 0;
        header.thickness = 0;
        header.background = "#000000aa";
        header.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.chatContainer.addControl(header);
        
        const headerText = new TextBlock("chatHeaderText");
        headerText.text = "> SYSTEM TERMINAL [ACTIVE]";
        headerText.color = "#0f0";
        headerText.fontSize = 13;
        headerText.fontFamily = "Courier New, monospace";
        headerText.fontWeight = "bold";
        headerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        headerText.left = "10px";
        header.addControl(headerText);
        
        // Счётчик сообщений
        const messageCountText = new TextBlock("messageCountText");
        messageCountText.text = "0 msgs";
        messageCountText.color = "#0a0";
        messageCountText.fontSize = 10;
        messageCountText.fontFamily = "Courier New, monospace";
        messageCountText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        messageCountText.left = "-15px";
        messageCountText.top = "15px";
        header.addControl(messageCountText);
        (this.chatContainer as any)._messageCountText = messageCountText;
        
        // Индикатор активности (пульсирующий)
        const activityIndicator = new Rectangle("activityIndicator");
        activityIndicator.width = "8px";
        activityIndicator.height = "8px";
        activityIndicator.cornerRadius = 4;
        activityIndicator.thickness = 0;
        activityIndicator.background = "#0f0";
        activityIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        activityIndicator.left = "-10px";
        activityIndicator.top = "11px";
        header.addControl(activityIndicator);
        (this.chatContainer as any)._activityIndicator = activityIndicator;
        
        // Кнопки фильтров
        this.createFilterButtons();
        
        // Область сообщений с прокруткой
        this.scrollViewer = new ScrollViewer("chatScrollViewer");
        this.scrollViewer.width = 0.95;
        this.scrollViewer.height = "240px";
        this.scrollViewer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.scrollViewer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.scrollViewer.top = "35px";
        this.scrollViewer.barSize = 6;
        this.scrollViewer.barColor = "#0a0";
        this.scrollViewer.thumbColor = "#0f0";
        this.scrollViewer.background = "#00000000";
        this.chatContainer.addControl(this.scrollViewer);
        
        // Контейнер для сообщений
        this.messagesArea = new Rectangle("messagesArea");
        this.messagesArea.width = 1;
        this.messagesArea.height = "1px"; // Будет обновляться динамически
        this.messagesArea.cornerRadius = 0;
        this.messagesArea.thickness = 0;
        this.messagesArea.background = "#00000000";
        this.messagesArea.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.messagesArea.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.scrollViewer.addControl(this.messagesArea);
        
        // Запуск анимаций
        this.startAnimations();
    }
    
    // Создать кнопки фильтров
    private createFilterButtons(): void {
        if (!this.chatContainer) return;
        
        const filterContainer = new Rectangle("filterContainer");
        filterContainer.width = 1;
        filterContainer.height = "25px";
        filterContainer.cornerRadius = 0;
        filterContainer.thickness = 0;
        filterContainer.background = "#00000088";
        filterContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        filterContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        filterContainer.top = "30px";
        this.chatContainer.addControl(filterContainer);
        
        const types: MessageType[] = ["system", "info", "warning", "error", "success", "combat", "economy"];
        const icons = ["⚙", "ℹ", "⚠", "✖", "✓", "⚔", "💰"];
        
        types.forEach((type, index) => {
            const button = new Rectangle(`filter_${type}`);
            button.width = "50px";
            button.height = "20px";
            button.cornerRadius = 0;
            button.thickness = 1;
            button.color = this.getColorForType(type);
            button.background = this.activeFilters.has(type) ? "#000000aa" : "#00000044";
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            button.left = `${5 + index * 55}px`;
            button.top = "2px";
            
            const buttonText = new TextBlock(`filterText_${type}`);
            buttonText.text = icons[index];
            buttonText.color = this.getColorForType(type);
            buttonText.fontSize = 10;
            buttonText.fontFamily = "Courier New, monospace";
            button.addControl(buttonText);
            
            // Обработчик клика
            button.onPointerClickObservable.add(() => {
                if (this.activeFilters.has(type)) {
                    this.activeFilters.delete(type);
                    button.background = "#00000044";
                } else {
                    this.activeFilters.add(type);
                    button.background = "#000000aa";
                }
                this.updateMessages();
            });
            
            filterContainer.addControl(button);
            this.filterButtons.set(type, button);
        });
    }
    
    // Запуск анимаций
    private startAnimations(): void {
        this.scene.onBeforeRenderObservable.add(() => {
            this.animationTime += this.scene.getEngine().getDeltaTime() / 1000;
            this.updateActivityIndicator();
        });
    }
    
    // Обновить индикатор активности
    private updateActivityIndicator(): void {
        if (!this.chatContainer) return;
        const indicator = (this.chatContainer as any)._activityIndicator as Rectangle;
        if (!indicator) return;
        
        const pulse = (Math.sin(this.animationTime * 2) + 1) / 2; // 0-1
        const alpha = 0.5 + pulse * 0.5;
        indicator.alpha = alpha;
    }
    
    // Добавить сообщение с типом
    addMessage(text: string, type: MessageType = "system", priority: number = 0): void {
        const message: ChatMessage = {
            text: text,
            type: type,
            color: this.getColorForType(type),
            timestamp: Date.now(),
            icon: this.getIconForType(type),
            priority: priority
        };
        
        this.messages.push(message);
        
        // Ограничиваем количество сообщений
        if (this.messages.length > this.maxMessages) {
            const removed = this.messages.shift();
            if (removed) {
                const element = this.messageElements.get(removed.timestamp);
                if (element) {
                    element.dispose();
                    this.messageElements.delete(removed.timestamp);
                }
            }
        }
        
        // Звуковое уведомление для важных сообщений
        if (priority >= 1 && this.soundManager) {
            try {
                if (type === "error") {
                    this.soundManager.playError();
                } else if (type === "warning") {
                    this.soundManager.playWarning();
                } else if (type === "success") {
                    this.soundManager.playSuccess();
                }
            } catch (e) {
                console.warn("[ChatSystem] Sound error:", e);
            }
        }
        
        // Группировка одинаковых сообщений
        const messageKey = `${type}:${text}`;
        const existingGroup = this.messageGroups.get(messageKey);
        if (existingGroup && Date.now() - existingGroup.lastTime < this.groupTimeout) {
            existingGroup.count++;
            existingGroup.lastTime = Date.now();
            // Обновляем последнее сообщение с счётчиком
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage && lastMessage.text === text && lastMessage.type === type) {
                lastMessage.text = `${text} (x${existingGroup.count})`;
            }
        } else {
            this.messageGroups.set(messageKey, { count: 1, lastTime: Date.now() });
        }
        
        // Очистка старых групп
        this.messageGroups.forEach((group, key) => {
            if (Date.now() - group.lastTime > this.groupTimeout * 2) {
                this.messageGroups.delete(key);
            }
        });
        
        this.updateMessages();
    }
    
    // Устаревший метод для совместимости
    addMessageOld(text: string, sender: string = "System", color: string = "#0f0"): void {
        let type: MessageType = "system";
        if (color === "#f00") type = "error";
        else if (color === "#ff0") type = "warning";
        else if (color === "#0f0") type = "success";
        else if (color === "#0ff") type = "info";
        
        this.addMessage(text, type, 0);
    }
    
    private getColorForType(type: MessageType): string {
        switch (type) {
            case "system": return "#0f0"; // Зелёный
            case "info": return "#0ff"; // Голубой
            case "warning": return "#ff0"; // Жёлтый
            case "error": return "#f00"; // Красный
            case "success": return "#0f0"; // Зелёный
            case "log": return "#888"; // Серый
            case "combat": return "#f80"; // Оранжевый
            case "economy": return "#ffd700"; // Золотой
            default: return "#0f0";
        }
    }
    
    private getIconForType(type: MessageType): string {
        switch (type) {
            case "system": return "⚙";
            case "info": return "ℹ";
            case "warning": return "⚠";
            case "error": return "✖";
            case "success": return "✓";
            case "log": return "📋";
            case "combat": return "⚔";
            case "economy": return "💰";
            default: return "•";
        }
    }
    
    // Обновить отображение сообщений
    private updateMessages(): void {
        if (!this.messagesArea) return;
        
        // Фильтруем сообщения
        const filteredMessages = this.messages.filter(msg => {
            // Фильтр по типу
            if (!this.activeFilters.has(msg.type)) return false;
            // Фильтр по поиску
            if (this.searchActive && this.searchText) {
                return msg.text.toLowerCase().includes(this.searchText.toLowerCase());
            }
            return true;
        });
        
        // Очищаем старые элементы
        this.messageElements.forEach((element, timestamp) => {
            const message = filteredMessages.find(m => m.timestamp === timestamp);
            if (!message) {
                element.dispose();
                this.messageElements.delete(timestamp);
            }
        });
        
        // Создаём элементы для новых сообщений
        filteredMessages.forEach((message, index) => {
            if (!this.messageElements.has(message.timestamp)) {
                const element = this.createMessageElement(message, index);
                this.messageElements.set(message.timestamp, element);
            } else {
                // Обновляем позицию существующего элемента
                const element = this.messageElements.get(message.timestamp)!;
                element.top = `${index * 20}px`;
            }
        });
        
        // Обновляем высоту контейнера
        const totalHeight = filteredMessages.length * 20;
        this.messagesArea.height = `${totalHeight}px`;
        
        // Обновляем счётчик сообщений
        if (this.chatContainer) {
            const countText = (this.chatContainer as any)._messageCountText as TextBlock;
            if (countText) {
                const visibleCount = filteredMessages.length;
                const totalCount = this.messages.length;
                countText.text = visibleCount === totalCount 
                    ? `${totalCount} msgs` 
                    : `${visibleCount}/${totalCount} msgs`;
            }
        }
        
        // Автопрокрутка вниз
        if (this.autoScroll && this.scrollViewer) {
            setTimeout(() => {
                if (this.scrollViewer) {
                    this.scrollViewer.verticalBar.value = 1;
                }
            }, 10);
        }
    }
    
    private createMessageElement(message: ChatMessage, index: number): TextBlock {
        const element = new TextBlock(`chatMsg_${message.timestamp}`);
        
        // Форматируем время
        const time = new Date(message.timestamp);
        const timeStr = this.showTimestamps 
            ? `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`
            : "";
        
        // Форматируем сообщение с улучшенным форматированием
        const prefix = timeStr ? `[${timeStr}]` : "";
        const iconSpacing = message.icon.length > 1 ? " " : "  ";
        const priorityMark = message.priority >= 2 ? "!! " : message.priority >= 1 ? "! " : "";
        element.text = `${prefix}${iconSpacing}${message.icon} ${priorityMark}${message.text}`;
        element.color = message.color;
        element.fontSize = 11;
        element.fontFamily = "Courier New, monospace";
        element.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        element.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        element.left = "5px";
        element.top = `${index * 20}px`;
        element.textWrapping = true;
        element.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        
        // Добавляем эффект появления для новых сообщений (плавная анимация)
        element.alpha = 0;
        const startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < 200 && element && !element.isDisposed) {
                element.alpha = Math.min(1, elapsed / 200);
                requestAnimationFrame(animate);
            } else if (element && !element.isDisposed) {
                element.alpha = 1;
            }
        };
        requestAnimationFrame(animate);
        
        // Выделение важных сообщений
        if (message.priority >= 1) {
            element.fontWeight = "bold";
        }
        if (message.priority >= 2) {
            element.fontSize = 12;
            // Пульсация для критических сообщений
            const pulse = () => {
                if (element && !element.isDisposed) {
                    const pulseValue = (Math.sin(this.animationTime * 3) + 1) / 2;
                    const brightness = 0.7 + pulseValue * 0.3;
                    element.color = this.adjustColorBrightness(message.color, brightness);
                    requestAnimationFrame(pulse);
                }
            };
            pulse();
        }
        
        this.messagesArea!.addControl(element);
        return element;
    }
    
    // Изменить яркость цвета
    private adjustColorBrightness(color: string, brightness: number): string {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;
        const r = Math.round(rgb.r * brightness);
        const g = Math.round(rgb.g * brightness);
        const b = Math.round(rgb.b * brightness);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    private hexToRgb(hex: string): { r: number, g: number, b: number } | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    // Очистить чат
    clear(): void {
        this.messages = [];
        this.messageElements.forEach(element => element.dispose());
        this.messageElements.clear();
        this.updateMessages();
    }
    
    // Удалить старые сообщения
    private startCleanupTimer(): void {
        setInterval(() => {
            const now = Date.now();
            const toRemove: number[] = [];
            
            this.messages.forEach((message, index) => {
                const lifetime = message.priority >= 1 
                    ? this.importantMessageLifetime 
                    : this.messageLifetime;
                
                if (now - message.timestamp > lifetime) {
                    toRemove.push(index);
                }
            });
            
            // Удаляем в обратном порядке, чтобы индексы не сбились
            for (let i = toRemove.length - 1; i >= 0; i--) {
                const index = toRemove[i];
                const message = this.messages[index];
                this.messages.splice(index, 1);
                
                const element = this.messageElements.get(message.timestamp);
                if (element) {
                    element.dispose();
                    this.messageElements.delete(message.timestamp);
                }
            }
            
            if (toRemove.length > 0) {
                this.updateMessages();
            }
        }, 5000); // Проверяем каждые 5 секунд
    }
    
    // Удобные методы для разных типов сообщений
    system(text: string, priority: number = 0) {
        this.addMessage(text, "system", priority);
    }
    
    info(text: string, priority: number = 0) {
        this.addMessage(text, "info", priority);
    }
    
    warning(text: string, priority: number = 1) {
        this.addMessage(text, "warning", priority);
    }
    
    error(text: string, priority: number = 2) {
        this.addMessage(text, "error", priority);
    }
    
    success(text: string, priority: number = 0) {
        this.addMessage(text, "success", priority);
    }
    
    log(text: string, priority: number = 0) {
        this.addMessage(text, "log", priority);
    }
    
    combat(text: string, priority: number = 1) {
        this.addMessage(text, "combat", priority);
    }
    
    economy(text: string, priority: number = 0) {
        this.addMessage(text, "economy", priority);
    }
    
    // Поиск по сообщениям
    setSearchText(text: string): void {
        this.searchText = text;
        this.searchActive = text.length > 0;
        this.updateMessages();
    }
    
    clearSearch(): void {
        this.searchText = "";
        this.searchActive = false;
        this.updateMessages();
    }
    
    // Получить статистику сообщений
    getStats(): { total: number, byType: Map<MessageType, number> } {
        const byType = new Map<MessageType, number>();
        this.messages.forEach(msg => {
            byType.set(msg.type, (byType.get(msg.type) || 0) + 1);
        });
        return {
            total: this.messages.length,
            byType: byType
        };
    }
    
    // Экспорт сообщений
    exportMessages(): string {
        return this.messages.map(msg => {
            const time = new Date(msg.timestamp);
            const timeStr = `${time.toISOString()}`;
            return `[${timeStr}] [${msg.type.toUpperCase()}] ${msg.icon} ${msg.text}`;
        }).join('\n');
    }
    
    // Импорт сообщений (для истории)
    importMessages(messages: ChatMessage[]): void {
        this.messages = [...this.messages, ...messages];
        this.updateMessages();
    }
}
