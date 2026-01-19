/**
 * Map Editor Launcher - UI для выбора шаблона карты
 * Показывает модальное окно с опциями создания/загрузки карты
 */

import { MapData } from "./mapEditor";
import { MAP_TYPES } from "./maps/shared/MapTypes";
import { ALL_MAPS } from "./maps";
import { logger } from "./utils/logger";
import { AiService } from "./services/AiService";
import { WorldBuilder } from "./services/WorldBuilder";
import { WorldEntity } from "./services/GeoDataService";

export interface StandaloneMapEditorConfig {
    mapSize?: number;
    mapType?: string;
    mapData?: MapData;
    worldGen?: {
        lat: number;
        lon: number;
        name: string;
    };
}

/**
 * Результат выбора в лаунчере
 */
export interface MapEditorLaunchResult {
    action: "new-empty" | "new-generated" | "load-existing" | "edit-existing" | "new-world" | "cancel";
    config?: StandaloneMapEditorConfig;
}

/**
 * Лаунчер редактора карт
 */
export class MapEditorLauncher {
    private modal: HTMLDivElement | null = null;
    private resolveCallback: ((result: MapEditorLaunchResult) => void) | null = null;

    /**
     * Показать модальное окно выбора карты
     */
    show(): Promise<MapEditorLaunchResult> {
        return new Promise((resolve) => {
            this.resolveCallback = resolve;
            console.log("[MapEditorLauncher] Showing launcher modal...");
            this.createModal();

            // Дополнительная проверка через небольшую задержку
            setTimeout(() => {
                if (this.modal) {
                    const computed = window.getComputedStyle(this.modal);
                    console.log("[MapEditorLauncher] Modal state after creation:", {
                        display: computed.display,
                        visibility: computed.visibility,
                        zIndex: computed.zIndex,
                        position: computed.position,
                        opacity: computed.opacity
                    });
                }
            }, 50);
        });
    }

    /**
     * Создать модальное окно
     */
    private createModal(): void {
        // Удаляем старое модальное окно если есть
        const oldModal = document.getElementById("map-editor-launcher-modal");
        if (oldModal) {
            oldModal.remove();
        }

        // Создаем модальное окно
        this.modal = document.createElement("div");
        this.modal.id = "map-editor-launcher-modal";
        this.modal.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0, 0, 0, 0.85) !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: 'Consolas', 'Monaco', monospace !important;
            pointer-events: auto !important;
        `;

        // Загружаем сохраненные карты
        const savedMaps = this.loadSavedMaps();

        // Создаем контент модального окна
        const content = document.createElement("div");
        content.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid #0f0;
            border-radius: 8px;
            padding: 30px;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            color: #0f0;
            box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
        `;

        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="margin: 0 0 10px 0; font-size: 28px; color: #0f0; text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);">
                    🗺️ РЕДАКТОР КАРТ
                </h1>
                <p style="margin: 0; color: #8f8; font-size: 14px;">Выберите способ создания карты</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <!-- Новая пустая карта -->
                <div class="launcher-option" data-action="new-empty" style="
                    background: rgba(0, 50, 0, 0.3);
                    border: 2px solid #0f0;
                    border-radius: 6px;
                    padding: 20px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    <div style="font-size: 32px; margin-bottom: 10px;">📄</div>
                    <h3 style="margin: 0 0 10px 0; color: #0f0;">Новая пустая карта</h3>
                    <p style="margin: 0; color: #8f8; font-size: 12px;">Создать плоский террейн для редактирования</p>
                </div>
                
                <!-- Из генератора -->
                <div class="launcher-option" data-action="new-generated" style="
                    background: rgba(0, 50, 0, 0.3);
                    border: 2px solid #0f0;
                    border-radius: 6px;
                    padding: 20px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    <div style="font-size: 32px; margin-bottom: 10px;">🎲</div>
                    <h3 style="margin: 0 0 10px 0; color: #0f0;">Из генератора</h3>
                    <p style="margin: 0; color: #8f8; font-size: 12px;">Сгенерировать карту выбранного типа</p>
                </div>
                
                <!-- Из реального мира (AI) -->
                <div class="launcher-option" data-action="new-world" style="
                    background: rgba(0, 50, 0, 0.3);
                    border: 2px solid #0f0;
                    border-radius: 6px;
                    padding: 20px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    <div style="font-size: 32px; margin-bottom: 10px;">🌍</div>
                    <h3 style="margin: 0 0 10px 0; color: #0f0;">Из реального мира</h3>
                    <p style="margin: 0; color: #8f8; font-size: 12px;">Сгенерировать карту из места на Земле</p>
                </div>
                
                <!-- Редактировать карту -->
                <div class="launcher-option" data-action="edit-existing" style="
                    background: rgba(0, 50, 0, 0.3);
                    border: 2px solid #0f0;
                    border-radius: 6px;
                    padding: 20px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    <div style="font-size: 32px; margin-bottom: 10px;">✏️</div>
                    <h3 style="margin: 0 0 10px 0; color: #0f0;">Редактировать карту</h3>
                    <p style="margin: 0; color: #8f8; font-size: 12px;">Открыть существующую карту для редактирования</p>
                </div>
            </div>
            
            <!-- Настройки генерации мира (AI) -->
            <div id="world-settings" style="display: none; margin-bottom: 20px; padding: 15px; background: rgba(0, 30, 0, 0.5); border-radius: 6px;">
                <label style="display: block; margin-bottom: 10px; color: #0f0;">
                    Местоположение (город, район):
                    <div style="display: flex; gap: 10px; margin-top: 5px;">
                        <input type="text" id="world-prompt" placeholder="Например: Central Park, New York" style="
                            flex: 1;
                            padding: 8px 10px;
                            background: rgba(0, 0, 0, 0.5);
                            border: 1px solid #0f0;
                            color: #fff;
                            font-family: 'Consolas', 'Monaco', monospace;
                        ">
                        <button id="check-location-btn" style="
                            padding: 8px 15px;
                            background: rgba(0, 50, 0, 0.5);
                            border: 1px solid #0f0;
                            color: #0f0;
                            cursor: pointer;
                            font-family: inherit;
                        ">🔍 Проверить</button>
                    </div>
                </label>
                <div id="location-status" style="margin-top: 5px; font-size: 12px; min-height: 15px; color: #aaa;"></div>
            </div>

            <!-- Настройки размера (скрыты по умолчанию) -->
            <div id="size-settings" style="display: none; margin-bottom: 20px; padding: 15px; background: rgba(0, 30, 0, 0.5); border-radius: 6px;">
                <label style="display: block; margin-bottom: 10px; color: #0f0;">
                    Размер рабочей области:
                    <select id="map-size" style="
                        margin-left: 10px;
                        padding: 5px 10px;
                        background: rgba(0, 0, 0, 0.5);
                        border: 1px solid #0f0;
                        color: #0f0;
                        font-family: 'Consolas', 'Monaco', monospace;
                    ">
                        <option value="250">250x250 (маленькая)</option>
                        <option value="500" selected>500x500 (средняя)</option>
                        <option value="1000">1000x1000 (большая)</option>
                        <option value="2000">2000x2000 (очень большая)</option>
                    </select>
                </label>
            </div>
            
            <!-- Выбор типа карты (скрыт по умолчанию) -->
            <div id="map-type-selection" style="display: none; margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 10px; color: #0f0;">
                    Тип карты:
                    <select id="map-type" style="
                        width: 100%;
                        margin-top: 10px;
                        padding: 10px;
                        background: rgba(0, 0, 0, 0.5);
                        border: 1px solid #0f0;
                        color: #0f0;
                        font-family: 'Consolas', 'Monaco', monospace;
                        font-size: 14px;
                    ">
                        ${MAP_TYPES.map(type => `
                            <option value="${type.id}">${type.name} - ${type.description}</option>
                        `).join("")}
                    </select>
                </label>
            </div>
            
            <!-- Список карт для редактирования (скрыт по умолчанию) -->
            <div id="edit-maps-list" style="display: none; margin-bottom: 20px;">
                ${savedMaps.length > 0 ? `
                    <h3 style="margin: 0 0 15px 0; color: #0f0; font-size: 18px;">📂 Выберите карту для редактирования (${savedMaps.length} доступно)</h3>
                    <div id="saved-maps-list" style="
                        max-height: 300px;
                        overflow-y: auto;
                        border: 1px solid #0f0;
                        border-radius: 4px;
                        background: rgba(0, 0, 0, 0.3);
                    ">
                        ${savedMaps.map((map, index) => `
                            <div class="saved-map-item" data-map-index="${index}" style="
                                padding: 12px;
                                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
                                cursor: pointer;
                                transition: background 0.2s;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <div style="flex: 1;">
                                    <div style="font-weight: bold; color: #0f0; margin-bottom: 5px;">
                                        ${map.name}
                                        ${map.name.startsWith("[Предустановленная]") ?
                '<span style="color: #0ff; font-size: 10px; margin-left: 5px;">[Предустановленная]</span>' : ''}
                                    </div>
                                    <div style="font-size: 11px; color: #8f8;">
                                        ${map.name.startsWith("[Предустановленная]") ?
                'Предустановленная карта игры' :
                `Создана: ${new Date(map.metadata.createdAt).toLocaleString()}${map.metadata.modifiedAt !== map.metadata.createdAt ?
                    ` | Изменена: ${new Date(map.metadata.modifiedAt).toLocaleString()}` : ''}`}
                                    </div>
                                    ${map.mapType ? `<div style="font-size: 11px; color: #8f8;">Тип: ${map.mapType}</div>` : ''}
                                    ${map.metadata?.description ? `<div style="font-size: 10px; color: #6f6; margin-top: 3px;">${map.metadata.description}</div>` : ''}
                                </div>
                                ${!map.name.startsWith("[Предустановленная]") ? `
                                    <button class="delete-map-btn" data-map-index="${index}" style="
                                        padding: 5px 10px;
                                        background: rgba(50, 0, 0, 0.5);
                                        border: 1px solid #f00;
                                        color: #f00;
                                        cursor: pointer;
                                        font-family: 'Consolas', 'Monaco', monospace;
                                        font-size: 12px;
                                        border-radius: 4px;
                                        margin-left: 10px;
                                    " title="Удалить карту">×</button>
                                ` : `
                                    <div style="padding: 5px 10px; color: #0ff; font-size: 10px; margin-left: 10px;" title="Предустановленная карта не может быть удалена">
                                        🔒
                                    </div>
                                `}
                            </div>
                        `).join("")}
                    </div>
                ` : `
                    <div style="padding: 15px; background: rgba(50, 0, 0, 0.3); border-radius: 6px; text-align: center;">
                        <p style="margin: 0; color: #8f8; font-size: 14px;">Нет сохраненных карт для редактирования</p>
                    </div>
                `}
            </div>
            
            <!-- Кнопки действий -->
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="launcher-cancel" style="
                    padding: 10px 20px;
                    background: rgba(50, 0, 0, 0.5);
                    border: 2px solid #f00;
                    color: #f00;
                    cursor: pointer;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    border-radius: 4px;
                    transition: all 0.2s;
                ">Отмена</button>
                <button id="launcher-confirm" style="
                    padding: 10px 20px;
                    background: rgba(0, 50, 0, 0.5);
                    border: 2px solid #0f0;
                    color: #0f0;
                    cursor: pointer;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    border-radius: 4px;
                    transition: all 0.2s;
                ">Открыть редактор</button>
            </div>
        `;

        this.modal.appendChild(content);

        // Убеждаемся, что модальное окно добавляется в самый конец body для максимального z-index
        document.body.appendChild(this.modal);

        // Принудительно устанавливаем z-index через setTimeout для гарантии
        setTimeout(() => {
            if (this.modal) {
                this.modal.style.setProperty("z-index", "999999", "important");
                this.modal.style.setProperty("position", "fixed", "important");
                this.modal.style.setProperty("display", "flex", "important");
                this.modal.style.setProperty("visibility", "visible", "important");
                this.modal.style.setProperty("opacity", "1", "important");
                this.modal.style.setProperty("pointer-events", "auto", "important");

                // Логируем для отладки
                console.log("[MapEditorLauncher] Modal created and displayed", {
                    zIndex: window.getComputedStyle(this.modal).zIndex,
                    display: window.getComputedStyle(this.modal).display,
                    visibility: window.getComputedStyle(this.modal).visibility,
                    opacity: window.getComputedStyle(this.modal).opacity
                });
            }
        }, 0);

        // Добавляем обработчики событий
        this.setupEventListeners();

        // Добавляем стили для hover эффектов
        this.addHoverStyles();
    }

    /**
     * Настроить обработчики событий
     */
    private setupEventListeners(): void {
        const modal = this.modal;
        if (!modal) return;

        let selectedAction: "new-empty" | "new-generated" | "new-world" | "edit-existing" | "load-existing" | null = null;
        let selectedMapIndex: number | null = null;

        // Обработчики для опций
        const options = modal.querySelectorAll(".launcher-option");
        options.forEach(option => {
            option.addEventListener("click", () => {
                // Убираем выделение с других опций
                options.forEach(opt => {
                    (opt as HTMLElement).style.background = "rgba(0, 50, 0, 0.3)";
                    (opt as HTMLElement).style.borderColor = "#0f0";
                });

                // Выделяем выбранную опцию
                const action = (option as HTMLElement).dataset.action;
                (option as HTMLElement).style.background = "rgba(0, 100, 0, 0.5)";
                (option as HTMLElement).style.borderColor = "#0ff";

                selectedAction = action as any;

                // Показываем/скрываем соответствующие настройки
                const sizeSettings = document.getElementById("size-settings");
                const mapTypeSelection = document.getElementById("map-type-selection");
                const editMapsList = document.getElementById("edit-maps-list");

                if (action === "new-empty" || action === "new-generated") {
                    if (sizeSettings) sizeSettings.style.display = "block";
                    if (mapTypeSelection) {
                        mapTypeSelection.style.display = action === "new-generated" ? "block" : "none";
                    }
                    if (editMapsList) editMapsList.style.display = "none";
                    if (document.getElementById("world-settings")) document.getElementById("world-settings")!.style.display = "none";
                } else if (action === "new-world") {
                    if (sizeSettings) sizeSettings.style.display = "none";
                    if (mapTypeSelection) mapTypeSelection.style.display = "none";
                    if (editMapsList) editMapsList.style.display = "none";
                    if (document.getElementById("world-settings")) document.getElementById("world-settings")!.style.display = "block";
                } else if (action === "edit-existing") {
                    if (sizeSettings) sizeSettings.style.display = "none";
                    if (mapTypeSelection) mapTypeSelection.style.display = "none";
                    if (editMapsList) editMapsList.style.display = "block";
                    if (document.getElementById("world-settings")) document.getElementById("world-settings")!.style.display = "none";
                    // Сбрасываем выбор карты при переключении
                    selectedMapIndex = null;
                    const savedMapItems = modal.querySelectorAll(".saved-map-item");
                    savedMapItems.forEach(it => {
                        (it as HTMLElement).style.background = "transparent";
                    });
                } else {
                    if (sizeSettings) sizeSettings.style.display = "none";
                    if (mapTypeSelection) mapTypeSelection.style.display = "none";
                    if (editMapsList) editMapsList.style.display = "none";
                }
            });
        });

        // Обработчики для сохраненных карт
        const savedMapItems = modal.querySelectorAll(".saved-map-item");
        savedMapItems.forEach((item, index) => {
            item.addEventListener("click", (e) => {
                // Игнорируем клики на кнопку удаления
                if ((e.target as HTMLElement).classList.contains("delete-map-btn")) {
                    return;
                }

                // Убираем выделение с других карт
                savedMapItems.forEach(it => {
                    (it as HTMLElement).style.background = "transparent";
                });

                // Выделяем выбранную карту
                (item as HTMLElement).style.background = "rgba(0, 100, 0, 0.5)";
                selectedMapIndex = index;
                // Если выбрана опция "edit-existing", используем её, иначе "load-existing"
                if (selectedAction === "edit-existing") {
                    // Оставляем selectedAction как "edit-existing"
                } else {
                    selectedAction = "load-existing";
                }

                // Скрываем настройки
                const sizeSettings = document.getElementById("size-settings");
                const mapTypeSelection = document.getElementById("map-type-selection");
                if (sizeSettings) sizeSettings.style.display = "none";
                if (mapTypeSelection) mapTypeSelection.style.display = "none";
            });
        });

        // Обработчики для кнопок удаления карт
        const deleteButtons = modal.querySelectorAll(".delete-map-btn");
        deleteButtons.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const mapIndex = parseInt((btn as HTMLElement).dataset.mapIndex || "0");
                const savedMaps = this.loadSavedMaps();

                if (mapIndex >= 0 && mapIndex < savedMaps.length) {
                    const mapName = savedMaps[mapIndex]!.name;
                    if (confirm(`Удалить карту "${mapName}"?`)) {
                        savedMaps.splice(mapIndex, 1);
                        localStorage.setItem("savedMaps", JSON.stringify(savedMaps));

                        // Пересоздаем модальное окно для обновления списка
                        this.modal?.remove();
                        this.createModal();
                    }
                }
            });
        });

        // Кнопка подтверждения
        const confirmBtn = document.getElementById("launcher-confirm");
        if (confirmBtn) {
            confirmBtn.addEventListener("click", async () => {
                if (!selectedAction) {
                    alert("Пожалуйста, выберите способ создания карты");
                    return;
                }

                let config: StandaloneMapEditorConfig | undefined;

                if (selectedAction === "new-empty") {
                    const sizeSelect = document.getElementById("map-size") as HTMLSelectElement;
                    const mapSize = sizeSelect ? parseInt(sizeSelect.value) : 500;
                    config = { mapSize };
                } else if (selectedAction === "new-generated") {
                    const sizeSelect = document.getElementById("map-size") as HTMLSelectElement;
                    const mapTypeSelect = document.getElementById("map-type") as HTMLSelectElement;
                    const mapSize = sizeSelect ? parseInt(sizeSelect.value) : 500;
                    const mapType = mapTypeSelect ? mapTypeSelect.value : "polygon";
                    config = { mapSize, mapType };
                } else if (selectedAction === "new-world") {
                    // Logic for World Generation
                    const promptInput = document.getElementById("world-prompt") as HTMLInputElement;
                    const prompt = promptInput ? promptInput.value : "";

                    if (!prompt) {
                        alert("Введите название места");
                        return;
                    }

                    // Disable button to show loading
                    confirmBtn.textContent = "⏳ Генерируем...";
                    (confirmBtn as HTMLButtonElement).disabled = true;

                    try {
                        const ai = new AiService();
                        const location = await ai.parseLocationPrompt(prompt);

                        if (!location) {
                            alert("Место не найдено. Попробуйте уточнить запрос.");
                            confirmBtn.textContent = "Открыть редактор";
                            (confirmBtn as HTMLButtonElement).disabled = false;
                            return;
                        }

                        // Fetch real data
                        // We need a temporary scene to use WorldBuilder? No, we split logic.
                        // We instantiate WorldBuilder with a dummy scene or just use its Service capabilities?
                        // Wait, WorldBuilder takes a Scene in constructor.
                        // We can't use WorldBuilder easily here without a scene.
                        // We should probably pass the 'generation request' to the MapEditor to handle loading screen?
                        // OR: We use the `downloadArea` method of WorldBuilder but we need instance.

                        // Workaround: We will pass a special config to MapEditor telling it to generate this world on init.

                        config = {
                            mapType: "world",
                            mapSize: 1000, // Default size
                            worldGen: {
                                lat: location.lat,
                                lon: location.lon,
                                name: location.displayName
                            }
                        };

                    } catch (e) {
                        console.error("World Gen Error", e);
                        alert("Ошибка при получении данных мира");
                        confirmBtn.textContent = "Открыть редактор";
                        (confirmBtn as HTMLButtonElement).disabled = false;
                        return;
                    }
                } else if ((selectedAction === "edit-existing" || selectedAction === "load-existing") && selectedMapIndex !== null) {
                    const savedMaps = this.loadSavedMaps();
                    if (savedMaps[selectedMapIndex]) {
                        config = { mapData: savedMaps[selectedMapIndex] };
                    } else {
                        alert("Карта не найдена");
                        return;
                    }
                } else if (selectedAction === "edit-existing") {
                    alert("Пожалуйста, выберите карту для редактирования");
                    return;
                }

                // Для "edit-existing" используем action "load-existing" в результате, так как логика одинаковая
                const resultAction = selectedAction === "edit-existing" ? "load-existing" : selectedAction;
                this.resolve({ action: resultAction, config });
            });
        }

        // Кнопка отмены
        const cancelBtn = document.getElementById("launcher-cancel");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                this.resolve({ action: "cancel" });
            });
        }

        // Закрытие по клику на фон
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                this.resolve({ action: "cancel" });
            }
        });

        // Закрытие по Escape
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.resolve({ action: "cancel" });
                document.removeEventListener("keydown", escapeHandler);
            }
        };
        document.addEventListener("keydown", escapeHandler);

        // Handler for Check Location
        const checkBtn = document.getElementById("check-location-btn");
        if (checkBtn) {
            checkBtn.addEventListener("click", async () => {
                const promptInput = document.getElementById("world-prompt") as HTMLInputElement;
                const statusDiv = document.getElementById("location-status");
                if (!promptInput || !statusDiv) return;

                const query = promptInput.value;
                if (!query) return;

                statusDiv.textContent = "Поиск...";
                statusDiv.style.color = "#aaa";

                try {
                    const ai = new AiService();
                    const loc = await ai.parseLocationPrompt(query);
                    if (loc) {
                        statusDiv.textContent = `✅ Найдено: ${loc.displayName}`;
                        statusDiv.style.color = "#0f0";
                    } else {
                        statusDiv.textContent = "❌ Место не найдено";
                        statusDiv.style.color = "#f00";
                    }
                } catch (e) {
                    statusDiv.textContent = "Ошибка сервиса";
                    statusDiv.style.color = "#f00";
                }
            });
        }
    }

    /**
     * Добавить стили для hover эффектов
     */
    private addHoverStyles(): void {
        // Проверяем, не добавлены ли стили уже
        if (document.getElementById("map-editor-launcher-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "map-editor-launcher-styles";
        style.textContent = `
            /* Принудительные стили для модального окна редактора карт */
            #map-editor-launcher-modal {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.85) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                pointer-events: auto !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            .launcher-option:hover {
                background: rgba(0, 100, 0, 0.5) !important;
                border-color: #0ff !important;
                transform: translateY(-2px);
            }
            .saved-map-item:hover {
                background: rgba(0, 100, 0, 0.3) !important;
            }
            #launcher-confirm:hover {
                background: rgba(0, 100, 0, 0.7) !important;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
            }
            #launcher-cancel:hover {
                background: rgba(100, 0, 0, 0.7) !important;
                box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Загрузить сохраненные карты из localStorage
     * Ищет все возможные места, где могут храниться карты
     * Также добавляет все предустановленные карты игры
     */
    /**
     * Нормализовать MapData к единому формату (то же что и в MapEditor)
     */
    private normalizeMapData(data: any): MapData | null {
        if (!data || typeof data !== "object" || !data.name) {
            return null;
        }

        const CURRENT_VERSION = 1;

        const normalized: MapData = {
            version: CURRENT_VERSION,
            name: String(data.name),
            mapType: data.mapType || "normal",
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

    private loadSavedMaps(): MapData[] {
        const allMaps: MapData[] = [];
        const mapNames = new Set<string>(); // Для отслеживания уникальных имен

        try {
            // Основное хранилище карт
            const saved = localStorage.getItem("savedMaps");
            if (saved) {
                const maps = JSON.parse(saved) as any[];
                if (Array.isArray(maps)) {
                    maps.forEach(map => {
                        if (map && map.name && !mapNames.has(map.name)) {
                            // Нормализуем каждую карту к единому формату
                            const normalized = this.normalizeMapData(map);
                            if (normalized) {
                                allMaps.push(normalized);
                                mapNames.add(normalized.name);
                            }
                        }
                    });
                    logger.log(`[MapEditorLauncher] Loaded ${maps.length} maps from "savedMaps" (normalized to ${allMaps.length})`);
                }
            }

            // Проверяем все ключи в localStorage, которые могут содержать карты
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;

                // Ищем ключи, которые могут содержать карты
                if (key.startsWith("map_") || key.startsWith("savedMap_") || key.includes("mapData")) {
                    try {
                        const value = localStorage.getItem(key);
                        if (value) {
                            const parsed = JSON.parse(value);
                            // Проверяем, является ли это MapData
                            if (parsed && typeof parsed === "object" && parsed.name && parsed.terrainEdits !== undefined) {
                                // Нормализуем к единому формату
                                const normalized = this.normalizeMapData(parsed);
                                if (normalized && !mapNames.has(normalized.name)) {
                                    allMaps.push(normalized);
                                    mapNames.add(normalized.name);
                                    logger.log(`[MapEditorLauncher] Found map "${normalized.name}" in key "${key}" (normalized)`);
                                }
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки парсинга отдельных ключей
                    }
                }
            }

            // Добавляем все предустановленные карты игры как виртуальные MapData
            // Это позволяет редактировать все карты, даже если они не были сохранены через редактор
            ALL_MAPS.forEach((mapType) => {
                const mapTypeInfo = MAP_TYPES.find(t => t.id === mapType);

                // Пропускаем карты без генератора (sandbox использует простой террейн)
                // Для sandbox создадим отдельную обработку
                if (mapType === "sandbox") {
                    // Для sandbox создаем простую карту без генератора
                    const displayName = `[Предустановленная] Песочница`;
                    if (!mapNames.has(displayName)) {
                        const virtualMap: MapData = {
                            version: 1, // Версия формата
                            name: displayName,
                            mapType: "sandbox", // ОБЯЗАТЕЛЬНО: sandbox не имеет генератора, будет просто плоский террейн
                            terrainEdits: [],
                            placedObjects: [],
                            triggers: [],
                            metadata: {
                                createdAt: Date.now(),
                                modifiedAt: Date.now(),
                                description: "Свободный режим для тестов",
                                isPreset: true // Предустановленная карта
                            }
                        };
                        allMaps.push(virtualMap);
                        mapNames.add(displayName);
                    }
                    return; // Пропускаем дальнейшую обработку для sandbox
                }

                const mapName = mapTypeInfo ? mapTypeInfo.name : mapType;
                const displayName = `[Предустановленная] ${mapName}`;

                // Проверяем, нет ли уже карты с таким именем
                if (!mapNames.has(displayName)) {
                    const virtualMap: MapData = {
                        version: 1, // Версия формата
                        name: displayName,
                        mapType: mapType, // ОБЯЗАТЕЛЬНО: всегда должен быть mapType
                        terrainEdits: [],
                        placedObjects: [],
                        triggers: [],
                        metadata: {
                            createdAt: Date.now(),
                            modifiedAt: Date.now(),
                            description: mapTypeInfo?.description || `Предустановленная карта типа ${mapType}`,
                            isPreset: true // Предустановленная карта
                        }
                    };
                    allMaps.push(virtualMap);
                    mapNames.add(displayName);
                }
            });

            // Сортируем карты: сначала сохраненные пользователем, потом предустановленные
            allMaps.sort((a, b) => {
                const aIsPreset = a.name.startsWith("[Предустановленная]");
                const bIsPreset = b.name.startsWith("[Предустановленная]");

                // Сначала пользовательские карты
                if (aIsPreset && !bIsPreset) return 1;
                if (!aIsPreset && bIsPreset) return -1;

                // Внутри каждой группы сортируем по дате
                const dateA = a.metadata?.modifiedAt || a.metadata?.createdAt || 0;
                const dateB = b.metadata?.modifiedAt || b.metadata?.createdAt || 0;
                return dateB - dateA;
            });

            logger.log(`[MapEditorLauncher] Total maps loaded: ${allMaps.length} (${allMaps.filter(m => !m.name.startsWith("[Предустановленная]")).length} user maps + ${allMaps.filter(m => m.name.startsWith("[Предустановленная]")).length} preset maps)`);

        } catch (error) {
            logger.error("[MapEditorLauncher] Failed to load saved maps:", error);
        }

        return allMaps;
    }

    /**
     * Разрешить Promise с результатом
     */
    private resolve(result: MapEditorLaunchResult): void {
        // Удаляем модальное окно
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        // Вызываем callback
        if (this.resolveCallback) {
            this.resolveCallback(result);
            this.resolveCallback = null;
        }
    }
}

