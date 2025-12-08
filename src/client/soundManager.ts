/**
 * Sound Manager - Procedural audio for tank game
 * Uses Web Audio API to generate sounds without external files
 */

export class SoundManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    
    // Engine sound nodes
    private engineOscillator: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;
    private engineRunning = false;
    private currentEngineSpeed = 0;
    
    // Volume settings
    public masterVolume = 0.5;
    public engineVolume = 0.3;
    public shootVolume = 0.6;
    public explosionVolume = 0.7;
    
    constructor() {
        this.initAudio();
    }
    
    private initAudio() {
        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.audioContext.destination);
            console.log("[SoundManager] Audio initialized");
        } catch (e) {
            console.warn("[SoundManager] Web Audio not supported:", e);
        }
    }
    
    // Resume audio context (required after user interaction)
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
    
    // === ENGINE SOUND ===
    
    startEngine() {
        if (!this.audioContext || !this.masterGain || this.engineRunning) return;
        
        this.resume();
        
        // Create oscillator for engine rumble
        this.engineOscillator = this.audioContext.createOscillator();
        this.engineOscillator.type = 'sawtooth';
        this.engineOscillator.frequency.value = 50; // Base frequency
        
        // Create gain for volume control
        this.engineGain = this.audioContext.createGain();
        this.engineGain.gain.value = this.engineVolume;
        
        // Create low-pass filter for more realistic engine sound
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 1;
        
        // Connect nodes
        this.engineOscillator.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);
        
        this.engineOscillator.start();
        this.engineRunning = true;
        
        console.log("[SoundManager] Engine started");
    }
    
    stopEngine() {
        if (this.engineOscillator) {
            this.engineOscillator.stop();
            this.engineOscillator.disconnect();
            this.engineOscillator = null;
        }
        if (this.engineGain) {
            this.engineGain.disconnect();
            this.engineGain = null;
        }
        this.engineRunning = false;
        console.log("[SoundManager] Engine stopped");
    }
    
    // Update engine sound based on speed (0-1)
    updateEngine(speedRatio: number, throttle: number) {
        if (!this.engineOscillator || !this.engineGain) return;
        
        // Clamp values
        speedRatio = Math.abs(speedRatio);
        throttle = Math.abs(throttle);
        
        // Frequency: 40Hz (idle) to 120Hz (full speed)
        const baseFreq = 40 + speedRatio * 80;
        this.engineOscillator.frequency.value = baseFreq;
        
        // Volume: louder when accelerating
        const volume = this.engineVolume * (0.5 + throttle * 0.5 + speedRatio * 0.3);
        this.engineGain.gain.value = Math.min(volume, this.engineVolume * 1.2);
    }
    
    // === SHOOTING SOUND ===
    
    playShoot() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Create noise for explosion
        const noiseBuffer = this.createNoiseBuffer(0.3);
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        // Envelope
        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(this.shootVolume, now);
        envelope.gain.exponentialDecayTo(0.01, now + 0.3);
        
        // Low-pass filter for boom
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialDecayTo(100, now + 0.2);
        
        // Bass boost with oscillator
        const bassOsc = this.audioContext.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(80, now);
        bassOsc.frequency.exponentialDecayTo(30, now + 0.15);
        
        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(this.shootVolume * 0.8, now);
        bassGain.gain.exponentialDecayTo(0.01, now + 0.15);
        
        // Connect
        noiseSource.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.masterGain);
        
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);
        
        // Play
        noiseSource.start(now);
        noiseSource.stop(now + 0.3);
        bassOsc.start(now);
        bassOsc.stop(now + 0.15);
        
        console.log("[SoundManager] Shoot sound played");
    }
    
    // === EXPLOSION SOUND ===
    
    playExplosion() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Noise burst
        const noiseBuffer = this.createNoiseBuffer(0.6);
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        // Envelope
        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(this.explosionVolume, now);
        envelope.gain.exponentialDecayTo(0.01, now + 0.5);
        
        // Low-pass filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, now);
        filter.frequency.exponentialDecayTo(50, now + 0.4);
        
        // Deep bass
        const bassOsc = this.audioContext.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(60, now);
        bassOsc.frequency.exponentialDecayTo(20, now + 0.3);
        
        const bassGain = this.audioContext.createGain();
        bassGain.gain.setValueAtTime(this.explosionVolume, now);
        bassGain.gain.exponentialDecayTo(0.01, now + 0.3);
        
        // Connect
        noiseSource.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.masterGain);
        
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);
        
        // Play
        noiseSource.start(now);
        noiseSource.stop(now + 0.6);
        bassOsc.start(now);
        bassOsc.stop(now + 0.3);
    }
    
    // === HIT SOUND ===
    
    playHit() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Metallic ping
        const osc = this.audioContext.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialDecayTo(200, now + 0.1);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialDecayTo(0.01, now + 0.1);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.1);
    }
    
    // === RELOAD SOUND ===
    
    playReloadComplete() {
        if (!this.audioContext || !this.masterGain) return;
        this.resume();
        
        const now = this.audioContext.currentTime;
        
        // Click sound
        const osc = this.audioContext.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 400;
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialDecayTo(0.01, now + 0.05);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.05);
        
        // Second click (mechanical sound)
        setTimeout(() => {
            if (!this.audioContext || !this.masterGain) return;
            const now2 = this.audioContext.currentTime;
            const osc2 = this.audioContext.createOscillator();
            osc2.type = 'square';
            osc2.frequency.value = 600;
            
            const gain2 = this.audioContext.createGain();
            gain2.gain.setValueAtTime(0.15, now2);
            gain2.gain.exponentialDecayTo(0.01, now2 + 0.03);
            
            osc2.connect(gain2);
            gain2.connect(this.masterGain);
            
            osc2.start(now2);
            osc2.stop(now2 + 0.03);
        }, 50);
    }
    
    // === UTILITY ===
    
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
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Helper for exponential decay (not natively supported)
declare global {
    interface AudioParam {
        exponentialDecayTo(value: number, endTime: number): AudioParam;
    }
}

AudioParam.prototype.exponentialDecayTo = function(value: number, endTime: number) {
    // Can't go to 0, use small value
    this.exponentialRampToValueAtTime(Math.max(0.0001, value), endTime);
    return this;
};


