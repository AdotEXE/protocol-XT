// ═══════════════════════════════════════════════════════════════════════════
// GAME LOADERS - Ленивая загрузка модулей
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { MainMenu } from "../menu";
import type { Garage } from "../garage";

/**
 * GameLoaders - Ленивая загрузка модулей
 * 
 * Отвечает за:
 * - Динамическую загрузку MainMenu
 * - Динамическую загрузку Garage
 * - Кэширование загруженных модулей
 */
export class GameLoaders {
    // Кэш загруженных модулей
    private mainMenuCache: MainMenu | undefined;
    private garageCache: Garage | undefined;
    
    // Callbacks для инициализации модулей
    private onMainMenuLoaded: ((mainMenu: MainMenu) => void) | null = null;
    private onGarageLoaded: ((garage: Garage) => void) | null = null;
    
    /**
     * Загрузка главного меню
     */
    async loadMainMenu(): Promise<MainMenu | null> {
        // Если уже загружено, возвращаем из кэша
        if (this.mainMenuCache) {
            return this.mainMenuCache;
        }
        
        try {
            logger.log("[GameLoaders] Loading MainMenu...");
            const { MainMenu } = await import("../menu");
            
            // Создаём экземпляр (требует параметры, которые будут переданы из Game)
            // В данном случае MainMenu может быть создан без параметров или с минимальными
            // Параметры будут установлены позже через методы
            const mainMenu = new MainMenu();
            this.mainMenuCache = mainMenu;
            
            if (this.onMainMenuLoaded) {
                this.onMainMenuLoaded(mainMenu);
            }
            
            logger.log("[GameLoaders] MainMenu loaded successfully");
            return mainMenu;
        } catch (error) {
            logger.error("[GameLoaders] Failed to load MainMenu:", error);
            return null;
        }
    }
    
    /**
     * Загрузка гаража
     */
    async loadGarage(): Promise<Garage | null> {
        // Если уже загружено, возвращаем из кэша
        if (this.garageCache) {
            return this.garageCache;
        }
        
        try {
            logger.log("[GameLoaders] Loading Garage...");
            const { Garage } = await import("../garage");
            
            // Создаём экземпляр (требует параметры, которые будут переданы из Game)
            // Garage может быть создан без параметров или с минимальными
            const garage = new Garage();
            this.garageCache = garage;
            
            if (this.onGarageLoaded) {
                this.onGarageLoaded(garage);
            }
            
            logger.log("[GameLoaders] Garage loaded successfully");
            return garage;
        } catch (error) {
            logger.error("[GameLoaders] Failed to load Garage:", error);
            return null;
        }
    }
    
    /**
     * Установить callback для загрузки MainMenu
     */
    setOnMainMenuLoaded(callback: (mainMenu: MainMenu) => void): void {
        this.onMainMenuLoaded = callback;
    }
    
    /**
     * Установить callback для загрузки Garage
     */
    setOnGarageLoaded(callback: (garage: Garage) => void): void {
        this.onGarageLoaded = callback;
    }
    
    /**
     * Получить загруженное главное меню
     */
    getMainMenu(): MainMenu | undefined {
        return this.mainMenuCache;
    }
    
    /**
     * Получить загруженный гараж
     */
    getGarage(): Garage | undefined {
        return this.garageCache;
    }
    
    /**
     * Очистить кэш
     */
    clearCache(): void {
        this.mainMenuCache = undefined;
        this.garageCache = undefined;
        logger.log("[GameLoaders] Cache cleared");
    }
    
    /**
     * Dispose системы загрузки
     */
    dispose(): void {
        this.clearCache();
        this.onMainMenuLoaded = null;
        this.onGarageLoaded = null;
        logger.log("[GameLoaders] Loaders system disposed");
    }
}

