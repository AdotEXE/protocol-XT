/**
 * World Generation Menu - Улучшенное меню настройки генерации мира (Ctrl+9)
 */

import { Game } from "./game";
import { ChunkSystem } from "./chunkSystem";
import { MapType } from "./menu";
import { CommonStyles } from "./commonStyles";
import { inGameAlert, inGameConfirm } from "./utils/inGameDialogs";

export interface WorldGenSettings {
    // Chunk settings
    chunkSize: number;
    renderDistance: number;
    unloadDistance: number;

    // World settings
    worldSeed: number;
    useRandomSeed: boolean;

    // Road network settings
    highwaySpacing: number;
    streetSpacing: number;

    // POI settings
    poiSpacing: number;
    poiDensity: number; // multiplier 0.5 - 2.0

    // Cover settings
    coverDensity: number; // multiplier 0.5 - 2.0

    // Consumables settings
    consumablesMin: number;
    consumablesMax: number;

    // Terrain settings
    terrainDetail: number; // 0.5 - 2.0
    biomeTransitionSmoothness: number; // 0.1 - 1.0

    // Custom Map Dimensions
    useCustomMapSize: boolean;
    customMapWidth: number;
    customMapDepth: number;

    // Map-specific settings
    mapSpecific: {
        polygon?: {
            arenaSize: number;
            targetCount: number;
            obstacleDensity: number;
        };
        frontline?: {
            trenchDensity: number;
            craterCount: number;
            bunkerCount: number;
        };
        ruins?: {
            buildingDensity: number;
            destructionLevel: number;
            rubbleCount: number;
        };
        canyon?: {
            mountainHeight: number;
            riverCount: number;
            lakeCount: number;
            forestDensity: number;
        };
        industrial?: {
            factoryCount: number;
            portSize: number;
            craneCount: number;
        };
        urban_warfare?: {
            buildingHeight: number;
            streetGridDensity: number;
            barricadeDensity: number;
        };
        underground?: {
            caveSize: number;
            mineComplexity: number;
            lightingIntensity: number;
        };
        coastal?: {
            lighthouseCount: number;
            portSize: number;
            cliffHeight: number;
        };
    };
}

export interface WorldGenProfile {
    name: string;
    settings: WorldGenSettings;
    createdAt: number;
    description?: string;
}

export class WorldGenerationMenu {
    private container!: HTMLDivElement;
    private visible = false;
    private game: Game | null = null;
    private chunkSystem: ChunkSystem | null = null;
    private currentTab: string = "general";
    private profiles: WorldGenProfile[] = [];
    private currentProfile: string | null = null;

    private settings: WorldGenSettings = {
        chunkSize: 80,
        renderDistance: 1.5,
        unloadDistance: 2.5,
        worldSeed: 12345,
        useRandomSeed: false,
        highwaySpacing: 200,
        streetSpacing: 30,
        poiSpacing: 150,
        poiDensity: 1.0,
        coverDensity: 1.0,
        consumablesMin: 2,
        consumablesMax: 4,
        terrainDetail: 1.0,
        biomeTransitionSmoothness: 0.5,
        useCustomMapSize: false,
        customMapWidth: 1000,
        customMapDepth: 1000,
        mapSpecific: {}
    };

    constructor() {
        this.createUI();
        this.setupToggle();
        this.setupEscHandler();
        this.loadSettings();
        this.loadProfiles();
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }

    private setupEscHandler(): void {
        window.addEventListener("keydown", (e) => {
            if (e.code === "Escape" && this.visible) {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            }
        }, true);
    }

    setGame(game: Game): void {
        this.game = game;
        if (game.chunkSystem) {
            this.chunkSystem = game.chunkSystem;
            this.loadCurrentSettings();
            this.updateMapInfo();
        }
    }

    private loadCurrentSettings(): void {
        if (!this.chunkSystem) return;

        // Загружаем текущие настройки из ChunkSystem
        const config = (this.chunkSystem as any).config;
        if (config) {
            this.settings.chunkSize = config.chunkSize || 80;
            this.settings.renderDistance = config.renderDistance || 1.5;
            this.settings.unloadDistance = config.unloadDistance || 2.5;
            this.settings.worldSeed = config.worldSeed || 12345;

            // Если в конфиге уже есть кастомные размеры
            if (config.customBounds) {
                this.settings.useCustomMapSize = true;
                this.settings.customMapWidth = config.customBounds.width;
                this.settings.customMapDepth = config.customBounds.depth;
            }

            this.updateUI();
        }
    }

    private updateMapInfo(): void {
        if (!this.game) return;

        const mapType = (this.game as any).currentMapType || "normal";
        const mapInfoEl = document.getElementById("current-map-info");
        if (mapInfoEl) {
            const mapNames: Record<MapType, string> = {
                sandbox: "Песочница",
                sand: "Песок",
                madness: "Безумие",
                expo: "Экспо",
                brest: "Брест",
                arena: "Арена",
                polygon: "Полигон",
                frontline: "Передовая",
                ruins: "Руины",
                canyon: "Каньон",
                industrial: "Промышленная",
                urban_warfare: "Городские бои",
                underground: "Подземная",
                coastal: "Прибрежная",
                tartaria: "Тартария",
                custom: "Пользовательская"
            };
            const key = mapType as MapType;
            const mapName = mapNames[key] ?? mapType;
            mapInfoEl.textContent = `Текущая карта: ${mapName}`;
        }
    }

    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();

        // Создаём контейнер
        this.container = document.createElement("div");
        this.container.id = "world-generation-menu";
        this.container.className = "panel-overlay";

        // Создаём панель
        const panel = document.createElement("div");
        panel.className = "panel";
        panel.style.cssText = `
            width: 95%;
            max-width: 1200px;
            max-height: 95vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Заголовок
        const header = document.createElement("div");
        header.className = "panel-header";
        header.style.cssText = `display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;`;

        const titleGroup = document.createElement("div");
        titleGroup.style.cssText = `display: flex; flex-direction: column; gap: 5px;`;

        const title = document.createElement("div");
        title.className = "panel-title";
        title.textContent = "ГЕНЕРАЦИЯ МИРА [Ctrl+9]";

        const mapInfo = document.createElement("div");
        mapInfo.id = "current-map-info";
        mapInfo.textContent = "Текущая карта: Загрузка...";
        mapInfo.style.cssText = `
            font-size: 12px;
            color: #7f7;
            font-family: 'Press Start 2P', monospace;
        `;

        titleGroup.appendChild(title);
        titleGroup.appendChild(mapInfo);

        const closeBtn = document.createElement("button");
        closeBtn.className = "panel-close";
        closeBtn.textContent = "×";
        closeBtn.onclick = () => this.toggle();

        header.appendChild(titleGroup);
        header.appendChild(closeBtn);

        // Вкладки
        const tabsContainer = document.createElement("div");
        tabsContainer.style.cssText = `
            background: rgba(15, 52, 96, 0.5);
            border-bottom: 2px solid #0f3460;
            display: flex;
            gap: 5px;
            padding: 10px;
            overflow-x: auto;
        `;

        const tabs = [
            { id: "general", label: "📊 Общие", icon: "📊" },
            { id: "world", label: "🌍 Мир", icon: "🌍" },
            { id: "objects", label: "🏗️ Объекты", icon: "🏗️" },
            { id: "map-specific", label: "🗺️ Карта", icon: "🗺️" },
            { id: "profiles", label: "💾 Профили", icon: "💾" },
            { id: "stats", label: "📈 Статистика", icon: "📈" }
        ];

        tabs.forEach(tab => {
            const tabBtn = document.createElement("button");
            tabBtn.id = `tab-${tab.id}`;
            tabBtn.textContent = tab.label;
            tabBtn.style.cssText = `
                padding: 10px 20px;
                background: ${this.currentTab === tab.id ? "rgba(0, 255, 4, 0.3)" : "rgba(0, 5, 0, 0.5)"};
                border: 1px solid ${this.currentTab === tab.id ? "rgba(0, 255, 4, 0.6)" : "rgba(0, 255, 4, 0.4)"};
                border-radius: 4px;
                color: ${this.currentTab === tab.id ? "#0f0" : "#7f7"};
                font-size: 12px;
                font-family: 'Press Start 2P', monospace;
                cursor: pointer;
                transition: all 0.3s ease;
                white-space: nowrap;
            `;
            tabBtn.onmouseover = () => {
                if (this.currentTab !== tab.id) {
                    tabBtn.style.background = "rgba(0, 255, 4, 0.2)";
                    tabBtn.style.color = "#0f0";
                }
            };
            tabBtn.onmouseout = () => {
                if (this.currentTab !== tab.id) {
                    tabBtn.style.background = "rgba(0, 5, 0, 0.5)";
                    tabBtn.style.color = "#7f7";
                }
            };
            tabBtn.onclick = () => this.switchTab(tab.id);
            tabsContainer.appendChild(tabBtn);
        });

        // Контент с прокруткой
        const content = document.createElement("div");
        content.id = "menu-content";
        content.className = "panel-content";
        content.style.cssText = `
            flex: 1;
        `;

        // Футер с кнопками
        const footer = document.createElement("div");
        footer.style.cssText = `
            background: rgba(0, 20, 0, 0.8);
            padding: 20px;
            border-top: 2px solid rgba(0, 255, 4, 0.4);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            font-family: 'Press Start 2P', monospace;
        `;

        const infoText = document.createElement("div");
        infoText.textContent = "⚠️ Изменения применяются при следующей генерации чанков или перезапуске игры";
        infoText.style.cssText = `
            color: #ff0;
            font-size: 12px;
            display: flex;
            align-items: center;
            font-family: 'Press Start 2P', monospace;
        `;

        const buttonGroup = document.createElement("div");
        buttonGroup.style.cssText = `display: flex; gap: 10px; flex-wrap: wrap;`;

        const exportBtn = this.createButton("📥 Экспорт", "#9b59b6", () => this.exportSettings());
        const importBtn = this.createButton("📤 Импорт", "#9b59b6", () => this.importSettings());
        const resetBtn = this.createButton("🔄 Сбросить", "#666", () => this.resetSettings());
        const saveBtn = this.createButton("💾 Сохранить", "#4a9eff", () => this.saveSettings());
        const applyBtn = this.createButton("✅ Применить", "#44ff44", () => this.applySettings());
        const reloadBtn = this.createButton("🔄 Перезагрузить мир", "#ff8844", () => this.reloadWorld());

        buttonGroup.appendChild(exportBtn);
        buttonGroup.appendChild(importBtn);
        buttonGroup.appendChild(resetBtn);
        buttonGroup.appendChild(saveBtn);
        buttonGroup.appendChild(applyBtn);
        buttonGroup.appendChild(reloadBtn);

        footer.appendChild(infoText);
        footer.appendChild(buttonGroup);

        panel.appendChild(tabsContainer);
        panel.appendChild(content);
        panel.appendChild(footer);

        this.container.appendChild(panel);
        document.body.appendChild(this.container);

        // Инициализируем первую вкладку
        this.switchTab("general");
    }

    private switchTab(tabId: string): void {
        this.currentTab = tabId;

        // Обновляем стили вкладок
        document.querySelectorAll("#world-generation-menu button[id^='tab-']").forEach(btn => {
            const isActive = btn.id === `tab-${tabId}`;
            (btn as HTMLButtonElement).style.background = isActive ? "#4a9eff" : "rgba(15, 52, 96, 0.5)";
            (btn as HTMLButtonElement).style.borderColor = isActive ? "#4a9eff" : "#0f3460";
        });

        // Обновляем контент
        const content = document.getElementById("menu-content");
        if (!content) return;

        content.innerHTML = "";

        switch (tabId) {
            case "general":
                this.createGeneralTab(content);
                break;
            case "world":
                this.createWorldTab(content);
                break;
            case "objects":
                this.createObjectsTab(content);
                break;
            case "map-specific":
                this.createMapSpecificTab(content);
                break;
            case "profiles":
                this.createProfilesTab(content);
                break;
            case "stats":
                this.createStatsTab(content);
                break;
        }
    }

    private createGeneralTab(container: HTMLElement): void {
        const grid = document.createElement("div");
        grid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 20px;`;

        // Левая колонка
        const leftColumn = document.createElement("div");
        leftColumn.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

        // Правая колонка
        const rightColumn = document.createElement("div");
        rightColumn.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

        // === НАСТРОЙКИ ЧАНКОВ ===
        leftColumn.appendChild(this.createSection("📦 Чанки", [
            this.createSlider("chunkSize", "Размер чанка", 50, 150, 10, "единиц", "Размер каждого чанка мира"),
            this.createSlider("renderDistance", "Дистанция рендеринга", 0.5, 3.0, 0.1, "чанков", "На каком расстоянии генерируются чанки"),
            this.createSlider("unloadDistance", "Дистанция выгрузки", 1.5, 5.0, 0.1, "чанков", "На каком расстоянии выгружаются чанки")
        ]));

        // === НАСТРОЙКИ ДОРОГ ===
        leftColumn.appendChild(this.createSection("🛣️ Дороги", [
            this.createSlider("highwaySpacing", "Расстояние между магистралями", 100, 500, 10, "единиц", "Промежуток между основными дорогами"),
            this.createSlider("streetSpacing", "Расстояние между улицами", 20, 60, 5, "единиц", "Промежуток между обычными улицами")
        ]));

        // === НАСТРОЙКИ ЛАНДШАФТА ===
        rightColumn.appendChild(this.createSection("🏔️ Ландшафт", [
            this.createSlider("terrainDetail", "Детализация ландшафта", 0.5, 2.0, 0.1, "x", "Уровень детализации рельефа"),
            this.createSlider("biomeTransitionSmoothness", "Плавность переходов биомов", 0.1, 1.0, 0.1, "", "Насколько плавно переходят биомы друг в друга")
        ]));

        // === РАЗМЕРЫ КАРТЫ ===
        rightColumn.appendChild(this.createSection("📏 Размеры карты", [
            this.createCheckbox("useCustomMapSize", "Использовать свои размеры", "Переопределить стандартные размеры карты"),
            this.createSlider("customMapWidth", "Ширина карты (X)", 200, 5000, 100, "м", "Ширина генерируемой области"),
            this.createSlider("customMapDepth", "Глубина карты (Z)", 200, 5000, 100, "м", "Глубина генерируемой области")
        ]));

        // === БЫСТРЫЕ ПРЕСЕТЫ ===
        rightColumn.appendChild(this.createSection("⚡ Быстрые пресеты", [
            this.createPresetButtons()
        ]));

        grid.appendChild(leftColumn);
        grid.appendChild(rightColumn);
        container.appendChild(grid);
    }

    private createWorldTab(container: HTMLElement): void {
        const grid = document.createElement("div");
        grid.style.cssText = `display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 600px; margin: 0 auto;`;

        grid.appendChild(this.createSection("🌍 Настройки мира", [
            this.createNumberInput("worldSeed", "Seed мира", 0, 999999999, 1, "Число для генерации мира (одинаковый seed = одинаковый мир)"),
            this.createCheckbox("useRandomSeed", "Случайный seed", "Генерировать случайный seed при каждом запуске"),
            this.createSeedGenerator()
        ]));

        container.appendChild(grid);
    }

    private createObjectsTab(container: HTMLElement): void {
        const grid = document.createElement("div");
        grid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 20px;`;

        // Левая колонка
        const leftColumn = document.createElement("div");
        leftColumn.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

        // Правая колонка
        const rightColumn = document.createElement("div");
        rightColumn.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

        // === НАСТРОЙКИ POI ===
        leftColumn.appendChild(this.createSection("📍 Точки интереса (POI)", [
            this.createSlider("poiSpacing", "Расстояние между POI", 50, 300, 10, "единиц", "Минимальное расстояние между точками интереса"),
            this.createSlider("poiDensity", "Плотность POI", 0.5, 2.0, 0.1, "x", "Множитель количества POI")
        ]));

        // === НАСТРОЙКИ УКРЫТИЙ ===
        leftColumn.appendChild(this.createSection("🛡️ Укрытия", [
            this.createSlider("coverDensity", "Плотность укрытий", 0.5, 2.0, 0.1, "x", "Множитель количества укрытий")
        ]));

        // === НАСТРОЙКИ ПРИПАСОВ ===
        rightColumn.appendChild(this.createSection("📦 Припасы", [
            this.createSlider("consumablesMin", "Минимум припасов на чанк", 1, 5, 1, "шт", "Минимальное количество припасов"),
            this.createSlider("consumablesMax", "Максимум припасов на чанк", 2, 8, 1, "шт", "Максимальное количество припасов")
        ]));

        grid.appendChild(leftColumn);
        grid.appendChild(rightColumn);
        container.appendChild(grid);
    }

    private createMapSpecificTab(container: HTMLElement): void {
        if (!this.game) {
            container.innerHTML = "<div style='text-align: center; color: #ffaa44; padding: 20px;'>Игра не инициализирована</div>";
            return;
        }

        const mapType = (this.game as any).currentMapType || "normal";

        if (mapType === "normal" || mapType === "sandbox") {
            container.innerHTML = `
                <div style="text-align: center; color: #88ccff; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🗺️</div>
                    <div style="font-size: 18px; margin-bottom: 10px;">Специфичные настройки недоступны</div>
                    <div style="font-size: 14px; color: #aaa;">Для карты "${mapType}" нет специфичных настроек</div>
                </div>
            `;
            return;
        }

        const grid = document.createElement("div");
        grid.style.cssText = `display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 800px; margin: 0 auto;`;

        // Инициализируем mapSpecific если нужно
        if (!this.settings.mapSpecific) {
            this.settings.mapSpecific = {};
        }

        // Создаём настройки для текущей карты
        switch (mapType) {
            case "polygon":
                grid.appendChild(this.createMapSection("🎯 Полигон", [
                    this.createSlider("mapSpecific.polygon.arenaSize", "Размер арены", 200, 1000, 50, "единиц", "Размер тренировочной арены"),
                    this.createSlider("mapSpecific.polygon.targetCount", "Количество мишеней", 3, 10, 1, "шт", "Количество мишеней на стрельбище"),
                    this.createSlider("mapSpecific.polygon.obstacleDensity", "Плотность препятствий", 0.5, 2.0, 0.1, "x", "Плотность препятствий на танкодроме")
                ]));
                break;
            case "frontline":
                grid.appendChild(this.createMapSection("⚔️ Передовая", [
                    this.createSlider("mapSpecific.frontline.trenchDensity", "Плотность окопов", 0.5, 2.0, 0.1, "x", "Количество окопов"),
                    this.createSlider("mapSpecific.frontline.craterCount", "Количество кратеров", 3, 15, 1, "шт", "Количество кратеров на чанк"),
                    this.createSlider("mapSpecific.frontline.bunkerCount", "Количество бункеров", 1, 5, 1, "шт", "Количество бункеров на зону")
                ]));
                break;
            case "ruins":
                grid.appendChild(this.createMapSection("🏚️ Руины", [
                    this.createSlider("mapSpecific.ruins.buildingDensity", "Плотность зданий", 0.5, 2.0, 0.1, "x", "Количество зданий"),
                    this.createSlider("mapSpecific.ruins.destructionLevel", "Уровень разрушения", 0.3, 0.9, 0.1, "", "Сколько процентов здания остаётся (0.3 = 30%)"),
                    this.createSlider("mapSpecific.ruins.rubbleCount", "Количество обломков", 1, 5, 1, "шт", "Количество обломков на чанк")
                ]));
                break;
            case "canyon":
                grid.appendChild(this.createMapSection("🏔️ Каньон", [
                    this.createSlider("mapSpecific.canyon.mountainHeight", "Высота гор", 10, 30, 1, "единиц", "Максимальная высота гор"),
                    this.createSlider("mapSpecific.canyon.riverCount", "Количество рек", 1, 5, 1, "шт", "Количество рек на карте"),
                    this.createSlider("mapSpecific.canyon.lakeCount", "Количество озёр", 1, 4, 1, "шт", "Количество озёр на карте"),
                    this.createSlider("mapSpecific.canyon.forestDensity", "Плотность лесов", 0.5, 2.0, 0.1, "x", "Плотность деревьев")
                ]));
                break;
            case "industrial":
                grid.appendChild(this.createMapSection("🏭 Промышленная", [
                    this.createSlider("mapSpecific.industrial.factoryCount", "Количество заводов", 1, 5, 1, "шт", "Количество заводов на чанк"),
                    this.createSlider("mapSpecific.industrial.portSize", "Размер порта", 0.5, 2.0, 0.1, "x", "Размер портовых объектов"),
                    this.createSlider("mapSpecific.industrial.craneCount", "Количество кранов", 1, 5, 1, "шт", "Количество кранов на чанк")
                ]));
                break;
            case "urban_warfare":
                grid.appendChild(this.createMapSection("🏙️ Городские бои", [
                    this.createSlider("mapSpecific.urban_warfare.buildingHeight", "Высота зданий", 0.5, 2.0, 0.1, "x", "Множитель высоты зданий"),
                    this.createSlider("mapSpecific.urban_warfare.streetGridDensity", "Плотность сетки улиц", 0.5, 2.0, 0.1, "x", "Плотность городской сетки"),
                    this.createSlider("mapSpecific.urban_warfare.barricadeDensity", "Плотность баррикад", 0.5, 2.0, 0.1, "x", "Количество баррикад")
                ]));
                break;
            case "underground":
                grid.appendChild(this.createMapSection("🕳️ Подземная", [
                    this.createSlider("mapSpecific.underground.caveSize", "Размер пещер", 0.5, 2.0, 0.1, "x", "Размер генерируемых пещер"),
                    this.createSlider("mapSpecific.underground.mineComplexity", "Сложность шахт", 0.5, 2.0, 0.1, "x", "Сложность системы шахт"),
                    this.createSlider("mapSpecific.underground.lightingIntensity", "Интенсивность освещения", 0.5, 2.0, 0.1, "x", "Яркость освещения в пещерах")
                ]));
                break;
            case "coastal":
                grid.appendChild(this.createMapSection("🌊 Прибрежная", [
                    this.createSlider("mapSpecific.coastal.lighthouseCount", "Количество маяков", 1, 5, 1, "шт", "Количество маяков на карте"),
                    this.createSlider("mapSpecific.coastal.portSize", "Размер порта", 0.5, 2.0, 0.1, "x", "Размер портовых объектов"),
                    this.createSlider("mapSpecific.coastal.cliffHeight", "Высота утёсов", 4, 20, 1, "единиц", "Высота прибрежных утёсов")
                ]));
                break;
        }

        container.appendChild(grid);
    }

    private createProfilesTab(container: HTMLElement): void {
        const grid = document.createElement("div");
        grid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 20px;`;

        // Левая колонка - список профилей
        const leftColumn = document.createElement("div");
        leftColumn.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

        const profileListSection = this.createSection("💾 Профили настроек", [
            this.createProfileList()
        ]);
        leftColumn.appendChild(profileListSection);

        // Правая колонка - создание/редактирование профиля
        const rightColumn = document.createElement("div");
        rightColumn.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

        const createProfileSection = this.createSection("➕ Создать профиль", [
            this.createProfileEditor()
        ]);
        rightColumn.appendChild(createProfileSection);

        grid.appendChild(leftColumn);
        grid.appendChild(rightColumn);
        container.appendChild(grid);
    }

    private createStatsTab(container: HTMLElement): void {
        if (!this.chunkSystem) {
            container.innerHTML = "<div style='text-align: center; color: #ffaa44; padding: 20px;'>ChunkSystem не инициализирован</div>";
            return;
        }

        const stats = (this.chunkSystem as any).stats || {};
        const config = (this.chunkSystem as any).config || {};

        const statsHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 800px; margin: 0 auto;">
                ${this.createStatCard("📦 Загружено чанков", stats.loadedChunks || 0, "Количество активных чанков")}
                ${this.createStatCard("🎨 Всего мешей", stats.totalMeshes || 0, "Общее количество мешей в мире")}
                ${this.createStatCard("⏱️ Время обновления", `${(stats.lastUpdateTime || 0).toFixed(2)} мс`, "Время последнего обновления")}
                ${this.createStatCard("🌍 Seed мира", config.worldSeed || "N/A", "Текущий seed генерации")}
                ${this.createStatCard("📏 Размер чанка", `${config.chunkSize || 80} единиц`, "Размер каждого чанка")}
                ${this.createStatCard("👁️ Дистанция рендеринга", `${config.renderDistance || 1.5} чанков`, "Максимальная дистанция рендеринга")}
            </div>
        `;

        container.innerHTML = statsHTML;
    }

    private createStatCard(title: string, value: string | number, description: string): string {
        return `
            <div style="
                background: rgba(15, 52, 96, 0.3);
                border: 1px solid #0f3460;
                border-radius: 8px;
                padding: 15px;
            ">
                <div style="font-size: 14px; color: #88ccff; margin-bottom: 8px;">${title}</div>
                <div style="font-size: 24px; color: #4a9eff; font-weight: bold; margin-bottom: 5px;">${value}</div>
                <div style="font-size: 12px; color: #aaa;">${description}</div>
            </div>
        `;
    }

    private createPresetButtons(): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;

        const presets = [
            { name: "⚡ Производительность", action: () => this.applyPreset("performance") },
            { name: "🎨 Качество", action: () => this.applyPreset("quality") },
            { name: "⚖️ Сбалансированно", action: () => this.applyPreset("balanced") },
            { name: "🌍 Большой мир", action: () => this.applyPreset("large") }
        ];

        presets.forEach(preset => {
            const btn = this.createButton(preset.name, "#6c5ce7", preset.action);
            btn.style.width = "100%";
            wrapper.appendChild(btn);
        });

        return wrapper;
    }

    private applyPreset(preset: string): void {
        switch (preset) {
            case "performance":
                this.settings.chunkSize = 100;
                this.settings.renderDistance = 1.0;
                this.settings.unloadDistance = 2.0;
                this.settings.poiDensity = 0.7;
                this.settings.coverDensity = 0.7;
                this.settings.terrainDetail = 0.7;
                break;
            case "quality":
                this.settings.chunkSize = 60;
                this.settings.renderDistance = 2.5;
                this.settings.unloadDistance = 4.0;
                this.settings.poiDensity = 1.5;
                this.settings.coverDensity = 1.5;
                this.settings.terrainDetail = 1.5;
                break;
            case "balanced":
                this.settings.chunkSize = 80;
                this.settings.renderDistance = 1.5;
                this.settings.unloadDistance = 2.5;
                this.settings.poiDensity = 1.0;
                this.settings.coverDensity = 1.0;
                this.settings.terrainDetail = 1.0;
                break;
            case "large":
                this.settings.chunkSize = 120;
                this.settings.renderDistance = 2.0;
                this.settings.unloadDistance = 3.5;
                this.settings.poiDensity = 1.2;
                this.settings.coverDensity = 1.2;
                this.settings.terrainDetail = 1.2;
                break;
        }
        this.updateUI();
        inGameAlert(`✅ Пресет "${preset}" применён!`, "Пресет").catch(() => {});
    }

    private createSeedGenerator(): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `margin-top: 10px;`;

        const btn = this.createButton("🎲 Сгенерировать случайный seed", "#9b59b6", () => {
            this.settings.worldSeed = Math.floor(Math.random() * 999999999);
            this.settings.useRandomSeed = false;
            this.updateUI();
        });
        btn.style.width = "100%";

        wrapper.appendChild(btn);
        return wrapper;
    }

    private createProfileList(): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.id = "profile-list";
        wrapper.style.cssText = `display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto;`;

        this.updateProfileList();

        return wrapper;
    }

    private updateProfileList(): void {
        const list = document.getElementById("profile-list");
        if (!list) return;

        list.innerHTML = "";

        if (this.profiles.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: #aaa; padding: 20px;">Нет сохранённых профилей</div>`;
            return;
        }

        this.profiles.forEach((profile, index) => {
            const profileItem = document.createElement("div");
            profileItem.style.cssText = `
                background: rgba(15, 52, 96, 0.5);
                border: 1px solid #0f3460;
                border-radius: 6px;
                padding: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                transition: all 0.2s;
            `;
            profileItem.onmouseover = () => {
                profileItem.style.background = "rgba(74, 158, 255, 0.3)";
                profileItem.style.borderColor = "#4a9eff";
            };
            profileItem.onmouseout = () => {
                profileItem.style.background = "rgba(15, 52, 96, 0.5)";
                profileItem.style.borderColor = "#0f3460";
            };

            const info = document.createElement("div");
            info.style.cssText = `flex: 1;`;

            const name = document.createElement("div");
            name.textContent = profile.name;
            name.style.cssText = `font-weight: bold; color: #4a9eff; margin-bottom: 4px;`;

            const desc = document.createElement("div");
            desc.textContent = profile.description || "Без описания";
            desc.style.cssText = `font-size: 12px; color: #aaa;`;

            const date = document.createElement("div");
            date.textContent = new Date(profile.createdAt).toLocaleDateString();
            date.style.cssText = `font-size: 11px; color: #666; margin-top: 4px;`;

            info.appendChild(name);
            info.appendChild(desc);
            info.appendChild(date);

            const buttons = document.createElement("div");
            buttons.style.cssText = `display: flex; gap: 5px;`;

            const loadBtn = document.createElement("button");
            loadBtn.textContent = "📂";
            loadBtn.title = "Загрузить";
            loadBtn.style.cssText = `
                padding: 5px 10px;
                background: #4a9eff;
                border: none;
                border-radius: 4px;
                color: white;
                cursor: pointer;
            `;
            loadBtn.onclick = (e) => {
                e.stopPropagation();
                this.loadProfile(index);
            };

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "🗑️";
            deleteBtn.title = "Удалить";
            deleteBtn.style.cssText = `
                padding: 5px 10px;
                background: #ff4444;
                border: none;
                border-radius: 4px;
                color: white;
                cursor: pointer;
            `;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                inGameConfirm(`Удалить профиль "${profile.name}"?`, "Подтверждение").then((ok) => {
                    if (ok) {
                        this.profiles.splice(index, 1);
                        this.saveProfiles();
                        this.updateProfileList();
                    }
                }).catch(() => {});
            };

            buttons.appendChild(loadBtn);
            buttons.appendChild(deleteBtn);

            profileItem.appendChild(info);
            profileItem.appendChild(buttons);
            list.appendChild(profileItem);
        });
    }

    private createProfileEditor(): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `display: flex; flex-direction: column; gap: 15px;`;

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "Название профиля";
        nameInput.id = "profile-name-input";
        nameInput.style.cssText = `
            padding: 10px;
            background: #0f3460;
            border: 1px solid #1a1a2e;
            border-radius: 4px;
            color: #e0e0e0;
            font-size: 14px;
        `;

        const descInput = document.createElement("textarea");
        descInput.placeholder = "Описание (необязательно)";
        descInput.id = "profile-desc-input";
        descInput.style.cssText = `
            padding: 10px;
            background: #0f3460;
            border: 1px solid #1a1a2e;
            border-radius: 4px;
            color: #e0e0e0;
            font-size: 14px;
            min-height: 60px;
            resize: vertical;
        `;

        const saveBtn = this.createButton("💾 Сохранить профиль", "#4a9eff", () => {
            const name = (document.getElementById("profile-name-input") as HTMLInputElement)?.value.trim();
            if (!name) {
                inGameAlert("❌ Введите название профиля!", "Профиль").catch(() => {});
                return;
            }

            const desc = (document.getElementById("profile-desc-input") as HTMLTextAreaElement)?.value.trim();

            const profile: WorldGenProfile = {
                name,
                description: desc || undefined,
                settings: JSON.parse(JSON.stringify(this.settings)), // Deep copy
                createdAt: Date.now()
            };

            this.profiles.push(profile);
            this.saveProfiles();
            this.updateProfileList();

            (document.getElementById("profile-name-input") as HTMLInputElement).value = "";
            (document.getElementById("profile-desc-input") as HTMLTextAreaElement).value = "";

            inGameAlert(`✅ Профиль "${name}" сохранён!`, "Профиль").catch(() => {});
        });

        wrapper.appendChild(nameInput);
        wrapper.appendChild(descInput);
        wrapper.appendChild(saveBtn);

        return wrapper;
    }

    private loadProfile(index: number): void {
        if (index < 0 || index >= this.profiles.length) return;

        const profile = this.profiles[index];
        if (!profile) return;
        this.settings = JSON.parse(JSON.stringify(profile.settings)); // Deep copy
        this.currentProfile = profile.name;
        // Чтение currentProfile, чтобы избежать предупреждений компилятора и оставить поле для будущего UI
        void this.currentProfile;
        this.updateUI();
        alert(`✅ Профиль "${profile.name}" загружен!`);
    }

    private saveProfiles(): void {
        try {
            localStorage.setItem("worldGenProfiles", JSON.stringify(this.profiles));
        } catch (e) {
            console.warn("[WorldGenerationMenu] Failed to save profiles:", e);
        }
    }

    private loadProfiles(): void {
        try {
            const saved = localStorage.getItem("worldGenProfiles");
            if (saved) {
                this.profiles = JSON.parse(saved);
            }
        } catch (e) {
            console.warn("[WorldGenerationMenu] Failed to load profiles:", e);
        }
    }

    private exportSettings(): void {
        const dataStr = JSON.stringify(this.settings, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `world-gen-settings-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        alert("✅ Настройки экспортированы!");
    }

    private importSettings(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    this.settings = { ...this.settings, ...imported };
                    this.updateUI();
                    inGameAlert("✅ Настройки импортированы!", "Импорт").catch(() => {});
                } catch (e) {
                    inGameAlert("❌ Ошибка импорта: " + e, "Ошибка").catch(() => {});
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    private createSection(title: string, controls: HTMLElement[]): HTMLDivElement {
        const section = document.createElement("div");
        section.style.cssText = `
            background: rgba(15, 52, 96, 0.3);
            border: 1px solid #0f3460;
            border-radius: 8px;
            padding: 15px;
        `;

        const sectionTitle = document.createElement("h3");
        sectionTitle.textContent = title;
        sectionTitle.style.cssText = `
            margin: 0 0 15px 0;
            font-size: 18px;
            color: #4a9eff;
            border-bottom: 1px solid #0f3460;
            padding-bottom: 8px;
        `;

        section.appendChild(sectionTitle);
        controls.forEach(control => section.appendChild(control));

        return section;
    }

    private createMapSection(title: string, controls: HTMLElement[]): HTMLDivElement {
        return this.createSection(title, controls);
    }

    private createSlider(key: string, label: string, min: number, max: number, step: number, unit: string, tooltip?: string): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `margin-bottom: 15px;`;

        const labelDiv = document.createElement("div");
        labelDiv.style.cssText = `display: flex; justify-content: space-between; margin-bottom: 5px;`;

        const labelText = document.createElement("label");
        labelText.textContent = label;
        labelText.style.cssText = `color: #e0e0e0; font-size: 14px;`;
        if (tooltip) {
            labelText.title = tooltip;
            labelText.style.cursor = "help";
        }

        const valueSpan = document.createElement("span");
        valueSpan.id = `${key.replace(/\./g, "_")}_value`;
        valueSpan.style.cssText = `color: #4a9eff; font-weight: bold;`;

        // Получаем значение из настроек
        const value = this.getNestedValue(this.settings, key);
        valueSpan.textContent = `${value.toFixed(step < 1 ? 1 : 0)} ${unit}`;

        labelDiv.appendChild(labelText);
        labelDiv.appendChild(valueSpan);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = step.toString();
        slider.value = value.toString();
        slider.style.cssText = `
            width: 100%;
            height: 6px;
            background: #0f3460;
            border-radius: 3px;
            outline: none;
            cursor: pointer;
        `;

        slider.oninput = () => {
            const val = parseFloat(slider.value);
            this.setNestedValue(this.settings, key, val);
            valueSpan.textContent = `${val.toFixed(step < 1 ? 1 : 0)} ${unit}`;
        };

        wrapper.appendChild(labelDiv);
        wrapper.appendChild(slider);

        return wrapper;
    }

    private createNumberInput(key: keyof WorldGenSettings, label: string, min: number, max: number, step: number, tooltip?: string): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `margin-bottom: 15px;`;

        const labelEl = document.createElement("label");
        labelEl.textContent = label;
        labelEl.style.cssText = `display: block; color: #e0e0e0; font-size: 14px; margin-bottom: 5px;`;
        if (tooltip) {
            labelEl.title = tooltip;
            labelEl.style.cursor = "help";
        }

        const input = document.createElement("input");
        input.type = "number";
        input.min = min.toString();
        input.max = max.toString();
        input.step = step.toString();
        input.value = (this.settings[key] as number).toString();
        input.style.cssText = `
            width: 100%;
            padding: 8px;
            background: #0f3460;
            border: 1px solid #1a1a2e;
            border-radius: 4px;
            color: #e0e0e0;
            font-size: 14px;
        `;

        input.oninput = () => {
            const value = Math.max(min, Math.min(max, parseFloat(input.value) || min));
            (this.settings[key] as number) = value;
            input.value = value.toString();
        };

        wrapper.appendChild(labelEl);
        wrapper.appendChild(input);

        return wrapper;
    }

    private createCheckbox(key: keyof WorldGenSettings, label: string, tooltip?: string): HTMLDivElement {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `margin-bottom: 15px; display: flex; align-items: center; gap: 10px;`;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.settings[key] as boolean;
        checkbox.style.cssText = `width: 20px; height: 20px; cursor: pointer;`;

        checkbox.onchange = () => {
            (this.settings[key] as boolean) = checkbox.checked;
            if (key === "useRandomSeed" && checkbox.checked) {
                this.settings.worldSeed = Math.floor(Math.random() * 999999999);
                this.updateUI();
            }
        };

        const labelEl = document.createElement("label");
        labelEl.textContent = label;
        labelEl.style.cssText = `color: #e0e0e0; font-size: 14px; cursor: pointer;`;
        if (tooltip) {
            labelEl.title = tooltip;
        }
        labelEl.onclick = () => checkbox.click();

        wrapper.appendChild(checkbox);
        wrapper.appendChild(labelEl);

        return wrapper;
    }

    private createButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText = `
            padding: 10px 20px;
            background: ${color};
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
        `;
        btn.onmouseover = () => btn.style.opacity = "0.8";
        btn.onmouseout = () => btn.style.opacity = "1";
        btn.onclick = onClick;
        return btn;
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split(".").reduce((o, p) => o?.[p], obj) ?? 0;
    }

    private setNestedValue(obj: any, path: string, value: any): void {
        const keys = path.split(".");
        const lastKey = keys.pop()!;
        const target = keys.reduce((o, k) => {
            if (!o[k]) o[k] = {};
            return o[k];
        }, obj);
        target[lastKey] = value;
    }

    private updateUI(): void {
        // Обновляем все значения в UI
        document.querySelectorAll("[id$='_value']").forEach(el => {
            const id = el.id.replace("_value", "").replace(/_/g, ".");
            const value = this.getNestedValue(this.settings, id);
            if (typeof value === "number") {
                const slider = el.parentElement?.nextElementSibling as HTMLInputElement;
                if (slider) {
                    const step = parseFloat(slider.step);
                    const unit = el.textContent?.split(" ")[1] || "";
                    el.textContent = `${value.toFixed(step < 1 ? 1 : 0)} ${unit}`;
                    slider.value = value.toString();
                }
            }
        });

        // Обновляем number inputs
        Object.keys(this.settings).forEach(key => {
            if (key === "mapSpecific") return;
            const input = document.querySelector(`input[type="number"][id="${key}"]`) as HTMLInputElement;
            if (input) {
                input.value = (this.settings[key as keyof WorldGenSettings] as number).toString();
            }
        });

        // Обновляем checkboxes
        Object.keys(this.settings).forEach(key => {
            if (key === "mapSpecific") return;
            const checkbox = document.querySelector(`input[type="checkbox"][id="${key}"]`) as HTMLInputElement;
            if (checkbox) {
                checkbox.checked = this.settings[key as keyof WorldGenSettings] as boolean;
            }
        });
    }

    private saveSettings(): void {
        try {
            localStorage.setItem("worldGenSettings", JSON.stringify(this.settings));
            this.showNotification("✅ Настройки сохранены!", "success");
        } catch (e) {
            this.showNotification("❌ Ошибка сохранения: " + e, "error");
        }
    }

    private loadSettings(): void {
        try {
            const saved = localStorage.getItem("worldGenSettings");
            if (saved) {
                const loaded = JSON.parse(saved);
                this.settings = { ...this.settings, ...loaded };
                // Восстанавливаем mapSpecific если есть
                if (loaded.mapSpecific) {
                    this.settings.mapSpecific = { ...this.settings.mapSpecific, ...loaded.mapSpecific };
                }
                this.updateUI();
            }
        } catch (e) {
            console.warn("[WorldGenerationMenu] Failed to load settings:", e);
        }
    }

    private resetSettings(): void {
        inGameConfirm("Сбросить все настройки к значениям по умолчанию?", "Сброс").then((ok) => {
            if (!ok) return;
            this.settings = {
                chunkSize: 80,
                renderDistance: 1.5,
                unloadDistance: 2.5,
                worldSeed: 12345,
                useRandomSeed: false,
                highwaySpacing: 200,
                streetSpacing: 30,
                poiSpacing: 150,
                poiDensity: 1.0,
                coverDensity: 1.0,
                consumablesMin: 2,
                consumablesMax: 4,
                terrainDetail: 1.0,
                biomeTransitionSmoothness: 0.5,
                useCustomMapSize: false,
                customMapWidth: 1000,
                customMapDepth: 1000,
                mapSpecific: {}
            };
            this.updateUI();
            this.showNotification("✅ Настройки сброшены!", "success");
        }).catch(() => {});
    }

    private applySettings(): void {
        if (!this.chunkSystem) {
            this.showNotification("❌ ChunkSystem не инициализирован!", "error");
            return;
        }

        // Применяем настройки к ChunkSystem
        const config = (this.chunkSystem as any).config;
        if (config) {
            config.chunkSize = this.settings.chunkSize;
            config.renderDistance = this.settings.renderDistance;
            config.unloadDistance = this.settings.unloadDistance;
            config.worldSeed = this.settings.useRandomSeed
                ? Math.floor(Math.random() * 999999999)
                : this.settings.worldSeed;

            // Применяем к подсистемам если они есть
            const roadNetwork = (this.chunkSystem as any).roadNetwork;
            if (roadNetwork) {
                if (roadNetwork.config) {
                    roadNetwork.config.highwaySpacing = this.settings.highwaySpacing;
                    roadNetwork.config.streetSpacing = this.settings.streetSpacing;
                }
                // Устанавливаем тип карты для поддержки реальных дорог
                const mapType = (this.game as any).currentMapType || "normal";
                if (roadNetwork.setMapType) {
                    roadNetwork.setMapType(mapType);
                } else if (roadNetwork.config) {
                    roadNetwork.config.mapType = mapType;
                }
            }

            const poiSystem = (this.chunkSystem as any).poiSystem;
            if (poiSystem && poiSystem.config) {
                poiSystem.config.poiSpacing = this.settings.poiSpacing;
                (poiSystem as any).poiDensityMultiplier = this.settings.poiDensity;
            }

            const coverGenerator = (this.chunkSystem as any).coverGenerator;
            if (coverGenerator) {
                (coverGenerator as any).coverDensityMultiplier = this.settings.coverDensity;
            }

            (this.chunkSystem as any).consumablesMin = this.settings.consumablesMin;
            (this.chunkSystem as any).consumablesMax = this.settings.consumablesMax;

            this.showNotification("✅ Настройки применены! Изменения вступят в силу при генерации новых чанков.", "success");
        }
    }

    private reloadWorld(): void {
        if (!this.game) {
            this.showNotification("❌ Game не инициализирован!", "error");
            return;
        }

        inGameConfirm("⚠️ Перезагрузить весь мир? Все текущие чанки будут удалены и перегенерированы. Это может занять некоторое время.", "Перезагрузка мира").then((ok) => {
            if (!ok) return;
            this.applySettings();

            if (this.chunkSystem) {
                this.chunkSystem.dispose();

                const config = {
                    chunkSize: this.settings.chunkSize,
                    renderDistance: this.settings.renderDistance,
                    unloadDistance: this.settings.unloadDistance,
                    worldSeed: this.settings.useRandomSeed
                        ? Math.floor(Math.random() * 999999999)
                        : this.settings.worldSeed,
                    mapType: (this.game as any).currentMapType || "normal",
                    customBounds: this.settings.useCustomMapSize ? {
                        width: this.settings.customMapWidth,
                        depth: this.settings.customMapDepth
                    } : undefined
                };

                import("./chunkSystem").then(({ ChunkSystem }) => {
                    this.game!.chunkSystem = new ChunkSystem(this.game!.scene, config);
                    this.chunkSystem = this.game!.chunkSystem;
                    this.showNotification("✅ Мир перезагружен с новыми настройками!", "success");
                }).catch(e => {
                    this.showNotification("❌ Ошибка перезагрузки мира: " + e, "error");
                });
            }
        }).catch(() => {});
    }

    private showNotification(message: string, type: "success" | "error" = "success"): void {
        // Создаём временное уведомление
        const notification = document.createElement("div");
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === "success" ? "#44ff44" : "#ff4444"};
            color: white;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            font-weight: bold;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = "slideOut 0.3s ease-out";
            setTimeout(() => notification.remove(), 300);
        }, 3000);

        // Добавляем стили анимации если их ещё нет
        if (!document.getElementById("notification-styles")) {
            const style = document.createElement("style");
            style.id = "notification-styles";
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    private setupToggle(): void {
        // Ctrl+9 обработчик управляется в game.ts для консистентности
        // Этот метод оставлен для возможного будущего использования
    }

    /**
     * Скрыть меню генерации мира (используется из game.ts)
     */
    hide(): void {
        if (!this.visible) return;
        this.visible = false;
        if (this.container) {
            this.container.classList.add("hidden");
            this.container.style.display = "none";
        }

        // Восстанавливаем курсор только если игра активна
        const game = (window as any).gameInstance;
        if (game?.gameStarted && !game.gamePaused) {
            document.body.style.cursor = 'none';
        }
    }

    toggle(): void {
        if (!this.container) return;

        this.visible = !this.visible;

        if (this.visible) {
            this.container.classList.remove("hidden");
            this.container.style.display = "flex";

            // Показываем курсор и выходим из pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            document.body.style.cursor = 'default';

            // Добавляем класс "in-battle" если игра запущена (для полупрозрачного фона)
            const game = (window as any).gameInstance;
            if (game && game.gameStarted) {
                this.container.classList.add("in-battle");
            } else {
                this.container.classList.remove("in-battle");
            }

            this.loadCurrentSettings();
            this.updateMapInfo();
            // Обновляем статистику если открыта вкладка stats
            if (this.currentTab === "stats") {
                this.switchTab("stats");
            }
        } else {
            this.container.classList.add("hidden");
            this.container.style.display = "none";

            // Восстанавливаем курсор только если игра активна
            const game = (window as any).gameInstance;
            if (game?.gameStarted && !game.gamePaused) {
                document.body.style.cursor = 'none';
            }
        }
    }

    isVisible(): boolean {
        return this.visible;
    }

    /**
     * Рендерит контент в переданный контейнер (для UnifiedMenu)
     */
    renderToContainer(container: HTMLElement): void {
        container.innerHTML = this.getEmbeddedContentHTML();
        this.setupEmbeddedEventListeners(container);
    }

    /**
     * Возвращает HTML контента без overlay wrapper
     */
    private getEmbeddedContentHTML(): string {
        return `
            <div class="world-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 16px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);">
                    🌍 Генерация мира
                </h3>
                
                <!-- Seed -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        SEED МИРА
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" class="world-seed-emb" placeholder="Автоматически" style="
                            flex: 1; padding: 8px;
                            background: rgba(0, 5, 0, 0.5);
                            border: 1px solid rgba(0, 255, 4, 0.4);
                            border-radius: 4px; color: #0f0;
                            font-family: 'Press Start 2P', monospace;
                        ">
                        <button class="panel-btn world-random-seed-btn" style="padding: 8px 12px;">🎲</button>
                    </div>
                </div>
                
                <!-- Размер карты -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        РАЗМЕР КАРТЫ
                    </div>
                    <select class="world-size-emb" style="
                        width: 100%; padding: 8px;
                        background: rgba(0, 5, 0, 0.5);
                        border: 1px solid rgba(0, 255, 4, 0.4);
                        border-radius: 4px; color: #0f0;
                        font-family: 'Press Start 2P', monospace;
                    ">
                        <option value="small">Маленький (512x512)</option>
                        <option value="medium" selected>Средний (1024x1024)</option>
                        <option value="large">Большой (2048x2048)</option>
                        <option value="huge">Огромный (4096x4096)</option>
                    </select>
                </div>
                
                <!-- Тип местности -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        ТИП МЕСТНОСТИ
                    </div>
                    <select class="world-biome-emb" style="
                        width: 100%; padding: 8px;
                        background: rgba(0, 5, 0, 0.5);
                        border: 1px solid rgba(0, 255, 4, 0.4);
                        border-radius: 4px; color: #0f0;
                        font-family: 'Press Start 2P', monospace;
                    ">
                        <option value="plains">Равнины</option>
                        <option value="desert">Песок</option>
                        <option value="forest">Лес</option>
                        <option value="mountains">Горы</option>
                        <option value="mixed" selected>Смешанный</option>
                    </select>
                </div>
                
                <!-- Плотность объектов -->
                <div style="margin-bottom: 16px;">
                    <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                        Плотность объектов: <span class="world-density-val" style="color: #0f0;">50%</span>
                    </label>
                    <input type="range" class="world-density-emb" min="0" max="100" value="50" style="width: 100%;">
                </div>
                
                <!-- Кнопки -->
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="panel-btn primary world-generate-btn" style="flex: 1; padding: 10px;">
                        🌍 Сгенерировать новый мир
                    </button>
                </div>
                
                <div style="margin-top: 12px; padding: 10px; background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.3); border-radius: 4px;">
                    <div style="color: #f00; font-size: 11px;">⚠️ Генерация нового мира приведёт к потере текущего прогресса!</div>
                </div>
            </div>
        `;
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        const seedInput = container.querySelector(".world-seed-emb") as HTMLInputElement;
        const randomSeedBtn = container.querySelector(".world-random-seed-btn");
        const sizeSelect = container.querySelector(".world-size-emb") as HTMLSelectElement;
        const biomeSelect = container.querySelector(".world-biome-emb") as HTMLSelectElement;
        const densitySlider = container.querySelector(".world-density-emb") as HTMLInputElement;
        const densityVal = container.querySelector(".world-density-val");
        const generateBtn = container.querySelector(".world-generate-btn");

        // Генерация случайного seed
        randomSeedBtn?.addEventListener("click", () => {
            const randomSeed = Math.floor(Math.random() * 999999999);
            if (seedInput) seedInput.value = String(randomSeed);
        });

        // Обновление значения плотности
        densitySlider?.addEventListener("input", () => {
            if (densityVal) densityVal.textContent = `${densitySlider.value}%`;
        });

        // Генерация мира
        generateBtn?.addEventListener("click", () => {
            const seed = seedInput?.value ? parseInt(seedInput.value) : Math.floor(Math.random() * 999999999);
            const size = sizeSelect?.value || "medium";
            const biome = biomeSelect?.value || "mixed";
            const density = parseInt(densitySlider?.value || "50") / 100;

            if (this.game?.hud) {
                this.game.hud.showMessage(`Генерация мира (seed: ${seed})...`, "#0ff", 3000);
            }

            // Вызываем генерацию мира
            if (this.game && (this.game as any).generateWorld) {
                (this.game as any).generateWorld({ seed, size, biome, density });
            } else {
                console.log("[WorldGenerationMenu] World generation params:", { seed, size, biome, density });
                if (this.game?.hud) {
                    this.game.hud.showMessage("Генерация мира недоступна в данный момент", "#ff0", 2000);
                }
            }
        });
    }
}
