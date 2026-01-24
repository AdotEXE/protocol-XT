// ═══════════════════════════════════════════════════════════════════════════
// MAIN MENU - Минималистичное главное меню
// ═══════════════════════════════════════════════════════════════════════════

// Импорты для скил-дерева перенесены в menu/skillTreeUI.ts
import { createSkillsPanelHTML, updateSkillTreeDisplay, saveSkillTreeCameraPosition, type PlayerStats, type SkillTreeCallbacks } from "./menu/skillTreeUI";
import { Scene, Engine } from "@babylonjs/core";
import { VoxelEditor } from "./voxelEditor/VoxelEditor"; // Integrated Voxel Editor
// Garage is lazy loaded - imported dynamically when needed
import { CurrencyManager } from "./currencyManager";
import { logger, LogLevel, loggingSettings, LogCategory } from "./utils/logger";
import { CHASSIS_TYPES, CANNON_TYPES } from "./tankTypes";
import { authUI } from "./menu/authUI";
import { firebaseService } from "./firebaseService";
import { PlayerProgressionSystem, PLAYER_ACHIEVEMENTS, PLAYER_TITLES, getLevelBonuses, MAX_PLAYER_LEVEL, PLAYER_LEVEL_EXP, type PlayerAchievement, type DailyQuest } from "./playerProgression";
import { initCustomMapBridge, type TXMapData, loadCustomMap, getCustomMapsList, getCustomMapData, deleteCustomMap } from "./maps/custom";
import { ALL_MAPS, type MapId } from "./maps";

// Version tracking
// Версия генерируется во время сборки и одинакова для всех пользователей
const VERSION_MAJOR = 0;
const VERSION_MINOR = 4;

// Время сборки и commit hash внедряются во время сборки через Vite define
// В dev режиме используем текущее время
declare const __BUILD_TIME__: string | undefined;
declare const __COMMIT_HASH__: string | undefined;
declare const __BUILD_NUMBER__: string | undefined;

const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined'
    ? __BUILD_TIME__
    : (() => {
        const date = new Date();
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `[${day}.${month}.${year} ${hours}:${minutes}:${seconds}]`;
    })();

const COMMIT_HASH = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';

// Используем build number из vite.config.ts (генерируется во время сборки)
// Для dev режима используем 0
const buildNumber = typeof __BUILD_NUMBER__ !== 'undefined'
    ? parseInt(__BUILD_NUMBER__)
    : (() => {
        // Fallback: вычисляем из commit hash если доступен
        if (COMMIT_HASH !== 'dev' && COMMIT_HASH.length >= 4) {
            return parseInt(COMMIT_HASH.substring(0, 4), 16) % 10000;
        }
        return 0;
    })();

const VERSION = `v${VERSION_MAJOR}.${VERSION_MINOR}.${buildNumber} ${BUILD_TIME}`;

// Debug flag - можно включить через localStorage.setItem("debug", "true")
const DEBUG = localStorage.getItem("debug") === "true" || false;

// Утилита для условного логирования
const debugLog = (...args: any[]) => {
    if (DEBUG) console.log(...args);
};
const debugWarn = (...args: any[]) => {
    if (DEBUG) console.warn(...args);
};
const debugError = (...args: any[]) => {
    // Ошибки всегда логируем
    console.error(...args);
};

// Импорт функций настроек
import {
    loadSettings as loadSettingsModule,

    saveSettings as saveSettingsModule,
    DEFAULT_SETTINGS,
    type GameSettings
} from "./menu/settings";

// GameSettings и DEFAULT_SETTINGS теперь импортируются из menu/settings.ts
export type { GameSettings } from "./menu/settings";
export { DEFAULT_SETTINGS } from "./menu/settings";

// Удалены дублирующиеся определения - они импортируются из menu/settings.ts
// Старая реализация удалена, используется модульная версия

// === LANGUAGE STRINGS ===
import { LANG, getLang } from "./localization";
import { SettingsPanel } from "./settingsPanel";


export interface TankConfig {
    color: string;
    turretColor: string;
    speed: number;
    armor: number;
    firepower: number;
}

const DEFAULT_TANK: TankConfig = {
    color: "#0f0",
    turretColor: "#888",
    speed: 2,
    armor: 2,
    firepower: 2
};

export type MapType = "normal" | "sandbox" | "sand" | "madness" | "expo" | "brest" | "arena" | "polygon" | "frontline" | "ruins" | "canyon" | "industrial" | "urban_warfare" | "underground" | "coastal" | "tartaria" | "custom";

export class MainMenu {
    private container!: HTMLDivElement;
    private allRooms: any[] = []; // Храним все комнаты для фильтрации
    private settingsPanel!: HTMLDivElement;
    private statsPanel!: HTMLDivElement;
    private skillsPanel!: HTMLDivElement;
    private mapSelectionPanel!: HTMLDivElement;
    private playMenuPanel!: HTMLDivElement;
    private progressPanel!: HTMLDivElement;
    private progressCurrentTab: "level" | "achievements" | "quests" = "level";
    private onStartGame: (mapType?: MapType, mapData?: any) => void = () => { };
    private onRestartGame: () => void = () => { };
    private onExitBattle: () => void = () => { };
    private selectedGameMode: string = "";
    private selectedMapType: MapType | null = null;
    private selectedChassis: string = "";
    private selectedCannon: string = "";
    private ownedChassisIds: Set<string> = new Set();
    private ownedCannonIds: Set<string> = new Set();
    private currentPlayStep: number = 0;
    private onPlayIntroSound: () => void = () => { };
    private settings!: GameSettings;
    private tankConfig!: TankConfig;
    private playerProgression: any = null;
    private experienceSubscription: any = null;
    private introSoundPlayed = false;
    private garage: any | null = null; // Garage instance (lazy loaded when needed)
    private garageScene: Scene | null = null; // Minimal scene for garage (if created in menu)
    private garageCurrencyManager: CurrencyManager | null = null; // Currency manager for garage
    private returnToPlayMenuAfterGarage = false;

    private voxelEditor: VoxelEditor | null = null;
    private editorContainer: HTMLElement | null = null;
    private expandEditorBtn: HTMLButtonElement | null = null;

    // Game reference for editor integration
    private game: any = null;


    private canvasObserver: MutationObserver | null = null;
    private canvasPointerEventsCheckInterval: number | null = null;
    private _lastPointerEventsState: string | null = null; // Кэш последнего состояния для предотвращения бесконечных циклов
    private _enforceInProgress = false; // Флаг для предотвращения рекурсивных вызовов
    private _enableDetailedLogging = false; // Детальное логирование отключено по умолчанию
    private buttonHandlersAttached = false; // Флаг для предотвращения множественной привязки обработчиков
    private authListenerAttached = false; // Флаг для предотвращения повторной регистрации auth listener
    private authListenerUnsubscribe: (() => void) | null = null; // Функция отписки от auth listener

    // Лобби - автообновление
    private lobbyAutoRefreshInterval: number | null = null;
    private lobbyAutoRefreshEnabled: boolean = true;
    private lobbyAutoRefreshIntervalMs: number = 8000; // 8 секунд по умолчанию
    private lobbyLastUpdateTime: number = 0;
    private lobbyVisibilityObserver: IntersectionObserver | null = null;

    // Лобби - фильтрация и поиск игроков
    private allLobbyPlayers: any[] = []; // Все игроки для фильтрации
    private filteredLobbyPlayers: any[] = []; // Отфильтрованные игроки
    private friendsList: Set<string> = new Set(); // Список ID друзей
    private settingsPanelComponent: SettingsPanel | null = null;

    // Throttling для логирования updateRoomList
    private _lastRoomListLogTime: number = 0;
    private _lastRoomListCount: number = 0;

    // Throttling для логирования updateLobbyPlayers
    private _lastLobbyPlayersLogTime: number = 0;
    private _lastLobbyPlayersCount: number = 0;

    // Лобби - фильтрация комнат (используем общий allRooms)

    constructor() {

        this.settings = this.loadSettings();
        this.tankConfig = this.loadTankConfig();
        this.ownedChassisIds = this.loadOwnedIds("ownedChassis", ["medium"]);
        this.ownedCannonIds = this.loadOwnedIds("ownedCannons", ["standard"]);

        // Загружаем список друзей
        this.loadFriendsList();

        // Initialize Custom Map Bridge for interaction with Map Editor
        // Initialize Custom Map Bridge for interaction with Map Editor
        initCustomMapBridge((mapData, autoPlay) => {
            logger.info("Main", `Loaded custom map from editor: ${mapData.name}`);

            // Show notification
            const notification = document.createElement('div');
            notification.className = 'menu-notification';
            notification.textContent = `Map Loaded: ${mapData.name}${autoPlay ? ' (Starting test...)' : ''}`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 5000);

            // Auto-select custom map
            this.selectedMapType = 'custom';
            this.updateCustomMapsUI();

            if (autoPlay) {
                logger.info("Main", "Auto-playing custom map");

                // Collapse editor if it's open (Test Mode)
                if (this.editorContainer) {
                    this.collapseMapEditor();
                }

                // Small delay to ensure UI updates finish
                setTimeout(() => this.onStartGame('custom'), 100);
            }
        });

        // ИСПРАВЛЕНО: Создаём PlayerProgressionSystem сразу при создании меню
        // чтобы данные аккаунта были доступны немедленно
        this.playerProgression = new PlayerProgressionSystem();

        // Garage will be loaded lazily when needed (when user opens garage from menu)
        // This reduces initial bundle size


        this.createMenuUI();

        this.createSettingsUI();
        this.createStatsPanel();
        this.createSkillsPanel();
        this.createProgressPanel();
        this.createMapSelectionPanel();
        this.createPlayMenuPanel();
        this.startAnimations();
        this.setupCanvasPointerEventsProtection();
        this.setupGlobalEventBlocking();
        this.setupFullscreenListener();

        // ИСПРАВЛЕНО: Сразу обновляем данные аккаунта в меню
        this.updatePlayerInfo(true);

        // Listen for lobby chat messages
        window.addEventListener("mp-lobby-chat-message", (e: any) => {
            const data = e.detail;
            const chatMessages = document.getElementById("mp-room-panel-chat-messages");
            if (chatMessages) {
                const messageEl = document.createElement("div");
                messageEl.style.marginBottom = "4px";
                messageEl.style.wordBreak = "break-word";

                const time = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                if (data.isSystem) {
                    messageEl.innerHTML = `<span style="color: #aaa; font-size: 10px;">[${time}]</span> <span style="color: #ffff00;">${data.message}</span>`;
                } else {
                    messageEl.innerHTML = `<span style="color: #aaa; font-size: 10px;">[${time}]</span> <span style="color: #4ade80; font-weight: bold;">${data.sender}:</span> <span style="color: #fff;">${data.message}</span>`;
                }

                chatMessages.appendChild(messageEl);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        });
    }

    private setupFullscreenListener(): void {
        // Слушаем изменения полноэкранного режима для обновления кнопки
        document.addEventListener("fullscreenchange", () => {
            const isFullscreen = !!document.fullscreenElement;
            this.syncFullscreenState(isFullscreen);
        });
    }

    private setupGlobalEventBlocking(): void {
        // ГЛОБАЛЬНАЯ БЛОКИРОВКА: Перехватываем все события мыши на уровне document
        // и блокируем их если они идут на canvas, а меню видимо
        const globalHandler = (e: MouseEvent): void => {
            const target = e.target as HTMLElement;

            // Если меню не видимо - пропускаем все события
            if (this.container.classList.contains("hidden")) {
                return;
            }

            // Если клик по canvas или его дочерним элементам - блокируем
            const canvas = document.getElementById("gameCanvas");
            if (canvas && (target === canvas || canvas.contains(target))) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                debugLog("[Menu] Blocked click on canvas");
                return;
            }

            // Если клик по элементу меню - разрешаем
            if (this.container.contains(target)) {
                // Разрешаем событие (не блокируем)
                return;
            }
        };

        // Добавляем обработчики на все фазы событий
        document.addEventListener("mousedown", globalHandler, true);
        document.addEventListener("mouseup", globalHandler, true);
        document.addEventListener("click", globalHandler, true);

        debugLog("[Menu] Global event blocking setup complete");
    }

    private setupCanvasPointerEventsProtection(): void {
        // Находим canvas
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (!canvas) {
            // Если canvas еще не создан, ждем его появления
            const checkCanvas = setInterval(() => {
                const canvasEl = document.getElementById("gameCanvas") as HTMLCanvasElement;
                if (canvasEl) {
                    clearInterval(checkCanvas);
                    this.setupCanvasPointerEventsProtection();
                }
            }, 100);
            return;
        }

        // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas сразу
        canvas.style.setProperty("pointer-events", "none", "important");
        canvas.style.setProperty("z-index", "0", "important");

        // Очищаем старый observer если он есть
        if (this.canvasObserver) {
            this.canvasObserver.disconnect();
        }

        // MutationObserver для отслеживания изменений стилей canvas
        // Используем debounce для предотвращения слишком частых вызовов
        let mutationTimeout: number | null = null;
        this.canvasObserver = new MutationObserver((_mutations) => {
            // Debounce: откладываем выполнение на 50мс для предотвращения таймаутов
            if (mutationTimeout !== null) {
                clearTimeout(mutationTimeout);
            }
            mutationTimeout = window.setTimeout(() => {
                // Принудительно блокируем canvas при любых изменениях стилей (с защитой от циклов)
                this.enforceCanvasPointerEvents();

                // Также проверяем, не был ли canvas пересоздан
                const currentCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                if (currentCanvas && currentCanvas !== canvas) {
                    // Canvas был пересоздан, переустанавливаем observer
                    this.setupCanvasPointerEventsProtection();
                }
                mutationTimeout = null;
            }, 50);
        });

        this.canvasObserver.observe(canvas, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            attributeOldValue: false,
            childList: false,
            subtree: false
        });

        // Очищаем старый интервал если он есть
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
        }

        // Периодическая проверка каждые 100мс для оптимизации (увеличено с 25мс для предотвращения таймаутов)
        this.canvasPointerEventsCheckInterval = window.setInterval(() => {
            // Проверяем, что canvas все еще существует
            const currentCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (!currentCanvas) {
                // Canvas был удален, переустанавливаем защиту
                this.setupCanvasPointerEventsProtection();
                return;
            }

            // Принудительно блокируем canvas (с защитой от циклов внутри метода)
            this.enforceCanvasPointerEvents();
        }, 100);

        // Начальная установка
        this.enforceCanvasPointerEvents();

        // Также устанавливаем через requestAnimationFrame для максимальной надежности (только когда меню видимо)
        let animationFrameId: number | null = null;
        const enforceLoop = () => {
            const isMenuOrPanelVisible = !this.container.classList.contains("hidden") ||
                this.mapSelectionPanel?.classList.contains("visible") ||
                this.statsPanel?.classList.contains("visible") ||
                this.skillsPanel?.classList.contains("visible") ||
                this.settingsPanel?.classList.contains("visible") ||
                this.progressPanel?.classList.contains("visible");

            if (isMenuOrPanelVisible) {
                this.enforceCanvasPointerEvents();
                animationFrameId = requestAnimationFrame(enforceLoop);
            } else {
                animationFrameId = null;
            }
        };

        // Запускаем loop только когда меню видимо
        const startLoop = () => {
            if (animationFrameId === null) {
                animationFrameId = requestAnimationFrame(enforceLoop);
            }
        };

        // Запускаем при показе меню
        this.container.addEventListener("mouseenter", startLoop);
        // Также запускаем при показе любой панели
        const panels = [this.mapSelectionPanel, this.statsPanel, this.skillsPanel, this.settingsPanel, this.progressPanel];
        panels.forEach(panel => {
            if (panel) {
                const observer = new MutationObserver(() => {
                    if (panel.classList.contains("visible")) {
                        startLoop();
                    }
                });
                observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
            }
        });

        // Начальный запуск если меню уже видимо
        if (!this.container.classList.contains("hidden")) {
            startLoop();
        }
    }

    private enforceCanvasPointerEvents(): void {
        // Защита от рекурсивных вызовов и бесконечных циклов
        if (this._enforceInProgress) {
            return;
        }

        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (!canvas) {
            debugLog("[Menu] enforceCanvasPointerEvents: canvas not found");
            return;
        }

        this._enforceInProgress = true;

        try {
            const isMenuVisible = !this.container.classList.contains("hidden");
            const isAnyPanelVisible =
                this.mapSelectionPanel?.classList.contains("visible") ||
                this.statsPanel?.classList.contains("visible") ||
                this.skillsPanel?.classList.contains("visible") ||
                this.settingsPanel?.classList.contains("visible") ||
                this.progressPanel?.classList.contains("visible");

            // Определяем желаемое состояние
            const desiredState = (isMenuVisible || isAnyPanelVisible) ? "none" : "auto";

            // Проверяем, изменилось ли состояние - если нет, не делаем ничего (предотвращает бесконечный цикл)
            if (this._lastPointerEventsState === desiredState) {
                this._enforceInProgress = false;
                return;
            }

            // Блокируем canvas если меню видимо ИЛИ любая панель видима
            if (isMenuVisible || isAnyPanelVisible) {
                // Упрощенная блокировка - только один способ для предотвращения циклов
                canvas.style.setProperty("pointer-events", "none", "important");
                canvas.setAttribute("data-menu-blocked", "true");

                // Обновляем кэш только после успешного применения
                this._lastPointerEventsState = "none";

                if (this._enableDetailedLogging) {
                    debugLog("[Menu] Canvas blocked, menu visible:", isMenuVisible, "panel visible:", isAnyPanelVisible);
                }
            } else {
                // Если меню и все панели скрыты, разрешаем pointer-events
                canvas.style.setProperty("pointer-events", "auto", "important");
                canvas.removeAttribute("data-menu-blocked");

                // Обновляем кэш только после успешного применения
                this._lastPointerEventsState = "auto";
            }
        } finally {
            this._enforceInProgress = false;
        }
    }

    destroy(): void {
        // Очистка при уничтожении меню
        if (this.canvasObserver) {
            this.canvasObserver.disconnect();
            this.canvasObserver = null;
        }
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
            this.canvasPointerEventsCheckInterval = null;
        }
    }

    setPlayerProgression(progression: any): void {
        // Отписываемся от предыдущей подписки, если она была
        if (this.experienceSubscription) {
            this.experienceSubscription.remove();
            this.experienceSubscription = null;
        }

        this.playerProgression = progression;
        // Немедленное обновление при первой установке (без анимации)
        this.updatePlayerInfo(true);

        // Также обновляем через небольшую задержку для гарантии (на случай если DOM еще не готов)
        setTimeout(() => {
            this.updatePlayerInfo(true);
        }, 100);

        // Обновляем панель навыков, если она видима
        if (this.skillsPanel && this.skillsPanel.classList.contains("visible")) {
            this.updateSkillsPanel();
        }

        // Подписываемся на изменения опыта
        if (progression && progression.onExperienceChanged) {
            debugLog("[MainMenu] Subscribing to experience changes");
            this.experienceSubscription = progression.onExperienceChanged.add((data: {
                current: number;
                required: number;
                percent: number;
                level: number;
            }) => {
                debugLog("[MainMenu] Experience changed event received:", data);
                // Обновляем информацию игрока при изменении опыта
                this.updatePlayerInfo();
                // Также обновляем панель статистики, если она видима
                if (this.statsPanel && this.statsPanel.classList.contains("visible")) {
                    this.updateStatsPanel();
                }
            });
        } else {
            debugWarn("[MainMenu] Cannot subscribe to experience changes - progression or onExperienceChanged is null");
        }
    }

    setGarage(garage: any): void {
        // Replace menu garage with game garage (which has proper scene and systems)
        if (this.garage && this.garageScene) {
            // Cleanup old garage scene
            try {
                if (this.garage.isGarageOpen()) {
                    this.garage.close(); // Close if open
                }

                // ИСПРАВЛЕНО: Получаем engine ПЕРЕД dispose сцены
                const engine = this.garageScene?.getEngine();

                // ИСПРАВЛЕНО: Безопасный dispose с проверками на isDisposed
                if (this.garageScene && !this.garageScene.isDisposed) {
                    this.garageScene.dispose();
                }

                // ИСПРАВЛЕНО: Dispose engine ПОСЛЕ dispose сцены
                if (engine && !engine.isDisposed) {
                    engine.dispose();
                }
            } catch (e) {
                // Ignore cleanup errors
                debugWarn("[Menu] Error during garage cleanup:", e);
            }
        }
        this.garage = garage;
        debugLog("[Menu] Garage replaced with game garage");
    }

    private createMenuUI(): void {

        this.container = document.createElement("div");
        this.container.id = "main-menu";
        // ВАЖНО: НЕ добавляем класс "hidden" по умолчанию - меню должно быть видимо при создании
        // this.container.classList.add("hidden"); // УДАЛЕНО - меню должно быть видимо

        const L = getLang(this.settings);
        this.container.innerHTML = `
            <div class="menu-bg"></div>
            <div class="menu-content">
                <div class="menu-header">
                    <div class="logo-text logo-hoverable">
                        PROTOCOL <span class="accent">TX</span>
                        <div class="logo-construction-overlay">
                            <span class="logo-construction-text">UNDER CONSTRUCTION</span>
                        </div>
                    </div>
                    <div class="menu-subtitle">${L.tankCombat}</div>
                    <div class="version">${VERSION}</div>
                </div>

                <!-- Scrollable область от блока опыта до блока управления -->
                <div class="menu-scrollable">
                <div class="player-card" id="player-info">
                    <div class="player-level-row">
                        <div class="level-badge" id="level-badge">1</div>
                        <div class="xp-section">
                            <div class="xp-bar-bg">
                                <div class="xp-bar-fill" id="xp-bar"></div>
                            </div>
                            <div class="xp-text" id="xp-text">0 / 500 XP</div>
                            <div class="player-callsign" id="player-callsign">[anon_id: 0001]</div>
                        </div>
                    </div>
                    <div class="player-stats-row">
                        <div class="stat-item"><span class="stat-icon">$</span><span id="credits-display">500</span></div>
                        <div class="stat-item"><span class="stat-icon">☠</span><span id="kills-display">0</span></div>
                        <div class="stat-item"><span class="stat-icon">◷</span><span id="playtime-display">0ч</span></div>
                    </div>
                </div>

                <!-- Auth section -->
                <div class="auth-section" id="auth-section">
                    <div class="auth-info" id="auth-info" style="display: none;">
                        <div class="auth-user-info">
                            <span class="auth-username" id="auth-username">Гость</span>
                            <span class="auth-status" id="auth-status"></span>
                        </div>
                        <button class="menu-btn auth-btn" id="btn-profile">
                            <span class="btn-icon">👤</span>
                            <span class="btn-label">ПРОФИЛЬ</span>
                        </button>
                    </div>
                    <div class="auth-buttons" id="auth-buttons">
                        <button class="menu-btn under-construction-btn" id="btn-login">
                            <span class="btn-icon">🔐</span>
                            <span class="btn-label">ВОЙТИ</span>
                            <div class="under-construction-overlay">
                                <span class="under-construction-text">UNDER CONSTRUCTION</span>
                            </div>
                        </button>
                        <button class="menu-btn secondary under-construction-btn" id="btn-register">
                            <span class="btn-icon">📝</span>
                            <span class="btn-label">РЕГИСТРАЦИЯ</span>
                            <div class="under-construction-overlay">
                                <span class="under-construction-text">UNDER CONSTRUCTION</span>
                            </div>
                        </button>
                    </div>
                </div>

                <div class="menu-buttons">
                    <!-- Кнопки для паузы (видны только во время игры) -->
                    <div class="pause-buttons" id="pause-buttons" style="display: none;">
                        <div class="btn-row">
                            <button class="menu-btn secondary" id="btn-resume">
                                <span class="btn-icon">▶</span>
                                <span class="btn-label">ПРОДОЛЖИТЬ</span>
                            </button>
                            <button class="menu-btn secondary" id="btn-restart">
                                <span class="btn-icon">🔄</span>
                                <span class="btn-label">ПЕРЕЗАГРУЗИТЬ</span>
                            </button>
                            <button class="menu-btn danger" id="btn-exit-battle">
                                <span class="btn-icon">🚪</span>
                                <span class="btn-label">ВЫЙТИ ИЗ БОЯ</span>
                            </button>
                        </div>
                    </div>
                    <!-- Кнопки для главного меню (видны только когда игра не запущена) -->
                    <div class="main-buttons" id="main-buttons">
                        <div class="btn-row">
                            <button class="menu-btn play-btn" id="btn-play">
                                <span class="btn-icon">▶</span>
                                <span class="btn-label">${L.play || "ИГРАТЬ"}</span>
                            </button>
                            <button class="menu-btn secondary" id="btn-quick-start">
                                <span class="btn-icon">⚡</span>
                                <span class="btn-label">${L.quickStart || "БЫСТРЫЙ СТАРТ"}</span>
                            </button>
                        </div>
                    </div>
                    <div class="btn-row">
                        <button class="menu-btn secondary" id="btn-garage">
                            <span class="btn-icon">⚙</span>
                            <span class="btn-label">${L.garage}</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-stats">
                            <span class="btn-icon">📊</span>
                            <span class="btn-label">${L.stats}</span>
                        </button>
                    </div>
                    <div class="btn-row">
                        <button class="menu-btn secondary" id="btn-skills">
                            <span class="btn-icon">⚡</span>
                            <span class="btn-label">${L.skills}</span>
                            <span class="btn-badge" id="skill-points-hint"></span>
                        </button>
                        <button class="menu-btn secondary" id="btn-settings">
                            <span class="btn-icon">☰</span>
                            <span class="btn-label">${L.options}</span>
                        </button>
                    </div>
                    <div class="btn-row">
                        <button class="menu-btn secondary" id="btn-map-editor">
                            <span class="btn-icon">🗺</span>
                            <span class="btn-label">РЕДАКТОР КАРТ</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-tank-editor">
                            <span class="btn-icon">🔧</span>
                            <span class="btn-label">МАСТЕРСКАЯ ТАНКОВ</span>
                        </button>
                    </div>
                    <button class="menu-btn fullscreen-btn" id="btn-fullscreen">
                        <span class="btn-icon" id="fullscreen-icon">⛶</span>
                        <span class="btn-label" id="fullscreen-label">${L.fullscreen}</span>
                    </button>
                </div>

                <div class="menu-footer">
                    <div class="controls-panel">
                        <div class="controls-title" id="controls-title">
                            <span>${L.controls}</span>
                            <button class="controls-toggle-btn" id="controls-toggle-btn" title="Развернуть/Свернуть">▼</button>
                        </div>
                        <div class="controls-grid" id="controls-grid" style="display: none;">
                            <div class="control-category">
                                <div class="category-header">🎮 ${L.movement}</div>
                                <div class="control-item">
                                    <span class="key">WASD</span>
                                    <span class="control-desc">${L.moveTank}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">&uarr; &darr; &larr; &rarr;</span>
                                    <span class="control-desc">${L.moveTank}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">МЫШЬ</span>
                                    <span class="control-desc">${L.rotateTurret}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">Z / X</span>
                                    <span class="control-desc">${L.turretLR}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">⚔ ${L.combat}</div>
                                <div class="control-item">
                                    <span class="key">ПРОБЕЛ</span>
                                    <span class="control-desc">${L.fire}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">ПКМ / CTRL</span>
                                    <span class="control-desc">${L.aimMode}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">R</span>
                                    <span class="control-desc">${L.barrelUp}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F</span>
                                    <span class="control-desc">${L.barrelDown}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">1-5</span>
                                    <span class="control-desc">${L.useConsumables}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">6-9</span>
                                    <span class="control-desc">${L.consumables6to9}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">КОЛЕСО</span>
                                    <span class="control-desc">${L.zoom}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">📋 ${L.interface}</div>
                                <div class="control-item">
                                    <span class="key">G</span>
                                    <span class="control-desc">${L.garageKey}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">B</span>
                                    <span class="control-desc">${L.garageMenu}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">M</span>
                                    <span class="control-desc">${L.map}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">N</span>
                                    <span class="control-desc">${L.missions}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">TAB</span>
                                    <span class="control-desc">${L.statsKey}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">ALT</span>
                                    <span class="control-desc">${L.gameCursor}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">ESC</span>
                                    <span class="control-desc">${L.pauseMenu}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">📷 ${L.camera}</div>
                                <div class="control-item">
                                    <span class="key">SHIFT</span>
                                    <span class="control-desc">${L.freeLook}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">C</span>
                                    <span class="control-desc">${L.center}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">Q / E</span>
                                    <span class="control-desc">${L.cameraTilt}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">МЫШЬ</span>
                                    <span class="control-desc">${L.freeLook}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">📡 ${L.comms}</div>
                                <div class="control-item">
                                    <span class="key">Enter</span>
                                    <span class="control-desc">${L.generalChat}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">T</span>
                                    <span class="control-desc">${L.teamChat}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">V</span>
                                    <span class="control-desc">${L.voicePTT}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">J</span>
                                    <span class="control-desc">${L.voiceToggle}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">M</span>
                                    <span class="control-desc">${L.voiceMenu}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">🛠 ${L.admin}</div>
                                <div class="control-item">
                                    <span class="key">F1 / Ctrl+1</span>
                                    <span class="control-desc">Помощь / Управление</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F2 / Ctrl+2</span>
                                    <span class="control-desc">Скриншот</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F3 / Ctrl+3</span>
                                    <span class="control-desc">Debug Dashboard</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F4 / Ctrl+4</span>
                                    <span class="control-desc">Physics Panel</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F5 / Ctrl+5</span>
                                    <span class="control-desc">System Terminal</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F6 / Ctrl+6</span>
                                    <span class="control-desc">Session Settings</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F7 / Ctrl+7</span>
                                    <span class="control-desc">Cheat Menu</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div><!-- Конец .menu-scrollable -->
            </div>

            <!-- Лобби игроков -->
            <div class="lobby-panel" id="lobby-panel">
                <div class="lobby-header">
                    <button class="lobby-toggle-btn" id="lobby-toggle-btn" title="Свернуть/Развернуть">◀</button>
                    <span class="lobby-title">👥 ЛОББИ</span>
                    <span class="lobby-collapsed-icon" id="lobby-collapsed-icon">👥</span>
                    <div class="lobby-header-right">
                        <span class="lobby-count" id="lobby-count">0</span>
                        <button class="lobby-refresh-btn" id="lobby-refresh-btn" title="Обновить список">🔄</button>
                        <button class="lobby-auto-refresh-toggle" id="lobby-auto-refresh-toggle" title="Автообновление">⏱️</button>
                    </div>
                </div>
                <div class="lobby-status-bar">
                    <span class="lobby-last-update" id="lobby-last-update">Обновление...</span>
                </div>
                <div class="lobby-tabs">
                    <button class="lobby-tab active" data-tab="players" id="lobby-tab-players">Игроки</button>
                    <button class="lobby-tab" data-tab="rooms" id="lobby-tab-rooms">Комнаты</button>
                </div>
                <div class="lobby-content">
                    <div class="lobby-tab-content active" id="lobby-players-tab">
                        <div class="lobby-filters" id="lobby-players-filters">
                            <input type="text" class="lobby-search-input" id="lobby-players-search" placeholder="🔍 Поиск игрока..." />
                            <div class="lobby-filter-row">
                                <select class="lobby-filter-select" id="lobby-players-filter-status">
                                    <option value="all">Все статусы</option>
                                    <option value="online">Онлайн</option>
                                    <option value="in-room">В комнате</option>
                                    <option value="in-lobby">В лобби</option>
                                </select>
                                <select class="lobby-filter-select" id="lobby-players-filter-friends">
                                    <option value="all">Все игроки</option>
                                    <option value="friends">Только друзья</option>
                                    <option value="not-friends">Не друзья</option>
                                </select>
                                <select class="lobby-filter-select" id="lobby-players-sort">
                                    <option value="name-asc">Имя (А-Я)</option>
                                    <option value="name-desc">Имя (Я-А)</option>
                                    <option value="activity-desc">Активность ↓</option>
                                    <option value="activity-asc">Активность ↑</option>
                                    <option value="level-desc">Уровень ↓</option>
                                    <option value="level-asc">Уровень ↑</option>
                                </select>
                            </div>
                        </div>
                        <div class="lobby-list-container" id="lobby-players-list">
                        <div class="lobby-empty" id="lobby-players-empty">Нет игроков онлайн</div>
                    </div>
                    </div>
                    <div class="lobby-tab-content" id="lobby-rooms-tab">
                        <div class="lobby-filters" id="lobby-rooms-filters">
                            <input type="text" class="lobby-search-input" id="lobby-rooms-search" placeholder="🔍 Поиск по ID комнаты..." />
                            <div class="lobby-filter-row">
                                <select class="lobby-filter-select" id="lobby-rooms-filter-mode">
                                    <option value="all">Все режимы</option>
                                    <option value="ffa">FFA</option>
                                    <option value="tdm">TDM</option>
                                    <option value="coop">Co-op</option>
                                    <option value="battle_royale">Battle Royale</option>
                                    <option value="ctf">CTF</option>
                                    <option value="control_point">Control Point</option>
                                </select>
                                <select class="lobby-filter-select" id="lobby-rooms-filter-status">
                                    <option value="all">Все статусы</option>
                                    <option value="waiting">Ожидание</option>
                                    <option value="active">Игра идет</option>
                                </select>
                                <select class="lobby-filter-select" id="lobby-rooms-sort">
                                    <option value="players-desc">Игроков ↓</option>
                                    <option value="players-asc">Игроков ↑</option>
                                    <option value="time-desc">Время ↓</option>
                                    <option value="time-asc">Время ↑</option>
                                    <option value="mode-asc">Режим (А-Я)</option>
                                </select>
                            </div>
                        </div>
                        <div class="lobby-list-container" id="lobby-rooms-list">
                        <div class="lobby-empty" id="lobby-rooms-empty">Нет доступных комнат</div>
                        </div>
                    </div>
                </div>

                <!-- Общий чат сервера -->
                <div class="lobby-chat" id="lobby-chat">
                    <div class="lobby-chat-header">
                        <span class="lobby-chat-title">💬 ЧАТ</span>
                        <button class="lobby-chat-toggle" id="lobby-chat-toggle" title="Свернуть/Развернуть чат">▼</button>
                    </div>
                    <div class="lobby-chat-messages" id="lobby-chat-messages">
                        <div class="lobby-chat-welcome">Добро пожаловать в общий чат!</div>
                    </div>
                    <div class="lobby-chat-input-container">
                        <input type="text" class="lobby-chat-input" id="lobby-chat-input" placeholder="Введите сообщение..." maxlength="200" />
                        <button class="lobby-chat-send" id="lobby-chat-send">➤</button>
                    </div>
                </div>
            </div>
        `;

        // Add Google Pixel Font
        const fontLink = document.createElement("link");
        fontLink.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);

        const style = document.createElement("style");
        style.textContent = `
            /* === PIXEL HACKER THEME === */
            #main-menu {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 99999 !important; /* ОЧЕНЬ ВЫСОКИЙ z-index чтобы быть поверх всего */
                font-family: 'Press Start 2P', 'Courier New', monospace;
                overflow: hidden;
                pointer-events: auto !important;
                touch-action: auto !important;
            }

            /* Прозрачность фона меню когда игра запущена (в битве) */
            #main-menu.in-battle {
                background: rgba(0, 0, 0, 0.5) !important;
            }

            #main-menu.in-battle .menu-bg {
                background: rgba(0, 0, 0, 0.5) !important;
            }

            /* КРИТИЧЕСКИ ВАЖНО: Все элементы меню должны иметь pointer-events: auto */
            #main-menu * {
                pointer-events: auto !important;
            }

            /* Исключение для фона меню */
            #main-menu .menu-bg {
                pointer-events: none !important;
            }

            /* КРИТИЧЕСКИ ВАЖНО: Кнопки должны быть кликабельными */
            #main-menu button,
            #main-menu .menu-btn {
                pointer-events: auto !important;
                cursor: pointer !important;
                z-index: 100001 !important;
                position: relative;
                touch-action: manipulation !important;
            }

            /* АБСОЛЮТНАЯ БЛОКИРОВКА CANVAS - canvas НИКОГДА не должен перехватывать события когда меню видимо */
            body:has(#main-menu:not(.hidden)) #gameCanvas,
            body.menu-visible #gameCanvas {
                pointer-events: none !important;
                z-index: -1 !important;
            }

            #main-menu.hidden {
                display: none !important;
            }

            /* КРИТИЧЕСКИ ВАЖНО: Canvas должен быть ниже меню по z-index */
            #gameCanvas {
                z-index: 0 !important;
            }

            /* АБСОЛЮТНАЯ БЛОКИРОВКА: Canvas ВСЕГДА заблокирован когда меню видимо */
            #main-menu:not(.hidden) ~ #gameCanvas,
            body:has(#main-menu:not(.hidden)) #gameCanvas,
            #gameCanvas[data-menu-blocked="true"] {
                pointer-events: none !important;
            }

            /* Разрешаем canvas только когда меню скрыто И body не имеет класса menu-visible */
            body:not(.menu-visible) #main-menu.hidden ~ #gameCanvas,
            body:not(.menu-visible):has(#main-menu.hidden) #gameCanvas {
                pointer-events: auto !important;
            }

            .menu-bg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background:
                    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,40,0,0.05) 2px, rgba(0,40,0,0.05) 4px),
                    radial-gradient(ellipse at 50% 50%, rgba(0,60,0,0.3) 0%, transparent 70%),
                    #000;
                pointer-events: none;
            }

            .menu-content {
                position: relative;
                text-align: center;
                z-index: 100000 !important;
                width: 90%;
                max-width: min(800px, 90vw);
                max-height: 90vh;
                padding: clamp(10px, 2vh, 20px);
                display: flex;
                flex-direction: column;
                gap: clamp(8px, 1.5vh, 15px);
                overflow: hidden;
                pointer-events: auto !important;
                margin: 0 auto;
                transition: transform 0.3s ease;
            }

            /* Смещение меню когда лобби развернуто */
            .menu-content.lobby-open {
                transform: translateX(180px);
            }

            /* Scrollable область: от блока опыта до блока управления */
            .menu-scrollable {
                display: flex;
                flex-direction: column;
                gap: clamp(8px, 1.5vh, 15px);
                overflow-y: auto;
                flex: 1;
                min-height: 0; /* Важно для flex scroll */
                margin-right: -15px; /* Сдвигаем скроллбар правее */
                padding-right: 15px; /* Компенсируем отступ для контента */
            }

            .menu-scrollable,
            .panel-content,
            .skill-tree-wrapper {
                scrollbar-width: thin;
                scrollbar-color: #0f0 rgba(0,255,80,0.08);
            }

            .menu-scrollable::-webkit-scrollbar,
            .panel-content::-webkit-scrollbar,
            .skill-tree-wrapper::-webkit-scrollbar {
                width: clamp(6px, 0.5vw, 8px);
                height: clamp(6px, 0.5vw, 8px);
            }

            .menu-scrollable::-webkit-scrollbar-track,
            .panel-content::-webkit-scrollbar-track,
            .skill-tree-wrapper::-webkit-scrollbar-track {
                background: rgba(0,255,80,0.05);
            }

            .menu-scrollable::-webkit-scrollbar-thumb,
            .panel-content::-webkit-scrollbar-thumb,
            .skill-tree-wrapper::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, #0f0, #6f6);
                box-shadow: 0 0 8px rgba(0,255,80,0.6);
            }

            /* Скрываем полосы прокрутки у древа навыков визуально, оставляя скролл жестами */
            .skill-tree-wrapper {
                scrollbar-width: none;
            }

            .skill-tree-wrapper::-webkit-scrollbar {
                display: none;
            }

            .skill-tree-wrapper.dragging {
                cursor: grabbing;
            }

            .menu-header {
                margin-bottom: 10px;
            }

            .logo-text {
                font-size: clamp(20px, 3vw, 32px);
                color: #0f0;
                letter-spacing: clamp(2px, 0.3vw, 4px);
                margin-bottom: clamp(4px, 0.8vh, 8px);
                text-shadow: 0 0 6px #0f0, 0 0 10px #0f0;
            }

            .logo-text .accent {
                color: #0f0;
            }

            /* === LOGO HOVER ANIMATION (как у кнопок редакторов) === */
            .logo-hoverable {
                position: relative;
                display: inline-block;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .logo-construction-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: repeating-linear-gradient(
                    -45deg,
                    rgba(255, 204, 0, 0.9),
                    rgba(255, 204, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 20px
                );
                background-size: 28.28px 28.28px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                z-index: 10;
            }

            .logo-hoverable:hover .logo-construction-overlay {
                opacity: 1;
                animation: construction-slide 0.5s linear infinite;
            }

            .logo-hoverable:hover {
                text-shadow: 0 0 15px #ffcc00, 0 0 25px #ffcc00;
                color: #ffcc00;
            }

            .logo-construction-text {
                background: rgba(0, 0, 0, 0.85);
                color: #ffcc00;
                padding: 6px 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: clamp(6px, 0.9vw, 9px);
                text-align: center;
                text-shadow: 0 0 5px #ffcc00, 0 0 10px #ffcc00;
                border: 2px solid #ffcc00;
                box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
                letter-spacing: 1px;
                animation: construction-pulse 0.8s ease-in-out infinite;
            }

            .menu-subtitle {
                font-size: clamp(8px, 1vw, 10px);
                color: #0a0;
                letter-spacing: clamp(2px, 0.3vw, 4px);
            }

            .player-card {
                background: rgba(0, 30, 0, 0.8);
                border: 2px solid #0f0;
                padding: clamp(10px, 1.5vh, 15px);
                margin-bottom: clamp(5px, 1vh, 10px);
            }

            .auth-section {
                background: none;
                border: none;
                padding: 0;
                margin-bottom: clamp(5px, 1vh, 10px);
                display: flex;
                flex-direction: column;
                align-items: stretch;
                box-shadow: none;
            }

            .auth-info {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 100%;
            }

            .auth-user-info {
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: #0f0;
                font-size: clamp(11px, 1.3vw, 13px);
                width: 100%;
            }

            .auth-username {
                font-weight: bold;
            }

            .auth-status {
                font-size: clamp(14px, 1.5vw, 16px);
                margin-left: 8px;
            }

            .auth-buttons {
                display: flex;
                gap: 12px;
                width: 100%;
                align-items: stretch;
                background: none !important;
                border: none !important;
                outline: none !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
            }

            .auth-buttons {
                display: flex;
                gap: 10px;
            }

            .auth-buttons .menu-btn {
                flex: 1;
                min-width: 0;
            }

            .player-level-row {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 10px;
            }

            .level-badge {
                width: clamp(40px, 5vw, 50px);
                height: clamp(40px, 5vw, 50px);
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-size: clamp(16px, 2vw, 20px);
                display: flex;
                align-items: center;
                justify-content: center;
                text-shadow: 0 0 5px #0f0;
            }

            .xp-section {
                flex: 1;
                display: flex;
                flex-direction: column;
            }

            .xp-bar-bg {
                height: 12px;
                background: #020;
                border: 2px solid #0f0;
                margin-bottom: 5px;
            }

            .xp-bar-fill {
                height: 100%;
                background: #0f0;
                box-shadow: 0 0 10px #0f0;
                width: 0%;
            }

            .xp-text {
                font-size: 10px;
                color: #fff;
                text-align: right;
                text-shadow:
                    0 0 3px #000,
                    0 0 6px #000,
                    1px 1px 0 #000,
                    -1px -1px 0 #000,
                    1px -1px 0 #000,
                    -1px 1px 0 #000;
                font-weight: bold;
            }

            .player-callsign {
                font-size: 10px;
                color: #0ff;
                text-shadow: 0 0 4px rgba(0, 255, 255, 0.6);
                font-weight: bold;
                white-space: nowrap;
                padding: 0;
                background: none;
                border: none;
                text-align: left;
                margin-top: 4px;
                align-self: flex-start;
            }

            .player-stats-row {
                display: flex;
                justify-content: space-around;
            }

            .stat-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #0f0;
            }

            .stat-icon {
                font-size: 16px;
            }

            .menu-buttons {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 15px;
                width: 100%;
            }

            .main-buttons,
            .pause-buttons {
                width: 100%;
            }

            .btn-row {
                display: flex;
                gap: 10px;
                width: 100%;
            }

            .btn-row .menu-btn {
                flex: 1 1 0; /* Равное распределение ширины */
                min-width: 0; /* Позволяет сжиматься */
            }

            .menu-btn {
                flex: 1;
                padding: clamp(10px, 1.5vh, 15px) clamp(15px, 2vw, 20px);
                font-family: 'Press Start 2P', monospace;
                font-size: clamp(10px, 1.2vw, 12px);
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer !important;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: clamp(5px, 1vw, 10px);
                position: relative;
                pointer-events: auto !important;
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                z-index: 100000 !important;
            }

            .menu-btn:hover {
                background: #0f0;
                color: #000;
                box-shadow: 0 0 20px #0f0;
            }

            /* === UNDER CONSTRUCTION ANIMATION === */
            .under-construction-btn {
                position: relative;
                overflow: hidden;
            }

            .under-construction-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: repeating-linear-gradient(
                    -45deg,
                    rgba(255, 204, 0, 0.9),
                    rgba(255, 204, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 20px
                );
                background-size: 28.28px 28.28px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                z-index: 10;
            }

            .under-construction-btn:hover .under-construction-overlay {
                opacity: 1;
                animation: construction-slide 0.5s linear infinite;
            }

            @keyframes construction-slide {
                0% { background-position: 0 0; }
                100% { background-position: 28.28px 0; }
            }

            .under-construction-text {
                background: rgba(0, 0, 0, 0.85);
                color: #ffcc00;
                padding: 6px 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: clamp(6px, 0.9vw, 9px);
                text-align: center;
                text-shadow: 0 0 5px #ffcc00, 0 0 10px #ffcc00;
                border: 2px solid #ffcc00;
                box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
                letter-spacing: 1px;
                animation: construction-pulse 0.8s ease-in-out infinite;
            }

            @keyframes construction-pulse {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                }
                50% {
                    opacity: 0.8;
                    transform: scale(1.02);
                }
            }

            /* Убираем стандартный hover для кнопок "under construction" */
            .under-construction-btn:hover {
                background: #000 !important;
                color: #0f0 !important;
                box-shadow: 0 0 15px #ffcc00 !important;
                border-color: #ffcc00 !important;
            }

            .menu-btn.play-btn {
                /* Размеры такие же как у других кнопок для симметрии */
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }

            .menu-btn.fullscreen-btn {
                width: 100%;
                padding: 12px 20px;
                margin-top: 5px;
                background: rgba(0, 40, 0, 0.6);
                border-color: #0a0;
                font-size: 11px;
            }

            .menu-btn.fullscreen-btn:hover {
                background: #0a0;
                border-color: #0f0;
            }

            .btn-icon {
                font-size: 16px;
                flex-shrink: 0;
            }

            .btn-label {
                font-size: clamp(10px, 1.2vw, 12px) !important;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .btn-badge {
                position: absolute;
                top: -8px;
                right: -8px;
                background: #f00;
                color: #fff;
                font-size: 8px;
                padding: 4px 6px;
                display: none;
            }

            .btn-badge.visible { display: block; }

            .menu-footer {
                color: #0f0;
                font-size: 8px;
                margin-bottom: 0; /* Убираем отступ снизу */
            }

            .controls-panel {
                background: rgba(0, 30, 0, 0.8);
                border: 2px solid #0f0;
                padding: 15px;
            }

            .controls-title {
                font-size: 12px;
                color: #0f0;
                text-align: center;
                margin-bottom: 15px;
                text-shadow: 0 0 5px #0f0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                cursor: pointer;
            }

            .controls-toggle-btn {
                background: rgba(0, 255, 0, 0.2);
                border: 1px solid #0f0;
                color: #0f0;
                font-size: 10px;
                padding: 2px 6px;
                cursor: pointer;
                border-radius: 3px;
                transition: all 0.2s;
            }

            .controls-toggle-btn:hover {
                background: rgba(0, 255, 0, 0.4);
            }

            .controls-grid.collapsed {
                display: none !important;
            }

            .controls-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(170px, 1fr));
                gap: 10px;
            }

            @media (max-width: 900px) {
                .controls-grid { grid-template-columns: repeat(2, minmax(min(150px, 30vw), 1fr)); }
                .logo-text { font-size: clamp(18px, 4vw, 24px); }
                .construction-text { font-size: clamp(5px, 0.7vw, 8px); }
                .menu-content { padding: clamp(8px, 1.5vh, 10px); }
            }

            .control-category {
                background: #000;
                padding: 10px;
                border: 1px solid #0f0;
            }

            .category-header {
                font-size: 8px;
                color: #0f0;
                margin-bottom: 8px;
                padding-bottom: 5px;
                border-bottom: 1px solid #0f0;
                text-align: center;
            }

            .control-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 5px;
                margin-bottom: 6px;
            }

            .control-item:last-child { margin-bottom: 0; }

            .key {
                background: #0f0;
                color: #000;
                padding: 4px 8px;
                font-size: 8px;
                font-family: 'Press Start 2P', monospace;
                min-width: 40px;
                text-align: center;
            }

            .control-desc {
                color: #0f0;
                font-size: 7px;
                text-align: right;
                flex: 1;
            }

            /* Лобби игроков */
            .lobby-panel {
                position: fixed;
                top: 20px;
                left: 20px;
                width: 360px;
                max-width: calc(100vw - 40px);
                height: calc(100vh - 40px);
                max-height: calc(100vh - 40px);
                background: rgba(0, 30, 0, 0.8);
                border: 2px solid #0f0;
                border-radius: 5px;
                padding: 10px;
                z-index: 100001;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
                font-family: 'Press Start 2P', monospace;
                pointer-events: auto !important;
                overflow: hidden;
                box-sizing: border-box;
                transition: width 0.3s ease, height 0.3s ease;
            }

            .lobby-panel.collapsed {
                width: 48px;
                height: 48px;
                min-height: 48px;
                padding: 0;
                cursor: pointer;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .lobby-panel.collapsed .lobby-content,
            .lobby-panel.collapsed .lobby-tabs,
            .lobby-panel.collapsed .lobby-status-bar,
            .lobby-panel.collapsed .lobby-header-right,
            .lobby-panel.collapsed .lobby-title,
            .lobby-panel.collapsed .lobby-toggle-btn {
                display: none !important;
            }

            .lobby-panel.collapsed .lobby-header {
                margin: 0;
                padding: 0;
                border: none;
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .lobby-collapsed-icon {
                display: none;
                font-size: 24px;
                color: #0f0;
                text-shadow: 0 0 12px #0f0;
                cursor: pointer;
            }

            .lobby-panel.collapsed .lobby-collapsed-icon {
                display: block !important;
            }

            .lobby-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(0, 255, 0, 0.3);
                flex-shrink: 0;
            }

            .lobby-title {
                color: #0f0;
                font-size: 11px;
                text-shadow: 0 0 5px #0f0;
            }

            .lobby-header-right {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .lobby-count {
                color: #0ff;
                font-size: 10px;
                background: rgba(0, 255, 255, 0.2);
                padding: 4px 8px;
                border-radius: 3px;
                border: 1px solid rgba(0, 255, 255, 0.4);
            }

            .lobby-refresh-btn {
                background: rgba(0, 30, 0, 0.6);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #0f0;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
            }

            .lobby-toggle-btn {
                background: rgba(0, 30, 0, 0.6);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #0f0;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
                margin-right: 8px;
                flex-shrink: 0;
            }

            .lobby-toggle-btn:hover,
            .lobby-refresh-btn:hover {
                background: rgba(0, 50, 0, 0.8);
                border-color: rgba(0, 255, 0, 0.6);
                box-shadow: 0 0 5px rgba(0, 255, 0, 0.4);
            }

            .lobby-toggle-btn:active,
            .lobby-refresh-btn:active {
                transform: scale(0.95);
            }


            .lobby-refresh-btn:hover {
                background: rgba(0, 50, 0, 0.8);
                border-color: rgba(0, 255, 0, 0.6);
                box-shadow: 0 0 5px rgba(0, 255, 0, 0.4);
            }

            .lobby-refresh-btn:active {
                transform: scale(0.95);
            }

            .lobby-auto-refresh-toggle {
                background: rgba(0, 30, 0, 0.6);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #0f0;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
            }

            .lobby-auto-refresh-toggle:hover {
                background: rgba(0, 50, 0, 0.8);
                border-color: rgba(0, 255, 0, 0.6);
                box-shadow: 0 0 5px rgba(0, 255, 0, 0.4);
            }

            .lobby-auto-refresh-toggle:active {
                transform: scale(0.95);
            }

            .lobby-auto-refresh-toggle.disabled {
                opacity: 0.5;
                color: #7f7;
                border-color: rgba(0, 255, 0, 0.2);
            }

            .lobby-status-bar {
                padding: 4px 8px;
                margin-bottom: 6px;
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
                flex-shrink: 0;
            }

            .lobby-last-update {
                color: #7f7;
                font-size: 7px;
                opacity: 0.8;
            }

            .lobby-tabs {
                display: flex;
                gap: 4px;
                margin-bottom: 8px;
                flex-shrink: 0;
            }

            .lobby-tab {
                flex: 1;
                padding: 6px 10px;
                background: rgba(0, 20, 0, 0.6);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #7f7;
                font-size: 8px;
                cursor: pointer;
                transition: all 0.2s;
                border-radius: 3px;
                font-family: 'Press Start 2P', monospace;
            }

            .lobby-tab:hover {
                background: rgba(0, 40, 0, 0.7);
                border-color: rgba(0, 255, 0, 0.6);
                color: #0f0;
            }

            .lobby-tab.active {
                background: rgba(0, 255, 4, 0.2);
                border-color: #0f0;
                color: #0f0;
            }

            .lobby-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
                display: flex;
                flex-direction: column;
                width: 100%;
                box-sizing: border-box;
            }

            /* === LOBBY CHAT === */
            .lobby-chat {
                border-top: 1px solid rgba(0, 255, 0, 0.3);
                display: flex;
                flex-direction: column;
                max-height: 180px;
                min-height: 100px;
                flex-shrink: 0;
            }

            .lobby-chat.collapsed {
                max-height: 28px;
                min-height: 28px;
            }

            .lobby-chat.collapsed .lobby-chat-messages,
            .lobby-chat.collapsed .lobby-chat-input-container {
                display: none !important;
            }

            .lobby-chat-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 8px;
                background: rgba(0, 40, 0, 0.6);
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
                flex-shrink: 0;
            }

            .lobby-chat-title {
                font-size: 8px;
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }

            .lobby-chat-toggle {
                background: transparent;
                border: none;
                color: #0f0;
                font-size: 10px;
                cursor: pointer;
                padding: 2px 6px;
                transition: transform 0.2s;
            }

            .lobby-chat-toggle:hover {
                text-shadow: 0 0 5px #0f0;
            }

            .lobby-chat.collapsed .lobby-chat-toggle {
                transform: rotate(180deg);
            }

            .lobby-chat-messages {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 6px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                font-size: 7px;
                background: rgba(0, 10, 0, 0.4);
            }

            .lobby-chat-messages::-webkit-scrollbar {
                width: 4px;
            }

            .lobby-chat-messages::-webkit-scrollbar-track {
                background: rgba(0, 20, 0, 0.3);
            }

            .lobby-chat-messages::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 0, 0.3);
                border-radius: 2px;
            }

            .lobby-chat-welcome {
                color: rgba(0, 255, 0, 0.5);
                font-style: italic;
                text-align: center;
                padding: 8px;
            }

            .lobby-chat-message {
                display: flex;
                gap: 6px;
                padding: 3px 0;
                border-bottom: 1px solid rgba(0, 255, 0, 0.1);
            }

            .lobby-chat-message:last-child {
                border-bottom: none;
            }

            .lobby-chat-time {
                color: rgba(0, 255, 0, 0.4);
                flex-shrink: 0;
                font-size: 6px;
            }

            .lobby-chat-sender {
                color: #0ff;
                font-weight: bold;
                flex-shrink: 0;
                max-width: 80px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .lobby-chat-sender.self {
                color: #ff0;
            }

            .lobby-chat-text {
                color: #0f0;
                word-break: break-word;
                flex: 1;
            }

            .lobby-chat-input-container {
                display: flex;
                gap: 4px;
                padding: 6px;
                background: rgba(0, 20, 0, 0.5);
                border-top: 1px solid rgba(0, 255, 0, 0.2);
                flex-shrink: 0;
            }

            .lobby-chat-input {
                flex: 1;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #0f0;
                padding: 6px 8px;
                font-size: 8px;
                font-family: 'Press Start 2P', monospace;
                border-radius: 3px;
            }

            .lobby-chat-input:focus {
                outline: none;
                border-color: #0f0;
                box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
            }

            .lobby-chat-input::placeholder {
                color: rgba(0, 255, 0, 0.4);
            }

            .lobby-chat-send {
                background: rgba(0, 80, 0, 0.6);
                border: 1px solid rgba(0, 255, 0, 0.4);
                color: #0f0;
                padding: 6px 10px;
                font-size: 10px;
                cursor: pointer;
                border-radius: 3px;
                transition: all 0.2s;
            }

            .lobby-chat-send:hover {
                background: rgba(0, 120, 0, 0.8);
                border-color: #0f0;
                box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
            }

            .lobby-chat-send:active {
                transform: scale(0.95);
            }

            .lobby-panel.collapsed .lobby-chat {
                display: none !important;
            }

            .lobby-tab-content {
                display: none;
                flex: 1;
                flex-direction: column;
                min-height: 0;
            }

            .lobby-tab-content.active {
                display: flex;
            }

            .lobby-filters {
                padding: 6px;
                background: rgba(0, 20, 0, 0.4);
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
                flex-shrink: 0;
            }

            .lobby-search-input {
                width: 100%;
                max-width: 100%;
                padding: 6px 10px;
                margin-bottom: 6px;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 3px;
                color: #0f0;
                font-size: 8px;
                font-family: 'Press Start 2P', monospace;
                outline: none;
                transition: border-color 0.2s;
                box-sizing: border-box;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .lobby-search-input:focus {
                border-color: rgba(0, 255, 0, 0.6);
                box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
            }

            .lobby-search-input::placeholder {
                color: #7f7;
                opacity: 0.6;
            }

            .lobby-filter-row {
                display: flex;
                gap: 4px;
                width: 100%;
                box-sizing: border-box;
                overflow: hidden;
            }

            .lobby-filter-select {
                flex: 1;
                min-width: 0;
                padding: 5px 8px;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 3px;
                color: #0f0;
                font-size: 7px;
                font-family: 'Press Start 2P', monospace;
                outline: none;
                cursor: pointer;
                transition: border-color 0.2s;
                box-sizing: border-box;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .lobby-filter-select:hover {
                border-color: rgba(0, 255, 0, 0.5);
            }

            .lobby-filter-select:focus {
                border-color: rgba(0, 255, 0, 0.6);
                box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
            }

            .lobby-list-container {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
                width: 100%;
                box-sizing: border-box;
            }

            .lobby-empty {
                text-align: center;
                color: #7f7;
                font-size: 8px;
                padding: 20px;
                opacity: 0.6;
            }

            .lobby-player-item,
            .lobby-room-item {
                padding: 6px;
                margin-bottom: 4px;
                background: rgba(0, 20, 0, 0.5);
                border: 1px solid rgba(0, 255, 0, 0.2);
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
                overflow: hidden;
            }

            .lobby-player-item:hover,
            .lobby-room-item:hover {
                background: rgba(0, 40, 0, 0.7);
                border-color: rgba(0, 255, 0, 0.5);
                transform: translateX(2px);
            }

            .lobby-player-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3px;
                width: 100%;
                min-width: 0;
                gap: 4px;
            }

            .lobby-player-avatar {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 8px;
                color: #000;
                font-weight: bold;
                flex-shrink: 0;
                border: 2px solid rgba(0, 255, 0, 0.5);
                margin-right: 6px;
            }

            .lobby-player-name-row {
                display: flex;
                align-items: center;
                gap: 6px;
                flex: 1;
                min-width: 0;
            }

            .lobby-player-name {
                color: #0f0;
                font-size: 9px;
                font-weight: bold;
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .lobby-friend-badge {
                color: #ffc800;
                font-size: 7px;
                margin-left: 4px;
            }

            .lobby-player-level {
                color: #0ff;
                font-size: 8px;
                background: rgba(0, 255, 255, 0.2);
                padding: 3px 6px;
                border-radius: 2px;
                border: 1px solid rgba(0, 255, 255, 0.4);
            }

            .lobby-player-online-status {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .lobby-player-stats-row {
                display: flex;
                gap: 6px;
                margin: 4px 0;
                flex-wrap: wrap;
                width: 100%;
                box-sizing: border-box;
            }

            .lobby-player-stat {
                display: flex;
                align-items: center;
                gap: 3px;
                font-size: 7px;
            }

            .lobby-stat-label {
                color: #7f7;
            }

            .lobby-stat-value {
                color: #0ff;
                font-weight: bold;
            }

            .lobby-rank-bronze {
                color: #cd7f32;
            }

            .lobby-rank-silver {
                color: #c0c0c0;
            }

            .lobby-rank-gold {
                color: #ffd700;
            }

            .lobby-rank-platinum {
                color: #e5e4e2;
            }

            .lobby-rank-diamond {
                color: #b9f2ff;
            }

            .lobby-rank-master {
                color: #ff6b9d;
            }

            .lobby-rank-legend {
                color: #ff0000;
            }

            .lobby-player-details {
                margin-top: 4px;
                padding-top: 4px;
                border-top: 1px solid rgba(0, 255, 0, 0.1);
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .lobby-player-detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 7px;
            }

            .lobby-detail-label {
                color: #7f7;
            }

            .lobby-detail-value {
                color: #0ff;
            }

            .lobby-status-dot {
                width: 5px;
                height: 5px;
                background: #0f0;
                border-radius: 50%;
                box-shadow: 0 0 3px rgba(0, 255, 0, 0.8);
                animation: lobby-status-pulse 2s ease-in-out infinite;
            }

            @keyframes lobby-status-pulse {
                0%, 100% {
                    opacity: 1;
                    box-shadow: 0 0 3px rgba(0, 255, 0, 0.8);
                }
                50% {
                    opacity: 0.7;
                    box-shadow: 0 0 6px rgba(0, 255, 0, 1);
                }
            }

            .lobby-status-text {
                color: #0f0;
                font-size: 6px;
                font-weight: normal;
            }

            .lobby-player-info {
                color: #7f7;
                font-size: 7px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }

            .lobby-player-room {
                color: #0ff;
            }

            .lobby-player-status {
                color: #7f7;
            }

            .lobby-room-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3px;
                width: 100%;
                min-width: 0;
                gap: 4px;
            }

            .lobby-room-id {
                color: #0f0;
                font-size: 9px;
                font-weight: bold;
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .lobby-room-mode {
                color: #0ff;
                font-size: 7px;
                background: rgba(0, 255, 255, 0.2);
                padding: 3px 5px;
                border-radius: 2px;
            }

            .lobby-room-info {
                color: #7f7;
                font-size: 7px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 3px;
                margin-bottom: 4px;
                width: 100%;
                min-width: 0;
                gap: 4px;
            }

            .lobby-room-players-row {
                display: flex;
                align-items: center;
                gap: 6px;
                flex: 1;
            }

            .lobby-room-players {
                color: #0ff;
                font-size: 8px;
                min-width: 50px;
            }

            .lobby-room-progress {
                flex: 1;
                height: 4px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 2px;
                overflow: hidden;
                border: 1px solid rgba(0, 255, 0, 0.2);
            }

            .lobby-room-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #0f0, #0ff);
                transition: width 0.3s ease;
                box-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
            }

            .lobby-room-status {
                color: #7f7;
            }

            .lobby-room-status.active {
                color: #f00;
            }

            .lobby-join-btn {
                width: 100%;
                margin-top: 4px;
                padding: 6px;
                background: linear-gradient(180deg, rgba(0, 255, 4, 0.3), rgba(0, 255, 4, 0.1));
                border: 1px solid rgba(0, 255, 4, 0.8);
                border-radius: 3px;
                color: #0f0;
                font-size: 8px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 4px rgba(0, 255, 4, 0.5);
            }

            .lobby-join-btn:hover {
                background: linear-gradient(180deg, rgba(0, 255, 4, 0.5), rgba(0, 255, 4, 0.3));
                border-color: #0f0;
                box-shadow: 0 0 15px rgba(0, 255, 4, 0.5);
                transform: scale(1.02);
            }

            .lobby-join-btn:active {
                background: rgba(0, 255, 4, 0.6);
                transform: scale(0.98);
                box-shadow: 0 0 20px rgba(0, 255, 4, 0.8);
            }

            .lobby-player-buttons {
                display: flex;
                gap: 4px;
                margin-top: 4px;
                flex-wrap: wrap;
                width: 100%;
                box-sizing: border-box;
            }

            .lobby-message-btn {
                flex: 1;
                min-width: 0;
                padding: 6px;
                background: linear-gradient(180deg, rgba(0, 150, 255, 0.3), rgba(0, 150, 255, 0.1));
                border: 1px solid rgba(0, 150, 255, 0.8);
                border-radius: 3px;
                color: #0ff;
                font-size: 7px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 4px rgba(0, 150, 255, 0.5);
                box-sizing: border-box;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .lobby-message-btn:hover {
                background: linear-gradient(180deg, rgba(0, 150, 255, 0.5), rgba(0, 150, 255, 0.3));
                border-color: #0ff;
                box-shadow: 0 0 15px rgba(0, 150, 255, 0.5);
                transform: scale(1.02);
            }

            .lobby-message-btn:active {
                background: rgba(0, 150, 255, 0.6);
                transform: scale(0.98);
                box-shadow: 0 0 20px rgba(0, 150, 255, 0.8);
            }

            .lobby-invite-btn {
                flex: 1;
                min-width: 0;
                padding: 6px;
                background: linear-gradient(180deg, rgba(255, 200, 0, 0.3), rgba(255, 200, 0, 0.1));
                border: 1px solid rgba(255, 200, 0, 0.8);
                border-radius: 3px;
                color: #ffc800;
                font-size: 7px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 4px rgba(255, 200, 0, 0.5);
                box-sizing: border-box;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .lobby-invite-btn:hover {
                background: linear-gradient(180deg, rgba(255, 200, 0, 0.5), rgba(255, 200, 0, 0.3));
                border-color: #ffc800;
                box-shadow: 0 0 15px rgba(255, 200, 0, 0.5);
                transform: scale(1.02);
            }

            .lobby-invite-btn:active {
                background: rgba(255, 200, 0, 0.6);
                transform: scale(0.98);
                box-shadow: 0 0 20px rgba(255, 200, 0, 0.8);
            }

            .lobby-friend-btn {
                flex: 1;
                min-width: 0;
                padding: 5px;
                background: linear-gradient(180deg, rgba(255, 100, 200, 0.3), rgba(255, 100, 200, 0.1));
                border: 1px solid rgba(255, 100, 200, 0.8);
                border-radius: 3px;
                color: #ff64c8;
                font-size: 6px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 4px rgba(255, 100, 200, 0.5);
            }

            .lobby-friend-btn:hover {
                background: linear-gradient(180deg, rgba(255, 100, 200, 0.5), rgba(255, 100, 200, 0.3));
                border-color: #ff64c8;
                box-shadow: 0 0 15px rgba(255, 100, 200, 0.5);
                transform: scale(1.02);
            }

            .lobby-friend-btn:active {
                background: rgba(255, 100, 200, 0.6);
                transform: scale(0.98);
                box-shadow: 0 0 20px rgba(255, 100, 200, 0.8);
            }

            .lobby-friend-btn.added {
                background: rgba(0, 255, 0, 0.3);
                border-color: rgba(0, 255, 0, 0.6);
                color: #0f0;
                opacity: 0.7;
                cursor: default;
            }

            .lobby-room-full {
                width: 100%;
                margin-top: 4px;
                padding: 6px;
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.5);
                border-radius: 3px;
                color: #f00;
                font-size: 7px;
                text-align: center;
                font-family: 'Press Start 2P', monospace;
                opacity: 0.7;
            }

            .lobby-room-details {
                margin-top: 4px;
                padding-top: 4px;
                border-top: 1px solid rgba(0, 255, 0, 0.1);
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .lobby-room-detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 7px;
            }

            .lobby-room-badge {
                display: inline-block;
                padding: 2px 4px;
                border-radius: 2px;
                font-size: 6px;
                margin-top: 2px;
            }

            .lobby-room-private {
                background: rgba(255, 200, 0, 0.2);
                color: #ffc800;
                border: 1px solid rgba(255, 200, 0, 0.4);
            }

            .lobby-room-password {
                background: rgba(0, 150, 255, 0.2);
                color: #0096ff;
                border: 1px solid rgba(0, 150, 255, 0.4);
            }

            .lobby-content::-webkit-scrollbar {
                width: 6px;
            }

            .lobby-content::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.3);
            }

            .lobby-content::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, #0f0, #6f6);
                border-radius: 3px;
            }

            .lobby-content::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(180deg, #0f0, #8f8);
            }

            .lobby-group-header {
                padding: 5px 10px;
                margin: 12px 0 6px 0;
                background: rgba(0, 255, 0, 0.1);
                border-left: 3px solid #0f0;
                color: #0f0;
                font-size: 7px;
                font-weight: bold;
                text-transform: uppercase;
            }

            .lobby-group-separator {
                height: 1px;
                background: rgba(0, 255, 0, 0.2);
                margin: 6px 0;
            }

            .version {
                color: #0a0;
                font-size: 7px;
                margin-top: 4px;
                text-align: center;
                opacity: 0.8;
            }

            /* Panels */
            .panel-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.95) !important;
                display: none !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100002 !important; /* Выше чем меню (99999) */
                pointer-events: auto !important;
            }

            /* Прозрачность фона меню когда игра запущена (в битве) */
            .panel-overlay.in-battle,
            #main-menu.in-battle {
                background: rgba(0, 0, 0, 0.5) !important;
            }

            #main-menu.in-battle .menu-bg {
                background: rgba(0, 0, 0, 0.5) !important;
            }

            .panel-overlay.visible {
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            /* Fix top anchor for settings panel so content doesn't shift vertically when tabs change */
            #settings-panel.panel-overlay {
                align-items: flex-start !important;
                padding-top: 40px !important;
            }

            .panel-content {
                background: #000;
                border: 2px solid #0f0;
                padding: 25px;
                max-width: min(90vw, 1600px);
                max-height: min(90vh, 900px);
                width: min(90vw, 1600px);
                overflow-y: auto;
                position: relative;
                font-family: 'Press Start 2P', monospace;
            }

            /* Меню навыков должно быть ещё шире */
            #skills-panel .panel-content {
                max-width: min(95vw, 1700px);
                width: min(95vw, 1700px);
                max-height: min(95vh, 956px);
                display: flex;
                flex-direction: column;
            }

            /* Панель выбора карт - расширенная для сетки */
            #map-selection-panel .panel-content {
                max-width: min(95vw, 1050px);
                width: min(95vw, 1050px);
                max-height: min(95vh, 850px);
            }

            /* Сетка карт */
            .map-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-top: 20px;
            }

            /* Карточка карты */
            .map-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                padding: 15px 10px;
                background: rgba(0, 20, 0, 0.4);
                border: 2px solid rgba(0, 255, 80, 0.3);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 140px;
                text-align: center;
            }

            .map-card:hover {
                background: rgba(0, 40, 0, 0.6);
                border-color: #0f0;
                box-shadow: 0 0 15px rgba(0, 255, 80, 0.4);
                transform: translateY(-2px);
            }

            .map-card.recommended {
                border-color: #0f0;
                background: rgba(0, 40, 0, 0.5);
                box-shadow: 0 0 10px rgba(0, 255, 80, 0.2);
            }

            .map-card.recommended::before {
                content: "★";
                position: absolute;
                top: 5px;
                right: 8px;
                color: #0f0;
                font-size: 12px;
            }

            .map-card {
                position: relative;
            }

            .map-card-icon {
                font-size: 32px;
                margin-bottom: 8px;
                filter: drop-shadow(0 0 4px rgba(0, 255, 80, 0.5));
            }

            .map-card-name {
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                color: #0f0;
                margin-bottom: 6px;
                line-height: 1.3;
            }

            .map-card-desc {
                font-size: 8px;
                color: rgba(0, 255, 80, 0.7);
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .map-card-new {
                position: absolute;
                top: 5px;
                left: 5px;
                background: #f00;
                color: #fff;
                font-size: 7px;
                padding: 2px 5px;
                border-radius: 3px;
                font-family: 'Press Start 2P', monospace;
                animation: pulse-new 1.5s ease-in-out infinite;
            }

            @keyframes pulse-new {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.05); }
            }

            /* Адаптивность сетки карт */
            @media (max-width: 900px) {
                .map-grid {
                    grid-template-columns: repeat(3, 1fr);
                }
            }

            @media (max-width: 650px) {
                .map-grid {
                    grid-template-columns: repeat(2, 1fr);
                }

                .map-card {
                    min-height: 120px;
                    padding: 12px 8px;
                }

                .map-card-icon {
                    font-size: 28px;
                }

                .map-card-name {
                    font-size: 9px;
                }
            }

            /* Заголовок TX */
            .skills-main-title {
                font-size: 48px;
                color: #fff;
                text-align: center;
                margin-bottom: 10px;
                font-weight: bold;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
                font-family: 'Press Start 2P', monospace;
            }

            /* Вкладки категорий */
            .skill-category-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }

            .skill-category-tab {
                padding: 10px 16px;
                background: rgba(0, 20, 0, 0.3);
                border: 2px solid rgba(0, 255, 4, 0.3);
                color: #0f0;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                font-family: 'Press Start 2P', monospace;
                transition: all 0.2s;
                border-radius: 4px;
                white-space: nowrap;
            }

            .skill-category-tab:hover {
                background: rgba(0, 40, 0, 0.5);
                border-color: rgba(0, 255, 4, 0.6);
            }

            .skill-category-tab.active {
                background: rgba(0, 255, 4, 0.2);
                border-color: rgba(0, 255, 4, 0.8);
                color: #0f0;
                box-shadow: 0 0 10px rgba(0, 255, 4, 0.4);
            }

            /* Специальные цвета для разных вкладок */
            .skill-category-tab[data-category="attack"] {
                border-color: rgba(255, 0, 0, 0.5);
                color: #f00;
            }

            .skill-category-tab[data-category="attack"]:hover,
            .skill-category-tab[data-category="attack"].active {
                border-color: rgba(255, 0, 0, 0.8);
                background: rgba(255, 0, 0, 0.2);
                color: #f00;
            }

            .skill-category-tab[data-category="defense"] {
                border-color: rgba(0, 0, 255, 0.5);
                color: #00f;
            }

            .skill-category-tab[data-category="defense"]:hover,
            .skill-category-tab[data-category="defense"].active {
                border-color: rgba(0, 0, 255, 0.8);
                background: rgba(0, 0, 255, 0.2);
                color: #00f;
            }

            .skill-category-tab[data-category="mobility"] {
                border-color: rgba(0, 255, 255, 0.5);
                color: #0ff;
            }

            .skill-category-tab[data-category="mobility"]:hover,
            .skill-category-tab[data-category="mobility"].active {
                border-color: rgba(0, 255, 255, 0.8);
                background: rgba(0, 255, 255, 0.2);
                color: #0ff;
            }

            .skill-category-tab[data-category="tech"] {
                border-color: rgba(255, 255, 0, 0.5);
                color: #ff0;
            }

            .skill-category-tab[data-category="tech"]:hover,
            .skill-category-tab[data-category="tech"].active {
                border-color: rgba(255, 255, 0, 0.8);
                background: rgba(255, 255, 0, 0.2);
                color: #ff0;
            }

            .skill-category-tab[data-category="stealth"] {
                border-color: rgba(255, 140, 0, 0.5);
                color: #ff8c00;
            }

            .skill-category-tab[data-category="stealth"]:hover,
            .skill-category-tab[data-category="stealth"].active {
                border-color: rgba(255, 140, 0, 0.8);
                background: rgba(255, 140, 0, 0.2);
                color: #ff8c00;
            }

            .skill-category-tab[data-category="leadership"] {
                border-color: rgba(0, 255, 0, 0.5);
                color: #0f0;
            }

            .skill-category-tab[data-category="leadership"]:hover,
            .skill-category-tab[data-category="leadership"].active {
                border-color: rgba(0, 255, 0, 0.8);
                background: rgba(0, 255, 0, 0.2);
                color: #0f0;
            }

            .panel-title {
                font-size: 18px;
                color: #0f0;
                text-align: center;
                margin-bottom: 15px;
                text-shadow: 0 0 10px #0f0;
                font-weight: bold;
            }

            #skills-panel .panel-title {
                margin-bottom: 10px;
            }

            .play-menu-section {
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 8px;
                border: 1px solid rgba(90, 170, 136, 0.3);
            }

            .section-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #5a8;
                text-transform: uppercase;
            }

            .mode-buttons, .map-buttons, .tank-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            /* Многослойные окна шагов */
            .play-window {
                position: absolute;
                top: 40px;
                left: 40px;
                right: 40px;
                bottom: auto;
                max-height: calc(100vh - 80px);
                padding: 0 20px 20px 20px;
                background: rgba(0, 0, 0, 0.92);
                border: 2px solid #0f0;
                box-shadow: 10px 10px 0 rgba(0, 255, 0, 0.25);
                border-radius: 8px;
                display: none;
                flex-direction: column;
                gap: 12px;
                z-index: 100002;
                pointer-events: auto;
                overflow-y: auto;
                overflow-x: hidden;
            }

            .play-window.visible {
                display: flex !important;
            }

            /* Широкое окно для сетки карт */
            .play-window.play-window-wide {
                width: min(95vw, 950px) !important;
                left: 50% !important;
                right: auto !important;
                transform: translateX(-50%) !important;
            }

            /* Компактные карточки в play-window (без описаний) */
            .play-window .map-grid {
                margin-top: 15px;
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 10px;
            }

            .play-window .map-card {
                min-height: 80px;
                padding: 10px 6px;
            }

            .play-window .map-card-icon {
                font-size: 24px;
                margin-bottom: 4px;
            }

            .play-window .map-card-name {
                font-size: 8px;
                line-height: 1.2;
            }

            /* Адаптивность для play-window */
            @media (max-width: 800px) {
                .play-window .map-grid {
                    grid-template-columns: repeat(3, 1fr) !important;
                }
            }

            @media (max-width: 600px) {
                .play-window .map-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                }
            }

            /* Сетка режимов игры */
            .gamemode-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }

            .gamemode-btn {
                padding: 15px 10px !important;
                text-align: center;
            }

            .gamemode-btn .btn-icon {
                display: block;
                font-size: 24px;
                margin-bottom: 5px;
            }

            .gamemode-btn .btn-label {
                font-size: 10px;
            }

            @media (max-width: 600px) {
                .gamemode-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }

            .play-window-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 0 6px 0;
                border-bottom: 1px solid rgba(0,255,0,0.25);
                font-family: "Consolas","SFMono-Regular",monospace;
                color: #0f0;
            }

            .play-window-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 700;
                letter-spacing: 0.5px;
            }

            .window-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .window-btn {
                width: 26px;
                height: 26px;
                border: 1px solid #0f0;
                background: rgba(0,0,0,0.4);
                color: #0f0;
                cursor: pointer;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                transition: all 0.15s ease;
            }

            .window-btn:hover {
                background: rgba(0,255,0,0.1);
                box-shadow: 0 0 6px rgba(0,255,0,0.4);
            }

            .play-menu-section {
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 8px;
                border: 1px solid rgba(90, 170, 136, 0.3);
            }

            .section-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #5a8;
                text-transform: uppercase;
            }

            .mode-buttons, .map-buttons, .tank-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .panel-close {
                position: absolute !important;
                top: 10px !important;
                right: 10px !important;
                width: 30px !important;
                height: 30px !important;
                background: #000 !important;
                border: 2px solid #0f0 !important;
                color: #888 !important;
                font-size: 18px !important;
                cursor: pointer !important;
                transition: all 0.15s;
                pointer-events: auto !important;
                z-index: 100003 !important; /* Выше панели */
            }

            .panel-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }

            .setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .setting-label {
                color: #aaa;
                font-size: 14px;
                font-family: 'Press Start 2P', 'Courier New', monospace;
                letter-spacing: 0.5px;
            }

            .setting-value {
                display: flex;
                align-items: center;
                gap: 12px;
                color: #5a8;
            }

            .setting-range {
                width: 120px;
                -webkit-appearance: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                height: 6px;
            }

            .setting-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                background: #5a8;
                border-radius: 50%;
                cursor: pointer;
            }

            .setting-checkbox {
                width: 20px;
                height: 20px;
                cursor: pointer;
                accent-color: #0f0;
            }

            .setting-select {
                background: rgba(0, 0, 0, 0.6);
                color: #0f0;
                border: 1px solid #0a0;
                border-radius: 4px;
                padding: 5px 10px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                cursor: pointer;
                min-width: 100px;
            }

            .setting-select:hover {
                border-color: #0f0;
                background: rgba(0, 50, 0, 0.6);
            }

            .setting-select option {
                background: #0a0a0a;
                color: #0f0;
            }

            .lang-toggle {
                display: flex;
                gap: 5px;
            }

            .lang-btn {
                padding: 8px 16px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.15s;
            }

            .lang-btn:hover {
                background: rgba(0, 255, 0, 0.2);
            }

            .lang-btn.active {
                background: #0f0;
                color: #000;
            }

            /* Difficulty selector */
            .difficulty-selector {
                display: flex;
                gap: 5px;
            }

            .diff-btn {
                padding: 6px 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: 8px;
                background: rgba(0, 40, 0, 0.8);
                color: #0f0;
                border: 2px solid #0a0;
                cursor: pointer;
                transition: all 0.2s;
            }

            .diff-btn:hover {
                background: rgba(0, 80, 0, 0.8);
            }

            .diff-btn.active {
                box-shadow: 0 0 10px currentColor;
            }

            #diff-easy.active {
                background: #0a0;
                border-color: #0f0;
                color: #000;
            }

            /* Seed control */
            .seed-control {
                display: flex;
                gap: 5px;
                align-items: center;
            }

            .seed-input {
                width: 120px;
                padding: 6px 8px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                background: rgba(0, 20, 0, 0.9);
                color: #0f0;
                border: 2px solid #0a0;
                outline: none;
            }

            .seed-input:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .seed-input:focus {
                border-color: #0f0;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }

            .seed-btn {
                padding: 6px 10px;
                font-size: 14px;
                background: rgba(0, 40, 0, 0.8);
                color: #0f0;
                border: 2px solid #0a0;
                cursor: pointer;
                transition: all 0.2s;
            }

            .seed-btn:hover {
                background: rgba(0, 80, 0, 0.8);
                border-color: #0f0;
            }

            #diff-medium.active {
                background: #aa0;
                border-color: #ff0;
                color: #000;
            }

            #diff-hard.active {
                background: #a00;
                border-color: #f00;
                color: #fff;
            }

            .panel-buttons {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                justify-content: center;
            }

            #skills-panel .panel-buttons {
                margin-top: 15px;
            }

            #skills-panel .panel-btn {
                min-width: 200px;
                padding: 14px 24px;
                font-size: 12px;
            }

            .panel-btn {
                flex: 1;
                padding: 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.15s;
            }

            .panel-btn:hover {
                background: #0f0;
                color: #000;
            }

            .panel-btn.primary {
                background: #0f0;
                color: #000;
            }

            .panel-btn.primary:hover {
                background: #0a0;
                color: #0f0;
            }

            .menu-btn.danger {
                background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
                border: 2px solid #ff6666;
                color: #fff;
            }

            .menu-btn.danger:hover {
                background: linear-gradient(135deg, #ff6666 0%, #ff0000 100%);
                border-color: #ff8888;
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(255, 68, 68, 0.4);
            }

            .panel-btn.danger {
                border-color: #f00;
                color: #f00;
            }

            .panel-btn.danger:hover {
                background: #f00;
                color: #000;
            }

            /* Stats Panel */
            .stats-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }

            .stat-card {
                background: #000;
                border: 1px solid #0f0;
                padding: 15px;
                text-align: center;
            }

            .stat-value {
                font-size: 18px;
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }

            .stat-label {
                font-size: 8px;
                color: #0a0;
                margin-top: 5px;
            }

            /* Skills Panel - Tree */
            .skill-tree-wrapper {
                margin-top: 10px;
                background: linear-gradient(180deg, #062106, #020);
                border-top: 2px solid #0f0;
                border-left: none;
                border-right: none;
                border-bottom: none;
                padding: 16px;
                max-height: calc(95vh - 350px);
                min-height: 500px;
                overflow: auto;
                box-shadow: 0 0 20px rgba(0,255,100,0.15);
                cursor: grab;
                flex: 1;
            }

            .skill-tree-header {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: linear-gradient(180deg, rgba(0,30,0,0.98), rgba(0,15,0,0.95));
                border-bottom: 2px solid #0f0;
                box-shadow: 0 4px 20px rgba(0,0,0,0.8);
                margin-bottom: 10px;
            }

            .skill-points-pill {
                padding: 10px 16px;
                background: rgba(0,255,140,0.12);
                border: 2px solid #0f0;
                color: #9f9;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-shadow: 0 0 12px rgba(0,255,80,0.2);
                font-weight: bold;
            }

            .skill-tree-legend {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                font-size: 9px;
                color: #7f7;
            }

            .skill-tree-legend span {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 8px;
                border: 1px solid #0f0;
                background: #041004;
            }

            .skill-tree {
                position: relative;
                min-height: 640px;
                min-width: 2500px; /* Шире для трех деревьев */
                background-image: linear-gradient(90deg, rgba(0,255,120,0.05) 1px, transparent 1px);
                background-repeat: repeat;
                background-size: 160px 1px;
                padding: 12px;
                border-top: 2px solid rgba(0,255,80,0.6);
                border-left: none;
                border-right: none;
                border-bottom: none;
            }

            .skill-node {
                position: absolute;
                width: 220px;
                min-height: 120px;
                padding: 12px;
                background: #031003;
                border: 1px solid #0f0;
                box-shadow:
                    0 0 12px rgba(0,255,100,0.25),
                    inset 0 0 12px rgba(0,255,60,0.08);
                display: flex;
                flex-direction: column;
                gap: 6px;
                z-index: 2;
            }

            .skill-node.is-hub {
                background: linear-gradient(180deg, rgba(0,255,120,0.2), #021);
            }

            .skill-node.is-meta {
                border-color: #5cf;
                box-shadow:
                    0 0 14px rgba(90,220,255,0.3),
                    inset 0 0 14px rgba(90,220,255,0.15);
            }

            .skill-node.is-locked {
                opacity: 0.5;
                filter: grayscale(0.7);
                border-color: #333 !important;
            }

            .skill-module-info {
                font-size: 9px;
                color: #0ff;
                padding: 4px 6px;
                background: rgba(0,255,255,0.1);
                border: 1px solid rgba(0,255,255,0.3);
                margin-top: 4px;
            }

            .skill-module-info.locked {
                color: #666;
                background: rgba(100,100,100,0.1);
                border-color: rgba(100,100,100,0.3);
            }

            .skill-cost {
                font-size: 8px;
                color: #fa0;
                margin-left: 8px;
            }

            .skill-effects {
                font-size: 8px;
                color: #7f7;
                margin-top: 4px;
                line-height: 1.4;
            }

            .skill-zoom-controls {
                position: absolute;
                top: 10px;
                left: 10px;
                display: flex;
                align-items: center;
                gap: 6px;
                z-index: 1000;
                background: rgba(0,0,0,0.8);
                border: 1px solid #0f0;
                padding: 6px 10px;
                border-radius: 4px;
            }

            .skill-zoom-btn {
                width: 28px;
                height: 28px;
                background: #000;
                border: 1px solid #0f0;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.15s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .skill-zoom-btn:hover {
                background: #0f0;
                color: #000;
            }

            .skill-zoom-level {
                font-size: 9px;
                color: #0f0;
                min-width: 40px;
                text-align: center;
            }

            .skill-tree {
                /* Transition убран - используем JS анимацию для плавности */
            }

            .skill-node-header {
                display: flex;
                align-items: center;
                gap: 8px;
                justify-content: space-between;
            }

            .skill-node-icon {
                font-size: 20px;
                width: 28px;
            }

            .skill-node-title {
                flex: 1;
                font-size: 11px;
                color: #0f0;
                letter-spacing: 0.5px;
            }

            .skill-node-badge {
                font-size: 9px;
                padding: 4px 6px;
                border: 1px solid currentColor;
                color: #9f9;
                background: rgba(0,255,120,0.1);
                text-transform: uppercase;
            }

            .skill-node-desc {
                font-size: 9px;
                line-height: 1.4;
                color: #8f8;
                opacity: 0.9;
            }

            .skill-node-meta {
                font-size: 9px;
                color: #5cf;
                opacity: 0.9;
            }

            .skill-node-level {
                font-size: 10px;
                color: #0f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .skill-meter {
                display: grid;
                grid-template-columns: repeat(10, 1fr);
                gap: 3px;
            }

            .skill-pip {
                height: 8px;
                background: #021;
                border: 1px solid #0f0;
            }

            .skill-pip.filled {
                background: linear-gradient(90deg, #0f0, #7f7);
                box-shadow: 0 0 6px rgba(0,255,80,0.6);
            }

            .skill-upgrade-btn {
                padding: 10px;
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 9px;
                cursor: pointer;
                transition: all 0.15s;
                text-transform: uppercase;
            }

            .skill-upgrade-btn:hover:not(:disabled) {
                background: #0f0;
                color: #000;
                box-shadow: 0 0 12px rgba(0,255,80,0.6);
            }

            .skill-upgrade-btn:disabled {
                opacity: 0.25;
                cursor: not-allowed;
            }

            .skill-connector {
                position: absolute;
                background: #0f0;
                z-index: 1;
                box-shadow: 0 0 8px rgba(0,255,80,0.4);
            }

            .skill-connector.h {
                height: 2px;
            }

            .skill-connector.v {
                width: 2px;
            }

            .skill-connectors-svg {
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 1;
            }

            .skill-connectors-svg path {
                /* Свечение наследует цвет stroke линии */
            }

            .skill-category-header {
                position: absolute;
                padding: 12px 20px;
                background: rgba(0, 0, 0, 0.8);
                border: 2px solid;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10;
                transition: all 0.2s ease;
                user-select: none;
                white-space: nowrap;
            }

            .skill-category-header:hover {
                background: rgba(0, 0, 0, 0.95);
                transform: scale(1.05);
            }

            .skill-category-header.active {
                background: rgba(255, 255, 255, 0.1);
                box-shadow: 0 0 15px currentColor;
            }

            .skill-empty {
                color: #8f8;
                font-size: 11px;
                padding: 24px;
                text-align: center;
                border: 1px dashed rgba(0,255,80,0.4);
                background: rgba(0,40,0,0.5);
            }

            /* Controls popup */
            .controls-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #000;
                border: 2px solid #0f0;
                padding: 25px;
                z-index: 10002;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                display: none;
                max-height: 80vh;
                overflow-y: auto;
                min-width: 300px;
            }

            .controls-popup.visible { display: block; }

            .controls-popup .controls-title {
                font-size: 12px;
                text-align: center;
                margin-bottom: 15px;
                color: #0f0;
            }

            .controls-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #0f04;
                font-size: 10px;
                color: #0f0;
            }

            .controls-row .key {
                background: #0f0;
                color: #000;
                color: #fff;
                padding: 4px 10px;
                font-weight: 600;
            }

            /* АБСОЛЮТНАЯ БЛОКИРОВКА: Canvas ВСЕГДА заблокирован когда меню видимо */
            #main-menu:not(.hidden) ~ #gameCanvas,
            body:has(#main-menu:not(.hidden)) #gameCanvas {
                pointer-events: none !important;
            }

            /* Дополнительная защита через селектор по классу - ВСЕГДА блокируем */
            body.menu-visible #gameCanvas {
                pointer-events: none !important;
            }

            /* Блокируем canvas когда любая панель видима */
            .panel-overlay.visible ~ #gameCanvas,
            body:has(.panel-overlay.visible) #gameCanvas,
            #gameCanvas[data-menu-blocked="true"] {
                pointer-events: none !important;
            }

            /* ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Если меню не скрыто, canvas заблокирован ВСЕГДА */
            #main-menu:not(.hidden) + * #gameCanvas,
            #main-menu:not(.hidden) ~ * #gameCanvas {
                pointer-events: none !important;
            }

            /* ═══════════════════════════════════════════════════════════════════════════ */
            /* PROGRESS PANEL STYLES */
            /* ═══════════════════════════════════════════════════════════════════════════ */

            /* Кликабельная карточка игрока */
            .player-card {
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .player-card:hover {
                border-color: #0ff !important;
                box-shadow: 0 0 15px rgba(0, 255, 255, 0.4);
                transform: translateY(-2px);
            }

            .player-card:active {
                transform: translateY(0);
            }

            /* Progress Panel Tabs */
            .progress-tabs {
                display: flex;
                background: rgba(0, 20, 0, 0.9);
                border-bottom: 2px solid #0f0;
            }

            .progress-tab {
                flex: 1;
                padding: 12px 16px;
                background: transparent;
                border: none;
                border-right: 1px solid #0f04;
                color: #080;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: center;
            }

            .progress-tab:last-child {
                border-right: none;
            }

            .progress-tab:hover {
                background: rgba(0, 255, 0, 0.1);
                color: #0f0;
            }

            .progress-tab.active {
                background: rgba(0, 255, 0, 0.2);
                color: #0ff;
                text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
            }

            /* Progress Panel Content */
            .progress-content {
                padding: 20px;
                max-height: 60vh;
                overflow-y: auto;
            }

            .progress-tab-content {
                display: none;
            }

            .progress-tab-content.active {
                display: block;
                animation: fadeIn 0.3s ease;
            }

            /* Level Section */
            .progress-level-section {
                text-align: center;
                margin-bottom: 25px;
            }

            .progress-level-badge {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #000 0%, #030 100%);
                border: 3px solid #0f0;
                border-radius: 8px;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.4);
            }

            .progress-level-number {
                font-size: 28px;
                color: #0f0;
                text-shadow: 0 0 10px #0f0;
            }

            .progress-title {
                font-size: 12px;
                margin-top: 8px;
                text-shadow: 0 0 6px currentColor;
            }

            .progress-title-icon {
                font-size: 18px;
                margin-right: 5px;
            }

            /* Large XP Bar */
            .progress-xp-bar-container {
                margin: 20px 0;
            }

            .progress-xp-bar-bg {
                height: 30px;
                background: #010;
                border: 2px solid #0f0;
                border-radius: 4px;
                position: relative;
                overflow: hidden;
            }

            .progress-xp-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #0a0 0%, #0f0 50%, #0a0 100%);
                box-shadow: 0 0 15px #0f0;
                transition: width 0.5s ease;
                position: relative;
            }

            .progress-xp-bar-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
                animation: xpShine 2s infinite;
            }

            @keyframes xpShine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            .progress-xp-text {
                text-align: center;
                margin-top: 8px;
                font-size: 12px;
                color: #0f0;
            }

            .progress-xp-percent {
                color: #0ff;
                font-weight: bold;
            }

            /* Stats Grid */
            .progress-stats-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin: 20px 0;
            }

            .progress-stat-card {
                background: rgba(0, 30, 0, 0.8);
                border: 1px solid #0f0;
                padding: 12px;
                text-align: center;
            }

            .progress-stat-value {
                font-size: 16px;
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }

            .progress-stat-label {
                font-size: 8px;
                color: #0a0;
                margin-top: 5px;
            }

            /* Bonuses Grid */
            .progress-bonuses-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                margin: 20px 0;
                padding: 12px;
                background: rgba(0, 20, 0, 0.6);
                border: 1px solid #0f04;
            }

            .progress-bonus-item {
                text-align: center;
                padding: 8px;
            }

            .progress-bonus-value {
                font-size: 14px;
                color: #0ff;
                text-shadow: 0 0 5px #0ff;
            }

            .progress-bonus-label {
                font-size: 7px;
                color: #088;
                margin-top: 4px;
            }

            /* Next Level Reward */
            .progress-next-level {
                background: rgba(0, 40, 0, 0.6);
                border: 1px solid #0f0;
                padding: 12px;
                margin-top: 15px;
                text-align: center;
            }

            .progress-next-level-title {
                font-size: 10px;
                color: #0a0;
                margin-bottom: 8px;
            }

            .progress-next-level-rewards {
                display: flex;
                justify-content: center;
                gap: 20px;
                font-size: 11px;
            }

            .progress-reward {
                color: #0f0;
            }

            .progress-reward-icon {
                margin-right: 5px;
            }

            /* Achievements Section */
            .achievements-category-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }

            .achievement-category-btn {
                padding: 6px 12px;
                background: rgba(0, 30, 0, 0.6);
                border: 1px solid #0f04;
                color: #0a0;
                font-family: 'Press Start 2P', monospace;
                font-size: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .achievement-category-btn:hover {
                background: rgba(0, 255, 0, 0.1);
                border-color: #0f0;
            }

            .achievement-category-btn.active {
                background: rgba(0, 255, 0, 0.2);
                border-color: #0f0;
                color: #0f0;
            }

            .achievements-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 10px;
            }

            .achievement-card {
                background: rgba(0, 20, 0, 0.8);
                border: 2px solid #333;
                padding: 12px;
                transition: all 0.2s ease;
                position: relative;
            }

            .achievement-card:hover {
                transform: scale(1.02);
            }

            .achievement-card.unlocked {
                border-color: #0f0;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }

            .achievement-card.locked {
                opacity: 0.5;
                filter: grayscale(0.5);
            }

            /* Tier colors */
            .achievement-card.tier-bronze { border-color: #cd7f32; }
            .achievement-card.tier-bronze.unlocked { box-shadow: 0 0 10px rgba(205, 127, 50, 0.4); }

            .achievement-card.tier-silver { border-color: #c0c0c0; }
            .achievement-card.tier-silver.unlocked { box-shadow: 0 0 10px rgba(192, 192, 192, 0.4); }

            .achievement-card.tier-gold { border-color: #ffd700; }
            .achievement-card.tier-gold.unlocked { box-shadow: 0 0 10px rgba(255, 215, 0, 0.4); }

            .achievement-card.tier-platinum { border-color: #e5e4e2; }
            .achievement-card.tier-platinum.unlocked {
                box-shadow: 0 0 15px rgba(229, 228, 226, 0.5);
                animation: platinumGlow 2s ease-in-out infinite;
            }

            @keyframes platinumGlow {
                0%, 100% { box-shadow: 0 0 10px rgba(229, 228, 226, 0.3); }
                50% { box-shadow: 0 0 20px rgba(229, 228, 226, 0.6); }
            }

            .achievement-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }

            .achievement-icon {
                font-size: 20px;
            }

            .achievement-name {
                font-size: 10px;
                color: #0f0;
                flex: 1;
            }

            .achievement-tier {
                font-size: 7px;
                padding: 2px 6px;
                border-radius: 3px;
            }

            .achievement-tier.bronze { background: #cd7f32; color: #000; }
            .achievement-tier.silver { background: #c0c0c0; color: #000; }
            .achievement-tier.gold { background: #ffd700; color: #000; }
            .achievement-tier.platinum { background: #e5e4e2; color: #000; }

            .achievement-description {
                font-size: 8px;
                color: #0a0;
                margin-bottom: 8px;
            }

            .achievement-reward {
                font-size: 8px;
                color: #0ff;
                display: flex;
                gap: 10px;
            }

            .achievement-status {
                position: absolute;
                top: 8px;
                right: 8px;
                font-size: 14px;
            }

            /* Daily Quests Section */
            .quests-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }

            .quests-title {
                font-size: 12px;
                color: #0ff;
            }

            .quests-reset-timer {
                font-size: 9px;
                color: #0a0;
            }

            .quest-card {
                background: rgba(0, 25, 0, 0.8);
                border: 2px solid #0f04;
                padding: 15px;
                margin-bottom: 12px;
                transition: all 0.2s ease;
            }

            .quest-card:hover {
                border-color: #0f0;
            }

            .quest-card.completed {
                border-color: #0ff;
                background: rgba(0, 40, 40, 0.3);
            }

            .quest-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .quest-name {
                font-size: 11px;
                color: #0f0;
            }

            .quest-status-icon {
                font-size: 16px;
            }

            .quest-description {
                font-size: 9px;
                color: #0a0;
                margin-bottom: 12px;
            }

            .quest-progress-bar-bg {
                height: 16px;
                background: #010;
                border: 1px solid #0f04;
                position: relative;
                margin-bottom: 8px;
            }

            .quest-progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #080 0%, #0f0 100%);
                transition: width 0.3s ease;
            }

            .quest-progress-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 9px;
                color: #fff;
                text-shadow: 0 0 3px #000;
            }

            .quest-rewards {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                font-size: 9px;
            }

            .quest-reward {
                color: #0ff;
            }

            .quest-reward-icon {
                margin-right: 4px;
            }

            /* No quests message */
            .no-quests-message {
                text-align: center;
                padding: 40px;
                color: #0a0;
                font-size: 10px;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);


        // ВАЖНО: Убеждаемся, что меню видимо при создании (не добавляем класс hidden)
        // Меню будет показано через show() при загрузке игры
        this.container.classList.remove("hidden");
        // НЕ устанавливаем display/visibility здесь - CSS уже задает display: flex и visibility: visible
        // Полагаемся на CSS стили из #main-menu { display: flex; ... }


        // Инициализация auth UI
        const authContainer = authUI.createContainer();
        if (authContainer && !document.body.contains(authContainer)) {
            document.body.appendChild(authContainer);
        }

        // Обновление UI авторизации
        this.updateAuthUI();

        // Слушаем изменения состояния авторизации
        // ИСПРАВЛЕНИЕ: Добавлена защита от повторной регистрации listener
        if (firebaseService.isInitialized() && !this.authListenerAttached) {
            const auth = (firebaseService as any).auth;
            if (auth) {
                const { onAuthStateChanged } = require("firebase/auth");
                this.authListenerUnsubscribe = onAuthStateChanged(auth, () => {
                    this.updateAuthUI();
                });
                this.authListenerAttached = true;
                debugLog("[Menu] Auth state listener registered");
            }
        }

        // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas сразу после создания меню
        const blockCanvas = () => {
            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (canvas) {
                canvas.style.setProperty("pointer-events", "none", "important");
                canvas.style.setProperty("z-index", "-1", "important");
                canvas.style.setProperty("display", "block", "important");
                // Также пытаемся отключить события через атрибуты
                canvas.setAttribute("style", canvas.getAttribute("style") + "; pointer-events: none !important; z-index: -1 !important;");
                debugLog("[Menu] Canvas blocked after menu creation");
            }
        };

        blockCanvas();
        // Повторяем несколько раз для надежности
        setTimeout(blockCanvas, 0);
        setTimeout(blockCanvas, 50);
        setTimeout(blockCanvas, 100);
        setTimeout(blockCanvas, 500);

        // Сохраняем ссылку на обработчик для возможности переустановки
        this.setupMenuEventHandlers();

        // ДОПОЛНИТЕЛЬНО: Добавляем обработчики напрямую на кнопки для надежности
        // Используем одну попытку с небольшой задержкой для надежности
        setTimeout(() => {
            this.attachDirectButtonHandlers();
            this.setupLobbyHandlers();
        }, 100);

        // КРИТИЧНО: Создаем MultiplayerManager при создании меню, если его еще нет
        this.ensureMultiplayerManager();

        // Настраиваем callbacks для лобби
        this.setupLobbyCallbacks();
    }


    private openTankEditor(): void {
        debugLog("[Menu] Opening PolyGenStudio Tank Workshop...");

        // Hide menu
        this.container.classList.add("hidden");

        // Stop canvas protection temporarily
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
        }
        const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (gameCanvas) {
            gameCanvas.style.display = 'none';
        }

        // Create container for PolyGenStudio
        const editorContainer = document.createElement("div");
        editorContainer.id = "polygen-editor-container";
        editorContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 10000;
            background-color: #000;
        `;

        // Create close button
        const closeButton = document.createElement("button");
        closeButton.id = "polygen-close-btn";
        closeButton.innerHTML = "✕ ЗАКРЫТЬ";
        closeButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10001;
            padding: 10px 20px;
            background: linear-gradient(180deg, #400, #200);
            border: 2px solid #f00;
            color: #f00;
            font-family: 'Press Start 2P', monospace;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(255,0,0,0.5);
            transition: all 0.3s ease;
        `;
        closeButton.onmouseenter = () => {
            closeButton.style.background = "linear-gradient(180deg, #600, #400)";
            closeButton.style.boxShadow = "0 0 20px rgba(255,0,0,0.8)";
        };
        closeButton.onmouseleave = () => {
            closeButton.style.background = "linear-gradient(180deg, #400, #200)";
            closeButton.style.boxShadow = "0 0 10px rgba(255,0,0,0.5)";
        };

        // Create iframe for PolyGenStudio
        const iframe = document.createElement("iframe");
        iframe.id = "polygen-iframe";
        iframe.src = "http://127.0.0.1:3000/?mode=tank";
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

        editorContainer.appendChild(iframe);
        document.body.appendChild(editorContainer);
        document.body.appendChild(closeButton);

        // Close handler
        const closeEditor = () => {
            debugLog("[Menu] Closing PolyGenStudio Tank Workshop");
            editorContainer.remove();
            closeButton.remove();

            // Show game canvas and menu
            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }
            this.container.classList.remove("hidden");

            // Restore canvas protection
            this.setupCanvasPointerEventsProtection();
        };

        closeButton.onclick = closeEditor;

        // ESC key to close
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeEditor();
                document.removeEventListener("keydown", escHandler);
            }
        };
        document.addEventListener("keydown", escHandler);
    }

    /**
     * Убеждаемся, что MultiplayerManager существует и подключен
     */
    private async ensureMultiplayerManager(): Promise<void> {
        const game = (window as any).gameInstance as any;

        // Если MultiplayerManager уже существует, ничего не делаем
        if (game?.multiplayerManager) {
            return;
        }

        // MultiplayerManager будет создан автоматически

        try {
            const { MultiplayerManager } = await import("./multiplayer");
            const multiplayerManager = new MultiplayerManager(undefined, true); // autoConnect = true
            game.multiplayerManager = multiplayerManager;

            // Ждем подключения
            let attempts = 0;
            const maxAttempts = 20; // 10 секунд
            const checkConnection = setInterval(() => {
                attempts++;
                if (multiplayerManager.isConnected()) {
                    clearInterval(checkConnection);
                    // Запрашиваем список игроков сразу после подключения
                    setTimeout(() => {
                        multiplayerManager.getOnlinePlayers();
                    }, 500);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkConnection);
                }
            }, 500);
        } catch (error) {
            console.error("[Menu] ❌ Ошибка при создании MultiplayerManager:", error);
        }
    }

    private attachDirectButtonHandlers(): void {
        // Предотвращаем множественную привязку обработчиков
        if (this.buttonHandlersAttached) {
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug("[Menu] Button handlers already attached");
            }
            return;
        }

        try {
            // Добавляем обработчики напрямую на каждую кнопку для максимальной надежности
            const buttons = [
                { id: "btn-play", handler: () => this.showPlayMenu() },
                { id: "btn-quick-start", handler: () => this.quickStart() },
                { id: "btn-garage", handler: () => this.showGarage() },
                { id: "btn-skills", handler: () => this.showSkills() },
                { id: "btn-stats", handler: () => this.showStats() },
                {
                    id: "btn-map-editor", handler: () => {
                        this.openMapEditor().catch((error) => {
                            console.error("[Menu] Unhandled error in openMapEditor:", error);
                        });
                    }
                },
                {
                    id: "btn-tank-editor", handler: () => {
                        this.openTankEditor();
                    }
                },
                { id: "btn-settings", handler: () => this.showSettings() },
                { id: "btn-fullscreen", handler: () => this.toggleFullscreen() },
                { id: "btn-resume", handler: () => this.resumeGame() },
                { id: "btn-restart", handler: () => this.restartGame() },
                { id: "btn-exit-battle", handler: () => this.exitBattle() },
                { id: "btn-login", handler: () => this.showLogin() },
                { id: "btn-register", handler: () => this.showRegister() },
                { id: "btn-profile", handler: () => this.showProfile() }
            ];

            buttons.forEach(({ id, handler }) => {
                try {
                    const btn = document.getElementById(id) as HTMLButtonElement;
                    if (!btn) {
                        debugWarn(`[Menu] Button ${id} not found!`);
                        return;
                    }

                    if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                        logger.verbose(`[Menu] Attaching handler to button ${id}`);
                    }

                    // Удаляем все старые обработчики через клонирование
                    const parent = btn.parentNode;
                    if (!parent) {
                        debugWarn(`[Menu] Button ${id} has no parent node`);
                        return;
                    }

                    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
                    parent.replaceChild(newBtn, btn);

                    // Убеждаемся, что кнопка видима и доступна для клика
                    newBtn.style.pointerEvents = "auto";
                    newBtn.style.zIndex = "10000";
                    newBtn.style.position = "relative";

                    // Блокируем canvas перед добавлением обработчика
                    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                    if (canvas) {
                        canvas.style.setProperty("pointer-events", "none", "important");
                        canvas.style.setProperty("z-index", "0", "important");
                    }

                    // Для кнопок авторизации, редактора карт и танков используем и mousedown, и click для максимальной надежности
                    if (id === "btn-login" || id === "btn-register" || id === "btn-map-editor" || id === "btn-tank-editor") {
                        // Обработчик mousedown - срабатывает первым
                        newBtn.addEventListener("mousedown", (e) => {
                            if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                logger.verbose(`[Menu] Button ${id} mousedown`);
                            }

                            try {
                                // Блокируем canvas
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }

                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();

                                // Вызываем handler сразу
                                if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                    logger.verbose(`[Menu] Handler called/completed for ${id}`);
                                }
                                handler();
                            } catch (error) {
                                console.error(`[Menu] Error in mousedown handler for ${id}:`, error);
                                debugError(`[Menu] Error in mousedown handler for ${id}:`, error);
                            }
                        }, true);

                        // Обработчик click - резервный, на случай если mousedown не сработал
                        newBtn.addEventListener("click", (e) => {
                            debugLog(`[Menu] Button ${id} click event!`);
                            if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                logger.verbose(`[Menu] Button ${id} click (backup)`);
                            }

                            try {
                                // Блокируем canvas
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }

                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();

                                // Вызываем handler
                                debugLog(`[Menu] Calling handler for ${id} from click`);
                                handler();
                            } catch (error) {
                                console.error(`[Menu] Error in click handler for ${id}:`, error);
                                debugError(`[Menu] Error in click handler for ${id}:`, error);
                            }
                        }, true);
                    } else {
                        // Для остальных кнопок используем стандартный обработчик mousedown
                        newBtn.addEventListener("mousedown", (e) => {
                            try {
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }
                                e.stopPropagation();
                            } catch (error) {
                                debugError(`[Menu] Error in mousedown handler for ${id}:`, error);
                            }
                        }, true);

                        // Обработчик click для остальных кнопок
                        newBtn.addEventListener("click", (e) => {
                            try {
                                // Блокируем canvas
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }

                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();

                                if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                    logger.verbose(`[Menu] Handler called/completed for ${id}`);
                                }
                                handler();
                            } catch (error) {
                                console.error(`[Menu] Error in button handler for ${id}:`, error);
                                debugError(`[Menu] Error in button handler for ${id}:`, error);
                            }
                        }, true);
                    }

                    debugLog(`[Menu] Direct handler attached to ${id}`);
                } catch (error) {
                    debugError(`[Menu] Error setting up button handler for ${id}:`, error);
                }
            });

            // Устанавливаем флаг после успешной привязки всех обработчиков
            this.buttonHandlersAttached = true;

            // Добавляем обработчик клика на карточку игрока для открытия панели прогресса
            const playerCard = document.getElementById("player-info");
            if (playerCard) {
                playerCard.addEventListener("click", (e) => {
                    try {
                        debugLog("[Menu] Player card clicked, opening progress panel");
                        e.preventDefault();
                        e.stopPropagation();
                        this.showProgress();
                    } catch (error) {
                        debugError("[Menu] Error opening progress panel:", error);
                    }
                }, true);
                debugLog("[Menu] Player card click handler attached");
            } else {
                debugWarn("[Menu] Player card (#player-info) not found");
            }
        } catch (error) {
            debugError("[Menu] Error in attachDirectButtonHandlers:", error);
        }
    }


    private setupCloseButton(id: string, handler: () => void): void {
        try {
            const btn = document.getElementById(id);
            if (!btn) {
                debugWarn(`[Menu] Close button ${id} not found`);
                return;
            }

            // Удаляем старые обработчики через клонирование
            const parent = btn.parentNode;
            if (!parent) {
                debugWarn(`[Menu] Close button ${id} has no parent node`);
                return;
            }

            const newBtn = btn.cloneNode(true) as HTMLElement;
            parent.replaceChild(newBtn, btn);

            // Единый обработчик в фазе захвата
            newBtn.addEventListener("click", (e) => {
                try {
                    debugLog(`[Menu] Close button ${id} clicked`);
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // Блокируем canvas
                    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                    if (canvas) {
                        canvas.style.setProperty("pointer-events", "none", "important");
                    }

                    handler();
                } catch (error) {
                    debugError(`[Menu] Error in close button handler for ${id}:`, error);
                }
            }, true);
        } catch (error) {
            debugError(`[Menu] Error setting up close button ${id}:`, error);
        }
    }

    private setupPanelCloseOnBackground(panel: HTMLDivElement, handler: () => void): void {
        if (!panel) {
            debugWarn("[Menu] setupPanelCloseOnBackground: panel is null");
            return;
        }

        try {
            // Закрытие по клику на фон панели (но не на содержимое)
            panel.addEventListener("click", (e) => {
                try {
                    const target = e.target as HTMLElement;
                    // Если клик был по самому overlay (фону), а не по содержимому
                    if (target === panel) {
                        debugLog("[Menu] Panel background clicked, closing");
                        e.preventDefault();
                        e.stopPropagation();
                        handler();
                    }
                } catch (error) {
                    debugError("[Menu] Error in panel background click handler:", error);
                }
            });

            // Закрытие по ESC
            const escHandler = (e: KeyboardEvent) => {
                try {
                    if (e.key === "Escape" && panel && panel.classList.contains("visible")) {
                        debugLog("[Menu] ESC pressed, closing panel");
                        e.preventDefault();
                        handler();
                    }
                } catch (error) {
                    debugError("[Menu] Error in ESC handler:", error);
                }
            };
            document.addEventListener("keydown", escHandler);

            // Сохраняем обработчик для возможности удаления
            (panel as any)._escHandler = escHandler;
        } catch (error) {
            debugError("[Menu] Error setting up panel close handlers:", error);
        }
    }

    private setupMenuEventHandlers(): void {
        // Удаляем старые обработчики если они есть (на случай переустановки)
        const oldHandler = (this.container as any)._menuClickHandler;
        if (oldHandler) {
            this.container.removeEventListener("click", oldHandler, true);
            this.container.removeEventListener("click", oldHandler, false);
        }

        // Use event delegation for better reliability with multiple layers of protection
        const handleClick = (e: MouseEvent) => {
            // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas ПЕРЕД любой обработкой
            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (canvas) {
                canvas.style.setProperty("pointer-events", "none", "important");
            }

            // Проверяем, что меню действительно видимо
            if (this.container.classList.contains("hidden")) {
                return;
            }

            const target = e.target as HTMLElement;

            // Проверяем, что клик был по элементу меню, а не по canvas
            if (!this.container.contains(target)) {
                return;
            }

            const button = target.closest('.menu-btn') as HTMLButtonElement;

            if (!button) {
                // Play intro sound on first interaction with menu (only if not clicking a button)
                if (!this.introSoundPlayed) {
                    this.introSoundPlayed = true;
                    this.onPlayIntroSound();
                }
                return;
            }

            // Handle button clicks
            const buttonId = button.id;
            debugLog(`[Menu] Delegated handler: ${buttonId} clicked`);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Блокируем canvas СРАЗУ перед показом панели
            this.enforceCanvasPointerEvents();

            switch (buttonId) {
                case "btn-play":
                    debugLog("[Menu] Showing play menu");
                    this.showPlayMenu();
                    break;
                case "btn-quick-start":
                    debugLog("[Menu] Quick start");
                    this.quickStart();
                    break;
                case "btn-garage":
                    debugLog("[Menu] Showing garage");
                    this.showGarage();
                    break;
                case "btn-skills":
                    debugLog("[Menu] Showing skills");
                    this.showSkills();
                    break;
                case "btn-stats":
                    debugLog("[Menu] Showing stats");
                    this.showStats();
                    break;
                case "btn-settings":
                    debugLog("[Menu] Showing settings");
                    this.showSettings();
                    break;
                case "btn-fullscreen":
                    debugLog("[Menu] Toggle fullscreen");
                    this.toggleFullscreen();
                    break;
                // === КНОПКИ ПАУЗЫ ===
                case "btn-resume":
                    debugLog("[Menu] Resume game");
                    this.resumeGame();
                    break;
                case "btn-restart":
                    debugLog("[Menu] Restart game");
                    this.restartGame();
                    break;
                case "btn-exit-battle":
                    debugLog("[Menu] Exit battle");
                    this.exitBattle();
                    break;
            }

            // Еще раз блокируем canvas после показа панели (с небольшой задержкой для надежности)
            setTimeout(() => {
                this.enforceCanvasPointerEvents();
            }, 0);
            setTimeout(() => {
                this.enforceCanvasPointerEvents();
            }, 10);
            setTimeout(() => {
                this.enforceCanvasPointerEvents();
            }, 50);
        };

        // Сохраняем ссылку на обработчик
        (this.container as any)._menuClickHandler = handleClick;

        // Добавляем обработчик в фазе захвата (capture) для максимального приоритета
        this.container.addEventListener("click", handleClick, true);
        // Также добавляем в фазе всплытия (bubble) на всякий случай
        this.container.addEventListener("click", handleClick, false);

        // Дополнительная защита: блокируем canvas при наведении мыши на меню
        const handleMouseEnter = () => {
            this.enforceCanvasPointerEvents();
        };
        const handleMouseMove = () => {
            if (!this.container.classList.contains("hidden")) {
                this.enforceCanvasPointerEvents();
            }
        };
        const handleMouseDown = () => {
            this.enforceCanvasPointerEvents();
        };
        const handleMouseUp = () => {
            this.enforceCanvasPointerEvents();
        };

        this.container.addEventListener("mouseenter", handleMouseEnter);
        this.container.addEventListener("mousemove", handleMouseMove);
        this.container.addEventListener("mousedown", handleMouseDown);
        this.container.addEventListener("mouseup", handleMouseUp);

        // Сохраняем ссылки на обработчики для возможности переустановки
        (this.container as any)._menuMouseEnterHandler = handleMouseEnter;
        (this.container as any)._menuMouseMoveHandler = handleMouseMove;
        (this.container as any)._menuMouseDownHandler = handleMouseDown;
        (this.container as any)._menuMouseUpHandler = handleMouseUp;

        // Инициализация панели управления (сворачивание/разворачивание)
        this.setupControlsPanel();
    }

    private setupControlsPanel(): void {
        const controlsTitle = document.getElementById("controls-title");
        const controlsToggleBtn = document.getElementById("controls-toggle-btn");
        const controlsGrid = document.getElementById("controls-grid");

        if (!controlsTitle || !controlsToggleBtn || !controlsGrid) {
            // ИСПРАВЛЕНИЕ: Если элементы не найдены, пробуем через небольшой таймаут
            setTimeout(() => this.setupControlsPanel(), 100);
            return;
        }

        // Загружаем состояние из localStorage (по умолчанию свернуто)
        const isExpanded = localStorage.getItem("controls-panel-expanded") === "true";
        
        // Устанавливаем начальное состояние
        if (!isExpanded) {
            controlsGrid.style.display = "none";
            controlsToggleBtn.textContent = "▶";
        } else {
            controlsGrid.style.display = "";
            controlsToggleBtn.textContent = "▼";
        }

        // Обработчик клика на заголовок или кнопку
        const toggleControls = () => {
            const isCurrentlyExpanded = controlsGrid.style.display !== "none";
            
            if (isCurrentlyExpanded) {
                controlsGrid.style.display = "none";
                controlsToggleBtn.textContent = "▶";
                localStorage.setItem("controls-panel-expanded", "false");
            } else {
                controlsGrid.style.display = "";
                controlsToggleBtn.textContent = "▼";
                localStorage.setItem("controls-panel-expanded", "true");
            }
        };

        controlsTitle.addEventListener("click", toggleControls);
        controlsToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleControls();
        });
    }

    private updatePlayerInfo(immediate: boolean = false): void {
        if (!this.playerProgression) return;

        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();

        const levelBadge = document.getElementById("level-badge");
        if (levelBadge) levelBadge.textContent = stats.level.toString();

        // Плавная анимация XP-бара (или немедленное обновление)
        const xpBar = document.getElementById("xp-bar") as HTMLElement;
        if (xpBar) {
            const targetPercent = xpProgress.percent;

            if (immediate) {
                // Немедленное обновление без анимации (при первой загрузке)
                xpBar.style.width = `${targetPercent}%`;
                xpBar.style.transition = "none";
            } else {
                const currentPercent = parseFloat(xpBar.style.width) || 0;

                // Плавная интерполяция к целевому значению
                if (Math.abs(targetPercent - currentPercent) > 0.1) {
                    const diff = targetPercent - currentPercent;
                    const newPercent = currentPercent + diff * 0.15; // Плавное приближение
                    xpBar.style.width = `${Math.max(0, Math.min(100, newPercent))}%`;
                    xpBar.style.transition = "width 0.1s linear"; // Плавная анимация
                } else {
                    xpBar.style.width = `${targetPercent}%`;
                }
            }
        }

        const xpText = document.getElementById("xp-text");
        if (xpText) xpText.textContent = `${xpProgress.current} / ${xpProgress.required} XP`;

        const creditsDisplay = document.getElementById("credits-display");
        if (creditsDisplay) creditsDisplay.textContent = stats.credits.toString();

        const killsDisplay = document.getElementById("kills-display");
        if (killsDisplay) killsDisplay.textContent = stats.totalKills.toString();

        const playtimeDisplay = document.getElementById("playtime-display");
        if (playtimeDisplay) playtimeDisplay.textContent = this.playerProgression.getPlayTimeFormatted();

        const skillPointsHint = document.getElementById("skill-points-hint");
        if (skillPointsHint) {
            if (stats.skillPoints > 0) {
                skillPointsHint.textContent = stats.skillPoints.toString();
                skillPointsHint.classList.add("visible");
            } else {
                skillPointsHint.classList.remove("visible");
            }
        }

        // Обновляем позывной
        this.updatePlayerCallsign();
    }

    private startAnimations(): void {
        // Первое немедленное обновление при старте (если playerProgression уже установлен)
        if (this.playerProgression) {
            setTimeout(() => {
                this.updatePlayerInfo(true);
            }, 0);
        }

        // Периодическое обновление статистики в реальном времени (каждые 100мс для плавной анимации XP-бара)
        setInterval(() => {
            if (this.playerProgression) {
                this.updatePlayerInfo();
                if (this.statsPanel && this.statsPanel.classList.contains("visible")) {
                    this.updateStatsPanel();
                }
            }
        }, 100); // Обновляем каждые 100мс для плавной анимации

        // Fallback обновление раз в 5 секунд (на случай если события не работают)
        setInterval(() => {
            if (this.container && !this.container.classList.contains('hidden')) {
                this.updatePlayerInfo();
            }
        }, 5000);
    }

    private createSettingsUI(): void {
        this.settingsPanel = document.createElement("div");
        this.settingsPanel.className = "panel-overlay";
        this.settingsPanel.id = "settings-panel";

        // Initialize SettingsPanel component (standalone mode)
        this.settingsPanelComponent = new SettingsPanel(this.settings, false);
        this.settingsPanelComponent.renderToContainer(this.settingsPanel);

        // Pass game instance if available
        if ((window as any).gameInstance) {
            this.settingsPanelComponent.setGame((window as any).gameInstance);
        }

        document.body.appendChild(this.settingsPanel);

        // Listen for settings changes from the component
        this.settingsPanel.addEventListener('settingsChanged', (e) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                this.settings = customEvent.detail;
                // Settings are already saved by the component
            }
        });

        // Setup close button (component renders the button with id="settings-close")
        this.setupCloseButton("settings-close", () => this.hideSettings());
        this.setupPanelCloseOnBackground(this.settingsPanel, () => this.hideSettings());
    }
    private createStatsPanel(): void {
        this.statsPanel = document.createElement("div");
        this.statsPanel.className = "panel-overlay";
        this.statsPanel.id = "stats-panel";
        this.statsPanel.innerHTML = `
            <div class="panel-content">
                <button class="panel-close" id="stats-close">✕</button>
                <div class="panel-title">Статистика</div>
                <div class="stats-grid" id="stats-grid"></div>
                <div class="panel-buttons">
                    <button class="panel-btn" id="stats-back">Закрыть</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.statsPanel);

        this.setupCloseButton("stats-close", () => this.hideStats());
        this.setupCloseButton("stats-back", () => this.hideStats());
        this.setupPanelCloseOnBackground(this.statsPanel, () => this.hideStats());
    }

    private createSkillsPanel(): void {
        this.skillsPanel = document.createElement("div");
        this.skillsPanel.className = "panel-overlay";
        this.skillsPanel.id = "skills-panel";
        this.skillsPanel.innerHTML = createSkillsPanelHTML();

        document.body.appendChild(this.skillsPanel);

        this.setupCloseButton("skills-close", () => this.hideSkills());
        this.setupCloseButton("skills-back", () => this.hideSkills());
        this.setupPanelCloseOnBackground(this.skillsPanel, () => this.hideSkills());
    }

    private createProgressPanel(): void {
        this.progressPanel = document.createElement("div");
        this.progressPanel.className = "panel-overlay";
        this.progressPanel.id = "progress-panel";
        this.progressPanel.innerHTML = `
            <div class="panel" style="width: min(90vw, 700px); max-height: min(85vh, 700px);">
                <div class="panel-header">
                    <div class="panel-title">ПРОГРЕСС ИГРОКА</div>
                    <button class="panel-close" id="progress-close">×</button>
                </div>
                <div class="progress-tabs">
                    <button class="progress-tab active" data-tab="level">[1] УРОВЕНЬ</button>
                    <button class="progress-tab" data-tab="achievements">[2] ДОСТИЖЕНИЯ</button>
                    <button class="progress-tab" data-tab="quests">[3] ЗАДАНИЯ</button>
                </div>
                <div class="progress-content">
                    <div class="progress-tab-content active" id="progress-level-content">
                        <!--Level tab content will be rendered dynamically-->
                    </div>
                    <div class="progress-tab-content" id="progress-achievements-content">
                        <!--Achievements tab content will be rendered dynamically-->
                    </div>
                    <div class="progress-tab-content" id="progress-quests-content">
                        <!--Quests tab content will be rendered dynamically-->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.progressPanel);

        // Setup close button
        this.setupCloseButton("progress-close", () => this.hideProgress());
        this.setupPanelCloseOnBackground(this.progressPanel, () => this.hideProgress());

        // Setup tab switching
        this.progressPanel.querySelectorAll(".progress-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = (tab as HTMLElement).dataset.tab as "level" | "achievements" | "quests";
                this.switchProgressTab(tabName);
            });
        });
    }

    private switchProgressTab(tab: "level" | "achievements" | "quests"): void {
        this.progressCurrentTab = tab;

        // Update tab buttons
        this.progressPanel.querySelectorAll(".progress-tab").forEach(t => {
            t.classList.toggle("active", (t as HTMLElement).dataset.tab === tab);
        });

        // Update content
        this.progressPanel.querySelectorAll(".progress-tab-content").forEach(c => {
            c.classList.remove("active");
        });

        const contentId = `progress-${tab}-content`;
        const contentEl = document.getElementById(contentId);
        if (contentEl) {
            contentEl.classList.add("active");
        }

        // Render content based on tab
        switch (tab) {
            case "level":
                this.renderLevelTab();
                break;
            case "achievements":
                this.renderAchievementsTab();
                break;
            case "quests":
                this.renderQuestsTab();
                break;
        }
    }

    private showProgress(): void {
        debugLog("[Menu] showProgress() called");
        if (this.progressPanel) {
            this.progressPanel.classList.add("visible");
            this.progressPanel.style.setProperty("display", "flex", "important");
            this.progressPanel.style.setProperty("visibility", "visible", "important");
            this.progressPanel.style.setProperty("opacity", "1", "important");
            this.progressPanel.style.setProperty("z-index", "100002", "important");

            // Add in-battle class if game is running
            const game = (window as any).gameInstance;
            if (game && game.gameStarted) {
                this.progressPanel.classList.add("in-battle");
            } else {
                this.progressPanel.classList.remove("in-battle");
            }

            // Render current tab
            this.switchProgressTab(this.progressCurrentTab);
            this.enforceCanvasPointerEvents();
        }
    }

    private hideProgress(): void {
        debugLog("[Menu] hideProgress() called");
        if (this.progressPanel) {
            this.progressPanel.classList.remove("visible");
            this.progressPanel.style.setProperty("display", "none", "important");
            this.progressPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents();
        }
    }

    private renderLevelTab(): void {
        const content = document.getElementById("progress-level-content");
        if (!content || !this.playerProgression) return;

        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        const realTimeStats = this.playerProgression.getRealTimeXpStats();
        const bonuses = getLevelBonuses(stats.level);

        // Get current title
        let currentTitle: { title: string; icon: string; color: string } = { title: "Новобранец", icon: "🪖", color: "#888888" };
        for (let lvl = stats.level; lvl >= 1; lvl--) {
            const titleData = PLAYER_TITLES[lvl];
            if (titleData) {
                currentTitle = titleData;
                break;
            }
        }

        // Get next title
        let nextTitle = null;
        for (let lvl = stats.level + 1; lvl <= MAX_PLAYER_LEVEL; lvl++) {
            if (PLAYER_TITLES[lvl]) {
                nextTitle = { level: lvl, ...PLAYER_TITLES[lvl] };
                break;
            }
        }

        // Format prestige
        const prestigeText = stats.prestigeLevel > 0
            ? `Престиж ${stats.prestigeLevel} (+${(stats.prestigeLevel * 10)}%)`
            : "Нет престижа";

        // Calculate XP per minute display
        const xpPerMin = Math.round(realTimeStats.experiencePerMinute);
        const xpPerMinText = xpPerMin > 0 ? `+ ${xpPerMin} XP / мин` : "—";

        content.innerHTML = `
            <div class="progress-level-section" >
                <div class="progress-level-badge" >
                    <div class="progress-level-number" > ${stats.level} </div>
                        </div>
                        <div class="progress-title" style="color: ${currentTitle.color}" >
                            <span class="progress-title-icon" > ${currentTitle.icon} </span>
                    ${currentTitle.title}
        </div>
            </div>

            <div class="progress-xp-bar-container" >
                <div class="progress-xp-bar-bg" >
                    <div class="progress-xp-bar-fill" style="width: ${xpProgress.percent}%" > </div>
                        </div>
                        <div class="progress-xp-text" >
                            ${xpProgress.current.toLocaleString()} / ${xpProgress.required.toLocaleString()} XP
                                <span class="progress-xp-percent" > (${xpProgress.percent.toFixed(1)}%)</span>
                                    </div>
                                    </div>

                                    <div class="progress-stats-grid" >
                                        <div class="progress-stat-card" >
                                            <div class="progress-stat-value" > ${stats.totalExperience.toLocaleString()} </div>
                                                <div class="progress-stat-label" > ОБЩИЙ ОПЫТ </div>
                                                    </div>
                                                    <div class="progress-stat-card" >
                                                        <div class="progress-stat-value" > ${xpPerMinText} </div>
                                                            <div class="progress-stat-label" > СКОРОСТЬ НАБОРА </div>
                                                                </div>
                                                                <div class="progress-stat-card" >
                                                                    <div class="progress-stat-value" > ${prestigeText} </div>
                                                                        <div class="progress-stat-label" > ПРЕСТИЖ </div>
                                                                            </div>
                                                                            <div class="progress-stat-card" >
                                                                                <div class="progress-stat-value" > ${this.playerProgression.getPlayTimeFormatted()} </div>
                                                                                    <div class="progress-stat-label" > ВРЕМЯ В ИГРЕ </div>
                                                                                        </div>
                                                                                        </div>

                                                                                        <div class="progress-bonuses-grid" >
                                                                                            <div class="progress-bonus-item" >
                                                                                                <div class="progress-bonus-value" > +${bonuses.healthBonus} </div>
                                                                                                    <div class="progress-bonus-label" > ЗДОРОВЬЕ </div>
                                                                                                        </div>
                                                                                                        <div class="progress-bonus-item" >
                                                                                                            <div class="progress-bonus-value" > +${bonuses.damageBonus} </div>
                                                                                                                <div class="progress-bonus-label" > УРОН </div>
                                                                                                                    </div>
                                                                                                                    <div class="progress-bonus-item" >
                                                                                                                        <div class="progress-bonus-value" > +${bonuses.speedBonus.toFixed(1)} </div>
                                                                                                                            <div class="progress-bonus-label" > СКОРОСТЬ </div>
                                                                                                                                </div>
                                                                                                                                <div class="progress-bonus-item" >
                                                                                                                                    <div class="progress-bonus-value" > +${((bonuses.creditBonus - 1) * 100).toFixed(0)}% </div>
                                                                                                                                        <div class="progress-bonus-label" > КРЕДИТЫ </div>
                                                                                                                                            </div>
                                                                                                                                            </div>

            ${nextTitle ? `
            <div class="progress-next-level">
                <div class="progress-next-level-title">СЛЕДУЮЩИЙ РАНГ: УРОВЕНЬ ${nextTitle.level}</div>
                <div class="progress-next-level-rewards">
                    <span class="progress-reward" style="color: ${nextTitle.color}">
                        <span class="progress-reward-icon">${nextTitle.icon}</span>
                        ${nextTitle.title}
                    </span>
                    <span class="progress-reward">
                        <span class="progress-reward-icon">⭐</span>
                        +1 Очко навыков
                    </span>
                </div>
            </div>
            ` : `
            <div class="progress-next-level">
                <div class="progress-next-level-title" style="color: #ffd700">МАКСИМАЛЬНЫЙ УРОВЕНЬ ДОСТИГНУТ!</div>
            </div>
            `}
        `;
    }

    private achievementCategoryFilter: "all" | "combat" | "survival" | "progression" | "special" = "all";

    private renderAchievementsTab(): void {
        const content = document.getElementById("progress-achievements-content");
        if (!content || !this.playerProgression) return;

        const { unlocked, locked } = this.playerProgression.getAchievements();
        const allAchievements = [...unlocked, ...locked];

        // Filter by category
        const filtered = this.achievementCategoryFilter === "all"
            ? allAchievements
            : allAchievements.filter(a => a.category === this.achievementCategoryFilter);

        // Category counts
        const categoryCounts = {
            all: allAchievements.length,
            combat: allAchievements.filter(a => a.category === "combat").length,
            survival: allAchievements.filter(a => a.category === "survival").length,
            progression: allAchievements.filter(a => a.category === "progression").length,
            special: allAchievements.filter(a => a.category === "special").length
        };

        const unlockedCount = unlocked.length;
        const totalCount = allAchievements.length;

        content.innerHTML = `
            <div style="margin-bottom: 15px; text-align: center; color: #0f0; font-size: 11px;" >
                Разблокировано: ${unlockedCount} / ${totalCount}
                    </div>

                    <div class="achievements-category-tabs" >
                        <button class="achievement-category-btn ${this.achievementCategoryFilter === 'all' ? 'active' : ''}" data-category="all" >
                            ВСЕ(${categoryCounts.all})
                            </button>
                            <button class="achievement-category-btn ${this.achievementCategoryFilter === 'combat' ? 'active' : ''}" data-category="combat" >
                    ⚔ БОЙ(${categoryCounts.combat})
            </button>
            <button class="achievement-category-btn ${this.achievementCategoryFilter === 'survival' ? 'active' : ''}" data-category="survival" >
                    🛡 ВЫЖИВАНИЕ(${categoryCounts.survival})
            </button>
            <button class="achievement-category-btn ${this.achievementCategoryFilter === 'progression' ? 'active' : ''}" data-category="progression" >
                    📈 ПРОГРЕСС(${categoryCounts.progression})
            </button>
            <button class="achievement-category-btn ${this.achievementCategoryFilter === 'special' ? 'active' : ''}" data-category="special" >
                    ⭐ ОСОБЫЕ(${categoryCounts.special})
            </button>
            </div>

            <div class="achievements-grid" >
                ${filtered.map(achievement => {
            const isUnlocked = unlocked.some((u: PlayerAchievement) => u.id === achievement.id);
            return `
                        <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'} tier-${achievement.tier}">
                            <div class="achievement-header">
                                <span class="achievement-icon">${achievement.icon}</span>
                                <span class="achievement-name">${achievement.name}</span>
                                <span class="achievement-tier ${achievement.tier}">${achievement.tier.toUpperCase()}</span>
                            </div>
                            <div class="achievement-description">${achievement.description}</div>
                            <div class="achievement-reward">
                                <span>💰 ${achievement.reward.credits}</span>
                                <span>⭐ ${achievement.reward.exp} XP</span>
                                ${achievement.reward.skillPoints ? `<span>🔧 +${achievement.reward.skillPoints} SP</span>` : ''}
                            </div>
                            <span class="achievement-status">${isUnlocked ? '✅' : '🔒'}</span>
                        </div>
                    `;
        }).join('')
            }
        </div>
            `;

        // Setup category filter buttons
        content.querySelectorAll(".achievement-category-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.achievementCategoryFilter = (btn as HTMLElement).dataset.category as any;
                this.renderAchievementsTab();
            });
        });
    }

    private renderQuestsTab(): void {
        const content = document.getElementById("progress-quests-content");
        if (!content || !this.playerProgression) return;

        const stats = this.playerProgression.getStats();
        const dailyQuests: DailyQuest[] = stats.dailyQuests || [];

        // Calculate time until daily reset (assumes reset at midnight)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const timeUntilReset = tomorrow.getTime() - now.getTime();
        const hoursLeft = Math.floor(timeUntilReset / (1000 * 60 * 60));
        const minutesLeft = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

        if (dailyQuests.length === 0) {
            content.innerHTML = `
            <div class="quests-header" >
                <div class="quests-title" > ЕЖЕДНЕВНЫЕ ЗАДАНИЯ </div>
                    <div class="quests-reset-timer" > Обновление через: ${hoursLeft}ч ${minutesLeft} м </div>
                        </div>
                        <div class="no-quests-message" >
                            Нет активных заданий.<br>
                    Задания обновляются ежедневно в полночь.
                </div>
                `;
            return;
        }

        const completedCount = dailyQuests.filter(q => q.completed).length;

        content.innerHTML = `
            <div class="quests-header" >
                <div class="quests-title" > ЕЖЕДНЕВНЫЕ ЗАДАНИЯ(${completedCount} / ${dailyQuests.length}) </div>
                    <div class="quests-reset-timer" > Обновление через: ${hoursLeft}ч ${minutesLeft} м </div>
                        </div>

            ${dailyQuests.map(quest => {
            const progressPercent = Math.min(100, (quest.progress / quest.target) * 100);
            return `
                    <div class="quest-card ${quest.completed ? 'completed' : ''}">
                        <div class="quest-header">
                            <span class="quest-name">${quest.name}</span>
                            <span class="quest-status-icon">${quest.completed ? '✅' : '⏳'}</span>
                        </div>
                        <div class="quest-description">${quest.description}</div>
                        <div class="quest-progress-bar-bg">
                            <div class="quest-progress-bar-fill" style="width: ${progressPercent}%"></div>
                            <span class="quest-progress-text">${quest.progress} / ${quest.target}</span>
                        </div>
                        <div class="quest-rewards">
                            <span class="quest-reward">
                                <span class="quest-reward-icon">💰</span>${quest.reward.credits}
                            </span>
                            <span class="quest-reward">
                                <span class="quest-reward-icon">⭐</span>${quest.reward.exp} XP
                            </span>
                        </div>
                    </div>
                `;
        }).join('')
            }
        `;
    }

    private createMapSelectionPanel(): void {
        this.mapSelectionPanel = document.createElement("div");
        this.mapSelectionPanel.className = "panel-overlay";
        this.mapSelectionPanel.id = "map-selection-panel";
        const L = getLang(this.settings);
        this.mapSelectionPanel.innerHTML = `
            <div class="panel-content" >
                <button class="panel-close" id="map-selection-close" >✕</button>
                    <div class="panel-title" > ${L.mapSelection} </div>

                        <div class="map-grid" >
                            <div class="map-card recommended" id="btn-map-normal" >
                                <span class="map-card-icon" >🗺</span>
                                    <span class="map-card-name" > ${L.normalMap} </span>
                                        <span class="map-card-desc" > ${L.normalMapDesc} </span>
                                            </div>
                                            <div class="map-card" id="btn-map-sandbox" >
                                                <span class="map-card-icon" >🏖</span>
                                                    <span class="map-card-name" > ${L.sandboxMap} </span>
                                                        <span class="map-card-desc" > ${L.sandboxMapDesc} </span>
                                                            </div>
                                                            <div class="map-card" id="btn-map-sand" >
                                                                <span class="map-card-icon" >🏜</span>
                                                                    <span class="map-card-name" > ${L.sandMap} </span>
                                                                        <span class="map-card-desc" > ${L.sandMapDesc} </span>
                                                                            </div>
                                                                            <div class="map-card" id="btn-map-madness" >
                                                                                <span class="map-card-icon" >🌉</span>
                                                                                    <span class="map-card-name" > ${L.madnessMap} </span>
                                                                                        <span class="map-card-desc" > ${L.madnessMapDesc} </span>
                                                                                            </div>
                                                                                            <div class="map-card" id="btn-map-expo" >
                                                                                                <span class="map-card-icon" >🏆</span>
                                                                                                    <span class="map-card-name" > ${L.expoMap} </span>
                                                                                                        <span class="map-card-desc" > ${L.expoMapDesc} </span>
                                                                                                            </div>
                                                                                                            <div class="map-card" id="btn-map-brest" >
                                                                                                                <span class="map-card-icon" >🏰</span>
                                                                                                                    <span class="map-card-name" > ${L.brestMap} </span>
                                                                                                                        <span class="map-card-desc" > ${L.brestMapDesc} </span>
                                                                                                                            </div>
                                                                                                                            <div class="map-card" id="btn-map-arena" >
                                                                                                                                <span class="map-card-icon" >⚔️</span>
                                                                                                                                    <span class="map-card-name" > ${L.arenaMap} </span>
                                                                                                                                        <span class="map-card-desc" > ${L.arenaMapDesc} </span>
                                                                                                                                            </div>
                                                                                                                                            <div class="map-card" id="btn-map-polygon" >
                                                                                                                                                <span class="map-card-icon" >🎯</span>
                                                                                                                                                    <span class="map-card-name" > ${L.polygonMap} </span>
                                                                                                                                                        <span class="map-card-desc" > ${L.polygonMapDesc} </span>
                                                                                                                                                            </div>
                                                                                                                                                            <div class="map-card" id="btn-map-frontline" >
                                                                                                                                                                <span class="map-card-icon" >💥</span>
                                                                                                                                                                    <span class="map-card-name" > ${L.frontlineMap} </span>
                                                                                                                                                                        <span class="map-card-desc" > ${L.frontlineMapDesc} </span>
                                                                                                                                                                            </div>
                                                                                                                                                                            <div class="map-card" id="btn-map-ruins" >
                                                                                                                                                                                <span class="map-card-icon" >🏚</span>
                                                                                                                                                                                    <span class="map-card-name" > ${L.ruinsMap} </span>
                                                                                                                                                                                        <span class="map-card-desc" > ${L.ruinsMapDesc} </span>
                                                                                                                                                                                            </div>
                                                                                                                                                                                            <div class="map-card" id="btn-map-canyon" >
                                                                                                                                                                                                <span class="map-card-icon" >⛰</span>
                                                                                                                                                                                                    <span class="map-card-name" > ${L.canyonMap} </span>
                                                                                                                                                                                                        <span class="map-card-desc" > ${L.canyonMapDesc} </span>
                                                                                                                                                                                                            </div>
                                                                                                                                                                                                            <div class="map-card" id="btn-map-industrial" >
                                                                                                                                                                                                                <span class="map-card-icon" >🏭</span>
                                                                                                                                                                                                                    <span class="map-card-name" > ${L.industrialMap} </span>
                                                                                                                                                                                                                        <span class="map-card-desc" > ${L.industrialMapDesc} </span>
                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                            <div class="map-card" id="btn-map-urban_warfare" >
                                                                                                                                                                                                                                <span class="map-card-icon" >🏙</span>
                                                                                                                                                                                                                                    <span class="map-card-name" > ${L.urbanWarfareMap} </span>
                                                                                                                                                                                                                                        <span class="map-card-desc" > ${L.urbanWarfareMapDesc} </span>
                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                            <div class="map-card" id="btn-map-underground" >
                                                                                                                                                                                                                                                <span class="map-card-icon" >🕳</span>
                                                                                                                                                                                                                                                    <span class="map-card-name" > ${L.undergroundMap} </span>
                                                                                                                                                                                                                                                        <span class="map-card-desc" > ${L.undergroundMapDesc} </span>
                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                            <div class="map-card" id="btn-map-coastal" >
                                                                                                                                                                                                                                                                <span class="map-card-icon" >🌊</span>
                                                                                                                                                                                                                                                                    <span class="map-card-name" > ${L.coastalMap} </span>
                                                                                                                                                                                                                                                                        <span class="map-card-desc" > ${L.coastalMapDesc} </span>
                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                            <div class="map-card" id="btn-map-tartaria" >
                                                                                                                                                                                                                                                                                <span class="map-card-new" > NEW </span>
                                                                                                                                                                                                                                                                                    <span class="map-card-icon" >🏛</span>
                                                                                                                                                                                                                                                                                        <span class="map-card-name" > ${L.tartariaMap} </span>
                                                                                                                                                                                                                                                                                            <span class="map-card-desc" > ${L.tartariaMapDesc} </span>
                                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                                </div>

                                                                                                                                                                                                                                                                                                <!-- CUSTOM MAPS SECTION -->
                                                                                                                                                                                                                                                                                                <div class="panel-section-title" style="margin-top: 25px; color: #fbbf24; border-bottom: 1px solid rgba(251, 191, 36, 0.3); padding-bottom: 8px; margin-bottom: 15px; font-weight: bold; font-family: 'Press Start 2P'; font-size: 12px;">ПОЛЬЗОВАТЕЛЬСКИЕ КАРТЫ</div>
                                                                                                                                                                                                                                                                                                <div class="map-grid" id="custom-maps-grid">
                                                                                                                                                                                                                                                                                                    <div style="grid-column: 1 / -1; text-align: center; color: #888; font-size: 11px; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px dashed #444;">
                                                                                                                                                                                                                                                                                                        <div>Нет сохраненных карт</div>
                                                                                                                                                                                                                                                                                                        <div style="margin-top: 8px; color: #555;">Создайте карту в редакторе и отправьте её в игру</div>
                                                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                                </div>

                                                                                                                                                                                                                                                                                                <div class="panel-buttons" style="margin-top: 20px;" >
                                                                                                                                                                                                                                                                                                    <button class="panel-btn" id="map-selection-back" > Назад </button>
                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                            `;

        document.body.appendChild(this.mapSelectionPanel);

        const addMapButtonHandler = (mapId: string, mapType: MapType) => {
            document.getElementById(mapId)?.addEventListener("click", () => {

                this.hide();
                this.hideMapSelection();
                if (this.onStartGame && typeof this.onStartGame === 'function') {

                    this.onStartGame(mapType);
                } else {
                    console.error("[Menu] onStartGame callback is not set!");
                }
            });
        };

        addMapButtonHandler("btn-map-normal", "normal");
        addMapButtonHandler("btn-map-sandbox", "sandbox");
        addMapButtonHandler("btn-map-sand", "sand");
        addMapButtonHandler("btn-map-madness", "madness");
        addMapButtonHandler("btn-map-expo", "expo");
        addMapButtonHandler("btn-map-brest", "brest");
        addMapButtonHandler("btn-map-arena", "arena");
        addMapButtonHandler("btn-map-polygon", "polygon");
        addMapButtonHandler("btn-map-frontline", "frontline");
        addMapButtonHandler("btn-map-ruins", "ruins");
        addMapButtonHandler("btn-map-canyon", "canyon");
        addMapButtonHandler("btn-map-industrial", "industrial");
        addMapButtonHandler("btn-map-urban_warfare", "urban_warfare");
        addMapButtonHandler("btn-map-underground", "underground");
        addMapButtonHandler("btn-map-coastal", "coastal");
        addMapButtonHandler("btn-map-tartaria", "tartaria");

        this.setupCloseButton("map-selection-close", () => this.hideMapSelection());
        this.setupCloseButton("map-selection-back", () => this.hideMapSelection());
        this.setupPanelCloseOnBackground(this.mapSelectionPanel, () => this.hideMapSelection());
        this.updateCustomMapsUI();
    }

    private updateCustomMapsUI(): void {
        // Try both containers (panel and play window)
        const containers = [
            document.getElementById("custom-maps-grid"),
            document.getElementById("custom-maps-list-play-window"),
            document.getElementById("mp-create-room-custom-maps-grid")
        ];

        const maps = getCustomMapsList();

        containers.forEach(container => {
            if (!container) return;

            if (maps.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; color: #888; font-size: 11px; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px dashed #444;">
                        <div>Нет сохраненных карт</div>
                        <div style="margin-top: 8px; color: #555;">Создайте карту в редакторе и отправьте её в игру</div>
                    </div>`;
                return;
            }

            container.innerHTML = "";
            maps.forEach(mapName => {
                const card = document.createElement("div");
                card.className = "map-card custom-map-card";
                card.id = `btn-map-custom-${mapName}-${container.id}`; // Unique ID per container

                card.innerHTML = `
                    <span class="map-card-icon" style="filter: hue-rotate(90deg);">🗺</span>
                    <span class="map-card-name" style="word-break: break-all;">${mapName}</span>
                    <span class="map-card-desc">Пользовательская карта</span>
                    <button class="custom-map-delete" title="Удалить" style="position: absolute; top: 5px; right: 5px; background: rgba(255,0,0,0.2); border: none; color: #f55; border-radius: 4px; cursor: pointer; padding: 4px 8px; font-size: 12px; transition: all 0.2s;">✕</button>
                `;

                // Delete handler
                const deleteBtn = card.querySelector(".custom-map-delete");
                if (deleteBtn) {
                    deleteBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (confirm(`Удалить карту "${mapName}"?`)) {
                            deleteCustomMap(mapName);
                            this.updateCustomMapsUI();
                        }
                    });

                    deleteBtn.addEventListener("mouseenter", () => {
                        (deleteBtn as HTMLElement).style.background = "rgba(255,0,0,0.8)";
                        (deleteBtn as HTMLElement).style.color = "#fff";
                    });
                    deleteBtn.addEventListener("mouseleave", () => {
                        (deleteBtn as HTMLElement).style.background = "rgba(255,0,0,0.2)";
                        (deleteBtn as HTMLElement).style.color = "#f55";
                    });
                }

                // Select handler
                card.addEventListener("click", () => {
                    // Check if we are in multiplayer create room context
                    if (container.id === "mp-create-room-custom-maps-grid") {
                        // Load map data first to ensure it's selected
                        if (loadCustomMap(mapName)) {
                            // Call the existing selection function but with 'custom' type
                            // We pass the card element to visualize selection
                            (window as any).selectMpCreateRoomMap('custom', card);
                        } else {
                            alert("Ошибка загрузки карты!");
                        }
                        return;
                    }

                    // Standard single player flow: Load map -> Start Game immediately
                    if (loadCustomMap(mapName)) {
                        this.hide();
                        this.hideMapSelection();
                        // Also hide play window?
                        const playMenu = document.getElementById("play-menu-panel");
                        if (playMenu) playMenu.classList.remove("visible");

                        if (this.onStartGame && typeof this.onStartGame === 'function') {
                            this.onStartGame('custom');
                        }
                    } else {
                        alert("Ошибка загрузки карты!");
                    }
                });

                container.appendChild(card);
            });
        });
    }



    private createPlayMenuPanel(): void {
        this.playMenuPanel = document.createElement("div");
        this.playMenuPanel.className = "panel";
        this.playMenuPanel.id = "play-menu-panel";
        const L = getLang(this.settings);

        // Загружаем сохраненные выборы
        const savedChassis = localStorage.getItem("selectedChassis") || "medium";
        const savedCannon = localStorage.getItem("selectedCannon") || "standard";
        this.selectedChassis = savedChassis;
        this.selectedCannon = savedCannon;

        this.playMenuPanel.innerHTML = `
            <div class="panel-content" style="position: relative; min-height: 100vh; height: 100%;">
                <div class="panel-title">${L.play || "ИГРАТЬ"}</div>

                <!-- 1. Выбор типа игры (Одиночная / Мультиплеер) -->
                <div class="play-window" id="play-window-mode" data-order="0" data-step="0" style="display: none;">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/type</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="close" data-step="0">✕</button>
                        </div>
                    </div>
                    <div class="section-title">1. Выбор типа игры</div>
                <div class="mode-buttons" style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
                    <button class="menu-btn play-btn game-type-btn" id="btn-type-single" data-type="single" style="padding: 25px 20px;">
                        <span class="btn-icon" style="font-size: 32px;">🎮</span>
                        <span class="btn-label" style="font-size: 16px;">ОДИНОЧНАЯ ИГРА</span>
                    </button>
                    <button class="menu-btn play-btn game-type-btn" id="btn-type-multiplayer" data-type="multiplayer" style="padding: 25px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                        <span class="btn-icon" style="font-size: 32px;">🌐</span>
                        <span class="btn-label" style="font-size: 16px;">МУЛЬТИПЛЕЕР</span>
                    </button>
                </div>
            </div>

                                                                                                                                                                                                                                                                                                                                                                                    <!-- 2. Выбор режима игры -->
            <div class="play-window" id="play-window-gamemode" data-order="1" data-step="1" style="display: none;">
                <div class="play-window-header">
                    <div class="play-window-title">/[user_id]/single/mode</div>
                    <div class="window-actions">
                        <button class="window-btn" data-nav="back" data-step="1">⟵</button>
                        <button class="window-btn" data-nav="forward" data-step="1">⟶</button>
                        <button class="window-btn" data-nav="close" data-step="1">✕</button>
                    </div>
                </div>
                <div class="section-title">2. Выбор режима игры</div>
                <div class="gamemode-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 15px;">
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-ffa" data-gamemode="ffa">
                        <span class="btn-icon">⚔️</span>
                        <span class="btn-label">Free-for-All</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-tdm" data-gamemode="tdm">
                        <span class="btn-icon">👥</span>
                        <span class="btn-label">Team Deathmatch</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-coop" data-gamemode="coop">
                        <span class="btn-icon">🤝</span>
                        <span class="btn-label">Co-op PvE</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-br" data-gamemode="battle_royale">
                        <span class="btn-icon">👑</span>
                        <span class="btn-label">Battle Royale</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-ctf" data-gamemode="ctf">
                        <span class="btn-icon">🚩</span>
                        <span class="btn-label">Capture the Flag</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-control-point" data-gamemode="control_point">
                        <span class="btn-icon">📍</span>
                        <span class="btn-label">Control Point</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-escort" data-gamemode="escort">
                        <span class="btn-icon">🚛</span>
                        <span class="btn-label">Escort</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-survival" data-gamemode="survival">
                        <span class="btn-icon">⚔️</span>
                        <span class="btn-label">Survival</span>
                    </button>
                    <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-raid" data-gamemode="raid">
                        <span class="btn-icon">👹</span>
                        <span class="btn-label">Raid</span>
                    </button>
                </div>
            </div>

            <!-- 1.5. Мультиплеер меню -->
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <div class="play-window" id="play-window-multiplayer" data-order="0.5" data-step="0.5" style="display: none;" >
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <div class="play-window-header" >
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <div class="play-window-title" > /[user_id]/multiplayer </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <div class="window-actions" >
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <button class="window-btn" data-nav="back" data-step="0.5" >⟵</button>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <button class="window-btn" data-nav="close" data-step="0.5" >✕</button>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <div class="section-title" >🌐 МУЛЬТИПЛЕЕР </div>

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <!--Кнопки действий-->
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                <div style="margin: 20px 0;" >
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    <div style="display: flex; gap: 10px; flex-direction: column;" >
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        <button class="panel-btn primary" id="mp-btn-quick-play" style="width: 100%; padding: 14px; font-size: 16px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: all 0.2s;" >
                                🔍 БЫСТРЫЙ ПОИСК
            </button>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" >
                <button class="panel-btn" id="mp-btn-create-room" style="padding: 12px; transition: all 0.2s;" >
                                    ➕ Создать комнату
            </button>
            <button class="panel-btn" id="mp-btn-join-room" style="padding: 12px; transition: all 0.2s;" >
                                    🔗 Присоединиться
            </button>
            </div>
            </div>
            </div>

            <!--Список доступных комнат-->
                <div id="mp-rooms-list" style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid #0f0;" >
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;" >
                        <div style="font-weight: bold; color: #0f0; font-size: 14px;" >📋 Доступные комнаты </div>
                            <button id="mp-btn-refresh-rooms" style="padding: 4px 8px; font-size: 10px; background: rgba(0, 255, 0, 0.2); border: 1px solid #0f0; border-radius: 4px; color: #0f0; cursor: pointer; transition: all 0.2s;" title="Обновить список" >
                                🔄
        </button>
            </div>
            <div id="mp-rooms-items" style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #0f0 rgba(0, 0, 0, 0.3);" >
                <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;" > Загрузка списка комнат...</div>
                    </div>
                    </div>

                    <!--Статус подключения-->
                        <div id="mp-status-container" style="margin: 15px 0; padding: 10px; background: rgba(0, 0, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
                            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;" >
                                <div style="display: flex; align-items: center; gap: 10px;" >
                                    <span id="mp-connection-indicator" style="width: 10px; height: 10px; border-radius: 50%; background: #888; display: inline-block;" > </span>
                                        <span id="mp-connection-status" style="font-size: 12px; color: #aaa;" > Не подключен </span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 8px;" >
                                                <button id="mp-btn-check-ws" class="panel-btn" style="padding: 6px 12px; font-size: 11px; font-weight: bold; background: linear-gradient(135deg, rgba(0, 100, 0, 0.6) 0%, rgba(0, 60, 0, 0.8) 100%); border: 1px solid rgba(0, 255, 0, 0.6); border-radius: 4px; transition: all 0.2s ease;" title="Проверить WebSocket соединение" >
                                    🔌 WebSocket
            </button>
            <button id="mp-btn-check-firebase" class="panel-btn" style="padding: 6px 12px; font-size: 11px; font-weight: bold; background: linear-gradient(135deg, rgba(120, 60, 0, 0.6) 0%, rgba(80, 40, 0, 0.8) 100%); border: 1px solid rgba(255, 165, 0, 0.6); border-radius: 4px; transition: all 0.2s ease;" title="Проверить Firebase соединение" >
                                    🔥 Firebase
            </button>
            <button id="mp-btn-reconnect" class="panel-btn" style="padding: 6px 12px; font-size: 11px; display: none; border-radius: 4px;" >
                                    🔄 Переподключить
            </button>
            </div>
            </div>
            </div>

            <!--Модальное окно для присоединения к комнате-->
                <div id="mp-join-room-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); z-index: 100005 !important; align-items: center; justify-content: center; pointer-events: auto;" >
                    <div style="background: linear-gradient(135deg, rgba(20, 20, 30, 0.95) 0%, rgba(30, 30, 40, 0.95) 100%); border: 2px solid #667eea; border-radius: 12px; padding: 30px; max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); position: relative; z-index: 100006;" >
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #fff;" > Присоединиться к комнате </div>
                            <div style="margin-bottom: 20px;" >
                                <label for="mp-room-id-input" style="display: block; font-size: 12px; color: #aaa; margin-bottom: 8px;" > ID комнаты: </label>
                                    <input type="text" id="mp-room-id-input" placeholder="Введите ID комнаты" style="width: 100%; padding: 12px; background: rgba(0, 0, 0, 0.4); border: 1px solid #444; border-radius: 6px; color: #fff; font-family: monospace; font-size: 14px; outline: none; transition: border-color 0.2s;" />
                                        <div id="mp-room-id-error" style="display: none; color: #ef4444; font-size: 11px; margin-top: 6px;" > </div>
                                            </div>
                                            <div style="display: flex; gap: 10px;" >
                                                <button id="mp-modal-join-btn" class="panel-btn primary" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none;" >
                                                    Присоединиться
                                                    </button>
                                                    <button id="mp-modal-cancel-btn" class="panel-btn" style="flex: 1; padding: 12px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444;" >
                                                        Отмена
                                                        </button>
                                                        </div>
                                                        </div>
                                                        </div>

                                                        <!--Модальное окно с детальной информацией о комнате-->
                                                            <div id="mp-room-details-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 100007 !important; align-items: center; justify-content: center; pointer-events: auto; overflow-y: auto;" >
                                                                <div style="background: linear-gradient(135deg, rgba(20, 20, 30, 0.98) 0%, rgba(30, 30, 40, 0.98) 100%); border: 2px solid #667eea; border-radius: 16px; padding: 30px; max-width: 500px; width: 90%; max-height: 90vh; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6); position: relative; z-index: 100008; margin: 20px 0;" >
                                                                    <!--Заголовок -->
                                                                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid rgba(102, 126, 234, 0.3);" >
                                                                            <div style="font-size: 20px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px;" >
                                                                                <span>🏠</span>
                                                                                    <span > Детали комнаты </span>
                                                                                        </div>
                                                                                        <button id="mp-room-details-close" style="width: 32px; height: 32px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Закрыть" >
                                    ×
        </button>
            </div>

            <!--Основная информация-->
                <div style="margin-bottom: 20px;" >
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;" >
                        <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);" >
                            <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > ID комнаты </div>
                                <div id="mp-room-details-id" style="font-size: 16px; font-weight: bold; color: #a78bfa; font-family: monospace;" > -</div>
                                    </div>
                                    <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);" >
                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > Режим </div>
                                            <div id="mp-room-details-mode" style="font-size: 16px; font-weight: bold; color: #667eea;" > -</div>
                                                </div>
                                                </div>

                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;" >
                                                    <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);" >
                                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > Игроков </div>
                                                            <div id="mp-room-details-players" style="font-size: 16px; font-weight: bold; color: #4ade80;" > -</div>
                                                                </div>
                                                                <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);" >
                                                                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > Статус </div>
                                                                        <div id="mp-room-details-status" style="font-size: 16px; font-weight: bold; color: #a78bfa;" > -</div>
                                                                            </div>
                                                                            </div>

                                                                            <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2); margin-bottom: 15px;" >
                                                                                <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > Время игры </div>
                                                                                    <div id="mp-room-details-time" style="font-size: 14px; color: #aaa; font-family: monospace;" > -</div>
                                                                                        </div>
                                                                                        </div>

                                                                                        <!--Прогресс - бар заполненности-->
                                                                                            <div style="margin-bottom: 20px;" >
                                                                                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;" >
                                                                                                    <span style="font-size: 12px; color: #aaa;" > Заполненность </span>
                                                                                                        <span id="mp-room-details-progress-text" style="font-size: 12px; color: #4ade80; font-weight: 600;" > -</span>
                                                                                                            </div>
                                                                                                            <div style="width: 100%; height: 8px; background: rgba(0, 0, 0, 0.4); border-radius: 4px; overflow: hidden;" >
                                                                                                                <div id="mp-room-details-progress-bar" style="height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); width: 0%; transition: width 0.3s; border-radius: 4px;" > </div>
                                                                                                                    </div>
                                                                                                                    </div>

                                                                                                                    <!--Список игроков в комнате-->
                                                                                                                        <div style="margin-bottom: 20px;" >
                                                                                                                            <div style="font-size: 12px; font-weight: 600; color: #667eea; margin-bottom: 10px;" >👥 Игроки в комнате: </div>
                                                                                                                                <div id="mp-room-details-players-list" style="max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #667eea rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; gap: 6px;" >
                                                                                                                                    <div style="text-align: center; padding: 10px; color: #888; font-size: 11px;" > Загрузка списка игроков...</div>
                                                                                                                                        </div>
                                                                                                                                        </div>

                                                                                                                                        <!--Панель управления(только для создателя комнаты)-->
                                                                                                                                            <div id="mp-room-details-admin-panel" style="display: none; margin-bottom: 20px; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.3);" >
                                                                                                                                                <div style="font-size: 12px; font-weight: 600; color: #a78bfa; margin-bottom: 12px;" >⚙️ Управление комнатой: </div>
                                                                                                                                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;" >
                                                                                                                                                        <button id="mp-room-details-change-mode" class="panel-btn" style="padding: 10px; font-size: 11px; background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #a78bfa;" >
                                        🔄 Изменить режим
            </button>
            <button id="mp-room-details-change-max" class="panel-btn" style="padding: 10px; font-size: 11px; background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #a78bfa;" >
                                        👥 Макс.игроков
            </button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" >
                <button id="mp-room-details-toggle-private" class="panel-btn" style="padding: 10px; font-size: 11px; background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #a78bfa;" >
                                        🔒 Приватность
            </button>
            <button id="mp-room-details-transfer" class="panel-btn" style="padding: 10px; font-size: 11px; background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #a78bfa;" >
                                        👑 Передать права
            </button>
            </div>
            </div>

            <!--Кнопки действий-->
                <div style="display: flex; gap: 10px; margin-top: 25px;" >
                    <button id="mp-room-details-join" class="panel-btn primary" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; font-size: 14px; font-weight: 600;" >
                                    🎮 Присоединиться
            </button>
            <button id="mp-room-details-copy-id" class="panel-btn" style="padding: 14px; background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #a78bfa; min-width: 50px;" title="Копировать ID" >
                                    📋
        </button>
            </div>
            </div>
            </div>

            <style>
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
        }
        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(-10px); }
                            to { opacity: 1; transform: translateY(0); }
        }

        /* Анимации для кнопки "В БОЙ!" */
        @keyframes battlePulse {
            0%, 100% {
                box-shadow: 0 0 20px rgba(74, 222, 128, 0.6),
                    0 0 40px rgba(74, 222, 128, 0.4),
                        0 0 60px rgba(74, 222, 128, 0.2);
            transform: scale(1);
        }
        50% {
            box-shadow: 0 0 30px rgba(74, 222, 128, 0.8),
                0 0 60px rgba(74, 222, 128, 0.6),
                    0 0 90px rgba(74, 222, 128, 0.4);
        transform: scale(1.02);
    }
}

@keyframes battleShine {
    0% {
        transform: translateX(-100%) translateY(-100%) rotate(45deg);
}
100% {
    transform: translateX(200%) translateY(200%) rotate(45deg);
                            }
                        }

@keyframes battleGradient {
    0% {
        background-position: 0% 50%;
}
50% {
    background-position: 100% 50%;
                            }
100% {
    background-position: 0% 50%;
                            }
                        }

@keyframes battleConstruction {
    0% {
        background-position: -100% 0;
}
100% {
    background-position: 200% 0;
                            }
                        }

@keyframes battleTextGlow {
    0%, 100% {
        text-shadow: 0 0 10px rgba(74, 222, 128, 0.8),
            0 0 20px rgba(74, 222, 128, 0.6),
                0 0 30px rgba(74, 222, 128, 0.4);
}
50% {
    text-shadow: 0 0 15px rgba(74, 222, 128, 1),
        0 0 30px rgba(74, 222, 128, 0.8),
            0 0 45px rgba(74, 222, 128, 0.6);
                            }
                        }

                        /* Стили кнопки "В БОЙ!" */
                        .battle-btn {
    background: linear-gradient(135deg,
        rgba(74, 222, 128, 0.4) 0%,
        rgba(34, 197, 94, 0.4) 50%,
        rgba(74, 222, 128, 0.4) 100%);
    background-size: 200% 200%;
    border: 2px solid #4ade80;
    color: #4ade80;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: battleGradient 3s ease infinite, battlePulse 2s ease-in-out infinite;
}

                        .battle-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255, 255, 255, 0.1) 10px,
        rgba(255, 255, 255, 0.1) 20px
    );
    animation: battleConstruction 3s linear infinite;
    pointer-events: none;
}

                        .battle-btn-text {
    position: relative;
    z-index: 2;
    display: block;
    animation: battleTextGlow 2s ease-in-out infinite;
}

                        .battle-btn-shine {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
        45deg,
        transparent 30%,
        rgba(255, 255, 255, 0.3) 50%,
        transparent 70%
                            );
    animation: battleShine 3s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
}

                        .battle-btn:hover {
    transform: scale(1.05) translateY(-2px);
    box-shadow: 0 0 40px rgba(74, 222, 128, 0.8),
        0 0 80px rgba(74, 222, 128, 0.6),
            0 0 120px rgba(74, 222, 128, 0.4);
    border-color: #22c55e;
    background: linear-gradient(135deg,
        rgba(74, 222, 128, 0.6) 0%,
        rgba(34, 197, 94, 0.6) 50%,
        rgba(74, 222, 128, 0.6) 100%);
    background-size: 200% 200%;
}

                        .battle-btn:active {
    transform: scale(0.98) translateY(0);
    animation: none;
}

                        .battle-btn-ready {
    animation: battleGradient 3s ease infinite, battlePulse 2s ease-in-out infinite;
}
                        .mp-mode-btn {
    transition: all 0.2s ease;
    text-align: left;
}
                        .mp-mode-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}
                        .mp-mode-btn.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: #667eea;
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}
#mp-join-room-modal {
    animation: fadeIn 0.2s ease;
    z-index: 100005!important;
    position: fixed!important;
    pointer-events: auto!important;
}
#mp-join-room-modal > div {
    position: relative;
    z-index: 100006;
    pointer-events: auto;
}
#mp-join-room-modal input:focus {
    border-color: #667eea;
    box-shadow: 0 0 8px rgba(102, 126, 234, 0.4);
}

/* Стили для детального меню комнаты */
#mp-room-details-modal {
    animation: fadeIn 0.3s ease;
}

#mp-room-details-modal > div {
    animation: slideUp 0.3s ease;
}

#mp-room-details-close:hover {
    background: rgba(239, 68, 68, 0.4)!important;
    transform: scale(1.1);
}

#mp-room-details-join:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

#mp-room-details-copy-id:hover {
    background: rgba(102, 126, 234, 0.3)!important;
    transform: scale(1.1);
}

@keyframes slideUp {
                            from {
        opacity: 0;
        transform: translateY(20px);
    }
                            to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
    </div>

    <!--Панель выбора режима для создания комнаты-->
        <div class="play-window" id="mp-create-room-mode" data-order="1" data-step="1" style="display: none;" >
            <div class="play-window-header" >
                <div class="play-window-title" > /[user_id]/multiplayer / mode </div>
                    <div class="window-actions" >
                        <button class="window-btn" data-nav="back" data-step="1" >⟵</button>
                            <button class="window-btn" data-nav="close" data-step="1" >✕</button>
                                </div>
                                </div>
                                <div class="section-title" > Выбор режима игры </div>
                                    <div class="gamemode-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 15px;" >
                                        <button class="menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('ffa')" >
                                            <span class="btn-icon" >⚔️</span>
                                                <span class="btn-label" > Free-for-All </span>
                                                    </button>
                                                    <button class= "menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('tdm')" >
                                                    <span class= "btn-icon" >👥</span>
                                                        <span class="btn-label" > Team Deathmatch </span>
                                                            </button>
                                                            <button class="menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('coop')" >
                                                                <span class="btn-icon" >🤝</span>
                                                                    <span class="btn-label" > Co-op PvE </span>
                                                                        </button>
                                                                        <button class="menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('battle_royale')" >
                                                                            <span class="btn-icon" >👑</span>
                                                                                <span class="btn-label" > Battle Royale </span>
                                                                                    </button>
                                                                                    <button class="menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('ctf')" >
                                                                                        <span class="btn-icon" >🚩</span>
                                                                                            <span class="btn-label" > Capture the Flag </span>
                                                                                                </button>
                                                                                                <button class="menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('survival')" >
                                                                                                    <span class="btn-icon" >⚔️</span>
                                                                                                        <span class="btn-label" > Survival </span>
                                                                                                            </button>
                                                                                                            <button class="menu-btn secondary gamemode-btn" onclick="window.selectMpCreateRoomMode('raid')" >
                                                                                                                <span class="btn-icon" >👹</span>
                                                                                                                    <span class="btn-label" > Raid </span>
                                                                                                                        </button>
                                                                                                                        </div>
                                                                                                                        </div>

                                                                                                                        <!--Панель выбора карты для создания комнаты-->
                                                                                                                            <div class="play-window play-window-wide" id="mp-create-room-map" data-order="2" data-step="2" style="display: none; pointer-events: auto; position: relative; z-index: 100010;" >
                                                                                                                                <div class="play-window-header" >
                                                                                                                                    <div class="play-window-title" > /[user_id]/multiplayer / mode / map </div>
                                                                                                                                        <div class="window-actions" >
                                                                                                                                            <button class="window-btn" data-nav="back" data-step="2" >⟵</button>
                                                                                                                                                <button class="window-btn" data-nav="close" data-step="2" >✕</button>
                                                                                                                                                    </div>
                                                                                                                                                    </div>
                                                                                                                                                    <div class="section-title" > Выбор карты </div>
                                                                                                                                                        <div class="map-grid" style="pointer-events: auto;" >
                                                                                                                                                            <div class="map-card recommended" onclick="window.selectMpCreateRoomMap('normal', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                <span class="map-card-icon" >🗺</span>
                                                                                                                                                                    <span class="map-card-name" > ${L.normalMap || "Обычная карта"} </span>
                                                                                                                                                                        </div>
                                                                                                                                                                        <div class="map-card" onclick="window.selectMpCreateRoomMap('sandbox', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                            <span class="map-card-icon" >🏖</span>
                                                                                                                                                                                <span class="map-card-name" > ${L.sandboxMap || "Песочница"} </span>
                                                                                                                                                                                    </div>
                                                                                                                                                                                    <div class="map-card" onclick="window.selectMpCreateRoomMap('sand', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                        <span class="map-card-icon" >🏜</span>
                                                                                                                                                                                            <span class="map-card-name" > ${L.sandMap || "Песок"} </span>
                                                                                                                                                                                                </div>
                                                                                                                                                                                                <div class="map-card" onclick="window.selectMpCreateRoomMap('madness', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                    <span class="map-card-icon" >🎪</span>
                                                                                                                                                                                                        <span class="map-card-name" > ${L.madnessMap || "Безумие"} </span>
                                                                                                                                                                                                            </div>
                                                                                                                                                                                                            <div class="map-card" onclick="window.selectMpCreateRoomMap('expo', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                <span class="map-card-icon" >🎡</span>
                                                                                                                                                                                                                    <span class="map-card-name" > ${L.expoMap || "Expo"} </span>
                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                        <div class="map-card" onclick="window.selectMpCreateRoomMap('brest', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                            <span class="map-card-icon" >🏰</span>
                                                                                                                                                                                                                                <span class="map-card-name" > ${L.brestMap || "Брестская крепость"} </span>
                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                    <div class="map-card" onclick="window.selectMpCreateRoomMap('arena', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                        <span class="map-card-icon" >🏟</span>
                                                                                                                                                                                                                                            <span class="map-card-name" > ${L.arenaMap || "Арена"} </span>
                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                <div class="map-card" onclick="window.selectMpCreateRoomMap('polygon', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                    <span class="map-card-icon" >🎯</span>
                                                                                                                                                                                                                                                        <span class="map-card-name" > ${L.polygonMap || "Полигон"} </span>
                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                            <div class="map-card" onclick="window.selectMpCreateRoomMap('frontline', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                <span class="map-card-icon" >💥</span>
                                                                                                                                                                                                                                                                    <span class="map-card-name" > ${L.frontlineMap || "Передовая"} </span>
                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                        <div class="map-card" onclick="window.selectMpCreateRoomMap('ruins', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                            <span class="map-card-icon" >🏚</span>
                                                                                                                                                                                                                                                                                <span class="map-card-name" > ${L.ruinsMap || "Руины"} </span>
                                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                    <div class="map-card" onclick="window.selectMpCreateRoomMap('canyon', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                                        <span class="map-card-icon" >⛰</span>
                                                                                                                                                                                                                                                                                            <span class="map-card-name" > ${L.canyonMap || "Ущелье"} </span>
                                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                                <div class="map-card" onclick="window.selectMpCreateRoomMap('industrial', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                                                    <span class="map-card-icon" >🏭</span>
                                                                                                                                                                                                                                                                                                        <span class="map-card-name" > ${L.industrialMap || "Промзона"} </span>
                                                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                                            <div class="map-card" onclick="window.selectMpCreateRoomMap('urban_warfare', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                                                                <span class="map-card-icon" >🏙</span>
                                                                                                                                                                                                                                                                                                                    <span class="map-card-name" > ${L.urbanWarfareMap || "Городские бои"} </span>
                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                        <div class="map-card" onclick="window.selectMpCreateRoomMap('underground', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                                                                            <span class="map-card-icon" >🕳</span>
                                                                                                                                                                                                                                                                                                                                <span class="map-card-name" > ${L.undergroundMap || "Подземелье"} </span>
                                                                                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                                                                    <div class="map-card" onclick="window.selectMpCreateRoomMap('coastal', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                                                                                        <span class="map-card-icon" >🌊</span>
                                                                                                                                                                                                                                                                                                                                            <span class="map-card-name" > ${L.coastalMap || "Побережье"} </span>
                                                                                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                                                                                <div class="map-card" onclick="window.selectMpCreateRoomMap('tartaria', this)" style="cursor: pointer; pointer-events: auto;" >
                                                                                                                                                                                                                                                                                                                                                    <span class="map-card-new" > NEW </span>
                                                                                                                                                                                                                                                                                                                                                        <span class="map-card-icon" >🏛</span>
                                                                                                                                                                                                                                                                                                                                                            <span class="map-card-name" > ${L.tartariaMap || "Тартария"} </span>
                                                                                                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                                                                                                 
                                                                                                                                                                                                                                                                                                                                                                 <!-- CUSTOM MAPS SECTION FOR MULTIPLAYER -->
                                                                                                                                                                                                                                                                                                                                                                 <div class="panel-section-title" style="margin-top: 25px; color: #fbbf24; border-bottom: 1px solid rgba(251, 191, 36, 0.3); padding-bottom: 8px; margin-bottom: 15px; font-weight: bold; font-family: 'Press Start 2P'; font-size: 12px;">ПОЛЬЗОВАТЕЛЬСКИЕ КАРТЫ</div>
                                                                                                                                                                                                                                                                                                                                                                 <div class="map-grid" id="mp-create-room-custom-maps-grid">
                                                                                                                                                                                                                                                                                                                                                                     <!-- Custom maps will be populated here -->
                                                                                                                                                                                                                                                                                                                                                                     <div style="grid-column: 1 / -1; text-align: center; color: #888; font-size: 11px; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px dashed #444;">
                                                                                                                                                                                                                                                                                                                                                                         <div>Нет сохраненных карт</div>
                                                                                                                                                                                                                                                                                                                                                                     </div>
                                                                                                                                                                                                                                                                                                                                                                 </div>

                                                                                                                                                                                                                                                                                                                                                                <!--Настройки ботов-->
                                                                                                                                                                                                                                                                                                                                                                    <div class="bot-settings" style="margin-top: 15px; padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);" >
                                                                                                                                                                                                                                                                                                                                                                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;" >
                                                                                                                                                                                                                                                                                                                                                                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #fff; font-size: 14px;" >
                                                                                                                                                                                                                                                                                                                                                                                <input type="checkbox" id="mp-enable-bots" style="width: 18px; height: 18px; cursor: pointer;" >
                                                                                                                                                                                                                                                                                                                                                                                    <span>🤖 Включить ботов </span>
                                                                                                                                                                                                                                                                                                                                                                                        </label>
                                                                                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                                                                                        <div id="mp-bot-count-wrapper" style="display: none; margin-top: 10px;" >
                                                                                                                                                                                                                                                                                                                                                                                            <label for="mp-bot-count" style="color: #aaa; font-size: 12px; display: block; margin-bottom: 5px;" > Количество ботов: </label>
                                                                                                                                                                                                                                                                                                                                                                                                <div style="display: flex; align-items: center; gap: 10px;" >
                                                                                                                                                                                                                                                                                                                                                                                                    <input type="range" id="mp-bot-count" min="1" max="16" value="4" style="flex: 1; cursor: pointer;" >
                                                                                                                                                                                                                                                                                                                                                                                                        <span id="mp-bot-count-value" style="color: #4ade80; font-weight: bold; min-width: 30px; text-align: center;" > 4 </span>
                                                                                                                                                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                                                                                                                                            </div>

                                                                                                                                                                                                                                                                                                                                                                                                            <!--Кнопка "Создать комнату" -->
                                                                                                                                                                                                                                                                                                                                                                                                                <div class="panel-buttons" style="margin-top: 20px; display: flex; gap: 10px;" >
                                                                                                                                                                                                                                                                                                                                                                                                                    <button class="panel-btn primary" id="mp-create-room-start-btn" onclick="window.startMpCreateRoom()" style="flex: 1; padding: 14px; font-size: 16px; font-weight: bold; background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%); border: none;" >
                            ➕ Создать комнату
    </button>
    </div>
    </div>

    <!--Панель созданной комнаты-->
        <div class="play-window" id="mp-room-panel" data-order="3" data-step="3" style="display: none;" >
            <div class="play-window-header" >
                <div class="play-window-title" > /[user_id]/multiplayer / room </div>
                    <div class="window-actions" >
                        <button class="window-btn" id="mp-room-panel-minimize" title="Свернуть" >─</button>
                            <button class="window-btn" data-nav="back" data-step="3" >⟵</button>
                                <button class="window-btn" data-nav="close" data-step="3" >✕</button>
                                    </div>
                                    </div>
                                    <div class="section-title" style="display: flex; align-items: center; gap: 10px;" >
                        🏠 КОМНАТА
    <span id="mp-room-panel-id" style="font-size: 14px; color: #4ade80; font-family: monospace; background: rgba(0, 0, 0, 0.3); padding: 4px 10px; border-radius: 4px;" > ----</span>
        <button id="mp-room-panel-copy-id" style="padding: 4px 8px; font-size: 12px; background: rgba(0, 255, 0, 0.2); border: 1px solid #0f0; border-radius: 4px; color: #0f0; cursor: pointer;" title="Копировать ID" >📋</button>
            </div>

            <!--Информация о комнате-->
                <div style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;" >
                        <div style="padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px;" >
                            <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > Режим </div>
                                <div id="mp-room-panel-mode" style="font-size: 16px; font-weight: bold; color: #0f0;" > FFA </div>
                                    </div>
                                    <div style="padding: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px;" >
                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;" > Карта </div>
                                            <div id="mp-room-panel-map" style="font-size: 16px; font-weight: bold; color: #0f0;" > Обычная </div>
                                                </div>
                                                </div>
                                                <div style="display: flex; justify-content: space-between; align-items: center;" >
                                                    <div style="font-size: 13px; color: #aaa;" >
                                                        Игроков: <span id="mp-room-panel-players" style="color: #4ade80; font-weight: bold;" > 1 / 32 </span>
                                                            </div>
                                                            <div id="mp-room-panel-status" style="font-size: 12px; padding: 4px 10px; background: rgba(74, 222, 128, 0.2); border-radius: 4px; color: #4ade80;" >
                                                                Ожидание игроков
                                                                    </div>
                                                                    </div>
                                                                    </div>

                                                                    <!--Команды(для TDM / CTF) -->
                                                                        <div id="mp-room-panel-teams" style="display: none; margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
                                                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" >
                                                                                <div style="font-weight: bold; color: #0f0; font-size: 14px;" >⚔️ Команды </div>
                                                                                    <button class="panel-btn" id="mp-room-panel-auto-balance" style="padding: 6px 12px; font-size: 11px;" >
                                ⚖️ Автобаланс
    </button>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" >
        <!--Команда 1 -->
            <div style="padding: 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px;" >
                <div style="font-weight: bold; color: #ef4444; font-size: 12px; margin-bottom: 8px;" >
                                    🔴 Команда 1
    <span id="mp-room-panel-team1-count" style="float: right; color: #aaa; font-size: 11px;" > 0 игроков </span>
        </div>
        <div id="mp-room-panel-team1-players" style="display: flex; flex-direction: column; gap: 4px; min-height: 40px;" >
            <!--Игроки команды 1 -->
                </div>
                </div>
                <!--Команда 2 -->
                    <div style="padding: 10px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;" >
                        <div style="font-weight: bold; color: #3b82f6; font-size: 12px; margin-bottom: 8px;" >
                                    🔵 Команда 2
    <span id="mp-room-panel-team2-count" style="float: right; color: #aaa; font-size: 11px;" > 0 игроков </span>
        </div>
        <div id="mp-room-panel-team2-players" style="display: flex; flex-direction: column; gap: 4px; min-height: 40px;" >
            <!--Игроки команды 2 -->
                </div>
                </div>
                </div>
                <div style="margin-top: 10px; padding: 8px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; font-size: 11px; color: #aaa;" >
                    Баланс: <span id="mp-room-panel-balance-status" style="color: #4ade80;" > Сбалансировано </span>
                        </div>
                        </div>

                        <!--Список игроков-->
                            <div style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" >
                                    <div style="font-weight: bold; color: #0f0; font-size: 14px;" >👥 Игроки в комнате </div>
                                        <div id="mp-room-panel-ready-status" style="font-size: 11px; color: #888;" >
                                            Готовы: <span id="mp-room-panel-ready-count" style="color: #4ade80; font-weight: bold;" > 0 / 1 </span>
                                                </div>
                                                </div>
                                                <div id="mp-room-panel-players-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;" >
                                                    <div style="padding: 10px; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 6px; display: flex; align-items: center; justify-content: space-between; gap: 10px;" >
                                                        <div style="display: flex; align-items: center; gap: 10px;" >
                                                            <span style="font-size: 18px;" >👑</span>
                                                                <span id="mp-room-panel-host-name" style="color: #4ade80; font-weight: bold;" > Вы(Хост) </span>
                                                                    </div>
                                                                    <button id="mp-room-panel-ready-btn" class="panel-btn" style="padding: 6px 12px; font-size: 11px; background: rgba(74, 222, 128, 0.2); border-color: #4ade80; color: #4ade80;" >
                                    ✓ Готов
    </button>
    </div>
    </div>
    </div>

    <!--Чат комнаты-->
        <div style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
            <div style="font-weight: bold; color: #0f0; font-size: 14px; margin-bottom: 10px;" >💬 Чат комнаты </div>
                <div id="mp-room-panel-chat-messages" style="max-height: 150px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #0f0 rgba(0, 0, 0, 0.3); margin-bottom: 10px; padding: 8px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; font-size: 11px; font-family: 'Consolas', 'Monaco', monospace; min-height: 80px;" >
                    <div style="text-align: center; padding: 10px; color: #888; font-size: 10px;" > Сообщения чата появятся здесь...</div>
                        </div>
                        <div style="display: flex; gap: 8px;" >
                            <input type="text" id="mp-room-panel-chat-input" placeholder="Введите сообщение... (Enter для отправки)" style="
flex: 1;
padding: 8px;
background: rgba(0, 0, 0, 0.5);
border: 1px solid rgba(0, 255, 0, 0.3);
border-radius: 4px;
color: #0f0;
font-family: 'Consolas', 'Monaco', monospace;
font-size: 11px;
outline: none;
" />
    <button id="mp-room-panel-chat-send" style="
padding: 8px 16px;
background: rgba(0, 255, 0, 0.2);
border: 1px solid #0f0;
border-radius: 4px;
color: #0f0;
font-family: 'Consolas', 'Monaco', monospace;
font-size: 11px;
cursor: pointer;
transition: all 0.2s;
">Отправить</button>
    </div>
    </div>

    <!--Настройки комнаты(только для хоста)-->
        <div id="mp-room-panel-settings" style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;" >
                <div style="font-weight: bold; color: #0f0; font-size: 14px;" >⚙️ Настройки комнаты </div>
                    <button id="mp-room-panel-settings-toggle" style="
padding: 4px 8px;
font-size: 12px;
background: rgba(0, 255, 0, 0.2);
border: 1px solid rgba(0, 255, 0, 0.4);
border-radius: 4px;
color: #0f0;
cursor: pointer;
transition: all 0.2s;
" title="Свернуть / развернуть">▼</button>
    </div>
    <div id="mp-room-panel-settings-content" >
        <!--Максимальное количество игроков-->
            <div style="margin-bottom: 15px;" >
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" >
                    <label for="mp-room-panel-max-players" style="font-size: 12px; color: #aaa;" > Максимум игроков: </label>
                        <span id="mp-room-panel-max-players-value" style="font-size: 14px; color: #4ade80; font-weight: bold;" > 32 </span>
                            </div>
                            <input type="range" id="mp-room-panel-max-players" min="2" max="32" value="32" step="1" style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.3); border-radius: 3px; outline: none; cursor: pointer;" >
                                <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px;" >
                                    <span>2 </span>
                                    <span > 32 </span>
                                    </div>
                                    </div>

                                    <!--Время раунда-->
                                        <div style="margin-bottom: 15px;" >
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" >
                                                <label for="mp-room-panel-round-time" style="font-size: 12px; color: #aaa;" > Время раунда(мин): </label>
                                                    <span id="mp-room-panel-round-time-value" style="font-size: 14px; color: #4ade80; font-weight: bold;" > 10 </span>
                                                        </div>
                                                        <input type="range" id="mp-room-panel-round-time" min="5" max="60" value="10" step="5" style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.3); border-radius: 3px; outline: none; cursor: pointer;" >
                                                            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px;" >
                                                                <span>5 </span>
                                                                <span > 60 </span>
                                                                </div>
                                                                </div>

                                                                <!--Лимит убийств / очков-->
                                                                    <div style="margin-bottom: 15px;" >
                                                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" >
                                                                            <label for="mp-room-panel-kill-limit" style="font-size: 12px; color: #aaa;" > Лимит убийств для победы: </label>
                                                                                <span id="mp-room-panel-kill-limit-value" style="font-size: 14px; color: #4ade80; font-weight: bold;" > 50 </span>
                                                                                    </div>
                                                                                    <input type="range" id="mp-room-panel-kill-limit" min="10" max="200" value="50" step="10" style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.3); border-radius: 3px; outline: none; cursor: pointer;" >
                                                                                        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 4px;" >
                                                                                            <span>10 </span>
                                                                                            <span > 200 </span>
                                                                                            </div>
                                                                                            </div>

                                                                                            <!--Настройки танков и оружия-->
                                                                                                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(0, 255, 0, 0.2);" >
                                                                                                    <div style="font-weight: bold; color: #0f0; font-size: 12px; margin-bottom: 10px;" >🚫 Ограничения </div>

                                                                                                        <!--Разрешенные танки-->
                                                                                                            <div style="margin-bottom: 10px;" >
                                                                                                                <label id="label-tank-classes" style="font-size: 11px; color: #aaa; display: block; margin-bottom: 6px;" > Разрешенные классы танков: </label>
                                                                                                                    <div role="group" aria-labelledby="label-tank-classes" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;" >
                                                                                                                        <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                            <input type="checkbox" id="mp-room-panel-allow-light" checked style="cursor: pointer;" >
                                                                                                                                <span>⚡ Легкие </span>
                                                                                                                                    </label>
                                                                                                                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                        <input type="checkbox" id="mp-room-panel-allow-medium" checked style="cursor: pointer;" >
                                                                                                                                            <span>⚖️ Средние </span>
                                                                                                                                                </label>
                                                                                                                                                <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                    <input type="checkbox" id="mp-room-panel-allow-heavy" checked style="cursor: pointer;" >
                                                                                                                                                        <span>🛡️ Тяжелые </span>
                                                                                                                                                            </label>
                                                                                                                                                            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                                <input type="checkbox" id="mp-room-panel-allow-assault" checked style="cursor: pointer;" >
                                                                                                                                                                    <span>⚔️ Штурмовые </span>
                                                                                                                                                                        </label>
                                                                                                                                                                        </div>
                                                                                                                                                                        </div>

                                                                                                                                                                        <!--Разрешенное оружие-->
                                                                                                                                                                            <div style="margin-bottom: 10px;" >
                                                                                                                                                                                <label id="label-weapon-types" style="font-size: 11px; color: #aaa; display: block; margin-bottom: 6px;" > Разрешенные типы оружия: </label>
                                                                                                                                                                                    <div role="group" aria-labelledby="label-weapon-types" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;" >
                                                                                                                                                                                        <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                                                            <input type="checkbox" id="mp-room-panel-allow-standard" checked style="cursor: pointer;" >
                                                                                                                                                                                                <span>🔫 Стандартные </span>
                                                                                                                                                                                                    </label>
                                                                                                                                                                                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                                                                        <input type="checkbox" id="mp-room-panel-allow-rapid" checked style="cursor: pointer;" >
                                                                                                                                                                                                            <span>💨 Быстрые </span>
                                                                                                                                                                                                                </label>
                                                                                                                                                                                                                <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                                                                                    <input type="checkbox" id="mp-room-panel-allow-heavy-gun" checked style="cursor: pointer;" >
                                                                                                                                                                                                                        <span>💣 Тяжелые </span>
                                                                                                                                                                                                                            </label>
                                                                                                                                                                                                                            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                                                                                                <input type="checkbox" id="mp-room-panel-allow-sniper" checked style="cursor: pointer;" >
                                                                                                                                                                                                                                    <span>🎯 Снайперские </span>
                                                                                                                                                                                                                                        </label>
                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                        </div>

                                                                                                                                                                                                                                        <!--Автозапуск при готовности-->
                                                                                                                                                                                                                                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0, 255, 0, 0.2);" >
                                                                                                                                                                                                                                                <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #aaa; cursor: pointer;" >
                                                                                                                                                                                                                                                    <input type="checkbox" id="mp-room-panel-auto-start" style="cursor: pointer;" >
                                                                                                                                                                                                                                                        <span>🚀 Автозапуск при готовности всех игроков </span>
                                                                                                                                                                                                                                                            </label>
                                                                                                                                                                                                                                                            </div>

                                                                                                                                                                                                                                                            <!--Кнопка сохранения настроек-->
                                                                                                                                                                                                                                                                <button class="panel-btn" id="mp-room-panel-save-settings" style="width: 100%; padding: 10px; font-size: 12px; background: rgba(74, 222, 128, 0.2); border-color: #4ade80; color: #4ade80; margin-top: 10px;" >
                            💾 Сохранить настройки
    </button>
    </div>
    </div>

    <!--Приглашения -->
        <div style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
            <div style="font-weight: bold; color: #0f0; font-size: 14px; margin-bottom: 10px;" >📨 Приглашения </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;" >
                    <button class="panel-btn" id="mp-room-panel-invite-friends" style="flex: 1; padding: 10px; font-size: 12px;" >
                                👥 Пригласить друзей
    </button>
    <button class="panel-btn" id="mp-room-panel-invite-by-id" style="flex: 1; padding: 10px; font-size: 12px;" >
                                🔗 Пригласить по ID
    </button>
    </div>
    <div id="mp-room-panel-friends-list" style="display: none; max-height: 150px; overflow-y: auto; margin-top: 10px;" >
        <!--Список друзей будет добавлен динамически-->
            </div>
            <div id="mp-room-panel-invite-by-id-form" style="display: none; margin-top: 10px;" >
                <input type="text" id="mp-room-panel-invite-id-input" placeholder="Введите ID игрока" style="width: 100%; padding: 8px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(0, 255, 0, 0.3); border-radius: 4px; color: #0f0; font-size: 11px; margin-bottom: 6px;" >
                    <button class="panel-btn" id="mp-room-panel-send-invite" style="width: 100%; padding: 8px; font-size: 11px;" >
                        Отправить приглашение
                            </button>
                            </div>
                            </div>

                            <!--Управление комнатой(только для хоста)-->
                                <div id="mp-room-panel-controls" style="margin: 15px 0; padding: 15px; background: rgba(0, 20, 0, 0.4); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);" >
                                    <div style="font-weight: bold; color: #0f0; font-size: 14px; margin-bottom: 10px;" >⚙️ Управление комнатой </div>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" >
                                            <button class="panel-btn" id="mp-room-panel-change-mode" style="padding: 10px; font-size: 12px;" >
                                🔄 Изменить режим
    </button>
    <button class="panel-btn" id="mp-room-panel-change-map" style="padding: 10px; font-size: 12px;" >
                                🗺 Изменить карту
    </button>
    <button class="panel-btn" id="mp-room-panel-toggle-private" style="padding: 10px; font-size: 12px;" >
                                🔒 Сделать приватной
    </button>
    <button class="panel-btn" id="mp-room-panel-kick-player" style="padding: 10px; font-size: 12px;" >
                                👢 Кикнуть игрока
    </button>
    </div>
    </div>

    <!--Кнопки действий-->
        <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 10px;" >
            <button class="panel-btn primary battle-btn" id="mp-room-panel-start-game" style="width: 100%; padding: 14px; font-size: 18px; font-weight: bold;" >
                <span class="battle-btn-text" >⚔️ НАЧАТЬ ИГРУ </span>
                    <span class="battle-btn-shine" > </span>
                        </button>
                        <button class="panel-btn" id="mp-room-panel-leave" style="width: 100%; padding: 12px; font-size: 14px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444;" >
                            🚪 Покинуть комнату
    </button>
    </div>
    </div>

    <!--3. Выбор карты-->
        <div class="play-window play-window-wide" id="play-window-map" data-order="2" data-step="2">
            <div class="play-window-header">
                <div class="play-window-title">/[user_id]/single/mode/map</div>
                <div class="window-actions">
                    <button class="window-btn" data-nav="back" data-step="2">⟵</button>
                    <button class="window-btn" data-nav="forward" data-step="2">⟶</button>
                    <button class="window-btn" data-nav="close" data-step="2">✕</button>
                </div>
            </div>
            <div class="section-title">3. Выбор карты</div>
            <div class="map-grid">
                <div class="map-card recommended" id="play-btn-map-normal" data-map="normal">
                    <span class="map-card-icon">🗺</span>
                    <span class="map-card-name">${L.normalMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-sandbox" data-map="sandbox">
                    <span class="map-card-icon">🏖</span>
                    <span class="map-card-name">${L.sandboxMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-sand" data-map="sand">
                    <span class="map-card-icon">🏜</span>
                    <span class="map-card-name">${L.sandMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-madness" data-map="madness">
                    <span class="map-card-icon">🌉</span>
                    <span class="map-card-name">${L.madnessMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-expo" data-map="expo">
                    <span class="map-card-icon">🏆</span>
                    <span class="map-card-name">${L.expoMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-brest" data-map="brest">
                    <span class="map-card-icon">🏰</span>
                    <span class="map-card-name">${L.brestMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-arena" data-map="arena">
                    <span class="map-card-icon">⚔️</span>
                    <span class="map-card-name">${L.arenaMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-polygon" data-map="polygon">
                    <span class="map-card-icon">🎯</span>
                    <span class="map-card-name">${L.polygonMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-frontline" data-map="frontline">
                    <span class="map-card-icon">💥</span>
                    <span class="map-card-name">${L.frontlineMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-ruins" data-map="ruins">
                    <span class="map-card-icon">🏚</span>
                    <span class="map-card-name">${L.ruinsMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-canyon" data-map="canyon">
                    <span class="map-card-icon">⛰</span>
                    <span class="map-card-name">${L.canyonMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-industrial" data-map="industrial">
                    <span class="map-card-icon">🏭</span>
                    <span class="map-card-name">${L.industrialMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-urban_warfare" data-map="urban_warfare">
                    <span class="map-card-icon">🏙</span>
                    <span class="map-card-name">${L.urbanWarfareMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-underground" data-map="underground">
                    <span class="map-card-icon">🕳</span>
                    <span class="map-card-name">${L.undergroundMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-coastal" data-map="coastal">
                    <span class="map-card-icon">🌊</span>
                    <span class="map-card-name">${L.coastalMap}</span>
                </div>
                <div class="map-card" id="play-btn-map-tartaria" data-map="tartaria">
                    <span class="map-card-new">NEW</span>
                    <span class="map-card-icon">🏛</span>
                    <span class="map-card-name">${L.tartariaMap}</span>
                </div>
            </div>
            
            <!-- CUSTOM MAPS SECTION -->
            <div class="panel-section-title" style="margin-top: 25px; color: #fbbf24; border-bottom: 1px solid rgba(251, 191, 36, 0.3); padding-bottom: 8px; margin-bottom: 15px; font-weight: bold; font-family: 'Press Start 2P'; font-size: 12px;">ПОЛЬЗОВАТЕЛЬСКИЕ КАРТЫ</div>
            <div class="map-grid" id="custom-maps-list-play-window">
                <!-- Custom maps will be injected here -->
            </div>
            <!--Динамически добавляем сохраненные карты-->
            <div id="custom-maps-container" style="margin-top: 20px;"></div>
        </div>

        <!--4. Выбор танка-->
        <div class="play-window" id="play-window-tank" data-order="3" data-step="3">
            <div class="play-window-header">
                <div class="play-window-title">/[user_id]/single/mode/map/preset</div>
                <div class="window-actions">
                    <button class="window-btn" data-nav="back" data-step="3">⟵</button>
                    <button class="window-btn" data-nav="forward" data-step="3">⟶</button>
                    <button class="window-btn" data-nav="close" data-step="3">✕</button>
                </div>
            </div>
            <div class="section-title">3. Выбор танка</div>

            <!--Пресеты танков-->
            <div style="margin-bottom: 20px;">
                <div style="font-weight: bold; margin-bottom: 10px;">Пресет танка:</div>
                <div class="preset-buttons" style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="menu-btn play-btn" id="preset-balanced" data-preset="balanced">
                        <span class="btn-label">⚖️ Баланс</span>
                    </button>
                    <button class="menu-btn secondary" id="preset-speed" data-preset="speed">
                        <span class="btn-label">⚡ Скорость</span>
                    </button>
                    <button class="menu-btn secondary" id="preset-defense" data-preset="defense">
                        <span class="btn-label">🛡️ Защита</span>
                    </button>
                    <button class="menu-btn secondary" id="preset-damage" data-preset="damage">
                        <span class="btn-label">💥 Урон</span>
                    </button>
                </div>
            </div>

            <!--Детальный выбор-->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                <div>
                    <div style="font-weight: bold; margin-bottom: 10px;">Корпус:</div>
                    <div class="tank-options" id="chassis-options" style="display: flex; flex-direction: column; gap: 8px;">
                        <!--Заполнится динамически-->
                    </div>
                </div>
                <div>
                    <div style="font-weight: bold; margin-bottom: 10px;">Пушка:</div>
                    <div class="tank-options" id="cannon-options" style="display: flex; flex-direction: column; gap: 8px;">
                        <!--Заполнится динамически-->
                    </div>
                </div>
            </div>

            <!--Кнопки действий-->
            <div class="panel-buttons" style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="panel-btn" id="btn-tank-garage" style="flex: 1;">⚙️ ГАРАЖ</button>
                <button class="panel-btn primary" id="btn-start-game" style="flex: 2;">В БОЙ!</button>
            </div>
        </div>

        <!--Кнопка назад-->
        <div class="panel-buttons" style="margin-top: 20px;">
            <button class="panel-btn" id="play-menu-back">Назад</button>
        </div>
    </div>
`;

        document.body.appendChild(this.playMenuPanel);

        // Заполняем опции танков
        this.populateTankOptions();

        // Загружаем и отображаем сохраненные карты
        this.loadCustomMaps();

        // Обработчики выбора типа игры (шаг 1)
        document.getElementById("btn-type-single")?.addEventListener("click", () => this.selectGameType("single"));
        document.getElementById("btn-type-multiplayer")?.addEventListener("click", () => this.selectGameType("multiplayer"));

        // Обработчики выбора режима игры (шаг 2)
        document.getElementById("btn-gamemode-ffa")?.addEventListener("click", () => this.selectGameMode("ffa"));
        document.getElementById("btn-gamemode-tdm")?.addEventListener("click", () => this.selectGameMode("tdm"));
        document.getElementById("btn-gamemode-coop")?.addEventListener("click", () => this.selectGameMode("coop"));
        document.getElementById("btn-gamemode-br")?.addEventListener("click", () => this.selectGameMode("battle_royale"));
        document.getElementById("btn-gamemode-ctf")?.addEventListener("click", () => this.selectGameMode("ctf"));
        document.getElementById("btn-gamemode-control-point")?.addEventListener("click", () => this.selectGameMode("control_point"));
        document.getElementById("btn-gamemode-escort")?.addEventListener("click", () => this.selectGameMode("escort"));
        document.getElementById("btn-gamemode-survival")?.addEventListener("click", () => this.selectGameMode("survival"));
        document.getElementById("btn-gamemode-raid")?.addEventListener("click", () => this.selectGameMode("raid"));

        // Обработчики выбора карты
        const mapButtons = ["normal", "sandbox", "sand", "madness", "expo", "brest", "arena", "polygon", "frontline", "ruins", "canyon", "industrial", "urban_warfare", "underground", "coastal", "tartaria"];

        mapButtons.forEach(map => {
            const button = document.getElementById(`play-btn-map-${map}`);

            button?.addEventListener("click", () => {
                // ИСПРАВЛЕНИЕ: Не очищаем данные пользовательской карты автоматически
                // localStorage.removeItem("selectedCustomMapData");
                // localStorage.removeItem("selectedCustomMapIndex");
                this.selectMap(map as MapType);
            });
        });

        // Обработчики навигации окон-терминалов
        document.querySelectorAll(".window-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const action = target.dataset.nav;
                const step = parseFloat(target.dataset.step || "0");
                // Специальная обработка для мультиплеер окна
                if (step === 0.5 && action === "back") {
                    this.showPlayWindow("play-window-mode", 0, 0);
                } else if (step === 1 && action === "back") {
                    // Панель выбора режима для создания комнаты - возврат к мультиплеер меню
                    // Скрываем все панели, включая панель выбора режима
                    this.hideAllPlayWindows();
                    // Убеждаемся, что панель выбора режима скрыта
                    const modePanel = document.getElementById("mp-create-room-mode");
                    if (modePanel) {
                        modePanel.style.display = "none";
                        modePanel.classList.remove("visible");
                    }
                    // Показываем только основное мультиплеер меню
                    this.showPlayWindow("play-window-multiplayer", 0.5, 0.5);
                } else if (step === 2 && action === "back") {
                    // Панель выбора карты для создания комнаты - возврат к выбору режима
                    // Сбрасываем выбранную карту и кнопку "В БОЙ!"
                    (this as any).selectedCreateRoomMap = undefined;
                    const startBtn = document.getElementById("mp-create-room-start-btn");
                    if (startBtn) {
                        startBtn.style.opacity = "0.5";
                        startBtn.style.cursor = "not-allowed";
                        startBtn.style.pointerEvents = "none";
                        (startBtn as HTMLButtonElement).disabled = true;
                    }
                    this.showPlayWindow("mp-create-room-mode", 1, 1);
                } else if (action === "back") {
                    this.navigatePlayStep(Math.floor(step) - 1);
                } else if (action === "forward") {
                    this.navigatePlayStep(Math.floor(step) + 1);
                } else if (action === "close") {
                    // Закрытие панелей создания комнаты - возвращаемся к меню мультиплеера
                    if (step === 1 || step === 2) {
                        this.hideAllPlayWindows();
                        this.showPlayWindow("play-window-multiplayer", 0, 0);
                    } else {
                        this.hidePlayMenu();
                    }
                }
            });
        });

        // Обработчики пресетов танков
        document.getElementById("preset-balanced")?.addEventListener("click", () => this.selectPreset("balanced"));
        document.getElementById("preset-speed")?.addEventListener("click", () => this.selectPreset("speed"));
        document.getElementById("preset-defense")?.addEventListener("click", () => this.selectPreset("defense"));
        document.getElementById("preset-damage")?.addEventListener("click", () => this.selectPreset("damage"));

        // Обработчик кнопки "Гараж" в окне выбора танка
        document.getElementById("btn-tank-garage")?.addEventListener("click", () => {
            this.returnToPlayMenuAfterGarage = true;
            this.hidePlayMenu();
            this.showGarage();
        });

        // Обработчик запуска игры
        document.getElementById("btn-start-game")?.addEventListener("click", () => this.startSelectedGame());

        // Мультиплеер меню обработчики будут установлены в initMultiplayerMenu

        this.setupCloseButton("play-menu-back", () => this.hidePlayMenu());
        this.setupPanelCloseOnBackground(this.playMenuPanel, () => this.hidePlayMenu());
    }

    private populateTankOptions(): void {
        // Используем статически импортированные типы танков
        const chassisContainer = document.getElementById("chassis-options");
        const cannonContainer = document.getElementById("cannon-options");

        if (chassisContainer) {
            chassisContainer.innerHTML = ""; // Очищаем перед заполнением
            CHASSIS_TYPES.filter(chassis => this.ownedChassisIds.has(chassis.id)).forEach(chassis => {
                const btn = document.createElement("button");
                btn.className = `menu-btn ${this.selectedChassis === chassis.id ? "play-btn" : ""} `;
                btn.innerHTML = `
    <span class="btn-label" > ${chassis.name} </span>
        <span style="font-size:10px; opacity:0.8;" >
            ${Math.round(chassis.maxHealth)} HP • ${Math.round(chassis.moveSpeed)} SPD
                </span>`;
                btn.dataset.chassis = chassis.id;
                btn.addEventListener("click", () => this.selectChassis(chassis.id));
                chassisContainer.appendChild(btn);
            });
        }

        if (cannonContainer) {
            cannonContainer.innerHTML = ""; // Очищаем перед заполнением
            CANNON_TYPES.filter(cannon => this.ownedCannonIds.has(cannon.id)).forEach(cannon => {
                const btn = document.createElement("button");
                btn.className = `menu-btn ${this.selectedCannon === cannon.id ? "play-btn" : ""}`;
                btn.innerHTML = `
                    <span class="btn-label">${cannon.name}</span>
                    <span style="font-size:10px; opacity:0.8;">
                        ${Math.round(cannon.damage)} DMG • ${(cannon.cooldown / 1000).toFixed(1)}s CD
                    </span>`;
                btn.dataset.cannon = cannon.id;
                btn.addEventListener("click", () => this.selectCannon(cannon.id));
                cannonContainer.appendChild(btn);
            });
        }
    }

    /**
     * Нормализовать MapData к единому формату (совместимо с MapEditor)
     * Использует ту же структуру, что и MapEditor.MapData
     */
    private normalizeMapData(data: any): any | null {
        if (!data || typeof data !== "object" || !data.name) {
            return null;
        }

        const CURRENT_VERSION = 1;

        const normalized: any = {
            version: CURRENT_VERSION,
            name: String(data.name),
            mapType: data.mapType || "normal", // ОБЯЗАТЕЛЬНО: всегда должен быть mapType
            terrainEdits: Array.isArray(data.terrainEdits) ? data.terrainEdits : [],
            placedObjects: Array.isArray(data.placedObjects) ? data.placedObjects : [],
            triggers: Array.isArray(data.triggers) ? data.triggers : [],
            metadata: {
                createdAt: data.metadata?.createdAt || Date.now(),
                modifiedAt: data.metadata?.modifiedAt || Date.now(),
                author: data.metadata?.author,
                description: data.metadata?.description,
                isPreset: data.metadata?.isPreset !== undefined ? data.metadata.isPreset : data.name.startsWith("[Предустановленная]"),
                mapSize: data.metadata?.mapSize
            }
        };

        if (data.seed !== undefined) {
            normalized.seed = data.seed;
        }

        return normalized;
    }

    /**
     * Загрузить и отобразить сохраненные карты из редактора
     */
    private loadCustomMaps(): void {
        this.updateCustomMapsUI();
        const container = document.getElementById("custom-maps-container");
        if (!container) return;

        // Очищаем контейнер перед загрузкой
        container.innerHTML = "";

        try {
            const saved = localStorage.getItem("savedMaps");
            if (!saved) {
                return;
            }

            const rawMaps: any[] = JSON.parse(saved);
            if (!Array.isArray(rawMaps) || rawMaps.length === 0) {
                return;
            }

            // Нормализуем все карты к единому формату
            const savedMaps = rawMaps.map(map => this.normalizeMapData(map)).filter((map): map is any => map !== null);

            if (savedMaps.length === 0) {
                return;
            }

            // Создаем заголовок для секции сохраненных карт
            const header = document.createElement("div");
            header.style.cssText = "margin-top: 30px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid rgba(0, 255, 80, 0.3);";
            header.innerHTML = `<div class="section-title" style="font-size: 16px; color: #0f0;">📂 Ваши карты (${savedMaps.length})</div>`;
            container.appendChild(header);

            // Добавляем сохраненные карты в сетку
            savedMaps.forEach((map, index) => {
                // Находим индекс в исходном массиве для правильной индексации
                const originalIndex = rawMaps.findIndex(m => m && m.name === map.name);
                const mapIndex = originalIndex >= 0 ? originalIndex : index;

                const mapCard = document.createElement("div");
                mapCard.className = "map-card";
                mapCard.style.cssText = "position: relative; cursor: pointer;";
                mapCard.setAttribute("data-custom-map-index", mapIndex.toString());

                // Убеждаемся, что mapType всегда присутствует
                const baseMapType = map.mapType || "normal";
                const objectCount = map.placedObjects?.length || 0;
                const triggerCount = map.triggers?.length || 0;
                const editCount = map.terrainEdits?.length || 0;
                const isPreset = map.metadata?.isPreset || map.name.startsWith("[Предустановленная]");

                mapCard.innerHTML = `
                    ${isPreset ? '<span style="position: absolute; top: 5px; right: 5px; font-size: 8px; color: #0ff;">🔒</span>' : ''}
                    <span class="map-card-icon">🗺</span>
                    <span class="map-card-name" style="font-size: 9px; line-height: 1.2;">${map.name.replace("[Предустановленная] ", "")}</span>
                    <span class="map-card-desc" style="font-size: 7px; margin-top: 5px; color: rgba(0, 255, 80, 0.6);">
                        ${isPreset ? 'Предустановленная' : `Объектов: ${objectCount} | Редакций: ${editCount}`}
                    </span>
                `;

                mapCard.addEventListener("click", () => {
                    // Сохраняем нормализованные данные карты в localStorage
                    localStorage.setItem("selectedCustomMapData", JSON.stringify(map));
                    localStorage.setItem("selectedCustomMapIndex", mapIndex.toString());

                    // Выбираем базовый тип карты (обязательно должен быть указан)
                    this.selectMap(baseMapType as MapType);
                });

                // Добавляем стиль при наведении
                mapCard.addEventListener("mouseenter", () => {
                    mapCard.style.background = "rgba(0, 50, 0, 0.6)";
                    mapCard.style.borderColor = "#0f0";
                    mapCard.style.boxShadow = "0 0 15px rgba(0, 255, 80, 0.4)";
                    mapCard.style.transform = "translateY(-2px)";
                });

                mapCard.addEventListener("mouseleave", () => {
                    mapCard.style.background = "";
                    mapCard.style.borderColor = "";
                    mapCard.style.boxShadow = "";
                    mapCard.style.transform = "";
                });

                container.appendChild(mapCard);
            });

            debugLog(`[Menu] Loaded ${savedMaps.length} custom maps (normalized to version 1)`);
        } catch (error) {
            console.error("[Menu] Failed to load custom maps:", error);
            container.innerHTML = "";
        }
    }

    private selectedGameType: string = "single";

    private selectGameType(type: string): void {
        this.selectedGameType = type;
        debugLog("[Menu] Selected game type:", type);

        // Обновляем визуал выбранной кнопки
        document.querySelectorAll("[data-type]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.type === type) {
                button.className = "menu-btn play-btn game-type-btn";
            } else {
                button.className = "menu-btn play-btn game-type-btn";
                if (button.dataset.type === "multiplayer") {
                    button.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
                }
            }
        });

        // Update terminal titles
        this.updateTerminalTitles();

        // Для мультиплеера показываем специальное меню
        if (type === "multiplayer") {
            // Скрываем все панели, включая панель выбора режима для создания комнаты
            this.hideAllPlayWindows();
            // Убеждаемся, что панель выбора режима скрыта
            const modePanel = document.getElementById("mp-create-room-mode");
            if (modePanel) {
                modePanel.style.display = "none";
                modePanel.classList.remove("visible");
            }
            // Показываем только основное мультиплеер меню
            this.showPlayWindow("play-window-multiplayer", 0.5, 0.5);
            this.initMultiplayerMenu();
        } else {
            // Показываем следующий шаг - выбор режима игры
            this.showPlayWindow("play-window-gamemode", 1, 1);
        }
    }

    private selectGameMode(mode: string): void {
        this.selectedGameMode = mode;
        debugLog("[Menu] Selected game mode:", mode);

        // Обновляем визуал выбранной кнопки
        document.querySelectorAll("[data-gamemode]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.gamemode === mode) {
                button.className = "menu-btn play-btn gamemode-btn";
            } else {
                button.className = "menu-btn secondary gamemode-btn";
            }
        });

        // Update terminal titles
        this.updateTerminalTitles();

        // Показываем следующий шаг - выбор карты
        this.showPlayWindow("play-window-map", 2, 2);
    }

    private queueTimer: number = 0;
    private queueTimerInterval: NodeJS.Timeout | null = null;

    private initMultiplayerMenu(): void {
        // Выбранный режим мультиплеера (по умолчанию FFA)
        let selectedMpMode = "ffa";

        // Обработчики выбора режима мультиплеера
        document.querySelectorAll(".mp-mode-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const mode = target.dataset.mpMode;
                const desc = target.dataset.mpDesc;
                if (mode) {
                    selectedMpMode = mode;
                    // Обновляем визуал
                    document.querySelectorAll(".mp-mode-btn").forEach(b => {
                        b.classList.remove("active");
                    });
                    target.classList.add("active");

                    // Показываем описание режима
                    const descEl = document.getElementById("mp-mode-description");
                    const descTextEl = document.getElementById("mp-mode-desc-text");
                    if (descEl && descTextEl && desc) {
                        descTextEl.textContent = desc;
                        descEl.style.display = "block";
                        descEl.style.animation = "fadeIn 0.3s ease";
                    }
                }
            });
        });

        // Устанавливаем FFA как активный по умолчанию
        const ffaBtn = document.getElementById("mp-btn-ffa");
        if (ffaBtn) {
            ffaBtn.classList.add("active");
            const desc = ffaBtn.dataset.mpDesc;
            const descEl = document.getElementById("mp-mode-description");
            const descTextEl = document.getElementById("mp-mode-desc-text");
            if (descEl && descTextEl && desc) {
                descTextEl.textContent = desc;
                descEl.style.display = "block";
            }
        }

        // Запрашиваем список комнат при открытии меню
        const game = (window as any).gameInstance as any;
        let multiplayerManager = game?.multiplayerManager;

        // Если MultiplayerManager не найден, пытаемся создать его
        if (!multiplayerManager && game) {
            // MultiplayerManager не найден, создаём автоматически
            try {
                // Импортируем и создаем MultiplayerManager
                import("./multiplayer").then(({ MultiplayerManager }) => {
                    multiplayerManager = new MultiplayerManager(undefined, true);
                    game.multiplayerManager = multiplayerManager;

                    // Настраиваем колбэки если gameMultiplayerCallbacks существует
                    if (game.gameMultiplayerCallbacks) {
                        try {
                            const gameInstance = (window as any).gameInstance;
                            game.gameMultiplayerCallbacks.updateDependencies({
                                multiplayerManager: multiplayerManager,
                                mainMenu: this,
                                // Добавляем callbacks для запуска игры через gameInstance
                                startGame: async () => {
                                    if (gameInstance && typeof gameInstance.startGame === 'function') {
                                        try {
                                            // Проверяем инициализацию
                                            if (!gameInstance.gameInitialized) {
                                                debugLog("[Menu] Game not initialized, initializing...");
                                                await gameInstance.init();
                                                gameInstance.gameInitialized = true;
                                            }
                                            // Убеждаемся, что canvas виден
                                            if (gameInstance.canvas) {
                                                gameInstance.canvas.style.display = "block";
                                                gameInstance.canvas.style.visibility = "visible";
                                                gameInstance.canvas.style.opacity = "1";
                                            }
                                            // Запускаем игру
                                            gameInstance.startGame();
                                        } catch (error) {
                                            console.error("[Menu] Error starting game:", error);
                                        }
                                    }
                                },
                                isGameInitialized: () => {
                                    return gameInstance ? gameInstance.gameInitialized : false;
                                },
                                isGameStarted: () => {
                                    return gameInstance ? gameInstance.gameStarted : false;
                                }
                            });
                            game.gameMultiplayerCallbacks.setup();
                            debugLog(`[Menu] ✅ MultiplayerManager создан и настроен`);
                        } catch (callbackError) {
                            debugWarn(`[Menu] ⚠️ Не удалось настроить callbacks:`, callbackError);
                        }
                    }

                    // Настраиваем список комнат после создания
                    this.setupRoomListUpdates(multiplayerManager);
                }).catch(error => {
                    console.error(`[Menu] ❌ Ошибка создания MultiplayerManager:`, error);
                });
            } catch (error) {
                console.error(`[Menu] ❌ Ошибка импорта MultiplayerManager:`, error);
            }
        }

        // Если MultiplayerManager доступен, настраиваем обновление списка комнат
        if (multiplayerManager) {
            this.setupRoomListUpdates(multiplayerManager);
        } else if (!game) {
            // Игра еще не инициализирована - это нормально, просто не показываем предупреждение
            debugLog(`[Menu] Игра еще не инициализирована, список комнат будет настроен позже`);
        } else {
            // MultiplayerManager будет создан при открытии мультиплеера
        }

        // Quick Play
        document.getElementById("mp-btn-quick-play")?.addEventListener("click", () => {
            const activeBtn = document.querySelector(".mp-mode-btn.active") as HTMLElement;
            const mode = activeBtn?.dataset.mpMode || selectedMpMode;
            this.startMultiplayerQuickPlay(mode);
        });

        // Create Room - скрываем меню мультиплеера и показываем ТОЛЬКО панель выбора режима
        const createRoomBtn = document.getElementById("mp-btn-create-room");
        if (createRoomBtn) {
            createRoomBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                debugLog("[Menu] Create room button clicked - opening mode selection panel");

                // Скрываем ВСЕ панели включая меню мультиплеера
                this.hideAllPlayWindows();

                // Показываем ТОЛЬКО панель выбора режима
                this.showPlayWindow("mp-create-room-mode", 0, 0);
            });
        } else {
            debugError("[Menu] Create room button (mp-btn-create-room) not found!");
        }

        // Обработчик кнопки закрытия блока выбора режима
        const modeCloseBtn = document.getElementById("mp-create-room-mode-close");
        if (modeCloseBtn) {
            modeCloseBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const modeSection = document.getElementById("mp-create-room-mode-section");
                if (modeSection) {
                    modeSection.style.display = "none";
                    debugLog("[Menu] Mode selection section hidden");
                }
            });
        }

        // Обработчики выбора режима для создания комнаты теперь через onclick в HTML (window.selectMpCreateRoomMode)
        debugLog("[Menu] Mode selection handlers now use inline onclick");

        // Обработчики выбора карты и кнопки создания комнаты теперь через onclick в HTML
        // (window.selectMpCreateRoomMap и window.startMpCreateRoom)
        debugLog("[Menu] Map selection and room creation handlers now use inline onclick");

        // Join Room - показываем модальное окно
        document.getElementById("mp-btn-join-room")?.addEventListener("click", () => {
            const modal = document.getElementById("mp-join-room-modal");
            const input = document.getElementById("mp-room-id-input") as HTMLInputElement;
            const errorEl = document.getElementById("mp-room-id-error");
            if (modal && input) {
                modal.style.display = "flex";
                input.value = "";
                input.focus();
                if (errorEl) errorEl.style.display = "none";

                // Обработчик Enter в поле ввода
                const handleEnter = (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                        document.getElementById("mp-modal-join-btn")?.click();
                    }
                };
                input.addEventListener("keydown", handleEnter);

                // Обработчик кнопки "Присоединиться" в модальном окне
                const joinBtn = document.getElementById("mp-modal-join-btn");
                if (joinBtn) {
                    joinBtn.onclick = () => {
                        const roomId = input.value.trim();
                        if (roomId.length === 0) {
                            if (errorEl) {
                                errorEl.textContent = "Введите ID комнаты";
                                errorEl.style.display = "block";
                            }
                            return;
                        }
                        modal.style.display = "none";
                        input.removeEventListener("keydown", handleEnter);
                        this.joinMultiplayerRoom(roomId);
                    };
                }

                // Обработчик кнопки "Отмена" в модальном окне
                document.getElementById("mp-modal-cancel-btn")?.addEventListener("click", () => {
                    modal.style.display = "none";
                    input.removeEventListener("keydown", handleEnter);
                });
            }
        });

        // Cancel Queue
        document.getElementById("mp-btn-cancel-queue")?.addEventListener("click", () => {
            this.cancelMultiplayerQueue();
        });

        // Test connection button
        document.getElementById("mp-btn-test-connection")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager) {
                const serverUrl = multiplayerManager.getServerUrl();
                const hintEl = document.getElementById("mp-server-hint");

                if (hintEl) {
                    hintEl.textContent = "⏳ Проверка подключения...";
                    hintEl.style.color = "#fbbf24";
                }

                // Проверяем подключение
                if (multiplayerManager.isConnected()) {
                    const ping = Math.round(multiplayerManager.getRTT());
                    if (hintEl) {
                        hintEl.textContent = `✅ Подключено! Пинг: ${ping}ms`;
                        hintEl.style.color = "#4ade80";
                    }
                } else {
                    // Пытаемся подключиться
                    try {
                        multiplayerManager.connect(serverUrl);
                        setTimeout(() => {
                            if (multiplayerManager.isConnected()) {
                                if (hintEl) {
                                    hintEl.textContent = "✅ Подключение успешно!";
                                    hintEl.style.color = "#4ade80";
                                }
                            } else {
                                if (hintEl) {
                                    hintEl.textContent = "❌ Не удалось подключиться. Проверьте адрес сервера и убедитесь, что сервер запущен.";
                                    hintEl.style.color = "#ef4444";
                                }
                            }
                        }, 2000);
                    } catch (error) {
                        if (hintEl) {
                            hintEl.textContent = `❌ Ошибка подключения: ${error}`;
                            hintEl.style.color = "#ef4444";
                        }
                    }
                }
            }
        });

        // Reconnect button
        document.getElementById("mp-btn-reconnect")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager) {
                const serverUrl = multiplayerManager.getServerUrl();
                multiplayerManager.connect(serverUrl);
            }
        });

        // Check WebSocket button
        document.getElementById("mp-btn-check-ws")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            const statusEl = document.getElementById("mp-connection-status");
            const btn = document.getElementById("mp-btn-check-ws") as HTMLButtonElement;

            // Сохраняем оригинальный текст кнопки
            const originalBtnText = btn?.textContent || "🔌 WebSocket";

            if (btn) {
                btn.textContent = "⏳...";
                btn.disabled = true;
            }

            setTimeout(() => {
                const isConnected = multiplayerManager && multiplayerManager.isConnected();
                if (statusEl) {
                    const currentText = statusEl.textContent || "";
                    const wsStatus = isConnected ? "✅ WS OK" : "❌ WS Fail";
                    // Показываем результат проверки
                    const originalText = currentText;
                    statusEl.textContent = wsStatus;
                    setTimeout(() => {
                        if (statusEl) statusEl.textContent = originalText;
                        this.updateMultiplayerStatus();
                    }, 2000);
                }
                if (btn) {
                    btn.textContent = originalBtnText; // Восстанавливаем полный текст
                    btn.disabled = false;
                }
            }, 500);
        });

        // Check Firebase button
        document.getElementById("mp-btn-check-firebase")?.addEventListener("click", async () => {
            const btn = document.getElementById("mp-btn-check-firebase") as HTMLButtonElement;
            const statusEl = document.getElementById("mp-connection-status");

            // Сохраняем оригинальный текст кнопки
            const originalBtnText = btn?.textContent || "🔥 Firebase";

            if (btn) {
                btn.textContent = "⏳...";
                btn.disabled = true;
            }

            try {
                // Попытка проверить Firebase
                const { firebaseService } = await import("./firebaseService");
                const isConnected = firebaseService && firebaseService.isInitialized();

                if (statusEl) {
                    const currentText = statusEl.textContent || "";
                    const fbStatus = isConnected ? "✅ FB OK" : "❌ FB Fail";
                    const originalText = currentText;
                    statusEl.textContent = fbStatus;
                    setTimeout(() => {
                        if (statusEl) statusEl.textContent = originalText;
                        this.updateMultiplayerStatus();
                    }, 2000);
                }
            } catch (err) {
                if (statusEl) {
                    const originalText = statusEl.textContent || "";
                    statusEl.textContent = "❌ FB Error";
                    setTimeout(() => {
                        if (statusEl) statusEl.textContent = originalText;
                        this.updateMultiplayerStatus();
                    }, 2000);
                }
            }

            if (btn) {
                btn.textContent = originalBtnText; // Восстанавливаем полный текст
                btn.disabled = false;
            }
        });

        // Start Game (only for room creator)
        document.getElementById("mp-btn-start-game")?.addEventListener("click", async () => {
            await this.startMultiplayerGame();
        });

        // Leave Room
        document.getElementById("mp-btn-leave-room")?.addEventListener("click", () => {
            this.leaveMultiplayerRoom();
        });

        // Chat handlers
        this.setupMultiplayerChat(multiplayerManager);

        // Copy Room ID
        document.getElementById("mp-btn-copy-room-id")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager) {
                const roomId = multiplayerManager.getRoomId();
                if (roomId) {
                    navigator.clipboard.writeText(roomId).then(() => {
                        const btn = document.getElementById("mp-btn-copy-room-id");
                        if (btn) {
                            const originalText = btn.textContent;
                            btn.textContent = "✓";
                            btn.style.color = "#4ade80";
                            setTimeout(() => {
                                btn.textContent = originalText;
                                btn.style.color = "#a78bfa";
                            }, 2000);
                        }
                    }).catch(err => {
                        debugError("[Menu] Failed to copy room ID:", err);
                    });
                }
            }
        });

        // Настраиваем callback для обновления кнопки при присоединении/выходе игроков
        if (multiplayerManager) {
            multiplayerManager.onPlayerJoined(() => {
                debugLog("[Menu] 🎮 Игрок присоединился, обновляем статус кнопки");
                setTimeout(() => {
                    this._updateMultiplayerStatus();
                    // Обновляем счетчик игроков в панели комнаты
                    this.refreshRoomPanelPlayers();
                }, 200);
            });

            multiplayerManager.onPlayerLeft(() => {
                debugLog("[Menu] 🚪 Игрок покинул комнату, обновляем статус кнопки");
                setTimeout(() => {
                    this._updateMultiplayerStatus();
                    // Обновляем счетчик игроков в панели комнаты
                    this.refreshRoomPanelPlayers();
                }, 200);
            });
        }


        // Обновляем статус подключения
        this._updateMultiplayerStatus();

        // Настройка фильтров комнат
        this.setupRoomFilters();

        // Обновляем статус каждые 1 секунду (чаще для лучшей отзывчивости)
        const statusUpdateInterval = setInterval(() => {
            const mpWindow = document.getElementById("play-window-multiplayer");
            if (mpWindow && mpWindow.style.display !== "none") {
                this._updateMultiplayerStatus();
            } else {
                clearInterval(statusUpdateInterval);
            }
        }, 1000);
    }

    private startQueueTimer(): void {
        if (this.queueTimerInterval) clearInterval(this.queueTimerInterval);
        this.queueTimer = 0;
        this.queueTimerInterval = setInterval(() => {
            this.queueTimer++;
            const minutes = Math.floor(this.queueTimer / 60);
            const seconds = this.queueTimer % 60;
            const timerEl = document.getElementById("mp-queue-timer");
            if (timerEl) {
                timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            }
        }, 1000);
    }

    // Публичный метод для обновления статуса (вызывается из game.ts)
    updateMultiplayerStatus(): void {
        this._updateMultiplayerStatus();
    }

    private _updateMultiplayerStatus(): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        const statusEl = document.getElementById("mp-connection-status");
        const indicatorEl = document.getElementById("mp-connection-indicator");
        const pingEl = document.getElementById("mp-ping");
        const reconnectBtn = document.getElementById("mp-btn-reconnect");
        const queueInfoEl = document.getElementById("mp-queue-info");
        const roomInfoEl = document.getElementById("mp-room-info");
        const serverInfoEl = document.getElementById("mp-server-info");

        if (!statusEl || !indicatorEl) return;

        // ИСПРАВЛЕНИЕ: Проверка статуса WebSocket и Firebase отдельно
        const isWebSocketConnected = multiplayerManager && multiplayerManager.isConnected();

        // Проверка статуса Firebase
        let isFirebaseConnected = false;
        try {
            const firebaseService = (window as any).firebaseService;
            if (firebaseService) {
                // Проверяем что Firebase инициализирован
                isFirebaseConnected = firebaseService.isInitialized?.() || false;
            }
        } catch (error) {
            debugWarn("[Menu] Error checking Firebase status:", error);
        }

        if (isWebSocketConnected) {
            // ИСПРАВЛЕНИЕ: Показываем статус WebSocket и Firebase отдельно
            let statusText = "WebSocket [Online]";
            if (isFirebaseConnected) {
                statusText += " / Firebase [Online]";
            } else {
                statusText += " / Firebase [Offline]";
            }

            statusEl.textContent = statusText;
            statusEl.style.color = isFirebaseConnected ? "#4ade80" : "#fa0"; // Оранжевый если Firebase офлайн
            indicatorEl.style.background = isFirebaseConnected ? "#4ade80" : "#fa0";
            indicatorEl.style.boxShadow = isFirebaseConnected ? "0 0 8px rgba(74, 222, 128, 0.6)" : "0 0 8px rgba(255, 170, 0, 0.6)";

            // Показываем пинг с цветовой индикацией
            if (pingEl) {
                pingEl.style.display = "inline-block";
                const ping = Math.round(multiplayerManager.getRTT());
                pingEl.textContent = `${ping}ms`;

                // Цвет пинга в зависимости от значения
                if (ping < 50) {
                    pingEl.style.color = "#4ade80"; // Зеленый - отлично
                } else if (ping < 100) {
                    pingEl.style.color = "#fbbf24"; // Желтый - хорошо
                } else if (ping < 200) {
                    pingEl.style.color = "#fb923c"; // Оранжевый - приемлемо
                } else {
                    pingEl.style.color = "#ef4444"; // Красный - плохо
                }
            }

            if (reconnectBtn) reconnectBtn.style.display = "none";

            // Обновляем адрес сервера
            if (serverInfoEl) {
                const serverUrl = multiplayerManager.getServerUrl();
                const cleanUrl = serverUrl.replace("ws://", "").replace("wss://", "");
                serverInfoEl.textContent = cleanUrl;

                // Обновляем подсказку с инструкциями
                const hintEl = document.getElementById("mp-server-hint");
                if (hintEl) {
                    if (cleanUrl.includes("localhost") || cleanUrl.includes("127.0.0.1")) {
                        hintEl.textContent = "⚠️ Для подключения с другого ПК используйте IP-адрес сервера (например: ws://192.168.1.100:8080)";
                        hintEl.style.color = "#fa0";
                    } else {
                        hintEl.textContent = `✅ Адрес сервера: ${cleanUrl} (можно использовать с других ПК в той же сети)`;
                        hintEl.style.color = "#4ade80";
                    }
                }
            }

            // Показываем информацию о комнате если есть
            const roomId = multiplayerManager.getRoomId();
            if (roomId && roomInfoEl) {
                roomInfoEl.style.display = "block";
                roomInfoEl.style.animation = "fadeIn 0.3s ease";
                document.getElementById("mp-room-id")!.textContent = roomId.substring(0, 12);
                const mode = multiplayerManager.getGameMode() || "unknown";
                document.getElementById("mp-room-mode")!.textContent = mode.toUpperCase();
                if (queueInfoEl) queueInfoEl.style.display = "none";

                // Обновляем количество игроков (если доступно)
                // КРИТИЧНО: Используем getRoomPlayersCount() для точного количества игроков
                let playersCount = 1;
                try {
                    if (typeof multiplayerManager.getRoomPlayersCount === 'function') {
                        playersCount = multiplayerManager.getRoomPlayersCount();
                    } else {
                        // Fallback на старый способ
                        const networkPlayers = multiplayerManager.getNetworkPlayers();
                        playersCount = networkPlayers ? networkPlayers.size + 1 : 1;
                    }
                } catch (e) {
                    console.error("[Menu] Ошибка получения количества игроков:", e);
                    const networkPlayers = multiplayerManager.getNetworkPlayers();
                    playersCount = networkPlayers ? networkPlayers.size + 1 : 1;
                }
                const networkPlayers = multiplayerManager.getNetworkPlayers();
                debugLog(`[Menu] 📊 Игроков в комнате: playersCount=${playersCount}, networkPlayers.size=${networkPlayers?.size || 0}, _roomPlayersCount=${(multiplayerManager as any)._roomPlayersCount || 'N/A'}`);

                const playersCountEl = document.getElementById("mp-room-players-count");
                if (playersCountEl) {
                    playersCountEl.textContent = `${playersCount}/32`;
                }

                // Обновляем статус комнаты
                const roomStatusTextEl = document.getElementById("mp-room-status-text");
                // КРИТИЧНО: Используем ОДНУ проверку для статуса и кнопки!
                let isActive = false;
                try {
                    if (typeof multiplayerManager.isRoomActive === 'function') {
                        isActive = multiplayerManager.isRoomActive();
                    } else if (multiplayerManager._roomIsActive !== undefined) {
                        isActive = multiplayerManager._roomIsActive === true;
                    }
                } catch (e) {
                    debugWarn("[Menu] Ошибка проверки isRoomActive:", e);
                }

                debugLog(`[Menu] 🎮 Статус комнаты: isActive=${isActive}, roomId=${roomId}, playersCount=${playersCount}`);

                if (roomStatusTextEl) {
                    if (isActive) {
                        roomStatusTextEl.textContent = "⚔️ Игра идет - присоединяйтесь!";
                        roomStatusTextEl.style.color = "#ef4444";
                    } else {
                        roomStatusTextEl.textContent = `Ожидание игроков... (${playersCount} в комнате)`;
                        roomStatusTextEl.style.color = "#4ade80";
                    }
                }

                // Обновляем список игроков в комнате
                this.updateRoomPlayersList(roomId, networkPlayers);

                // Показываем кнопку "В БОЙ!" для всех игроков в комнате
                // 1. Создатель комнаты - может начать игру
                // 2. Остальные игроки - могут присоединиться к идущей игре
                const startGameBtn = document.getElementById("mp-btn-start-game");
                if (startGameBtn) {
                    try {
                        // Проверяем, является ли пользователь создателем комнаты
                        let isCreator = false;
                        try {
                            // Пробуем разные способы проверки
                            if (typeof multiplayerManager.isRoomCreator === 'function') {
                                isCreator = multiplayerManager.isRoomCreator();
                            } else if (multiplayerManager._isRoomCreator !== undefined) {
                                isCreator = multiplayerManager._isRoomCreator;
                            } else {
                                // Если создатель комнаты не определен, проверяем через roomId
                                // Если мы создали комнату, то мы создатель
                                debugWarn("[Menu] isRoomCreator не определен, проверяем через roomId");
                                isCreator = false; // Безопаснее предположить, что мы не создатель
                            }
                        } catch (e) {
                            debugWarn("[Menu] Ошибка проверки isRoomCreator:", e);
                            isCreator = false;
                        }

                        // КРИТИЧНО: Используем ТОТ ЖЕ isActive, что и для статуса!
                        // Дополнительно проверяем текст статуса на случай, если isActive не обновлен
                        let finalIsActive = isActive;
                        if (roomStatusTextEl && roomStatusTextEl.textContent && roomStatusTextEl.textContent.includes("Игра идет")) {
                            debugLog(`[Menu] ⚠️ Статус показывает "Игра идет", но isActive=${isActive}. Принудительно устанавливаем finalIsActive=true`);
                            finalIsActive = true;
                        }

                        debugLog(`[Menu] 🔍 Кнопка: isCreator=${isCreator}, isActive=${isActive}, finalIsActive=${finalIsActive}, playersCount=${playersCount}`);

                        const debugInfo = `[Menu] Кнопка "В БОЙ!": isCreator=${isCreator}, isActive=${isActive}, finalIsActive=${finalIsActive}, playersCount=${playersCount}, roomId=${roomId}`;
                        console.log(debugInfo);

                        // ВСЕГДА показываем кнопку если мы в комнате и есть хотя бы 1 игрок
                        // Это позволяет всем игрокам видеть кнопку и взаимодействовать с ней
                        const shouldShow = roomId && playersCount >= 1;

                        if (shouldShow) {
                            console.log(`${debugInfo} -> ПОКАЗЫВАЕМ кнопку (в комнате с ${playersCount} игроками, игра активна: ${finalIsActive})`);
                            // Принудительно показываем кнопку
                            startGameBtn.style.display = "block";
                            startGameBtn.style.visibility = "visible";
                            startGameBtn.style.opacity = "1";
                            startGameBtn.style.pointerEvents = "auto";
                            startGameBtn.classList.add("battle-btn-ready");

                            // КРИТИЧНО: Если игра идет, кнопка должна быть видна и кликабельна для ВСЕХ!
                            if (finalIsActive) {
                                debugLog(`[Menu] 🎮 ИГРА ИДЕТ - кнопка доступна ВСЕМ игрокам для присоединения!`);
                            }

                            // Дополнительная проверка через небольшую задержку
                            setTimeout(() => {
                                const computedStyle = window.getComputedStyle(startGameBtn);
                                if (computedStyle.display === "none" || computedStyle.visibility === "hidden") {
                                    debugWarn("[Menu] ⚠️ Кнопка скрыта CSS, принудительно показываем");
                                    startGameBtn.style.setProperty("display", "block", "important");
                                    startGameBtn.style.setProperty("visibility", "visible", "important");
                                }
                            }, 100);

                            // Обновляем текст кнопки в зависимости от ситуации
                            const textElement = startGameBtn.querySelector(".battle-btn-text");
                            let buttonText = "";

                            // КРИТИЧНО: Сначала проверяем isActive - если игра идет, ВСЕ игроки могут присоединиться!
                            if (finalIsActive) {
                                debugLog(`[Menu] ✅ Игра активна (${playersCount} игроков), показываем кнопку "ПРИСОЕДИНИТЬСЯ К БИТВЕ!" для ВСЕХ игроков`);
                                // Игра уже идет - можно присоединиться (для ВСЕХ игроков, БЕЗ ПРОВЕРОК!)
                                buttonText = `⚔️ ПРИСОЕДИНИТЬСЯ К БИТВЕ! (${playersCount} игроков)`;
                                startGameBtn.style.opacity = "1";
                                startGameBtn.style.cursor = "pointer";
                                startGameBtn.style.pointerEvents = "auto";
                                startGameBtn.style.display = "block";
                                startGameBtn.style.visibility = "visible";
                                startGameBtn.title = "Присоединиться к идущей игре (доступно всем!)";
                                // Убираем disabled состояние
                                startGameBtn.removeAttribute("disabled");
                                // Убираем классы, которые могут блокировать клик
                                startGameBtn.classList.remove("disabled");
                            } else if (isCreator) {
                                // Создатель комнаты - может начать игру (только если игра НЕ идет)
                                if (playersCount < 2) {
                                    buttonText = `⚔️ В БОЙ! (нужно больше игроков: ${playersCount}/2)`;
                                    startGameBtn.style.opacity = "0.7";
                                    startGameBtn.style.cursor = "not-allowed";
                                    startGameBtn.style.pointerEvents = "none";
                                    startGameBtn.title = "Для начала игры нужно минимум 2 игрока";
                                } else {
                                    buttonText = `⚔️ В БОЙ! (${playersCount} игроков готовы)`;
                                    startGameBtn.style.opacity = "1";
                                    startGameBtn.style.cursor = "pointer";
                                    startGameBtn.style.pointerEvents = "auto";
                                    startGameBtn.title = "Начать игру";
                                }
                            } else {
                                // Обычный игрок - ждет начала игры (только если игра НЕ идет)
                                if (playersCount < 2) {
                                    buttonText = `⏳ Ожидание игроков (${playersCount}/2)`;
                                    startGameBtn.style.opacity = "0.7";
                                    startGameBtn.style.cursor = "not-allowed";
                                    startGameBtn.style.pointerEvents = "none";
                                    startGameBtn.title = "Ожидание начала игры создателем комнаты";
                                } else {
                                    buttonText = `⏳ Ожидание начала игры (${playersCount} игроков)`;
                                    startGameBtn.style.opacity = "0.8";
                                    startGameBtn.style.cursor = "not-allowed";
                                    startGameBtn.style.pointerEvents = "none";
                                    startGameBtn.title = "Создатель комнаты должен начать игру";
                                }
                            }

                            if (textElement) {
                                textElement.textContent = buttonText;
                            } else {
                                // Если структура нарушена, восстанавливаем её
                                startGameBtn.innerHTML = `<span class="battle-btn-text">${buttonText}</span><span class="battle-btn-shine"></span>`;
                            }
                        } else {
                            console.log(`${debugInfo} -> СКРЫВАЕМ: нет комнаты или нет игроков`);
                            startGameBtn.style.display = "none";
                            startGameBtn.classList.remove("battle-btn-ready");
                        }
                    } catch (error) {
                        console.error("[Menu] Error checking room status:", error);
                        // В случае ошибки все равно показываем кнопку, если есть roomId
                        if (roomId && playersCount >= 1) {
                            startGameBtn.style.display = "block";
                            startGameBtn.style.visibility = "visible";
                        } else {
                            startGameBtn.style.display = "none";
                        }
                    }
                }

                // Список игроков обновляется автоматически через другие механизмы
            } else {
                if (roomInfoEl) roomInfoEl.style.display = "none";
            }
        } else {
            // ИСПРАВЛЕНИЕ: Показываем статус WebSocket и Firebase отдельно
            let statusText = "WebSocket [Offline]";
            if (isFirebaseConnected) {
                statusText += " / Firebase [Online]";
            } else {
                statusText += " / Firebase [Offline]";
            }

            statusEl.textContent = statusText;
            statusEl.style.color = "#f00"; // Красный если WebSocket офлайн
            indicatorEl.style.background = "#f00";
            indicatorEl.style.boxShadow = "none";

            if (pingEl) pingEl.style.display = "none";
            if (reconnectBtn) reconnectBtn.style.display = "inline-block";
            if (queueInfoEl) queueInfoEl.style.display = "none";
            if (roomInfoEl) roomInfoEl.style.display = "none";

            // Обновляем подсказку при отключении
            const hintEl = document.getElementById("mp-server-hint");
            if (hintEl) {
                hintEl.textContent = "❌ Не подключено. Проверьте адрес сервера и убедитесь, что сервер запущен.";
                hintEl.style.color = "#ef4444";
            }
        }
    }

    /**
     * Обновление списка игроков в комнате
     */
    private updateRoomPlayersList(roomId: string, networkPlayers: Map<string, any> | null): void {
        const playersContainer = document.getElementById("mp-room-panel-players-list");
        if (!playersContainer) return;

        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        const currentPlayerId = multiplayerManager?.getPlayerId();
        const isCreator = multiplayerManager?.isRoomCreator ? multiplayerManager.isRoomCreator() : false;

        // Принудительно обновляем статус кнопки после обновления списка игроков
        setTimeout(() => {
            this._updateMultiplayerStatus();
        }, 100);

        playersContainer.innerHTML = "";

        // Добавляем текущего игрока в начало списка
        const allPlayers: Array<{ id: string; name: string; isOwner?: boolean }> = [];
        if (currentPlayerId) {
            allPlayers.push({ id: currentPlayerId, name: multiplayerManager?.getPlayerName() || "Вы", isOwner: isCreator });
        }

        // Добавляем остальных игроков
        if (networkPlayers && networkPlayers.size > 0) {
            networkPlayers.forEach((player, playerId) => {
                if (playerId !== currentPlayerId) {
                    allPlayers.push({
                        id: playerId,
                        name: player.name || `Player_${playerId.substring(0, 6)}`,
                        isOwner: false
                    });
                }
            });
        }

        allPlayers.forEach(player => {
            const playerItem = document.createElement("div");
            playerItem.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(118, 75, 162, 0.2);
                border-radius: 4px;
                font-size: 11px;
            `;

            const isCurrentPlayer = player.id === currentPlayerId;
            const isReady = (this as any).roomReadyPlayers?.has(player.id) || false;

            playerItem.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                    ${player.isOwner ? '<span style="color: #fbbf24;">👑</span>' : ''}
                    <span style="color: ${isCurrentPlayer ? '#4ade80' : '#fff'}; font-weight: ${isCurrentPlayer ? '600' : '400'};">
                        ${player.name}${isCurrentPlayer ? ' (Вы)' : ''}
                    </span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center;">
                    ${isReady ? '<span style="color: #4ade80; font-size: 12px;">✓ Готов</span>' : '<span style="color: #888; font-size: 12px;">Не готов</span>'}
                    ${!isCurrentPlayer && isCreator ? `
                        <button class="room-player-kick-btn" data-player-id="${player.id}" data-player-name="${player.name}"
                                style="padding: 4px 8px; font-size: 9px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 3px; color: #ef4444; cursor: pointer; transition: all 0.2s;"
                                title="Кикнуть игрока">
                            🚫
                        </button>
                    ` : ''}
                    ${!isCurrentPlayer ? `
                        <button class="room-player-profile-btn" data-player-id="${player.id}" data-player-name="${player.name}"
                                style="padding: 4px 8px; font-size: 9px; background: rgba(102, 126, 234, 0.2); border: 1px solid #667eea; border-radius: 3px; color: #a78bfa; cursor: pointer; transition: all 0.2s;"
                                title="Профиль игрока">
                            👤
                        </button>
                    ` : ''}
                </div>
            `;

            // Обработчик кика игрока
            if (!isCurrentPlayer && isCreator) {
                const kickBtn = playerItem.querySelector(".room-player-kick-btn");
                if (kickBtn) {
                    kickBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const playerId = kickBtn.getAttribute("data-player-id");
                        const playerName = kickBtn.getAttribute("data-player-name");
                        if (playerId && playerName) {
                            const reason = prompt(`Введите причину кика игрока ${playerName} (необязательно):`);
                            this.kickPlayerFromRoom(roomId, playerId, reason || undefined);
                        }
                    });
                }
            }

            // Обработчик просмотра профиля
            if (!isCurrentPlayer) {
                const profileBtn = playerItem.querySelector(".room-player-profile-btn");
                if (profileBtn) {
                    profileBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const playerId = profileBtn.getAttribute("data-player-id");
                        const playerName = profileBtn.getAttribute("data-player-name");
                        if (playerId && playerName) {
                            this.showPlayerProfile(playerId, playerName);
                        }
                    });
                }
            }

            playersContainer.appendChild(playerItem);
        });
    }

    /**
     * Показать профиль игрока
     */
    private showPlayerProfile(playerId: string, playerName: string): void {
        // TODO: Реализовать просмотр профиля игрока
        alert(`Профиль игрока ${playerName}\nID: ${playerId} \n\nФункция просмотра профиля будет реализована позже.`);
    }

    private startMultiplayerQuickPlay(mode: string): void {
        debugLog("[Menu] Starting quick play for mode:", mode);

        // Сохраняем режим и запускаем игру
        this.selectedGameMode = "multiplayer";
        localStorage.setItem("selectedGameMode", "multiplayer");

        // Используем карту по умолчанию если не выбрана
        if (!this.selectedMapType) {
            this.selectedMapType = "normal";
        }

        // Показываем информацию о поиске
        const queueInfoEl = document.getElementById("mp-queue-info");
        if (queueInfoEl) {
            queueInfoEl.style.display = "block";
            queueInfoEl.style.animation = "fadeIn 0.3s ease";
            document.getElementById("mp-queue-mode")!.textContent = mode.toUpperCase();
            // Запускаем таймер очереди
            this.startQueueTimer();
        }

        // Закрываем меню и запускаем игру
        this.hide();
        this.hidePlayMenu();
        this.onStartGame(this.selectedMapType);

        // После запуска игры подключаемся к мультиплееру
        setTimeout(() => {
            const game = (window as any).gameInstance as any;
            if (game && game.quickPlayMultiplayer) {
                game.quickPlayMultiplayer(mode);
                debugLog("[Menu] Quick play multiplayer:", mode);
            } else {
                debugError("[Menu] Game instance not found or quickPlayMultiplayer not available");
                setTimeout(() => {
                    const game2 = (window as any).gameInstance as any;
                    if (game2 && game2.quickPlayMultiplayer) {
                        game2.quickPlayMultiplayer(mode);
                        debugLog("[Menu] Quick play multiplayer:", mode, "(retry)");
                    }
                }, 2000);
            }
        }, 3000);
    }

    private async createMultiplayerRoom(mode: string, mapType?: string): Promise<void> {
        debugLog("[Menu] Creating multiplayer room for mode:", mode, "mapType:", mapType);

        // КРИТИЧНО: НЕ очищаем custom map данные при создании мультиплеер комнаты
        // Это позволит использовать кастомные карты
        // localStorage.removeItem("selectedCustomMapData");
        // localStorage.removeItem("selectedCustomMapIndex");
        debugLog("[Menu] 🗺️ Custom map data preserved for multiplayer (createMultiplayerRoom)");

        const game = (window as any).gameInstance as any;
        if (!game) {
            this.showMultiplayerError("Игра еще не инициализирована. Запустите игру сначала.");
            return;
        }

        // Проверяем и инициализируем multiplayerManager если нужно
        let multiplayerManager = game?.multiplayerManager;

        // Если multiplayerManager не существует, пытаемся создать его
        if (!multiplayerManager) {
            debugLog("[Menu] MultiplayerManager not found, attempting to initialize...");

            // Создаем новый MultiplayerManager
            try {
                const { MultiplayerManager } = await import("./multiplayer");
                multiplayerManager = new MultiplayerManager(undefined, true);
                game.multiplayerManager = multiplayerManager;

                // Настраиваем колбэки если gameMultiplayerCallbacks существует
                if (game.gameMultiplayerCallbacks) {
                    try {
                        // КРИТИЧНО: Проверяем, что scene доступна перед настройкой колбэков
                        if (!game.scene) {
                            debugWarn("[Menu] Game scene not available, waiting for initialization...");
                            // Ждём инициализации игры
                            let waitAttempts = 0;
                            while (!game.scene && waitAttempts < 50) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                                waitAttempts++;
                            }
                            if (!game.scene) {
                                throw new Error("Game scene not available after waiting");
                            }
                        }

                        game.gameMultiplayerCallbacks.updateDependencies({
                            multiplayerManager: multiplayerManager,
                            scene: game.scene,
                            tank: game.tank,
                            hud: game.hud,
                            mainMenu: this,
                            achievementsSystem: game.achievementsSystem,
                            chunkSystem: game.chunkSystem,
                            networkPlayerTanks: game.networkPlayerTanks
                        });
                        // ИСПРАВЛЕНО: Было setupCallbacks(), должно быть setup()
                        game.gameMultiplayerCallbacks.setup();
                        debugLog("[Menu] Multiplayer callbacks configured with scene available");
                    } catch (callbackError) {
                        debugWarn("[Menu] Failed to setup multiplayer callbacks:", callbackError);
                    }
                }

                debugLog("[Menu] MultiplayerManager created successfully");
            } catch (error) {
                debugError("[Menu] Failed to create MultiplayerManager:", error);
                this.showMultiplayerError("Не удалось инициализировать менеджер мультиплеера. Попробуйте перезапустить игру или подождите, пока игра полностью загрузится.");
                return;
            }
        }

        if (!multiplayerManager) {
            this.showMultiplayerError("Менеджер мультиплеера не инициализирован.");
            return;
        }

        // Проверяем подключение к WebSocket и ждем подключения если нужно
        if (!multiplayerManager.isConnected()) {
            // Ждем подключения до 5 секунд
            let attempts = 0;
            const maxAttempts = 10;
            while (!multiplayerManager.isConnected() && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }

            if (!multiplayerManager.isConnected()) {
                this.showMultiplayerError("Не подключено к серверу. Пожалуйста, подключитесь к WebSocket серверу сначала.");
                debugLog("[Menu] WebSocket not connected after waiting, cannot create room");
                return;
            }
        }

        // Устанавливаем временный callback для показа ID сразу после создания
        // Сохраняем старый callback (если он есть)
        const existingCallback = (multiplayerManager as any).onRoomCreatedCallback;

        // Устанавливаем новый callback, который покажет ID и вызовет существующий
        multiplayerManager.onRoomCreated((data: any) => {
            debugLog("[Menu] Room created callback triggered, roomId:", data.roomId);

            // Вызываем существующий callback (который обновляет UI через GameMultiplayerCallbacks)
            if (existingCallback && existingCallback !== (multiplayerManager as any).onRoomCreatedCallback) {
                existingCallback(data);
            }

            // Немедленно обновляем UI для показа ID
            setTimeout(() => {
                this._updateMultiplayerStatus();
            }, 100);

            // Показываем уведомление с ID комнаты
            const roomId = data.roomId || multiplayerManager.getRoomId();
            if (roomId) {
                this.showMultiplayerNotification(
                    `✅ Комната создана! ID: ${roomId.substring(0, 12)} `,
                    "#4ade80"
                );
            } else {
                debugWarn("[Menu] Room created but no roomId in data");
            }

            // Запрашиваем обновлённый список комнат для отображения в лобби
            setTimeout(() => {
                if (multiplayerManager.isConnected()) {
                    debugLog("[Menu] Requesting updated room list after room creation");
                    multiplayerManager.requestRoomList();
                }
            }, 500);
        });

        // Используем прямой вызов метода multiplayerManager для большей надежности
        try {
            // Если выбрана custom карта, загружаем её данные из localStorage
            let customMapData = null;
            if (mapType === 'custom') {
                try {
                    const savedMapData = localStorage.getItem("selectedCustomMapData");
                    if (savedMapData) {
                        customMapData = JSON.parse(savedMapData);
                        debugLog(`[Menu] 📦 Loaded custom map data. Name: ${customMapData.name}, Objects: ${customMapData.placedObjects?.length}, Triggers: ${customMapData.triggers?.length}`);
                    } else {
                        debugWarn("[Menu] ⚠️ Custom map selected but no data found in localStorage!");
                    }
                } catch (e) {
                    debugError("[Menu] Failed to parse custom map data:", e);
                }
            }

            // Вызываем createRoom напрямую с mapType и данными карты
            const success = multiplayerManager.createRoom(mode as any, 32, false, mapType, false, 0, customMapData);
            if (success) {
                debugLog("[Menu] Room creation request sent for mode:", mode, "mapType:", mapType);
            } else {
                debugError("[Menu] Failed to send room creation request");
                this.showMultiplayerError("Не удалось отправить запрос на создание комнаты. Проверьте подключение к серверу.");
            }
        } catch (error: any) {
            debugError("[Menu] Error creating room:", error);
            this.showMultiplayerError(`Ошибка при создании комнаты: ${error.message || "Неизвестная ошибка"} `);
        }
    }

    private joinMultiplayerRoom(roomId: string): void {
        debugLog("[Menu] Joining multiplayer room:", roomId);
        const game = (window as any).gameInstance as any;
        if (game && game.joinMultiplayerRoom) {
            game.joinMultiplayerRoom(roomId);
            alert(`Присоединение к комнате ${roomId}...`);
        } else {
            alert("Игра еще не инициализирована. Запустите игру сначала.");
        }
    }

    private cancelMultiplayerQueue(): void {
        debugLog("[Menu] Cancelling multiplayer queue");
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        if (multiplayerManager) {
            // Отправляем запрос на отмену очереди
            multiplayerManager.cancelQueue();

            const queueInfoEl = document.getElementById("mp-queue-info");
            if (queueInfoEl) {
                queueInfoEl.style.display = "none";
            }
            // Останавливаем таймер
            if (this.queueTimerInterval) {
                clearInterval(this.queueTimerInterval);
                this.queueTimerInterval = null;
            }
            this.queueTimer = 0;
            const timerEl = document.getElementById("mp-queue-timer");
            if (timerEl) timerEl.textContent = "00:00";
        }
    }

    /**
     * Настроить обновление списка комнат
     */
    private setupRoomListUpdates(multiplayerManager: any): void {
        if (!multiplayerManager) return;

        if (multiplayerManager.isConnected()) {
            // ВСЕГДА настраиваем callback при открытии меню (перезаписываем для надежности)
            debugLog(`[Menu] ✅ Настройка callback для списка комнат при открытии меню`);
            multiplayerManager.onRoomList((rooms: any[]) => {
                // Throttling: логируем только при изменении количества комнат или раз в 2 секунды
                const now = Date.now();
                const shouldLog = (now - this._lastRoomListLogTime) > 30000 || rooms.length !== this._lastRoomListCount;
                if (shouldLog) {
                    debugLog(`[Menu] 📋 Room list: ${rooms.length} rooms`);
                    this._lastRoomListLogTime = now;
                    this._lastRoomListCount = rooms.length;
                }
                // Обновляем оба UI одновременно (без логирования)
                this.updateAllRoomLists(rooms);
            });

            // Запрашиваем список комнат сразу
            debugLog(`[Menu] 📡 Запрос списка комнат при открытии меню`);
            multiplayerManager.requestRoomList();

            // Обновляем список каждые 3 секунды (улучшено для более быстрого обновления)
            // Очищаем предыдущий интервал если есть
            const intervalKey = 'mp-room-list-interval';
            if ((window as any)[intervalKey]) {
                clearInterval((window as any)[intervalKey]);
            }
            (window as any)[intervalKey] = setInterval(() => {
                if (multiplayerManager.isConnected()) {
                    multiplayerManager.requestRoomList();
                }
            }, 3000);
        } else {
            debugWarn(`[Menu] ⚠️ Не подключено к серверу, список комнат не будет обновляться`);
        }
    }

    /**
     * Единый метод для обновления всех списков комнат (меню мультиплеера и лобби)
     */
    private updateAllRoomLists(rooms: any[]): void {
        // Сохраняем все комнаты для фильтрации (единый источник данных)
        this.allRooms = rooms;

        // Обновляем меню мультиплеера
        this.updateMultiplayerMenuRooms(rooms);

        // Обновляем лобби
        this.updateLobbyRoomsUI(rooms);
    }

    /**
     * Обновление списка комнат в меню мультиплеера
     */
    private updateMultiplayerMenuRooms(rooms: any[]): void {
        // Применяем фильтры
        const filteredRooms = this.filterRooms(rooms);

        const roomsContainer = document.getElementById("mp-rooms-items");
        if (!roomsContainer) {
            debugWarn("[Menu] ⚠️ Контейнер mp-rooms-items не найден!");
            return;
        }

        // Убрано для уменьшения спама в логах
        // debugLog(`[Menu] 📋 Обновление списка комнат в меню мультиплеера: ${ rooms.length } комнат(показано: ${ filteredRooms.length })`);

        roomsContainer.innerHTML = "";

        if (filteredRooms.length === 0) {
            roomsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">Нет доступных комнат</div>';
            return;
        }

        filteredRooms.forEach(room => {
            const roomItem = document.createElement("div");
            roomItem.style.cssText = `
padding: 10px;
background: rgba(0, 0, 0, 0.3);
border: 1px solid rgba(102, 126, 234, 0.3);
border-radius: 6px;
cursor: pointer;
transition: all 0.2s;
`;
            roomItem.onmouseenter = () => {
                roomItem.style.background = "rgba(102, 126, 234, 0.2)";
                roomItem.style.borderColor = "#667eea";
            };
            roomItem.onmouseleave = () => {
                roomItem.style.background = "rgba(0, 0, 0, 0.3)";
                roomItem.style.borderColor = "rgba(102, 126, 234, 0.3)";
            };
            // Одинарный клик - открыть детали комнаты
            roomItem.onclick = () => {
                this.showRoomDetails(room);
            };
            // Двойной клик - сразу присоединиться к комнате
            roomItem.ondblclick = () => {
                const game = (window as any).gameInstance as any;
                if (game?.multiplayerManager) {
                    debugLog(`[Menu] 🎮 Быстрое присоединение к комнате ${room.id} (двойной клик)`);
                    this.joinRoom(room.id);
                }
            };

            const statusColor = room.isActive ? "#4ade80" : "#a78bfa";
            const statusText = room.isActive ? "Игра идет" : "Ожидание";
            const isFull = room.players >= room.maxPlayers;
            const mapType = room.mapType || "normal";

            roomItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-weight: bold; color: #fff; font-size: 13px;">Комната ${room.id}</div>
                    <div style="font-size: 11px; color: ${statusColor}; background: rgba(0, 0, 0, 0.3); padding: 2px 6px; border-radius: 4px;">${statusText}</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #aaa; margin-bottom: 4px;">
                    <span>Режим: <span style="color: #fff;">${room.mode.toUpperCase()}</span></span>
                    <span>Игроков: <span style="color: ${isFull ? '#ef4444' : '#4ade80'};">${room.players}/${room.maxPlayers}</span></span>
                </div>
                <div style="font-size: 11px; color: #aaa;">
                    <span>Карта: <span style="color: #fbbf24;">${mapType}</span></span>
                </div>
                <div style="margin-top: 8px; text-align: center; font-size: 10px; color: #667eea; opacity: 0.7;">
                    Клик — детали • Двойной клик — войти
                </div>
            `;

            roomsContainer.appendChild(roomItem);
        });
    }

    /**
     * Обновление UI списка комнат в лобби (без обновления данных)
     */
    private updateLobbyRoomsUI(rooms: any[]): void {
        // Обновляем время последнего обновления
        this.updateLastUpdateTime(true);

        // Применяем фильтры и сортировку
        this.applyLobbyRoomFilters();
    }

    /**
     * Обновление списка комнат (публичный метод для обратной совместимости)
     * Теперь обновляет оба UI одновременно
     */
    updateRoomList(rooms: any[]): void {
        this.updateAllRoomLists(rooms);
    }

    /**
     * Обновление панели текущей комнаты
     */
    updateRoomPanel(roomId: string, mode: string, mapType: string): void {
        debugLog("[Menu] Updating room panel:", roomId, mode, mapType);

        // Обновляем ID комнаты
        const idEl = document.getElementById("mp-room-panel-id");
        if (idEl) idEl.textContent = roomId;

        // Обновляем режим
        const modeEl = document.getElementById("mp-room-panel-mode");
        if (modeEl) {
            const modeNames: Record<string, string> = {
                "ffa": "Free-for-All",
                "tdm": "Team Deathmatch",
                "coop": "Co-op PvE",
                "battle_royale": "Battle Royale",
                "ctf": "Capture the Flag",
                "survival": "Survival",
                "raid": "Raid"
            };
            modeEl.textContent = modeNames[mode] || mode.toUpperCase();

            // Показываем блок команд только для режимов с командами
            const teamsBlock = document.getElementById("mp-room-panel-teams");
            if (teamsBlock) {
                const teamModes = ["tdm", "ctf"];
                if (teamModes.includes(mode.toLowerCase())) {
                    teamsBlock.style.display = "block";
                    this.updateTeamsDisplay();
                } else {
                    teamsBlock.style.display = "none";
                }
            }
        }

        // Обновляем карту
        const mapEl = document.getElementById("mp-room-panel-map");
        if (mapEl) {
            const mapNames: Record<string, string> = {
                "normal": "Обычная карта",
                "sandbox": "Песочница",
                "sand": "Песок",
                "madness": "Безумие",
                "expo": "Expo",
                "brest": "Брестская крепость",
                "arena": "Арена",
                "polygon": "Полигон",
                "frontline": "Передовая",
                "ruins": "Руины",
                "canyon": "Ущелье",
                "industrial": "Промзона",
                "urban_warfare": "Городские бои",
                "underground": "Подземелье",
                "coastal": "Побережье",
                "tartaria": "Тартария"
            };
            mapEl.textContent = mapNames[mapType] || mapType;
        }

        // Определяем, является ли текущий игрок хостом
        const game = (window as any).gameInstance;
        const isHost = game?.multiplayerManager?.isRoomCreator ? game.multiplayerManager.isRoomCreator() : true;

        // Обновляем количество игроков
        const currentPlayers = game?.multiplayerManager?.getRoomPlayersCount?.() || 1;
        this.updateRoomPanelPlayers(currentPlayers, 32);

        // Обновляем имя хоста
        const hostNameEl = document.getElementById("mp-room-panel-host-name");
        if (hostNameEl && game?.multiplayerManager) {
            if (isHost) {
                const playerName = game.multiplayerManager.getPlayerName() || "Вы";
                hostNameEl.textContent = `${playerName} (Хост)`;
            } else {
                // Для не-хоста показываем "Ожидание хоста..." (будет обновлено при получении данных)
                hostNameEl.textContent = "Ожидание данных хоста...";
            }
        }

        // Скрываем настройки только для хоста, но кнопка "В БОЙ" видна всем
        const settingsSection = document.getElementById("mp-room-panel-settings");
        const controlsSection = document.getElementById("mp-room-panel-controls");
        const hostOnlyElements = document.querySelectorAll(".mp-room-host-only");

        if (settingsSection) {
            (settingsSection as HTMLElement).style.display = isHost ? "block" : "none";
        }
        if (controlsSection) {
            (controlsSection as HTMLElement).style.display = isHost ? "block" : "none";
        }
        hostOnlyElements.forEach(el => {
            (el as HTMLElement).style.display = isHost ? "block" : "none";
        });

        // Кнопка "Начать игру" / "В БОЙ!" видна всем, но с разным текстом
        const startBtnElement = document.getElementById("mp-room-panel-start-game");
        if (startBtnElement) {
            const btnTextEl = startBtnElement.querySelector(".battle-btn-text");
            if (isHost) {
                // Хост видит "НАЧАТЬ ИГРУ"
                if (btnTextEl) btnTextEl.textContent = "⚔️ НАЧАТЬ ИГРУ";
                (startBtnElement as HTMLElement).style.display = "block";
            } else {
                // Не-хост по умолчанию не видит кнопку (появится если игра станет активной через _updateMultiplayerStatus)
                if (btnTextEl) btnTextEl.textContent = "⚔️ В БОЙ!";
                (startBtnElement as HTMLElement).style.display = "none";
            }
        }



        // Обработчик копирования ID
        const copyBtn = document.getElementById("mp-room-panel-copy-id");
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(roomId).then(() => {
                    copyBtn.textContent = "✅";
                    setTimeout(() => { copyBtn.textContent = "📋"; }, 2000);
                });
            };
        }

        // Обработчик кнопки сворачивания
        const minimizeBtn = document.getElementById("mp-room-panel-minimize");
        if (minimizeBtn) {
            minimizeBtn.onclick = () => {
                const panel = document.getElementById("mp-room-panel");
                if (panel) {
                    const isMinimized = panel.style.height === "auto" && panel.style.overflow === "hidden";
                    if (isMinimized) {
                        // Разворачиваем
                        panel.style.height = "";
                        panel.style.overflow = "";
                        minimizeBtn.textContent = "─";
                        minimizeBtn.title = "Свернуть";
                    } else {
                        // Сворачиваем - оставляем только заголовок
                        const header = panel.querySelector(".play-window-header");
                        if (header) {
                            const headerHeight = (header as HTMLElement).offsetHeight;
                            panel.style.height = `${headerHeight} px`;
                            panel.style.overflow = "hidden";
                            minimizeBtn.textContent = "□";
                            minimizeBtn.title = "Развернуть";
                        }
                    }
                }
            };
        }

        // Обработчик кнопки "Начать игру"
        const startGameBtn = document.getElementById("mp-room-panel-start-game");
        if (startGameBtn) {
            startGameBtn.onclick = async () => {
                const game = (window as any).gameInstance;
                if (game?.multiplayerManager) {
                    debugLog("[Menu] Starting game in room:", roomId);
                    this.hideAllPlayWindows();
                    this.hidePlayMenu();
                    await this.startMultiplayerGame();
                }
            };
        }


        // Обработчик кнопки "Покинуть комнату"
        const leaveBtn = document.getElementById("mp-room-panel-leave");
        if (leaveBtn) {
            leaveBtn.onclick = () => {
                const game = (window as any).gameInstance;
                if (game?.multiplayerManager) {
                    debugLog("[Menu] Leaving room:", roomId);
                    game.multiplayerManager.leaveRoom();
                    this.hideAllPlayWindows();
                    this.showPlayWindow("play-window-multiplayer", 0.5, 0.5);
                }
            };
        }

        // Обработчики настроек комнаты
        const maxPlayersSlider = document.getElementById("mp-room-panel-max-players") as HTMLInputElement;
        const maxPlayersValue = document.getElementById("mp-room-panel-max-players-value");
        if (maxPlayersSlider && maxPlayersValue) {
            maxPlayersSlider.oninput = () => {
                maxPlayersValue.textContent = maxPlayersSlider.value;
            };
        }

        const roundTimeSlider = document.getElementById("mp-room-panel-round-time") as HTMLInputElement;
        const roundTimeValue = document.getElementById("mp-room-panel-round-time-value");
        if (roundTimeSlider && roundTimeValue) {
            roundTimeSlider.oninput = () => {
                roundTimeValue.textContent = roundTimeSlider.value;
            };
        }

        const killLimitSlider = document.getElementById("mp-room-panel-kill-limit") as HTMLInputElement;
        const killLimitValue = document.getElementById("mp-room-panel-kill-limit-value");
        if (killLimitSlider && killLimitValue) {
            killLimitSlider.oninput = () => {
                killLimitValue.textContent = killLimitSlider.value;
            };
        }

        const saveSettingsBtn = document.getElementById("mp-room-panel-save-settings");
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = () => {
                const game = (window as any).gameInstance;
                if (game?.multiplayerManager) {
                    const allowLight = (document.getElementById("mp-room-panel-allow-light") as HTMLInputElement)?.checked ?? true;
                    const allowMedium = (document.getElementById("mp-room-panel-allow-medium") as HTMLInputElement)?.checked ?? true;
                    const allowHeavy = (document.getElementById("mp-room-panel-allow-heavy") as HTMLInputElement)?.checked ?? true;
                    const allowAssault = (document.getElementById("mp-room-panel-allow-assault") as HTMLInputElement)?.checked ?? true;
                    const allowStandard = (document.getElementById("mp-room-panel-allow-standard") as HTMLInputElement)?.checked ?? true;
                    const allowRapid = (document.getElementById("mp-room-panel-allow-rapid") as HTMLInputElement)?.checked ?? true;
                    const allowHeavyGun = (document.getElementById("mp-room-panel-allow-heavy-gun") as HTMLInputElement)?.checked ?? true;
                    const allowSniper = (document.getElementById("mp-room-panel-allow-sniper") as HTMLInputElement)?.checked ?? true;

                    const settings = {
                        maxPlayers: parseInt(maxPlayersSlider?.value || "32"),
                        roundTime: parseInt(roundTimeSlider?.value || "10"),
                        killLimit: parseInt(killLimitSlider?.value || "50"),
                        allowedChassis: {
                            light: allowLight,
                            medium: allowMedium,
                            heavy: allowHeavy,
                            assault: allowAssault
                        },
                        allowedWeapons: {
                            standard: allowStandard,
                            rapid: allowRapid,
                            heavy: allowHeavyGun,
                            sniper: allowSniper
                        }
                    };
                    debugLog("[Menu] Saving room settings:", settings);
                    // TODO: Отправить настройки на сервер
                    this.showMultiplayerNotification("Настройки сохранены!", "#4ade80");
                }
            };
        }

        // Обработчик кнопки сворачивания настроек комнаты
        const settingsToggleBtn = document.getElementById("mp-room-panel-settings-toggle");
        const settingsContent = document.getElementById("mp-room-panel-settings-content");
        if (settingsToggleBtn && settingsContent) {
            // Загружаем состояние из localStorage (по умолчанию - свернуто)
            const savedState = localStorage.getItem("roomSettingsCollapsed");
            const isCollapsed = savedState !== "false"; // По умолчанию свернуто

            // Устанавливаем начальное состояние
            if (isCollapsed) {
                settingsContent.style.display = "none";
                settingsToggleBtn.textContent = "▶";
                settingsToggleBtn.title = "Развернуть настройки";
            } else {
                settingsContent.style.display = "block";
                settingsToggleBtn.textContent = "▼";
                settingsToggleBtn.title = "Свернуть настройки";
            }

            settingsToggleBtn.onclick = () => {
                const isCurrentlyCollapsed = settingsContent.style.display === "none";
                if (isCurrentlyCollapsed) {
                    settingsContent.style.display = "block";
                    settingsToggleBtn.textContent = "▼";
                    settingsToggleBtn.title = "Свернуть настройки";
                    localStorage.setItem("roomSettingsCollapsed", "false");
                } else {
                    settingsContent.style.display = "none";
                    settingsToggleBtn.textContent = "▶";
                    settingsToggleBtn.title = "Развернуть настройки";
                    localStorage.setItem("roomSettingsCollapsed", "true");
                }
            };
        }

        // Инициализация системы готовности
        (this as any).roomReadyPlayers = new Set<string>();
        (this as any).autoStartTriggered = false;
        // Используем уже объявленную переменную game
        if (game?.multiplayerManager) {
            const playerId = game.multiplayerManager.getPlayerId();
            if (playerId) {
                (this as any).roomReadyPlayers.add(playerId);
            }
        }

        // Обработчик кнопки "Готов"
        const readyBtn = document.getElementById("mp-room-panel-ready-btn");
        if (readyBtn) {
            // Устанавливаем начальное состояние кнопки
            const game = (window as any).gameInstance;
            if (game?.multiplayerManager) {
                const playerId = game.multiplayerManager.getPlayerId();
                const isReady = playerId && (this as any).roomReadyPlayers.has(playerId);
                if (isReady) {
                    readyBtn.textContent = "✗ Не готов";
                    readyBtn.style.background = "rgba(239, 68, 68, 0.2)";
                    readyBtn.style.borderColor = "#ef4444";
                } else {
                    readyBtn.textContent = "✓ Готов";
                    readyBtn.style.background = "rgba(74, 222, 128, 0.2)";
                    readyBtn.style.borderColor = "#4ade80";
                }
            }

            readyBtn.onclick = () => {
                const game = (window as any).gameInstance;
                if (game?.multiplayerManager) {
                    const playerId = game.multiplayerManager.getPlayerId();
                    if (playerId) {
                        const isReady = (this as any).roomReadyPlayers.has(playerId);
                        if (isReady) {
                            (this as any).roomReadyPlayers.delete(playerId);
                            readyBtn.textContent = "✓ Готов";
                            readyBtn.style.background = "rgba(74, 222, 128, 0.2)";
                            readyBtn.style.borderColor = "#4ade80";
                            this.addRoomSystemMessage("Вы отменили готовность");
                        } else {
                            (this as any).roomReadyPlayers.add(playerId);
                            readyBtn.textContent = "✗ Не готов";
                            readyBtn.style.background = "rgba(239, 68, 68, 0.2)";
                            readyBtn.style.borderColor = "#ef4444";
                            this.addRoomSystemMessage("Вы готовы к игре!");
                        }
                        this.updateReadyStatus();
                        // TODO: Отправить статус готовности на сервер
                    }
                }
            };
        }

        this.updateReadyStatus();

        // Обработчики чата комнаты
        const chatInput = document.getElementById("mp-room-panel-chat-input") as HTMLInputElement;
        const chatSendBtn = document.getElementById("mp-room-panel-chat-send");
        const chatMessages = document.getElementById("mp-room-panel-chat-messages");

        const sendChatMessage = () => {
            if (!chatInput || !chatMessages) {
                debugWarn("[Menu] Chat input or messages container not found");
                return;
            }
            const message = chatInput.value.trim();
            if (!message) {
                debugLog("[Menu] Empty message, ignoring");
                return;
            }

            const game = (window as any).gameInstance;
            const multiplayerManager = game?.multiplayerManager;

            if (!multiplayerManager) {
                debugWarn("[Menu] MultiplayerManager not available");
                return;
            }

            // Проверяем, что мы действительно в этой комнате
            const currentRoomId = multiplayerManager.getRoomId();
            if (currentRoomId !== roomId) {
                debugWarn("[Menu] Not in room", roomId, "current room:", currentRoomId);
                return;
            }

            const playerName = multiplayerManager.getPlayerName() || "Вы";

            debugLog("[Menu] Sending room chat message:", { roomId, playerName, message });

            // Добавляем сообщение в чат локально для мгновенного отклика
            // В callback будет проверка на isOwnMessage, чтобы не дублировать
            this.addRoomChatMessage(playerName, message, "player");

            // Отправляем сообщение на сервер (sendChatMessage автоматически отправляет в комнату, если игрок в комнате)
            try {
                multiplayerManager.sendChatMessage(message);
                debugLog("[Menu] Room chat message sent successfully");
            } catch (error) {
                console.error("[Menu] Error sending room chat message:", error);
            }

            chatInput.value = "";
        };

        if (chatInput) {
            // Удаляем старые обработчики если есть
            chatInput.onkeypress = null;
            // Добавляем новый обработчик
            chatInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    sendChatMessage();
                }
            });
            debugLog("[Menu] Room chat input handler attached");
        } else {
            debugWarn("[Menu] Room chat input element not found");
        }

        if (chatSendBtn) {
            // Удаляем старые обработчики если есть
            chatSendBtn.onclick = null;
            // Добавляем новый обработчик
            chatSendBtn.addEventListener("click", sendChatMessage);
            debugLog("[Menu] Room chat send button handler attached");
        } else {
            debugWarn("[Menu] Room chat send button element not found");
        }

        // Обработчик входящих сообщений чата для комнаты
        const gameInstance = (window as any).gameInstance;
        const multiplayerManager = gameInstance?.multiplayerManager;
        if (multiplayerManager) {
            // Сохраняем старый callback если есть
            const oldCallback = (multiplayerManager as any).onChatMessageCallback;

            // Устанавливаем новый callback для комнаты
            multiplayerManager.onChatMessage((data: any) => {
                debugLog("[Menu] Room chat callback received:", { roomId, data, currentRoomId: multiplayerManager.getRoomId() });

                // Проверяем, находимся ли мы в комнате и что это та же комната
                const currentRoomId = multiplayerManager.getRoomId();
                const isInThisRoom = currentRoomId === roomId;
                const currentPlayerId = multiplayerManager.getPlayerId();
                const isOwnMessage = data.playerId === currentPlayerId;

                if (isInThisRoom && data && data.playerName && data.message) {
                    // Если это наше собственное сообщение, не добавляем его снова (оно уже добавлено локально при отправке)
                    if (!isOwnMessage) {
                        debugLog("[Menu] Adding message to room chat:", data.playerName, data.message);
                        // Добавляем сообщение в чат комнаты
                        this.addRoomChatMessage(data.playerName, data.message, "player");
                    } else {
                        debugLog("[Menu] Skipping own message (already added locally):", data.message);
                    }
                } else {
                    debugLog("[Menu] Message not for this room:", { isInThisRoom, currentRoomId, roomId });
                }

                // Вызываем старый callback если он был (для лобби)
                // Но только если мы не в комнате или это не сообщение для комнаты
                if (oldCallback) {
                    // Если мы в комнате, не передаем сообщение в лобби (оно уже обработано выше)
                    if (!isInThisRoom) {
                        oldCallback(data);
                    }
                }
            });
            debugLog("[Menu] Room chat callback set up for room:", roomId);
        } else {
            debugWarn("[Menu] MultiplayerManager not available for room chat");
        }

        // Обработчики кнопок управления комнатой
        const changeModeBtn = document.getElementById("mp-room-panel-change-mode");
        if (changeModeBtn) {
            changeModeBtn.onclick = () => {
                // Закрываем панель комнаты и открываем выбор режима
                this.hideAllPlayWindows();
                this.showPlayWindow("mp-create-room-mode", 1, 1);
                // Сохраняем что мы редактируем существующую комнату
                (this as any).editingRoomId = roomId;
            };
        }

        const changeMapBtn = document.getElementById("mp-room-panel-change-map");
        if (changeMapBtn) {
            changeMapBtn.onclick = () => {
                // Закрываем панель комнаты и открываем выбор карты
                this.hideAllPlayWindows();
                // Сначала нужно выбрать режим (если не выбран), потом карту
                const currentMode = (this as any).selectedCreateRoomMode || mode;
                (this as any).selectedCreateRoomMode = currentMode;
                this.showPlayWindow("mp-create-room-map", 2, 2);
                (this as any).editingRoomId = roomId;
            };
        }

        const togglePrivateBtn = document.getElementById("mp-room-panel-toggle-private");
        if (togglePrivateBtn) {
            togglePrivateBtn.onclick = () => {
                const game = (window as any).gameInstance;
                if (game?.multiplayerManager) {
                    // TODO: Реализовать переключение приватности через сервер
                    alert("Функция изменения приватности комнаты будет реализована позже");
                }
            };
        }

        const kickPlayerBtn = document.getElementById("mp-room-panel-kick-player");
        if (kickPlayerBtn) {
            kickPlayerBtn.onclick = () => {
                // Показываем список игроков для выбора кого кикнуть
                const game = (window as any).gameInstance;
                if (game?.multiplayerManager) {
                    // TODO: Реализовать выбор игрока и кик через сервер
                    alert("Функция кика игроков будет реализована позже. Выберите игрока из списка для кика.");
                }
            };
        }

        // Обработчики приглашений
        const inviteFriendsBtn = document.getElementById("mp-room-panel-invite-friends");
        const friendsList = document.getElementById("mp-room-panel-friends-list");
        if (inviteFriendsBtn && friendsList) {
            inviteFriendsBtn.onclick = () => {
                const isVisible = friendsList.style.display !== "none";
                if (isVisible) {
                    friendsList.style.display = "none";
                } else {
                    friendsList.style.display = "block";
                    this.loadRoomFriendsList(roomId);
                }
            };
        }

        const inviteByIdBtn = document.getElementById("mp-room-panel-invite-by-id");
        const inviteByIdForm = document.getElementById("mp-room-panel-invite-by-id-form");
        if (inviteByIdBtn && inviteByIdForm) {
            inviteByIdBtn.onclick = () => {
                const isVisible = inviteByIdForm.style.display !== "none";
                inviteByIdForm.style.display = isVisible ? "none" : "block";
            };
        }

        const sendInviteBtn = document.getElementById("mp-room-panel-send-invite");
        const inviteIdInput = document.getElementById("mp-room-panel-invite-id-input") as HTMLInputElement;
        if (sendInviteBtn && inviteIdInput) {
            sendInviteBtn.onclick = () => {
                const playerId = inviteIdInput.value.trim();
                if (playerId) {
                    debugLog("[Menu] Sending invite to player:", playerId);
                    // TODO: Отправить приглашение на сервер
                    this.addRoomSystemMessage(`Приглашение отправлено игроку ${playerId} `);
                    inviteIdInput.value = "";
                }
            };
        }

        // Обработчик автобаланса команд
        const autoBalanceBtn = document.getElementById("mp-room-panel-auto-balance");
        if (autoBalanceBtn) {
            autoBalanceBtn.onclick = () => {
                debugLog("[Menu] Auto-balancing teams");
                this.autoBalanceTeams();
            };
        }

        // Инициализация системы команд
        (this as any).roomTeams = {
            team1: [],
            team2: []
        };

        // Инициализируем команды текущим игроком (хостом)
        // Используем уже объявленную переменную game
        if (game?.multiplayerManager) {
            const playerId = game.multiplayerManager.getPlayerId();
            const playerName = game.multiplayerManager.getPlayerName() || "Вы";
            if (playerId) {
                // Добавляем хоста в команду 1 по умолчанию
                (this as any).roomTeams.team1.push({ id: playerId, name: playerName });
            }
        }

        // Обновляем отображение команд если режим поддерживает команды
        const teamModes = ["tdm", "ctf"];
        if (teamModes.includes(mode.toLowerCase())) {
            this.updateTeamsDisplay();
        }

        // Отслеживание предыдущего количества игроков для системных сообщений
        (this as any).previousPlayerCount = 1;

        // Добавляем системное сообщение о создании комнаты
        this.addRoomSystemMessage(`Комната ${roomId} создана.Ожидание игроков...`);

        // Подписываемся на обновления списка комнат для обновления количества игроков
        if (game?.multiplayerManager) {
            const multiplayerManager = game.multiplayerManager;
            // Сохраняем старый callback если есть
            const existingRoomListCallback = (multiplayerManager as any).onRoomListCallback;

            // Добавляем обновление панели комнаты
            multiplayerManager.onRoomList((rooms: any[]) => {
                // Вызываем существующий callback
                if (existingRoomListCallback) {
                    existingRoomListCallback(rooms);
                }

                // Обновляем панель комнаты если она открыта
                const panel = document.getElementById("mp-room-panel");
                if (panel && panel.style.display !== "none") {
                    const currentRoom = rooms.find((r: any) => r.id === roomId);
                    if (currentRoom) {
                        const newPlayerCount = currentRoom.players || 1;
                        const oldPlayerCount = (this as any).previousPlayerCount || 1;

                        // Отправляем системные сообщения об изменении количества игроков
                        if (newPlayerCount > oldPlayerCount) {
                            this.addRoomSystemMessage(`Игрок присоединился к комнате(${oldPlayerCount} → ${newPlayerCount})`);
                        } else if (newPlayerCount < oldPlayerCount) {
                            this.addRoomSystemMessage(`Игрок покинул комнату(${oldPlayerCount} → ${newPlayerCount})`);
                        }

                        (this as any).previousPlayerCount = newPlayerCount;
                        this.updateRoomPanelPlayers(newPlayerCount, currentRoom.maxPlayers || 32);
                        this.updateRoomPanelPlayersList(newPlayerCount);
                    }
                }
            });
        }
    }

    /**
     * Обновление списка игроков в панели комнаты
     */
    updateRoomPanelPlayersList(playerCount: number): void {
        const playersListEl = document.getElementById("mp-room-panel-players-list");
        if (!playersListEl) return;

        // Пока просто обновляем количество, в будущем можно добавить список имён
        // Сейчас оставляем только хоста, так как полный список игроков требует дополнительных данных с сервера
    }

    /**
     * Добавление сообщения в чат комнаты
     */
    addRoomChatMessage(playerName: string, message: string, type: "player" | "system" = "player"): void {
        const chatMessages = document.getElementById("mp-room-panel-chat-messages");
        if (!chatMessages) {
            debugWarn("[Menu] Room chat messages container not found");
            return;
        }

        debugLog("[Menu] Adding room chat message:", { playerName, message, type });

        // Удаляем placeholder если есть
        const placeholder = chatMessages.querySelector('div[style*="text-align: center"]');
        if (placeholder) placeholder.remove();

        // Экранируем HTML для безопасности
        const escapeHtml = (text: string) => {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML;
        };

        const messageDiv = document.createElement("div");
        messageDiv.style.cssText = "padding: 4px 8px; margin-bottom: 4px; border-radius: 4px;";

        if (type === "system") {
            messageDiv.style.background = "rgba(74, 222, 128, 0.1)";
            messageDiv.style.borderLeft = "2px solid #4ade80";
            messageDiv.innerHTML = `< span style = "color: #4ade80; font-style: italic;" > ${escapeHtml(message)} </span>`;
        } else {
            messageDiv.style.background = "rgba(0, 0, 0, 0.2)";
            messageDiv.innerHTML = `<span style="color: #4ade80; font-weight: bold;">${escapeHtml(playerName)}:</span> <span style="color: #0f0;">${escapeHtml(message)}</span>`;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Добавление системного сообщения в чат комнаты
     */
    addRoomSystemMessage(message: string): void {
        this.addRoomChatMessage("", message, "system");
    }

    /**
     * Загрузка списка друзей для приглашения
     */
    loadRoomFriendsList(roomId: string): void {
        const friendsList = document.getElementById("mp-room-panel-friends-list");
        if (!friendsList) return;

        try {
            const game = (window as any).gameInstance;
            if (!game?.socialSystem) {
                friendsList.innerHTML = '<div style="text-align: center; padding: 10px; color: #888; font-size: 11px;">Система друзей не доступна</div>';
                return;
            }

            // Получаем список друзей
            const friends = game.socialSystem.getFriendsList() || [];
            const onlineFriends = friends.filter((f: any) => f && f.isOnline);

            if (onlineFriends.length === 0) {
                friendsList.innerHTML = '<div style="text-align: center; padding: 10px; color: #888; font-size: 11px;">Нет друзей онлайн</div>';
                return;
            }

            friendsList.innerHTML = "";
            onlineFriends.forEach((friend: any) => {
                if (!friend || !friend.id) return;

                const friendItem = document.createElement("div");
                friendItem.style.cssText = "padding: 8px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(0, 255, 0, 0.2); border-radius: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;";

                // Экранируем имя друга
                const friendName = friend.name || friend.id;
                const escapedName = friendName.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                friendItem.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: #4ade80; font-size: 12px;">●</span>
                        <span style="color: #0f0; font-size: 11px;">${escapedName}</span>
                    </div>
                    <button class="panel-btn" data-friend-id="${friend.id}" style="padding: 4px 8px; font-size: 10px; background: rgba(74, 222, 128, 0.2); border-color: #4ade80; color: #4ade80;">
                        Пригласить
                    </button>
                `;

                const inviteBtn = friendItem.querySelector("button");
                if (inviteBtn) {
                    inviteBtn.onclick = () => {
                        const friendId = inviteBtn.getAttribute("data-friend-id");
                        if (friendId) {
                            debugLog("[Menu] Inviting friend:", friendId);
                            // TODO: Отправить приглашение на сервер
                            this.addRoomSystemMessage(`Приглашение отправлено ${friendName}`);
                        }
                    };
                }

                friendsList.appendChild(friendItem);
            });
        } catch (error) {
            console.error("[Menu] Error loading friends list:", error);
            friendsList.innerHTML = '<div style="text-align: center; padding: 10px; color: #ef4444; font-size: 11px;">Ошибка загрузки списка друзей</div>';
        }
    }

    /**
     * Обновление отображения команд
     */
    updateTeamsDisplay(): void {
        const team1El = document.getElementById("mp-room-panel-team1-players");
        const team2El = document.getElementById("mp-room-panel-team2-players");
        const team1CountEl = document.getElementById("mp-room-panel-team1-count");
        const team2CountEl = document.getElementById("mp-room-panel-team2-count");

        if (!team1El || !team2El) return;

        const teams = (this as any).roomTeams || { team1: [], team2: [] };

        // Очищаем списки
        team1El.innerHTML = "";
        team2El.innerHTML = "";

        // Отображаем игроков команды 1
        if (teams.team1 && Array.isArray(teams.team1)) {
            teams.team1.forEach((player: any) => {
                if (!player) return;
                const playerEl = document.createElement("div");
                playerEl.style.cssText = "padding: 4px 8px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; font-size: 10px; color: #ef4444;";
                playerEl.textContent = player.name || player.id || "Неизвестный";
                team1El.appendChild(playerEl);
            });
        }

        // Отображаем игроков команды 2
        if (teams.team2 && Array.isArray(teams.team2)) {
            teams.team2.forEach((player: any) => {
                if (!player) return;
                const playerEl = document.createElement("div");
                playerEl.style.cssText = "padding: 4px 8px; background: rgba(59, 130, 246, 0.1); border-radius: 4px; font-size: 10px; color: #3b82f6;";
                playerEl.textContent = player.name || player.id || "Неизвестный";
                team2El.appendChild(playerEl);
            });
        }

        // Обновляем счётчики
        const team1Count = teams.team1?.length || 0;
        const team2Count = teams.team2?.length || 0;
        if (team1CountEl) team1CountEl.textContent = `${team1Count} ${team1Count === 1 ? 'игрок' : 'игроков'}`;
        if (team2CountEl) team2CountEl.textContent = `${team2Count} ${team2Count === 1 ? 'игрок' : 'игроков'}`;

        // Обновляем баланс
        this.updateTeamsBalance();
    }

    /**
     * Автоматическое распределение игроков по командам
     */
    autoBalanceTeams(): void {
        const game = (window as any).gameInstance;
        if (!game?.multiplayerManager) return;

        // Получаем список всех игроков (пока только текущий игрок)
        const currentPlayer = {
            id: game.multiplayerManager.getPlayerId(),
            name: game.multiplayerManager.getPlayerName() || "Вы"
        };

        const allPlayers = [currentPlayer]; // TODO: Получить полный список игроков с сервера

        // Распределяем игроков по командам
        const teams = {
            team1: [] as any[],
            team2: [] as any[]
        };

        allPlayers.forEach((player, index) => {
            if (index % 2 === 0) {
                teams.team1.push(player);
            } else {
                teams.team2.push(player);
            }
        });

        (this as any).roomTeams = teams;
        this.updateTeamsDisplay();
        this.addRoomSystemMessage("Команды автоматически сбалансированы");
    }

    /**
     * Обновление визуализации баланса команд
     */
    updateTeamsBalance(): void {
        const teams = (this as any).roomTeams || { team1: [], team2: [] };
        const balanceStatusEl = document.getElementById("mp-room-panel-balance-status");

        if (!balanceStatusEl) return;

        const team1Count = teams.team1?.length || 0;
        const team2Count = teams.team2?.length || 0;
        const diff = Math.abs(team1Count - team2Count);
        const total = team1Count + team2Count;

        if (total === 0) {
            balanceStatusEl.textContent = "Нет игроков в командах";
            balanceStatusEl.style.color = "#888";
        } else if (diff === 0) {
            balanceStatusEl.textContent = "Сбалансировано";
            balanceStatusEl.style.color = "#4ade80";
        } else if (diff === 1) {
            balanceStatusEl.textContent = `Небольшой дисбаланс (${diff} игрок)`;
            balanceStatusEl.style.color = "#fbbf24";
        } else {
            balanceStatusEl.textContent = `Дисбаланс (${diff} игроков)`;
            balanceStatusEl.style.color = "#ef4444";
        }
    }

    /**
     * Обновление статуса готовности игроков
     */
    updateReadyStatus(): void {
        const readyCount = (this as any).roomReadyPlayers?.size || 0;

        // Получаем количество игроков из элемента или из multiplayerManager
        let currentPlayers = 1;
        const playersEl = document.getElementById("mp-room-panel-players");
        if (playersEl && playersEl.textContent) {
            const match = playersEl.textContent.match(/(\d+)\/(\d+)/);
            if (match && match[1]) {
                currentPlayers = parseInt(match[1], 10) || 1;
            }
        } else {
            // Fallback: получаем из multiplayerManager
            const game = (window as any).gameInstance;
            if (game?.multiplayerManager) {
                currentPlayers = game.multiplayerManager.getRoomPlayersCount?.() || 1;
            }
        }

        const readyCountEl = document.getElementById("mp-room-panel-ready-count");
        if (readyCountEl) {
            readyCountEl.textContent = `${readyCount}/${currentPlayers}`;
        }

        // Проверяем готовность всех игроков
        const allReady = currentPlayers >= 2 && readyCount >= 2 && readyCount === currentPlayers;
        const startBtn = document.getElementById("mp-room-panel-start-game") as HTMLButtonElement;
        const hintEl = document.getElementById("mp-room-panel-start-hint");

        if (allReady && startBtn && hintEl) {
            hintEl.textContent = "Все игроки готовы! Можно начинать!";
            hintEl.style.color = "#4ade80";

            // Проверяем автозапуск
            const autoStart = (document.getElementById("mp-room-panel-auto-start") as HTMLInputElement)?.checked;
            if (autoStart && !(this as any).autoStartTriggered) {
                (this as any).autoStartTriggered = true;
                this.addRoomSystemMessage("Все игроки готовы! Автозапуск через 3 секунды...");
                setTimeout(async () => {
                    const game = (window as any).gameInstance;
                    if (game?.multiplayerManager) {
                        debugLog("[Menu] Auto-starting game - all players ready");
                        this.hideAllPlayWindows();
                        this.hidePlayMenu();
                        await this.startMultiplayerGame();
                    }
                }, 3000);
            }
        } else {
            (this as any).autoStartTriggered = false;
            if (hintEl) {
                if (currentPlayers < 2) {
                    hintEl.textContent = `Ожидание игроков... (${currentPlayers}/2 минимум)`;
                } else if (readyCount < currentPlayers) {
                    hintEl.textContent = `Ожидание готовности всех игроков... (${readyCount}/${currentPlayers})`;
                } else {
                    hintEl.textContent = "Ожидание готовности игроков...";
                }
                hintEl.style.color = "#888";
            }
        }
    }

    /**
     * Обновление панели комнаты при изменении количества игроков
     * Вызывается из onPlayerJoined/onPlayerLeft callbacks
     */
    refreshRoomPanelPlayers(): void {
        const panel = document.getElementById("mp-room-panel");
        if (!panel || panel.style.display === "none") {
            return; // Панель не открыта
        }

        const game = (window as any).gameInstance;
        if (!game?.multiplayerManager) return;

        const multiplayerManager = game.multiplayerManager;
        const currentPlayers = multiplayerManager.getRoomPlayersCount?.() || 1;
        const maxPlayers = 32; // TODO: получить из настроек комнаты

        debugLog(`[Menu] 🔄 Обновляем панель комнаты: ${currentPlayers}/${maxPlayers} игроков`);

        this.updateRoomPanelPlayers(currentPlayers, maxPlayers);

        // FIX: Call the correct method with required arguments
        const roomId = multiplayerManager.getRoomId();
        const networkPlayers = multiplayerManager.getPlayers();
        if (roomId && networkPlayers) {
            this.updateRoomPlayersList(roomId, networkPlayers);
        }

        this.updateReadyStatus();
    }

    /**
     * Обновление количества игроков в панели комнаты и состояния кнопки "Начать игру"
     */
    updateRoomPanelPlayers(currentPlayers: number, maxPlayers: number): void {

        const playersEl = document.getElementById("mp-room-panel-players");
        if (playersEl) {
            playersEl.textContent = `${currentPlayers}/${maxPlayers}`;
        }

        // Обновляем состояние кнопки "Начать игру"
        const startBtn = document.getElementById("mp-room-panel-start-game") as HTMLButtonElement;
        const hintEl = document.getElementById("mp-room-panel-start-hint");

        if (startBtn) {
            const canStart = currentPlayers >= 2;

            if (canStart) {
                // Активируем кнопку
                startBtn.disabled = false;
                startBtn.style.opacity = "1";
                startBtn.style.cursor = "pointer";
                startBtn.style.pointerEvents = "auto";
                if (hintEl) {
                    hintEl.textContent = "Готово к запуску!";
                    hintEl.style.color = "#4ade80";
                }
            } else {
                // Деактивируем кнопку
                startBtn.disabled = true;
                startBtn.style.opacity = "0.5";
                startBtn.style.cursor = "not-allowed";
                startBtn.style.pointerEvents = "none";
                if (hintEl) {
                    hintEl.textContent = `Требуется минимум 2 игрока (сейчас: ${currentPlayers})`;
                    hintEl.style.color = "#888";
                }
            }
        }

        // Обновляем статус готовности после изменения количества игроков
        this.updateReadyStatus();
    }

    /**
     * Фильтрация комнат по поисковому запросу и фильтрам
     */
    private filterRooms(rooms: any[]): any[] {
        let filtered = [...rooms];

        // Поиск по ID
        const searchInput = document.getElementById("mp-rooms-search") as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(room =>
                room.id.toLowerCase().includes(searchTerm)
            );
        }

        // Фильтр по режиму
        const modeFilter = document.getElementById("mp-rooms-filter-mode") as HTMLSelectElement;
        if (modeFilter && modeFilter.value !== "all") {
            filtered = filtered.filter(room => room.mode === modeFilter.value);
        }

        // Фильтр по статусу
        const statusFilter = document.getElementById("mp-rooms-filter-status") as HTMLSelectElement;
        if (statusFilter && statusFilter.value !== "all") {
            if (statusFilter.value === "waiting") {
                filtered = filtered.filter(room => !room.isActive);
            } else if (statusFilter.value === "active") {
                filtered = filtered.filter(room => room.isActive);
            }
        }

        // Сортировка
        const sortSelect = document.getElementById("mp-rooms-sort") as HTMLSelectElement;
        if (sortSelect) {
            const sortValue = sortSelect.value;
            if (sortValue === "players-desc") {
                filtered.sort((a, b) => b.players - a.players);
            } else if (sortValue === "players-asc") {
                filtered.sort((a, b) => a.players - b.players);
            } else if (sortValue === "time-desc") {
                filtered.sort((a, b) => (b.gameTime || 0) - (a.gameTime || 0));
            } else if (sortValue === "time-asc") {
                filtered.sort((a, b) => (a.gameTime || 0) - (b.gameTime || 0));
            }
        }

        return filtered;
    }

    /**
     * Настройка обработчиков фильтров комнат
     */
    private setupRoomFilters(): void {
        const searchInput = document.getElementById("mp-rooms-search");
        const modeFilter = document.getElementById("mp-rooms-filter-mode");
        const statusFilter = document.getElementById("mp-rooms-filter-status");
        const sortSelect = document.getElementById("mp-rooms-sort");

        const applyFilters = () => {
            this.updateRoomList(this.allRooms);
        };

        if (searchInput) {
            searchInput.addEventListener("input", applyFilters);
        }
        if (modeFilter) {
            modeFilter.addEventListener("change", applyFilters);
        }
        if (statusFilter) {
            statusFilter.addEventListener("change", applyFilters);
        }
        if (sortSelect) {
            sortSelect.addEventListener("change", applyFilters);
        }
    }

    /**
     * Обновление списка игроков в лобби
     */
    updateLobbyPlayers(players: any[]): void {
        // Throttling: логируем только при изменении количества игроков или раз в 2 секунды
        const now = Date.now();
        const shouldLog = (now - this._lastLobbyPlayersLogTime) > 30000 || players.length !== this._lastLobbyPlayersCount;
        if (shouldLog) {
            // debugLog("[Menu] Lobby players:", players.length);
            this._lastLobbyPlayersLogTime = now;
            this._lastLobbyPlayersCount = players.length;
        }
        const playersList = document.getElementById("lobby-players-list");
        const playersEmpty = document.getElementById("lobby-players-empty");
        const lobbyCount = document.getElementById("lobby-count");

        if (!playersList) {
            debugWarn("[Menu] Элемент lobby-players-list не найден!");
            return;
        }

        // Исключаем текущего игрока из списка
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        const currentPlayerId = multiplayerManager?.getPlayerId();
        const filteredPlayers = players.filter(player => player.id !== currentPlayerId);

        // Сохраняем всех игроков для фильтрации (без текущего игрока)
        this.allLobbyPlayers = filteredPlayers;

        // Обновляем счетчик (показываем количество без текущего игрока)
        if (lobbyCount) {
            lobbyCount.textContent = filteredPlayers.length.toString();
        }

        // Обновляем время последнего обновления
        this.updateLastUpdateTime(true);

        // Применяем фильтры и сортировку
        this.applyLobbyPlayerFilters();
    }

    /**
     * Настройка фильтров и поиска игроков
     */
    private setupLobbyPlayerFilters(): void {
        const searchInput = document.getElementById("lobby-players-search") as HTMLInputElement;
        const statusFilter = document.getElementById("lobby-players-filter-status") as HTMLSelectElement;
        const friendsFilter = document.getElementById("lobby-players-filter-friends") as HTMLSelectElement;
        const sortSelect = document.getElementById("lobby-players-sort") as HTMLSelectElement;

        // Загружаем сохраненные настройки
        const savedSearch = localStorage.getItem("lobbyPlayersSearch");
        const savedStatusFilter = localStorage.getItem("lobbyPlayersStatusFilter");
        const savedFriendsFilter = localStorage.getItem("lobbyPlayersFriendsFilter");
        const savedSort = localStorage.getItem("lobbyPlayersSort");

        if (savedSearch && searchInput) {
            searchInput.value = savedSearch;
        }
        if (savedStatusFilter && statusFilter) {
            statusFilter.value = savedStatusFilter;
        }
        if (savedFriendsFilter && friendsFilter) {
            friendsFilter.value = savedFriendsFilter;
        }
        if (savedSort && sortSelect) {
            sortSelect.value = savedSort;
        }

        // Обработчики изменений
        const applyFilters = () => {
            this.applyLobbyPlayerFilters();
        };

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                localStorage.setItem("lobbyPlayersSearch", searchInput.value);
                applyFilters();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener("change", () => {
                localStorage.setItem("lobbyPlayersStatusFilter", statusFilter.value);
                applyFilters();
            });
        }

        if (friendsFilter) {
            friendsFilter.addEventListener("change", () => {
                localStorage.setItem("lobbyPlayersFriendsFilter", friendsFilter.value);
                applyFilters();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                localStorage.setItem("lobbyPlayersSort", sortSelect.value);
                applyFilters();
            });
        }
    }

    /**
     * Применение фильтров и сортировки к списку игроков
     */
    private applyLobbyPlayerFilters(): void {
        const playersList = document.getElementById("lobby-players-list");
        const playersEmpty = document.getElementById("lobby-players-empty");

        if (!playersList) return;

        // Начинаем с копии всех игроков
        let filtered = [...this.allLobbyPlayers];

        // Поиск по имени
        const searchInput = document.getElementById("lobby-players-search") as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(player =>
                player.name.toLowerCase().includes(searchTerm)
            );
        }

        // Фильтр по статусу
        const statusFilter = document.getElementById("lobby-players-filter-status") as HTMLSelectElement;
        if (statusFilter && statusFilter.value !== "all") {
            if (statusFilter.value === "online") {
                // Все онлайн игроки (уже в списке)
                // Ничего не фильтруем
            } else if (statusFilter.value === "in-room") {
                filtered = filtered.filter(player => player.isInRoom && player.roomId);
            } else if (statusFilter.value === "in-lobby") {
                filtered = filtered.filter(player => !player.isInRoom || !player.roomId);
            }
        }

        // Фильтр по друзьям
        const friendsFilter = document.getElementById("lobby-players-filter-friends") as HTMLSelectElement;
        if (friendsFilter && friendsFilter.value !== "all") {
            if (friendsFilter.value === "friends") {
                filtered = filtered.filter(player => this.friendsList.has(player.id));
            } else if (friendsFilter.value === "not-friends") {
                const game = (window as any).gameInstance as any;
                const multiplayerManager = game?.multiplayerManager;
                const currentPlayerId = multiplayerManager?.getPlayerId();
                filtered = filtered.filter(player =>
                    player.id !== currentPlayerId && !this.friendsList.has(player.id)
                );
            }
        }

        // Сортировка
        const sortSelect = document.getElementById("lobby-players-sort") as HTMLSelectElement;
        if (sortSelect) {
            const sortValue = sortSelect.value;
            if (sortValue === "name-asc") {
                filtered.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sortValue === "name-desc") {
                filtered.sort((a, b) => b.name.localeCompare(a.name));
            } else if (sortValue === "activity-desc") {
                // Сортируем по активности (в комнате > в лобби)
                filtered.sort((a, b) => {
                    const aActive = a.isInRoom ? 1 : 0;
                    const bActive = b.isInRoom ? 1 : 0;
                    return bActive - aActive;
                });
            } else if (sortValue === "activity-asc") {
                filtered.sort((a, b) => {
                    const aActive = a.isInRoom ? 1 : 0;
                    const bActive = b.isInRoom ? 1 : 0;
                    return aActive - bActive;
                });
            } else if (sortValue === "level-desc") {
                // Сортируем по уровню (если доступен)
                filtered.sort((a, b) => {
                    const aLevel = a.level || 0;
                    const bLevel = b.level || 0;
                    return bLevel - aLevel;
                });
            } else if (sortValue === "level-asc") {
                filtered.sort((a, b) => {
                    const aLevel = a.level || 0;
                    const bLevel = b.level || 0;
                    return aLevel - bLevel;
                });
            }
        }

        // Сохраняем отфильтрованный список
        this.filteredLobbyPlayers = filtered;

        // Очищаем список
        playersList.innerHTML = "";

        if (filtered.length === 0) {
            if (playersEmpty) {
                playersEmpty.style.display = "block";
                playersEmpty.textContent = this.allLobbyPlayers.length === 0
                    ? "Нет игроков онлайн"
                    : "Нет игроков, соответствующих фильтрам";
            }
            return;
        }

        if (playersEmpty) {
            playersEmpty.style.display = "none";
        }

        // Группируем игроков
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        const currentPlayerId = multiplayerManager?.getPlayerId();
        const currentRoomId = multiplayerManager?.getRoomId();

        const friends = filtered.filter(p => this.friendsList.has(p.id));
        const inMyRoom = filtered.filter(p => p.roomId === currentRoomId && p.id !== currentPlayerId);
        const inOtherRooms = filtered.filter(p => p.isInRoom && p.roomId !== currentRoomId);
        const inLobby = filtered.filter(p => !p.isInRoom || !p.roomId);

        // Рендерим группы игроков
        let hasRendered = false;

        // Друзья
        if (friends.length > 0) {
            this.renderPlayerGroup(playersList, "⭐ Друзья", friends);
            hasRendered = true;
        }

        // Игроки в моей комнате
        if (inMyRoom.length > 0) {
            if (hasRendered) {
                this.renderGroupSeparator(playersList);
            }
            this.renderPlayerGroup(playersList, "🎮 В моей комнате", inMyRoom);
            hasRendered = true;
        }

        // Игроки в других комнатах
        if (inOtherRooms.length > 0) {
            if (hasRendered) {
                this.renderGroupSeparator(playersList);
            }
            this.renderPlayerGroup(playersList, "🏠 В других комнатах", inOtherRooms);
            hasRendered = true;
        }

        // Игроки в лобби
        if (inLobby.length > 0) {
            if (hasRendered) {
                this.renderGroupSeparator(playersList);
            }
            this.renderPlayerGroup(playersList, "💤 В лобби", inLobby);
        }
    }

    /**
     * Рендеринг разделителя группы
     */
    private renderGroupSeparator(container: HTMLElement): void {
        const separator = document.createElement("div");
        separator.style.cssText = "height: 1px; background: rgba(255, 255, 255, 0.1); margin: 8px 0;";
        container.appendChild(separator);
    }

    /**
     * Рендеринг группы игроков
     */
    private renderPlayerGroup(container: HTMLElement, groupTitle: string, players: any[]): void {
        // Заголовок группы
        const groupHeader = document.createElement("div");
        groupHeader.className = "lobby-group-header";
        groupHeader.textContent = `${groupTitle} (${players.length})`;
        container.appendChild(groupHeader);

        // Игроки группы
        players.forEach(player => {
            const playerItem = document.createElement("div");
            playerItem.className = "lobby-player-item";
            playerItem.dataset.playerId = player.id;

            const roomInfo = player.isInRoom && player.roomId
                ? `<span class="lobby-player-room">Комната ${player.roomId} (${player.roomMode?.toUpperCase() || 'N/A'})</span>`
                : `<span class="lobby-player-status">В лобби</span>`;

            const buttonsRow = [];

            if (player.isInRoom && player.roomId) {
                buttonsRow.push(`<button class="lobby-join-btn" data-player-id="${player.id}" data-room-id="${player.roomId}">ПРИСОЕДИНИТЬСЯ</button>`);
            }

            // Кнопка "Написать" для всех игроков
            buttonsRow.push(`<button class="lobby-message-btn" data-player-id="${player.id}" data-player-name="${player.name}">💬 НАПИСАТЬ</button>`);

            // Кнопка "Пригласить в команду" для всех игроков (кроме себя)
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            const currentPlayerId = multiplayerManager?.getPlayerId();
            if (player.id !== currentPlayerId) {
                buttonsRow.push(`<button class="lobby-invite-btn" data-player-id="${player.id}" data-player-name="${player.name}">👥 ПРИГЛАСИТЬ</button>`);
                // Кнопка "Добавить в друзья" для всех игроков (кроме себя)
                buttonsRow.push(`<button class="lobby-friend-btn" data-player-id="${player.id}" data-player-name="${player.name}">⭐ ДОБАВИТЬ</button>`);
            }

            const buttonsHtml = buttonsRow.length > 0 ? `<div class="lobby-player-buttons">${buttonsRow.join('')}</div>` : '';

            // Получаем расширенную информацию об игроке
            const level = player.level || 0;
            const kills = player.kills || 0;
            const deaths = player.deaths || 0;
            const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? kills.toFixed(0) : "0.00";
            const wins = player.wins || 0;
            const playTime = player.playTime || 0;
            const playTimeHours = Math.floor(playTime / 3600);
            const playTimeMinutes = Math.floor((playTime % 3600) / 60);
            const playTimeStr = playTimeHours > 0 ? `${playTimeHours}ч ${playTimeMinutes}м` : `${playTimeMinutes}м`;
            const rank = this.getPlayerRank(level, kills, deaths, wins);
            const chassisType = player.chassisType || "N/A";
            const cannonType = player.cannonType || "N/A";
            const ping = player.ping !== undefined ? `${player.ping}ms` : "N/A";
            const lastActive = player.lastActive ? this.formatRelativeTime(player.lastActive) : "Сейчас";

            // Определяем, является ли игрок другом
            const isFriend = this.friendsList.has(player.id);

            playerItem.innerHTML = `
                <div class="lobby-player-header">
                    <div class="lobby-player-name-row">
                        <div class="lobby-player-name">${player.name}${isFriend ? ' <span class="lobby-friend-badge">⭐</span>' : ''}</div>
                        <div class="lobby-player-level">LVL ${level}</div>
                    </div>
                    <div class="lobby-player-online-status">
                        <span class="lobby-status-dot"></span>
                        <span class="lobby-status-text">Онлайн</span>
                    </div>
                </div>
                <div class="lobby-player-stats-row">
                    <div class="lobby-player-stat">
                        <span class="lobby-stat-label">K/D:</span>
                        <span class="lobby-stat-value">${kd}</span>
                    </div>
                    <div class="lobby-player-stat">
                        <span class="lobby-stat-label">Победы:</span>
                        <span class="lobby-stat-value">${wins}</span>
                    </div>
                    <div class="lobby-player-stat">
                        <span class="lobby-stat-label">Ранг:</span>
                        <span class="lobby-stat-value lobby-rank-${rank.toLowerCase()}">${rank}</span>
                    </div>
                </div>
                <div class="lobby-player-info">
                    ${roomInfo}
                </div>
                <div class="lobby-player-details">
                    <div class="lobby-player-detail-item">
                        <span class="lobby-detail-label">Танк:</span>
                        <span class="lobby-detail-value">${chassisType} / ${cannonType}</span>
                    </div>
                    <div class="lobby-player-detail-item">
                        <span class="lobby-detail-label">Пинг:</span>
                        <span class="lobby-detail-value">${ping}</span>
                    </div>
                    <div class="lobby-player-detail-item">
                        <span class="lobby-detail-label">Время игры:</span>
                        <span class="lobby-detail-value">${playTimeStr}</span>
                    </div>
                    <div class="lobby-player-detail-item">
                        <span class="lobby-detail-label">Активность:</span>
                        <span class="lobby-detail-value">${lastActive}</span>
                    </div>
                </div>
                ${buttonsHtml}
            `;

            // Клик по кнопке присоединения
            if (player.isInRoom && player.roomId) {
                const joinBtn = playerItem.querySelector(".lobby-join-btn");
                if (joinBtn) {
                    joinBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.joinPlayerRoom(player.id, player.roomId);
                    });
                }

                // Также можно кликнуть по самому игроку
                playerItem.style.cursor = "pointer";
                playerItem.addEventListener("click", () => {
                    this.joinPlayerRoom(player.id, player.roomId);
                });
            }

            // Клик по кнопке "Написать"
            const messageBtn = playerItem.querySelector(".lobby-message-btn");
            if (messageBtn) {
                messageBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const playerId = messageBtn.getAttribute("data-player-id");
                    const playerName = messageBtn.getAttribute("data-player-name");
                    if (playerId && playerName) {
                        this.showMessageDialog(playerId, playerName);
                    }
                });
            }

            // Клик по кнопке "Пригласить в команду"
            const inviteBtn = playerItem.querySelector(".lobby-invite-btn");
            if (inviteBtn) {
                inviteBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const playerId = inviteBtn.getAttribute("data-player-id");
                    const playerName = inviteBtn.getAttribute("data-player-name");
                    if (playerId && playerName) {
                        this.invitePlayerToTeam(playerId, playerName);
                    }
                });
            }

            // Клик по кнопке "Добавить в друзья"
            const friendBtn = playerItem.querySelector(".lobby-friend-btn");
            if (friendBtn) {
                friendBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const playerId = friendBtn.getAttribute("data-player-id");
                    const playerName = friendBtn.getAttribute("data-player-name");
                    if (playerId && playerName) {
                        this.addPlayerToFriends(playerId, playerName);
                    }
                });
            }

            // Клик по карточке игрока - открыть профиль
            playerItem.addEventListener("click", (e) => {
                // Не открываем профиль если кликнули по кнопке
                if ((e.target as HTMLElement).closest("button")) {
                    return;
                }
                this.showPlayerProfile(player.id, player.name);
            });

            // Контекстное меню (правый клик)
            playerItem.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                // TODO: Implement context menu for player
                debugLog("[Menu] Context menu requested for player:", player.id, player.name);
            });

            container.appendChild(playerItem);
        });
    }

    /**
     * Обновление списка комнат в лобби
     */
    /**
     * Обновление списка комнат в лобби (публичный метод для обратной совместимости)
     * Теперь обновляет оба UI одновременно
     */
    updateLobbyRooms(rooms: any[]): void {
        this.updateAllRoomLists(rooms);
    }

    /**
     * Настройка фильтров и поиска комнат
     */
    private setupLobbyRoomFilters(): void {
        const searchInput = document.getElementById("lobby-rooms-search") as HTMLInputElement;
        const modeFilter = document.getElementById("lobby-rooms-filter-mode") as HTMLSelectElement;
        const statusFilter = document.getElementById("lobby-rooms-filter-status") as HTMLSelectElement;
        const sortSelect = document.getElementById("lobby-rooms-sort") as HTMLSelectElement;

        // Загружаем сохраненные настройки
        const savedSearch = localStorage.getItem("lobbyRoomsSearch");
        const savedModeFilter = localStorage.getItem("lobbyRoomsModeFilter");
        const savedStatusFilter = localStorage.getItem("lobbyRoomsStatusFilter");
        const savedSort = localStorage.getItem("lobbyRoomsSort");

        if (savedSearch && searchInput) {
            searchInput.value = savedSearch;
        }
        if (savedModeFilter && modeFilter) {
            modeFilter.value = savedModeFilter;
        }
        if (savedStatusFilter && statusFilter) {
            statusFilter.value = savedStatusFilter;
        }
        if (savedSort && sortSelect) {
            sortSelect.value = savedSort;
        }

        // Обработчики изменений
        const applyFilters = () => {
            this.applyLobbyRoomFilters();
        };

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                localStorage.setItem("lobbyRoomsSearch", searchInput.value);
                applyFilters();
            });
        }

        if (modeFilter) {
            modeFilter.addEventListener("change", () => {
                localStorage.setItem("lobbyRoomsModeFilter", modeFilter.value);
                applyFilters();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener("change", () => {
                localStorage.setItem("lobbyRoomsStatusFilter", statusFilter.value);
                applyFilters();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                localStorage.setItem("lobbyRoomsSort", sortSelect.value);
                applyFilters();
            });
        }
    }

    /**
     * Применение фильтров и сортировки к списку комнат
     */
    private applyLobbyRoomFilters(): void {
        const roomsList = document.getElementById("lobby-rooms-list");
        const roomsEmpty = document.getElementById("lobby-rooms-empty");

        if (!roomsList) return;

        // Начинаем с копии всех комнат (используем общий allRooms)
        let filtered = [...this.allRooms];

        // Поиск по ID
        const searchInput = document.getElementById("lobby-rooms-search") as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(room =>
                room.id.toLowerCase().includes(searchTerm) ||
                (room.name && room.name.toLowerCase().includes(searchTerm))
            );
        }

        // Фильтр по режиму
        const modeFilter = document.getElementById("lobby-rooms-filter-mode") as HTMLSelectElement;
        if (modeFilter && modeFilter.value !== "all") {
            filtered = filtered.filter(room => room.mode === modeFilter.value);
        }

        // Фильтр по статусу
        const statusFilter = document.getElementById("lobby-rooms-filter-status") as HTMLSelectElement;
        if (statusFilter && statusFilter.value !== "all") {
            if (statusFilter.value === "waiting") {
                filtered = filtered.filter(room => !room.isActive);
            } else if (statusFilter.value === "active") {
                filtered = filtered.filter(room => room.isActive);
            }
        }

        // Сортировка
        const sortSelect = document.getElementById("lobby-rooms-sort") as HTMLSelectElement;
        if (sortSelect) {
            const sortValue = sortSelect.value;
            if (sortValue === "players-desc") {
                filtered.sort((a, b) => b.players - a.players);
            } else if (sortValue === "players-asc") {
                filtered.sort((a, b) => a.players - b.players);
            } else if (sortValue === "time-desc") {
                filtered.sort((a, b) => (b.gameTime || 0) - (a.gameTime || 0));
            } else if (sortValue === "time-asc") {
                filtered.sort((a, b) => (a.gameTime || 0) - (b.gameTime || 0));
            } else if (sortValue === "mode-asc") {
                filtered.sort((a, b) => (a.mode || "").localeCompare(b.mode || ""));
            }
        }

        // Очищаем список
        roomsList.innerHTML = "";

        if (filtered.length === 0) {
            if (roomsEmpty) {
                roomsEmpty.style.display = "block";
                roomsEmpty.textContent = this.allRooms.length === 0
                    ? "Нет доступных комнат"
                    : "Нет комнат, соответствующих фильтрам";
            }
            return;
        }

        if (roomsEmpty) {
            roomsEmpty.style.display = "none";
        }

        // Убрано для уменьшения спама в логах
        // debugLog("[Menu] Отображаем", filtered.length, "из", this.allRooms.length, "комнат");

        // Рендерим отфильтрованные комнаты
        filtered.forEach(room => {
            const roomItem = document.createElement("div");
            roomItem.className = "lobby-room-item";
            roomItem.dataset.roomId = room.id;

            const isFull = room.players >= room.maxPlayers;
            const statusClass = room.isActive ? "active" : "";
            const statusText = room.isActive ? "Игра идет" : "Ожидание";
            const mapType = room.mapType || "N/A";
            const isPrivate = room.isPrivate || false;
            const hasPassword = room.password || false;
            const gameTime = room.gameTime ? this.formatGameTime(room.gameTime) : "0:00";

            roomItem.innerHTML = `
                <div class="lobby-room-header">
                    <span class="lobby-room-id">Комната ${room.id}</span>
                    <span class="lobby-room-mode">${room.mode?.toUpperCase() || 'N/A'}</span>
                </div>
                <div class="lobby-room-info">
                    <span class="lobby-room-players">${room.players}/${room.maxPlayers}</span>
                    <span class="lobby-room-status ${statusClass}">${statusText}</span>
                </div>
                <div class="lobby-room-details">
                    <div class="lobby-room-detail-item">
                        <span class="lobby-detail-label">Карта:</span>
                        <span class="lobby-detail-value">${mapType}</span>
                    </div>
                    ${room.isActive ? `<div class="lobby-room-detail-item">
                        <span class="lobby-detail-label">Время:</span>
                        <span class="lobby-detail-value">${gameTime}</span>
                    </div>` : ''}
                    ${isPrivate ? '<div class="lobby-room-badge lobby-room-private">🔒 Приватная</div>' : ''}
                    ${hasPassword ? '<div class="lobby-room-badge lobby-room-password">🔑 Пароль</div>' : ''}
                </div>
                ${!isFull ? `<button class="lobby-join-btn" data-room-id="${room.id}">ПРИСОЕДИНИТЬСЯ</button>` : '<div class="lobby-room-full">КОМНАТА ЗАПОЛНЕНА</div>'}
            `;

            // Клик по комнате - присоединение (если не полная)
            if (!isFull) {
                const joinBtn = roomItem.querySelector(".lobby-join-btn");
                if (joinBtn) {
                    joinBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.joinRoom(room.id);
                    });
                }

                // Также можно кликнуть по самой комнате
                roomItem.style.cursor = "pointer";
            } else {
                roomItem.style.opacity = "0.5";
                roomItem.style.cursor = "not-allowed";
            }

            roomsList.appendChild(roomItem);
        });
    }

    /**
     * Форматирование времени игры
     */
    private formatGameTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Присоединение к комнате игрока
     */
    joinPlayerRoom(playerId: string, roomId: string | null): void {
        if (!roomId) {
            debugWarn(`[Menu] Игрок ${playerId} не в комнате`);
            return;
        }

        this.joinRoom(roomId);
    }

    /**
     * Показать диалог отправки сообщения игроку (без prompt/alert - используем встроенный UI)
     */
    showMessageDialog(playerId: string, playerName: string): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager) {
            if (game?.chatSystem) {
                game.chatSystem.addMessage("❌ MultiplayerManager не найден", "error", 1);
            }
            return;
        }

        if (!multiplayerManager.isConnected()) {
            if (game?.chatSystem) {
                game.chatSystem.addMessage("❌ Не подключено к серверу", "error", 1);
            }
            return;
        }

        // Создаем встроенное модальное окно для ввода сообщения (вместо prompt)
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
                <div style="font-size: 18px; color: #0f0; margin-bottom: 10px;">💬 Отправить сообщение игроку ${playerName}</div>
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

        // Фокус на поле ввода
        if (input) {
            input.focus();
        }

        // Отправка по Enter (Ctrl+Enter для новой строки)
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    sendBtn?.click();
                }
            });
        }

        // Обработчик отправки
        if (sendBtn) {
            sendBtn.onclick = () => {
                const message = input?.value.trim() || "";
                if (message === "") {
                    modal.remove();
                    return;
                }

                // Отправляем через общий чат с упоминанием игрока
                const chatMessage = `@${playerName} ${message}`;

                try {
                    multiplayerManager.sendChatMessage(chatMessage);
                    debugLog(`[Menu] Сообщение отправлено игроку ${playerName}: ${message}`);

                    // Показываем уведомление
                    if (game?.chatSystem) {
                        game.chatSystem.addMessage(`📤 Сообщение отправлено ${playerName}: "${message}"`, "success", 1);
                    }
                } catch (error) {
                    console.error("[Menu] Ошибка при отправке сообщения:", error);
                    if (game?.chatSystem) {
                        game.chatSystem.addMessage(`❌ Ошибка при отправке сообщения: ${error}`, "error", 1);
                    }
                }

                modal.remove();
            };
        }

        // Обработчик отмены
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.remove();
            };
        }

        // Закрытие по клику вне модального окна
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Закрытие по Escape
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                modal.remove();
                document.removeEventListener("keydown", escapeHandler);
            }
        };
        document.addEventListener("keydown", escapeHandler);
    }

    /**
     * Пригласить игрока в команду/комнату
     */
    async invitePlayerToTeam(playerId: string, playerName: string): Promise<void> {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager) {
            alert("MultiplayerManager не найден");
            return;
        }

        if (!multiplayerManager.isConnected()) {
            alert("Не подключено к серверу");
            return;
        }

        let currentRoomId = multiplayerManager.getRoomId();
        let gameMode = multiplayerManager.getGameMode() || "ffa";

        try {
            // Если мы не в комнате, автоматически создаем комнату
            if (!currentRoomId) {
                debugLog(`[Menu] 🏠 Автоматическое создание комнаты для приглашения ${playerName}...`);

                // Показываем уведомление о создании комнаты
                this.showMultiplayerNotification(`Создание комнаты для игры с ${playerName}...`, "#4ade80");

                // Создаем комнату с режимом по умолчанию (FFA)
                await this.createMultiplayerRoom(gameMode);

                // Ждем создания комнаты (максимум 3 секунды)
                let attempts = 0;
                const maxAttempts = 30; // 30 попыток по 100мс = 3 секунды

                while (!currentRoomId && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    currentRoomId = multiplayerManager.getRoomId();
                    attempts++;
                }

                if (!currentRoomId) {
                    alert("Не удалось создать комнату. Попробуйте еще раз.");
                    return;
                }

                debugLog(`[Menu] ✅ Комната создана: ${currentRoomId}`);
                this.showMultiplayerNotification(`Комната создана! Отправка приглашения...`, "#4ade80");
            }

            // Отправляем приглашение с ID комнаты
            debugLog(`[Menu] 👥 Приглашение игрока ${playerName} в комнату ${currentRoomId}`);
            multiplayerManager.sendGameInvite(playerId, gameMode);

            // Показываем уведомление
            if (game?.chatSystem) {
                game.chatSystem.addMessage(`👥 Приглашение отправлено ${playerName} в комнату ${currentRoomId}`, "success", 1);
            }
            this.showMultiplayerNotification(`Приглашение отправлено игроку ${playerName}!`, "#4ade80");

        } catch (error) {
            console.error("[Menu] Ошибка при отправке приглашения:", error);
            alert("Ошибка при отправке приглашения");
        }
    }

    /**
     * Добавить игрока в друзья
     */
    /**
     * Загрузка списка друзей из localStorage
     */
    private loadFriendsList(): void {
        try {
            const saved = localStorage.getItem("lobbyFriendsList");
            if (saved) {
                const friends = JSON.parse(saved);
                this.friendsList = new Set(friends);
                debugLog(`[Menu] Загружено ${this.friendsList.size} друзей из localStorage`);
            }
        } catch (error) {
            console.error("[Menu] Ошибка загрузки списка друзей:", error);
            this.friendsList = new Set();
        }
    }

    /**
     * Сохранение списка друзей в localStorage
     */
    private saveFriendsList(): void {
        try {
            const friends = Array.from(this.friendsList);
            localStorage.setItem("lobbyFriendsList", JSON.stringify(friends));
        } catch (error) {
            console.error("[Menu] Ошибка сохранения списка друзей:", error);
        }
    }

    async addPlayerToFriends(playerId: string, playerName: string): Promise<void> {
        const game = (window as any).gameInstance as any;

        // Проверяем, есть ли SocialSystem
        let socialSystem = game?.socialSystem;
        if (!socialSystem) {
            // Пытаемся импортировать и создать SocialSystem
            try {
                const { SocialSystem } = await import("./socialSystem");
                socialSystem = new SocialSystem();
                await socialSystem.initialize();
                game.socialSystem = socialSystem;
            } catch (error) {
                console.error("[Menu] Ошибка при создании SocialSystem:", error);
                alert("Система друзей недоступна. Проверьте подключение к Firebase.");
                return;
            }
        }

        try {
            debugLog(`[Menu] Отправка запроса на добавление в друзья игроку ${playerName} (${playerId})`);
            const success = await socialSystem.sendFriendRequest(playerId, playerName);

            if (success) {
                // Добавляем в локальный список друзей (для фильтрации)
                this.friendsList.add(playerId);
                this.saveFriendsList();

                // Показываем уведомление
                if (game?.chatSystem) {
                    game.chatSystem.addMessage(`⭐ Запрос на добавление в друзья отправлен ${playerName}`, "success", 1);
                }
                alert(`Запрос на добавление в друзья отправлен игроку ${playerName}!`);

                // Обновляем кнопку (можно добавить визуальную индикацию)
                const friendBtn = document.querySelector(`.lobby-friend-btn[data-player-id="${playerId}"]`);
                if (friendBtn) {
                    friendBtn.classList.add("added");
                    (friendBtn as HTMLElement).textContent = "⭐ ОТПРАВЛЕНО";
                    (friendBtn as HTMLElement).style.pointerEvents = "none";
                }

                // Обновляем фильтры, если они активны
                this.applyLobbyPlayerFilters();
            } else {
                alert("Не удалось отправить запрос на добавление в друзья. Возможно, запрос уже отправлен или игрок уже в друзьях.");
            }
        } catch (error) {
            console.error("[Menu] Ошибка при добавлении в друзья:", error);
            alert("Ошибка при отправке запроса на добавление в друзья");
        }
    }

    /**
     * Присоединение к комнате
     */
    joinRoom(roomId: string): void {
        // КРИТИЧНО: НЕ очищаем custom map данные при входе в мультиплеер, если хотим их использовать
        // localStorage.removeItem("selectedCustomMapData");
        // localStorage.removeItem("selectedCustomMapIndex");
        debugLog("[Menu] 🗺️ Custom map data preserved for multiplayer (joinRoom)");

        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager) {
            debugLog("[Menu] MultiplayerManager не готов, ожидаем...");
            return;
        }

        if (!multiplayerManager.isConnected()) {
            debugLog("[Menu] Ожидаем подключения к серверу...");
            return;
        }

        debugLog(`[Menu] Присоединение к комнате ${roomId}`);

        // Находим информацию о комнате из списка
        const room = this.allRooms.find(r => r.id === roomId);

        // Устанавливаем callback для показа панели комнаты после присоединения
        multiplayerManager.onRoomJoined((data: any) => {
            debugLog("[Menu] Room joined:", data);

            // Обновляем панель комнаты с данными из комнаты
            this.updateRoomPanel(
                data.roomId || roomId,
                data.mode || room?.mode || "ffa",
                data.mapType || room?.mapType || "normal"
            );

            // Скрываем модальное окно деталей (если открыто)
            this.hideRoomDetails();

            // Скрываем все play-окна
            this.hideAllPlayWindows();

            // Показываем панель комнаты
            this.showPlayWindow("mp-room-panel", 3, 3);

            // Скрываем настройки для не-хоста, но кнопка видна с другим текстом
            const isHost = multiplayerManager.isRoomCreator ? multiplayerManager.isRoomCreator() : false;
            const settingsSection = document.getElementById("mp-room-panel-settings");
            const controlsSection = document.getElementById("mp-room-panel-controls");
            const hostOnlyElements = document.querySelectorAll(".mp-room-host-only");

            if (settingsSection) {
                (settingsSection as HTMLElement).style.display = isHost ? "block" : "none";
            }
            if (controlsSection) {
                (controlsSection as HTMLElement).style.display = isHost ? "block" : "none";
            }
            hostOnlyElements.forEach(el => {
                (el as HTMLElement).style.display = isHost ? "block" : "none";
            });

            // Кнопка видна всем с разным текстом
            const startBtnEl = document.getElementById("mp-room-panel-start-game");
            if (startBtnEl) {
                const btnTextEl = startBtnEl.querySelector(".battle-btn-text");
                if (btnTextEl) {
                    btnTextEl.textContent = isHost ? "⚔️ НАЧАТЬ ИГРУ" : "⚔️ В БОЙ!";
                }
                (startBtnEl as HTMLElement).style.display = "block";
            }

            debugLog("[Menu] Room panel shown for joined room:", data.roomId || roomId, "isHost:", isHost);
        });

        // Присоединяемся к комнате
        multiplayerManager.joinRoom(roomId);
    }

    /**
     * Настройка обработчиков для лобби
     */
    private setupLobbyHandlers(): void {
        // Обработчики для вкладок
        const playersTab = document.getElementById("lobby-tab-players");
        const roomsTab = document.getElementById("lobby-tab-rooms");
        const refreshBtn = document.getElementById("lobby-refresh-btn");

        if (playersTab) {
            playersTab.addEventListener("click", () => {
                this.switchLobbyTab("players");
            });
        }

        if (roomsTab) {
            roomsTab.addEventListener("click", () => {
                this.switchLobbyTab("rooms");
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                this.refreshLobbyData();
            });
        }

        // Обработчик переключателя автообновления
        const autoRefreshToggle = document.getElementById("lobby-auto-refresh-toggle");
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener("click", () => {
                this.toggleLobbyAutoRefresh();
            });
        }

        // Настройка фильтров и поиска игроков
        this.setupLobbyPlayerFilters();

        // Настройка фильтров и поиска комнат
        this.setupLobbyRoomFilters();

        // Настройка горячих клавиш для лобби
        this.setupLobbyHotkeys();

        // Настройка кнопки сворачивания
        this.setupLobbyToggle();

        // Настройка чата
        this.setupLobbyChat();
    }

    /**
     * Переключение вкладок лобби
     */
    private switchLobbyTab(tab: "players" | "rooms"): void {
        const playersTab = document.getElementById("lobby-tab-players");
        const roomsTab = document.getElementById("lobby-tab-rooms");
        const playersTabContent = document.getElementById("lobby-players-tab");
        const roomsTabContent = document.getElementById("lobby-rooms-tab");

        if (tab === "players") {
            if (playersTab) playersTab.classList.add("active");
            if (roomsTab) roomsTab.classList.remove("active");
            if (playersTabContent) playersTabContent.classList.add("active");
            if (roomsTabContent) roomsTabContent.classList.remove("active");
        } else {
            if (playersTab) playersTab.classList.remove("active");
            if (roomsTab) roomsTab.classList.add("active");
            if (playersTabContent) playersTabContent.classList.remove("active");
            if (roomsTabContent) roomsTabContent.classList.add("active");
        }
    }

    /**
     * Настройка горячих клавиш для лобби
     */
    private setupLobbyHotkeys(): void {
        document.addEventListener("keydown", (e) => {
            const lobbyPanel = document.getElementById("lobby-panel");
            if (!lobbyPanel || lobbyPanel.offsetParent === null) {
                return; // Лобби не видно
            }

            // Ctrl+R или F5 - обновить лобби
            if ((e.ctrlKey && e.key === "r") || e.key === "F5") {
                e.preventDefault();
                this.refreshLobbyData();
            }

            // Ctrl+F - фокус на поиск
            if (e.ctrlKey && e.key === "f") {
                e.preventDefault();
                const activeTab = document.querySelector(".lobby-tab.active");
                if (activeTab && activeTab.id === "lobby-tab-players") {
                    const searchInput = document.getElementById("lobby-players-search") as HTMLInputElement;
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    }
                } else if (activeTab && activeTab.id === "lobby-tab-rooms") {
                    const searchInput = document.getElementById("lobby-rooms-search") as HTMLInputElement;
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    }
                }
            }
        });
    }

    /**
     * Настройка кнопки сворачивания лобби
     */
    private setupLobbyToggle(): void {
        const toggleBtn = document.getElementById("lobby-toggle-btn");
        const lobbyPanel = document.getElementById("lobby-panel");

        if (!toggleBtn || !lobbyPanel) {
            debugWarn("[Menu] Не найдены элементы для сворачивания лобби");
            return;
        }

        const menuContent = document.querySelector(".menu-content");

        // Загружаем состояние из localStorage (по умолчанию - закрыто)
        const savedState = localStorage.getItem("lobbyCollapsed");
        const isCollapsed = savedState !== "false"; // По умолчанию закрыто (если не было явно открыто)

        // Отключаем анимацию при первой загрузке
        lobbyPanel.style.transition = "none";
        if (menuContent) (menuContent as HTMLElement).style.transition = "none";

        if (isCollapsed) {
            lobbyPanel.classList.add("collapsed");
            toggleBtn.textContent = "▶";
            if (menuContent) menuContent.classList.remove("lobby-open");
        } else {
            lobbyPanel.classList.remove("collapsed");
            toggleBtn.textContent = "◀";
            if (menuContent) menuContent.classList.add("lobby-open");
        }

        // Включаем анимацию обратно после отрисовки
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                lobbyPanel.style.transition = "";
                if (menuContent) (menuContent as HTMLElement).style.transition = "";
            });
        });

        // Удаляем старые обработчики
        const newToggleBtn = toggleBtn.cloneNode(true) as HTMLElement;
        toggleBtn.parentNode?.replaceChild(newToggleBtn, toggleBtn);

        // Клик по кнопке сворачивания
        newToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleLobbyPanel();
        });

        // Клик по свёрнутой панели - развернуть
        lobbyPanel.addEventListener("click", (e) => {
            if (lobbyPanel.classList.contains("collapsed")) {
                e.stopPropagation();
                this.toggleLobbyPanel();
            }
        });
    }

    /**
     * Переключение состояния панели лобби
     */
    private toggleLobbyPanel(): void {
        const panel = document.getElementById("lobby-panel");
        const toggleBtn = document.getElementById("lobby-toggle-btn");
        const menuContent = document.querySelector(".menu-content");
        if (!panel) return;

        const isCollapsed = panel.classList.contains("collapsed");

        if (isCollapsed) {
            panel.classList.remove("collapsed");
            if (toggleBtn) toggleBtn.textContent = "◀";
            if (menuContent) menuContent.classList.add("lobby-open");
            localStorage.setItem("lobbyCollapsed", "false");
            debugLog("[Menu] Лобби развернуто");
        } else {
            panel.classList.add("collapsed");
            if (toggleBtn) toggleBtn.textContent = "▶";
            if (menuContent) menuContent.classList.remove("lobby-open");
            localStorage.setItem("lobbyCollapsed", "true");
            debugLog("[Menu] Лобби свернуто");
        }
    }

    /**
     * Настройка общего чата лобби
     */
    private setupLobbyChat(): void {
        const chatToggle = document.getElementById("lobby-chat-toggle");
        const chatContainer = document.getElementById("lobby-chat");
        const chatInput = document.getElementById("lobby-chat-input") as HTMLInputElement;
        const chatSend = document.getElementById("lobby-chat-send");
        const chatMessages = document.getElementById("lobby-chat-messages");

        // Загрузка состояния свернутости из localStorage
        const chatCollapsed = localStorage.getItem("lobbyChatCollapsed") === "true";
        if (chatCollapsed && chatContainer) {
            chatContainer.classList.add("collapsed");
        }

        // Сворачивание/разворачивание чата
        if (chatToggle && chatContainer) {
            chatToggle.addEventListener("click", () => {
                chatContainer.classList.toggle("collapsed");
                const isCollapsed = chatContainer.classList.contains("collapsed");
                localStorage.setItem("lobbyChatCollapsed", isCollapsed ? "true" : "false");
            });
        }

        // Отправка сообщения
        const sendMessage = () => {
            if (!chatInput || !chatMessages) return;

            const message = chatInput.value.trim();
            if (!message) return;

            // Получаем MultiplayerManager из глобального объекта game
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;

            if (multiplayerManager && multiplayerManager.isConnected()) {
                // Показываем сообщение локально сразу
                const playerId = multiplayerManager.getPlayerId() || "";
                const playerName = multiplayerManager.getPlayerName() || "Вы";
                this.addLobbyChatMessage(playerId, playerName, message, Date.now());

                // Отправляем на сервер
                multiplayerManager.sendLobbyChatMessage(message);
            }

            chatInput.value = "";
        };

        if (chatSend) {
            chatSend.addEventListener("click", sendMessage);
        }

        if (chatInput) {
            chatInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    sendMessage();
                }
            });
        }
    }

    /**
     * Добавить сообщение в чат лобби
     */
    addLobbyChatMessage(playerId: string, playerName: string, message: string, timestamp: number): void {
        const chatMessages = document.getElementById("lobby-chat-messages");
        if (!chatMessages) return;

        // Удаляем приветственное сообщение если это первое сообщение
        const welcomeMsg = chatMessages.querySelector(".lobby-chat-welcome");
        if (welcomeMsg) {
            welcomeMsg.remove();
        }

        const time = new Date(timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        const isSelf = multiplayerManager && multiplayerManager.getPlayerId() === playerId;

        const msgEl = document.createElement("div");
        msgEl.className = "lobby-chat-message";
        msgEl.innerHTML = `
            <span class="lobby-chat-time">${time}</span>
            <span class="lobby-chat-sender ${isSelf ? "self" : ""}">${this.escapeHtml(playerName)}:</span>
            <span class="lobby-chat-text">${this.escapeHtml(message)}</span>
        `;

        chatMessages.appendChild(msgEl);

        // Прокрутка вниз
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Ограничение количества сообщений (макс 50)
        while (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild as Node);
        }
    }

    /**
     * Экранирование HTML
     */
    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Настройка чата мультиплеера
     */
    setupMultiplayerChat(multiplayerManager: any): void {
        if (!multiplayerManager) return;

        const chatInput = document.getElementById("mp-chat-input") as HTMLInputElement;
        const chatSendBtn = document.getElementById("mp-chat-send") as HTMLButtonElement;
        const chatMessages = document.getElementById("mp-chat-messages");
        const chatToggle = document.getElementById("mp-chat-toggle");
        let chatExpanded = true;

        // Toggle chat
        if (chatToggle) {
            chatToggle.addEventListener("click", () => {
                chatExpanded = !chatExpanded;
                const messagesContainer = document.getElementById("mp-chat-messages");
                if (messagesContainer) {
                    if (chatExpanded) {
                        messagesContainer.style.display = "block";
                        chatToggle.textContent = "▲";
                    } else {
                        messagesContainer.style.display = "none";
                        chatToggle.textContent = "▼";
                    }
                }
            });
        }

        // Send message
        const sendMessage = () => {
            if (!chatInput || !multiplayerManager.isConnected()) return;

            const message = chatInput.value.trim();
            if (message === "") return;

            try {
                multiplayerManager.sendChatMessage(message);
                chatInput.value = "";

                // Показываем отправленное сообщение
                this.addChatMessage("Вы", message, true);
            } catch (error) {
                console.error("[Menu] Ошибка отправки сообщения:", error);
            }
        };

        if (chatSendBtn) {
            chatSendBtn.addEventListener("click", sendMessage);
        }

        if (chatInput) {
            chatInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        // Настраиваем callback для входящих сообщений
        multiplayerManager.onChatMessage((data: any) => {
            if (data && data.playerName && data.message) {
                this.addChatMessage(data.playerName, data.message, false);
                // Также добавляем в чат лобби
                this.addLobbyChatMessage(data.playerId || "", data.playerName, data.message, data.timestamp || Date.now());
            }
        });
    }

    /**
     * Добавить сообщение в чат
     */
    private addChatMessage(playerName: string, message: string, isOwn: boolean): void {
        const chatMessages = document.getElementById("mp-chat-messages");
        if (!chatMessages) return;

        // Удаляем placeholder если есть
        const placeholder = chatMessages.querySelector("div[style*='text-align: center']");
        if (placeholder) placeholder.remove();

        const messageDiv = document.createElement("div");
        messageDiv.style.cssText = `
            padding: 6px 8px;
            margin-bottom: 4px;
            background: ${isOwn ? "rgba(0, 255, 4, 0.1)" : "rgba(0, 0, 0, 0.2)"};
            border-left: 2px solid ${isOwn ? "#0f0" : "rgba(0, 255, 4, 0.4)"};
            border-radius: 4px;
            word-wrap: break-word;
            line-height: 1.4;
        `;

        const nameSpan = document.createElement("span");
        nameSpan.style.cssText = `color: ${isOwn ? "#0f0" : "#4ade80"}; font-weight: 600; margin-right: 6px;`;
        nameSpan.textContent = `${playerName}:`;

        const textSpan = document.createElement("span");
        textSpan.style.cssText = "color: #aaa;";
        textSpan.textContent = message;

        messageDiv.appendChild(nameSpan);
        messageDiv.appendChild(textSpan);
        chatMessages.appendChild(messageDiv);

        // Автопрокрутка
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Также показываем в System Terminal
        const game = (window as any).gameInstance as any;
        if (game?.chatSystem) {
            game.chatSystem.addMessage(`${playerName}: ${message}`, "info", 0);
        }
    }

    /**
     * Настройка callbacks для лобби
     */
    private _lobbyCallbackRetries: number = 0;

    setupLobbyCallbacks(): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager) {
            this._lobbyCallbackRetries++;
            // Логируем только первую попытку, остальные молча
            if (this._lobbyCallbackRetries === 1) {
                // debugLog("[Menu] 🔧 MultiplayerManager ещё не создан, ожидаем...");
            }
            // Попробуем позже (максимум 10 попыток)
            if (this._lobbyCallbackRetries < 10) {
                setTimeout(() => this.setupLobbyCallbacks(), 1000);
            }
            return;
        }

        // Сбрасываем счётчик при успехе
        this._lobbyCallbackRetries = 0;

        const isConnected = multiplayerManager.isConnected();
        // debugLog("[Menu] ✅ MultiplayerManager найден, подключен:", isConnected);

        // Настраиваем callback для списка игроков (логирование отключено для уменьшения спама)
        multiplayerManager.onOnlinePlayersList((data: { players?: any[] }) => {
            this.updateLobbyPlayers(data.players || []);
        });

        // Настраиваем callback для списка комнат (обновляет оба UI одновременно)
        multiplayerManager.onRoomList((rooms: any[]) => {
            // Убрано для уменьшения спама в логах
            // debugLog("[Menu] ✅ Получен список комнат для лобби:", rooms.length, "комнат");
            // Обновляем оба UI одновременно
            this.updateAllRoomLists(rooms);
        });

        // Настраиваем callback для сообщений чата
        multiplayerManager.onChatMessage((data: any) => {
            if (data && data.playerName && data.message) {
                // Не добавляем сообщение если это наше собственное (уже добавлено локально)
                const currentPlayerId = multiplayerManager.getPlayerId?.() || "";
                if (data.playerId !== currentPlayerId) {
                    this.addLobbyChatMessage(data.playerId || "", data.playerName, data.message, data.timestamp || Date.now());
                }
            }
        });

        // Функция для запроса списка игроков
        const requestPlayers = () => {
            if (multiplayerManager.isConnected()) {
                // debugLog("[Menu] 📡 Запрос списка игроков для лобби...");
                try {
                    multiplayerManager.getOnlinePlayers();
                    // debugLog("[Menu] ✅ Запрос отправлен успешно");
                } catch (error) {
                    console.error("[Menu] ❌ Ошибка при отправке запроса:", error);
                }
            } else {
                // debugWarn("[Menu] ⚠️ MultiplayerManager не подключен, ожидание подключения...");
            }
        };

        // Запрашиваем список игроков сразу, если подключен
        if (isConnected) {
            // debugLog("[Menu] 🚀 Подключен, запрашиваем список игроков сразу");
            requestPlayers();
        } else {
            // debugLog("[Menu] ⏳ Не подключен, ждем подключения...");
            // Если не подключен, ждем подключения
            let attempts = 0;
            const maxAttempts = 20; // 10 секунд (20 * 500ms)
            const checkConnection = setInterval(() => {
                attempts++;
                if (multiplayerManager.isConnected()) {
                    // debugLog("[Menu] ✅ MultiplayerManager подключен, запрашиваем список игроков");
                    requestPlayers();
                    clearInterval(checkConnection);
                } else if (attempts >= maxAttempts) {
                    // debugWarn("[Menu] ⚠️ Превышено время ожидания подключения");
                    clearInterval(checkConnection);
                } else {
                    // Only log every 5 attempts to reduce spam
                    if (attempts % 5 === 0) {
                        // debugLog(`[Menu] ⏳ Ожидание подключения... (попытка ${attempts}/${maxAttempts})`);
                    }
                }
            }, 500);
        }

        // Настраиваем умное автообновление
        this.setupLobbyAutoRefresh(multiplayerManager);

        // Настраиваем отслеживание видимости панели
        this.setupLobbyVisibilityObserver();
    }

    /**
     * Настройка умного автообновления лобби
     */
    private setupLobbyAutoRefresh(multiplayerManager: any): void {
        // Останавливаем предыдущий интервал если есть
        if (this.lobbyAutoRefreshInterval !== null) {
            clearInterval(this.lobbyAutoRefreshInterval);
            this.lobbyAutoRefreshInterval = null;
        }

        // Загружаем настройки из localStorage
        const savedAutoRefresh = localStorage.getItem("lobbyAutoRefreshEnabled");
        if (savedAutoRefresh !== null) {
            this.lobbyAutoRefreshEnabled = savedAutoRefresh === "true";
        }

        const savedInterval = localStorage.getItem("lobbyAutoRefreshInterval");
        if (savedInterval !== null) {
            const interval = parseInt(savedInterval, 10);
            if (interval >= 5000 && interval <= 30000) {
                this.lobbyAutoRefreshIntervalMs = interval;
            }
        }

        // Обновляем UI переключателя
        this.updateLobbyAutoRefreshUI();

        // Запускаем автообновление если включено
        if (this.lobbyAutoRefreshEnabled) {
            this.startLobbyAutoRefresh(multiplayerManager);
        }
    }

    /**
     * Запуск автообновления лобби
     */
    private startLobbyAutoRefresh(multiplayerManager: any): void {
        if (this.lobbyAutoRefreshInterval !== null) {
            return; // Уже запущено
        }

        this.lobbyAutoRefreshInterval = window.setInterval(() => {
            // Проверяем видимость меню и панели лобби
            const isMenuVisible = this.container &&
                !this.container.classList.contains("hidden") &&
                this.container.style.display !== "none";

            const lobbyPanel = document.getElementById("lobby-panel");
            const isLobbyVisible = lobbyPanel &&
                lobbyPanel.offsetParent !== null &&
                !lobbyPanel.classList.contains("hidden") &&
                lobbyPanel.style.display !== "none";

            if (!isMenuVisible || !isLobbyVisible) {
                // debugLog("[Menu] ⏸️ Пропуск автообновления - меню или лобби не видно");
                return;
            }

            if (multiplayerManager.isConnected()) {
                // debugLog("[Menu] 🔄 Автоматическое обновление лобби");
                this.refreshLobbyData(multiplayerManager);
            } else {
                // debugWarn("[Menu] ⚠️ Пропуск автообновления - не подключен");
            }
        }, this.lobbyAutoRefreshIntervalMs);

        // debugLog(`[Menu] ✅ Автообновление лобби запущено (интервал: ${this.lobbyAutoRefreshIntervalMs}ms)`);
    }

    /**
     * Остановка автообновления лобби
     */
    private stopLobbyAutoRefresh(): void {
        if (this.lobbyAutoRefreshInterval !== null) {
            clearInterval(this.lobbyAutoRefreshInterval);
            this.lobbyAutoRefreshInterval = null;
            // debugLog("[Menu] ⏸️ Автообновление лобби остановлено");
        }
    }

    /**
     * Переключение автообновления
     */
    private toggleLobbyAutoRefresh(): void {
        this.lobbyAutoRefreshEnabled = !this.lobbyAutoRefreshEnabled;
        localStorage.setItem("lobbyAutoRefreshEnabled", this.lobbyAutoRefreshEnabled.toString());

        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (this.lobbyAutoRefreshEnabled) {
            this.startLobbyAutoRefresh(multiplayerManager);
        } else {
            this.stopLobbyAutoRefresh();
        }

        this.updateLobbyAutoRefreshUI();
    }

    /**
     * Обновление UI переключателя автообновления
     */
    private updateLobbyAutoRefreshUI(): void {
        const toggle = document.getElementById("lobby-auto-refresh-toggle");
        if (toggle) {
            if (this.lobbyAutoRefreshEnabled) {
                toggle.classList.remove("disabled");
                toggle.title = `Автообновление: ВКЛ (${this.lobbyAutoRefreshIntervalMs / 1000}с)`;
            } else {
                toggle.classList.add("disabled");
                toggle.title = "Автообновление: ВЫКЛ";
            }
        }
    }

    /**
     * Настройка отслеживания видимости панели лобби
     */
    private setupLobbyVisibilityObserver(): void {
        const lobbyPanel = document.getElementById("lobby-panel");
        if (!lobbyPanel) return;

        // Используем IntersectionObserver для отслеживания видимости
        if (typeof IntersectionObserver !== "undefined") {
            this.lobbyVisibilityObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting && this.lobbyAutoRefreshInterval !== null) {
                        // debugLog("[Menu] 👁️ Панель лобби скрыта, автообновление приостановлено");
                    }
                });
            }, {
                threshold: 0.1
            });

            this.lobbyVisibilityObserver.observe(lobbyPanel);
        }
    }

    /**
     * Обновление данных лобби (игроки и комнаты)
     */
    private refreshLobbyData(multiplayerManager?: any): void {
        const game = (window as any).gameInstance as any;
        const mm = multiplayerManager || game?.multiplayerManager;

        if (!mm || !mm.isConnected()) {
            debugWarn("[Menu] ⚠️ Не могу обновить - MultiplayerManager не подключен");
            this.updateLastUpdateTime(false);
            return;
        }

        // debugLog("[Menu] 🔄 Ручное обновление данных лобби");
        mm.getOnlinePlayers();
        mm.requestRoomList();
        this.updateLastUpdateTime(true);
    }

    /**
     * Обновление времени последнего обновления
     */
    private updateLastUpdateTime(success: boolean): void {
        this.lobbyLastUpdateTime = Date.now();
        const lastUpdateEl = document.getElementById("lobby-last-update");

        if (lastUpdateEl) {
            if (success) {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                lastUpdateEl.textContent = `Обновлено: ${timeStr}`;
                lastUpdateEl.style.color = "#0f0";
            } else {
                lastUpdateEl.textContent = "Ошибка обновления";
                lastUpdateEl.style.color = "#f00";
            }
        }

        // Обновляем каждую секунду для показа относительного времени
        if (success) {
            setTimeout(() => this.updateRelativeTime(), 1000);
        }
    }

    /**
     * Обновление относительного времени последнего обновления
     */
    private updateRelativeTime(): void {
        const lastUpdateEl = document.getElementById("lobby-last-update");
        if (!lastUpdateEl || this.lobbyLastUpdateTime === 0) return;

        const elapsed = Math.floor((Date.now() - this.lobbyLastUpdateTime) / 1000);

        if (elapsed < 60) {
            lastUpdateEl.textContent = `Обновлено: ${elapsed}с назад`;
        } else if (elapsed < 3600) {
            const minutes = Math.floor(elapsed / 60);
            lastUpdateEl.textContent = `Обновлено: ${minutes}м назад`;
        } else {
            const hours = Math.floor(elapsed / 3600);
            lastUpdateEl.textContent = `Обновлено: ${hours}ч назад`;
        }

        // Обновляем каждые 5 секунд
        if (this.lobbyAutoRefreshEnabled) {
            setTimeout(() => this.updateRelativeTime(), 5000);
        }
    }

    /**
     * Показать детальное меню выбранной комнаты
     */
    showRoomDetails(room: any): void {
        const modal = document.getElementById("mp-room-details-modal");
        if (!modal) {
            debugWarn("[Menu] ⚠️ Модальное окно деталей комнаты не найдено");
            return;
        }

        // Заполняем информацию о комнате
        const roomIdEl = document.getElementById("mp-room-details-id");
        const roomModeEl = document.getElementById("mp-room-details-mode");
        const roomPlayersEl = document.getElementById("mp-room-details-players");
        const roomStatusEl = document.getElementById("mp-room-details-status");
        const roomTimeEl = document.getElementById("mp-room-details-time");
        const progressBarEl = document.getElementById("mp-room-details-progress-bar");
        const progressTextEl = document.getElementById("mp-room-details-progress-text");

        if (roomIdEl) roomIdEl.textContent = room.id;
        if (roomModeEl) roomModeEl.textContent = room.mode.toUpperCase();
        if (roomPlayersEl) roomPlayersEl.textContent = `${room.players}/${room.maxPlayers}`;

        // Статус
        if (roomStatusEl) {
            if (room.isActive) {
                roomStatusEl.textContent = "Игра идет";
                roomStatusEl.style.color = "#4ade80";
            } else {
                roomStatusEl.textContent = "Ожидание";
                roomStatusEl.style.color = "#a78bfa";
            }
        }

        // Время игры
        if (roomTimeEl) {
            if (room.isActive && room.gameTime) {
                const minutes = Math.floor(room.gameTime / 60);
                const seconds = Math.floor(room.gameTime % 60);
                roomTimeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                roomTimeEl.textContent = "Не начата";
            }
        }

        // Прогресс-бар
        const fillPercent = (room.players / room.maxPlayers) * 100;
        if (progressBarEl) {
            progressBarEl.style.width = `${fillPercent}%`;
        }
        if (progressTextEl) {
            progressTextEl.textContent = `${Math.round(fillPercent)}%`;
        }

        // Настраиваем кнопки
        const joinBtn = document.getElementById("mp-room-details-join");
        const copyBtn = document.getElementById("mp-room-details-copy-id");
        const closeBtn = document.getElementById("mp-room-details-close");

        // Удаляем старые обработчики
        if (joinBtn) {
            joinBtn.onclick = null;
            joinBtn.onclick = () => {
                // Используем единый метод joinRoom(), который уже содержит всю логику показа панели
                debugLog(`[Menu] Присоединение к комнате ${room.id} из модального окна`);
                this.joinRoom(room.id);
            };
        }


        if (copyBtn) {
            copyBtn.onclick = null;
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(room.id).then(() => {
                    debugLog(`[Menu] ✅ ID комнаты ${room.id} скопирован в буфер обмена`);
                    // Визуальная обратная связь
                    if (copyBtn) {
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = "✓";
                        copyBtn.style.color = "#4ade80";
                        setTimeout(() => {
                            copyBtn.innerHTML = originalText;
                            copyBtn.style.color = "#a78bfa";
                        }, 1000);
                    }
                }).catch(err => {
                    console.error("[Menu] Ошибка копирования ID:", err);
                });
            };
        }

        if (closeBtn) {
            closeBtn.onclick = null;
            closeBtn.onclick = () => {
                this.hideRoomDetails();
            };
        }

        // Закрытие по клику вне модального окна
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.hideRoomDetails();
            }
        };

        // Загружаем список игроков в комнате
        this.loadRoomPlayers(room.id);

        // Проверяем, является ли текущий игрок создателем комнаты
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        const currentPlayerId = multiplayerManager?.getPlayerId();
        const isOwner = room.creatorId === currentPlayerId;

        // Показываем/скрываем панель управления
        const adminPanel = document.getElementById("mp-room-details-admin-panel");
        if (adminPanel) {
            adminPanel.style.display = isOwner ? "block" : "none";
        }

        // Настраиваем обработчики для панели управления
        if (isOwner) {
            this.setupRoomAdminHandlers(room);
        }

        // Показываем модальное окно
        modal.style.display = "flex";
    }

    /**
     * Загрузка списка игроков в комнате
     */
    private loadRoomPlayers(roomId: string): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager || !multiplayerManager.isConnected()) {
            return;
        }

        const playersList = document.getElementById("mp-room-details-players-list");
        if (!playersList) return;

        // Получаем список игроков из networkPlayers
        const networkPlayers = multiplayerManager.getNetworkPlayers();
        const currentPlayerId = multiplayerManager.getPlayerId();
        const isCreator = multiplayerManager.isRoomCreator ? multiplayerManager.isRoomCreator() : false;

        playersList.innerHTML = "";

        if (!networkPlayers || networkPlayers.size === 0) {
            playersList.innerHTML = '<div style="text-align: center; padding: 10px; color: #888; font-size: 11px;">Нет игроков в комнате</div>';
            return;
        }

        // Добавляем текущего игрока
        const allPlayers: Array<{ id: string; name: string; isOwner?: boolean }> = [];
        if (currentPlayerId) {
            allPlayers.push({ id: currentPlayerId, name: multiplayerManager.getPlayerName() || "Вы", isOwner: isCreator });
        }

        // Добавляем остальных игроков
        networkPlayers.forEach((player: any, playerId: string) => {
            if (playerId !== currentPlayerId) {
                allPlayers.push({
                    id: playerId,
                    name: player.name || `Player_${playerId.substring(0, 6)}`,
                    isOwner: false
                });
            }
        });

        allPlayers.forEach(player => {
            const playerItem = document.createElement("div");
            playerItem.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(102, 126, 234, 0.2);
                border-radius: 6px;
                margin-bottom: 6px;
                font-size: 12px;
            `;

            const isCurrentPlayer = player.id === currentPlayerId;

            playerItem.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    ${player.isOwner ? '<span style="color: #fbbf24; font-size: 14px;">👑</span>' : ''}
                    <span style="color: ${isCurrentPlayer ? '#4ade80' : '#fff'}; font-weight: ${isCurrentPlayer ? '600' : '400'};">
                        ${player.name}${isCurrentPlayer ? ' (Вы)' : ''}
                    </span>
                </div>
                <div style="display: flex; gap: 6px;">
                    ${!isCurrentPlayer && isCreator ? `
                        <button class="room-details-player-kick-btn" data-player-id="${player.id}" data-player-name="${player.name}"
                                style="padding: 6px 10px; font-size: 10px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 4px; color: #ef4444; cursor: pointer; transition: all 0.2s;"
                                title="Кикнуть игрока">
                            🚫 Кик
                        </button>
                    ` : ''}
                    ${!isCurrentPlayer ? `
                        <button class="room-details-player-profile-btn" data-player-id="${player.id}" data-player-name="${player.name}"
                                style="padding: 6px 10px; font-size: 10px; background: rgba(102, 126, 234, 0.2); border: 1px solid #667eea; border-radius: 4px; color: #a78bfa; cursor: pointer; transition: all 0.2s;"
                                title="Профиль игрока">
                            👤 Профиль
                        </button>
                    ` : ''}
                </div>
            `;

            // Обработчик кика игрока
            if (!isCurrentPlayer && isCreator) {
                const kickBtn = playerItem.querySelector(".room-details-player-kick-btn");
                if (kickBtn) {
                    kickBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const playerId = kickBtn.getAttribute("data-player-id");
                        const playerName = kickBtn.getAttribute("data-player-name");
                        if (playerId && playerName) {
                            const reason = prompt(`Введите причину кика игрока ${playerName} (необязательно):`);
                            this.kickPlayerFromRoom(roomId, playerId, reason || undefined);
                        }
                    });
                }
            }

            // Обработчик просмотра профиля
            if (!isCurrentPlayer) {
                const profileBtn = playerItem.querySelector(".room-details-player-profile-btn");
                if (profileBtn) {
                    profileBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const playerId = profileBtn.getAttribute("data-player-id");
                        const playerName = profileBtn.getAttribute("data-player-name");
                        if (playerId && playerName) {
                            this.showPlayerProfile(playerId, playerName);
                        }
                    });
                }
            }

            playersList.appendChild(playerItem);
        });
    }

    /**
     * Настройка обработчиков для панели управления комнатой
     */
    private setupRoomAdminHandlers(room: any): void {
        const changeModeBtn = document.getElementById("mp-room-details-change-mode");
        const changeMaxBtn = document.getElementById("mp-room-details-change-max");
        const togglePrivateBtn = document.getElementById("mp-room-details-toggle-private");
        const transferBtn = document.getElementById("mp-room-details-transfer");

        if (changeModeBtn) {
            changeModeBtn.onclick = () => this.showChangeRoomModeDialog(room);
        }

        if (changeMaxBtn) {
            changeMaxBtn.onclick = () => this.showChangeRoomMaxPlayersDialog(room);
        }

        if (togglePrivateBtn) {
            togglePrivateBtn.onclick = () => this.toggleRoomPrivacy(room);
        }

        if (transferBtn) {
            transferBtn.onclick = () => this.showTransferOwnershipDialog(room);
        }
    }

    /**
     * Диалог изменения режима комнаты
     */
    private showChangeRoomModeDialog(room: any): void {
        const modes = ["deathmatch", "team", "ctf", "survival", "raid"];
        const modeNames: { [key: string]: string } = {
            "deathmatch": "Deathmatch",
            "team": "Team Deathmatch",
            "ctf": "Capture the Flag",
            "survival": "Survival",
            "raid": "Raid"
        };

        const selected = prompt(`Выберите режим комнаты:\n${modes.map((m, i) => `${i + 1}. ${modeNames[m]}`).join("\n")}\n\nВведите номер (1-${modes.length}):`);
        if (!selected) return;

        const index = parseInt(selected) - 1;
        if (index >= 0 && index < modes.length) {
            const newMode = modes[index] as any;
            this.changeRoomSettings(room.id, { mode: newMode });
        }
    }

    /**
     * Диалог изменения максимального количества игроков
     */
    private showChangeRoomMaxPlayersDialog(room: any): void {
        const max = prompt(`Введите максимальное количество игроков (текущее: ${room.maxPlayers}, минимум: 2, максимум: 32):`);
        if (!max) return;

        const maxPlayers = parseInt(max);
        if (maxPlayers >= 2 && maxPlayers <= 32) {
            this.changeRoomSettings(room.id, { maxPlayers });
        } else {
            alert("Количество игроков должно быть от 2 до 32");
        }
    }

    /**
     * Переключение приватности комнаты
     */
    private toggleRoomPrivacy(room: any): void {
        const newPrivacy = !room.isPrivate;
        const password = newPrivacy ? prompt("Введите пароль для комнаты (оставьте пустым для отмены):") : null;
        if (password === null && newPrivacy) return; // Отменено

        this.changeRoomSettings(room.id, {
            isPrivate: newPrivacy,
            password: password || undefined
        });
    }

    /**
     * Диалог передачи прав владельца
     */
    private showTransferOwnershipDialog(room: any): void {
        const playerId = prompt("Введите ID игрока, которому передать права владельца:");
        if (!playerId || playerId.trim() === "") return;

        this.transferRoomOwnership(room.id, playerId.trim());
    }

    /**
     * Изменение настроек комнаты
     */
    private changeRoomSettings(roomId: string, settings: any): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager || !multiplayerManager.isConnected()) {
            alert("Не подключено к серверу");
            return;
        }

        // TODO: Добавить метод в MultiplayerManager для изменения настроек комнаты
        debugLog(`[Menu] Изменение настроек комнаты ${roomId}:`, settings);
        alert("Функция изменения настроек комнаты будет реализована на сервере");
    }

    /**
     * Передача прав владельца комнаты
     */
    private transferRoomOwnership(roomId: string, newOwnerId: string): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager || !multiplayerManager.isConnected()) {
            alert("Не подключено к серверу");
            return;
        }

        // TODO: Добавить метод в MultiplayerManager для передачи прав
        debugLog(`[Menu] Передача прав владельца комнаты ${roomId} игроку ${newOwnerId}`);
        alert("Функция передачи прав будет реализована на сервере");
    }

    /**
     * Кик игрока из комнаты
     */
    kickPlayerFromRoom(roomId: string, playerId: string, reason?: string): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;

        if (!multiplayerManager || !multiplayerManager.isConnected()) {
            alert("Не подключено к серверу");
            return;
        }

        // TODO: Добавить метод в MultiplayerManager для кика игрока
        debugLog(`[Menu] Кик игрока ${playerId} из комнаты ${roomId}, причина: ${reason || "не указана"}`);
        alert("Функция кика игрока будет реализована на сервере");
    }

    /**
     * Скрыть детальное меню комнаты
     */
    hideRoomDetails(): void {
        const modal = document.getElementById("mp-room-details-modal");
        if (modal) {
            modal.style.display = "none";
        }
    }

    // Метод для обновления информации об очереди (вызывается из game.ts через callback)
    updateQueueInfo(queueSize: number, estimatedWait: number, mode: string | null): void {
        const queueInfoEl = document.getElementById("mp-queue-info");

        // Если mode === null, скрываем очередь (матч найден)
        if (!mode || mode === "null") {
            if (queueInfoEl) {
                queueInfoEl.style.display = "none";
            }
            // Останавливаем таймер
            if (this.queueTimerInterval) {
                clearInterval(this.queueTimerInterval);
                this.queueTimerInterval = null;
                this.queueTimer = 0;
            }
            return;
        }

        // Показываем очередь и обновляем информацию
        if (queueInfoEl) {
            queueInfoEl.style.display = "block";
            queueInfoEl.style.animation = "fadeIn 0.3s ease";
        }

        const queueSizeEl = document.getElementById("mp-queue-size");
        const estimatedTimeEl = document.getElementById("mp-queue-estimated-time");
        const queueModeEl = document.getElementById("mp-queue-mode");

        if (queueSizeEl) queueSizeEl.textContent = String(queueSize);
        if (queueModeEl) queueModeEl.textContent = mode.toUpperCase();
        if (estimatedTimeEl) {
            const minutes = Math.floor(estimatedWait / 60);
            const seconds = estimatedWait % 60;
            estimatedTimeEl.textContent = `${minutes > 0 ? `${minutes} мин ` : ""}${seconds} сек`;
        }

        // Запускаем таймер если еще не запущен
        if (!this.queueTimerInterval) {
            this.startQueueTimer();
        }
    }

    private async startMultiplayerGame(): Promise<void> {
        debugLog("[Menu] Starting multiplayer game");
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        if (!multiplayerManager) {
            this.showMultiplayerError("Менеджер мультиплеера не инициализирован.");
            return;
        }

        // Проверяем, идет ли игра уже
        const isActive = multiplayerManager.isRoomActive ? multiplayerManager.isRoomActive() : false;
        const isActiveDirect = multiplayerManager._roomIsActive !== undefined ? multiplayerManager._roomIsActive : false;
        const gameIsActive = isActive || isActiveDirect;

        // КРИТИЧНО: Если игра уже идет, ЛЮБОЙ игрок может присоединиться!
        if (gameIsActive) {
            debugLog("[Menu] 🎮 Игра уже идет, присоединяемся (любой игрок может присоединиться)!");

            // Проверяем подключение
            if (!multiplayerManager.isConnected()) {
                this.showMultiplayerError("Не подключено к серверу. Проверьте подключение.");
                return;
            }

            // Закрываем меню и запускаем игру - БЕЗ ПРОВЕРОК НА СОЗДАТЕЛЯ!
            this.hide();

            if (game && typeof game.startGame === 'function') {
                try {
                    debugLog("[Menu] ✅ Запускаем игру для присоединения к идущей битве");

                    // КРИТИЧНО: Проверяем инициализацию игры перед запуском
                    if (!game.gameInitialized) {
                        debugLog("[Menu] ⚠️ Игра не инициализирована, инициализируем...");
                        try {
                            // Проверяем, что init не вызывается уже
                            if ((game as any)._isInitializing) {
                                debugLog("[Menu] ⏳ Инициализация уже идет, ждем...");
                                // Ждем завершения инициализации
                                let waitCount = 0;
                                while ((game as any)._isInitializing && waitCount < 50) {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    waitCount++;
                                }
                                if (!game.gameInitialized) {
                                    throw new Error("Initialization timeout");
                                }
                            } else {
                                (game as any)._isInitializing = true;
                                try {
                                    await game.init();
                                    game.gameInitialized = true;
                                    debugLog("[Menu] ✅ Игра успешно инициализирована");

                                    // КРИТИЧНО: Проверяем и исправляем mapType после init()
                                    // Это гарантирует синхронизацию карты с сервером
                                    const serverMapType = multiplayerManager.getMapType();
                                    if (serverMapType && game.currentMapType !== serverMapType) {
                                        debugLog(`%c[Menu] 🗺️ КРИТИЧНО: mapType не совпадает после init()! Текущий: ${game.currentMapType}, Сервер: ${serverMapType}`, 'color: #ef4444; font-weight: bold; font-size: 14px;');
                                        game.currentMapType = serverMapType;
                                        if (game.chunkSystem) {
                                            debugLog("[Menu] 🗺️ Перезагружаем карту для синхронизации...");
                                            await game.reloadMap(serverMapType);
                                            debugLog("[Menu] ✅ Карта синхронизирована с сервером");
                                        }
                                    } else {
                                        debugLog(`[Menu] ✅ mapType совпадает: ${game.currentMapType} (сервер: ${serverMapType || 'N/A'})`);
                                    }
                                } finally {
                                    (game as any)._isInitializing = false;
                                }
                            }
                        } catch (error) {
                            console.error("[Menu] ❌ Ошибка инициализации игры:", error);
                            this.showMultiplayerError("Не удалось инициализировать игру. Попробуйте еще раз.");
                            return;
                        }
                    }

                    // Убеждаемся, что canvas виден и имеет правильный размер
                    if (game.canvas) {
                        game.canvas.style.display = "block";
                        game.canvas.style.visibility = "visible";
                        game.canvas.style.opacity = "1";
                        game.canvas.style.zIndex = "1";
                        game.canvas.style.position = "fixed";
                        game.canvas.style.top = "0";
                        game.canvas.style.left = "0";
                        game.canvas.style.width = "100%";
                        game.canvas.style.height = "100%";

                        // Убеждаемся, что canvas имеет правильный размер
                        if (game.canvas.width === 0 || game.canvas.height === 0) {
                            if (game.engine) {
                                game.engine.resize();
                            }
                        }
                    } else {
                        console.error("[Menu] ❌ Canvas не найден!");
                        this.showMultiplayerError("Canvas не инициализирован. Попробуйте еще раз.");
                        return;
                    }

                    // Проверяем, что сцена готова к рендерингу
                    if (!game.scene) {
                        console.error("[Menu] ❌ Сцена не инициализирована!");
                        this.showMultiplayerError("Сцена не готова. Попробуйте еще раз.");
                        return;
                    }

                    // Проверяем, что камера установлена
                    if (!game.camera) {
                        debugWarn("[Menu] ⚠️ Камера еще не создана, но продолжаем...");
                    } else {
                        // Убеждаемся, что камера активна
                        if (game.scene) {
                            game.scene.activeCamera = game.camera;
                            game.camera.setEnabled(true);
                        }
                    }

                    // Небольшая задержка для синхронизации с сервером при присоединении к активной игре
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Запускаем игру
                    game.startGame();
                    debugLog("[Menu] ✅ Игра запущена для присоединения к идущей битве");
                } catch (error) {
                    console.error("[Menu] ❌ Ошибка при запуске игры:", error);
                    this.showMultiplayerError("Не удалось запустить игру. Попробуйте еще раз.");
                }
            } else {
                console.error("[Menu] ❌ Метод startGame не найден в game instance");
                this.showMultiplayerError("Не удалось запустить игру. Попробуйте еще раз.");
            }
            return;
        }

        // Если игра не идет, проверяем, является ли пользователь создателем комнаты
        let isCreator = false;
        try {
            if (multiplayerManager.isRoomCreator) {
                isCreator = multiplayerManager.isRoomCreator();
            } else if (multiplayerManager._isRoomCreator !== undefined) {
                isCreator = multiplayerManager._isRoomCreator;
            }
        } catch (e) {
            debugWarn("[Menu] Ошибка проверки isRoomCreator:", e);
        }

        if (!isCreator) {
            this.showMultiplayerError("Только создатель комнаты может начать игру!");
            return;
        }

        // Проверяем количество игроков
        const playersCount = multiplayerManager.getRoomPlayersCount ? multiplayerManager.getRoomPlayersCount() : 1;
        if (playersCount < 2) {
            this.showMultiplayerError("Для начала игры нужно минимум 2 игрока! Сейчас в комнате только вы.");
            return;
        }

        // Проверяем подключение
        if (!multiplayerManager.isConnected()) {
            this.showMultiplayerError("Не подключено к серверу. Проверьте подключение.");
            return;
        }

        // Отправляем запрос на начало игры
        debugLog("[Menu] 🎮 Отправка запроса на начало игры...");
        const success = multiplayerManager.startGame();
        if (success) {
            debugLog("[Menu] Start game request sent");
            debugLog("[Menu] ✅ Запрос на начало игры отправлен успешно");

            // Обновляем текст кнопки
            const startGameBtn = document.getElementById("mp-btn-start-game");
            if (startGameBtn) {
                const textElement = startGameBtn.querySelector(".battle-btn-text");
                if (textElement) {
                    textElement.textContent = "⏳ Запуск игры...";
                }
                startGameBtn.style.opacity = "0.7";
                startGameBtn.style.cursor = "wait";
            }
        } else {
            console.error("[Menu] ❌ Не удалось отправить запрос на начало игры");
            this.showMultiplayerError("Не удалось начать игру. Проверьте подключение.");
        }
    }

    private leaveMultiplayerRoom(): void {
        debugLog("[Menu] Leaving multiplayer room");
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        if (multiplayerManager) {
            multiplayerManager.leaveRoom();

            // Сбрасываем флаг мультиплеера чтобы боты могли спавниться в одиночной игре
            if (game.disableMultiplayer) {
                game.disableMultiplayer();
                debugLog("[Menu] Disabled multiplayer mode after leaving room");
            }

            const roomInfoEl = document.getElementById("mp-room-info");
            if (roomInfoEl) {
                roomInfoEl.style.display = "none";
            }
            // Скрываем кнопку "В БОЙ!"
            const startGameBtn = document.getElementById("mp-btn-start-game");
            if (startGameBtn) {
                startGameBtn.style.display = "none";
            }
            // Обновляем статус
            this._updateMultiplayerStatus();
        }
    }

    // Метод для отображения ошибок в меню
    showMultiplayerError(message: string): void {
        const errorEl = document.getElementById("mp-error-message");
        const errorTextEl = document.getElementById("mp-error-text");
        if (errorEl && errorTextEl) {
            errorTextEl.textContent = message;
            errorEl.style.display = "block";
            errorEl.style.animation = "fadeIn 0.3s ease";

            // Автоматически скрываем через 5 секунд
            setTimeout(() => {
                errorEl.style.display = "none";
            }, 5000);
        }
    }

    // Метод для отображения уведомлений (успешных сообщений) в меню
    showGameInviteNotification(data: { fromPlayerId: string; fromPlayerName: string; roomId?: string; gameMode?: string; worldSeed?: number }): void {
        // Создаем модальное окно для приглашения
        const modal = document.createElement("div");
        modal.id = "game-invite-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(0, 50, 0, 0.95) 0%, rgba(0, 30, 0, 0.95) 100%);
            border: 2px solid #4ade80;
            border-radius: 8px;
            padding: 30px;
            z-index: 10001;
            min-width: 400px;
            max-width: 500px;
            font-family: 'Consolas', 'Monaco', monospace;
            box-shadow: 0 0 30px rgba(74, 222, 128, 0.5);
        `;

        modal.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 24px; color: #4ade80; margin-bottom: 10px;">🎮 ПРИГЛАШЕНИЕ В ИГРУ</div>
                <div style="font-size: 16px; color: #fff; margin-bottom: 5px;">${data.fromPlayerName}</div>
                ${data.roomId ? `<div style="font-size: 12px; color: #888; margin-top: 5px;">Комната: ${data.roomId.substring(0, 12)}</div>` : ''}
                ${data.gameMode ? `<div style="font-size: 12px; color: #888; margin-top: 5px;">Режим: ${data.gameMode.toUpperCase()}</div>` : ''}
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="invite-accept" style="
                    flex: 1;
                    padding: 12px 24px;
                    background: rgba(74, 222, 128, 0.2);
                    border: 1px solid #4ade80;
                    color: #4ade80;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 4px;
                ">ПРИНЯТЬ</button>
                <button id="invite-decline" style="
                    flex: 1;
                    padding: 12px 24px;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid #ef4444;
                    color: #ef4444;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 4px;
                ">ОТКЛОНИТЬ</button>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики кнопок
        const acceptBtn = document.getElementById("invite-accept");
        const declineBtn = document.getElementById("invite-decline");

        if (acceptBtn) {
            acceptBtn.onclick = async () => {
                const game = (window as any).gameInstance as any;
                const multiplayerManager = game?.multiplayerManager;

                if (!multiplayerManager) {
                    alert("MultiplayerManager не найден");
                    modal.remove();
                    return;
                }

                if (!multiplayerManager.isConnected()) {
                    alert("Не подключено к серверу");
                    modal.remove();
                    return;
                }

                try {
                    if (data.roomId) {
                        // Присоединяемся к существующей комнате
                        debugLog(`[Menu] 🎮 Принятие приглашения: присоединение к комнате ${data.roomId}`);
                        this.showMultiplayerNotification(`Присоединение к комнате ${data.fromPlayerName}...`, "#4ade80");
                        // Используем единый метод joinRoom() для показа панели комнаты
                        this.joinRoom(data.roomId);
                    } else {
                        // Если комнаты нет, создаем новую и приглашаем отправителя
                        debugLog(`[Menu] 🏠 Принятие приглашения: создание новой комнаты`);
                        const mode = data.gameMode || "ffa";
                        this.showMultiplayerNotification(`Создание комнаты для игры с ${data.fromPlayerName}...`, "#4ade80");

                        // Создаем комнату
                        await this.createMultiplayerRoom(mode);

                        // Ждем создания комнаты
                        let attempts = 0;
                        const maxAttempts = 30;
                        let roomId = multiplayerManager.getRoomId();

                        while (!roomId && attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            roomId = multiplayerManager.getRoomId();
                            attempts++;
                        }

                        if (roomId) {
                            // Отправляем приглашение обратно отправителю
                            debugLog(`[Menu] 👥 Отправка приглашения обратно ${data.fromPlayerId} в комнату ${roomId}`);
                            multiplayerManager.sendGameInvite(data.fromPlayerId, mode);
                            this.showMultiplayerNotification(`Комната создана! Приглашение отправлено ${data.fromPlayerName}...`, "#4ade80");
                        } else {
                            if (game?.chatSystem) {
                                game.chatSystem.addMessage("❌ Не удалось создать комнату. Попробуйте еще раз.", "error", 1);
                            }
                            modal.remove();
                            return;
                        }
                    }

                    // После присоединения/создания комнаты открываем меню выбора карты и режима
                    debugLog(`[Menu] 🗺️ Открытие меню выбора карты и режима после принятия приглашения`);

                    // Закрываем модальное окно приглашения
                    modal.remove();

                    // Устанавливаем режим мультиплеера
                    this.selectedGameMode = "multiplayer";
                    localStorage.setItem("selectedGameMode", "multiplayer");

                    // Открываем главное меню, если оно закрыто
                    if (!this.playMenuPanel || !this.playMenuPanel.classList.contains("visible")) {
                        this.showPlayMenu();
                    }

                    // Скрываем все окна и показываем нужные
                    this.hideAllPlayWindows();

                    // Показываем окно выбора типа игры (single/multiplayer) - автоматически выберем multiplayer
                    this.showPlayWindow("play-window-mode", 0, 0);

                    // Выбираем тип игры "multiplayer" программно
                    setTimeout(() => {
                        this.selectGameType("multiplayer");
                    }, 50);

                    // Показываем окно мультиплеера с выбором режима
                    setTimeout(() => {
                        this.showPlayWindow("play-window-multiplayer", 0.5, 0.5);
                        this.initMultiplayerMenu();

                        // Выбираем режим из приглашения, если указан
                        if (data.gameMode) {
                            setTimeout(() => {
                                const modeBtn = document.querySelector(`[data-mp-mode="${data.gameMode}"]`) as HTMLElement;
                                if (modeBtn) {
                                    modeBtn.click();
                                }
                            }, 100);
                        }
                    }, 150);

                    // Показываем окно выбора карты
                    setTimeout(() => {
                        this.showPlayWindow("play-window-map", 2, 2);
                        this.loadCustomMaps();
                    }, 250);

                    // Обновляем статус комнаты, чтобы кнопка "В БОЙ!" появилась
                    setTimeout(() => {
                        this._updateMultiplayerStatus();

                        // Принудительно показываем кнопку "В БОЙ!" если мы в комнате
                        const roomId = multiplayerManager.getRoomId();
                        if (roomId) {
                            const startGameBtn = document.getElementById("mp-btn-start-game");
                            if (startGameBtn) {
                                startGameBtn.style.display = "block";
                                startGameBtn.style.opacity = "1";
                                startGameBtn.style.cursor = "pointer";

                                // Обновляем текст кнопки
                                const textElement = startGameBtn.querySelector(".battle-btn-text");
                                if (textElement) {
                                    const playersCount = multiplayerManager.getRoomPlayersCount ? multiplayerManager.getRoomPlayersCount() : 1;
                                    textElement.textContent = `⚔️ В БОЙ! (${playersCount} игроков)`;
                                }
                            }
                        }
                    }, 1000);

                    // Показываем уведомление
                    if (game?.chatSystem) {
                        game.chatSystem.addMessage(`✅ Приглашение принято! Выберите карту и режим, затем нажмите "В БОЙ!"`, "success", 1);
                    }

                } catch (error) {
                    console.error("[Menu] Ошибка при принятии приглашения:", error);
                    if (game?.chatSystem) {
                        game.chatSystem.addMessage(`❌ Ошибка при принятии приглашения: ${error}`, "error", 1);
                    }
                    modal.remove();
                }
            };
        }

        if (declineBtn) {
            declineBtn.onclick = () => {
                modal.remove();
            };
        }

        // Автоматически закрываем через 30 секунд
        setTimeout(() => {
            if (document.body.contains(modal)) {
                modal.remove();
            }
        }, 30000);
    }

    showMultiplayerNotification(message: string, color: string = "#4ade80"): void {
        const errorEl = document.getElementById("mp-error-message");
        const errorTextEl = document.getElementById("mp-error-text");
        if (errorEl && errorTextEl) {
            // Меняем стиль на успешное уведомление
            errorEl.style.borderColor = color;
            errorEl.style.background = `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`;
            errorTextEl.textContent = message;
            errorTextEl.style.color = color;
            errorEl.style.display = "block";
            errorEl.style.animation = "fadeIn 0.3s ease";

            // Автоматически скрываем через 4 секунды
            setTimeout(() => {
                errorEl.style.display = "none";
                // Восстанавливаем стиль ошибки
                errorEl.style.borderColor = "#ef4444";
                errorEl.style.background = "rgba(239, 68, 68, 0.2)";
                errorTextEl.style.color = "#ffaaaa";
            }, 4000);
        }
    }

    private selectMap(map: MapType): void {
        this.selectedMapType = map;
        debugLog("[Menu] Selected map:", map);

        // ИСПРАВЛЕНИЕ: Не очищаем данные пользовательской карты автоматически
        // Теперь game.ts сам проверяет соответствие типа карты перед загрузкой
        /*
        const customMapData = localStorage.getItem("selectedCustomMapData");
        if (customMapData && map !== "custom") {
            try {
                const parsed = JSON.parse(customMapData);
                // Очищаем только если выбранная карта не совпадает с базовым типом пользовательской карты
                if (parsed.mapType && parsed.mapType !== map) {
                    localStorage.removeItem("selectedCustomMapData");
                    debugLog("[Menu] Cleared custom map data for standard map selection");
                }
            } catch (e) {
                // Игнорируем ошибки парсинга
            }
        }
        */

        // Обновляем визуал стандартных карт
        document.querySelectorAll("[data-map]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.map === map) {
                button.className = "map-card recommended";
                button.style.borderColor = "#0f0";
            } else {
                button.className = "map-card";
                button.style.borderColor = "";
            }
        });

        // Обновляем визуал пользовательских карт (если выбрана пользовательская карта)
        const customMapIndex = localStorage.getItem("selectedCustomMapIndex");
        document.querySelectorAll("[data-custom-map-index]").forEach(btn => {
            const button = btn as HTMLElement;
            const mapIndex = button.getAttribute("data-custom-map-index");
            if (mapIndex === customMapIndex && customMapIndex !== null) {
                button.style.background = "rgba(0, 100, 0, 0.6)";
                button.style.borderColor = "#0f0";
                button.style.boxShadow = "0 0 15px rgba(0, 255, 80, 0.4)";
            } else {
                button.style.background = "";
                button.style.borderColor = "";
                button.style.boxShadow = "";
            }
        });

        // Update terminal titles
        this.updateTerminalTitles();

        // Используем сохранённый выбор или значения по умолчанию
        const savedChassis = localStorage.getItem("selectedChassis") || "medium";
        const savedCannon = localStorage.getItem("selectedCannon") || "standard";

        this.selectedChassis = savedChassis;
        this.selectedCannon = savedCannon;
        localStorage.setItem("selectedChassis", savedChassis);
        localStorage.setItem("selectedCannon", savedCannon);

        // Всегда показываем окно выбора танка - там кнопка "В БОЙ!"
        this.showPlayWindow("play-window-tank", 3, 3);

        this.checkCanStartGame();
    }

    /**
     * Проверяет наличие сохранённых пользовательских пресетов танков
     */
    private checkHasSavedPresets(): boolean {
        try {
            const saved = localStorage.getItem("savedTankConfigurations");
            if (saved) {
                const configs = JSON.parse(saved);
                return Array.isArray(configs) && configs.length > 0;
            }
        } catch (e) {
            debugLog("[Menu] Error checking saved presets:", e);
        }
        return false;
    }

    private selectChassis(chassisId: string): void {
        if (!this.ownedChassisIds.has(chassisId)) {
            debugLog("[Menu] Attempt to select chassis not owned:", chassisId);
            return;
        }
        this.selectedChassis = chassisId;
        localStorage.setItem("selectedChassis", chassisId);
        debugLog("[Menu] Selected chassis:", chassisId);

        // Обновляем визуал
        document.querySelectorAll("[data-chassis]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.chassis === chassisId) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn";
            }
        });

        // Update terminal titles (path doesn't change, but ensure it's up to date)
        this.updateTerminalTitles();

        this.checkCanStartGame();
    }

    private selectCannon(cannonId: string): void {
        if (!this.ownedCannonIds.has(cannonId)) {
            debugLog("[Menu] Attempt to select cannon not owned:", cannonId);
            return;
        }
        this.selectedCannon = cannonId;
        localStorage.setItem("selectedCannon", cannonId);
        debugLog("[Menu] Selected cannon:", cannonId);

        // Обновляем визуал
        document.querySelectorAll("[data-cannon]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.cannon === cannonId) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn";
            }
        });

        // Update terminal titles (path doesn't change, but ensure it's up to date)
        this.updateTerminalTitles();

        this.checkCanStartGame();
    }

    private selectPreset(preset: string): void {
        debugLog("[Menu] Selected preset:", preset);

        // Обновляем визуал выбранного пресета
        document.querySelectorAll("[data-preset]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.preset === preset) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn secondary";
            }
        });

        // Применяем пресет (tankTypes уже импортирован статически)
        let chassisId = "medium";
        let cannonId = "standard";

        switch (preset) {
            case "balanced":
                chassisId = "medium";
                cannonId = "standard";
                break;
            case "speed":
                chassisId = "light";
                cannonId = "rapid";
                break;
            case "defense":
                chassisId = "heavy";
                cannonId = "heavy";
                break;
            case "damage":
                chassisId = "assault";
                cannonId = "sniper";
                break;
        }

        // Если нет владения — берем первый доступный из owned
        const ownedChassis = Array.from(this.ownedChassisIds);
        const ownedCannon = Array.from(this.ownedCannonIds);
        if (!this.ownedChassisIds.has(chassisId) && ownedChassis.length > 0) {
            chassisId = ownedChassis[0] || chassisId; // Fallback to original if undefined
        }
        if (!this.ownedCannonIds.has(cannonId) && ownedCannon.length > 0) {
            cannonId = ownedCannon[0] || cannonId; // Fallback to original if undefined
        }

        this.selectChassis(chassisId);
        this.selectCannon(cannonId);
    }

    private checkCanStartGame(): void {
        // Проверяем, все ли выбрано
        const canStart = this.selectedGameMode &&
            this.selectedMapType &&
            this.selectedChassis &&
            this.selectedCannon;

        // Кнопка "В БОЙ!" всегда видна в окне выбора танка, но может быть disabled
        const startButton = document.getElementById("btn-start-game");
        if (startButton) {
            (startButton as HTMLButtonElement).disabled = !canStart;
            if (!canStart) {
                startButton.style.opacity = "0.5";
                startButton.style.cursor = "not-allowed";
            } else {
                startButton.style.opacity = "1";
                startButton.style.cursor = "pointer";
            }
        }
    }

    private hideAllPlayWindows(): void {
        document.querySelectorAll(".play-window").forEach(win => {
            const el = win as HTMLDivElement;
            el.classList.remove("visible");
            el.style.zIndex = "100002";
            el.style.transform = "translate(0,0)";
            el.style.display = "none";
        });
        // Дополнительно убеждаемся, что панель выбора режима для создания комнаты скрыта
        const modePanel = document.getElementById("mp-create-room-mode");
        if (modePanel) {
            modePanel.style.display = "none";
            modePanel.classList.remove("visible");
        }
        // И панель выбора карты для создания комнаты тоже
        const mapPanel = document.getElementById("mp-create-room-map");
        if (mapPanel) {
            mapPanel.style.display = "none";
            mapPanel.classList.remove("visible");
        }
    }

    private getUserName(): string {
        // Try to get user_id from localStorage
        let storedUserId = localStorage.getItem("userId");
        if (storedUserId) return storedUserId;

        // Try to get from Firebase if available (synchronous check)
        try {
            // Check if firebaseService is available in global scope or window
            const firebaseService = (window as any).firebaseService ||
                (globalThis as any).firebaseService;
            if (firebaseService && firebaseService.isInitialized && firebaseService.isInitialized()) {
                const userId = firebaseService.getUserId();
                if (userId) {
                    localStorage.setItem("userId", userId);
                    return userId;
                }
            }
        } catch (e) {
            // Firebase not available, ignore
        }

        // Default fallback - use "user_id" as placeholder
        const defaultUserId = "user_id";
        localStorage.setItem("userId", defaultUserId);
        return defaultUserId;
    }

    private getModeDisplayName(mode: string): string {
        const modeNames: Record<string, string> = {
            "single": "single",
            "ffa": "ffa",
            "tdm": "tdm",
            "coop": "coop",
            "battle_royale": "battle_royale",
            "ctf": "ctf"
        };
        return modeNames[mode] || mode;
    }

    private getMapDisplayName(map: MapType | null): string {
        if (!map) return "";
        const mapNames: Record<string, string> = {
            "normal": "normal",
            "sandbox": "sandbox",
            "polygon": "polygon",
            "frontline": "frontline",
            "ruins": "ruins",
            "canyon": "canyon",
            "industrial": "industrial",
            "urban_warfare": "urban_warfare",
            "underground": "underground",
            "coastal": "coastal",
            "tartaria": "tartaria"
        };
        return mapNames[map] || map;
    }

    private updateTerminalTitles(): void {
        const userId = this.getUserName();
        const basePath = `/${userId}`;
        const typePath = this.selectedGameType || "single";

        // Update type selection terminal title (step 1)
        const typeTitle = document.querySelector("#play-window-mode .play-window-title");
        if (typeTitle) {
            typeTitle.textContent = `${basePath}/type`;
        }

        // Update gamemode terminal title (step 2)
        const gamemodeTitle = document.querySelector("#play-window-gamemode .play-window-title");
        if (gamemodeTitle) {
            gamemodeTitle.textContent = `${basePath}/${typePath}/mode`;
        }

        // Update map terminal title (step 3)
        const mapTitle = document.querySelector("#play-window-map .play-window-title");
        if (mapTitle) {
            let path = `${basePath}/${typePath}`;
            if (this.selectedGameMode) {
                const modeName = this.getModeDisplayName(this.selectedGameMode);
                path += `/${modeName}`;
            }
            path += "/map";
            mapTitle.textContent = path;
        }

        // Update tank terminal title (step 4)
        const tankTitle = document.querySelector("#play-window-tank .play-window-title");
        if (tankTitle) {
            let path = `${basePath}/${typePath}`;
            if (this.selectedGameMode) {
                const modeName = this.getModeDisplayName(this.selectedGameMode);
                path += `/${modeName}`;
            }
            if (this.selectedMapType) {
                const mapName = this.getMapDisplayName(this.selectedMapType);
                path += `/${mapName}`;
            }
            path += "/preset";
            tankTitle.textContent = path;
        }
    }

    private showPlayWindow(id: string, order: number, step?: number): void {
        const el = document.getElementById(id) as HTMLDivElement | null;
        if (!el) {
            debugError(`[Menu] showPlayWindow: Element with id "${id}" not found!`);
            return;
        }
        debugLog(`[Menu] showPlayWindow: Showing window "${id}" with order ${order}`);
        el.style.display = "block";
        el.classList.add("visible");
        el.style.zIndex = (100002 + order).toString();
        el.style.transform = `translate(${order * 12}px, ${order * 12}px)`;

        // Автоматически подстраиваем высоту под контент
        // Сбрасываем любые фиксированные высоты
        el.style.height = "auto";
        el.style.bottom = "auto";

        // Если открывается окно выбора карты, обновляем список сохраненных карт
        if (id === "play-window-map" || id === "mp-create-room-map") {
            this.loadCustomMaps();
            // Добавляем обработчики для карточек карт при открытии панели
            if (id === "mp-create-room-map") {
                setTimeout(() => {
                    const mapCards = document.querySelectorAll("#mp-create-room-map .map-card");
                    debugLog(`[Menu] Adding click handlers to ${mapCards.length} map cards`);

                    // Сначала извлекаем типы карт из атрибутов
                    const cardMapTypes: Map<HTMLElement, string> = new Map();
                    mapCards.forEach((card) => {
                        const cardEl = card as HTMLElement;
                        const onclickStr = cardEl.getAttribute("onclick") || "";
                        const match = onclickStr.match(/selectMpCreateRoomMap\('([^']+)'/);
                        const mapType = (match && match[1]) ? match[1] : "normal";
                        cardMapTypes.set(cardEl, mapType);
                    });

                    // Теперь добавляем обработчики
                    mapCards.forEach((card) => {
                        const cardEl = card as HTMLElement;
                        const mapType = cardMapTypes.get(cardEl) || "normal";

                        // Добавляем обработчик через addEventListener (не удаляя inline)
                        cardEl.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            debugLog("[Menu] Map card clicked:", mapType);

                            // Сохраняем выбранную карту
                            (this as any).selectedCreateRoomMap = mapType;

                            // Убираем выделение со всех карточек
                            mapCards.forEach(c => {
                                (c as HTMLElement).style.border = "2px solid rgba(0, 255, 80, 0.3)";
                                (c as HTMLElement).style.boxShadow = "";
                                (c as HTMLElement).style.background = "rgba(0, 20, 0, 0.4)";
                                (c as HTMLElement).style.transform = "";
                                c.classList.remove("selected");
                            });

                            // Выделяем выбранную карточку - ОЧЕНЬ ЗАМЕТНО
                            cardEl.style.border = "3px solid #4ade80";
                            cardEl.style.boxShadow = "0 0 20px rgba(74, 222, 128, 0.8), 0 0 40px rgba(74, 222, 128, 0.4), inset 0 0 20px rgba(74, 222, 128, 0.2)";
                            cardEl.style.background = "linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(34, 197, 94, 0.2) 100%)";
                            cardEl.style.transform = "scale(1.05)";
                            cardEl.classList.add("selected");
                        }, { once: false });
                    });

                    // Обработчик кнопки создания комнаты использует window.startMpCreateRoom (через onclick в HTML)
                    // Дублирующий addEventListener удалён для предотвращения запуска игры вместо показа панели комнаты
                }, 100);
            }
        }

        // Применяем стили после небольшой задержки, чтобы контент успел отрендериться
        setTimeout(() => {
            const contentHeight = el.scrollHeight;
            const maxHeight = window.innerHeight - 80; // 40px сверху + 40px снизу
            if (contentHeight < maxHeight) {
                // Если контент меньше экрана, используем его высоту
                el.style.height = `${contentHeight}px`;
            } else {
                // Если контент больше экрана, ограничиваем максимальной высотой
                el.style.height = `${maxHeight}px`;
                el.style.overflowY = "auto";
            }
        }, 10);

        if (typeof step === "number") {
            this.currentPlayStep = step;
        }
        // Update terminal titles when showing window
        this.updateTerminalTitles();
    }

    private navigatePlayStep(targetStep: number): void {
        const steps = ["play-window-mode", "play-window-gamemode", "play-window-map", "play-window-tank"];
        const clamped = Math.max(0, Math.min(targetStep, steps.length - 1));
        this.hideAllPlayWindows();
        const id = steps[clamped];
        if (id) {
            this.showPlayWindow(id, clamped, clamped);
        }
    }

    private startSelectedGame(): void {
        if (!this.selectedMapType) return;

        // Сохраняем выборы
        if (this.selectedGameMode) localStorage.setItem("selectedGameMode", this.selectedGameMode);
        if (this.selectedMapType) localStorage.setItem("selectedMapType", this.selectedMapType);
        if (this.selectedChassis) localStorage.setItem("selectedChassis", this.selectedChassis);
        if (this.selectedCannon) localStorage.setItem("selectedCannon", this.selectedCannon);

        // КРИТИЧНО: Получаем данные сохраненной/отредактированной карты из localStorage
        let mapData: any = null;
        const customMapDataStr = localStorage.getItem("selectedCustomMapData");
        if (customMapDataStr) {
            try {
                mapData = JSON.parse(customMapDataStr);
                debugLog(`[Menu] Found custom map data: ${mapData?.name}, will pass to onStartGame`);
            } catch (error) {
                console.error("[Menu] Failed to parse custom map data:", error);
            }
        }

        // Закрываем меню
        this.hide();
        this.hidePlayMenu();

        // Если выбран мультиплеер, запускаем игру и подключаемся к матчмейкингу
        if (this.selectedGameMode === "multiplayer") {
            // Запускаем игру в одиночном режиме (карта нужна для генерации мира)
            debugLog("[Menu] startSelectedGame (multiplayer): calling onStartGame with map:", this.selectedMapType, "mapData:", mapData ? mapData.name : "none");
            debugLog("[Menu] startSelectedGame: onStartGame callback:", typeof this.onStartGame);
            if (this.onStartGame && typeof this.onStartGame === 'function') {
                // Передаем mapType и mapData (если есть)
                this.onStartGame(this.selectedMapType, mapData);
            } else {
                console.error("[Menu] startSelectedGame (multiplayer): onStartGame callback is not set!");
            }

            // После запуска игры подключаемся к мультиплееру
            // Используем задержку чтобы игра успела инициализироваться и MultiplayerManager создался
            setTimeout(() => {
                const game = (window as any).gameInstance as any;
                if (game && game.quickPlayMultiplayer) {
                    // Используем FFA как режим по умолчанию для мультиплеера
                    game.quickPlayMultiplayer("ffa");
                    debugLog("[Menu] Quick play multiplayer: FFA");
                } else {
                    debugError("[Menu] Game instance not found or quickPlayMultiplayer not available");
                    // Пробуем еще раз через 2 секунды
                    setTimeout(() => {
                        const game2 = (window as any).gameInstance as any;
                        if (game2 && game2.quickPlayMultiplayer) {
                            game2.quickPlayMultiplayer("ffa");
                            debugLog("[Menu] Quick play multiplayer: FFA (retry)");
                        }
                    }, 2000);
                }
            }, 3000);
        } else {
            // Обычный старт для одиночной игры
            debugLog("[Menu] Starting game with mapType:", this.selectedMapType, "mapData:", mapData ? mapData.name : "none");
            debugLog("[Menu] onStartGame callback:", typeof this.onStartGame);

            // Сбрасываем флаг мультиплеера чтобы боты спавнились
            const game = (window as any).gameInstance as any;
            if (game && game.disableMultiplayer) {
                game.disableMultiplayer();
                debugLog("[Menu] Disabled multiplayer mode for single-player game");
            }

            if (this.onStartGame && typeof this.onStartGame === 'function') {
                // КРИТИЧНО: Передаем mapType и mapData (если есть)
                this.onStartGame(this.selectedMapType, mapData);
            } else {
                console.error("[Menu] onStartGame callback is not set!");
            }
        }
    }

    private quickStart(): void {
        const savedMap = localStorage.getItem("selectedMapType") as MapType | null;
        if (!savedMap) {
            debugLog("[Menu] Quick start: no saved map, showing play menu");
            this.showPlayMenu();
            return;
        }
        // Используем сохраненные настройки, если есть
        this.selectedMapType = savedMap;
        this.selectedGameMode = localStorage.getItem("selectedGameMode") || "";
        this.selectedChassis = localStorage.getItem("selectedChassis") || this.selectedChassis;
        this.selectedCannon = localStorage.getItem("selectedCannon") || this.selectedCannon;

        this.hide();
        this.hidePlayMenu();
        debugLog("[Menu] quickStart: calling onStartGame with map:", savedMap);
        debugLog("[Menu] quickStart: onStartGame callback:", typeof this.onStartGame);
        if (this.onStartGame && typeof this.onStartGame === 'function') {
            this.onStartGame(savedMap);
        } else {
            console.error("[Menu] quickStart: onStartGame callback is not set!");
        }
    }

    private showPlayMenu(): void {
        debugLog("[Menu] showPlayMenu() called");
        if (this.playMenuPanel) {
            // Сбрасываем состояние
            this.selectedGameMode = "";
            this.selectedMapType = null;
            this.currentPlayStep = 0;

            // Скрываем все окна шагов
            this.hideAllPlayWindows();

            // Показываем только окно выбора режима
            this.showPlayWindow("play-window-mode", 0, 0);

            // Сбрасываем выборы кнопок
            document.querySelectorAll("[data-mode]").forEach(btn => {
                (btn as HTMLButtonElement).className = "menu-btn secondary";
            });
            document.querySelectorAll("[data-map]").forEach(btn => {
                (btn as HTMLButtonElement).className = "menu-btn secondary";
            });
            document.querySelectorAll("[data-preset]").forEach(btn => {
                (btn as HTMLButtonElement).className = "menu-btn secondary";
            });

            // Восстанавливаем сохраненные выборы (если есть)
            const savedMode = localStorage.getItem("selectedGameMode");
            const savedMap = localStorage.getItem("selectedMapType") as MapType | null;
            const savedChassis = localStorage.getItem("selectedChassis");
            const savedCannon = localStorage.getItem("selectedCannon");

            // Если сохраненного нет или его нет в владении — сбросим
            if (savedChassis && !this.ownedChassisIds.has(savedChassis)) {
                localStorage.removeItem("selectedChassis");
            }
            if (savedCannon && !this.ownedCannonIds.has(savedCannon)) {
                localStorage.removeItem("selectedCannon");
            }

            // Проставляем сохранённые выборы, но не переключаем шаги — режим всегда первый
            if (savedMode) {
                this.selectedGameMode = savedMode;
                document.querySelectorAll("[data-mode]").forEach(btn => {
                    const button = btn as HTMLButtonElement;
                    button.className = button.dataset.mode === savedMode ? "menu-btn play-btn" : "menu-btn secondary";
                });
            }
            if (savedMap) {
                this.selectedMapType = savedMap;
                document.querySelectorAll("[data-map]").forEach(btn => {
                    const button = btn as HTMLButtonElement;
                    button.className = button.dataset.map === savedMap ? "menu-btn play-btn" : "menu-btn secondary";
                });
            }
            if (savedChassis) this.selectChassis(savedChassis);
            if (savedCannon) this.selectCannon(savedCannon);

            // Если нет сохраненных данных — открываем первый шаг
            if (!savedMode) this.showPlayWindow("play-window-mode", 0);

            // Update terminal titles
            this.updateTerminalTitles();

            this.playMenuPanel.classList.add("visible");
            this.playMenuPanel.style.setProperty("display", "flex", "important");
            this.playMenuPanel.style.setProperty("visibility", "visible", "important");
            this.playMenuPanel.style.setProperty("opacity", "1", "important");
            this.playMenuPanel.style.setProperty("z-index", "100002", "important");
            this.enforceCanvasPointerEvents();
        }
    }

    private hidePlayMenu(): void {
        debugLog("[Menu] hidePlayMenu() called");
        if (this.playMenuPanel) {
            // Сначала скрываем все play-windows внутри
            this.hideAllPlayWindows();

            this.playMenuPanel.classList.remove("visible");
            this.playMenuPanel.style.setProperty("display", "none", "important");
            this.playMenuPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents();
        }
    }

    private showMapSelection(): void {
        this.updateCustomMapsUI();
        debugLog("[Menu] showMapSelection() called");
        debugLog("[Menu] mapSelectionPanel exists:", !!this.mapSelectionPanel);
        if (this.mapSelectionPanel) {
            this.mapSelectionPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.mapSelectionPanel.style.setProperty("display", "flex", "important");
            this.mapSelectionPanel.style.setProperty("visibility", "visible", "important");
            this.mapSelectionPanel.style.setProperty("opacity", "1", "important");
            this.mapSelectionPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.mapSelectionPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.mapSelectionPanel).display);
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] mapSelectionPanel is null!");
        }
    }

    private hideMapSelection(): void {
        debugLog("[Menu] hideMapSelection() called");
        if (this.mapSelectionPanel) {
            this.mapSelectionPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.mapSelectionPanel.style.setProperty("display", "none", "important");
            this.mapSelectionPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
    }

    private showStats(): void {
        debugLog("[Menu] showStats() called");
        debugLog("[Menu] statsPanel exists:", !!this.statsPanel);
        if (this.statsPanel) {
            this.statsPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.statsPanel.style.setProperty("display", "flex", "important");
            this.statsPanel.style.setProperty("visibility", "visible", "important");
            this.statsPanel.style.setProperty("opacity", "1", "important");
            this.statsPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.statsPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.statsPanel).display);
            this.updateStatsPanel();
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] statsPanel is null!");
        }
    }

    private hideStats(): void {
        debugLog("[Menu] hideStats() called");
        if (this.statsPanel) {
            this.statsPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.statsPanel.style.setProperty("display", "none", "important");
            this.statsPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
    }

    private updateStatsPanel(): void {
        if (!this.playerProgression) return;

        const stats = this.playerProgression.getStats();
        const grid = document.getElementById("stats-grid");
        if (!grid) return;

        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.level}</div>
                <div class="stat-label">Уровень</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalKills}</div>
                <div class="stat-label">Убийств</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalDeaths}</div>
                <div class="stat-label">Смертей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getKDRatio()}</div>
                <div class="stat-label">K/D</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getAccuracy()}</div>
                <div class="stat-label">Точность</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.bestKillStreak}</div>
                <div class="stat-label">Лучшая серия</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Math.round(stats.totalDamageDealt)}</div>
                <div class="stat-label">Урон нанесён</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getPlayTimeFormatted()}</div>
                <div class="stat-label">Время в игре</div>
            </div>
        `;
    }

    private showSkills(): void {
        debugLog("[Menu] showSkills() called");
        debugLog("[Menu] skillsPanel exists:", !!this.skillsPanel);
        if (this.skillsPanel) {
            this.skillsPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.skillsPanel.style.setProperty("display", "flex", "important");
            this.skillsPanel.style.setProperty("visibility", "visible", "important");
            this.skillsPanel.style.setProperty("opacity", "1", "important");
            this.skillsPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.skillsPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.skillsPanel).display);
            this.updateSkillsPanel();
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] skillsPanel is null!");
        }
    }

    private hideSkills(): void {
        debugLog("[Menu] hideSkills() called");
        if (this.skillsPanel) {
            // Сохраняем позицию камеры перед закрытием
            saveSkillTreeCameraPosition();

            this.skillsPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.skillsPanel.style.setProperty("display", "none", "important");
            this.skillsPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
    }

    private updateSkillsPanel(): void {
        // Создаем mock stats если playerProgression не установлен (для отображения дерева до инициализации игры)
        const stats: PlayerStats = this.playerProgression ? this.playerProgression.getStats() : {
            skillPoints: 0,
            skills: {} as Record<string, number>,
            level: 1,
            experience: 0,
            experienceToNext: 100
        };

        const callbacks: SkillTreeCallbacks = {
            onUpgrade: (skillId: string) => {
                if (this.playerProgression) {
                    this.playerProgression.upgradeSkill(skillId);
                }
            },
            onUpdate: () => {
                this.updateSkillsPanel();
                this.updatePlayerInfo();
            }
        };

        updateSkillTreeDisplay(stats, callbacks);
    }

    public async showGarage(): Promise<void> {
        debugLog("[Menu] showGarage() called");

        const wantsPlayMenuBack = this.returnToPlayMenuAfterGarage;
        const wasPlayVisible = this.playMenuPanel?.classList.contains("visible");

        // Lazy load Garage if not already loaded
        if (!this.garage) {
            debugLog("[Menu] Garage not loaded, loading now...");
            await this.loadGarageInMenu();
        }

        if (!this.garage) {
            logger.error("[Menu] Garage still not available after loading attempt!");
            return;
        }

        debugLog("[Menu] Opening Garage class");
        const wasVisible = this.isVisible();
        if (wasVisible) {
            this.hide();
        }
        this.garage.setOnCloseCallback(() => {
            try {
                const shouldReturnToPlay = this.returnToPlayMenuAfterGarage || wantsPlayMenuBack || wasPlayVisible;
                this.returnToPlayMenuAfterGarage = false;

                // ИСПРАВЛЕНИЕ: Безопасная проверка canvas с дополнительными проверками
                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                if (canvas) {
                    // Проверяем что canvas существует и не скрыт
                    const canvasDisplay = canvas.style.display;
                    const canvasComputed = window.getComputedStyle(canvas).display;
                    const isCanvasVisible = canvasDisplay !== "none" && canvasComputed !== "none";

                    if (isCanvasVisible) {
                        debugLog("[Menu] Game is running, not showing menu after garage close");
                        // Восстанавливаем pointer-events для canvas
                        try {
                            this.enforceCanvasPointerEvents();
                        } catch (error) {
                            console.error("[Menu] Error enforcing canvas pointer events:", error);
                        }
                        return;
                    }
                }

                if (shouldReturnToPlay) {
                    debugLog("[Menu] Returning to play menu after garage close");
                    try {
                        this.showPlayMenu();
                    } catch (error) {
                        console.error("[Menu] Error showing play menu:", error);
                    }
                } else if (wasVisible) {
                    debugLog("[Menu] Showing menu after garage close");
                    try {
                        this.show();
                    } catch (error) {
                        console.error("[Menu] Error showing menu:", error);
                    }
                }

                // Восстанавливаем pointer-events для canvas после закрытия гаража
                setTimeout(() => {
                    try {
                        this.enforceCanvasPointerEvents();
                    } catch (error) {
                        console.error("[Menu] Error enforcing canvas pointer events (delayed):", error);
                    }
                }, 100);
            } catch (error) {
                console.error("[Menu] Error in garage close callback:", error);
                // Пытаемся показать меню в случае ошибки
                try {
                    if (wasVisible) {
                        this.show();
                    }
                } catch (e) {
                    console.error("[Menu] Error in fallback menu show:", e);
                }
            }
        });
        this.garage.open();
    }

    // Lazy load Garage in menu
    private async loadGarageInMenu(): Promise<void> {
        if (this.garage) return; // Already loaded

        try {
            const { Garage } = await import("./garage");

            // Create minimal scene and currency manager for garage
            this.garageCurrencyManager = new CurrencyManager();

            // Create a minimal scene for garage (will be replaced by game scene later if needed)
            const canvas = document.createElement("canvas");
            canvas.style.display = "none";
            document.body.appendChild(canvas);
            const engine = new Engine(canvas, false);
            this.garageScene = new Scene(engine);

            // Create garage with minimal scene
            this.garage = new Garage(this.garageScene, this.garageCurrencyManager);
            debugLog("[Menu] Garage loaded lazily");
        } catch (error) {
            logger.error("[Menu] Failed to load Garage:", error);
        }
    }

    // Deprecated: Garage is now loaded lazily via loadGarageInMenu()
    // This method is kept for compatibility but does nothing
    // Garage is now loaded lazily when showGarage() is called
    private initializeGarageInMenu(): void {
        debugLog("[Menu] initializeGarageInMenu() called (deprecated - garage is lazy loaded)");
    }

    private initializeGarage(): void {
        // Garage is already initialized in constructor
        // This method is kept for compatibility
        debugLog("[Menu] Garage already initialized");
    }

    private hideGarage(): void {
        // Старый метод для совместимости, но теперь гараж закрывается через свой callback
        debugLog("[Menu] hideGarage() called (deprecated, garage closes via its own callback)");
        if (this.garage && this.garage.isGarageOpen()) {
            this.garage.close();
        }

        if (this.returnToPlayMenuAfterGarage) {
            this.returnToPlayMenuAfterGarage = false;
            this.showPlayMenu();
        }
    }

    /**
     * Открыть редактор карт
     */
    private async openMapEditor(): Promise<void> {
        debugLog("[Menu] Opening PolyGenStudio Map Editor...");

        // Hide menu
        this.container.classList.add("hidden");

        // Stop canvas protection temporarily
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
        }
        const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (gameCanvas) {
            gameCanvas.style.display = 'none';
        }

        // Create container for PolyGenStudio Map Editor
        const editorContainer = document.createElement("div");
        editorContainer.id = "polygen-map-editor-container";
        editorContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 10000;
            background-color: #000;
        `;

        // Create iframe for PolyGenStudio
        const iframe = document.createElement("iframe");
        iframe.id = "polygen-map-iframe";
        iframe.src = "http://127.0.0.1:3000/?mode=map";
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

        editorContainer.appendChild(iframe);
        document.body.appendChild(editorContainer);

        // Close handler
        const closeEditor = () => {
            debugLog("[Menu] Closing PolyGenStudio Map Editor");
            // Show menu again
            this.container.classList.remove("hidden");

            const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }

            // Resume canvas protection
            this.setupCanvasPointerEventsProtection();

            // Remove editor container
            editorContainer.remove();

            // Reload custom maps list potentially
            // Reload custom maps list potentially
            // const maps = getCustomMapsList(); 
            // Refresh logic if needed

        };

        // Listen for close message from iframe
        const messageHandler = (event: MessageEvent) => {
            if (event.data && event.data.type === 'CLOSE_EDITOR') {
                window.removeEventListener('message', messageHandler);
                closeEditor();
            }

            // Handle TEST mode from PolyGen editor
            if (event.data && event.data.type === 'POLYGEN_TEST_MAP') {
                console.log('[Menu] 🎮 Received POLYGEN_TEST_MAP from editor!', event.data);
                debugLog("[Menu] Received POLYGEN_TEST_MAP from editor - starting inline test");

                // Save map data for game
                if (event.data.mapData) {
                    localStorage.setItem('tx_test_map', JSON.stringify(event.data.mapData));
                    localStorage.setItem('selectedCustomMapData', JSON.stringify(event.data.mapData));
                }

                // Mark test mode active - editor should stay hidden
                localStorage.setItem('polygen_test_mode_active', 'true');

                // Collapse/minimize editor instead of closing - FORCE HIDE
                editorContainer.style.display = 'none';
                editorContainer.style.visibility = 'hidden';
                editorContainer.style.pointerEvents = 'none';
                editorContainer.classList.add('polygen-minimized');

                // Create "Open Editor" button in game
                let restoreButton = document.getElementById('polygen-restore-btn');
                if (!restoreButton) {
                    restoreButton = document.createElement('button');
                    restoreButton.id = 'polygen-restore-btn';
                    restoreButton.innerHTML = '🔧 РЕДАКТОР';
                    restoreButton.style.cssText = `
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        z-index: 9999;
                        padding: 8px 16px;
                        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-weight: bold;
                        cursor: pointer;
                        font-size: 14px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                        transition: all 0.2s;
                    `;
                    restoreButton.onmouseenter = () => {
                        restoreButton!.style.transform = 'scale(1.05)';
                        restoreButton!.style.boxShadow = '0 6px 12px rgba(0,0,0,0.4)';
                    };
                    restoreButton.onmouseleave = () => {
                        restoreButton!.style.transform = 'scale(1)';
                        restoreButton!.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
                    };
                    restoreButton.onclick = () => {
                        // DON'T clear test mode flag - just show editor overlay
                        // Game continues running in background!
                        editorContainer.style.display = 'block';
                        editorContainer.style.visibility = 'visible';
                        editorContainer.style.pointerEvents = 'auto';
                        editorContainer.classList.remove('polygen-minimized');
                        // Hide restore button while editing
                        restoreButton!.style.display = 'none';
                    };
                    document.body.appendChild(restoreButton);
                    console.log('[Menu] 🔧 Restore button created and appended');
                }

                // Store reference for hot-reload
                (window as any).__polygenEditorContainer = editorContainer;
                (window as any).__polygenRestoreButton = restoreButton;

                // Start game with test map
                console.log('[Menu] 🎮 Checking this.game:', this.game ? 'exists' : 'NULL');
                if (this.game) {
                    console.log('[Menu] 🎮 Setting currentMapType to custom...');
                    this.game.currentMapType = 'custom';
                    // Hide menu
                    console.log('[Menu] 🎮 Hiding menu...');
                    this.container.classList.add('hidden');
                    // Start game
                    console.log('[Menu] 🎮 Calling game.init()...');
                    this.game.init().then(() => {
                        console.log('[Menu] 🎮 init() completed, calling startGame()...');
                        this.game!.startGame();
                        console.log('[Menu] 🎮 startGame() called!');
                        debugLog("[Menu] Game started in test mode with editor map");
                    }).catch((e: any) => {
                        console.error("[Menu] ❌ Failed to start test game:", e);
                    });
                } else {
                    console.error('[Menu] ❌ this.game is NULL! Cannot start test mode.');
                }
            }

            // Handle HOT RELOAD from editor - apply changes without restarting game
            if (event.data && event.data.type === 'POLYGEN_HOT_RELOAD') {
                console.log('[Menu] 🔥 Received POLYGEN_HOT_RELOAD - applying changes without restart!');

                // Update map data
                if (event.data.mapData) {
                    localStorage.setItem('tx_test_map', JSON.stringify(event.data.mapData));
                    localStorage.setItem('selectedCustomMapData', JSON.stringify(event.data.mapData));
                    console.log('[Menu] 🔥 Map data updated in localStorage');
                }

                // Hide editor, show restore button
                const editorContainer = (window as any).__polygenEditorContainer;
                const restoreButton = (window as any).__polygenRestoreButton;

                if (editorContainer) {
                    editorContainer.style.display = 'none';
                    editorContainer.style.visibility = 'hidden';
                    editorContainer.style.pointerEvents = 'none';
                }

                if (restoreButton) {
                    restoreButton.style.display = 'block';
                }

                // HOT RELOAD: Update game's current map without full restart
                if (this.game && event.data.mapData) {
                    console.log('[Menu] 🔥 Applying hot-reload to running game...');
                    try {
                        // Call game's hot-reload method if available
                        if (typeof (this.game as any).hotReloadMap === 'function') {
                            (this.game as any).hotReloadMap(event.data.mapData);
                            console.log('[Menu] 🔥 Hot-reload successful!');
                        } else {
                            console.log('[Menu] 🔥 No hotReloadMap method - map will update on respawn');
                        }
                    } catch (e) {
                        console.error('[Menu] ❌ Hot-reload error:', e);
                    }
                }
            }
        };
        window.addEventListener('message', messageHandler);

        // Also allow Escape to close (optional, but good for UX)
        /*
        const keyHandler = (e: KeyboardEvent) => {
             if (e.key === "Escape") {
                 window.removeEventListener('keydown', keyHandler);
                 window.removeEventListener('message', messageHandler);
                 closeEditor();
             }
        };
        window.addEventListener('keydown', keyHandler);
        */

    }

    /**
     * Collapse editor to allow game to run (Test Mode)
     */
    private collapseMapEditor(): void {
        debugLog("[Menu] Collapsing map editor for test mode...");

        if (this.editorContainer) {
            // Hide editor container but keep it in DOM
            this.editorContainer.style.display = 'none';

            // Show game canvas
            const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (gameCanvas) {
                gameCanvas.style.display = 'block';
            }

            // Create expand button to restore editor
            this.createExpandEditorButton();
        }
    }

    /**
     * Expand editor back to full screen
     */
    private expandMapEditor(): void {
        debugLog("[Menu] Expanding map editor...");

        if (this.editorContainer) {
            this.editorContainer.style.display = 'block';
        }

        // Hide game canvas
        const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (gameCanvas) {
            gameCanvas.style.display = 'none';
        }

        // Remove expand button
        if (this.expandEditorBtn) {
            this.expandEditorBtn.remove();
            this.expandEditorBtn = null;
        }
    }

    /**
     * Create floating button to expand editor
     */
    private createExpandEditorButton(): void {
        // Remove old button if exists
        if (this.expandEditorBtn) {
            this.expandEditorBtn.remove();
        }

        const btn = document.createElement('button');
        btn.id = 'expand-editor-btn';
        btn.innerHTML = '📝 РЕДАКТОР';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 100000;
            padding: 12px 20px;
            background: linear-gradient(135deg, #0f0 0%, #0a0 100%);
            color: #000;
            border: 2px solid #0f0;
            border-radius: 8px;
            font-family: 'Consolas', monospace;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
            transition: all 0.3s ease;
        `;

        btn.onmouseenter = () => {
            btn.style.transform = 'scale(1.05)';
            btn.style.boxShadow = '0 0 30px rgba(0, 255, 0, 0.8)';
        };
        btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.5)';
        };

        btn.onclick = () => {
            this.expandMapEditor();
        };

        document.body.appendChild(btn);
        this.expandEditorBtn = btn;
    }

    private saveTankConfig(): void {
        localStorage.setItem("tankConfig", JSON.stringify(this.tankConfig));
        window.dispatchEvent(new CustomEvent("tankConfigChanged", { detail: this.tankConfig }));
    }

    private loadTankConfig(): TankConfig {
        const saved = localStorage.getItem("tankConfig");
        if (saved) {
            try {
                return { ...DEFAULT_TANK, ...JSON.parse(saved) };
            } catch (e) { }
        }
        return { ...DEFAULT_TANK };
    }

    // Заглушка для владения: читаем из localStorage, иначе дефолт
    private loadOwnedIds(key: string, fallback: string[]): Set<string> {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set(fallback);
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return new Set(parsed.map((v) => String(v)));
            }
        } catch (_e) {
            // ignore parse errors
        }
        return new Set(fallback);
    }

    private showSettings(): void {
        debugLog("[Menu] showSettings() called");
        debugLog("[Menu] settingsPanel exists:", !!this.settingsPanel);
        if (this.settingsPanel) {
            this.settingsPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.settingsPanel.style.setProperty("display", "flex", "important");
            this.settingsPanel.style.setProperty("visibility", "visible", "important");
            this.settingsPanel.style.setProperty("opacity", "1", "important");
            this.settingsPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.settingsPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.settingsPanel).display);
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] settingsPanel is null!");
        }
    }

    private hideSettings(): void {
        debugLog("[Menu] hideSettings() called");
        if (this.settingsPanel) {
            this.settingsPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.settingsPanel.style.setProperty("display", "none", "important");
            this.settingsPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
    }

    // === AUTH METHODS ===

    private showLogin(): void {
        debugLog("[Menu] showLogin() called - START");

        // Проверяем, что мы в главном меню, а не на паузе
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        const isPaused = pauseButtons && pauseButtons.style.display !== "none";
        const isMainMenu = mainButtons && mainButtons.style.display !== "none";

        if (isPaused || !isMainMenu) {
            debugWarn("[Menu] Login form can only be opened from main menu, not during pause");
            return;
        }

        // СРАЗУ открываем окно, без задержек!
        debugLog("[Menu] Opening login form IMMEDIATELY");
        authUI.showLoginForm({
            onAuthSuccess: () => {
                debugLog("[Menu] Auth success callback called");
                this.updateAuthUI();
            },
            onClose: () => {
                debugLog("[Menu] Auth close callback called");
                this.enforceCanvasPointerEvents();
            }
        });

        // Инициализируем Firebase в фоне (не блокируем открытие окна)
        if (!firebaseService.isInitialized()) {
            debugLog("[Menu] Firebase not initialized, initializing in background...");
            firebaseService.initialize().catch(err => {
                console.error("[Menu] Failed to initialize Firebase:", err);
            });
        }

        this.enforceCanvasPointerEvents();
        debugLog("[Menu] showLogin() called - END");
    }

    private showRegister(): void {
        debugLog("[Menu] showRegister() called - START");

        // Проверяем, что мы в главном меню, а не на паузе
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        const isPaused = pauseButtons && pauseButtons.style.display !== "none";
        const isMainMenu = mainButtons && mainButtons.style.display !== "none";

        if (isPaused || !isMainMenu) {
            debugWarn("[Menu] Register form can only be opened from main menu, not during pause");
            return;
        }

        // СРАЗУ открываем окно, без задержек!
        debugLog("[Menu] Opening register form IMMEDIATELY");
        authUI.showRegisterForm({
            onAuthSuccess: () => {
                debugLog("[Menu] Auth success callback called");
                this.updateAuthUI();
            },
            onClose: () => {
                debugLog("[Menu] Auth close callback called");
                this.enforceCanvasPointerEvents();
            }
        });

        // Инициализируем Firebase в фоне (не блокируем открытие окна)
        if (!firebaseService.isInitialized()) {
            debugLog("[Menu] Firebase not initialized, initializing in background...");
            firebaseService.initialize().catch(err => {
                console.error("[Menu] Failed to initialize Firebase:", err);
            });
        }

        this.enforceCanvasPointerEvents();
        debugLog("[Menu] showRegister() called - END");
    }

    /**
     * Определение ранга игрока на основе статистики
     */
    private getPlayerRank(level: number, kills: number, deaths: number, wins: number): string {
        const kd = deaths > 0 ? kills / deaths : kills;
        const score = level * 10 + kills * 2 + wins * 5 + (kd > 1 ? kd * 10 : 0);

        if (score >= 10000) return "LEGEND";
        if (score >= 7000) return "MASTER";
        if (score >= 5000) return "DIAMOND";
        if (score >= 3000) return "PLATINUM";
        if (score >= 1500) return "GOLD";
        if (score >= 500) return "SILVER";
        return "BRONZE";
    }

    /**
     * Форматирование относительного времени
     */
    private formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return "Только что";
        if (minutes < 60) return `${minutes}м назад`;
        if (hours < 24) return `${hours}ч назад`;
        if (days < 7) return `${days}д назад`;
        return "Давно";
    }

    private showProfile(): void {
        authUI.showUserProfile({
            onAuthSuccess: () => {
                this.updateAuthUI();
            },
            onClose: () => {
                this.enforceCanvasPointerEvents();
            }
        });
        this.enforceCanvasPointerEvents();
    }

    private async updateAuthUI(): Promise<void> {
        const authInfo = document.getElementById("auth-info");
        const authButtons = document.getElementById("auth-buttons");
        const authUsername = document.getElementById("auth-username");
        const authStatus = document.getElementById("auth-status");

        if (!authInfo || !authButtons) return;

        const isAuthenticated = firebaseService.isAuthenticated();

        if (isAuthenticated) {
            // Показываем информацию о пользователе
            authInfo.style.display = "block";
            authButtons.style.display = "none";

            // Получаем username
            const username = await firebaseService.getUsername();
            if (authUsername) {
                authUsername.textContent = username || "Пользователь";
            }

            // Показываем статус верификации
            if (authStatus) {
                const emailVerified = firebaseService.checkEmailVerified();
                if (emailVerified) {
                    authStatus.textContent = "✓";
                    authStatus.style.color = "#0f0";
                    authStatus.title = "Email верифицирован";
                } else {
                    authStatus.textContent = "⚠";
                    authStatus.style.color = "#ff0";
                    authStatus.title = "Email не верифицирован";
                }
            }
        } else {
            // Показываем кнопки входа/регистрации
            authInfo.style.display = "none";
            authButtons.style.display = "flex";
        }

        // Обновляем позывной
        await this.updatePlayerCallsign();
    }

    private async updatePlayerCallsign(): Promise<void> {
        const callsignElement = document.getElementById("player-callsign");
        if (!callsignElement) return;

        const isAuthenticated = firebaseService.isAuthenticated();

        if (isAuthenticated) {
            // Проверяем, является ли пользователь админом
            const isAdmin = await firebaseService.isAdmin();

            if (isAdmin) {
                callsignElement.textContent = "[admin]";
                callsignElement.style.color = "#ff0";
                callsignElement.style.textShadow = "0 0 5px #ff0";
                callsignElement.style.borderColor = "rgba(255, 255, 0, 0.5)";
                callsignElement.style.background = "rgba(255, 255, 0, 0.15)";
            } else {
                // Получаем username
                const username = await firebaseService.getUsername();
                callsignElement.textContent = `[${username || "user"}]`;
                callsignElement.style.color = "#0ff";
                callsignElement.style.textShadow = "0 0 5px #0ff";
                callsignElement.style.borderColor = "rgba(0, 255, 255, 0.3)";
                callsignElement.style.background = "rgba(0, 255, 255, 0.1)";
            }
        } else {
            // Анонимный пользователь - показываем anon_id
            const anonId = firebaseService.getShortAnonId() || "0001";
            callsignElement.textContent = `[anon_id: ${anonId}]`;
            callsignElement.style.color = "#0ff";
            callsignElement.style.textShadow = "0 0 5px #0ff";
            callsignElement.style.borderColor = "rgba(0, 255, 255, 0.3)";
            callsignElement.style.background = "rgba(0, 255, 255, 0.1)";
        }
    }

    private async toggleFullscreen(): Promise<void> {
        const entering = !document.fullscreenElement;
        if (entering) {
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                    this.syncFullscreenState(true);
                }
            } catch (err: any) {
                logger.error(`Error entering fullscreen: ${err?.message || err}`);
                this.syncFullscreenState(false);
            }
        } else {
            try {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                    this.syncFullscreenState(false);
                }
            } catch (err: any) {
                logger.error(`Error exiting fullscreen: ${err?.message || err}`);
                this.syncFullscreenState(!!document.fullscreenElement);
            }
        }
    }

    private updateFullscreenButton(isFullscreen: boolean): void {
        const L = getLang(this.settings);
        const icon = document.getElementById("fullscreen-icon");
        const label = document.getElementById("fullscreen-label");

        if (icon) {
            icon.textContent = isFullscreen ? "⛶" : "⛶";
        }
        if (label) {
            label.textContent = isFullscreen ? L.exitFullscreen : L.fullscreen;
        }

        const checkbox = document.getElementById("set-fullscreen") as HTMLInputElement | null;
        if (checkbox) {
            checkbox.checked = isFullscreen;
        }
    }

    private syncFullscreenState(isFullscreen: boolean): void {
        this.settings.fullscreen = isFullscreen;
        this.updateFullscreenButton(isFullscreen);
    }

    private handleFullscreenCheckbox(checked: boolean): void {
        if (checked && !document.fullscreenElement) {
            this.toggleFullscreen();
        } else if (!checked && document.fullscreenElement) {
            this.toggleFullscreen();
        } else {
            this.syncFullscreenState(!!document.fullscreenElement);
        }
    }



    private loadSettings(): GameSettings {
        return loadSettingsModule();
    }

    setOnStartGame(callback: (mapType?: MapType, mapData?: any) => void): void {
        this.onStartGame = callback;
    }

    setOnRestartGame(callback: () => void): void {
        this.onRestartGame = callback;
    }

    setOnExitBattle(callback: () => void): void {
        this.onExitBattle = callback;
    }

    setOnPlayIntroSound(callback: () => void): void {
        this.onPlayIntroSound = callback;
    }

    getSettings(): GameSettings {
        return this.settings;
    }

    getTankConfig(): TankConfig {
        return this.tankConfig;
    }

    // ИСПРАВЛЕНО: Геттер для получения PlayerProgression из game.ts
    getPlayerProgression(): PlayerProgressionSystem | null {
        return this.playerProgression;
    }

    show(isPaused: boolean = false): void {

        debugLog("[Menu] show() called");
        if (!this.container) {

            console.error("[Menu] Container not initialized in show()!");
            return;
        }
        this.container.classList.remove("hidden");
        // Убираем inline стили display/visibility - CSS уже задает display: flex
        this.container.style.removeProperty("display");
        this.container.style.removeProperty("visibility");
        document.body.classList.add("menu-visible");

        // Настраиваем callbacks для лобби при показе меню
        setTimeout(() => {
            this.setupLobbyCallbacks();
            // Запускаем автообновление если оно было включено
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager && this.lobbyAutoRefreshEnabled) {
                this.startLobbyAutoRefresh(multiplayerManager);
            }
        }, 500);

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';

        // Добавляем класс "in-battle" если игра запущена (для 50% прозрачности фона)
        const game = (window as any).gameInstance;
        if (game && game.gameStarted) {
            this.container.classList.add("in-battle");
        } else {
            this.container.classList.remove("in-battle");
        }

        // Немедленное обновление при показе меню (без анимации для первой загрузки)
        this.updatePlayerInfo(true);
        // Также обновляем через небольшую задержку для гарантии
        setTimeout(() => {
            this.updatePlayerInfo(true);
        }, 50);

        // Показываем/скрываем кнопки в зависимости от того, на паузе ли игра
        this.updatePauseButtons(isPaused);

        // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas СРАЗУ
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (canvas) {
            canvas.style.setProperty("pointer-events", "none", "important");
            canvas.style.setProperty("z-index", "0", "important");
        }

        // КРИТИЧЕСКИ ВАЖНО: Переустанавливаем обработчики событий при каждом показе меню
        this.setupMenuEventHandlers();

        // КРИТИЧЕСКИ ВАЖНО: Переустанавливаем защиту canvas при каждом показе меню
        this.setupCanvasPointerEventsProtection();

        // Переустанавливаем прямые обработчики на кнопки
        // Для кнопок авторизации важно привязать обработчики сразу, без задержки
        if (!this.buttonHandlersAttached) {
            // Привязываем обработчики сразу, без задержки для кнопок авторизации
            this.attachDirectButtonHandlers();
            // Если на паузе - дополнительно прикрепляем обработчики к кнопкам паузы
            if (isPaused) {
                setTimeout(() => {
                    this.attachPauseButtonHandlers();
                }, 50);
            }
        } else if (isPaused) {
            // Если обработчики уже привязаны, но игра на паузе - привязываем только паузу
            setTimeout(() => {
                this.attachPauseButtonHandlers();
            }, 50);
        } else {
            // Если обработчики уже привязаны и мы в главном меню, убеждаемся что кнопки авторизации работают
        }

        // Принудительно блокируем pointer-events на canvas МНОЖЕСТВЕННО
        this.enforceCanvasPointerEvents();
        setTimeout(() => this.enforceCanvasPointerEvents(), 0);
        setTimeout(() => this.enforceCanvasPointerEvents(), 10);

    }

    private updatePauseButtons(isPaused: boolean): void {
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        const authSection = document.getElementById("auth-section");

        if (pauseButtons) {
            pauseButtons.style.display = isPaused ? "block" : "none";
        }
        if (mainButtons) {
            mainButtons.style.display = isPaused ? "none" : "block";
        }

        // Скрываем секцию авторизации во время паузы
        if (authSection) {
            authSection.style.display = isPaused ? "none" : "block";
        }

        // Если показываем кнопки паузы, нужно перепривязать обработчики
        if (isPaused) {
            setTimeout(() => {
                this.attachPauseButtonHandlers();
                debugLog("[Menu] Pause button handlers reattached");
            }, 100);
        }
    }

    private attachPauseButtonHandlers(): void {
        // Прямое прикрепление обработчиков к кнопкам паузы
        const resumeBtn = document.getElementById("btn-resume") as HTMLButtonElement;
        const restartBtn = document.getElementById("btn-restart") as HTMLButtonElement;
        const exitBtn = document.getElementById("btn-exit-battle") as HTMLButtonElement;
        const pauseContainer = document.getElementById("pause-buttons");

        // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что контейнер и кнопки кликабельны
        if (pauseContainer) {
            pauseContainer.style.setProperty("pointer-events", "auto", "important");
            pauseContainer.style.setProperty("z-index", "10000", "important");
            pauseContainer.style.setProperty("position", "relative", "important");
        }

        const setupButton = (btn: HTMLButtonElement | null, name: string, handler: () => void) => {
            if (!btn) return;

            // Принудительно делаем кнопку кликабельной
            btn.style.setProperty("pointer-events", "auto", "important");
            btn.style.setProperty("cursor", "pointer", "important");
            btn.style.setProperty("z-index", "10001", "important");
            btn.disabled = false;

            // Удаляем старые обработчики
            btn.onclick = null;

            // Добавляем обработчик только через onclick (не дублируем!)
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                debugLog(`[Menu] ${name} button clicked`);
                handler();
            };

            debugLog(`[Menu] ${name} button setup complete`);
        };

        setupButton(resumeBtn, "Resume", () => this.resumeGame());
        setupButton(restartBtn, "Restart", () => this.restartGame());
        setupButton(exitBtn, "Exit", () => this.exitBattle());

        debugLog("[Menu] Pause button handlers attached directly:", {
            resume: !!resumeBtn,
            restart: !!restartBtn,
            exit: !!exitBtn,
            container: !!pauseContainer
        });
    }

    private resumeGame(): void {
        debugLog("[Menu] resumeGame() called");
        // Если игра запущена и на паузе, возобновляем игру
        const game = (window as any).gameInstance;
        if (game && game.gameStarted && game.gamePaused) {
            debugLog("[Menu] Resuming game via togglePause()");
            game.togglePause();
        } else {
            // Fallback: отправляем событие
            debugLog("[Menu] Dispatching resumeGame event");
            window.dispatchEvent(new CustomEvent("resumeGame"));
        }
        this.hide();
    }

    private restartGame(): void {
        debugLog("[Menu] Restart game requested");
        this.showConfirmDialog(
            "🔄 ПЕРЕЗАГРУЗИТЬ",
            "Перезагрузить игру на этой карте?",
            () => {
                this.onRestartGame();
                this.hide();
            }
        );
    }

    private exitBattle(): void {
        debugLog("[Menu] Exit battle requested");
        this.showConfirmDialog(
            "🚪 ВЫЙТИ ИЗ БОЯ",
            "Вы уверены, что хотите выйти?",
            () => {
                this.onExitBattle();
                this.hide();
            }
        );
    }

    private showConfirmDialog(title: string, message: string, onConfirm: () => void): void {
        // Создаём оверлей
        const overlay = document.createElement("div");
        overlay.className = "confirm-dialog-overlay";
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100000;
        `;

        // Создаём диалог
        const dialog = document.createElement("div");
        dialog.className = "confirm-dialog";
        dialog.style.cssText = `
            background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%);
            border: 2px solid #0f0;
            border-radius: 10px;
            padding: 30px 40px;
            text-align: center;
            font-family: 'Press Start 2P', monospace;
            box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
            min-width: 350px;
        `;

        dialog.innerHTML = `
            <h2 style="color: #0f0; margin: 0 0 20px 0; font-size: 18px;">${title}</h2>
            <p style="color: #aaa; margin: 0 0 30px 0; font-size: 12px;">${message}</p>
            <div style="display: flex; gap: 20px; justify-content: center;">
                <button id="confirm-yes" style="
                    background: #0f0;
                    color: #000;
                    border: none;
                    padding: 12px 30px;
                    font-family: inherit;
                    font-size: 12px;
                    cursor: pointer;
                    border-radius: 5px;
                ">ДА</button>
                <button id="confirm-no" style="
                    background: #333;
                    color: #fff;
                    border: 1px solid #666;
                    padding: 12px 30px;
                    font-family: inherit;
                    font-size: 12px;
                    cursor: pointer;
                    border-radius: 5px;
                ">НЕТ</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Обработчики кнопок
        const yesBtn = dialog.querySelector("#confirm-yes") as HTMLButtonElement;
        const noBtn = dialog.querySelector("#confirm-no") as HTMLButtonElement;

        const closeDialog = () => {
            overlay.remove();
        };

        yesBtn.onclick = () => {
            closeDialog();
            onConfirm();
        };

        noBtn.onclick = closeDialog;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeDialog();
        };

        // Hover эффекты
        yesBtn.onmouseenter = () => { yesBtn.style.background = "#0c0"; };
        yesBtn.onmouseleave = () => { yesBtn.style.background = "#0f0"; };
        noBtn.onmouseenter = () => { noBtn.style.background = "#444"; };
        noBtn.onmouseleave = () => { noBtn.style.background = "#333"; };
    }

    isVisible(): boolean {
        return !this.container.classList.contains("hidden");
    }

    /**
     * Настройка обработчика ESC для возврата в игру
     */
    private setupEscHandler(): void {
        // Удаляем старый обработчик если есть
        const oldEscHandler = (this.container as any)._escHandler;
        if (oldEscHandler) {
            window.removeEventListener("keydown", oldEscHandler, true);
        }

        // ИСПРАВЛЕНО: ESC теперь работает как переключатель (toggle)
        // Обработчик в menu.ts только закрывает меню, переключение обрабатывается в game.ts
        const escHandler = (e: KeyboardEvent) => {
            if (e.code === "Escape" && this.isVisible()) {
                const game = (window as any).gameInstance;
                // Если игра запущена, закрываем меню и возобновляем игру
                if (game && game.gameStarted) {
                    debugLog("[Menu] ESC pressed - closing menu and resuming game");
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // КРИТИЧНО: Блокируем движение мыши ПЕРЕД закрытием меню через флаг
                    if (game.pointerMoveBlocked !== undefined) {
                        game.pointerMoveBlocked = true;

                        // Разблокируем через задержку
                        setTimeout(() => {
                            game.pointerMoveBlocked = false;
                        }, 400);
                    }

                    this.hide();
                    if (game.gamePaused) {
                        game.togglePause();
                    }
                } else {
                    // Если игра не запущена, просто закрываем меню
                    debugLog("[Menu] ESC pressed - closing menu");
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.hide();
                }
            }
        };

        // Сохраняем ссылку на обработчик
        (this.container as any)._escHandler = escHandler;

        // Добавляем обработчик на window для перехвата ESC
        window.addEventListener("keydown", escHandler, true); // Используем capture phase для приоритета
        
        // НАВИГАЦИЯ КЛАВИАТУРОЙ: Стрелки, Tab, Enter
        this.setupKeyboardNavigation();
    }
    
    /**
     * Настройка навигации клавиатурой для всех меню
     */
    private setupKeyboardNavigation(): void {
        const keyHandler = (e: KeyboardEvent) => {
            if (!this.isVisible()) return;
            
            // Получаем все фокусируемые элементы
            const focusableElements = this.container.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            
            if (focusableElements.length === 0) return;
            
            const currentIndex = Array.from(focusableElements).findIndex(el => el === document.activeElement);
            
            // Стрелки вверх/вниз для навигации
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                
                let nextIndex: number;
                if (e.key === "ArrowDown") {
                    nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
                } else {
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
                }
                
                const nextElement = focusableElements[nextIndex];
                if (nextElement) {
                    nextElement.focus();
                    // Прокручиваем в видимую область
                    nextElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
                return;
            }
            
            // Tab для навигации (стандартное поведение, но с обработкой)
            if (e.key === "Tab") {
                // Разрешаем стандартное поведение Tab, но добавляем визуальную индикацию
                const activeEl = document.activeElement as HTMLElement;
                if (activeEl && activeEl.classList) {
                    activeEl.classList.add("keyboard-focused");
                    setTimeout(() => activeEl.classList.remove("keyboard-focused"), 200);
                }
                return;
            }
            
            // Enter для активации кнопок
            if (e.key === "Enter" && document.activeElement instanceof HTMLElement) {
                const activeEl = document.activeElement;
                if (activeEl.tagName === "BUTTON" || activeEl.getAttribute("role") === "button") {
                    e.preventDefault();
                    e.stopPropagation();
                    activeEl.click();
                }
            }
        };
        
        window.addEventListener("keydown", keyHandler, true);
        
        // Сохраняем ссылку для очистки
        (this.container as any)._keyboardNavHandler = keyHandler;
    }

    hide(): void {
        this.container.classList.add("hidden");
        this.container.classList.remove("in-battle");
        document.body.classList.remove("menu-visible");

        // Останавливаем автообновление лобби при скрытии меню
        this.stopLobbyAutoRefresh();

        // КРИТИЧНО: Скрываем ВСЕ панели при входе в битву
        this.hideSettings();
        this.hideStats();
        this.hideSkills();
        this.hideProgress();
        this.hideMapSelection();

        // Скрываем playMenuPanel если открыто
        if (this.playMenuPanel) {
            this.playMenuPanel.classList.remove("visible");
            this.playMenuPanel.style.setProperty("display", "none", "important");
            this.playMenuPanel.style.setProperty("visibility", "hidden", "important");
        }

        // Разрешаем pointer-events на canvas и восстанавливаем видимость
        this.enforceCanvasPointerEvents();

        // Дополнительно убеждаемся, что canvas виден
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (canvas) {
            canvas.style.setProperty("display", "block", "important");
            canvas.style.setProperty("visibility", "visible", "important");
            canvas.style.setProperty("opacity", "1", "important");
            canvas.style.setProperty("z-index", "0", "important");
        }

        // Также отправляем событие для Game класса
        window.dispatchEvent(new CustomEvent("menuVisibilityChanged", { detail: { visible: false } }));

        // Восстанавливаем курсор только если игра активна
        const game = (window as any).gameInstance;
        if (game?.gameStarted && !game.gamePaused) {
            document.body.style.cursor = 'none';
        }
    }
}

// Глобальная функция для показа меню (можно вызвать из консоли)
(window as any).showMainMenu = async function () {
    const game = (window as any).gameInstance;
    if (!game) {
        console.error("Game instance not found!");
        return;
    }

    // Если меню не загружено, загружаем его
    if (!game.mainMenu) {
        console.log("Menu not loaded, loading...");
        if (game.loadMainMenu) {
            await game.loadMainMenu();
        } else {
            console.error("loadMainMenu method not found!");
            return;
        }
    }

    if (game.mainMenu) {
        console.log("Showing menu...");
        game.mainMenu.show();
        console.log("Главное меню показано");

        // Проверяем состояние через небольшую задержку
        setTimeout(() => {
            const menu = document.getElementById("main-menu");
            console.log("Menu state check:", {
                menuElement: !!menu,
                inDOM: menu ? document.body.contains(menu) : false,
                hasHiddenClass: menu ? menu.classList.contains("hidden") : false,
                computedDisplay: menu ? window.getComputedStyle(menu).display : "N/A",
                computedVisibility: menu ? window.getComputedStyle(menu).visibility : "N/A",
                computedZIndex: menu ? window.getComputedStyle(menu).zIndex : "N/A"
            });
        }, 100);
    } else {
        console.error("Главное меню не найдено после загрузки.");
    }
};

// Глобальная функция для скрытия меню
(window as any).hideMainMenu = function () {
    const game = (window as any).gameInstance;
    if (game && game.mainMenu) {
        game.mainMenu.hide();
        console.log("Главное меню скрыто");
    } else {
        console.error("Главное меню не найдено.");
    }
};

// Глобальная функция для выбора режима при создании комнаты
(window as any).selectMpCreateRoomMode = function (mode: string) {
    debugLog("[Menu] selectMpCreateRoomMode called with:", mode);
    const game = (window as any).gameInstance;
    if (game && game.mainMenu) {
        const menu = game.mainMenu as MainMenu;
        // Сохраняем выбранный режим
        (menu as any).selectedCreateRoomMode = mode;
        // Сбрасываем выбранную карту
        (menu as any).selectedCreateRoomMap = undefined;

        // Открываем панель выбора карты
        (menu as any).hideAllPlayWindows();
        (menu as any).showPlayWindow("mp-create-room-map", 0.5, 0.5);
    } else {
        console.error("[Menu] Game or mainMenu not found");
    }
};

// Глобальная функция для выбора карты при создании комнаты
(window as any).selectMpCreateRoomMap = function (mapType: string, element: HTMLElement) {
    debugLog("[Menu] selectMpCreateRoomMap called with:", mapType);
    const game = (window as any).gameInstance;
    if (game && game.mainMenu) {
        const menu = game.mainMenu as MainMenu;

        // ДИАГНОСТИКА: Явно логируем и показываем подтверждение выбора карты
        debugLog(`[Menu] 🗺️ SELECTED MAP: ${mapType}`);
        // alert(`Выбрана карта: ${mapType}`); // Uncomment for extreme debugging

        // Сохраняем выбранную карту
        (menu as any).selectedCreateRoomMap = mapType;
        debugLog(`[Menu] Saved map type to menu instance: ${(menu as any).selectedCreateRoomMap}`);

        // Убираем выделение со всех карточек
        const allCards = document.querySelectorAll("#mp-create-room-map .map-card");
        allCards.forEach(card => {
            (card as HTMLElement).style.border = "2px solid rgba(0, 255, 80, 0.3)";
            (card as HTMLElement).style.boxShadow = "";
            (card as HTMLElement).style.background = "rgba(0, 20, 0, 0.4)";
            (card as HTMLElement).style.transform = "";
            card.classList.remove("selected");
        });

        // Выделяем выбранную карточку - ОЧЕНЬ ЗАМЕТНО
        if (element) {
            element.style.border = "3px solid #4ade80";
            element.style.boxShadow = "0 0 20px rgba(74, 222, 128, 0.8), 0 0 40px rgba(74, 222, 128, 0.4), inset 0 0 20px rgba(74, 222, 128, 0.2)";
            element.style.background = "linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(34, 197, 94, 0.2) 100%)";
            element.style.transform = "scale(1.05)";
            element.classList.add("selected");
        }
    } else {
        console.error("[Menu] Game or mainMenu not found");
    }
};

// Инициализация обработчиков настроек ботов при загрузке DOM
document.addEventListener("DOMContentLoaded", () => {
    // Обработчик чекбокса "Включить ботов"
    const enableBotsCheckbox = document.getElementById("mp-enable-bots") as HTMLInputElement;
    const botCountWrapper = document.getElementById("mp-bot-count-wrapper");
    const botCountSlider = document.getElementById("mp-bot-count") as HTMLInputElement;
    const botCountValue = document.getElementById("mp-bot-count-value");

    if (enableBotsCheckbox && botCountWrapper) {
        enableBotsCheckbox.addEventListener("change", () => {
            botCountWrapper.style.display = enableBotsCheckbox.checked ? "block" : "none";
        });
    }

    if (botCountSlider && botCountValue) {
        botCountSlider.addEventListener("input", () => {
            botCountValue.textContent = botCountSlider.value;
        });
    }
});

// Глобальная функция для запуска создания комнаты
(window as any).startMpCreateRoom = async function () {
    debugLog("[Menu] startMpCreateRoom called");

    // КРИТИЧНО: Очищаем custom map данные при создании мультиплеер комнаты
    // Это гарантирует, что все игроки увидят одинаковую карту с сервера
    localStorage.removeItem("selectedCustomMapData");
    localStorage.removeItem("selectedCustomMapIndex");
    debugLog("[Menu] 🗺️ Очищены данные custom карты при создании комнаты (startMpCreateRoom)");

    const game = (window as any).gameInstance;
    if (game && game.mainMenu) {
        const menu = game.mainMenu as MainMenu;
        const mode = (menu as any).selectedCreateRoomMode || "ffa";
        const mapType = (menu as any).selectedCreateRoomMap || "normal";

        debugLog(`[Menu] 🚀 STARTING CREATE ROOM. Mode: ${mode}, Map: ${mapType}`);
        debugLog(`[Menu] Value in menu.selectedCreateRoomMap: ${(menu as any).selectedCreateRoomMap}`);

        if (mapType === "normal" && (menu as any).selectedCreateRoomMap === undefined) {
            debugWarn("[Menu] ⚠️ Warning: Map defaulted to 'normal' because selectedCreateRoomMap was undefined!");
        }

        debugLog(`[Menu] 🔍 startMpCreateRoom: Selected Map '${mapType}' (Var type: ${typeof mapType})`);
        debugLog("[Menu] Creating room with mode:", mode, "and map:", mapType);

        // Получаем или создаем MultiplayerManager
        let multiplayerManager = game.multiplayerManager;

        if (!multiplayerManager) {
            console.error("[Menu] MultiplayerManager not available");
            alert("Подключение к серверу не установлено. Попробуйте обновить страницу.");
            return;
        }

        // Проверяем подключение
        if (!multiplayerManager.isConnected()) {
            alert("Нет подключения к серверу. Ожидание...");
            // Ждём подключения
            let attempts = 0;
            while (!multiplayerManager.isConnected() && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            if (!multiplayerManager.isConnected()) {
                alert("Не удалось подключиться к серверу.");
                return;
            }
        }

        // Устанавливаем временный callback для открытия панели комнаты после создания
        const originalCallback = (multiplayerManager as any).onRoomCreatedCallback;

        multiplayerManager.onRoomCreated((data: any) => {
            debugLog("[Menu] Room created via startMpCreateRoom:", data);
            const roomId = data.roomId || multiplayerManager.getRoomId();

            if (roomId) {
                // Обновляем информацию в панели комнаты
                (menu as any).updateRoomPanel(roomId, mode, mapType);

                // Закрываем все панели и открываем панель комнаты
                (menu as any).hideAllPlayWindows();

                // Показываем панель комнаты
                const roomPanel = document.getElementById("mp-room-panel");
                if (roomPanel) {
                    roomPanel.style.display = "block";
                    roomPanel.style.zIndex = "100020";
                }

                // Убеждаемся, что меню видимо
                menu.show();

                (menu as any).showPlayWindow("mp-room-panel", 3, 3);
                debugLog("[Menu] Room panel shown for room:", roomId);
            } else {
                console.error("[Menu] Room created but no roomId in data");
            }

            // Восстанавливаем оригинальный callback
            if (originalCallback) {
                (multiplayerManager as any).onRoomCreatedCallback = originalCallback;
            }
        });

        // Получаем настройки ботов
        const enableBotsCheckbox = document.getElementById("mp-enable-bots") as HTMLInputElement;
        const botCountSlider = document.getElementById("mp-bot-count") as HTMLInputElement;
        const enableBots = enableBotsCheckbox?.checked || false;
        const botCount = enableBots ? parseInt(botCountSlider?.value || "4", 10) : 0;

        debugLog(`[Menu] 🤖 Bot settings: enableBots=${enableBots}, botCount=${botCount}`);

        // Создаем комнату через multiplayerManager напрямую с mapType и настройками ботов
        try {
            // Если выбрана custom карта, загружаем её данные из localStorage
            let customMapData = null;
            if (mapType === 'custom') {
                try {
                    const savedMapData = localStorage.getItem("selectedCustomMapData");
                    if (savedMapData) {
                        customMapData = JSON.parse(savedMapData);
                        console.log("[Menu] 📦 Loaded custom map data for multiplayer room:", customMapData.name);
                    } else {
                        console.warn("[Menu] ⚠️ Custom map selected but no data found in localStorage!");
                    }
                } catch (e) {
                    console.error("[Menu] Failed to parse custom map data:", e);
                }
            }

            const success = multiplayerManager.createRoom(mode as any, 32, false, mapType, enableBots, botCount, customMapData);
            if (!success) {
                console.error("[Menu] Failed to create room");
                alert("Не удалось создать комнату. Проверьте подключение.");
            } else {
                debugLog("[Menu] Room creation request sent:", mode, mapType, "bots:", enableBots, botCount);
            }
        } catch (error) {
            console.error("[Menu] Error creating room:", error);
            alert("Ошибка создания комнаты: " + error);
        }
    } else {
        console.error("[Menu] Game or mainMenu not found");
        alert("Игра не инициализирована. Попробуйте обновить страницу.");
    }
};


