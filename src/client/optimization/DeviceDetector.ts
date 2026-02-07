/**
 * @module optimization/DeviceDetector
 * @description Автоматическое определение характеристик устройства для оптимизации
 */

/**
 * Уровень производительности устройства
 */
export type DeviceTier = "potato" | "low" | "medium" | "high" | "ultra";

/**
 * Информация об устройстве
 */
export interface DeviceInfo {
    tier: DeviceTier;
    cpuCores: number;
    deviceMemory: number; // GB
    gpuRenderer?: string;
    gpuVendor?: string;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isSoftwareRenderer: boolean; // true if using CPU-based software renderer (e.g. Microsoft Basic Render Driver)
    estimatedPerformance: number; // 0-100
}

/**
 * DeviceDetector - определение характеристик устройства
 */
export class DeviceDetector {
    private static instance: DeviceDetector | null = null;
    private deviceInfo: DeviceInfo | null = null;

    private constructor() {
        // Private constructor for singleton
    }

    static getInstance(): DeviceDetector {
        if (!DeviceDetector.instance) {
            DeviceDetector.instance = new DeviceDetector();
        }
        return DeviceDetector.instance;
    }

    /**
     * Определить характеристики устройства
     */
    detect(canvas?: HTMLCanvasElement): DeviceInfo {
        if (this.deviceInfo) {
            return this.deviceInfo;
        }

        const info: DeviceInfo = {
            tier: "medium",
            cpuCores: navigator.hardwareConcurrency || 4,
            deviceMemory: (navigator as any).deviceMemory || 4,
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            isTablet: /iPad|Android/i.test(navigator.userAgent) && !/Mobile/i.test(navigator.userAgent),
            isDesktop: !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)),
            isSoftwareRenderer: false,
            estimatedPerformance: 50
        };

        // Определяем GPU
        if (canvas) {
            try {
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        info.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
                        info.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
                    }
                }
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        // Определяем tier на основе характеристик
        let score = 0;
        
        // CPU score (0-30)
        if (info.cpuCores >= 8) score += 30;
        else if (info.cpuCores >= 6) score += 25;
        else if (info.cpuCores >= 4) score += 20;
        else if (info.cpuCores >= 2) score += 10;
        else score += 5;

        // Memory score (0-30)
        if (info.deviceMemory >= 16) score += 30;
        else if (info.deviceMemory >= 8) score += 25;
        else if (info.deviceMemory >= 4) score += 20;
        else if (info.deviceMemory >= 2) score += 10;
        else score += 5;

        // GPU score (0-40)
        if (info.gpuRenderer) {
            const renderer = info.gpuRenderer.toLowerCase();
            // Detect software renderers (CPU-based, no real GPU)
            if (renderer.includes("basic render") || renderer.includes("swiftshader") ||
                renderer.includes("llvmpipe") || renderer.includes("software rasterizer")) {
                score += 0; // Software renderer — worst possible
                info.isSoftwareRenderer = true;
            } else if (renderer.includes("nvidia") && (renderer.includes("rtx") || renderer.includes("gtx"))) {
                score += 40; // Высокопроизводительные NVIDIA
            } else if (renderer.includes("amd") && (renderer.includes("rx") || renderer.includes("radeon"))) {
                score += 35; // Высокопроизводительные AMD
            } else if (renderer.includes("intel iris") || renderer.includes("intel hd")) {
                score += 15; // Интегрированная Intel
            } else if (renderer.includes("mali") || renderer.includes("adreno") || renderer.includes("powervr")) {
                score += 10; // Мобильные GPU
            } else {
                score += 20; // Неизвестный GPU - средний балл
            }
        } else {
            score += 15; // GPU не определен
        }

        // Штрафы для мобильных устройств
        if (info.isMobile) {
            score *= 0.7; // -30% для мобильных
        } else if (info.isTablet) {
            score *= 0.8; // -20% для планшетов
        }

        info.estimatedPerformance = Math.min(100, Math.max(0, score));

        // Определяем tier
        if (score >= 80) {
            info.tier = "ultra";
        } else if (score >= 60) {
            info.tier = "high";
        } else if (score >= 40) {
            info.tier = "medium";
        } else if (score >= 20) {
            info.tier = "low";
        } else {
            info.tier = "potato";
        }

        this.deviceInfo = info;
        return info;
    }

    /**
     * Получить информацию об устройстве (кэшированную)
     */
    getDeviceInfo(): DeviceInfo | null {
        return this.deviceInfo;
    }

    /**
     * Сбросить кэш (для повторного определения)
     */
    reset(): void {
        this.deviceInfo = null;
    }
}

/**
 * Глобальный экземпляр
 */
export const deviceDetector = DeviceDetector.getInstance();

