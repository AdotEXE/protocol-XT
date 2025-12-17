/**
 * World Manager - Управление настройками мира (погода, время суток, видимость, ветер)
 */

import { Scene, Vector3, HemisphericLight, DirectionalLight, Color3, FogExp2 } from "@babylonjs/core";
import { logger } from "./utils/logger";

export enum WeatherType {
    CLEAR = "clear",
    RAIN = "rain",
    SNOW = "snow",
    FOG = "fog",
    STORM = "storm"
}

export interface WorldSettings {
    weather: WeatherType;
    timeOfDay: number; // 0-24 часа
    visibility: number; // 0-1
    fogDensity: number; // 0-1
    windDirection: Vector3;
    windStrength: number; // 0-100
    ambientLight: number; // 0-1
    sunIntensity: number; // 0-2
}

export class WorldManager {
    private scene: Scene;
    private sunLight: DirectionalLight | null = null;
    private ambientLight: HemisphericLight | null = null;
    private currentSettings: WorldSettings;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.currentSettings = this.getDefaultSettings();
        this.initializeLights();
    }
    
    /**
     * Получить настройки по умолчанию
     */
    private getDefaultSettings(): WorldSettings {
        return {
            weather: WeatherType.CLEAR,
            timeOfDay: 12, // Полдень
            visibility: 1.0,
            fogDensity: 0.0,
            windDirection: new Vector3(1, 0, 0),
            windStrength: 0,
            ambientLight: 0.5,
            sunIntensity: 1.0
        };
    }
    
    /**
     * Инициализация освещения
     */
    private initializeLights(): void {
        // Направленный свет (солнце)
        this.sunLight = new DirectionalLight("sun", new Vector3(0, -1, 0), this.scene);
        this.sunLight.intensity = this.currentSettings.sunIntensity;
        this.sunLight.diffuse = new Color3(1, 1, 0.9);
        this.sunLight.specular = new Color3(1, 1, 0.9);
        
        // Окружающий свет
        this.ambientLight = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
        this.ambientLight.intensity = this.currentSettings.ambientLight;
        this.ambientLight.diffuse = new Color3(0.5, 0.5, 0.6);
    }
    
    /**
     * Применение настроек мира
     */
    applySettings(settings: Partial<WorldSettings>): void {
        this.currentSettings = { ...this.currentSettings, ...settings };
        
        // Погода
        if (settings.weather !== undefined) {
            this.setWeather(settings.weather);
        }
        
        // Время суток
        if (settings.timeOfDay !== undefined) {
            this.setTimeOfDay(settings.timeOfDay);
        }
        
        // Видимость и туман
        if (settings.visibility !== undefined || settings.fogDensity !== undefined) {
            this.setFog(
                settings.fogDensity ?? this.currentSettings.fogDensity,
                settings.visibility ?? this.currentSettings.visibility
            );
        }
        
        // Ветер
        if (settings.windDirection !== undefined || settings.windStrength !== undefined) {
            this.setWind(
                settings.windDirection ?? this.currentSettings.windDirection,
                settings.windStrength ?? this.currentSettings.windStrength
            );
        }
        
        // Освещение
        if (settings.ambientLight !== undefined) {
            this.setAmbientLight(settings.ambientLight);
        }
        
        if (settings.sunIntensity !== undefined) {
            this.setSunIntensity(settings.sunIntensity);
        }
    }
    
    /**
     * Установка погоды
     */
    private setWeather(type: WeatherType): void {
        this.currentSettings.weather = type;
        
        // Удаляем старые эффекты погоды (если есть)
        // В будущем здесь можно добавить визуальные эффекты дождя/снега
        
        switch (type) {
            case WeatherType.FOG:
                // Туман уже обрабатывается через setFog
                break;
            case WeatherType.STORM:
                // Буря - усиленный туман и тёмное небо
                this.setFog(0.3, 0.7);
                this.setTimeOfDay(18); // Вечер
                break;
            case WeatherType.CLEAR:
                this.setFog(0, 1.0);
                break;
        }
        
        logger.log(`[WorldManager] Weather set to: ${type}`);
    }
    
    /**
     * Установка времени суток
     */
    private setTimeOfDay(hour: number): void {
        this.currentSettings.timeOfDay = Math.max(0, Math.min(24, hour));
        
        if (!this.sunLight) return;
        
        // Вычисляем угол солнца (0 = полночь, 12 = полдень, 24 = полночь)
        const normalizedHour = hour % 24;
        const sunAngle = (normalizedHour / 24) * Math.PI * 2 - Math.PI / 2; // Начинаем с -90 градусов
        
        // Позиция солнца на небе
        const sunX = Math.cos(sunAngle);
        const sunY = Math.sin(sunAngle);
        const sunZ = 0;
        
        this.sunLight.direction = new Vector3(sunX, sunY, sunZ).normalize();
        
        // Интенсивность в зависимости от времени суток
        if (normalizedHour >= 6 && normalizedHour <= 18) {
            // День
            const dayProgress = (normalizedHour - 6) / 12; // 0-1 от рассвета до заката
            const intensity = Math.sin(dayProgress * Math.PI) * this.currentSettings.sunIntensity;
            this.sunLight.intensity = Math.max(0.1, intensity);
        } else {
            // Ночь
            this.sunLight.intensity = 0.1;
        }
        
        // Цвет солнца в зависимости от времени
        if (normalizedHour >= 6 && normalizedHour <= 8) {
            // Рассвет
            this.sunLight.diffuse = new Color3(1, 0.7, 0.5);
        } else if (normalizedHour >= 18 && normalizedHour <= 20) {
            // Закат
            this.sunLight.diffuse = new Color3(1, 0.6, 0.4);
        } else if (normalizedHour >= 8 && normalizedHour <= 18) {
            // День
            this.sunLight.diffuse = new Color3(1, 1, 0.9);
        } else {
            // Ночь
            this.sunLight.diffuse = new Color3(0.3, 0.3, 0.5);
        }
        
        // Окружающий свет тоже меняется
        if (this.ambientLight) {
            if (normalizedHour >= 6 && normalizedHour <= 18) {
                this.ambientLight.intensity = this.currentSettings.ambientLight;
            } else {
                this.ambientLight.intensity = this.currentSettings.ambientLight * 0.3;
            }
        }
    }
    
    /**
     * Установка тумана
     */
    private setFog(density: number, visibility: number): void {
        this.currentSettings.fogDensity = Math.max(0, Math.min(1, density));
        this.currentSettings.visibility = Math.max(0, Math.min(1, visibility));
        
        if (density > 0) {
            if (!this.scene.fogEnabled) {
                this.scene.fogEnabled = true;
            }
            
            // Используем экспоненциальный туман
            const fogColor = new Color3(0.5, 0.5, 0.6);
            this.scene.fogMode = Scene.FOGMODE_EXP2;
            this.scene.fogDensity = density * 0.1; // Масштабируем для лучшего эффекта
            this.scene.fogColor = fogColor;
        } else {
            this.scene.fogEnabled = false;
        }
    }
    
    /**
     * Установка ветра
     */
    private setWind(direction: Vector3, strength: number): void {
        this.currentSettings.windDirection = direction.normalize();
        this.currentSettings.windStrength = Math.max(0, Math.min(100, strength));
        
        // Ветер можно применить к частицам и эффектам
        // Сохраняем в scene для использования другими системами
        (this.scene as any).windDirection = this.currentSettings.windDirection;
        (this.scene as any).windStrength = this.currentSettings.windStrength;
    }
    
    /**
     * Установка окружающего света
     */
    private setAmbientLight(intensity: number): void {
        this.currentSettings.ambientLight = Math.max(0, Math.min(1, intensity));
        if (this.ambientLight) {
            this.ambientLight.intensity = this.currentSettings.ambientLight;
        }
    }
    
    /**
     * Установка интенсивности солнца
     */
    private setSunIntensity(intensity: number): void {
        this.currentSettings.sunIntensity = Math.max(0, Math.min(2, intensity));
        if (this.sunLight) {
            this.sunLight.intensity = this.currentSettings.sunIntensity;
        }
    }
    
    /**
     * Получить текущие настройки
     */
    getSettings(): WorldSettings {
        return { ...this.currentSettings };
    }
    
    /**
     * Сброс к настройкам по умолчанию
     */
    reset(): void {
        this.currentSettings = this.getDefaultSettings();
        this.applySettings(this.currentSettings);
    }
}

