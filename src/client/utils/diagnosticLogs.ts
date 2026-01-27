/**
 * @module utils/diagnosticLogs
 * @description Централизованное управление диагностическим логированием
 * 
 * ОПТИМИЗАЦИЯ: Позволяет отключать избыточное логирование в production для улучшения производительности
 */

/**
 * Флаг для включения/выключения диагностического логирования
 * По умолчанию отключено для улучшения производительности
 */
export const ENABLE_DIAGNOSTIC_LOGS: boolean = 
    (window as any).gameSettings?.enableDiagnosticLogs || 
    localStorage.getItem("enableDiagnosticLogs") === "true" ||
    import.meta.env.DEV || // Включено в dev режиме
    false;

/**
 * Проверить, включено ли диагностическое логирование
 */
export function shouldLogDiagnostics(): boolean {
    return ENABLE_DIAGNOSTIC_LOGS;
}
