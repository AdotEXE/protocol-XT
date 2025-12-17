/**
 * Settings Exporter - Единая система экспорта/импорта настроек всех меню
 */

import { logger } from "./utils/logger";

export interface SettingsBundle {
    version: string;
    timestamp: number;
    f2?: ScreenshotSettings;
    f3?: DashboardSettings;
    f4?: PhysicsPresets;
    f5?: TerminalSettings;
    f6?: SessionSettings;
    f7?: CheatProfiles;
}

export interface ScreenshotSettings {
    defaultFormat: string;
    defaultMode: string;
    defaultQuality: number;
    autoScreenshots: any[];
    filters: any;
    watermark: any;
}

export interface DashboardSettings {
    visibleSections: string[];
    updateInterval: number;
    colorScheme: string;
    fontSize: number;
}

export interface PhysicsPresets {
    presets: any[];
    maxPresets: number;
}

export interface TerminalSettings {
    position: { x: number; y: number };
    size: { width: number; height: number };
    collapsed: boolean;
    theme: string;
}

export interface SessionSettings {
    enemyCount: number;
    spawnInterval: number;
    aiDifficulty: string;
    waveSystem: any;
    worldSettings: any;
}

export interface CheatProfiles {
    profiles: any[];
}

export class SettingsExporter {
    /**
     * Экспорт всех настроек
     */
    exportAll(): SettingsBundle {
        const bundle: SettingsBundle = {
            version: "1.0",
            timestamp: Date.now(),
            f2: this.exportScreenshotSettings(),
            f3: this.exportDashboardSettings(),
            f4: this.exportPhysicsPresets(),
            f5: this.exportTerminalSettings(),
            f6: this.exportSessionSettings(),
            f7: this.exportCheatProfiles()
        };
        
        return bundle;
    }
    
    /**
     * Импорт всех настроек
     */
    importAll(bundle: SettingsBundle): void {
        // Валидация версии
        if (bundle.version !== "1.0") {
            throw new Error(`Unsupported version: ${bundle.version}. Expected: 1.0`);
        }
        
        try {
            // Импорт всех настроек
            if (bundle.f2) this.importScreenshotSettings(bundle.f2);
            if (bundle.f3) this.importDashboardSettings(bundle.f3);
            if (bundle.f4) this.importPhysicsPresets(bundle.f4);
            if (bundle.f5) this.importTerminalSettings(bundle.f5);
            if (bundle.f6) this.importSessionSettings(bundle.f6);
            if (bundle.f7) this.importCheatProfiles(bundle.f7);
            
            logger.log("[SettingsExporter] All settings imported successfully");
        } catch (error) {
            logger.error("[SettingsExporter] Import failed:", error);
            throw error;
        }
    }
    
    /**
     * Экспорт настроек скриншотов (F2)
     */
    private exportScreenshotSettings(): ScreenshotSettings {
        const settings: ScreenshotSettings = {
            defaultFormat: localStorage.getItem('ptx_screenshot_format') || 'png',
            defaultMode: localStorage.getItem('ptx_screenshot_mode') || 'full',
            defaultQuality: parseFloat(localStorage.getItem('ptx_screenshot_quality') || '0.92'),
            autoScreenshots: JSON.parse(localStorage.getItem('ptx_auto_screenshots') || '[]'),
            filters: JSON.parse(localStorage.getItem('ptx_screenshot_filters') || '{}'),
            watermark: JSON.parse(localStorage.getItem('ptx_screenshot_watermark') || '{}')
        };
        return settings;
    }
    
    /**
     * Импорт настроек скриншотов
     */
    private importScreenshotSettings(settings: ScreenshotSettings): void {
        if (settings.defaultFormat) localStorage.setItem('ptx_screenshot_format', settings.defaultFormat);
        if (settings.defaultMode) localStorage.setItem('ptx_screenshot_mode', settings.defaultMode);
        if (settings.defaultQuality) localStorage.setItem('ptx_screenshot_quality', settings.defaultQuality.toString());
        if (settings.autoScreenshots) localStorage.setItem('ptx_auto_screenshots', JSON.stringify(settings.autoScreenshots));
        if (settings.filters) localStorage.setItem('ptx_screenshot_filters', JSON.stringify(settings.filters));
        if (settings.watermark) localStorage.setItem('ptx_screenshot_watermark', JSON.stringify(settings.watermark));
    }
    
    /**
     * Экспорт настроек Dashboard (F3)
     */
    private exportDashboardSettings(): DashboardSettings {
        const settings: DashboardSettings = {
            visibleSections: JSON.parse(localStorage.getItem('ptx_dashboard_sections') || '[]'),
            updateInterval: parseFloat(localStorage.getItem('ptx_dashboard_interval') || '100'),
            colorScheme: localStorage.getItem('ptx_dashboard_colors') || 'default',
            fontSize: parseFloat(localStorage.getItem('ptx_dashboard_fontsize') || '11')
        };
        return settings;
    }
    
    /**
     * Импорт настроек Dashboard
     */
    private importDashboardSettings(settings: DashboardSettings): void {
        if (settings.visibleSections) localStorage.setItem('ptx_dashboard_sections', JSON.stringify(settings.visibleSections));
        if (settings.updateInterval) localStorage.setItem('ptx_dashboard_interval', settings.updateInterval.toString());
        if (settings.colorScheme) localStorage.setItem('ptx_dashboard_colors', settings.colorScheme);
        if (settings.fontSize) localStorage.setItem('ptx_dashboard_fontsize', settings.fontSize.toString());
    }
    
    /**
     * Экспорт пресетов физики (F4)
     */
    private exportPhysicsPresets(): PhysicsPresets {
        const presets = JSON.parse(localStorage.getItem('tankPhysicsPresets') || '[]');
        return {
            presets,
            maxPresets: 10
        };
    }
    
    /**
     * Импорт пресетов физики
     */
    private importPhysicsPresets(presets: PhysicsPresets): void {
        if (presets.presets) {
            localStorage.setItem('tankPhysicsPresets', JSON.stringify(presets.presets));
        }
    }
    
    /**
     * Экспорт настроек Terminal (F5)
     */
    private exportTerminalSettings(): TerminalSettings {
        const saved = localStorage.getItem('window_position_system-terminal');
        if (saved) {
            const data = JSON.parse(saved);
            return {
                position: { x: data.left || 10, y: data.top || 120 },
                size: { width: data.width || 500, height: data.height || 250 },
                collapsed: data.collapsed || false,
                theme: data.theme || 'default'
            };
        }
        return {
            position: { x: 10, y: 120 },
            size: { width: 500, height: 250 },
            collapsed: false,
            theme: 'default'
        };
    }
    
    /**
     * Импорт настроек Terminal
     */
    private importTerminalSettings(settings: TerminalSettings): void {
        const data = {
            left: settings.position.x,
            top: settings.position.y,
            width: settings.size.width,
            height: settings.size.height,
            collapsed: settings.collapsed,
            theme: settings.theme
        };
        localStorage.setItem('window_position_system-terminal', JSON.stringify(data));
    }
    
    /**
     * Экспорт настроек Session (F6)
     */
    private exportSessionSettings(): SessionSettings {
        // Настройки сессии хранятся в sessionSettings объекте
        // Экспортируем из localStorage если есть
        const saved = localStorage.getItem('ptx_session_settings');
        if (saved) {
            return JSON.parse(saved);
        }
        
        return {
            enemyCount: 7,
            spawnInterval: 30,
            aiDifficulty: 'medium',
            waveSystem: { enabled: false, waveSize: 5, waveInterval: 60 },
            worldSettings: {}
        };
    }
    
    /**
     * Импорт настроек Session
     */
    private importSessionSettings(settings: SessionSettings): void {
        localStorage.setItem('ptx_session_settings', JSON.stringify(settings));
    }
    
    /**
     * Экспорт профилей читов (F7)
     */
    private exportCheatProfiles(): CheatProfiles {
        const profiles = JSON.parse(localStorage.getItem('ptx_cheat_profiles') || '[]');
        return { profiles };
    }
    
    /**
     * Импорт профилей читов
     */
    private importCheatProfiles(profiles: CheatProfiles): void {
        if (profiles.profiles) {
            localStorage.setItem('ptx_cheat_profiles', JSON.stringify(profiles.profiles));
        }
    }
    
    /**
     * Экспорт в файл
     */
    exportToFile(): void {
        const bundle = this.exportAll();
        const json = JSON.stringify(bundle, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ptx_settings_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    /**
     * Импорт из файла
     */
    async importFromFile(file: File): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const bundle: SettingsBundle = JSON.parse(e.target?.result as string);
                    this.importAll(bundle);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsText(file);
        });
    }
}

