/**
 * JSFXR - JavaScript Sound Effect Generator
 * Ported from sfxr by Tomasz Podeszwa
 * Adapted from https://github.com/chr15m/jsfxr
 * 
 * Generates procedural sound effects using Web Audio API
 */

export interface JSFXRParams {
    oldParams?: boolean;
    wave_type?: number;          // 0=square, 1=sawtooth, 2=sine, 3=noise
    p_base_freq?: number;        // 0.0-1.0
    p_freq_limit?: number;       // 0.0-1.0
    p_freq_ramp?: number;        // -1.0-1.0
    p_freq_dramp?: number;       // -1.0-1.0
    p_duty?: number;             // 0.0-1.0
    p_duty_ramp?: number;        // -1.0-1.0
    p_vib_strength?: number;     // 0.0-1.0
    p_vib_speed?: number;        // 0.0-1.0
    p_vib_delay?: number;        // 0.0-1.0
    p_env_attack?: number;       // 0.0-1.0
    p_env_sustain?: number;      // 0.0-1.0
    p_env_decay?: number;        // 0.0-1.0
    p_env_punch?: number;        // 0.0-1.0
    p_lpf_resonance?: number;    // 0.0-1.0
    p_lpf_freq?: number;         // 0.0-1.0
    p_lpf_ramp?: number;         // -1.0-1.0
    p_hpf_freq?: number;         // 0.0-1.0
    p_hpf_ramp?: number;         // -1.0-1.0
    p_pha_offset?: number;       // -1.0-1.0
    p_pha_ramp?: number;         // -1.0-1.0
    p_repeat_speed?: number;     // 0.0-1.0
    p_arp_speed?: number;        // 0.0-1.0
    p_arp_mod?: number;          // -1.0-1.0
    sound_vol?: number;          // 0.0-1.0
}

/**
 * Generate AudioBuffer from JSFXR parameters
 */
export function generateSound(audioContext: AudioContext, params: JSFXRParams): AudioBuffer {
    // Default parameters
    const p: Required<JSFXRParams> = {
        oldParams: false,
        wave_type: params.wave_type ?? 0,
        p_base_freq: params.p_base_freq ?? 0.3,
        p_freq_limit: params.p_freq_limit ?? 0,
        p_freq_ramp: params.p_freq_ramp ?? 0,
        p_freq_dramp: params.p_freq_dramp ?? 0,
        p_duty: params.p_duty ?? 0.5,
        p_duty_ramp: params.p_duty_ramp ?? 0,
        p_vib_strength: params.p_vib_strength ?? 0,
        p_vib_speed: params.p_vib_speed ?? 0,
        p_vib_delay: params.p_vib_delay ?? 0,
        p_env_attack: params.p_env_attack ?? 0,
        p_env_sustain: params.p_env_sustain ?? 0.3,
        p_env_decay: params.p_env_decay ?? 0.4,
        p_env_punch: params.p_env_punch ?? 0,
        p_lpf_resonance: params.p_lpf_resonance ?? 0,
        p_lpf_freq: params.p_lpf_freq ?? 1,
        p_lpf_ramp: params.p_lpf_ramp ?? 0,
        p_hpf_freq: params.p_hpf_freq ?? 0,
        p_hpf_ramp: params.p_hpf_ramp ?? 0,
        p_pha_offset: params.p_pha_offset ?? 0,
        p_pha_ramp: params.p_pha_ramp ?? 0,
        p_repeat_speed: params.p_repeat_speed ?? 0,
        p_arp_speed: params.p_arp_speed ?? 0,
        p_arp_mod: params.p_arp_mod ?? 0,
        sound_vol: params.sound_vol ?? 0.5,
    };

    const sampleRate = audioContext.sampleRate;
    
    // Calculate duration based on envelope (values are typically 0-1, representing fractions)
    // Real duration is attack + sustain + decay, but we need to scale appropriately
    // Typical shoot sounds should be 0.2-0.7 seconds
    const envelopeDuration = p.p_env_attack + p.p_env_sustain + p.p_env_decay;
    const duration = Math.max(0.1, Math.min(1.0, envelopeDuration));
    const sampleCount = Math.floor(sampleRate * duration);
    
    const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Sound generation state
    let phase = 0;
    let fperiod = 100.0 / (p.p_base_freq * p.p_base_freq + 0.001);
    let fmaxperiod = 100.0 / (p.p_freq_limit * p.p_freq_limit + 0.001);
    let fminperiod = 100.0 / (0.3 * 0.3 + 0.001);
    let period = fperiod;
    let fslide = 1.0 - Math.pow(p.p_freq_ramp, 3.0) * 0.01;
    let fdslide = -Math.pow(p.p_freq_dramp, 3.0) * 0.000001;
    
    let squareDuty = 0.5 - p.p_duty * 0.5;
    let squareSlide = -p.p_duty_ramp * 0.00005;
    
    if (p.p_arp_mod >= 0.0) {
        fslide *= 1.0 - Math.pow(p.p_arp_mod, 2.0) * 0.9;
    } else {
        fslide *= 1.0 + Math.pow(p.p_arp_mod, 2.0) * 10.0;
    }
    
    let arpPhase = 0;
    let arpLimit = p.p_arp_speed === 0 ? 0 : Math.floor(sampleRate / (1.0 + p.p_arp_speed * 0.1));
    
    let vibratoPhase = 0;
    let vibratoSpeed = Math.pow(p.p_vib_speed, 2.0) * 0.01;
    let vibratoAmplitude = p.p_vib_strength * 0.5;
    
    let envelopeStage = 0; // 0=attack, 1=sustain, 2=decay
    let envelopeVolume = 0.0;
    // Envelope times are normalized 0-1, scale to reasonable durations (0-1 second each)
    const attackTime = p.p_env_attack;
    const sustainTime = p.p_env_sustain;
    const decayTime = p.p_env_decay;
    let envelopeStageLength = [
        Math.floor(attackTime * sampleRate),
        Math.floor(sustainTime * sampleRate),
        Math.floor(decayTime * sampleRate)
    ];
    // Ensure minimum lengths
    if (envelopeStageLength[0] < 1) envelopeStageLength[0] = 1;
    if (envelopeStageLength[2] < 1) envelopeStageLength[2] = 1;
    let envelopeTime = 0;
    
    let phaseOffset = 0.0;
    let phaseOffsetSlide = p.p_pha_ramp * 0.00005;
    
    let repeatTime = 0;
    let repeatLimit = p.p_repeat_speed === 0 ? 0 : Math.floor(sampleRate / (1.0 + p.p_repeat_speed * 0.01));
    
    let lpFilterOn = p.p_lpf_freq < 1.0;
    let lpFilterPos = 0.0;
    let lpFilterDeltaPos = 0.0;
    let lpFilterDeltaDeltaPos = 0.0;
    let lpFilterCutoff = Math.pow(p.p_lpf_freq, 3.0) * 0.1;
    let lpFilterDeltaCutoff = 1.0 + p.p_lpf_ramp * 0.0001;
    let lpFilterDamping = 5.0 / (1.0 + Math.pow(p.p_lpf_resonance, 2.0) * 20.0) * (0.01 + lpFilterCutoff);
    if (lpFilterDamping > 0.8) lpFilterDamping = 0.8;
    lpFilterDamping = 1.0 - lpFilterDamping;
    
    let hpFilterOn = p.p_hpf_freq > 0.0;
    let hpFilterPos = 0.0;
    let hpFilterCutoff = Math.pow(p.p_hpf_freq, 2.0) * 0.1;
    let hpFilterDeltaCutoff = 1.0 + p.p_hpf_ramp * 0.0003;
    
    let noiseBuffer: Float32Array | null = null;
    if (p.wave_type === 3) {
        // Pre-generate noise buffer
        noiseBuffer = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
            noiseBuffer[i] = Math.random() * 2.0 - 1.0;
        }
    }
    
    // Generate samples
    for (let i = 0; i < sampleCount; i++) {
        // Handle repeat
        if (repeatLimit > 0 && ++repeatTime >= repeatLimit) {
            repeatTime = 0;
            period = fperiod;
            envelopeStage = 0;
            envelopeTime = 0;
            envelopeVolume = 0.0;
        }
        
        // Update frequency
        if (arpLimit > 0 && arpPhase >= arpLimit) {
            arpPhase = 0;
            if (p.p_arp_mod >= 0.0) {
                fslide *= 1.0 - Math.pow(p.p_arp_mod, 2.0) * 0.9;
            } else {
                fslide *= 1.0 + Math.pow(p.p_arp_mod, 2.0) * 10.0;
            }
        }
        arpPhase++;
        
        fslide += fdslide;
        period *= fslide;
        
        if (period > fmaxperiod) {
            period = fmaxperiod;
            if (p.p_freq_limit > 0.0) fslide = 1.0;
        }
        if (period < fminperiod) period = fminperiod;
        
        // Vibrato
        let vibratoPhaseShift = 0.0;
        if (vibratoSpeed > 0.0 && i > p.p_vib_delay * sampleRate) {
            vibratoPhaseShift = Math.sin(vibratoPhase) * vibratoAmplitude;
            vibratoPhase += vibratoSpeed;
        }
        
        // Phase offset
        phaseOffset += phaseOffsetSlide;
        if (phaseOffset < -1.0) phaseOffset = -1.0;
        if (phaseOffset > 1.0) phaseOffset = 1.0;
        
        // Generate wave
        let sample = 0.0;
        const fp = (1.0 / period + vibratoPhaseShift) * (1.0 + phaseOffset);
        phase += fp;
        
        if (p.wave_type === 0) {
            // Square wave
            squareDuty += squareSlide;
            if (squareDuty < 0.0) squareDuty = 0.0;
            if (squareDuty > 0.5) squareDuty = 0.5;
            sample = ((phase % 1.0) < squareDuty) ? 0.5 : -0.5;
        } else if (p.wave_type === 1) {
            // Sawtooth wave
            sample = 1.0 - ((phase % 1.0) * 2.0);
        } else if (p.wave_type === 2) {
            // Sine wave
            sample = Math.sin(phase * Math.PI * 2.0);
        } else if (p.wave_type === 3) {
            // Noise
            if (noiseBuffer) {
                const noiseIndex = Math.floor(phase * 32.0) % noiseBuffer.length;
                sample = noiseBuffer[noiseIndex];
            } else {
                sample = Math.random() * 2.0 - 1.0;
            }
        }
        
        // Envelope
        envelopeTime++;
        if (envelopeStage === 0) {
            // Attack
            if (envelopeTime >= envelopeStageLength[0]) {
                envelopeStage = 1;
                envelopeTime = 0;
            }
            envelopeVolume = envelopeTime / envelopeStageLength[0];
        } else if (envelopeStage === 1) {
            // Sustain
            if (envelopeTime >= envelopeStageLength[1]) {
                envelopeStage = 2;
                envelopeTime = 0;
            }
            envelopeVolume = 1.0;
        } else {
            // Decay
            envelopeVolume = 1.0 - (envelopeTime / envelopeStageLength[2]);
            if (envelopeVolume < 0.0) envelopeVolume = 0.0;
        }
        
        // Envelope punch
        if (p.p_env_punch > 0.0 && envelopeStage === 0) {
            envelopeVolume = Math.pow(envelopeVolume, 1.0 - p.p_env_punch);
        }
        
        sample *= envelopeVolume * p.sound_vol;
        
        // Low-pass filter
        if (lpFilterOn) {
            lpFilterDeltaPos += (sample - lpFilterPos) * lpFilterCutoff;
            lpFilterDeltaPos *= lpFilterDamping;
            lpFilterPos += lpFilterDeltaPos;
            sample = lpFilterPos;
            
            lpFilterCutoff *= lpFilterDeltaCutoff;
            if (lpFilterCutoff < 0.0) lpFilterCutoff = 0.0;
            if (lpFilterCutoff > 0.1) lpFilterCutoff = 0.1;
        }
        
        // High-pass filter
        if (hpFilterOn) {
            const oldSample = sample;
            hpFilterPos += (sample - hpFilterPos) * hpFilterCutoff;
            sample -= hpFilterPos;
            
            hpFilterCutoff *= hpFilterDeltaCutoff;
            if (hpFilterCutoff < 0.0) hpFilterCutoff = 0.0;
            if (hpFilterCutoff > 0.1) hpFilterCutoff = 0.1;
        }
        
        // Clamp and store
        sample = Math.max(-1.0, Math.min(1.0, sample));
        data[i] = sample;
    }
    
    return buffer;
}

/**
 * Apply random variation to JSFXR parameters
 * Only varies actual JSFXR parameters, ignores extra fields like name, volumeMultiplier, etc.
 */
export function varyParams(params: JSFXRParams | any, variation: number = 0.1): JSFXRParams {
    // Extract only JSFXR parameters, exclude custom fields
    const jsfxrParams: JSFXRParams = {
        oldParams: params.oldParams,
        wave_type: params.wave_type,
        p_base_freq: params.p_base_freq,
        p_freq_limit: params.p_freq_limit,
        p_freq_ramp: params.p_freq_ramp,
        p_freq_dramp: params.p_freq_dramp,
        p_duty: params.p_duty,
        p_duty_ramp: params.p_duty_ramp,
        p_vib_strength: params.p_vib_strength,
        p_vib_speed: params.p_vib_speed,
        p_vib_delay: params.p_vib_delay,
        p_env_attack: params.p_env_attack,
        p_env_sustain: params.p_env_sustain,
        p_env_decay: params.p_env_decay,
        p_env_punch: params.p_env_punch,
        p_lpf_resonance: params.p_lpf_resonance,
        p_lpf_freq: params.p_lpf_freq,
        p_lpf_ramp: params.p_lpf_ramp,
        p_hpf_freq: params.p_hpf_freq,
        p_hpf_ramp: params.p_hpf_ramp,
        p_pha_offset: params.p_pha_offset,
        p_pha_ramp: params.p_pha_ramp,
        p_repeat_speed: params.p_repeat_speed,
        p_arp_speed: params.p_arp_speed,
        p_arp_mod: params.p_arp_mod,
        sound_vol: params.sound_vol,
    };
    
    const varied: JSFXRParams = { ...jsfxrParams };
    
    // Helper for parameters that must be 0-1
    const vary = (value: number | undefined, defaultVal: number): number => {
        if (value === undefined) value = defaultVal;
        const varAmount = (Math.random() * 2 - 1) * variation;
        return Math.max(0, Math.min(1, value + varAmount));
    };
    
    // Helper for parameters that can be -1 to 1
    const varyBipolar = (value: number | undefined, defaultVal: number): number => {
        if (value === undefined) value = defaultVal;
        const varAmount = (Math.random() * 2 - 1) * variation;
        return Math.max(-1, Math.min(1, value + varAmount));
    };
    
    // Apply variation to key parameters (only those that are defined)
    // Positive-only parameters (0-1)
    if (varied.p_base_freq !== undefined) {
        varied.p_base_freq = vary(varied.p_base_freq, 0.3);
    }
    if (varied.p_env_attack !== undefined) {
        varied.p_env_attack = vary(varied.p_env_attack, 0);
    }
    if (varied.p_env_sustain !== undefined) {
        varied.p_env_sustain = vary(varied.p_env_sustain, 0.3);
    }
    if (varied.p_env_decay !== undefined) {
        varied.p_env_decay = vary(varied.p_env_decay, 0.4);
    }
    if (varied.p_env_punch !== undefined) {
        varied.p_env_punch = vary(varied.p_env_punch, 0);
    }
    
    // Bipolar parameters (-1 to 1)
    if (varied.p_freq_ramp !== undefined) {
        varied.p_freq_ramp = varyBipolar(varied.p_freq_ramp, 0);
    }
    
    return varied;
}

