import { useEffect } from 'react';

export interface HMRUpdate {
    file: string;
    category: 'components' | 'styles' | 'utils' | 'services' | 'types' | 'config' | 'other';
    timestamp: number;
}

export interface HMRNotification {
    id: string;
    updates: HMRUpdate[];
    totalCount: number;
    categories: string[];
}

interface HMRConfig {
    enabled: boolean;
    showInProduction: boolean;
    minUpdateCount: number;
    autoHideDelay: number;
    showFileList: boolean;
    groupByCategory: boolean;
}

const DEFAULT_CONFIG: HMRConfig = {
    enabled: true,
    showInProduction: false,
    minUpdateCount: 1,
    autoHideDelay: 5000,
    showFileList: true,
    groupByCategory: true,
};

/**
 * Determine file category based on file path
 */
function getFileCategory(filePath: string): HMRUpdate['category'] {
    const path = filePath.toLowerCase();
    
    if (path.includes('/components/') || path.includes('\\components\\')) {
        return 'components';
    }
    if (path.includes('/services/') || path.includes('\\services\\')) {
        return 'services';
    }
    if (path.includes('/utils/') || path.includes('\\utils\\')) {
        return 'utils';
    }
    if (path.includes('/types') || path.includes('\\types') || path.endsWith('.d.ts')) {
        return 'types';
    }
    if (path.includes('/constants/') || path.includes('\\constants\\') || path.includes('config')) {
        return 'config';
    }
    if (path.endsWith('.css') || path.endsWith('.scss') || path.endsWith('.less') || path.includes('styles')) {
        return 'styles';
    }
    return 'other';
}

/**
 * Format file path for display (remove common prefixes)
 */
function formatFilePath(filePath: string): string {
    // Remove common prefixes
    let formatted = filePath
        .replace(/^.*[\/\\]src[\/\\]/, '')
        .replace(/^.*[\/\\]components[\/\\]/, 'components/')
        .replace(/^.*[\/\\]services[\/\\]/, 'services/')
        .replace(/^.*[\/\\]utils[\/\\]/, 'utils/')
        .replace(/^.*[\/\\]hooks[\/\\]/, 'hooks/')
        .replace(/^.*[\/\\]contexts[\/\\]/, 'contexts/')
        .replace(/^.*[\/\\]constants[\/\\]/, 'constants/');
    
    // If still starts with full path, just show filename
    if (formatted.includes('/') || formatted.includes('\\')) {
        const parts = formatted.split(/[\/\\]/);
        if (parts.length > 2) {
            // Show last 2 parts
            formatted = parts.slice(-2).join('/');
        }
    }
    
    return formatted;
}

/**
 * Get emoji for category
 */
function getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
        components: '📦',
        services: '🔧',
        utils: '🛠️',
        styles: '✨',
        types: '📝',
        config: '⚙️',
        other: '📄',
    };
    return emojis[category] || '📄';
}

/**
 * Get category name in Russian
 */
function getCategoryName(category: string): string {
    const names: Record<string, string> = {
        components: 'Компоненты',
        services: 'Сервисы',
        utils: 'Утилиты',
        styles: 'Стили',
        types: 'Типы',
        config: 'Конфигурация',
        other: 'Другое',
    };
    return names[category] || category;
}

/**
 * Hook for HMR notifications
 */
export function useHMRNotifications(
    showToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void,
    config: Partial<HMRConfig> = {}
) {
    useEffect(() => {
        const finalConfig = { ...DEFAULT_CONFIG, ...config };
        
        // Only enable in development mode
        if (import.meta.env.PROD && !finalConfig.showInProduction) {
            return;
        }
        
        if (!finalConfig.enabled) {
            return;
        }
        
        // Check if HMR is available
        if (typeof import.meta.hot === 'undefined') {
            return;
        }
        
        let pendingUpdates: HMRUpdate[] = [];
        let updateTimeout: NodeJS.Timeout | null = null;
        
        const processUpdates = () => {
            if (pendingUpdates.length === 0) return;
            
            if (pendingUpdates.length < finalConfig.minUpdateCount) {
                pendingUpdates = [];
                return;
            }
            
            // Group updates by category
            const updatesByCategory: Record<string, HMRUpdate[]> = {};
            pendingUpdates.forEach(update => {
                if (!updatesByCategory[update.category]) {
                    updatesByCategory[update.category] = [];
                }
                updatesByCategory[update.category].push(update);
            });
            
            // Build notification message
            let message = '';
            const categories = Object.keys(updatesByCategory);
            
            if (pendingUpdates.length === 1) {
                // Single file update
                const update = pendingUpdates[0];
                const emoji = getCategoryEmoji(update.category);
                const fileName = formatFilePath(update.file);
                message = `🔄 Hot Reload\n${emoji} ${getCategoryName(update.category)}: ${fileName}\nОбновление применено`;
            } else {
                // Multiple files
                message = `🔄 Hot Reload (${pendingUpdates.length} файлов)\n\n`;
                
                if (finalConfig.groupByCategory) {
                    // Group by category
                    categories.forEach(category => {
                        const updates = updatesByCategory[category];
                        const emoji = getCategoryEmoji(category);
                        const categoryName = getCategoryName(category);
                        
                        if (finalConfig.showFileList) {
                            const fileNames = updates.map(u => formatFilePath(u.file)).join(', ');
                            message += `${emoji} ${categoryName} (${updates.length}): ${fileNames}\n`;
                        } else {
                            message += `${emoji} ${categoryName} (${updates.length})\n`;
                        }
                    });
                    message += '\nВсе изменения применены';
                } else {
                    // List all files
                    if (finalConfig.showFileList) {
                        pendingUpdates.forEach(update => {
                            const emoji = getCategoryEmoji(update.category);
                            const fileName = formatFilePath(update.file);
                            message += `${emoji} ${fileName}\n`;
                        });
                    }
                    message += '\nВсе изменения применены';
                }
            }
            
            // Show toast notification
            showToast(message.trim(), 'success');
            
            // Clear pending updates
            pendingUpdates = [];
        };
        
        // Listen for HMR updates
        const handleBeforeUpdate = (payload: any) => {
            // Collect updated modules
            if (payload.updates && Array.isArray(payload.updates)) {
                payload.updates.forEach((update: any) => {
                    if (update.path) {
                        pendingUpdates.push({
                            file: update.path,
                            category: getFileCategory(update.path),
                            timestamp: Date.now(),
                        });
                    }
                });
                
                // Debounce: wait a bit to collect all updates
                if (updateTimeout) {
                    clearTimeout(updateTimeout);
                }
                updateTimeout = setTimeout(() => {
                    processUpdates();
                }, 100);
            }
        };
        
        const handleAfterUpdate = () => {
            // Process any remaining updates after changes are applied
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            updateTimeout = setTimeout(() => {
                processUpdates();
            }, 50);
        };
        
        // Register event listeners
        import.meta.hot.on('vite:beforeUpdate', handleBeforeUpdate);
        import.meta.hot.on('vite:afterUpdate', handleAfterUpdate);
        
        // Cleanup
        return () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            // Remove event listeners
            if (import.meta.hot) {
                import.meta.hot.off('vite:beforeUpdate', handleBeforeUpdate);
                import.meta.hot.off('vite:afterUpdate', handleAfterUpdate);
            }
        };
    }, [showToast, config]);
}

