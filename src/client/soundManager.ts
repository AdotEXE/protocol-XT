/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENHANCED SOUND MANAGER - Продвинутая система звука с 3D позиционированием
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Улучшения:
 * - 3D позиционирование звуков (PannerNode)
 * - Реверберация и пространственные эффекты
 * - Более реалистичные звуки двигателя
 * - Динамические звуки в зависимости от скорости/действий
 * - Улучшенные фильтры и эффекты
 */

import { Vector3 } from "@babylonjs/core";

export class SoundManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private listener: AudioListener | null = null;
    
    // Engine sound nodes
    private engineOscillator: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;
    private engineFilter: BiquadFilterNode | null = null;
    private engineRunning = false;
    private currentEngineSpeed = 0;
    private enginePanner: PannerNode | null = null;
    
    // Enhanced Reverb (multi-tap delay for realistic reverb)
    private reverbGain: GainNode | null = null;
    private reverbDelays: DelayNode[] = [];
    private reverbGains: GainNode[] = [];
    private reverbFilters: BiquadFilterNode[] = [];
    
    // Volume settings
    public masterVolume = 0.7;
    public engineVolume = 0.4;
    public shootVolume = 0.75;
    public explosionVolume = 0.85;
    public hitVolume = 0.55;
    public reloadVolume = 0.45;
    public movementVolume = 0.35;
    public pickupVolume = 0.6;
    public uiVolume = 0.5;
    public ambientVolume = 0.2;
    
    // 3D Audio settings
    private use3DAudio = true;
    private maxDistance = 200; // Максимальная дистанция слышимости
    private dopplerFactor = 1.0; // Эффект допплера
    
    // Sound variation tracking
    private soundVariationCounter = 0;
    
    // Movement sound tracking
    private lastMovementSoundTime = 0;
    private movementSoundInterval = 150; // ms between movement sounds
    
    // Ambient sound
    private ambientOscillator: OscillatorNode | null = null;
    private ambientGain: GainNode | null = null;
    private ambientRunning = false;
    
    // Turret rotation sound
    private turretRotationOscillator: OscillatorNode | null = null;
    private turretRotationGain: GainNode | null = null;
    private turretRotationActive = false;
    
    constructor() {
        this.initAudio();
        this.startAmbient();
    }
    
    private initAudio() {
        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.audioContext.destination);
            
            // Создаём слушателя для 3D звука
            if (this.audioContext.listener) {
                this.listener = this.audioContext.listener;
                // Позиция слушателя (камера игрока)
                if ((this.listener as any).positionX) {
                    (this.listener as any).positionX.value = 0;
                    (this.listener as any).positionY.value = 0;
                    (this.listener as any).positionZ.value = 0;
                }
            }
            
            // Создаём улучшенную реверберацию (multi-tap delay)
            // Используем несколько задержек для более реалистичной реверберации
            const reverbTimes = [0.03, 0.05, 0.08, 0.12, 0.18, 0.25]; // Разные задержки
            const reverbGains = [0.4, 0.3, 0.25, 0.2, 0.15, 0.1]; // Убывающая громкость
            
            for (let i = 0; i < reverbTimes.length; i++) {
                const delay = this.audioContext.createDelay(0.5);
                delay.delayTime.value = reverbTimes[i];
                
                const gain = this.audioContext.createGain();
                gain.gain.value = reverbGains[i] * 0.2; // Общая громкость реверберации
                
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 3000 - i * 200; // Каждый отскок теряет высокие частоты
                filter.Q.value = 1;
                
                delay.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                
                this.reverbDelays.push(delay);
                this.reverbGains.push(gain);
                this.reverbFilters.push(filter);
            }
            
            // Главный gain для реверберации
            this.reverbGain = this.audioContext.createGain();
            this.reverbGain.gain.value = 0.18;
            
            console.log("[SoundManager] Enhanced audio initialized with 3D support and multi-tap reverb");
        } catch (e) {
            console.warn("[SoundManager] Web Audio not supported:", e);
        }
    }
    
    // Обновить позицию слушателя (камеры)
    updateListenerPosition(position: Vector3, forward: Vector3, up: Vector3) {
        if (!this.listener || !this.use3DAudio) return;
        
        try {
            if ((this.listener as any).positionX) {
                (this.listener as any).positionX.value = position.x;
                (this.listener as any).positionY.value = position.y;
                (this.listener as any).positionZ.value = position.z;
            }
            if ((this.listener as any).forwardX) {
                (this.listener as any).forwardX.value = forward.x;
                (this.listener as any).forwardY.value = forward.y;
                (this.listener as any).forwardZ.value = forward.z;
            }
            if ((this.listener as any).upX) {
                (this.listener as any).upX.value = up.x;
                (this.listener as any).upY.value = up.y;
                (this.listener as any).upZ.value = up.z;
            }
        } catch (e) {
            // Fallback если 3D не поддерживается
            this.use3DAudio = false;
        }
    }
    
    // Создать PannerNode для 3D позиционирования с допплером
    private createPanner(position?: Vector3, velocity?: Vector3): PannerNode | null {
        if (!this.audioContext || !this.use3DAudio) return null;
        
        try {
            const panner = this.audioContext.createPanner();
            panner.panningModel = "HRTF"; // Более реалистичная модель
            panner.distanceModel = "inverse";
            panner.refDistance = 1;
            panner.maxDistance = this.maxDistance;
            panner.rolloffFactor = 1.2; // Более резкое затухание
            
            if (position) {
                if ((panner as any).positionX) {
                    (panner as any).positionX.value = position.x;
                    (panner as any).positionY.value = position.y;
                    (panner as any).positionZ.value = position.z;
                }
            }
            
            // Эффект допплера (если есть скорость)
            if (velocity && (panner as any).velocityX) {
                const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
                const dopplerSpeed = Math.min(speed * this.dopplerFactor, 50); // Ограничиваем эффект
                (panner as any).velocityX.value = velocity.x * this.dopplerFactor;
                (panner as any).velocityY.value = velocity.y * this.dopplerFactor;
                (panner as any).velocityZ.value = velocity.z * this.dopplerFactor;
            }
            
            return panner;
        } catch (e) {
            return null;
        }
    }
    
    // Подключить к реверберации
    private connectToReverb(source: AudioNode, amount: number = 0.2) {
        if (!this.reverbGain || this.reverbDelays.length === 0) return;
        
        const reverbSend = this.audioContext!.createGain();
        reverbSend.gain.value = amount;
        source.connect(reverbSend);
        
        // Подключаем к каждому задержке реверберации
        this.reverbDelays.forEach(delay => {
            reverbSend.connect(delay);
        });
    }
    
    // Resume audio context (required after user interaction)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ENHANCED ENGINE SOUND
    // ═══════════════════════════════════════════════════════════════════════
    
    startEngine() {
        if (!this.audioContext || !this.masterGain || this.engineRunning) return;
        
        this.resume();
        
        // Основной осциллятор (низкие частоты)
        this.engineOscillator = this.audioContext.createOscillator();
        this.engineOscillator.type = 'sawtooth';
        this.engineOscillator.frequency.value = 40;
        
        // Второй осциллятор (средние частоты)
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 80;
        
        // Третий осциллятор (высокие гармоники)
        const osc3 = this.audioContext.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = 20; // Суб-бас
        
        // Четвёртый осциллятор (вибрация)
        const osc4 = this.audioContext.createOscillator();
        osc4.type = 'square';
        osc4.frequency.value = 120;
        
        // Gain для контроля громкости
        this.engineGain = this.audioContext.createGain();
        this.engineGain.gain.value = this.engineVolume;
        
        // Low-pass фильтр с динамической частотой
        this.engineFilter = this.audioContext.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 300;
        this.engineFilter.Q.value = 1.5;
        
        // High-pass фильтр
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 25;
        highPass.Q.value = 0.7;
        
        // Компрессор для более реалистичного звука
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        
        // 3D позиционирование
        this.enginePanner = this.createPanner();
        
        // Подключаем цепочку
        this.engineOscillator.connect(this.engineFilter);
        osc2.connect(this.engineFilter);
        osc3.connect(this.engineFilter);
        osc4.connect(this.engineFilter);
        this.engineFilter.connect(highPass);
        highPass.connect(compressor);
        compressor.connect(this.engineGain);
        
        if (this.enginePanner) {
            this.engineGain.connect(this.enginePanner);
            this.enginePanner.connect(this.masterGain);
        } else {
        this.engineGain.connect(this.masterGain);
        }
        
        // Добавляем улучшенную реверберацию
        this.connectToReverb(this.engineGain, 0.15);
        
        this.engineOscillator.start();
        osc2.start();
        osc3.start();
        osc4.start();
        this.engineRunning = true;
        
        // Сохраняем дополнительные осцилляторы
        (this.engineOscillator as any)._osc2 = osc2;
        (this.engineOscillator as any)._osc3 = osc3;
        (this.engineOscillator as any)._osc4 = osc4;
        
        console.log("[SoundManager] Enhanced engine started");
    }
    
    stopEngine() {
        if (this.engineOscillator) {
            this.engineOscillator.stop();
            this.engineOscillator.disconnect();
            
            const osc2 = (this.engineOscillator as any)._osc2;
            const osc3 = (this.engineOscillator as any)._osc3;
            const osc4 = (this.engineOscillator as any)._osc4;
            
            if (osc2) { osc2.stop(); osc2.disconnect(); }
            if (osc3) { osc3.stop(); osc3.disconnect(); }
            if (osc4) { osc4.stop(); osc4.disconnect(); }
            
            this.engineOscillator = null;
        }
        if (this.engineGain) {
            this.engineGain.disconnect();
            this.engineGain = null;
        }
        if (this.engineFilter) {
            this.engineFilter.disconnect();
            this.engineFilter = null;
        }
        if (this.enginePanner) {
            this.enginePanner.disconnect();
            this.enginePanner = null;
        }
        this.engineRunning = false;
    }
    
    // Улучшенное обновление звука двигателя с плавными переходами
    updateEngine(speedRatio: number, throttle: number, position?: Vector3, velocity?: Vector3) {
        if (!this.engineOscillator || !this.engineGain || !this.engineFilter) return;
        
        speedRatio = Math.abs(speedRatio);
        throttle = Math.abs(throttle);
        
        // Плавные переходы частоты (используем экспоненциальную интерполяцию)
        const targetFreq = 30 + speedRatio * 110; // 30Hz (idle) to 140Hz (max)
        const currentFreq = this.engineOscillator.frequency.value;
        const freqDiff = targetFreq - currentFreq;
        const newFreq = currentFreq + freqDiff * 0.15; // Плавная интерполяция
        
        this.engineOscillator.frequency.value = newFreq;
        
        // Обновляем гармоники с плавными переходами
        const osc2 = (this.engineOscillator as any)._osc2;
        const osc3 = (this.engineOscillator as any)._osc3;
        const osc4 = (this.engineOscillator as any)._osc4;
        
        if (osc2) {
            const target2 = newFreq * 2.1;
            const current2 = osc2.frequency.value;
            osc2.frequency.value = current2 + (target2 - current2) * 0.15;
        }
        if (osc3) {
            const target3 = newFreq * 0.45;
            const current3 = osc3.frequency.value;
            osc3.frequency.value = current3 + (target3 - current3) * 0.15;
        }
        if (osc4) {
            const target4 = newFreq * 3.2;
            const current4 = osc4.frequency.value;
            osc4.frequency.value = current4 + (target4 - current4) * 0.15;
        }
        
        // Динамический фильтр с плавными переходами
        const targetFilterFreq = 250 + speedRatio * 350;
        const currentFilterFreq = this.engineFilter.frequency.value;
        const filterDiff = targetFilterFreq - currentFilterFreq;
        this.engineFilter.frequency.value = currentFilterFreq + filterDiff * 0.2;
        
        // Объём зависит от газа и скорости с плавными переходами
        const targetVolume = this.engineVolume * (0.35 + throttle * 0.35 + speedRatio * 0.4);
        const currentVolume = this.engineGain.gain.value;
        const volumeDiff = targetVolume - currentVolume;
        this.engineGain.gain.value = Math.min(currentVolume + volumeDiff * 0.2, this.engineVolume * 1.4);
        
        // Обновляем 3D позицию и скорость (для допплера)
        if (this.enginePanner && position) {
            try {
                if ((this.enginePanner as any).positionX) {
                    (this.enginePanner as any).positionX.value = position.x;
                    (this.enginePanner as any).positionY.value = position.y;
                    (this.enginePanner as any).positionZ.value = position.z;
                }
                if (velocity && (this.enginePanner as any).velocityX) {
                    (this.enginePanner as any).velocityX.value = velocity.x * this.dopplerFactor;
                    (this.enginePanner as any).velocityY.value = velocity.y * this.dopplerFactor;
                    (this.enginePanner as any).velocityZ.value = velocity.z * this.dopplerFactor;
                }
            } catch (e) {}
        }
        
        this.currentEngineSpeed = speedRatio;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ENHANCED SHOOTING SOUND
    // ═══════════════════════════════════════════════════════════════════════
    
    playShoot(cannonType: string = "standard", position?: Vector3, velocity?: Vector3) {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Добавляем вариацию для разнообразия
        this.soundVariationCounter++;
        const variation = (Math.sin(this.soundVariationCounter * 0.1) + 1) / 2; // 0-1
        
        // Параметры для разных типов пушек
        let duration = 0.35;
        let baseFreq = 2200;
        let bassFreq = 85;
        let volume = this.shootVolume;
        let reverbAmount = 0.2;
        
        switch (cannonType) {
            case "heavy":
                duration = 0.6;
                baseFreq = 1400;
                bassFreq = 45;
                volume = this.shootVolume * 1.3;
                reverbAmount = 0.3;
                break;
            case "rapid":
            case "fast":
                duration = 0.25;
                baseFreq = 2800;
                bassFreq = 110;
                volume = this.shootVolume * 0.85;
                reverbAmount = 0.15;
                break;
            case "sniper":
                duration = 0.7;
                baseFreq = 1100;
                bassFreq = 35;
                volume = this.shootVolume * 1.4;
                reverbAmount = 0.35;
                break;
            case "gatling":
                duration = 0.18;
                baseFreq = 3200;
                bassFreq = 130;
                volume = this.shootVolume * 0.75;
                reverbAmount = 0.1;
                break;
        }
        
        // Добавляем небольшую вариацию частоты
        baseFreq *= (0.95 + variation * 0.1);
        bassFreq *= (0.95 + variation * 0.1);
        
        // Шум для взрыва
        const noiseBuffer = this.createNoiseBuffer(duration);
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        // Огибающая
        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(volume, now);
        envelope.gain.exponentialDecayTo(0.01, now + duration);
        
        // Low-pass фильтр
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(baseFreq, now);
        filter.frequency.exponentialDecayTo(70, now + duration * 0.75);
        filter.Q.value = 2;
        
        // Басовый удар
        const bassOsc = this.audioContext.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        bassOsc.frequency.exponentialDecayTo(bassFreq * 0.25, now + duration * 0.6);
        
        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(volume * 1.0, now);
        bassGain.gain.exponentialDecayTo(0.01, now + duration * 0.6);
        
        // Высокочастотный клик
        const clickOsc = this.audioContext.createOscillator();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(2500, now);
        clickOsc.frequency.exponentialDecayTo(600, now + 0.06);
        
        const clickGain = this.audioContext.createGain();
        clickGain.gain.setValueAtTime(volume * 0.4, now);
        clickGain.gain.exponentialDecayTo(0.01, now + 0.06);
        
        // 3D позиционирование с допплером
        const panner = position ? this.createPanner(position, velocity) : null;
        
        // Подключаем
        noiseSource.connect(filter);
        filter.connect(envelope);
        
        bassOsc.connect(bassGain);
        clickOsc.connect(clickGain);
        
        if (panner) {
            envelope.connect(panner);
            bassGain.connect(panner);
            clickGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            envelope.connect(this.masterGain);
        bassGain.connect(this.masterGain);
            clickGain.connect(this.masterGain);
        }
        
        // Улучшенная реверберация
        if (reverbAmount > 0) {
            this.connectToReverb(envelope, reverbAmount);
        }
        
        // Воспроизведение
        noiseSource.start(now);
        noiseSource.stop(now + duration);
        bassOsc.start(now);
        bassOsc.stop(now + duration * 0.6);
        clickOsc.start(now);
        clickOsc.stop(now + 0.06);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ENHANCED EXPLOSION SOUND
    // ═══════════════════════════════════════════════════════════════════════
    
    playExplosion(position?: Vector3, size: number = 1.0, velocity?: Vector3) {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        const duration = 0.7 * size;
        
        // Вариация для разнообразия
        const variation = Math.random() * 0.15 + 0.925; // 0.925-1.075
        
        // Шумовой взрыв
        const noiseBuffer = this.createNoiseBuffer(duration);
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        // Огибающая с вариацией
        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(this.explosionVolume * size * variation, now);
        envelope.gain.exponentialDecayTo(0.01, now + duration * 0.8);
        
        // Low-pass фильтр
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3500 * variation, now);
        filter.frequency.exponentialDecayTo(40, now + duration * 0.6);
        filter.Q.value = 1.5;
        
        // Глубокий бас
        const bassOsc = this.audioContext.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(55 * variation, now);
        bassOsc.frequency.exponentialDecayTo(18, now + duration * 0.4);
        
        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(this.explosionVolume * size * variation, now);
        bassGain.gain.exponentialDecayTo(0.01, now + duration * 0.4);
        
        // Дополнительный высокочастотный компонент для реалистичности
        const highFreqOsc = this.audioContext.createOscillator();
        highFreqOsc.type = 'square';
        highFreqOsc.frequency.setValueAtTime(8000 * variation, now);
        highFreqOsc.frequency.exponentialDecayTo(200, now + duration * 0.3);
        
        const highFreqGain = this.audioContext.createGain();
        highFreqGain.gain.setValueAtTime(this.explosionVolume * size * 0.3 * variation, now);
        highFreqGain.gain.exponentialDecayTo(0.01, now + duration * 0.3);
        
        // 3D позиционирование с допплером
        const panner = position ? this.createPanner(position, velocity) : null;
        
        // Подключаем
        noiseSource.connect(filter);
        filter.connect(envelope);
        bassOsc.connect(bassGain);
        highFreqOsc.connect(highFreqGain);
        
        if (panner) {
            envelope.connect(panner);
            bassGain.connect(panner);
            highFreqGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
        envelope.connect(this.masterGain);
            bassGain.connect(this.masterGain);
            highFreqGain.connect(this.masterGain);
        }
        
        // Улучшенная реверберация
        this.connectToReverb(envelope, 0.4);
        
        highFreqOsc.start(now);
        highFreqOsc.stop(now + duration * 0.3);
        
        noiseSource.start(now);
        noiseSource.stop(now + duration);
        bassOsc.start(now);
        bassOsc.stop(now + duration * 0.4);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // ENHANCED HIT SOUND
    // ═══════════════════════════════════════════════════════════════════════
    
    playHit(hitType: "armor" | "critical" | "normal" | "ricochet" = "normal", position?: Vector3, velocity?: Vector3) {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Вариация для разнообразия
        const variation = Math.random() * 0.2 + 0.9; // 0.9-1.1
        
        let freq = 850;
        let duration = 0.12;
        let volume = this.hitVolume;
        let harmonics = 2;
        
        switch (hitType) {
            case "armor":
                freq = 550;
                duration = 0.18;
                volume = this.hitVolume * 1.3;
                harmonics = 3;
                break;
            case "critical":
                freq = 1300;
                duration = 0.25;
                volume = this.hitVolume * 1.6;
                harmonics = 4;
                break;
            case "ricochet":
                freq = 1200;
                duration = 0.15;
                volume = this.hitVolume * 0.8;
                harmonics = 2;
                break;
        }
        
        // Применяем вариацию
        freq *= variation;
        volume *= variation;
        
        // Основной удар
        const osc = this.audioContext.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialDecayTo(freq * 0.25, now + duration);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialDecayTo(0.01, now + duration);
        
        // Гармоники для более богатого звука
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 1.6, now);
        osc2.frequency.exponentialDecayTo(freq * 0.4, now + duration * 0.8);
        
        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(volume * 0.6, now);
        gain2.gain.exponentialDecayTo(0.01, now + duration * 0.8);
        
        // 3D позиционирование с допплером
        const panner = position ? this.createPanner(position, velocity) : null;
        
        osc.connect(gain);
        osc2.connect(gain2);
        
        if (panner) {
            gain.connect(panner);
            gain2.connect(panner);
            panner.connect(this.masterGain);
        } else {
        gain.connect(this.masterGain);
            gain2.connect(this.masterGain);
        }
        
        // Реверберация для попаданий
        this.connectToReverb(gain, 0.15);
        
        osc.start(now);
        osc.stop(now + duration);
        osc2.start(now);
        osc2.stop(now + duration * 0.8);
    }
    
    // Звук рикошета
    playRicochet(position?: Vector3) {
        this.playHit("ricochet", position);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // OTHER SOUNDS (улучшенные)
    // ═══════════════════════════════════════════════════════════════════════
    
    playReloadComplete() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Первый клик
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'square';
        osc1.frequency.value = 550;
        
        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(this.reloadVolume, now);
        gain1.gain.exponentialDecayTo(0.01, now + 0.08);
        
        const filter1 = this.audioContext.createBiquadFilter();
        filter1.type = 'lowpass';
        filter1.frequency.value = 2200;
        
        osc1.connect(filter1);
        filter1.connect(gain1);
        gain1.connect(this.masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.08);
        
        // Второй клик (механический)
        setTimeout(() => {
            if (!this.audioContext || !this.masterGain) return;
            const now2 = this.audioContext.currentTime;
            const osc2 = this.audioContext.createOscillator();
            osc2.type = 'square';
            osc2.frequency.value = 750;
            
            const gain2 = this.audioContext.createGain();
            gain2.gain.setValueAtTime(this.reloadVolume * 0.9, now2);
            gain2.gain.exponentialDecayTo(0.01, now2 + 0.05);
            
            const filter2 = this.audioContext.createBiquadFilter();
            filter2.type = 'lowpass';
            filter2.frequency.value = 2800;
            
            osc2.connect(filter2);
            filter2.connect(gain2);
            gain2.connect(this.masterGain);
            
            osc2.start(now2);
            osc2.stop(now2 + 0.05);
        }, 70);
    }
    
    playPickup(pickupType?: string) {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Вариация для разнообразия
        const variation = Math.random() * 0.1 + 0.95;
        
        // Приятный восходящий звук с гармониками
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(900 * variation, now);
        osc1.frequency.exponentialRampToValueAtTime(1400 * variation, now + 0.12);
        
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1200 * variation, now);
        osc2.frequency.exponentialRampToValueAtTime(1800 * variation, now + 0.12);
        
        // Третий осциллятор для более богатого звука
        const osc3 = this.audioContext.createOscillator();
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(600 * variation, now);
        osc3.frequency.exponentialRampToValueAtTime(1000 * variation, now + 0.12);
        
        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(this.pickupVolume * variation, now);
        gain1.gain.exponentialDecayTo(0.01, now + 0.18);
        
        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(this.pickupVolume * 0.7 * variation, now);
        gain2.gain.exponentialDecayTo(0.01, now + 0.18);
        
        const gain3 = this.audioContext.createGain();
        gain3.gain.setValueAtTime(this.pickupVolume * 0.5 * variation, now);
        gain3.gain.exponentialDecayTo(0.01, now + 0.18);
        
        // Легкий фильтр для мягкости
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 4000;
        filter.Q.value = 0.7;
        
        osc1.connect(filter);
        osc2.connect(filter);
        osc3.connect(filter);
        filter.connect(gain1);
        filter.connect(gain2);
        filter.connect(gain3);
        gain1.connect(this.masterGain);
        gain2.connect(this.masterGain);
        gain3.connect(this.masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.18);
        osc2.start(now);
        osc2.stop(now + 0.18);
        osc3.start(now);
        osc3.stop(now + 0.18);
    }
    
    playMovement(speed: number = 1.0, isTurning: boolean = false) {
        if (!this.audioContext || !this.masterGain) return;
        
        // Ограничиваем частоту звуков движения
        const now = Date.now();
        if (now - this.lastMovementSoundTime < this.movementSoundInterval) return;
        this.lastMovementSoundTime = now;
        
        this.resume();
        const audioNow = this.audioContext.currentTime;
        
        // Вариация для разнообразия
        const variation = Math.random() * 0.15 + 0.925;
        
        // Шум гусениц (зависит от скорости)
        const duration = 0.15 * (0.8 + speed * 0.4);
        const noiseBuffer = this.createNoiseBuffer(duration);
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(this.movementVolume * speed * variation, audioNow);
        gain.gain.exponentialDecayTo(0.01, audioNow + duration);
        
        // Фильтр зависит от скорости и поворота
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = (400 + speed * 300) * variation;
        if (isTurning) {
            filter.frequency.value *= 0.7; // Более низкий звук при повороте
        }
        filter.Q.value = 1.2;
        
        // Дополнительный низкочастотный компонент для гусениц
        const bassOsc = this.audioContext.createOscillator();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.value = (30 + speed * 20) * variation;
        
        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(this.movementVolume * speed * 0.4 * variation, audioNow);
        bassGain.gain.exponentialDecayTo(0.01, audioNow + duration);
        
        const bassFilter = this.audioContext.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 150;
        
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this.masterGain);
        
        noiseSource.start(audioNow);
        noiseSource.stop(audioNow + duration);
        bassOsc.start(audioNow);
        bassOsc.stop(audioNow + duration);
    }
    
    playGarageOpen() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(this.uiVolume, now);
        gain.gain.exponentialDecayTo(0.01, now + 0.35);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.35);
    }
    
    playGarageClose() {
        this.playGarageOpen(); // Тот же звук
    }
    
    playPurchase() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Улучшенный успешный аккорд (мажорное трезвучие)
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.2); // E5
        
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now); // E5
        osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
        
        const osc3 = this.audioContext.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(783.99, now); // G5
        osc3.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2); // C6
        
        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(this.uiVolume, now);
        gain1.gain.exponentialDecayTo(0.01, now + 0.25);
        
        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(this.uiVolume * 0.85, now);
        gain2.gain.exponentialDecayTo(0.01, now + 0.25);
        
        const gain3 = this.audioContext.createGain();
        gain3.gain.setValueAtTime(this.uiVolume * 0.7, now);
        gain3.gain.exponentialDecayTo(0.01, now + 0.25);
        
        // Мягкий фильтр
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 5000;
        filter.Q.value = 0.5;
        
        osc1.connect(filter);
        osc2.connect(filter);
        osc3.connect(filter);
        filter.connect(gain1);
        filter.connect(gain2);
        filter.connect(gain3);
        gain1.connect(this.masterGain);
        gain2.connect(this.masterGain);
        gain3.connect(this.masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.25);
        osc2.start(now);
        osc2.stop(now + 0.25);
        osc3.start(now);
        osc3.stop(now + 0.25);
    }
    
    playUpgrade() {
        this.playPurchase(); // Тот же звук
    }
    
    playRespawn() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.6);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(this.uiVolume, now);
        gain.gain.exponentialDecayTo(0.01, now + 0.6);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.6);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CHAT/UI SOUNDS
    // ═══════════════════════════════════════════════════════════════════════
    
    playError() {
            if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Нисходящий диссонансный аккорд
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.exponentialRampToValueAtTime(165, now + 0.2);
        
            const osc2 = this.audioContext.createOscillator();
            osc2.type = 'square';
        osc2.frequency.setValueAtTime(247, now); // Немного диссонансная частота
        osc2.frequency.exponentialRampToValueAtTime(185, now + 0.2);
        
        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(this.uiVolume * 0.6, now);
        gain1.gain.exponentialDecayTo(0.01, now + 0.2);
        
        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(this.uiVolume * 0.4, now);
        gain2.gain.exponentialDecayTo(0.01, now + 0.2);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain1);
        filter.connect(gain2);
        gain1.connect(this.masterGain);
        gain2.connect(this.masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.2);
        osc2.start(now);
        osc2.stop(now + 0.2);
    }
    
    playWarning() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Пульсирующий предупреждающий звук
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(440, now);
        osc1.frequency.exponentialRampToValueAtTime(392, now + 0.15);
        
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(880, now);
        osc2.frequency.exponentialRampToValueAtTime(784, now + 0.15);
        
        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(this.uiVolume * 0.5, now);
        gain1.gain.exponentialDecayTo(0.01, now + 0.15);
            
            const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(this.uiVolume * 0.3, now);
        gain2.gain.exponentialDecayTo(0.01, now + 0.15);
            
        osc1.connect(gain1);
            osc2.connect(gain2);
        gain1.connect(this.masterGain);
            gain2.connect(this.masterGain);
            
        osc1.start(now);
        osc1.stop(now + 0.15);
        osc2.start(now);
        osc2.stop(now + 0.15);
    }
    
    playSuccess() {
        this.playPurchase(); // Тот же звук
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // AMBIENT SOUNDS
    // ═══════════════════════════════════════════════════════════════════════
    
    startAmbient() {
        if (!this.audioContext || !this.masterGain || this.ambientRunning) return;
        this.resume();
        
        // Тихий фоновый звук (ветер, атмосфера)
        this.ambientOscillator = this.audioContext.createOscillator();
        this.ambientOscillator.type = 'sine';
        this.ambientOscillator.frequency.value = 60; // Низкая частота
        
        // Шум для атмосферы
        const noiseBuffer = this.createNoiseBuffer(10); // Длинный буфер
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        
        this.ambientGain = this.audioContext.createGain();
        this.ambientGain.gain.value = this.ambientVolume;
        
        // Сильный low-pass фильтр для тихого фона
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 0.5;
        
        // High-pass для удаления очень низких частот
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 30;
        highPass.Q.value = 0.5;
        
        noiseSource.connect(highPass);
        highPass.connect(filter);
        filter.connect(this.ambientGain);
        this.ambientGain.connect(this.masterGain);
        
        noiseSource.start();
        this.ambientRunning = true;
        
        (this.ambientGain as any)._noiseSource = noiseSource;
    }
    
    stopAmbient() {
        if (this.ambientGain) {
            const noiseSource = (this.ambientGain as any)._noiseSource;
            if (noiseSource) {
                noiseSource.stop();
                noiseSource.disconnect();
            }
            this.ambientGain.disconnect();
            this.ambientGain = null;
        }
        if (this.ambientOscillator) {
            this.ambientOscillator.stop();
            this.ambientOscillator.disconnect();
            this.ambientOscillator = null;
        }
        this.ambientRunning = false;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // TURRET ROTATION SOUND
    // ═══════════════════════════════════════════════════════════════════════
    
    startTurretRotation(speed: number = 1.0) {
        if (!this.audioContext || !this.masterGain || this.turretRotationActive) return;
        this.resume();
        
        // Механический звук поворота башни
        this.turretRotationOscillator = this.audioContext.createOscillator();
        this.turretRotationOscillator.type = 'sawtooth';
        this.turretRotationOscillator.frequency.value = 80 + speed * 40;
        
        this.turretRotationGain = this.audioContext.createGain();
        this.turretRotationGain.gain.value = this.movementVolume * 0.3 * speed;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 1;
        
        this.turretRotationOscillator.connect(filter);
        filter.connect(this.turretRotationGain);
        this.turretRotationGain.connect(this.masterGain);
        
        this.turretRotationOscillator.start();
        this.turretRotationActive = true;
    }
    
    updateTurretRotation(speed: number) {
        if (!this.turretRotationOscillator || !this.turretRotationGain) {
            if (Math.abs(speed) > 0.1) {
                this.startTurretRotation(Math.abs(speed));
            }
            return;
        }
        
        if (Math.abs(speed) < 0.05) {
            this.stopTurretRotation();
            return;
        }
        
        const targetFreq = 80 + Math.abs(speed) * 40;
        const currentFreq = this.turretRotationOscillator.frequency.value;
        this.turretRotationOscillator.frequency.value = currentFreq + (targetFreq - currentFreq) * 0.2;
        
        const targetGain = this.movementVolume * 0.3 * Math.abs(speed);
        const currentGain = this.turretRotationGain.gain.value;
        this.turretRotationGain.gain.value = currentGain + (targetGain - currentGain) * 0.2;
    }
    
    stopTurretRotation() {
        if (this.turretRotationOscillator) {
            this.turretRotationOscillator.stop();
            this.turretRotationOscillator.disconnect();
            this.turretRotationOscillator = null;
        }
        if (this.turretRotationGain) {
            this.turretRotationGain.disconnect();
            this.turretRotationGain = null;
        }
        this.turretRotationActive = false;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════════════
    
    private createNoiseBuffer(duration: number): AudioBuffer {
        const sampleRate = this.audioContext!.sampleRate;
        const bufferSize = sampleRate * duration;
        const buffer = this.audioContext!.createBuffer(1, bufferSize, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        return buffer;
    }
    
    setMasterVolume(volume: number) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterVolume;
        }
    }
    
    dispose() {
        this.stopEngine();
        this.stopAmbient();
        this.stopTurretRotation();
        
        // Очищаем реверберацию
        this.reverbDelays.forEach(delay => delay.disconnect());
        this.reverbGains.forEach(gain => gain.disconnect());
        this.reverbFilters.forEach(filter => filter.disconnect());
        this.reverbDelays = [];
        this.reverbGains = [];
        this.reverbFilters = [];
        
        if (this.reverbGain) {
            this.reverbGain.disconnect();
            this.reverbGain = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Helper for exponential decay
declare global {
    interface AudioParam {
        exponentialDecayTo(value: number, endTime: number): AudioParam;
    }
}

AudioParam.prototype.exponentialDecayTo = function(value: number, endTime: number) {
    this.exponentialRampToValueAtTime(Math.max(0.0001, value), endTime);
    return this;
};



