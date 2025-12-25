/**
 * @module game/SettingsManager
 * @description Менеджер применения игровых настроек
 */

import { Scene, Engine, ArcRotateCamera, UniversalCamera } from "@babylonjs/core";
import { logger } from "../utils/logger";
import type { GameSettings } from "../menu";
import type { SoundManager } from "../soundManager";
import type { HUD } from "../hud";
import type { TankController } from "../tankController";

/**
 * Менеджер настроек игры
 * Централизует применение всех настроек к игровым системам
 */
export class SettingsManager {
    private engine: Engine | null = null;
    private scene: Scene | null = null;
    private soundManager: SoundManager | null = null;
    private hud: HUD | null = null;
    private tank: TankController | null = null;
    private camera: ArcRotateCamera | null = null;
    private aimCamera: UniversalCamera | null = null;
    private settings: GameSettings | null = null;
    private muteOnFocusLossHandler: (() => void) | null = null;
    
    /**
     * Инициализировать менеджер с игровыми системами
     */
    initialize(params: {
        engine: Engine;
        scene: Scene;
        soundManager?: SoundManager;
        hud?: HUD;
        tank?: TankController;
        camera?: ArcRotateCamera;
        aimCamera?: UniversalCamera;
    }): void {
        this.engine = params.engine;
        this.scene = params.scene;
        this.soundManager = params.soundManager ?? null;
        this.hud = params.hud ?? null;
        this.tank = params.tank ?? null;
        this.camera = params.camera ?? null;
        this.aimCamera = params.aimCamera ?? null;
    }
    
    /**
     * Обновить ссылки на системы
     */
    updateRefs(params: {
        soundManager?: SoundManager;
        hud?: HUD;
        tank?: TankController;
        camera?: ArcRotateCamera;
        aimCamera?: UniversalCamera;
    }): void {
        if (params.soundManager) this.soundManager = params.soundManager;
        if (params.hud) this.hud = params.hud;
        if (params.tank) this.tank = params.tank;
        if (params.camera) this.camera = params.camera;
        if (params.aimCamera) this.aimCamera = params.aimCamera;
    }
    
    /**
     * Применить все настройки
     */
    applyAll(settings: GameSettings): void {
        this.settings = settings;
        this.applyGraphics();
        this.applyAudio();
        this.applyControls();
        this.applyCamera();
        this.applyUI();
    }
    
    /**
     * Применить графические настройки
     */
    applyGraphics(): void {
        if (!this.engine || !this.scene || !this.settings) return;
        
        // Shadow quality
        this.scene.shadowsEnabled = this.settings.shadowQuality > 0;
        
        // Particle quality
        this.scene.particlesEnabled = this.settings.particleQuality > 0;
        
        // Fullscreen
        if (this.settings.fullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (!this.settings.fullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        
        logger.debug("Graphics settings applied");
    }
    
    /**
     * Применить аудио настройки
     */
    applyAudio(): void {
        if (!this.soundManager || !this.settings) return;
        
        const masterVol = this.settings.masterVolume / 100;
        this.soundManager.setMasterVolume(masterVol);
        
        // Remove old handler if exists
        if (this.muteOnFocusLossHandler) {
            document.removeEventListener("visibilitychange", this.muteOnFocusLossHandler);
            this.muteOnFocusLossHandler = null;
        }
        
        if (this.settings.muteOnFocusLoss) {
            const sm = this.soundManager;
            this.muteOnFocusLossHandler = () => {
                if (document.hidden) {
                    sm.setMasterVolume(0);
                } else {
                    sm.setMasterVolume(masterVol);
                }
            };
            document.addEventListener("visibilitychange", this.muteOnFocusLossHandler);
        }
        
        logger.debug("Audio settings applied");
    }
    
    /**
     * Применить настройки управления
     */
    applyControls(): void {
        if (!this.tank || !this.settings) return;
        
        // TODO: Apply control settings to tank controller
        // - Invert mouse Y
        // - Auto reload
        // - Hold to aim
        
        logger.debug("Control settings applied");
    }
    
    /**
     * Применить настройки камеры
     */
    applyCamera(): void {
        if (!this.camera || !this.settings) return;
        
        // Camera distance
        if (this.camera instanceof ArcRotateCamera) {
            this.camera.radius = this.settings.cameraDistance;
        }
        
        // Camera FOV for aim camera
        if (this.aimCamera) {
            const aimCam = this.aimCamera as UniversalCamera;
            if ('fov' in aimCam) {
                aimCam.fov = (this.settings.cameraFOV * Math.PI) / 180;
            }
        }
        
        logger.debug("Camera settings applied");
    }
    
    /**
     * Применить настройки UI
     */
    applyUI(): void {
        if (!this.hud || !this.settings) return;
        
        // TODO: Apply UI settings to HUD
        // - Show crosshair
        // - Show health bar
        // - Show ammo counter
        // - Crosshair style
        
        logger.debug("UI settings applied");
    }
    
    /**
     * Получить текущие настройки
     */
    getSettings(): GameSettings | null {
        return this.settings;
    }
    
    /**
     * Очистить обработчики событий
     */
    dispose(): void {
        if (this.muteOnFocusLossHandler) {
            document.removeEventListener("visibilitychange", this.muteOnFocusLossHandler);
            this.muteOnFocusLossHandler = null;
        }
    }
}

export default SettingsManager;

