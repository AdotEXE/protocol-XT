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
import { generateSound, varyParams } from "./jsfxr";
import { getShootPattern } from "./soundPatterns";

export class SoundManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private listener: AudioListener | null = null;

    // Engine sound nodes
    private engineOscillator: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;
    private engineFilter: BiquadFilterNode | null = null;
    private engineRunning = false;
    private enginePanner: PannerNode | null = null;

    // Enhanced Reverb (multi-tap delay for realistic reverb)
    private reverbGain: GainNode | null = null;
    private reverbDelays: DelayNode[] = [];
    private reverbGains: GainNode[] = [];
    private reverbFilters: BiquadFilterNode[] = [];

    // Volume settings - сбалансированные уровни громкости
    public masterVolume = 0.9; // Чуть ниже 1.0, чтобы избежать клиппинга
    public engineVolume = 0.7; // Менее агрессивный двигатель по умолчанию
    public shootVolume = 1.5; // УВЕЛИЧЕНО: Звуки выстрелов должны быть хорошо слышны
    public explosionVolume = 0.8;
    public hitVolume = 1.2; // УВЕЛИЧЕНО: Звуки попаданий должны быть хорошо слышны
    public reloadVolume = 0.5;
    public movementVolume = 0.35;
    public pickupVolume = 0.6;
    public uiVolume = 0.5;
    public ambientVolume = 0.25;

    // 3D Audio settings
    private use3DAudio = true;
    private maxDistance = 200; // Максимальная дистанция слышимости
    private dopplerFactor = 1.0; // Эффект допплера

    // Movement sound tracking
    private lastMovementSoundTime = 0;
    private movementSoundInterval = 220; // ms between movement sounds (чуть реже для меньшего спама)

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
        this.setupUserInteractionResume();
        // ОТКЛЮЧЕНО: startAmbient() - фоновый звук
        // this.startAmbient();
    }

    /**
     * Настройка автоматического возобновления AudioContext при первом взаимодействии пользователя.
     * Браузеры блокируют автозапуск звуков до взаимодействия пользователя (click, keydown, touch).
     */
    private setupUserInteractionResume() {
        const resumeOnInteraction = () => {
            if (this.audioContext?.state === 'suspended') {
                this.audioContext.resume().catch(() => {
                    // Silent fail
                });
            }
        };

        // Подключаем к разным типам взаимодействий для максимальной совместимости
        document.addEventListener('click', resumeOnInteraction, { once: true });
        document.addEventListener('keydown', resumeOnInteraction, { once: true });
        document.addEventListener('touchstart', resumeOnInteraction, { once: true });
        document.addEventListener('mousedown', resumeOnInteraction, { once: true });
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
                const time = reverbTimes[i] ?? 0.05;
                const gainVal = reverbGains[i] ?? 0.2;

                const delay = this.audioContext.createDelay(0.5);
                delay.delayTime.value = time;

                const gain = this.audioContext.createGain();
                gain.gain.value = gainVal * 0.2; // Общая громкость реверберации

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
        } catch (e) {
            // Silent fail
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
            panner.refDistance = 5; // УВЕЛИЧЕНО: Звуки слышны лучше на расстоянии
            panner.maxDistance = this.maxDistance;
            panner.rolloffFactor = 0.8; // УМЕНЬШЕНО: Медленнее затухание для лучшей слышимости

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
                // Ограничиваем эффект допплера через скорость, но используем только для клампа
                const clampedSpeed = Math.min(speed * this.dopplerFactor, 50);
                void clampedSpeed;
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
    // INTRO & UI SOUNDS
    // ═══════════════════════════════════════════════════════════════════════

    // Game opening sound (when menu first appears)
    playIntroSound() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();

        // Cinematic intro: rising synth with bass drop
        const now = this.audioContext.currentTime;

        // Bass drop
        const bassOsc = this.audioContext.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(80, now);
        bassOsc.frequency.exponentialRampToValueAtTime(40, now + 0.5);

        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(0, now);
        bassGain.gain.linearRampToValueAtTime(0.5 * this.uiVolume, now + 0.1);
        bassGain.gain.linearRampToValueAtTime(0.3 * this.uiVolume, now + 0.5);
        bassGain.gain.linearRampToValueAtTime(0, now + 1.5);

        // Rising synth
        const synthOsc = this.audioContext.createOscillator();
        synthOsc.type = 'sawtooth';
        synthOsc.frequency.setValueAtTime(100, now);
        synthOsc.frequency.exponentialRampToValueAtTime(400, now + 0.8);
        synthOsc.frequency.exponentialRampToValueAtTime(200, now + 1.2);

        const synthGain = this.audioContext.createGain();
        synthGain.gain.setValueAtTime(0, now);
        synthGain.gain.linearRampToValueAtTime(0.15 * this.uiVolume, now + 0.3);
        synthGain.gain.linearRampToValueAtTime(0.2 * this.uiVolume, now + 0.8);
        synthGain.gain.linearRampToValueAtTime(0, now + 1.5);

        // Filter sweep
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(2000, now + 0.8);
        filter.frequency.exponentialRampToValueAtTime(500, now + 1.5);
        filter.Q.value = 3;

        // High-pitched beep (like a system boot)
        const beepOsc = this.audioContext.createOscillator();
        beepOsc.type = 'square';
        beepOsc.frequency.value = 880;

        const beepGain = this.audioContext.createGain();
        beepGain.gain.setValueAtTime(0, now + 0.5);
        beepGain.gain.linearRampToValueAtTime(0.1 * this.uiVolume, now + 0.52);
        beepGain.gain.linearRampToValueAtTime(0, now + 0.6);
        beepGain.gain.linearRampToValueAtTime(0.1 * this.uiVolume, now + 0.7);
        beepGain.gain.linearRampToValueAtTime(0, now + 0.8);

        // Connect
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);

        synthOsc.connect(filter);
        filter.connect(synthGain);
        synthGain.connect(this.masterGain);

        beepOsc.connect(beepGain);
        beepGain.connect(this.masterGain);

        // Start and stop
        bassOsc.start(now);
        bassOsc.stop(now + 1.5);
        synthOsc.start(now);
        synthOsc.stop(now + 1.5);
        beepOsc.start(now + 0.5);
        beepOsc.stop(now + 0.8);
    }

    // Tank engine starting sound (when clicking play) - Realistic diesel engine
    playEngineStartSound() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();

        const now = this.audioContext.currentTime;
        const duration = 3.5; // Дизель запускается медленнее

        // Стартер дизельного мотора - медленный, тяжелый звук прокрутки
        const starterOsc = this.audioContext.createOscillator();
        starterOsc.type = 'sawtooth';
        starterOsc.frequency.setValueAtTime(80, now);
        starterOsc.frequency.linearRampToValueAtTime(120, now + 0.3);
        starterOsc.frequency.linearRampToValueAtTime(100, now + 0.6);
        starterOsc.frequency.linearRampToValueAtTime(85, now + 0.9);
        starterOsc.frequency.linearRampToValueAtTime(70, now + 1.2);
        starterOsc.frequency.linearRampToValueAtTime(50, now + 1.5);

        const starterGain = this.audioContext.createGain();
        starterGain.gain.setValueAtTime(0.35 * this.engineVolume, now);
        starterGain.gain.linearRampToValueAtTime(0.4 * this.engineVolume, now + 0.5);
        starterGain.gain.linearRampToValueAtTime(0.3 * this.engineVolume, now + 1.0);
        starterGain.gain.linearRampToValueAtTime(0.2 * this.engineVolume, now + 1.3);
        starterGain.gain.linearRampToValueAtTime(0, now + 1.6);

        // Прокрутка коленвала - медленная, тяжелая (характерно для дизеля)
        const crankOsc1 = this.audioContext.createOscillator();
        crankOsc1.type = 'sawtooth';
        crankOsc1.frequency.setValueAtTime(8, now + 0.2);
        crankOsc1.frequency.linearRampToValueAtTime(12, now + 0.8);
        crankOsc1.frequency.linearRampToValueAtTime(16, now + 1.4);
        crankOsc1.frequency.linearRampToValueAtTime(20, now + 2.0);
        crankOsc1.frequency.linearRampToValueAtTime(24, now + 2.6);
        crankOsc1.frequency.linearRampToValueAtTime(28, now + 3.2);

        const crankOsc2 = this.audioContext.createOscillator();
        crankOsc2.type = 'sawtooth';
        crankOsc2.frequency.setValueAtTime(16, now + 0.2);
        crankOsc2.frequency.linearRampToValueAtTime(24, now + 0.8);
        crankOsc2.frequency.linearRampToValueAtTime(32, now + 1.4);
        crankOsc2.frequency.linearRampToValueAtTime(40, now + 2.0);
        crankOsc2.frequency.linearRampToValueAtTime(48, now + 2.6);
        crankOsc2.frequency.linearRampToValueAtTime(56, now + 3.2);

        // Имитация компрессии - пульсирующие "хлопки" при сжатии
        const compressionOsc = this.audioContext.createOscillator();
        compressionOsc.type = 'square';
        compressionOsc.frequency.setValueAtTime(4, now + 0.5); // 4 цилиндра
        compressionOsc.frequency.linearRampToValueAtTime(5, now + 1.5);
        compressionOsc.frequency.linearRampToValueAtTime(6, now + 2.5);
        compressionOsc.frequency.linearRampToValueAtTime(7, now + 3.2);

        const compressionGain = this.audioContext.createGain();
        compressionGain.gain.setValueAtTime(0, now + 0.5);
        compressionGain.gain.linearRampToValueAtTime(0.25 * this.engineVolume, now + 1.0);
        compressionGain.gain.linearRampToValueAtTime(0.3 * this.engineVolume, now + 1.8);
        compressionGain.gain.linearRampToValueAtTime(0.25 * this.engineVolume, now + 2.5);
        compressionGain.gain.linearRampToValueAtTime(0.15 * this.engineVolume, now + duration);

        // Глубокий бас дизельного мотора
        const dieselBass1 = this.audioContext.createOscillator();
        dieselBass1.type = 'sine';
        dieselBass1.frequency.value = 12; // Очень низкая частота

        const dieselBass2 = this.audioContext.createOscillator();
        dieselBass2.type = 'sine';
        dieselBass2.frequency.value = 24;

        const dieselBass3 = this.audioContext.createOscillator();
        dieselBass3.type = 'sine';
        dieselBass3.frequency.value = 36;

        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(0, now + 0.3);
        bassGain.gain.linearRampToValueAtTime(0.3 * this.engineVolume, now + 1.0);
        bassGain.gain.linearRampToValueAtTime(0.5 * this.engineVolume, now + 1.8);
        bassGain.gain.linearRampToValueAtTime(0.6 * this.engineVolume, now + 2.5);
        bassGain.gain.linearRampToValueAtTime(0.5 * this.engineVolume, now + duration);

        // Средние частоты - характерный "рычащий" тембр дизеля
        const midOsc1 = this.audioContext.createOscillator();
        midOsc1.type = 'sawtooth';
        midOsc1.frequency.setValueAtTime(60, now + 0.8);
        midOsc1.frequency.linearRampToValueAtTime(75, now + 1.5);
        midOsc1.frequency.linearRampToValueAtTime(90, now + 2.2);
        midOsc1.frequency.linearRampToValueAtTime(105, now + 3.0);

        const midOsc2 = this.audioContext.createOscillator();
        midOsc2.type = 'triangle';
        midOsc2.frequency.setValueAtTime(120, now + 0.8);
        midOsc2.frequency.linearRampToValueAtTime(150, now + 1.5);
        midOsc2.frequency.linearRampToValueAtTime(180, now + 2.2);
        midOsc2.frequency.linearRampToValueAtTime(210, now + 3.0);

        const midGain = this.audioContext.createGain();
        midGain.gain.setValueAtTime(0, now + 0.8);
        midGain.gain.linearRampToValueAtTime(0.2 * this.engineVolume, now + 1.3);
        midGain.gain.linearRampToValueAtTime(0.35 * this.engineVolume, now + 2.0);
        midGain.gain.linearRampToValueAtTime(0.4 * this.engineVolume, now + 2.8);
        midGain.gain.linearRampToValueAtTime(0.35 * this.engineVolume, now + duration);

        // Основной гейн для двигателя
        const engineGain = this.audioContext.createGain();
        engineGain.gain.setValueAtTime(0, now + 0.2);
        engineGain.gain.linearRampToValueAtTime(0.1 * this.engineVolume, now + 1.0);
        engineGain.gain.linearRampToValueAtTime(0.25 * this.engineVolume, now + 1.8);
        engineGain.gain.linearRampToValueAtTime(0.45 * this.engineVolume, now + 2.5);
        engineGain.gain.linearRampToValueAtTime(0.5 * this.engineVolume, now + 3.0);
        engineGain.gain.linearRampToValueAtTime(0.42 * this.engineVolume, now + duration);

        // Низкочастотный фильтр - дизель звучит более приглушенно
        const lowPass = this.audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.setValueAtTime(80, now);
        lowPass.frequency.linearRampToValueAtTime(120, now + 1.5);
        lowPass.frequency.linearRampToValueAtTime(200, now + 2.5);
        lowPass.frequency.linearRampToValueAtTime(350, now + duration);
        lowPass.Q.value = 1.5;

        // Высокочастотный фильтр - убираем экстремально низкие частоты
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 10;
        highPass.Q.value = 0.7;

        // Компрессор для реалистичного звука
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.2;
        compressor.knee.value = 8;

        // Подключение стартера
        starterOsc.connect(starterGain);
        starterGain.connect(this.masterGain);

        // Подключение компрессии (отдельно для эффекта)
        compressionOsc.connect(compressionGain);
        compressionGain.connect(lowPass);

        // Подключение всех компонентов двигателя
        crankOsc1.connect(lowPass);
        crankOsc2.connect(lowPass);
        dieselBass1.connect(bassGain);
        dieselBass2.connect(bassGain);
        dieselBass3.connect(bassGain);
        bassGain.connect(lowPass);
        midOsc1.connect(midGain);
        midOsc2.connect(midGain);
        midGain.connect(lowPass);

        lowPass.connect(highPass);
        highPass.connect(compressor);
        compressor.connect(engineGain);
        engineGain.connect(this.masterGain);

        // Запуск всех осцилляторов
        starterOsc.start(now);
        starterOsc.stop(now + 1.6);
        crankOsc1.start(now + 0.2);
        crankOsc1.stop(now + duration);
        crankOsc2.start(now + 0.2);
        crankOsc2.stop(now + duration);
        compressionOsc.start(now + 0.5);
        compressionOsc.stop(now + duration);
        dieselBass1.start(now + 0.3);
        dieselBass1.stop(now + duration);
        dieselBass2.start(now + 0.3);
        dieselBass2.stop(now + duration);
        dieselBass3.start(now + 0.3);
        dieselBass3.stop(now + duration);
        midOsc1.start(now + 0.8);
        midOsc1.stop(now + duration);
        midOsc2.start(now + 0.8);
        midOsc2.stop(now + duration);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENHANCED ENGINE SOUND
    // ═══════════════════════════════════════════════════════════════════════

    startEngine() {
        if (!this.audioContext || !this.masterGain) {
            return;
        }
        if (this.engineRunning) {
            return;
        }

        this.resume();

        // Убеждаемся, что аудио контекст активен
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {
                // Silent fail
            });
        }

        // Очищаем старые осцилляторы
        // (diesel* массивы больше не используются напрямую, оставлены для обратной совместимости)

        // Основной басовый осциллятор (низкие частоты дизеля - 12-30 Гц)
        const bassOsc1 = this.audioContext.createOscillator();
        bassOsc1.type = 'sine';
        bassOsc1.frequency.value = 18;

        const bassOsc2 = this.audioContext.createOscillator();
        bassOsc2.type = 'sine';
        bassOsc2.frequency.value = 24;

        // Основной "рычащий" осциллятор (характерный звук дизеля - 30-60 Гц)
        this.engineOscillator = this.audioContext.createOscillator();
        this.engineOscillator.type = 'sawtooth';
        this.engineOscillator.frequency.value = 28;

        // Средние частоты (60-120 Гц) - гармоники дизеля
        const midOsc1 = this.audioContext.createOscillator();
        midOsc1.type = 'sawtooth';
        midOsc1.frequency.value = 56;

        const midOsc2 = this.audioContext.createOscillator();
        midOsc2.type = 'triangle';
        midOsc2.frequency.value = 84;

        // Высокие гармоники (120-250 Гц) - для реалистичности
        const highOsc = this.audioContext.createOscillator();
        highOsc.type = 'square';
        highOsc.frequency.value = 140;

        // Компрессионные "хлопки" (имитация работы цилиндров)
        const compressionOsc = this.audioContext.createOscillator();
        compressionOsc.type = 'square';
        compressionOsc.frequency.value = 7; // ~7 Гц для 4-цилиндрового дизеля

        // Gain узлы для каждого осциллятора (для индивидуального контроля)
        // МАКСИМАЛЬНАЯ базовая громкость для БРУТАЛЬНОГО звука
        const bassGain1 = this.audioContext.createGain();
        bassGain1.gain.value = 1.2 * this.engineVolume; // МАКСИМАЛЬНЫЙ бас для брутальности

        const bassGain2 = this.audioContext.createGain();
        bassGain2.gain.value = 1.1 * this.engineVolume; // МАКСИМАЛЬНЫЙ второй бас

        const mainGain = this.audioContext.createGain();
        mainGain.gain.value = 1.3 * this.engineVolume; // МАКСИМАЛЬНЫЙ основной "рычащий" звук

        const midGain1 = this.audioContext.createGain();
        midGain1.gain.value = 1.0 * this.engineVolume; // Усиленные средние частоты

        const midGain2 = this.audioContext.createGain();
        midGain2.gain.value = 0.95 * this.engineVolume; // Усиленные вторые средние

        const highGain = this.audioContext.createGain();
        highGain.gain.value = 0.8 * this.engineVolume; // Усиленные высокие гармоники

        const compressionGain = this.audioContext.createGain();
        compressionGain.gain.value = 0.7 * this.engineVolume; // МАКСИМАЛЬНАЯ компрессия для брутальности

        // Основной gain для общего контроля
        this.engineGain = this.audioContext.createGain();
        this.engineGain.gain.value = this.engineVolume;

        // Low-pass фильтр - более яркий звук для брутальности
        this.engineFilter = this.audioContext.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 400; // Увеличена для более яркого и брутального звука
        this.engineFilter.Q.value = 1.5; // Увеличен Q для более резкого звука

        // High-pass фильтр - убираем только экстремально низкие частоты (снижена частота среза для лучшей слышимости баса)
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 8; // Снижено с 10 до 8 для лучшей слышимости баса
        highPass.Q.value = 0.5; // Снижен Q для более плавного среза

        // Компрессор для БРУТАЛЬНОГО дизельного звука
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20; // Более высокий порог для большей громкости
        compressor.knee.value = 8; // Увеличен knee для более агрессивного звука
        compressor.ratio.value = 6; // Снижен ratio для более мощного звука
        compressor.attack.value = 0.005; // Более быстрая атака для резкости
        compressor.release.value = 0.25; // Более быстрое освобождение

        // 3D позиционирование
        this.enginePanner = this.createPanner();

        // Подключаем все осцилляторы
        bassOsc1.connect(bassGain1);
        bassOsc2.connect(bassGain2);
        this.engineOscillator.connect(mainGain);
        midOsc1.connect(midGain1);
        midOsc2.connect(midGain2);
        highOsc.connect(highGain);
        compressionOsc.connect(compressionGain);

        // Объединяем все в фильтр
        bassGain1.connect(this.engineFilter);
        bassGain2.connect(this.engineFilter);
        mainGain.connect(this.engineFilter);
        midGain1.connect(this.engineFilter);
        midGain2.connect(this.engineFilter);
        highGain.connect(this.engineFilter);
        compressionGain.connect(this.engineFilter);

        this.engineFilter.connect(highPass);
        highPass.connect(compressor);
        compressor.connect(this.engineGain);

        if (this.enginePanner) {
            this.engineGain.connect(this.enginePanner);
            this.enginePanner.connect(this.masterGain);
        } else {
            this.engineGain.connect(this.masterGain);
        }

        // Добавляем реверберацию
        this.connectToReverb(this.engineGain, 0.12);

        // Запускаем все осцилляторы
        bassOsc1.start();
        bassOsc2.start();
        this.engineOscillator.start();
        midOsc1.start();
        midOsc2.start();
        highOsc.start();
        compressionOsc.start();

        this.engineRunning = true;

        // Сохраняем все осцилляторы и gain узлы для обновления
        (this.engineOscillator as any)._bassOsc1 = bassOsc1;
        (this.engineOscillator as any)._bassOsc2 = bassOsc2;
        (this.engineOscillator as any)._midOsc1 = midOsc1;
        (this.engineOscillator as any)._midOsc2 = midOsc2;
        (this.engineOscillator as any)._highOsc = highOsc;
        (this.engineOscillator as any)._compressionOsc = compressionOsc;
        (this.engineOscillator as any)._bassGain1 = bassGain1;
        (this.engineOscillator as any)._bassGain2 = bassGain2;
        (this.engineOscillator as any)._mainGain = mainGain;
        (this.engineOscillator as any)._midGain1 = midGain1;
        (this.engineOscillator as any)._midGain2 = midGain2;
        (this.engineOscillator as any)._highGain = highGain;
        (this.engineOscillator as any)._compressionGain = compressionGain;
    }

    stopEngine() {
        if (this.engineOscillator) {
            // Останавливаем все осцилляторы дизеля
            const bassOsc1 = (this.engineOscillator as any)._bassOsc1;
            const bassOsc2 = (this.engineOscillator as any)._bassOsc2;
            const midOsc1 = (this.engineOscillator as any)._midOsc1;
            const midOsc2 = (this.engineOscillator as any)._midOsc2;
            const highOsc = (this.engineOscillator as any)._highOsc;
            const compressionOsc = (this.engineOscillator as any)._compressionOsc;

            this.engineOscillator.stop();
            this.engineOscillator.disconnect();

            if (bassOsc1) { bassOsc1.stop(); bassOsc1.disconnect(); }
            if (bassOsc2) { bassOsc2.stop(); bassOsc2.disconnect(); }
            if (midOsc1) { midOsc1.stop(); midOsc1.disconnect(); }
            if (midOsc2) { midOsc2.stop(); midOsc2.disconnect(); }
            if (highOsc) { highOsc.stop(); highOsc.disconnect(); }
            if (compressionOsc) { compressionOsc.stop(); compressionOsc.disconnect(); }

            // Отключаем gain узлы
            const bassGain1 = (this.engineOscillator as any)._bassGain1;
            const bassGain2 = (this.engineOscillator as any)._bassGain2;
            const mainGain = (this.engineOscillator as any)._mainGain;
            const midGain1 = (this.engineOscillator as any)._midGain1;
            const midGain2 = (this.engineOscillator as any)._midGain2;
            const highGain = (this.engineOscillator as any)._highGain;
            const compressionGain = (this.engineOscillator as any)._compressionGain;

            if (bassGain1) bassGain1.disconnect();
            if (bassGain2) bassGain2.disconnect();
            if (mainGain) mainGain.disconnect();
            if (midGain1) midGain1.disconnect();
            if (midGain2) midGain2.disconnect();
            if (highGain) highGain.disconnect();
            if (compressionGain) compressionGain.disconnect();

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

    // Enhanced engine sound with speed zones
    private _engineSpeedZone: 'idle' | 'low' | 'medium' | 'high' | 'max' = 'idle';
    private engineRumblePhase = 0;

    updateEngine(speedRatio: number, throttle: number, position?: Vector3, velocity?: Vector3) {
        if (!this.engineOscillator || !this.engineGain || !this.engineFilter) {
            // Если двигатель не запущен, но должен работать - запускаем его автоматически
            if (!this.engineRunning && this.audioContext && this.masterGain) {
                // Автоматический запуск двигателя при первом вызове updateEngine
                this.startEngine();
            }
            return;
        }

        speedRatio = Math.abs(speedRatio);
        // Clamp speedRatio to prevent extreme values that cause filter frequency to exceed valid range
        speedRatio = Math.min(speedRatio, 2.0);
        throttle = Math.abs(throttle);

        // Определяем зону скорости для реалистичного дизельного звука
        let newZone: 'idle' | 'low' | 'medium' | 'high' | 'max' = 'idle';
        if (speedRatio < 0.05) newZone = 'idle';
        else if (speedRatio < 0.25) newZone = 'low';
        else if (speedRatio < 0.5) newZone = 'medium';
        else if (speedRatio < 0.8) newZone = 'high';
        else newZone = 'max';

        // Параметры для разных зон скорости дизельного мотора
        let baseFreq = 28; // Основная частота "рычания" дизеля
        let bassFreq1 = 18; // Глубокий бас
        let bassFreq2 = 24; // Второй бас
        let midFreq1 = 56; // Средние частоты
        let midFreq2 = 84; // Вторые средние
        let highFreq = 140; // Высокие гармоники
        let compressionFreq = 7; // Частота компрессии (цилиндры)
        let volumeMultiplier = 1.0;
        let filterBase = 180;
        let rumbleIntensity = 0;

        switch (newZone) {
            case 'idle':
                // Холостой ход - глубокий бас, заметное урчание, но без излишней громкости
                baseFreq = 28 + Math.sin(Date.now() * 0.002) * 3; // Более агрессивная вибрация
                bassFreq1 = 18; // Более глубокий бас
                bassFreq2 = 24; // Более мощный второй бас
                midFreq1 = 55; // Более выраженные средние
                midFreq2 = 85; // Более выраженные вторые средние
                highFreq = 140; // Более яркие высокие
                compressionFreq = 6.0;
                volumeMultiplier = 0.9;
                filterBase = 320;
                rumbleIntensity = 0.4;
                break;
            case 'low':
                // Низкие обороты - выразительное «рычание», но без перегруза
                baseFreq = 38; // Более агрессивная частота
                bassFreq1 = 24; // Более глубокий бас
                bassFreq2 = 32; // Более мощный второй бас
                midFreq1 = 75; // Более выраженные средние
                midFreq2 = 110; // Более выраженные вторые средние
                highFreq = 170; // Более яркие высокие
                compressionFreq = 7.5;
                volumeMultiplier = 0.85;
                filterBase = 280;
                rumbleIntensity = 0.4;
                break;
            case 'medium':
                // Средние обороты - насыщенный дизельный рёв
                baseFreq = 52; // Более агрессивная частота
                bassFreq1 = 35; // Более глубокий бас
                bassFreq2 = 45; // Более мощный второй бас
                midFreq1 = 105; // Более выраженные средние
                midFreq2 = 155; // Более выраженные вторые средние
                highFreq = 210; // Более яркие высокие
                compressionFreq = 9.5;
                volumeMultiplier = 1.0;
                filterBase = 420;
                rumbleIntensity = 0.5;
                break;
            case 'high':
                // Высокие обороты - мощный рёв без чрезмерной яркости
                baseFreq = 75; // Более агрессивная частота
                bassFreq1 = 45; // Более глубокий бас
                bassFreq2 = 60; // Более мощный второй бас
                midFreq1 = 150; // Более выраженные средние
                midFreq2 = 225; // Более выраженные вторые средние
                highFreq = 280; // Более яркие высокие
                compressionFreq = 12;
                volumeMultiplier = 1.05;
                filterBase = 560;
                rumbleIntensity = 0.35;
                break;
            case 'max':
                // Максимальные обороты - максимально агрессивный звук, но в разумных пределах громкости
                baseFreq = 95; // Более агрессивная частота
                bassFreq1 = 58; // Более глубокий бас
                bassFreq2 = 78; // Более мощный второй бас
                midFreq1 = 190; // Более выраженные средние
                midFreq2 = 285; // Более выраженные вторые средние
                highFreq = 350; // Более яркие высокие
                compressionFreq = 14;
                volumeMultiplier = 1.1;
                filterBase = 650;
                rumbleIntensity = 0.35;
                break;
        }

        // Добавляем плавную модуляцию для реалистичности
        this.engineRumblePhase += 0.015 + speedRatio * 0.04;
        const rumble = Math.sin(this.engineRumblePhase) * rumbleIntensity;
        const rumble2 = Math.sin(this.engineRumblePhase * 1.7) * rumbleIntensity * 0.6;

        // Плавное изменение частот
        const smoothFactor = 0.1; // Плавность переходов

        // Основной "рычащий" осциллятор
        const currentMainFreq = this.engineOscillator.frequency.value;
        const targetMainFreq = baseFreq + speedRatio * 25 + rumble * 3;
        this.engineOscillator.frequency.value = currentMainFreq + (targetMainFreq - currentMainFreq) * smoothFactor;

        // Бас осцилляторы
        const bassOsc1 = (this.engineOscillator as any)._bassOsc1;
        const bassOsc2 = (this.engineOscillator as any)._bassOsc2;

        if (bassOsc1) {
            const currentBass1 = bassOsc1.frequency.value;
            const targetBass1 = bassFreq1 + rumble * 2;
            bassOsc1.frequency.value = currentBass1 + (targetBass1 - currentBass1) * smoothFactor;
        }
        if (bassOsc2) {
            const currentBass2 = bassOsc2.frequency.value;
            const targetBass2 = bassFreq2 + rumble * 2.5;
            bassOsc2.frequency.value = currentBass2 + (targetBass2 - currentBass2) * smoothFactor;
        }

        // Средние частоты
        const midOsc1 = (this.engineOscillator as any)._midOsc1;
        const midOsc2 = (this.engineOscillator as any)._midOsc2;

        if (midOsc1) {
            const currentMid1 = midOsc1.frequency.value;
            const targetMid1 = midFreq1 + rumble2 * 5;
            midOsc1.frequency.value = currentMid1 + (targetMid1 - currentMid1) * smoothFactor;
        }
        if (midOsc2) {
            const currentMid2 = midOsc2.frequency.value;
            const targetMid2 = midFreq2 + rumble2 * 7;
            midOsc2.frequency.value = currentMid2 + (targetMid2 - currentMid2) * smoothFactor;
        }

        // Высокие гармоники
        const highOsc = (this.engineOscillator as any)._highOsc;
        if (highOsc) {
            const currentHigh = highOsc.frequency.value;
            const targetHigh = highFreq + rumble2 * 10;
            highOsc.frequency.value = currentHigh + (targetHigh - currentHigh) * smoothFactor;
        }

        // Компрессионные "хлопки"
        const compressionOsc = (this.engineOscillator as any)._compressionOsc;
        if (compressionOsc) {
            const currentComp = compressionOsc.frequency.value;
            const targetComp = compressionFreq + speedRatio * 2;
            compressionOsc.frequency.value = currentComp + (targetComp - currentComp) * smoothFactor;
        }

        // Обновляем громкость отдельных компонентов для реалистичности
        const bassGain1 = (this.engineOscillator as any)._bassGain1;
        const bassGain2 = (this.engineOscillator as any)._bassGain2;
        const mainGain = (this.engineOscillator as any)._mainGain;
        const midGain1 = (this.engineOscillator as any)._midGain1;
        const midGain2 = (this.engineOscillator as any)._midGain2;
        const highGain = (this.engineOscillator as any)._highGain;
        const compressionGain = (this.engineOscillator as any)._compressionGain;

        // Бас сильнее на низких оборотах
        if (bassGain1) {
            const bassVol1 = newZone === 'idle' || newZone === 'low' ? 0.6 : 0.4;
            bassGain1.gain.value = bassVol1 * this.engineVolume;
        }
        if (bassGain2) {
            const bassVol2 = newZone === 'idle' || newZone === 'low' ? 0.5 : 0.35;
            bassGain2.gain.value = bassVol2 * this.engineVolume;
        }

        // Основной звук
        if (mainGain) {
            mainGain.gain.value = (0.5 + speedRatio * 0.3) * this.engineVolume;
        }

        // Средние частоты сильнее на средних и высоких оборотах
        if (midGain1) {
            const midVol1 = newZone === 'medium' || newZone === 'high' ? 0.45 : 0.3;
            midGain1.gain.value = midVol1 * this.engineVolume;
        }
        if (midGain2) {
            const midVol2 = newZone === 'medium' || newZone === 'high' ? 0.4 : 0.25;
            midGain2.gain.value = midVol2 * this.engineVolume;
        }

        // Высокие гармоники сильнее на высоких оборотах
        if (highGain) {
            const highVol = newZone === 'high' || newZone === 'max' ? 0.3 : 0.15;
            highGain.gain.value = highVol * this.engineVolume;
        }

        // Компрессия более заметна на средних оборотах
        if (compressionGain) {
            const compVol = newZone === 'medium' ? 0.2 : 0.12;
            compressionGain.gain.value = compVol * this.engineVolume;
        }

        // Динамический фильтр - дизель звучит приглушенно
        // Clamp target frequency to valid range
        const targetFilterFreq = Math.max(0, Math.min(24000, filterBase + speedRatio * 300));
        // Clamp current frequency to valid range in case it was set incorrectly before
        const currentFilterFreq = Math.max(0, Math.min(24000, this.engineFilter.frequency.value));
        const filterDiff = targetFilterFreq - currentFilterFreq;
        // Clamp final frequency to valid range [0, 24000] to prevent Web Audio API warnings
        const newFilterFreq = Math.max(0, Math.min(24000, currentFilterFreq + filterDiff * 0.12));
        this.engineFilter.frequency.value = newFilterFreq;

        // Q-фактор фильтра
        this.engineFilter.Q.value = 1.0 + speedRatio * 0.8;

        // Общий объём с учётом зоны и газа
        const baseVolume = newZone === 'idle' ? 0.9 : 0.85;
        const targetVolume = this.engineVolume * volumeMultiplier * (baseVolume + throttle * 0.2 + speedRatio * 0.2);
        const currentVolume = this.engineGain.gain.value;
        const volumeDiff = targetVolume - currentVolume;
        // Ограничиваем максимальную громкость двигателя, чтобы избежать клиппинга и усталости
        this.engineGain.gain.value = Math.min(currentVolume + volumeDiff * 0.12, this.engineVolume * 1.4);

        this._engineSpeedZone = newZone;

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
            } catch (e) { }
        }

        // Текущая скорость двигателя может использоваться в будущем для дополнительной визуализации/эффектов
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENHANCED SHOOTING SOUND (JSFXR-based)
    // ═══════════════════════════════════════════════════════════════════════

    playShoot(cannonType: string = "standard", position?: Vector3, velocity?: Vector3) {
        if (!this.audioContext || !this.masterGain) {
            return;
        }
        this.resume();

        const now = this.audioContext.currentTime;

        // Получаем паттерн для данного типа пушки
        const pattern = getShootPattern(cannonType);

        // Применяем случайные вариации для уникальности каждого выстрела (±10%)
        const variedParams = varyParams(pattern, 0.1);

        // Генерируем AudioBuffer через jsfxr
        const audioBuffer = generateSound(this.audioContext, variedParams);

        // Создаём источник звука
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Управление громкостью
        const volumeGain = this.audioContext.createGain();
        const finalVolume = this.shootVolume * (pattern.volumeMultiplier || 1.0);
        volumeGain.gain.value = finalVolume;

        // 3D позиционирование с допплером
        const panner = position ? this.createPanner(position, velocity) : null;

        // Подключаем цепь обработки
        source.connect(volumeGain);

        if (panner) {
            volumeGain.connect(panner);
            panner.connect(this.masterGain);
        } else {
            volumeGain.connect(this.masterGain);
        }

        // Реверберация (используем значение из паттерна)
        const reverbAmount = pattern.reverbAmount || 0.2;
        if (reverbAmount > 0) {
            this.connectToReverb(volumeGain, reverbAmount);
        }

        // Воспроизведение
        source.start(now);
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

    // Special critical hit sound with extra punch
    playCriticalHitSpecial(position?: Vector3) {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // 1. High-pitched "ding" for crit
        const dingOsc = this.audioContext.createOscillator();
        dingOsc.type = 'sine';
        dingOsc.frequency.setValueAtTime(2000, now);
        dingOsc.frequency.exponentialRampToValueAtTime(1500, now + 0.1);

        const dingGain = this.audioContext.createGain();
        dingGain.gain.setValueAtTime(this.hitVolume * 0.8, now);
        dingGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        // 2. Low punch for impact
        const punchOsc = this.audioContext.createOscillator();
        punchOsc.type = 'square';
        punchOsc.frequency.setValueAtTime(150, now);
        punchOsc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

        const punchGain = this.audioContext.createGain();
        punchGain.gain.setValueAtTime(this.hitVolume * 1.2, now);
        punchGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        // 3. Metallic ring
        const ringOsc = this.audioContext.createOscillator();
        ringOsc.type = 'triangle';
        ringOsc.frequency.setValueAtTime(3000, now);
        ringOsc.frequency.exponentialRampToValueAtTime(2000, now + 0.4);

        const ringGain = this.audioContext.createGain();
        ringGain.gain.setValueAtTime(this.hitVolume * 0.4, now + 0.05);
        ringGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        // Connect with optional 3D
        const panner = position ? this.createPanner(position) : null;

        [dingGain, punchGain, ringGain].forEach(gain => {
            if (panner) {
                gain.connect(panner);
            } else {
                if (this.masterGain && gain) {
                    gain.connect(this.masterGain);
                }
            }
        });

        if (panner) {
            panner.connect(this.masterGain);
        }

        dingOsc.connect(dingGain);
        punchOsc.connect(punchGain);
        ringOsc.connect(ringGain);

        // Add reverb for epic feel
        this.connectToReverb(dingGain, 0.3);

        dingOsc.start(now);
        dingOsc.stop(now + 0.3);
        punchOsc.start(now);
        punchOsc.stop(now + 0.2);
        ringOsc.start(now);
        ringOsc.stop(now + 0.5);
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

    playPickup(_pickupType?: string) {
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

AudioParam.prototype.exponentialDecayTo = function (value: number, endTime: number) {
    this.exponentialRampToValueAtTime(Math.max(0.0001, value), endTime);
    return this;
};



