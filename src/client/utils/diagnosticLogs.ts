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
 * Флаг для отладки синхронизации в мультиплеере
 * Более детальное логирование позиций, reconciliation, и расхождений
 * ВАЖНО: Это ОЧЕНЬ частые логи, включать только для отладки!
 */
export const ENABLE_SYNC_DEBUG: boolean =
    (window as any).gameSettings?.enableSyncDebug ||
    localStorage.getItem("enableSyncDebug") === "true" ||
    false; // Отключено даже в dev режиме по умолчанию

/**
 * Проверить, включено ли диагностическое логирование
 */
export function shouldLogDiagnostics(): boolean {
    return ENABLE_DIAGNOSTIC_LOGS;
}

/**
 * Проверить, включена ли отладка синхронизации
 */
export function shouldLogSync(): boolean {
    return ENABLE_SYNC_DEBUG;
}
