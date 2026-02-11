/**
 * Расширенный селектор аватарок с генерацией, историей и редактором
 */

import { generatePixelAvatar, type PixelAvatarOptions } from "./pixelAvatarGenerator";
import { inGameAlert, inGameConfirm } from "../utils/inGameDialogs";
import { logger } from "../utils/logger";
import {
    generateAvatarWithGemini,
    generateMultipleVariants,
    exportAvatarAsBase64,
    exportAvatarAsJSON,
    importAvatarFromJSON,
    editPixel,
    getPixelColor,
    saveCustomAvatar,
    loadCustomAvatar,
    loadCustomAvatarAsync,
    getGenerationHistory,
    clearGenerationHistory,
    type GeminiAvatarRequest
} from "./avatarEditor";

export interface AvatarSelectorCallbacks {
    onAvatarSelected?: (avatarId: string) => void;
    onClose?: () => void;
}

export class AvatarSelector {
    private static currentInstance: AvatarSelector | null = null;

    private overlay: HTMLDivElement | null = null;
    private currentAvatar: string = 'tank';
    private callbacks: AvatarSelectorCallbacks;

    constructor(callbacks: AvatarSelectorCallbacks = {}) {
        this.callbacks = callbacks;
        this.currentAvatar = localStorage.getItem('selectedAvatar') || 'tank';
    }

    /**
     * Показывает селектор аватарок
     */
    public show(): void {
        // Если уже есть открытый экземпляр - проверяем что overlay реально в DOM
        if (AvatarSelector.currentInstance?.overlay) {
            // Проверяем что overlay ещё в DOM
            if (document.body.contains(AvatarSelector.currentInstance.overlay)) {
                logger.log('[AvatarSelector] Already open, skipping');
                return;
            } else {
                // Overlay был удалён из DOM, сбрасываем currentInstance
                logger.log('[AvatarSelector] Previous instance orphaned, resetting');
                AvatarSelector.currentInstance.overlay = null;
                AvatarSelector.currentInstance = null;
            }
        }

        if (this.overlay) return; // Этот экземпляр уже открыт

        // Регистрируем себя как текущий активный экземпляр
        AvatarSelector.currentInstance = this;

        this.overlay = document.createElement('div');
        this.overlay.className = 'avatar-selector-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 20000;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: 'Press Start 2P', monospace;
            padding: 12px;
            box-sizing: border-box;
            pointer-events: auto;
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background: linear-gradient(180deg, #0a0a0a 0%, #050505 100%);
            border: 3px solid #0f0;
            border-radius: 10px;
            padding: 16px 20px;
            width: 100%;
            max-width: min(920px, 92vw);
            max-height: min(88vh, 900px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 0 50px rgba(0, 255, 0, 0.5);
            box-sizing: border-box;
        `;

        const title = document.createElement('div');
        title.textContent = 'ВЫБОР АВАТАРКИ';
        title.style.cssText = `
            color: #0f0;
            font-size: 14px;
            text-align: center;
            margin-bottom: 12px;
            text-shadow: 0 0 10px #0f0;
            flex-shrink: 0;
        `;
        container.appendChild(title);

        // Вкладки
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex;
            margin-bottom: 12px;
            border-bottom: 2px solid #0f0;
            gap: 4px;
            flex-shrink: 0;
        `;

        let activeTab: 'preset' | 'generator' | 'editor' | 'history' = 'preset';

        const createTab = (id: string, label: string) => {
            const tab = document.createElement('button');
            tab.textContent = label;
            tab.style.cssText = `
                flex: 1;
                padding: 8px 6px;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid #080;
                border-bottom: none;
                color: #080;
                cursor: pointer;
                font-family: inherit;
                font-size: 8px;
                transition: all 0.2s ease;
            `;
            return tab;
        };

        const presetTab = createTab('preset', 'ГОТОВЫЕ');
        const generatorTab = createTab('generator', 'AI ГЕНЕРАТОР');
        const editorTab = createTab('editor', 'РЕДАКТОР');
        const historyTab = createTab('history', 'ИСТОРИЯ');

        const tabContent = document.createElement('div');
        tabContent.id = 'avatar-tab-content';
        tabContent.style.cssText = `
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
        `;

        const switchTab = (tab: string) => {
            activeTab = tab as any;

            [presetTab, generatorTab, editorTab, historyTab].forEach((btn, idx) => {
                const isActive = (tab === 'preset' && idx === 0) ||
                    (tab === 'generator' && idx === 1) ||
                    (tab === 'editor' && idx === 2) ||
                    (tab === 'history' && idx === 3);
                btn.style.background = isActive ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)';
                btn.style.borderColor = isActive ? '#0f0' : '#080';
                btn.style.color = isActive ? '#0f0' : '#080';
            });

            tabContent.innerHTML = '';

            if (tab === 'preset') {
                this.createPresetTabContent(tabContent);
            } else if (tab === 'generator') {
                this.createGeneratorTabContent(tabContent);
            } else if (tab === 'editor') {
                this.createEditorTabContent(tabContent);
            } else if (tab === 'history') {
                this.createHistoryTabContent(tabContent);
            }
        };

        presetTab.addEventListener('click', () => switchTab('preset'));
        generatorTab.addEventListener('click', () => switchTab('generator'));
        editorTab.addEventListener('click', () => switchTab('editor'));
        historyTab.addEventListener('click', () => switchTab('history'));

        tabs.appendChild(presetTab);
        tabs.appendChild(generatorTab);
        tabs.appendChild(editorTab);
        tabs.appendChild(historyTab);
        container.appendChild(tabs);
        container.appendChild(tabContent);

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'ЗАКРЫТЬ [ESC]';
        closeBtn.style.cssText = `
            width: 100%;
            padding: 10px 12px;
            margin-top: 12px;
            flex-shrink: 0;
            background: rgba(255, 0, 0, 0.2);
            border: 2px solid #f00;
            color: #f00;
            cursor: pointer;
            font-family: inherit;
            font-size: 10px;
            transition: all 0.2s ease;
            box-sizing: border-box;
        `;

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255, 0, 0, 0.3)';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'rgba(255, 0, 0, 0.2)';
        });

        closeBtn.addEventListener('click', () => {
            this.hide();
        });

        container.appendChild(closeBtn);

        switchTab('preset'); // Инициализируем первую вкладку

        this.overlay.appendChild(container);
        document.body.appendChild(this.overlay);

        // Обработка ESC
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.overlay) {
                this.hide();
            }
        };
        window.addEventListener('keydown', escHandler);
        (this.overlay as any)._escHandler = escHandler;
    }

    /**
     * Скрывает селектор
     */
    public hide(): void {
        if (this.overlay) {
            const escHandler = (this.overlay as any)._escHandler;
            if (escHandler) {
                window.removeEventListener('keydown', escHandler);
            }
            this.overlay.remove();
            this.overlay = null;
        }

        // Очищаем статический экземпляр чтобы можно было открыть снова
        if (AvatarSelector.currentInstance === this) {
            AvatarSelector.currentInstance = null;
        }

        if (this.callbacks.onClose) {
            this.callbacks.onClose();
        }
    }

    /**
     * Выбирает аватар
     */
    private selectAvatar(avatarId: string): void {
        localStorage.setItem('selectedAvatar', avatarId);
        this.currentAvatar = avatarId;
        if (this.callbacks.onAvatarSelected) {
            this.callbacks.onAvatarSelected(avatarId);
        }
        this.hide();
    }

    /**
     * Создает содержимое вкладки с готовыми аватарками
     */
    private createPresetTabContent(container: HTMLElement): void {
        const avatars: Array<{ id: string; name: string; variant: PixelAvatarOptions['variant'] }> = [
            { id: 'tank', name: 'Танк', variant: 'tank' },
            { id: 'soldier', name: 'Солдат', variant: 'soldier' },
            { id: 'commander', name: 'Командир', variant: 'commander' },
            { id: 'pilot', name: 'Пилот', variant: 'pilot' },
            { id: 'sniper', name: 'Снайпер', variant: 'sniper' },
            { id: 'engineer', name: 'Инженер', variant: 'engineer' },
            { id: 'medic', name: 'Медик', variant: 'medic' },
            { id: 'spy', name: 'Шпион', variant: 'spy' },
            { id: 'cyborg', name: 'Киборг', variant: 'cyborg' },
            { id: 'ninja', name: 'Ниндзя', variant: 'ninja' },
            { id: 'viking', name: 'Викинг', variant: 'viking' },
            { id: 'knight', name: 'Рыцарь', variant: 'knight' },
        ];

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
            gap: 10px;
            padding: 12px;
        `;

        avatars.forEach((avatar, index) => {
            const avatarBtn = document.createElement('button');
            avatarBtn.className = 'avatar-option';
            const isSelected = avatar.id === this.currentAvatar;

            // Генерируем пиксельный аватар
            const avatarCanvas = generatePixelAvatar({
                seed: index * 1000 + (localStorage.getItem('playerAvatarSeed') ? parseInt(localStorage.getItem('playerAvatarSeed')!) : 0),
                variant: avatar.variant
            });

            // Масштабируем canvas для отображения
            const displaySize = 56;
            avatarCanvas.style.width = `${displaySize}px`;
            avatarCanvas.style.height = `${displaySize}px`;
            avatarCanvas.style.imageRendering = 'pixelated';
            avatarCanvas.style.imageRendering = '-moz-crisp-edges';
            avatarCanvas.style.imageRendering = 'crisp-edges';

            const avatarContainer = document.createElement('div');
            avatarContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
            `;
            avatarContainer.appendChild(avatarCanvas);

            const nameLabel = document.createElement('div');
            nameLabel.textContent = avatar.name;
            nameLabel.style.cssText = 'font-size: 9px; color: #0a0;';
            avatarContainer.appendChild(nameLabel);

            avatarBtn.appendChild(avatarContainer);

            avatarBtn.style.cssText = `
                padding: 10px;
                background: ${isSelected ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)'};
                border: 2px solid ${isSelected ? '#0f0' : '#080'};
                color: #0f0;
                cursor: pointer;
                transition: all 0.2s ease;
            `;

            avatarBtn.addEventListener('mouseenter', () => {
                if (!isSelected) {
                    avatarBtn.style.borderColor = '#0f0';
                    avatarBtn.style.background = 'rgba(0, 255, 0, 0.1)';
                }
            });

            avatarBtn.addEventListener('mouseleave', () => {
                if (!isSelected) {
                    avatarBtn.style.borderColor = '#080';
                    avatarBtn.style.background = 'rgba(0, 0, 0, 0.5)';
                }
            });

            avatarBtn.addEventListener('click', () => {
                this.selectAvatar(avatar.id);
            });

            grid.appendChild(avatarBtn);
        });

        container.appendChild(grid);
    }

    /**
     * Создает содержимое вкладки AI генератора
     */
    private createGeneratorTabContent(container: HTMLElement): void {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 12px; min-height: 0; box-sizing: border-box;';

        // === ОСНОВНЫЕ НАСТРОЙКИ ===
        const mainSection = document.createElement('div');
        mainSection.style.cssText = 'border-bottom: 1px solid #080; padding-bottom: 10px; flex-shrink: 0;';

        const descriptionLabel = document.createElement('label');
        descriptionLabel.textContent = 'ОПИСАНИЕ АВАТАРКИ:';
        descriptionLabel.style.cssText = 'color: #0f0; font-size: 9px; display: block; margin-bottom: 4px;';

        const descriptionInput = document.createElement('textarea');
        descriptionInput.placeholder = 'Например: Танк с красными полосами, зеленый корпус...';
        descriptionInput.value = '';
        descriptionInput.style.cssText = `
            width: 100%;
            min-height: 56px;
            max-height: 80px;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid #080;
            color: #0f0;
            padding: 8px;
            font-family: 'Consolas', monospace;
            font-size: 10px;
            resize: vertical;
            box-sizing: border-box;
        `;

        // === ШАБЛОНЫ ===
        const templatesSection = document.createElement('div');
        templatesSection.style.cssText = 'margin: 6px 0; flex-shrink: 0;';

        const templatesLabel = document.createElement('label');
        templatesLabel.textContent = 'ШАБЛОНЫ:';
        templatesLabel.style.cssText = 'color: #0f0; font-size: 8px; display: block; margin-bottom: 4px;';

        const templatesContainer = document.createElement('div');
        templatesContainer.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

        const templates = [
            { name: 'Танк', desc: 'Зеленый танк с пушкой и гусеницами' },
            { name: 'Солдат', desc: 'Военный в камуфляже с оружием' },
            { name: 'Командир', desc: 'Офицер с погонами и биноклем' },
            { name: 'Киборг', desc: 'Робот-танк с механическими деталями' },
        ];

        templates.forEach(template => {
            const templateBtn = document.createElement('button');
            templateBtn.textContent = template.name;
            templateBtn.style.cssText = `
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid #080;
                color: #0a0;
                cursor: pointer;
                font-family: inherit;
                font-size: 8px;
                transition: all 0.2s ease;
            `;

            templateBtn.addEventListener('mouseenter', () => {
                templateBtn.style.borderColor = '#0f0';
                templateBtn.style.color = '#0f0';
            });

            templateBtn.addEventListener('mouseleave', () => {
                templateBtn.style.borderColor = '#080';
                templateBtn.style.color = '#0a0';
            });

            templateBtn.addEventListener('click', () => {
                descriptionInput.value = template.desc;
            });

            templatesContainer.appendChild(templateBtn);
        });

        templatesSection.appendChild(templatesLabel);
        templatesSection.appendChild(templatesContainer);

        // === РАСШИРЕННЫЕ НАСТРОЙКИ ===
        const advancedSection = document.createElement('div');
        advancedSection.style.cssText = 'border-bottom: 1px solid #080; padding: 10px 0;';

        const advancedToggle = document.createElement('button');
        advancedToggle.textContent = '▼ РАСШИРЕННЫЕ НАСТРОЙКИ';
        advancedToggle.style.cssText = `
            width: 100%;
            padding: 8px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #080;
            color: #0a0;
            cursor: pointer;
            font-family: inherit;
            font-size: 9px;
            text-align: left;
            margin-bottom: 10px;
        `;

        const advancedPanel = document.createElement('div');
        advancedPanel.id = 'avatar-advanced-settings';
        advancedPanel.style.cssText = 'display: none; flex-direction: column; gap: 12px;';

        let advancedOpen = false;
        advancedToggle.addEventListener('click', () => {
            advancedOpen = !advancedOpen;
            advancedPanel.style.display = advancedOpen ? 'flex' : 'none';
            advancedToggle.textContent = advancedOpen ? '▲ РАСШИРЕННЫЕ НАСТРОЙКИ' : '▼ РАСШИРЕННЫЕ НАСТРОЙКИ';
        });

        // Вспомогательная функция для создания select
        const createSelect = (label: string, id: string, options: string[], defaultValue: string = '') => {
            const labelEl = document.createElement('label');
            labelEl.textContent = label + ':';
            labelEl.style.cssText = 'color: #0f0; font-size: 9px; display: block; margin-bottom: 3px;';

            const select = document.createElement('select');
            select.id = id;
            select.style.cssText = `
                width: 100%;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid #080;
                color: #0f0;
                padding: 6px;
                font-family: inherit;
                font-size: 9px;
            `;

            if (defaultValue) {
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = 'По умолчанию';
                select.appendChild(defaultOpt);
            }

            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.toLowerCase().replace(/\s+/g, '-');
                option.textContent = opt.toUpperCase();
                if (opt.toLowerCase() === defaultValue.toLowerCase()) option.selected = true;
                select.appendChild(option);
            });

            const container = document.createElement('div');
            container.appendChild(labelEl);
            container.appendChild(select);
            return { container, select };
        };

        const styleSelect = createSelect('СТИЛЬ', 'avatar-style',
            ['Pixel', 'Retro', 'Military', 'Sci-Fi', 'Cyberpunk', 'Steampunk', 'Post-Apocalyptic'], 'pixel');
        const themeSelect = createSelect('ТЕМА', 'avatar-theme',
            ['Tank', 'Soldier', 'Vehicle', 'Character', 'Emblem'], 'tank');
        const complexitySelect = createSelect('СЛОЖНОСТЬ', 'avatar-complexity',
            ['Simple', 'Medium', 'Detailed', 'Very-Detailed'], 'medium');
        const poseSelect = createSelect('ПОЗА', 'avatar-pose',
            ['Front', 'Side', 'Three-Quarter', 'Action'], 'front');
        const moodSelect = createSelect('НАСТРОЕНИЕ', 'avatar-mood',
            ['Aggressive', 'Neutral', 'Friendly', 'Mysterious'], 'neutral');
        const lightingSelect = createSelect('ОСВЕЩЕНИЕ', 'avatar-lighting',
            ['Bright', 'Normal', 'Dark', 'Dramatic'], 'normal');
        const pixelSizeSelect = createSelect('РАЗМЕР ПИКСЕЛЕЙ', 'avatar-pixel-size',
            ['1x1', '2x2', 'Mixed'], '1x1');

        const symmetryLabel = document.createElement('label');
        symmetryLabel.style.cssText = 'color: #0f0; font-size: 9px; display: flex; align-items: center; gap: 8px; cursor: pointer;';
        const symmetryCheckbox = document.createElement('input');
        symmetryCheckbox.type = 'checkbox';
        symmetryCheckbox.id = 'avatar-symmetry';
        symmetryCheckbox.checked = true;
        symmetryCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        symmetryLabel.appendChild(symmetryCheckbox);
        symmetryLabel.appendChild(document.createTextNode('СИММЕТРИЯ'));

        const colorsLabel = document.createElement('label');
        colorsLabel.textContent = 'ЦВЕТОВАЯ ПАЛИТРА (через запятую):';
        colorsLabel.style.cssText = 'color: #0f0; font-size: 9px; display: block; margin-bottom: 3px;';

        const colorsInput = document.createElement('input');
        colorsInput.type = 'text';
        colorsInput.id = 'avatar-colors';
        colorsInput.placeholder = 'Например: #0a0, #060, #000, #666, #ff0';
        colorsInput.style.cssText = `
            width: 100%;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid #080;
            color: #0f0;
            padding: 6px;
            font-family: 'Consolas', monospace;
            font-size: 9px;
            box-sizing: border-box;
        `;

        const accessoriesLabel = document.createElement('label');
        accessoriesLabel.textContent = 'АКСЕССУАРЫ (через запятую):';
        accessoriesLabel.style.cssText = 'color: #0f0; font-size: 9px; display: block; margin-bottom: 3px;';

        const accessoriesInput = document.createElement('input');
        accessoriesInput.type = 'text';
        accessoriesInput.id = 'avatar-accessories';
        accessoriesInput.placeholder = 'Например: медаль, бинокль, рация, флаг';
        accessoriesInput.style.cssText = `
            width: 100%;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid #080;
            color: #0f0;
            padding: 6px;
            font-family: 'Consolas', monospace;
            font-size: 9px;
            box-sizing: border-box;
        `;

        advancedPanel.appendChild(styleSelect.container);
        advancedPanel.appendChild(themeSelect.container);
        advancedPanel.appendChild(complexitySelect.container);
        advancedPanel.appendChild(poseSelect.container);
        advancedPanel.appendChild(moodSelect.container);
        advancedPanel.appendChild(lightingSelect.container);
        advancedPanel.appendChild(pixelSizeSelect.container);
        advancedPanel.appendChild(symmetryLabel);
        advancedPanel.appendChild(colorsLabel);
        advancedPanel.appendChild(colorsInput);
        advancedPanel.appendChild(accessoriesLabel);
        advancedPanel.appendChild(accessoriesInput);

        // === ИСТОРИЯ ГЕНЕРАЦИЙ ===
        const historySection = document.createElement('div');
        historySection.style.cssText = 'border-bottom: 1px solid #080; padding: 10px 0; flex-shrink: 0;';

        const historyLabel = document.createElement('label');
        historyLabel.textContent = 'ИСТОРИЯ ГЕНЕРАЦИЙ:';
        historyLabel.style.cssText = 'color: #0f0; font-size: 8px; display: block; margin-bottom: 4px;';

        const historyContainer = document.createElement('div');
        historyContainer.id = 'avatar-history';
        historyContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
            gap: 6px;
            max-height: 100px;
            overflow-y: auto;
            padding: 8px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #080;
            margin-bottom: 8px;
        `;

        const updateHistoryDisplay = () => {
            const history = getGenerationHistory();
            historyContainer.innerHTML = '';

            if (history.length === 0) {
                historyContainer.innerHTML = '<div style="color: #0a0; font-size: 8px; grid-column: 1/-1; text-align: center; padding: 10px;">История пуста</div>';
                return;
            }

            history.forEach((item) => {
                const historyItem = document.createElement('div');
                historyItem.style.cssText = `
                    position: relative;
                    cursor: pointer;
                    border: 1px solid #080;
                    transition: all 0.2s ease;
                `;

                loadCustomAvatarAsync(item.id).then(canvas => {
                    if (canvas) {
                        const displayCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
                        displayCanvas.style.width = '100%';
                        displayCanvas.style.height = '100%';
                        displayCanvas.style.imageRendering = 'pixelated';
                        displayCanvas.style.imageRendering = '-moz-crisp-edges';
                        displayCanvas.style.imageRendering = 'crisp-edges';
                        historyItem.appendChild(displayCanvas);

                        historyItem.addEventListener('click', () => {
                            this.selectAvatar(item.id);
                        });

                        historyItem.addEventListener('mouseenter', () => {
                            historyItem.style.borderColor = '#0f0';
                            historyItem.style.transform = 'scale(1.1)';
                        });

                        historyItem.addEventListener('mouseleave', () => {
                            historyItem.style.borderColor = '#080';
                            historyItem.style.transform = 'scale(1)';
                        });
                    }
                });

                historyContainer.appendChild(historyItem);
            });
        };

        updateHistoryDisplay();

        const clearHistoryBtn = document.createElement('button');
        clearHistoryBtn.textContent = 'ОЧИСТИТЬ ИСТОРИЮ';
        clearHistoryBtn.style.cssText = `
            width: 100%;
            padding: 5px;
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid #800;
            color: #a00;
            cursor: pointer;
            font-family: inherit;
            font-size: 8px;
            margin-bottom: 8px;
        `;

        clearHistoryBtn.addEventListener('click', () => {
            inGameConfirm('Очистить всю историю генераций?', 'Подтверждение').then((ok) => {
                if (ok) {
                    clearGenerationHistory();
                    updateHistoryDisplay();
                }
            }).catch(() => { });
        });

        // === ПРЕВЬЮ И КНОПКИ ===
        const previewSection = document.createElement('div');
        previewSection.style.cssText = 'padding-top: 10px; flex-shrink: 0;';

        const previewContainer = document.createElement('div');
        previewContainer.id = 'avatar-generator-preview';
        previewContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100px;
            background: rgba(0, 0, 0, 0.3);
            border: 2px solid #080;
            padding: 12px;
            margin-bottom: 10px;
            flex-wrap: wrap;
            gap: 8px;
        `;
        previewContainer.innerHTML = '<div style="color: #0a0; font-size: 9px;">Предпросмотр после генерации</div>';

        const buttonsRow = document.createElement('div');
        buttonsRow.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

        const generateBtn = document.createElement('button');
        generateBtn.textContent = 'СГЕНЕРИРОВАТЬ';
        generateBtn.style.cssText = `
            flex: 1;
            min-width: 90px;
            padding: 8px 10px;
            background: rgba(0, 255, 0, 0.2);
            border: 2px solid #0f0;
            color: #0f0;
            cursor: pointer;
            font-family: inherit;
            font-size: 9px;
            transition: all 0.2s ease;
        `;

        const generateMultipleBtn = document.createElement('button');
        generateMultipleBtn.textContent = '3 ВАРИАНТА';
        generateMultipleBtn.style.cssText = `
            flex: 1;
            min-width: 90px;
            padding: 8px 10px;
            background: rgba(0, 255, 255, 0.15);
            border: 2px solid #0aa;
            color: #0aa;
            cursor: pointer;
            font-family: inherit;
            font-size: 9px;
            transition: all 0.2s ease;
        `;

        const useBtn = document.createElement('button');
        useBtn.textContent = 'ИСПОЛЬЗОВАТЬ';
        useBtn.style.cssText = `
            flex: 1;
            min-width: 90px;
            padding: 8px 10px;
            background: rgba(0, 255, 255, 0.2);
            border: 2px solid #0ff;
            color: #0ff;
            cursor: pointer;
            font-family: inherit;
            font-size: 9px;
            transition: all 0.2s ease;
            opacity: 0.5;
            cursor: not-allowed;
        `;

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'ЭКСПОРТ';
        exportBtn.style.cssText = `
            flex: 1;
            min-width: 90px;
            padding: 8px 10px;
            background: rgba(255, 165, 0, 0.2);
            border: 2px solid #fa0;
            color: #fa0;
            cursor: pointer;
            font-family: inherit;
            font-size: 9px;
            transition: all 0.2s ease;
            opacity: 0.5;
            cursor: not-allowed;
        `;

        const importBtn = document.createElement('button');
        importBtn.textContent = 'ИМПОРТ';
        importBtn.style.cssText = `
            flex: 1;
            min-width: 90px;
            padding: 8px 10px;
            background: rgba(128, 0, 255, 0.2);
            border: 2px solid #80f;
            color: #80f;
            cursor: pointer;
            font-family: inherit;
            font-size: 9px;
            transition: all 0.2s ease;
        `;

        let generatedCanvas: HTMLCanvasElement | null = null;

        const generateRequest = (): GeminiAvatarRequest => {
            const colors = colorsInput.value.trim()
                ? colorsInput.value.split(',').map(c => c.trim()).filter(c => c)
                : undefined;

            const accessories = accessoriesInput.value.trim()
                ? accessoriesInput.value.split(',').map(a => a.trim()).filter(a => a)
                : undefined;

            return {
                description: descriptionInput.value.trim(),
                style: (styleSelect.select.value || 'pixel') as any,
                theme: (themeSelect.select.value || 'tank') as any,
                complexity: (complexitySelect.select.value || 'medium') as any,
                pose: (poseSelect.select.value || 'front') as any,
                mood: (moodSelect.select.value || 'neutral') as any,
                lighting: (lightingSelect.select.value || 'normal') as any,
                pixelSize: (pixelSizeSelect.select.value || '1x1') as any,
                symmetry: symmetryCheckbox.checked,
                colors,
                accessories,
            };
        };

        generateBtn.addEventListener('click', async () => {
            const description = descriptionInput.value.trim();
            if (!description) {
                inGameAlert('Введите описание аватара!', 'Аватар').catch(() => { });
                return;
            }

            generateBtn.disabled = true;
            generateBtn.textContent = 'ГЕНЕРАЦИЯ...';
            previewContainer.innerHTML = '<div style="color: #0a0; font-size: 10px;">Генерация аватара через AI...</div>';

            try {
                const request = generateRequest();
                const canvas = await generateAvatarWithGemini(request);

                if (canvas) {
                    generatedCanvas = canvas;
                    previewContainer.innerHTML = '';
                    const displayCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
                    displayCanvas.style.width = '128px';
                    displayCanvas.style.height = '128px';
                    displayCanvas.style.imageRendering = 'pixelated';
                    displayCanvas.style.imageRendering = '-moz-crisp-edges';
                    displayCanvas.style.imageRendering = 'crisp-edges';
                    previewContainer.appendChild(displayCanvas);

                    useBtn.style.opacity = '1';
                    useBtn.style.cursor = 'pointer';
                    exportBtn.style.opacity = '1';
                    exportBtn.style.cursor = 'pointer';

                    updateHistoryDisplay();
                } else {
                    previewContainer.innerHTML = '<div style="color: #f00; font-size: 10px;">Ошибка генерации</div>';
                }
            } catch (error) {
                logger.error('[AvatarSelector] Generation error:', error);
                previewContainer.innerHTML = '<div style="color: #f00; font-size: 10px;">Ошибка: ' + (error as Error).message + '</div>';
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'СГЕНЕРИРОВАТЬ';
            }
        });

        generateMultipleBtn.addEventListener('click', async () => {
            const description = descriptionInput.value.trim();
            if (!description) {
                inGameAlert('Введите описание аватара!', 'Аватар').catch(() => { });
                return;
            }

            generateMultipleBtn.disabled = true;
            generateBtn.disabled = true;
            generateMultipleBtn.textContent = 'ГЕНЕРАЦИЯ 3...';
            previewContainer.innerHTML = '<div style="color: #0a0; font-size: 10px;">Генерация 3 вариантов через AI...</div>';

            try {
                const request = generateRequest();
                const variants = await generateMultipleVariants(request, 3);

                const validVariants = variants.filter(v => v !== null) as HTMLCanvasElement[];
                generatedCanvas = validVariants[0] || null;

                previewContainer.innerHTML = '';
                validVariants.forEach((canvas, index) => {
                    const variantContainer = document.createElement('div');
                    variantContainer.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 5px;
                        cursor: pointer;
                        border: 2px solid #080;
                        padding: 5px;
                        transition: all 0.2s ease;
                    `;

                    const displayCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
                    displayCanvas.style.width = '96px';
                    displayCanvas.style.height = '96px';
                    displayCanvas.style.imageRendering = 'pixelated';
                    displayCanvas.style.imageRendering = '-moz-crisp-edges';
                    displayCanvas.style.imageRendering = 'crisp-edges';

                    const label = document.createElement('div');
                    label.textContent = `Вариант ${index + 1}`;
                    label.style.cssText = 'color: #0a0; font-size: 8px;';

                    variantContainer.appendChild(displayCanvas);
                    variantContainer.appendChild(label);

                    variantContainer.addEventListener('click', () => {
                        generatedCanvas = canvas;
                        previewContainer.innerHTML = '';
                        const mainCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
                        mainCanvas.style.width = '128px';
                        mainCanvas.style.height = '128px';
                        mainCanvas.style.imageRendering = 'pixelated';
                        mainCanvas.style.imageRendering = '-moz-crisp-edges';
                        mainCanvas.style.imageRendering = 'crisp-edges';
                        previewContainer.appendChild(mainCanvas);
                    });

                    variantContainer.addEventListener('mouseenter', () => {
                        variantContainer.style.borderColor = '#0f0';
                        variantContainer.style.transform = 'scale(1.05)';
                    });

                    variantContainer.addEventListener('mouseleave', () => {
                        variantContainer.style.borderColor = '#080';
                        variantContainer.style.transform = 'scale(1)';
                    });

                    previewContainer.appendChild(variantContainer);
                });

                if (generatedCanvas) {
                    useBtn.style.opacity = '1';
                    useBtn.style.cursor = 'pointer';
                    exportBtn.style.opacity = '1';
                    exportBtn.style.cursor = 'pointer';
                }

                updateHistoryDisplay();
            } catch (error) {
                logger.error('[AvatarSelector] Generation error:', error);
                previewContainer.innerHTML = '<div style="color: #f00; font-size: 10px;">Ошибка: ' + (error as Error).message + '</div>';
            } finally {
                generateMultipleBtn.disabled = false;
                generateBtn.disabled = false;
                generateMultipleBtn.textContent = '3 ВАРИАНТА';
            }
        });

        useBtn.addEventListener('click', () => {
            if (generatedCanvas) {
                const customId = 'custom_' + Date.now();
                saveCustomAvatar(customId, generatedCanvas);
                this.selectAvatar(customId);
            }
        });

        exportBtn.addEventListener('click', () => {
            if (!generatedCanvas) {
                inGameAlert('Сначала сгенерируйте аватар!', 'Аватар').catch(() => { });
                return;
            }

            const exportMenu = document.createElement('div');
            exportMenu.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(5, 15, 5, 0.98);
                border: 2px solid #0f0;
                padding: 20px;
                z-index: 20001;
                min-width: 300px;
            `;

            const exportTitle = document.createElement('div');
            exportTitle.textContent = 'ЭКСПОРТ АВАТАРА';
            exportTitle.style.cssText = 'color: #0f0; font-size: 12px; margin-bottom: 15px; text-align: center;';

            const exportPNGBtn = document.createElement('button');
            exportPNGBtn.textContent = 'ЭКСПОРТ PNG';
            exportPNGBtn.style.cssText = `
                width: 100%;
                padding: 10px;
                margin-bottom: 10px;
                background: rgba(0, 255, 0, 0.2);
                border: 2px solid #0f0;
                color: #0f0;
                cursor: pointer;
                font-family: inherit;
                font-size: 10px;
            `;

            const exportJSONBtn = document.createElement('button');
            exportJSONBtn.textContent = 'ЭКСПОРТ JSON';
            exportJSONBtn.style.cssText = `
                width: 100%;
                padding: 10px;
                margin-bottom: 10px;
                background: rgba(0, 255, 255, 0.2);
                border: 2px solid #0ff;
                color: #0ff;
                cursor: pointer;
                font-family: inherit;
                font-size: 10px;
            `;

            const closeExportBtn = document.createElement('button');
            closeExportBtn.textContent = 'ЗАКРЫТЬ';
            closeExportBtn.style.cssText = `
                width: 100%;
                padding: 10px;
                background: rgba(255, 0, 0, 0.2);
                border: 2px solid #f00;
                color: #f00;
                cursor: pointer;
                font-family: inherit;
                font-size: 10px;
            `;

            exportPNGBtn.addEventListener('click', () => {
                const base64 = exportAvatarAsBase64(generatedCanvas!);
                const link = document.createElement('a');
                link.download = `avatar_${Date.now()}.png`;
                link.href = base64;
                link.click();
                exportMenu.remove();
            });

            exportJSONBtn.addEventListener('click', () => {
                const json = exportAvatarAsJSON(generatedCanvas!);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `avatar_${Date.now()}.json`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                exportMenu.remove();
            });

            closeExportBtn.addEventListener('click', () => {
                exportMenu.remove();
            });

            exportMenu.appendChild(exportTitle);
            exportMenu.appendChild(exportPNGBtn);
            exportMenu.appendChild(exportJSONBtn);
            exportMenu.appendChild(closeExportBtn);
            document.body.appendChild(exportMenu);
        });

        // Сборка интерфейса
        mainSection.appendChild(descriptionLabel);
        mainSection.appendChild(descriptionInput);
        mainSection.appendChild(templatesSection);

        advancedSection.appendChild(advancedToggle);
        advancedSection.appendChild(advancedPanel);

        historySection.appendChild(historyLabel);
        historySection.appendChild(historyContainer);
        historySection.appendChild(clearHistoryBtn);

        previewSection.appendChild(previewContainer);

        importBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.png,.json,image/png,application/json';
            input.style.display = 'none';

            input.addEventListener('change', async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        let canvas: HTMLCanvasElement | null = null;

                        if (file.type === 'application/json' || file.name.endsWith('.json')) {
                            // Импорт из JSON
                            const json = event.target?.result as string;
                            canvas = importAvatarFromJSON(json);
                        } else {
                            // Импорт из PNG
                            const base64 = event.target?.result as string;
                            const { importAvatarFromBase64 } = await import("./avatarEditor");
                            canvas = await importAvatarFromBase64(base64);
                        }

                        if (canvas) {
                            generatedCanvas = canvas;
                            previewContainer.innerHTML = '';
                            const displayCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
                            displayCanvas.style.width = '128px';
                            displayCanvas.style.height = '128px';
                            displayCanvas.style.imageRendering = 'pixelated';
                            displayCanvas.style.imageRendering = '-moz-crisp-edges';
                            displayCanvas.style.imageRendering = 'crisp-edges';
                            previewContainer.appendChild(displayCanvas);

                            useBtn.style.opacity = '1';
                            useBtn.style.cursor = 'pointer';
                            exportBtn.style.opacity = '1';
                            exportBtn.style.cursor = 'pointer';

                            updateHistoryDisplay();
                        } else {
                            inGameAlert('Ошибка импорта аватара', 'Ошибка').catch(() => { });
                        }
                    } catch (error) {
                        logger.error('[AvatarSelector] Import error:', error);
                        inGameAlert('Ошибка импорта: ' + (error as Error).message, 'Ошибка').catch(() => { });
                    }
                };

                if (file.type === 'application/json' || file.name.endsWith('.json')) {
                    reader.readAsText(file);
                } else {
                    reader.readAsDataURL(file);
                }
            });

            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });

        buttonsRow.appendChild(generateBtn);
        buttonsRow.appendChild(generateMultipleBtn);
        buttonsRow.appendChild(useBtn);
        buttonsRow.appendChild(importBtn);
        buttonsRow.appendChild(exportBtn);
        previewSection.appendChild(buttonsRow);

        wrapper.appendChild(mainSection);
        wrapper.appendChild(advancedSection);
        wrapper.appendChild(historySection);
        wrapper.appendChild(previewSection);

        container.appendChild(wrapper);
    }

    /**
     * Создает содержимое вкладки редактора
     */
    private createEditorTabContent(container: HTMLElement): void {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 15px;';

        // Загружаем текущий аватар или создаем новый
        let editingCanvas: HTMLCanvasElement;

        if (this.currentAvatar.startsWith('custom_')) {
            const loaded = loadCustomAvatar(this.currentAvatar);
            editingCanvas = loaded || generatePixelAvatar({ variant: 'tank' });
        } else {
            const variantMap: { [key: string]: PixelAvatarOptions['variant'] } = {
                'tank': 'tank', 'soldier': 'soldier', 'commander': 'commander', 'pilot': 'pilot',
                'sniper': 'sniper', 'engineer': 'engineer', 'medic': 'medic', 'spy': 'spy',
                'cyborg': 'cyborg', 'ninja': 'ninja', 'viking': 'viking', 'knight': 'knight',
            };
            const variant = variantMap[this.currentAvatar] || 'tank';
            editingCanvas = generatePixelAvatar({ variant });
        }

        // Редактор canvas
        const editorContainer = document.createElement('div');
        editorContainer.style.cssText = `
            display: flex;
            gap: 20px;
            align-items: flex-start;
            flex-wrap: wrap;
        `;

        // Canvas для редактирования (увеличенный)
        const canvasWrapper = document.createElement('div');
        canvasWrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            flex: 1;
            min-width: 300px;
        `;

        const canvasLabel = document.createElement('div');
        canvasLabel.textContent = 'РЕДАКТОР (клик для рисования)';
        canvasLabel.style.cssText = 'color: #0f0; font-size: 9px;';

        const editCanvas = editingCanvas.cloneNode(true) as HTMLCanvasElement;
        editCanvas.style.width = '256px';
        editCanvas.style.height = '256px';
        editCanvas.style.imageRendering = 'pixelated';
        editCanvas.style.imageRendering = '-moz-crisp-edges';
        editCanvas.style.imageRendering = 'crisp-edges';
        editCanvas.style.border = '2px solid #0f0';
        editCanvas.style.cursor = 'crosshair';

        // Палитра цветов
        const paletteWrapper = document.createElement('div');
        paletteWrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 200px;
        `;

        const paletteLabel = document.createElement('div');
        paletteLabel.textContent = 'ПАЛИТРА:';
        paletteLabel.style.cssText = 'color: #0f0; font-size: 9px;';

        const paletteGrid = document.createElement('div');
        paletteGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 5px;
        `;

        const defaultColors = [
            '#000000', '#ffffff', '#0f0', '#0a0', '#060', '#ff0', '#f00', '#00f',
            '#0ff', '#f0f', '#888', '#666', '#444', '#fa0', '#0fa', '#f0a',
        ];

        let selectedColor = '#0f0';

        defaultColors.forEach(color => {
            const colorBtn = document.createElement('button');
            colorBtn.style.cssText = `
                width: 30px;
                height: 30px;
                background: ${color};
                border: 2px solid ${color === selectedColor ? '#fff' : '#080'};
                cursor: pointer;
                transition: all 0.2s ease;
            `;

            colorBtn.addEventListener('click', () => {
                selectedColor = color;
                paletteGrid.querySelectorAll('button').forEach((btn: HTMLButtonElement) => {
                    btn.style.borderColor = btn.style.background === selectedColor ? '#fff' : '#080';
                });
                customColorInput.value = color;
            });

            paletteGrid.appendChild(colorBtn);
        });

        // Поле для кастомного цвета
        const customColorLabel = document.createElement('label');
        customColorLabel.textContent = 'КАСТОМНЫЙ ЦВЕТ:';
        customColorLabel.style.cssText = 'color: #0f0; font-size: 9px; display: block; margin-top: 10px;';

        const customColorInput = document.createElement('input');
        customColorInput.type = 'color';
        customColorInput.value = '#0f0';
        customColorInput.style.cssText = `
            width: 100%;
            height: 40px;
            cursor: pointer;
        `;

        customColorInput.addEventListener('change', (e) => {
            selectedColor = (e.target as HTMLInputElement).value;
        });

        // Инструменты редактора
        let currentTool: 'brush' | 'fill' | 'eraser' | 'eyedropper' = 'brush';

        const toolsSection = document.createElement('div');
        toolsSection.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;';

        const createToolButton = (tool: typeof currentTool, label: string) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                padding: 8px 12px;
                background: ${currentTool === tool ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)'};
                border: 2px solid ${currentTool === tool ? '#0f0' : '#080'};
                color: ${currentTool === tool ? '#0f0' : '#0a0'};
                cursor: pointer;
                font-family: inherit;
                font-size: 9px;
                transition: all 0.2s ease;
            `;

            btn.addEventListener('click', () => {
                currentTool = tool;
                toolsSection.querySelectorAll('button').forEach((b, idx) => {
                    const isActive = (tool === 'brush' && idx === 0) ||
                        (tool === 'fill' && idx === 1) ||
                        (tool === 'eraser' && idx === 2) ||
                        (tool === 'eyedropper' && idx === 3);
                    b.style.background = isActive ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)';
                    b.style.borderColor = isActive ? '#0f0' : '#080';
                    b.style.color = isActive ? '#0f0' : '#0a0';
                });
            });

            return btn;
        };

        const brushBtn = createToolButton('brush', 'КИСТЬ');
        const fillBtn = createToolButton('fill', 'ЗАЛИВКА');
        const eraserBtn = createToolButton('eraser', 'ЛАСТИК');
        const eyedropperBtn = createToolButton('eyedropper', 'ПИПЕТКА');

        toolsSection.appendChild(brushBtn);
        toolsSection.appendChild(fillBtn);
        toolsSection.appendChild(eraserBtn);
        toolsSection.appendChild(eyedropperBtn);

        // Обработка кликов на canvas
        let isDrawing = false;
        const scale = 256 / 32; // Масштаб для отображения

        const updateCanvasDisplay = () => {
            const ctx = editCanvas.getContext('2d')!;
            ctx.clearRect(0, 0, 256, 256);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(editingCanvas, 0, 0, 256, 256);
        };

        const getPixelCoords = (e: MouseEvent): { x: number; y: number } | null => {
            const rect = editCanvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / scale);
            const y = Math.floor((e.clientY - rect.top) / scale);
            if (x < 0 || x >= 32 || y < 0 || y >= 32) return null;
            return { x, y };
        };

        const floodFill = (startX: number, startY: number, targetColor: string, fillColor: string) => {
            const ctx = editingCanvas.getContext('2d')!;
            const imageData = ctx.getImageData(0, 0, 32, 32);
            const data = imageData.data;

            if (startX < 0 || startX >= 32 || startY < 0 || startY >= 32) return;

            const targetIdx = (startY * 32 + startX) * 4;
            const targetR = data[targetIdx];
            const targetG = data[targetIdx + 1];
            const targetB = data[targetIdx + 2];

            if (targetColor === fillColor) return; // Уже залито

            const fillRgb = hexToRgb(fillColor);
            if (!fillRgb) return;

            const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
            const visited = new Set<string>();

            while (stack.length > 0) {
                const item = stack.pop();
                if (!item) continue;
                const { x, y } = item;
                const key = `${x},${y}`;
                if (visited.has(key)) continue;
                if (x < 0 || x >= 32 || y < 0 || y >= 32) continue;

                const idx = (y * 32 + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                if (r === targetR && g === targetG && b === targetB) {
                    data[idx] = fillRgb.r;
                    data[idx + 1] = fillRgb.g;
                    data[idx + 2] = fillRgb.b;
                    visited.add(key);

                    if (x + 1 < 32) stack.push({ x: x + 1, y });
                    if (x - 1 >= 0) stack.push({ x: x - 1, y });
                    if (y + 1 < 32) stack.push({ x, y: y + 1 });
                    if (y - 1 >= 0) stack.push({ x, y: y - 1 });
                }
            }

            ctx.putImageData(imageData, 0, 0);
        };

        const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result || !result[1] || !result[2] || !result[3]) return null;
            return {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            };
        };

        editCanvas.addEventListener('mousedown', (e) => {
            const coords = getPixelCoords(e);
            if (!coords) return;

            isDrawing = true;

            if (currentTool === 'brush') {
                editPixel(editingCanvas, coords.x, coords.y, selectedColor);
                updateCanvasDisplay();
            } else if (currentTool === 'fill') {
                const targetColor = getPixelColor(editingCanvas, coords.x, coords.y);
                if (targetColor) {
                    floodFill(coords.x, coords.y, targetColor, selectedColor);
                    updateCanvasDisplay();
                }
            } else if (currentTool === 'eraser') {
                editPixel(editingCanvas, coords.x, coords.y, '#000000');
                updateCanvasDisplay();
            } else if (currentTool === 'eyedropper') {
                const color = getPixelColor(editingCanvas, coords.x, coords.y);
                if (color) {
                    selectedColor = color;
                    customColorInput.value = color;
                    paletteGrid.querySelectorAll('button').forEach((btn: HTMLButtonElement) => {
                        btn.style.borderColor = btn.style.background === selectedColor ? '#fff' : '#080';
                    });
                }
            }
        });

        editCanvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            const coords = getPixelCoords(e);
            if (!coords) return;

            if (currentTool === 'brush') {
                editPixel(editingCanvas, coords.x, coords.y, selectedColor);
                updateCanvasDisplay();
            } else if (currentTool === 'eraser') {
                editPixel(editingCanvas, coords.x, coords.y, '#000000');
                updateCanvasDisplay();
            }
        });

        editCanvas.addEventListener('mouseup', () => {
            isDrawing = false;
        });

        editCanvas.addEventListener('mouseleave', () => {
            isDrawing = false;
        });

        // Кнопки управления
        const editorButtons = document.createElement('div');
        editorButtons.style.cssText = 'display: flex; gap: 10px; margin-top: 15px; width: 100%;';

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'ОЧИСТИТЬ';
        clearBtn.style.cssText = `
            flex: 1;
            padding: 10px;
            background: rgba(255, 0, 0, 0.2);
            border: 2px solid #f00;
            color: #f00;
            cursor: pointer;
            font-family: inherit;
            font-size: 10px;
        `;

        clearBtn.addEventListener('click', () => {
            const ctx = editingCanvas.getContext('2d')!;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 32, 32);
            updateCanvasDisplay();
        });

        const saveEditBtn = document.createElement('button');
        saveEditBtn.textContent = 'СОХРАНИТЬ';
        saveEditBtn.style.cssText = `
            flex: 2;
            padding: 10px;
            background: rgba(0, 255, 0, 0.2);
            border: 2px solid #0f0;
            color: #0f0;
            cursor: pointer;
            font-family: inherit;
            font-size: 10px;
        `;

        saveEditBtn.addEventListener('click', () => {
            const customId = 'custom_' + Date.now();
            saveCustomAvatar(customId, editingCanvas);
            this.selectAvatar(customId);
        });

        // Инициализируем отображение
        updateCanvasDisplay();

        canvasWrapper.appendChild(canvasLabel);
        canvasWrapper.appendChild(toolsSection);
        canvasWrapper.appendChild(editCanvas);
        canvasWrapper.appendChild(editorButtons);

        paletteWrapper.appendChild(paletteLabel);
        paletteWrapper.appendChild(paletteGrid);
        paletteWrapper.appendChild(customColorLabel);
        paletteWrapper.appendChild(customColorInput);

        editorButtons.appendChild(clearBtn);
        editorButtons.appendChild(saveEditBtn);

        editorContainer.appendChild(canvasWrapper);
        editorContainer.appendChild(paletteWrapper);

        wrapper.appendChild(editorContainer);
        container.appendChild(wrapper);
    }

    /**
     * Создает содержимое вкладки истории
     */
    private createHistoryTabContent(container: HTMLElement): void {
        const history = getGenerationHistory();

        if (history.length === 0) {
            container.innerHTML = '<div style="color: #0a0; text-align: center; padding: 50px;">История генераций пуста</div>';
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 15px;
            padding: 20px;
        `;

        history.forEach((item) => {
            const historyItem = document.createElement('div');
            historyItem.style.cssText = `
                position: relative;
                cursor: pointer;
                border: 2px solid #080;
                transition: all 0.2s ease;
                padding: 5px;
            `;

            loadCustomAvatarAsync(item.id).then(canvas => {
                if (canvas) {
                    const displayCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
                    displayCanvas.style.width = '100%';
                    displayCanvas.style.height = '100%';
                    displayCanvas.style.imageRendering = 'pixelated';
                    displayCanvas.style.imageRendering = '-moz-crisp-edges';
                    displayCanvas.style.imageRendering = 'crisp-edges';
                    historyItem.appendChild(displayCanvas);

                    historyItem.addEventListener('click', () => {
                        this.selectAvatar(item.id);
                    });

                    historyItem.addEventListener('mouseenter', () => {
                        historyItem.style.borderColor = '#0f0';
                        historyItem.style.transform = 'scale(1.1)';
                    });

                    historyItem.addEventListener('mouseleave', () => {
                        historyItem.style.borderColor = '#080';
                        historyItem.style.transform = 'scale(1)';
                    });
                }
            });

            grid.appendChild(historyItem);
        });

        container.appendChild(grid);
    }
}

