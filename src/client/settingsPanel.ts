
import { Game } from "./game";
import { GameSettings, DEFAULT_SETTINGS, saveSettingsFromUI, saveSettings as saveSettingsModule } from "./menu/settings";
import { LANG, getLang } from "./localization";

export class SettingsPanel {
    private game: Game | null = null;
    private container: HTMLElement | null = null;
    private settings: GameSettings;
    private isEmbedded: boolean = false;

    constructor(settings: GameSettings, isEmbedded: boolean = false) {
        this.settings = settings;
        this.isEmbedded = isEmbedded;
    }

    setGame(game: Game): void {
        this.game = game;
    }

    renderToContainer(container: HTMLElement): void {
        this.container = container;
        this.createUI();
        this.setupEventListeners();
    }

    private createUI(): void {
        if (!this.container) return;

        const L = getLang(this.settings);

        this.container.innerHTML = `
            <div class="settings-panel-content">
                ${!this.isEmbedded ? `<div class="panel-header">
                    <div class="panel-title">${L.options}</div>
                    <button class="panel-close" id="settings-close">×</button>
                </div>` : ''}

                <div class="settings-tabs">
                    <button class="settings-tab active" data-tab="general">ОБЩИЕ</button>
                    <button class="settings-tab" data-tab="graphics">ГРАФИКА</button>
                    <button class="settings-tab" data-tab="audio">ЗВУК</button>
                    <button class="settings-tab" data-tab="controls">УПРАВЛЕНИЕ</button>
                    <button class="settings-tab" data-tab="gameplay">ГЕЙМПЛЕЙ</button>
                    <button class="settings-tab" data-tab="camera">КАМЕРА</button>
                    <button class="settings-tab" data-tab="network">СЕТЬ</button>
                    <button class="settings-tab" data-tab="accessibility">ДОСТУПНОСТЬ</button>
                    <button class="settings-tab" data-tab="advanced">РАЗНОЕ</button>
                </div>

                <div class="settings-content">
                    <!-- General Tab -->
                    <div class="settings-tab-content active" data-content="general">
                        <div class="setting-row">
                            <span class="setting-label">${L.language}</span>
                            <div class="setting-value">
                                <button class="panel-btn small ${this.settings.language === 'ru' ? 'active' : ''}" id="lang-ru">RU</button>
                                <button class="panel-btn small ${this.settings.language === 'en' ? 'active' : ''}" id="lang-en">EN</button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.enemyDifficulty}</span>
                            <div class="setting-value">
                                <button class="panel-btn small diff-btn ${this.settings.enemyDifficulty === 'easy' ? 'active' : ''}" id="diff-easy">${L.diffEasy}</button>
                                <button class="panel-btn small diff-btn ${this.settings.enemyDifficulty === 'medium' ? 'active' : ''}" id="diff-medium">${L.diffMedium}</button>
                                <button class="panel-btn small diff-btn ${this.settings.enemyDifficulty === 'hard' ? 'active' : ''}" id="diff-hard">${L.diffHard}</button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.worldSeed}</span>
                            <div class="setting-value">
                                <input type="number" class="setting-input" id="set-seed" value="${this.settings.worldSeed}" ${this.settings.useRandomSeed ? 'disabled' : ''}>
                                <button class="panel-btn small" id="seed-random">🎲</button>
                                <button class="panel-btn small" id="seed-copy">📋</button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.randomSeed}</span>
                            <input type="checkbox" class="setting-checkbox" id="set-random-seed" ${this.settings.useRandomSeed ? 'checked' : ''}>
                        </div>
                    </div>

                    <!-- Graphics Tab -->
                    <div class="settings-tab-content" data-content="graphics">
                        <div class="setting-row">
                            <span class="setting-label">Разрешение рендера</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-render" min="0.5" max="2.0" step="0.1" value="${this.settings.renderScale}">
                                <span id="set-render-val">${this.settings.renderScale}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Тени</span>
                            <input type="checkbox" class="setting-checkbox" id="set-shadows" ${this.settings.details === 'high' ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Качество теней</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-shadow-quality">
                                    <option value="0" ${this.settings.shadowQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.shadowQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.shadowQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Частицы</span>
                            <input type="checkbox" class="setting-checkbox" id="set-particles" ${this.settings.particles ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Трава</span>
                            <input type="checkbox" class="setting-checkbox" id="set-grass" ${this.settings.grass ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Следы от выстрелов</span>
                            <input type="checkbox" class="setting-checkbox" id="set-decals" ${this.settings.decals ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">FXAA (Сглаживание)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-fxaa" ${this.settings.antialiasing ? 'checked' : ''}>
                        </div>
                         <div class="setting-row">
                            <span class="setting-label">SSAO (Затенение)</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-ssao">
                                    <option value="none" ${this.settings.ssao === 'none' ? 'selected' : ''}>Выкл</option>
                                    <option value="low" ${this.settings.ssao === 'low' ? 'selected' : ''}>Низкое</option>
                                    <option value="medium" ${this.settings.ssao === 'medium' ? 'selected' : ''}>Среднее</option>
                                    <option value="high" ${this.settings.ssao === 'high' ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Bloom (Свечение)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-bloom" ${this.settings.bloom ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Ограничение FPS</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-max-fps" min="0" max="144" step="30" value="${this.settings.maxFps}">
                                <span id="set-max-fps-val">${this.settings.maxFps === 0 ? "Без ограничений" : this.settings.maxFps}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.fullscreen}</span>
                            <input type="checkbox" class="setting-checkbox" id="set-fullscreen" ${this.settings.fullscreen ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Масштаб интерфейса</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-ui-scale" min="50" max="150" step="10" value="${this.settings.uiScale}">
                                <span id="set-ui-scale-val">${this.settings.uiScale}%</span>
                            </div>
                        </div>
                    </div>

                    <!-- Audio Tab -->
                    <div class="settings-tab-content" data-content="audio">
                        <div class="setting-row">
                            <span class="setting-label">Общая громкость</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-master-volume" min="0" max="100" value="${this.settings.masterVolume}">
                                <span id="set-master-volume-val">${this.settings.masterVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.sound}</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-sound" min="0" max="100" value="${this.settings.soundVolume}">
                                <span id="set-sound-val">${this.settings.soundVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.music}</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-music" min="0" max="100" value="${this.settings.musicVolume}">
                                <span id="set-music-val">${this.settings.musicVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Фоновые звуки</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-ambient-volume" min="0" max="100" value="${this.settings.ambientVolume}">
                                <span id="set-ambient-volume-val">${this.settings.ambientVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Громкость голоса</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-voice-volume" min="0" max="100" value="${this.settings.voiceVolume}">
                                <span id="set-voice-volume-val">${this.settings.voiceVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Отключить звук при потере фокуса</span>
                            <input type="checkbox" class="setting-checkbox" id="set-mute-on-focus-loss" ${this.settings.muteOnFocusLoss ? 'checked' : ''}>
                        </div>
                    </div>

                    <!-- Controls Tab -->
                    <div class="settings-tab-content" data-content="controls">
                        <div class="setting-row">
                            <span class="setting-label">Чувствительность мыши</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-mouse" min="1" max="10" value="${this.settings.mouseSensitivity}">
                                <span id="set-mouse-val">${this.settings.mouseSensitivity}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Инверсия мыши по Y</span>
                            <input type="checkbox" class="setting-checkbox" id="set-invert-mouse-y" ${this.settings.invertMouseY ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Раскладка клавиатуры</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-keyboard-layout">
                                    <option value="qwerty" ${this.settings.keyboardLayout === 'qwerty' ? 'selected' : ''}>QWERTY</option>
                                    <option value="azerty" ${this.settings.keyboardLayout === 'azerty' ? 'selected' : ''}>AZERTY</option>
                                    <option value="qwertz" ${this.settings.keyboardLayout === 'qwertz' ? 'selected' : ''}>QWERTZ</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Автоматическая перезарядка</span>
                            <input type="checkbox" class="setting-checkbox" id="set-auto-reload" ${this.settings.autoReload ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Удержание для прицеливания</span>
                            <input type="checkbox" class="setting-checkbox" id="set-hold-to-aim" ${this.settings.holdToAim ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Виртуальная фиксация башни</span>
                            <input type="checkbox" class="setting-checkbox" id="set-virtual-fixation" ${this.settings.virtualTurretFixation ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Экранное управление (джойстик)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-touch-controls" ${this.settings.showTouchControls ? 'checked' : ''}>
                        </div>
                    </div>

                    <!-- Gameplay Tab -->
                    <div class="settings-tab-content" data-content="gameplay">
                        <div class="setting-row">
                            <span class="setting-label">Показывать обучение</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-tutorial" ${this.settings.showTutorial ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать подсказки</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-hints" ${this.settings.showHints ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать прицел</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-crosshair" ${this.settings.showCrosshair ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Стиль прицела</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-crosshair-style">
                                    <option value="default" ${this.settings.crosshairStyle === 'default' ? 'selected' : ''}>По умолчанию</option>
                                    <option value="dot" ${this.settings.crosshairStyle === 'dot' ? 'selected' : ''}>Точка</option>
                                    <option value="cross" ${this.settings.crosshairStyle === 'cross' ? 'selected' : ''}>Крест</option>
                                    <option value="circle" ${this.settings.crosshairStyle === 'circle' ? 'selected' : ''}>Круг</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать полоску здоровья</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-health-bar" ${this.settings.showHealthBar ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать счетчик патронов</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-ammo-counter" ${this.settings.showAmmoCounter ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Панель характеристик танка</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-tank-stats-panel" ${this.settings.showTankStatsPanel ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Автосохранение</span>
                            <input type="checkbox" class="setting-checkbox" id="set-auto-save" ${this.settings.autoSave ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Интервал автосохранения (сек)</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-auto-save-interval" min="60" max="600" step="60" value="${this.settings.autoSaveInterval}">
                                <span id="set-auto-save-interval-val">${this.settings.autoSaveInterval}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Camera Tab -->
                    <div class="settings-tab-content" data-content="camera">
                        <div class="setting-row">
                            <span class="setting-label">Расстояние камеры</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-dist" min="5" max="25" value="${this.settings.cameraDistance}">
                                <span id="set-camera-dist-val">${this.settings.cameraDistance}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Высота камеры</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-height" min="3" max="10" step="0.5" value="${this.settings.cameraHeight}">
                                <span id="set-camera-height-val">${this.settings.cameraHeight}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Поле зрения (FOV)</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-fov" min="45" max="90" value="${this.settings.cameraFOV}">
                                <span id="set-camera-fov-val">${this.settings.cameraFOV}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Сглаживание камеры</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-smoothing" min="0" max="1" step="0.1" value="${this.settings.cameraSmoothing}">
                                <span id="set-camera-smoothing-val">${this.settings.cameraSmoothing}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Тряска экрана</span>
                            <input type="checkbox" class="setting-checkbox" id="set-screen-shake" ${this.settings.screenShake ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Интенсивность тряски</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-shake-intensity" min="0" max="1" step="0.1" value="${this.settings.cameraShakeIntensity}">
                                <span id="set-camera-shake-intensity-val">${this.settings.cameraShakeIntensity}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Режим от первого лица</span>
                            <input type="checkbox" class="setting-checkbox" id="set-first-person-mode" ${this.settings.firstPersonMode ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">FOV прицеливания</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-aim-fov" min="0.1" max="1" step="0.1" value="${this.settings.aimFOV}">
                                <span id="set-aim-fov-val">${this.settings.aimFOV}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Network Tab -->
                    <div class="settings-tab-content" data-content="network">
                        <div class="setting-row">
                            <span class="setting-label">Показывать пинг</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-ping" ${this.settings.showPing ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать сетевую статистику</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-network-stats" ${this.settings.showNetworkStats ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать индикатор качества синхронизации</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-sync-quality" ${this.settings.showSyncQuality ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Качество сети</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-network-quality">
                                    <option value="0" ${this.settings.networkQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.networkQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.networkQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Accessibility Tab -->
                    <div class="settings-tab-content" data-content="accessibility">
                        <div class="setting-row">
                            <span class="setting-label">Режим для дальтоников</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-color-blind-mode">
                                    <option value="none" ${this.settings.colorBlindMode === 'none' ? 'selected' : ''}>Отключено</option>
                                    <option value="protanopia" ${this.settings.colorBlindMode === 'protanopia' ? 'selected' : ''}>Протанопия</option>
                                    <option value="deuteranopia" ${this.settings.colorBlindMode === 'deuteranopia' ? 'selected' : ''}>Дейтеранопия</option>
                                    <option value="tritanopia" ${this.settings.colorBlindMode === 'tritanopia' ? 'selected' : ''}>Тританопия</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Размер шрифта</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-font-size" min="10" max="24" value="${this.settings.fontSize}">
                                <span id="set-font-size-val">${this.settings.fontSize}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Высокий контраст</span>
                            <input type="checkbox" class="setting-checkbox" id="set-high-contrast" ${this.settings.highContrast ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Субтитры</span>
                            <input type="checkbox" class="setting-checkbox" id="set-subtitles" ${this.settings.subtitles ? 'checked' : ''}>
                        </div>
                    </div>

                    <!-- Advanced Tab -->
                    <div class="settings-tab-content" data-content="advanced">
                        <div class="setting-row">
                            <span class="setting-label">Показывать отладочную информацию</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-debug-info" ${this.settings.showDebugInfo ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Включить читы (для разработки)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-enable-cheats" ${this.settings.enableCheats ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.openCheatMenu}</span>
                            <div class="setting-value">
                                <button class="panel-btn secondary" id="open-cheat-menu">Ctrl+7</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="panel-buttons" style="margin-top: 20px;">
                    <button class="panel-btn primary" id="settings-save">Сохранить</button>
                    ${!this.isEmbedded ? `<button class="panel-btn danger" id="settings-reset">Сброс</button>` : ''}
                </div>
            </div>
        `;

        if (!document.getElementById("settings-tab-styles")) {
            // Add CSS for tabs
            const style = document.createElement("style");
            style.id = "settings-tab-styles";
            style.textContent = `
                .settings-tabs {
                    display: flex;
                    gap: 5px;
                    margin-bottom: 20px;
                    border-bottom: 1px solid #444;
                    flex-wrap: wrap;
                }
                .settings-tab {
                    padding: 8px 16px;
                    background: #2a2a2a;
                    border: none;
                    color: #aaa;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                    font-family: 'Press Start 2P', 'Courier New', monospace;
                    font-size: 11px;
                    letter-spacing: 0.5px;
                }
                .settings-tab:hover {
                    background: #333;
                    color: #fff;
                }
                .settings-tab.active {
                    color: #5a8;
                    border-bottom-color: #5a8;
                    background: #1a1a1a;
                }
                .settings-tab-content {
                    display: none;
                }
                .settings-tab-content.active {
                    display: block;
                }
            `;
            document.head.appendChild(style);
        }
    }

    private setupEventListeners(): void {
        if (!this.container) return;

        // Helper to find elements within container (or globally if needed, though specific IDs are risky)
        // Since IDs are hardcoded in the original menu, we should try to scope them if possible, 
        // OR rely on global IDs but ensure cleanup. For now, assuming direct specific IDs.
        const $ = (id: string) => this.container!.querySelector("#" + id);
        const $$ = (selector: string) => this.container!.querySelectorAll(selector);

        // Tab switching
        $$(".settings-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = (tab as HTMLElement).dataset.tab;
                $$(".settings-tab").forEach(t => t.classList.remove("active"));
                $$(".settings-tab-content").forEach(c => c.classList.remove("active"));
                tab.classList.add("active");
                const content = this.container!.querySelector(`[data-content="${tabName}"]`);
                content?.classList.add("active");
            });
        });

        const setupSlider = (id: string, valId: string, suffix: string = "", formatter?: (val: string) => string) => {
            const slider = $(id) as HTMLInputElement;
            const val = $(valId);
            slider?.addEventListener("input", () => {
                if (val) {
                    val.textContent = formatter ? formatter(slider.value) : slider.value + suffix;
                }
            });
        };

        setupSlider("set-render", "set-render-val");
        setupSlider("set-sound", "set-sound-val", "%");
        setupSlider("set-music", "set-music-val", "%");
        setupSlider("set-mouse", "set-mouse-val");
        setupSlider("set-camera-dist", "set-camera-dist-val");
        setupSlider("set-camera-height", "set-camera-height-val");
        setupSlider("set-camera-fov", "set-camera-fov-val");
        setupSlider("set-camera-smoothing", "set-camera-smoothing-val");
        setupSlider("set-camera-shake-intensity", "set-camera-shake-intensity-val");
        setupSlider("set-ui-scale", "set-ui-scale-val", "%");
        setupSlider("set-aim-fov", "set-aim-fov-val");
        setupSlider("set-master-volume", "set-master-volume-val", "%");
        setupSlider("set-ambient-volume", "set-ambient-volume-val", "%");
        setupSlider("set-voice-volume", "set-voice-volume-val", "%");
        setupSlider("set-auto-save-interval", "set-auto-save-interval-val");
        setupSlider("set-font-size", "set-font-size-val");
        setupSlider("set-max-fps", "set-max-fps-val", "", (val) => val === "0" ? "Без ограничений" : val);

        // Language toggle
        $("lang-ru")?.addEventListener("click", () => {
            this.settings.language = "ru";
            $("lang-ru")?.classList.add("active");
            $("lang-en")?.classList.remove("active");
        });

        $("lang-en")?.addEventListener("click", () => {
            this.settings.language = "en";
            $("lang-en")?.classList.add("active");
            $("lang-ru")?.classList.remove("active");
        });

        // Difficulty selector
        ["easy", "medium", "hard"].forEach(diff => {
            $("diff-" + diff)?.addEventListener("click", () => {
                this.settings.enemyDifficulty = diff as "easy" | "medium" | "hard";
                $$(".diff-btn").forEach(btn => btn.classList.remove("active"));
                $("diff-" + diff)?.classList.add("active");
            });
        });

        // Seed controls
        const seedInput = $("set-seed") as HTMLInputElement;
        const randomSeedCheckbox = $("set-random-seed") as HTMLInputElement;

        randomSeedCheckbox?.addEventListener("change", () => {
            this.settings.useRandomSeed = randomSeedCheckbox.checked;
            if (seedInput) {
                seedInput.disabled = randomSeedCheckbox.checked;
                if (randomSeedCheckbox.checked) {
                    const newSeed = Math.floor(Math.random() * 999999999);
                    seedInput.value = newSeed.toString();
                    this.settings.worldSeed = newSeed;
                }
            }
        });

        seedInput?.addEventListener("change", () => {
            const value = parseInt(seedInput.value) || 12345;
            this.settings.worldSeed = value;
            seedInput.value = value.toString();
        });

        $("seed-copy")?.addEventListener("click", () => {
            const seed = this.settings.worldSeed.toString();
            navigator.clipboard.writeText(seed).then(() => {
                const btn = $("seed-copy");
                if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = "✓";
                    setTimeout(() => { btn.textContent = originalText; }, 1000);
                }
            });
        });

        $("seed-random")?.addEventListener("click", () => {
            const newSeed = Math.floor(Math.random() * 999999999);
            this.settings.worldSeed = newSeed;
            if (seedInput) {
                seedInput.value = newSeed.toString();
            }
        });

        const fullscreenCheckbox = $("set-fullscreen") as HTMLInputElement | null;
        fullscreenCheckbox?.addEventListener("change", (e) => {
            // Fullscreen needs to be handled by the main app usually, or we trigger it here if passing reference
            // Since MainMenu had logic for this, we should invoke it or rely on Game.ts handling it via settings check?
            // MainMenu called this.handleFullscreenCheckbox. 
            // We can check if settings have it and apply. 
            const value = !!(e.target as HTMLInputElement)?.checked;
            if (value) {
                document.documentElement.requestFullscreen().catch((e) => console.error(e));
            } else {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
            }
            this.settings.fullscreen = value;
        });

        // Open cheat menu button
        $("open-cheat-menu")?.addEventListener("click", () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "7", code: "Digit7", ctrlKey: true }));
        });

        $("settings-save")?.addEventListener("click", () => {
            // Need a way to save. We imported saveSettingsFromUI in menu.ts, which reads from DOM...
            // But here we are modifying this.settings directly in listeners!
            // So we should capture the rest of the values from inputs before saving.
            this.syncSettingsFromUI();

            // Save logic
            saveSettingsModule(this.settings);
            window.dispatchEvent(new CustomEvent("settingsChanged", { detail: this.settings }));

            // If embedded, we might not want to reload
            if (!this.isEmbedded) {
                location.reload();
            } else {
                // Visualization update? 
                // Just notify game
                if (this.game) {
                    // this.game.onSettingsChanged? 
                    // The event dispatch above handles most things if Game listens to it.
                }
            }
        });

        if (!this.isEmbedded) {
            $("settings-reset")?.addEventListener("click", () => {
                const savedDefaults = { ...DEFAULT_SETTINGS };
                // Overwrite current settings logic
                // But simpler:
                saveSettingsModule(savedDefaults);
                location.reload();
            });

            $("settings-close")?.addEventListener("click", () => {
                // If standard panel, we should close. 
                // But we don't control visibility here cleanly unless we emit an event or remove element.
                // Assuming caller handles close if they pass a container.
                if (this.container?.parentElement?.classList.contains("panel-overlay")) {
                    this.container.parentElement.style.display = "none";
                    this.container.parentElement.classList.remove("visible");
                }
            });
        }
    }

    private syncSettingsFromUI(): void {
        const $ = (id: string) => this.container!.querySelector("#" + id) as HTMLInputElement | HTMLSelectElement | null;

        const getCheck = (id: string) => ($("set-" + id) as HTMLInputElement)?.checked ?? false;
        const getVal = (id: string) => parseFloat(($("set-" + id) as HTMLInputElement)?.value ?? "0");
        const getStr = (id: string) => ($("set-" + id) as HTMLInputElement | HTMLSelectElement)?.value ?? "";

        // Graphics
        this.settings.renderScale = getVal("render");
        this.settings.shadows = getCheck("shadows"); // Note: ID was set-shadows, check settings.details mapping?
        // In original XML: this.settings.details === 'high' ? 'checked' : '' for set-shadows??
        // Let's assume set-shadows maps to details='high' vs 'low' logic if simplified,
        // BUT wait, looking at createSettingsUI:
        // <input type="checkbox" ... id="set-shadows" ${this.settings.details === 'high' ? 'checked' : ''}>
        // It seems "Shadows" checkbox toggles between high/low or on/off?
        // Actually in saveSettingsFromUI (menu.ts), let's check how it reads it.

        // To be safe, let's map standard fields:
        this.settings.details = getCheck("shadows") ? 'high' : 'low';
        this.settings.shadowQuality = getStr("shadow-quality") as any;
        this.settings.particles = getCheck("particles");
        this.settings.grass = getCheck("grass");
        this.settings.decals = getCheck("decals");
        this.settings.antialiasing = getCheck("fxaa");
        this.settings.ssao = getStr("ssao") as any;
        this.settings.bloom = getCheck("bloom");
        this.settings.maxFps = getVal("max-fps");
        this.settings.uiScale = getVal("ui-scale");

        // Sound
        this.settings.masterVolume = getVal("master-volume");
        this.settings.soundVolume = getVal("sound");
        this.settings.musicVolume = getVal("music");
        this.settings.ambientVolume = getVal("ambient-volume");
        this.settings.voiceVolume = getVal("voice-volume");
        this.settings.muteOnFocusLoss = getCheck("mute-on-focus-loss");

        // Controls
        this.settings.mouseSensitivity = getVal("mouse");
        this.settings.invertMouseY = getCheck("invert-mouse-y");
        this.settings.keyboardLayout = getStr("keyboard-layout") as any;
        this.settings.autoReload = getCheck("auto-reload");
        this.settings.holdToAim = getCheck("hold-to-aim");
        this.settings.virtualTurretFixation = getCheck("virtual-fixation");
        this.settings.showTouchControls = getCheck("touch-controls");

        // Gameplay
        this.settings.showTutorial = getCheck("show-tutorial");
        this.settings.showHints = getCheck("show-hints");
        this.settings.showCrosshair = getCheck("show-crosshair");
        this.settings.crosshairStyle = getStr("crosshair-style") as any;
        this.settings.showHealthBar = getCheck("show-health-bar");
        this.settings.showAmmoCounter = getCheck("show-ammo-counter");
        this.settings.showTankStatsPanel = getCheck("show-tank-stats-panel");
        this.settings.autoSave = getCheck("auto-save");
        this.settings.autoSaveInterval = getVal("auto-save-interval");

        // Camera
        this.settings.cameraDistance = getVal("camera-dist");
        this.settings.cameraHeight = getVal("camera-height");
        this.settings.cameraFOV = getVal("camera-fov");
        this.settings.cameraSmoothing = getVal("camera-smoothing");
        this.settings.screenShake = getCheck("screen-shake");
        this.settings.cameraShakeIntensity = getVal("camera-shake-intensity");
        this.settings.firstPersonMode = getCheck("first-person-mode");
        this.settings.aimFOV = getVal("aim-fov");

        // Network
        this.settings.showPing = getCheck("show-ping");
        this.settings.showNetworkStats = getCheck("show-network-stats");
        this.settings.showSyncQuality = getCheck("show-sync-quality");
        this.settings.networkQuality = parseInt(getStr("network-quality"));

        // Accessibility
        this.settings.colorBlindMode = getStr("color-blind-mode") as any;
        this.settings.fontSize = getVal("font-size");
        this.settings.highContrast = getCheck("high-contrast");
        this.settings.subtitles = getCheck("subtitles");

        // Advanced
        this.settings.showDebugInfo = getCheck("show-debug-info");
        this.settings.enableCheats = getCheck("enable-cheats");
    }
}
