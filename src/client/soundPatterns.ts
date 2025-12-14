/**
 * Sound patterns for different cannon types using JSFXR parameters
 * Each pattern can be randomly varied for uniqueness
 */

import type { JSFXRParams } from './jsfxr';

export interface ShootPattern extends JSFXRParams {
    name: string;
    volumeMultiplier?: number;  // Additional volume multiplier for this pattern
    reverbAmount?: number;       // Reverb amount (0-1)
}

/**
 * Sound patterns for different cannon types
 */
export const SHOOT_PATTERNS: Record<string, ShootPattern> = {
    // Standard cannon - balanced sound
    standard: {
        name: 'standard',
        wave_type: 0, // Square wave
        p_base_freq: 0.3,
        p_freq_limit: 0,
        p_freq_ramp: -0.3,
        p_freq_dramp: 0,
        p_duty: 0.5,
        p_duty_ramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_vib_delay: 0,
        p_env_attack: 0,
        p_env_sustain: 0.1,
        p_env_decay: 0.35,
        p_env_punch: 0.3,
        p_lpf_resonance: 0,
        p_lpf_freq: 1,
        p_lpf_ramp: 0,
        p_hpf_freq: 0,
        p_hpf_ramp: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_repeat_speed: 0,
        p_arp_speed: 0,
        p_arp_mod: 0,
        sound_vol: 0.5,
        volumeMultiplier: 1.0,
        reverbAmount: 0.2,
    },
    
    // Heavy cannon - deep, powerful sound
    heavy: {
        name: 'heavy',
        wave_type: 3, // Noise for more power
        p_base_freq: 0.15,
        p_freq_limit: 0,
        p_freq_ramp: -0.15,
        p_freq_dramp: 0,
        p_duty: 0.5,
        p_duty_ramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_vib_delay: 0,
        p_env_attack: 0,
        p_env_sustain: 0.15,
        p_env_decay: 0.6,
        p_env_punch: 0.4,
        p_lpf_resonance: 0.2,
        p_lpf_freq: 0.8,
        p_lpf_ramp: -0.2,
        p_hpf_freq: 0,
        p_hpf_ramp: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_repeat_speed: 0,
        p_arp_speed: 0,
        p_arp_mod: 0,
        sound_vol: 0.5,
        volumeMultiplier: 1.3,
        reverbAmount: 0.3,
    },
    
    // Rapid/Fast cannon - quick, sharp sound
    rapid: {
        name: 'rapid',
        wave_type: 0, // Square wave
        p_base_freq: 0.4,
        p_freq_limit: 0,
        p_freq_ramp: -0.4,
        p_freq_dramp: 0,
        p_duty: 0.3,
        p_duty_ramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_vib_delay: 0,
        p_env_attack: 0,
        p_env_sustain: 0.05,
        p_env_decay: 0.25,
        p_env_punch: 0.2,
        p_lpf_resonance: 0,
        p_lpf_freq: 1,
        p_lpf_ramp: 0,
        p_hpf_freq: 0,
        p_hpf_ramp: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_repeat_speed: 0,
        p_arp_speed: 0,
        p_arp_mod: 0,
        sound_vol: 0.5,
        volumeMultiplier: 0.85,
        reverbAmount: 0.15,
    },
    
    // Fast (alias for rapid)
    fast: {
        name: 'fast',
        wave_type: 0,
        p_base_freq: 0.4,
        p_freq_limit: 0,
        p_freq_ramp: -0.4,
        p_freq_dramp: 0,
        p_duty: 0.3,
        p_duty_ramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_vib_delay: 0,
        p_env_attack: 0,
        p_env_sustain: 0.05,
        p_env_decay: 0.25,
        p_env_punch: 0.2,
        p_lpf_resonance: 0,
        p_lpf_freq: 1,
        p_lpf_ramp: 0,
        p_hpf_freq: 0,
        p_hpf_ramp: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_repeat_speed: 0,
        p_arp_speed: 0,
        p_arp_mod: 0,
        sound_vol: 0.5,
        volumeMultiplier: 0.85,
        reverbAmount: 0.15,
    },
    
    // Sniper cannon - long, deep, powerful sound
    sniper: {
        name: 'sniper',
        wave_type: 3, // Noise
        p_base_freq: 0.12,
        p_freq_limit: 0,
        p_freq_ramp: -0.1,
        p_freq_dramp: 0,
        p_duty: 0.5,
        p_duty_ramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_vib_delay: 0,
        p_env_attack: 0,
        p_env_sustain: 0.2,
        p_env_decay: 0.7,
        p_env_punch: 0.5,
        p_lpf_resonance: 0.3,
        p_lpf_freq: 0.7,
        p_lpf_ramp: -0.3,
        p_hpf_freq: 0,
        p_hpf_ramp: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_repeat_speed: 0,
        p_arp_speed: 0,
        p_arp_mod: 0,
        sound_vol: 0.5,
        volumeMultiplier: 1.4,
        reverbAmount: 0.35,
    },
    
    // Gatling - very fast, sharp, repetitive
    gatling: {
        name: 'gatling',
        wave_type: 0, // Square wave
        p_base_freq: 0.5,
        p_freq_limit: 0,
        p_freq_ramp: -0.5,
        p_freq_dramp: 0,
        p_duty: 0.2,
        p_duty_ramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_vib_delay: 0,
        p_env_attack: 0,
        p_env_sustain: 0.03,
        p_env_decay: 0.18,
        p_env_punch: 0.1,
        p_lpf_resonance: 0,
        p_lpf_freq: 1,
        p_lpf_ramp: 0,
        p_hpf_freq: 0.1,
        p_hpf_ramp: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_repeat_speed: 0,
        p_arp_speed: 0,
        p_arp_mod: 0,
        sound_vol: 0.5,
        volumeMultiplier: 0.75,
        reverbAmount: 0.1,
    },
};

/**
 * Get pattern by cannon type, with fallback to standard
 */
export function getShootPattern(cannonType: string): ShootPattern {
    return SHOOT_PATTERNS[cannonType] || SHOOT_PATTERNS.standard;
}







